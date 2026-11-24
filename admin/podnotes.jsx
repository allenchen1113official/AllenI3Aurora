/* =====================================================================
   Podcast 重點筆記（後台導覽「Podcast 重點筆記」、admin/#podnotes）
   常聽 Podcast 每集：Mac mini 轉錄 → Claude 校正逐字稿、康乃爾筆記、三平台文案、莫蘭迪藍圖卡 → PilotOne 審核。
   三分頁：
     筆記    已完成的集數（同源 data/podnotes.json）：重點、康乃爾筆記、社群圖卡、PilotOne 草稿連結；
             點開可讀逐字稿（Firestore aurora_podcast_transcripts，管理者唯讀；不在前台公開）
     轉錄    Mac mini 引擎進度中屬於 Podcast 的集數（aurora_ops/ytnotes_progress，與「YouTube 轉錄」同一份）
     啟用節目 勾選要做逐字稿＋筆記＋送審的節目（aurora_podnotes/shows，公開讀；Mac mini 每 30 分鐘讀一次），
             節目清單與 RSS 來自網站 scripts/podcast/feeds.json；後台沒設定的節目看 feeds.json 的 notes 欄位
   需於 admin.jsx 之後載入（共用 db、errText）。掛 window.PodNotesPanel。
   ===================================================================== */
