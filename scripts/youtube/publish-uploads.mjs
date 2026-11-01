/* =====================================================================
   YouTube 上傳排程器（GitHub Actions：youtube-upload.yml 每 15 分鐘執行）

   讀 Firestore aurora_youtube_uploads 中進行中的工作（state in ACTIVE_STATES），
   依 core.mjs 狀態機：Drive 取成片 → resumable 分段上傳 → 等 YouTube 處理 →
   縮圖＋字幕 → 交給 YouTube publishAt 原生排程公開。每輪最多上傳一支影片。
   完成後回寫來源 Vlog 集數（aurora_vlog_episodes：影片 ID、檢查清單、公開後標記已發布）。
   執行摘要寫入 aurora_youtube_meta/uploader，後台「YouTube 頻道」顯示。

   環境變數（GitHub Secrets）：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（需「Cloud Datastore 使用者」角色）
     YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN
                               官方管理者帳號的 OAuth（scope：youtube.upload、youtube.force-ssl、drive.readonly）
     YT_DRY_RUN                '1' 只列出將執行的動作
   ===================================================================== */
import { mkdtempSync, rmSync, createWriteStream, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAccessToken, createYouTube, createDrive } from "./client.mjs";
import { runQueue, ACTIVE_STATES, LOCK_STALE_MS, isAuthError, watchUrl } from "./core.mjs";

const COLL = "aurora_youtube_uploads";
const RUNNER = `gha-${process.env.GITHUB_RUN_ID || "local"}`;
const env = (k) => (process.env[k] || "").trim();
const MIME = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

