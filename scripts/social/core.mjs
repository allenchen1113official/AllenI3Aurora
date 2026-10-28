/* =====================================================================
   社群自動發文 · 核心邏輯（Facebook 粉專＋Instagram＋Threads）
   ---------------------------------------------------------------------
   與 Firestore / Graph API 解耦：store 與 graph 皆由呼叫端注入，
   publish-social-posts.mjs 接真實服務，publish.test.mjs 接記憶體假物件。

   佇列模式比照 mailState：
     queueState  'draft' | 'pending' | 'done' | 'rejected'
       → 排程器只做一次單欄位查詢 where('queueState','==','pending')，不建複合索引。
     fb.state    'draft' | 'approved' | 'publishing' | 'scheduled'
                 | 'cancel_requested' | 'published' | 'failed' | 'skipped'

   FB 準時度策略：GitHub Actions cron 可能延遲 10–30 分鐘，所以預定時間
   落在原生排程窗內時，交給 Meta 用 scheduled_publish_time 定時發出；
   只有「已到期／即將到期」的貼文才由排程器立即發布。

   IG／Threads（容器頻道）沒有原生排程：到期前 5 分鐘內由排程器兩段式發布
     建立容器 → 確認 status 為 FINISHED → 發布（creation_id 冪等）。
     ig.state / th.state  'draft' | 'approved' | 'processing' | 'publishing'
                          | 'cancel_requested' | 'published' | 'failed' | 'skipped'
   同一筆貼文各頻道共用一把鎖，依 fb → ig → th 順序處理，互不影響。
   ===================================================================== */

export const FB_NATIVE_MIN_LEAD_MS = 20 * 60 * 1000;          // Meta 要求至少 10 分鐘後；留 buffer
export const FB_NATIVE_MAX_LEAD_MS = 29 * 24 * 60 * 60 * 1000; // Meta 上限約 30 天；超過就先等
export const LOCK_STALE_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const OVERDUE_MS = 24 * 60 * 60 * 1000;
export const CONTAINER_LEAD_MS = 5 * 60 * 1000;          // 容器頻道：到期前 5 分鐘內送出
export const CONTAINER_TTL_MS = 23 * 60 * 60 * 1000;     // 容器 24 小時後失效，留 1 小時 buffer

export const CHANNELS = ["fb", "ig", "th"];
export const CONTAINER_CHANNELS = ["ig", "th"];
export const CHANNEL_LABEL = { fb: "Facebook 粉專", ig: "Instagram", th: "Threads" };

const iso = (ms) => new Date(ms).toISOString();
const parseTime = (v) => {
  if (!v) return NaN;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis(); // Firestore Timestamp 相容
  return Date.parse(v);
};

/* ---------- Graph API 錯誤分類 ---------- */
export class GraphError extends Error {
  constructor(message, { code, subcode, status, type } = {}) {
    super(message);
    this.name = "GraphError";
    this.code = code; this.subcode = subcode; this.status = status; this.type = type;
  }
}
// 190 = Token 失效／過期；10、200–299 = 權限不足 → 人工處理，不重試
export const isAuthError = (e) => e instanceof GraphError && (e.code === 190 || e.code === 10 || (e.code >= 200 && e.code < 300));
// 1、2 = 暫時性；4、17、32、613 = 頻率限制；5xx 與網路錯誤 → 可重試
export const isRetryable = (e) => {
  if (!(e instanceof GraphError)) return true; // fetch 失敗等網路層錯誤
  if (isAuthError(e)) return false;
  return [1, 2, 4, 17, 32, 341, 613].includes(e.code) || (e.status >= 500 && e.status < 600);
};

/* ---------- Graph 呼叫（FB／IG 共用 graph.facebook.com，Threads 用 graph.threads.net） ---------- */
function makeCaller(base, token, fetchImpl) {
  return async function call(method, path, params = {}) {
    const body = new URLSearchParams({ ...params, access_token: token });
    const url = method === "GET" || method === "DELETE" ? `${base}/${path}?${body}` : `${base}/${path}`;
    let res;
    try {
      res = await fetchImpl(url, method === "POST" ? { method, body } : { method });
    } catch (e) {
      throw new Error("網路錯誤：" + (e && e.message ? e.message : e));
    }
    let data = {};
    try { data = await res.json(); } catch { /* 非 JSON 回應 */ }
    if (!res.ok || data.error) {
      const er = data.error || {};
      throw new GraphError(er.error_user_msg || er.message || `HTTP ${res.status}`, { code: er.code, subcode: er.error_subcode, status: res.status, type: er.type });
    }
    return data;
  };
}

