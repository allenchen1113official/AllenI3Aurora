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

const OWNER_EMAIL = "allenchen1113.official@gmail.com"; // 需與 firebase/firestore.rules 一致

/* 將 Firestore 錯誤轉為可操作訊息；permission-denied 給出明確排查方向 */
function errText(ex) {
  const code = ex && ex.code ? ex.code : "";
  const raw = ex && ex.message ? ex.message : String(ex);
  if (code === "permission-denied" || /insufficient permissions/i.test(raw)) {
    const who = (auth && auth.currentUser && auth.currentUser.email) || "（未登入）";
    if (who !== OWNER_EMAIL) {
      return `權限不足：目前登入為「${who}」，但安全規則僅允許「${OWNER_EMAIL}」寫入。請改用管理者帳號登入，或同步更新 firestore.rules 的 OWNER_EMAIL。`;
    }
    return `權限不足：登入身分正確（${who}），但 Firestore 尚未套用本專案的安全規則。請至 Firebase Console → Firestore Database → 規則，貼上 firebase/firestore.rules 全文並「發布」（或執行 firebase deploy --only firestore:rules）。`;
  }
  return raw;
}

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

/* 財富自由指數：後台計算與更新設定 */
const WEALTH_LABEL = "財富自由指數";
const WEALTH_NAV = "__wealth";
// 於 aurora_stats 中辨識財富自由指數文件（同時相容舊字樣，供首次更新沿用同一筆）。
const isWealthDoc = (r) => /財富自由|本月結餘|每月結餘/.test((r && r.label) || "");

