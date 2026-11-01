/* node --test scripts/youtube/youtube.test.mjs
   YouTube 串接行為測試：純函式、上傳狀態機（記憶體假 store／yt／media）、API 回應解析。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDuration, fmtDuration, fmtCount, ytId, splitTags, publishPlan, buildMetadata, validateJob, appendHistory, statsRow,
  buildSnapshot, toVideo, channelSnapshot, planJob, processJob, runQueue, YtError, isAuthError, isQuotaError, CHUNK_BYTES,
  taipeiDate, LIMIT,
} from "./core.mjs";
import { parseUploadResponse, getAccessToken, driveIdFrom } from "./client.mjs";

const T0 = Date.parse("2026-11-01T02:00:00Z"); // 台北 10:00
const MB = 1024 * 1024;

/* ---------- 純函式 ---------- */
test("ISO 8601 長度解析與格式化", () => {
  assert.equal(parseDuration("PT18M"), 1080);
  assert.equal(parseDuration("PT1H2M3S"), 3723);
  assert.equal(parseDuration("P1DT1S"), 86401);
  assert.equal(parseDuration("garbage"), 0);
  assert.equal(fmtDuration(1080), "18:00");
  assert.equal(fmtDuration(3723), "1:02:03");
});

test("數字縮寫與影片 ID 解析", () => {
  assert.equal(fmtCount(987), "987");
  assert.equal(fmtCount(12345), "1.2萬");
  assert.equal(fmtCount(250000), "25萬");
  assert.equal(ytId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "dQw4w9WgXcQ");
  assert.equal(ytId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(ytId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(ytId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(ytId("not a video"), "");
});

test("台北日期：UTC 23:30 已是台北隔天", () => {
  assert.equal(taipeiDate(Date.parse("2026-10-31T23:30:00Z")), "2026-11-01");
});

test("標籤：去重、移除角括號、總長不超過 500（含空白者加計引號）", () => {
  assert.deepEqual(splitTags("冰島, 冰島 ,<Ring Road>,，極光"), ["冰島", "Ring Road", "極光"]);
  const many = Array.from({ length: 200 }, (_, i) => "tag" + i).join(",");
  const out = splitTags(many);
  const cost = out.reduce((s, t, i) => s + t.length + (i ? 1 : 0), 0);
  assert.ok(cost <= LIMIT.tags && out.length > 50);
});

test("公開方式：15 分鐘後的預定時間交給 YouTube publishAt，否則照指定", () => {
  assert.deepEqual(publishPlan({ scheduledAt: new Date(T0 + 3600e3).toISOString(), privacy: "public" }, T0),
    { privacyStatus: "private", publishAt: new Date(T0 + 3600e3).toISOString() });
  assert.deepEqual(publishPlan({ scheduledAt: new Date(T0 + 5 * 60e3).toISOString(), privacy: "unlisted" }, T0), { privacyStatus: "unlisted", publishAt: null });
  assert.deepEqual(publishPlan({ scheduledAt: "", privacy: "weird" }, T0), { privacyStatus: "public", publishAt: null });
  const m = buildMetadata({ title: "<EP01> 冰島", description: "a<b>c", tags: "x,y", scheduledAt: "" }, T0);
  assert.equal(m.snippet.title, "EP01 冰島");
  assert.equal(m.snippet.description, "abc");
  assert.equal(m.snippet.categoryId, "19");
  assert.equal(m.status.selfDeclaredMadeForKids, false);
  assert.ok(!("publishAt" in m.status));
});

test("核准前檢查", () => {
  assert.deepEqual(validateJob({ title: "OK", drive: { file: "a.mp4" } }), []);
  assert.ok(validateJob({ title: "", drive: {} }).length >= 2);
  assert.ok(validateJob({ title: "x".repeat(101), drive: { file: "a" } }).some((e) => /100/.test(e)));
  assert.deepEqual(validateJob({ title: "已上傳過", videoId: "dQw4w9WgXcQ" }), []); // 已有影片不需 Drive 檔
});

test("走勢：同一台北日覆寫；統計卡顯示 7 天增減", () => {
  let h = [];
  for (let d = 1; d <= 9; d++) h = appendHistory(h, `2026-10-${String(d).padStart(2, "0")}`, { subscribers: 100 + d * 10, views: 1000 });
  h = appendHistory(h, "2026-10-09", { subscribers: 200, views: 1000 }); // 同日覆寫
  assert.equal(h.length, 9);
  assert.equal(h[h.length - 1].subscribers, 200);
  const row = statsRow({ subscribers: 200, views: 12345, videos: 7, url: "https://www.youtube.com/@x" }, h, "2026-10-09");
  assert.equal(row.value, "200");
  assert.match(row.delta, /^\+80（7 天）/); // 10-02 的 120 → 200
  assert.equal(row.data.length, 8);
  const hidden = statsRow({ subscribers: null, views: 5, videos: 1, url: "" }, [], "2026-10-09");
  assert.equal(hidden.value, "隱藏");
});

test("快照只列公開影片，依時間新→舊", () => {
  const v = (id, at, privacy = "public", views = 1) => ({ id, publishedAt: at, privacy, views, isShort: false });
  const s = buildSnapshot({ channel: { id: "c" }, videos: [v("a", "2026-01-01"), v("b", "2026-03-01"), v("p", "2026-04-01", "private")], history: [], now: T0 });
  assert.deepEqual(s.latest.map((x) => x.id), ["b", "a"]);
  assert.equal(s.date, "2026.11.01");
});

test("API 物件轉換", () => {
  const v = toVideo({ id: "dQw4w9WgXcQ", snippet: { title: "t", publishedAt: "2026-10-01T00:00:00Z", thumbnails: {} }, contentDetails: { duration: "PT59S" }, statistics: { viewCount: "12" }, status: { privacyStatus: "public" } });
  assert.equal(v.isShort, true); assert.equal(v.views, 12); assert.match(v.thumb, /i\.ytimg\.com/);
  const c = channelSnapshot({ id: "UC1", snippet: { title: "艾倫", customUrl: "@allen" }, statistics: { subscriberCount: "50", viewCount: "9", videoCount: "3" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } });
  assert.equal(c.url, "https://www.youtube.com/@allen"); assert.equal(c.uploadsPlaylist, "UU1"); assert.equal(c.subscribers, 50);
});

/* ---------- 上傳狀態機 ---------- */
function memStore(jobs) {
  const db = new Map(jobs.map((j) => [j.id, structuredClone(j)]));
  const links = [];
  return {
    db, links,
    async listActive() { return [...db.values()].filter((j) => ["approved", "uploading", "processing", "scheduled", "cancel_requested"].includes(j.state)).map((j) => structuredClone(j)); },
    async claim(id, now) { const j = db.get(id); if (j.lock && j.lock.by && now - Date.parse(j.lock.at) < 90 * 60e3) return null; j.lock = { by: "test", at: new Date(now).toISOString() }; return structuredClone(j); },
    async update(id, patch) { Object.assign(db.get(id), structuredClone(patch)); },
    async linkSource(job, info) { links.push({ id: job.id, ...info }); },
  };
}
function fakeYt({ total, failAt = -1, alreadyDone = false, uploadStatus = "processed", publishAt = null, privacy = "public" } = {}) {
  const calls = [];
  let received = 0;
  const video = () => ({ id: "VID00000001", status: { uploadStatus: "uploaded", privacyStatus: publishAt ? "private" : privacy, ...(publishAt ? { publishAt } : {}) } });
  return {
    calls,
    async startUpload(meta, size, mime) { calls.push(["start", meta, size, mime]); return "https://upload.example/session1"; },
    async putChunk(url, buf, start, end, t) {
      calls.push(["put", start, end]);
      if (start === failAt) { failAt = -1; throw new Error("上傳中斷：ECONNRESET"); }
      received = end;
      return end >= t ? { video: video() } : { next: end };
    },
    async queryUpload(url, t) { calls.push(["query"]); return alreadyDone ? { video: video() } : { next: received }; },
    async getVideo(id) { calls.push(["get", id]); return { id, status: { uploadStatus, privacyStatus: publishAt ? "private" : privacy, ...(publishAt ? { publishAt } : {}) } }; },
    async updateVideo(id, res, part) { calls.push(["update", id, res, part]); return {}; },
    async setThumbnail(id) { calls.push(["thumb", id]); },
    async insertCaption(id, srt, lang) { calls.push(["caption", id, lang]); },
  };
}
const fakeMedia = (size) => ({
  prepared: 0,
  async prepare() { this.prepared++; return { size, name: "EP01.mp4", mime: "video/mp4", read: async () => Buffer.alloc(0), cleanup: async () => {} }; },
  async thumbnail() { return { data: Buffer.from("jpg"), mime: "image/jpeg" }; },
});
const job = (over = {}) => ({ id: "j1", title: "EP01 冰島", description: "d", tags: "a,b", privacy: "public", scheduledAt: "",
  drive: { folder: "2026冰島旅行/YouTube製作包/EP01", file: "EP01.mp4", thumbnail: "EP01_縮圖.jpg" },
  captions: { srt: "1\n00:00:01,000 --> 00:00:02,000\n嗨\n" }, source: { type: "vlog", episodeId: "iceland2026-ep01" },
  state: "approved", attempts: 0, lock: { by: null, at: null }, ...over });

test("狀態規劃", () => {
  assert.equal(planJob(job(), T0), "upload");
  assert.equal(planJob(job({ videoId: "x" }), T0), "update");
  assert.equal(planJob(job({ scheduledAt: new Date(T0 - 25 * 3600e3).toISOString() }), T0), "overdue");
  assert.equal(planJob(job({ state: "uploading", lock: { by: "x", at: new Date(T0 - 60e3).toISOString() } }), T0), "wait");
  assert.equal(planJob(job({ state: "uploading" }), T0), "resume");
  assert.equal(planJob(job({ state: "scheduled", publishAt: new Date(T0 + 60e3).toISOString() }), T0), "wait");
  assert.equal(planJob(job({ state: "scheduled", publishAt: new Date(T0 - 60e3).toISOString() }), T0), "verify");
  assert.equal(planJob(job({ state: "published" }), T0), "noop");
});

test("完整上傳：分段送出 → 處理完成 → 縮圖＋字幕 → 交給 YouTube 排程公開 → 回寫 Vlog", async () => {
  const size = 2 * CHUNK_BYTES + 5 * MB;
  const due = new Date(T0 + 2 * 3600e3).toISOString();
  const store = memStore([job({ scheduledAt: due })]);
  const yt = fakeYt({ total: size, publishAt: due });
  const r = await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(size), now: T0 });
  const j = store.db.get("j1");
  assert.equal(r.error, undefined);
  assert.equal(j.state, "scheduled");
  assert.equal(j.videoId, "VID00000001");
  assert.equal(j.publishAt, due);
  assert.equal(j.uploadUrl, null);
  assert.deepEqual(j.extras, { thumbnail: "done", captions: "done" });
  assert.equal(j.lock.by, null);
  const start = yt.calls.find((c) => c[0] === "start");
  assert.equal(start[1].status.privacyStatus, "private");
  assert.equal(start[1].status.publishAt, due);
  assert.equal(yt.calls.filter((c) => c[0] === "put").length, 3);
  assert.deepEqual(store.links, [{ id: "j1", videoId: "VID00000001", live: false }]);
});

test("上傳中斷：保留 session 與進度，下一輪從斷點續傳，不會重新開新影片", async () => {
  const size = 2 * CHUNK_BYTES + MB;
  const store = memStore([job()]);
  const yt = fakeYt({ total: size, failAt: CHUNK_BYTES });
  const r1 = await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(size), now: T0 });
  assert.equal(r1.retry, true);
  let j = store.db.get("j1");
  assert.equal(j.state, "uploading");
  assert.equal(j.uploadUrl, "https://upload.example/session1");
  assert.equal(j.uploadedBytes, CHUNK_BYTES);
  assert.equal(j.attempts, 1);
  const r2 = await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(size), now: T0 + 15 * 60e3 });
  j = store.db.get("j1");
  assert.equal(r2.action, "resume");
  assert.equal(j.state, "published");
  assert.equal(yt.calls.filter((c) => c[0] === "start").length, 1, "只能開一次上傳 session");
  const puts = yt.calls.filter((c) => c[0] === "put").map((c) => c[1]);
  assert.deepEqual(puts, [0, CHUNK_BYTES, CHUNK_BYTES, 2 * CHUNK_BYTES]); // 第二輪從斷點開始
  assert.deepEqual(store.links.at(-1), { id: "j1", videoId: "VID00000001", live: true });
});

