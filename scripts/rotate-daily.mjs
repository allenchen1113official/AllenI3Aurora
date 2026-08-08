#!/usr/bin/env node
/*
 * 「艾倫極光日報」更新為最新日期＋前一日移入歷期彙整的可重複執行腳本。
 *
 * 用途：供每日上午 08:00（台北時間）排程（見 docs/daily-daily-schedule.md）呼叫，
 * 把「今日關注動態」的艾倫極光日報切換為「最新一日（今天）」，並把前一日的日報
 * 卡片歸檔到 data/daily-archive.json（前台「歷期彙整」以 kind「日報」呈現）。
 * 同時同步更新 data/focus.json 內的「日報」卡片（meta／summary 帶入新日期）。
 *
 * 用法：
 *   node scripts/rotate-daily.mjs                 # 直接以「今天（台北）」為目標日
 *   node scripts/rotate-daily.mjs 2026.08.08      # 指定目標日（YYYY.MM.DD）
 *   node scripts/rotate-daily.mjs payload.json    # 以 payload 覆寫內容（含來源連結等）
 *
 * payload.json 選填欄位（有給才覆寫，沒給則沿用既有／樣板）：
 * {
 *   "date": "2026.08.08",          // 目標日；未給則用今天（台北）
 *   "dateLabel": "2026/08/08（六）",// 未給則自動由 date 推算週幾
 *   "subtitle": "…",               // 當日主題副標；未給沿用既有
 *   "summary": "【日報】…👇",       // 社群分享摘要；未給則以樣板套用新日期
 *   "highlights": ["…", "…"],       // 內文重點條列；未給沿用既有
 *   "hashtags": "…",
 *   "source": "https://drive.google.com/…", // 當日 Drive 原文連結
 *   "coverDrive": "https://drive.google.com/thumbnail?id=…",
 *   "note": "…"
 * }
 *
 * 換日邏輯與熱力圖一致：僅在「確實換到新的一日」時才把前一日歸檔（依 no 去重）。
 * 任何檔案缺失／解析失敗都會以非零離開碼結束並印出原因，方便排程判斷。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DF = resolve(ROOT, "data/daily.json");        // 最新一日（daily.html 讀取）
const DA = resolve(ROOT, "data/daily-archive.json"); // 歷期彙整（kind「日報」）
const FF = resolve(ROOT, "data/focus.json");        // 今日關注動態
const SITE_URL = "https://allenchen1113official.github.io/AllenI3Aurora/";

function die(msg) {
  console.error("rotate-daily 失敗：" + msg);
  process.exit(1);
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    die(`無法讀取 ${path}：${e.message}`);
  }
}

// 台北（UTC+8）當日日期，回傳 { ymd:"YYYYMMDD", disp:"YYYY.MM.DD" }
function taipeiToday() {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  const Y = t.getUTCFullYear();
  const M = String(t.getUTCMonth() + 1).padStart(2, "0");
  const D = String(t.getUTCDate()).padStart(2, "0");
  return { ymd: `${Y}${M}${D}`, disp: `${Y}.${M}.${D}` };
}

// 由 YYYY.MM.DD 產生「YYYY/MM/DD（週幾）」標籤（週幾以 UTC 計，與日期無關）
function dateLabelFor(disp) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(disp);
  if (!m) return disp;
  const [, Y, M, D] = m;
  const wd = new Date(Date.UTC(+Y, +M - 1, +D)).getUTCDay();
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  return `${Y}/${M}/${D}（${names[wd]}）`;
}

// 由摘要文字擷取標題（去【】前綴與「艾倫極光日報｜日期」，取到第一個句號前）
function headlineFrom(summary) {
  return String(summary || "")
    .replace(/^【[^】]*】/, "")
    .replace(/^\s*艾倫極光日報[｜|]\s*[\d.]+\s*/, "")
    .replace(/。.*$/, "")
    .trim();
}

function summaryTemplate(disp) {
  return `【日報】艾倫極光日報｜${disp} 科技、旅行、攝影與音樂的每日精選速報，用三分鐘掌握今天最值得知道的動態。洞察世界·累積智慧·點亮未來，完整日報看這裡👇`;
}

/* ---------- 解析參數：可為 payload.json 路徑、YYYY.MM.DD、或無 ---------- */
let payload = {};
const arg = process.argv[2];
if (arg) {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(arg)) {
    payload = { date: arg };
  } else {
    payload = readJson(resolve(process.cwd(), arg));
  }
}

