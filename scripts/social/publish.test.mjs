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

/* ---------- 第二階段：Instagram／Threads 容器頻道 ---------- */
import { planContainer, createIgGraph, createThreadsGraph, refreshThreadsToken, CONTAINER_LEAD_MS } from "./core.mjs";

function fakeContainerGraph(overrides = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    async create(a) { calls.push(["create", a]); if (overrides.create) return overrides.create(a); n++; return { id: `c${n}` }; },
    async status(id) { calls.push(["status", id]); return overrides.status ? overrides.status(id) : { status: "FINISHED" }; },
    async publish(id) { calls.push(["publish", id]); if (overrides.publish) return overrides.publish(id); return { id: "m_" + id }; },
    async permalink(id) { calls.push(["permalink", id]); return "https://ig/p/" + id; },
  };
}
const multi = (id, ch, extra = {}) => post(id, { enabled: false, state: "skipped" }, {
  imageUrl: "https://img/a.jpg", [ch]: { enabled: true, caption: "IG 內文", state: "approved", attempts: 0 }, ...extra,
});

test("IG 到期：建立容器 → FINISHED → 發布並取回 permalink", async () => {
  const store = memStore([multi("a", "ig")]);
  const ig = fakeContainerGraph();
  const s = await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.deepEqual(ig.calls.map((c) => c[0]), ["create", "status", "publish", "permalink"]);
  assert.equal(ig.calls[0][1].imageUrl, "https://img/a.jpg");
  assert.equal(d.ig.state, "published");
  assert.equal(d.ig.mediaId, "m_c1");
  assert.equal(d.ig.permalink, "https://ig/p/m_c1");
  assert.equal(d.queueState, "done");
  assert.equal(d.lock.by, null);
  assert.equal(s.failed, 0);
});

test("容器處理中 → processing，下一輪 FINISHED 才發布（不重建容器）", async () => {
  let st = "IN_PROGRESS";
  const store = memStore([multi("a", "ig")]);
  const ig = fakeContainerGraph({ status: () => ({ status: st }) });
  await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0, log: quiet });
  assert.equal(store.db.get("a").ig.state, "processing");
  assert.equal(store.db.get("a").queueState, "pending");
  st = "FINISHED";
  await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0 + 10 * MIN, log: quiet });
  assert.equal(ig.calls.filter((c) => c[0] === "create").length, 1);
  assert.equal(store.db.get("a").ig.state, "published");
});

test("容器狀態 ERROR → failed 並附原因", async () => {
  const store = memStore([multi("a", "ig")]);
  const ig = fakeContainerGraph({ status: () => ({ status: "ERROR", error: "Unsupported image format" }) });
  await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.ig.state, "failed");
  assert.match(d.ig.error, /Unsupported image format/);
  assert.equal(ig.calls.filter((c) => c[0] === "publish").length, 0);
});

test("容器頻道未到期（超過 5 分鐘）→ 等待，不呼叫 API", async () => {
  const store = memStore([multi("a", "th", { scheduledAt: new Date(T0 + CONTAINER_LEAD_MS + MIN).toISOString() })]);
  const th = fakeContainerGraph();
  await runOnce({ store, graph: fakeGraph(), graphs: { th }, now: T0, log: quiet });
  assert.equal(th.calls.length, 0);
  assert.equal(store.db.get("a").th.state, "approved");
});

test("FB＋IG＋Threads 同一筆：各自發布，FB 交原生排程時 IG/TH 等到期", async () => {
  const due = T0 + 2 * HOUR;
  const p = post("a", {}, { scheduledAt: new Date(due).toISOString(), imageUrl: "https://img/a.jpg",
    ig: { enabled: true, caption: "ig", state: "approved" }, th: { enabled: true, caption: "th", state: "approved" } });
  const store = memStore([p]);
  const fb = fakeGraph(), ig = fakeContainerGraph(), th = fakeContainerGraph();
  await runOnce({ store, graph: fb, graphs: { ig, th }, now: T0, log: quiet });
  let d = store.db.get("a");
  assert.equal(d.fb.state, "scheduled");
  assert.equal(d.ig.state, "approved");
  assert.equal(ig.calls.length + th.calls.length, 0);
  await runOnce({ store, graph: fb, graphs: { ig, th }, now: due + MIN, log: quiet });
  d = store.db.get("a");
  assert.equal(d.fb.state, "published");
  assert.equal(d.ig.state, "published");
  assert.equal(d.th.state, "published");
  assert.equal(d.queueState, "done");
});

