/* =====================================================================
   排程監控代理（GitHub Actions：schedule-monitor.yml 約每 5 分鐘執行）

   每一輪：
     1. 讀 .github/workflows/*.yml（排程、台北時間註解）＋ GitHub API 各 workflow 最近執行紀錄
     2. 處理後台送來的「重新執行」請求（Firestore aurora_ops_requests：queued → dispatched →
        running → completed／failed），並追蹤後台「即時觸發」的執行結果
     3. 自我修復：
        - 自動重試：排程執行失敗（冪等的資料同步）→ 重跑失敗的工作一次
        - 補跑：GitHub 延遲或丟棄排程 → 以 workflow_dispatch 補上（dispatch 不受排程節流）
     4. 告警：異常時開 GitHub Issue（label: schedule-monitor），恢復後自動關閉
     5. 寫入 Firestore aurora_ops/schedule_status 快照（後台監控頁即時訂閱）與 Step Summary

   環境變數：
     GITHUB_TOKEN / GITHUB_REPOSITORY   Actions 內建（需 actions: write、issues: write）
     FIREBASE_SERVICE_ACCOUNT           服務帳戶 JSON（與社群發文共用；未設定時只做 2 以外的部分）
     MONITOR_DRY_RUN=1                  只評估並印出，不觸發、不開 Issue、不寫 Firestore
     MONITOR_ISSUES=off                 關閉 Issue 告警
     MONITOR_AUTOHEAL=off               關閉自動重試與補跑
     MONITOR_DUMP=路徑                  另把快照寫成本機 JSON（除錯用）
   ===================================================================== */
import { readFileSync, readdirSync, existsSync, appendFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "./core.mjs";
import { REPO, policyFor, DATA_CHECKS } from "./registry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = (k) => (process.env[k] || "").trim();
const DRY = env("MONITOR_DRY_RUN") === "1";
const ISSUES_ON = env("MONITOR_ISSUES") !== "off";
const HEAL_ON = env("MONITOR_AUTOHEAL") !== "off";
const [OWNER, NAME] = (env("GITHUB_REPOSITORY") || `${REPO.owner}/${REPO.repo}`).split("/");
const RUN_URL = env("GITHUB_RUN_ID") ? `https://github.com/${OWNER}/${NAME}/actions/runs/${env("GITHUB_RUN_ID")}` : "";
const AGENT = `gha-${env("GITHUB_RUN_ID") || "local"}`;
const SNAP_DOC = "aurora_ops/schedule_status";
const AGENT_DOC = "aurora_ops/agent";
const REQ_COLL = "aurora_ops_requests";
const ISSUE_LABEL = "schedule-monitor";
const RUNS_PER_WF = 15;

const log = (...a) => console.log(...a);
const actions = []; // 本輪採取的動作（寫入 agent 日誌）
const act = (kind, file, ok, detail) => { actions.push({ at: new Date().toISOString(), kind, file, ok, detail: String(detail || "").slice(0, 300) }); log(`${ok ? "✔" : "✖"} [${kind}] ${file} ${detail || ""}`); };

/* ---------------- GitHub API ---------------- */
async function gh(method, path, body) {
  const token = env("GITHUB_TOKEN");
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${NAME}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "aurora-schedule-monitor",
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* 204 等 */ }
  if (!res.ok) { const e = new Error(`GitHub ${method} ${path} → ${res.status} ${(json && json.message) || text.slice(0, 160)}`); e.status = res.status; throw e; }
  return json;
}

/* workflow_dispatch：新版 API 可回傳 run id（return_run_details）；不支援時退回舊行為 */
async function dispatch(file, inputs) {
  const body = { ref: REPO.branch, inputs: inputs || {} };
  try {
    const r = await gh("POST", `/actions/workflows/${encodeURIComponent(file)}/dispatches`, { ...body, return_run_details: true });
    return { runId: (r && (r.workflow_run_id || r.id)) || null, htmlUrl: (r && r.html_url) || "" };
  } catch (e) {
    if (e.status !== 422 && e.status !== 400) throw e; // 舊版 API 不認得 return_run_details → 不帶再送一次
    await gh("POST", `/actions/workflows/${encodeURIComponent(file)}/dispatches`, body);
    return { runId: null, htmlUrl: "" };
  }
}

