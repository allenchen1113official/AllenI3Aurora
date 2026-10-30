/* node --test scripts/monitor/monitor.test.mjs
   排程監控：cron 推算、健康度、資料新鮮度、請求驗證，以及後台寫入 payload 與 firestore.rules 白名單的靜態比對
   （本環境無法起 Firestore 模擬器，比照 scripts/mail/rules-shape.test.mjs）。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as core from "./core.mjs";
import { WORKFLOWS, DATA_CHECKS, CLAUDE_TASKS, policyFor } from "./registry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const T = (s) => Date.parse(s);            // ISO（UTC）
const TPE = (s) => Date.parse(s + "+08:00"); // 台北時間字串

/* ---------------- cron ---------------- */
test("cron：UTC 排程推算上一次／下一次觸發", () => {
  const c = core.parseCron("0 0 * * *"); // 台北 08:00
  assert.equal(core.prevFire(c, TPE("2026-10-30T16:00")), TPE("2026-10-30T08:00"));
  assert.equal(core.nextFire(c, TPE("2026-10-30T16:00")), TPE("2026-10-31T08:00"));
});

test("cron：步進範圍、星期與 CRON_TZ=Asia/Taipei", () => {
  const taiex = core.parseCron("*/5 1-5 * * 1-5"); // 台北週一至五 09:00–13:55
  assert.equal(core.nextFire(taiex, TPE("2026-10-30T13:57")), TPE("2026-11-02T09:00")); // 週五收盤後 → 下週一
  const m = core.parseCron("3-58/5 * * * *");
  assert.equal(core.nextFire(m, T("2026-10-30T08:00:00Z")), T("2026-10-30T08:03:00Z"));
  const claude = core.parseCron("CRON_TZ=Asia/Taipei 30 21 * * 1-5");
  assert.equal(core.nextFire(claude, TPE("2026-10-30T22:00")), TPE("2026-11-02T21:30"));
  const weekly = core.parseCron("0 20 * * 0"); // 台北週一 04:00
  assert.equal(core.nextFire(weekly, TPE("2026-10-30T12:00")), TPE("2026-11-02T04:00"));
});

test("時間格式：台北今天／明天", () => {
  const now = TPE("2026-10-30T23:30");
  assert.equal(core.fmtShort(TPE("2026-10-30T23:50"), now), "今天 23:50");
  assert.equal(core.fmtShort(TPE("2026-10-31T08:00"), now), "明天 08:00");
  assert.equal(core.fmtShort(TPE("2026-11-02T09:00"), now), "11/02 09:00");
  assert.equal(core.fmtTpe(TPE("2026-10-30T08:05")), "10/30（五）08:05");
});

test("cron：不合法的表示式會丟錯", () => {
  assert.throws(() => core.parseCron("61 * * * *"));
  assert.throws(() => core.parseCron("* * *"));
  assert.throws(() => core.parseCron("CRON_TZ=America/New_York 0 9 * * *"));
});

test("所有 workflow 的 cron 都能解析，且排程行附台北時間註解（CLAUDE.md 規範）", () => {
  const dir = join(ROOT, ".github/workflows");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".yml"))) {
    const y = core.parseWorkflowYaml(readFileSync(join(dir, f), "utf8"));
    for (const c of y.crons) assert.doesNotThrow(() => core.parseCron(c.expr), `${f}: ${c.expr}`);
    if (y.crons.length) assert.ok(y.name, `${f} 缺 name`);
  }
  for (const t of CLAUDE_TASKS) assert.doesNotThrow(() => core.parseCron(t.cron), t.name);
});

/* ---------------- 健康度 ---------------- */
const run = (o) => ({ id: o.id || Math.floor(Math.random() * 1e9), status: "completed", conclusion: "success", event: "schedule", attempt: 1,
  created: o.at, started: o.at, updated: new Date(Date.parse(o.at) + 60000).toISOString(), url: "https://example/run", ...o });

test("健康度：最近成功且按時觸發 → ok", () => {
  const now = TPE("2026-10-30T16:00");
  const ev = core.evaluateWorkflow({ file: "annuli-update.yml", state: "active", crons: [{ expr: "0 17 * * *" }],
    runs: [run({ at: "2026-10-29T17:02:00Z" })] }, now);
  assert.equal(ev.status, "ok");
  assert.equal(ev.nextExpected, TPE("2026-10-31T01:00"));
});

test("健康度：排程失敗一次且可自動重試 → warn＋retry.eligible", () => {
  const now = T("2026-10-30T00:30:00Z");
  const ev = core.evaluateWorkflow({ file: "daily-rollover.yml", state: "active", crons: [{ expr: "0 0 * * *" }],
    runs: [run({ id: 42, at: "2026-10-30T00:05:00Z", conclusion: "failure" }), run({ at: "2026-10-29T00:03:00Z" })] }, now);
  assert.equal(ev.status, "warn");
  assert.equal(ev.retry.eligible, true);
  assert.equal(ev.retry.runId, 42);
});

