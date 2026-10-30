/* =====================================================================
   排程監控 · 純邏輯（瀏覽器與 Node 共用，無相依、無 I/O）

   - cron：解析 5 欄位 cron（支援 * , - / 與 CRON_TZ=Asia/Taipei 前綴），
     推算上一次／下一次應觸發時間；GitHub Actions 的 cron 一律 UTC。
   - evaluateWorkflow：依最近執行紀錄＋排程推算健康度（ok／running／warn／fail／idle／disabled）。
   - evaluateDataCheck：依 data/*.json 的日期或時間戳判斷產出是否新鮮（台北時間）。
   - 後台頁（admin/schedule-monitor.jsx）以 <script type="module"> 載入本檔，
     監控代理（run-monitor.mjs）在 Node 端使用同一份邏輯，兩邊判斷一致。
   ===================================================================== */
import { policyFor, DATA_CHECKS, CLAUDE_TASKS } from "./registry.mjs";

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
const TPE = 8 * HOUR; // 台北 = UTC+8，無日光節約

/* ---------------- 時間格式（台北） ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const WD = ["日", "一", "二", "三", "四", "五", "六"];
export function tpeParts(ms) {
  const d = new Date(ms + TPE);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), wd: d.getUTCDay() };
}
export function fmtTpe(ms, withDate = true) {
  if (!Number.isFinite(ms)) return "—";
  const p = tpeParts(ms);
  return (withDate ? `${pad(p.m)}/${pad(p.d)}（${WD[p.wd]}）` : "") + `${pad(p.hh)}:${pad(p.mm)}`;
}
/* 精簡版（卡片用）：今天／明天 HH:mm，其餘 MM/DD HH:mm */
export function fmtShort(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return "—";
  const a = tpeParts(ms), d = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(...(() => { const b = tpeParts(now); return [b.y, b.m - 1, b.d]; })())) / DAY);
  const hm = `${pad(a.hh)}:${pad(a.mm)}`;
  return d === 0 ? `今天 ${hm}` : d === 1 ? `明天 ${hm}` : d === -1 ? `昨天 ${hm}` : `${pad(a.m)}/${pad(a.d)} ${hm}`;
}
export function tpeDateStr(ms) { const p = tpeParts(ms); return `${p.y}.${pad(p.m)}.${pad(p.d)}`; }
export function ago(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return "—";
  const s = Math.round((now - ms) / 1000);
  if (s < 0) { const f = -s; return f < 3600 ? `${Math.ceil(f / 60)} 分後` : f < 86400 ? `${Math.round(f / 3600)} 小時後` : `${Math.round(f / 86400)} 天後`; }
  if (s < 60) return "剛剛";
  if (s < 3600) return `${Math.floor(s / 60)} 分前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}
export function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.round(sec)} 秒`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m < 60 ? `${m} 分 ${s} 秒` : `${Math.floor(m / 60)} 時 ${m % 60} 分`;
}
const toMs = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : NaN; };

