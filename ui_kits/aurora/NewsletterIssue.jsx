/* Newsletter Issue — editorial magazine reading view (日報·週報·月報)
   資料驅動：優先讀取 window.KIT.issues（可由後台 / Firestore 覆蓋）中的
   結構化內容（subtitle + blocks + social）。支援 ?issue=<期號> 深連結，
   並提供「一鍵分享」（Web Share API，退回複製連結 / Facebook 分享）。
   若目前沒有任何結構化內容，退回內建的示範版型（LegacyIssue），確保網站照常運作。 */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Tag, Button, IconButton, Avatar, Divider, Callout, SectionHeader, Tabs } = NS;

  /* ---------- 共用排版小元件 ---------- */
  function Dek({ children }) {
    return <p style={{ color: "var(--text-3)", fontSize: "var(--text-lg)", lineHeight: 1.6, margin: "0 0 var(--space-6)", maxWidth: "var(--container-read)" }}>{children}</p>;
  }
  function Lead({ children }) {
    return <p style={{ color: "var(--text-2)", fontSize: "var(--text-md)", lineHeight: "var(--lh-relaxed)", margin: "0 0 var(--space-4)", whiteSpace: "pre-wrap" }}>{children}</p>;
  }
  function Rule({ label }) {
    return <div style={{ margin: "var(--space-10) 0 var(--space-8)" }}><Divider label={label} /></div>;
  }
  function H2({ children }) {
    return <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", margin: "0 0 var(--space-4)" }}>{children}</h2>;
  }
  function Quote({ children }) {
    return (
      <blockquote style={{ margin: "var(--space-6) 0", padding: "4px 0 4px 22px", borderLeft: "3px solid var(--illumination)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "var(--text-xl)", lineHeight: 1.45, color: "var(--text-1)", whiteSpace: "pre-wrap" }}>
        {children}
      </blockquote>
    );
  }
  function Note({ children }) {
    return <div style={{ fontSize: 12.5, color: "var(--text-4)", marginBottom: "var(--space-6)", whiteSpace: "pre-wrap" }}>{children}</div>;
  }
  function TableBlock({ head, rows, note }) {
    const H = Array.isArray(head) && head.length ? head : ["標的", "收盤", "漲跌"];
    return (
      <>
        <Card padding="0" style={{ overflow: "hidden", margin: "var(--space-4) 0 var(--space-6)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "12px 18px", background: "var(--night-850)", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--text-3)", fontWeight: 700, letterSpacing: ".05em" }}>
            <span>{H[0]}</span><span style={{ textAlign: "right" }}>{H[1]}</span><span style={{ textAlign: "right" }}>{H[2]}</span>
          </div>
          {(rows || []).map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", padding: "14px 18px", borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none", alignItems: "center" }}>
              <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{r[0]}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r[1]}</span>
              <span style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: r[3] ? "var(--finance-up)" : "var(--finance-down)" }}>{r[2]}</span>
            </div>
          ))}
        </Card>
        {note ? <Note>{note}</Note> : null}
      </>
    );
  }

  /* ---------- 單一內容區塊 ---------- */
  function Block({ b }) {
    const I = window.Icons;
    if (!b || !b.t) return null;
    switch (b.t) {
      case "rule": return <Rule label={b.label || ""} />;
      case "h2": return <H2>{b.text}</H2>;
      case "lead": return <Lead>{b.text}</Lead>;
      case "callout":
        return (
          <Callout tone={b.tone || "intelligence"} icon={<I.bulb size={19} />} title={b.title || ""}>
            {b.text}
          </Callout>
        );
      case "quote": return <Quote>{b.text}</Quote>;
      case "note": return <Note>{b.text}</Note>;
      case "table": return <TableBlock head={b.head} rows={b.rows} note={b.note} />;
      default: return b.text ? <Lead>{b.text}</Lead> : null;
    }
  }

  /* ---------- 分享 ---------- */
  function issueUrl(issue) {
    const base = location.origin + "/AllenI3Aurora/";
    return base + "?issue=" + encodeURIComponent(issue && issue.no != null ? issue.no : "");
  }
  async function shareIssue(issue) {
    const url = issueUrl(issue);
    const title = "艾倫報報 · " + (issue.title || "");
    const text = (issue.social && issue.social.facebook) || issue.subtitle || issue.title || "";
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert("已複製本期分享連結：\n" + url);
    } catch (e) {
      window.prompt("複製此連結分享：", url);
    }
  }
  function shareFacebook(issue) {
    const u = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(issueUrl(issue));
    window.open(u, "_blank", "noopener,width=640,height=640");
  }

  /* ---------- 資料驅動的單期報報 ---------- */
  function DataIssue({ issue }) {
    const I = window.Icons;
    const blocks = Array.isArray(issue.blocks) ? issue.blocks : [];
    const cover = issue.cover || "../../assets/rabbit-reading.jpeg";
    const noText = issue.no != null && issue.no !== "" && /^\d+$/.test(String(issue.no)) ? ("第 " + issue.no + " 期") : "";
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--space-10) var(--gutter) var(--space-24)" }}>
        {/* Masthead */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-10)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "var(--text-on-accent)" }}>I³</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: ".02em", fontSize: 18, color: "var(--text-1)" }}>艾倫報報</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {issue.kind ? <Badge tone={issue.tone || "insight"} variant="solid">{issue.kind}</Badge> : null}
            {noText ? <Badge tone="neutral">{noText}</Badge> : null}
            {issue.date ? <Badge tone="neutral">{issue.date}</Badge> : null}
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(2rem, 5vw, var(--text-5xl))", lineHeight: 1.08, letterSpacing: "var(--ls-tight)", color: "var(--text-1)", margin: "0 auto", maxWidth: 720 }}>
            {issue.title}
          </h1>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 22, color: "var(--text-3)", fontSize: 14, flexWrap: "wrap" }}>
            <Avatar src="../../assets/avatar.jpg" name="Allen Chen" size="sm" />
            <span>{issue.author || "Allen Chen 主編"}</span>
            {issue.readMinutes ? (<><span style={{ opacity: .4 }}>·</span><span>閱讀約 {issue.readMinutes} 分鐘</span></>) : null}
          </div>
        </div>

        {/* Cover */}
        <div style={{ borderRadius: "var(--radius-2xl)", overflow: "hidden", border: "1px solid var(--border)", marginBottom: "var(--space-8)", boxShadow: "var(--shadow-lg)", position: "relative" }}>
          <img src={cover} alt="cover" style={{ width: "100%", height: 340, objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,7,15,.72), transparent 55%)" }} />
          {issue.coverCaption ? <div style={{ position: "absolute", left: 22, bottom: 18, color: "var(--text-3)", fontSize: 12.5 }}>{issue.coverCaption}</div> : null}
        </div>

        {issue.subtitle ? <Dek>{issue.subtitle}</Dek> : null}

        {blocks.map((b, i) => <Block key={i} b={b} />)}

        {/* Footer CTA */}
        <Card accent="aurora" glow padding="var(--space-8)" style={{ textAlign: "center", marginTop: "var(--space-10)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", marginBottom: 8 }}>喜歡這期報報嗎？</div>
          <p style={{ color: "var(--text-3)", margin: "0 0 20px", maxWidth: 420, marginInline: "auto" }}>把它轉寄給一位你在乎的朋友，或回信告訴我你想看的主題。</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Button variant="primary" icon={<I.mail size={16} />} onClick={() => { location.href = "mailto:allenchen1113.official@gmail.com?subject=" + encodeURIComponent("回信給主編 · " + (issue.title || "")); }}>回信給主編</Button>
            <Button variant="secondary" icon={<I.link size={16} />} onClick={() => shareIssue(issue)}>一鍵分享</Button>
            <Button variant="outline" icon={<I.ext size={16} />} onClick={() => shareFacebook(issue)}>分享到 Facebook</Button>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- 選出目前要顯示的一期 ---------- */
  function pickIssue() {
    const list = (window.KIT && window.KIT.issues) || [];
    if (!list.length) return null;
    let want = null;
    try { want = new URLSearchParams(location.search).get("issue"); } catch (e) { want = null; }
    if (want != null && want !== "") {
      // 先以期號比對；找不到再以日期比對（容許 - / . 分隔），
      // 讓「今日關注動態」可用日期深連結到當期的前台 HTML 頁面。
      const byNo = list.find((i) => String(i.no) === String(want));
      if (byNo) return byNo;
      const norm = (s) => String(s == null ? "" : s).replace(/[.\-/]/g, "").trim();
      const w = norm(want);
      if (w) {
        const byDate = list.find((i) => norm(i.date) === w);
        if (byDate) return byDate;
      }
    }
    const withBlocks = list.find((i) => Array.isArray(i.blocks) && i.blocks.length);
    if (withBlocks) return withBlocks;
    return list[0];
  }

  /* ---------- 本期報報：日報／週報／月報切換總覽 ----------
     由同源 data/newsletter-current.json（伺服器端自 Drive 三個資料夾彙整）驅動，
     各節奏顯示當期摘要卡並連到完整 HTML 頁面；JSON 未就緒時退回 KIT.issues 最新一期。 */
  const CADENCE_TABS = [
    { id: "day", label: "日報" },
    { id: "week", label: "週報" },
    { id: "month", label: "月報" },
  ];
  const CADENCE_KIND = { day: "日報", week: "週報", month: "月報" };
  const CADENCE_TONE = { day: "illumination", week: "insight", month: "intelligence" };
  const CADENCE_COVER = {
    day: "../../assets/rabbit-golden.jpeg",
    week: "../../assets/rabbit-reading.jpeg",
    month: "../../assets/rabbit-mountain.jpeg",
  };
  const CURRENT_URL = "/AllenI3Aurora/data/newsletter-current.json";

  function useCurrentIssues() {
    const [data, setData] = React.useState(null);
    React.useEffect(() => {
      let alive = true;
      fetch(CURRENT_URL, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive && j) setData(j); })
        .catch(() => {});
      return () => { alive = false; };
    }, []);
    return data;
  }

  // 由 KIT.issues 取某節奏最新一期，作為 JSON 未就緒時的退回。
  function latestOfKind(kind) {
    const list = (window.KIT && window.KIT.issues) || [];
    const num = (s) => Number(String(s == null ? "" : s).replace(/\D/g, "")) || 0;
    return list.filter((i) => i.kind === kind).sort((a, b) => num(b.date) - num(a.date))[0] || null;
  }

  // 綜合 JSON 與 KIT.issues，組出某節奏的當期卡片資料。
  function currentFor(cad, data) {
    const d = data && data[cad];
    const fb = latestOfKind(CADENCE_KIND[cad]);
    const fbLink = fb && fb.no != null && fb.no !== "" ? (location.pathname + "?issue=" + encodeURIComponent(fb.no)) : "";
    return {
      kind: CADENCE_KIND[cad],
      tone: (d && d.tone) || CADENCE_TONE[cad],
      date: (d && d.date) || (fb && fb.date) || "",
      title: (d && d.title) || (fb && fb.title) || "",
      summary: (d && d.summary) || (fb && fb.subtitle) || "",
      cover: (d && d.cover) || (fb && fb.cover) || CADENCE_COVER[cad],
      link: (d && d.link) || fbLink || location.pathname,
    };
  }

  function CadenceOverview() {
    const I = window.Icons;
    const data = useCurrentIssues();
    const [cad, setCad] = React.useState("day");
    const cur = currentFor(cad, data);
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--space-10) var(--gutter) var(--space-24)" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--aurora-gradient)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 15, color: "var(--text-on-accent)" }}>I³</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: ".02em", fontSize: 18, color: "var(--text-1)" }}>艾倫報報</span>
          </div>
          <p style={{ color: "var(--text-3)", fontSize: "var(--text-md)", margin: "0 0 20px" }}>日報捕捉當下，週報收斂脈絡，月報沉澱成長。</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Tabs value={cad} onChange={setCad} items={CADENCE_TABS} />
          </div>
        </div>

        <Card padding="0" style={{ overflow: "hidden" }}>
          <div style={{ position: "relative", height: 260 }}>
            <img src={cur.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,7,15,.82), transparent 60%)" }} />
            <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 8 }}>
              <Badge tone={cur.tone} variant="solid">{cur.kind}</Badge>
              {cur.date ? <Badge tone="neutral">{cur.date}</Badge> : null}
            </div>
          </div>
          <div style={{ padding: "var(--space-8)" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "clamp(1.5rem, 4vw, var(--text-3xl))", lineHeight: 1.14, letterSpacing: "var(--ls-tight)", color: "var(--text-1)", margin: "0 0 14px" }}>
              {cur.title || "本期即將發佈"}
            </h1>
            {cur.summary ? <p style={{ color: "var(--text-2)", fontSize: "var(--text-md)", lineHeight: "var(--lh-relaxed)", margin: "0 0 22px", whiteSpace: "pre-wrap" }}>{cur.summary}</p> : null}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" icon={<I.ext size={16} />} onClick={() => { if (cur.link) location.href = cur.link; }}>閱讀全文</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- 內建示範版型（無任何結構化內容時的最終退回） ---------- */
  function LegacyIssue() {
    const I = window.Icons;
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--space-10) var(--gutter) var(--space-24)" }}>
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
        <div style={{ borderRadius: "var(--radius-2xl)", overflow: "hidden", border: "1px solid var(--border)", marginBottom: "var(--space-8)", boxShadow: "var(--shadow-lg)", position: "relative" }}>
          <img src="../../assets/rabbit-reading.jpeg" alt="cover" style={{ width: "100%", height: 340, objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,7,15,.72), transparent 55%)" }} />
          <div style={{ position: "absolute", left: 22, bottom: 18, color: "var(--text-3)", fontSize: 12.5 }}>本期封面 · 「在書海裡的專注」</div>
        </div>
        <Dek>洞察世界．累積智慧．點亮未來。本週我們把目光放在兩件看似無關、實則同源的事：大型語言模型如何「記住」，以及資金如何在噪音中悄悄換手。</Dek>
        <Rule label="INSIGHT · 洞察" />
        <H2>一、記憶，是代理的護城河</H2>
        <Lead>過去一年，Agent 的競爭焦點從「會不會用工具」轉向「記得多少、記得多準」。當上下文視窗不再是瓶頸，真正的差異出現在檢索與遺忘的策略上——什麼該留下，什麼該主動忘掉。</Lead>
        <Lead>這與投資極為相似：資訊不是越多越好，能被結構化、被回顧、被行動的資訊，才是複利的來源。</Lead>
        <Callout tone="intelligence" icon={<I.bulb size={19} />} title="本週智慧 Intelligence">
          工具會被複製，記憶不會。無論是產品還是個人，能持續累積並善用脈絡的人，終將勝出。
        </Callout>
        <Rule label="理財 · FINANCE" />
        <H2>二、靜默輪動下的籌碼線索</H2>
        <Lead>大盤指數波瀾不驚，底下的資金卻在換手。本週外資與投信的「雙連買」名單新增 3 檔，集中在半導體與航運——這通常是輪動的前奏，而非結論。</Lead>
        <TableBlock head={["標的", "收盤", "漲跌"]} rows={[["台積電 2330", "1,085", "+2.4%", true], ["長榮 2603", "218.5", "+3.1%", true], ["聯發科 2454", "1,420", "-0.7%", false]]} note="※ 台股慣例 紅漲綠跌。資料僅供參考，非投資建議。" />
        <Rule label="ILLUMINATION · 啟發" />
        <H2>三、這週我學到的一件事</H2>
        <Lead>把研究做成產品，最難的不是研究，而是「持續發表」。艾倫報報本身就是這個信念的實踐——每週逼自己把散落的觀察，收斂成一份可以寄出去的東西。</Lead>
        <Quote>「少即是多。每天主動砍掉一件不重要的事，替真正的重點騰出空間。」</Quote>
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

  function hasIssueParam() {
    try { const w = new URLSearchParams(location.search).get("issue"); return w != null && w !== ""; }
    catch (e) { return false; }
  }
  function IssueLoading() {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "var(--space-24) var(--gutter)", textAlign: "center", color: "var(--text-3)" }}>
        載入中…
      </div>
    );
  }
  function NewsletterIssue() {
    // 深連結指定某一期（?issue=）→ 完整閱讀版型；否則顯示日報／週報／月報切換總覽。
    const deep = hasIssueParam();
    const ready = window.useDayArchive(deep); // 深連結時確保部落格日報已併入，供閱讀
    if (deep) {
      const issue = pickIssue();
      if (issue && (issue.title || (Array.isArray(issue.blocks) && issue.blocks.length))) {
        return <DataIssue issue={issue} />;
      }
      if (!ready) return <IssueLoading />; // 尚在載入部落格日報 → 稍候再解析
      return <LegacyIssue />;
    }
    return <CadenceOverview />;
  }
  window.NewsletterIssue = NewsletterIssue;
})();