/* 預設種子資料（供空 collection 一鍵初始化） */
const SEED = {
  stats: [
    { sort: 1, label: "加權指數 TAIEX", value: "43,119.75", unit: "pt", delta: "+7.98% · +3,186.45", tone: "insight", mode: "finance", data: [44232.87, 44825.78, 44850.81, 43654.84, 43634.19, 41603.36, 40039.18, 39933.3, 43119.75], link: "https://tw.stock.yahoo.com/quote/%5ETWII" },
    { sort: 2, label: "財富自由指數", value: "68", unit: "%", delta: "+8.0%", tone: "intelligence", mode: "semantic", data: [4, 4.2, 4.1, 4.5, 4.4, 4.8, 5, 5.2], link: "" },
    { sort: 3, label: "運動", value: "26.5", unit: "hr", delta: "+12%", tone: "illumination", mode: "semantic", data: [3, 3.5, 3.2, 4, 3.8, 4.4, 4.6, 5], link: "https://connect.garmin.com/app/profile/50e697d9-3333-4ec3-a1e1-eebf531414c3" },
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
    } catch (ex) { setMsg("儲存失敗：" + errText(ex)); setBusy(false); }
  };

  const del = async () => {
    if (row.__new) { onChanged(); return; }
    if (!window.confirm("確定刪除這一筆？")) return;
    setBusy(true);
    try { await db.collection(sec.table).doc(row.id).delete(); onChanged(); }
    catch (ex) { setMsg("刪除失敗：" + errText(ex)); setBusy(false); }
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
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setErr(""); setNote("");
    try {
      const snap = await db.collection(sec.table).orderBy("sort").get();
      setRows(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setRows([]); }
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
    catch (ex) { setErr("種子寫入失敗：" + errText(ex)); }
    setSeeding(false);
  };

  /* 從前台同源的 data/taiex.json（GitHub Actions 定時更新）將 TAIEX 即時值
     同步寫入 aurora_stats，讓後台資料與首頁一致。找不到 TAIEX 列則新增一筆。 */
  const syncTaiex = async () => {
    setSyncing(true); setErr(""); setNote("");
    try {
      const res = await fetch("/AllenI3Aurora/data/taiex.json", { cache: "no-store" });
      if (!res.ok) throw new Error("讀取 data/taiex.json 失敗（HTTP " + res.status + "）");
      const j = await res.json();
      if (!j || j.value == null) throw new Error("data/taiex.json 內容無效");
      const patch = { value: String(j.value), delta: String(j.delta || ""), data: Array.isArray(j.data) ? j.data : [] };
      const target = (rows || []).find((r) => !r.__new && (/TAIEX/i.test(r.label || "") || /TWII/i.test(r.link || "")));
      if (target) {
        await db.collection(sec.table).doc(target.id).update(patch);
      } else {
        const maxSort = (rows || []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
        await db.collection(sec.table).add({ sort: maxSort + 1, label: "加權指數 TAIEX", unit: "pt", tone: "insight", mode: "finance", link: "https://tw.stock.yahoo.com/quote/%5ETWII", ...patch });
      }
      await load();
      setNote(`已同步 TAIEX：${patch.value}（${patch.delta}${j.asOf ? "，" + j.asOf : ""}）`);
    } catch (ex) { setErr("TAIEX 同步失敗：" + errText(ex)); }
    setSyncing(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>{sec.label}</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{sec.table} · {rows ? rows.length : "…"} 筆</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sec.id === "stats" && (
            <button className="ad-btn ghost" onClick={syncTaiex} disabled={syncing} title="從證交所即時資料（data/taiex.json）同步加權指數到後台">
              {syncing ? "同步中…" : "↻ 同步 TAIEX 即時值"}
            </button>
          )}
          <button className="ad-btn primary" onClick={addRow}>＋ 新增一筆</button>
        </div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {note && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{note}</div>}
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

/* ---------- 財富自由指數：計算與更新 ----------
   公式：財富自由指數 = 每月被動收入 ÷ 每月總支出 × 100%（≥100% 即達財富自由）。
   計算結果寫入 aurora_stats 中的財富自由指數文件（value/unit/delta/走勢），
   並保存原始輸入（passiveIncome / expense）以便下次沿用。首頁即讀此值顯示。 */
function WealthPanel() {
  const [loading, setLoading] = useState(true);
  const [docRow, setDocRow] = useState(null);
  const [passive, setPassive] = useState("");
  const [expense, setExpense] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(""); setMsg("");
    try {
      const snap = await db.collection("aurora_stats").get();
      const docs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      const row = docs.find(isWealthDoc) || null;
      setDocRow(row);
      if (row) {
        if (row.passiveIncome != null) setPassive(String(row.passiveIncome));
        if (row.expense != null) setExpense(String(row.expense));
      }
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const p = Number(passive), e = Number(expense);
  const valid = passive !== "" && expense !== "" && isFinite(p) && isFinite(e) && p >= 0 && e > 0;
  const index = valid ? Math.round((p / e) * 100) : null;
  const free = index != null && index >= 100;

  const save = async () => {
    if (!valid) { setMsg("請輸入有效的每月被動收入，以及大於 0 的每月支出。"); return; }
    setBusy(true); setMsg(""); setErr("");
    try {
      const prevData = Array.isArray(docRow && docRow.data)
        ? docRow.data.filter((n) => isFinite(Number(n))).map(Number) : [];
      const alreadyWealth = /財富自由/.test((docRow && docRow.label) || "");
      const prevIndex = alreadyWealth && isFinite(Number(docRow.value))
        ? Number(docRow.value)
        : (prevData.length ? prevData[prevData.length - 1] : null);
      const data = [...prevData, index].slice(-8);
      let delta = "";
      if (prevIndex != null && isFinite(prevIndex)) {
        const d = index - prevIndex;
        delta = (d >= 0 ? "+" : "-") + Math.abs(d).toFixed(1) + "%"; // 較上次的百分點變化
      }
      const payload = {
        label: WEALTH_LABEL, value: String(index), unit: "%", delta,
        tone: "intelligence", mode: "semantic", data,
        passiveIncome: p, expense: e, updatedAt: new Date().toISOString(),
      };
      if (docRow && docRow.id) {
        await db.collection("aurora_stats").doc(docRow.id).update(payload);
      } else {
        const snap = await db.collection("aurora_stats").get();
        const maxSort = snap.docs.reduce((m, d) => Math.max(m, Number((d.data() || {}).sort) || 0), 0);
        await db.collection("aurora_stats").add(Object.assign({ sort: maxSort + 1, link: "" }, payload));
      }
      setMsg("已更新！前往網站重新整理即可看到最新財富自由指數。");
      await load();
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); }
    setBusy(false);
  };

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 18, marginBottom: 14 };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>財富自由指數</h2>
        <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>aurora_stats · 計算並更新首頁指數卡</div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
      ) : (
        <>
          <div style={box}>
            <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
              公式：<b style={{ color: "var(--text-1)" }}>財富自由指數 = 每月被動收入 ÷ 每月總支出 × 100%</b>。
              當被動收入足以覆蓋支出（指數 ≥ 100%）即達成財富自由。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <div>
                <label className="ad-lbl">每月被動收入（TWD）</label>
                <input className="ad-in" type="number" step="any" min="0" inputMode="decimal"
                  value={passive} onChange={(ev) => setPassive(ev.target.value)} placeholder="例如 34000" />
              </div>
              <div>
                <label className="ad-lbl">每月總支出（TWD）</label>
                <input className="ad-in" type="number" step="any" min="0" inputMode="decimal"
                  value={expense} onChange={(ev) => setExpense(ev.target.value)} placeholder="例如 50000" />
              </div>
            </div>
          </div>

          <div style={{ ...box, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-3)", fontSize: 13 }}>計算結果</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 40, lineHeight: 1,
              color: free ? "var(--illumination)" : "var(--intelligence)" }}>
              {index == null ? "—" : index}<span style={{ fontSize: 18, marginLeft: 2 }}>%</span>
            </span>
            {index != null && (
              <span style={{ color: free ? "var(--illumination)" : "var(--text-3)", fontSize: 13 }}>
                {free ? "已達財富自由 🎉" : `距財富自由還差 ${100 - index} 個百分點`}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="ad-btn primary" onClick={save} disabled={busy || !valid}>{busy ? "更新中…" : "計算並更新首頁"}</button>
            <button className="ad-btn ghost" onClick={load} disabled={busy}>重新載入</button>
            {msg && <span style={{ color: "var(--illumination)", fontSize: 12.5 }}>{msg}</span>}
          </div>

          <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 16, lineHeight: 1.7 }}>
            目前首頁值：{docRow ? `${docRow.label ?? WEALTH_LABEL} · ${docRow.value ?? "—"}${docRow.unit || ""}` : "尚未建立（將於首次更新時建立）"}。
            每次更新會把新指數加入走勢，並依上次值計算漲跌。
          </div>
        </>
      )}
    </div>
  );
}

