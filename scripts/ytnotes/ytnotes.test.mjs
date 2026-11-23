/* 常看 YouTube 重點筆記：首頁資料精簡邏輯測試  node --test scripts/ytnotes/ytnotes.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { slimIndex, MAX_ITEMS } from "./update-ytnotes.mjs";

test("slimIndex：過濾無效網址、新到舊、限制筆數與欄位", () => {
  const mk = (i, added) => ({ id: `vid${String(i).padStart(8, "0")}`, title: "t" + i, author: "A", url: `https://www.youtube.com/watch?v=${i}`,
    published: "2026-11-20", added, summary: ["a", "b", "c", "d", "e", "f"], cornell: { rows: [{ cue: "c", note: "n" }], summary: "s" },
    thumbnail: "javascript:alert(1)", transcript: "不應外流" });
  const idx = { updatedAt: "x", items: [mk(1, "20261121"), mk(2, "20261123"), { id: "bad", url: "javascript:1" }, ...Array.from({ length: 80 }, (_, i) => mk(i + 10, "20261101"))] };
  const out = slimIndex(idx);
  assert.equal(out.items.length, MAX_ITEMS);
  assert.equal(out.items[0].title, "t2");
  assert.ok(!out.items.some((x) => x.id === "bad"));
  assert.equal(out.items[0].summary.length, 5);
  assert.equal(out.items[0].thumbnail, "");
  assert.equal(out.items[0].transcript, undefined);
  assert.deepEqual(slimIndex(null).items, []);
});
