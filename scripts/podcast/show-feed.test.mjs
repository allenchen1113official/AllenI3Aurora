/* 自有節目 RSS 測試：node --test scripts/podcast/show-feed.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShowFeed, checkShow, fmtDuration, podcastGuid, notesHtml, feedEpisodes } from "./show-feed-core.mjs";

const show = JSON.parse(readFileSync(new URL("./show.json", import.meta.url), "utf8"));
const ep = (n, extra = {}) => ({
  guid: `aurora-pc-p${n}`, postId: `p${n}`, title: `第 ${n} 集 <AI & ITS>`, notes: `本集重點\n延伸閱讀 https://example.com/a?b=1&c=2。\n\n第二段`,
  enclosure: { url: `https://github.com/o/r/releases/download/podcast-2026/2026112${n}-p${n}.mp3`, length: 1234567, type: "audio/mpeg" },
  duration: 3725, explicit: false, episodeType: "full", episode: n, pubDate: `2026-11-2${n}T00:00:00.000Z`, hidden: false, ...extra,
});

test("show.json 欄位齊全（Apple 審核必填）", () => {
  assert.deepEqual(checkShow(show), []);
  assert.equal(show.title, "艾倫極光報報 ALLEN I³ AURORA");
  assert.ok(checkShow({ ...show, owner: {} }).some((x) => /owner/.test(x)));
});

test("工具：時長、Podcast Index guid（規格範例）、show notes 轉 HTML", () => {
  assert.equal(fmtDuration(3725), "01:02:05");
  assert.equal(fmtDuration(59.6), "00:01:00");
  assert.equal(podcastGuid("https://mp3s.nashownotes.com/pc20rss.xml"), "917393e3-1b1e-5cef-ace4-edaa54e1f810");
  assert.equal(notesHtml("a <b>\nhttps://x.y/z。\n\nc"), '<p>a &lt;b&gt;<br><a href="https://x.y/z">https://x.y/z</a>。</p><p>c</p>');
});

test("RSS：頻道必填標籤、集數新到舊、跳脫、隱藏與缺音檔不上架", () => {
  const xml = buildShowFeed(show, [ep(1), ep(3), ep(2, { hidden: true }), ep(4, { enclosure: null })]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  for (const t of ["<itunes:owner>", "<itunes:email>allenchen1113.official@gmail.com</itunes:email>", '<itunes:image href="https://', '<itunes:category text="Technology"/>',
    '<itunes:category text="News">', "<itunes:explicit>false</itunes:explicit>", '<atom:link href="https://allenchen1113official.github.io/AllenI3Aurora/podcast.xml"', "<language>zh-tw</language>"]) assert.ok(xml.includes(t), t);
  const guids = [...xml.matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((m) => m[1]);
  assert.deepEqual(guids, ["aurora-pc-p3", "aurora-pc-p1"]);
  assert.ok(xml.includes("<title>第 3 集 &lt;AI &amp; ITS&gt;</title>"));
  assert.ok(xml.includes('length="1234567" type="audio/mpeg"'));
  assert.ok(xml.includes("<itunes:duration>01:02:05</itunes:duration>"));
  assert.ok(xml.includes('<a href="https://example.com/a?b=1&amp;c=2">'));
  assert.ok(xml.includes("<pubDate>Mon, 23 Nov 2026 00:00:00 GMT</pubDate>"));
  // lastBuildDate 取最新一集 → 同樣輸入產生同樣 XML（不會每輪 commit）
  assert.equal(xml, buildShowFeed(show, [ep(3), ep(1)]));
  assert.equal(feedEpisodes([ep(1, { enclosure: { url: "http://x" } })]).length, 0);
});

test("RSS：XML 結構可被解析（標籤成對、CDATA 內含 ]]> 也安全）", () => {
  const xml = buildShowFeed(show, [ep(1, { notes: "危險 ]]> 字串" })]);
  const body = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
    if (m[0].startsWith("<?")) continue;
    if (m[3] === "/") continue;
    if (m[1]) assert.equal(stack.pop(), m[2]); else stack.push(m[2]);
  }
  assert.deepEqual(stack, []);
  assert.equal(buildShowFeed(show, []).includes("<item>"), false);
});
