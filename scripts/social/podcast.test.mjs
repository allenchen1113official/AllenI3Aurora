/* Podcast（pc 頻道）測試：狀態機＋GitHub Releases 客戶端＋音檔解析；不連外部服務。
   node --test scripts/social/podcast.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnce, planPodcast, nextQueueState, LOCK_STALE_MS } from "./core.mjs";
import { createPodcastClient, audioDuration, sniffAudio, driveIdOf, assetName, releaseTag, guidOf } from "./podcast.mjs";

const T0 = Date.parse("2026-11-24T04:00:00Z"); // 台北 12:00
const MIN = 60 * 1000, HOUR = 60 * MIN;
const quiet = () => {};

/* ---------- 測試用音檔 ---------- */
// MPEG-1 Layer III、128 kbps、44.1 kHz、立體聲，CBR：每幀 417 bytes
function cbrMp3(frames) {
  const f = new Uint8Array(417); f[0] = 0xff; f[1] = 0xfb; f[2] = 0x90; f[3] = 0x00;
  const out = new Uint8Array(417 * frames);
  for (let i = 0; i < frames; i++) out.set(f, i * 417);
  return out;
}
// 帶 Xing 標頭（VBR）：frames 欄位決定長度
function xingMp3(frames) {
  const b = cbrMp3(3);
  const x = 4 + 32;
  b.set([..."Xing"].map((c) => c.charCodeAt(0)), x);
  b.set([0, 0, 0, 1], x + 4);
  b.set([(frames >>> 24) & 255, (frames >>> 16) & 255, (frames >>> 8) & 255, frames & 255], x + 8);
  return b;
}
function m4a(seconds, scale = 1000) {
  const mvhd = new Uint8Array(108); const dv = new DataView(mvhd.buffer);
  dv.setUint32(0, 108); mvhd.set([..."mvhd"].map((c) => c.charCodeAt(0)), 4);
  dv.setUint32(8 + 12, scale); dv.setUint32(8 + 16, seconds * scale);
  const moov = new Uint8Array(8 + 108); const dv2 = new DataView(moov.buffer);
  dv2.setUint32(0, moov.length); moov.set([..."moov"].map((c) => c.charCodeAt(0)), 4); moov.set(mvhd, 8);
  const ftyp = new Uint8Array(16); const dv3 = new DataView(ftyp.buffer);
  dv3.setUint32(0, 16); ftyp.set([..."ftypM4A "].map((c) => c.charCodeAt(0)), 4);
  const out = new Uint8Array(ftyp.length + moov.length); out.set(ftyp); out.set(moov, ftyp.length);
  return out;
}

test("音檔解析：CBR MP3、Xing VBR、ID3 前綴、M4A mvhd、非音檔", () => {
  const cbr = cbrMp3(1000); // 1000 × 417 × 8 / 128000 ≈ 26 秒
  assert.equal(sniffAudio(cbr), "mp3");
  assert.equal(audioDuration(cbr, "mp3"), 26);
  assert.equal(audioDuration(xingMp3(38281), "mp3"), 1000); // 38281 × 1152 / 44100 ≈ 1000 秒
  const id3 = new Uint8Array(20 + cbr.length); id3.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10]); id3.set(cbr, 20);
  assert.equal(sniffAudio(id3), "mp3");
  assert.equal(audioDuration(id3, "mp3"), 26);
  assert.equal(sniffAudio(m4a(1834), "ep.m4a"), "m4a");
  assert.equal(audioDuration(m4a(1834), "m4a"), 1834);
  assert.equal(sniffAudio(new TextEncoder().encode("<!DOCTYPE html><html>")), null);
});

