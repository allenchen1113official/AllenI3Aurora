#!/usr/bin/env node
/*
 * 台股熱力圖「更新為最新日期＋前一日移入歷期彙整」的可重複執行腳本。
 *
 * 用途：供每日下午 20:00 排程（見 docs/heatmap-daily-schedule.md）呼叫，
 * 把當日新產出的熱力圖切換為「最新一日」，並將前一日圖卡歸檔到
 * data/heatmap-archive.json（前台「歷期彙整」以 kind「熱力圖」呈現）。
 *
 * 執行順序（每日排程內）：
 *   1) 先用 taiex-heatmap skill 查證當日真實收盤、產出四張圖到暫存目錄。
 *   2) node scripts/rotate-heatmap.mjs <payload.json>
 *        —— 讀取「目前（前一日）」data/heatmap.json，把現有站內圖複製到
 *           assets/heatmap/archive/<market>-<YYYYMMDD>-<fmt>.png，
 *           前一日資訊 unshift 進 data/heatmap-archive.json（依 no 去重），
 *           再依 payload 覆寫 data/heatmap.json 為「最新一日」。
 *   3) 把暫存目錄的新圖覆蓋 assets/heatmap/{twse,tpex}-heatmap-{fb,ig}.png。
 *   4) git commit / push。
 *
 * payload.json 格式（皆為字串，除 up 為布林）：
 * {
 *   "date": "2026.08.07",
 *   "dateLabel": "2026/08/07（五）",
 *   "asOf": "2026.08.07",
 *   "taiex": { "index": "44,225.91", "change": "-170.79", "changePct": "-0.38%", "up": false },
 *   "tpex":  { "index": "384.19",   "change": "-7.18",   "changePct": "-1.83%", "up": false },
 *   "summary": "…",
 *   "hashtags": "…",
 *   "note": "…"
 * }
 *
 * 任何檔案缺失／解析失敗都會以非零離開碼結束並印出原因，方便排程判斷。
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HM = resolve(ROOT, "data/heatmap.json");
const HA = resolve(ROOT, "data/heatmap-archive.json");
const ASSET_DIR = resolve(ROOT, "assets/heatmap");
const ARCHIVE_DIR = resolve(ASSET_DIR, "archive");

const FORMATS = ["fb", "ig"];
const MARKETS = ["twse", "tpex"];

function die(msg) {
  console.error("rotate-heatmap 失敗：" + msg);
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

const payloadPath = process.argv[2];
if (!payloadPath) die("缺少 payload.json 參數。用法：node scripts/rotate-heatmap.mjs <payload.json>");
const payload = readJson(resolve(process.cwd(), payloadPath));

for (const k of ["date", "dateLabel", "taiex", "tpex"]) {
  if (!payload[k]) die(`payload 缺少必要欄位：${k}`);
}

const ymd = String(payload.date).replace(/\D/g, "");
if (ymd.length !== 8) die(`date 格式需為 YYYY.MM.DD（收到：${payload.date}）`);

const cur = readJson(HM, {});

// 前一日 → 歷期彙整（僅在確實換到新的一日時）
if (cur.date && cur.date !== payload.date) {
  const prevYmd = String(cur.date).replace(/\D/g, "");
  if (prevYmd.length === 8) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    // 把「目前站內圖」複製為前一日的歸檔圖（在被新圖覆蓋前先保存）
    const archivedRel = {};
    for (const m of MARKETS) {
      for (const fmt of FORMATS) {
        const src = resolve(ASSET_DIR, `${m}-heatmap-${fmt}.png`);
        if (existsSync(src)) {
          const destRel = `assets/heatmap/archive/${m}-${prevYmd}-${fmt}.png`;
          copyFileSync(src, resolve(ROOT, destRel));
          archivedRel[`${m}-${fmt}`] = "/AllenI3Aurora/" + destRel;
        }
      }
    }
    const arch = readJson(HA, []);
    const list = Array.isArray(arch) ? arch : [];
    const prevNo = "heatmap-" + prevYmd;
    if (!list.some((x) => String(x.no) === prevNo)) {
      const listedCover = archivedRel["twse-fb"] || (cur.listed && cur.listed.drive) || "";
      const otcCover = archivedRel["tpex-fb"] || (cur.otc && cur.otc.drive) || "";
      list.unshift({
        no: prevNo,
        kind: "熱力圖",
        date: cur.date,
        tone: "insight",
        title: `台股熱力圖 · 上市／上櫃｜${cur.date}`,
        cover: listedCover || otcCover,
        link: listedCover || otcCover,
        listed: listedCover,
        otc: otcCover,
        summary: cur.summary || "",
        items: 2,
      });
      writeFileSync(HA, JSON.stringify(list, null, 2) + "\n");
      console.log(`已將前一日（${cur.date}）熱力圖移入 data/heatmap-archive.json：${prevNo}`);
    } else {
      console.log(`歷期彙整已存在 ${prevNo}，略過歸檔。`);
    }
  }
} else if (cur.date === payload.date) {
  console.log(`目前 data/heatmap.json 已是 ${payload.date}，僅覆寫內容、不重複歸檔。`);
}

// 覆寫 data/heatmap.json 為最新一日
const next = {
  date: payload.date,
  dateLabel: payload.dateLabel,
  asOf: payload.asOf || payload.date,
  taiex: Object.assign({ name: "加權指數 TAIEX" }, payload.taiex),
  tpex: Object.assign({ name: "櫃買指數 TPEx" }, payload.tpex),
  summary: payload.summary || cur.summary || "",
  hashtags: payload.hashtags || cur.hashtags || "",
  listed: Object.assign(
    { title: "上市 · TWSE", subtitle: "市值前 100 大代表股", drive: "", local: "assets/heatmap/twse-heatmap-fb.png" },
    cur.listed || {},
    payload.listed || {}
  ),
  otc: Object.assign(
    { title: "上櫃 · TPEx", subtitle: "市值前 50 大代表股", drive: "", local: "assets/heatmap/tpex-heatmap-fb.png" },
    cur.otc || {},
    payload.otc || {}
  ),
  note: payload.note || cur.note || "",
  updatedAt: payload.updatedAt || new Date().toISOString(),
};

writeFileSync(HM, JSON.stringify(next, null, 2) + "\n");
console.log(`已更新 data/heatmap.json → ${payload.date}（${payload.dateLabel}）`);
