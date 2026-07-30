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

  /* ── 加權指數 TAIEX 即時資料 ──────────────────────────────────────────
     資料來源：證交所官方 OpenAPI（openapi.twse.com.tw，原生支援 CORS，免後端／免代理）。
     「發行量加權股價指數歷史資料」提供每日開高低收，取最新收盤指數與前一日相比計算漲跌，
     並以近 9 個交易日收盤價繪製迷你走勢。此為官方盤後／收盤資料，
     真正的盤中逐筆即時報價請點卡片前往 Yahoo 股市（見 kit.jsx 之 stats.link）。 */
  const TAIEX_HISTORY_API = "https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST";
  const taiexNumFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* 台股交易時段（台北時區，週一至週五 09:00–13:30） */
  function isTaiexTradingHours(now = new Date()) {
    try {
      const p = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Taipei", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(now).reduce((a, x) => (a[x.type] = x.value, a), {});
      if (p.weekday === "Sat" || p.weekday === "Sun") return false;
      const mins = (+p.hour) * 60 + (+p.minute);
      return mins >= 9 * 60 && mins <= 13 * 60 + 30;
    } catch { return false; }
  }

  /* 解析 OpenAPI 回傳，計算最新收盤、漲跌% 與走勢資料。回傳 null 代表無法解析（保留內建值）。 */
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
    const pct = prev ? ((last - prev) / prev) * 100 : 0;
    return {
      value: taiexNumFmt.format(last),
      delta: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
      data: closes.slice(-9),
      asOf: rows[rows.length - 1].date,
    };
  }

  /* 掛載時抓一次；交易時段內每 60 秒刷新一次（收盤後官方資料更新即會反映）。 */
  function useTaiexLive() {
    const [live, setLive] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      const load = async () => {
        try {
          const res = await fetch(TAIEX_HISTORY_API, { headers: { Accept: "application/json" } });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const parsed = parseTaiexHistory(await res.json());
          if (alive && parsed) setLive(parsed);
        } catch { /* 靜默失敗，保留 kit.jsx 內建值 */ }
      };
      load();
      const timer = setInterval(() => { if (isTaiexTradingHours()) load(); }, 60000);
      return () => { alive = false; clearInterval(timer); };
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
              ? (live ? `最新收盤指數 ${live.value}（資料日 ${live.asOf}，來源：證交所 OpenAPI）· 點擊看盤中即時報價` : "查看線上即時報價（Yahoo 股市）")
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