/* ---------- FB Graph 客戶端（fetchImpl 可注入） ---------- */
export function createFbGraph({ token, pageId, version = "v25.0", fetchImpl = fetch }) {
  const call = makeCaller(`https://graph.facebook.com/${version}`, token, fetchImpl);
  return {
    /* 發文：有圖走 /photos，否則走 /feed。scheduleUnix 有值則為 Meta 原生排程。 */
    async publish({ message, link, imageUrl, scheduleUnix }) {
      const sched = scheduleUnix ? { published: "false", scheduled_publish_time: String(scheduleUnix) } : {};
      if (imageUrl) {
        // 照片貼文不支援 link 參數，連結併入內文
        const caption = [message, link].filter(Boolean).join("\n\n");
        const r = await call("POST", `${pageId}/photos`, { url: imageUrl, caption, ...sched });
        return { postId: r.post_id || r.id, photoId: r.id };
      }
      const r = await call("POST", `${pageId}/feed`, { message, ...(link ? { link } : {}), ...sched });
      return { postId: r.id };
    },
    async remove(postId) { return call("DELETE", postId); },
    async status(postId) {
      return call("GET", postId, { fields: "is_published,permalink_url,scheduled_publish_time" });
    },
    async checkToken() {
      return call("GET", pageId, { fields: "id,name" });
    },
  };
}

/* ---------- 容器頻道客戶端：介面一致 create / status / publish / permalink / checkToken ---------- */
const normStatus = (s) => String(s || "").toUpperCase();

/* Instagram 商業帳號（沿用粉專 Token，需 instagram_content_publish 權限；IG 貼文必須有圖） */
export function createIgGraph({ token, igUserId, version = "v25.0", fetchImpl = fetch }) {
  const call = makeCaller(`https://graph.facebook.com/${version}`, token, fetchImpl);
  return {
    async create({ text, imageUrl }) {
      const r = await call("POST", `${igUserId}/media`, { image_url: imageUrl, caption: text || "" });
      return { id: r.id };
    },
    async status(id) {
      const r = await call("GET", id, { fields: "status_code,status" });
      return { status: normStatus(r.status_code), error: r.status || null };
    },
    async publish(creationId) {
      const r = await call("POST", `${igUserId}/media_publish`, { creation_id: creationId });
      return { id: r.id };
    },
    async permalink(id) { return (await call("GET", id, { fields: "permalink" })).permalink || null; },
    async checkToken() {
      const r = await call("GET", igUserId, { fields: "id,username" });
      return { name: r.username ? "@" + r.username : r.id };
    },
  };
}

/* Threads（獨立的長效 Token，60 天到期，可每日續期；文字上限 500 字） */
export function createThreadsGraph({ token, userId, version = "v1.0", fetchImpl = fetch }) {
  const call = makeCaller(`https://graph.threads.net/${version}`, token, fetchImpl);
  return {
    async create({ text, imageUrl }) {
      const p = imageUrl ? { media_type: "IMAGE", image_url: imageUrl, text: text || "" } : { media_type: "TEXT", text: text || "" };
      const r = await call("POST", `${userId}/threads`, p);
      return { id: r.id };
    },
    async status(id) {
      const r = await call("GET", id, { fields: "status,error_message" });
      return { status: normStatus(r.status), error: r.error_message || null };
    },
    async publish(creationId) {
      const r = await call("POST", `${userId}/threads_publish`, { creation_id: creationId });
      return { id: r.id };
    },
    async permalink(id) { return (await call("GET", id, { fields: "permalink" })).permalink || null; },
    async checkToken() {
      const r = await call("GET", "me", { fields: "id,username" });
      return { name: r.username ? "@" + r.username : r.id };
    },
  };
}

