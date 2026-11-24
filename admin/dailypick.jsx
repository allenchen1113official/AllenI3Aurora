/* =====================================================================
   極光日報・每日來一股（後台導覽「每日來一股」、admin/#dailypick）
   個股分析順序清單：data/dailypick/queue.json（dailypick-queue.yml 每個交易日 16:47 更新，分析完成時也會即時重排）
     順序 ＝ 後台指定下一檔 → 優先組（上市市值前 100＋上櫃市值前 50，依市值）→ 其餘上市櫃普通股（依市值）
     已分析不重複（data/dailypick/history.json，由 Claude 排程「極光日報・每日來一股」分析後追加）
   三分頁：
     分析順序  全部清單（篩選／搜尋／CSV），可「指定下一檔」「略過」→ 寫 Firestore aurora_dailypick/overrides（公開讀、管理者寫）
     分析紀錄  已分析的個股與分析日期、分數、燈號、產出資料夾（StockAdvisor repo）
     今日新增  每日更新時第一次出現在母體的股票（新上市／轉上市櫃）
   需於 admin.jsx 之後載入（共用 db、errText）。掛 window.DailyPickPanel。
   ===================================================================== */
(function () {
const { useState, useEffect, useCallback, useMemo } = React;
const BASE = "/AllenI3Aurora/";
const OV_DOC = () => db.collection("aurora_dailypick").doc("overrides");
const REPORT = "https://github.com/allenchen1113official/StockAdvisor/tree/main/";
const ST = { done: "已分析", pending: "待分析", skipped: "略過", delisted: "下市／暫停" };
const ST_COLOR = { done: "var(--success)", pending: "var(--text-2)", skipped: "var(--text-4)", delisted: "var(--danger)" };
const LIGHT = { "綠燈": "#6F8F7A", "黃燈": "#C9A85E", "橘燈": "#C08A5B", "紅燈": "#A9584E" };
const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
const chip = (on) => ({ cursor: "pointer", padding: "4px 11px", borderRadius: "var(--radius-pill)", fontSize: 12, fontWeight: 800,
  background: on ? "var(--brand-soft)" : "var(--night-700)", color: on ? "var(--text-1)" : "var(--text-3)", border: "1px solid " + (on ? "var(--border-aurora)" : "var(--border)") });
const th = { textAlign: "left", padding: "8px 8px", color: "var(--text-3)", fontSize: 11.5, fontWeight: 700, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--night-800)" };
const td = { padding: "7px 8px", borderBottom: "1px solid var(--border-subtle)", fontSize: 13, color: "var(--text-1)", whiteSpace: "nowrap" };
const mk = (m) => (m === "TWSE" ? "上市" : m === "TPEx" ? "上櫃" : "—");
const fmtMcap = (v) => (v == null ? "—" : v >= 10000 ? (v / 10000).toFixed(2) + " 兆" : v.toLocaleString() + " 億");
const tpe = (iso) => { const t = Date.parse(iso || ""); return isFinite(t) ? new Date(t + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "—"; };
const PAGE = 100;

function Stat({ label, value, sub }) {
  return (
    <div style={{ flex: "1 1 120px", background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
      <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: "var(--text-1)" }}>{value}</div>
      {sub && <div style={{ color: "var(--text-4)", fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

function DailyPickPanel() {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  const [ov, setOv] = useState({ pin: [], skip: [] });      // 已儲存
  const [draft, setDraft] = useState({ pin: [], skip: [] }); // 編輯中
  const [tab, setTab] = useState("order");
  const [flt, setFlt] = useState("pending");
  const [mkt, setMkt] = useState("all");
  const [kw, setKw] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await fetch(BASE + "data/dailypick/queue.json", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      setQ(await r.json());
    } catch (e) { setErr("讀取分析順序清單失敗：" + e.message + "（清單由 dailypick-queue workflow 產生，第一次部署後請到「排程監控」執行一次）"); setQ({ items: [], counts: {}, next: [] }); }
    try {
      const s = await OV_DOC().get();
      const d = s.exists ? s.data() : {};
      const o = { pin: d.pin || [], skip: d.skip || [], updatedAt: d.updatedAt || "" };
      setOv(o); setDraft({ pin: [...o.pin], skip: [...o.skip] });
    } catch (e) { setMsg("讀取後台設定失敗：" + errText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = JSON.stringify(draft.pin) !== JSON.stringify(ov.pin) || JSON.stringify([...draft.skip].sort()) !== JSON.stringify([...ov.skip].sort());
  const togglePin = (code) => setDraft((d) => ({ ...d, pin: d.pin.includes(code) ? d.pin.filter((x) => x !== code) : [...d.pin, code].slice(0, 50), skip: d.skip.filter((x) => x !== code) }));
  const toggleSkip = (code) => setDraft((d) => ({ ...d, skip: d.skip.includes(code) ? d.skip.filter((x) => x !== code) : [...d.skip, code], pin: d.pin.filter((x) => x !== code) }));
  const movePin = (code, dir) => setDraft((d) => { const p = [...d.pin]; const i = p.indexOf(code), j = i + dir; if (i < 0 || j < 0 || j >= p.length) return d; [p[i], p[j]] = [p[j], p[i]]; return { ...d, pin: p }; });
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await OV_DOC().set({ pin: draft.pin, skip: draft.skip, updatedAt: new Date().toISOString() });
      setMsg("已儲存 ✓ 每日來一股取下一檔時會直接套用；清單順序於下次更新（交易日 16:47 或分析完成後）重排。");
      await load();
    } catch (e) { setMsg("儲存失敗：" + errText(e)); }
    setBusy(false);
  };

  const items = (q && q.items) || [];
  const byCode = useMemo(() => new Map(items.map((x) => [x.code, x])), [items]);
  const rows = useMemo(() => {
    const k = kw.trim();
    return items.filter((x) => (flt === "all" || (flt === "tier1" ? x.tier === 1 && x.status !== "delisted" : flt === "new" ? x.isNew : flt === "pinned" ? draft.pin.includes(x.code) : x.status === flt))
      && (mkt === "all" || x.market === mkt) && (!k || x.code.includes(k) || (x.name || "").includes(k) || (x.industry || "").includes(k)));
  }, [items, flt, mkt, kw, draft.pin]);
  useEffect(() => { setPage(0); }, [flt, mkt, kw]);
  const c = (q && q.counts) || {};
  const done = useMemo(() => items.filter((x) => x.status === "done").sort((a, b) => (b.analyzedAt || "").localeCompare(a.analyzedAt || "")), [items]);
  const fresh = useMemo(() => items.filter((x) => x.isNew).sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || a.rank - b.rank), [items]);
  // 預覽：套用尚未重排的指定順序後的下一檔
  const nextPreview = useMemo(() => {
    const pinned = draft.pin.map((p) => byCode.get(p)).filter((x) => x && x.status !== "done");
    const rest = items.filter((x) => x.status === "pending" && !draft.pin.includes(x.code) && !draft.skip.includes(x.code));
    return [...pinned, ...rest].slice(0, 10);
  }, [items, draft, byCode]);

  if (!q) return <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>;
  const Row = ({ x }) => {
    const pinned = draft.pin.includes(x.code), skipped = draft.skip.includes(x.code);
    const st = x.status === "pending" && skipped ? "skipped" : x.status === "skipped" && !skipped ? "pending" : x.status;
    return (
      <tr>
        <td style={{ ...td, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{x.rank}</td>
        <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{x.code}</td>
        <td style={td}>{x.name}{x.isNew && <span style={{ ...chip(true), marginLeft: 6, padding: "1px 7px", fontSize: 10.5 }}>新增</span>}</td>
        <td style={td}>{mk(x.market)}</td>
        <td style={{ ...td, color: "var(--text-2)" }}>{x.industry || "—"}</td>
        <td style={td}>{x.tier === 1 ? <b style={{ color: "var(--illumination)" }}>優先</b> : "一般"} <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>#{x.marketRank ?? "—"}</span></td>
        <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmtMcap(x.mcap)}</td>
        <td style={{ ...td, color: ST_COLOR[st], fontWeight: 700 }}>{ST[st]}{pinned && x.status !== "done" ? ` · 指定 #${draft.pin.indexOf(x.code) + 1}` : ""}</td>
        <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{x.analyzedAt || "—"}</td>
        <td style={td}>{x.score != null ? <span><b>{x.score}</b> <span style={{ color: LIGHT[x.light] || "var(--text-3)" }}>● {x.light}{x.rating ? "・" + x.rating : ""}</span></span> : "—"}</td>
        <td style={td}>
          {x.status === "done" ? (x.folder ? <a href={REPORT + x.folder} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>報告 ↗</a> : "—")
            : x.status === "delisted" ? "—" : (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <button className="ad-btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => togglePin(x.code)}>{pinned ? "取消指定" : "指定下一檔"}</button>
                {pinned && <><button className="ad-btn ghost" style={{ padding: "4px 7px", fontSize: 12 }} onClick={() => movePin(x.code, -1)}>↑</button><button className="ad-btn ghost" style={{ padding: "4px 7px", fontSize: 12 }} onClick={() => movePin(x.code, 1)}>↓</button></>}
                <button className="ad-btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => toggleSkip(x.code)}>{skipped ? "取消略過" : "略過"}</button>
              </span>)}
        </td>
      </tr>
    );
  };
  const Table = ({ list }) => (
    <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{["順序", "代號", "名稱", "市場", "產業", "組別／市值排名", "市值", "狀態", "分析日期", "綜合分數", "操作"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{list.map((x) => <Row key={x.code} x={x} />)}</tbody>
      </table>
      {!list.length && <div style={{ color: "var(--text-3)", padding: 18, textAlign: "center" }}>沒有符合條件的股票</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20 }}>極光日報・每日來一股</h2>
        <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>清單日期 {q.date || "—"}（資料基準 {q.asof || "—"}）· 更新於 {tpe(q.updatedAt)}</span>
        <span style={{ flex: 1 }} />
        <a className="ad-btn ghost" href={BASE + "data/dailypick/queue.csv"} download>下載 CSV</a>
        <button className="ad-btn" onClick={load}>重新整理</button>
      </div>
      <div style={{ color: "var(--text-4)", fontSize: 12.5, lineHeight: 1.7, marginBottom: 12 }}>
        順序：<b>指定下一檔</b> → <b>優先組</b>（上市市值前 100＋上櫃市值前 50，依市值由大到小）→ 其餘上市櫃普通股（依市值）。已分析的股票不再重複；略過者不分析。
        清單每個交易日 16:47 自動更新（新上市／轉上市櫃會標「新增」），Claude 排程「極光日報・每日來一股」17:41 取下一檔分析。
      </div>
      {err && <div style={{ ...box, color: "var(--danger)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat label="母體" value={(c.total || 0).toLocaleString()} sub={`優先組 ${c.tier1 || 0} 檔`} />
        <Stat label="已分析" value={c.done || 0} sub={done[0] ? `最近 ${done[0].analyzedAt} ${done[0].code} ${done[0].name}` : ""} />
        <Stat label="待分析" value={(c.pending || 0).toLocaleString()} sub={`優先組剩 ${c.tier1Pending || 0} 檔`} />
        <Stat label="今日新增" value={c.newToday || 0} sub={(q.newToday || []).slice(0, 4).join("、")} />
        <Stat label="略過／下市" value={`${c.skipped || 0}／${c.delisted || 0}`} />
      </div>

      <div style={box}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <b style={{ color: "var(--text-1)" }}>接下來 10 檔</b>
          {dirty && <span style={{ color: "var(--illumination)", fontSize: 12 }}>（含尚未儲存的指定／略過）</span>}
          <span style={{ flex: 1 }} />
          {dirty && <button className="ad-btn ghost" onClick={() => setDraft({ pin: [...ov.pin], skip: [...ov.skip] })}>還原</button>}
          <button className="ad-btn primary" disabled={!dirty || busy} onClick={save}>{busy ? "儲存中…" : "儲存設定"}</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {nextPreview.map((x, i) => (
            <span key={x.code} style={{ padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid " + (i === 0 ? "var(--border-aurora)" : "var(--border)"), background: i === 0 ? "var(--brand-soft)" : "var(--night-850)", fontSize: 13, color: "var(--text-1)" }}>
              <span style={{ color: "var(--text-4)", marginRight: 6 }}>{i + 1}</span><b style={{ fontFamily: "var(--font-mono)" }}>{x.code}</b> {x.name}
              {draft.pin.includes(x.code) && <span style={{ color: "var(--illumination)", marginLeft: 6, fontSize: 11.5 }}>指定</span>}
            </span>
          ))}
        </div>
        {msg && <div style={{ color: "var(--text-2)", fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["order", "分析順序"], ["history", `分析紀錄（${done.length}）`], ["new", `新增股票（${fresh.length}）`]].map(([k, l]) => <span key={k} style={chip(tab === k)} onClick={() => setTab(k)}>{l}</span>)}
      </div>

      {tab === "order" && (
        <div style={box}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            {[["pending", "待分析"], ["all", "全部"], ["tier1", "優先組"], ["done", "已分析"], ["pinned", "已指定"], ["skipped", "略過"], ["new", "新增"], ["delisted", "下市／暫停"]].map(([k, l]) => <span key={k} style={chip(flt === k)} onClick={() => setFlt(k)}>{l}</span>)}
            <span style={{ width: 8 }} />
            {[["all", "全部市場"], ["TWSE", "上市"], ["TPEx", "上櫃"]].map(([k, l]) => <span key={k} style={chip(mkt === k)} onClick={() => setMkt(k)}>{l}</span>)}
            <input className="ad-in" style={{ maxWidth: 220, marginLeft: "auto" }} placeholder="代號／名稱／產業" value={kw} onChange={(e) => setKw(e.target.value)} />
          </div>
          <Table list={rows.slice(page * PAGE, (page + 1) * PAGE)} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, color: "var(--text-3)", fontSize: 12.5 }}>
            共 {rows.length.toLocaleString()} 檔
            <span style={{ flex: 1 }} />
            <button className="ad-btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>上一頁</button>
            <span>{page + 1}／{Math.max(1, Math.ceil(rows.length / PAGE))}</span>
            <button className="ad-btn ghost" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>下一頁</button>
          </div>
        </div>
      )}
      {tab === "history" && <div style={box}><Table list={done} /></div>}
      {tab === "new" && (
        <div style={box}>
          <div style={{ color: "var(--text-4)", fontSize: 12.5, marginBottom: 8 }}>每日更新時第一次出現在上市櫃母體的股票（第一次建立清單時不計），依加入日期新→舊。</div>
          <Table list={fresh} />
        </div>
      )}
    </div>
  );
}
window.DailyPickPanel = DailyPickPanel;
})();
