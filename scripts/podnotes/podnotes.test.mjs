import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slimIndex, cardFiles, staleCards, parseTranscriptMd, ID_RE } from "./podnotes-core.mjs";

const entry = {
  id: "yutinghao-20261124", code: "yutinghao", show: "游庭皓的財經皓角", author: "游庭皓的財經皓角", title: "T",
  url: "https://soundcloud.com/x", published: "2026-11-24", duration: "31 分", language: "zh", category: "理財",
  headline: "H", summary: ["a", "b", "c"], cornell: { rows: [{ cue: "c", note: "n" }], summary: "s" },
  cards: { fb: "20261124/pilotone/yutinghao-20261124/PodNotes_yutinghao-20261124_FB.png", ig: "20261124/pilotone/yutinghao-20261124/PodNotes_yutinghao-20261124_IG.png" },
  note_file: "notes/x.md", added: "20261124", transcript: "絕不能出現在前台的逐字稿",
};

test("索引 → 前台資料：只留顯示欄位、不含逐字稿與筆記檔路徑、圖卡改為網站路徑", () => {
  const d = slimIndex({ updatedAt: "u", items: [entry, { ...entry, id: "BAD" }, { ...entry, id: "zhaohua-20261123", added: "20261123" }] });
  assert.deepEqual(d.items.map((x) => x.id), ["yutinghao-20261124", "zhaohua-20261123"]);
  const it = d.items[0];
  assert.equal(it.transcript, undefined);
  assert.equal(it.note_file, undefined);
  assert.equal(JSON.stringify(d).includes("逐字稿"), false);
  assert.equal(it.date, "2026.11.24");
  assert.deepEqual(it.cards, { fb: "assets/podnotes/yutinghao-20261124_FB.png", ig: "assets/podnotes/yutinghao-20261124_IG.png" });
  assert.equal(slimIndex({ items: [{ ...entry, cards: { fb: "../../etc/passwd.png" } }] }).items[0].cards.fb, "");
  assert.equal(slimIndex({ items: [{ ...entry, url: "javascript:alert(1)" }] }).items[0].url, "");
});

test("圖卡清單與過期圖卡", () => {
  const slim = slimIndex({ items: [entry] }).items;
  assert.deepEqual(cardFiles([entry], slim).map((c) => c.site), ["assets/podnotes/yutinghao-20261124_FB.png", "assets/podnotes/yutinghao-20261124_IG.png"]);
  assert.deepEqual(staleCards(["yutinghao-20261124_FB.png", "old-20260101_IG.png", ".gitkeep"], slim), ["old-20260101_IG.png"]);
});

test("逐字稿檔解析：中繼資料＋本文；格式不符回傳 null", () => {
  const md = '<!-- podnotes-transcript {"id": "yutinghao-20261124", "show": "S", "title": "T", "published": "2026-11-24", "duration_sec": 1865, "language": "zh", "transcriber": "FunASR", "url": "https://x"} -->\n\n[00:00] 早安\n';
  const d = parseTranscriptMd(md, { id: "yutinghao-20261124", driveModified: "m", syncedAt: "s" });
  assert.equal(d.transcript, "[00:00] 早安");
  assert.equal(d.durationSec, 1865);
  assert.equal(d.chars, 10);
  assert.equal(d.driveModified, "m");
  assert.equal(parseTranscriptMd("", { id: "yutinghao-20261124" }), null);
  assert.equal(parseTranscriptMd("text", { id: "bad id" }), null);
  assert.equal(parseTranscriptMd("x".repeat(260000), { id: "a1-20261124" }).truncated, true);
  assert.ok(ID_RE.test("ai-lanren-20261124"));
});

test("接線：規則、workflow、引擎、送審包、前台彼此一致", () => {
  const rules = readFileSync("firebase/firestore.rules", "utf8");
  assert.match(rules, /match \/aurora_podcast_transcripts\/\{doc\} \{ allow read: if isOwner\(\); allow write: if false; \}/);
  assert.match(rules, /match \/aurora_podnotes\/\{doc\}/);
  const wf = readFileSync(".github/workflows/focus-update.yml", "utf8");
  assert.match(wf, /node scripts\/podnotes\/update-podnotes\.mjs/);
  assert.match(wf, /data\/podnotes\.json/);
  assert.match(wf, /assets\/podnotes/);
  assert.match(wf, /FIREBASE_SERVICE_ACCOUNT/);
  const eng = readFileSync("scripts/ytnotes/ytnotes.py", "utf8");
  assert.match(eng, /aurora_podnotes\/shows/);
  assert.match(eng, /scripts\/podcast\/feeds\.json/);
  const pkg = readFileSync("scripts/podnotes/make_package.py", "utf8");
  assert.match(pkg, /CARD_THEME = "morandi-blue"/);
  assert.match(pkg, /"topic": f"pn-\{eid\}"/);
  const data = readFileSync("aurora-data.js", "utf8");
  assert.match(data, /data\/podnotes\.json/);
  const feeds = JSON.parse(readFileSync("scripts/podcast/feeds.json", "utf8")).shows;
  for (const s of feeds) assert.match(s.code, /^[a-z0-9][a-z0-9-]{1,30}$/, s.show);
  assert.deepEqual(feeds.filter((s) => s.notes).map((s) => s.code).sort(), ["ailanren", "yutinghao", "zhaohua"]);
});