/* ---------------- 收集 ---------------- */
async function collect() {
  const dir = join(ROOT, ".github/workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const meta = await gh("GET", "/actions/workflows?per_page=100");
  const byKey = new Map((meta.workflows || []).map((w) => [core.workflowKey(w.path), w]));
  const list = files.map((f) => {
    const y = core.parseWorkflowYaml(readFileSync(join(dir, f), "utf8"));
    const m = byKey.get(f);
    return { file: f, id: m ? m.id : null, name: y.name || (m && m.name) || f, state: m ? m.state : "unknown", crons: y.crons, dispatchable: y.dispatch, html: `https://github.com/${OWNER}/${NAME}/actions/workflows/${f}` };
  });
  // GitHub Pages 部署（動態 workflow，沒有 yml 檔）
  for (const [key, m] of byKey) if (m.path.startsWith("dynamic/") && policyFor(key).label) {
    list.push({ file: key, id: m.id, name: m.name, state: m.state, crons: [], dispatchable: false, html: m.html_url || `https://github.com/${OWNER}/${NAME}/actions` });
  }
  await Promise.all(list.map(async (w) => {
    if (!w.id) { w.runs = []; return; }
    try {
      const r = await gh("GET", `/actions/workflows/${w.id}/runs?per_page=${RUNS_PER_WF}&exclude_pull_requests=true`);
      w.runs = (r.workflow_runs || []).map(core.slimRun);
    } catch (e) { w.runs = []; w.error = e.message; }
  }));
  const data = {};
  for (const chk of DATA_CHECKS) {
    try { data[chk.file] = { json: JSON.parse(readFileSync(join(ROOT, chk.file), "utf8")) }; }
    catch (e) { data[chk.file] = { json: null, err: existsSync(join(ROOT, chk.file)) ? "JSON 解析失敗" : "檔案不存在" }; }
  }
  return { workflows: list, data };
}

/* ---------------- Firestore ---------------- */
async function openFirestore() {
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  if (!sa) { log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT：略過後台重跑佇列與快照寫入（監控與 Issue 告警照常）。"); return null; }
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(sa)) });
  return getFirestore();
}