/* =====================================================================
   電子報編輯器 — 立即編修內文 / Facebook・Instagram 貼文，檢視成果並一鍵分享
   讀寫同一個 aurora_issues collection，欄位向下相容（歷期報報仍可用）。
   內文以結構化 blocks 儲存，前台 NewsletterIssue.jsx 會據此渲染。
   ===================================================================== */
const NL_NAV = "__newsletter";
const NL_KINDS = ["日報", "週報", "月報", "特刊"];

/* 各內文區塊型別與可編欄位（與前台 Block 對應） */
const NL_BLOCKS = {
  rule:    { label: "分隔線／小標", fields: [{ k: "label", t: "text", ph: "例：INSIGHT · 洞察" }] },
  h2:      { label: "段落標題", fields: [{ k: "text", t: "text", ph: "例：一、記憶，是代理的護城河" }] },
  lead:    { label: "內文段落", fields: [{ k: "text", t: "area", ph: "一段內文…" }] },
  callout: { label: "重點框 Callout", fields: [{ k: "tone", t: "tone" }, { k: "title", t: "text", ph: "例：本週智慧 Intelligence" }, { k: "text", t: "area", ph: "重點一句話…" }] },
  quote:   { label: "引言 Quote", fields: [{ k: "text", t: "area", ph: "「一句想被記住的話。」" }] },
  note:    { label: "小字附註", fields: [{ k: "text", t: "area", ph: "※ 免責聲明或資料來源…" }] },
  table:   { label: "行情小表格", fields: [{ k: "head", t: "text", ph: "標的,收盤,漲跌" }, { k: "rows", t: "json", ph: '[["台積電 2330","1,085","+2.4%",true]]' }, { k: "note", t: "text", ph: "※ 台股慣例 紅漲綠跌…" }] },
};

