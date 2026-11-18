/* =====================================================================
   Claude 排程素材匯入（social-publish.yml 每 10 分鐘，在發文排程器之前執行）

   用法：node scripts/social/ingest-content.mjs <content 分支的工作目錄>

   1. 掃描台北「今天＋昨天」的 content/<topic>/<YYYYMMDD>/manifest.json
   2. 驗證素材（ingest-core.mjs）；不合格者記錄原因、不建立貼文
   3. 圖卡轉 JPEG（Instagram 只保證支援 JPEG）存到同資料夾 _publish/，
      推回 content 分支，以 commit SHA 組成不會變動的 raw.githubusercontent.com 網址
   4. 建立／更新 aurora_social_posts/cs_<topic>_<YYYYMMDD>：
        一般主題 → 草稿，等後台「PilotOne 審核」核准
        SOCIAL_AUTO_TOPICS 內且 autoPublish＋verified → 直接核准、立即發布（2026-11-18 起預設全部人工審核）
   5. 把今天／昨天各主題的貼文狀態寫到 ops/ingest_log/<YYYYMMDD>.json（給巡檢 Agent 讀）

   環境變數：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（同發文排程器）
     SOCIAL_DRY_RUN            '1' 時只驗證、轉檔到暫存區並列出計畫，不寫 Firestore、不推 git
     SOCIAL_AUTO_TOPICS        允許自動發布的主題，逗號分隔（預設不開放＝全部人工審核；none 同義）
     INGEST_RESULT             （選用）把本輪匯入結果寫成 JSON，供 notify-review.mjs 寄審核通知
     GITHUB_REPOSITORY         owner/repo，用來組 raw 網址（GitHub Actions 自動提供）
     CONTENT_BRANCH            預設 content
   ===================================================================== */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, statSync, mkdtempSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { taipeiDays, validateManifest, isAutoPublish, buildPost, planIngest, postSummary, docIdOf, KNOWN_TOPICS, DEFAULT_AUTO_TOPICS } from "./ingest-core.mjs";

const COLL = "aurora_social_posts";
const env = (n) => (process.env[n] || "").trim();
const MAX_JPEG = 8 * 1024 * 1024;

async function toJpeg(src, dst) {
  if (/\.jpe?g$/i.test(src)) { writeFileSync(dst, readFileSync(src)); return; }
  let sharp;
  try { sharp = (await import("sharp")).default; } catch { throw new Error("需要 sharp 套件才能把 PNG 轉成 JPEG（workflow 會自動安裝）"); }
  for (const quality of [90, 82, 74, 66]) {
    const buf = await sharp(src).flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buf.length <= MAX_JPEG || quality === 66) { writeFileSync(dst, buf); return; }
  }
}

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

