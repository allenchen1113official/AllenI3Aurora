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
