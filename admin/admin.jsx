/* =====================================================================
   艾倫報報 · 後台管理 — 各區塊資料 CRUD（Firebase / Firestore）
   讀寫走 Firestore；寫入受安全規則保護，僅指定 email 登入後可異動。
   ===================================================================== */
const { useState, useEffect, useCallback } = React;

const FB = window.FIREBASE_CONFIG || {};
const configured = !!(FB.apiKey && FB.projectId && window.firebase && window.firebase.firestore);
if (configured && !window.firebase.apps.length) window.firebase.initializeApp(FB);
const auth = configured ? window.firebase.auth() : null;
const db = configured ? window.firebase.firestore() : null;

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

/* 預設種子資料（供空 collection 一鍵初始化） */
const SEED = {
  stats: [
    { sort: 1, label: "加權指數 TAIEX", value: "23,588", unit: "pt", delta: "+0.75%", tone: "insight", mode: "finance", data: [6.2, 6.6, 6.3, 7, 6.8, 7.2, 7.1, 7.5, 7.8], link: "https://tw.stock.yahoo.com/quote/%5ETWII" },
    { sort: 2, label: "本月結餘", value: "42,180", unit: "TWD", delta: "+8.0%", tone: "intelligence", mode: "semantic", data: [4, 4.2, 4.1, 4.5, 4.4, 4.8, 5, 5.2], link: "" },
    { sort: 3, label: "深度工作", value: "26.5", unit: "hr", delta: "+12%", tone: "illumination", mode: "semantic", data: [3, 3.5, 3.2, 4, 3.8, 4.4, 4.6, 5], link: "" },
    { sort: 4, label: "待讀清單", value: "12", unit: "篇", delta: "-3", tone: "insight", mode: "semantic", data: [8, 7, 9, 6, 5, 6, 5, 4], link: "" },
  ],
  focus: [
    { sort: 1, tag: "理財", tone: "insight", title: "外資投信「雙連買」新增 3 檔", meta: "半導體 · 航運 · 今日 09:41", icon: "chart" },
    { sort: 2, tag: "工作", tone: "intelligence", title: "Q3 產品藍圖評審會議前置準備", meta: "明日 14:00 · 附 3 份文件", icon: "briefcase" },
    { sort: 3, tag: "研究", tone: "illumination", title: "LLM Agent 記憶架構 — 讀書筆記整理", meta: "進度 60% · 待續 2 節", icon: "compass" },
    { sort: 4, tag: "興趣", tone: "insight", title: "薩克斯風 · 週末錄音清單", meta: "3 首待練 · 上次 06/28", icon: "sparkle" },
  ],
  reading: [
    { sort: 1, title: "原子習慣：微小改變的複利效應", src: "重讀筆記", pct: 82 },
    { sort: 2, title: "The Almanack of Naval Ravikant", src: "Kindle", pct: 45 },
    { sort: 3, title: "台股籌碼面實戰：三大法人解讀", src: "PDF", pct: 12 },
  ],
  podcasts: [
    { sort: 1, title: "股癌 Gooaye — EP.整理盤心法", meta: "1h 12m · 昨天", tone: "insight" },
    { sort: 2, title: "曼報 Manny's Newsletter Radio", meta: "38m · 2 天前", tone: "intelligence" },
    { sort: 3, title: "Lex Fridman — Memory & Agents", meta: "2h 04m · 本週", tone: "illumination" },
  ],
  links: [
    { sort: 1, label: "Showmethemoney 看盤", icon: "chart" },
    { sort: 2, label: "TradingView", icon: "chart" },
    { sort: 3, label: "Notion 研究庫", icon: "book" },
    { sort: 4, label: "GitHub", icon: "link" },
    { sort: 5, label: "Medium 草稿", icon: "paper" },
    { sort: 6, label: "Google Scholar", icon: "compass" },
  ],
  issues: [
    { sort: 1, no: "26", kind: "週報", date: "2026.06.29", tone: "insight", title: "AI 代理的記憶戰爭，與台股的靜默輪動", items: 8, cover: "../../assets/rabbit-reading.jpeg" },
    { sort: 2, no: "25", kind: "週報", date: "2026.06.22", tone: "insight", title: "當利率轉彎，現金流的重新定價", items: 7, cover: "../../assets/rabbit-proposal.jpeg" },
    { sort: 3, no: "06", kind: "月報", date: "2026.06.01", tone: "intelligence", title: "六月總結：三個決定，一次轉身", items: 14, cover: "../../assets/rabbit-mountain.jpeg" },
    { sort: 4, no: "24", kind: "週報", date: "2026.06.15", tone: "insight", title: "被高估的專注，與被低估的休息", items: 6, cover: "../../assets/rabbit-bike.jpeg" },
    { sort: 5, no: "23", kind: "週報", date: "2026.06.08", tone: "insight", title: "把研究做成產品：從筆記到電子報", items: 9, cover: "../../assets/rabbit-forest.jpeg" },
    { sort: 6, no: "183", kind: "日報", date: "2026.06.30", tone: "illumination", title: "週一速報：新的一週，三個先看的訊號", items: 3, cover: "../../assets/rabbit-golden.jpeg" },
  ],
  annuli: [
    { sort: 1, year: "1975", tone: "insight", title: "序章 · 出生", body: "一切的起點。" },
    { sort: 2, year: "1998", tone: "intelligence", title: "投入資訊科技", body: "以 ITS 專業踏入職場，開始累積系統思維。" },
    { sort: 3, year: "2011", tone: "illumination", title: "拿起薩克斯風", body: "音樂成為生活的另一種語言與節奏。" },
    { sort: 4, year: "2020", tone: "insight", title: "開始寫作與研究", body: "把每天的觀察，變成可累積的筆記與洞察。" },
    { sort: 5, year: "2024", tone: "intelligence", title: "Showmethemoney 上線", body: "開源台股看盤儀表板，工具服務更多人。" },
    { sort: 6, year: "2026", tone: "illumination", title: "艾倫報報 創刊", body: "洞察世界．累積智慧．點亮未來 — 個人品牌成形。" },
  ],
};

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
        <p style={{ lineHeight: 1.7, fontSize: 14 }}>請先在 <code>firebase-config.js</code> 填入 Firebase 專案設定
          （apiKey / projectId 等），並於 Firestore 部署 <code>firebase/firestore.rules</code> 安全規則。</p>
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
    try { await auth.signInWithEmailAndPassword(email, pw); }
    catch (ex) { setErr(ex && ex.message ? ex.message : "登入失敗"); }
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
        <p style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 16, lineHeight: 1.6 }}>帳號請於 Firebase → Authentication 建立（Email/密碼），email 需與安全規則中的管理者 email 一致。</p>
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
    try {
      if (row.__new) await db.collection(sec.table).add(payload);
      else await db.collection(sec.table).doc(row.id).update(payload);
      onChanged();
    } catch (ex) { setMsg("儲存失敗：" + (ex && ex.message ? ex.message : ex)); setBusy(false); }
  };

  const del = async () => {
    if (row.__new) { onChanged(); return; }
    if (!window.confirm("確定刪除這一筆？")) return;
    setBusy(true);
    try { await db.collection(sec.table).doc(row.id).delete(); onChanged(); }
    catch (ex) { setMsg("刪除失敗：" + (ex && ex.message ? ex.message : ex)); setBusy(false); }
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
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const snap = await db.collection(sec.table).orderBy("sort").get();
      setRows(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    } catch (ex) { setErr("讀取失敗：" + (ex && ex.message ? ex.message : ex)); setRows([]); }
  }, [sec.table]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const addRow = () => {
    const blank = { __new: true };
    const maxSort = (rows || []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
    sec.fields.forEach((f) => { blank[f.k] = f.t === "number" ? (f.k === "sort" ? maxSort + 1 : 0) : (f.t === "json" ? "[]" : ""); });
    setRows((r) => [...(r || []), blank]);
  };

  const seed = async () => {
    if (!window.confirm("寫入這個區塊的預設種子資料？")) return;
    setSeeding(true);
    try { await Promise.all((SEED[sec.id] || []).map((r) => db.collection(sec.table).add(r))); await load(); }
    catch (ex) { setErr("種子寫入失敗：" + (ex && ex.message ? ex.message : ex)); }
    setSeeding(false);
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
        <div style={{ color: "var(--text-3)", padding: 20 }}>
          尚無資料，點「新增一筆」開始，或
          <button className="ad-btn ghost" onClick={seed} disabled={seeding} style={{ marginLeft: 8 }}>{seeding ? "寫入中…" : "載入預設種子資料"}</button>
        </div>
      ) : (
        rows.map((r, i) => <RowCard key={r.id || "new-" + i} sec={sec} row={r} onChanged={load} />)
      )}
    </div>
  );
}

/* ---------- 主控台 ---------- */
function Console({ user }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  const sec = SECTIONS.find((s) => s.id === active);
  return (
    <div>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--night-850)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
          <span style={{ display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", color: "var(--text-on-accent)", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 12 }}>AI³A</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--text-1)", fontSize: 16 }}>後台管理</div>
            <div style={{ color: "var(--text-3)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
          </div>
          <a className="ad-btn ghost" href="/AllenI3Aurora/" target="_blank" rel="noopener">前往網站 ↗</a>
          <button className="ad-btn" onClick={() => auth.signOut()}>登出</button>
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
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!configured) { setReady(true); return; }
    const unsub = auth.onAuthStateChanged((u) => { setUser(u); setReady(true); });
    return () => unsub();
  }, []);

  if (!configured) return <Setup />;
  if (!ready) return <Center><div style={{ color: "var(--text-3)" }}>載入中…</div></Center>;
  if (!user) return <Login />;
  return <Console user={user} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