async function main() {
  const dir = process.argv[2];
  const dryRun = env("SOCIAL_DRY_RUN") === "1";
  const auto = env("SOCIAL_AUTO_TOPICS") ? (env("SOCIAL_AUTO_TOPICS") === "none" ? [] : env("SOCIAL_AUTO_TOPICS").split(",").map((x) => x.trim())) : DEFAULT_AUTO_TOPICS;
  const repo = env("GITHUB_REPOSITORY") || "allenchen1113official/AllenI3Aurora";
  const branch = env("CONTENT_BRANCH") || "content";
  if (!dir || !existsSync(join(dir, "content"))) {
    console.log(`素材匯入：找不到 ${dir || "(未指定)"}/content，略過（content 分支尚未建立或尚無素材）。`);
    return;
  }

  /* Firestore（dry-run 且沒有服務帳戶時只做驗證） */
  let col = null;
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  if (sa) {
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) initializeApp({ credential: cert(JSON.parse(sa)) });
    col = getFirestore().collection(COLL);
  } else if (!dryRun) {
    console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，素材匯入略過。");
    return;
  }

  const days = taipeiDays(Date.now(), 1);
  const found = [];
  for (const topic of readdirSync(join(dir, "content"))) {
    for (const d of days) {
      const folder = join(dir, "content", topic, d.ymd);
      if (existsSync(join(folder, "manifest.json"))) found.push({ topic, ymd: d.ymd, folder });
    }
  }
  console.log(`素材匯入：今天／昨天共 ${found.length} 份 manifest${dryRun ? "（DRY-RUN）" : ""}`);

  const results = [];
  const toWrite = [];
  const outDir = dryRun ? mkdtempSync(join(tmpdir(), "ingest-")) : null;
  for (const f of found) {
    const tag = `[${f.topic}/${f.ymd}]`;
    let m = null;
    try { m = JSON.parse(readFileSync(join(f.folder, "manifest.json"), "utf8")); } catch (e) { m = null; }
    const files = { has: (n) => !n.includes("..") && existsSync(join(f.folder, n)) && statSync(join(f.folder, n)).isFile(), text: (n) => readFileSync(join(f.folder, n), "utf8") };
    const v = validateManifest(m, f, files);
    const id = docIdOf(f.topic, f.ymd);
    if (!v.ok) {
      console.log(`::warning::${tag} 素材不合格，未建立貼文：${v.errors.join("；")}`);
      results.push({ id, topic: f.topic, date: f.ymd, status: "invalid", errors: v.errors });
      continue;
    }
    const existing = col ? await col.doc(id).get().then((s) => (s.exists ? s.data() : null)) : null;
    const plan = planIngest(existing, m);
    if (plan.action === "skip") {
      console.log(`${tag} 略過：${plan.reason}`);
      results.push({ id, topic: f.topic, date: f.ymd, status: "skipped", reason: plan.reason });
      continue;
    }
    // 轉 JPEG：同一張圖跨平台只轉一次
    const imgs = [...new Set(Object.values(v.channels).flatMap((c) => c.images))];
    const pub = dryRun ? join(outDir, f.topic, f.ymd) : join(f.folder, "_publish");
    mkdirSync(pub, { recursive: true });
    const jpgName = (img) => basename(img, extname(img)) + ".jpg";
    try {
      for (const img of imgs) await toJpeg(join(f.folder, img), join(pub, jpgName(img)));
    } catch (e) {
      console.log(`::warning::${tag} 圖卡轉檔失敗：${e.message}`);
      results.push({ id, topic: f.topic, date: f.ymd, status: "invalid", errors: ["圖卡轉檔失敗：" + e.message] });
      continue;
    }
    toWrite.push({ f, m, v, id, plan, jpgName, autoOk: isAutoPublish(m, auto) });
  }

  /* 推送 JPEG 到 content 分支，取得 commit SHA（網址固定不變，平台快取不會拿到舊圖） */
  let sha = "DRY-RUN";
  if (!dryRun && toWrite.length) {
    git(dir, "add", "-A", "content");
    if (git(dir, "status", "--porcelain", "content")) {
      git(dir, "commit", "-m", `content: 圖卡轉 JPEG（${toWrite.map((x) => x.id).join("、")}）[skip ci]`);
      git(dir, "push", "origin", `HEAD:${branch}`);
    }
    sha = git(dir, "rev-parse", "HEAD");
  }

  const nowIso = new Date().toISOString();
  for (const w of toWrite) {
    const tag = `[${w.f.topic}/${w.f.ymd}]`;
    const urlOf = (img) => `https://raw.githubusercontent.com/${repo}/${sha}/content/${w.f.topic}/${w.f.ymd}/_publish/${encodeURIComponent(w.jpgName(img))}`;
    const doc = buildPost(w.m, w.f, w.v.channels, { urlOf, auto: w.autoOk, nowIso });
    if (w.plan.action === "update") delete doc.createdAt;
    const how = w.autoOk ? "自動發布（已核准）" : "草稿，待後台審核";
    if (dryRun) {
      console.log(`${tag} DRY-RUN 將${w.plan.action === "create" ? "建立" : "更新"} ${w.id}：${how}；` +
        Object.entries(w.v.channels).map(([c, x]) => `${c} ${x.images.length} 張圖／${[...x.caption].length} 字`).join("，"));
    } else {
      await col.doc(w.id).set(doc, { merge: w.plan.action === "update" });
      console.log(`${tag} 已${w.plan.action === "create" ? "建立" : "更新"} ${w.id}：${how}`);
    }
    results.push({ id: w.id, topic: w.f.topic, date: w.f.ymd, status: w.plan.action === "create" ? "created" : "updated", auto: w.autoOk,
      title: String(w.m.title || "").trim(), channels: Object.keys(w.v.channels) });
  }

  /* 匯入紀錄＋貼文狀態（內容沒變就不提交，避免每 10 分鐘一個 commit） */
  if (!dryRun && col) {
    for (const d of days) {
      const posts = [];
      for (const topic of Object.keys(KNOWN_TOPICS)) {
        const s = await col.doc(docIdOf(topic, d.ymd)).get();
        if (s.exists) posts.push(postSummary(s.id, s.data()));
      }
      const logPath = join(dir, "ops", "ingest_log", `${d.ymd}.json`);
      const prev = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) : null;
      // 每個貼文 id 保留最近一次「有意義」的匯入結果（素材未變更的略過不覆蓋，避免每輪都產生 commit）
      const byId = new Map(((prev && prev.lastIngest) || []).map((r) => [r.id, r]));
      for (const r of results.filter((x) => x.date === d.ymd && !(x.status === "skipped" && x.reason === "素材未變更"))) byId.set(r.id, r);
      const lastIngest = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
      if (!posts.length && !lastIngest.length) continue;
      const body = { date: d.dash, posts, lastIngest };
      if (prev && JSON.stringify({ ...prev, generatedAt: undefined }) === JSON.stringify({ ...body, generatedAt: undefined })) continue;
      mkdirSync(join(dir, "ops", "ingest_log"), { recursive: true });
      writeFileSync(logPath, JSON.stringify({ ...body, generatedAt: nowIso }, null, 2) + "\n");
    }
    git(dir, "add", "-A", "ops");
    if (git(dir, "status", "--porcelain", "ops")) {
      git(dir, "commit", "-m", "ops: 素材匯入與發文狀態紀錄 [skip ci]");
      try { git(dir, "push", "origin", `HEAD:${branch}`); } catch (e) { console.log(`::warning::紀錄推送失敗（下一輪再試）：${e.message}`); }
    }
  }

  // 本輪結果給 notify-review.mjs 寄審核通知（ops/ingest_log 只保留每篇最近一次結果，不適合判斷「本輪新增」）
  if (env("INGEST_RESULT")) writeFileSync(env("INGEST_RESULT"), JSON.stringify(results, null, 2) + "\n");

  const bad = results.filter((r) => r.status === "invalid");
  console.log(`素材匯入完成：建立 ${results.filter((r) => r.status === "created").length}、更新 ${results.filter((r) => r.status === "updated").length}、略過 ${results.filter((r) => r.status === "skipped").length}、不合格 ${bad.length}`);
}

main().catch((e) => {
  console.error("素材匯入失敗：", e);
  console.log(`::error::素材匯入失敗：${(e && e.message) || e}`);
  process.exitCode = 1;
});
