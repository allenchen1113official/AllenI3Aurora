/* 社群發文排程器行為測試：node --test scripts/social/
   記憶體 store（含 claim 鎖語意）＋假 Graph，不連任何外部服務。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnce, processPost, planFb, nextQueueState, createFbGraph, GraphError, LOCK_STALE_MS } from "./core.mjs";

const T0 = Date.parse("2026-10-15T01:00:00Z"); // 台北 09:00
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function setPath(obj, path, val) {
  const ks = path.split("."); let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] = { ...(o[k] || {}) };
  o[ks.at(-1)] = val;
}
function memStore(docs) {
  const db = new Map(docs.map((d) => [d.id, structuredClone(d)]));
  return {
    db,
    async listPending() { return [...db.values()].filter((d) => d.queueState === "pending").map((d) => structuredClone(d)); },
    async claim(id, now) {
      const d = db.get(id);
      if (!d || d.queueState !== "pending") return null;
      const at = Date.parse((d.lock && d.lock.at) || "");
      if (d.lock && d.lock.by && isFinite(at) && now - at < LOCK_STALE_MS) return null;
      d.lock = { by: "test", at: new Date(now).toISOString() };
      return structuredClone(d);
    },
    async update(id, patch) { const d = db.get(id); for (const [k, v] of Object.entries(patch)) setPath(d, k, v); },
  };
}
function fakeGraph(overrides = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async publish(a) { calls.push(["publish", a]); if (overrides.publish) return overrides.publish(a); n++; return { postId: `page_${n}` }; },
    async remove(id) { calls.push(["remove", id]); if (overrides.remove) return overrides.remove(id); return { success: true }; },
    async status(id) { calls.push(["status", id]); return overrides.status ? overrides.status(id) : { is_published: true, permalink_url: "https://fb.com/p/" + id }; },
  };
}
const post = (id, fb, extra = {}) => ({
  id, queueState: "pending", scheduledAt: new Date(T0).toISOString(), imageUrl: "", lock: { by: null, at: null },
  fb: { enabled: true, caption: "測試貼文", link: "https://example.com/x", state: "approved", attempts: 0, ...fb }, ...extra,
});
const quiet = () => {};

test("到期貼文立即發布，回寫 postId 且 queueState=done", async () => {
  const store = memStore([post("a", {})]);
  const g = fakeGraph();
  const s = await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(s.total, 1);
  const d = store.db.get("a");
  assert.equal(d.fb.state, "published");
  assert.equal(d.fb.postId, "page_1");
  assert.equal(d.queueState, "done");
  assert.equal(d.lock.by, null);
  assert.equal(g.calls[0][1].scheduleUnix, null);
});

test("同一批連跑兩次只發一次（冪等）", async () => {
  const store = memStore([post("a", {})]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  await runOnce({ store, graph: g, now: T0 + 10 * MIN, log: quiet });
  assert.equal(g.calls.filter((c) => c[0] === "publish").length, 1);
});

test("未來 2 小時的貼文交給 Meta 原生排程，帶正確 Unix 秒數", async () => {
  const due = T0 + 2 * HOUR;
  const store = memStore([post("a", {}, { scheduledAt: new Date(due).toISOString() })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.state, "scheduled");
  assert.equal(d.queueState, "pending", "原生排程後仍需對帳，保留 pending");
  assert.equal(g.calls[0][1].scheduleUnix, Math.floor(due / 1000));
});

test("15 分鐘內到期（低於原生排程下限）直接立即發布", async () => {
  const store = memStore([post("a", {}, { scheduledAt: new Date(T0 + 15 * MIN).toISOString() })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(store.db.get("a").fb.state, "published");
});

test("超過 29 天的貼文先等待，不呼叫 API", async () => {
  const store = memStore([post("a", {}, { scheduledAt: new Date(T0 + 40 * DAY).toISOString() })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(g.calls.length, 0);
  assert.equal(store.db.get("a").fb.state, "approved");
});

test("原生排程到期後對帳：已發出 → published + permalink", async () => {
  const store = memStore([post("a", { state: "scheduled", postId: "p9" })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0 + 5 * MIN, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.state, "published");
  assert.equal(d.fb.permalink, "https://fb.com/p/p9");
  assert.equal(d.queueState, "done");
});

test("原生排程尚未發出 → 保持 scheduled 並釋放鎖", async () => {
  const store = memStore([post("a", { state: "scheduled", postId: "p9" })]);
  const g = fakeGraph({ status: () => ({ is_published: false }) });
  await runOnce({ store, graph: g, now: T0 + 5 * MIN, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.state, "scheduled");
  assert.equal(d.lock.by, null);
});

test("取消原生排程：刪除 Meta 端貼文並退回草稿", async () => {
  const store = memStore([post("a", { state: "cancel_requested", postId: "p9" })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.deepEqual(g.calls[0], ["remove", "p9"]);
  assert.equal(d.fb.state, "draft");
  assert.equal(d.fb.postId, null);
  assert.equal(d.queueState, "draft");
});

test("取消失敗時維持 cancel_requested，下一輪重試", async () => {
  const store = memStore([post("a", { state: "cancel_requested", postId: "p9" })]);
  const g = fakeGraph({ remove: () => { throw new GraphError("boom", { status: 500 }); } });
  await runOnce({ store, graph: g, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.state, "cancel_requested");
  assert.equal(d.queueState, "pending");
});

test("暫時性錯誤重試，第 3 次仍失敗才標記 failed", async () => {
  const store = memStore([post("a", {})]);
  const g = fakeGraph({ publish: () => { throw new GraphError("Rate limit", { code: 4, status: 400 }); } });
  for (let i = 0; i < 3; i++) await runOnce({ store, graph: g, now: T0 + i * 10 * MIN, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.attempts, 3);
  assert.equal(d.fb.state, "failed");
  assert.equal(d.queueState, "done");
  assert.equal(g.calls.length, 3);
});

test("Token 過期（190）不重試，摘要標記 authFailed", async () => {
  const store = memStore([post("a", {})]);
  const g = fakeGraph({ publish: () => { throw new GraphError("Session has expired", { code: 190, status: 400 }); } });
  const s = await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(s.authFailed, true);
  assert.equal(store.db.get("a").fb.state, "failed");
});

test("送出後回寫失敗（崩潰）→ 下一輪標記結果不明，不重送", async () => {
  // 模擬：上一輪已把狀態改為 publishing 並送出，但未回寫結果
  const store = memStore([post("a", { state: "publishing" }, { lock: { by: "old", at: new Date(T0 - 20 * MIN).toISOString() } })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(g.calls.length, 0, "結果不明時不可自動重送");
  assert.equal(d.fb.state, "failed");
  assert.match(d.fb.error, /結果不明/);
});

test("publishing 且鎖仍新鮮 → 等待", () => {
  assert.equal(planFb(post("a", { state: "publishing" }, { lock: { by: "x", at: new Date(T0 - 2 * MIN).toISOString() } }), T0), "wait");
});

test("另一個執行者持有鎖時略過，不呼叫 API", async () => {
  const store = memStore([post("a", {}, { lock: { by: "other", at: new Date(T0 - MIN).toISOString() } })]);
  const g = fakeGraph();
  const s = await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(s.results[0].action, "locked");
  assert.equal(g.calls.length, 0);
});

test("兩個執行者同時跑：只有一個取得鎖", async () => {
  const store = memStore([post("a", {})]);
  const g = fakeGraph();
  const snap = await store.listPending();
  const [r1, r2] = await Promise.all([
    processPost(snap[0], { store, graph: g, now: T0, log: quiet }),
    processPost(snap[0], { store, graph: g, now: T0, log: quiet }),
  ]);
  assert.equal(g.calls.filter((c) => c[0] === "publish").length, 1);
  assert.ok([r1.action, r2.action].includes("locked"));
});

test("逾期超過 24 小時不自動發布", async () => {
  const store = memStore([post("a", {}, { scheduledAt: new Date(T0 - 2 * DAY).toISOString() })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(g.calls.length, 0);
  assert.equal(store.db.get("a").fb.state, "failed");
});

test("FB 未啟用 → skipped 並 done", async () => {
  const store = memStore([post("a", { enabled: false })]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, log: quiet });
  assert.equal(store.db.get("a").queueState, "done");
  assert.equal(g.calls.length, 0);
});

test("DRY-RUN 不呼叫 API、不改資料", async () => {
  const store = memStore([post("a", {})]);
  const g = fakeGraph();
  await runOnce({ store, graph: g, now: T0, dryRun: true, log: quiet });
  assert.equal(g.calls.length, 0);
  assert.equal(store.db.get("a").fb.state, "approved");
});

test("nextQueueState 對應表", () => {
  const q = (state, enabled = true) => nextQueueState({ fb: { enabled, state } });
  assert.equal(q("approved"), "pending");
  assert.equal(q("scheduled"), "pending");
  assert.equal(q("draft"), "draft");
  assert.equal(q("published"), "done");
  assert.equal(q("failed"), "done");
  assert.equal(q("approved", false), "done");
});

/* ---------- Graph 客戶端參數組裝 ---------- */
function fakeFetch(resp = { id: "1_2" }) {
  const reqs = [];
  const f = async (url, init = {}) => {
    reqs.push({ url, method: init.method, body: init.body ? Object.fromEntries(init.body) : null });
    return { ok: !resp.error, status: resp.error ? 400 : 200, json: async () => resp };
  };
  f.reqs = reqs;
  return f;
}