test("工具：Drive 連結轉 id、附件檔名用台北日期、年度 release", () => {
  assert.equal(driveIdOf("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view?usp=sharing"), "1AbCdEfGhIjKlMnOpQrStUvWx");
  assert.equal(driveIdOf("https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrStUvWx&export=download"), "1AbCdEfGhIjKlMnOpQrStUvWx");
  assert.equal(driveIdOf("https://cdn.example.com/a.mp3"), null);
  // UTC 12/31 17:00 ＝ 台北 1/1 01:00 → 新年度
  assert.equal(releaseTag("2026-12-31T17:00:00Z"), "podcast-2027");
  assert.equal(assetName("cs_pc-daily_20261124", "2026-11-23T17:30:00Z", "mp3"), "20261124-cs_pc-daily_20261124.mp3");
  assert.equal(assetName("a b/c", "2026-11-24T04:00:00Z", "m4a"), "20261124-a-b-c.m4a");
});

/* ---------- 假 GitHub API＋假 feed ---------- */
function fakeGitHub({ audio = cbrMp3(2000), audioStatus = 200, uploadStatus = 201 } = {}) {
  const st = { releases: [], assets: new Map(), uploads: 0, downloads: 0, calls: [] };
  let nid = 10;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const f = async (url, init = {}) => {
    const u = String(url), m = init.method || "GET";
    st.calls.push(`${m} ${u}`);
    if (u === "https://cdn.example.com/ep.mp3") { st.downloads++; return audioStatus === 200 ? new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg", "content-length": String(audio.length) } }) : new Response("x", { status: audioStatus }); }
    if (u === "https://cdn.example.com/page.mp3") return new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } });
    if (u === "https://api.github.com/repos/o/r" && m === "GET") return json(200, { full_name: "o/r" });
    let r = u.match(/\/releases\/tags\/(.+)$/);
    if (r && m === "GET") { const x = st.releases.find((y) => y.tag_name === decodeURIComponent(r[1])); return x ? json(200, x) : json(404, { message: "Not Found" }); }
    if (u === "https://api.github.com/repos/o/r/releases" && m === "POST") {
      const b = JSON.parse(init.body); const rel = { id: nid++, tag_name: b.tag_name, upload_url: `https://uploads.github.com/repos/o/r/releases/${nid - 1}/assets{?name,label}` };
      st.releases.push(rel); st.assets.set(rel.id, []); return json(201, rel);
    }
    r = u.match(/\/releases\/(\d+)\/assets\?per_page=100&page=(\d+)$/);
    if (r) return json(200, Number(r[2]) === 1 ? st.assets.get(Number(r[1])) || [] : []);
    r = u.match(/^https:\/\/uploads\.github\.com\/repos\/o\/r\/releases\/(\d+)\/assets\?name=([^&]+)/);
    if (r && m === "POST") {
      if (uploadStatus !== 201) return json(uploadStatus, { message: "Server Error" });
      st.uploads++;
      const name = decodeURIComponent(r[2]);
      const a = { id: nid++, name, size: init.body.length, content_type: init.headers["Content-Type"], browser_download_url: `https://github.com/o/r/releases/download/podcast-2026/${name}` };
      st.assets.get(Number(r[1])).push(a); return json(201, a);
    }
    return json(404, { message: "no route " + u });
  };
  f.st = st;
  return f;
}
function memFeed(init = []) {
  const m = new Map(init.map((d) => [d.postId, structuredClone(d)]));
  return { m, async get(id) { return m.has(id) ? structuredClone(m.get(id)) : null; }, async list() { return [...m.values()]; }, async set(id, d) { m.set(id, structuredClone(d)); } };
}

test("publish：建立年度 release、上傳音檔、寫入集數（含長度與 enclosure）", async () => {
  const f = fakeGitHub(); const feed = memFeed();
  const c = createPodcastClient({ repo: "o/r", token: "t", feed, fetchImpl: f });
  const r = await c.publish({ id: "p1", title: "第一集", notes: "重點\nhttps://x.y", audioUrl: "https://cdn.example.com/ep.mp3", now: T0 });
  assert.equal(r.episode, 1);
  assert.equal(r.guid, guidOf("p1"));
  assert.match(r.url, /podcast-2026\/20261124-p1\.mp3$/);
  const d = feed.m.get("p1");
  assert.equal(d.enclosure.type, "audio/mpeg");
  assert.equal(d.enclosure.length, 2000 * 417);
  assert.equal(d.duration, 52);
  assert.equal(d.pubDate, new Date(T0).toISOString());
  assert.equal(f.st.releases[0].tag_name, "podcast-2026");
});