/* Threads 長效 Token 續期（Token 需已發出 24 小時以上且未過期）；回傳 { token, expiresAt } */
export async function refreshThreadsToken({ token, fetchImpl = fetch, now = Date.now() }) {
  const url = `https://graph.threads.net/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: token })}`;
  const res = await fetchImpl(url, { method: "GET" });
  let data = {};
  try { data = await res.json(); } catch { /* 非 JSON 回應 */ }
  if (!res.ok || data.error || !data.access_token) {
    const er = data.error || {};
    throw new GraphError(er.message || `HTTP ${res.status}`, { code: er.code, status: res.status });
  }
  return { token: data.access_token, expiresAt: iso(now + Number(data.expires_in || 0) * 1000) };
}

/* ---------- 狀態規劃 ---------- */
function fbOf(post) { return post.fb || {}; }
const chOf = (post, ch) => post[ch] || {};
const lockFresh = (post, now) => { const t = parseTime(post.lock && post.lock.at); return isFinite(t) && now - t < LOCK_STALE_MS; };

/* 依目前狀態決定 FB 下一步；回傳動作名稱（純函式，便於測試） */
export function planFb(post, now) {
  const fb = fbOf(post);
  if (!fb.enabled) return "skip";
  const due = parseTime(post.scheduledAt);
  switch (fb.state) {
    case "approved": {
      if (isFinite(due) && now - due > OVERDUE_MS) return "overdue"; // 排程器停擺多時，過時內容不自動發
      if (!isFinite(due) || due - now <= FB_NATIVE_MIN_LEAD_MS) return "publish_now";
      if (due - now <= FB_NATIVE_MAX_LEAD_MS) return "schedule_native";
      return "wait"; // 超過 Meta 原生排程上限，等進入窗口再交付
    }
    case "scheduled":
      return isFinite(due) && now >= due ? "reconcile" : "wait";
    case "cancel_requested":
      return "cancel";
    case "publishing":
      // 上一輪送出後未回寫：結果不明，不自動重送以免重複貼文
      return lockFresh(post, now) ? "wait" : "uncertain";
    default:
      return "noop"; // draft / published / failed / skipped
  }
}

/* 容器頻道（ig / th）下一步 */
export function planContainer(post, ch, now) {
  const c = chOf(post, ch);
  if (!c.enabled) return "skip";
  const due = parseTime(post.scheduledAt);
  switch (c.state) {
    case "approved":
      if (isFinite(due) && now - due > OVERDUE_MS) return "overdue";
      return !isFinite(due) || due - now <= CONTAINER_LEAD_MS ? "create" : "wait";
    case "processing":
      return "check"; // 容器已建立，確認處理完成後發布
    case "publishing":
      // 送出發布後未回寫：先查容器狀態判斷是否已發出，不盲目重送
      return lockFresh(post, now) ? "wait" : "recover";
    case "cancel_requested":
      return "cancel";
    default:
      return "noop";
  }
}

const IDLE = ["wait", "noop", "skip"];
const NEEDS_GRAPH = ["create", "check", "recover"];

/* 整筆貼文各頻道的動作；graphs（{ fb, ig, th }）缺該頻道 → unconfigured，paused 內的頻道（Token 檢查失敗）→ wait */
export function planPost(post, now, { graphs = {}, paused = [] } = {}) {
  const plan = { fb: planFb(post, now) };
  if (["publish_now", "schedule_native", "reconcile"].includes(plan.fb) && !graphs.fb) plan.fb = "unconfigured";
  for (const ch of CONTAINER_CHANNELS) {
    let a = planContainer(post, ch, now);
    if (NEEDS_GRAPH.includes(a) && !graphs[ch]) a = "unconfigured";
    plan[ch] = a;
  }
  for (const ch of paused) if (!IDLE.includes(plan[ch])) plan[ch] = "wait";
  return plan;
}

/* queueState：任一啟用頻道仍需排程器處理 → pending；啟用頻道全在草稿 → draft；其餘 → done。
   失敗項目由後台篩出，人工按「重試」才會回到 pending。 */
