/* =====================================================================
   艾倫報報 · 後台管理 — 各區塊資料 CRUD（Supabase）
   讀寫走 Supabase；寫入受 RLS 保護，僅指定 email 登入後可異動。
   ===================================================================== */
const { useState, useEffect, useCallback } = React;

const SB_URL = window.SUPABASE_URL;
const SB_KEY = window.SUPABASE_ANON_KEY;
const configured = !!(SB_URL && SB_KEY && window.supabase && window.supabase.createClient);
const client = configured ? window.supabase.createClient(SB_URL, SB_KEY) : null;

const TONE_OPTS = ["insight", "intelligence", "illumination", "neutral"];

/* 各區塊與欄位定義（type: text | number | textarea | json | tone | select） */
const SECTIONS = [
  { id: "stats", table: "aurora_stats", label: "統計數據", fields: [
    { k: "sort", t: "number" }, { k: "label", t: "text" }, { k: "value", t: "text" }, { k: "unit", t: "text" },
    { k: "delta", t: "text" }, { k: "tone", t: "tone" }, { k: "mode", t: "select", opts: ["finance", "semantic"] },
    { k: "data", t: "json" }, { k: "link", t: "text" },
  ] },
  { id: "focus", table: "aurora_focus", label: "今日關注", fields: [
    { k: "sort", t: "number" }, { k: "tag", t: "text" }, { k: "tone", t: "tone" },
    { k: "title", t: "text" }, { k: "meta", t: "text" }, { k: "icon", t: "text" },
  ] },
  { id: "reading", table: "aurora_reading", label: "待讀清單", fields: [
    { k: "sort", t: "number" }, { k: "title", t: "text" }, { k: "src", t: "text" }, { k: "pct", t: "number" },
  ] },
  { id: "podcasts", table: "aurora_podcasts", label: "Podcast", fields: [
    { k: "sort", t: "number" }, { k: "title", t: "text" }, { k: "meta", t: "text" }, { k: "tone", t: "tone" },
  ] },
  { id: "links", table: "aurora_links", label: "快速連結", fields: [
    { k: "sort", t: "number" }, { k: "label", t: "text" }, { k: "icon", t: "text" },
  ] },
  { id: "issues", table: "aurora_issues", label: "歷期報報", fields: [
    { k: "sort", t: "number" }, { k: "no", t: "text" }, { k: "kind", t: "text" }, { k: "date", t: "text" },
    { k: "tone", t: "tone" }, { k: "title", t: "text" }, { k: "items", t: "number" }, { k: "cover", t: "text" },
  ] },
  { id: "annuli", table: "aurora_annuli", label: "個人年輪", fields: [
    { k: "sort", t: "number" }, { k: "year", t: "text" }, { k: "tone", t: "tone" },
    { k: "title", t: "text" }, { k: "body", t: "textarea" },
  ] },
];

const wrap = { maxWidth: 1080, margin: "0 auto", padding: "0 20px" };

function Center({ children }) {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>{children}</div>;
}

/* ---------- 未設定 ---------- */
function Setup() {
  return (
    <Center>
      <div style={{ maxWidth: 460, textAlign: "center", color: "var(--text-2)" }}>
        <h1 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)" }}>後台尚未啟用</h1>
        <p style={{ lineHeight: 1.7, fontSize: 14 }}>請先在 <code>supabase-config.js</code> 填入 Supabase 專案的
          <b> URL</b> 與 <b>anon key</b>，並於 SQL Editor 執行 <code>db/aurora_backend.sql</code>。</p>
      </div>
    </Center>
  );
}

/* ---------- 登入 ---------- */
function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const { error } = await client.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    setBusy(false);
  };
  return (
    <Center>
      <form onSubmit={submit} style={{ width: 340, background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 28, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, background: "var(--aurora-gradient)", color: "var(--text-on-accent)", fontFamily: "var(--font-display)", fontWeight: 900, boxShadow: "var(--glow-brand)" }}>AI³A</span>
          <h1 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: "12px 0 2px" }}>後台管理登入</h1>
          <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>艾倫報報 · Allen I³ Aurora</div>
        </div>
        <label className="ad-lbl">Email</label>
        <input className="ad-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required style={{ marginBottom: 14 }} />
        <label className="ad-lbl">密碼</label>
        <input className="ad-in" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required style={{ marginBottom: 18 }} />
        {err && <div style={{ color: "var(--danger)", fontSize: 12.5, marginBottom: 14 }}>{err}</div>}
        <button className="ad-btn primary" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "登入中…" : "登入"}</button>
        <p style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 16, lineHeight: 1.6 }}>帳號請於 Supabase → Authentication → Users 建立，email 需與 SQL 中的管理者 email 一致。</p>
      </form>
    </Center>
  );
}

