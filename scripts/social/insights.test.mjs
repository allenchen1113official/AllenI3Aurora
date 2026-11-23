/* 社群成效同步測試：node --test scripts/social/insights.test.mjs（不連外部服務） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInsightsClients, channelsToSync, syncInsights, totalStats, mediaIdOf } from "./insights.mjs";

const T0 = Date.parse("2026-10-28T01:00:00Z");
const DAY = 24 * 3600 * 1000;

/* 依路徑回應的假 fetch；未列出的路徑回 Graph 錯誤 */
function routeFetch(routes) {
  const reqs = [];
  const f = async (url) => {
    reqs.push(url);
    const u = new URL(url);
    const key = u.pathname.replace(/^\/v[\d.]+\//, "") + (u.searchParams.get("metric") ? "?" + u.searchParams.get("metric") : "");
    const body = routes[key];
    if (body === undefined) return { ok: false, status: 400, json: async () => ({ error: { message: "(#100) unsupported " + key, code: 100 } }) };
    return { ok: true, status: 200, json: async () => body };
  };
  f.reqs = reqs;
  return f;
}

test("FB：心情＋留言＋分享為互動；觸及取第一個可用的指標", async () => {
  const f = routeFetch({
    "PG_1": { reactions: { summary: { total_count: 40 } }, comments: { summary: { total_count: 5 } }, shares: { count: 3 } },
    // post_impressions_unique 已汰換（回錯誤）→ 改用 post_media_view
    "PG_1/insights?post_media_view": { data: [{ name: "post_media_view", values: [{ value: 1200 }] }] },
  });
  const c = createInsightsClients({ metaToken: "T", fetchImpl: f });
  const r = await c.fb("PG_1");
  assert.deepEqual(r, { reach: 1200, likes: 40, comments: 5, shares: 3, engagement: 48 });
});

test("IG：讚＋留言＋分享＋收藏；不支援的指標略過", async () => {
  const f = routeFetch({
    "IGM1": { like_count: 80, comments_count: 6 },
    "IGM1/insights?reach": { data: [{ name: "reach", total_value: { value: 2300 } }] },
    "IGM1/insights?saved": { data: [{ name: "saved", values: [{ value: 9 }] }] },
  });
  const c = createInsightsClients({ metaToken: "T", fetchImpl: f });
  const r = await c.ig("IGM1");
  assert.equal(r.reach, 2300);
  assert.equal(r.shares, 0);
  assert.equal(r.engagement, 80 + 6 + 9);
});

test("Threads：views 為觸及，讚＋回覆＋轉發＋引用為互動", async () => {
  const f = routeFetch({
    "THM1/insights?views,likes,replies,reposts,quotes": { data: [
      { name: "views", values: [{ value: 900 }] }, { name: "likes", values: [{ value: 30 }] },
      { name: "replies", values: [{ value: 4 }] }, { name: "reposts", values: [{ value: 2 }] }, { name: "quotes", values: [{ value: 1 }] },
    ] },
  });
  const c = createInsightsClients({ threadsToken: "T", fetchImpl: f });
  const r = await c.th("THM1");
  assert.equal(f.reqs[0].startsWith("https://graph.threads.net/v1.0/THM1/insights?"), true);
  assert.deepEqual(r, { reach: 900, likes: 30, comments: 4, shares: 3, engagement: 37 });
});

test("只同步 30 天內已發布、有平台 ID 的頻道", () => {
  const p = {
    fb: { enabled: true, state: "published", postId: "PG_1", publishedAt: new Date(T0 - 2 * DAY).toISOString() },
    ig: { enabled: true, state: "failed", mediaId: null },
    th: { enabled: true, state: "published", mediaId: "THM1", publishedAt: new Date(T0 - 40 * DAY).toISOString() },
  };
  assert.deepEqual(channelsToSync(p, T0), ["fb"]);
  assert.equal(mediaIdOf(p, "fb"), "PG_1");
});

test("totalStats：觸及只加有值的頻道，全部沒有時為 null", () => {
  assert.deepEqual(totalStats({ fb: { reach: 100, engagement: 5 }, ig: { reach: null, engagement: 3 } }), { reach: 100, engagement: 8 });
  assert.deepEqual(totalStats({ th: { reach: null, engagement: 2 } }), { reach: null, engagement: 2 });
});

test("syncInsights：寫回 stats、保留其他頻道舊值、單一頻道失敗不影響其他", async () => {
  const pub = (d) => new Date(T0 - d * DAY).toISOString();
  const posts = [
    { id: "a", fb: { enabled: true, state: "published", postId: "PG_1", publishedAt: pub(1) },
      ig: { enabled: true, state: "published", mediaId: "IGM1", publishedAt: pub(1) },
      stats: { channels: { th: { reach: 7, engagement: 1 } } } },
    { id: "old", fb: { enabled: true, state: "published", postId: "PG_9", publishedAt: pub(60) } },
  ];
  const updates = [];
  const store = { listPublished: async () => posts, update: async (id, patch) => updates.push([id, patch]) };
  const clients = {
    fb: async () => ({ reach: 100, engagement: 10 }),
    ig: async () => { throw Object.assign(new Error("Unsupported get request"), { code: 100 }); },
  };
  const r = await syncInsights({ store, clients, now: T0, log: () => {} });
  assert.equal(r.updated, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].ch, "ig");
  const [id, patch] = updates[0];
  assert.equal(id, "a");
  assert.equal(patch.stats.channels.fb.reach, 100);
  assert.deepEqual(patch.stats.channels.th, { reach: 7, engagement: 1 }, "保留先前的 Threads 數字");
  assert.equal(patch.stats.reach, 107);
  assert.equal(patch.stats.engagement, 11);
});