test("最後一段其實已送達（結果不明）：續傳查詢直接取得影片，不重送", async () => {
  const store = memStore([job({ state: "uploading", uploadUrl: "https://upload.example/s", uploadedBytes: 10 })]);
  const yt = fakeYt({ alreadyDone: true });
  await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(10 * MB), now: T0 });
  assert.equal(store.db.get("j1").videoId, "VID00000001");
  assert.equal(yt.calls.filter((c) => c[0] === "start" || c[0] === "put").length, 0);
});

test("上傳 session 失效（404）：清掉網址退回已核准，下次重新開始", async () => {
  const store = memStore([job({ state: "uploading", uploadUrl: "https://upload.example/old" })]);
  const yt = fakeYt();
  yt.queryUpload = async () => ({ next: 0 });
  yt.putChunk = async () => { throw new YtError("Not Found", { status: 404 }); };
  const r = await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(MB), now: T0 });
  const j = store.db.get("j1");
  assert.equal(j.uploadUrl, null);
  assert.equal(j.state, "failed"); // 404 不可重試 → 人工處理；不會留下壞掉的 session
  assert.equal(r.retry, false);
});

test("配額用完：不計失敗次數、保持可續行", async () => {
  const store = memStore([job()]);
  const yt = fakeYt();
  yt.startUpload = async () => { throw new YtError("quota", { status: 403, reason: "quotaExceeded" }); };
  const r = await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(MB), now: T0 });
  const j = store.db.get("j1");
  assert.equal(r.quota, true); assert.equal(j.attempts, 0); assert.equal(j.state, "approved");
  assert.match(j.error, /配額/);
});