/* ---------- 單筆列 ---------- */
function RowCard({ sec, row, onChanged }) {
  const init = () => {
    const d = {};
    sec.fields.forEach((f) => {
      let v = row[f.k];
      if (f.t === "json") v = v == null ? "[]" : (typeof v === "string" ? v : JSON.stringify(v));
      else v = v == null ? "" : v;
      d[f.k] = v;
    });
    return d;
  };
  const [draft, setDraft] = useState(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setBusy(true); setMsg("");
    const payload = {};
    for (const f of sec.fields) {
      let v = draft[f.k];
      if (f.t === "number") v = (v === "" || v == null) ? null : Number(v);
      if (f.t === "json") {
        try { v = JSON.parse(v || "[]"); }
        catch { setMsg("data 需為合法 JSON（例如 [1,2,3]）"); setBusy(false); return; }
      }
      payload[f.k] = v;
    }
    const res = row.__new
      ? await client.from(sec.table).insert(payload)
      : await client.from(sec.table).update(payload).eq("id", row.id);
    setBusy(false);
    if (res.error) { setMsg("儲存失敗：" + res.error.message); return; }
    onChanged();
  };

  const del = async () => {
    if (row.__new) { onChanged(); return; }
    if (!window.confirm("確定刪除這一筆？")) return;
    setBusy(true);
    const { error } = await client.from(sec.table).delete().eq("id", row.id);
    setBusy(false);
    if (error) { setMsg("刪除失敗：" + error.message); return; }
    onChanged();
  };

  return (
    <div style={{ background: "var(--night-800)", border: "1px solid " + (row.__new ? "var(--border-aurora)" : "var(--border)"), borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {sec.fields.map((f) => {
          const full = f.t === "textarea" || f.t === "json";
          return (
            <div key={f.k} style={{ gridColumn: full ? "1 / -1" : "auto" }}>
              <label className="ad-lbl">{f.k}{f.t === "json" ? " (JSON)" : ""}</label>
              {f.t === "tone" ? (
                <select className="ad-in" value={draft[f.k]} onChange={(e) => set(f.k, e.target.value)}>
                  <option value="">—</option>
                  {TONE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.t === "select" ? (
                <select className="ad-in" value={draft[f.k]} onChange={(e) => set(f.k, e.target.value)}>
                  <option value="">—</option>
                  {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (f.t === "textarea" || f.t === "json") ? (
                <textarea className="ad-in" value={draft[f.k]} onChange={(e) => set(f.k, e.target.value)} />
              ) : (
                <input className="ad-in" type={f.t === "number" ? "number" : "text"} step="any"
                  value={draft[f.k]} onChange={(e) => set(f.k, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button className="ad-btn primary" onClick={save} disabled={busy}>{busy ? "處理中…" : (row.__new ? "新增" : "儲存")}</button>
        <button className="ad-btn danger" onClick={del} disabled={busy}>{row.__new ? "取消" : "刪除"}</button>
        {msg && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{msg}</span>}
      </div>
    </div>
  );
}

/* ---------- 區塊編輯器 ---------- */
function SectionEditor({ sec }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const { data, error } = await client.from(sec.table).select("*").order("sort", { ascending: true });
    if (error) { setErr("讀取失敗：" + error.message); setRows([]); }
    else setRows(data || []);
  }, [sec.table]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const addRow = () => {
    const blank = { __new: true };
    const maxSort = (rows || []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
    sec.fields.forEach((f) => { blank[f.k] = f.t === "number" ? (f.k === "sort" ? maxSort + 1 : 0) : (f.t === "json" ? "[]" : ""); });
    setRows((r) => [...(r || []), blank]);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>{sec.label}</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{sec.table} · {rows ? rows.length : "…"} 筆</div>
        </div>
        <button className="ad-btn primary" onClick={addRow}>＋ 新增一筆</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {rows == null ? (
        <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--text-3)", padding: 20 }}>尚無資料，點「新增一筆」開始。</div>
      ) : (
        rows.map((r, i) => <RowCard key={r.id || "new-" + i} sec={sec} row={r} onChanged={load} />)
      )}
    </div>
  );
}

/* ---------- 主控台 ---------- */
function Console({ session }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const sec = SECTIONS.find((s) => s.id === active);
  return (
    <div>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--night-850)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", color: "var(--text-on-accent)", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 12 }}>AI³A</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--text-1)", fontSize: 16 }}>後台管理</div>
            <div style={{ color: "var(--text-3)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</div>
          </div>
          <a className="ad-btn ghost" href="/AllenI3Aurora/" target="_blank" rel="noopener">前往網站 ↗</a>
          <button className="ad-btn" onClick={() => client.auth.signOut()}>登出</button>
        </div>
      </header>
      <div style={{ ...wrap, display: "flex", gap: 22, padding: "22px 20px", alignItems: "flex-start" }}>
        <nav style={{ width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 78 }}>
          {SECTIONS.map((s) => {
            const on = s.id === active;
            return (
              <button key={s.id} onClick={() => setActive(s.id)}
                style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 14, fontFamily: "var(--font-display)", fontWeight: 700,
                  border: "1px solid " + (on ? "var(--border-aurora)" : "transparent"), background: on ? "var(--brand-soft)" : "transparent", color: on ? "var(--text-1)" : "var(--text-3)" }}>
                {s.label}
              </button>
            );
          })}
        </nav>
        <main style={{ flex: 1, minWidth: 0 }}>
          <SectionEditor key={sec.id} sec={sec} />
        </main>
      </div>
    </div>
  );
}

/* ---------- 根 ---------- */
function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!configured) { setReady(true); return; }
    client.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) return <Setup />;
  if (!ready) return <Center><div style={{ color: "var(--text-3)" }}>載入中…</div></Center>;
  if (!session) return <Login />;
  return <Console session={session} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
