/* Subscribe — landing + subscription management
   -----------------------------------------------------------------------
   寫入 Firestore aurora_subscribers（doc id = 私密 token，見 subscriber-data.js）。
   Double Opt-in：送出後為 pending，由排程寄出確認信，讀者點擊後才成為正式訂閱者。
   退訂／調整節奏一律經信中的「管理訂閱」連結（偏好中心），
   不再提供「輸入 Email 即退訂」—— 那會讓任何人退訂別人、也能探測某 Email 是否在名單上。 */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const { Card, Badge, Button, Input, Switch, AuroraText, Avatar, Callout } = NS;
  const SUB = window.AURORA_SUB || {};

  function Cadence({ icon, title, desc, when, tone, on, onToggle }) {
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
    const [email, setEmail] = React.useState("");
    const [consent, setConsent] = React.useState(true);
    const [trap, setTrap] = React.useState("");        // honeypot：真人不會填
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState("");
    const [done, setDone] = React.useState(null);      // { email }
    const [known, setKnown] = React.useState("");      // 本機曾訂閱過的 token
    React.useEffect(() => { setKnown(SUB.savedToken ? SUB.savedToken() : ""); }, []);

    const anyCadence = state.day || state.week || state.month;
    const emailOk = SUB.validEmail ? SUB.validEmail(email) : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

    const subscribe = async () => {
      setErr("");
      if (!emailOk) { setErr("請輸入有效的 Email 地址。"); return; }
      if (!anyCadence) { setErr("請至少選擇一種閱讀節奏（日報／週報／月報）。"); return; }
      if (!consent) { setErr("請勾選同意接收電子報，才能完成訂閱。"); return; }
      if (!SUB.configured) { setErr("訂閱服務尚未設定完成，請稍後再試。"); return; }
      if (trap) { setDone({ email: SUB.normalizeEmail(email) }); return; } // 機器人：假成功，不寫入
      setBusy(true);
      try {
        const rec = await SUB.subscribe({ email, cadence: state, source: "web" });
        setDone({ email: rec.email }); setKnown(rec.token); setEmail("");
      } catch (e) {
        const code = (e && e.message) || "";
        setErr(code === "EMAIL_INVALID" ? "請輸入有效的 Email 地址。"
          : code === "CADENCE_EMPTY" ? "請至少選擇一種閱讀節奏。"
          : "訂閱暫時失敗，請稍後再試。若持續發生，歡迎直接來信告訴我。");
        console.warn("[aurora] subscribe failed:", e);
      } finally { setBusy(false); }
    };
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Avatar src="../../assets/avatar.jpg" name="A" size="xs" /> 讀者與我一起累積</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><I.check size={16} style={{ color: "var(--insight)" }} /> 免費 · 一鍵退訂</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><I.check size={16} style={{ color: "var(--insight)" }} /> 無廣告 · 不轉售名單</span>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 var(--gutter) var(--space-24)" }}>
          {/* Cadence choices */}
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)", textAlign: "center", margin: "0 0 var(--space-6)" }}>選擇你的節奏</h2>
          <div style={{ display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
            <Cadence icon="sparkle" tone="illumination" title="日報 · 早晨速報" when="每日 07:00" on={state.day} onToggle={(v) => setState({ ...state, day: v })}
              desc="三則你今天該知道的事——市場、科技、生活，兩分鐘讀完。" />
            <Cadence icon="paper" tone="insight" title="週報 · 深度彙整" when="每週一 09:00" on={state.week} onToggle={(v) => setState({ ...state, week: v })}
              desc="一週脈絡的收斂：關注動態、籌碼洞察、閱讀與啟發。旗艦內容。" />
            <Cadence icon="rings" tone="intelligence" title="月報 · 沉澱回顧" when="每月 1 號" on={state.month} onToggle={(v) => setState({ ...state, month: v })}
              desc="一個月的成長回顧與下月計畫，附個人年輪的新刻度。" />
          </div>

          {/* Email form */}
          <Card accent="aurora" glow padding="var(--space-8)">
            {done ? (
              <div style={{ textAlign: "center", padding: "var(--space-6) 0" }}>
                <div style={{ width: 64, height: 64, margin: "0 auto 16px", borderRadius: 99, background: "var(--insight-soft)", color: "var(--insight)", display: "grid", placeItems: "center" }}><I.mail size={32} /></div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)" }}>確認信已寄出 📮</div>
                <p style={{ color: "var(--text-3)", marginTop: 10, lineHeight: 1.65 }}>
                  我們會寄一封確認信到<br/>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 13.5 }}>{done.email}</span><br/>
                  點擊信中的連結，訂閱才會正式啟用。最久約 10 分鐘送達。
                </p>
                <p style={{ color: "var(--text-4)", fontSize: 12.5, marginTop: 12 }}>沒收到？請看看垃圾信匣，或把寄件地址加入通訊錄。</p>
                <div style={{ marginTop: 18 }}><Button variant="secondary" onClick={() => setDone(null)}>返回</Button></div>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-xl)", color: "var(--text-1)", marginBottom: 6 }}>最後一步，留個 Email</div>
                <p style={{ color: "var(--text-3)", fontSize: 14, margin: "0 0 20px" }}>選定的節奏會依排程送達你的信箱。我們絕不寄送垃圾信，也不會把名單分享給任何人。</p>
                {!SUB.configured ? (
                  <div style={{ marginBottom: 16 }}>
                    <Callout tone="warning" title="訂閱服務尚未啟用">網站的資料層尚未設定完成，暫時無法接受訂閱。</Callout>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Input label="你的 Email" icon={<I.mail size={17} />} placeholder="you@example.com" type="email" name="email" autoComplete="email" inputMode="email"
                    value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !busy) subscribe(); }}
                    style={{ flex: 1, minWidth: 240 }} />
                  <Button size="lg" iconRight={<I.arrow size={18} />} disabled={busy} onClick={subscribe}>{busy ? "送出中…" : "開始訂閱"}</Button>
                </div>
                {/* honeypot：離屏隱藏，較能誘使機器人填寫 */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: 0, width: 1, height: 1, overflow: "hidden" }}>
                  <label>Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
                </div>
                {err ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>{err}</div> : null}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <Switch checked={consent} onChange={(v) => { setConsent(v); setErr(""); }} size="sm" />
                  <span style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.55 }}>
                    我同意接收艾倫報報電子報，並已閱讀
                    <a href="/AllenI3Aurora/privacy.html" target="_blank" rel="noopener" style={{ color: "var(--insight)", margin: "0 3px" }}>個人資料告知事項</a>
                    。可隨時一鍵退訂。
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* 既有訂閱者入口（不再提供輸入 Email 退訂） */}
          <div style={{ textAlign: "center", marginTop: "var(--space-6)", color: "var(--text-4)", fontSize: 13, lineHeight: 1.7 }}>
            已經訂閱過了？
            {known ? (
              <a href={SUB.manageUrl ? SUB.manageUrl(known) : "#"} style={{ color: "var(--text-2)", marginLeft: 6, borderBottom: "1px solid var(--border)" }}>管理我的訂閱設定</a>
            ) : (
              <span style={{ marginLeft: 6 }}>打開任何一封艾倫報報，點最下方的「管理訂閱」即可調整節奏或退訂；弄丟了所有信，重新訂閱一次，我們會把管理連結寄給你。</span>
            )}
          </div>
        </div>
      </div>
    );
  }
  window.Subscribe = Subscribe;
})();
