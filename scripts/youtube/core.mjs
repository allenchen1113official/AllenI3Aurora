/* =====================================================================
   YouTube 頻道同步 · 核心邏輯（純函式；不引用任何 Node 模組，後台可直接以 ES module 載入）
   ---------------------------------------------------------------------
   youtube-sync.yml → sync-channel.mjs：
     channels.list＋uploads 播放清單＋videos.list → data/youtube.json、
     Firestore aurora_youtube/{channel,videos,history}、aurora_stats/youtube_subscribers。
   影片「上傳／排程公開」不在這裡：由 PilotOne 的 yt 頻道處理
   （scripts/social/core.mjs＋youtube.mjs，見 docs/SOCIAL_SOP.md 二之三）。
   ===================================================================== */

const iso = (ms) => new Date(ms).toISOString();
const parseTime = (v) => {
  if (!v) return NaN;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  return Date.parse(v);
};

/* ---------- 錯誤分類 ---------- */
export class YtError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = "YtError";
    this.status = status; this.reason = reason;
  }
}
const QUOTA = ["quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded", "uploadLimitExceeded", "dailyLimitExceeded"];
const AUTH = ["authError", "invalid_grant", "insufficientPermissions", "youtubeSignupRequired", "unauthorized_client", "invalid_client"];
export const isQuotaError = (e) => e instanceof YtError && QUOTA.includes(e.reason);
export const isAuthError = (e) => e instanceof YtError && (e.status === 401 || AUTH.includes(e.reason));
export const isRetryable = (e) => {
  if (!(e instanceof YtError)) return true; // 網路層錯誤
  if (isAuthError(e)) return false;
  return isQuotaError(e) || e.status === 429 || e.status === 408 || (e.status >= 500 && e.status < 600);
};

/* ---------- 共用格式化 ---------- */
export function parseDuration(s) {
  const m = String(s || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1).replace(/\.0$/, "") + "億";
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "萬";
  return n.toLocaleString("en-US");
}
/* 台北日期（YYYY-MM-DD）——環境 today 是 UTC，不可直接用 */
export function taipeiDate(ms = Date.now()) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
/* 影片 ID：接受 ID、watch?v=、youtu.be/、shorts/、embed/ */
export function ytId(s) {
  const v = String(s || "").trim();
  const m = v.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(v) ? v : "";
}
export const watchUrl = (id) => (id ? "https://www.youtube.com/watch?v=" + id : "");
export const thumbUrl = (id, q = "hqdefault") => (id ? `https://i.ytimg.com/vi/${id}/${q}.jpg` : "");

/* ---------- 頻道同步 ---------- */
export function channelSnapshot(ch) {
  if (!ch) return null;
  const sn = ch.snippet || {}, st = ch.statistics || {}, cd = ch.contentDetails || {};
  const handle = sn.customUrl || "";
  const thumbs = sn.thumbnails || {};
  return {
    id: ch.id,
    title: sn.title || "",
    handle,
    thumb: (thumbs.high || thumbs.medium || thumbs.default || {}).url || "",
    subscribers: st.hiddenSubscriberCount ? null : Number(st.subscriberCount || 0),
    hiddenSubscribers: !!st.hiddenSubscriberCount,
    views: Number(st.viewCount || 0),
    videos: Number(st.videoCount || 0),
    uploadsPlaylist: (cd.relatedPlaylists || {}).uploads || "",
    url: handle ? `https://www.youtube.com/${handle.startsWith("@") ? handle : "@" + handle}` : `https://www.youtube.com/channel/${ch.id}`,
  };
}

export function toVideo(item) {
  const sn = item.snippet || {}, st = item.statistics || {}, cd = item.contentDetails || {}, ps = item.status || {};
  const sec = parseDuration(cd.duration);
  const thumbs = sn.thumbnails || {};
  return {
    id: item.id,
    title: sn.title || "",
    publishedAt: sn.publishedAt || "",
    thumb: (thumbs.medium || thumbs.high || thumbs.default || {}).url || thumbUrl(item.id, "mqdefault"),
    durationSec: sec,
    duration: fmtDuration(sec),
    isShort: sec > 0 && sec <= 180,
    views: Number(st.viewCount || 0),
    likes: Number(st.likeCount || 0),
    comments: Number(st.commentCount || 0),
    privacy: ps.privacyStatus || "public",
    publishAt: ps.publishAt || "",
    url: watchUrl(item.id),
  };
}

/* 每個台北日保留一筆（同日覆寫），最多 max 筆 */
export function appendHistory(history, date, point, max = 90) {
  const list = (Array.isArray(history) ? history : []).filter((h) => h && h.date !== date);
  list.push({ date, ...point });
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  return list.slice(-max);
}

/* 與 N 天前比較；歷史不足時取最早一筆 */
function diffDays(history, key, days, today) {
  const list = (history || []).filter((h) => h[key] != null);
  if (list.length < 2) return null;
  const last = list[list.length - 1];
  const cut = new Date(Date.parse(today + "T00:00:00Z") - days * 86400000).toISOString().slice(0, 10);
  const base = [...list].reverse().find((h) => h.date <= cut) || list[0];
  if (base === last) return null;
  return { delta: last[key] - base[key], days: Math.round((Date.parse(last.date) - Date.parse(base.date)) / 86400000) };
}

/* aurora_stats 列（首頁統計卡）：訂閱數＋近 7 天增減＋近 8 點走勢 */
export function statsRow(snap, history, today) {
  const subs = snap.subscribers;
  const d = diffDays(history, "subscribers", 7, today);
  const sign = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmtCount(Math.abs(n));
  return {
    label: "YouTube 訂閱",
    value: subs == null ? "隱藏" : fmtCount(subs),
    unit: subs == null ? "" : "人",
    delta: d ? `${sign(d.delta)}（${d.days} 天）· 觀看 ${fmtCount(snap.views)}` : `觀看 ${fmtCount(snap.views)} · ${snap.videos} 部影片`,
    tone: "illumination",
    mode: "semantic",
    data: (history || []).filter((h) => h.subscribers != null).slice(-8).map((h) => h.subscribers),
    link: snap.url,
    source: "youtube-sync",
  };
}

/* 前台／後台共用的公開快照（data/youtube.json） */
export function buildSnapshot({ channel, videos, history, now = Date.now(), limit = 24 }) {
  const list = (videos || []).filter((v) => v.privacy === "public")
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return {
    updatedAt: iso(now),
    date: taipeiDate(now).replace(/-/g, "."),
    channel,
    totals: { videos: list.length, shorts: list.filter((v) => v.isShort).length },
    latest: list.slice(0, limit),
    top: [...list].sort((a, b) => b.views - a.views).slice(0, 5).map((v) => v.id),
    history: (history || []).slice(-30),
  };
}
