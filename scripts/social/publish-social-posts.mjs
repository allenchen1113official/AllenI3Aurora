/* =====================================================================
   社群自動發文排程器（GitHub Actions：social-publish.yml 每 10 分鐘執行）

   讀 Firestore aurora_social_posts 中 queueState == 'pending' 的貼文，
   依 core.mjs 狀態機處理 Facebook 粉專（發文／原生排程／撤銷／對帳）、
   Instagram 與 Threads（容器兩段式發布）、YouTube（上傳＋publishAt 定時公開）。
   執行摘要寫入 aurora_social_meta/runner，後台「社群發文／內容中控台」會顯示。

   環境變數（皆由 GitHub Secrets / Variables 提供；未設定的平台自動停用）：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（需「Cloud Datastore 使用者」角色）
     META_PAGE_TOKEN           粉專 Token（建議 Business Manager 系統使用者 Token）
     META_PAGE_ID              粉專 ID
     META_PAGE_EXPECT_NAME     （Variable，選用）粉專預期名稱，預設「艾倫報報」，不符即暫停 FB；* 關閉檢查
     META_IG_USER_ID           IG 商業帳號 ID（沿用 META_PAGE_TOKEN，需 instagram_content_publish）
     IG_TOKEN                  選填：改用「Instagram 登入」的 IG 長效 Token（graph.instagram.com，
                               不需連結粉專；排程器每日續期，存 aurora_social_secrets/instagram）
     （相容別名：FB_PAGE_TOKEN／FB_PAGE_ID／IG_USER_ID 等同 META_PAGE_TOKEN／META_PAGE_ID／META_IG_USER_ID）
     THREADS_USER_ID           Threads 使用者 ID
     THREADS_TOKEN             Threads 長效 Token（排程器每日自動續期，續期後存於
                               aurora_social_secrets/threads，前端規則禁止讀取）
     YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN
                               YouTube Data API 的 OAuth 用戶端與 refresh token
                               （以 scripts/social/youtube-auth.mjs 取得）
     GH_TOKEN／GITHUB_REPOSITORY
                               Podcast（pc）：音檔上傳本 repo 的 GitHub Releases（workflow 的 GITHUB_TOKEN，需 contents: write）
     GDRIVE_SERVICE_ACCOUNT    （選用）Podcast 音檔在 Drive 時以此唯讀服務帳戶下載
     PODCAST_FEED_FLAG         （選用）本輪有集數上架時寫入此檔，workflow 隨後重建 podcast.xml
     META_GRAPH_VERSION        選填，預設 v25.0
     SOCIAL_DRY_RUN            '1' 時只列出將執行的動作，不呼叫發文 API、不改資料
   ===================================================================== */
import { runOnce, createFbGraph, createIgGraph, createThreadsGraph, LOCK_STALE_MS, isAuthError, CHANNEL_LABEL , fbNameMismatch } from "./core.mjs";
import { threadsToken, instagramToken } from "./threads-token.mjs";
import { createYouTubeClient } from "./youtube.mjs";
import { createPodcastClient } from "./podcast.mjs";
import { writeFileSync } from "node:fs";

const COLL = "aurora_social_posts";
const META_DOC = "aurora_social_meta/runner";
const RUNNER = `gha-${process.env.GITHUB_RUN_ID || "local"}`;

const env = (name) => (process.env[name] || "").trim();

