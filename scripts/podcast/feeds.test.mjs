import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLatestItem, cleanShowNotes, formatDuration, taipeiDate, toEpisode } from "./feeds-core.mjs";

const FIRSTORY = `<?xml version="1.0"?><rss><channel><title>財經一路發</title>
<item><title><![CDATA[「台積電、聯電」舊的一集 2026.11.20]]></title><pubDate>Fri, 20 Nov 2026 11:00:00 GMT</pubDate><itunes:duration>1200</itunes:duration><link>https://open.firstory.fm/story/old</link><description><![CDATA[舊]]></description></item>
<item><title><![CDATA[止跌了沒？三指標判斷是否落底安全了？ 2026.11.23]]></title><pubDate>Mon, 23 Nov 2026 11:50:22 GMT</pubDate><itunes:duration>1165</itunes:duration><link>https://open.firstory.fm/story/cmwt78ygy01cs01ul7z2b0tvp</link>
<description><![CDATA[<p>009823 群益S&amp;P500(本基金之配息來源可能為收益平準金) 追蹤標普500指數，申購請洽各大券商。瞭解更多及完整警語：https://capitalfund.tw/op9823 投資一定有風險，基金投資有賺有賠。群益投信行銷資訊  —— 以上廣告由九八新聞台製播 —— 主持人：阮慕驊來賓：統一期貨分析師 盧昱衡主題：止跌了沒？三指標判斷是否落底安全了？節目時間：週一至週五 5:00pm-7:00pm本集播出日期：2026.11.23🈲主持人無LINE群組、無代操作投資，請小心金融詐騙！ 此集影片 https://youtube.com/live/B-yKahBzZHI如果您喜歡我們的節目，請記得訂閱並且留下五星評分及評論。</p><p>▍官網：http://www.news98.com.tw</p><p>Powered by Firstory Hosting</p>]]></description></item>
</channel></rss>`;

test("取 pubDate 最新的一集（不論 item 順序）", () => {
  const it = parseLatestItem(FIRSTORY);
  assert.match(it.title, /止跌了沒/);
  assert.equal(it.duration, "1165");
});

test("節目說明去廣告、連結與訂閱宣傳，留下主持人／來賓／主題", () => {
  const s = cleanShowNotes(parseLatestItem(FIRSTORY).description);
  assert.match(s, /主持人：阮慕驊/);
  assert.match(s, /來賓：統一期貨分析師 盧昱衡/);
  assert.match(s, /主題：止跌了沒/);
  for (const bad of ["群益", "警語", "http", "五星", "Firstory", "官網", "LINE", "節目時間", "此集影片"]) assert.ok(!s.includes(bad), bad + " 應被移除：" + s);
});

test("英文節目說明：去 Sponsors / Links / Note，保留內容段落並截斷", () => {
  const html = "<p>Vanguard is the most effective vehicle ever created for participating in American capitalism.</p><p>Today it's the largest equity owner in the S&amp;P 500.</p><p>Sponsors: Many thanks to J.P. Morgan</p><p>Links: Sign up for email updates</p><p>Note: Acquired hosts may hold assets. This podcast is not investment advice.</p>";
  const s = cleanShowNotes(html, 140);
  assert.match(s, /^Vanguard is/);
  assert.ok(!/Sponsors|Links|Note:/.test(s));
  assert.ok(s.length <= 141);
});

test("時長與台北日期", () => {
  assert.equal(formatDuration("1165"), "19m");
  assert.equal(formatDuration("01:12:05"), "1h 12m");
  assert.equal(formatDuration("2:04:00"), "2h 04m");
  assert.equal(formatDuration(""), "");
  // UTC 11/23 20:00 = 台北 11/24 04:00
  assert.equal(taipeiDate("Mon, 23 Nov 2026 20:00:00 GMT"), "2026.11.24");
});

test("toEpisode 欄位與 KIT.podcastEpisodes 相容", () => {
  const ep = toEpisode({ show: "財經一路發", tone: "insight", page: "https://open.spotify.com/show/x" }, parseLatestItem(FIRSTORY));
  assert.equal(ep.show, "財經一路發");
  assert.equal(ep.date, "2026.11.23");
  assert.equal(ep.duration, "19m");
  assert.equal(ep.url, "https://open.firstory.fm/story/cmwt78ygy01cs01ul7z2b0tvp");
  assert.equal(ep.status, "published");
  assert.equal(ep.source, "rss");
});

test("跨集樣板（節目固定介紹）被扣除；全扣光時退回標題主題", async () => {
  const { latestSummary, parseItems } = await import("./feeds-core.mjs");
  const boiler = "<p>開盤前30分鐘，08:30 - 09:00 讓我們一起解讀財經時事 。</p><p>《早晨財經速解讀》是游庭皓的個人知識節目，每日開盤前半小時準時直播。</p><p>如有疑問，歡迎來信 x@gmail.com</p>";
  const xml = `<rss><channel>
<item><title>2026/11/24(二)黃仁勳閃電回鍋!輝達狂飆31% 現在買股 還來得及嗎?【早晨財經速解讀】</title><pubDate>Tue, 24 Nov 2026 00:30:00 GMT</pubDate><description><![CDATA[${boiler}]]></description></item>
<item><title>2026/11/23(一)舊集</title><pubDate>Mon, 23 Nov 2026 00:30:00 GMT</pubDate><description><![CDATA[${boiler}]]></description></item>
</channel></rss>`;
  const items = parseItems(xml);
  assert.equal(latestSummary(items, items[0]), "主題：黃仁勳閃電回鍋!輝達狂飆31% 現在買股 還來得及嗎?");
});

test("免責聲明與追蹤行移除；maxLines 只取首行", () => {
  assert.equal(cleanShowNotes("<p>反彈該跑還是買？</p><p>節目內容純屬主持人與來賓個人經驗分享，非個股推薦。投資人須自行謹慎判斷</p><p>追蹤 IG：@x</p>"), "反彈該跑還是買？");
  assert.equal(cleanShowNotes("<p>靠 GTA VI 的籃球和路人打發時間</p><p>聖誕節、跨年快到了，想給另一半一個驚喜的</p>", 260, 1), "靠 GTA VI 的籃球和路人打發時間");
});

test("最新一集與清單是不同物件時（實際流程），本集內容仍保留、只扣跨集樣板", async () => {
  const { latestSummary, parseItems } = await import("./feeds-core.mjs");
  const xml = `<rss><channel>
<item><title>EP2 新集</title><pubDate>Tue, 24 Nov 2026 00:30:00 GMT</pubDate><description><![CDATA[<p>本集聊 Agent 設計模式</p><p>節目固定介紹文字</p>]]></description></item>
<item><title>EP1 舊集</title><pubDate>Mon, 23 Nov 2026 00:30:00 GMT</pubDate><description><![CDATA[<p>上集內容</p><p>節目固定介紹文字</p>]]></description></item>
</channel></rss>`;
  const all = parseItems(xml);
  assert.equal(latestSummary(all, parseLatestItem(xml)), "本集聊 Agent 設計模式");
});
