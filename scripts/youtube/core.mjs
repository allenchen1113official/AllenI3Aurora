/* =====================================================================
   YouTube 串接 · 核心邏輯（純函式＋狀態機；瀏覽器與 Node 共用的部分不引用任何 Node 模組）
   ---------------------------------------------------------------------
   兩條線：
   1) 頻道同步（youtube-sync.yml → sync-channel.mjs）
      channels.list＋uploads 播放清單＋videos.list → data/youtube.json、
      Firestore aurora_youtube/{channel,videos,history}、aurora_stats/youtube_subscribers。
   2) 上傳排程（youtube-upload.yml → publish-uploads.mjs）
      後台「YouTube 頻道 → 上傳排程」核准的 aurora_youtube_uploads 工作：
      從 Google Drive 取成片 → resumable 分段上傳 → 等 YouTube 處理完成 →
      設縮圖＋上傳字幕 → 依 publishAt 交給 YouTube 原生排程公開（分鐘級準時）。

   上傳工作 state：
     'draft' | 'approved' | 'uploading' | 'processing' | 'scheduled'
     | 'published' | 'cancel_requested' | 'failed'
   排程器只做一次單欄位查詢 where('state','in', ACTIVE_STATES)，不建複合索引。

   冪等設計（比照 PilotOne「結果不明不重送」）：
   - 上傳 session URI 寫回 uploadUrl；中斷後以 Content-Range: bytes * /總長 查詢續傳點，
     最後一段其實已送達時查詢會直接拿到影片 → 不會重複上傳出兩支影片。
   - 已有 videoId 的工作再核准時只更新文案與公開設定，不會重新上傳。
   ===================================================================== */

export const LOCK_STALE_MS = 90 * 60 * 1000;          // 上傳工作最長 60 分鐘，留 buffer
export const OVERDUE_MS = 24 * 60 * 60 * 1000;        // 預定時間逾期超過 24 小時不自動上傳
export const MIN_PUBLISH_LEAD_MS = 15 * 60 * 1000;    // 預定時間在 15 分鐘後 → 交給 YouTube publishAt
export const SCHEDULE_GRACE_MS = 6 * 60 * 60 * 1000;  // publishAt 過後 6 小時仍未公開 → 失敗待人工
export const MAX_ATTEMPTS = 5;
export const CHUNK_BYTES = 32 * 1024 * 1024;          // 必須是 256 KiB 的倍數
export const ACTIVE_STATES = ["approved", "uploading", "processing", "scheduled", "cancel_requested"];
export const LIMIT = { title: 100, description: 5000, tags: 500 };
export const DEFAULT_CATEGORY = "19"; // Travel & Events

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

/* ---------- 上傳：文案 ---------- */
const clean = (s) => String(s || "").replace(/[<>]/g, "").replace(/\r/g, ""); // YouTube 拒收角括號
export function splitTags(tags) {
  const arr = Array.isArray(tags) ? tags : String(tags || "").split(/[,，\n]/);
  const out = []; let used = 0;
  for (const raw of arr) {
    const t = clean(raw).trim();
    if (!t || out.includes(t)) continue;
    const cost = t.length + (/\s/.test(t) ? 2 : 0) + (out.length ? 1 : 0); // 含空白的標籤 YouTube 會加引號計算
    if (used + cost > LIMIT.tags) break;
    out.push(t); used += cost;
  }
  return out;
}

/* 依預定時間決定公開方式：15 分鐘後 → private＋publishAt（YouTube 原生排程）；否則照指定 privacy */
export function publishPlan(job, now) {
  const due = parseTime(job.scheduledAt);
  if (isFinite(due) && due - now >= MIN_PUBLISH_LEAD_MS) return { privacyStatus: "private", publishAt: iso(due) };
  return { privacyStatus: ["public", "unlisted", "private"].includes(job.privacy) ? job.privacy : "public", publishAt: null };
}

export function buildMetadata(job, now) {
  const p = publishPlan(job, now);
  const status = {
    privacyStatus: p.privacyStatus,
    selfDeclaredMadeForKids: !!job.madeForKids,
    embeddable: true,
    license: "youtube",
  };
  if (p.publishAt) status.publishAt = p.publishAt;
  return {
    snippet: {
      title: clean(job.title).trim().slice(0, LIMIT.title),
      description: clean(job.description).slice(0, LIMIT.description),
      tags: splitTags(job.tags),
      categoryId: String(job.categoryId || DEFAULT_CATEGORY),
      defaultLanguage: job.language || "zh-TW",
      defaultAudioLanguage: job.language || "zh-TW",
    },
    status,
  };
}