async function main() {
  const dryRun = process.env.SOCIAL_DRY_RUN === "1";
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  const metaToken = env("META_PAGE_TOKEN") || env("FB_PAGE_TOKEN"), pageId = env("META_PAGE_ID") || env("FB_PAGE_ID");
  const igUserId = env("META_IG_USER_ID") || env("IG_USER_ID"), igSeed = env("IG_TOKEN");
  const thUserId = env("THREADS_USER_ID"), thSeed = env("THREADS_TOKEN");
  const version = env("META_GRAPH_VERSION") || "v25.0";
  const yt = { clientId: env("YT_CLIENT_ID"), clientSecret: env("YT_CLIENT_SECRET"), refreshToken: env("YT_REFRESH_TOKEN") };
  const ghToken = env("GH_TOKEN") || env("GITHUB_TOKEN"), ghRepo = env("GITHUB_REPOSITORY");
  const configured = { fb: !!(metaToken && pageId), ig: !!((igSeed || metaToken) && igUserId), th: !!(thUserId && thSeed), yt: !!(yt.clientId && yt.clientSecret && yt.refreshToken), pc: !!(ghToken && ghRepo) };
  if (!sa) {
    console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，略過本輪。設定方式見 docs/SOCIAL_SOP.md。");
    return;
  }
  if (!configured.fb && !configured.ig && !configured.th && !configured.yt && !configured.pc) {
    console.log("::warning::尚未設定任何社群平台的 Secrets（Meta、Threads 或 YouTube），略過本輪。見 docs/SOCIAL_SOP.md。");
    return;
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();
  const col = db.collection(COLL);

  const store = {
    async listPending() {
      // 單欄位查詢，不需複合索引
      const snap = await col.where("queueState", "==", "pending").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async claim(id, now) {
      const ref = col.doc(id);
      return db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const d = s.data();
        if (d.queueState !== "pending") return null;
        const at = Date.parse((d.lock && d.lock.at) || "");
        if (d.lock && d.lock.by && isFinite(at) && now - at < LOCK_STALE_MS) return null;
        tx.update(ref, { lock: { by: RUNNER, at: new Date(now).toISOString() } });
        return { id, ...d };
      });
    },
    async update(id, patch) { await col.doc(id).update(patch); },
  };

  /* 各平台客戶端與 Token 檢查：失效的平台本輪暫停（貼文保持 pending），其他平台照常 */
  const clients = {};
  const health = {};
  let thToken = null, igToken = null;
  if (configured.fb) clients.fb = createFbGraph({ token: metaToken, pageId, version });
  if (configured.ig && igSeed) {
    igToken = await instagramToken(db, igSeed, { refresh: !dryRun });
    clients.ig = createIgGraph({ token: igToken.token, igUserId, version, host: "graph.instagram.com" });
  } else if (configured.ig) clients.ig = createIgGraph({ token: metaToken, igUserId, version });
  if (configured.th) {
    thToken = await threadsToken(db, thSeed, { refresh: !dryRun });
    clients.th = createThreadsGraph({ token: thToken.token, userId: thUserId });
  }
  if (configured.yt) clients.yt = createYouTubeClient(yt);
  if (configured.pc) {
    const feedCol = db.collection("aurora_podcast_feed");
    const feed = {
      async get(id) { const s = await feedCol.doc(id).get(); return s.exists ? s.data() : null; },
      async list() { return (await feedCol.get()).docs.map((d) => d.data()); },
      async set(id, doc) { await feedCol.doc(id).set(doc); },
    };
    let driveDownload = null;
    const gsa = env("GDRIVE_SERVICE_ACCOUNT");
    if (gsa) {
      driveDownload = async (fileId) => {
        const { google } = await import("googleapis");
        const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(gsa), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
        const drive = google.drive({ version: "v3", auth });
        return Buffer.from((await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" })).data);
      };
    }
    clients.pc = createPodcastClient({ repo: ghRepo, token: ghToken, feed, driveDownload });
  }
  for (const ch of Object.keys(clients)) {
    try { health[ch] = { ok: true, name: (await clients[ch].checkToken()).name || null, error: null }; }
    catch (e) { health[ch] = { ok: false, name: null, error: e.message }; }
  }
  // 防呆：META_PAGE_ID 必須是「艾倫報報」粉專，名稱不符就暫停 FB，避免發到個人檔案或其他粉專。
  // Repo Variable META_PAGE_EXPECT_NAME 可改預期名稱；設為 * 關閉檢查。
  const expectName = env("META_PAGE_EXPECT_NAME") || "艾倫報報";
  const fbMismatch = fbNameMismatch(health.fb, expectName);
  if (fbMismatch) { health.fb = { ...health.fb, ok: false, error: fbMismatch }; console.log(`::warning::${fbMismatch}`); }
  const paused = Object.keys(health).filter((ch) => !health[ch].ok);
  const { fb: graph, ...graphs } = clients;

  let summary = { total: 0, results: [], authFailed: false, authChannels: [], failed: 0 };
  if (paused.length < Object.keys(clients).length) summary = await runOnce({ store, graph, graphs, paused, dryRun });
  for (const ch of summary.authChannels) if (health[ch]) health[ch] = { ...health[ch], ok: false, error: health[ch].error || "發文時 Token／權限遭拒" };

  if (!dryRun) {
    const chMeta = (ch) => ({ configured: configured[ch], ok: configured[ch] ? !!(health[ch] && health[ch].ok) : null,
      name: (health[ch] && health[ch].name) || null, error: (health[ch] && health[ch].error) || null });
    await db.doc(META_DOC).set({
      lastRunAt: new Date().toISOString(),
      runId: RUNNER,
      // 第一階段欄位（FB），後台既有畫面沿用
      tokenOk: configured.fb ? !!(health.fb && health.fb.ok) : false,
      tokenError: configured.fb ? (health.fb && health.fb.error) || null : "未設定 META_PAGE_TOKEN／META_PAGE_ID",
      pageName: (health.fb && health.fb.name) || null,
      channels: {
        fb: chMeta("fb"),
        ig: { ...chMeta("ig"), login: igSeed ? "instagram" : "facebook", expiresAt: igToken ? igToken.expiresAt : null, refreshError: igToken ? igToken.refreshError : null },
        th: { ...chMeta("th"), expiresAt: thToken ? thToken.expiresAt : null, refreshError: thToken ? thToken.refreshError : null },
        yt: chMeta("yt"),
        pc: { ...chMeta("pc"), feedUrl: "https://allenchen1113official.github.io/AllenI3Aurora/podcast.xml" },
      },
      processed: summary.total,
      actions: summary.results.map((r) => `${r.id}:${r.action}${r.error ? "!" : ""}`).slice(0, 50),
      failed: summary.failed,
    }, { merge: true });
  }

  if (summary.feedChanged && !dryRun && env("PODCAST_FEED_FLAG")) writeFileSync(env("PODCAST_FEED_FLAG"), new Date().toISOString() + "\n");
  console.log(`本輪處理 ${summary.total} 筆；不可重試失敗 ${summary.failed} 筆${dryRun ? "（DRY-RUN）" : ""}`);
  for (const ch of Object.keys(health)) console.log(`  ${CHANNEL_LABEL[ch]}: ${health[ch].ok ? "● 正常 " + (health[ch].name || "") : "✕ " + health[ch].error}`);
  if (igToken && igToken.expiresAt) console.log(`  Instagram Token 到期：${igToken.expiresAt}${igToken.refreshError ? `（續期失敗：${igToken.refreshError}）` : ""}`);
  if (thToken && thToken.expiresAt) console.log(`  Threads Token 到期：${thToken.expiresAt}${thToken.refreshError ? `（續期失敗：${thToken.refreshError}）` : ""}`);
  const bad = Object.keys(health).filter((ch) => !health[ch].ok);
  if (bad.length) {
    console.log(`::error::${bad.map((ch) => CHANNEL_LABEL[ch]).join("、")} 的 Token 或權限有問題，這些平台本輪暫停。請依 docs/SOCIAL_SOP.md 更新對應 Secrets。`);
    process.exitCode = 1;
  } else if (summary.failed > 0) {
    console.log("::error::有貼文發布失敗，請至後台「內容中控台 → 內容庫」查看錯誤並處理。");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(isAuthError(e) ? "認證錯誤：" : "執行失敗：", e);
  console.log(`::error::發文排程${isAuthError(e) ? "認證錯誤" : "執行失敗"}：${(e && e.message) || e}`);
  process.exitCode = 1;
});
