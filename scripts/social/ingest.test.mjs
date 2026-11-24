/* Claude 排程素材匯入：node --test scripts/social/ingest.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { taipeiDays, validateManifest, isAutoPublish, buildPost, planIngest, postSummary, docIdOf, topicInfo } from "./ingest-core.mjs";
import { nextQueueState, planPost } from "./core.mjs";

const folder = { topic: "txf-flash", ymd: "20261116" };
const goodManifest = () => ({
  version: 1, topic: "txf-flash", date: "2026-11-16", title: "今日關注動態｜台股台指期快訊 2026/11/16",
  autoPublish: true, verified: true, producedBy: "trig_x", producedAt: "2026-11-16T16:42:00+08:00",
  platforms: {
    fb: { caption: "fb.txt", images: ["a.png", "b.png", "c.png"] },
    ig: { caption: "ig.txt", images: ["a.png", "b.png", "c.png"] },
    threads: { caption: "threads.txt", images: ["a.png", "b.png", "c.png"] },
  },
});
const fileSet = (over = {}) => {
  const f = {
    "fb.txt": "今日關注動態｜台股台指期快訊 2026/11/16\n內文，非投資建議",
    "ig.txt": "今日關注動態｜台股台指期快訊 2026/11/16\n內文 #台指期 #台股",
    "threads.txt": "今日關注動態｜台股台指期快訊 2026/11/16\n短文",
    "a.png": "x", "b.png": "x", "c.png": "x", ...over,
  };
  return { has: (n) => n in f && f[n] !== undefined, text: (n) => f[n] };
};

test("taipeiDays：台北 07:00（UTC 前一天 23:00）仍算台北當天", () => {
  const d = taipeiDays(Date.parse("2026-11-15T23:00:00Z"), 1);
  assert.deepEqual(d.map((x) => x.ymd), ["20261116", "20261115"]);
  assert.equal(d[0].slash, "2026/11/16");
});

test("合格 manifest：三平台各三張圖、文案正確載入（threads → th）", () => {
  const v = validateManifest(goodManifest(), folder, fileSet());
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(Object.keys(v.channels), ["fb", "ig", "th"]);
  assert.equal(v.channels.th.images.length, 3);
  assert.match(v.channels.fb.caption, /^今日關注動態/);
});

test("不合格：日期不符、缺圖、缺文案日期、Threads 超過 500 字、IG 無圖", () => {
  const m = goodManifest();
  m.date = "2026-11-15";
  m.platforms.ig.images = [];
  m.platforms.fb.images.push("missing.png");
  const v = validateManifest(m, folder, fileSet({ "threads.txt": "2026/11/16 " + "字".repeat(510) }));
  assert.equal(v.ok, false);
  const all = v.errors.join("\n");
  assert.match(all, /date「2026-11-15」/);
  assert.match(all, /找不到圖片 missing\.png/);
  assert.match(all, /Instagram 貼文必須有圖片/);
  assert.match(all, /threads：文案 \d+ 字元，超過 500/);
});

test("不合格：文案未含當日日期、IG hashtag 超過 30、未知平台與主題", () => {
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
  const m = goodManifest();
  m.platforms.x = { caption: "x.txt" };
  const v = validateManifest(m, folder, fileSet({ "fb.txt": "沒有日期", "ig.txt": "2026/11/16 " + tags }));
  const all = v.errors.join("\n");
  assert.match(all, /fb：文案未包含當日日期/);
  assert.match(all, /hashtag 31 個/);
  assert.match(all, /不支援的平台「x」/);
  const v2 = validateManifest({ ...goodManifest(), topic: "unknown" }, { topic: "unknown", ymd: "20261116" }, fileSet());
  assert.match(v2.errors.join(), /未知的主題代碼/);
});

test("自動發布只限白名單主題且 autoPublish＋verified 皆為 true", () => {
  const allow = ["txf-flash"]; // 由 Repo Variable SOCIAL_AUTO_TOPICS 明確開放時
  assert.equal(isAutoPublish(goodManifest(), allow), true);
  assert.equal(isAutoPublish({ ...goodManifest(), verified: false }, allow), false);
  assert.equal(isAutoPublish({ ...goodManifest(), autoPublish: "true" }, allow), false);
  assert.equal(isAutoPublish({ ...goodManifest(), topic: "heatmap" }, allow), false);
  assert.equal(isAutoPublish(goodManifest(), []), false);
  // 預設（未設定 SOCIAL_AUTO_TOPICS）：全部人工審核，台指期快訊也不例外
  assert.equal(isAutoPublish(goodManifest()), false);
});

const urlOf = (img) => `https://raw.example/${img.replace(/\.png$/, ".jpg")}`;

test("自動發布貼文：三頻道 approved、queueState pending，排程器本輪就會送出", () => {
  const v = validateManifest(goodManifest(), folder, fileSet());
  const now = Date.parse("2026-11-16T08:50:00Z");
  const doc = buildPost(goodManifest(), folder, v.channels, { urlOf, auto: true, nowIso: new Date(now).toISOString() });
  assert.equal(doc.queueState, "pending");
  assert.equal(nextQueueState(doc), "pending");
  for (const c of ["fb", "ig", "th"]) {
    assert.equal(doc[c].state, "approved");
    assert.deepEqual(doc[c].imageUrls, ["https://raw.example/a.jpg", "https://raw.example/b.jpg", "https://raw.example/c.jpg"]);
  }
  assert.equal(doc.imageUrl, "https://raw.example/a.jpg");
  assert.equal(doc.yt.enabled, false);
  const plan = planPost({ id: "x", ...doc }, now, { graphs: { fb: {}, ig: {}, th: {} } });
  assert.deepEqual([plan.fb, plan.ig, plan.th], ["publish_now", "create", "create"]);
});

test("一般主題：草稿、不會被排程器處理；hub 以逐平台覆寫保留 IG／Threads 原文", () => {
  const m = { ...goodManifest(), topic: "heatmap", autoPublish: false };
  const f = { topic: "heatmap", ymd: "20261116" };
  const v = validateManifest(m, f, fileSet());
  const doc = buildPost(m, f, v.channels, { urlOf, auto: false, nowIso: "2026-11-16T12:00:00Z" });
  assert.equal(doc.queueState, "draft");
  assert.equal(nextQueueState(doc), "draft");
  assert.equal(doc.scheduledAt, "");
  assert.equal(doc.hub.body, doc.fb.caption);
  assert.equal(doc.hub.variants.th, doc.th.caption);
  assert.equal(doc.source.type, "claude-schedule");
  const plan = planPost({ id: "x", ...doc }, Date.now(), { graphs: { fb: {}, ig: {}, th: {} } });
  assert.deepEqual([plan.fb, plan.ig, plan.th], ["noop", "noop", "noop"]);
});

test("只發部分平台：未列出的頻道 enabled=false", () => {
  const m = goodManifest();
  delete m.platforms.ig;
  const v = validateManifest(m, folder, fileSet());
  const doc = buildPost(m, folder, v.channels, { urlOf, auto: true, nowIso: "2026-11-16T08:50:00Z" });
  assert.equal(doc.ig.enabled, false);
  assert.equal(doc.fb.enabled, true);
});

test("planIngest：新建、素材未變略過、已核准或發布不覆蓋、重產且仍是草稿可更新", () => {
  const m = goodManifest();
  assert.equal(planIngest(null, m).action, "create");
  const base = { source: { type: "claude-schedule", producedAt: m.producedAt }, fb: { enabled: true, state: "draft" } };
  assert.equal(planIngest(base, m).action, "skip");
  const newer = { ...m, producedAt: "2026-11-16T17:00:00+08:00" };
  assert.equal(planIngest(base, newer).action, "update");
  assert.equal(planIngest({ ...base, fb: { enabled: true, state: "published" } }, newer).action, "skip");
  assert.equal(planIngest({ ...base, ig: { enabled: true, state: "approved" } }, newer).action, "skip");
  assert.equal(planIngest({ ...base, fb: { enabled: true, state: "failed" } }, newer).action, "update");
  assert.equal(planIngest({ source: { type: "hub" } }, m).action, "skip");
});

test("文件 id 與狀態摘要", () => {
  assert.equal(docIdOf("txf-flash", "20261116"), "cs_txf-flash_20261116");
  const s = postSummary("cs_x", { source: { topic: "txf-flash" }, queueState: "done",
    fb: { enabled: true, state: "published", postId: "1_2" }, ig: { enabled: true, state: "published", permalink: "https://ig/p" }, th: { enabled: false } });
  assert.deepEqual(s.fb, { state: "published", url: "https://www.facebook.com/1_2", error: null });
  assert.equal(s.ig.url, "https://ig/p");
  assert.equal(s.th, null);
});

test("主題家族 stock-<代號>：個股交易診斷，同日多檔各自一筆、草稿待審、不可自動發布", () => {
  assert.equal(topicInfo("stock-6274").label, "個股交易診斷 6274");
  assert.equal(topicInfo("stock-00631L").label, "個股交易診斷 00631L");
  assert.equal(topicInfo("stock-abc"), null);
  assert.equal(topicInfo("stock-"), null);
  const f = { topic: "stock-6274", ymd: "20261116" };
  const m = { ...goodManifest(), topic: "stock-6274", title: "台燿 6274 交易診斷 2026/11/16", autoPublish: false, verified: true };
  const v = validateManifest(m, f, fileSet());
  assert.equal(v.ok, true, v.errors.join());
  assert.notEqual(docIdOf("stock-6274", "20261116"), docIdOf("stock-2330", "20261116"));
  assert.equal(isAutoPublish({ ...m, autoPublish: true }), false); // 預設白名單為空
  const doc = buildPost(m, f, v.channels, { urlOf: (x) => "https://x/" + x, auto: false, nowIso: "2026-11-16T10:00:00Z" });
  assert.equal(doc.queueState, "draft");
  assert.equal(doc.hub.category, "理財");
  assert.match(doc.note, /個股交易診斷 6274/);
  assert.equal(doc.source.manifestPath, "content/stock-6274/20261116/manifest.json");
});

test("manifest.link 帶入 FB 連結，非 https 會被擋下", () => {
  const folder = { topic: "yt-abc123", ymd: "20261124" };
  const files = { has: (n) => ["fb.txt", "ig.txt", "c.png"].includes(n), text: () => "標題 2026/11/24 #AI" };
  const m = { version: 1, topic: "yt-abc123", date: "2026-11-24", title: "T", link: "https://allenchen1113official.github.io/AllenI3Aurora/?yt=abc123#ytnotes",
    platforms: { fb: { caption: "fb.txt", images: ["c.png"] }, ig: { caption: "ig.txt", images: ["c.png"] } } };
  const v = validateManifest(m, folder, files);
  assert.equal(v.ok, true, v.errors.join("；"));
  const doc = buildPost(m, folder, v.channels, { urlOf: (x) => "https://x/" + x, auto: false, nowIso: "2026-11-24T03:00:00Z" });
  assert.equal(doc.fb.link, m.link);
  assert.equal(doc.ig.link, undefined);
  const bad = validateManifest({ ...m, link: "http://x" }, folder, files);
  assert.ok(bad.errors.some((e) => e.includes("link")));
  const none = buildPost({ ...m, link: undefined }, folder, v.channels, { urlOf: (x) => "https://x/" + x, auto: false, nowIso: "x" });
  assert.equal(none.fb.link, "");
});
