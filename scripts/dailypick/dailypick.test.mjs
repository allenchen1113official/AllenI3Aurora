import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseTwse, parseTpex, buildQueue, serialize, toCsv, sane, normOverrides, tpeDate, TIER1 } from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// 合成母體：上市 120 檔（市值 = 1000..)、上櫃 60 檔
function fakeApi() {
  const twseQuotes = [], twseCompanies = [], tpexQuotes = [], tpexCompanies = [];
  for (let i = 0; i < 120; i++) {
    const code = String(1101 + i);
    twseQuotes.push({ Date: "1151123", Code: code, Name: "上市" + i, ClosingPrice: "100.00" });
    twseCompanies.push({ "公司代號": code, "公司簡稱": "上市" + i, "產業別": "24", "上市日期": "20000101", "已發行普通股數或TDR原股發行股數": String((200 - i) * 1e8) });
  }
  twseQuotes.push({ Date: "1151123", Code: "0050", Name: "ETF", ClosingPrice: "50" }, { Date: "1151123", Code: "2881A", Name: "特", ClosingPrice: "60" });
  for (let i = 0; i < 60; i++) {
    const code = String(6101 + i);
    tpexQuotes.push({ Date: "1151123", SecuritiesCompanyCode: code, CompanyName: "上櫃" + i, Close: "50.00", Capitals: String((100 - i) * 1e7) });
    tpexCompanies.push({ SecuritiesCompanyCode: code, CompanyAbbreviation: "上櫃" + i, SecuritiesIndustryCode: "28", DateOfListing: "20100101" });
  }
  tpexQuotes.push({ Date: "1151123", SecuritiesCompanyCode: "700001", CompanyName: "權證", Close: "1", Capitals: "1" });
  return { twseQuotes, twseCompanies, tpexQuotes, tpexCompanies };
}
const uni = () => { const a = fakeApi(); return [...parseTwse(a.twseQuotes, a.twseCompanies).rows, ...parseTpex(a.tpexQuotes, a.tpexCompanies).rows]; };

test("解析：只留 4 碼普通股、市值（億）、產業名稱、民國日期", () => {
  const a = fakeApi();
  const tw = parseTwse(a.twseQuotes, a.twseCompanies);
  assert.equal(tw.asof, "2026-11-23");
  assert.equal(tw.rows.length, 120);
  assert.deepEqual(tw.rows[0], { code: "1101", name: "上市0", market: "TWSE", close: 100, mcap: 20000, industry: "半導體業", listed: "2000-01-01" });
  const tp = parseTpex(a.tpexQuotes, a.tpexCompanies);
  assert.equal(tp.rows.length, 60);
  assert.equal(tp.rows[0].mcap, 50 * 100e7 / 1e8);
  assert.equal(tp.rows[0].industry, "電子零組件業");
});

test("順序：優先組（上市前 100＋上櫃前 50，依市值）→ 其餘依市值", () => {
  const q = buildQueue({ universe: uni(), today: "2026-11-24" });
  const t1 = q.items.filter((x) => x.tier === 1);
  assert.equal(t1.length, TIER1.TWSE + TIER1.TPEx);
  assert.ok(q.items.slice(0, 150).every((x) => x.tier === 1));
  // 上櫃第 1 名（市值 500 億）雖小於上市第 101 名（10,000 億），仍排在優先組
  const otc1 = q.items.find((x) => x.code === "6101");
  const tw101 = q.items.find((x) => x.code === "1201");
  assert.equal(otc1.tier, 1); assert.equal(tw101.tier, 2);
  assert.ok(otc1.rank < tw101.rank);
  for (let i = 1; i < 150; i++) assert.ok(q.items[i - 1].mcap >= q.items[i].mcap);
  assert.deepEqual(q.items.map((x) => x.rank), q.items.map((_, i) => i + 1));
  assert.equal(q.next[0].code, "1101");
  assert.equal(q.counts.newToday, 0, "第一次建立不算新增");
});

test("已分析不重複、略過排除、指定下一檔優先", () => {
  const history = [{ date: "2026-11-23", code: "1101", name: "上市0", score: 70.1, light: "綠燈", rating: "偏多", folder: "daily_pick/20261123" },
                   { date: "2026-11-20", code: "1101", score: 50 }];
  const q = buildQueue({ universe: uni(), history, overrides: { pin: ["6150", "1101", "bad"], skip: ["1102"] }, today: "2026-11-24" });
  const a = q.items.find((x) => x.code === "1101");
  assert.equal(a.status, "done"); assert.equal(a.analyzedAt, "2026-11-23"); assert.equal(a.score, 70.1); assert.equal(a.pinned, 0);
  assert.equal(q.items.find((x) => x.code === "1102").status, "skipped");
  assert.equal(q.items[0].code, "6150"); assert.equal(q.items[0].pinned, 1);
  assert.deepEqual(q.next.slice(0, 2).map((x) => x.code), ["6150", "1103"]);
  assert.equal(q.counts.done, 1); assert.equal(q.counts.skipped, 1);
  assert.deepEqual(normOverrides({ pin: ["2330", "2330", "x"], skip: null }), { pin: ["2330"], skip: [], updatedAt: "" });
});

