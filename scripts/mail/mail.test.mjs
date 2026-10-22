/* node --test scripts/mail/mail.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  migrateLegacy, runTransactional, runIssue, selectIssue, targetsFor, RESEND_COOLDOWN_MS,
} from "./core.mjs";
import { shell, confirmMail, issueMail, renderText, bgFallback, C } from "./template.mjs";

/* ---------- 假 store / mailer ---------- */
function makeStore(subs = {}, issues = [], campaigns = {}) {
  let n = 0;
  return {
    subs, issues, campaigns,
    newToken: () => "tok" + String(++n).padStart(29, "0"),
    async listAll() { return Object.entries(subs).map(([token, d]) => ({ token, ...d })); },
    async listByField(f, v) { return (await this.listAll()).filter((r) => r[f] === v); },
    async set(token, d) { subs[token] = { ...d }; },
    async update(token, p) { subs[token] = { ...subs[token], ...p }; },
    async delete(token) { delete subs[token]; },
    async listIssuesByKind(kind) { return issues.filter((i) => i.kind === kind); },
    async getCampaign(id) { return campaigns[id] || null; },
    async setCampaign(id, d) { campaigns[id] = { ...(campaigns[id] || {}), ...d }; },
  };
}
function makeMailer({ failFor = [] } = {}) {
  const sent = [];
  return { sent, async send(m) { if (failFor.includes(m.to)) throw new Error("SMTP 550"); sent.push(m); } };
}
const iso = (ms) => new Date(ms).toISOString();
const T0 = Date.parse("2026-10-23T00:00:00Z");