const ACTIVE = {
  fb: ["approved", "publishing", "scheduled", "cancel_requested"],
  ig: ["approved", "processing", "publishing", "cancel_requested"],
  th: ["approved", "processing", "publishing", "cancel_requested"],
};
export function nextQueueState(post) {
  const en = CHANNELS.filter((ch) => chOf(post, ch).enabled);
  if (en.some((ch) => ACTIVE[ch].includes(chOf(post, ch).state))) return "pending";
  if (en.length && en.every((ch) => !chOf(post, ch).state || chOf(post, ch).state === "draft")) return "draft";
  return "done";
}

/* ---------- 各頻道執行 ---------- */
/* FB：與第一階段行為相同 */
async function runFb(act, cur, { graph, save, now, log, tag }) {
  const fb = fbOf(cur);
  if (act === "publish_now" || act === "schedule_native") {
    // 先標記 publishing（鎖已在 claim 時寫入），再呼叫 API
    await save("fb", { state: "publishing" });
    const scheduleUnix = act === "schedule_native" ? Math.floor(parseTime(cur.scheduledAt) / 1000) : null;
    const r = await graph.publish({ message: fb.caption || "", link: fb.link || "", imageUrl: cur.imageUrl || "", scheduleUnix });
    if (act === "schedule_native") {
      await save("fb", { state: "scheduled", postId: r.postId, photoId: r.photoId || null, error: null, nativeScheduledAt: iso(now) });
      log(`${tag} FB 已交給 Meta 原生排程 → ${r.postId}`);
    } else {
      await save("fb", { state: "published", postId: r.postId, photoId: r.photoId || null, error: null, publishedAt: iso(now) });
      log(`${tag} FB 已發布 → ${r.postId}`);
    }
    return { postId: r.postId };
  }
  if (act === "reconcile") {
    const s = await graph.status(fb.postId);
    if (s.is_published) {
      await save("fb", { state: "published", permalink: s.permalink_url || null, publishedAt: fb.publishedAt || iso(now) });
      log(`${tag} FB 原生排程已發出`);
      return { published: true };
    }
    log(`${tag} FB 原生排程尚未發出，下輪再查`);
    return { published: false };
  }
  if (act === "cancel") {
    if (fb.postId) await graph.remove(fb.postId);
    await save("fb", { state: "draft", postId: null, photoId: null, error: null }, { "review.approvedAt": null });
    log(`${tag} FB 已撤銷 Meta 端排程，退回草稿`);
    return {};
  }
  if (act === "unconfigured") {
    await save("fb", { state: "failed", error: "排程器尚未設定 Facebook 粉專（缺少 META_PAGE_TOKEN／META_PAGE_ID），未發布。設定方式見 docs/SOCIAL_SOP.md，設定後重新核准。" });
    return {};
  }
  if (act === "overdue") {
    await save("fb", { state: "failed", error: "預定時間已逾期超過 24 小時，為避免發出過時內容未自動發布。請確認後重設時間再核准。" });
    return {};
  }
  if (act === "uncertain") {
    await save("fb", { state: "failed", error: "上一輪發布送出後未收到回應，結果不明。請先到粉專確認是否已發出，未發出再按「重試」。" });
    return {};
  }
  return {};
}

