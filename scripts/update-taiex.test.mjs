// 測試：node --test scripts/update-taiex.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseHistory, parseRealtime, pickResult } from "./update-taiex.mjs";

// 台北時間 → Date
const tp = (s) => new Date(s + "+08:00");
const hist = parseHistory([
  { Date: "1151113", ClosingIndex: "43,675.12" },
  { Date: "1151116", ClosingIndex: "41,040.08" },
]);
const mis = (d, z, y, t = "13:30:00") => ({ msgArray: [{ d, z, y, t }] });

test("OpenAPI 民國日期解析成 date", () => {
  assert.equal(hist.date, "2026-11-16");
  assert.equal(hist.value, "41,040.08");
});

test("跨過台北午夜：MIS 前一交易日收盤仍採用（舊版會退回 OpenAPI 11/16）", () => {
  const rt = parseRealtime(mis("20261117", "40092.11", "41040.08"), hist, tp("2026-11-18T00:37:00"));
  assert.equal(rt.date, "2026-11-17");
  assert.equal(rt.value, "40,092.11");
  assert.equal(rt.live, false);
  assert.equal(rt.asOf, "2026-11-17 收盤");
  assert.equal(rt.data.at(-1), 40092.11);
  assert.equal(rt.data.at(-2), 41040.08);
});

test("盤中：只收今日資料；昨日快照 → null", () => {
  assert.equal(parseRealtime(mis("20261117", "40092.11", "41040.08"), hist, tp("2026-11-18T09:05:00")), null);
  const rt = parseRealtime(mis("20261118", "40300.00", "40092.11", "09:05:00"), hist, tp("2026-11-18T09:05:00"));
  assert.equal(rt.live, true);
  assert.equal(rt.asOf, "09:05:00 盤中");
});

test("MIS 比 OpenAPI 舊 → 不採用", () => {
  assert.equal(parseRealtime(mis("20261113", "43675.12", "43000"), hist, tp("2026-11-18T20:00:00")), null);
});

test("OpenAPI 已含同日收盤 → 走勢不重複", () => {
  const h2 = parseHistory([{ Date: "1151116", ClosingIndex: "41040.08" }, { Date: "1151117", ClosingIndex: "40092.11" }]);
  const rt = parseRealtime(mis("20261117", "40092.11", "41040.08"), h2, tp("2026-11-17T20:00:00"));
  assert.deepEqual(rt.data, [41040.08, 40092.11]);
});

test("防回退：MIS 失敗且 OpenAPI 落後時，不覆蓋較新的現有檔案", () => {
  const existing = { value: "40,092.11", asOf: "2026-11-17 收盤", live: false };
  assert.equal(pickResult({ realtime: null, history: hist, existing }), null);
});

test("較新的資料照常寫入；無現檔也可寫", () => {
  const existing = { value: "41,040.08", asOf: "2026-11-16 收盤", live: false };
  const rt = parseRealtime(mis("20261117", "40092.11", "41040.08"), hist, tp("2026-11-18T00:37:00"));
  assert.equal(pickResult({ realtime: rt, history: hist, existing }).value, "40,092.11");
  assert.equal(pickResult({ realtime: null, history: hist, existing: null }).value, "41,040.08");
});

test("OpenAPI 比 MIS 新時取 OpenAPI", () => {
  const h2 = parseHistory([{ Date: "1151117", ClosingIndex: "40092.11" }, { Date: "1151118", ClosingIndex: "40500" }]);
  const rt = { value: "40,092.11", date: "2026-11-17", live: false };
  assert.equal(pickResult({ realtime: rt, history: h2, existing: null }).value, "40,500.00");
});

/* ── 更新時程（scripts/taiex-schedule.mjs）與空提交防護 ───────────────── */
import { planNext } from "./taiex-schedule.mjs";
import { shouldWrite } from "./update-taiex.mjs";