test("撤銷已上傳的影片：改私人退回草稿；再核准只更新文案、不重新上傳", async () => {
  const store = memStore([job({ state: "cancel_requested", videoId: "VID00000001", publishAt: "2026-11-02T00:00:00Z" })]);
  const yt = fakeYt();
  await processJob(store.db.get("j1"), { store, yt, media: fakeMedia(MB), now: T0 });
  let j = store.db.get("j1");
  assert.equal(j.state, "draft"); assert.equal(j.publishAt, null);
  assert.equal(yt.calls[0][2].status.privacyStatus, "private");
  j.state = "approved"; j.scheduledAt = new Date(T0 + 3 * 3600e3).toISOString();
  const media = fakeMedia(MB);
  const yt2 = fakeYt({ publishAt: j.scheduledAt });
  await processJob(store.db.get("j1"), { store, yt: yt2, media, now: T0 });
  j = store.db.get("j1");
  assert.equal(media.prepared, 0, "不可重新下載／上傳");
  assert.equal(yt2.calls[0][0], "update"); assert.equal(yt2.calls[0][3], "snippet,status");
  assert.equal(j.state, "scheduled");
});

test("逾期 24 小時不自動上傳", async () => {
  const store = memStore([job({ scheduledAt: new Date(T0 - 30 * 3600e3).toISOString() })]);
  await processJob(store.db.get("j1"), { store, yt: fakeYt(), media: fakeMedia(MB), now: T0 });
  assert.equal(store.db.get("j1").state, "failed");
});