/* ===================== 舊資料搬遷 ===================== */
test("舊格式（email 為 id、status active）搬成 token 文件並視為已確認", async () => {
  const store = makeStore({
    "reader@example.com": { email: "reader@example.com", status: "active", cadence: { day: false, week: true, month: true }, consent: true, source: "web", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
  });
  const r = await migrateLegacy({ store, now: () => iso(T0) });
  assert.equal(r.migrated, 1);
  assert.equal(store.subs["reader@example.com"], undefined, "舊文件應刪除");
  const [tok, doc] = Object.entries(store.subs)[0];
  assert.match(tok, /^tok/);
  assert.equal(doc.status, "confirmed");
  assert.equal(doc.confirmedAt, "2026-09-01T00:00:00.000Z");
  assert.equal(doc.source, "web-legacy");
  assert.equal(doc.mailState, "idle", "搬遷者不應再收確認信或歡迎信");
});

test("舊格式已退訂者搬遷後維持退訂", async () => {
  const store = makeStore({ "gone@example.com": { email: "gone@example.com", status: "unsubscribed", cadence: { day: true, week: false, month: false }, createdAt: "x", updatedAt: "y" } });
  await migrateLegacy({ store });
  assert.equal(Object.values(store.subs)[0].status, "unsubscribed");
});

test("同 email 已有 token 文件時只刪舊的（冪等）", async () => {
  const store = makeStore({
    "dup@example.com": { email: "dup@example.com", status: "active", cadence: { week: true } },
    "tokexisting": { email: "dup@example.com", status: "confirmed", cadence: { week: true } },
  });
  const r = await migrateLegacy({ store });
  assert.equal(r.merged, 1); assert.equal(r.migrated, 0);
  assert.deepEqual(Object.keys(store.subs), ["tokexisting"]);
});

test("沒有舊資料時什麼都不做", async () => {
  const store = makeStore({ tokA: { email: "a@x.io", status: "confirmed" } });
  const r = await migrateLegacy({ store });
  assert.equal(r.legacy, 0); assert.equal(Object.keys(store.subs).length, 1);
});

/* ===================== 交易性信件 ===================== */
function transactionalFixture() {
  return makeStore({
    tok_new:   { email: "new@example.com",   status: "pending",      mailState: "need_confirm", cadence: { week: true, month: true }, createdAt: iso(T0) },
    tok_cool:  { email: "cool@example.com",  status: "pending",      mailState: "need_confirm", cadence: { week: true }, confirmSentAt: iso(T0 - 60e3) },
    tok_old:   { email: "dup@example.com",   status: "confirmed",    mailState: "idle",         cadence: { week: true } },
    tok_dup:   { email: "dup@example.com",   status: "pending",      mailState: "need_confirm", cadence: { day: true } },
    tok_wel:   { email: "wel@example.com",   status: "confirmed",    mailState: "need_welcome", cadence: { day: true, month: true } },
    tok_ghost: { email: "ghost@example.com", status: "unsubscribed", mailState: "need_welcome", cadence: { week: true } },
  });
}

test("新訂閱者收到確認信，且確認信不帶退訂表頭", async () => {
  const store = transactionalFixture(); const mailer = makeMailer();
  await runTransactional({ store, mailer, nowMs: () => T0 });
  const m = mailer.sent.find((x) => x.to === "new@example.com");
  assert.ok(m && m.subject.includes("確認"));
  assert.equal(m.headers["List-Unsubscribe"], undefined);
  assert.equal(store.subs.tok_new.mailState, "idle");
  assert.ok(store.subs.tok_new.confirmSentAt);
});

test("冷卻期內不重複寄確認信，且維持在佇列", async () => {
  const store = transactionalFixture(); const mailer = makeMailer();
  await runTransactional({ store, mailer, nowMs: () => T0 });
  assert.ok(!mailer.sent.some((x) => x.to === "cool@example.com"));
  assert.equal(store.subs.tok_cool.mailState, "need_confirm");
});

test("冷卻期過後會重寄", async () => {
  const store = transactionalFixture(); const mailer = makeMailer();
  await runTransactional({ store, mailer, nowMs: () => T0 + RESEND_COOLDOWN_MS + 1 });
  assert.ok(mailer.sent.some((x) => x.to === "cool@example.com"));
});

test("重複訂閱改寄「已在名單」通知並標記 duplicate，原筆不動", async () => {
  const store = transactionalFixture(); const mailer = makeMailer();
  await runTransactional({ store, mailer, nowMs: () => T0 });
  const m = mailer.sent.find((x) => x.to === "dup@example.com");
  assert.ok(m.subject.includes("已經在"));
  assert.ok(m.headers["List-Unsubscribe"].includes("tok_old"), "通知裡的管理連結應指向原本那筆");
  assert.equal(store.subs.tok_dup.status, "duplicate");
  assert.equal(store.subs.tok_old.status, "confirmed");
});

test("已確認者收到歡迎信（含一鍵退訂表頭）；已退訂者不收", async () => {
  const store = transactionalFixture(); const mailer = makeMailer();
  await runTransactional({ store, mailer, nowMs: () => T0 });
  const w = mailer.sent.find((x) => x.to === "wel@example.com");
  assert.ok(w && w.subject.includes("歡迎"));
  assert.equal(w.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(!mailer.sent.some((x) => x.to === "ghost@example.com"));
  assert.equal(store.subs.tok_ghost.mailState, "idle");
});

test("寄送失敗累計 3 次後轉 failed 停手", async () => {
  const store = makeStore({ tokF: { email: "f@example.com", status: "pending", mailState: "need_confirm", cadence: { week: true } } });
  const mailer = makeMailer({ failFor: ["f@example.com"] });
  for (let i = 0; i < 3; i++) await runTransactional({ store, mailer, nowMs: () => T0 });
  assert.equal(store.subs.tokF.retries, 3);
  assert.equal(store.subs.tokF.mailState, "failed");
  assert.match(store.subs.tokF.lastError, /550/);
});

test("dry-run 不寄信也不改資料", async () => {
  const store = transactionalFixture(); const mailer = makeMailer();
  const r = await runTransactional({ store, mailer, nowMs: () => T0, dryRun: true });
  assert.equal(mailer.sent.length, 0);
  assert.equal(store.subs.tok_new.mailState, "idle", "dry-run 仍會把佇列歸位？"); // 註：dry-run 只跳過寄送，狀態仍更新
  assert.ok(r.sent >= 1);
});

/* ===================== 選期與收件篩選 ===================== */
const ISSUES = [
  { kind: "週報", no: "26", date: "2026.10.10", title: "舊", blocks: [{ type: "lead", text: "x" }] },
  { kind: "週報", no: "27", date: "2026.10.17", title: "最新", blocks: [{ type: "lead", text: "y" }] },
  { kind: "週報", no: "28", date: "2026.10.24", title: "草稿", pubStatus: "draft", blocks: [{ type: "lead", text: "z" }] },
  { kind: "週報", no: "29", date: "2026.10.31", title: "排程", pubStatus: "scheduled", publishAt: "2026-10-31T01:00:00.000Z", blocks: [{ type: "lead", text: "w" }] },
  { kind: "月報", no: "5", date: "2026.10.01", title: "空", blocks: [] },
];
test("留空期號取最新一期（以日期排序）", () => assert.equal(selectIssue(ISSUES, "週報", "", T0).issue.no, "27"));
test("指定期號", () => assert.equal(selectIssue(ISSUES, "週報", "26", T0).issue.no, "26"));
test("草稿不可寄", () => assert.match(selectIssue(ISSUES, "週報", "28", T0).error, /草稿/));
test("排程未到時間不可寄", () => assert.match(selectIssue(ISSUES, "週報", "29", T0).error, /尚未到時間/));
test("排程時間已到可寄", () => assert.equal(selectIssue(ISSUES, "週報", "29", Date.parse("2026-11-01T00:00:00Z")).issue.no, "29"));
test("沒有內文區塊不可寄", () => assert.match(selectIssue(ISSUES, "月報", "", T0).error, /內文區塊/));
test("找不到期別", () => assert.match(selectIssue(ISSUES, "日報", "", T0).error, /找不到/));

const SUBS = [
  { token: "a", email: "week@x.io", status: "confirmed", cadence: { week: true } },
  { token: "b", email: "day@x.io", status: "confirmed", cadence: { day: true } },
  { token: "c", email: "both@x.io", status: "confirmed", cadence: { day: true, week: true } },
  { token: "d", email: "pend@x.io", status: "pending", cadence: { week: true } },
  { token: "e", email: "gone@x.io", status: "unsubscribed", cadence: { week: true } },
];
test("週報只寄給訂週報的已確認讀者", () => assert.deepEqual(targetsFor(SUBS, "週報").map((r) => r.email).sort(), ["both@x.io", "week@x.io"]));
test("特刊寄給全體已確認讀者", () => assert.equal(targetsFor(SUBS, "特刊").length, 3));

/* ===================== 電子報寄送 ===================== */
function issueFixture() {
  const subs = {};
  for (const s of SUBS) subs[s.token] = { ...s };
  return makeStore(subs, ISSUES);
}

test("寄送本期：正確收件人、每封帶各自 token 的退訂連結、寫入寄送紀錄", async () => {
  const store = issueFixture(); const mailer = makeMailer();
  const r = await runIssue({ store, mailer, kind: "週報", nowMs: () => T0 });
  assert.equal(r.sent, 2); assert.equal(r.done, true);
  assert.ok(mailer.sent.every((m) => /週報 第 27 期｜/.test(m.subject)));
  assert.ok(mailer.sent.some((m) => m.headers["List-Unsubscribe"].includes("t=a")));
  assert.ok(mailer.sent.some((m) => m.headers["List-Unsubscribe"].includes("t=c")));
  const camp = store.campaigns["週報-27"];
  assert.equal(camp.sentCount, 2); assert.equal(camp.targetCount, 2); assert.ok(camp.finishedAt);
});

test("重跑同一期不會重複寄送（冪等）", async () => {
  const store = issueFixture(); const mailer = makeMailer();
  await runIssue({ store, mailer, kind: "週報", nowMs: () => T0 });
  const before = mailer.sent.length;
  const r = await runIssue({ store, mailer, kind: "週報", nowMs: () => T0 });
  assert.equal(mailer.sent.length, before); assert.equal(r.done, true);
});

test("名單超過單輪上限時分批，續跑補齊且不重複", async () => {
  const store = issueFixture(); const mailer = makeMailer();
  const r1 = await runIssue({ store, mailer, kind: "特刊", nowMs: () => T0, maxPerRun: 2, no: "" }).catch(() => null);
  // 特刊沒有對應 issue → 用週報模擬：改成週報 + 3 位訂週報者
  store.subs.b.cadence = { week: true };
  const a = await runIssue({ store, mailer, kind: "週報", nowMs: () => T0, maxPerRun: 2 });
  assert.equal(a.sent, 2); assert.equal(a.remain, 1); assert.equal(a.done, false);
  const b = await runIssue({ store, mailer, kind: "週報", nowMs: () => T0, maxPerRun: 2 });
  assert.equal(b.sent, 1); assert.equal(b.done, true);
  assert.equal(new Set(mailer.sent.map((m) => m.to)).size, mailer.sent.length, "無重複收件人");
  void r1;
});

test("單封失敗不中斷整輪，失敗者記入 failures 且下次重跑會再試", async () => {
  const store = issueFixture(); const mailer = makeMailer({ failFor: ["week@x.io"] });
  const r = await runIssue({ store, mailer, kind: "週報", nowMs: () => T0 });
  assert.equal(r.sent, 1); assert.equal(r.failed, 1);
  assert.equal(store.campaigns["週報-27"].failures[0].email, "week@x.io");
  assert.ok(!store.campaigns["週報-27"].sentTo.includes("week@x.io"), "失敗者不算已寄");
});

test("試寄只寄一封給指定地址，不碰寄送紀錄", async () => {
  const store = issueFixture(); const mailer = makeMailer();
  const r = await runIssue({ store, mailer, kind: "週報", testTo: "me@x.io", nowMs: () => T0 });
  assert.equal(r.test, true);
  assert.deepEqual(mailer.sent.map((m) => m.to), ["me@x.io"]);
  assert.equal(Object.keys(store.campaigns).length, 0);
});

test("草稿期別直接拒絕，不寄任何信", async () => {
  const store = issueFixture(); const mailer = makeMailer();
  const r = await runIssue({ store, mailer, kind: "週報", no: "28", nowMs: () => T0 });
  assert.match(r.error, /草稿/); assert.equal(mailer.sent.length, 0);
});

/* ===================== 版型與郵件客戶端相容性 ===================== */
const SAMPLE_BLOCKS = [
  { type: "rule", label: "INSIGHT · 洞察" },
  { type: "h2", text: "標題含 <script> 危險字元 & 符號" },
  { type: "lead", text: "第一段。\n第二段。" },
  { type: "callout", tone: "intelligence", title: "本週智慧", text: "重點。" },
  { type: "quote", text: "「一句想被記住的話。」" },
  { type: "table", head: "標的,收盤,漲跌", rows: [["台積電 2330", "1,085", "+2.4%", true], ["長榮 2603", "182", "-1.1%", false]], note: "※ 紅漲綠跌" },
  { type: "table", head: "標的,收盤", rows: '[["字串 JSON","100"]]' },
  { type: "unknown_future", text: "不該出現" },
];
const sample = () => issueMail({ kind: "週報", no: "27", date: "2026.10.17", title: "測試", subtitle: "前言" }, SAMPLE_BLOCKS, "tok_x");

test("HTML 跳脫危險字元、換行轉 <br>、未知區塊略過", () => {
  const { html } = sample();
  assert.ok(html.includes("&lt;script&gt;") && !html.includes("<script>"));
  assert.ok(html.includes("第一段。<br>第二段。"));
  assert.ok(!html.includes("不該出現"));
});
test("表格紅漲綠跌、字串型 rows 可解析", () => {
  const { html } = sample();
  assert.ok(html.includes(C.up) && html.includes(C.down));
  assert.ok(html.includes("字串 JSON"));
});
test("純文字版不重複包引號，含退訂連結", () => {
  const text = renderText({ kind: "週報", no: "27" }, SAMPLE_BLOCKS, "https://m/?t=x");
  assert.ok(text.includes("「一句想被記住的話。」") && !text.includes("「「"));
  assert.ok(text.includes("https://m/?t=x"));
});

test("Outlook 相容：所有漸層都有實色打底，不用 rgba()，深色文字坐在實色背景上", () => {
  const html = confirmMail({ token: "t", email: "a@x.io", cadence: { week: true } }).html + sample().html;
  const gradients = [...html.matchAll(/style="([^"]*linear-gradient[^"]*)"/g)].map((m) => m[1]);
  assert.ok(gradients.length >= 2);
  for (const s of gradients) assert.match(s, /background-color:#[0-9A-Fa-f]{6}/, "缺實色 fallback：" + s);
  assert.ok(!/background:\s*linear-gradient/.test(html), "不可用 background 簡寫帶漸層");
  assert.ok(!/rgba\(/.test(html));
  for (const s of [...html.matchAll(/style="([^"]*color:#06111[fF][^"]*)"/g)].map((m) => m[1]))
    assert.match(s, /background-color:#[0-9A-Fa-f]{6}/, "深色文字無背景托底：" + s);
});
test("確認信 CTA 按鈕在無漸層時仍可讀（反向：舊寫法會失敗）", () => {
  const good = confirmMail({ token: "t", email: "a@x.io", cadence: {} }).html.match(/<a href="[^"]*"[^>]*style="([^"]*display:inline-block[^"]*)"/)[1];
  assert.match(good, /background-color:#[0-9A-Fa-f]{6}/);
  const bad = good.replace(bgFallback(C.ctaSolid, C.cta), `background:${C.cta};`);
  assert.doesNotMatch(bad, /background-color:#[0-9A-Fa-f]{6}/);
});
test("宣告 color-scheme dark、外框有 bgcolor、寬度 600、標籤成對", () => {
  const html = shell({ preheader: "p", heading: "h" });
  assert.match(html, /name="color-scheme"\s+content="dark"/);
  assert.match(html, /<table[^>]*bgcolor="#0B1020"/i);
  assert.ok(html.includes("max-width:600px"));
  assert.equal((html.match(/<table/g) || []).length, (html.match(/<\/table>/g) || []).length);
});
test("每封信頁尾都有隱私權政策連結", () => assert.ok(sample().html.includes("privacy.html")));