test("syncInsights：DRY-RUN 不寫入；未設定平台的頻道略過", async () => {
  const posts = [{ id: "a", th: { enabled: true, state: "published", mediaId: "THM1", publishedAt: new Date(T0).toISOString() } }];
  const updates = [];
  const r = await syncInsights({ store: { listPublished: async () => posts, update: async (...a) => updates.push(a) }, clients: { fb: async () => ({}) }, now: T0, log: () => {} });
  assert.equal(r.updated, 0);
  const r2 = await syncInsights({ store: { listPublished: async () => posts, update: async (...a) => updates.push(a) }, clients: { th: async () => ({ reach: 1, engagement: 1 }) }, now: T0, dryRun: true, log: () => {} });
  assert.equal(r2.updated, 1);
  assert.equal(updates.length, 0);
});

test("FB：Token 無 pages_read_user_content 時，心情改用 insights post_reactions_by_type_total", async () => {
  const f = routeFetch({
    "PG_2/insights?post_reactions_by_type_total": { data: [{ name: "post_reactions_by_type_total", values: [{ value: { like: 12, love: 3 } }] }] },
    "PG_2/insights?post_impressions_unique": { data: [{ name: "post_impressions_unique", values: [{ value: 500 }] }] },
  });
  const c = createInsightsClients({ metaToken: "T", fetchImpl: f });
  const r = await c.fb("PG_2");
  assert.deepEqual(r, { reach: 500, likes: 15, comments: 0, shares: 0, engagement: 15 });
});

test("FB：欄位與 insights 全部取不到才丟錯", async () => {
  const c = createInsightsClients({ metaToken: "T", fetchImpl: routeFetch({}) });
  await assert.rejects(() => c.fb("PG_3"));
});

test("IG：有 igToken 時走 graph.instagram.com；只有讚／留言也算成功", async () => {
  const f = routeFetch({ "IGM2": { like_count: 7, comments_count: 2 } });
  const c = createInsightsClients({ metaToken: "PAGE", igToken: "IGT", fetchImpl: f });
  const r = await c.ig("IGM2");
  assert.ok(f.reqs[0].startsWith("https://graph.instagram.com/v25.0/IGM2?"));
  assert.ok(f.reqs[0].includes("access_token=IGT"));
  assert.equal(r.reach, null);
  assert.equal(r.engagement, 9);
});

test("syncInsights：平台權限不足後同一輪不再請求該平台，並回報 denied", async () => {
  const pub = new Date(T0 - DAY).toISOString();
  const posts = ["a", "b", "c"].map((id) => ({ id,
    fb: { enabled: true, state: "published", postId: "P" + id, publishedAt: pub },
    th: { enabled: true, state: "published", mediaId: "T" + id, publishedAt: pub } }));
  let thCalls = 0;
  const clients = {
    fb: async () => ({ reach: 1, engagement: 1 }),
    th: async () => { thCalls++; throw Object.assign(new Error("Application does not have permission for this action"), { code: 10 }); },
  };
  const r = await syncInsights({ store: { listPublished: async () => posts, update: async () => {} }, clients, now: T0, log: () => {} });
  assert.equal(thCalls, 1);
  assert.equal(r.updated, 3);
  assert.ok(r.denied.th);
});