/* 後台請求：queued → 驗證並觸發；dispatched／running → 追蹤結果 */
async function processRequests(db, snap) {
  if (!db) return new Set();
  const touched = new Set();
  const files = snap.workflows.map((w) => w.file);
  const col = db.collection(REQ_COLL);
  const qs = await col.where("state", "in", ["queued", "dispatched", "running"]).get();
  const reqs = qs.docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
    .sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
  const linked = new Set(reqs.filter((r) => r.runId).map((r) => r.runId));
  const now = Date.now();

  for (const r of reqs) {
    const wf = snap.workflows.find((w) => w.file === r.workflow);
    const upd = async (patch) => { if (!DRY) await r.ref.update({ ...patch, updatedAt: new Date().toISOString(), processedBy: AGENT }); };
    try {
      if (r.state === "queued") {
        // 以 transaction 認領，避免兩輪代理重疊時重複觸發
        if (!DRY) {
          const claimed = await db.runTransaction(async (tx) => {
            const s = await tx.get(r.ref);
            if (!s.exists || s.data().state !== "queued") return false;
            tx.update(r.ref, { state: "dispatching", processedBy: AGENT, updatedAt: new Date().toISOString() });
            return true;
          });
          if (!claimed) continue;
        }
        const bad = core.validateRequest({ workflow: r.workflow, action: r.action, runId: r.runId }, files);
        if (bad) { await upd({ state: "rejected", error: bad }); act("request", r.workflow, false, `拒絕：${bad}`); continue; }
        touched.add(r.workflow);
        if (DRY) { log(`(dry) 將處理請求 ${r.id}：${r.action} ${r.workflow}`); continue; }
        if (r.action === "dispatch") {
          const inputs = core.sanitizeInputs(r.workflow, r.inputs || {});
          const d = await dispatch(r.workflow, inputs);
          await upd({ state: d.runId ? "running" : "dispatched", dispatchedAt: new Date().toISOString(), ...(d.runId ? { runId: d.runId } : {}), ...(d.htmlUrl ? { runUrl: d.htmlUrl } : {}) });
          if (d.runId) linked.add(d.runId);
          act("dispatch", r.workflow, true, `後台請求 ${r.id}${Object.keys(inputs).length ? " " + JSON.stringify(inputs) : ""}`);
        } else {
          const run = await gh("GET", `/actions/runs/${r.runId}`);
          if (core.workflowKey(run.path) !== r.workflow) { await upd({ state: "rejected", error: "runId 不屬於此 workflow" }); continue; }
          if (run.status !== "completed") { await upd({ state: "rejected", error: "該次執行尚未結束，無法重跑" }); continue; }
          await gh("POST", `/actions/runs/${r.runId}/${r.action === "rerun" ? "rerun" : "rerun-failed-jobs"}`);
          await upd({ state: "running", dispatchedAt: new Date().toISOString(), runUrl: run.html_url, attempt: (run.run_attempt || 1) + 1 });
          act(r.action, r.workflow, true, `run ${r.runId}`);
        }
      } else {
        // 追蹤：dispatched 尚未對到 run → 依時間找；running → 看是否完成
        if (!wf) continue;
        let runId = r.runId || null;
        if (!runId) {
          const since = Date.parse(r.dispatchedAt || r.requestedAt) - 90 * 1000;
          const cand = wf.runs.filter((x) => x.event === "workflow_dispatch" && Date.parse(x.created) >= since && !linked.has(x.id))
            .sort((a, b) => Date.parse(a.created) - Date.parse(b.created))[0];
          if (cand) { runId = cand.id; linked.add(cand.id); await upd({ state: "running", runId, runUrl: cand.url }); }
          else if (now - Date.parse(r.dispatchedAt || r.requestedAt) > 6 * core.HOUR) { await upd({ state: "expired", error: "6 小時內未找到對應的執行紀錄" }); }
          continue;
        }
        const run = wf.runs.find((x) => x.id === runId) || core.slimRun(await gh("GET", `/actions/runs/${runId}`));
        const wantAttempt = r.attempt || 1;
        if (run.status === "completed" && (run.attempt || 1) >= wantAttempt) {
          await upd({ state: run.conclusion === "success" ? "completed" : "failed", conclusion: run.conclusion || "", runUrl: run.url });
          act("result", r.workflow, run.conclusion === "success", `請求 ${r.id} → ${run.conclusion}`);
        }
      }
    } catch (e) {
      await upd({ state: "failed", error: e.message.slice(0, 300) }).catch(() => {});
      act("request", r.workflow, false, e.message);
    }
  }
  return touched;
}

/* ---------------- 自我修復 ---------------- */
async function heal(result, skip) {
  if (!HEAL_ON) return;
  let budget = 6; // 每輪最多動作數，避免異常時連環觸發
  for (const w of result.workflows) {
    if (budget <= 0 || skip.has(w.file)) continue;
    const ev = w.eval;
    try {
      if (ev.retry.eligible) {
        if (!DRY) await gh("POST", `/actions/runs/${ev.retry.runId}/rerun-failed-jobs`);
        act("retry", w.file, true, `${DRY ? "(dry) " : ""}重跑失敗工作 run ${ev.retry.runId}`); budget--;
      } else if (ev.catchUp.eligible && w.policy.dispatch !== false) {
        if (!DRY) await dispatch(w.file, {});
        act("catchup", w.file, true, `${DRY ? "(dry) " : ""}補跑（上次執行 ${core.fmtTpe(ev.lastCover)}，漏 ${ev.missed} 次排程）`); budget--;
      }
    } catch (e) { act(ev.retry.eligible ? "retry" : "catchup", w.file, false, e.message); }
  }
}

