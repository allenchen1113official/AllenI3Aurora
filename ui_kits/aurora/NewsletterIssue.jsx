/* Newsletter Issue — editorial magazine reading view (日報·週報·月報) */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Tag, Button, IconButton, Avatar, Divider, Callout, SectionHeader } = NS;

  function Dek({ children }) {
    return <p style={{ color: "var(--text-3)", fontSize: "var(--text-lg)", lineHeight: 1.6, margin: "0 0 var(--space-6)", maxWidth: "var(--container-read)" }}>{children}</p>;
  }
  function Lead({ children }) {
    return <p style={{ color: "var(--text-2)", fontSize: "var(--text-md)", lineHeight: "var(--lh-relaxed)", margin: "0 0 var(--space-4)" }}>{children}</p>;
  }
  function Rule({ label }) {
    return <div style={{ margin: "var(--space-10) 0 var(--space-8)" }}><Divider label={label} /></div>;
  }

  function NewsletterIssue() {
    const I = window.Icons;
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--space-10) var(--gutter) var(--space-24)" }}>
        {/* Masthead */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-10)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "var(--text-on-accent)" }}>I³</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: ".02em", fontSize: 18, color: "var(--text-1)" }}>艾倫報報</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            <Badge tone="insight" variant="solid">週報</Badge>
            <Badge tone="neutral">第 26 期</Badge>
            <Badge tone="neutral">2026.06.29</Badge>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(2rem, 5vw, var(--text-5xl))", lineHeight: 1.08, letterSpacing: "var(--ls-tight)", color: "var(--text-1)", margin: "0 auto", maxWidth: 720 }}>
            AI 代理的記憶戰爭，<br/>與台股的靜默輪動
          </h1>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 22, color: "var(--text-3)", fontSize: 14 }}>
            <Avatar src="../../assets/avatar.jpg" name="Allen Chen" size="sm" />
            <span>Allen Chen 主編</span><span style={{ opacity: .4 }}>·</span><span>閱讀約 6 分鐘</span>
          </div>
        </div>

        {/* Cover */}
        <div style={{ borderRadius: "var(--radius-2xl)", overflow: "hidden", border: "1px solid var(--border)", marginBottom: "var(--space-8)", boxShadow: "var(--shadow-lg)", position: "relative" }}>
          <img src="../../assets/rabbit-reading.jpeg" alt="cover" style={{ width: "100%", height: 340, objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,7,15,.72), transparent 55%)" }} />
          <div style={{ position: "absolute", left: 22, bottom: 18, color: "var(--text-3)", fontSize: 12.5 }}>本期封面 · 「在書海裡的專注」</div>
        </div>

        <Dek>洞察世界．累積智慧．點亮未來。本週我們把目光放在兩件看似無關、實則同源的事：大型語言模型如何「記住」，以及資金如何在噪音中悄悄換手。</Dek>

        <Rule label="INSIGHT · 洞察" />
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", margin: "0 0 var(--space-4)" }}>一、記憶，是代理的護城河</h2>
        <Lead>過去一年，Agent 的競爭焦點從「會不會用工具」轉向「記得多少、記得多準」。當上下文視窗不再是瓶頸，真正的差異出現在檢索與遺忘的策略上——什麼該留下，什麼該主動忘掉。</Lead>
        <Lead>這與投資極為相似：資訊不是越多越好，能被結構化、被回顧、被行動的資訊，才是複利的來源。</Lead>

        <Callout tone="intelligence" icon={<I.bulb size={19} />} title="本週智慧 Intelligence">
          工具會被複製，記憶不會。無論是產品還是個人，能持續累積並善用脈絡的人，終將勝出。
        </Callout>

        <Rule label="理財 · FINANCE" />
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", margin: "0 0 var(--space-4)" }}>二、靜默輪動下的籌碼線索</h2>
        <Lead>大盤指數波瀾不驚，底下的資金卻在換手。本週外資與投信的「雙連買」名單新增 3 檔，集中在半導體與航運——這通常是輪動的前奏，而非結論。</Lead>
        {/* Mini data table */}
        <Card padding="0" style={{ overflow: "hidden", margin: "var(--space-4) 0 var(--space-6)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "12px 18px", background: "var(--night-850)", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-3)", fontWeight: 700, letterSpacing: ".05em" }}>
            <span>標的</span><span style={{ textAlign: "right" }}>收盤</span><span style={{ textAlign: "right" }}>漲跌</span>
          </div>
          {[["台積電 2330", "1,085", "+2.4%", true], ["長榮 2603", "218.5", "+3.1%", true], ["聯發科 2454", "1,420", "-0.7%", false]].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "14px 18px", borderBottom: i < 2 ? "1px solid var(--border-subtle)" : "none", alignItems: "center" }}>
              <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{r[0]}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r[1]}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: r[3] ? "var(--finance-up)" : "var(--finance-down)" }}>{r[2]}</span>
            </div>
          ))}
        </Card>
        <div style={{ fontSize: 12.5, color: "var(--text-4)", marginBottom: "var(--space-6)" }}>※ 台股慣例 紅漲綠跌。資料僅供參考，非投資建議。</div>

        <Rule label="ILLUMINATION · 啟發" />
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", margin: "0 0 var(--space-4)" }}>三、這週我學到的一件事</h2>
        <Lead>把研究做成產品，最難的不是研究，而是「持續發表」。艾倫報報本身就是這個信念的實踐——每週逼自己把散落的觀察，收斂成一份可以寄出去的東西。</Lead>
        <blockquote style={{ margin: "var(--space-6) 0", padding: "4px 0 4px 22px", borderLeft: "3px solid var(--illumination)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "var(--text-xl)", lineHeight: 1.45, color: "var(--text-1)" }}>
          「少即是多。每天主動砍掉一件不重要的事，替真正的重點騰出空間。」
        </blockquote>

        {/* Footer CTA */}
        <Card accent="aurora" glow padding="var(--space-8)" style={{ textAlign: "center", marginTop: "var(--space-10)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", marginBottom: 8 }}>喜歡這期報報嗎？</div>
          <p style={{ color: "var(--text-3)", margin: "0 0 20px", maxWidth: 420, marginInline: "auto" }}>把它轉寄給一位你在乎的朋友，或回信告訴我你想看的主題。</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Button variant="primary" icon={<I.mail size={16} />}>回信給主編</Button>
            <Button variant="secondary" icon={<I.link size={16} />}>分享連結</Button>
          </div>
        </Card>
      </div>
    );
  }
  window.NewsletterIssue = NewsletterIssue;
})();