test("publish 冪等：重跑不重新下載、不重複上傳，guid／集數／pubDate 不變", async () => {
  const f = fakeGitHub(); const feed = memFeed();
  const c = createPodcastClient({ repo: "o/r", token: "t", feed, fetchImpl: f });
  await c.publish({ id: "p1", title: "第一集", notes: "", audioUrl: "https://cdn.example.com/ep.mp3", now: T0 });
  const r2 = await c.publish({ id: "p1", title: "第一集（修）", notes: "", audioUrl: "https://cdn.example.com/ep.mp3", now: T0 + HOUR });
  assert.equal(f.st.uploads, 1);
  assert.equal(f.st.downloads, 1);
  assert.equal(r2.episode, 1);
  assert.equal(feed.m.get("p1").pubDate, new Date(T0).toISOString());
  assert.equal(feed.m.get("p1").title, "第一集（修）");
  // 第二筆貼文是第 2 集；trailer 不佔集數
  const r3 = await c.publish({ id: "p2", title: "第二集", audioUrl: "https://cdn.example.com/ep.mp3", now: T0 + 2 * HOUR });
  assert.equal(r3.episode, 2);
  const r4 = await c.publish({ id: "p3", title: "預告", episodeType: "trailer", audioUrl: "https://cdn.example.com/ep.mp3", now: T0 + 3 * HOUR });
  assert.equal(r4.episode, null);
});