/* 前台公開網址（分享用）；admin 在 /AllenI3Aurora/admin/ 下，origin 相同 */
function nlIssueUrl(issue) {
  return location.origin + "/AllenI3Aurora/?issue=" + encodeURIComponent(issue && issue.no != null ? issue.no : "");
}
async function nlCopy(text, okLabel, setToast) {
  try { await navigator.clipboard.writeText(text); setToast((okLabel || "已複製") + " ✓"); }
  catch (e) { window.prompt("手動複製：", text); }
  setTimeout(() => setToast(""), 2200);
}
function nlFacebookText(issue) {
  const s = issue.social || {};
  return [s.facebook || issue.title || "", nlIssueUrl(issue), s.hashtags || ""].filter(Boolean).join("\n\n");
}
function nlInstagramText(issue) {
  const s = issue.social || {};
  return [s.instagram || issue.title || "", s.hashtags || ""].filter(Boolean).join("\n\n");
}
async function nlShare(issue, setToast) {
  const url = nlIssueUrl(issue);
  const payload = { title: "艾倫報報 · " + (issue.title || ""), text: (issue.social && issue.social.facebook) || issue.subtitle || issue.title || "", url };
  if (navigator.share) {
    try { await navigator.share(payload); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  nlCopy(url, "已複製分享連結", setToast);
}

/* ---------- 內文區塊編輯（單塊） ---------- */
function BlockRow({ block, idx, total, onChange, onMove, onDel }) {
  const def = NL_BLOCKS[block.t] || NL_BLOCKS.lead;
  const set = (k, v) => onChange({ ...block, [k]: v });
  return (
    <div style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select className="ad-in" style={{ width: "auto", flex: "0 0 auto", padding: "6px 10px" }} value={block.t}
          onChange={(e) => onChange({ t: e.target.value })}>
          {Object.keys(NL_BLOCKS).map((k) => <option key={k} value={k}>{NL_BLOCKS[k].label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="ad-btn ghost" style={{ padding: "5px 9px" }} disabled={idx === 0} onClick={() => onMove(idx, -1)} title="上移">↑</button>
        <button className="ad-btn ghost" style={{ padding: "5px 9px" }} disabled={idx === total - 1} onClick={() => onMove(idx, 1)} title="下移">↓</button>
        <button className="ad-btn danger" style={{ padding: "5px 9px" }} onClick={() => onDel(idx)} title="刪除">✕</button>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {def.fields.map((f) => {
          const val = block[f.k];
          const strVal = f.t === "json" ? (typeof val === "string" ? val : JSON.stringify(val || [])) : (val == null ? "" : val);
          if (f.t === "tone") {
            return (
              <div key={f.k}>
                <label className="ad-lbl">{f.k}</label>
                <select className="ad-in" value={strVal} onChange={(e) => set(f.k, e.target.value)}>
                  <option value="">—</option>
                  {TONE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            );
          }
          if (f.t === "area" || f.t === "json") {
            return (
              <div key={f.k}>
                <label className="ad-lbl">{f.k}{f.t === "json" ? " (JSON)" : ""}</label>
                <textarea className="ad-in" placeholder={f.ph || ""} value={strVal}
                  onChange={(e) => set(f.k, f.t === "json" ? tryJson(e.target.value) : e.target.value)} />
              </div>
            );
          }
          return (
            <div key={f.k}>
              <label className="ad-lbl">{f.k}</label>
              <input className="ad-in" placeholder={f.ph || ""} value={strVal} onChange={(e) => set(f.k, e.target.value)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* table.rows 允許使用者暫時輸入非法 JSON（保留原字串直到合法） */
function tryJson(s) { try { return JSON.parse(s); } catch { return s; } }
function normHead(h) {
  if (Array.isArray(h)) return h;
  return String(h || "").split(",").map((x) => x.trim()).filter(Boolean);
}

/* ---------- 檢視成果（前台版型的忠實預覽） ---------- */
function NLPreview({ issue }) {
  const noText = issue.no != null && issue.no !== "" ? ("第 " + issue.no + " 期") : "";
  const badge = (txt, solid) => (
    <span style={{ padding: "4px 10px", borderRadius: "var(--radius-pill)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font-display)",
      background: solid ? "var(--insight)" : "var(--night-700)", color: solid ? "var(--text-on-accent)" : "var(--text-2)", border: "1px solid var(--border)" }}>{txt}</span>
  );
  const toneColor = { insight: "var(--insight)", intelligence: "var(--intelligence)", illumination: "var(--illumination)", neutral: "var(--text-3)" };
  const renderBlock = (b, i) => {
    if (!b || !b.t) return null;
    if (b.t === "rule") return <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, margin: "28px 0 20px", color: "var(--text-3)", fontSize: 12, letterSpacing: ".12em", fontWeight: 700 }}><span style={{ flex: 1, height: 1, background: "var(--border)" }} />{b.label || ""}<span style={{ flex: 1, height: 1, background: "var(--border)" }} /></div>;
    if (b.t === "h2") return <h2 key={i} style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, color: "var(--text-1)", margin: "0 0 14px" }}>{b.text}</h2>;
    if (b.t === "lead") return <p key={i} style={{ color: "var(--text-2)", fontSize: 16, lineHeight: 1.72, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>{b.text}</p>;
    if (b.t === "callout") return (
      <div key={i} style={{ borderRadius: "var(--radius-lg)", padding: 16, margin: "0 0 16px", background: "var(--night-800)", borderLeft: "3px solid " + (toneColor[b.tone] || toneColor.intelligence), border: "1px solid var(--border)" }}>
        {b.title ? <div style={{ fontWeight: 800, color: "var(--text-1)", marginBottom: 6, fontFamily: "var(--font-display)" }}>{b.title}</div> : null}
        <div style={{ color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{b.text}</div>
      </div>
    );
    if (b.t === "quote") return <blockquote key={i} style={{ margin: "24px 0", padding: "4px 0 4px 22px", borderLeft: "3px solid var(--illumination)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, lineHeight: 1.45, color: "var(--text-1)", whiteSpace: "pre-wrap" }}>{b.text}</blockquote>;
    if (b.t === "note") return <div key={i} style={{ fontSize: 12.5, color: "var(--text-4)", marginBottom: 24, whiteSpace: "pre-wrap" }}>{b.text}</div>;
    if (b.t === "table") {
      const head = normHead(b.head); const rows = Array.isArray(b.rows) ? b.rows : [];
      return (
        <div key={i} style={{ margin: "16px 0 24px" }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "12px 18px", background: "var(--night-850)", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-3)", fontWeight: 700 }}>
              <span>{head[0] || "標的"}</span><span style={{ textAlign: "right" }}>{head[1] || "收盤"}</span><span style={{ textAlign: "right" }}>{head[2] || "漲跌"}</span>
            </div>
            {rows.map((r, j) => (
              <div key={j} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "14px 18px", borderBottom: j < rows.length - 1 ? "1px solid var(--border-subtle)" : "none", alignItems: "center" }}>
                <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{r[0]}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r[1]}</span>
                <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: r[3] ? "var(--finance-up)" : "var(--finance-down)" }}>{r[2]}</span>
              </div>
            ))}
          </div>
          {b.note ? <div style={{ fontSize: 12.5, color: "var(--text-4)", marginTop: 10 }}>{b.note}</div> : null}
        </div>
      );
    }
    return null;
  };
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {issue.kind ? badge(issue.kind, true) : null}
          {noText ? badge(noText) : null}
          {issue.date ? badge(issue.date) : null}
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 32, lineHeight: 1.12, color: "var(--text-1)", margin: 0 }}>{issue.title || "（尚未輸入標題）"}</h1>
        <div style={{ marginTop: 14, color: "var(--text-3)", fontSize: 13 }}>{issue.author || "Allen Chen 主編"}{issue.readMinutes ? " · 閱讀約 " + issue.readMinutes + " 分鐘" : ""}</div>
      </div>
      {issue.cover ? (
        <div style={{ borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--border)", marginBottom: 20, position: "relative" }}>
          <img src={issue.cover} alt="cover" style={{ width: "100%", height: 260, objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
        </div>
      ) : null}
      {issue.subtitle ? <p style={{ color: "var(--text-3)", fontSize: 18, lineHeight: 1.6, margin: "0 0 24px" }}>{issue.subtitle}</p> : null}
      {(issue.blocks || []).map(renderBlock)}
    </div>
  );
}

/* ---------- 電子報主面板 ---------- */
function blankIssue(maxSort) {
  return { __new: true, sort: (maxSort || 0) + 1, no: "", kind: "週報", date: "", tone: "insight",
    title: "", subtitle: "", cover: "", coverCaption: "", author: "Allen Chen 主編", readMinutes: "", items: 0,
    blocks: [], social: { facebook: "", instagram: "", hashtags: "" } };
}
function NewsletterPanel() {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);       // 目前編輯的 draft
  const [tab, setTab] = useState("content");   // content | social | preview
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const snap = await db.collection("aurora_issues").orderBy("sort").get();
      setList(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setList([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const maxSort = (list || []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);

  const openIssue = (r) => {
    setSel({
      id: r.id, sort: r.sort ?? 0, no: r.no ?? "", kind: r.kind || "週報", tone: r.tone || "insight",
      date: r.date || "", title: r.title || "", subtitle: r.subtitle || "", cover: r.cover || "",
      coverCaption: r.coverCaption || "", author: r.author || "Allen Chen 主編",
      readMinutes: r.readMinutes ?? "", items: r.items ?? 0,
      blocks: Array.isArray(r.blocks) ? JSON.parse(JSON.stringify(r.blocks)) : [],
      social: { facebook: (r.social && r.social.facebook) || "", instagram: (r.social && r.social.instagram) || "", hashtags: (r.social && r.social.hashtags) || "" },
    });
    setTab("content");
  };
  const newIssue = () => { setSel(blankIssue(maxSort)); setTab("content"); };
  const setF = (k, v) => setSel((s) => ({ ...s, [k]: v }));
  const setSocial = (k, v) => setSel((s) => ({ ...s, social: { ...s.social, [k]: v } }));

  const addBlock = () => setSel((s) => ({ ...s, blocks: [...(s.blocks || []), { t: "lead", text: "" }] }));
  const changeBlock = (i, nb) => setSel((s) => { const b = [...s.blocks]; b[i] = nb; return { ...s, blocks: b }; });
  const moveBlock = (i, d) => setSel((s) => { const b = [...s.blocks]; const j = i + d; if (j < 0 || j >= b.length) return s; const t = b[i]; b[i] = b[j]; b[j] = t; return { ...s, blocks: b }; });
  const delBlock = (i) => setSel((s) => ({ ...s, blocks: s.blocks.filter((_, x) => x !== i) }));

  const save = async () => {
    if (!sel) return;
    setBusy(true); setErr("");
    // table.rows 若仍是字串（未成合法 JSON）則擋下
    for (const b of sel.blocks || []) {
      if (b.t === "table" && b.rows != null && !Array.isArray(b.rows)) {
        setErr("有一個「行情小表格」的 rows 不是合法 JSON，請修正後再儲存。"); setBusy(false); setTab("content"); return;
      }
    }
    const payload = {
      sort: Number(sel.sort) || 0, no: sel.no, kind: sel.kind, tone: sel.tone, date: sel.date,
      title: sel.title, subtitle: sel.subtitle, cover: sel.cover, coverCaption: sel.coverCaption,
      author: sel.author, readMinutes: sel.readMinutes === "" ? null : Number(sel.readMinutes),
      items: Number(sel.items) || 0,
      blocks: (sel.blocks || []).map((b) => b.t === "table" ? { ...b, head: normHead(b.head) } : b),
      social: { facebook: sel.social.facebook || "", instagram: sel.social.instagram || "", hashtags: sel.social.hashtags || "" },
      updatedAt: new Date().toISOString(),
    };
    try {
      if (sel.__new) { const ref = await db.collection("aurora_issues").add(payload); setSel((s) => ({ ...s, __new: false, id: ref.id })); }
      else await db.collection("aurora_issues").doc(sel.id).update(payload);
      await load();
      setToast("已儲存 ✓ 前台重新整理即可看到最新內容"); setTimeout(() => setToast(""), 3000);
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); }
    setBusy(false);
  };
  const removeIssue = async () => {
    if (!sel || sel.__new) { setSel(null); return; }
    if (!window.confirm("確定刪除整期電子報「" + (sel.title || sel.no) + "」？")) return;
    setBusy(true);
    try { await db.collection("aurora_issues").doc(sel.id).delete(); setSel(null); await load(); }
    catch (ex) { setErr("刪除失敗：" + errText(ex)); }
    setBusy(false);
  };

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
  const tabBtn = (id, label) => (
    <button className={"ad-btn" + (tab === id ? " primary" : " ghost")} onClick={() => setTab(id)} style={{ padding: "8px 14px" }}>{label}</button>
  );

  /* --- 列表視圖（未選任何一期） --- */
  if (!sel) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>電子報</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>aurora_issues · {list ? list.length : "…"} 期 · 立即編修內文與社群貼文</div>
          </div>
          <button className="ad-btn primary" onClick={newIssue}>＋ 新增一期電子報</button>
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {list == null ? <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
          : list.length === 0 ? <div style={{ color: "var(--text-3)", padding: 20 }}>尚無電子報，點右上角「新增一期電子報」開始。</div>
          : (
            <div style={{ display: "grid", gap: 10 }}>
              {list.map((r) => (
                <button key={r.id} onClick={() => openIssue(r)} style={{ textAlign: "left", cursor: "pointer", background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: "var(--night-700)", color: "var(--text-2)" }}>{r.kind || "—"}</span>
                    <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>第 {r.no ?? "—"} 期 · {r.date || "—"}</span>
                    {Array.isArray(r.blocks) && r.blocks.length ? <span style={{ color: "var(--success)", fontSize: 11.5 }}>● 已編內文（{r.blocks.length} 塊）</span> : <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>○ 尚未編內文</span>}
                    {r.social && (r.social.facebook || r.social.instagram) ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ 已備社群貼文</span> : null}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 16 }}>{r.title || "（未命名）"}</div>
                </button>
              ))}
            </div>
          )}
      </div>
    );
  }

  /* --- 編輯視圖 --- */
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="ad-btn ghost" onClick={() => setSel(null)}>← 返回列表</button>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: 0 }}>{sel.__new ? "新增電子報" : "編輯電子報"}</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{sel.kind} · 第 {sel.no || "—"} 期</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ad-btn primary" onClick={save} disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
          <button className="ad-btn danger" onClick={removeIssue} disabled={busy}>{sel.__new ? "取消" : "刪除整期"}</button>
        </div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("content", "內文編輯")}
        {tabBtn("social", "Facebook / IG 貼文")}
        {tabBtn("preview", "檢視成果 · 分享")}
      </div>

      {tab === "content" && (
        <div>
          <div style={box}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">期別 kind</label>
                <select className="ad-in" value={sel.kind} onChange={(e) => setF("kind", e.target.value)}>{NL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label className="ad-lbl">期號 no</label><input className="ad-in" value={sel.no} onChange={(e) => setF("no", e.target.value)} placeholder="27" /></div>
              <div><label className="ad-lbl">日期 date</label><input className="ad-in" value={sel.date} onChange={(e) => setF("date", e.target.value)} placeholder="2026.07.06" /></div>
              <div><label className="ad-lbl">色調 tone</label>
                <select className="ad-in" value={sel.tone} onChange={(e) => setF("tone", e.target.value)}>{TONE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label className="ad-lbl">排序 sort</label><input className="ad-in" type="number" value={sel.sort} onChange={(e) => setF("sort", e.target.value)} /></div>
              <div><label className="ad-lbl">閱讀分鐘 readMinutes</label><input className="ad-in" type="number" value={sel.readMinutes} onChange={(e) => setF("readMinutes", e.target.value)} placeholder="6" /></div>
              <div><label className="ad-lbl">彙整則數 items</label><input className="ad-in" type="number" value={sel.items} onChange={(e) => setF("items", e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 12 }}><label className="ad-lbl">標題 title</label><input className="ad-in" value={sel.title} onChange={(e) => setF("title", e.target.value)} placeholder="本期主標題" /></div>
            <div style={{ marginTop: 12 }}><label className="ad-lbl">前言 subtitle（封面下方導言）</label><textarea className="ad-in" value={sel.subtitle} onChange={(e) => setF("subtitle", e.target.value)} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
              <div><label className="ad-lbl">封面圖 cover（URL 或 ../../assets/…）</label><input className="ad-in" value={sel.cover} onChange={(e) => setF("cover", e.target.value)} placeholder="../../assets/rabbit-reading.jpeg" /></div>
              <div><label className="ad-lbl">封面說明 coverCaption</label><input className="ad-in" value={sel.coverCaption} onChange={(e) => setF("coverCaption", e.target.value)} /></div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 10px" }}>
            <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)" }}>內文區塊（{(sel.blocks || []).length}）</div>
            <button className="ad-btn primary" onClick={addBlock} style={{ padding: "7px 12px" }}>＋ 新增區塊</button>
          </div>
          {(sel.blocks || []).length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "14px 16px", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)" }}>還沒有內文。點「新增區塊」加入小標、段落、重點框、引言或行情表格。</div>
          ) : (sel.blocks.map((b, i) => (
            <BlockRow key={i} block={b} idx={i} total={sel.blocks.length} onChange={(nb) => changeBlock(i, nb)} onMove={moveBlock} onDel={delBlock} />
          )))}
        </div>
      )}

      {tab === "social" && (
        <div>
          <div style={box}>
            <label className="ad-lbl">Facebook 貼文內文</label>
            <textarea className="ad-in" style={{ minHeight: 150 }} value={sel.social.facebook} onChange={(e) => setSocial("facebook", e.target.value)} placeholder="貼在 Facebook 的完整貼文文字…" />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="ad-btn ghost" onClick={() => nlCopy(nlFacebookText(sel), "已複製 FB 貼文", setToast)}>複製 FB 貼文（含連結與標籤）</button>
              <button className="ad-btn ghost" onClick={() => window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(nlIssueUrl(sel)), "_blank", "noopener,width=640,height=640")}>開啟 Facebook 分享視窗 ↗</button>
            </div>
          </div>
          <div style={box}>
            <label className="ad-lbl">Instagram 貼文說明（Caption）</label>
            <textarea className="ad-in" style={{ minHeight: 150 }} value={sel.social.instagram} onChange={(e) => setSocial("instagram", e.target.value)} placeholder="貼在 Instagram 的說明文字…" />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="ad-btn ghost" onClick={() => nlCopy(nlInstagramText(sel), "已複製 IG 貼文", setToast)}>複製 IG 貼文（含標籤）</button>
              <span style={{ color: "var(--text-4)", fontSize: 11.5, alignSelf: "center" }}>IG 無網頁直接發文；複製後於 App 貼上即可。</span>
            </div>
          </div>
          <div style={box}>
            <label className="ad-lbl">共用主題標籤 hashtags</label>
            <textarea className="ad-in" value={sel.social.hashtags} onChange={(e) => setSocial("hashtags", e.target.value)} placeholder="#艾倫報報 #AI #台股" />
          </div>
        </div>
      )}

      {tab === "preview" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button className="ad-btn primary" onClick={() => nlShare(sel, setToast)}>⤴ 一鍵分享</button>
            <button className="ad-btn ghost" onClick={() => nlCopy(nlIssueUrl(sel), "已複製連結", setToast)}>複製分享連結</button>
            <button className="ad-btn ghost" onClick={() => nlCopy(nlFacebookText(sel), "已複製 FB 貼文", setToast)}>複製 FB 貼文</button>
            <button className="ad-btn ghost" onClick={() => nlCopy(nlInstagramText(sel), "已複製 IG 貼文", setToast)}>複製 IG 貼文</button>
            <a className="ad-btn ghost" href={nlIssueUrl(sel)} target="_blank" rel="noopener">在新視窗開啟前台頁面 ↗</a>
          </div>
          <div style={{ color: "var(--text-4)", fontSize: 11.5, marginBottom: 14, wordBreak: "break-all" }}>分享連結：{nlIssueUrl(sel)}（需先「儲存」，前台才會顯示最新內容）</div>
          <div style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "28px 22px" }}>
            <NLPreview issue={sel} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 主控台 ---------- */
function Console({ user }) {
  const [active, setActive] = useState(NL_NAV);
  const sec = SECTIONS.find((s) => s.id === active);
  const NAV = [{ id: NL_NAV, label: "電子報" }, ...SECTIONS, { id: WEALTH_NAV, label: "財富自由指數" }];
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
          {NAV.map((s) => {
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
          {active === NL_NAV ? <NewsletterPanel />
            : active === WEALTH_NAV ? <WealthPanel />
            : <SectionEditor key={sec.id} sec={sec} />}
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
