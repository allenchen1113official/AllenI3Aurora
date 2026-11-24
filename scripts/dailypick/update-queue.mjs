#!/usr/bin/env node
/* =====================================================================
   極光日報・每日來一股 · 更新個股分析順序清單
   讀：證交所／櫃買中心 OpenAPI（收盤價、已發行股數 → 市值）、data/dailypick/history.json（分析紀錄，
       由 Claude 排程「極光日報・每日來一股」每次分析完追加）、Firestore aurora_dailypick/overrides（後台指定／略過，公開讀）
   寫：data/dailypick/queue.json（後台「每日來一股」與 Claude 排程讀取）、data/dailypick/queue.csv（Excel 對照）
   用法：node scripts/dailypick/update-queue.mjs [--today YYYY-MM-DD] [--offline 目錄（測試用，讀 4 個 API 的 JSON 檔）]
   ===================================================================== */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTwse, parseTpex, buildQueue, serialize, toCsv, sane, tpeDate } from "./core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "data", "dailypick");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const today = arg("--today") || tpeDate();
const offline = arg("--offline");

const API = {
  twseQuotes: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  twseCompanies: "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
  tpexQuotes: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
  tpexCompanies: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O",
};
const OVERRIDES_URL = "https://firestore.googleapis.com/v1/projects/alleni3aurora/databases/(default)/documents/aurora_dailypick/overrides";

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "AllenI3Aurora-dailypick/1.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.warn(`[${i}/${tries}] ${url} 失敗：${e.message}`);
      if (i < tries) await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
  throw new Error("無法取得 " + url);
}
const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

// Firestore REST 文件 → 一般物件（只處理 pin／skip 字串陣列）
function fromFirestore(doc) {
  const f = (doc && doc.fields) || {};
  const arr = (k) => ((f[k] && f[k].arrayValue && f[k].arrayValue.values) || []).map((v) => v.stringValue || "");
  return { pin: arr("pin"), skip: arr("skip"), updatedAt: (f.updatedAt && f.updatedAt.stringValue) || "" };
}
async function loadOverrides() {
  try {
    const r = await fetch(OVERRIDES_URL);
    if (r.status === 404) return {};
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return fromFirestore(await r.json());
  } catch (e) { console.warn("讀取後台設定失敗（沿用無設定）：" + e.message); return {}; }
}

async function main() {
  const src = offline
    ? Object.fromEntries(Object.keys(API).map((k) => [k, readJson(join(offline, k + ".json"), [])]))
    : Object.fromEntries(await Promise.all(Object.entries(API).map(async ([k, u]) => [k, await getJson(u)])));
  const tw = parseTwse(src.twseQuotes, src.twseCompanies);
  const tp = parseTpex(src.tpexQuotes, src.tpexCompanies);
  const universe = [...tw.rows, ...tp.rows];
  const chk = sane(universe);
  if (!chk.ok) {
    console.error(`母體資料不足（上市 ${chk.tw}、上櫃 ${chk.tp} 檔有市值），不覆寫清單。`);
    process.exit(offline ? 1 : 0);
  }
  mkdirSync(OUT, { recursive: true });
  const prev = readJson(join(OUT, "queue.json"), null);
  const history = readJson(join(OUT, "history.json"), []);
  const overrides = offline ? readJson(join(offline, "overrides.json"), {}) : await loadOverrides();
  const q = buildQueue({ universe, prev, history, overrides, today, asof: [tw.asof, tp.asof].filter(Boolean).sort().pop() || "" });
  writeFileSync(join(OUT, "queue.json"), serialize(q));
  writeFileSync(join(OUT, "queue.csv"), toCsv(q));
  const c = q.counts;
  console.log(`分析順序清單 ${today}（資料 ${q.asof}）：共 ${c.total} 檔｜已分析 ${c.done}｜待分析 ${c.pending}（優先組剩 ${c.tier1Pending}）｜略過 ${c.skipped}｜下市 ${c.delisted}｜今日新增 ${c.newToday}`);
  console.log("下一檔：" + q.next.slice(0, 5).map((x) => `${x.code} ${x.name}`).join("、"));
  if (q.newToday.length) console.log("今日新增：" + q.newToday.join("、"));
}

main().catch((e) => { console.error(e); process.exit(1); });