/* 核准前的檢查；後台與排程器共用（回傳錯誤訊息陣列，空陣列＝可核准） */
export function validateJob(job) {
  const errs = [];
  const title = clean(job.title).trim();
  if (!title) errs.push("缺少標題");
  if (title.length > LIMIT.title) errs.push(`標題超過 ${LIMIT.title} 字（${title.length}）`);
  if (clean(job.description).length > LIMIT.description) errs.push(`說明欄超過 ${LIMIT.description} 字`);
  if (!job.videoId && !(job.drive && job.drive.file)) errs.push("缺少 Drive 成片檔名（或檔案 ID／網址）");
  if (/[<>]/.test(String(job.title || "") + String(job.description || ""))) errs.push("標題或說明欄含 < >，YouTube 不接受（上傳時會自動移除）");
  return errs;
}

/* ---------- 上傳：狀態規劃 ---------- */
const lockFresh = (job, now) => { const t = parseTime(job.lock && job.lock.at); return !!(job.lock && job.lock.by) && isFinite(t) && now - t < LOCK_STALE_MS; };

export function planJob(job, now) {
  const due = parseTime(job.scheduledAt);
  switch (job.state) {
    case "approved":
      if (job.videoId) return "update"; // 已上傳過（例如撤銷後再核准）：只改文案與公開設定
      if (isFinite(due) && now - due > OVERDUE_MS) return "overdue";
      return "upload";
    case "uploading":
      return lockFresh(job, now) ? "wait" : "resume";
    case "processing":
      return "check";
    case "scheduled": {
      const at = parseTime(job.publishAt);
      return isFinite(at) && now >= at ? "verify" : "wait";
    }
    case "cancel_requested":
      return "cancel";
    default:
      return "noop";
  }
}
const IDLE = ["wait", "noop"];
const HEAVY = ["upload", "resume"];

/*
 * 處理一筆上傳工作。依賴皆注入：
 *   store.claim(id, now) → job|null；store.update(id, patch)；store.linkSource?(job, info)
 *   yt：startUpload / putChunk / queryUpload / getVideo / updateVideo / setThumbnail / insertCaption
 *   media.prepare(job) → { size, mime, name, read(start, end) → Buffer, cleanup() }
 *   media.thumbnail?(job) → { data: Buffer, mime } | null
 */