async function main() {
  const dryRun = env("YT_DRY_RUN") === "1";
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  if (!sa) { console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，略過本輪。"); return; }
  if (!(env("YT_CLIENT_ID") && env("YT_CLIENT_SECRET") && env("YT_REFRESH_TOKEN"))) {
    console.log("::warning::未設定 YouTube OAuth（YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN），上傳排程停用。見 docs/YOUTUBE_SOP.md。");
    return;
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();
  const col = db.collection(COLL);

  const store = {
    async listActive() {
      // 單欄位 in 查詢，不需複合索引
      const snap = await col.where("state", "in", ACTIVE_STATES).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async claim(id, now) {
      const ref = col.doc(id);
      return db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const d = s.data();
        if (!ACTIVE_STATES.includes(d.state)) return null;
        const at = Date.parse((d.lock && d.lock.at) || "");
        if (d.lock && d.lock.by && isFinite(at) && now - at < LOCK_STALE_MS) return null;
        tx.update(ref, { lock: { by: RUNNER, at: new Date(now).toISOString() } });
        return { id, ...d };
      });
    },
    async update(id, patch) { await col.doc(id).update(patch); },
    /* 回寫 Vlog 集數：填影片 ID、勾「已上傳」；公開後才標記已發布（公開頁 vlog.html 只列已發布） */
    async linkSource(job, { videoId, live }) {
      if (!job.source || job.source.type !== "vlog" || !job.source.episodeId) return;
      const ref = db.collection("aurora_vlog_episodes").doc(job.source.episodeId);
      const s = await ref.get();
      if (!s.exists) return;
      const patch = { "media.youtubeId": videoId, "media.youtubeUrl": watchUrl(videoId), "checklist.uploaded": true, updatedAt: new Date().toISOString() };
      if (live && s.data().status !== "published") Object.assign(patch, { status: "published", publishedAt: new Date().toISOString() });
      await ref.update(patch);
    },
  };

  let token;
  try {
    token = await getAccessToken({ clientId: env("YT_CLIENT_ID"), clientSecret: env("YT_CLIENT_SECRET"), refreshToken: env("YT_REFRESH_TOKEN") });
  } catch (e) {
    await writeMeta(db, dryRun, { ok: false, error: "OAuth 換發失敗：" + e.message });
    throw e;
  }
  const yt = createYouTube({ accessToken: token.token });
  const drive = createDrive({ accessToken: token.token });
  const scopes = token.scope.split(/\s+/);
  const missing = ["youtube.upload", "drive.readonly"].filter((s) => !scopes.some((x) => x.endsWith(s)));
  if (missing.length) console.log(`::warning::refresh token 缺少 scope：${missing.join("、")}（上傳或讀取 Drive 會失敗，請重跑 oauth-setup.mjs）`);

  /* 媒體來源：Drive 下載到 runner 暫存檔，再分段讀出上傳（runner 約有 14 GB 可用空間） */
  const media = {
    async prepare(job) {
      const f = await drive.resolve({ folder: job.drive && job.drive.folder, file: job.drive && job.drive.file });
      const dir = mkdtempSync(join(tmpdir(), "yt-"));
      const path = join(dir, "video" + (extname(f.name || "") || ".mp4"));
      console.log(`  下載 Drive：${f.name}（${(Number(f.size || 0) / 1048576).toFixed(1)} MB）`);
      await pipeline(Readable.fromWeb(await drive.stream(f.id)), createWriteStream(path));
      const size = statSync(path).size;
      if (f.size && Number(f.size) !== size) throw new Error(`Drive 下載不完整（${size}／${f.size} bytes）`);
      const fh = await open(path, "r");
      return {
        size, name: f.name,
        mime: (f.mimeType && f.mimeType.startsWith("video/")) ? f.mimeType : (MIME[extname(f.name || "").toLowerCase()] || "video/*"),
        async read(start, end) { const buf = Buffer.alloc(end - start); await fh.read(buf, 0, end - start, start); return buf; },
        async cleanup() { await fh.close(); rmSync(dir, { recursive: true, force: true }); },
      };
    },
    async thumbnail(job) {
      const t = job.drive && job.drive.thumbnail;
      if (!t) return null;
      if (/^https?:\/\//.test(t) && !/drive\.google\.com/.test(t)) {
        const r = await fetch(t);
        if (!r.ok) throw new Error(`縮圖網址 HTTP ${r.status}`);
        return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || "image/jpeg" };
      }
      const f = await drive.resolve({ folder: job.drive.folder, file: t });
      const data = await drive.bytes(f.id);
      if (data.length > 2 * 1024 * 1024) throw new Error("縮圖超過 YouTube 上限 2 MB");
      return { data, mime: f.mimeType || MIME[extname(f.name || "").toLowerCase()] || "image/jpeg" };
    },
  };

  const summary = await runQueue({ store, yt, media, dryRun });
  await writeMeta(db, dryRun, {
    ok: !summary.auth, error: summary.auth ? "YouTube 拒絕授權（Token 失效或權限不足），請重新取得 refresh token。" : null,
    quota: summary.quota, processed: summary.total, failed: summary.failed,
    actions: summary.results.map((r) => `${r.id}:${r.action}${r.error ? "!" : ""}`).slice(0, 50),
  });
  console.log(`本輪 ${summary.total} 筆；不可重試失敗 ${summary.failed} 筆${summary.quota ? "；配額用完（明天續行）" : ""}${dryRun ? "（DRY-RUN）" : ""}`);
  if (summary.auth) { console.log("::error::YouTube 授權失效，請依 docs/YOUTUBE_SOP.md 重新取得 YT_REFRESH_TOKEN。"); process.exitCode = 1; }
  else if (summary.failed) { console.log("::error::有上傳工作失敗，請到後台「YouTube 頻道 → 上傳排程」查看。"); process.exitCode = 1; }
}

async function writeMeta(db, dryRun, data) {
  if (dryRun) return;
  await db.doc("aurora_youtube_meta/uploader").set({ lastRunAt: new Date().toISOString(), runId: RUNNER, ...data }, { merge: true });
}

main().catch((e) => {
  console.error((isAuthError(e) ? "認證錯誤：" : "執行失敗：") + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