test("Graph：有圖走 /photos，連結併入 caption，原生排程參數正確", async () => {
  const f = fakeFetch({ id: "photo1", post_id: "page_post1" });
  const g = createFbGraph({ token: "TKN", pageId: "PG", version: "v25.0", fetchImpl: f });
  const r = await g.publish({ message: "內文", link: "https://x.y/z", imageUrl: "https://img/a.png", scheduleUnix: 1800000000 });
  const q = f.reqs[0];
  assert.equal(q.url, "https://graph.facebook.com/v25.0/PG/photos");
  assert.equal(q.body.caption, "內文\n\nhttps://x.y/z");
  assert.equal(q.body.published, "false");
  assert.equal(q.body.scheduled_publish_time, "1800000000");
  assert.equal(q.body.access_token, "TKN");
  assert.equal(r.postId, "page_post1");
});

test("Graph：無圖走 /feed 並帶 link；立即發布不帶 published 參數", async () => {
  const f = fakeFetch({ id: "PG_9" });
  const g = createFbGraph({ token: "TKN", pageId: "PG", fetchImpl: f });
  await g.publish({ message: "內文", link: "https://x.y/z", imageUrl: "" });
  const q = f.reqs[0];
  assert.match(q.url, /\/PG\/feed$/);
  assert.equal(q.body.link, "https://x.y/z");
  assert.equal(q.body.published, undefined);
});

test("Graph：錯誤回應轉成 GraphError 並保留 code", async () => {
  const f = fakeFetch({ error: { message: "Invalid OAuth access token", code: 190 } });
  const g = createFbGraph({ token: "T", pageId: "PG", fetchImpl: f });
  await assert.rejects(() => g.checkToken(), (e) => e instanceof GraphError && e.code === 190);
});