/* ---------------- Issue 告警 ---------------- */
async function alerts(result) {
  if (!ISSUES_ON || DRY) return;
  try { await gh("POST", "/labels", { name: ISSUE_LABEL, color: "d93f0b", description: "排程監控代理自動開立" }); } catch { /* 已存在 */ }
  const open = await gh("GET", `/issues?state=open&labels=${ISSUE_LABEL}&per_page=100`);
  const byKey = new Map();
  for (const i of open || []) { const m = (i.body || "").match(/<!-- monitor-key:([^ ]+) -->/); if (m) byKey.set(m[1], i); }
  const items = [
    ...result.workflows.map((w) => ({ key: `wf:${w.file}`, title: w.label, status: w.eval.status, reasons: w.eval.reasons, link: w.eval.lastDone ? w.eval.lastDone.url : w.html })),
    ...result.checks.map((c) => ({ key: `data:${c.key}`, title: `資料：${c.label}`, status: c.eval.status, reasons: [c.eval.reason], link: `https://github.com/${OWNER}/${NAME}/blob/main/${c.file}` })),
  ];
  let opened = 0;
  for (const it of items) {
    const bad = it.status === "fail" || it.status === "disabled";
    const existing = byKey.get(it.key);
    try {
      if (bad && !existing && opened < 5) {
        await gh("POST", "/issues", {
          title: `[排程監控] ${it.title} 異常`, labels: [ISSUE_LABEL],
          body: [`監控代理於 ${core.fmtTpe(Date.now())}（台北）偵測到異常：`, "", ...it.reasons.map((r) => `- ${r}`), "",
            `相關連結：${it.link}`, `後台監控頁：https://${OWNER.toLowerCase()}.github.io/${NAME}/admin/monitor/`, RUN_URL ? `代理執行：${RUN_URL}` : "",
            "", "恢復正常後本 Issue 會自動關閉。", `<!-- monitor-key:${it.key} -->`].join("\n"),
        });
        opened++; act("issue", it.key, true, "開立告警");
      } else if (!bad && existing && (it.status === "ok" || it.status === "running" || it.status === "idle")) {
        await gh("POST", `/issues/${existing.number}/comments`, { body: `✅ ${core.fmtTpe(Date.now())}（台北）已恢復正常：${it.reasons.join("；")}` });
        await gh("PATCH", `/issues/${existing.number}`, { state: "closed", state_reason: "completed" });
        act("issue", it.key, true, `關閉 #${existing.number}`);
      }
    } catch (e) { act("issue", it.key, false, e.message); }
  }
}

/* ---------------- 輸出 ---------------- */
function summary(result) {
  const icon = { ok: "🟢", running: "🔵", warn: "🟡", fail: "🔴", disabled: "⛔", idle: "⚪", unknown: "⚪" };
  const lines = [`## 排程監控 · ${core.fmtTpe(result.now)}（台北）`, "",
    `正常 ${result.counts.ok}｜執行中 ${result.counts.running}｜注意 ${result.counts.warn}｜異常 ${result.counts.fail}｜待命 ${result.counts.idle}`, "",
    "| 狀態 | 排程 | 下次（台北） | 說明 |", "|---|---|---|---|",
    ...result.workflows.map((w) => `| ${icon[w.eval.status]} | ${w.label} | ${core.fmtTpe(w.eval.nextExpected)} | ${w.eval.reasons.join("；")} |`),
    ...result.checks.map((c) => `| ${icon[c.eval.status]} | 資料：${c.label} | — | ${c.eval.reason} |`),
    ...result.claude.map((c) => `| ${icon[c.eval.status]} | Claude：${c.name} | ${core.fmtTpe(c.eval.nextExpected)} | ${c.eval.reason} |`),
  ];
  if (actions.length) lines.push("", "### 本輪動作", ...actions.map((a) => `- ${a.ok ? "✔" : "✖"} ${a.kind} · ${a.file} · ${a.detail}`));
  const text = lines.join("\n");
  if (env("GITHUB_STEP_SUMMARY")) appendFileSync(env("GITHUB_STEP_SUMMARY"), text + "\n");
  log(text);
}

