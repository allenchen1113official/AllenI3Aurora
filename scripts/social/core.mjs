/* =====================================================================
   社群自動發文 · 核心邏輯（第一階段：Facebook 粉專）
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
   ===================================================================== */

export const FB_NATIVE_MIN_LEAD_MS = 20 * 60 * 1000;          // Meta 要求至少 10 分鐘後；留 buffer
export const FB_NATIVE_MAX_LEAD_MS = 29 * 24 * 60 * 60 * 1000; // Meta 上限約 30 天；超過就先等
export const LOCK_STALE_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const OVERDUE_MS = 24 * 60 * 60 * 1000;

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

/* ---------- FB Graph 客戶端（fetchImpl 可注入） ---------- */
export function createFbGraph({ token, pageId, version = "v25.0", fetchImpl = fetch }) {
  const base = `https://graph.facebook.com/${version}`;
  async function call(method, path, params = {}) {
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
      throw new GraphError(er.message || `HTTP ${res.status}`, { code: er.code, subcode: er.error_subcode, status: res.status, type: er.type });
    }
    return data;
  }
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

/* ---------- 單筆處理 ---------- */
function fbOf(post) { return post.fb || {}; }

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
    case "publishing": {
      const lockAt = parseTime(post.lock && post.lock.at);
      // 上一輪送出後未回寫：結果不明，不自動重送以免重複貼文
      return isFinite(lockAt) && now - lockAt < LOCK_STALE_MS ? "wait" : "uncertain";
    }
    default:
      return "noop"; // draft / published / failed / skipped
  }
}

/* queueState：仍需排程器處理 → pending；回到草稿 → draft；其餘（發布、失敗、略過）→ done。
   失敗項目由後台依 fb.state 篩出，人工按「重試」才會回到 pending。 */
const ACTIVE_FB = ["approved", "publishing", "scheduled", "cancel_requested"];
export function nextQueueState(post) {
  const fb = fbOf(post);
  if (fb.enabled && ACTIVE_FB.includes(fb.state)) return "pending";
  if (fb.enabled && (fb.state === "draft" || !fb.state)) return "draft";
  return "done";
}

/*
 * 處理一筆貼文。store 需提供：
 *   claim(id, now) → Promise<post|null>   以 transaction 取得鎖，失敗回 null
 *   update(id, patch) → Promise            合併寫入（支援 'fb.state' 這類路徑）
 */
export async function processPost(post, { store, graph, now = Date.now(), dryRun = false, log = () => {} }) {
  const action = planFb(post, now);
  const tag = `[${post.id}]`;
  if (action === "wait" || action === "noop") { log(`${tag} ${action}`); return { id: post.id, action }; }
  if (action === "skip") {
    const patched = { ...post, fb: { ...fbOf(post), state: "skipped" } };
    await store.update(post.id, { queueState: nextQueueState(patched), updatedAt: iso(now) });
    return { id: post.id, action };
  }
  if (dryRun) { log(`${tag} DRY-RUN 將執行：${action}`); return { id: post.id, action, dryRun: true }; }

  const claimed = await store.claim(post.id, now);
  if (!claimed) { log(`${tag} 已被其他執行者處理，略過`); return { id: post.id, action: "locked" }; }
  // 取得鎖後以最新內容重新判斷（避免拿到舊快照）。能取得鎖代表先前的鎖已失效，
  // 判斷時忽略鎖欄位：此時仍是 publishing 即為「上一輪送出後未回寫」→ uncertain。
  const fresh = claimed;
  const act = planFb({ ...fresh, lock: { by: null, at: null } }, now);
  const fb = fbOf(fresh);
  const done = (fbPatch, extra = {}) => {
    const nextFb = { ...fb, ...fbPatch };
    return store.update(fresh.id, {
      fb: nextFb,
      queueState: nextQueueState({ ...fresh, fb: nextFb }),
      lock: { by: null, at: null },
      updatedAt: iso(now),
      ...extra,
    });
  };

  try {
    if (act === "publish_now" || act === "schedule_native") {
      // 先標記 publishing（鎖已在 claim 時寫入），再呼叫 API
      await store.update(fresh.id, { fb: { ...fb, state: "publishing" }, updatedAt: iso(now) });
      const scheduleUnix = act === "schedule_native" ? Math.floor(parseTime(fresh.scheduledAt) / 1000) : null;
      const r = await graph.publish({ message: fb.caption || "", link: fb.link || "", imageUrl: fresh.imageUrl || "", scheduleUnix });
      if (act === "schedule_native") {
        await done({ state: "scheduled", postId: r.postId, photoId: r.photoId || null, error: null, nativeScheduledAt: iso(now) });
        log(`${tag} 已交給 Meta 原生排程 → ${r.postId}`);
      } else {
        await done({ state: "published", postId: r.postId, photoId: r.photoId || null, error: null, publishedAt: iso(now) });
        log(`${tag} 已發布 → ${r.postId}`);
      }
      return { id: fresh.id, action: act, postId: r.postId };
    }
    if (act === "reconcile") {
      const s = await graph.status(fb.postId);
      if (s.is_published) {
        await done({ state: "published", permalink: s.permalink_url || null, publishedAt: fb.publishedAt || iso(now) });
        log(`${tag} 原生排程已發出`);
        return { id: fresh.id, action: act, published: true };
      }
      await store.update(fresh.id, { lock: { by: null, at: null }, updatedAt: iso(now) });
      log(`${tag} 原生排程尚未發出，下輪再查`);
      return { id: fresh.id, action: act, published: false };
    }
    if (act === "cancel") {
      if (fb.postId) await graph.remove(fb.postId);
      await done({ state: "draft", postId: null, photoId: null, error: null }, { "review.approvedAt": null });
      log(`${tag} 已撤銷 Meta 端排程，退回草稿`);
      return { id: fresh.id, action: act };
    }
    if (act === "overdue") {
      await done({ state: "failed", error: "預定時間已逾期超過 24 小時，為避免發出過時內容未自動發布。請確認後重設時間再核准。" });
      return { id: fresh.id, action: act };
    }
    if (act === "uncertain") {
      await done({ state: "failed", error: "上一輪發布送出後未收到回應，結果不明。請先到粉專確認是否已發出，未發出再按「重試」。" });
      return { id: fresh.id, action: act };
    }
    await store.update(fresh.id, { lock: { by: null, at: null } });
    return { id: fresh.id, action: act };
  } catch (e) {
    const attempts = (fb.attempts || 0) + 1;
    const retry = isRetryable(e) && attempts < MAX_ATTEMPTS && act !== "cancel";
    const msg = (e && e.message) || String(e);
    // 取消失敗時維持 cancel_requested，下一輪再試；其餘依可否重試回到 approved 或 failed
    const state = act === "cancel" ? "cancel_requested" : retry ? "approved" : "failed";
    await done({ state, attempts, error: msg, errorCode: e.code ?? null });
    log(`${tag} 失敗（${attempts}/${MAX_ATTEMPTS}）：${msg}`);
    return { id: fresh.id, action: act, error: msg, auth: isAuthError(e), retry };
  }
}

/* 執行一輪：撈 pending → 逐筆處理 → 回傳摘要 */
export async function runOnce({ store, graph, now = Date.now(), dryRun = false, log = console.log }) {
  const posts = await store.listPending();
  const results = [];
  for (const p of posts) results.push(await processPost(p, { store, graph, now, dryRun, log }));
  return {
    total: posts.length,
    results,
    authFailed: results.some((r) => r.auth),
    failed: results.filter((r) => r.error && !r.retry).length,
  };
}