/* IG／Threads：建立容器 → 確認 FINISHED → 發布 */
async function runContainer(ch, act, cur, { graphs, save, now, log, tag }) {
  const g = graphs[ch];
  const c = chOf(cur, ch);
  const label = CHANNEL_LABEL[ch];
  const publishFinished = async (containerId) => {
    await save(ch, { state: "publishing" });
    let r;
    try { r = await g.publish(containerId); }
    catch (e) {
      // 伺服器明確拒絕 → 容器仍有效，可重試；網路層錯誤 → 不知是否已發出，留給下一輪 recover 查容器狀態
      if (!(e instanceof GraphError)) throw Object.assign(e, { keepState: true });
      await save(ch, { state: "processing" });
      throw e;
    }
    let permalink = null;
    try { permalink = await g.permalink(r.id); } catch { /* 取不到連結不影響發布結果 */ }
    await save(ch, { state: "published", mediaId: r.id, permalink, error: null, publishedAt: iso(now) });
    log(`${tag} ${label} 已發布 → ${r.id}`);
    return { postId: r.id };
  };
  const failContainer = (msg) => save(ch, { state: "failed", error: `${label} 處理媒體失敗：${msg || "容器狀態 ERROR"}（請確認圖片為公開可下載的 https 網址）`, containerId: null });

  if (act === "unconfigured") {
    await save(ch, { state: "failed", error: `排程器尚未設定 ${label}（缺少對應的 Secrets），未發布。設定方式見 docs/SOCIAL_SOP.md，設定後重新核准。` });
    return {};
  }
  if (act === "overdue") {
    await save(ch, { state: "failed", error: "預定時間已逾期超過 24 小時，為避免發出過時內容未自動發布。請確認後重設時間再核准。" });
    return {};
  }
  if (act === "cancel") {
    await save(ch, { state: "draft", containerId: null, error: null }); // 未發布的容器 24 小時後自動失效，不需刪除
    log(`${tag} ${label} 已取消，退回草稿`);
    return {};
  }
  if (act === "create") {
    const r = await g.create({ text: c.caption || "", imageUrl: cur.imageUrl || "" });
    await save(ch, { state: "processing", containerId: r.id, containerAt: iso(now), error: null });
    log(`${tag} ${label} 已建立容器 ${r.id}`);
    act = "check";
  }
  const cid = chOf(cur, ch).containerId;
  if (act === "check") {
    const created = parseTime(chOf(cur, ch).containerAt);
    if (isFinite(created) && now - created > CONTAINER_TTL_MS) {
      await save(ch, { state: "failed", error: `${label} 容器已逾期（超過 24 小時未完成），請重新核准。`, containerId: null });
      return {};
    }
    const s = await g.status(cid);
    if (s.status === "FINISHED") return publishFinished(cid);
    if (s.status === "ERROR" || s.status === "EXPIRED") { await failContainer(s.error || s.status); return {}; }
    if (s.status === "PUBLISHED") {
      await save(ch, { state: "published", error: null, publishedAt: c.publishedAt || iso(now) });
      return { published: true };
    }
    log(`${tag} ${label} 容器處理中（${s.status || "IN_PROGRESS"}），下輪再查`);
    return {};
  }
  if (act === "recover") {
    if (!cid) {
      await save(ch, { state: "failed", error: `上一輪 ${label} 發布結果不明，請先到 ${label} 確認是否已發出，未發出再按「重試」。` });
      return {};
    }
    const s = await g.status(cid);
    if (s.status === "PUBLISHED") {
      await save(ch, { state: "published", error: null, publishedAt: iso(now) });
      log(`${tag} ${label} 確認上一輪已發出`);
      return { published: true };
    }
    if (s.status === "FINISHED") return publishFinished(cid); // 容器未被發布過，可安全送出
    await save(ch, { state: "failed", error: `上一輪 ${label} 發布結果不明（容器狀態 ${s.status || "未知"}），請先到 ${label} 確認是否已發出，未發出再按「重試」。` });
    return {};
  }
  return {};
}

/*
 * 處理一筆貼文。store 需提供：
 *   claim(id, now) → Promise<post|null>   以 transaction 取得鎖，失敗回 null
 *   update(id, patch) → Promise            合併寫入（支援 'fb.state' 這類路徑）
 * graph 為 FB 客戶端；graphs = { ig, th } 為容器頻道客戶端（未設定者缺省）；
 * paused 為本輪 Token 檢查失敗、暫不處理的頻道。
 */