test("一個頻道失敗不影響其他頻道", async () => {
  const p = post("a", {}, { imageUrl: "https://img/a.jpg", ig: { enabled: true, caption: "ig", state: "approved" } });
  const store = memStore([p]);
  const ig = fakeContainerGraph({ create: () => { throw new GraphError("Invalid parameter", { code: 100, status: 400 }); } });
  const s = await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.state, "published");
  assert.equal(d.ig.state, "failed");
  assert.equal(d.queueState, "done");
  assert.equal(s.failed, 1);
});

test("容器建立遇暫時性錯誤：維持 approved 重試，第 3 次才 failed", async () => {
  const store = memStore([multi("a", "th")]);
  const th = fakeContainerGraph({ create: () => { throw new GraphError("Service unavailable", { status: 503 }); } });
  for (let i = 0; i < 3; i++) await runOnce({ store, graph: fakeGraph(), graphs: { th }, now: T0 + i * 10 * MIN, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.th.attempts, 3);
  assert.equal(d.th.state, "failed");
});

test("發布請求網路中斷 → 維持 publishing；鎖過期後查到 PUBLISHED 即標記已發布、不重送", async () => {
  const store = memStore([multi("a", "ig")]);
  let st = "FINISHED";
  const ig = fakeContainerGraph({ status: () => ({ status: st }), publish: () => { throw new Error("網路錯誤：socket hang up"); } });
  await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0, log: quiet });
  let d = store.db.get("a");
  assert.equal(d.ig.state, "publishing");
  assert.equal(d.queueState, "pending");
  // 模擬上一輪鎖仍留著（runner 中斷）
  store.db.get("a").lock = { by: "old", at: new Date(T0).toISOString() };
  st = "PUBLISHED";
  await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0 + 20 * MIN, log: quiet });
  d = store.db.get("a");
  assert.equal(d.ig.state, "published");
  assert.equal(ig.calls.filter((c) => c[0] === "publish").length, 1, "已發出的容器不可再送");
});

test("recover 時容器仍是 FINISHED（未發出）→ 安全送出", async () => {
  const store = memStore([multi("a", "ig", { lock: { by: "old", at: new Date(T0 - 20 * MIN).toISOString() } })]);
  store.db.get("a").ig = { enabled: true, caption: "x", state: "publishing", containerId: "c9" };
  const ig = fakeContainerGraph();
  await runOnce({ store, graph: fakeGraph(), graphs: { ig }, now: T0, log: quiet });
  assert.equal(store.db.get("a").ig.state, "published");
  assert.deepEqual(ig.calls.find((c) => c[0] === "publish"), ["publish", "c9"]);
});

