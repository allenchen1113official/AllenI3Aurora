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

/* ---------- 常看頻道：後台寫入 payload ↔ firestore.rules 白名單（本環境無法起模擬器，改靜態比對） ---------- */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("常看頻道：規則公開讀、僅管理者寫 channels、欄位白名單與上限和後台一致", () => {
  const rules = readFileSync(join(ROOT, "firebase/firestore.rules"), "utf8");
  const panel = readFileSync(join(ROOT, "admin/youtube.jsx"), "utf8");
  const block = rules.match(/match \/aurora_ytnotes\/\{doc\} \{([\s\S]*?)\n    \}/)[1];
  assert.match(block, /allow read: if true;/);
  assert.match(block, /isOwner\(\) && doc == 'channels'/);
  const allowed = [...block.match(/hasOnly\(\[([^\]]+)\]\)/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  const set = panel.match(/YTN_DOC\(\)\.set\(\{ items: [\s\S]*?\), updatedAt: at \}\)/);
  assert.ok(set, "後台以 set({ items, updatedAt }) 寫入");
  assert.deepEqual(allowed, ["items", "updatedAt"]);
  const max = Number(block.match(/items\.size\(\) <= (\d+)/)[1]);
  assert.equal(Number(panel.match(/const YTN_MAX = (\d+);/)[1]), max);
  assert.match(panel, /db\.collection\("aurora_ytnotes"\)\.doc\("channels"\)/);
  // Mac mini 引擎讀的就是這份文件
  const py = readFileSync(join(ROOT, "scripts/ytnotes/ytnotes.py"), "utf8");
  assert.match(py, /projects\/alleni3aurora\/databases\/\(default\)\/documents\/aurora_ytnotes\/channels/);
});

test("筆記影片：規則只多開 videos 一份文件（上限 100）、後台寫入欄位與引擎讀取網址一致", () => {
  const rules = readFileSync(join(ROOT, "firebase/firestore.rules"), "utf8");
  const panel = readFileSync(join(ROOT, "admin/youtube.jsx"), "utf8");
  const py = readFileSync(join(ROOT, "scripts/ytnotes/ytnotes.py"), "utf8");
  const block = rules.match(/match \/aurora_ytnotes\/\{doc\} \{([\s\S]*?)\n    \}/)[1];
  const writes = block.split("allow write:").slice(1);
  assert.equal(writes.length, 2, "只有 channels 與 videos 兩條寫入規則");
  const v = writes.find((w) => /doc == 'videos'/.test(w));
  assert.match(v, /isOwner\(\) && doc == 'videos'/);
  assert.deepEqual([...v.match(/hasOnly\(\[([^\]]+)\]\)/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort(), ["items", "updatedAt"]);
  assert.equal(Number(v.match(/items\.size\(\) <= (\d+)/)[1]), Number(panel.match(/const YTV_MAX = (\d+);/)[1]));
  assert.match(panel, /YTV_DOC\(\)\.set\(\{ items: out, updatedAt: at \}\)/);
  assert.match(panel, /db\.collection\("aurora_ytnotes"\)\.doc\("videos"\)/);
  assert.match(py, /"videos_url": "https:\/\/firestore\.googleapis\.com\/v1\/projects\/alleni3aurora\/databases\/\(default\)\/documents\/aurora_ytnotes\/videos"/);
  // 影片 ID 規則：後台 videoKey 與引擎 video_key 用同一組網址樣式
  assert.match(panel, /\(\?:v=\|youtu\\\.be\\\/\|shorts\\\/\|live\\\/\|embed\\\/\)\(\[A-Za-z0-9_-\]\{11\}\)/);
  assert.match(py, /\(\?:v=\|youtu\\\.be\/\|shorts\/\|live\/\|embed\/\)\(\[A-Za-z0-9_-\]\{11\}\)/);
  assert.match(py, /def _run_batch\(\):[\s\S]*?sync_remote_videos\(\)[\s\S]*?q = read_queue\(\)/);
});