test("未通過稽核的專案：要求公開卻被鎖為私人 → 完成但附警告", async () => {
  const store = memStore([job()]);
  await processJob(store.db.get("j1"), { store, yt: fakeYt({ privacy: "private" }), media: fakeMedia(MB), now: T0 });
  const j = store.db.get("j1");
  assert.equal(j.state, "published"); assert.match(j.warning, /稽核/);
  assert.deepEqual(store.links.at(-1).live, false);
});

test("處理中：下輪再查；排程時間到且已公開 → 已發布並回寫", async () => {
  const store = memStore([job({ state: "processing", videoId: "VID00000001" })]);
  await processJob(store.db.get("j1"), { store, yt: fakeYt({ uploadStatus: "uploaded" }), media: fakeMedia(MB), now: T0 });
  assert.equal(store.db.get("j1").state, "processing");
  const s2 = memStore([job({ state: "scheduled", videoId: "VID00000001", publishAt: new Date(T0 - 60e3).toISOString() })]);
  await processJob(s2.db.get("j1"), { store: s2, yt: fakeYt({ privacy: "public" }), media: fakeMedia(MB), now: T0 });
  assert.equal(s2.db.get("j1").state, "published");
  assert.equal(s2.links[0].live, true);
});

test("一輪只上傳一支；Token 失效立即停止後續", async () => {
  const store = memStore([job({ id: "a" }), job({ id: "b" }), job({ id: "c", state: "processing", videoId: "VID00000001" })]);
  const res = await runQueue({ store, yt: fakeYt(), media: fakeMedia(MB), now: T0, log: () => {} });
  const acts = Object.fromEntries(res.results.map((r) => [r.id, r.action]));
  assert.equal(acts.a, "upload"); assert.equal(acts.b, "deferred"); assert.equal(acts.c, "check");
  assert.equal(store.db.get("b").state, "approved");

  const s2 = memStore([job({ id: "a" }), job({ id: "b", state: "processing", videoId: "x" })]);
  const yt = fakeYt();
  yt.startUpload = async () => { throw new YtError("Invalid Credentials", { status: 401 }); };
  const r2 = await runQueue({ store: s2, yt, media: fakeMedia(MB), now: T0, log: () => {} });
  assert.equal(r2.auth, true); assert.equal(r2.results.length, 1);
  assert.equal(s2.db.get("a").state, "failed");
});

