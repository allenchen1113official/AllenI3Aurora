/* Timeline — 個人年輪 (personal annual-rings life timeline) */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Button, SectionHeader, AuroraText } = NS;

  function Timeline() {
    const K = window.KIT, I = window.Icons;
    return (
      <div style={{ padding: "var(--space-8)", maxWidth: 1040, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
          <Badge tone="intelligence" dot>ANNULI · 個人年輪</Badge>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(2.2rem, 5vw, var(--text-5xl))", lineHeight: 1.08, color: "var(--text-1)", margin: "16px 0 0" }}>
            一圈一圈，<AuroraText>累積成我</AuroraText>
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: "var(--text-lg)", marginTop: 14 }}>1975 → 2026 ·　51 圈生命刻度</p>
        </div>

        {/* Ring stat band */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-12)" }}>
          {[["51", "年", "insight"], ["6", "重要轉折", "intelligence"], ["∞", "持續累積", "illumination"]].map((s, i) => (
            <Card key={i} accent={s[2]} padding="var(--space-5)" style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-4xl)", lineHeight: 1, color: `var(--${s[2]})` }}>{s[0]}</div>
              <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 8 }}>{s[1]}</div>
            </Card>
          ))}
        </div>

        {/* Vertical timeline */}
        <div style={{ position: "relative", paddingLeft: 8 }}>
          {/* spine */}
          <div style={{ position: "absolute", left: 19, top: 8, bottom: 8, width: 2, background: "linear-gradient(to bottom, var(--insight), var(--intelligence) 50%, var(--illumination))", opacity: .5, borderRadius: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {K.annuli.slice().reverse().map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <span style={{ position: "relative", zIndex: 1, width: 40, height: 40, flex: "none", borderRadius: 99, background: "var(--night-800)", border: `2px solid var(--${a.tone})`, display: "grid", placeItems: "center", boxShadow: `0 0 16px var(--${a.tone})` }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: `var(--${a.tone})` }} />
                </span>
                <Card interactive padding="var(--space-5)" style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--text-xl)", color: `var(--${a.tone})` }}>{a.year}</span>
                    <Badge tone={a.tone}>{a.title}</Badge>
                  </div>
                  <p style={{ color: "var(--text-2)", margin: 0, fontSize: "var(--text-md)", lineHeight: 1.6 }}>{a.body}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "var(--space-12)" }}>
          <Button variant="secondary" icon={<I.rings size={17} />}>新增一段里程碑</Button>
        </div>
      </div>
    );
  }
  window.Timeline = Timeline;
})();