/* Firestore 不接受 undefined／NaN／Infinity → 轉 null */
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v)));

async function writeSnapshot(db, snap, result, startedAt) {
  const status = buildStatus(snap, result, startedAt);
  if (env("MONITOR_DUMP")) writeFileSync(env("MONITOR_DUMP"), JSON.stringify(clean({ status, agent: { actions } }), null, 1)); // 本機除錯用
  if (!db || DRY) return;
  const prev = await db.doc(AGENT_DOC).get().catch(() => null);
  const history = [...actions, ...((prev && prev.exists && prev.data().actions) || [])].slice(0, 40);
  await db.doc(SNAP_DOC).set(clean(status));
  await db.doc(AGENT_DOC).set(clean({ lastRunAt: status.generatedAt, runUrl: RUN_URL, actions: history }), { merge: true });
}
function buildStatus(snap, result, startedAt) {
  return {
    version: 1, generatedAt: new Date(result.now).toISOString(), repo: `${OWNER}/${NAME}`,
    agent: { id: AGENT, runUrl: RUN_URL, durationMs: Date.now() - startedAt, autoheal: HEAL_ON, issues: ISSUES_ON },
    overall: result.overall, counts: result.counts,
    workflows: snap.workflows.map((w) => {
      const ev = result.workflows.find((x) => x.file === w.file).eval;
      return { file: w.file, id: w.id, name: w.name, state: w.state, crons: w.crons, dispatchable: w.dispatchable, html: w.html, error: w.error || "", runs: w.runs,
        status: ev.status, reasons: ev.reasons };
    }),
    data: Object.fromEntries(Object.entries(snap.data).map(([k, v]) => [k, { err: v.err || "", json: v.json ? pickData(v.json) : null }])),
  };
}
/* 快照只留新鮮度檢查需要的欄位（避免把整份日報塞進 Firestore） */
function pickData(json) {
  const out = {};
  for (const k of ["date", "updatedAt", "asOf"]) if (json[k] != null) out[k] = json[k];
  if (json.day && json.day.date) out.day = { date: json.day.date };
  return out;
}

async function main() {
  const startedAt = Date.now();
  const snap = await collect();
  const db = await openFirestore().catch((e) => { log(`::warning::Firestore 初始化失敗：${e.message}`); return null; });
  let touched = new Set();
  try { touched = await processRequests(db, snap); } catch (e) { log(`::warning::處理後台請求失敗：${e.message}`); }
  // 剛觸發過的 workflow 重新抓一次紀錄，讓評估與快照看得到新的一筆
  for (const f of touched) {
    const w = snap.workflows.find((x) => x.file === f);
    if (w && w.id) try { w.runs = (await gh("GET", `/actions/workflows/${w.id}/runs?per_page=${RUNS_PER_WF}`)).workflow_runs.map(core.slimRun); } catch { /* 下輪再補 */ }
  }
  const result = core.evaluateAll(snap, Date.now());
  await heal(result, touched);
  try { await alerts(result); } catch (e) { log(`::warning::Issue 告警失敗：${e.message}`); }
  summary(result);
  try { await writeSnapshot(db, snap, result, startedAt); } catch (e) { log(`::warning::寫入快照失敗：${e.message}`); }
  if (result.overall === "fail") log("::notice::有排程異常，詳見上表與後台監控頁。");
}

main().catch((e) => { console.error(e); process.exit(1); });