test("健康度：重試後仍失敗 → fail，不再重試", () => {
  const now = T("2026-10-30T01:00:00Z");
  const ev = core.evaluateWorkflow({ file: "daily-rollover.yml", state: "active", crons: [{ expr: "0 0 * * *" }],
    runs: [run({ at: "2026-10-30T00:05:00Z", conclusion: "failure", attempt: 2 })] }, now);
  assert.equal(ev.status, "fail");
  assert.equal(ev.retry.eligible, false);
});

test("健康度：不自動重試的工作（社群發文）失敗即 fail", () => {
  const now = T("2026-10-30T00:12:00Z");
  const ev = core.evaluateWorkflow({ file: "social-publish.yml", state: "active", crons: [{ expr: "*/10 * * * *" }],
    runs: [run({ at: "2026-10-30T00:10:00Z", conclusion: "failure" })] }, now);
  assert.equal(ev.status, "fail");
  assert.equal(ev.retry.eligible, false);
});

test("健康度：GitHub 丟棄高頻排程 → 依漏跑次數 warn／fail，且可補跑", () => {
  const wf = { file: "social-publish.yml", state: "active", crons: [{ expr: "*/10 * * * *" }], runs: [run({ at: "2026-10-30T02:40:00Z" })] };
  const a = core.evaluateWorkflow(wf, T("2026-10-30T03:40:00Z")); // 漏 2 次（扣寬限 40 分）
  assert.equal(a.status, "ok");
  assert.equal(a.catchUp.eligible, true, "超過 25 分鐘沒跑就補");
  const b = core.evaluateWorkflow(wf, T("2026-10-30T05:00:00Z"));
  assert.equal(b.status, "warn");
  const c = core.evaluateWorkflow(wf, T("2026-10-30T08:00:00Z"));
  assert.equal(c.status, "fail");
});

test("健康度：補跑（workflow_dispatch）的執行算是涵蓋了被丟棄的排程", () => {
  const wf = { file: "social-publish.yml", state: "active", crons: [{ expr: "*/10 * * * *" }],
    runs: [run({ at: "2026-10-30T07:55:00Z", event: "workflow_dispatch" }), run({ at: "2026-10-30T02:40:00Z" })] };
  const ev = core.evaluateWorkflow(wf, T("2026-10-30T08:00:00Z"));
  assert.equal(ev.status, "ok");
  assert.equal(ev.catchUp.eligible, false);
});

test("健康度：盤後時段的 TAIEX 不因 5 分鐘排程而誤判漏跑", () => {
  const wf = { file: "taiex-update.yml", state: "active",
    crons: [{ expr: "*/5 1-5 * * 1-5" }, { expr: "35 5 * * 1-5" }, { expr: "0 7 * * 1-5" }, { expr: "0 12 * * *" }],
    runs: [run({ at: "2026-10-30T06:40:00Z" })] };
  const ev = core.evaluateWorkflow(wf, TPE("2026-10-30T16:08"));
  assert.equal(ev.catchUp.eligible, false, "15:00 那次還在 2 小時寬限內");
  assert.equal(ev.status, "ok");
});

test("健康度：workflow 被停用 → disabled；執行中 → running；手動 workflow 無排程 → idle", () => {
  const now = T("2026-10-30T08:00:00Z");
  assert.equal(core.evaluateWorkflow({ file: "x.yml", state: "disabled_inactivity", crons: [{ expr: "0 0 * * *" }], runs: [] }, now).status, "disabled");
  const r = core.evaluateWorkflow({ file: "taiex-update.yml", state: "active", crons: [{ expr: "0 12 * * *" }],
    runs: [run({ at: "2026-10-30T07:59:00Z", status: "in_progress", conclusion: null }), run({ at: "2026-10-29T12:01:00Z" })] }, now);
  assert.equal(r.status, "running");
  assert.equal(core.evaluateWorkflow({ file: "newsletter-send.yml", state: "active", crons: [], runs: [] }, now).status, "idle");
});

/* ---------------- 資料新鮮度 ---------------- */
const chk = (k) => DATA_CHECKS.find((c) => c.key === k);
test("資料：交易日型產出在就緒時間前只要求前一交易日", () => {
  const heat = chk("heatmap"); // 就緒 23:45
  assert.equal(core.evaluateDataCheck(heat, { date: "2026.10.29" }, TPE("2026-10-30T16:00")).status, "ok");
  assert.equal(core.evaluateDataCheck(heat, { date: "2026.10.29" }, TPE("2026-10-30T23:50")).status, "warn");
  assert.equal(core.evaluateDataCheck(heat, { date: "2026.10.27" }, TPE("2026-10-30T23:50")).status, "fail");
  // 週一早上，上一期是上週五
  assert.equal(core.evaluateDataCheck(heat, { date: "2026.10.30" }, TPE("2026-11-02T10:00")).status, "ok");
});

