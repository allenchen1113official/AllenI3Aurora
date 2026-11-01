/* node --test scripts/youtube/channel.test.mjs
   YouTube 頻道同步行為測試：純函式、走勢與統計卡、快照、API 物件轉換、OAuth 錯誤分類。
   （影片上傳的測試在 scripts/social/youtube.test.mjs＋publish.test.mjs） */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDuration, fmtDuration, fmtCount, ytId, appendHistory, statsRow, buildSnapshot, toVideo, channelSnapshot, isAuthError, taipeiDate,
} from "./core.mjs";
import { getAccessToken, createYouTube } from "./client.mjs";

const T0 = Date.parse("2026-11-01T02:00:00Z"); // 台北 10:00

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

/* ---------- API 客戶端 ---------- */
const resp = (status, headers = {}, body = {}) => ({ status, ok: status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });

test("OAuth：invalid_grant 歸類為授權錯誤", async () => {
  const fetchImpl = async () => resp(400, {}, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
  await assert.rejects(getAccessToken({ clientId: "a", clientSecret: "b", refreshToken: "c", fetchImpl }), (e) => isAuthError(e) && /expired/.test(e.message));
});

test("API Key 模式：帶 key、uploads 清單分頁、videos 每 50 支一批", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes("/playlistItems")) {
      const page = url.includes("pageToken=p2") ? 2 : 1;
      return resp(200, {}, { items: Array.from({ length: page === 1 ? 50 : 10 }, (_, i) => ({ contentDetails: { videoId: `v${page}_${i}` } })), ...(page === 1 ? { nextPageToken: "p2" } : {}) });
    }
    if (url.includes("/videos")) return resp(200, {}, { items: new URL(url).searchParams.get("id").split(",").map((id) => ({ id })) });
    return resp(404, {}, {});
  };
  const yt = createYouTube({ apiKey: "K", fetchImpl });
  const ids = await yt.uploadIds("UU1", 55);
  assert.equal(ids.length, 55);
  const vids = await yt.videos(Array.from({ length: 120 }, (_, i) => "x" + i));
  assert.equal(vids.length, 120);
  assert.ok(urls.every((u) => /[?&]key=K/.test(u)));
  assert.equal(urls.filter((u) => u.includes("/videos")).length, 3);
});