export async function processJob(job, { store, yt, media, now = Date.now(), dryRun = false, allowUpload = true, log = () => {} }) {
  const tag = `[${job.id}]`;
  const act0 = planJob(job, now);
  if (IDLE.includes(act0)) { log(`${tag} ${act0}`); return { id: job.id, action: act0 }; }
  if (HEAVY.includes(act0) && !allowUpload) { log(`${tag} 本輪已有上傳，順延`); return { id: job.id, action: "deferred" }; }
  if (dryRun) { log(`${tag} DRY-RUN 將執行：${act0}`); return { id: job.id, action: act0, dryRun: true }; }

  const claimed = await store.claim(job.id, now);
  if (!claimed) { log(`${tag} 已被其他執行者處理，略過`); return { id: job.id, action: "locked" }; }
  const cur = { ...claimed };
  let act = planJob({ ...cur, lock: { by: null, at: null } }, now);
  const save = async (patch) => { Object.assign(cur, patch); await store.update(cur.id, { ...patch, updatedAt: iso(now) }); };
  const link = async (live) => { if (store.linkSource && cur.source && cur.videoId) { try { await store.linkSource(cur, { videoId: cur.videoId, live }); } catch (e) { log(`${tag} 回寫來源失敗：${e.message}`); } } };

  const result = { id: cur.id, action: act };
  try {
    if (act === "overdue") {
      await save({ state: "failed", error: "預定時間已逾期超過 24 小時，為避免發出過時內容未自動上傳。請確認後重設時間再核准。" });
      return result;
    }
    if (act === "cancel") {
      if (cur.videoId) {
        await yt.updateVideo(cur.videoId, { status: { privacyStatus: "private", selfDeclaredMadeForKids: !!cur.madeForKids } }, "status");
        await save({ state: "draft", publishAt: null, error: null, attempts: 0, uploadUrl: null });
        log(`${tag} 已撤銷：影片 ${cur.videoId} 改為私人並取消排程公開，退回草稿`);
      } else {
        await save({ state: "draft", uploadUrl: null, uploadedBytes: 0, error: null, attempts: 0 });
        log(`${tag} 已撤銷上傳，退回草稿`);
      }
      return result;
    }
    if (act === "update") {
      const meta = buildMetadata(cur, now);
      await yt.updateVideo(cur.videoId, { snippet: meta.snippet, status: meta.status }, "snippet,status");
      await save({ state: "processing", publishAt: meta.status.publishAt || null, error: null });
      log(`${tag} 已更新影片 ${cur.videoId} 的文案與公開設定`);
      act = "check";
    }
    if (act === "upload" || act === "resume") {
      result.uploaded = await doUpload(cur, act, { yt, media, save, now, log, tag });
      if (!cur.videoId) return result; // 尚未完成（例如段落進度），下輪續傳
      act = "check";
    }
    if (act === "check") {
      const v = await yt.getVideo(cur.videoId);
      if (!v) { await save({ state: "failed", error: "YouTube 上找不到這支影片（可能已在 YouTube Studio 刪除）。" }); return result; }
      const st = v.status || {};
      if (st.uploadStatus === "uploaded") { log(`${tag} YouTube 處理中，下輪再查`); return result; }
      if (["failed", "rejected", "deleted"].includes(st.uploadStatus)) {
        await save({ state: "failed", error: `YouTube 處理失敗（${st.uploadStatus}：${st.failureReason || st.rejectionReason || "未說明"}）` });
        return result;
      }
      // processed：補縮圖與字幕（非致命，失敗只記錄）
      await applyExtras(cur, { yt, media, save, log, tag });
      const at = parseTime(st.publishAt);
      if (isFinite(at) && at > now) {
        await save({ state: "scheduled", publishAt: st.publishAt, privacy: cur.privacy, error: null, warning: null });
        log(`${tag} 已交給 YouTube 排程公開 → ${st.publishAt}`);
        await link(false);
      } else {
        const want = publishPlan(cur, now).privacyStatus;
        const warning = want === "public" && st.privacyStatus !== "public"
          ? "影片被 YouTube 設為私人：未通過稽核的 API 專案上傳的影片會被鎖為私人，請到 YouTube Studio 手動公開，或申請 API 稽核（見 docs/YOUTUBE_SOP.md）。" : null;
        await save({ state: "published", privacyStatus: st.privacyStatus || null, publishedAt: cur.publishedAt || iso(now), error: null, warning });
        log(`${tag} 完成：${st.privacyStatus}${warning ? "（⚠ 被鎖為私人）" : ""}`);
        await link(st.privacyStatus === "public");
      }
      return result;
    }
    if (act === "verify") {
      const v = await yt.getVideo(cur.videoId);
      const st = (v && v.status) || {};
      if (st.privacyStatus === "public") {
        await save({ state: "published", privacyStatus: "public", publishedAt: iso(now), error: null });
        log(`${tag} 排程公開已生效`);
        await link(true);
      } else if (now - parseTime(cur.publishAt) > SCHEDULE_GRACE_MS) {
        await save({ state: "published", privacyStatus: st.privacyStatus || null, publishedAt: iso(now),
          warning: `排程時間已過 6 小時仍是 ${st.privacyStatus || "未知"}，請到 YouTube Studio 確認（未通過稽核的 API 專案影片會被鎖為私人）。` });
      } else {
        log(`${tag} 排程時間已到，YouTube 尚未公開，下輪再查`);
      }
      return result;
    }
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const quota = isQuotaError(e);
    const attempts = (cur.attempts || 0) + (quota ? 0 : 1); // 配額用完隔天自動恢復，不計失敗次數
    const retry = isRetryable(e) && attempts < MAX_ATTEMPTS;
    const patch = { attempts, error: (quota ? "YouTube API 配額已用完，明天自動續行：" : "") + msg };
    if (e instanceof YtError && [404, 410].includes(e.status) && HEAVY.includes(act)) {
      patch.uploadUrl = null; patch.uploadedBytes = 0; // 上傳 session 失效：清掉，下次重新開始（未完成的 session 不會產生影片）
    }
    if (!retry) patch.state = "failed";
    else if (act === "cancel") patch.state = "cancel_requested";
    else if (HEAVY.includes(act)) patch.state = (patch.uploadUrl === null || !cur.uploadUrl) ? "approved" : "uploading";
    else if (act === "update") patch.state = "approved";
    // check / verify：維持原狀態，下輪再查
    await save(patch);
    log(`${tag} ${act} 失敗（${attempts}/${MAX_ATTEMPTS}）：${msg}`);
    Object.assign(result, { error: msg, retry, auth: isAuthError(e), quota });
  } finally {
    await store.update(cur.id, { lock: { by: null, at: null } });
  }
  return result;
}

