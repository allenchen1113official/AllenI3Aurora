/* =====================================================================
   常看 YouTube 重點筆記 · 轉錄進度同步（social-publish.yml 常駐輪詢每 2 分鐘執行）

   Mac mini 的 ytnotes.py 每次 run、每換一個階段、轉錄中每 60 秒覆寫
   Drive「AllenI3Aurora/notes/youtube/_engine/progress.json」；本腳本以 GDRIVE_SERVICE_ACCOUNT（唯讀）讀入、
   精簡驗證後寫到 Firestore aurora_ops/ytnotes_progress（規則：管理者唯讀、僅服務帳戶寫），
   供 PilotOne 中控台「YouTube 轉錄」面板即時顯示。內容不變（引擎 updatedAt 相同）就不寫。

   環境變數：GDRIVE_SERVICE_ACCOUNT、FIREBASE_SERVICE_ACCOUNT、GDRIVE_ROOT_ID（選用）、SOCIAL_DRY_RUN（'1' 只印不寫）
   未設定任一 Secret 或讀取失敗時只印警告、結束碼 0（不影響發文輪詢）。
   純邏輯 slimProgress() 供測試：node --test scripts/ytnotes/progress.test.mjs
   ===================================================================== */
import { fileURLToPath } from "node:url";

export const DOC = "aurora_ops/ytnotes_progress";
export const DRIVE_PATH = ["notes", "youtube", "_engine", "progress.json"];
export const ITEM_STATES = ["processing", "queued", "drafted", "failed", "done"];
export const STAGES = ["scan", "meta", "download", "lang", "transcribe", "second", "write"];
const MAX_ITEMS = 80, MAX_QUEUE = 50;

