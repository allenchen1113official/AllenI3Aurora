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

/* ---------- PilotOne：社群發文中控的產品名與品牌 ----------
   PilotOne＝內容中控台＋社群發文審核，同一份 aurora_social_posts 佇列。
   獨立入口 admin/pilotone/（window.PILOTONE=true 時以產品殼呈現）；後台管理的左側導覽也保留這兩項。 */
const IS_PILOTONE = !!window.PILOTONE;
const IS_MONITOR = !!window.AURORA_MONITOR; // admin/monitor/：只露出「排程監控」（admin/schedule-monitor.jsx）
const PILOTONE = {
  name: "PilotOne",
  zh: "社群發文中控",
  tagline: "一次製作 · 一鍵起飛",
  byline: "艾倫報報 · ALLEN I³ AURORA",
  mark: "/AllenI3Aurora/assets/pilotone/pilotone-mark.svg",
  url: "/AllenI3Aurora/admin/pilotone/",
};
/* PilotOne 標誌：圖＋字標（size 控制圖的邊長） */
function PilotOneLogo({ size = 36, dense }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: dense ? 8 : 10 }}>
      <img src={PILOTONE.mark} alt="" width={size} height={size} style={{ borderRadius: size * 0.25, boxShadow: "var(--glow-brand)", flex: "none" }} />
      <span style={{ display: "grid", lineHeight: 1.1 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--text-1)", fontSize: dense ? 15 : 18, letterSpacing: ".01em" }}>
          Pilot<span style={{ background: "var(--aurora-gradient)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>One</span>
        </span>
        {!dense && <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{PILOTONE.zh} · {PILOTONE.tagline}</span>}
      </span>
    </span>
  );
}

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
    { k: "url", t: "text" },
  ] },
  { id: "links", table: "aurora_links", label: "常用網站", fields: [
    { k: "sort", t: "number" }, { k: "label", t: "text" }, { k: "url", t: "text" },
    { k: "desc", t: "textarea" }, { k: "icon", t: "text" },
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
    { sort: 1, title: "股癌 Gooaye — EP.整理盤心法", meta: "1h 12m · 昨天", tone: "insight", url: "https://open.firstory.me/user/stocks" },
    { sort: 2, title: "曼報 Manny's Newsletter Radio", meta: "38m · 2 天前", tone: "intelligence", url: "https://open.spotify.com/show/0jMy3OygUQts67tHIYcufS" },
    { sort: 3, title: "Lex Fridman — Memory & Agents", meta: "2h 04m · 本週", tone: "illumination", url: "https://lexfridman.com/podcast/" },
  ],
  links: [
    { sort: 1, label: "Showmethemoney 看盤", url: "https://showmethemoney.tw/", desc: "台股即時看盤儀表板", icon: "chart" },
    { sort: 2, label: "TradingView", url: "https://www.tradingview.com/", desc: "全球市場圖表與技術分析", icon: "chart" },
    { sort: 3, label: "Notion 研究庫", url: "https://www.notion.so/", desc: "筆記與研究資料整理", icon: "book" },
    { sort: 4, label: "GitHub", url: "https://github.com/", desc: "程式碼與專案管理", icon: "link" },
    { sort: 5, label: "Medium 草稿", url: "https://medium.com/", desc: "文章寫作與發布平台", icon: "paper" },
    { sort: 6, label: "Google Scholar", url: "https://scholar.google.com/", desc: "學術論文檢索", icon: "compass" },
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
          {IS_PILOTONE
            ? <img src={PILOTONE.mark} alt="PilotOne" width={56} height={56} style={{ borderRadius: 14, boxShadow: "var(--glow-brand)" }} />
            : <span style={{ display: "inline-grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, background: "var(--aurora-gradient)", color: "var(--text-on-accent)", fontFamily: "var(--font-display)", fontWeight: 900, boxShadow: "var(--glow-brand)" }}>AI³A</span>}
          <h1 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: "12px 0 2px" }}>
            {IS_PILOTONE ? <>Pilot<span style={{ background: "var(--aurora-gradient)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>One</span> 登入</> : IS_MONITOR ? "排程監控登入" : "後台管理登入"}
          </h1>
          <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>{IS_PILOTONE ? PILOTONE.zh + " · " + PILOTONE.byline : "艾倫報報 · Allen I³ Aurora"}</div>
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
      // 先解除 busy 再重新載入：更新既有列時 key（row.id）不變、元件不會重掛，
      // 若不解除會讓「儲存／刪除」按鈕持續停在停用（處理中…）狀態。
      setBusy(false);
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

/* 發布狀態（無 pubStatus 的舊文件視為已發布；前台由 aurora-data.js 依此過濾） */
const PUB_META = {
  draft:     { label: "草稿",   color: "var(--text-3)",       bg: "var(--night-700)" },
  scheduled: { label: "已排程", color: "var(--illumination)", bg: "var(--illumination-soft)" },
  published: { label: "已發布", color: "var(--success)",      bg: "var(--insight-soft)" },
};
const pubStatusOf = (r) => (r && r.pubStatus) || "published";
function PubBadge({ status, small }) {
  const m = PUB_META[status] || PUB_META.published;
  return (
    <span style={{ padding: small ? "2px 9px" : "3px 10px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800,
      background: m.bg, color: m.color, border: "1px solid var(--border)" }}>{m.label}</span>
  );
}
/* datetime-local ↔ ISO（皆以瀏覽器本地時區） */
function isoToLocalInput(iso) {
  const t = Date.parse(iso || "");
  if (!isFinite(t)) return "";
  const d = new Date(t), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
function localInputToIso(v) { const t = Date.parse(v || ""); return isFinite(t) ? new Date(t).toISOString() : ""; }
const fmtLocal = (iso) => { const s = isoToLocalInput(iso); return s ? s.replace("T", " ") : "—"; };

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
    blocks: [], social: { facebook: "", instagram: "", hashtags: "" },
    pubStatus: "draft", publishAt: "", publishedAt: "" }; // 新內容一律從草稿開始
}
function NewsletterPanel() {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);       // 目前編輯的 draft
  const [tab, setTab] = useState("content");   // content | social | preview
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [kindFilter, setKindFilter] = useState("全部");
  const [pubAt, setPubAt] = useState(""); // 發布分頁的 datetime-local 值

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
      pubStatus: pubStatusOf(r), publishAt: r.publishAt || "", publishedAt: r.publishedAt || "",
    });
    setPubAt(isoToLocalInput(r.publishAt));
    setTab("content");
  };
  const newIssue = () => { setSel(blankIssue(maxSort)); setPubAt(""); setTab("content"); };
  const setF = (k, v) => setSel((s) => ({ ...s, [k]: v }));
  const setSocial = (k, v) => setSel((s) => ({ ...s, social: { ...s.social, [k]: v } }));

  const addBlock = () => setSel((s) => ({ ...s, blocks: [...(s.blocks || []), { t: "lead", text: "" }] }));
  const changeBlock = (i, nb) => setSel((s) => { const b = [...s.blocks]; b[i] = nb; return { ...s, blocks: b }; });
  const moveBlock = (i, d) => setSel((s) => { const b = [...s.blocks]; const j = i + d; if (j < 0 || j >= b.length) return s; const t = b[i]; b[i] = b[j]; b[j] = t; return { ...s, blocks: b }; });
  const delBlock = (i) => setSel((s) => ({ ...s, blocks: s.blocks.filter((_, x) => x !== i) }));

  /* 儲存；extra 供發布動作覆寫發布欄位，doneMsg 客製完成訊息 */
  const save = async (extra, doneMsg) => {
    if (!sel) return false;
    setBusy(true); setErr("");
    // table.rows 若仍是字串（未成合法 JSON）則擋下
    for (const b of sel.blocks || []) {
      if (b.t === "table" && b.rows != null && !Array.isArray(b.rows)) {
        setErr("有一個「行情小表格」的 rows 不是合法 JSON，請修正後再儲存。"); setBusy(false); setTab("content"); return false;
      }
    }
    const pub = { pubStatus: sel.pubStatus || "published", publishAt: sel.publishAt || "", publishedAt: sel.publishedAt || "", ...(extra || {}) };
    const payload = {
      sort: Number(sel.sort) || 0, no: sel.no, kind: sel.kind, tone: sel.tone, date: sel.date,
      title: sel.title, subtitle: sel.subtitle, cover: sel.cover, coverCaption: sel.coverCaption,
      author: sel.author, readMinutes: sel.readMinutes === "" ? null : Number(sel.readMinutes),
      items: Number(sel.items) || 0,
      blocks: (sel.blocks || []).map((b) => b.t === "table" ? { ...b, head: normHead(b.head) } : b),
      social: { facebook: sel.social.facebook || "", instagram: sel.social.instagram || "", hashtags: sel.social.hashtags || "" },
      ...pub,
      updatedAt: new Date().toISOString(),
    };
    try {
      if (sel.__new) { const ref = await db.collection("aurora_issues").add(payload); setSel((s) => ({ ...s, __new: false, id: ref.id, ...pub })); }
      else { await db.collection("aurora_issues").doc(sel.id).update(payload); setSel((s) => ({ ...s, ...pub })); }
      await load();
      setToast(doneMsg || "已儲存 ✓ 前台重新整理即可看到最新內容"); setTimeout(() => setToast(""), 3600);
      setBusy(false); return true;
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); setBusy(false); return false; }
  };

  /* 發布動作（皆會連同目前編輯內容一併儲存） */
  const publishNow = async () => {
    if (!window.confirm("確認發布「" + (sel.title || "第 " + sel.no + " 期") + "」？發布後前台立即可見。")) return;
    await save({ pubStatus: "published", publishedAt: new Date().toISOString(), publishAt: "" }, "已發布 ✓ 前台重新整理即可看到本期內容");
  };
  const schedulePublish = async (localVal) => {
    const iso = localInputToIso(localVal);
    if (!iso) { setErr("請先選擇預計發布時間。"); return; }
    if (Date.parse(iso) <= Date.now()) { setErr("預計發布時間需晚於現在；若要立即發布請按「確認發布」。"); return; }
    await save({ pubStatus: "scheduled", publishAt: iso, publishedAt: "" }, "已排程 ✓ 前台將於 " + fmtLocal(iso) + " 起自動顯示本期");
  };
  const revertDraft = async () => {
    if (!window.confirm("將本期退回草稿？前台將不再顯示。")) return;
    await save({ pubStatus: "draft", publishAt: "" }, "已退回草稿，前台不再顯示本期");
  };
  /* 先儲存本期，再以 FB 貼文內文建立 aurora_social_posts 草稿，到「社群發文」審核排程 */
  const queueSocial = async () => {
    if (!sel.social.facebook && !sel.title) { setErr("請先填寫 Facebook 貼文內文或本期標題。"); return; }
    if (!(await save(null, "已儲存"))) return;
    try {
      await socCreateFromIssue(sel);
      setToast("已建立社群貼文草稿 ✓ 請到左側「PilotOne 審核」審核並排程"); setTimeout(() => setToast(""), 4200);
    } catch (ex) { setErr("建立社群草稿失敗：" + errText(ex)); }
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
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {["全部", ...NL_KINDS].map((k) => (
            <button key={k} className="ad-btn ghost" onClick={() => setKindFilter(k)}
              style={{ padding: "6px 12px", fontSize: 12.5,
                borderColor: kindFilter === k ? "var(--border-aurora)" : "var(--border)",
                background: kindFilter === k ? "var(--brand-soft)" : "transparent",
                color: kindFilter === k ? "var(--text-1)" : "var(--text-4)" }}>
              {k}{k !== "全部" ? `（${(list || []).filter((r) => r.kind === k).length}）` : ""}
            </button>
          ))}
        </div>
        {list == null ? <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
          : list.length === 0 ? <div style={{ color: "var(--text-3)", padding: 20 }}>尚無電子報，點右上角「新增一期電子報」開始。</div>
          : (
            <div style={{ display: "grid", gap: 10 }}>
              {list.filter((r) => kindFilter === "全部" || r.kind === kindFilter).map((r) => {
                const st = pubStatusOf(r);
                return (
                <button key={r.id} onClick={() => openIssue(r)} style={{ textAlign: "left", cursor: "pointer", background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: "var(--night-700)", color: "var(--text-2)" }}>{r.kind || "—"}</span>
                    <PubBadge status={st} small />
                    {st === "scheduled" ? <span style={{ color: "var(--illumination)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>⏰ {fmtLocal(r.publishAt)}</span> : null}
                    <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>第 {r.no ?? "—"} 期 · {r.date || "—"}</span>
                    {Array.isArray(r.blocks) && r.blocks.length ? <span style={{ color: "var(--success)", fontSize: 11.5 }}>● 已編內文（{r.blocks.length} 塊）</span> : <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>○ 尚未編內文</span>}
                    {r.social && (r.social.facebook || r.social.instagram) ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ 已備社群貼文</span> : null}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 16 }}>{r.title || "（未命名）"}</div>
                </button>
                );
              })}
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
          <PubBadge status={sel.pubStatus || "published"} />
          <button className="ad-btn primary" onClick={() => save()} disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
          <button className="ad-btn danger" onClick={removeIssue} disabled={busy}>{sel.__new ? "取消" : "刪除整期"}</button>
        </div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("content", "內文編輯")}
        {tabBtn("social", "Facebook / IG 貼文")}
        {tabBtn("preview", "檢視成果 · 分享")}
        {tabBtn("publish", "發布" + (sel.pubStatus === "draft" ? " ○" : sel.pubStatus === "scheduled" ? " ⏰" : " ●"))}
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
              <button className="ad-btn primary" onClick={queueSocial} disabled={busy}>送進 PilotOne 審核（自動發 FB）</button>
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

      {tab === "publish" && (
        <div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>目前狀態</span>
              <PubBadge status={sel.pubStatus || "published"} />
              {sel.pubStatus === "scheduled" && sel.publishAt ? (
                <span style={{ color: "var(--illumination)", fontSize: 13, fontFamily: "var(--font-mono)" }}>
                  ⏰ 預計 {fmtLocal(sel.publishAt)} 發布{Date.parse(sel.publishAt) <= Date.now() ? "（時間已到，前台已可見）" : ""}
                </span>
              ) : null}
              {sel.pubStatus === "published" && sel.publishedAt ? (
                <span style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>發布於 {fmtLocal(sel.publishedAt)}</span>
              ) : null}
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              {sel.pubStatus === "draft"
                ? "本期為草稿，前台不會顯示。建議先在「檢視成果」分頁確認內容，再於下方發布或排程。"
                : sel.pubStatus === "scheduled"
                ? "本期已排程；前台會在預計時間起自動顯示（讀者載入頁面時依時間判斷，無需伺服器）。"
                : "本期已發布，前台可見。可隨時退回草稿下架。"}
            </p>
          </div>

          {sel.pubStatus !== "published" && (
            <div style={box}>
              <div style={{ fontWeight: 800, color: "var(--text-1)", fontFamily: "var(--font-display)", marginBottom: 10 }}>立即發布</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button className="ad-btn primary" onClick={publishNow} disabled={busy}>✓ 確認發布</button>
                <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>發布會連同目前編輯內容一併儲存，前台立即可見。</span>
              </div>
            </div>
          )}

          <div style={box}>
            <div style={{ fontWeight: 800, color: "var(--text-1)", fontFamily: "var(--font-display)", marginBottom: 10 }}>排程發布（訂定預計發布時間）</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <div>
                <label className="ad-lbl">預計發布時間（你的當地時區）</label>
                <input className="ad-in" type="datetime-local" value={pubAt} onChange={(e) => { setPubAt(e.target.value); setErr(""); }} style={{ width: "auto" }} />
              </div>
              <button className="ad-btn primary" onClick={() => schedulePublish(pubAt)} disabled={busy}>⏰ 排程發布</button>
              {sel.pubStatus === "scheduled" ? (
                <button className="ad-btn ghost" onClick={revertDraft} disabled={busy}>取消排程（退回草稿）</button>
              ) : null}
            </div>
          </div>

          {sel.pubStatus === "published" && (
            <div style={box}>
              <div style={{ fontWeight: 800, color: "var(--text-1)", fontFamily: "var(--font-display)", marginBottom: 10 }}>下架</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button className="ad-btn danger" onClick={revertDraft} disabled={busy}>退回草稿（前台下架）</button>
                <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>內容不會刪除，可再次編修後重新發布。</span>
              </div>
            </div>
          )}
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
          <div style={{ color: "var(--text-4)", fontSize: 11.5, marginBottom: 14, wordBreak: "break-all" }}>
            分享連結：{nlIssueUrl(sel)}（需先「儲存」，前台才會顯示最新內容）
            {sel.pubStatus === "draft" ? <span style={{ color: "var(--illumination)" }}>　⚠ 本期仍是草稿，前台看不到；請到「發布」分頁確認發布或排程。</span>
              : sel.pubStatus === "scheduled" && Date.parse(sel.publishAt || "") > Date.now() ? <span style={{ color: "var(--illumination)" }}>　⏰ 本期已排程，前台將於 {fmtLocal(sel.publishAt)} 起顯示。</span> : null}
          </div>
          <div style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "28px 22px" }}>
            <NLPreview issue={sel} />
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   電子報使用者管理 — aurora_subscribers（doc id = 32 字元私密 token，email 為欄位）
   前台 Subscribe 表單建立（pending）→ worker 寄確認信 → 讀者點擊後 confirmed（Double Opt-in）。
   此面板供管理者檢視統計、搜尋篩選、調整節奏、退訂／復訂、重寄確認信、
   複製讀者管理連結、手動新增、刪除與匯出 CSV。寄送邏輯在 scripts/mail/。
   舊格式（doc id = email、status active）由 worker 下一輪自動搬遷，此處標示「待搬遷」。
   ===================================================================== */
const SUB_NAV = "__subscribers";
const SUB_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CADENCE_DEFS = [
  { k: "day", label: "日報" },
  { k: "week", label: "週報" },
  { k: "month", label: "月報" },
];

/* 以台北時間顯示（存的是 ISO UTC；直接切字串會差 8 小時） */
function subFmtTime(iso) {
  const t = Date.parse(iso || "");
  if (!isFinite(t)) return "—";
  const p = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(t));
  const g = (k) => (p.find((x) => x.type === k) || {}).value || "";
  return `${g("year")}.${g("month")}.${g("day")} ${g("hour")}:${g("minute")}`;
}
const SUB_STATUS = {
  confirmed:    { label: "訂閱中",   color: "var(--insight, var(--success))", bg: "var(--insight-soft, rgba(61,220,151,.14))" },
  pending:      { label: "待確認",   color: "var(--illumination)", bg: "var(--illumination-soft, rgba(240,180,41,.14))" },
  unsubscribed: { label: "已退訂",   color: "var(--text-3)", bg: "var(--night-700)" },
  duplicate:    { label: "重複訂閱", color: "var(--text-4)", bg: "var(--night-700)" },
  active:       { label: "待搬遷",   color: "var(--illumination)", bg: "var(--night-700)" }, // 舊格式
};
const subIsLegacy = (r) => String(r.id || "").includes("@");
const subManageUrl = (id) => "https://allenchen1113official.github.io/AllenI3Aurora/manage.html?t=" + encodeURIComponent(id);
function subNewToken() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function subToCsv(rows) {
  const head = ["email", "status", "day", "week", "month", "source", "createdAt", "confirmedAt", "unsubscribedAt", "mailState", "note", "token"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = rows.map((r) => [
    r.email, r.status, !!(r.cadence && r.cadence.day), !!(r.cadence && r.cadence.week),
    !!(r.cadence && r.cadence.month), r.source || "", r.createdAt || "", r.confirmedAt || "", r.unsubscribedAt || "", r.mailState || "", r.note || "", r.id,
  ].map(esc).join(","));
  return head.join(",") + "\n" + lines.join("\n") + "\n";
}

/* ---------- 單一訂閱者列 ---------- */
function SubscriberRow({ row, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(row.note || "");
  const legacy = subIsLegacy(row);
  const active = row.status === "confirmed";
  const pending = row.status === "pending";
  const meta = SUB_STATUS[row.status] || { label: row.status || "未知", color: "var(--text-3)", bg: "var(--night-700)" };

  const patch = async (p) => {
    setBusy(true);
    try {
      await db.collection("aurora_subscribers").doc(row.id).update({ ...p, updatedAt: new Date().toISOString() });
      setBusy(false); onChanged();
    } catch (ex) { onError("更新失敗：" + errText(ex)); setBusy(false); }
  };
  const toggleCadence = (k) => {
    const c = { day: !!(row.cadence && row.cadence.day), week: !!(row.cadence && row.cadence.week), month: !!(row.cadence && row.cadence.month) };
    c[k] = !c[k];
    if (!c.day && !c.week && !c.month) { onError("至少需保留一種節奏；若要停止寄送，請改用「退訂」。"); return; }
    patch({ cadence: c });
  };
  const del = async () => {
    if (!window.confirm(`確定永久刪除訂閱者「${row.email}」？（退訂建議改用「退訂」保留紀錄）`)) return;
    setBusy(true);
    try { await db.collection("aurora_subscribers").doc(row.id).delete(); onChanged(); }
    catch (ex) { onError("刪除失敗：" + errText(ex)); setBusy(false); }
  };
  const saveNote = () => { if ((row.note || "") !== note.trim()) patch({ note: note.trim() }); };
  const copyLink = async () => {
    const url = subManageUrl(row.id);
    try { await navigator.clipboard.writeText(url); onError(""); } catch { window.prompt("複製這段連結：", url); }
  };

  return (
    <div style={{ background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "14px 16px", marginBottom: 10, opacity: active ? 1 : 0.72 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ color: "var(--text-1)", fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis" }}>{row.email}</div>
          <div style={{ color: "var(--text-4)", fontSize: 11.5, fontFamily: "var(--font-mono)", marginTop: 3 }}>
            {row.source === "admin" ? "後台建立" : row.source === "web-legacy" ? "網站訂閱（舊格式搬遷）" : "網站訂閱"} · 訂閱 {subFmtTime(row.createdAt)}
            {row.confirmedAt ? " · 確認 " + subFmtTime(row.confirmedAt) : ""} · 更新 {subFmtTime(row.updatedAt)}
            {row.mailState === "failed" ? <span style={{ color: "var(--danger)" }}> · 寄送失敗 {row.retries || 0} 次{row.lastError ? "：" + String(row.lastError).slice(0, 80) : ""}</span> : null}
            {row.mailState === "need_confirm" ? <span style={{ color: "var(--illumination)" }}> · 確認信排隊中</span> : null}
            {row.mailState === "need_welcome" ? <span style={{ color: "var(--illumination)" }}> · 歡迎信排隊中</span> : null}
            {legacy ? <span style={{ color: "var(--illumination)" }}> · 舊格式，worker 下一輪自動搬遷</span> : null}
          </div>
        </div>
        <span style={{ padding: "3px 10px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800,
          background: meta.bg, color: meta.color, border: "1px solid var(--border)" }}>
          {meta.label}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {CADENCE_DEFS.map((c) => {
            const on = !!(row.cadence && row.cadence[c.k]);
            return (
              <button key={c.k} className="ad-btn ghost" disabled={busy || !active} onClick={() => toggleCadence(c.k)}
                title={(on ? "取消" : "加入") + c.label}
                style={{ padding: "5px 10px", fontSize: 12,
                  borderColor: on ? "var(--border-aurora)" : "var(--border)",
                  background: on ? "var(--brand-soft)" : "transparent",
                  color: on ? "var(--text-1)" : "var(--text-4)" }}>
                {c.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {pending ? (
            <button className="ad-btn ghost" disabled={busy || legacy} title="重設為排隊中，worker 下一輪（10 分鐘內）重寄"
              onClick={() => patch({ mailState: "need_confirm", confirmSentAt: null, retries: 0, lastError: null })}>重寄確認信</button>
          ) : null}
          {row.status === "unsubscribed" ? (
            <button className="ad-btn ghost" disabled={busy || legacy} onClick={() => patch({ status: "confirmed", mailState: "idle" })}>復訂</button>
          ) : row.status !== "duplicate" ? (
            <button className="ad-btn ghost" disabled={busy || legacy} onClick={() => patch({ status: "unsubscribed", mailState: "idle", unsubscribedAt: new Date().toISOString() })}>退訂</button>
          ) : null}
          {!legacy ? <button className="ad-btn ghost" disabled={busy} onClick={copyLink} title="讀者的偏好中心連結（等同其訂閱憑證，勿公開）">複製管理連結</button> : null}
          <button className="ad-btn danger" style={{ padding: "7px 10px" }} disabled={busy} onClick={del}>刪除</button>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <input className="ad-in" style={{ padding: "7px 10px", fontSize: 12.5 }} placeholder="備註（僅後台可見，離開欄位即儲存）"
          value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
      </div>
    </div>
  );
}

/* ---------- 訂閱用戶主面板 ---------- */
function SubscribersPanel() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");     // all | confirmed | pending | unsubscribed
  const [cadence, setCadence] = useState("all");   // all | day | week | month
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newCad, setNewCad] = useState({ day: false, week: true, month: true });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const snap = await db.collection("aurora_subscribers").get();
      const arr = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      arr.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setRows(arr);
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = rows || [];
  const live = (r) => r.status === "confirmed";
  const stats = {
    total: all.length,
    active: all.filter(live).length,
    pending: all.filter((r) => r.status === "pending").length,
    unsub: all.filter((r) => r.status === "unsubscribed").length,
    legacy: all.filter(subIsLegacy).length,
    day: all.filter((r) => live(r) && r.cadence && r.cadence.day).length,
    week: all.filter((r) => live(r) && r.cadence && r.cadence.week).length,
    month: all.filter((r) => live(r) && r.cadence && r.cadence.month).length,
  };
  const shown = all.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (cadence !== "all" && !(r.cadence && r.cadence[cadence])) return false;
    if (q.trim() && !String(r.email || "").includes(q.trim().toLowerCase())) return false;
    return true;
  });

  const add = async () => {
    const key = newEmail.trim().toLowerCase();
    if (!SUB_EMAIL_RE.test(key)) { setErr("請輸入有效的 Email。"); return; }
    if (!newCad.day && !newCad.week && !newCad.month) { setErr("請至少選擇一種節奏。"); return; }
    if (all.some((r) => r.email === key && r.status !== "unsubscribed")) { setErr(`「${key}」已在名單中。`); return; }
    setBusy(true); setErr("");
    const now = new Date().toISOString();
    try {
      // 後台手動新增視為已確認（例如讀者來信要求加入），不走確認信；仍記 consent 與來源以留軌跡。
      await db.collection("aurora_subscribers").doc(subNewToken()).set({
        email: key, cadence: { day: !!newCad.day, week: !!newCad.week, month: !!newCad.month },
        status: "confirmed", mailState: "idle", consent: true, source: "admin", locale: "zh-Hant",
        createdAt: now, updatedAt: now, confirmedAt: now,
      });
      setAdding(false); setNewEmail(""); setNote(`已新增 ${key}`); setTimeout(() => setNote(""), 2500);
      await load();
    } catch (ex) { setErr("新增失敗：" + errText(ex)); }
    setBusy(false);
  };

  const exportCsv = () => {
    const blob = new Blob(["﻿" + subToCsv(shown)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aurora-subscribers-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  const statCard = (label, val, tone) => (
    <div style={{ background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "12px 16px", minWidth: 96 }}>
      <div style={{ color: "var(--text-3)", fontSize: 11.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, lineHeight: 1, color: tone || "var(--text-1)" }}>{val}</div>
    </div>
  );
  const selStyle = { width: "auto", flex: "0 0 auto", padding: "8px 10px" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>訂閱用戶</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>aurora_subscribers · {rows ? rows.length : "…"} 位 · 電子報使用者管理</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ad-btn ghost" onClick={exportCsv} disabled={!shown.length} title="匯出目前篩選結果">⬇ 匯出 CSV（{shown.length}）</button>
          <button className="ad-btn primary" onClick={() => { setAdding((v) => !v); setErr(""); }}>{adding ? "收合" : "＋ 手動新增"}</button>
        </div>
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {note && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{note}</div>}

      {adding && (
        <div style={{ background: "var(--night-800)", border: "1px solid var(--border-aurora)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 240px" }}>
              <label className="ad-lbl">Email</label>
              <input className="ad-in" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="reader@example.com"
                onKeyDown={(e) => { if (e.key === "Enter" && !busy) add(); }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {CADENCE_DEFS.map((c) => (
                <button key={c.k} className="ad-btn ghost" onClick={() => setNewCad((s) => ({ ...s, [c.k]: !s[c.k] }))}
                  style={{ borderColor: newCad[c.k] ? "var(--border-aurora)" : "var(--border)", background: newCad[c.k] ? "var(--brand-soft)" : "transparent", color: newCad[c.k] ? "var(--text-1)" : "var(--text-4)" }}>
                  {c.label}
                </button>
              ))}
            </div>
            <button className="ad-btn primary" onClick={add} disabled={busy}>{busy ? "新增中…" : "加入名單"}</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {statCard("總名單", stats.total)}
        {statCard("訂閱中", stats.active, "var(--success)")}
        {statCard("待確認", stats.pending, "var(--illumination)")}
        {statCard("已退訂", stats.unsub, "var(--text-3)")}
        {stats.legacy ? statCard("待搬遷", stats.legacy, "var(--illumination)") : null}
        {statCard("日報", stats.day, "var(--illumination)")}
        {statCard("週報", stats.week, "var(--insight)")}
        {statCard("月報", stats.month, "var(--intelligence)")}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input className="ad-in" style={{ flex: "1 1 200px", padding: "8px 12px" }} placeholder="搜尋 Email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="ad-in" style={selStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">全部狀態</option><option value="confirmed">訂閱中</option><option value="pending">待確認</option><option value="unsubscribed">已退訂</option><option value="duplicate">重複訂閱</option>
        </select>
        <select className="ad-in" style={selStyle} value={cadence} onChange={(e) => setCadence(e.target.value)}>
          <option value="all">全部節奏</option>
          {CADENCE_DEFS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
        </select>
        <button className="ad-btn ghost" onClick={load}>↻ 重新整理</button>
      </div>

      {rows == null ? (
        <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
      ) : shown.length === 0 ? (
        <div style={{ color: "var(--text-3)", padding: 20 }}>
          {all.length === 0 ? "尚無訂閱者。讀者從前台「訂閱管理」頁送出 Email 後會出現在這裡，也可點「＋ 手動新增」。" : "沒有符合篩選條件的訂閱者。"}
        </div>
      ) : (
        shown.map((r) => <SubscriberRow key={r.id} row={r} onChanged={load} onError={setErr} />)
      )}
      <div style={{ color: "var(--text-4)", fontSize: 11.5, lineHeight: 1.7, marginTop: 18 }}>
        確認信／歡迎信由 GitHub Actions「subscriber-mail」每 10 分鐘掃描佇列寄出；未設定寄信 Secrets 時狀態會停在「待確認」。
        寄送本期電子報見「寄送紀錄」分頁。退訂建議用「退訂」而非刪除，以保留同意與撤回軌跡。
      </div>
    </div>
  );
}

/* =====================================================================
   寄送紀錄 — aurora_campaigns（由 scripts/mail/send-issue.mjs 寫入）
   每期一份，記錄已寄出 Email 清單；重跑同一期不重複寄送。只讀不寫：
   寄送動作在 GitHub Actions「寄送本期電子報」，刻意不放後台以免誤按。
   ===================================================================== */
const CAMP_NAV = "__campaigns";

function CampaignsPanel() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState("");
  const load = useCallback(async () => {
    setErr(""); setRows(null);
    try {
      const snap = await db.collection("aurora_campaigns").orderBy("updatedAt", "desc").limit(100).get();
      setRows(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
      const m = await db.doc("aurora_subscribers_meta/runner").get();
      setMeta(m.exists ? m.data() : {});
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const list = rows || [];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>寄送紀錄</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>
            aurora_campaigns · 確認信 worker 最後執行 {meta && meta.lastRunAt ? subFmtTime(meta.lastRunAt) : "尚未執行"}
            {meta && meta.lastRun ? `（寄 ${meta.lastRun.sent}／略 ${meta.lastRun.skipped}／敗 ${meta.lastRun.failed}）` : ""}
            {meta && meta.legacyMigratedAt ? ` · 舊格式搬遷完成 ${subFmtTime(meta.legacyMigratedAt)}` : ""}
          </div>
        </div>
        <button className="ad-btn ghost" onClick={load}>↻ 重新整理</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {rows == null ? <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
      : !list.length ? (
        <div style={{ color: "var(--text-3)", padding: "16px 18px", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)" }}>
          還沒有寄送過任何一期。到 GitHub → Actions →「寄送本期電子報」執行後，這裡會出現紀錄。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {list.map((c) => {
            const sent = Number(c.sentCount || 0), target = Number(c.targetCount || 0);
            const pct = target ? Math.round((sent / target) * 100) : 0;
            const done = !!c.finishedAt;
            const fails = Array.isArray(c.failures) ? c.failures : [];
            return (
              <div key={c.id} style={{ background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "13px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14.5, color: "var(--text-1)" }}>{c.kind} 第 {c.no} 期</span>
                  <span style={{ color: "var(--text-3)", fontSize: 13 }}>{c.title || "(無標題)"}</span>
                  <span style={{ padding: "3px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 700,
                    background: done ? "var(--insight-soft)" : "var(--illumination-soft, var(--night-700))", color: done ? "var(--insight)" : "var(--illumination)" }}>{done ? "完成" : "寄送中"}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-2)" }}>{sent} / {target}</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: "var(--night-600)", marginTop: 10, overflow: "hidden" }}>
                  <div style={{ width: pct + "%", height: "100%", background: done ? "var(--insight)" : "var(--aurora-gradient)" }} />
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 9, color: "var(--text-4)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>
                  <span>節奏 {c.cadenceKey || "—"}</span><span>起 {subFmtTime(c.startedAt)}</span><span>更新 {subFmtTime(c.updatedAt)}</span>
                  {!done && target > sent ? <span style={{ color: "var(--illumination)" }}>尚餘 {target - sent} 人，重跑 workflow 即可續寄</span> : null}
                  {fails.length ? <span style={{ color: "var(--danger)" }}>失敗 {fails.length}</span> : null}
                </div>
                {fails.length ? (
                  <div style={{ marginTop: 8 }}>
                    <button className="ad-btn ghost" style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => setOpen(open === c.id ? "" : c.id)}>{open === c.id ? "收合" : "查看失敗明細"}</button>
                    {open === c.id ? (
                      <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--night-900)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                        {fails.map((f, i) => <div key={i} style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-3)", marginBottom: 4 }}><span style={{ color: "var(--text-2)" }}>{f.email}</span> — {f.error}</div>)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ color: "var(--text-4)", fontSize: 11.5, lineHeight: 1.7, marginTop: 18 }}>
        寄送動作在 GitHub → Actions →「寄送本期電子報」（dry_run → test_to 試寄 → 正式），刻意不放在後台：寄信不可逆。每期已寄名單記在這裡，重跑同一期不會有人收到第二份。
      </div>
    </div>
  );
}

/* =====================================================================
   Podcast 節目管理 — aurora_podcast_episodes（各集：逐字稿／摘要／康乃爾筆記）
   工作流程：本機以 OpenAI Whisper 轉錄音檔為繁中逐字稿
   （scripts/podcast/transcribe.py，見 docs/PODCAST_WHISPER_SOP.md）→
   將逐字稿貼入本面板 → 編修繁中摘要與一頁康乃爾重點筆記 → 發布。
   前台儀表板顯示「最新一集」的繁中摘要與康乃爾筆記圖卡。
   ===================================================================== */
const PC_NAV = "__podcast";
const PC_COLL = "aurora_podcast_episodes";

const PC_STATUS_META = {
  draft:     { label: "草稿",   color: "var(--text-3)",  bg: "var(--night-700)" },
  published: { label: "已發布", color: "var(--success)", bg: "var(--insight-soft)" },
};
const pcStatusOf = (r) => ((r && r.status) === "draft" ? "draft" : "published");
function PcBadge({ status }) {
  const m = PC_STATUS_META[status] || PC_STATUS_META.published;
  return (
    <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800,
      background: m.bg, color: m.color, border: "1px solid var(--border)" }}>{m.label}</span>
  );
}

function pcBlank(maxSort) {
  return { __new: true, sort: (maxSort || 0) + 1, show: "", title: "", date: "", duration: "",
    url: "", tone: "insight", status: "draft", transcript: "", summary: "",
    cornell: { rows: [], summary: "" } };
}

/* 康乃爾筆記圖卡預覽（與前台 Dashboard.jsx 的 CornellCard 同版型） */
function PcCornellPreview({ ep }) {
  const c = ep.cornell || {};
  const rows = (Array.isArray(c.rows) ? c.rows : []).filter((r) => r && (r.cue || r.note));
  const summary = c.summary || ep.summary || "";
  const tone = ep.tone || "insight";
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden", background: "var(--night-800)" }}>
      <div style={{ padding: "14px 18px", background: "linear-gradient(135deg, var(--intelligence-soft), transparent)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 12, color: "var(--intelligence)", letterSpacing: ".1em" }}>CORNELL NOTES · 康乃爾筆記</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>艾倫報報 · Allen I³ Aurora</span>
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 14.5, marginTop: 6 }}>{ep.show}{ep.show && ep.title ? " — " : ""}{ep.title || "（未命名集數）"}</div>
        <div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 2, fontFamily: "var(--font-mono)" }}>{[ep.date, ep.duration].filter(Boolean).join(" · ")}</div>
      </div>
      {rows.length ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.8fr", padding: "8px 18px", borderBottom: "1px solid var(--border)", fontSize: 11, letterSpacing: ".08em", fontWeight: 700, color: "var(--text-3)" }}>
            <span>線索 CUES</span><span>筆記 NOTES</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "0.9fr 1.8fr", gap: 10, padding: "10px 18px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", alignItems: "start" }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13, color: `var(--${tone})`, lineHeight: 1.45 }}>{r.cue}</span>
              <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.note}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "18px", color: "var(--text-4)", fontSize: 12.5 }}>尚無筆記列。到「摘要與康乃爾筆記」分頁加入線索與筆記。</div>
      )}
      {summary ? (
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--night-850)" }}>
          <div style={{ fontSize: 11, letterSpacing: ".08em", fontWeight: 700, color: "var(--text-3)", marginBottom: 6 }}>總結 SUMMARY</div>
          <div style={{ color: "var(--text-1)", fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{summary}</div>
        </div>
      ) : null}
    </div>
  );
}

function PodcastPanel() {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);      // 目前編輯的 draft
  const [tab, setTab] = useState("info");    // info | notes | preview
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [showFilter, setShowFilter] = useState("全部");

  const load = useCallback(async () => {
    setErr("");
    try {
      const snap = await db.collection(PC_COLL).orderBy("sort").get();
      setList(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setList([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const maxSort = (list || []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
  const shows = ["全部", ...Array.from(new Set((list || []).map((r) => r.show).filter(Boolean)))];

  const openEp = (r) => {
    setSel({
      id: r.id, sort: r.sort ?? 0, show: r.show || "", title: r.title || "", date: r.date || "",
      duration: r.duration || "", url: r.url || "", tone: r.tone || "insight", status: pcStatusOf(r),
      transcript: r.transcript || "", summary: r.summary || "",
      cornell: {
        rows: Array.isArray(r.cornell && r.cornell.rows) ? JSON.parse(JSON.stringify(r.cornell.rows)) : [],
        summary: (r.cornell && r.cornell.summary) || "",
      },
    });
    setTab("info");
  };
  const setF = (k, v) => setSel((s) => ({ ...s, [k]: v }));
  const setCornell = (k, v) => setSel((s) => ({ ...s, cornell: { ...s.cornell, [k]: v } }));
  const setRow = (i, k, v) => setSel((s) => { const rows = [...s.cornell.rows]; rows[i] = { ...rows[i], [k]: v }; return { ...s, cornell: { ...s.cornell, rows } }; });
  const addRow = () => setCornell("rows", [...(sel.cornell.rows || []), { cue: "", note: "" }]);
  const moveRow = (i, d) => setSel((s) => { const rows = [...s.cornell.rows]; const j = i + d; if (j < 0 || j >= rows.length) return s; const t = rows[i]; rows[i] = rows[j]; rows[j] = t; return { ...s, cornell: { ...s.cornell, rows } }; });
  const delRow = (i) => setCornell("rows", sel.cornell.rows.filter((_, x) => x !== i));

  /* 儲存；extra 供發布動作覆寫狀態欄位 */
  const save = async (extra, doneMsg) => {
    if (!sel) return false;
    setBusy(true); setErr("");
    const st = { status: sel.status || "draft", ...(extra || {}) };
    const payload = {
      sort: Number(sel.sort) || 0, show: sel.show, title: sel.title, date: sel.date,
      duration: sel.duration, url: sel.url, tone: sel.tone,
      transcript: sel.transcript, summary: sel.summary,
      cornell: {
        rows: (sel.cornell.rows || []).map((r) => ({ cue: r.cue || "", note: r.note || "" })),
        summary: sel.cornell.summary || "",
      },
      ...st,
      updatedAt: new Date().toISOString(),
    };
    try {
      if (sel.__new) { const ref = await db.collection(PC_COLL).add(payload); setSel((s) => ({ ...s, __new: false, id: ref.id, ...st })); }
      else { await db.collection(PC_COLL).doc(sel.id).update(payload); setSel((s) => ({ ...s, ...st })); }
      await load();
      setToast(doneMsg || "已儲存 ✓"); setTimeout(() => setToast(""), 3200);
      setBusy(false); return true;
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); setBusy(false); return false; }
  };

  const publishNow = async () => {
    if (!window.confirm("確認發布「" + (sel.title || sel.show || "本集") + "」？發布後若為最新一集，前台首頁將顯示其摘要與筆記圖卡。")) return;
    await save({ status: "published", publishedAt: new Date().toISOString() }, "已發布 ✓ 前台重新整理即可看到最新一集");
  };
  const revertDraft = async () => {
    if (!window.confirm("將本集退回草稿？前台將不再顯示本集。")) return;
    await save({ status: "draft" }, "已退回草稿");
  };
  const removeEp = async () => {
    if (!sel || sel.__new) { setSel(null); return; }
    if (!window.confirm("確定刪除「" + (sel.title || sel.show) + "」整集（含逐字稿與筆記）？")) return;
    setBusy(true);
    try { await db.collection(PC_COLL).doc(sel.id).delete(); setSel(null); await load(); }
    catch (ex) { setErr("刪除失敗：" + errText(ex)); }
    setBusy(false);
  };

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
  const tabBtn = (id, label) => (
    <button className={"ad-btn" + (tab === id ? " primary" : " ghost")} onClick={() => setTab(id)} style={{ padding: "8px 14px" }}>{label}</button>
  );

  /* --- 列表視圖 --- */
  if (!sel) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>Podcast 節目</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{PC_COLL} · {list ? list.length : "…"} 集 · 逐字稿／摘要／康乃爾筆記</div>
          </div>
          <button className="ad-btn primary" onClick={() => { setSel(pcBlank(maxSort)); setTab("info"); }}>＋ 新增一集</button>
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <div style={{ color: "var(--text-4)", fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
          流程：本機執行 <code>python scripts/podcast/transcribe.py 音檔.mp3</code>（OpenAI Whisper 本機轉錄，見 <code>docs/PODCAST_WHISPER_SOP.md</code>）
          → 貼上逐字稿 → 編修繁中摘要與康乃爾筆記 → 發布。前台首頁顯示最新一集的摘要與一頁筆記圖卡。
        </div>
        {shows.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {shows.map((s) => (
              <button key={s} className="ad-btn ghost" onClick={() => setShowFilter(s)}
                style={{ padding: "6px 12px", fontSize: 12.5,
                  borderColor: showFilter === s ? "var(--border-aurora)" : "var(--border)",
                  background: showFilter === s ? "var(--brand-soft)" : "transparent",
                  color: showFilter === s ? "var(--text-1)" : "var(--text-4)" }}>
                {s}{s !== "全部" ? `（${(list || []).filter((r) => r.show === s).length}）` : ""}
              </button>
            ))}
          </div>
        )}
        {list == null ? <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
          : list.length === 0 ? <div style={{ color: "var(--text-3)", padding: 20 }}>尚無節目，點右上角「新增一集」開始。</div>
          : (
            <div style={{ display: "grid", gap: 10 }}>
              {list.filter((r) => showFilter === "全部" || r.show === showFilter).map((r) => {
                const nRows = Array.isArray(r.cornell && r.cornell.rows) ? r.cornell.rows.length : 0;
                return (
                  <button key={r.id} onClick={() => openEp(r)} style={{ textAlign: "left", cursor: "pointer", background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: "var(--night-700)", color: "var(--text-2)" }}>{r.show || "—"}</span>
                      <PcBadge status={pcStatusOf(r)} />
                      <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{[r.date, r.duration].filter(Boolean).join(" · ") || "—"}</span>
                      {r.transcript ? <span style={{ color: "var(--success)", fontSize: 11.5 }}>● 逐字稿（{String(r.transcript).length} 字）</span> : <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>○ 無逐字稿</span>}
                      {r.summary ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ 已備摘要</span> : null}
                      {nRows ? <span style={{ color: "var(--illumination)", fontSize: 11.5 }}>▣ 康乃爾筆記（{nRows} 列）</span> : null}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 16 }}>{r.title || "（未命名集數）"}</div>
                  </button>
                );
              })}
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
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: 0 }}>{sel.__new ? "新增一集" : "編輯本集"}</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{sel.show || "—"} · {sel.title || "未命名"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <PcBadge status={sel.status || "draft"} />
          <button className="ad-btn primary" onClick={() => save()} disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
          {sel.status !== "published"
            ? <button className="ad-btn primary" onClick={publishNow} disabled={busy}>✓ 發布</button>
            : <button className="ad-btn ghost" onClick={revertDraft} disabled={busy}>退回草稿</button>}
          <button className="ad-btn danger" onClick={removeEp} disabled={busy}>{sel.__new ? "取消" : "刪除整集"}</button>
        </div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("info", "基本資料與逐字稿")}
        {tabBtn("notes", "摘要與康乃爾筆記")}
        {tabBtn("preview", "預覽筆記圖卡")}
      </div>

      {tab === "info" && (
        <div>
          <div style={box}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">節目 show</label>
                <input className="ad-in" list="pc-shows" value={sel.show} onChange={(e) => setF("show", e.target.value)} placeholder="例：股癌 Gooaye" />
                <datalist id="pc-shows">{shows.filter((s) => s !== "全部").map((s) => <option key={s} value={s} />)}</datalist></div>
              <div><label className="ad-lbl">日期 date</label><input className="ad-in" value={sel.date} onChange={(e) => setF("date", e.target.value)} placeholder="2026.08.22" /></div>
              <div><label className="ad-lbl">長度 duration</label><input className="ad-in" value={sel.duration} onChange={(e) => setF("duration", e.target.value)} placeholder="58m / 1h 12m" /></div>
              <div><label className="ad-lbl">色調 tone</label>
                <select className="ad-in" value={sel.tone} onChange={(e) => setF("tone", e.target.value)}>{TONE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label className="ad-lbl">排序 sort</label><input className="ad-in" type="number" value={sel.sort} onChange={(e) => setF("sort", e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 12 }}><label className="ad-lbl">集數標題 title</label><input className="ad-in" value={sel.title} onChange={(e) => setF("title", e.target.value)} placeholder="EP.本集主題" /></div>
            <div style={{ marginTop: 12 }}><label className="ad-lbl">收聽連結 url</label><input className="ad-in" value={sel.url} onChange={(e) => setF("url", e.target.value)} placeholder="https://…" /></div>
          </div>
          <div style={box}>
            <label className="ad-lbl">逐字稿 transcript（{String(sel.transcript || "").length} 字）</label>
            <textarea className="ad-in" style={{ minHeight: 260 }} value={sel.transcript} onChange={(e) => setF("transcript", e.target.value)}
              placeholder={"貼上本機 Whisper 轉錄的繁中逐字稿。\n\n本機轉錄指令：\n  python scripts/podcast/transcribe.py 音檔.mp3\n（詳見 docs/PODCAST_WHISPER_SOP.md；轉錄後會輸出 .txt 逐字稿與 .notes.md 筆記草稿範本）"} />
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div>
          <div style={box}>
            <label className="ad-lbl">繁體中文摘要 summary（前台「最新一集」顯示）</label>
            <textarea className="ad-in" style={{ minHeight: 130, fontFamily: "var(--font-body)" }} value={sel.summary} onChange={(e) => setF("summary", e.target.value)}
              placeholder="以 150–250 字概括本集重點：主題、論點、結論與可行動的啟發…" />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 10px" }}>
            <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)" }}>康乃爾筆記列（{(sel.cornell.rows || []).length}）— 左欄線索、右欄筆記</div>
            <button className="ad-btn primary" onClick={addRow} style={{ padding: "7px 12px" }}>＋ 新增一列</button>
          </div>
          {(sel.cornell.rows || []).length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "14px 16px", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", marginBottom: 14 }}>
              還沒有筆記列。每列＝一個「線索／關鍵字」＋對應「筆記內容」，即康乃爾筆記法的左右兩欄。
            </div>
          ) : (sel.cornell.rows.map((r, i) => (
            <div key={i} style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--text-4)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>#{i + 1}</span>
                <div style={{ flex: 1 }} />
                <button className="ad-btn ghost" style={{ padding: "5px 9px" }} disabled={i === 0} onClick={() => moveRow(i, -1)} title="上移">↑</button>
                <button className="ad-btn ghost" style={{ padding: "5px 9px" }} disabled={i === sel.cornell.rows.length - 1} onClick={() => moveRow(i, 1)} title="下移">↓</button>
                <button className="ad-btn danger" style={{ padding: "5px 9px" }} onClick={() => delRow(i)} title="刪除">✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 0.9fr) 1.8fr", gap: 10 }}>
                <div><label className="ad-lbl">線索 cue</label>
                  <input className="ad-in" value={r.cue || ""} onChange={(e) => setRow(i, "cue", e.target.value)} placeholder="關鍵字／問題" /></div>
                <div><label className="ad-lbl">筆記 note</label>
                  <textarea className="ad-in" style={{ minHeight: 56, fontFamily: "var(--font-body)" }} value={r.note || ""} onChange={(e) => setRow(i, "note", e.target.value)} placeholder="對應的重點內容…" /></div>
              </div>
            </div>
          )))}
          <div style={box}>
            <label className="ad-lbl">底部總結 cornell.summary（圖卡最下方；留空則沿用上方摘要）</label>
            <textarea className="ad-in" style={{ minHeight: 90, fontFamily: "var(--font-body)" }} value={sel.cornell.summary} onChange={(e) => setCornell("summary", e.target.value)}
              placeholder="用 2–3 句話收斂整集：核心結論與下一步行動…" />
          </div>
        </div>
      )}

      {tab === "preview" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="ad-btn ghost" onClick={() => {
              const data = { show: sel.show, title: sel.title, date: sel.date, duration: sel.duration, tone: sel.tone, summary: sel.summary,
                cornell: { rows: (sel.cornell.rows || []).map((r) => ({ cue: r.cue || "", note: r.note || "" })), summary: sel.cornell.summary || "" } };
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = (sel.title || "episode").replace(/[\\/:*?"<>|]/g, "-") + ".json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            }}>⬇ 匯出本集 JSON（社群圖卡用）</button>
            <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>
              本機執行 <code>python scripts/podcast/render_social_card.py --episode 本集.json</code> 產出 FB（1200×630）／IG（1080×1080）圖卡。
            </span>
          </div>
          <div style={{ color: "var(--text-4)", fontSize: 12, marginBottom: 14 }}>
            一頁康乃爾重點筆記圖卡（與前台顯示版型一致）。發布後若為最新一集，前台首頁「本集重點摘要」即顯示摘要與此圖卡。
          </div>
          <div style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "26px 20px" }}>
            <PcCornellPreview ep={sel} />
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   社群發文 — aurora_social_posts 審核與排程（第一階段：Facebook 粉專）
   後台只負責「內容與決策」：編修、核准、排程、取消；實際呼叫 Graph API
   由 GitHub Actions（social-publish.yml，每 10 分鐘）以伺服器端 Token 執行，
   Token 不會出現在前端。狀態機見 scripts/social/core.mjs。
   ===================================================================== */
const SOC_NAV = "__social";
const SOC_COLL = "aurora_social_posts";
const SOC_META_DOC = "aurora_social_meta/runner";
const SOC_NATIVE_MIN_MIN = 20; // 與 core.mjs FB_NATIVE_MIN_LEAD_MS 一致

const SOC_FB_META = {
  draft:            { label: "待審核",     color: "var(--text-2)",       bg: "var(--night-700)" },
  approved:         { label: "已核准・待送出", color: "var(--illumination)", bg: "var(--illumination-soft)" },
  publishing:       { label: "送出中",     color: "var(--illumination)", bg: "var(--illumination-soft)" },
  scheduled:        { label: "Meta 已排程", color: "var(--intelligence)", bg: "var(--brand-soft)" },
  cancel_requested: { label: "取消中",     color: "var(--illumination)", bg: "var(--illumination-soft)" },
  published:        { label: "已發布",     color: "var(--success)",      bg: "var(--insight-soft)" },
  failed:           { label: "失敗",       color: "var(--danger)",       bg: "var(--night-700)" },
  skipped:          { label: "不發 FB",    color: "var(--text-4)",       bg: "var(--night-700)" },
};
const socFbState = (r) => (r && r.fb && r.fb.state) || "draft";
const socIsRejected = (r) => r && r.queueState === "rejected";
const SOC_EDITABLE = ["draft", "failed"]; // 只有尚未交給排程器的才可編修
const SOC_FILTERS = [
  { id: "review",  label: "待審核", test: (r) => !socIsRejected(r) && socFbState(r) === "draft" },
  { id: "queue",   label: "排程中", test: (r) => ["approved", "publishing", "scheduled", "cancel_requested"].includes(socFbState(r)) },
  { id: "done",    label: "已發布", test: (r) => socFbState(r) === "published" },
  { id: "failed",  label: "失敗",   test: (r) => socFbState(r) === "failed" },
  { id: "rejected", label: "已退回", test: socIsRejected },
  { id: "all",     label: "全部",   test: () => true },
];

/* 站內圖卡（GitHub Pages 公開網址；IG 第二階段也會沿用） */
const SOC_SITE_BASE = location.origin + "/AllenI3Aurora/";
const SOC_IMAGE_PICKS = [
  { label: "上市熱力圖（FB）", path: "assets/heatmap/twse-heatmap-fb.png" },
  { label: "上櫃熱力圖（FB）", path: "assets/heatmap/tpex-heatmap-fb.png" },
  { label: "選股雷達（FB）",   path: "assets/stockradar/stockradar-fb.png" },
  { label: "盤前速報圖卡",     path: "assets/prebrief/prebrief-card.png" },
  { label: "Podcast 筆記（FB）", path: "assets/podcast/podcast-cornell-fb.png" },
];
/* 電子報封面（../../assets/x 或站內相對路徑）→ 公開絕對網址 */
function socAbsUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const i = s.indexOf("assets/");
  return i >= 0 ? SOC_SITE_BASE + s.slice(i) : "";
}

function socBlank() {
  return { __new: true, title: "", imageUrl: "", scheduledAt: "", queueState: "draft", note: "",
    source: { type: "manual" },
    fb: { enabled: true, caption: "", link: "", state: "draft", attempts: 0, error: null, postId: null } };
}

/* 由電子報建立 FB 草稿（電子報「Facebook / IG 貼文」分頁呼叫） */
async function socCreateFromIssue(issue) {
  const s = issue.social || {};
  const caption = [s.facebook || issue.title || "", s.hashtags || ""].filter(Boolean).join("\n\n");
  const now = new Date().toISOString();
  const ref = await db.collection(SOC_COLL).add({
    title: `${issue.kind || "電子報"} 第 ${issue.no || "—"} 期 · ${issue.title || ""}`.trim(),
    imageUrl: socAbsUrl(issue.cover), scheduledAt: "", queueState: "draft", note: "",
    source: { type: "issue", issueId: issue.id || null, kind: issue.kind || "", no: issue.no ?? "" },
    fb: { enabled: true, caption, link: nlIssueUrl(issue), state: "draft", attempts: 0, error: null, postId: null },
    ig: { enabled: false, state: "skipped" },
    lock: { by: null, at: null },
    createdAt: now, updatedAt: now,
  });
  return ref.id;
}

function SocBadge({ r }) {
  const st = socIsRejected(r) ? null : socFbState(r);
  const m = st ? SOC_FB_META[st] : { label: "已退回", color: "var(--text-4)", bg: "var(--night-700)" };
  return <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: m.bg, color: m.color, border: "1px solid var(--border)" }}>{m.label}</span>;
}

/* Facebook 貼文樣式預覽（照片貼文：連結併入內文，與排程器送出內容一致） */
function SocFbPreview({ p }) {
  const isPhoto = !!p.imageUrl;
  const text = isPhoto ? [p.fb.caption, p.fb.link].filter(Boolean).join("\n\n") : p.fb.caption;
  return (
    <div style={{ background: "#ffffff", color: "#050505", borderRadius: 10, maxWidth: 500, overflow: "hidden", fontFamily: "system-ui, -apple-system, 'Noto Sans TC', sans-serif", boxShadow: "0 2px 14px rgba(0,0,0,.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 8px" }}>
        <img src={SOC_SITE_BASE + "assets/avatar.jpg"} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>艾倫報報</div>
          <div style={{ color: "#65676b", fontSize: 12.5 }}>{p.scheduledAt ? fmtLocal(p.scheduledAt) : "立即"} · 🌐</div>
        </div>
      </div>
      <div style={{ padding: "0 14px 12px", fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text || <span style={{ color: "#8a8d91" }}>（尚無內文）</span>}</div>
      {isPhoto ? (
        <img src={p.imageUrl} alt="" style={{ display: "block", width: "100%", background: "#f0f2f5" }} onError={(e) => { e.currentTarget.style.opacity = 0.25; }} />
      ) : p.fb.link ? (
        <div style={{ background: "#f0f2f5", borderTop: "1px solid #dadde1", padding: "10px 14px" }}>
          <div style={{ color: "#65676b", fontSize: 12, textTransform: "uppercase" }}>{(() => { try { return new URL(p.fb.link).hostname; } catch (e) { return ""; } })()}</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{p.title || "連結預覽由 Facebook 抓取頁面 OG 標籤產生"}</div>
        </div>
      ) : null}
    </div>
  );
}

function SocialPanel() {
  const [list, setList] = useState(null);
  const [meta, setMeta] = useState(null);
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState("review");
  const [when, setWhen] = useState(""); // datetime-local
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const who = (auth && auth.currentUser && auth.currentUser.email) || "";
  const isOwnerUser = who === OWNER_EMAIL;

  const load = useCallback(async () => {
    setErr("");
    try {
      const snap = await db.collection(SOC_COLL).get();
      const rows = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      rows.sort((a, b) => String(b.scheduledAt || b.createdAt || "").localeCompare(String(a.scheduledAt || a.createdAt || "")));
      setList(rows);
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setList([]); }
    try { const m = await db.doc(SOC_META_DOC).get(); setMeta(m.exists ? m.data() : {}); } catch (ex) { setMeta({}); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 3600); };
  const open = (r) => {
    setSel({
      id: r.id, title: r.title || "", imageUrl: r.imageUrl || "", scheduledAt: r.scheduledAt || "",
      queueState: r.queueState || "draft", note: r.note || "", source: r.source || { type: "manual" },
      fb: Object.assign({ enabled: true, caption: "", link: "", state: "draft", attempts: 0 }, r.fb || {}),
      ig: r.ig || null, th: r.th || null, // 內容中控台建立的 IG／Threads 頻道，核准與撤回時一併處理
    });
    setWhen(isoToLocalInput(r.scheduledAt));
    setErr(""); setToast("");
  };
  const setF = (k, v) => setSel((s) => ({ ...s, [k]: v }));
  const setFb = (k, v) => setSel((s) => ({ ...s, fb: { ...s.fb, [k]: v } }));

  const st = sel ? socFbState(sel) : "draft";
  const editable = sel && isOwnerUser && (sel.__new || SOC_EDITABLE.includes(st) || sel.queueState === "rejected");

  const contentPayload = (s) => ({
    title: s.title || "", imageUrl: (s.imageUrl || "").trim(), note: s.note || "",
    "fb.enabled": !!s.fb.enabled, "fb.caption": s.fb.caption || "", "fb.link": (s.fb.link || "").trim(),
    updatedAt: new Date().toISOString(),
  });

  /* 儲存；成功回傳文件 id（新貼文為剛建立的 id），失敗回傳 false */
  const saveDraft = async (silent) => {
    setBusy(true); setErr("");
    let id = sel.id;
    try {
      if (sel.__new) {
        const now = new Date().toISOString();
        const ref = await db.collection(SOC_COLL).add({
          title: sel.title || "", imageUrl: (sel.imageUrl || "").trim(), note: sel.note || "",
          scheduledAt: "", queueState: "draft", source: sel.source || { type: "manual" },
          fb: { enabled: !!sel.fb.enabled, caption: sel.fb.caption || "", link: (sel.fb.link || "").trim(), state: "draft", attempts: 0, error: null, postId: null },
          ig: { enabled: false, state: "skipped" }, lock: { by: null, at: null }, createdAt: now, updatedAt: now,
        });
        id = ref.id;
        setSel((s) => ({ ...s, __new: false, id }));
      } else {
        await db.collection(SOC_COLL).doc(sel.id).update(contentPayload(sel));
      }
      await load();
      if (!silent) flash("已儲存草稿 ✓");
      setBusy(false); return id;
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); setBusy(false); return false; }
  };

  const validate = () => {
    if (!sel.fb.enabled) return "第一階段只支援 Facebook，請勾選「發布到 Facebook 粉專」。";
    if (!(sel.fb.caption || "").trim() && !(sel.imageUrl || "").trim()) return "請至少填寫貼文內文或圖片。";
    if (sel.imageUrl && !/^https:\/\//i.test(sel.imageUrl.trim())) return "圖片需為 https:// 開頭的公開網址（Meta 會直接下載）。";
    if (sel.fb.link && !/^https?:\/\//i.test(sel.fb.link.trim())) return "連結需為完整網址（https://…）。";
    return "";
  };

  /* 核准：寫入時間、狀態，queueState=pending 交給排程器 */
  const approve = async (iso, msg) => {
    const v = validate(); if (v) { setErr(v); return; }
    const id = await saveDraft(true);
    if (!id) return;
    setBusy(true);
    try {
      const upd = {
        scheduledAt: iso, queueState: "pending", "fb.state": "approved", "fb.attempts": 0, "fb.error": null,
        "review.approvedAt": new Date().toISOString(), "review.by": who, lock: { by: null, at: null },
        updatedAt: new Date().toISOString(),
      };
      for (const ch of ["ig", "th"]) if (sel[ch] && sel[ch].enabled && sel[ch].state !== "published") {
        Object.assign(upd, { [ch + ".state"]: "approved", [ch + ".attempts"]: 0, [ch + ".error"]: null, [ch + ".containerId"]: null });
      }
      await db.collection(SOC_COLL).doc(id).update(upd);
      setSel((s) => ({ ...s, scheduledAt: iso, queueState: "pending", fb: { ...s.fb, state: "approved", attempts: 0, error: null } }));
      await load(); flash(msg);
    } catch (ex) { setErr("核准失敗：" + errText(ex)); }
    setBusy(false);
  };
  const approveScheduled = () => {
    const iso = localInputToIso(when);
    if (!iso) { setErr("請先選擇發文時間。"); return; }
    if (Date.parse(iso) < Date.now() - 60000) { setErr("發文時間已過；若要馬上發，請按「立即發布」。"); return; }
    const lead = (Date.parse(iso) - Date.now()) / 60000;
    approve(iso, lead >= SOC_NATIVE_MIN_MIN
      ? `已核准 ✓ 下一輪排程器（約 10 分鐘內）會交給 Meta 於 ${fmtLocal(iso)} 準時發出`
      : `已核准 ✓ 不足 ${SOC_NATIVE_MIN_MIN} 分鐘，將由排程器於下一輪直接發出（約 10 分鐘內，尖峰可能延遲）`);
  };
  const approveNow = () => {
    const v = validate(); if (v) { setErr(v); return; } // 先驗證，避免確認後才報錯
    if (!window.confirm("確認立即發布到 Facebook 粉專？排程器下一輪（約 10 分鐘內）送出，送出後即公開。")) return;
    approve(new Date().toISOString(), "已核准立即發布 ✓ 排程器下一輪送出");
  };

  /* 撤回尚未送出的核准：用 transaction 確認排程器沒有正在處理 */
  const withdraw = async () => {
    setBusy(true); setErr("");
    const ref = db.collection(SOC_COLL).doc(sel.id);
    try {
      const ok = await db.runTransaction(async (tx) => {
        const d = (await tx.get(ref)).data() || {};
        const lockAt = Date.parse((d.lock && d.lock.at) || "");
        if ((d.fb && d.fb.state) !== "approved" || (d.lock && d.lock.by && isFinite(lockAt) && Date.now() - lockAt < 15 * 60000)) return false;
        const upd = { queueState: "draft", "fb.state": "draft", updatedAt: new Date().toISOString() };
        for (const ch of ["ig", "th"]) if (d[ch] && d[ch].state === "approved") upd[ch + ".state"] = "draft";
        tx.update(ref, upd);
        return true;
      });
      if (ok) { setSel((s) => ({ ...s, queueState: "draft", fb: { ...s.fb, state: "draft" } })); flash("已撤回核准，回到待審核"); }
      else setErr("排程器正在處理或已送出，無法撤回；請重新整理查看最新狀態（若已交給 Meta 排程，可改按「取消 Meta 排程」）。");
      await load();
    } catch (ex) { setErr("撤回失敗：" + errText(ex)); }
    setBusy(false);
  };
  /* 已交給 Meta 原生排程：請排程器刪除 Meta 端貼文 */
  const cancelNative = async () => {
    if (!window.confirm("取消 Meta 端排程？排程器下一輪會刪除 Facebook 上的排程貼文，並退回待審核。")) return;
    setBusy(true); setErr("");
    try {
      const upd = { queueState: "pending", "fb.state": "cancel_requested", updatedAt: new Date().toISOString() };
      // 尚未發出的 IG／Threads 一併取消（排程器退回草稿）
      for (const ch of ["ig", "th"]) if (sel[ch] && ["approved", "processing"].includes(sel[ch].state)) upd[ch + ".state"] = "cancel_requested";
      await db.collection(SOC_COLL).doc(sel.id).update(upd);
      setSel((s) => ({ ...s, queueState: "pending", fb: { ...s.fb, state: "cancel_requested" } }));
      await load(); flash("已送出取消請求，約 10 分鐘內完成");
    } catch (ex) { setErr("取消失敗：" + errText(ex)); }
    setBusy(false);
  };
  const reject = async () => {
    const note = window.prompt("退回原因（選填，供日後參考）：", sel.note || "");
    if (note === null) return;
    setBusy(true);
    try {
      await db.collection(SOC_COLL).doc(sel.id).update({ queueState: "rejected", "fb.state": "draft", note, updatedAt: new Date().toISOString() });
      await load(); setSel(null); flash("已退回");
    } catch (ex) { setErr("退回失敗：" + errText(ex)); }
    setBusy(false);
  };
  const remove = async () => {
    if (sel.__new) { setSel(null); return; }
    if (!window.confirm("確定刪除這則社群貼文草稿？")) return;
    setBusy(true);
    try { await db.collection(SOC_COLL).doc(sel.id).delete(); setSel(null); await load(); }
    catch (ex) { setErr("刪除失敗：" + errText(ex)); }
    setBusy(false);
  };

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
  const ownerBanner = !isOwnerUser ? (
    <div style={{ ...box, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13, lineHeight: 1.7 }}>
      目前登入為「{who || "未登入"}」，不是管理者帳號（{OWNER_EMAIL}）。社群發文佇列僅限管理者讀寫，請登出後改用管理者帳號登入。
    </div>
  ) : null;

  /* 排程器健康狀態 */
  const lastRun = meta && meta.lastRunAt ? Date.parse(meta.lastRunAt) : NaN;
  const stale = isFinite(lastRun) && Date.now() - lastRun > 45 * 60000;
  const health = (
    <div style={{ ...box, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }}>
      <span style={{ color: "var(--text-3)" }}>排程器</span>
      {meta == null ? <span style={{ color: "var(--text-4)" }}>讀取中…</span>
        : !isFinite(lastRun) ? <span style={{ color: "var(--illumination)" }}>尚未執行過（請依 docs/SOCIAL_SOP.md 設定 Secrets）</span>
        : <span style={{ color: stale ? "var(--illumination)" : "var(--success)", fontFamily: "var(--font-mono)" }}>{stale ? "⚠ " : "● "}最後執行 {fmtLocal(meta.lastRunAt)}{stale ? "（超過 45 分鐘未執行）" : ""}</span>}
      {meta && isFinite(lastRun) ? (
        <span style={{ color: meta.tokenOk ? "var(--success)" : "var(--danger)" }}>
          {meta.tokenOk ? "● Meta Token 正常" + (meta.pageName ? "（" + meta.pageName + "）" : "") : "✕ Meta Token 異常：" + (meta.tokenError || "")}
        </span>
      ) : null}
    </div>
  );

  /* --- 列表 --- */
  if (!sel) {
    const f = SOC_FILTERS.find((x) => x.id === filter) || SOC_FILTERS[0];
    const rows = (list || []).filter(f.test);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>{PILOTONE.name} · 發文審核</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{SOC_COLL} · 審核後自動發到 Facebook 粉專（IG／Threads 由中控台建立）</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ad-btn ghost" onClick={load}>重新整理</button>
            <button className="ad-btn primary" disabled={!isOwnerUser} onClick={() => { setSel(socBlank()); setWhen(""); setErr(""); }}>＋ 新增貼文</button>
          </div>
        </div>
        {ownerBanner}
        {health}
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {SOC_FILTERS.map((x) => (
            <button key={x.id} className="ad-btn ghost" onClick={() => setFilter(x.id)}
              style={{ padding: "6px 12px", fontSize: 12.5,
                borderColor: filter === x.id ? "var(--border-aurora)" : "var(--border)",
                background: filter === x.id ? "var(--brand-soft)" : "transparent",
                color: filter === x.id ? "var(--text-1)" : "var(--text-4)" }}>
              {x.label}（{(list || []).filter(x.test).length}）
            </button>
          ))}
        </div>
        {list == null ? <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
          : rows.length === 0 ? <div style={{ color: "var(--text-3)", padding: 20, fontSize: 13.5, lineHeight: 1.8 }}>這個分類沒有貼文。可按「新增貼文」，或在「電子報 → Facebook / IG 貼文」分頁把某一期送進審核佇列。</div>
          : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((r) => (
                <button key={r.id} onClick={() => open(r)} style={{ textAlign: "left", cursor: "pointer", background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14, display: "flex", gap: 14, alignItems: "center" }}>
                  {r.imageUrl ? <img src={r.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flex: "none", background: "var(--night-700)" }} /> : <div style={{ width: 64, height: 64, borderRadius: 8, flex: "none", background: "var(--night-700)", display: "grid", placeItems: "center", color: "var(--text-4)", fontSize: 11 }}>無圖</div>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                      <SocBadge r={r} />
                      {r.scheduledAt ? <span style={{ color: "var(--text-3)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>⏰ {fmtLocal(r.scheduledAt)}</span> : null}
                      {r.source && r.source.type === "issue" ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ 來自電子報</span> : null}
                      {r.fb && r.fb.error ? <span style={{ color: "var(--danger)", fontSize: 11.5 }}>⚠ {String(r.fb.error).slice(0, 40)}</span> : null}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 15 }}>{r.title || "（未命名）"}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(r.fb && r.fb.caption) || ""}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
    );
  }

  /* --- 編輯／審核 --- */
  const capLen = (sel.fb.caption || "").length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="ad-btn ghost" onClick={() => { setSel(null); setErr(""); load(); }}>← 返回列表</button>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: 0 }}>{sel.__new ? "新增社群貼文" : "審核社群貼文"}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}><SocBadge r={sel} />
              {sel.fb.postId ? <span style={{ color: "var(--text-4)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>post {sel.fb.postId}</span> : null}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {editable ? <button className="ad-btn" onClick={() => saveDraft()} disabled={busy}>{busy ? "處理中…" : "儲存草稿"}</button> : null}
          {editable && !sel.__new ? <button className="ad-btn ghost" onClick={reject} disabled={busy}>退回</button> : null}
          {(editable || sel.__new) && st !== "published" ? <button className="ad-btn danger" onClick={remove} disabled={busy}>{sel.__new ? "取消" : "刪除"}</button> : null}
        </div>
      </div>
      {ownerBanner}
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
      {sel.fb.error ? <div style={{ ...box, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>上次錯誤（第 {sel.fb.attempts || 0} 次）：{sel.fb.error}</div> : null}
      {sel.fb.permalink ? <div style={{ ...box, fontSize: 13 }}><a href={sel.fb.permalink} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>在 Facebook 查看貼文 ↗</a></div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
        <div>
          <div style={box}>
            <label className="ad-lbl">內部標題（只在後台顯示）</label>
            <input className="ad-in" value={sel.title} disabled={!editable} onChange={(e) => setF("title", e.target.value)} placeholder="例：週報第 42 期 · AI 代理的記憶" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "var(--text-2)", fontSize: 13 }}>
              <input type="checkbox" checked={!!sel.fb.enabled} disabled={!editable} onChange={(e) => setFb("enabled", e.target.checked)} /> 發布到 Facebook 粉專
            </label>
            <div style={{ marginTop: 12 }}>
              <label className="ad-lbl">FB 貼文內文（{capLen} 字）</label>
              <textarea className="ad-in" style={{ minHeight: 170, fontFamily: "var(--font-body)" }} value={sel.fb.caption} disabled={!editable} onChange={(e) => setFb("caption", e.target.value)} placeholder="貼文內文、hashtag…" />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="ad-lbl">連結（選填；有圖片時會接在內文最後）</label>
              <input className="ad-in" value={sel.fb.link} disabled={!editable} onChange={(e) => setFb("link", e.target.value)} placeholder="https://allenchen1113official.github.io/AllenI3Aurora/?issue=42" />
            </div>
          </div>
          <div style={box}>
            <label className="ad-lbl">圖片網址（https 公開網址；留空則發純文字／連結貼文）</label>
            <input className="ad-in" value={sel.imageUrl} disabled={!editable} onChange={(e) => setF("imageUrl", e.target.value)} placeholder={SOC_SITE_BASE + "assets/…"} />
            {editable ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {SOC_IMAGE_PICKS.map((p) => (
                  <button key={p.path} className="ad-btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setF("imageUrl", SOC_SITE_BASE + p.path)}>{p.label}</button>
                ))}
              </div>
            ) : null}
            <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 8, lineHeight: 1.7 }}>
              站內圖卡為固定檔名、每日覆寫。交給 Meta 排程時圖片會在「排程當下」上傳定格；立即發布則抓送出當下的版本。
            </div>
          </div>
          <div style={{ ...box, opacity: 0.55 }}>
            <div style={{ fontWeight: 800, color: "var(--text-2)", fontFamily: "var(--font-display)", fontSize: 14 }}>Instagram（第二階段開放）</div>
            <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 4 }}>IG 需兩段式容器發布且無原生排程，下一階段加入。</div>
          </div>
        </div>

        <div>
          <div style={{ ...box, background: "var(--night-850)" }}>
            <div className="ad-lbl" style={{ marginBottom: 10 }}>Facebook 預覽</div>
            <SocFbPreview p={sel} />
          </div>

          {isOwnerUser && (editable || sel.__new) ? (
            <div style={box}>
              <div style={{ fontWeight: 800, color: "var(--text-1)", fontFamily: "var(--font-display)", marginBottom: 10 }}>核准並排程</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <label className="ad-lbl">發文時間（你的當地時區）</label>
                  <input className="ad-in" type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setErr(""); }} style={{ width: "auto" }} />
                </div>
                <button className="ad-btn primary" onClick={approveScheduled} disabled={busy}>✓ 核准排程</button>
                <button className="ad-btn" onClick={approveNow} disabled={busy}>立即發布</button>
              </div>
              <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 10, lineHeight: 1.7 }}>
                {SOC_NATIVE_MIN_MIN} 分鐘以後、29 天以內的時間會交給 Meta 原生排程，準時到分鐘；更近的時間由排程器下一輪直接發出（每 10 分鐘一輪，尖峰可能延遲）。超過 29 天者會先保留，進入範圍後再交給 Meta。
              </div>
            </div>
          ) : null}

          {isOwnerUser && st === "approved" ? (
            <div style={box}>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 10 }}>已核准，等待排程器送出（預定 {fmtLocal(sel.scheduledAt)}）。</div>
              <button className="ad-btn ghost" onClick={withdraw} disabled={busy}>撤回核准（回到待審核）</button>
            </div>
          ) : null}
          {isOwnerUser && st === "scheduled" ? (
            <div style={box}>
              <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 10 }}>已交給 Meta，將於 {fmtLocal(sel.scheduledAt)} 發出。要修改內容請先取消排程。</div>
              <button className="ad-btn danger" onClick={cancelNative} disabled={busy}>取消 Meta 排程</button>
            </div>
          ) : null}
          {st === "publishing" || st === "cancel_requested" ? (
            <div style={{ ...box, color: "var(--text-3)", fontSize: 13 }}>排程器處理中，請稍後按「返回列表」查看最新結果。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- 主控台 ---------- */
const HUB_NAV = "__hub"; // 內容中控台（admin/content-hub.jsx）
const MON_NAV = "__monitor"; // 排程監控（admin/schedule-monitor.jsx）
const VLOG_NAV = "__vlog"; // Vlog 影片系列（admin/vlog.jsx）
function Console({ user }) {
  const [active, setActive] = useState(() => (location.hash === "#monitor" ? MON_NAV : location.hash === "#vlog" ? VLOG_NAV : NL_NAV));
  const sec = SECTIONS.find((s) => s.id === active);
  const HubPanel = window.ContentHubPanel; // admin/content-hub.jsx 於本檔之後載入
  const MonPanel = window.ScheduleMonitorPanel; // admin/schedule-monitor.jsx 於本檔之後載入
  const NAV = [{ id: NL_NAV, label: "電子報" }, { id: HUB_NAV, label: "PilotOne 中控台" }, { id: SOC_NAV, label: "PilotOne 審核" }, { id: PC_NAV, label: "Podcast 節目" }, { id: VLOG_NAV, label: "Vlog 影片系列" }, { id: SUB_NAV, label: "訂閱用戶" }, { id: CAMP_NAV, label: "寄送紀錄" }, { id: MON_NAV, label: "排程監控" }, ...SECTIONS, { id: WEALTH_NAV, label: "財富自由指數" }];
  return (
    <div>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--night-850)", position: "sticky", top: 0, zIndex: 20 }}>
        <div className="ad-top" style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
          <span style={{ flex: "none", display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", color: "var(--text-on-accent)", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 12 }}>AI³A</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--text-1)", fontSize: 16 }}>後台管理</div>
            <div style={{ color: "var(--text-3)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
          </div>
          <a className="ad-btn ghost" href="/AllenI3Aurora/" target="_blank" rel="noopener">前往網站 ↗</a>
          <button className="ad-btn" onClick={() => auth.signOut()}>登出</button>
        </div>
      </header>
      <div className="ad-shell" style={{ ...wrap, display: "flex", gap: 22, padding: "22px 20px", alignItems: "flex-start" }}>
        <nav className="ad-nav" style={{ width: 168, flex: "none", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 78 }}>
          {NAV.map((s) => {
            const on = s.id === active;
            return (
              <button key={s.id} onClick={() => { setActive(s.id); try { history.replaceState(null, "", s.id === MON_NAV ? "#monitor" : s.id === VLOG_NAV ? "#vlog" : location.pathname); } catch {} }}
                style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 14, fontFamily: "var(--font-display)", fontWeight: 700,
                  border: "1px solid " + (on ? "var(--border-aurora)" : "transparent"), background: on ? "var(--brand-soft)" : "transparent", color: on ? "var(--text-1)" : "var(--text-3)" }}>
                {s.label}
              </button>
            );
          })}
          <a href={PILOTONE.url} target="_blank" rel="noopener" title="以 PilotOne 產品介面開啟社群發文中控"
            style={{ marginTop: 10, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", textDecoration: "none", display: "block" }}>
            <PilotOneLogo size={22} dense />
            <div style={{ color: "var(--text-4)", fontSize: 10.5, marginTop: 4 }}>獨立入口 ↗</div>
          </a>
        </nav>
        <main style={{ flex: 1, minWidth: 0 }}>
          {active === NL_NAV ? <NewsletterPanel />
            : active === HUB_NAV ? (HubPanel ? <HubPanel /> : <div style={{ color: "var(--text-3)" }}>載入中…</div>)
            : active === SOC_NAV ? <SocialPanel />
            : active === PC_NAV ? <PodcastPanel />
            : active === VLOG_NAV ? (window.VlogPanel ? <window.VlogPanel /> : <div style={{ color: "var(--text-3)" }}>載入中…</div>)
            : active === SUB_NAV ? <SubscribersPanel />
            : active === CAMP_NAV ? <CampaignsPanel />
            : active === WEALTH_NAV ? <WealthPanel />
            : active === MON_NAV ? (MonPanel ? <MonPanel /> : <div style={{ color: "var(--text-3)" }}>載入中…</div>)
            : <SectionEditor key={sec.id} sec={sec} />}
        </main>
      </div>
    </div>
  );
}

/* ---------- PilotOne 產品殼（admin/pilotone/index.html） ----------
   同一份後台元件，只露出與社群發文相關的兩個面板，並以 PilotOne 品牌包裝。 */
const P1_VIEWS = [
  { id: HUB_NAV, label: "中控台", hint: "儀表板 · 日曆 · 建立 · 內容庫 · 平台" },
  { id: SOC_NAV, label: "發文審核", hint: "核准／排程／撤回" },
];
function PilotOneConsole({ user }) {
  const initial = location.hash === "#review" ? SOC_NAV : HUB_NAV;
  const [active, setActive] = useState(initial);
  const HubPanel = window.ContentHubPanel;
  const go = (id) => { setActive(id); try { history.replaceState(null, "", id === SOC_NAV ? "#review" : "#hub"); } catch {} };
  useEffect(() => { document.title = (active === SOC_NAV ? "發文審核" : "中控台") + " · PilotOne — 艾倫報報"; }, [active]);
  return (
    <div>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--night-850)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 14, padding: "12px 20px" }}>
          <PilotOneLogo size={38} />
          <div style={{ flex: 1 }} />
          <div style={{ color: "var(--text-3)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{user.email}</div>
          <a className="ad-btn ghost" href="/AllenI3Aurora/admin/" title="艾倫報報 · 後台管理（電子報、Podcast、訂閱…）">後台管理</a>
          <a className="ad-btn ghost" href="/AllenI3Aurora/" target="_blank" rel="noopener">前往網站 ↗</a>
          <button className="ad-btn" onClick={() => auth.signOut()}>登出</button>
        </div>
      </header>
      <div style={{ ...wrap, display: "flex", gap: 22, padding: "22px 20px", alignItems: "flex-start" }}>
        <nav className="p1-nav" style={{ width: 176, flex: "none", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 82 }}>
          {P1_VIEWS.map((v) => {
            const on = v.id === active;
            return (
              <button key={v.id} data-on={on ? "1" : "0"} onClick={() => go(v.id)}
                style={{ textAlign: "left", cursor: "pointer", padding: "10px 12px 10px 16px", borderRadius: "var(--radius-md)", fontFamily: "var(--font-display)",
                  border: "1px solid " + (on ? "var(--border-aurora)" : "transparent"), background: on ? "var(--brand-soft)" : "transparent" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: on ? "var(--text-1)" : "var(--text-3)" }}>{v.label}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2, fontFamily: "var(--font-body)" }}>{v.hint}</div>
              </button>
            );
          })}
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--aurora-gradient-soft)", border: "1px solid var(--border-subtle)", color: "var(--text-3)", fontSize: 11, lineHeight: 1.6 }}>
            <div style={{ color: "var(--text-2)", fontWeight: 700, fontFamily: "var(--font-display)" }}>PilotOne 是什麼</div>
            一份主稿 → FB／IG／Threads 各自微調 → 審核排程 → 排程器自動發布並回收成效。
          </div>
          <div style={{ marginTop: 10, color: "var(--text-4)", fontSize: 10.5, lineHeight: 1.6 }}>{PILOTONE.byline}</div>
        </nav>
        <main style={{ flex: 1, minWidth: 0 }}>
          {active === SOC_NAV ? <SocialPanel />
            : (HubPanel ? <HubPanel /> : <div style={{ color: "var(--text-3)" }}>載入中…</div>)}
        </main>
      </div>
    </div>
  );
}

/* ---------- 排程監控獨立入口（admin/monitor/index.html） ----------
   同一份登入與 Firestore，只露出「排程監控」面板，手機上全寬顯示。 */
function MonitorConsole({ user }) {
  const MonPanel = window.ScheduleMonitorPanel;
  useEffect(() => { document.title = "排程監控 · 艾倫報報後台"; }, []);
  return (
    <div>
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--night-850)", position: "sticky", top: 0, zIndex: 20 }}>
        <div className="ad-top" style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
          <span style={{ flex: "none", display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", color: "var(--text-on-accent)", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 12 }}>AI³A</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--text-1)", fontSize: 16 }}>排程監控</div>
            <div style={{ color: "var(--text-3)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
          </div>
          <a className="ad-btn ghost" href="/AllenI3Aurora/admin/">後台管理</a>
          <button className="ad-btn" onClick={() => auth.signOut()}>登出</button>
        </div>
      </header>
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 16px 40px" }}>
        {MonPanel ? <MonPanel /> : <div style={{ color: "var(--text-3)" }}>載入中…</div>}
      </main>
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
  return IS_MONITOR ? <MonitorConsole user={user} /> : IS_PILOTONE ? <PilotOneConsole user={user} /> : <Console user={user} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
