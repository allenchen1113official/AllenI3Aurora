/* 常看 YouTube 轉錄進度：伺服器端精簡／變更判斷，以及引擎 ↔ 同步 ↔ 面板 ↔ 規則 ↔ workflow 的接線
   node --test scripts/ytnotes/progress.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slimProgress, changed, DOC, DRIVE_PATH, ITEM_STATES } from "./sync-progress.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const sample = () => ({
  version: 1, updatedAt: "2026-11-24T10:12:00+08:00", host: "Allen-Mac-mini",
  engine: { state: "running", startedAt: "2026-11-24T10:00:00+08:00", endedAt: null, processed: 4, batchMax: 20, intervalSec: 900 },
  current: { id: "Ffh9OeJ7yxw", url: "https://www.youtube.com/watch?v=Ffh9OeJ7yxw", title: "800+ hours", stage: "transcribe", stageLabel: "轉錄中",
    startedAt: "2026-11-24T10:10:00+08:00", stageAt: "2026-11-24T10:11:00+08:00", durationSec: 480, lang: "en" },
  queue: [{ id: "Ffh9OeJ7yxw", url: "https://www.youtube.com/watch?v=Ffh9OeJ7yxw" }, { id: null, url: "https://example.com/x" }],
  items: [
    { id: "Ffh9OeJ7yxw", state: "processing", stage: "transcribe", stageLabel: "轉錄中", title: "800+ hours", at: "2026-11-24T10:11:00+08:00" },
    { id: "YAsxyoTWFDA", state: "queued", url: "https://www.youtube.com/watch?v=YAsxyoTWFDA" },
    { id: "YAsxyoTWFDA", state: "queued" },                                          // 重複 → 去掉
    { id: "6eBSHbLKuN0", state: "drafted", title: "t".repeat(500), durationSec: 1687, draftSeconds: 201, transcript: "不應外流" },
    { id: "bad id!", state: "drafted" },                                              // 非法 id → 去掉
    { id: "XXXXXXXXXXX", state: "failed", error: "e".repeat(900), url: "javascript:alert(1)" },
    { id: "en0GuyhieQk", state: "done", package: "20261124/pilotone/en0GuyhieQk" },
    { id: "ZZZZZZZZZZZ", state: "hacked" },                                           // 未知狀態 → 視為排隊中
  ],
  failures: [{ at: "2026-11-24 10:12", url: "https://youtu.be/XXXXXXXXXXX", id: "XXXXXXXXXXX", error: "403" }],
  log: Array.from({ length: 30 }, (_, i) => "line " + i),
});

test("slimProgress：白名單欄位、去重、長度上限、計數、不外流逐字稿", () => {
  const d = slimProgress(sample(), { driveModified: "2026-11-24T02:12:30.000Z", syncedAt: "2026-11-24T02:13:00.000Z" });
  assert.equal(d.version, 1);
  assert.equal(d.engine.state, "running");
  assert.equal(d.current.stageLabel, "轉錄中");
  assert.deepEqual(d.items.map((x) => x.id), ["Ffh9OeJ7yxw", "YAsxyoTWFDA", "6eBSHbLKuN0", "XXXXXXXXXXX", "en0GuyhieQk", "ZZZZZZZZZZZ"]);
  assert.equal(d.items[5].state, "queued");
  assert.equal(d.items[2].title.length, 160);
  assert.equal(d.items[3].error.length, 300);
  assert.equal(d.items[3].url, "https://www.youtube.com/watch?v=XXXXXXXXXXX");       // 非 https 網址改回標準連結
  assert.equal(d.items[4].package, "20261124/pilotone/en0GuyhieQk");
  assert.equal(d.items[0].stage, "transcribe");
  assert.equal(d.items[1].stage, undefined);
  assert.deepEqual(d.counts, { processing: 1, queued: 2, drafted: 1, failed: 1, done: 1 });
  assert.deepEqual(d.queue.map((q) => q.id), ["Ffh9OeJ7yxw"]);
  assert.equal(d.log.length, 12);
  assert.equal(d.driveModified, "2026-11-24T02:12:30.000Z");
  assert.ok(!JSON.stringify(d).includes("不應外流"));
  assert.ok(!JSON.stringify(d).includes("javascript:"));
});

test("slimProgress：空檔／壞資料不丟例外；掃描頻道時 current 沒有影片 id 也保留", () => {
  const empty = slimProgress(null);
  assert.equal(empty.engine.state, "idle");
  assert.deepEqual([empty.items, empty.queue, empty.failures, empty.current], [[], [], [], null]);
  assert.deepEqual(Object.keys(empty.counts), ITEM_STATES);
  const scan = slimProgress({ engine: { state: "running" }, current: { stage: "scan", stageLabel: "掃描常看頻道" } });
  assert.equal(scan.current.stage, "scan");
  assert.equal(slimProgress({ current: { stage: "evil" } }).current, null);
  assert.equal(slimProgress({ engine: { state: "pwned" } }).engine.state, "idle");
});

test("changed：引擎時間或 Drive 修改時間變了才寫", () => {
  const a = slimProgress(sample(), { driveModified: "2026-11-24T02:12:30.000Z" });
  assert.equal(changed(null, a), true);
  assert.equal(changed({ ...a }, { ...a, syncedAt: "later" }), false);
  assert.equal(changed(a, { ...a, updatedAt: "2026-11-24T10:13:00+08:00" }), true);
  assert.equal(changed(a, { ...a, driveModified: "2026-11-24T02:14:00.000Z" }), true);
});

test("接線：引擎寫的路徑＝同步讀的路徑；面板讀的文件＝同步寫的文件；規則管理者唯讀", () => {
  const py = read("scripts/ytnotes/ytnotes.py");
  assert.deepEqual(DRIVE_PATH.slice(-2), ["_engine", "progress.json"]);
  assert.match(py, /PROGRESS = lambda: ENGINE \/ "progress\.json"/);
  assert.match(py, /ENGINE = ROOT \/ "_engine"/);
  const hub = read("admin/content-hub.jsx");
  assert.ok(hub.includes(`const YTP_DOC = "${DOC}";`));
  assert.match(hub, /db\.doc\(YTP_DOC\)\.onSnapshot/);
  for (const s of ITEM_STATES) assert.match(hub, new RegExp(`\\b${s}:\\s*\\{ label:`), `面板缺狀態 ${s}`);
  const rules = read("firebase/firestore.rules");
  assert.match(rules, /match \/aurora_ops\/\{doc\} \{ allow read: if isOwner\(\); allow write: if false; \}/);
  // Python 的階段代碼 ⊆ 同步白名單（新增階段時兩邊要一起改）
  const pyStages = [...py.match(/STAGES = \{([\s\S]*?)\n\}/)[1].matchAll(/"(\w+)":/g)].map((m) => m[1]);
  const { STAGES } = { STAGES: read("scripts/ytnotes/sync-progress.mjs").match(/export const STAGES = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1)) };
  assert.deepEqual(pyStages.sort(), [...STAGES].sort());
});

test("接線：social-publish 常駐輪詢會跑轉錄進度同步，且單輪模式也跑", () => {
  const wf = read(".github/workflows/social-publish.yml");
  assert.match(wf, /progress_once\(\) \{[\s\S]*?node scripts\/ytnotes\/sync-progress\.mjs/);
  // #182 起單輪模式在 publish_once 與 progress_once 之間多了 feed_once（Podcast RSS 託管），允許中間夾一個步驟
  assert.match(wf, /ingest_once; publish_once;(?: feed_once[^;\n]*;)? progress_once/);
  assert.match(wf, /publish_once\n\s+progress_once|publish_once;(?: feed_once[^;\n]*;)? progress_once/);
  assert.match(wf, /scripts\/ytnotes\/progress\.test\.mjs/);
});