test("publish：Drive 來源走 driveDownload；HTML 警告頁不是音檔 → 不可重試錯誤", async () => {
  const f = fakeGitHub(); const feed = memFeed();
  let asked = null;
  const c = createPodcastClient({ repo: "o/r", token: "t", feed, fetchImpl: f, driveDownload: async (id) => { asked = id; return Buffer.from(m4a(600)); } });
  const r = await c.publish({ id: "d1", title: "Drive 集", audioUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view", now: T0 });
  assert.equal(asked, "1AbCdEfGhIjKlMnOpQrStUvWx");
  assert.equal(r.duration, 600);
  assert.match(r.url, /\.m4a$/);
  await assert.rejects(c.publish({ id: "h1", title: "x", audioUrl: "https://cdn.example.com/page.mp3", now: T0 }), (e) => e.retryable === false && /不是音檔/.test(e.message));
  const noDrive = createPodcastClient({ repo: "o/r", token: "t", feed, fetchImpl: f });
  await assert.rejects(noDrive.publish({ id: "d2", title: "x", audioDriveId: "1AbCdEfGhIjKlMnOpQrStUvWx", now: T0 }), /GDRIVE_SERVICE_ACCOUNT/);
});

/* ---------- 狀態機 ---------- */
function memStore(docs) {
  const db = new Map(docs.map((d) => [d.id, structuredClone(d)]));
  const setPath = (o, path, v) => { const ks = path.split("."); for (const k of ks.slice(0, -1)) o = o[k] = { ...(o[k] || {}) }; o[ks.at(-1)] = v; };
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
const pcPost = (pc = {}, extra = {}) => ({
  id: "cs_pc_1", queueState: "pending", scheduledAt: new Date(T0).toISOString(), title: "艾倫極光日報 Podcast", lock: { by: null, at: null },
  fb: { enabled: false, state: "draft" },
  pc: { enabled: true, caption: "Show notes", title: "第 1 集", audioUrl: "https://cdn.example.com/ep.mp3", state: "approved", attempts: 0, ...pc }, ...extra,
});
const fakePc = (impl) => { const calls = []; return { calls, async publish(a) { calls.push(a); return impl ? impl(a) : { guid: "g", url: "https://gh/x.mp3", enclosureUrl: "https://gh/x.mp3", duration: 60, episode: 1 }; } }; };

test("planPodcast：到期前 5 分鐘內發布、太早等待、逾期、結果不明可重送", () => {
  assert.equal(planPodcast(pcPost(), T0), "publish_now");
  assert.equal(planPodcast(pcPost({}, { scheduledAt: new Date(T0 + 4 * MIN).toISOString() }), T0), "publish_now");
  assert.equal(planPodcast(pcPost({}, { scheduledAt: new Date(T0 + HOUR).toISOString() }), T0), "wait");
  assert.equal(planPodcast(pcPost({}, { scheduledAt: new Date(T0 - 25 * HOUR).toISOString() }), T0), "overdue");
  const stuck = pcPost({ state: "publishing" }, { lock: { by: "x", at: new Date(T0 - 1 * MIN).toISOString() } });
  assert.equal(planPodcast(stuck, T0), "wait");
  assert.equal(planPodcast(stuck, T0 + LOCK_STALE_MS + MIN), "publish_now");
  assert.equal(planPodcast(pcPost({ enabled: false }), T0), "skip");
  assert.equal(nextQueueState(pcPost({ state: "published" })), "done");
});

test("runOnce：pc 發布後回寫 published＋集數，fb 未啟用標 skipped，回報 feedChanged", async () => {
  const store = memStore([pcPost()]);
  const pc = fakePc();
  const s = await runOnce({ store, graph: null, graphs: { pc }, now: T0, log: quiet });
  const d = store.db.get("cs_pc_1");
  assert.equal(d.pc.state, "published");
  assert.equal(d.pc.episode, 1);
  assert.equal(d.queueState, "done");
  assert.equal(s.feedChanged, true);
  assert.equal(pc.calls[0].id, "cs_pc_1");
  assert.equal(pc.calls[0].notes, "Show notes");
  // 再跑一輪不重發
  await runOnce({ store, graph: null, graphs: { pc }, now: T0 + 10 * MIN, log: quiet });
  assert.equal(pc.calls.length, 1);
});

test("runOnce：未設定 pc → failed 附設定說明；暫時錯誤回 approved 重試、第 3 次 failed；不可重試錯誤直接 failed", async () => {
  let store = memStore([pcPost()]);
  await runOnce({ store, graph: null, graphs: {}, now: T0, log: quiet });
  assert.equal(store.db.get("cs_pc_1").pc.state, "failed");
  assert.match(store.db.get("cs_pc_1").pc.error, /GH_TOKEN/);

  store = memStore([pcPost()]);
  const flaky = fakePc(() => { throw new Error("音檔下載網路錯誤：ECONNRESET"); });
  for (let i = 0; i < 3; i++) await runOnce({ store, graph: null, graphs: { pc: flaky }, now: T0 + i * 20 * MIN, log: quiet });
  assert.equal(store.db.get("cs_pc_1").pc.state, "failed");
  assert.equal(store.db.get("cs_pc_1").pc.attempts, 3);
  assert.equal(flaky.calls.length, 3);

  store = memStore([pcPost()]);
  const hard = fakePc(() => { throw Object.assign(new Error("不是音檔"), { retryable: false }); });
  const s = await runOnce({ store, graph: null, graphs: { pc: hard }, now: T0, log: quiet });
  assert.equal(store.db.get("cs_pc_1").pc.state, "failed");
  assert.equal(s.failed, 1);
});

test("runOnce：取消請求退回草稿；pc 與 FB 同一筆各自處理", async () => {
  let store = memStore([pcPost({ state: "cancel_requested" })]);
  await runOnce({ store, graph: null, graphs: { pc: fakePc() }, now: T0, log: quiet });
  assert.equal(store.db.get("cs_pc_1").pc.state, "draft");

  store = memStore([pcPost({}, { fb: { enabled: true, caption: "FB", state: "approved", attempts: 0 } })]);
  const fbCalls = [];
  const graph = { async publish(a) { fbCalls.push(a); return { postId: "page_1" }; } };
  const pc = fakePc();
  await runOnce({ store, graph, graphs: { pc }, now: T0, log: quiet });
  const d = store.db.get("cs_pc_1");
  assert.equal(d.fb.state, "published");
  assert.equal(d.pc.state, "published");
  assert.equal(fbCalls.length, 1);
  assert.equal(pc.calls.length, 1);
});
