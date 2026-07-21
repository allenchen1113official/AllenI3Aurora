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

  /* Google 行事曆整合（帳號 + 台北時區）— 前端登入後直接讀取，不經任何後端 */
  const CAL_EMAIL = "allenchen1113.official@gmail.com";
  // 在 Google Cloud Console 建立「OAuth 用戶端 ID（網頁應用程式）」後，把 Client ID 貼在這裡，
  // 並把網站來源（例如 https://allenchen1113official.github.io）加入「已授權的 JavaScript 來源」。
  // Client ID 為公開值、非密鑰，可安全放進前端。
  const GOOGLE_CLIENT_ID = ""; // e.g. "1234567890-abcdefg.apps.googleusercontent.com"
  const openCalendar = () => window.open(`https://calendar.google.com/calendar/u/${CAL_EMAIL}/r`, "_blank", "noopener,noreferrer");

  /* 前端 Google 登入 → 讀取本人私人行事曆，以極光深色主題呈現。
     access token 僅存在瀏覽器記憶體，不落地、不上傳任何伺服器。 */
  function CalendarPanel() {
    const I = window.Icons;
    const [status, setStatus] = React.useState("idle"); // idle | loading | ready | error
    const [events, setEvents] = React.useState([]);
    const [error, setError] = React.useState("");
    const clientRef = React.useRef(null);
    const configured = !!GOOGLE_CLIENT_ID;

    const fetchEvents = React.useCallback(async (token) => {
      setStatus("loading"); setError("");
      try {
        const params = new URLSearchParams({
          timeMin: new Date().toISOString(), maxResults: "12",
          singleEvents: "true", orderBy: "startTime",
        });
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_EMAIL)}/events?${params}`,
          { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) throw new Error("讀取失敗（HTTP " + res.status + "）");
        const data = await res.json();
        setEvents(data.items || []);
        setStatus("ready");
      } catch (e) {
        setError(e.message || String(e)); setStatus("error");
      }
    }, []);

    const signIn = React.useCallback(() => {
      const g = window.google && window.google.accounts && window.google.accounts.oauth2;
      if (!g) { setError("Google 登入元件尚未載入，請稍候再試。"); setStatus("error"); return; }
      if (!clientRef.current) {
        clientRef.current = g.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "https://www.googleapis.com/auth/calendar.readonly",
          callback: (resp) => {
            if (resp && resp.access_token) fetchEvents(resp.access_token);
            else { setError("授權已取消或失敗。"); setStatus("error"); }
          },
        });
      }
      setStatus("loading");
      clientRef.current.requestAccessToken({ prompt: "" });
    }, [fetchEvents]);

    const clear = () => { setEvents([]); setStatus("idle"); setError(""); };

    const fmt = (ev) => {
      const s = ev.start || {};
      const dOpt = { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short" };
      if (s.date) {
        const d = new Date(s.date + "T00:00:00+08:00");
        return { day: new Intl.DateTimeFormat("zh-TW", dOpt).format(d), time: "整天" };
      }
      const d = new Date(s.dateTime);
      return {
        day: new Intl.DateTimeFormat("zh-TW", dOpt).format(d),
        time: new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(d),
      };
    };

    const tones = ["insight", "intelligence", "illumination"];
    let body;
    if (!configured) {
      body = <div style={{ padding: "var(--space-6)", color: "var(--text-3)", fontSize: 13.5, textAlign: "center" }}>行事曆整合尚未啟用。</div>;
    } else if (status === "idle") {
      body = (
        <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
          <p style={{ color: "var(--text-3)", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.6 }}>使用 Google 登入即可顯示你的私人行程；資料只留在你的瀏覽器，不經任何伺服器。</p>
          <Button variant="primary" icon={<I.cal size={16} />} onClick={signIn}>使用 Google 登入以顯示行程</Button>
        </div>
      );
    } else if (status === "loading") {
      body = <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>載入中…</div>;
    } else if (status === "error") {
      body = (
        <div style={{ padding: "var(--space-7)", textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontSize: 13.5, margin: "0 0 14px" }}>{error}</p>
          <Button variant="secondary" size="sm" onClick={signIn}>重試</Button>
        </div>
      );
    } else if (!events.length) {
      body = <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>近期沒有行程。</div>;
    } else {
      body = (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.map((ev, i) => {
            const t = fmt(ev); const tone = tones[i % tones.length];
            return (
              <div key={ev.id || i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "13px 18px", borderBottom: i < events.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                <span style={{ width: 6, height: 34, borderRadius: 99, background: `var(--${tone})`, flex: "none", boxShadow: `0 0 10px var(--${tone})` }} />
                <div style={{ width: 92, flex: "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 13, fontWeight: 700 }}>{t.day}</div>
                  <div style={{ fontFamily: "var(--font-mono)", color: `var(--${tone})`, fontSize: 12.5 }}>{t.time}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--text-1)", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.summary || "（無標題）"}</div>
                  {ev.location && <div style={{ color: "var(--text-3)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.location}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div>
        <SectionHeader kicker="行事曆 · CALENDAR" title="我的 Google 行事曆"
          description="登入後即時讀取 allenchen1113.official@gmail.com 的私人行程（台北時區）。"
          action={
            <div style={{ display: "flex", gap: 8 }}>
              {status === "ready" && <Button variant="ghost" size="sm" onClick={clear}>收合</Button>}
              <Button variant="secondary" size="sm" icon={<I.cal size={15} />} onClick={openCalendar}>開啟完整行事曆</Button>
            </div>
          } />
        <Card padding="0" style={{ overflow: "hidden" }}>{body}</Card>
      </div>
    );
  }

  function Dashboard() {
    const K = window.KIT, I = window.Icons;
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
            return (
              <StatCard key={i} label={s.label} value={s.value} unit={s.unit} delta={s.delta} deltaMode={s.mode} tone={s.tone}
                icon={<I.chart size={18} />}
                spark={<Sparkline data={s.data} color={s.mode === "finance" ? "var(--finance-up)" : col} />} />
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