export async function processPost(post, { store, graph, graphs = {}, paused = [], now = Date.now(), dryRun = false, log = () => {} }) {
  const tag = `[${post.id}]`;
  const all = { ...graphs, fb: graph };
  const plan = planPost(post, now, { graphs: all, paused });
  const primary = (p) => (p.fb !== "skip" ? p.fb : CONTAINER_CHANNELS.map((ch) => p[ch]).find((a) => a !== "skip") || "skip");
  const busy = CHANNELS.filter((ch) => !IDLE.includes(plan[ch]));

  if (!busy.length) {
    if (plan.fb === "skip" && fbOf(post).state !== "skipped") {
      const patched = { ...post, fb: { ...fbOf(post), state: "skipped" } };
      const q = nextQueueState(patched);
      if (q !== post.queueState) await store.update(post.id, { queueState: q, updatedAt: iso(now) });
    }
    const a = primary(plan);
    log(`${tag} ${a}`);
    return { id: post.id, action: a, plan };
  }
  if (dryRun) {
    log(`${tag} DRY-RUN 將執行：${busy.map((ch) => `${ch}:${plan[ch]}`).join(" ")}`);
    return { id: post.id, action: primary(plan), plan, dryRun: true };
  }

  const claimed = await store.claim(post.id, now);
  if (!claimed) { log(`${tag} 已被其他執行者處理，略過`); return { id: post.id, action: "locked" }; }
  // 取得鎖後以最新內容重新判斷（避免拿到舊快照）。能取得鎖代表先前的鎖已失效，
  // 判斷時忽略鎖欄位：此時仍是 publishing 即為「上一輪送出後未回寫」。
  const cur = { ...claimed }; // save() 以新物件取代頻道欄位，不改動 claimed
  const fresh = planPost({ ...cur, lock: { by: null, at: null } }, now, { graphs: all, paused });
  const save = async (ch, patch, extra = {}) => {
    cur[ch] = { ...chOf(cur, ch), ...patch };
    await store.update(cur.id, { [ch]: cur[ch], updatedAt: iso(now), ...extra });
  };

  const results = {};
  const errors = [];
  for (const ch of CHANNELS) {
    const act = fresh[ch];
    if (IDLE.includes(act)) continue;
    const ctx = { graph, graphs, save, now, log, tag };
    try {
      results[ch] = { action: act, ...(ch === "fb" ? await runFb(act, cur, ctx) : await runContainer(ch, act, cur, ctx)) };
    } catch (e) {
      const c = chOf(cur, ch);
      const attempts = (c.attempts || 0) + 1;
      const msg = (e && e.message) || String(e);
      let state, retry;
      if (ch === "fb") {
        retry = isRetryable(e) && attempts < MAX_ATTEMPTS && act !== "cancel";
        // 取消失敗時維持 cancel_requested，下一輪再試；其餘依可否重試回到 approved 或 failed
        state = act === "cancel" ? "cancel_requested" : retry ? "approved" : "failed";
      } else if (e && e.keepState) {
        // 發布請求網路中斷：維持 publishing，鎖過期後由 recover 查容器狀態
        retry = true; state = "publishing";
      } else {
        retry = isRetryable(e) && attempts < MAX_ATTEMPTS;
        state = !retry ? "failed" : c.state === "processing" ? "processing" : "approved";
      }
      await save(ch, { state, attempts, error: msg, errorCode: e.code ?? null });
      log(`${tag} ${CHANNEL_LABEL[ch]} 失敗（${attempts}/${MAX_ATTEMPTS}）：${msg}`);
      results[ch] = { action: act, error: msg };
      errors.push({ ch, msg, auth: isAuthError(e), retry });
    }
  }
  await store.update(cur.id, { queueState: nextQueueState(cur), lock: { by: null, at: null }, updatedAt: iso(now) });

  const hard = errors.find((x) => !x.retry);
  return {
    id: cur.id,
    action: primary(fresh),
    channels: results,
    ...(errors.length ? {
      error: (hard || errors[0]).msg,
      retry: !hard,
      auth: errors.some((x) => x.auth),
      authChannels: [...new Set(errors.filter((x) => x.auth).map((x) => x.ch))],
    } : {}),
    ...(results.fb && results.fb.postId ? { postId: results.fb.postId } : {}),
    ...(results.fb && "published" in results.fb ? { published: results.fb.published } : {}),
  };
}

/* 執行一輪：撈 pending → 逐筆處理 → 回傳摘要 */
export async function runOnce({ store, graph, graphs = {}, paused = [], now = Date.now(), dryRun = false, log = console.log }) {
  const posts = await store.listPending();
  const results = [];
  for (const p of posts) results.push(await processPost(p, { store, graph, graphs, paused, now, dryRun, log }));
  const authChannels = [...new Set(results.flatMap((r) => r.authChannels || []))];
  return {
    total: posts.length,
    results,
    authFailed: results.some((r) => r.auth),
    authChannels,
    failed: results.filter((r) => r.error && !r.retry).length,
  };
}