test("DRY-RUN 不取鎖、不改資料", async () => {
  const store = memStore([job()]);
  const r = await processJob(store.db.get("j1"), { store, yt: fakeYt(), media: fakeMedia(MB), now: T0, dryRun: true });
  assert.equal(r.dryRun, true); assert.equal(store.db.get("j1").lock.by, null); assert.equal(store.db.get("j1").state, "approved");
});

/* ---------- API 回應解析 ---------- */
const resp = (status, headers = {}, body = {}) => ({ status, ok: status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });

test("resumable 回應：308 依 Range 算下一段；無 Range 從 0；201 回影片；其他丟錯", async () => {
  assert.deepEqual(await parseUploadResponse(resp(308, { range: "bytes=0-33554431" })), { next: 33554432 });
  assert.deepEqual(await parseUploadResponse(resp(308)), { next: 0 });
  assert.deepEqual(await parseUploadResponse(resp(201, {}, { id: "v" })), { video: { id: "v" } });
  await assert.rejects(parseUploadResponse(resp(403, {}, { error: { message: "q", errors: [{ reason: "quotaExceeded" }] } })), (e) => isQuotaError(e));
});

test("OAuth：invalid_grant 歸類為授權錯誤", async () => {
  const fetchImpl = async () => resp(400, {}, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
  await assert.rejects(getAccessToken({ clientId: "a", clientSecret: "b", refreshToken: "c", fetchImpl }), (e) => isAuthError(e) && /expired/.test(e.message));
});

test("Drive 檔案 ID 解析：網址／ID 取 ID，檔名不誤判", () => {
  assert.equal(driveIdFrom("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view"), "1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  assert.equal(driveIdFrom("1AbCdEfGhIjKlMnOpQrStUvWxYz012345"), "1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  assert.equal(driveIdFrom("EP01_正片18分鐘.mp4"), "");
});
