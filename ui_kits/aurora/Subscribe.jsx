/* Subscribe — landing + subscription management */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Button, Input, Switch, Divider, AuroraText, Avatar } = NS;

  function Cadence({ id, icon, title, desc, when, tone, on, onToggle }) {
    const I = window.Icons; const I2 = I[icon];
    return (
      <Card padding="var(--space-5)" style={{ borderColor: on ? "var(--border-aurora)" : "var(--border)", boxShadow: on ? "var(--glow-brand)" : "var(--shadow-card)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span style={{ width: 46, height: 46, flex: "none", borderRadius: 14, background: `var(--${tone}-soft)`, color: `var(--${tone})`, display: "grid", placeItems: "center" }}><I2 size={23} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: "var(--text-lg)" }}>{title}</div>
              <Switch checked={on} onChange={onToggle} />
            </div>
            <p style={{ color: "var(--text-3)", fontSize: 13.5, margin: "5px 0 10px", lineHeight: 1.5 }}>{desc}</p>
            <Badge tone={tone} dot>{when}</Badge>
          </div>
        </div>
      </Card>
    );
  }

  function Subscribe() {
    const I = window.Icons;
    const [state, setState] = React.useState({ day: false, week: true, month: true });
    const [done, setDone] = React.useState(false);
    return (
      <div style={{ minHeight: "100%" }}>
        {/* Hero */}
        <div style={{ position: "relative", overflow: "hidden", padding: "var(--space-20) var(--gutter) var(--space-16)", textAlign: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 60% at 50% 0%, var(--intelligence-soft), transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "relative", maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--aurora-gradient)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 17, color: "var(--text-on-accent)", boxShadow: "var(--glow-brand)" }}>I³</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20, color: "var(--text-1)" }}>艾倫報報</span>
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(2.4rem, 6vw, var(--text-6xl))", lineHeight: 1.05, letterSpacing: "var(--ls-tight)", color: "var(--text-1)", margin: 0 }}>
              洞察世界<br/><AuroraText>累積智慧．點亮未來</AuroraText>
            </h1>
            <p style={{ color: "var(--text-2)", fontSize: "var(--text-lg)", lineHeight: 1.6, margin: "22px auto 0", maxWidth: 560 }}>
              一份關於理財、工作、研究與生活的個人電子報。由 Allen 每日、每週、每月，親手把散落的觀察，收斂成值得你花時間閱讀的東西。
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 30, flexWrap: "wrap", color: "var(--text-3)", fontSize: 14 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Avatar src="../../assets/avatar.jpg" name="A" size="xs" /> 1,240+ 位讀者</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><I.check size={16} style={{ color: "var(--insight)" }} /> 免費 · 隨時退訂</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><I.check size={16} style={{ color: "var(--insight)" }} /> 無廣告</span>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 var(--gutter) var(--space-24)" }}>
          {/* Cadence choices */}
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", textAlign: "center", margin: "0 0 var(--space-6)" }}>選擇你的節奏</h2>
          <div style={{ display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
            <Cadence id="day" icon="sparkle" tone="illumination" title="日報 · 早晨速報" when="每日 07:00" on={state.day} onToggle={(v) => setState({ ...state, day: v })}
              desc="三則你今天該知道的事——市場、科技、生活，兩分鐘讀完。" />
            <Cadence id="week" icon="paper" tone="insight" title="週報 · 深度彙整" when="每週一 09:00" on={state.week} onToggle={(v) => setState({ ...state, week: v })}
              desc="一週脈絡的收斂：關注動態、籌碼洞察、閱讀與啟發。旗艦內容。" />
            <Cadence id="month" icon="rings" tone="intelligence" title="月報 · 沉澱回顧" when="每月 1 號" on={state.month} onToggle={(v) => setState({ ...state, month: v })}
              desc="一個月的成長回顧與下月計畫，附個人年輪的新刻度。" />
          </div>

          {/* Email form */}
          <Card accent="aurora" glow padding="var(--space-8)">
            {done ? (
              <div style={{ textAlign: "center", padding: "var(--space-6) 0" }}>
                <div style={{ width: 64, height: 64, margin: "0 auto 16px", borderRadius: 99, background: "var(--insight-soft)", color: "var(--insight)", display: "grid", placeItems: "center" }}><I.check size={34} /></div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)" }}>訂閱成功 🎉</div>
                <p style={{ color: "var(--text-3)", marginTop: 8 }}>確認信已寄出，記得到信箱點擊啟用連結。</p>
                <div style={{ marginTop: 18 }}><Button variant="secondary" onClick={() => setDone(false)}>返回</Button></div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-xl)", color: "var(--text-1)", marginBottom: 6 }}>最後一步，留個 Email</div>
                <p style={{ color: "var(--text-3)", fontSize: 14, margin: "0 0 20px" }}>選定的節奏會依排程送達你的信箱。我們絕不寄送垃圾信。</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Input label="你的 Email" icon={<I.mail size={17} />} placeholder="you@example.com" style={{ flex: 1, minWidth: 240 }} />
                  <Button size="lg" iconRight={<I.arrow size={18} />} onClick={() => setDone(true)}>開始訂閱</Button>
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10 }}>
                  <Switch defaultChecked size="sm" />
                  <span style={{ color: "var(--text-3)", fontSize: 13 }}>我同意接收艾倫報報電子報，並可隨時一鍵退訂。</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }
  window.Subscribe = Subscribe;
})();