test("每日更新：新上市記新增、下市保留紀錄、addedAt 沿用", () => {
  const u = uni();
  const prev = buildQueue({ universe: u.filter((x) => x.code !== "6160"), today: "2026-11-23", asof: "2026-11-23" });
  const u2 = u.filter((x) => x.code !== "1102");
  const q = buildQueue({ universe: u2, prev, today: "2026-11-24", history: [{ date: "2026-11-23", code: "1102", score: 60 }] });
  const n = q.items.find((x) => x.code === "6160");
  assert.equal(n.isNew, true); assert.equal(n.addedAt, "2026-11-24");
  assert.deepEqual(q.newToday, ["6160"]);
  assert.equal(q.items.find((x) => x.code === "1101").addedAt, "2026-11-23");
  const gone = q.items.find((x) => x.code === "1102");
  assert.equal(gone.status, "done"); assert.equal(gone.analyzedAt, "2026-11-23");
  const q3 = buildQueue({ universe: u2.filter((x) => x.code !== "1103"), prev: { ...q, asof: "2026-11-24" }, today: "2026-11-25" });
  assert.equal(q3.items.find((x) => x.code === "1103").status, "delisted");
  assert.equal(q3.items.at(-1).code, "1103");
});

test("輸出：每檔一行的 JSON 可還原、CSV 含 BOM 與中文狀態；健全性檢查", () => {
  const q = buildQueue({ universe: uni(), today: "2026-11-24" });
  const s = serialize(q);
  assert.deepEqual(JSON.parse(s).items, q.items);
  assert.equal(s.split("\n").filter((l) => l.startsWith('{"code"')).length, q.items.length);
  const csv = toCsv(q);
  assert.ok(csv.startsWith("﻿順序,代號"));
  assert.match(csv, /\n1,1101,上市0,上市,半導體業,優先組,1,20000,待分析,/);
  assert.equal(sane(uni()).ok, false);
  assert.match(tpeDate(Date.UTC(2026, 10, 23, 17, 0)), /^2026-11-24$/);
});

test("腳本離線執行：寫 queue.json／queue.csv；資料不足時不覆寫", () => {
  const dir = mkdtempSync(join(tmpdir(), "dp-"));
  const root = join(dir, "repo"); mkdirSync(join(root, "scripts", "dailypick"), { recursive: true }); mkdirSync(join(root, "data", "dailypick"), { recursive: true });
  for (const f of ["core.mjs", "update-queue.mjs"]) cpSync(join(HERE, f), join(root, "scripts", "dailypick", f));
  const api = join(dir, "api"); mkdirSync(api);
  // 放大到健全門檻以上
  const a = fakeApi();
  for (let i = 0; i < 700; i++) { const c = String(3000 + i); a.twseQuotes.push({ Date: "1151123", Code: c, Name: c, ClosingPrice: "10" }); a.twseCompanies.push({ "公司代號": c, "公司簡稱": c, "產業別": "20", "已發行普通股數或TDR原股發行股數": "100000000" }); }
  for (let i = 0; i < 500; i++) { const c = String(8000 + i); a.tpexQuotes.push({ Date: "1151123", SecuritiesCompanyCode: c, CompanyName: c, Close: "10", Capitals: "100000000" }); }
  for (const [k, v] of Object.entries(a)) writeFileSync(join(api, k + ".json"), JSON.stringify(v));
  writeFileSync(join(api, "overrides.json"), JSON.stringify({ pin: ["8001"] }));
  const out = execFileSync("node", [join(root, "scripts/dailypick/update-queue.mjs"), "--today", "2026-11-24", "--offline", api], { encoding: "utf8" });
  assert.match(out, /共 1380 檔/);
  const q = JSON.parse(readFileSync(join(root, "data/dailypick/queue.json"), "utf8"));
  assert.equal(q.next[0].code, "8001");
  assert.ok(readFileSync(join(root, "data/dailypick/queue.csv"), "utf8").includes("優先組"));
  const small = join(dir, "small"); mkdirSync(small);
  for (const [k, v] of Object.entries(fakeApi())) writeFileSync(join(small, k + ".json"), JSON.stringify(v));
  assert.throws(() => execFileSync("node", [join(root, "scripts/dailypick/update-queue.mjs"), "--offline", small], { stdio: "pipe" }));
});

test("初始檔（只有分析紀錄、沒有市值）之後的第一次正式建立，不把全部股票標為新增", () => {
  const init = buildQueue({ universe: [], history: [{ date: "2026-11-23", code: "1105", score: 69.8 }], today: "2026-11-24" });
  const q = buildQueue({ universe: uni(), prev: init, history: [{ date: "2026-11-23", code: "1105", score: 69.8 }], today: "2026-11-24", asof: "2026-11-23" });
  assert.equal(q.counts.newToday, 0);
  assert.equal(q.items.find((x) => x.code === "1105").status, "done");
});
