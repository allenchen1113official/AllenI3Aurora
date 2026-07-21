/* ============================================================
   艾倫報報 · Aurora UI kit — shared shell, icons & mock data
   Loaded before the screen files. Exposes globals on window.
   ============================================================ */
const NS = window.AllenAuroraDesignSystem_e6fd5f;
const { Avatar, Badge, IconButton, Tag, Button } = NS;

/* ---------- Icons (stroke, 1.9, rounded — the brand icon language) ---------- */
const mkIcon = (paths, opts = {}) => (props) => (
  <svg width={props.size || 20} height={props.size || 20} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={opts.w || 1.9} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: "block", ...props.style }}>{paths}</svg>
);
const Icons = {
  home: mkIcon(<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>),
  paper: mkIcon(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>),
  rings: mkIcon(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/></>),
  mail: mkIcon(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>),
  archive: mkIcon(<><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11h14V8"/><path d="M10 12h4"/></>),
  search: mkIcon(<><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>),
  bell: mkIcon(<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>),
  settings: mkIcon(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.2A1.6 1.6 0 0 0 15 4.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-1.1 2.7V9a1.6 1.6 0 0 0 1.1 2.7z"/></>),
  chart: mkIcon(<><path d="M3 3v18h18"/><path d="m7 14 3.5-4 3 3L21 6"/></>),
  wallet: mkIcon(<><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 11h-4a2 2 0 0 0 0 4h4z"/></>),
  book: mkIcon(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></>),
  headphones: mkIcon(<><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="14" width="4.5" height="7" rx="1.6"/><rect x="17" y="14" width="4.5" height="7" rx="1.6"/></>),
  link: mkIcon(<><path d="M9 15 15 9"/><path d="M11 6.5 13 4.5a4 4 0 0 1 6 6l-2 2"/><path d="M13 17.5 11 19.5a4 4 0 0 1-6-6l2-2"/></>),
  bulb: mkIcon(<><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></>),
  bookmark: mkIcon(<><path d="M6 3h12v18l-6-4-6 4z"/></>),
  arrow: mkIcon(<path d="M5 12h14M13 6l6 6-6 6"/>, { w: 2.2 }),
  play: mkIcon(<><path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/></>),
  ext: mkIcon(<><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/></>),
  cal: mkIcon(<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>),
  check: mkIcon(<path d="M20 6 9 17l-5-5"/>, { w: 2.4 }),
  briefcase: mkIcon(<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>),
  compass: mkIcon(<><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor" stroke="none"/></>),
  sparkle: mkIcon(<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></>),
  menu: mkIcon(<path d="M4 6h16M4 12h16M4 18h16"/>, { w: 2.2 }),
};
window.Icons = Icons;

/* ---------- Mock data ---------- */
window.KIT = {
  brand: { zh: "艾倫報報", en: "Allen I³ Aurora", tagline: "洞察世界．累積智慧．點亮未來。" },
  nav: [
    { id: "dashboard", label: "儀表板", en: "Dashboard", icon: "home" },
    { id: "issue", label: "本期報報", en: "This Issue", icon: "paper" },
    { id: "archive", label: "歷期彙整", en: "Archive", icon: "archive" },
    { id: "timeline", label: "個人年輪", en: "Annuli", icon: "rings" },
    { id: "subscribe", label: "訂閱管理", en: "Subscribe", icon: "mail" },
  ],
  stats: [
    { label: "加權指數 TAIEX", value: "23,588", unit: "pt", delta: "+0.75%", tone: "insight", mode: "finance", data: [6.2,6.6,6.3,7,6.8,7.2,7.1,7.5,7.8] },
    { label: "本月結餘", value: "42,180", unit: "TWD", delta: "+8.0%", tone: "intelligence", mode: "semantic", data: [4,4.2,4.1,4.5,4.4,4.8,5,5.2] },
    { label: "深度工作", value: "26.5", unit: "hr", delta: "+12%", tone: "illumination", mode: "semantic", data: [3,3.5,3.2,4,3.8,4.4,4.6,5] },
    { label: "待讀清單", value: "12", unit: "篇", delta: "-3", tone: "insight", mode: "semantic", data: [8,7,9,6,5,6,5,4] },
  ],
  focus: [
    { tag: "理財", tone: "insight", title: "外資投信「雙連買」新增 3 檔", meta: "半導體 · 航運 · 今日 09:41", icon: "chart" },
    { tag: "工作", tone: "intelligence", title: "Q3 產品藍圖評審會議前置準備", meta: "明日 14:00 · 附 3 份文件", icon: "briefcase" },
    { tag: "研究", tone: "illumination", title: "LLM Agent 記憶架構 — 讀書筆記整理", meta: "進度 60% · 待續 2 節", icon: "compass" },
    { tag: "興趣", tone: "insight", title: "薩克斯風 · 週末錄音清單", meta: "3 首待練 · 上次 06/28", icon: "sparkle" },
  ],
  reading: [
    { title: "原子習慣：微小改變的複利效應", src: "重讀筆記", pct: 82 },
    { title: "The Almanack of Naval Ravikant", src: "Kindle", pct: 45 },
    { title: "台股籌碼面實戰：三大法人解讀", src: "PDF", pct: 12 },
  ],
  podcasts: [
    { title: "股癌 Gooaye — EP.整理盤心法", meta: "1h 12m · 昨天", tone: "insight" },
    { title: "曼報 Manny's Newsletter Radio", meta: "38m · 2 天前", tone: "intelligence" },
    { title: "Lex Fridman — Memory & Agents", meta: "2h 04m · 本週", tone: "illumination" },
  ],
  links: [
    { label: "Showmethemoney 看盤", icon: "chart" },
    { label: "TradingView", icon: "chart" },
    { label: "Notion 研究庫", icon: "book" },
    { label: "GitHub", icon: "link" },
    { label: "Medium 草稿", icon: "paper" },
    { label: "Google Scholar", icon: "compass" },
  ],
  issues: [
    { no: 26, kind: "週報", date: "2026.06.29", tone: "insight", title: "AI 代理的記憶戰爭，與台股的靜默輪動", items: 8, cover: "../../assets/rabbit-reading.jpeg" },
    { no: 25, kind: "週報", date: "2026.06.22", tone: "insight", title: "當利率轉彎，現金流的重新定價", items: 7, cover: "../../assets/rabbit-proposal.jpeg" },
    { no: "06", kind: "月報", date: "2026.06.01", tone: "intelligence", title: "六月總結：三個決定，一次轉身", items: 14, cover: "../../assets/rabbit-mountain.jpeg" },
    { no: 24, kind: "週報", date: "2026.06.15", tone: "insight", title: "被高估的專注，與被低估的休息", items: 6, cover: "../../assets/rabbit-bike.jpeg" },
    { no: 23, kind: "週報", date: "2026.06.08", tone: "insight", title: "把研究做成產品：從筆記到電子報", items: 9, cover: "../../assets/rabbit-forest.jpeg" },
    { no: "183", kind: "日報", date: "2026.06.30", tone: "illumination", title: "週一速報：新的一週，三個先看的訊號", items: 3, cover: "../../assets/rabbit-golden.jpeg" },
  ],
  annuli: [
    { year: "1975", tone: "insight", title: "序章 · 出生", body: "一切的起點。" },
    { year: "1998", tone: "intelligence", title: "投入資訊科技", body: "以 ITS 專業踏入職場，開始累積系統思維。" },
    { year: "2011", tone: "illumination", title: "拿起薩克斯風", body: "音樂成為生活的另一種語言與節奏。" },
    { year: "2020", tone: "insight", title: "開始寫作與研究", body: "把每天的觀察，變成可累積的筆記與洞察。" },
    { year: "2024", tone: "intelligence", title: "Showmethemoney 上線", body: "開源台股看盤儀表板，工具服務更多人。" },
    { year: "2026", tone: "illumination", title: "艾倫報報 創刊", body: "洞察世界．累積智慧．點亮未來 — 個人品牌成形。" },
  ],
};

/* ---------- Sidebar ---------- */
function Sidebar({ active, onNav }) {
  const { nav, brand } = window.KIT;
  return (
    <aside style={{ width: "var(--sidebar-w)", flex: "none", background: "var(--night-850)", borderRight: "1px solid var(--border)", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 22, minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 6px" }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: "var(--aurora-gradient)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 13, color: "var(--text-on-accent)", boxShadow: "var(--glow-brand)", letterSpacing: "-.5px" }}>AI³A</span>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--text-1)", fontSize: 16 }}>{brand.zh}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: ".08em" }}>{brand.en}</div>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {nav.map((n) => {
          const on = active === n.id; const I = Icons[n.icon];
          return (
            <button key={n.id} onClick={() => onNav(n.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: "var(--radius-md)", border: "1px solid " + (on ? "var(--border-aurora)" : "transparent"), background: on ? "var(--brand-soft)" : "transparent", color: on ? "var(--text-1)" : "var(--text-3)", cursor: "pointer", textAlign: "left", transition: "all var(--dur)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5 }}>
              <span style={{ color: on ? "var(--brand)" : "var(--text-3)", display: "flex" }}><I size={19} /></span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {on && <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--brand)" }} />}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", padding: 14, borderRadius: "var(--radius-lg)", background: "linear-gradient(160deg, var(--intelligence-soft), transparent)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>本週報報即將發送</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 14, marginBottom: 10 }}>週報 · 第 27 期</div>
        <Button size="sm" block iconRight={<Icons.arrow size={15} />}>立即預覽</Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px" }}>
        <Avatar src="../../assets/avatar.jpg" name="Allen Chen" size="sm" ring />
        <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--text-1)", fontWeight: 700, fontSize: 13 }}>Allen Chen</div>
          <div style={{ color: "var(--text-3)", fontSize: 11 }}>主編 · Editor</div>
        </div>
        <IconButton size="sm" label="設定"><Icons.settings size={17} /></IconButton>
      </div>
    </aside>
  );
}

/* ---------- Topbar ---------- */
function Topbar({ title, sub, onMenu, onNav }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef(null);

  const results = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return [];
    const hits = [];
    const { nav, issues, focus, reading, podcasts, annuli, links } = window.KIT;

    nav.forEach(n => {
      if (n.label.includes(q) || n.en.toLowerCase().includes(ql))
        hits.push({ kind: "頁面", label: n.label, sub: n.en, navId: n.id });
    });
    issues.forEach(iss => {
      if (iss.title.includes(q) || iss.kind.includes(q) || iss.date.includes(q))
        hits.push({ kind: "報報", label: iss.title, sub: `${iss.kind} · ${iss.date}`, navId: "archive" });
    });
    focus.forEach(f => {
      if (f.title.includes(q) || f.tag.includes(q) || f.meta.toLowerCase().includes(ql))
        hits.push({ kind: "焦點", label: f.title, sub: f.meta, navId: "dashboard" });
    });
    reading.forEach(r => {
      if (r.title.toLowerCase().includes(ql) || r.src.includes(q))
        hits.push({ kind: "閱讀", label: r.title, sub: r.src, navId: "dashboard" });
    });
    podcasts.forEach(p => {
      if (p.title.toLowerCase().includes(ql) || p.meta.toLowerCase().includes(ql))
        hits.push({ kind: "Podcast", label: p.title, sub: p.meta, navId: "dashboard" });
    });
    annuli.forEach(a => {
      if (a.title.includes(q) || a.body.includes(q) || a.year.includes(q))
        hits.push({ kind: "年輪", label: a.title, sub: `${a.year} · ${a.body.slice(0, 28)}…`, navId: "timeline" });
    });
    links.forEach(lk => {
      if (lk.label.toLowerCase().includes(ql))
        hits.push({ kind: "連結", label: lk.label, sub: "快速連結", navId: "dashboard" });
    });

    return hits.slice(0, 8);
  }, [q]);

  const commit = (navId) => {
    if (onNav) onNav(navId);
    setQ(""); setOpen(false);
  };

  const handleKey = (e) => {
    if (e.key === "Escape") { setQ(""); setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <header className="kit-topbar" style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px var(--space-8)", borderBottom: "1px solid var(--border)", background: "var(--glass-fill)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)", position: "sticky", top: 0, zIndex: 50 }}>
      <button className="kit-menu" onClick={onMenu} style={{ display: "none", border: "1px solid var(--border)", background: "var(--night-800)", color: "var(--text-2)", borderRadius: 10, padding: 8, cursor: "pointer" }}><Icons.menu size={20} /></button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", margin: 0, lineHeight: 1.1 }}>{title}</h1>
        {sub && <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="kit-search" style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "var(--night-800)", border: "1px solid " + (open ? "var(--brand)" : "var(--border)"), borderRadius: "var(--radius-pill)", fontSize: 13.5, width: 220, transition: "border-color var(--dur)", boxSizing: "border-box" }}>
            <Icons.search size={16} style={{ color: "var(--text-3)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 160)}
              onKeyDown={handleKey}
              placeholder="搜尋動態、個股、筆記…"
              style={{ border: "none", background: "transparent", outline: "none", color: "var(--text-1)", fontSize: 13.5, flex: 1, minWidth: 0, fontFamily: "var(--font-body)" }}
            />
            {q && (
              <button onClick={() => { setQ(""); inputRef.current?.focus(); }} style={{ border: "none", background: "none", color: "var(--text-3)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 14 }}>✕</button>
            )}
          </div>
          {open && q.trim() && results.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 320, background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", zIndex: 200, overflow: "hidden" }}>
              {results.map((r, i) => (
                <button key={i} onMouseDown={() => commit(r.navId)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 10.5, color: "var(--brand)", background: "var(--brand-soft)", borderRadius: 6, padding: "2px 6px", flexShrink: 0, fontWeight: 700, letterSpacing: ".03em" }}>{r.kind}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                    {r.sub && <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{r.sub}</div>}
                  </div>
                  <Icons.arrow size={13} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
          {open && q.trim() && results.length === 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 260, background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", zIndex: 200, padding: "20px 16px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              找不到「{q}」的相關結果
            </div>
          )}
        </div>
        <IconButton variant="surface" label="通知"><Icons.bell size={19} /></IconButton>
      </div>
    </header>
  );
}

window.Sidebar = Sidebar;
window.Topbar = Topbar;