async function doUpload(cur, act, { yt, media, save, now, log, tag }) {
  const src = await media.prepare(cur);
  try {
    let url = act === "resume" ? cur.uploadUrl : null;
    let offset = 0;
    const finish = async (video) => {
      await save({ state: "processing", videoId: video.id, uploadUrl: null, uploadedBytes: src.size, totalBytes: src.size,
        uploadedAt: iso(now), attempts: 0, error: null, publishAt: (video.status && video.status.publishAt) || cur.publishAt || null });
      log(`${tag} 上傳完成 → ${video.id}`);
      return true;
    };
    if (url) {
      const q = await yt.queryUpload(url, src.size);
      if (q.video) return finish(q.video); // 上一輪最後一段其實已送達
      if (q.expired) url = null; else offset = q.next || 0;
    }
    if (!url) {
      const meta = buildMetadata(cur, now);
      url = await yt.startUpload(meta, src.size, src.mime);
      await save({ state: "uploading", uploadUrl: url, totalBytes: src.size, uploadedBytes: 0, uploadStartedAt: iso(now),
        publishAt: meta.status.publishAt || null, sourceName: src.name || null, error: null });
      offset = 0;
      log(`${tag} 開始上傳 ${src.name || ""}（${(src.size / 1048576).toFixed(1)} MB）`);
    } else {
      await save({ state: "uploading" });
      log(`${tag} 從 ${(offset / 1048576).toFixed(1)} MB 續傳`);
    }
    while (offset < src.size) {
      const end = Math.min(offset + CHUNK_BYTES, src.size);
      const buf = await src.read(offset, end);
      const r = await yt.putChunk(url, buf, offset, end, src.size);
      if (r.video) return finish(r.video);
      offset = r.next;
      await save({ uploadedBytes: offset });
    }
    // 理論上最後一段會回傳影片；保險起見再查一次
    const q = await yt.queryUpload(url, src.size);
    if (q.video) return finish(q.video);
    throw new YtError("上傳結束但 YouTube 未回傳影片資訊", { status: 500 });
  } finally {
    try { await src.cleanup(); } catch { /* 暫存檔清除失敗不影響結果 */ }
  }
}

async function applyExtras(cur, { yt, media, save, log, tag }) {
  const extras = { ...(cur.extras || {}) };
  let changed = false;
  if (cur.drive && cur.drive.thumbnail && extras.thumbnail !== "done" && media.thumbnail) {
    try {
      const t = await media.thumbnail(cur);
      if (t) { await yt.setThumbnail(cur.videoId, t.data, t.mime); extras.thumbnail = "done"; log(`${tag} 縮圖已設定`); }
    } catch (e) { extras.thumbnail = "failed: " + e.message; log(`${tag} 縮圖設定失敗：${e.message}`); }
    changed = true;
  }
  const cap = cur.captions || {};
  if (cap.srt && extras.captions !== "done") {
    try { await yt.insertCaption(cur.videoId, cap.srt, cap.lang || "zh-TW", cap.name || "中文（台灣）"); extras.captions = "done"; log(`${tag} 字幕已上傳`); }
    catch (e) { extras.captions = "failed: " + e.message; log(`${tag} 字幕上傳失敗：${e.message}`); }
    changed = true;
  }
  if (changed) await save({ extras });
}

/* 一輪：撈出進行中工作 → 逐筆處理；每輪最多一個上傳（大檔），Token 失效即停止 */
export async function runQueue({ store, yt, media, now = Date.now(), dryRun = false, log = console.log }) {
  const jobs = (await store.listActive()).sort((a, b) => String(a.scheduledAt || "9").localeCompare(String(b.scheduledAt || "9")));
  const results = [];
  let allowUpload = true;
  for (const j of jobs) {
    const r = await processJob(j, { store, yt, media, now, dryRun, allowUpload, log });
    if (HEAVY.includes(r.action) && !r.dryRun) allowUpload = false;
    results.push(r);
    if (r.auth) break;
  }
  return {
    total: jobs.length,
    results,
    auth: results.some((r) => r.auth),
    quota: results.some((r) => r.quota),
    failed: results.filter((r) => r.error && !r.retry).length,
  };
}
