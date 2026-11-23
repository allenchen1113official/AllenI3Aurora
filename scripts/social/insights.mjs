/* =====================================================================
   社群成效同步 · 核心邏輯（FB／IG／Threads）
   ---------------------------------------------------------------------
   每日由 sync-insights.mjs（social-insights.yml）呼叫，抓近 30 天已發布貼文的
   觸及與互動，寫回 aurora_social_posts 的 stats 欄位，後台儀表板與內容庫顯示。
   與 core.mjs 相同：fetch 可注入、store 由呼叫端提供，測試不連外部服務。

   各平台指標（Meta 會不定期汰換指標名稱，所以每個指標個別請求、取不到就略過）：
     FB       reach = post_impressions_unique（或 post_media_view），互動 = 心情＋留言＋分享
              （Token 無 pages_read_user_content 時，心情改用 insights post_reactions_by_type_total）
     IG       reach = reach，互動 = 讚＋留言＋分享＋收藏（有 IG_TOKEN 時走 graph.instagram.com）
     Threads  reach = views，互動 = 讚＋回覆＋轉發＋引用
   ===================================================================== */
import { makeCaller, CHANNELS } from "./core.mjs";

export const INSIGHTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const num = (v) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
/* insights 回應的單一數值：新版 total_value.value，舊版 values[0].value */
function metricValue(row) {
  if (!row) return null;
  if (row.total_value && row.total_value.value != null) return num(row.total_value.value);
  if (Array.isArray(row.values) && row.values.length) return num(row.values[row.values.length - 1].value);
  return null;
}
/* 依序嘗試指標，回傳第一個取得的值（逐一請求，避免一個被汰換的指標讓整批失敗） */
async function firstMetric(call, id, names) {
  for (const m of names) {
    try {
      const r = await call("GET", `${id}/insights`, { metric: m });
      const v = metricValue((r.data || [])[0]);
      if (v != null) return v;
    } catch { /* 該指標不支援，試下一個 */ }
  }
  return null;
}
async function metrics(call, id, names) {
  const out = {};
  for (const m of names) {
    try {
      const r = await call("GET", `${id}/insights`, { metric: m });
      const v = metricValue((r.data || [])[0]);
      if (v != null) out[m] = v;
    } catch { /* 略過不支援的指標 */ }
  }
  return out;
}

/* insights 單一指標的數值；post_reactions_by_type_total 這類回傳物件（{like:3,love:1}）時加總 */
function metricNumber(row) {
  if (!row) return null;
  const raw = row.total_value && row.total_value.value != null ? row.total_value.value
    : Array.isArray(row.values) && row.values.length ? row.values[row.values.length - 1].value : null;
  if (raw == null) return null;
  if (typeof raw === "object") return Object.values(raw).reduce((a, b) => a + num(b), 0);
  return num(raw);
}
async function tryCall(call, path, params) {
  try { return { ok: await call("GET", path, params) }; } catch (e) { return { err: e }; }
}
/* 權限類錯誤（10、200–299、或訊息明講沒有權限）：同一輪後續不必再試這個平台 */
export const isPermissionError = (e) => !!e && ((e.code === 10 || (e.code >= 200 && e.code < 300) || e.code === 190)
  || /does not have permission|requires the '.*' permission/i.test(e.message || ""));

/*
 * metaToken：粉專 Token（FB；未設定 igToken 時 IG 也沿用，走 graph.facebook.com）
 * igToken：Instagram 登入的 IG Token（graph.instagram.com；粉專未連結 IG 時必須用這把）
 * 每個平台：能取得的欄位／指標各自取，只要有任何一項取得就算成功；全部取不到才丟出第一個錯誤。
 */
