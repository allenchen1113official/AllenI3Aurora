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

  /* 訂閱寫入 Firestore（aurora_subscribers，doc id = email 小寫）。
     規則允許任何人「建立」；同一 email 已存在時 set 會被視為 update 而被拒，
     此時改走「自助更新」（規則僅放行 status / cadence / updatedAt）
     完成節奏調整或復訂。未設定 Firebase 時走預覽模式。 */
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  async function submitSubscription(email, cadence) {
    const db = window.AURORA && window.AURORA.db;
    if (!db) return { ok: true, demo: true };
    const key = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const cad = { day: !!cadence.day, week: !!cadence.week, month: !!cadence.month };
    try {
      await db.collection("aurora_subscribers").doc(key).set({
        email: key, cadence: cad,
        status: "active", consent: true, source: "web", createdAt: now, updatedAt: now,
      });
      return { ok: true };
    } catch (e) {
      if (e && e.code === "permission-denied") {
        try {
          await db.collection("aurora_subscribers").doc(key).update({ status: "active", cadence: cad, updatedAt: now });
          return { ok: true, updated: true };
        } catch {
          return { ok: false, msg: "訂閱設定更新失敗，請稍後再試。若持續發生，歡迎直接來信告訴我。" };
        }
      }
      return { ok: false, msg: "訂閱暫時失敗，請稍後再試。若持續發生，歡迎直接來信告訴我。" };
    }
  }

  /* 自助退訂：把 status 改為 unsubscribed（保留紀錄，重新訂閱即復訂）。
     名單依然不可被外部讀取；查無此 email 時 Firestore 會拒絕 update。 */
  async function submitUnsubscribe(email) {
    const db = window.AURORA && window.AURORA.db;
    if (!db) return { ok: true, demo: true };
    const key = email.trim().toLowerCase();
    try {
      await db.collection("aurora_subscribers").doc(key).update({ status: "unsubscribed", updatedAt: new Date().toISOString() });
      return { ok: true };
    } catch (e) {
      if (e && (e.code === "not-found" || e.code === "permission-denied")) {
        return { ok: false, msg: "這個 Email 不在訂閱名單中，請確認拼字與大小寫是否正確。" };
      }
      return { ok: false, msg: "退訂暫時失敗，請稍後再試。若持續發生，歡迎直接來信告訴我。" };
    }
  }

  /* 自助退訂區：收合式，展開後輸入 Email 即可退訂，不需經過主編。 */
  function UnsubscribeBox() {
    const I = window.Icons;
    const [open, setOpen] = React.useState(false);
    const [email, setEmail] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState("");
    const [done, setDone] = React.useState(false);
    const [demo, setDemo] = React.useState(false);

    const unsubscribe = async () => {
      const v = email.trim();
      if (!EMAIL_RE.test(v)) { setErr("請輸入有效的 Email 地址。"); return; }
      setBusy(true); setErr("");
      const r = await submitUnsubscribe(v);
      setBusy(false);
      if (r.ok) { setDemo(!!r.demo); setDone(true); setEmail(""); }
      else setErr(r.msg);
    };

    if (!open) {
      return (
        <div style={{ textAlign: "center", marginTop: "var(--space-6)" }}>
          <button onClick={() => setOpen(true)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-3)", fontSize: 13, fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            想退訂？輸入 Email 即可自行取消訂閱
          </button>
        </div>
      );
    }
    return (
      <Card padding="var(--space-6)" style={{ marginTop: "var(--space-6)" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "var(--space-2) 0" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "var(--text-lg)", color: "var(--text-1)" }}>已完成退訂</div>
            <p style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
              {demo ? "（預覽模式：尚未連接資料庫，實際上線後將更新訂閱名單。）" : "你將不再收到電子報。隨時歡迎回來——重新訂閱即可恢復寄送。"}
            </p>
            <div style={{ marginTop: 14 }}><Button variant="secondary" size="sm" onClick={() => { setDone(false); setOpen(false); }}>關閉</Button></div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "var(--text-lg)", color: "var(--text-1)", marginBottom: 6 }}>退訂電子報</div>
            <p style={{ color: "var(--text-3)", fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.6 }}>
              輸入訂閱時使用的 Email，即可自行完成退訂，不需等候人工處理；之後重新訂閱就會恢復寄送。
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Input label="訂閱的 Email" icon={<I.mail size={17} />} placeholder="you@example.com" type="email"
                value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !busy) unsubscribe(); }}
                style={{ flex: 1, minWidth: 240 }} />
              <Button variant="secondary" disabled={busy} onClick={unsubscribe}>{busy ? "處理中…" : "確認退訂"}</Button>
              <Button variant="ghost" onClick={() => { setOpen(false); setErr(""); }}>取消</Button>
            </div>
            {err ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>{err}</div> : null}
          </div>
        )}
      </Card>
    );
  }

  function Subscribe() {
    const I = window.Icons;
    const [state, setState] = React.useState({ day: false, week: true, month: true });
    const [done, setDone] = React.useState(false);
    const [email, setEmail] = React.useState("");
    const [consent, setConsent] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState("");
    const [demo, setDemo] = React.useState(false);
    const [updated, setUpdated] = React.useState(false);

    const subscribe = async () => {
      const v = email.trim();
      if (!EMAIL_RE.test(v)) { setErr("請輸入有效的 Email 地址。"); return; }
      if (!state.day && !state.week && !state.month) { setErr("請至少選擇一種閱讀節奏（日報／週報／月報）。"); return; }
      if (!consent) { setErr("請勾選同意接收電子報，才能完成訂閱。"); return; }
      setBusy(true); setErr("");
      const r = await submitSubscription(v, state);
      setBusy(false);
      if (r.ok) { setDemo(!!r.demo); setUpdated(!!r.updated); setDone(true); setEmail(""); }
      else setErr(r.msg);
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
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-2xl)", color: "var(--text-1)" }}>{updated ? "訂閱設定已更新 🎉" : "訂閱成功 🎉"}</div>
                <p style={{ color: "var(--text-3)", marginTop: 8 }}>{demo ? "（預覽模式：尚未連接資料庫，實際上線後將寫入訂閱名單。）" : updated ? "已依最新選擇更新你的閱讀節奏；若先前退訂過，也已一併恢復寄送。" : "已加入訂閱名單，選定的節奏將依排程送達你的信箱。"}</p>
                <div style={{ marginTop: 18 }}><Button variant="secondary" onClick={() => setDone(false)}>返回</Button></div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "var(--text-xl)", color: "var(--text-1)", marginBottom: 6 }}>最後一步，留個 Email</div>
                <p style={{ color: "var(--text-3)", fontSize: 14, margin: "0 0 20px" }}>選定的節奏會依排程送達你的信箱。我們絕不寄送垃圾信。</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Input label="你的 Email" icon={<I.mail size={17} />} placeholder="you@example.com" type="email"
                    value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !busy) subscribe(); }}
                    style={{ flex: 1, minWidth: 240 }} />
                  <Button size="lg" iconRight={<I.arrow size={18} />} disabled={busy} onClick={subscribe}>{busy ? "送出中…" : "開始訂閱"}</Button>
                </div>
                {err ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>{err}</div> : null}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10 }}>
                  <Switch checked={consent} onChange={(v) => { setConsent(v); setErr(""); }} size="sm" />
                  <span style={{ color: "var(--text-3)", fontSize: 13 }}>我同意接收艾倫報報電子報，並可隨時一鍵退訂。</span>
                </div>
              </div>
            )}
          </Card>

          {/* 自助退訂 */}
          <UnsubscribeBox />
        </div>
      </div>
    );
  }
  window.Subscribe = Subscribe;
})();