test("資料：每日型與巢狀欄位（newsletter-current day.date）", () => {
  const d = chk("daily");
  assert.equal(core.evaluateDataCheck(d, { day: { date: "2026.10.30" } }, TPE("2026-10-30T16:00")).status, "ok");
  assert.equal(core.evaluateDataCheck(d, { day: { date: "2026.10.28" } }, TPE("2026-10-30T16:00")).status, "fail");
});

test("資料：時間戳型（空值＝待設定、逾時 warn／fail）與讀取失敗", () => {
  const t = chk("taiex");
  assert.equal(core.evaluateDataCheck(t, { updatedAt: "" }, Date.now()).status, "idle");
  assert.equal(core.evaluateDataCheck(t, { updatedAt: "2026-10-30T06:41:06Z" }, T("2026-10-31T06:00:00Z")).status, "ok");
  assert.equal(core.evaluateDataCheck(t, { updatedAt: "2026-10-30T06:41:06Z" }, T("2026-10-31T10:00:00Z")).status, "warn");
  assert.equal(core.evaluateDataCheck(t, { updatedAt: "2026-10-30T06:41:06Z" }, T("2026-11-03T10:00:00Z")).status, "fail");
  assert.equal(core.evaluateDataCheck(t, null, Date.now(), "檔案不存在").status, "warn");
});

test("資料：data/*.json 現況都能被解析（欄位路徑正確）", () => {
  for (const c of DATA_CHECKS) {
    const json = JSON.parse(readFileSync(join(ROOT, c.file), "utf8"));
    const r = core.evaluateDataCheck(c, json, Date.now());
    assert.notEqual(r.reason, "", c.key);
    assert.ok(!/無法解析/.test(r.reason), `${c.key}: ${r.reason}`);
  }
});

/* ---------------- 請求驗證 ---------------- */
test("請求：只允許註冊為可觸發的 workflow，寄信類一律拒絕", () => {
  const files = Object.keys(WORKFLOWS);
  assert.equal(core.validateRequest({ workflow: "taiex-update.yml", action: "dispatch" }, files), "");
  assert.match(core.validateRequest({ workflow: "newsletter-send.yml", action: "dispatch" }, files), /寄信不可逆/);
  assert.match(core.validateRequest({ workflow: "../evil.yml", action: "dispatch" }, files), /不合法/);
  assert.match(core.validateRequest({ workflow: "taiex-update.yml", action: "rerun_failed" }, files), /runId/);
  assert.equal(core.validateRequest({ workflow: "taiex-update.yml", action: "rerun_failed", runId: 123 }, files), "");
  assert.match(core.validateRequest({ workflow: "taiex-update.yml", action: "rm" }, files), /不支援/);
});

test("請求：inputs 只保留白名單並轉成字串", () => {
  assert.deepEqual(core.sanitizeInputs("social-publish.yml", { dry_run: true, evil: "x" }), { dry_run: "true" });
  assert.deepEqual(core.sanitizeInputs("taiex-update.yml", { dry_run: true }), {});
  assert.equal(policyFor("unknown.yml").dispatch, false);
});

/* ---------------- 後台 payload ↔ firestore.rules ---------------- */
const rules = readFileSync(join(ROOT, "firebase/firestore.rules"), "utf8");
const panel = readFileSync(join(ROOT, "admin/schedule-monitor.jsx"), "utf8");
const fields = new Set([...rules.match(/function opsReqFields\(\)\s*\{\s*return \[([^\]]+)\]/s)[1].matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1]));

test("規則：快照只給管理者讀、前端不可寫；請求只能由管理者建立", () => {
  assert.match(rules, /match \/aurora_ops\/\{doc\} \{ allow read: if isOwner\(\); allow write: if false; \}/);
  assert.match(rules, /allow create: if isOwner\(\) && validOpsRequest\(\);/);
  assert.match(rules, /resource\.data\.state == 'queued'[\s\S]*request\.resource\.data\.state == 'cancelled'/);
});

test("後台建立請求的 payload 全在規則白名單內，且 state／mode 組合符合規則", () => {
  const m = panel.match(/function buildOpsRequest\([^)]*\)\s*\{[\s\S]*?const req = \{([\s\S]*?)\};/);
  assert.ok(m, "找不到 buildOpsRequest");
  const flat = m[1].replace(/\{[^{}]*\}/g, "{}").replace(/\([^()]*\)/g, "()").replace(/\?[^:,]*:/g, "?:");
  const keys = [...flat.matchAll(/(?:^|[,{]\s*|\n\s*)([a-zA-Z]+)\s*(?=[:,])/g)].map((x) => x[1]);
  assert.ok(keys.length >= 5);
  for (const k of keys) assert.ok(fields.has(k), `欄位 ${k} 不在 opsReqFields 白名單`);
  for (const must of ["workflow", "action", "state", "mode", "requestedAt"]) assert.ok(keys.includes(must), "缺必填 " + must);
  assert.match(panel, /direct \? "dispatched" : "queued"/);
  assert.match(panel, /direct \? "direct" : "queue"/);
  // 取消只改 state＋updatedAt
  assert.match(panel, /\.update\(\{ state: "cancelled", updatedAt: [^}]+\}\)/);
});
