/* Dashboard (home) — rich, dense control panel */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, StatCard, Sparkline, SectionHeader, Badge, Tag, Button, IconButton, Avatar } = NS;

  function ToneDot({ tone }) {
    const c = { insight: "var(--insight)", intelligence: "var(--intelligence)", illumination: "var(--illumination)" }[tone] || "var(--brand)";
    return <span style={{ width: 8, height: 8, borderRadius: 99, background: c, flex: "none", boxShadow: `0 0 10px ${c}` }} />;
  }

  /* 以台灣台北時區（Asia/Taipei）即時取得今天日期，格式：2026 年 6 月 30 日 · 星期一 */
  function taipeiDateLabel(date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", weekday: "long",
      }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
      return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日 · ${parts.weekday}`;
    } catch {
      return "";
    }
  }

  /* Google 行事曆（帳號 + 台北時區）— 嵌入與跳轉共用。
     直接以官方 embed iframe 呈現，免後端、免 OAuth 設定即可運作；
     只要日曆對外公開分享，訪客即可看到行程。 */
  const CAL_EMAIL = "allenchen1113.official@gmail.com";
  const CAL_EMBED_SRC = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(CAL_EMAIL)}&ctz=Asia%2FTaipei&mode=AGENDA&bgcolor=%23070B14&showTitle=0&showPrint=0&showCalendars=0&showTz=0`;
  // 以 authuser 參數指定帳號；/calendar/u/ 後面須為帳號索引（0、1…）而非 email，
  // 直接放 email 會產生 Google 無法解析的網址而失效。
  const CAL_URL = `https://calendar.google.com/calendar/u/0/r?authuser=${encodeURIComponent(CAL_EMAIL)}`;
  const openCalendar = () => window.open(CAL_URL, "_blank", "noopener,noreferrer");

  /* ── 加權指數 TAIEX 即時／收盤資料 ────────────────────────────────────
     為確保「儀表板首頁永遠是最新」，主要資料來源改為同源的 data/taiex.json：
     由 GitHub Actions 定時任務（.github/workflows/taiex-update.yml）在伺服器端
     向證交所抓取——交易時段抓 MIS 即時、非交易抓 OpenAPI 收盤——寫入此檔。
     前端同源讀取，無 CORS 問題、必定可用，故不再依賴不穩定的公用代理。

     額外強化：交易時段另嘗試由瀏覽器直接抓 MIS 即時（經公用 CORS 代理），
     成功則覆蓋為更即時的值；失敗則沿用 taiex.json 的基準值。
     所有來源皆失敗才退回 kit.jsx 內建值，不影響儀表板其他區塊。
     卡片點擊仍前往 Yahoo ^TWII 完整即時報價頁（見 kit.jsx 之 stats.link）。 */
  const TAIEX_JSON_URL = "/AllenI3Aurora/data/taiex.json";
  const TAIEX_REALTIME_API = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0";
  // 公用 CORS 代理（依序嘗試）；僅用於瀏覽器端轉發未開放 CORS 的即時來源。
  const CORS_PROXIES = [
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  ];
  // 交易時段每 20 秒刷新；非交易時段每 10 分鐘刷新一次。
  const TAIEX_POLL_TRADING = 20 * 1000;
  const TAIEX_POLL_IDLE = 10 * 60 * 1000;

  const taiexNumFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taiexSigned = (n) => (n >= 0 ? "+" : "-") + taiexNumFmt.format(Math.abs(n));
  // 漲跌顯示：「+7.98% · +3,186.45」。以 + / − 開頭讓 StatCard 判定紅漲綠跌。
  function taiexDeltaLabel(pct, pts) {
    return `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(2)}% · ${taiexSigned(pts)}`;
  }

  /* 台北時區當下的 週幾 / 分鐘數 / yyyymmdd。 */
  function taipeiNowParts(now = new Date()) {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});
    return { weekday: p.weekday, minutes: (+p.hour) * 60 + (+p.minute), ymd: `${p.year}${p.month}${p.day}` };
  }

  /* 台股交易時段（台北時區，週一至週五 09:00–13:30）。 */
  function isTaiexTradingHours(now = new Date()) {
    try {
      const t = taipeiNowParts(now);
      if (t.weekday === "Sat" || t.weekday === "Sun") return false;
      return t.minutes >= 9 * 60 && t.minutes <= 13 * 60 + 30;
    } catch { return false; }
  }

  /* 依序嘗試直接抓取與各 CORS 代理，回傳解析後 JSON；全數失敗回傳 null。 */
  async function fetchJSONResilient(url) {
    const attempts = [url, ...CORS_PROXIES.map((f) => f(url))];
    for (const u of attempts) {
      try {
        const res = await fetch(u, { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        return await res.json();
      } catch { /* 換下一個來源 */ }
    }
    return null;
  }

  /* 讀取同源 data/taiex.json（GitHub Actions 定時更新）。此為主要、必定可用的來源。 */
  async function fetchTaiexBaseline() {
    try {
      const res = await fetch(TAIEX_JSON_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || j.value == null || j.delta == null) return null;
      return {
        value: String(j.value),
        delta: String(j.delta),
        data: Array.isArray(j.data) ? j.data : undefined,
        asOf: j.asOf ? String(j.asOf) : "",
        live: !!j.live,
      };
    } catch { return null; }
  }

  /* 解析 MIS 盤中即時資料。null＝非交易中／無有效即時值（改用收盤）。 */
  function parseTaiexRealtime(json, sparkFallback) {
    const a = json && json.msgArray && json.msgArray[0];
    if (!a) return null;
    const cur = parseFloat(String(a.z || "").replace(/,/g, ""));
    const prev = parseFloat(String(a.y || "").replace(/,/g, ""));
    if (!isFinite(cur) || cur <= 0 || !isFinite(prev) || prev <= 0) return null;
    // 僅接受「今日」（台北時區）的即時報價，避免假日／盤前誤用舊值。
    if (a.d && String(a.d) !== taipeiNowParts().ymd) return null;
    const pts = cur - prev;
    const pct = prev ? (pts / prev) * 100 : 0;
    // 走勢末點換成當前指數，讓走勢線收在與大字相同的水準。
    const spark = sparkFallback && sparkFallback.length ? [...sparkFallback.slice(-8), cur] : undefined;
    return {
      value: taiexNumFmt.format(cur),
      delta: taiexDeltaLabel(pct, pts),
      data: spark,
      asOf: a.t ? `${a.t} 盤中` : "盤中",
      live: true,
    };
  }

  /* 自動更新：以 data/taiex.json 為基準（同源、必定可用），交易時段另嘗試
     瀏覽器端 MIS 即時覆蓋為更新的值；依交易／非交易採不同刷新頻率。 */
  function useTaiexLive() {
    const [live, setLive] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      let timer = null;
      const baseRef = { current: null }; // data/taiex.json 基準值（含走勢）

      const refresh = async () => {
        // 1) 先更新同源基準值（伺服器端即時／收盤與走勢）。
        const base = await fetchTaiexBaseline();
        if (base) baseRef.current = base;
        // 2) 交易時段：另嘗試瀏覽器端 MIS 即時，成功則以更即時的值覆蓋。
        if (isTaiexTradingHours()) {
          const spark = baseRef.current && baseRef.current.data;
          const rt = parseTaiexRealtime(await fetchJSONResilient(TAIEX_REALTIME_API), spark);
          if (alive && rt) return setLive(rt);
        }
        if (alive && baseRef.current) setLive(baseRef.current);
      };

      const loop = async () => {
        await refresh();
        if (alive) timer = setTimeout(loop, isTaiexTradingHours() ? TAIEX_POLL_TRADING : TAIEX_POLL_IDLE);
      };
      loop();

      return () => { alive = false; if (timer) clearTimeout(timer); };
    }, []);
    return live;
  }

  const isTaiexStat = (s) => /TAIEX/i.test(s.label || "") || /TWII/i.test(s.link || "");

  /* ── 運動 Garmin 資料 ─────────────────────────────────────────────────
     比照 TAIEX：主要資料來源為同源的 data/exercise.json，由 GitHub Actions
     定時任務（.github/workflows/exercise-update.yml）在伺服器端向 Garmin
     Connect 抓取本週運動時數並寫入此檔。前端同源讀取，無 CORS 問題、必定
     可用；讀取成功即覆蓋該統計卡（標籤、數值、走勢、連結），因此首頁不再
     受 Firestore 舊值（如「深度工作」）影響。讀取失敗才退回既有值。
     卡片點擊前往 Garmin Connect 個人檔案。 */
  const EXERCISE_JSON_URL = "/AllenI3Aurora/data/exercise.json";
  const EXERCISE_LABEL = "運動";
  const EXERCISE_LINK = "https://connect.garmin.com/app/profile/50e697d9-3333-4ec3-a1e1-eebf531414c3";
  const EXERCISE_POLL = 30 * 60 * 1000; // 每 30 分鐘刷新一次

  /* 讀取同源 data/exercise.json（GitHub Actions 定時更新）。 */
  async function fetchExercise() {
    try {
      const res = await fetch(EXERCISE_JSON_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || j.value == null) return null;
      return {
        value: String(j.value),
        unit: j.unit != null ? String(j.unit) : undefined,
        delta: j.delta != null ? String(j.delta) : undefined,
        data: Array.isArray(j.data) && j.data.length ? j.data : undefined,
        asOf: j.asOf ? String(j.asOf) : "",
      };
    } catch { return null; }
  }

  function useExerciseLive() {
    const [live, setLive] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      let timer = null;
      const loop = async () => {
        const d = await fetchExercise();
        if (alive && d) setLive(d);
        if (alive) timer = setTimeout(loop, EXERCISE_POLL);
      };
      loop();
      return () => { alive = false; if (timer) clearTimeout(timer); };
    }, []);
    return live;
  }

  // 以「運動」或 Firestore 舊值「深度工作」或 Garmin 連結辨識該卡。
  const isExerciseStat = (s) => /運動|深度工作/.test(s.label || "") || /garmin/i.test(s.link || "");

  /* ── 財富自由指數 ─────────────────────────────────────────────────────
     比照 TAIEX 的更新處理：以同源的 data/wealth.json 為資料來源，前端讀取後
     覆蓋此卡片（含標題、數值、單位、漲跌、走勢），確保首頁永遠反映最新值，
     不受 Firestore（aurora_stats）既有舊值（如「本月結餘」）影響。
     TAIEX 有證交所公開 API 可由 GitHub Actions 定時抓取；財富自由指數無外部
     來源，故值由 repo 內 data/wealth.json 維護（修改並 commit 即更新首頁）。 */
  const WEALTH_JSON_URL = "/AllenI3Aurora/data/wealth.json";
  // 同時比對新舊標題，即使 Firestore 仍是「本月結餘／每月結餘」也會被正確覆蓋。
  const isWealthStat = (s) => /財富自由|本月結餘|每月結餘/.test(s.label || "");

  /* 讀取同源 data/wealth.json（隨 repo 更新、必定可用）。 */
  async function fetchWealthBaseline() {
    try {
      const res = await fetch(WEALTH_JSON_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || j.value == null) return null;
      return {
        label: j.label != null ? String(j.label) : undefined,
        value: String(j.value),
        unit: j.unit != null ? String(j.unit) : undefined,
        delta: j.delta != null ? String(j.delta) : undefined,
        data: Array.isArray(j.data) ? j.data : undefined,
      };
    } catch { return null; }
  }

  /* 掛載時抓一次；如需更新，改 data/wealth.json 並 commit，重新整理首頁即生效。 */
  function useWealthLive() {
    const [wealth, setWealth] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      fetchWealthBaseline().then((w) => { if (alive && w) setWealth(w); });
      return () => { alive = false; };
    }, []);
    return wealth;
  }

  /* ── 今日關注動態 ─────────────────────────────────────────────────────
     資料來源改為同源的 data/focus.json：由 GitHub Actions 定時任務
     （.github/workflows/focus-update.yml）在伺服器端讀取 Google Drive 今日
     的 heatmap／stockradar／newsletter 資料夾彙整而成。前端同源讀取、無 CORS
     問題；讀到即以其取代「今日關注動態」列表（版型不變，僅換資料來源）。
     讀取失敗或無資料時，退回 kit.jsx／Firestore 既有的 focus 內容。 */
  const FOCUS_JSON_URL = "/AllenI3Aurora/data/focus.json";
  const FOCUS_POLL = 30 * 60 * 1000; // 每 30 分鐘刷新一次
  const FOCUS_TONES = { insight: 1, intelligence: 1, illumination: 1 };

  async function fetchFocus() {
    try {
      const res = await fetch(FOCUS_JSON_URL, { cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      const items = Array.isArray(j && j.items) ? j.items : (Array.isArray(j) ? j : null);
      if (!items || !items.length) return null;
      // 僅保留既有版型需要的欄位，並確保 tone／icon 合法，避免破版或渲染錯誤。
      return items.map((f) => ({
        tag: String(f.tag || ""),
        tone: FOCUS_TONES[f.tone] ? f.tone : "insight",
        title: String(f.title || ""),
        meta: String(f.meta || ""),
        icon: (f.icon && window.Icons && window.Icons[f.icon]) ? f.icon : "sparkle",
      }));
    } catch { return null; }
  }

  function useFocusLive() {
    const [focus, setFocus] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      let timer = null;
      const loop = async () => {
        const d = await fetchFocus();
        if (alive && d) setFocus(d);
        if (alive) timer = setTimeout(loop, FOCUS_POLL);
      };
      loop();
      return () => { alive = false; if (timer) clearTimeout(timer); };
    }, []);
    return focus;
  }

  /* 以官方 iframe 嵌入我的 Google 行事曆（AGENDA 模式、台北時區）。 */
  function CalendarPanel() {
    const I = window.Icons;
    return (
      <div>
        <SectionHeader kicker="行事曆 · CALENDAR" title="我的 Google 行事曆"
          description="即時同步 allenchen1113.official@gmail.com 的行程（台北時區）。"
          action={<Button variant="secondary" size="sm" icon={<I.cal size={15} />} onClick={openCalendar}>開啟完整行事曆</Button>} />
        <Card padding="0" style={{ overflow: "hidden" }}>
          <iframe title="Google 行事曆" src={CAL_EMBED_SRC}
            style={{ width: "100%", height: 520, border: 0, display: "block", colorScheme: "light" }}
            loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </Card>
      </div>
    );
  }

  function Dashboard() {
    const K = window.KIT, I = window.Icons;
    const taiex = useTaiexLive();
    const exercise = useExerciseLive();
    const wealth = useWealthLive();
    const focus = useFocusLive();
    return (
      <div className="kit-page" style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {/* Greeting / hero strip */}
        <Card accent="aurora" glow padding="var(--space-6)" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge tone="illumination" dot>{taipeiDateLabel()}</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-3xl)", color: "var(--text-1)", margin: 0, lineHeight: 1.1 }}>Carpe Diem，{(K.brand && K.brand.owner) || "Allen"} ✨</h2>
            <p style={{ color: "var(--text-2)", margin: "8px 0 0", fontSize: "var(--text-md)" }}>{K.brand.tagline}　今天有 <b style={{ color: "var(--insight)" }}>4</b> 則關注動態、<b style={{ color: "var(--intelligence)" }}>1</b> 場會議與 <b style={{ color: "var(--illumination)" }}>2</b> 集必聽 Podcast。</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="primary" iconRight={<I.arrow size={16} />}>撰寫今日速報</Button>
            <Button variant="secondary" icon={<I.cal size={16} />} onClick={openCalendar}>行事曆</Button>
          </div>
        </Card>

        {/* Stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)" }}>
          {K.stats.map((s, i) => {
            const col = { insight: "var(--insight)", intelligence: "var(--intelligence)", illumination: "var(--illumination)" }[s.tone];
            // 加權指數 TAIEX：若即時資料已載入，覆蓋內建值（收盤指數、漲跌%、走勢）。
            const live = isTaiexStat(s) ? taiex : null;
            // 運動：若 Garmin 資料已載入，覆蓋標籤、數值、走勢與連結（不受 Firestore 舊值影響）。
            const ex = isExerciseStat(s) ? exercise : null;
            // 財富自由指數：Firestore 已由後台計算機更新（label 已是「財富自由指數」）時以其為準；
            // 尚未更新（仍為舊「本月結餘」）時，才以同源 data/wealth.json 覆蓋修正顯示。
            const firestoreFresh = /財富自由/.test(s.label || "");
            const wov = isWealthStat(s) && !firestoreFresh ? wealth : null;
            const label = ex ? EXERCISE_LABEL : (wov && wov.label != null ? wov.label : s.label);
            const link = ex ? EXERCISE_LINK : s.link;
            const unit = ex && ex.unit != null ? ex.unit : (wov && wov.unit != null ? wov.unit : s.unit);
            const value = live ? live.value : (ex ? ex.value : (wov ? wov.value : s.value));
            const delta = live ? live.delta : (ex && ex.delta != null ? ex.delta : (wov && wov.delta != null ? wov.delta : s.delta));
            const data = live && live.data && live.data.length ? live.data
              : (ex && ex.data ? ex.data
              : (wov && wov.data && wov.data.length ? wov.data : s.data));
            const title = isTaiexStat(s)
              ? (live
                  ? (live.live
                      ? `盤中即時指數 ${live.value}（${live.asOf}，來源：證交所 MIS）· 點擊看完整即時報價`
                      : `最新收盤指數 ${live.value}（資料日 ${live.asOf}，來源：證交所 OpenAPI）· 點擊看盤中即時報價`)
                  : "查看線上即時報價（Yahoo 股市）")
              : (ex
                  ? `運動資料來源：Garmin Connect${ex.asOf ? `（${ex.asOf}）` : ""} · 點擊前往個人檔案`
                  : (s.link ? "查看線上即時報價（Yahoo 股市）" : undefined));
            return (
              <StatCard key={i} label={label} value={value} unit={unit} delta={delta} deltaMode={s.mode} tone={s.tone}
                icon={link ? <I.ext size={16} /> : <I.chart size={18} />}
                onClick={link ? () => window.open(link, "_blank", "noopener,noreferrer") : undefined}
                style={link ? { cursor: "pointer" } : undefined}
                title={title}
                spark={<Sparkline data={data} color={s.mode === "finance" ? "var(--finance-up)" : col} />} />
            );
          })}
        </div>

        {/* Two-column body */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "var(--space-6)", alignItems: "start" }} className="kit-2col">
          {/* Left: focus feed */}
          <div>
            <SectionHeader kicker="INSIGHT · 洞察" title="今日關注動態"
              action={<Button variant="ghost" size="sm" iconRight={<I.arrow size={15} />}>全部</Button>} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(focus || K.focus).map((f, i) => {
                const I2 = I[f.icon] || I.sparkle;
                return (
                  <Card key={i} interactive padding="var(--space-5)">
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <span style={{ width: 44, height: 44, flex: "none", borderRadius: 14, background: `var(--${f.tone}-soft)`, color: `var(--${f.tone})`, display: "grid", placeItems: "center" }}><I2 size={22} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                          <Badge tone={f.tone}>{f.tag}</Badge>
                          <ToneDot tone={f.tone} />
                        </div>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: "var(--text-lg)", lineHeight: 1.3 }}>{f.title}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{f.meta}</div>
                      </div>
                      <IconButton size="sm" label="收藏"><I.bookmark size={17} /></IconButton>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div style={{ height: 24 }} />
            <SectionHeader kicker="ILLUMINATION · 啟發" title="待讀 · 進行中"
              action={<Button variant="ghost" size="sm">管理</Button>} />
            <Card padding="var(--space-5)">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {K.reading.map((r, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 7 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: "var(--text-1)", fontWeight: 700, fontSize: "var(--text-md)" }}>{r.title}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>{r.src}</div>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--illumination)", fontWeight: 700, fontSize: 13 }}>{r.pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "var(--night-700)", overflow: "hidden" }}>
                      <div style={{ width: r.pct + "%", height: "100%", background: "var(--illumination-gradient)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: podcasts, links, annuli mini */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <SectionHeader kicker="INTELLIGENCE · 智慧" title="常聽 Podcast" style={{ marginBottom: "var(--space-4)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {K.podcasts.map((p, i) => (
                  <Card key={i} interactive padding="14px 16px">
                    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                      <span style={{ width: 40, height: 40, flex: "none", borderRadius: 12, background: `var(--${p.tone}-soft)`, color: `var(--${p.tone})`, display: "grid", placeItems: "center" }}><I.headphones size={20} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "var(--text-1)", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 12 }}>{p.meta}</div>
                      </div>
                      <IconButton size="sm" variant="ghost" label="播放"><I.play size={16} /></IconButton>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <SectionHeader kicker="常用網站" title="快速前往" style={{ marginBottom: "var(--space-4)" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {K.links.map((l, i) => { const I2 = I[l.icon]; return (
                  <a key={i} href="#" onClick={(e)=>e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, padding: "12px 13px", background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-2)", fontSize: 13.5, fontWeight: 600 }}>
                    <span style={{ color: "var(--brand)", display: "flex" }}><I2 size={17} /></span>
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</span>
                    <I.ext size={13} style={{ color: "var(--text-4)" }} />
                  </a>
                ); })}
              </div>
            </div>

            <Card accent="intelligence" padding="var(--space-5)">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: "var(--text-lg)" }}>個人年輪</div>
                <Badge tone="intelligence">51 圈</Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {K.annuli.slice(-3).reverse().map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: `var(--${a.tone})`, fontWeight: 700, fontSize: 13, width: 42, flex: "none" }}>{a.year}</span>
                    <span style={{ color: "var(--text-2)", fontSize: 13.5 }}>{a.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Google 行事曆（前端登入、私人，事件僅存在瀏覽器） */}
        <CalendarPanel />
      </div>
    );
  }
  window.Dashboard = Dashboard;
})();
