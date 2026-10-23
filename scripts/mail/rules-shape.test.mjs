/* node --test scripts/mail/rules-shape.test.mjs
   這裡無法啟動 Firestore 模擬器，改以靜態方式驗證「前台／後台實際寫入的 payload」
   與 firestore.rules 中 aurora_subscribers 的白名單與硬性條件一致。
   抓的是「規則改了但前端沒跟上」或反過來的那種缺陷——它在正式環境只會表現為
   PERMISSION_DENIED，沒有任何測試會自動提醒你。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rules = readFileSync(join(ROOT, "firebase/firestore.rules"), "utf8");
const clientJs = readFileSync(join(ROOT, "subscriber-data.js"), "utf8");
const adminJsx = readFileSync(join(ROOT, "admin/admin.jsx"), "utf8");

/* 從規則抓 subFields 白名單 */
const m = rules.match(/function subFields\(\)\s*\{\s*return \[([^\]]+)\]/s);
assert.ok(m, "規則中找不到 subFields()");
const WHITELIST = new Set([...m[1].matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1]));

/* 從原始碼抓某段 .set({...}) / .update({...}) 的 key */
function keysOfObjectLiteral(src, anchorRe) {
  const mm = src.match(anchorRe);
  assert.ok(mm, "找不到：" + anchorRe);
  // 錨點正則須以 .set( / .update( 結尾，這樣 { 才是 payload 的開頭而不是函式本體
  const start = src.indexOf("{", mm.index + mm[0].length - 1);
  let depth = 0, j = start;
  for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
  const body = src.slice(start + 1, j);
  // 只取最外層的 key：把巢狀 {…}、(…) 內容先清掉，避免把 cadence: { day: ... } 的 day
  // 或 String(opts.source || "web") 裡的東西誤認成欄位
  const flat = body.replace(/\{[^{}]*\}/g, "{}").replace(/\([^()]*\)/g, "()");
  return [...flat.matchAll(/(?:^|[,\s])([a-zA-Z]+)\s*:/g)].map((x) => x[1]);
}

test("規則 create 允許管理者（後台手動新增寫 status=confirmed，不走 pending）", () => {
  const line = rules.match(/allow create:[^\n]*/)[0];
  assert.match(line, /isOwner\(\)\s*\|\|/, "後台手動新增會被 newSubscriber() 的 status==pending 擋下：" + line);
});

test("前台 subscribe() 的 payload 全在白名單內，且符合 create 硬性條件", () => {
  const keys = keysOfObjectLiteral(clientJs, /API\.subscribe = async function[\s\S]*?\.set\(/);
  for (const k of keys) assert.ok(WHITELIST.has(k), `欄位 ${k} 不在規則白名單，create 會被拒`);
  for (const must of ["email", "status", "cadence", "mailState", "consent", "createdAt"]) assert.ok(keys.includes(must), "缺必填 " + must);
  assert.match(clientJs, /status: "pending", cadence: cadence, mailState: "need_confirm"/);
  assert.match(clientJs, /consent: true/);
});

test("前台所有自助 update 寫入的欄位都在白名單內", () => {
  const updates = [...clientJs.matchAll(/\.update\(\{([^}]+)\}/g)].map((x) => x[1]);
  assert.ok(updates.length >= 4);
  for (const u of updates) for (const k of [...u.matchAll(/([a-zA-Z]+)\s*:/g)].map((x) => x[1]))
    assert.ok(WHITELIST.has(k), `自助 update 欄位 ${k} 不在白名單`);
});

test("自助 update 不會把 status 改成規則禁止的值", () => {
  const vals = [...clientJs.matchAll(/status: "([a-z]+)"/g)].map((x) => x[1]);
  for (const v of vals) assert.ok(["pending", "confirmed", "unsubscribed"].includes(v), "前台寫了規則不允許的 status：" + v);
});

test("後台手動新增的 payload 全在白名單內", () => {
  const keys = keysOfObjectLiteral(adminJsx, /doc\(subNewToken\(\)\)\.set\(/);
  for (const k of keys) assert.ok(WHITELIST.has(k), `後台新增欄位 ${k} 不在白名單`);
});

test("前台 token 長度符合 create 的 token.size() >= 24", () => {
  // 16 bytes → 32 hex
  assert.match(clientJs, /new Uint8Array\(16\)/);
  assert.match(rules, /token\.size\(\) >= 24/);
});

test("規則不開放未登入 list（名單不可列舉）", () => {
  assert.match(rules, /allow list:\s*if isOwner\(\);/);
  assert.match(rules, /allow get:\s*if true;/);
});

test("規則仍禁止在舊規則中存在的危險路徑：以 email 為 doc id 的自助 update", () => {
  assert.ok(!/match \/aurora_subscribers\/\{email\}/.test(rules), "規則仍以 email 為路徑參數");
  assert.ok(!/selfServiceValid|subValid/.test(rules), "舊版函式殘留");
});
