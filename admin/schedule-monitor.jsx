/* =====================================================================
   排程監控 · 後台面板（RWD）
   - 資料：Firestore aurora_ops/schedule_status（監控代理每 5 分鐘寫入的快照，即時訂閱）
           ＋「即時更新」直接讀 GitHub API（公開 repo 免 Token）與同源 data/*.json，
           以同一份 scripts/monitor/core.mjs 在瀏覽器重新評估，兩邊判斷一致。
   - 重新執行：預設寫入 aurora_ops_requests 佇列，由監控代理（GITHUB_TOKEN）觸發，前端不持有任何密鑰；
               另可在「設定」貼上個人 GitHub Token（僅存於此瀏覽器分頁）改為即時觸發。
   - 需於 admin.jsx 之後載入（共用 db、auth、errText、OWNER_EMAIL），core 由頁面的
     <script type="module"> 載入後掛在 window.AuroraMonitorCore。
   ===================================================================== */
(function () {
const { useState, useEffect, useMemo, useCallback, useRef } = React;

const OWNER = "allenchen1113official", REPO = "AllenI3Aurora";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/`;
const SITE = "/AllenI3Aurora/";
const SNAP_DOC = "aurora_ops/schedule_status", AGENT_DOC = "aurora_ops/agent", REQ_COLL = "aurora_ops_requests";
const PAT_KEY = "aurora-monitor-pat";

/* ---------------- 樣式（RWD 需要 media query，故用 class） ---------------- */
const CSS = `
.sm { --sm-gap: 14px; color: var(--text-2); font-family: var(--font-body); }
.sm-head { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:14px; }
.sm-title { font-family:var(--font-display); color:var(--text-1); font-size:22px; font-weight:900; margin:0; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.sm-sub { color:var(--text-3); font-size:12.5px; margin-top:4px; line-height:1.6; }
.sm-sub a { color:var(--text-2); }
.sm-actions { display:flex; gap:8px; flex-wrap:wrap; }
.sm-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:700; font-family:var(--font-display); white-space:nowrap; }
.sm-dot { width:8px; height:8px; border-radius:50%; flex:none; }
.sm-stats { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:10px; margin-bottom:16px; }
.sm-stat { text-align:left; cursor:pointer; background:var(--night-800); border:1px solid var(--border); border-radius:var(--radius-lg); padding:12px 14px; color:inherit; font:inherit; }
.sm-stat[data-on="1"] { border-color:var(--border-aurora); box-shadow:0 0 0 1px var(--border-aurora) inset; }
.sm-stat b { display:block; font-family:var(--font-display); font-size:26px; color:var(--text-1); line-height:1.1; }
.sm-stat span { font-size:12px; color:var(--text-3); display:flex; align-items:center; gap:6px; }
.sm-tabs { display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; margin-bottom:14px; scrollbar-width:thin; }
.sm-tabs button { flex:none; }
.sm-sec { margin:0 0 22px; }
.sm-sec h3 { font-family:var(--font-display); color:var(--text-1); font-size:15px; margin:0 0 10px; display:flex; align-items:center; gap:8px; }
.sm-sec h3 small { color:var(--text-4); font-weight:500; font-size:12px; font-family:var(--font-body); }
.sm-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:var(--sm-gap); }
.sm-card { background:var(--night-800); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px 16px; display:flex; flex-direction:column; gap:10px; min-width:0; }
.sm-card[data-s="fail"], .sm-card[data-s="disabled"] { border-color:color-mix(in srgb, var(--danger) 55%, transparent); }
.sm-card[data-s="warn"] { border-color:color-mix(in srgb, var(--warning) 45%, transparent); }
.sm-card-top { display:flex; align-items:flex-start; gap:10px; }
.sm-card-name { flex:1; min-width:0; }
.sm-card-name b { display:block; color:var(--text-1); font-family:var(--font-display); font-size:15px; line-height:1.35; }
.sm-mono { font-family:var(--font-mono); font-size:11.5px; color:var(--text-4); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sm-reason { font-size:13px; line-height:1.6; color:var(--text-2); }
.sm-reason li { margin:0; }
.sm-metrics { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }
.sm-metrics div { background:var(--night-850); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:7px 9px; min-width:0; }
.sm-metrics small { display:block; color:var(--text-4); font-size:10.5px; letter-spacing:.04em; }
.sm-metrics span { display:block; color:var(--text-1); font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sm-strip { display:flex; gap:3px; align-items:flex-end; height:22px; }
.sm-strip a { flex:1; max-width:18px; border-radius:3px; min-height:6px; display:block; }
.sm-cron { font-size:11.5px; color:var(--text-3); line-height:1.6; }
.sm-cron code { font-family:var(--font-mono); color:var(--text-4); font-size:11px; }
.sm-btns { display:flex; gap:6px; flex-wrap:wrap; margin-top:auto; }
.sm-btns .ad-btn { padding:7px 11px; font-size:12.5px; }
.sm-list { background:var(--night-800); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
.sm-row { display:grid; grid-template-columns: 92px minmax(0,1.3fr) minmax(0,2fr) 150px; gap:12px; align-items:center; padding:11px 14px; border-top:1px solid var(--border-subtle); font-size:13px; }
.sm-row:first-child { border-top:0; }
.sm-row b { color:var(--text-1); font-weight:700; }
.sm-row .sm-k { color:var(--text-4); font-size:11.5px; }
.sm-req { grid-template-columns: 92px minmax(0,1.4fr) minmax(0,1.6fr) 170px; }
.sm-empty { padding:18px; color:var(--text-3); font-size:13px; text-align:center; }
.sm-banner { border-radius:var(--radius-md); padding:10px 14px; font-size:13px; line-height:1.6; margin-bottom:14px; border:1px solid var(--border); }
.sm-modal { position:fixed; inset:0; background:var(--scrim); display:flex; align-items:center; justify-content:center; z-index:60; padding:16px; }
.sm-dialog { width:100%; max-width:520px; max-height:calc(100dvh - 32px); overflow:auto; background:var(--night-850); border:1px solid var(--border-strong); border-radius:var(--radius-lg); padding:20px; box-shadow:0 20px 60px rgba(0,0,0,.5); }
.sm-dialog h4 { margin:0 0 4px; font-family:var(--font-display); color:var(--text-1); font-size:17px; }
.sm-field { margin:14px 0 0; }
.sm-check { display:flex; align-items:center; gap:8px; font-size:13.5px; color:var(--text-2); cursor:pointer; }
.sm-seg { display:flex; gap:6px; flex-wrap:wrap; }
.sm-toast { position:fixed; left:50%; bottom:20px; transform:translateX(-50%); z-index:70; background:var(--night-700); border:1px solid var(--border-strong); color:var(--text-1); padding:10px 16px; border-radius:var(--radius-md); font-size:13px; max-width:calc(100vw - 32px); box-shadow:0 10px 30px rgba(0,0,0,.4); }
@media (max-width: 860px) {
  .sm-row, .sm-req { grid-template-columns: 82px minmax(0,1fr); }
  .sm-row > :nth-child(3), .sm-row > :nth-child(4) { grid-column: 2; }
}
@media (max-width: 640px) {
  .sm-stats { grid-template-columns:repeat(3, minmax(0,1fr)); }
  .sm-stat { padding:10px; }
  .sm-stat b { font-size:22px; }
  .sm-grid { grid-template-columns:1fr; }
  .sm-title { font-size:19px; }
  .sm-modal { align-items:flex-end; padding:0; }
  .sm-dialog { max-width:none; border-radius:var(--radius-lg) var(--radius-lg) 0 0; max-height:88dvh; }
}
`;
function useStyle() {
  useEffect(() => {
    if (document.getElementById("sm-style")) return;
    const el = document.createElement("style"); el.id = "sm-style"; el.textContent = CSS; document.head.appendChild(el);
  }, []);
}

const TONE = {
  success: ["var(--success)", "var(--success-soft)"], info: ["var(--info)", "var(--info-soft)"],
  warning: ["var(--warning)", "var(--warning-soft)"], danger: ["var(--danger)", "var(--danger-soft)"],
  muted: ["var(--text-3)", "var(--night-700)"],
};
function Pill({ status, core, label }) {
  const meta = (core && core.STATUS_META[status]) || { label: status, tone: "muted" };
  const [fg, bg] = TONE[meta.tone] || TONE.muted;
  return <span className="sm-pill" style={{ color: fg, background: bg }}><span className="sm-dot" style={{ background: fg }} />{label || meta.label}</span>;
}
const runColor = (r) => r.status !== "completed" ? "var(--info)" : r.conclusion === "success" ? "var(--success)"
  : ["failure", "timed_out", "startup_failure"].includes(r.conclusion) ? "var(--danger)" : "var(--text-4)";
const CONCL = { success: "成功", failure: "失敗", timed_out: "逾時", cancelled: "取消", skipped: "略過", startup_failure: "啟動失敗", action_required: "待核准" };
const EVENT = { schedule: "排程", workflow_dispatch: "手動／代理", push: "push", dynamic: "自動" };
const REQ_ST = {
  queued: ["排隊中", "muted"], dispatching: ["觸發中", "info"], dispatched: ["已觸發", "info"], running: ["執行中", "info"],
  completed: ["成功", "success"], failed: ["失敗", "danger"], rejected: ["已拒絕", "danger"], cancelled: ["已取消", "muted"], expired: ["逾時未對到", "warning"],
};

/* 後台寫入 aurora_ops_requests 的 payload（欄位須與 firebase/firestore.rules 的 opsReqFields 一致；
   scripts/monitor/monitor.test.mjs 會靜態比對） */
function buildOpsRequest({ workflow, action, runId, inputs, note, email, direct, runUrl }) {
  const at = new Date().toISOString();
  const req = {
    workflow, action, runId: Number.isInteger(runId) ? runId : null, inputs: inputs || {}, note: (note || "").slice(0, 200),
    state: direct ? "dispatched" : "queued", mode: direct ? "direct" : "queue",
    requestedBy: email || "", requestedAt: at, dispatchedAt: direct ? at : null, runUrl: runUrl || null,
  };
  Object.keys(req).forEach((k) => { if (req[k] == null) delete req[k]; }); // Firestore 不收 undefined／規則不收多餘的 null
  return req;
}

/* ---------------- GitHub（瀏覽器端） ---------------- */
async function ghFetch(path, token, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.body ? { "content-type": "application/json" } : {}) },
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* 204 */ }
  if (!res.ok) {
    const left = res.headers.get("x-ratelimit-remaining");
    throw new Error(res.status === 403 && left === "0" ? "GitHub API 未登入額度已用完（每小時 60 次），請稍後再試或在設定貼上 Token" : `GitHub ${res.status}：${(json && json.message) || text.slice(0, 120)}`);
  }
  return json;
}

function getPat() { try { return sessionStorage.getItem(PAT_KEY) || localStorage.getItem(PAT_KEY) || ""; } catch { return ""; } }
function setPat(v, remember) {
  try { sessionStorage.removeItem(PAT_KEY); localStorage.removeItem(PAT_KEY); if (v) (remember ? localStorage : sessionStorage).setItem(PAT_KEY, v); } catch { /* 私密模式 */ }
}

/* ---------------- 主面板 ---------------- */
function ScheduleMonitorPanel() {
  useStyle();
  const [core, setCore] = useState(() => window.AuroraMonitorCore || null);
  const [snap, setSnap] = useState(undefined);      // undefined＝載入中、null＝尚無快照
  const [agent, setAgent] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [live, setLive] = useState(null);           // { runs:{file:[…]}, data:{}, workflows?, at }
  const [liveBusy, setLiveBusy] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const [dlg, setDlg] = useState(null);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [pat, setPatState] = useState(getPat);
  const autoLive = useRef(false);

  useEffect(() => {
    if (core) return;
    const on = () => setCore(window.AuroraMonitorCore);
    window.addEventListener("aurora-monitor-core", on);
    const t = setInterval(() => { if (window.AuroraMonitorCore) { on(); clearInterval(t); } }, 300);
    return () => { window.removeEventListener("aurora-monitor-core", on); clearInterval(t); };
  }, [core]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 5200); };

  // Firestore 即時訂閱
  useEffect(() => {
    if (!db) { setSnap(null); return; }
    const onErr = (e) => { setErr(errText(e)); setSnap((s) => (s === undefined ? null : s)); };
    const u1 = db.doc(SNAP_DOC).onSnapshot((d) => setSnap(d.exists ? d.data() : null), onErr);
    const u2 = db.doc(AGENT_DOC).onSnapshot((d) => setAgent(d.exists ? d.data() : null), () => {});
    const u3 = db.collection(REQ_COLL).orderBy("requestedAt", "desc").limit(30)
      .onSnapshot((q) => setReqs(q.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => { u1(); u2(); u3(); };
  }, []);

  /* 即時更新：GitHub API＋同源 data/*.json；沒有快照時改逐一抓 workflow 與 yml */
  const refreshLive = useCallback(async () => {
    if (!core) return;
    setLiveBusy(true); setErr("");
    try {
      const token = getPat();
      const out = { runs: {}, data: {}, at: Date.now() };
      const need = !snap || !(snap.workflows || []).length;
      if (need) {
        const meta = await ghFetch("/actions/workflows?per_page=100", token);
        const wfs = (meta.workflows || []).filter((w) => w.path.startsWith(".github/workflows/") || core.registry.WORKFLOWS[core.workflowKey(w.path)]);
        out.workflows = await Promise.all(wfs.map(async (w) => {
          const file = core.workflowKey(w.path);
          let y = { name: w.name, crons: [], dispatch: false };
          if (w.path.startsWith(".github/")) {
            try { const t = await fetch(RAW + w.path + "?t=" + Date.now()); if (t.ok) y = core.parseWorkflowYaml(await t.text()); else return null; } catch { return null; }
          }
          let runs = [];
          try { runs = ((await ghFetch(`/actions/workflows/${w.id}/runs?per_page=15`, token)).workflow_runs || []).map(core.slimRun); } catch { /* 額度不足時略過 */ }
          return { file, id: w.id, name: y.name || w.name, state: w.state, crons: y.crons, dispatchable: y.dispatch, runs, html: `https://github.com/${OWNER}/${REPO}/actions/workflows/${file}` };
        })).then((a) => a.filter(Boolean));
      } else {
        const r = await ghFetch("/actions/runs?per_page=100&exclude_pull_requests=true", token);
        for (const x of (r.workflow_runs || []).map(core.slimRun)) (out.runs[x.path] = out.runs[x.path] || []).push(x);
      }
      await Promise.all(core.registry.DATA_CHECKS.map(async (c) => {
        try { const res = await fetch(SITE + c.file + "?t=" + Date.now(), { cache: "no-store" }); out.data[c.file] = res.ok ? { json: await res.json() } : { json: null, err: `HTTP ${res.status}` }; }
        catch (e) { out.data[c.file] = { json: null, err: e.message }; }
      }));
      setLive(out); setNow(Date.now());
    } catch (e) { setErr(e.message); }
    setLiveBusy(false);
  }, [core, snap]);

  // 首次：沒有快照（代理尚未執行或 Firestore 不可用）時自動抓即時資料
  useEffect(() => { if (core && snap === null && !autoLive.current) { autoLive.current = true; refreshLive(); } }, [core, snap, refreshLive]);

  /* 合併快照＋即時資料 → 評估 */
  const result = useMemo(() => {
    if (!core) return null;
    const base = (live && live.workflows) || (snap && snap.workflows) || [];
    if (!base.length) return null;
    const workflows = base.map((w) => {
      const extra = (live && live.runs[w.file]) || [];
      const map = new Map((w.runs || []).map((r) => [r.id, r]));
      for (const r of extra) map.set(r.id, r);
      return { ...w, runs: [...map.values()].sort((a, b) => Date.parse(b.created) - Date.parse(a.created)).slice(0, 20) };
    });
    const data = { ...((snap && snap.data) || {}), ...((live && live.data) || {}) };
    return core.evaluateAll({ workflows, data }, now);
  }, [core, snap, live, now]);

  const pending = useMemo(() => new Set(reqs.filter((r) => ["queued", "dispatching", "dispatched", "running"].includes(r.state)).map((r) => r.workflow)), [reqs]);

  /* 送出重新執行 */
  const submit = async ({ wf, action, runId, inputs, note, direct }) => {
    const email = auth && auth.currentUser ? auth.currentUser.email : "";
    const clean = core.sanitizeInputs(wf.file, inputs);
    const bad = core.validateRequest({ workflow: wf.file, action, runId }, result.workflows.map((w) => w.file));
    if (bad) throw new Error(bad);
    if (direct) {
      const token = getPat();
      if (!token) throw new Error("尚未設定 GitHub Token");
      let runUrl = "";
      if (action === "dispatch") {
        let r = null;
        try { r = await ghFetch(`/actions/workflows/${wf.file}/dispatches`, token, { method: "POST", body: JSON.stringify({ ref: "main", inputs: clean, return_run_details: true }) }); }
        catch (e) { if (!/422|400/.test(e.message)) throw e; await ghFetch(`/actions/workflows/${wf.file}/dispatches`, token, { method: "POST", body: JSON.stringify({ ref: "main", inputs: clean }) }); }
        runUrl = (r && r.html_url) || "";
        if (r && Number.isInteger(r.workflow_run_id)) runId = r.workflow_run_id;
      } else {
        await ghFetch(`/actions/runs/${runId}/${action === "rerun" ? "rerun" : "rerun-failed-jobs"}`, token, { method: "POST" });
      }
      try { await db.collection(REQ_COLL).add(buildOpsRequest({ workflow: wf.file, action, runId, inputs: clean, note, email, direct: true, runUrl })); }
      catch (e) { flash("已觸發，但寫入紀錄失敗：" + errText(e)); return; }
      flash(`已即時觸發「${wf.label}」，執行紀錄稍後出現（約 10–30 秒）`);
      setTimeout(refreshLive, 12000);
    } else {
      await db.collection(REQ_COLL).add(buildOpsRequest({ workflow: wf.file, action, runId, inputs: clean, note, email, direct: false }));
      flash(`已排入佇列：監控代理下一輪（約 5 分鐘，GitHub 尖峰時可能更久）會觸發「${wf.label}」`);
    }
  };
  const cancelReq = async (r) => {
    try { await db.collection(REQ_COLL).doc(r.id).update({ state: "cancelled", updatedAt: new Date().toISOString() }); flash("已取消請求"); }
    catch (e) { flash(errText(e)); }
  };

  if (!core) return <div style={{ color: "var(--text-3)" }}>載入監控邏輯中…</div>;

  const r = result;
  const statsDef = [["ok", "正常", "success"], ["running", "執行中", "info"], ["warn", "注意", "warning"], ["fail", "異常", "danger"], ["idle", "待命", "muted"]];
  const match = (s) => filter === "all" || filter === "gh" || filter === "data" || filter === "claude" || filter === "reqs"
    ? true : filter === "issue" ? ["warn", "fail", "disabled"].includes(s) : (filter === s || (filter === "fail" && s === "disabled") || (filter === "idle" && s === "unknown"));
  const show = (sec) => filter === "all" || filter === "issue" || ["ok", "running", "warn", "fail", "idle"].includes(filter) || filter === sec;
  const snapAt = snap && snap.generatedAt ? Date.parse(snap.generatedAt) : NaN;
  const agentStale = Number.isFinite(snapAt) && now - snapAt > 30 * 60 * 1000;
  const wfs = r ? r.workflows.filter((w) => match(w.eval.status)) : [];
  const order = (a, b) => (core.LEVEL[b.eval.status] - core.LEVEL[a.eval.status]) || a.label.localeCompare(b.label, "zh-Hant");

  return (
    <div className="sm">
      <div className="sm-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="sm-title">排程監控 {r && <Pill status={r.overall} core={core} label={{ ok: "全部正常", running: "執行中", warn: "需要注意", fail: "有異常" }[r.overall]} />}</h2>
          <div className="sm-sub">
            {Number.isFinite(snapAt)
              ? <>代理快照 {core.ago(snapAt, now)}（{core.fmtTpe(snapAt)}）{snap.agent && snap.agent.runUrl ? <> · <a href={snap.agent.runUrl} target="_blank" rel="noopener">代理紀錄 ↗</a></> : null}</>
              : snap === undefined ? "讀取監控快照中…" : "尚無代理快照（以 GitHub 即時資料顯示）"}
            {live ? <> · 即時資料 {core.ago(live.at, now)}</> : null}
            {snap && snap.agent ? <> · 自動修復 {snap.agent.autoheal ? "開" : "關"} · Issue 告警 {snap.agent.issues ? "開" : "關"}</> : null}
          </div>
        </div>
        <div className="sm-actions">
          <button className="ad-btn ghost" onClick={refreshLive} disabled={liveBusy}>{liveBusy ? "更新中…" : "↻ 即時更新"}</button>
          <button className="ad-btn ghost" onClick={() => setSettings(true)} title="即時觸發 Token 設定">⚙ {pat ? "即時模式" : "設定"}</button>
          <a className="ad-btn ghost" href={`https://github.com/${OWNER}/${REPO}/actions`} target="_blank" rel="noopener">Actions ↗</a>
        </div>
      </div>

      {err && <div className="sm-banner" style={{ color: "var(--danger)", borderColor: "var(--danger)", background: "var(--danger-soft)" }}>{err}</div>}
      {agentStale && <div className="sm-banner" style={{ color: "var(--warning)", background: "var(--warning-soft)" }}>
        監控代理已 {core.ago(snapAt, now).replace("前", "")}沒有回報（GitHub 尖峰時排程可能被延遲）。佇列中的請求會等到代理下一輪才觸發；急件可在「設定」啟用即時模式。
      </div>}

      {r ? <>
        <div className="sm-stats">
          {statsDef.map(([k, label, tone]) => (
            <button key={k} className="sm-stat" data-on={filter === k ? "1" : "0"} onClick={() => setFilter(filter === k ? "all" : k)}>
              <b>{r.counts[k] || 0}</b><span><i className="sm-dot" style={{ background: TONE[tone][0] }} />{label}</span>
            </button>
          ))}
        </div>
        <div className="sm-tabs" role="tablist">
          {[["all", "全部"], ["issue", "需處理"], ["gh", "GitHub Actions"], ["data", "產出新鮮度"], ["claude", "Claude 排程"], ["reqs", "執行請求"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={"ad-btn" + (filter === k ? " primary" : " ghost")} style={{ padding: "7px 13px" }} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>

        {show("gh") && <section className="sm-sec">
          <h3>GitHub Actions 排程 <small>{wfs.length} 項 · 時間皆為台北</small></h3>
          {wfs.length ? <div className="sm-grid">{[...wfs].sort(order).map((w) => (
            <WorkflowCard key={w.file} w={w} core={core} now={now} pending={pending.has(w.file)} onRun={(action, runId) => setDlg({ wf: w, action, runId })} />
          ))}</div> : <div className="sm-list"><div className="sm-empty">此篩選沒有項目</div></div>}
        </section>}

        {show("data") && <section className="sm-sec">
          <h3>產出新鮮度 <small>以 data/*.json 判斷排程是否真的有產出</small></h3>
          <div className="sm-list">{r.checks.filter((c) => match(c.eval.status)).map((c) => (
            <div key={c.key} className="sm-row">
              <div><Pill status={c.eval.status} core={core} /></div>
              <div><b>{c.label}</b><div className="sm-k">{c.source}</div></div>
              <div>{c.eval.reason}{c.eval.value ? <div className="sm-k">目前：{c.eval.value}{c.eval.expected ? ` · 預期：${c.eval.expected}` : ""}</div> : null}</div>
              <div className="sm-k" style={{ fontFamily: "var(--font-mono)" }}>{c.file}</div>
            </div>
          ))}{!r.checks.some((c) => match(c.eval.status)) && <div className="sm-empty">此篩選沒有項目</div>}</div>
        </section>}

        {show("claude") && <section className="sm-sec">
          <h3>Claude 排程任務 <small>以產出判斷；重新執行請到 Claude 的排程頁</small></h3>
          <div className="sm-list">{r.claude.filter((c) => match(c.eval.status)).map((c) => (
            <div key={c.id} className="sm-row">
              <div><Pill status={c.eval.status} core={core} label={c.eval.status === "unknown" ? "人工確認" : undefined} /></div>
              <div><b>{c.name}</b><div className="sm-k" style={{ fontFamily: "var(--font-mono)" }}>{c.cron.replace("CRON_TZ=Asia/Taipei ", "")}（台北）</div></div>
              <div>{c.eval.reason}</div>
              <div className="sm-k">上次 {core.fmtTpe(c.eval.prevExpected)}<br />下次 {core.fmtTpe(c.eval.nextExpected)}</div>
            </div>
          ))}{!r.claude.some((c) => match(c.eval.status)) && <div className="sm-empty">此篩選沒有項目</div>}</div>
        </section>}
      </> : <div className="sm-list"><div className="sm-empty">{liveBusy || snap === undefined ? "載入中…" : "尚無資料：請按「即時更新」，或等待監控代理第一次執行。"}</div></div>}

      {(filter === "all" || filter === "reqs") && <section className="sm-sec">
        <h3>執行請求 <small>最近 30 筆 · 佇列由監控代理處理</small></h3>
        <div className="sm-list">{reqs.length ? reqs.map((q) => {
          const [l, tone] = REQ_ST[q.state] || [q.state, "muted"];
          const wf = r && r.workflows.find((w) => w.file === q.workflow);
          return (
            <div key={q.id} className="sm-row sm-req">
              <div><span className="sm-pill" style={{ color: TONE[tone][0], background: TONE[tone][1] }}>{l}</span></div>
              <div><b>{wf ? wf.label : q.workflow}</b><div className="sm-k">{{ dispatch: "重新執行", rerun_failed: "重跑失敗工作", rerun: "整輪重跑" }[q.action] || q.action}{q.mode === "direct" ? " · 即時" : " · 佇列"}{q.inputs && Object.keys(q.inputs).length ? " · " + Object.entries(q.inputs).map(([k, v]) => `${k}=${v}`).join(" ") : ""}</div></div>
              <div>{q.error ? <span style={{ color: "var(--danger)" }}>{q.error}</span> : q.conclusion ? `結果：${CONCL[q.conclusion] || q.conclusion}` : q.note || "—"}
                {q.runUrl ? <> · <a href={q.runUrl} target="_blank" rel="noopener" style={{ color: "var(--text-2)" }}>執行紀錄 ↗</a></> : null}</div>
              <div className="sm-k">{core.fmtTpe(Date.parse(q.requestedAt))} · {core.ago(Date.parse(q.requestedAt), now)}
                {q.state === "queued" && <button className="ad-btn ghost" style={{ marginLeft: 8, padding: "3px 9px", fontSize: 12 }} onClick={() => cancelReq(q)}>取消</button>}</div>
            </div>
          );
        }) : <div className="sm-empty">尚無請求紀錄</div>}</div>
        {agent && agent.actions && agent.actions.length ? <>
          <h3 style={{ marginTop: 18 }}>代理動作紀錄 <small>自動重試／補跑／告警</small></h3>
          <div className="sm-list">{agent.actions.slice(0, 15).map((a, i) => (
            <div key={i} className="sm-row">
              <div><span className="sm-pill" style={{ color: a.ok ? "var(--success)" : "var(--danger)", background: a.ok ? "var(--success-soft)" : "var(--danger-soft)" }}>{{ retry: "重試", catchup: "補跑", dispatch: "觸發", issue: "告警", result: "結果", request: "請求", rerun_failed: "重跑", rerun: "重跑" }[a.kind] || a.kind}</span></div>
              <div><b>{(r && (r.workflows.find((w) => w.file === a.file) || {}).label) || a.file}</b></div>
              <div>{a.detail}</div>
              <div className="sm-k">{core.fmtTpe(Date.parse(a.at))}</div>
            </div>
          ))}</div>
        </> : null}
      </section>}

      {dlg && <RunDialog {...dlg} core={core} hasPat={!!pat} onClose={() => setDlg(null)} onSubmit={submit} />}
      {settings && <SettingsDialog pat={pat} onClose={() => setSettings(false)} onSave={(v, remember) => { setPat(v, remember); setPatState(v); setSettings(false); flash(v ? "已啟用即時模式（Token 只存在此瀏覽器）" : "已清除 Token，改回佇列模式"); }} />}
      {toast && <div className="sm-toast" role="status">{toast}</div>}
    </div>
  );
}

function WorkflowCard({ w, core, now, pending, onRun }) {
  const ev = w.eval, pol = w.policy;
  const last = ev.lastRun, strip = [...(w.runs || [])].slice(0, 14).reverse();
  const canRerun = ev.lastDone && core.runFailed(ev.lastDone) && (pol.dispatch || pol.autoRetry);
  return (
    <div className="sm-card" data-s={ev.status}>
      <div className="sm-card-top">
        <div className="sm-card-name"><b>{w.label}</b><div className="sm-mono">{w.file} · {w.category}</div></div>
        <Pill status={ev.status} core={core} />
      </div>
      <div className="sm-reason">{ev.reasons.join("；")}</div>
      <div className="sm-metrics">
        <div><small>上次執行</small><span title={last ? core.fmtTpe(Date.parse(last.created)) : ""}>{last ? `${core.ago(Date.parse(last.created), now)} · ${last.status === "completed" ? (CONCL[last.conclusion] || last.conclusion) : "執行中"}` : "—"}</span></div>
        <div><small>下次排程</small><span>{Number.isFinite(ev.nextExpected) ? core.fmtShort(ev.nextExpected, now) : "手動"}</span></div>
        <div><small>成功率／平均</small><span>{Number.isFinite(ev.successRate) ? `${Math.round(ev.successRate * 100)}%` : "—"} · {core.fmtDuration(ev.avgDuration)}</span></div>
      </div>
      {strip.length ? <div className="sm-strip" aria-label="最近執行">{strip.map((x) => (
        <a key={x.id + "-" + x.attempt} href={x.url} target="_blank" rel="noopener" style={{ background: runColor(x), height: 8 + Math.min(14, (core.runDuration(x) || 0) / 15) }}
          title={`${core.fmtTpe(Date.parse(x.created))} · ${EVENT[x.event] || x.event} · ${x.status === "completed" ? (CONCL[x.conclusion] || x.conclusion) : "執行中"}${x.attempt > 1 ? ` · 第 ${x.attempt} 次` : ""} · ${core.fmtDuration(core.runDuration(x))}`} />
      ))}</div> : null}
      {w.crons && w.crons.length ? <div className="sm-cron">{w.crons.map((c, i) => <div key={i}><code>{c.expr}</code> {c.note}</div>)}</div> : null}
      <div className="sm-btns">
        {pol.dispatch
          ? <button className="ad-btn" onClick={() => onRun("dispatch")} disabled={pending} title={pending ? "已有請求處理中" : ""}>{pending ? "請求處理中…" : "▶ 重新執行"}</button>
          : <span className="sm-k" style={{ fontSize: 12, color: "var(--text-4)", alignSelf: "center" }}>{pol.reason || "不開放自後台觸發"}</span>}
        {canRerun && <button className="ad-btn ghost" onClick={() => onRun("rerun_failed", ev.lastDone.id)} disabled={pending}>↺ 重跑失敗工作</button>}
        <a className="ad-btn ghost" href={(ev.lastDone && ev.lastDone.url) || w.html} target="_blank" rel="noopener">紀錄 ↗</a>
      </div>
    </div>
  );
}

function RunDialog({ wf, action, runId, core, hasPat, onClose, onSubmit }) {
  const pol = wf.policy;
  const [inputs, setInputs] = useState(() => Object.fromEntries(Object.entries(pol.inputs || {}).map(([k, s]) => [k, s.default])));
  const [note, setNote] = useState("");
  const [direct, setDirect] = useState(hasPat);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const strong = pol.confirm === "strong";
  const ok = !strong || confirmText.trim() === wf.file;
  const go = async () => {
    setBusy(true); setErr("");
    try { await onSubmit({ wf, action, runId, inputs, note, direct }); onClose(); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="sm-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sm-dialog" role="dialog" aria-modal="true" aria-label="重新執行排程">
        <h4>{action === "dispatch" ? "重新執行" : "重跑失敗的工作"}：{wf.label}</h4>
        <div className="sm-mono" style={{ whiteSpace: "normal" }}>{wf.file}{runId ? ` · run ${runId}` : ""}</div>
        <div className="sm-field">
          <label className="ad-lbl">觸發方式</label>
          <div className="sm-seg">
            <button className={"ad-btn" + (!direct ? " primary" : " ghost")} onClick={() => setDirect(false)}>排入佇列</button>
            <button className={"ad-btn" + (direct ? " primary" : " ghost")} onClick={() => setDirect(true)} disabled={!hasPat} title={hasPat ? "" : "請先在設定貼上 GitHub Token"}>即時觸發</button>
          </div>
          <div className="sm-sub">{direct ? "以你在此瀏覽器設定的 GitHub Token 立即呼叫 API。" : "寫入佇列，由監控代理（約每 5 分鐘）以 repo 權限觸發；前端不持有任何密鑰。"}</div>
        </div>
        {action === "dispatch" && Object.entries(pol.inputs || {}).map(([k, s]) => (
          <div className="sm-field" key={k}>
            {s.type === "boolean"
              ? <label className="sm-check"><input type="checkbox" checked={!!inputs[k]} onChange={(e) => setInputs({ ...inputs, [k]: e.target.checked })} />{s.label}</label>
              : <><label className="ad-lbl">{s.label}</label><input className="ad-in" value={inputs[k] || ""} onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })} /></>}
          </div>
        ))}
        <div className="sm-field">
          <label className="ad-lbl">備註（選填）</label>
          <input className="ad-in" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：Drive 檔案補上後重抓" />
        </div>
        {strong && <div className="sm-field">
          <label className="ad-lbl">此動作會影響正式環境，請輸入 <code>{wf.file}</code> 確認</label>
          <input className="ad-in" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </div>}
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{err}</div>}
        <div className="sm-actions" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className="ad-btn primary" onClick={go} disabled={busy || !ok}>{busy ? "送出中…" : direct ? "立即觸發" : "排入佇列"}</button>
        </div>
      </div>
    </div>
  );
}

function SettingsDialog({ pat, onClose, onSave }) {
  const [v, setV] = useState(pat);
  const [remember, setRemember] = useState(() => { try { return !!localStorage.getItem(PAT_KEY); } catch { return false; } });
  return (
    <div className="sm-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sm-dialog" role="dialog" aria-modal="true" aria-label="即時觸發設定">
        <h4>即時觸發（選用）</h4>
        <div className="sm-sub">
          預設的「排入佇列」不需要任何 Token。若要按下即觸發，請到 GitHub → Settings → Developer settings →
          Fine-grained tokens 建立 Token：Repository access 只選 <b>{REPO}</b>、Permissions 只給 <b>Actions：Read and write</b>，並設定到期日。
          Token 只存在這個瀏覽器（不會寫入 Firestore 或網站），也會提高「即時更新」的 API 額度。
        </div>
        <div className="sm-field">
          <label className="ad-lbl">GitHub Fine-grained Token</label>
          <input className="ad-in" type="password" value={v} onChange={(e) => setV(e.target.value.trim())} placeholder="github_pat_…" autoComplete="off" />
        </div>
        <div className="sm-field"><label className="sm-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />記住於此裝置（否則關閉分頁即清除）</label></div>
        <div className="sm-actions" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          {pat && <button className="ad-btn danger" onClick={() => onSave("", false)}>清除</button>}
          <button className="ad-btn ghost" onClick={onClose}>取消</button>
          <button className="ad-btn primary" onClick={() => onSave(v, remember)} disabled={!v || !/^(github_pat_|ghp_)/.test(v)}>儲存</button>
        </div>
      </div>
    </div>
  );
}

window.ScheduleMonitorPanel = ScheduleMonitorPanel;
})();
