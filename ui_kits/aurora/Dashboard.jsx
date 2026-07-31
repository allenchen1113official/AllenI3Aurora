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
     需求：盤中顯示「即時」指數，盤後／非交易時段顯示最新收盤，並自動更新、
     依台股交易時段與非交易時段採不同刷新頻率。皆為前端直接抓取，無自建後端。

     資料來源：
     1) 盤中即時：證交所 MIS 行情 API（ex_ch=tse_t00.tw ＝發行量加權股價指數），
        提供當前指數 z 與昨收 y，可即時計算漲跌點與漲跌%。此端點未開放 CORS，
        故經公用 CORS 代理轉發；代理不可用時自動退回官方收盤資料。
     2) 收盤／非交易：證交所 OpenAPI「加權指數歷史資料」（原生支援 CORS），
        取最新收盤與昨收計算漲跌，並以近 9 個交易日收盤繪製迷你走勢。
     任一來源失敗都靜默退回下一層，最終退回 kit.jsx 內建預設值，不影響其他區塊。
     卡片點擊仍前往 Yahoo ^TWII 完整即時報價頁（見 kit.jsx 之 stats.link）。 */
  const TAIEX_HISTORY_API = "https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST";
  const TAIEX_REALTIME_API = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0";
  // 公用 CORS 代理（依序嘗試）；僅用於轉發未開放 CORS 的來源。
  const CORS_PROXIES = [
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  ];
  // 交易時段每 20 秒刷新；非交易時段每 10 分鐘檢查一次（收盤結算／隔日更新）。
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

  /* 解析 OpenAPI 收盤歷史，計算最新收盤、漲跌與近 9 日走勢。null＝無法解析。 */
  function parseTaiexHistory(items) {
    if (!Array.isArray(items)) return null;
    const rows = items
      .map((it) => ({
        date: String((it && (it.Date || it.date)) || ""),
        close: parseFloat(String((it && (it.ClosingIndex || it.closingIndex)) || "").replace(/,/g, "")),
      }))
      .filter((r) => r.date && isFinite(r.close));
    if (!rows.length) return null;
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const closes = rows.map((r) => r.close);
    const last = closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : last;
    const pts = last - prev;
    const pct = prev ? (pts / prev) * 100 : 0;
    return {
      value: taiexNumFmt.format(last),
      delta: taiexDeltaLabel(pct, pts),
      data: closes.slice(-9),
      asOf: rows[rows.length - 1].date,
      live: false,
    };
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
    return {
      value: taiexNumFmt.format(cur),
      delta: taiexDeltaLabel(pct, pts),
      data: sparkFallback && sparkFallback.length ? sparkFallback : undefined,
      asOf: a.t ? `${a.t} 盤中` : "盤中",
      live: true,
    };
  }

  /* 自動更新：先抓收盤歷史（走勢＋收盤基準），再依交易時段決定顯示即時或收盤，
     並以交易／非交易不同頻率持續刷新。任何失敗都退回上一層可用值。 */
  function useTaiexLive() {
    const [live, setLive] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      let timer = null;
      const histRef = { current: null }; // 收盤走勢（sparkline）與收盤基準快取

      const loadHistory = async () => {
        const parsed = parseTaiexHistory(await fetchJSONResilient(TAIEX_HISTORY_API));
        if (parsed) histRef.current = parsed;
        return parsed;
      };

      const tick = async () => {
        if (isTaiexTradingHours()) {
          const spark = histRef.current && histRef.current.data;
          const rt = parseTaiexRealtime(await fetchJSONResilient(TAIEX_REALTIME_API), spark);
          if (alive && rt) return setLive(rt);
        }
        // 非交易時段，或即時抓取失敗：顯示最新官方收盤。
        const hist = histRef.current || (await loadHistory());
        if (alive && hist) setLive(hist);
      };

      const schedule = () => {
        const ms = isTaiexTradingHours() ? TAIEX_POLL_TRADING : TAIEX_POLL_IDLE;
        timer = setTimeout(async () => { await tick(); if (alive) schedule(); }, ms);
      };

      (async () => {
        await loadHistory(); // 先取得走勢與收盤基準
        await tick();        // 依當下交易時段顯示即時或收盤
        if (alive) schedule();
      })();

      return () => { alive = false; if (timer) clearTimeout(timer); };
    }, []);
    return live;
  }

  const isTaiexStat = (s) => /TAIEX/i.test(s.label || "") || /TWII/i.test(s.link || "");

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
    return (
      <div className="kit-page" style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {/* Greeting / hero strip */}
        <Card accent="aurora" glow padding="var(--space-6)" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge tone="illumination" dot>{taipeiDateLabel()}</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-3xl)", color: "var(--text-1)", margin: 0, lineHeight: 1.1 }}>早安，Allen ☀️</h2>
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
            const value = live ? live.value : s.value;
            const delta = live ? live.delta : s.delta;
            const data = live && live.data && live.data.length ? live.data : s.data;
            const title = isTaiexStat(s)
              ? (live
                  ? (live.live
                      ? `盤中即時指數 ${live.value}（${live.asOf}，來源：證交所 MIS）· 點擊看完整即時報價`
                      : `最新收盤指數 ${live.value}（資料日 ${live.asOf}，來源：證交所 OpenAPI）· 點擊看盤中即時報價`)
                  : "查看線上即時報價（Yahoo 股市）")
              : (s.link ? "查看線上即時報價（Yahoo 股市）" : undefined);
            return (
              <StatCard key={i} label={s.label} value={value} unit={s.unit} delta={delta} deltaMode={s.mode} tone={s.tone}
                icon={s.link ? <I.ext size={16} /> : <I.chart size={18} />}
                onClick={s.link ? () => window.open(s.link, "_blank", "noopener,noreferrer") : undefined}
                style={s.link ? { cursor: "pointer" } : undefined}
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
              {K.focus.map((f, i) => {
                const I2 = I[f.icon];
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
