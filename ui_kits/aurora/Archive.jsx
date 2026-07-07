/* Archive — past issues grid with cadence filter */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Tag, Button, IconButton, Tabs, SectionHeader } = NS;

  function IssueCard({ it }) {
    const I = window.Icons;
    return (
      <Card interactive padding="0" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", height: 150 }}>
          <img src={it.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,7,15,.55), transparent 60%)" }} />
          <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8 }}>
            <Badge tone={it.tone} variant="solid">{it.kind}</Badge>
          </div>
          <div style={{ position: "absolute", bottom: 10, right: 12, fontFamily: "var(--font-mono)", fontWeight: 700, color: "#fff", fontSize: 13, textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>No.{it.no}</div>
        </div>
        <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{it.date}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: "var(--text-lg)", lineHeight: 1.32, flex: 1 }}>{it.title}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{it.items} 則彙整</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand)", fontWeight: 700, fontSize: 13 }}>閱讀 <I.arrow size={15} /></span>
          </div>
        </div>
      </Card>
    );
  }

  function Archive() {
    const K = window.KIT, I = window.Icons;
    const [filter, setFilter] = React.useState("all");
    const map = { all: null, day: "日報", week: "週報", month: "月報" };
    const list = K.issues.filter((x) => !map[filter] || x.kind === map[filter]);
    return (
      <div style={{ padding: "var(--space-8)" }}>
        <SectionHeader kicker="ARCHIVE · 歷期彙整" title="每一期，都是一圈年輪"
          description="日報捕捉當下，週報收斂脈絡，月報沉澱成長。翻閱過去，看見自己的變化。"
          action={<Button variant="secondary" icon={<I.search size={16} />}>搜尋歷期</Button>} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
          <Tabs value={filter} onChange={setFilter} items={[
            { id: "all", label: "全部" }, { id: "day", label: "日報" }, { id: "week", label: "週報" }, { id: "month", label: "月報" },
          ]} />
          <div style={{ display: "flex", gap: 8 }}>
            <Tag selected>2026</Tag><Tag>2025</Tag><Tag>2024</Tag>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))", gap: "var(--space-5)" }}>
          {list.map((it, i) => <IssueCard key={i} it={it} />)}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-10)" }}>
          <Button variant="outline">載入更早的報報</Button>
        </div>
      </div>
    );
  }
  window.Archive = Archive;
})();