test("時程：交易日交易期間每 2 分鐘即時更新", () => {
  // 2026-11-26（週四）開盤後、資料日已是今天
  assert.deepEqual(planNext(tp("2026-11-26T09:00:00"), "2026-11-25"), { phase: "trading", delaySec: 120, at: "2026-11-26 09:02" });
  const p = planNext(tp("2026-11-26T12:32:00"), "2026-11-26");
  assert.equal(p.phase, "trading"); assert.equal(p.delaySec, 120);
});

test("時程：接近收盤不睡過頭，13:36 取收盤", () => {
  const p = planNext(tp("2026-11-26T13:34:30"), "2026-11-26");
  assert.equal(p.phase, "trading"); assert.equal(p.delaySec, 90); assert.equal(p.at, "2026-11-26 13:36");
});

test("時程：收盤後依序 13:45、15:10，之後等隔日 01:00", () => {
  assert.deepEqual(planNext(tp("2026-11-26T13:36:10"), "2026-11-26"), { phase: "close", delaySec: 530, at: "2026-11-26 13:45" });
  assert.equal(planNext(tp("2026-11-26T13:45:10"), "2026-11-26").at, "2026-11-26 15:10");
  const night = planNext(tp("2026-11-26T15:10:30"), "2026-11-26");
  assert.equal(night.phase, "daily"); assert.equal(night.at, "2026-11-27 01:00");
});

test("時程：01:00 更新後等當日開盤（平日）", () => {
  const p = planNext(tp("2026-11-27T01:00:20"), "2026-11-26");
  assert.equal(p.phase, "open"); assert.equal(p.at, "2026-11-27 09:00");
});

test("時程：週末與非交易日只在每日 01:00 更新", () => {
  // 週五收盤後 → 週六 01:00 → 週日 01:00 → 週一 01:00 → 週一 09:00 開盤
  assert.equal(planNext(tp("2026-11-27T15:10:30"), "2026-11-27").at, "2026-11-28 01:00");
  assert.equal(planNext(tp("2026-11-28T01:00:30"), "2026-11-27").at, "2026-11-29 01:00");
  assert.equal(planNext(tp("2026-11-29T01:00:30"), "2026-11-27").at, "2026-11-30 01:00");
  assert.equal(planNext(tp("2026-11-30T01:00:30"), "2026-11-27").at, "2026-11-30 09:00");
  assert.equal(planNext(tp("2026-11-28T10:00:00"), "2026-11-27").phase, "daily"); // 週六白天不輪詢
});

test("時程：平日休市（09:40 後仍無今日資料）改每 15 分鐘探測，收盤後不再更新", () => {
  const p = planNext(tp("2026-11-26T09:41:00"), "2026-11-25");
  assert.equal(p.phase, "probe"); assert.equal(p.delaySec, 900);
  const after = planNext(tp("2026-11-26T13:40:00"), "2026-11-25");
  assert.equal(after.phase, "daily"); assert.equal(after.at, "2026-11-27 01:00");
});

test("空提交防護：內容相同且 6 小時內寫過 → 不重寫；滿 6 小時或內容有變 → 寫", () => {
  const ex = { value: "38,195.43", delta: "-4.80% · -1,926.92", points: -1926.92, pct: -4.8, data: [1, 2], date: "2026-11-25",
    asOf: "2026-11-25 收盤", live: false, updatedAt: "2026-11-25T07:10:00.000Z" };
  const same = { ...ex }; delete same.updatedAt;
  assert.equal(shouldWrite(same, ex, Date.parse("2026-11-25T09:00:00Z")), false);
  assert.equal(shouldWrite(same, ex, Date.parse("2026-11-25T17:00:00Z")), true);   // 台北 01:00 例行更新
  assert.equal(shouldWrite({ ...same, value: "38,200.00" }, ex, Date.parse("2026-11-25T07:12:00Z")), true);
  assert.equal(shouldWrite(same, null), true);
});
