/* Dashboard (home) — rich, dense control panel */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, StatCard, Sparkline, SectionHeader, Badge, Tag, Button, IconButton, Avatar } = NS;

  function ToneDot({ tone }) {
    const c = { insight: "var(--insight)", intelligence: "var(--intelligence)", illumination: "var(--illumination)" }[tone] || "var(--brand)";
    return <span style={{ width: 8, height: 8, borderRadius: 99, background: c, flex: "none", boxShadow: `0 0 10px ${c}` }} />;
  }

  function Dashboard() {
    const K = window.KIT, I = window.Icons;
    return (
      <div className="kit-page" style={{ padding: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        {/* Greeting / hero strip */}
        <Card accent="aurora" glow padding="var(--space-6)" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Badge tone="illumination" dot>2026 年 6 月 30 日 · 星期一</Badge>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-3xl)", color: "var(--text-1)", margin: 0, lineHeight: 1.1 }}>早安，Allen ☀️</h2>
            <p style={{ color: "var(--text-2)", margin: "8px 0 0", fontSize: "var(--text-md)" }}>{K.brand.tagline}　今天有 <b style={{ color: "var(--insight)" }}>4</b> 則關注動態、<b style={{ color: "var(--intelligence)" }}>1</b> 場會議與 <b style={{ color: "var(--illumination)" }}>2</b> 集必聽 Podcast。</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="primary" iconRight={<I.arrow size={16} />}>撰寫今日速報</Button>
            <Button variant="secondary" icon={<I.cal size={16} />}>行事曆</Button>
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
      </div>
    );
  }
  window.Dashboard = Dashboard;
})();
