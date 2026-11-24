import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

/* 常聽 Podcast 重點筆記（雲端管線 podnotes.yml）：規則、workflow、管線、前台彼此一致；逐字稿絕不進 repo。 */
test("規則：逐字稿管理者唯讀、前端不可寫；啟用節目公開讀、管理者寫", () => {
  const rules = readFileSync("firebase/firestore.rules", "utf8");
  assert.match(rules, /match \/aurora_podcast_transcripts\/\{doc\} \{ allow read: if isOwner\(\); allow write: if false; \}/);
  assert.match(rules, /match \/aurora_podnotes\/\{doc\}/);
});

test("workflow：排程有台北註解、金鑰走 Secrets、只提交前台資料與 content 送審包", () => {
  const wf = readFileSync(".github/workflows/podnotes.yml", "utf8");
  for (const m of wf.matchAll(/- cron: "([^"]+)"\s*(#.*)?/g)) assert.match(m[2] || "", /台北/, `cron ${m[1]} 缺台北時間註解`);
  assert.match(wf, /ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
  assert.match(wf, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
  assert.match(wf, /python scripts\/podnotes\/pipeline\.py --content-dir _content/);
  assert.match(wf, /git add data\/podnotes\.json assets\/podnotes\n/);
  assert.match(wf, /ref: content/);
  assert.doesNotMatch(wf, /git add[^\n]*transcript/i, "workflow 不應提交逐字稿");
});

test("管線：逐字稿只寫 Firestore、不寫檔進 repo；圖卡為莫蘭迪藍；送審 topic pn-<集數ID>", () => {
  const py = readFileSync("scripts/podnotes/pipeline.py", "utf8");
  assert.match(py, /COLL = "aurora_podcast_transcripts"/);
  assert.match(py, /"transcript": md\[:MAX_TRANSCRIPT\]/);
  assert.doesNotMatch(py, /REPO \/ "data" \/ [^\n]*transcript/i);
  const pkg = readFileSync("scripts/podnotes/make_package.py", "utf8");
  assert.match(pkg, /CARD_THEME = "morandi-blue"/);
  assert.match(pkg, /"topic": f"pn-\{eid\}"/);
  assert.ok(existsSync("scripts/podnotes/prompt.md"));
  assert.match(readFileSync("scripts/podnotes/prompt.md", "utf8"), /非投資建議/);
});

test("前台資料不含逐字稿；Mac mini 引擎預設不掃 Podcast（避免兩條路線重複處理）", () => {
  const d = JSON.parse(readFileSync("data/podnotes.json", "utf8"));
  assert.ok(Array.isArray(d.items));
  assert.equal(/transcript/i.test(JSON.stringify(d)), false);
  assert.match(readFileSync("aurora-data.js", "utf8"), /data\/podnotes\.json/);
  assert.match(readFileSync("scripts/ytnotes/ytnotes.py", "utf8"), /"podcast_feeds_url": "",/);
  const feeds = JSON.parse(readFileSync("scripts/podcast/feeds.json", "utf8")).shows;
  for (const s of feeds) assert.match(s.code, /^[a-z0-9][a-z0-9-]{1,30}$/, s.show);
  assert.deepEqual(feeds.filter((s) => s.notes).map((s) => s.code).sort(), ["ailanren", "yutinghao", "zhaohua"]);
});