/* ---------------- cron ---------------- */
const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
function parseField(src, [lo, hi], isDow) {
  const set = new Set();
  for (const part of src.split(",")) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!m) throw new Error(`無法解析 cron 欄位：${src}`);
    let a, b;
    if (m[1] === "*") { a = lo; b = hi; } else { a = +m[1]; b = m[2] != null ? +m[2] : (m[3] ? hi : a); }
    if (isDow) { if (a === 7) a = 0; if (b === 7) b = 6; }
    const step = m[3] ? +m[3] : 1;
    if (!(step > 0) || a < lo || b > hi || a > b) throw new Error(`cron 欄位超出範圍：${src}`);
    for (let v = a; v <= b; v += step) set.add(v);
    if (isDow && m[2] === "7") set.add(0);
  }
  return set;
}
export function parseCron(expr) {
  let s = String(expr || "").trim(), offset = 0, tz = "UTC";
  const tzm = s.match(/^CRON_TZ=(\S+)\s+/);
  if (tzm) {
    tz = tzm[1]; s = s.slice(tzm[0].length);
    if (/^(Asia\/Taipei|Asia\/Shanghai|Asia\/Hong_Kong|Asia\/Singapore)$/.test(tz)) offset = TPE;
    else if (tz !== "UTC" && tz !== "Etc/UTC") throw new Error(`不支援的時區：${tz}`);
  }
  const f = s.split(/\s+/);
  if (f.length !== 5) throw new Error(`cron 需為 5 個欄位：${expr}`);
  const sets = f.map((x, i) => parseField(x, RANGES[i], i === 4));
  return { expr: String(expr), tz, offset, sets, domStar: f[2] === "*", dowStar: f[4] === "*" };
}
export function cronMatches(c, ms) {
  const d = new Date(ms + c.offset);
  const [mi, ho, dom, mon, dow] = c.sets;
  if (!mi.has(d.getUTCMinutes()) || !ho.has(d.getUTCHours()) || !mon.has(d.getUTCMonth() + 1)) return false;
  const a = dom.has(d.getUTCDate()), b = dow.has(d.getUTCDay());
  // 標準 cron：日與星期都有限定時，任一符合即可
  return c.domStar || c.dowStar ? a && b : a || b;
}
/* 上一次（≤ now）／下一次（> now）應觸發時間；跳過整小時以加速 */
export function prevFire(c, now, limitDays = 9) {
  let t = Math.floor(now / MIN) * MIN;
  const stop = t - limitDays * DAY;
  while (t >= stop) {
    const d = new Date(t + c.offset);
    if (!c.sets[1].has(d.getUTCHours())) { t -= (d.getUTCMinutes() + 1) * MIN; continue; }
    if (cronMatches(c, t)) return t;
    t -= MIN;
  }
  return NaN;
}
export function nextFire(c, now, limitDays = 9) {
  let t = Math.floor(now / MIN) * MIN + MIN;
  const stop = t + limitDays * DAY;
  while (t <= stop) {
    const d = new Date(t + c.offset);
    if (!c.sets[1].has(d.getUTCHours())) { t += (60 - d.getUTCMinutes()) * MIN; continue; }
    if (cronMatches(c, t)) return t;
    t += MIN;
  }
  return NaN;
}
/* 典型觸發間隔（取接下來兩次觸發的差，最小者） */
export function typicalInterval(crons, now) {
  let best = Infinity;
  for (const c of crons) {
    const a = nextFire(c, now), b = Number.isFinite(a) ? nextFire(c, a) : NaN;
    if (Number.isFinite(b)) best = Math.min(best, b - a);
  }
  return best;
}
function firesBetween(crons, from, to, cap = 60) {
  const out = [];
  for (const c of crons) {
    let t = from;
    while (out.length < cap) { t = nextFire(c, t); if (!Number.isFinite(t) || t > to) break; out.push(t); }
  }
  return out.sort((x, y) => x - y);
}

