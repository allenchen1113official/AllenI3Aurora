/* Drive 橋接與審核通知的行為測試（不連外部服務）：node --test scripts/social/bridge.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRIVE_PATHS, DRIVE_FAMILIES, familyTopic, referencedFiles, needsSync, pickFile, pickFolder, q } from "./drive-bridge-core.mjs";
import { reviewItems, buildReviewMessage, lineText, REVIEW_URL } from "./notify-core.mjs";
import { KNOWN_TOPICS, topicInfo, docIdOf } from "./ingest-core.mjs";

const manifest = () => ({
  version: 1, topic: "heatmap", date: "2026-11-19", title: "今日關注動態｜台股熱力圖．上市／上櫃 2026/11/19（週四）",
  autoPublish: false, verified: true, producedAt: "2026-11-19T20:05:00+08:00",
  platforms: {
    fb: { caption: "fb.txt", images: ["Listed_FB.png", "OTC_FB.png"] },
    ig: { caption: "ig.txt", images: ["Listed_IG.png", "OTC_IG.png"] },
    threads: { caption: "threads.txt", images: ["Listed_IG.png"] },
  },
});

test("Drive 路徑涵蓋所有已知主題", () => {
  assert.deepEqual(Object.keys(DRIVE_PATHS).sort(), Object.keys(KNOWN_TOPICS).sort());
  assert.deepEqual(DRIVE_PATHS["txf-flash"], ["finance", "twex"]);
  assert.deepEqual(DRIVE_PATHS["tw-whale-weekly"], ["finance", "whale"]);
});

test("referencedFiles：文案與圖卡去重，擋下路徑穿越與子資料夾", () => {
  const r = referencedFiles(manifest());
  assert.deepEqual(r.bad, []);
  assert.deepEqual(r.files.sort(), ["Listed_FB.png", "Listed_IG.png", "OTC_FB.png", "OTC_IG.png", "fb.txt", "ig.txt", "threads.txt"]);
  const evil = manifest();
  evil.platforms.fb.images = ["../secret.png", "a/b.png", "manifest.json"];
  assert.deepEqual(referencedFiles(evil).bad, ["../secret.png", "a/b.png", "manifest.json"]);
});

test("needsSync：新送審包同步、producedAt 相同略過、變更才重新同步", () => {
  const m = manifest();
  assert.equal(needsSync(null, m).sync, true);
  assert.equal(needsSync(m, m).sync, false);
  assert.equal(needsSync(m, { ...m, producedAt: "2026-11-19T20:40:00+08:00" }).sync, true);
  assert.equal(needsSync(m, null).sync, false);
  const noTs = { ...m, producedAt: undefined };
  assert.equal(needsSync(noTs, { ...noTs }).sync, false);
  assert.equal(needsSync(noTs, { ...noTs, title: "改" }).sync, true);
});

test("pickFile／pickFolder：完全同名才算；檔案取最新、資料夾取最早（避開「20261119 2」）", () => {
  const files = [
    { id: "a", name: "fb.txt", modifiedTime: "2026-11-19T12:00:00Z" },
    { id: "b", name: "fb.txt", modifiedTime: "2026-11-19T12:30:00Z" },
    { id: "c", name: "fb (1).txt", modifiedTime: "2026-11-19T13:00:00Z" },
  ];
  assert.equal(pickFile(files, "fb.txt").id, "b");
  assert.equal(pickFile(files, "ig.txt"), null);
  const dirs = [
    { id: "x", name: "20261119", createdTime: "2026-11-19T10:00:00Z" },
    { id: "y", name: "20261119 2", createdTime: "2026-11-19T09:00:00Z" },
    { id: "z", name: "20261119", createdTime: "2026-11-19T11:00:00Z" },
  ];
  assert.equal(pickFolder(dirs, "20261119").id, "x");
});

test("Drive 查詢字串跳脫單引號", () => {
  assert.equal(q("O'Neil"), "O\\'Neil");
});

test("審核通知：只通知新建／重產的人工審核草稿", () => {
  const results = [
    { id: "cs_heatmap_20261119", topic: "heatmap", date: "20261119", status: "created", auto: false, title: "熱力圖標題", channels: ["fb", "ig", "th"] },
    { id: "cs_noon_20261119", topic: "noon", date: "20261119", status: "updated", auto: false, title: "午報", channels: ["fb", "th"] },
    { id: "cs_daily_20261119", topic: "daily", date: "20261119", status: "skipped", reason: "素材未變更" },
    { id: "cs_txf-flash_20261119", topic: "txf-flash", date: "20261119", status: "created", auto: true },
    { id: "cs_x", topic: "stockradar", date: "20261119", status: "invalid", errors: ["缺圖"] },
  ];
  const items = reviewItems(results);
  assert.deepEqual(items.map((r) => r.id), ["cs_heatmap_20261119", "cs_noon_20261119"]);
  const msg = buildReviewMessage(items);
  assert.match(msg.subject, /PilotOne 待審核/);
  assert.match(msg.text, /2 則貼文待審核/);
  assert.match(msg.text, /台股熱力圖．上市／上櫃 2026\/11\/19｜FB＋IG＋Threads/);
  assert.match(msg.text, /艾倫極光午報 2026\/11\/19｜FB＋Threads（素材已重產）/);
  assert.ok(msg.text.includes(REVIEW_URL) && msg.html.includes(REVIEW_URL));
  assert.equal(buildReviewMessage([]), null);
});

test("審核通知 HTML 跳脫標題、LINE 文字不超過上限", () => {
  const msg = buildReviewMessage([{ topic: "daily", date: "20261119", status: "created", title: "<b>x</b>", channels: ["fb"] }]);
  assert.ok(msg.html.includes("&lt;b&gt;x&lt;/b&gt;") && !msg.html.includes("<b>x</b>"));
  assert.ok(lineText({ text: "字".repeat(6000) }).length <= 4900);
});

import { fbNameMismatch } from "./core.mjs";
test("粉專名稱防呆：名稱不符暫停 FB；相符、* 或 Token 本身失效時不另外處理", () => {
  assert.match(fbNameMismatch({ ok: true, name: "陳艾倫" }, "艾倫報報"), /不是預期的粉專「艾倫報報」/);
  assert.equal(fbNameMismatch({ ok: true, name: "艾倫報報" }, "艾倫報報"), null);
  assert.equal(fbNameMismatch({ ok: true, name: "艾倫 報報" }, "艾倫報報"), null);
  assert.equal(fbNameMismatch({ ok: true, name: "陳艾倫" }, "*"), null);
  assert.equal(fbNameMismatch({ ok: false, name: null, error: "190" }, "艾倫報報"), null);
  assert.equal(fbNameMismatch(undefined, "艾倫報報"), null);
});

test("主題家族 yt：每支影片一份送審包，子代碼須為影片 ID 格式，且 ingest 認得", () => {
  assert.deepEqual(DRIVE_FAMILIES.yt.path, ["notes", "youtube"]);
  assert.equal(familyTopic("yt", "dQw4w9WgXcQ"), "yt-dQw4w9WgXcQ");
  assert.equal(familyTopic("yt", "Ab_-12"), "yt-Ab_-12");
  assert.equal(familyTopic("yt", "../x"), null);
  assert.equal(familyTopic("yt", "a b c d e f"), null);
  assert.equal(familyTopic("yt", ""), null);
  assert.equal(familyTopic("nope", "dQw4w9WgXcQ"), null);
  assert.equal(topicInfo("yt-dQw4w9WgXcQ").family, "yt");
  assert.match(topicInfo("yt-dQw4w9WgXcQ").label, /常看 YouTube 重點筆記/);
  assert.notEqual(docIdOf("yt-aaaaaaaaaaa", "20261123"), docIdOf("yt-bbbbbbbbbbb", "20261123"));
});

test("Podcast 送審包：音檔列入引用檔、pc 家族子代碼、指標檔內容", async () => {
  const { AUDIO_NAME, driveStub } = await import("./drive-bridge-core.mjs");
  const m = { version: 1, topic: "pc-ep001", platforms: { podcast: { caption: "podcast.txt", audio: "episode.mp3" } } };
  assert.deepEqual(referencedFiles(m).files.sort(), ["episode.mp3", "podcast.txt"]);
  assert.equal(AUDIO_NAME.test("episode.mp3"), true);
  assert.equal(AUDIO_NAME.test("card.png"), false);
  assert.equal(familyTopic("pc", "daily-1124"), "pc-daily-1124");
  assert.equal(familyTopic("pc", "a"), null);
  assert.deepEqual(DRIVE_FAMILIES.pc.path, ["podcast", "episodes"]);
  assert.deepEqual(driveStub({ id: "x", name: "episode.mp3", size: "99", mimeType: "audio/mpeg", modifiedTime: "t", trashed: false }),
    { id: "x", name: "episode.mp3", size: 99, mimeType: "audio/mpeg", modifiedTime: "t" });
  assert.equal(topicInfo("pc-ep001").label, "Podcast 單集 ep001");
});
