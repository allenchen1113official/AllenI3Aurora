/* =====================================================================
   YouTube 頻道同步（GitHub Actions：youtube-sync.yml 每日台北 06:23、18:23）

   讀取官方頻道的訂閱／觀看／影片數與最新 50 支上傳影片（含觀看、按讚、留言），產出：
     data/youtube.json                    公開快照（前台與後台共用；workflow 有變動才 commit）
     aurora_youtube/channel               頻道統計（公開讀）
     aurora_youtube/videos                最新影片清單（公開讀；後台挑選嵌入電子報）
     aurora_youtube/history               每日訂閱／觀看走勢（台北日期，最多 90 天）
     aurora_stats/youtube_subscribers     首頁統計卡「YouTube 訂閱」（與 TAIEX 同列顯示）
     aurora_youtube_meta/sync             執行摘要（管理者唯讀）

   認證（擇一；兩者都有時優先 OAuth）：
     YT_CLIENT_ID＋YT_CLIENT_SECRET＋YT_REFRESH_TOKEN   官方管理者帳號 OAuth（mine=true，含私人／排程中影片）
     YT_API_KEY＋YT_CHANNEL_ID                          只讀公開資料
   FIREBASE_SERVICE_ACCOUNT 未設定時只更新 data/youtube.json。
   YT_DRY_RUN = '1' 只印出結果，不寫檔、不寫 Firestore。
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAccessToken, createYouTube } from "./client.mjs";
import { channelSnapshot, toVideo, appendHistory, statsRow, buildSnapshot, taipeiDate, fmtCount, isAuthError } from "./core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "data", "youtube.json");
const env = (k) => (process.env[k] || "").trim();

async function main() {
  const dryRun = env("YT_DRY_RUN") === "1";
  const oauth = env("YT_CLIENT_ID") && env("YT_CLIENT_SECRET") && env("YT_REFRESH_TOKEN");
  const apiKey = env("YT_API_KEY"), channelId = env("YT_CHANNEL_ID");
  if (!oauth && !(apiKey && channelId)) {
    console.log("::warning::未設定 YouTube 認證（YT_API_KEY＋YT_CHANNEL_ID，或 YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN），略過。見 docs/YOUTUBE_SOP.md。");
    return;
  }
  const accessToken = oauth ? (await getAccessToken({ clientId: env("YT_CLIENT_ID"), clientSecret: env("YT_CLIENT_SECRET"), refreshToken: env("YT_REFRESH_TOKEN") })).token : "";
  const yt = createYouTube({ accessToken, apiKey });

  const raw = await yt.channel(oauth && !channelId ? { mine: true } : { id: channelId });
  if (!raw) throw new Error(oauth && !channelId ? "這個 Google 帳號底下沒有 YouTube 頻道（請用官方管理者帳號授權）" : `找不到頻道 ${channelId}`);
  const channel = channelSnapshot(raw);
  const ids = channel.uploadsPlaylist ? await yt.uploadIds(channel.uploadsPlaylist, 50) : [];
  const videos = (await yt.videos(ids)).map(toVideo);

  const now = Date.now();
  const today = taipeiDate(now);
  let prev = {};
  try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch { /* 第一次執行 */ }

  // Firestore（選用）
  let db = null;
  if (env("FIREBASE_SERVICE_ACCOUNT")) {
    const { initializeApp, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    initializeApp({ credential: cert(JSON.parse(env("FIREBASE_SERVICE_ACCOUNT"))) });
    db = getFirestore();
  }
  let base = prev.history || [];
  if (db) {
    const h = await db.doc("aurora_youtube/history").get();
    if (h.exists && Array.isArray(h.data().days) && h.data().days.length >= base.length) base = h.data().days;
  }
  const history = appendHistory(base, today, { subscribers: channel.subscribers, views: channel.views, videos: channel.videos });
  const snap = buildSnapshot({ channel, videos, history, now });
  const row = statsRow(channel, history, today);

  console.log(`頻道：${channel.title}（${channel.handle || channel.id}）`);
  console.log(`  訂閱 ${channel.subscribers == null ? "隱藏" : fmtCount(channel.subscribers)} · 觀看 ${fmtCount(channel.views)} · 影片 ${channel.videos}`);
  console.log(`  公開影片 ${snap.totals.videos}（Shorts ${snap.totals.shorts}）· 首頁統計卡：${row.value}${row.unit} ${row.delta}`);
  if (dryRun) { console.log("DRY-RUN：不寫檔、不寫 Firestore"); return; }

  // data/youtube.json：內容沒變（只有時間戳不同）就不改檔，避免每次都產生 commit
  const strip = (o) => JSON.stringify({ ...o, updatedAt: "" });
  if (!prev.updatedAt || strip(prev) !== strip(snap) || now - Date.parse(prev.updatedAt) > 20 * 3600 * 1000) {
    writeFileSync(OUT, JSON.stringify(snap, null, 2) + "\n");
    console.log("已更新 data/youtube.json");
  } else console.log("data/youtube.json 無變動");

  if (db) {
    const at = new Date(now).toISOString();
    const batch = db.batch();
    batch.set(db.doc("aurora_youtube/channel"), { ...channel, updatedAt: at });
    // 後台需要看到私人／排程中的影片（OAuth 模式才拿得到），公開清單由前台自行過濾 privacy
    batch.set(db.doc("aurora_youtube/videos"), { items: videos.slice(0, 50), updatedAt: at });
    batch.set(db.doc("aurora_youtube/history"), { days: history, updatedAt: at });
    const statRef = db.doc("aurora_stats/youtube_subscribers");
    const exists = (await statRef.get()).exists;
    batch.set(statRef, { ...row, ...(exists ? {} : { sort: 5 }), updatedAt: at }, { merge: true });
    batch.set(db.doc("aurora_youtube_meta/sync"), { lastRunAt: at, mode: oauth ? "oauth" : "apiKey", channelId: channel.id, videos: videos.length, error: null });
    await batch.commit();
    console.log("已寫入 Firestore：aurora_youtube／aurora_stats/youtube_subscribers");
  }
}

main().catch(async (e) => {
  console.error((isAuthError(e) ? "認證錯誤（請依 docs/YOUTUBE_SOP.md 重新取得 refresh token）：" : "執行失敗：") + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