(function () {
const { useState, useEffect, useCallback } = React;
const BASE = "/AllenI3Aurora/";
const SHOWS_DOC = () => db.collection("aurora_podnotes").doc("shows");
const TR_COLL = "aurora_podcast_transcripts";
const POD_ID = /^[a-z0-9][a-z0-9-]{1,30}-\d{8}$/;
const ST = { queued: "排隊中", processing: "轉錄中", drafted: "草稿完成・等 Claude 筆記", failed: "失敗", done: "已送審" };
const ST_COLOR = { processing: "var(--illumination)", drafted: "var(--intelligence)", failed: "var(--danger)", done: "var(--success)" };
const tpeFmt = (iso) => { const t = Date.parse(iso || ""); return isFinite(t) ? new Date(t + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "—"; };
const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
const chip = (on) => ({ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800,
  background: on ? "var(--brand-soft)" : "var(--night-700)", color: on ? "var(--text-1)" : "var(--text-3)", border: "1px solid var(--border)" });

/* ---------------- 啟用節目 ---------------- */
function ShowsTab() {
  const [feeds, setFeeds] = useState(null);
  const [remote, setRemote] = useState(null);     // {code: enabled}｜null＝尚未存過
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    setMsg("");
    try {
      const r = await fetch(BASE + "scripts/podcast/feeds.json", { cache: "no-store" });
      setFeeds(((await r.json()).shows || []).filter((s) => s.code));
    } catch (e) { setMsg("讀取節目清單失敗：" + e.message); setFeeds([]); }
    try {
      const snap = await SHOWS_DOC().get();
      const m = snap.exists ? Object.fromEntries(((snap.data() || {}).items || []).map((x) => [x.code, x.enabled === true])) : null;
      setRemote(m); setDraft(m || {});
    } catch (e) { setMsg("讀取後台設定失敗：" + errText(e)); setRemote(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const on = (s) => (s.code in draft ? draft[s.code] : !!s.notes);
  const dirty = feeds && feeds.some((s) => on(s) !== (remote && s.code in remote ? remote[s.code] : !!s.notes));
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const items = feeds.map((s) => ({ code: s.code, enabled: on(s) }));
      await SHOWS_DOC().set({ items, updatedAt: new Date().toISOString() });
      setMsg("已儲存 ✓ Mac mini 引擎最慢 30 分鐘內讀到新設定（只處理 36 小時內發布的集數，不會補做舊集）。");
      await load();
    } catch (e) { setMsg("儲存失敗：" + errText(e)); }
    setBusy(false);
  };
  if (!feeds) return <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>;
  return (
    <div>
      <div style={{ color: "var(--text-4)", fontSize: 12.5, lineHeight: 1.7, marginBottom: 12 }}>
        勾選的節目，每天最新 1 集會在 Mac mini 自動轉錄，再由 Claude 整理康乃爾筆記、三平台文案與圖卡送 PilotOne 審核。
        節目與 RSS 在 <code>scripts/podcast/feeds.json</code> 維護（新增節目請在那裡補 RSS 與代碼）。
        {remote == null ? "　目前沿用 feeds.json 的預設值（尚未在後台存過）。" : ""}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {feeds.map((s) => (
          <label key={s.code} style={{ ...box, marginBottom: 0, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "12px 16px" }}>
            <input type="checkbox" checked={on(s)} onChange={(e) => setDraft((d) => ({ ...d, [s.code]: e.target.checked }))} style={{ width: 18, height: 18 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--text-1)", fontWeight: 700 }}>{s.show}</div>
              <div style={{ color: "var(--text-4)", fontSize: 11.5, fontFamily: "var(--font-mono)" }}>{s.code} · {s.lang === "en" ? "英文" : "中文"} · {s.feed ? "RSS ✓" : "尚無 RSS（無法處理）"}</div>
            </div>
            <span style={chip(on(s))}>{on(s) ? "做筆記" : "不處理"}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button className="ad-btn primary" onClick={save} disabled={busy || !dirty}>{busy ? "儲存中…" : "儲存啟用設定"}</button>
        {msg ? <span style={{ color: msg.includes("失敗") ? "var(--danger)" : "var(--success)", fontSize: 13 }}>{msg}</span> : null}
      </div>
    </div>
  );
}

/* ---------------- 轉錄進度（Podcast 部分） ---------------- */
function ProgressTab() {
  const [doc, setDoc] = useState(undefined);
  useEffect(() => db.doc("aurora_ops/ytnotes_progress").onSnapshot((s) => setDoc(s.exists ? s.data() : null), () => setDoc(null)), []);
  if (doc === undefined) return <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>;
  const items = ((doc && doc.items) || []).filter((x) => POD_ID.test(x.id || ""));
  const cur = doc && doc.current && POD_ID.test(doc.current.id || "") ? doc.current : null;
  return (
    <div>
      <div style={{ color: "var(--text-4)", fontSize: 12.5, marginBottom: 12 }}>
        引擎最後回報：{doc ? tpeFmt(doc.updatedAt) : "—"}（台北）· 與 PilotOne 中控台「YouTube 轉錄」同一份進度檔；Claude 筆記排程每天 11:23／22:23 處理「草稿完成」的集數。
      </div>
      {cur ? <div style={{ ...box, borderColor: "var(--illumination)" }}>▶ {cur.author}〈{cur.title}〉— {cur.stageLabel || cur.stage}</div> : null}
      {items.length === 0 ? <div style={{ color: "var(--text-3)", padding: 12 }}>目前沒有 Podcast 集數在處理（引擎每 30 分鐘讀一次 RSS）。</div> : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((x) => (
            <div key={x.id} style={{ ...box, marginBottom: 0, padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...chip(false), color: ST_COLOR[x.state] || "var(--text-2)" }}>{ST[x.state] || x.state}</span>
                <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{x.id}{x.at ? " · " + tpeFmt(x.at) : ""}</span>
              </div>
              <div style={{ color: "var(--text-1)", fontWeight: 700, marginTop: 6 }}>{x.author}〈{x.title || "（讀取中）"}〉</div>
              {x.error ? <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }}>{x.error}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- 單集：筆記＋圖卡＋逐字稿 ---------------- */
function EpisodeDetail({ ep, onBack }) {
  const [tr, setTr] = useState(undefined);
  const [q, setQ] = useState("");
  useEffect(() => {
    db.collection(TR_COLL).doc(ep.id).get().then((s) => setTr(s.exists ? s.data() : null)).catch((e) => setTr({ error: errText(e) }));
  }, [ep.id]);
  const rows = (ep.cornell && ep.cornell.rows) || [];
  const lines = tr && tr.transcript ? tr.transcript.split(/\n+/) : [];
  const shown = q ? lines.filter((l) => l.toLowerCase().includes(q.toLowerCase())) : lines;
  const copy = () => { try { navigator.clipboard.writeText(tr.transcript); } catch (e) {} };
  const draftId = `cs_pn-${ep.id}_${ep.added}`;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button className="ad-btn ghost" onClick={onBack}>← 返回</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--text-1)", fontWeight: 800, fontSize: 18 }}>{ep.show}〈{ep.title}〉</div>
          <div style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{ep.id} · {ep.date} · {ep.duration}</div>
        </div>
        <a className="ad-btn ghost" href={`${BASE}podcast.html?pn=${ep.id}#pn-${ep.id}`} target="_blank" rel="noopener noreferrer">前台筆記 ↗</a>
        <a className="ad-btn ghost" href={`${BASE}admin/pilotone/#review`} target="_blank" rel="noopener noreferrer" title={draftId}>PilotOne 審核 ↗</a>
        {ep.url ? <a className="ad-btn ghost" href={ep.url} target="_blank" rel="noopener noreferrer">原節目 ↗</a> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <div style={box}>
          <div className="ad-lbl">社群標題</div>
          <div style={{ color: "var(--text-1)", fontWeight: 700, marginBottom: 10 }}>{ep.headline || "—"}</div>
          <div className="ad-lbl">重點摘要</div>
          <ul style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.7, margin: "0 0 10px", paddingLeft: 18 }}>{(ep.summary || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          <div className="ad-lbl">康乃爾筆記</div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "0.9fr 1.8fr", gap: 10, padding: "6px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <b style={{ color: "var(--intelligence)", fontSize: 13 }}>{r.cue}</b><span style={{ color: "var(--text-2)", fontSize: 13 }}>{r.note}</span>
            </div>
          ))}
          {ep.cornell && ep.cornell.summary ? <div style={{ marginTop: 8, color: "var(--text-1)", fontSize: 13 }}>總結：{ep.cornell.summary}</div> : null}
        </div>
        <div style={box}>
          <div className="ad-lbl">社群圖卡（莫蘭迪藍）</div>
          {ep.cards && ep.cards.ig ? <img src={BASE + ep.cards.ig} alt="IG 圖卡" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} /> : <div style={{ color: "var(--text-4)" }}>尚未同步圖卡</div>}
          {ep.cards && ep.cards.fb ? <img src={BASE + ep.cards.fb} alt="FB 圖卡" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", marginTop: 10 }} /> : null}
        </div>
      </div>
      <div style={box}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <div className="ad-lbl" style={{ margin: 0 }}>逐字稿（僅管理者可見，不在前台公開）{tr && tr.chars ? `· ${tr.chars.toLocaleString()} 字` : ""}</div>
          <div style={{ flex: 1 }} />
          {tr && tr.transcript ? <input className="ad-in" style={{ maxWidth: 220 }} placeholder="搜尋逐字稿…" value={q} onChange={(e) => setQ(e.target.value)} /> : null}
          {tr && tr.transcript ? <button className="ad-btn ghost" onClick={copy}>複製全文</button> : null}
        </div>
        {tr === undefined ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
          : tr === null ? <div style={{ color: "var(--text-4)" }}>逐字稿尚未同步（focus-update 每 3 小時從 Drive notes/podcast/transcripts/ 同步）。</div>
          : tr.error ? <div style={{ color: "var(--danger)" }}>讀取失敗：{tr.error}</div>
          : (
            <div style={{ maxHeight: 520, overflow: "auto", background: "var(--night-850)", borderRadius: "var(--radius-md)", padding: "12px 14px",
              color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {shown.length ? shown.join("\n\n") : "（沒有符合的段落）"}
              {tr.truncated ? "\n\n…（逐字稿過長，後台僅存前 25 萬字；全文在 Drive 筆記）" : ""}
            </div>
          )}
        {tr && tr.transcriber ? <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 6 }}>轉錄：{tr.transcriber}</div> : null}
      </div>
    </div>
  );
}

function NotesTab() {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [show, setShow] = useState("全部");
  useEffect(() => {
    fetch(BASE + "data/podnotes.json", { cache: "no-store" }).then((r) => r.json()).then((d) => setData(d.items || [])).catch(() => setData([]));
  }, []);
  if (sel) return <EpisodeDetail ep={sel} onBack={() => setSel(null)} />;
  if (!data) return <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>;
  const shows = ["全部", ...Array.from(new Set(data.map((x) => x.show)))];
  const list = data.filter((x) => show === "全部" || x.show === show);
  return (
    <div>
      {shows.length > 2 ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {shows.map((s) => <button key={s} className="ad-btn ghost" style={{ padding: "6px 12px", fontSize: 12.5, ...(show === s ? { background: "var(--brand-soft)", color: "var(--text-1)" } : {}) }} onClick={() => setShow(s)}>{s}</button>)}
        </div>
      ) : null}
      {list.length === 0 ? <div style={{ color: "var(--text-3)", padding: 12 }}>還沒有完成的筆記。啟用節目後，Mac mini 轉錄完成、Claude 筆記排程（11:23／22:23）處理後會出現在這裡。</div> : (
        <div style={{ display: "grid", gap: 10 }}>
          {list.map((x) => (
            <button key={x.id} onClick={() => setSel(x)} style={{ ...box, marginBottom: 0, textAlign: "left", cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
              {x.cards && x.cards.ig ? <img src={BASE + x.cards.ig} alt="" loading="lazy" style={{ width: 72, height: 72, borderRadius: 8, objectFit: "cover", flex: "none" }} /> : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={chip(true)}>{x.show}</span>
                  <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{x.date} · {x.duration}</span>
                </div>
                <div style={{ color: "var(--text-1)", fontWeight: 800, marginTop: 4 }}>{x.headline || x.title}</div>
                <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PodNotesPanel() {
  const [tab, setTab] = useState("notes");
  const t = (id, label) => <button className={"ad-btn" + (tab === id ? " primary" : " ghost")} style={{ padding: "8px 14px" }} onClick={() => setTab(id)}>{label}</button>;
  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: "0 0 4px" }}>Podcast 重點筆記</h2>
      <div style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 14 }}>常聽節目逐字稿 → 康乃爾筆記 → FB／IG／Threads 文案與莫蘭迪藍圖卡 → PilotOne 審核發布。SOP：docs/PODNOTES_SOP.md</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>{t("notes", "筆記與逐字稿")}{t("progress", "轉錄進度")}{t("shows", "啟用節目")}</div>
      {tab === "notes" ? <NotesTab /> : tab === "progress" ? <ProgressTab /> : <ShowsTab />}
    </div>
  );
}
window.PodNotesPanel = PodNotesPanel;
})();