test("頻道未設定（缺 Secrets）→ failed 並說明，不影響 FB", async () => {
  const p = post("a", {}, { th: { enabled: true, caption: "t", state: "approved" } });
  const store = memStore([p]);
  await runOnce({ store, graph: fakeGraph(), graphs: {}, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.fb.state, "published");
  assert.equal(d.th.state, "failed");
  assert.match(d.th.error, /尚未設定 Threads/);
});

test("頻道 Token 檢查失敗（paused）→ 暫停不動，保持 pending", async () => {
  const store = memStore([multi("a", "th")]);
  const th = fakeContainerGraph();
  await runOnce({ store, graph: fakeGraph(), graphs: { th }, paused: ["th"], now: T0, log: quiet });
  assert.equal(th.calls.length, 0);
  assert.equal(store.db.get("a").th.state, "approved");
  assert.equal(store.db.get("a").queueState, "pending");
});

test("容器頻道取消請求 → 退回草稿", async () => {
  const store = memStore([multi("a", "ig")]);
  store.db.get("a").ig = { enabled: true, state: "cancel_requested", containerId: "c1" };
  await runOnce({ store, graph: fakeGraph(), graphs: { ig: fakeContainerGraph() }, now: T0, log: quiet });
  const d = store.db.get("a");
  assert.equal(d.ig.state, "draft");
  assert.equal(d.ig.containerId, null);
  assert.equal(d.queueState, "draft");
});

test("容器 Token 失效（190）→ 摘要 authChannels 指出頻道", async () => {
  const store = memStore([multi("a", "th")]);
  const th = fakeContainerGraph({ create: () => { throw new GraphError("Session has expired", { code: 190, status: 400 }); } });
  const s = await runOnce({ store, graph: fakeGraph(), graphs: { th }, now: T0, log: quiet });
  assert.deepEqual(s.authChannels, ["th"]);
  assert.equal(store.db.get("a").th.state, "failed");
});

test("nextQueueState：多頻道", () => {
  assert.equal(nextQueueState({ fb: { enabled: true, state: "published" }, ig: { enabled: true, state: "processing" } }), "pending");
  assert.equal(nextQueueState({ fb: { enabled: true, state: "draft" }, th: { enabled: true, state: "draft" } }), "draft");
  assert.equal(nextQueueState({ fb: { enabled: true, state: "published" }, ig: { enabled: true, state: "failed" } }), "done");
  assert.equal(nextQueueState({ ig: { enabled: true, state: "approved" } }), "pending");
  assert.equal(planContainer({ ig: { enabled: true, state: "processing" } }, "ig", T0), "check");
});

test("IG Graph：建立容器與發布參數正確", async () => {
  const f = fakeFetch({ id: "C1" });
  const g = createIgGraph({ token: "TKN", igUserId: "IGU", fetchImpl: f });
  await g.create({ text: "說明", imageUrl: "https://img/a.jpg" });
  await g.publish("C1");
  assert.equal(f.reqs[0].url, "https://graph.facebook.com/v25.0/IGU/media");
  assert.deepEqual([f.reqs[0].body.image_url, f.reqs[0].body.caption], ["https://img/a.jpg", "說明"]);
  assert.equal(f.reqs[1].url, "https://graph.facebook.com/v25.0/IGU/media_publish");
  assert.equal(f.reqs[1].body.creation_id, "C1");
});

test("Threads Graph：純文字用 TEXT、有圖用 IMAGE；狀態大寫正規化", async () => {
  const f = fakeFetch({ id: "T1", status: "finished" });
  const g = createThreadsGraph({ token: "TKN", userId: "TU", fetchImpl: f });
  await g.create({ text: "短文" });
  await g.create({ text: "圖文", imageUrl: "https://img/a.jpg" });
  const s = await g.status("T1");
  assert.equal(f.reqs[0].url, "https://graph.threads.net/v1.0/TU/threads");
  assert.equal(f.reqs[0].body.media_type, "TEXT");
  assert.equal(f.reqs[0].body.image_url, undefined);
  assert.equal(f.reqs[1].body.media_type, "IMAGE");
  assert.equal(s.status, "FINISHED");
});

test("Threads Token 續期：回傳新 Token 與到期時間", async () => {
  const f = fakeFetch({ access_token: "NEW", token_type: "bearer", expires_in: 5184000 });
  const r = await refreshThreadsToken({ token: "OLD", fetchImpl: f, now: T0 });
  assert.match(f.reqs[0].url, /^https:\/\/graph\.threads\.net\/refresh_access_token\?grant_type=th_refresh_token&access_token=OLD$/);
  assert.equal(r.token, "NEW");
  assert.equal(r.expiresAt, new Date(T0 + 60 * DAY).toISOString());
});
