/* Timeline — 個人年輪 (personal annual-rings life timeline)
   資料整合 AllenAnnuli（annuli-live.js 覆蓋 K.annuli；失敗退回內建），
   視覺維持本站 Aurora tokens。 */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Button, AuroraText } = NS;

  const ANNULI_SITE = (window.ANNULI && window.ANNULI.siteUrl) || "https://allenchen1113official.github.io/allenannuli/";
  const ANNULI_ADMIN = (window.ANNULI && window.ANNULI.adminUrl) || (ANNULI_SITE + "admin.html");

  function Timeline() {
    const K = window.KIT, I = window.Icons;
    const A = window.ANNULI || {};
    const annuli = K.annuli || [];

    // 年份範圍與圈數：優先用 AllenAnnuli 即時資料，否則從現有資料推算
    const years = annuli.map((a) => parseInt(a.year, 10)).filter((y) => isFinite(y));
    const start = A.range ? A.range.start : (years.length ? Math.min(...years) : 1975);
    const end = A.range ? A.range.end : (years.length ? Math.max(...years) : 2026);
    const rings = Math.max(1, end - start + 1);
    const liveStats = (A.stats || []).filter((s) => s && s.visible !== false);
    const tones = ["insight", "intelligence", "illumination"];

    const fmtDate = (a) => a.month ? `${a.year}.${String(a.month).padStart(2, "0")}` : String(a.year);

    return (
      <div className="kit-page" style={{ padding: "var(--space-8)", maxWidth: 1040, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
          <Badge tone="intelligence" dot>ANNULI · 個人年輪</Badge>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(2.2rem, 5vw, var(--text-5xl))", lineHeight: 1.08, color: "var(--text-1)", margin: "16px 0 0" }}>
            一圈一圈，<AuroraText>累積成我</AuroraText>
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: "var(--text-lg)", marginTop: 14 }}>{start} → {end} ·　{rings} 圈生命刻度</p>
          {A.live ? (
            <p style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 6 }}>
              資料同步自 <a href={ANNULI_SITE} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-2)", textDecoration: "underline", textUnderlineOffset: 3 }}>AllenAnnuli 大事紀</a>
            </p>
          ) : null}
        </div>

        {/* Ring stat band */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginBottom: liveStats.length ? "var(--space-6)" : "var(--space-12)" }}>
          {[[String(rings), "年", "insight"], [String(annuli.length), "段大事紀", "intelligence"], ["∞", "持續累積", "illumination"]].map((s, i) => (
            <Card key={i} accent={s[2]} padding="var(--space-5)" style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-4xl)", lineHeight: 1, color: `var(--${s[2]})` }}>{s[0]}</div>
              <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 8 }}>{s[1]}</div>
            </Card>
          ))}
        </div>

        {/* 數字統計（來自 AllenAnnuli，僅取數據，色調沿用本站） */}
        {liveStats.length ? (
          <Card padding="var(--space-5)" style={{ marginBottom: "var(--space-12)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4) var(--space-8)", justifyContent: "center" }}>
              {liveStats.map((s, i) => (
                <div key={s.id || i} style={{ textAlign: "center", minWidth: 84 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--text-2xl)", lineHeight: 1.1, color: `var(--${tones[i % tones.length]})` }}>
                    {s.number}<span style={{ fontSize: 13, marginLeft: 3, color: "var(--text-3)", fontWeight: 500 }}>{s.unit || ""}</span>
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* Vertical timeline */}
        <div style={{ position: "relative", paddingLeft: 8 }}>
          {/* spine */}
          <div style={{ position: "absolute", left: 19, top: 8, bottom: 8, width: 2, background: "linear-gradient(to bottom, var(--insight), var(--intelligence) 50%, var(--illumination))", opacity: .5, borderRadius: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {annuli.slice().reverse().map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <span style={{ position: "relative", zIndex: 1, width: 40, height: 40, flex: "none", borderRadius: 99, background: "var(--night-800)", border: `2px solid var(--${a.tone})`, display: "grid", placeItems: "center", boxShadow: `0 0 16px var(--${a.tone})` }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: `var(--${a.tone})` }} />
                </span>
                <Card interactive padding="var(--space-5)" style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "var(--text-xl)", color: `var(--${a.tone})` }}>{fmtDate(a)}</span>
                    <Badge tone={a.tone}>{a.title}</Badge>
                    {(a.cats || []).map((c, j) => (
                      <span key={j} style={{ color: "var(--text-3)", fontSize: 12, border: "1px solid var(--border)", borderRadius: 99, padding: "2px 9px" }}>{c}</span>
                    ))}
                  </div>
                  <p style={{ color: "var(--text-2)", margin: 0, fontSize: "var(--text-md)", lineHeight: 1.6 }}>{a.body}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "var(--space-12)", display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <Button icon={<I.rings size={17} />} iconRight={<I.ext size={15} />}
            onClick={() => window.open(ANNULI_SITE, "_blank", "noopener")}>
            開啟 AllenAnnuli 互動年輪
          </Button>
          <Button variant="secondary" icon={<I.sparkle size={17} />}
            onClick={() => window.open(ANNULI_ADMIN, "_blank", "noopener")}>
            新增一段里程碑
          </Button>
        </div>
      </div>
    );
  }
  window.Timeline = Timeline;
})();