const str = (v, n) => String(v == null ? "" : v).slice(0, n);
const num = (v) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0; };
const https = (v, n = 300) => (/^https:\/\//.test(String(v || "")) ? str(v, n) : "");
const vid = (v) => (/^[A-Za-z0-9_-]{5,40}$/.test(String(v || "")) ? String(v) : "");
const when = (v) => (Number.isFinite(Date.parse(v || "")) ? str(v, 40) : "");
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

function slimItem(x) {
  const id = vid(x && x.id);
  if (!id) return null;
  const it = {
    id, url: https(x.url) || `https://www.youtube.com/watch?v=${id}`, title: str(x.title, 160), author: str(x.author, 80),
    state: oneOf(x.state, ITEM_STATES, "queued"), at: when(x.at), durationSec: num(x.durationSec), draftSeconds: num(x.draftSeconds),
    lang: str(x.lang, 8), transcriber: str(x.transcriber, 120),
  };
  if (it.state === "processing") { it.stage = oneOf(x.stage, STAGES, ""); it.stageLabel = str(x.stageLabel, 20); }
  if (x.error) it.error = str(x.error, 300);
  if (x.package) it.package = str(x.package, 120);
  return it;
}

/* Drive 上的 progress.json → Firestore 文件（白名單欄位、長度上限、去重、計數）。driveModified 為 Drive 檔案修改時間 */
export function slimProgress(raw, { driveModified = "", syncedAt = new Date().toISOString() } = {}) {
  const p = raw && typeof raw === "object" ? raw : {};
  const e = p.engine && typeof p.engine === "object" ? p.engine : {};
  const seen = new Set();
  const items = (Array.isArray(p.items) ? p.items : []).map(slimItem).filter((x) => x && !seen.has(x.id) && seen.add(x.id)).slice(0, MAX_ITEMS);
  const pc = p.current && typeof p.current === "object" ? p.current : null;
  const c = pc && (vid(pc.id) || pc.stage === "scan") ? pc : null; // 掃描頻道時沒有影片 id
  const counts = Object.fromEntries(ITEM_STATES.map((s) => [s, items.filter((x) => x.state === s).length]));
  return {
    version: 1,
    updatedAt: when(p.updatedAt),
    driveModified: when(driveModified),
    syncedAt,
    host: str(p.host, 60),
    engine: {
      state: oneOf(e.state, ["running", "idle"], "idle"), startedAt: when(e.startedAt), endedAt: when(e.endedAt),
      processed: num(e.processed), batchMax: num(e.batchMax), intervalSec: num(e.intervalSec) || 900,
    },
    current: c ? {
      id: vid(c.id), title: str(c.title, 160), author: str(c.author, 80), url: https(c.url), durationSec: num(c.durationSec), lang: str(c.lang, 8),
      stage: oneOf(c.stage, STAGES, ""), stageLabel: str(c.stageLabel, 20), startedAt: when(c.startedAt), stageAt: when(c.stageAt),
    } : null,
    queue: (Array.isArray(p.queue) ? p.queue : []).map((q) => ({ id: vid(q && q.id), url: https(q && q.url) })).filter((q) => q.id).slice(0, MAX_QUEUE),
    items,
    counts,
    failures: (Array.isArray(p.failures) ? p.failures : []).slice(-10).map((f) => ({ at: str(f && f.at, 20), id: vid(f && f.id), url: https(f && f.url), error: str(f && f.error, 300) })),
    log: (Array.isArray(p.log) ? p.log : []).slice(-12).map((l) => str(l, 300)),
  };
}

/* 是否需要寫入：引擎時間或 Drive 修改時間有變才寫（避免每 2 分鐘無謂寫入） */
export const changed = (prev, next) => !prev || prev.updatedAt !== next.updatedAt || prev.driveModified !== next.driveModified;

const env = (n) => (process.env[n] || "").trim();
const skip = (why) => { console.log(`轉錄進度同步略過：${why}`); };

async function main() {
  const gsa = env("GDRIVE_SERVICE_ACCOUNT"), fsa = env("FIREBASE_SERVICE_ACCOUNT");
  if (!gsa || !fsa) return skip("未設定 GDRIVE_SERVICE_ACCOUNT 或 FIREBASE_SERVICE_ACCOUNT");
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(gsa), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const q = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  let id = env("GDRIVE_ROOT_ID") || "1dkY_552wJqQtzi-xXa5K_aNb6ka1iKO8", file = null;
  for (const [i, name] of DRIVE_PATH.entries()) {
    const last = i === DRIVE_PATH.length - 1;
    const r = await drive.files.list({ q: `'${q(id)}' in parents and name = '${q(name)}' and trashed = false` +
      (last ? "" : " and mimeType = 'application/vnd.google-apps.folder'"), fields: "files(id,name,modifiedTime)", pageSize: 10,
      supportsAllDrives: true, includeItemsFromAllDrives: true });
    const f = (r.data.files || []).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
    if (!f) return skip(`Drive 找不到 ${DRIVE_PATH.slice(0, i + 1).join("/")}（Mac mini 引擎尚未更新到會寫進度檔的版本？）`);
    id = f.id; file = f;
  }
  const res = await drive.files.get({ fileId: file.id, alt: "media", supportsAllDrives: true }, { responseType: "text" });
  let raw;
  try { raw = JSON.parse(typeof res.data === "string" ? res.data : JSON.stringify(res.data)); }
  catch (e) { return skip(`progress.json 無法解析（可能正在寫入）：${e.message}`); }
  const doc = slimProgress(raw, { driveModified: file.modifiedTime });

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(fsa)) });
  const ref = getFirestore().doc(DOC);
  const prev = (await ref.get()).data();
  const c = doc.counts;
  const line = `引擎 ${doc.engine.state}｜處理中 ${c.processing}、排隊 ${c.queued}、草稿 ${c.drafted}、已送審 ${c.done}、失敗 ${c.failed}｜引擎時間 ${doc.updatedAt}`;
  if (!changed(prev, doc)) return console.log(`轉錄進度無變動（${line}）`);
  if (env("SOCIAL_DRY_RUN") === "1") return console.log(`DRY-RUN 將寫入 ${DOC}：${line}`);
  await ref.set(doc);
  console.log(`已同步 ${DOC}：${line}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(`::warning::轉錄進度同步失敗（不影響發文）：${(e && e.message) || e}`); });
}
