/* YouTube 客戶端測試：假 fetch 模擬 token 換發、可續傳上傳、狀態查詢；不連外部服務。
   node --test scripts/social/youtube.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createYouTubeClient } from "./youtube.mjs";
import { isAuthError, isRetryable } from "./core.mjs";

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const VIDEO = new Uint8Array(1000).fill(7);

function fakeFetch(script = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    const rec = { url: u, method: init.method || "GET", headers: init.headers || {} };
    calls.push(rec);
    if (u.startsWith("https://oauth2.googleapis.com/token")) return script.token ? script.token() : json(200, { access_token: "AT", expires_in: 3600 });
    if (u === "https://cdn.example.com/v.mp4") return new Response(VIDEO, { status: 200, headers: { "content-type": "video/mp4" } });
    if (u === "https://cdn.example.com/page") return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    if (u.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?")) return script.init ? script.init(init) : new Response(null, { status: 200, headers: { location: "https://upload.example/s1" } });
    if (u === "https://upload.example/s1") {
      // 讀完 body 以確認串流可被消費
      if (init.body && typeof init.body.on === "function") for await (const _ of init.body) { void _; }
      return script.put ? script.put(init, calls) : json(200, { id: "vid123" });
    }
    if (u.startsWith("https://www.googleapis.com/youtube/v3/channels")) return json(200, { items: [{ id: "UC1", snippet: { title: "艾倫報報" } }] });
    if (u.startsWith("https://www.googleapis.com/youtube/v3/videos?") && rec.method === "GET") return script.video ? script.video() : json(200, { items: [{ status: { privacyStatus: "private", uploadStatus: "processed", publishAt: "2026-11-02T10:00:00Z" }, snippet: {} }] });
    if (u.startsWith("https://www.googleapis.com/youtube/v3/videos?") && rec.method === "DELETE") return new Response(null, { status: 204 });
    return json(404, { error: { message: "no route " + u } });
  };
  f.calls = calls;
  return f;
}
const client = (fetchImpl) => createYouTubeClient({ clientId: "id", clientSecret: "sec", refreshToken: "rt", fetchImpl, tmpDir: mkdtempSync(join(tmpdir(), "yt-test-")) });

test("checkToken：以 refresh token 換 access token 後查頻道名稱；token 會快取", async () => {
  const f = fakeFetch();
  const c = client(f);
  assert.deepEqual(await c.checkToken(), { name: "艾倫報報", channelId: "UC1" });
  await c.checkToken();
  assert.equal(f.calls.filter((x) => x.url.startsWith("https://oauth2")).length, 1);
  assert.equal(f.calls[1].headers.Authorization, "Bearer AT");
});

test("refresh token 失效（invalid_grant）→ auth 錯誤，不重試", async () => {
  const f = fakeFetch({ token: () => json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }) });
  await assert.rejects(client(f).checkToken(), (e) => { assert.ok(isAuthError(e)); assert.ok(!isRetryable(e)); assert.match(e.message, /expired or revoked/); return true; });
});

test("upload：下載影片 → 初始化（帶 publishAt 時先 private）→ PUT 整檔 → 回傳 videoId；暫存檔會清除", async () => {
  const f = fakeFetch();
  const c = client(f);
  const sessions = [];
  const r = await c.upload({ title: "T", description: "D", tags: ["x"], privacy: "public", videoUrl: "https://cdn.example.com/v.mp4", publishAt: "2026-11-02T10:00:00Z", onSession: (u) => sessions.push(u) });
  assert.deepEqual(r, { videoId: "vid123", url: "https://youtu.be/vid123" });
  assert.deepEqual(sessions, ["https://upload.example/s1"]);
  const init = f.calls.find((x) => x.url.startsWith("https://www.googleapis.com/upload"));
  assert.equal(init.headers["X-Upload-Content-Length"], "1000");
  assert.equal(init.headers["X-Upload-Content-Type"], "video/mp4");
  const put = f.calls.find((x) => x.url === "https://upload.example/s1");
  assert.equal(put.headers["Content-Length"], "1000");
  assert.equal(put.headers["Content-Range"], undefined);
});

test("upload：初始化 body 內容正確（private + publishAt；無 publishAt 時用指定 privacy）", async () => {
  let body;
  const f = fakeFetch({ init: (init) => { body = JSON.parse(init.body); return new Response(null, { status: 200, headers: { location: "https://upload.example/s1" } }); } });
  const c = client(f);
  await c.upload({ title: "T", videoUrl: "https://cdn.example.com/v.mp4", privacy: "public", publishAt: "2026-11-02T10:00:00Z" });
  assert.equal(body.status.privacyStatus, "private");
  assert.equal(body.status.publishAt, "2026-11-02T10:00:00Z");
  assert.equal(body.status.selfDeclaredMadeForKids, false);
  await c.upload({ title: "T", videoUrl: "https://cdn.example.com/v.mp4", privacy: "unlisted" });
  assert.equal(body.status.privacyStatus, "unlisted");
  assert.equal("publishAt" in body.status, false);
});

test("upload：PUT 中斷（5xx）→ 查詢位移 308 → 從位移續傳成功", async () => {
  let puts = 0;
  const f = fakeFetch({ put: (init) => {
    puts++;
    if (init.headers["Content-Range"] === "bytes */1000") return new Response(null, { status: 308, headers: { range: "bytes=0-399" } });
    if (puts === 1) return json(503, { error: { message: "backend" } });
    return json(201, { id: "vid_resumed" });
  } });
  const r = await client(f).upload({ title: "T", videoUrl: "https://cdn.example.com/v.mp4" });
  assert.equal(r.videoId, "vid_resumed");
  const last = f.calls.filter((x) => x.url === "https://upload.example/s1").at(-1);
  assert.equal(last.headers["Content-Range"], "bytes 400-999/1000");
  assert.equal(last.headers["Content-Length"], "600");
});

test("upload：帶入既有 uploadUri 時先查進度，已完成就直接回傳不重傳", async () => {
  const f = fakeFetch({ put: (init) => (init.headers["Content-Range"] === "bytes */1000" ? json(200, { id: "vid_done" }) : json(500, {})) });
  const r = await client(f).upload({ title: "T", videoUrl: "https://cdn.example.com/v.mp4", uploadUri: "https://upload.example/s1" });
  assert.equal(r.videoId, "vid_done");
  assert.equal(f.calls.some((x) => x.url.startsWith("https://www.googleapis.com/upload")), false, "不重新初始化");
});

test("upload：影片網址回傳 HTML → 不可重試的錯誤", async () => {
  await assert.rejects(client(fakeFetch()).upload({ title: "T", videoUrl: "https://cdn.example.com/page" }), (e) => { assert.equal(e.retryable, false); assert.match(e.message, /text\/html/); return true; });
});

test("quotaExceeded → 可重試（隔日配額重置）；status／remove 正常", async () => {
  const f = fakeFetch({ video: () => json(403, { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } }) });
  await assert.rejects(client(f).status("v1"), (e) => { assert.ok(isRetryable(e)); assert.ok(!isAuthError(e)); return true; });
  const c = client(fakeFetch());
  const s = await c.status("v1");
  assert.equal(s.privacyStatus, "private");
  assert.equal(s.publishAt, "2026-11-02T10:00:00Z");
  assert.deepEqual(await c.remove("v1"), {});
});