const targetDisp = payload.date || taipeiToday().disp;
if (!/^\d{4}\.\d{2}\.\d{2}$/.test(targetDisp)) {
  die(`date 格式需為 YYYY.MM.DD（收到：${targetDisp}）`);
}
const targetLabel = payload.dateLabel || dateLabelFor(targetDisp);

/* ---------- 1) 讀取目前 data/daily.json ---------- */
const cur = readJson(DF, {});

if (cur.date === targetDisp) {
  console.log(`目前 data/daily.json 已是 ${targetDisp}，僅刷新 asOf/updatedAt，不重複歸檔。`);
}

/* ---------- 2) 前一日 → data/daily-archive.json（僅在確實換日時） ---------- */
if (cur.date && cur.date !== targetDisp) {
  const arch = readJson(DA, []);
  const list = Array.isArray(arch) ? arch : [];
  const prevNo = "daily-" + String(cur.date).replace(/\D/g, "");
  if (!list.some((x) => String(x.no) === prevNo)) {
    const prevSummary = cur.summary || summaryTemplate(cur.date);
    list.unshift({
      no: prevNo,
      kind: "日報",
      date: cur.date,
      tone: "illumination",
      title: `艾倫極光日報｜${cur.date}`,
      subtitle: cur.subtitle || headlineFrom(prevSummary),
      cover: (cur.cover && (cur.cover.drive || SITE_URL + "assets/rabbit-reading.jpeg")) || SITE_URL + "assets/rabbit-reading.jpeg",
      author: "Allen Chen 主編",
      readMinutes: 3,
      items: 4,
      summary: prevSummary,
      // 連結優先前一日的 Drive 原文（source），否則連該日站內日報頁。
      link: cur.source || SITE_URL + "daily.html",
    });
    writeFileSync(DA, JSON.stringify(list, null, 2) + "\n");
    console.log(`已將前一日艾倫極光日報（${cur.date}）移入 data/daily-archive.json：${prevNo}`);
  } else {
    console.log(`歷期彙整已存在 ${prevNo}，略過歸檔。`);
  }
}

/* ---------- 3) 覆寫 data/daily.json 為最新一日 ---------- */
const next = Object.assign({}, cur);
next.date = targetDisp;
next.dateLabel = targetLabel;
next.asOf = targetDisp;
next.title = cur.title || "艾倫極光日報";
next.subtitle = payload.subtitle || cur.subtitle || "科技 · 旅行 · 攝影 · 音樂 每日精選速報";
next.summary = payload.summary || summaryTemplate(targetDisp);
next.hashtags = payload.hashtags || cur.hashtags || "#艾倫極光日報 #日報 #科技 #旅行 #攝影 #音樂 #每日速報 #艾倫報報 #AllenI3Aurora #洞察世界 #累積智慧 #點亮未來";
if (Array.isArray(payload.highlights) && payload.highlights.length) {
  next.highlights = payload.highlights.slice(0, 4);
} else if (!Array.isArray(next.highlights)) {
  next.highlights = [
    "科技、旅行、攝影、音樂四大主題，每日精選一次掌握。",
    "用三分鐘掌握今天最值得知道的動態。",
  ];
}
next.cover = Object.assign({ title: "今日日報封面", local: "assets/rabbit-reading.jpeg" }, cur.cover || {});
if (payload.coverDrive) next.cover.drive = payload.coverDrive;
if (payload.source) next.source = payload.source;
if (payload.note) next.note = payload.note;
next.updatedAt = new Date().toISOString();
writeFileSync(DF, JSON.stringify(next, null, 2) + "\n");
console.log(`已更新 data/daily.json → ${targetDisp}（${targetLabel}）`);

/* ---------- 4) 同步更新 data/focus.json 的「日報」卡片 ---------- */
try {
  const focus = readJson(FF, null);
  if (focus && Array.isArray(focus.items)) {
    const daily = focus.items.find((it) => it && it.tag === "日報");
    if (daily) {
      daily.summary = next.summary;
      daily.meta = `${targetDisp} · 每日速報`;
      daily.link = SITE_URL + "daily.html";
    }
    focus.asOf = targetDisp;
    focus.updatedAt = next.updatedAt;
    writeFileSync(FF, JSON.stringify(focus, null, 2) + "\n");
    console.log("已同步 data/focus.json 的日報卡片（meta／summary 帶入新日期）");
  }
} catch (e) {
  console.error("更新 data/focus.json 失敗（略過）：", e.message);
}