export function createInsightsClients({ metaToken, igToken, threadsToken, version = "v25.0", fetchImpl = fetch }) {
  const fbCall = metaToken ? makeCaller(`https://graph.facebook.com/${version}`, metaToken, fetchImpl) : null;
  const igCall = igToken ? makeCaller(`https://graph.instagram.com/${version}`, igToken, fetchImpl)
    : fbCall;
  const thCall = threadsToken ? makeCaller("https://graph.threads.net/v1.0", threadsToken, fetchImpl) : null;
  const clients = {};
  if (fbCall) {
    clients.fb = async (id) => {
      // 心情／留言／分享欄位需 pages_read_user_content；沒有時改用 insights 的 post_reactions_by_type_total（read_insights）
      const f = await tryCall(fbCall, id, { fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares" });
      let likes = null, comments = null, shares = null;
      if (f.ok) {
        const r = f.ok;
        likes = num(r.reactions && r.reactions.summary && r.reactions.summary.total_count);
        comments = num(r.comments && r.comments.summary && r.comments.summary.total_count);
        shares = num(r.shares && r.shares.count);
      } else {
        const rx = await tryCall(fbCall, `${id}/insights`, { metric: "post_reactions_by_type_total" });
        if (rx.ok) likes = metricNumber((rx.ok.data || [])[0]);
      }
      const reach = await firstMetric(fbCall, id, ["post_impressions_unique", "post_media_view"]);
      if (likes == null && reach == null && f.err) throw f.err;
      return { reach, likes: num(likes), comments: num(comments), shares: num(shares), engagement: num(likes) + num(comments) + num(shares) };
    };
  }
  if (igCall) {
    clients.ig = async (id) => {
      // like_count／comments_count 只需基本權限；reach／shares／saved 需 insights 權限，取不到就略過
      const f = await tryCall(igCall, id, { fields: "like_count,comments_count" });
      const m = await metrics(igCall, id, ["reach", "shares", "saved"]);
      if (f.err && !Object.keys(m).length) throw f.err;
      const r = f.ok || {};
      const likes = num(r.like_count), comments = num(r.comments_count), shares = num(m.shares), saved = num(m.saved);
      return { reach: m.reach ?? null, likes, comments, shares, saved, engagement: likes + comments + shares + saved };
    };
  }
  if (thCall) {
    clients.th = async (id) => {
      const r = await thCall("GET", `${id}/insights`, { metric: "views,likes,replies,reposts,quotes" });
      const v = Object.fromEntries((r.data || []).map((row) => [row.name, metricValue(row)]));
      const likes = num(v.likes), comments = num(v.replies), shares = num(v.reposts) + num(v.quotes);
      return { reach: v.views ?? null, likes, comments, shares, engagement: likes + comments + shares };
    };
  }
  return clients;
}

/* 該頻道在平台上的貼文 ID（FB 照片貼文用 post_id，才查得到心情與留言） */
export function mediaIdOf(post, ch) {
  const c = post[ch] || {};
  return ch === "fb" ? c.postId || null : c.mediaId || null;
}

/* 需要同步的頻道：已發布、有平台 ID、發布時間在 30 天內 */
export function channelsToSync(post, now) {
  return CHANNELS.filter((ch) => {
    const c = post[ch] || {};
    if (!c.enabled || c.state !== "published" || !mediaIdOf(post, ch)) return false;
    const t = Date.parse(c.publishedAt || post.scheduledAt || "");
    return isFinite(t) && now - t <= INSIGHTS_WINDOW_MS;
  });
}

/* 各頻道加總（觸及只加有值的頻道；全部取不到時為 null） */
export function totalStats(byCh) {
  const vals = Object.values(byCh).filter(Boolean);
  const reachVals = vals.map((x) => x.reach).filter((x) => x != null);
  return {
    reach: reachVals.length ? reachVals.reduce((a, b) => a + b, 0) : null,
    engagement: vals.reduce((a, x) => a + num(x.engagement), 0),
  };
}

/*
 * 同步一輪。store 需提供：
 *   listPublished() → Promise<post[]>   queueState == 'done' 的貼文
 *   update(id, patch) → Promise
 */
export async function syncInsights({ store, clients, now = Date.now(), dryRun = false, log = console.log }) {
  const posts = await store.listPublished();
  let updated = 0;
  const errors = [];
  const denied = {}; // 平台 → 權限錯誤訊息；同一輪不再對該平台發請求
  for (const post of posts) {
    const chs = channelsToSync(post, now).filter((ch) => clients[ch] && !denied[ch]);
    if (!chs.length) continue;
    const byCh = { ...((post.stats && post.stats.channels) || {}) };
    let changed = false;
    for (const ch of chs) {
      try {
        byCh[ch] = { ...(await clients[ch](mediaIdOf(post, ch))), at: new Date(now).toISOString() };
        changed = true;
      } catch (e) {
        errors.push({ id: post.id, ch, error: (e && e.message) || String(e), code: e && e.code });
        if (isPermissionError(e)) denied[ch] = (e && e.message) || String(e);
        log(`[${post.id}] ${ch} 成效讀取失敗：${(e && e.message) || e}`);
      }
    }
    if (!changed) continue;
    const stats = { channels: byCh, ...totalStats(byCh), updatedAt: new Date(now).toISOString() };
    if (dryRun) log(`[${post.id}] DRY-RUN 觸及 ${stats.reach ?? "—"}／互動 ${stats.engagement}`);
    else await store.update(post.id, { stats });
    updated++;
  }
  return { scanned: posts.length, updated, errors, denied };
}