/* ---------------- workflow YAML 解析（只取監控需要的資訊） ---------------- */
export function parseWorkflowYaml(text) {
  const name = (text.match(/^name:\s*(.+)$/m) || [])[1];
  const crons = [];
  for (const m of text.matchAll(/^\s*-\s*cron:\s*["']([^"']+)["']\s*(?:#\s*(.*))?$/gm)) crons.push({ expr: m[1].trim(), note: (m[2] || "").trim() });
  return {
    name: name ? name.trim().replace(/^["']|["']$/g, "") : "",
    crons,
    dispatch: /^\s*workflow_dispatch\s*:/m.test(text),
    push: /^\s*push\s*:/m.test(text),
  };
}

/* workflow 識別鍵：.github/workflows/x.yml → x.yml；dynamic/pages/pages-build-deployment → pages-build-deployment */
export const workflowKey = (path) => String(path || "").replace(/@.*$/, "").split("/").pop();

/* ---------------- 執行紀錄精簡（GitHub API run → 快照） ---------------- */
export function slimRun(r) {
  return {
    id: r.id, status: r.status, conclusion: r.conclusion || null, event: r.event,
    attempt: r.run_attempt || 1, number: r.run_number || null,
    created: r.created_at, started: r.run_started_at || r.created_at, updated: r.updated_at,
    url: r.html_url, sha: (r.head_sha || "").slice(0, 7), title: (r.display_title || "").slice(0, 120),
    path: workflowKey(r.path),
  };
}
const FAILED = new Set(["failure", "timed_out", "startup_failure"]);
const IGNORED = new Set(["cancelled", "skipped", "neutral", "stale"]);
export const runFailed = (r) => r && r.status === "completed" && FAILED.has(r.conclusion);
export const runDuration = (r) => { const a = toMs(r.started), b = toMs(r.updated); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 1000 : NaN; };

/* ---------------- 健康度 ---------------- */
export const LEVEL = { fail: 4, disabled: 4, warn: 3, running: 2, ok: 1, idle: 0, unknown: 0 };
export const STATUS_META = {
  ok:       { label: "正常",   tone: "success" },
  running:  { label: "執行中", tone: "info" },
  warn:     { label: "注意",   tone: "warning" },
  fail:     { label: "異常",   tone: "danger" },
  disabled: { label: "已停用", tone: "danger" },
  idle:     { label: "待命",   tone: "muted" },
  unknown:  { label: "未知",   tone: "muted" },
};
const worse = (a, b) => (LEVEL[b] > LEVEL[a] ? b : a);

function graceFor(interval) {
  if (!Number.isFinite(interval)) return 2 * HOUR;
  if (interval <= 15 * MIN) return 40 * MIN;  // GitHub 尖峰時排程常延遲或被丟棄
  if (interval <= 3 * HOUR) return 60 * MIN;
  return 2 * HOUR;
}

/* wf: { file, state, crons:[{expr,note}], runs:[slimRun…]（新→舊） }
   回傳 { status, reasons[], lastRun, lastDone, lastSuccess, successRate, consecutiveFailures,
          avgDuration, prevExpected, nextExpected, missed, retry:{eligible, runId, why} } */
export function evaluateWorkflow(wf, now = Date.now()) {
  const pol = policyFor(wf.file);
  const runs = [...(wf.runs || [])].sort((a, b) => toMs(b.created) - toMs(a.created));
  const reasons = [];
  let status = "ok";

  const crons = [];
  for (const c of wf.crons || []) { try { crons.push(parseCron(c.expr)); } catch (e) { reasons.push(`排程設定無法解析：${c.expr}`); status = worse(status, "warn"); } }

  const lastRun = runs[0] || null;
  const done = runs.filter((r) => r.status === "completed" && !IGNORED.has(r.conclusion));
  const lastDone = done[0] || null;
  const lastSuccess = done.find((r) => r.conclusion === "success") || null;
  let consecutiveFailures = 0;
  for (const r of done) { if (runFailed(r)) consecutiveFailures++; else break; }
  const window = done.slice(0, 20);
  const successRate = window.length ? window.filter((r) => r.conclusion === "success").length / window.length : NaN;
  const durs = done.slice(0, 10).map(runDuration).filter(Number.isFinite);
  const avgDuration = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : NaN;
  const running = runs.find((r) => r.status === "in_progress" || r.status === "queued" || r.status === "waiting" || r.status === "pending") || null;

  const prevExpected = crons.length ? Math.max(...crons.map((c) => prevFire(c, now)).filter(Number.isFinite), -Infinity) : NaN;
  const nextExpected = crons.length ? Math.min(...crons.map((c) => nextFire(c, now)).filter(Number.isFinite), Infinity) : NaN;
  // 以「目前所在時段」的間隔判斷頻率（例：TAIEX 盤中每 5 分、盤後數小時一次）
  const interval = Number.isFinite(prevExpected) && Number.isFinite(nextExpected) ? nextExpected - prevExpected : typicalInterval(crons, now);

  // 自動重試資格（代理用）：排程觸發、首次嘗試失敗、3 小時內、目前沒有在跑
  const retry = { eligible: false, runId: null, why: "" };
  if (lastDone && runFailed(lastDone)) {
    if (!pol.autoRetry) retry.why = "此排程不自動重試";
    else if (lastDone.event !== "schedule") retry.why = "非排程觸發";
    else if ((lastDone.attempt || 1) >= 2) retry.why = "已自動重試過";
    else if (now - toMs(lastDone.updated) > 3 * HOUR) retry.why = "失敗已超過 3 小時";
    else if (running) retry.why = "已有新一輪執行中";
    else { retry.eligible = true; retry.runId = lastDone.id; }
  }

  if (wf.state === "unknown") {
    reasons.push("GitHub 尚未登錄此 workflow（推送到 main 後生效）");
  } else if (wf.state && wf.state !== "active") {
    status = "disabled";
    reasons.push(wf.state === "disabled_inactivity" ? "GitHub 因 60 天無活動停用排程，需到 Actions 頁重新啟用" : `workflow 已停用（${wf.state}）`);
  }

  // 1) 最近一次結果
  if (lastDone && runFailed(lastDone)) {
    const when = fmtTpe(toMs(lastDone.updated));
    if (retry.eligible) { status = worse(status, "warn"); reasons.push(`最近一次失敗（${when}），監控代理將自動重試一次`); }
    else if (consecutiveFailures >= 2 || !crons.length || !pol.autoRetry || (lastDone.attempt || 1) >= 2) {
      status = worse(status, crons.length ? "fail" : "warn");
      reasons.push(consecutiveFailures >= 2 ? `連續 ${consecutiveFailures} 次失敗（最近 ${when}）` : `最近一次失敗（${when}${(lastDone.attempt || 1) >= 2 ? "，重試後仍失敗" : ""}）`);
    } else { status = worse(status, "warn"); reasons.push(`最近一次失敗（${when}）`); }
  }

  // 2) 排程是否有按時觸發。GitHub 尖峰時會延遲甚至丟棄排程（*/10 的工作實測常數小時才跑一次），
  //    所以「排程或手動觸發」任一執行出現在應觸發時間之後，都視為已涵蓋該次排程。
  let missed = 0, lastCover = NaN;
  const catchUp = { eligible: false, why: "" };
  if (crons.length && status !== "disabled") {
    const cover = runs.filter((r) => r.event === "schedule" || r.event === "workflow_dispatch");
    lastCover = cover[0] ? toMs(cover[0].created) : NaN;
    const grace = graceFor(interval);
    const from = Number.isFinite(lastCover) ? lastCover + 2 * MIN : (runs.length ? toMs(runs[runs.length - 1].created) : NaN);
    if (Number.isFinite(from)) missed = firesBetween(crons, from, now - grace).length;
    const frequent = interval <= 30 * MIN;
    if (missed) {
      const lvl = frequent ? (missed >= 12 ? "fail" : missed >= 3 ? "warn" : "") : (missed >= 2 ? "fail" : "warn");
      if (lvl) { status = worse(status, lvl); reasons.push(`排程應觸發 ${missed >= 60 ? "60+" : missed} 次未見執行（上次執行 ${Number.isFinite(lastCover) ? fmtTpe(lastCover) : "不在紀錄內"}）`); }
    }
    if (!runs.length) { status = worse(status, "warn"); reasons.push("尚無執行紀錄"); }
    // 補跑資格（代理用）：以 workflow_dispatch 補上被 GitHub 丟棄的排程（dispatch 事件不受排程節流影響）
    const overdue = frequent ? (Number.isFinite(lastCover) && now - lastCover > Math.max(25 * MIN, 2 * interval)) : missed >= 1;
    if (!pol.catchUp) catchUp.why = "此排程不自動補跑";
    else if (!overdue) catchUp.why = "排程正常";
    else if (running) catchUp.why = "已有執行中";
    else if (retry.eligible) catchUp.why = "改走自動重試";
    else catchUp.eligible = true;
  }

  // 3) 成功率偏低
  if (Number.isFinite(successRate) && window.length >= 5 && successRate < 0.7 && status === "ok") {
    status = "warn"; reasons.push(`近 ${window.length} 次成功率 ${Math.round(successRate * 100)}%`);
  }

  if (!crons.length && status === "ok") status = lastDone ? "ok" : "idle";
  if (running && (status === "ok" || status === "idle")) status = "running";
  if (!reasons.length) {
    if (status === "running") reasons.push(`執行中（${ago(toMs(running.started), now)}開始）`);
    else if (status === "idle") reasons.push(crons.length ? "等待下次排程" : "僅手動／push 觸發");
    else if (lastDone) reasons.push(`最近一次成功 ${ago(toMs(lastDone.updated), now)}`);
  }

  return {
    status, reasons, lastRun, lastDone, lastSuccess, running,
    successRate, sampleSize: window.length, consecutiveFailures, avgDuration,
    interval, prevExpected, nextExpected, missed, lastCover, retry, catchUp, policy: pol,
  };
}

/* ---------------- 資料新鮮度 ---------------- */
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
function parseDot(s) { const m = String(s || "").match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/); return m ? dayNum(+m[1], +m[2], +m[3]) : NaN; }
const isWeekday = (dn) => { const w = new Date(dn * DAY).getUTCDay(); return w >= 1 && w <= 5; };

/* 依 cadence 與 readyAt 推算「現在應該已經有」的最新一期（日序號，以台北日曆計） */
export function expectedDay(chk, now) {
  const p = tpeParts(now);
  let dn = dayNum(p.y, p.m, p.d);
  const [rh, rm] = String(chk.readyAt || "00:00").split(":").map(Number);
  if (p.hh * 60 + p.mm < rh * 60 + rm) dn -= 1;
  if (chk.cadence === "weekday") while (!isWeekday(dn)) dn -= 1;
  return dn;
}
function lagUnits(chk, actual, expected) {
  if (actual >= expected) return 0;
  let n = 0;
  for (let d = actual + 1; d <= expected; d++) if (chk.cadence !== "weekday" || isWeekday(d)) n++;
  return n;
}

/* data：該 JSON 檔內容（讀取失敗傳 null，並以 err 說明） */
export function evaluateDataCheck(chk, data, now = Date.now(), err = "") {
  const out = { key: chk.key, status: "ok", reason: "", value: "", expected: "" };
  if (!data) { out.status = "warn"; out.reason = err ? `讀取失敗：${err}` : "讀取失敗"; return out; }
  const v = getPath(data, chk.field);
  out.value = v == null ? "" : String(v);
  if (chk.type === "age") {
    const t = toMs(v);
    if (!Number.isFinite(t)) { out.status = "idle"; out.reason = "尚無時間戳（可能未設定來源或 Secrets）"; return out; }
    const h = (now - t) / HOUR;
    out.value = fmtTpe(t);
    out.expected = `${chk.warnHours} 小時內`;
    if (h > chk.failHours) { out.status = "fail"; out.reason = `已 ${Math.floor(h)} 小時未更新`; }
    else if (h > chk.warnHours) { out.status = "warn"; out.reason = `已 ${Math.floor(h)} 小時未更新`; }
    else out.reason = `更新於 ${ago(t, now)}`;
    return out;
  }
  const actual = parseDot(v), expected = expectedDay(chk, now);
  out.expected = tpeDateStr(expected * DAY - TPE + 12 * HOUR); // 該日中午，避免時區邊界
  if (!Number.isFinite(actual)) { out.status = "warn"; out.reason = `日期欄位無法解析（${out.value || "空"}）`; return out; }
  const lag = lagUnits(chk, actual, expected);
  const graceDays = chk.lagGraceDays || 0;
  if (lag === 0) out.reason = "已是最新一期";
  else if (lag <= 1 + graceDays) { out.status = "warn"; out.reason = `落後 ${lag} 期（預期 ${out.expected}${chk.cadence === "weekday" ? "；若為休市日可忽略" : ""}）`; }
  else { out.status = "fail"; out.reason = `落後 ${lag} 期（預期 ${out.expected}）`; }
  return out;
}

/* ---------------- Claude 排程任務 ---------------- */
export function evaluateClaudeTask(task, checks, now = Date.now()) {
  let c = null;
  try { c = parseCron(task.cron); } catch { /* 註冊表錯誤 */ }
  const prev = c ? prevFire(c, now) : NaN, next = c ? nextFire(c, now) : NaN;
  const chk = task.check ? checks.find((x) => x.key === task.check) : null;
  let status = "unknown", reason = task.manual ? "發文需人工確認，無法自動驗證" : "無對應產出可驗證";
  if (chk && chk.eval) { status = chk.eval.status === "idle" ? "unknown" : chk.eval.status; reason = `產出：${chk.label} · ${chk.eval.reason}`; }
  return { status, reason, prevExpected: prev, nextExpected: next };
}

/* ---------------- 整體彙整 ---------------- */
/* snap：{ workflows:[{file,name,state,crons,runs,html}], data:{ "data/x.json": {json|null, err} } } */
export function evaluateAll(snap, now = Date.now()) {
  const workflows = (snap.workflows || []).map((w) => {
    const pol = policyFor(w.file);
    return { ...w, label: pol.label || w.name || w.file, category: pol.category, policy: pol, eval: evaluateWorkflow(w, now) };
  });
  const data = snap.data || {};
  const checks = DATA_CHECKS.map((chk) => {
    const d = data[chk.file] || {};
    return { ...chk, eval: evaluateDataCheck(chk, d.json || null, now, d.err || "") };
  });
  const claude = CLAUDE_TASKS.map((t) => ({ ...t, eval: evaluateClaudeTask(t, checks, now) }));
  const counts = { ok: 0, running: 0, warn: 0, fail: 0, idle: 0 };
  const bump = (s) => { const k = s === "disabled" ? "fail" : s === "unknown" ? "idle" : s; counts[k] = (counts[k] || 0) + 1; };
  workflows.forEach((w) => bump(w.eval.status)); checks.forEach((c) => bump(c.eval.status)); claude.forEach((c) => bump(c.eval.status));
  const overall = counts.fail ? "fail" : counts.warn ? "warn" : counts.running ? "running" : "ok";
  return { workflows, checks, claude, counts, overall, now };
}

/* ---------------- 重跑請求驗證（代理與後台共用） ---------------- */
export const REQUEST_ACTIONS = ["dispatch", "rerun_failed", "rerun"];
export function sanitizeInputs(file, inputs) {
  const pol = policyFor(file), out = {};
  for (const [k, spec] of Object.entries(pol.inputs || {})) {
    if (!inputs || !(k in inputs)) continue;
    const v = inputs[k];
    if (spec.type === "boolean") out[k] = v === true || v === "true" ? "true" : "false";
    else if (typeof v === "string" && v.length <= 200) out[k] = v;
  }
  return out;
}
export function validateRequest(req, knownFiles) {
  if (!req || typeof req !== "object") return "請求格式錯誤";
  if (!/^[a-z0-9][a-z0-9-]{0,60}\.ya?ml$/.test(req.workflow || "")) return "workflow 名稱不合法";
  if (knownFiles && !knownFiles.includes(req.workflow)) return `找不到 workflow：${req.workflow}`;
  if (!REQUEST_ACTIONS.includes(req.action)) return `不支援的動作：${req.action}`;
  const pol = policyFor(req.workflow);
  if (req.action === "dispatch" && !pol.dispatch) return pol.reason || "此 workflow 不開放自後台觸發";
  if (req.action !== "dispatch" && !Number.isInteger(req.runId)) return "重跑需指定 runId";
  if (req.action !== "dispatch" && !pol.dispatch && !pol.autoRetry) return pol.reason || "此 workflow 不開放自後台重跑";
  return "";
}
