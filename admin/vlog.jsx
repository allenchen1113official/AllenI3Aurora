/* =====================================================================
   Vlog 影片系列 — aurora_vlog_episodes（各集：SEO 文案／章節／腳本／字幕／素材／發布）
   第一個系列：冰島環島 2026（12 集，種子資料 data/vlog/iceland-2026.json，
   由本面板「匯入系列 JSON」寫入 Firestore；成片 MP4 放 Google Drive，不進 repo）。
   工作流程：匯入 → 逐集編修標題／說明欄／標籤／章節／字幕 → 勾完檢查清單 →
   填 YouTube 影片 ID → 標記已發布 → 一鍵建立 PilotOne 社群貼文草稿。
   需於 admin.jsx 之後載入（共用 db、auth、errText、SOC_COLL）。掛 window.VlogPanel。
   ===================================================================== */
(function () {
const { useState, useEffect, useCallback, useMemo } = React;
const VL_COLL = "aurora_vlog_episodes";
const VL_SEED = "/AllenI3Aurora/data/vlog/iceland-2026.json";
const VL_ST = {
  draft:     { label: "草稿",   color: "var(--illumination)", bg: "var(--illumination-soft)" },
  ready:     { label: "待上傳", color: "var(--intelligence)", bg: "var(--intelligence-soft)" },
  published: { label: "已發布", color: "var(--success)",      bg: "var(--success-soft)" },
};
const VL_CHECK = [
  ["privacy", "個資遮蔽已確認（訂位代號／證件／車牌／收據）"],
  ["loudness", "響度 -14 LUFS、True Peak ≤ -1 dBTP"],
  ["subtitles", "字幕與畫面相符、SRT 可匯入"],
  ["thumbnail", "縮圖完成（1280×720）"],
  ["uploaded", "已上傳 YouTube 並填入影片 ID"],
];
const YT_LIMIT = { title: 100, description: 5000, tags: 500 };

function vlBadge(status) {
  const m = VL_ST[status] || VL_ST.draft;
  return <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: m.bg, color: m.color, border: "1px solid var(--border)" }}>{m.label}</span>;
}
const vlYtId = (s) => {
  const v = String(s || "").trim();
  const m = v.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{6,}$/.test(v) ? v : "");
};
const vlYtUrl = (id) => (id ? "https://www.youtube.com/watch?v=" + id : "");

/* SRT 解析／組裝（供驗證、平移、統計） */
function srtParse(text) {
  const cues = []; const blocks = String(text || "").replace(/\r/g, "").split(/\n\s*\n/);
  const toS = (t) => { const m = t.match(/(\d+):(\d\d):(\d\d)[,.](\d{1,3})/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, "0")) / 1000 : null; };
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const ti = lines.findIndex((l) => /-->/.test(l));
    if (ti < 0) continue;
    const [a, c] = lines[ti].split("-->").map((s) => toS(s.trim()));
    if (a == null || c == null) continue;
    cues.push({ a, b: c, text: lines.slice(ti + 1).join("\n") });
  }
  return cues;
}
function srtBuild(cues) {
  const f = (t) => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.round((t - Math.floor(t)) * 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`; };
  return cues.map((c, i) => `${i + 1}\n${f(c.a)} --> ${f(c.b)}\n${c.text}\n`).join("\n");
}
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function vlBlank(maxSort) {
  return { __new: true, series: "", seriesId: "", ep: (maxSort || 0) + 1, sort: (maxSort || 0) + 1, day: "", title: "", altTitles: ["", ""],
    thumbnailText: "", tags: "", description: "", pinnedComment: "", chapters: [{ t: "00:00", name: "冷開場" }], script: "", srt: "", srtShort: "",
    media: { youtubeId: "", youtubeUrl: "", driveFolder: "", fullVideo: "", trailer: "", thumbnail: "", duration: "", loudness: "", voice: "", music: "" },
    assets: { photos: [], photoCount: 0 }, checklist: {}, status: "draft", notes: "" };
}
function vlNormalize(r) {
  return { ...vlBlank(0), __new: false, ...r, altTitles: Array.isArray(r.altTitles) ? r.altTitles : [], chapters: Array.isArray(r.chapters) ? r.chapters : [],
    media: { ...vlBlank(0).media, ...(r.media || {}) }, assets: { photos: Array.isArray(r.assets && r.assets.photos) ? r.assets.photos : [], photoCount: (r.assets && r.assets.photoCount) || 0 }, checklist: r.checklist || {} };
}
function vlPayload(s) {
  const ytId = vlYtId(s.media.youtubeId || s.media.youtubeUrl);
  return {
    series: s.series || "", seriesId: s.seriesId || "", ep: Number(s.ep) || 0, sort: Number(s.sort) || 0, day: s.day || "",
    title: s.title || "", altTitles: (s.altTitles || []).map((x) => x || ""), thumbnailText: s.thumbnailText || "", tags: s.tags || "",
    description: s.description || "", pinnedComment: s.pinnedComment || "",
    chapters: (s.chapters || []).map((c) => ({ t: c.t || "", name: c.name || "" })),
    script: s.script || "", srt: s.srt || "", srtShort: s.srtShort || "",
    media: { ...s.media, youtubeId: ytId, youtubeUrl: ytId ? vlYtUrl(ytId) : (s.media.youtubeUrl || "") },
    assets: { photos: s.assets.photos || [], photoCount: (s.assets.photos || []).length },
    checklist: s.checklist || {}, status: s.status || "draft", notes: s.notes || "",
    updatedAt: new Date().toISOString(),
  };
}
/* YouTube 說明欄要放的章節時間軸（YouTube 需首條為 00:00、至少 3 條） */
function chaptersText(ch) { return (ch || []).filter((c) => c.t && c.name).map((c) => `${c.t} ${c.name}`).join("\n"); }
function descWithChapters(desc, ch) {
  const block = "章節：\n" + chaptersText(ch);
  if (/章節：\n(?:\d\d:\d\d [^\n]*\n?)+/.test(desc)) return desc.replace(/章節：\n(?:\d\d:\d\d [^\n]*\n?)+/, block + "\n");
  return desc ? desc + "\n\n" + block : block;
}
async function copyText(text, setToast, label) {
  try { await navigator.clipboard.writeText(text); setToast((label || "已複製") + " ✓"); }
  catch { window.prompt("複製這段內容：", text); }
  setTimeout(() => setToast(""), 2500);
}
function dl(name, text, type) {
  const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function VlogPanel() {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("seo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("全部");
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [shift, setShift] = useState("0");

  const load = useCallback(async () => {
    setErr("");
    try { const snap = await db.collection(VL_COLL).orderBy("sort").get(); setList(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))); }
    catch (ex) { setErr("讀取失敗：" + errText(ex)); setList([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const maxSort = (list || []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
  const seriesList = ["全部", ...Array.from(new Set((list || []).map((r) => r.series).filter(Boolean)))];
  const setF = (k, v) => setSel((s) => ({ ...s, [k]: v }));
  const setM = (k, v) => setSel((s) => ({ ...s, media: { ...s.media, [k]: v } }));
  const setChk = (k, v) => setSel((s) => ({ ...s, checklist: { ...s.checklist, [k]: v } }));
  const setChap = (i, k, v) => setSel((s) => { const chapters = [...s.chapters]; chapters[i] = { ...chapters[i], [k]: v }; return { ...s, chapters }; });

  /* 匯入種子 JSON（data/vlog/*.json）：doc id = episode.id，預設不覆寫已存在者 */
  const importSeed = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(VL_SEED, { cache: "no-store" });
      if (!res.ok) throw new Error("讀取 " + VL_SEED + " 失敗（HTTP " + res.status + "）");
      const data = await res.json();
      const existing = new Set((list || []).map((r) => r.id));
      let n = 0, skipped = 0;
      for (const e of data.episodes || []) {
        if (existing.has(e.id) && !importOverwrite) { skipped++; continue; }
        const { id, ...rest } = e;
        await db.collection(VL_COLL).doc(id).set({ ...rest, updatedAt: new Date().toISOString() }, { merge: importOverwrite });
        n++;
      }
      await load();
      setToast(`已匯入 ${n} 集${skipped ? `，略過已存在 ${skipped} 集（勾「覆寫」可重新匯入）` : ""} ✓`); setTimeout(() => setToast(""), 5000);
    } catch (ex) { setErr("匯入失敗：" + errText(ex)); }
    setBusy(false);
  };

  const save = async (extra, msg) => {
    if (!sel) return false;
    setBusy(true); setErr("");
    const payload = { ...vlPayload(sel), ...(extra || {}) };
    try {
      if (sel.__new) {
        const id = (sel.seriesId || "vlog") + "-ep" + String(Number(sel.ep) || 0).padStart(2, "0") + (list && list.some((r) => r.id === (sel.seriesId || "vlog") + "-ep" + String(Number(sel.ep) || 0).padStart(2, "0")) ? "-" + Date.now().toString(36) : "");
        await db.collection(VL_COLL).doc(id).set(payload); setSel((s) => ({ ...s, __new: false, id, ...(extra || {}) }));
      } else { await db.collection(VL_COLL).doc(sel.id).update(payload); setSel((s) => ({ ...s, ...(extra || {}), media: payload.media })); }
      await load(); setToast(msg || "已儲存 ✓"); setTimeout(() => setToast(""), 3000); setBusy(false); return true;
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); setBusy(false); return false; }
  };
  const remove = async () => {
    if (!sel || sel.__new) { setSel(null); return; }
    if (!window.confirm(`確定刪除「${sel.title || sel.id}」整集資料（文案／腳本／字幕）？Drive 上的影片不受影響。`)) return;
    setBusy(true);
    try { await db.collection(VL_COLL).doc(sel.id).delete(); setSel(null); await load(); } catch (ex) { setErr("刪除失敗：" + errText(ex)); }
    setBusy(false);
  };
  /* 建立 PilotOne 社群貼文草稿（FB 圖文＋YouTube 連結），之後到「PilotOne 審核」核准排程 */
  const createSocialDraft = async () => {
    const ytId = vlYtId(sel.media.youtubeId || sel.media.youtubeUrl);
    if (!ytId && !window.confirm("尚未填 YouTube 影片 ID，貼文將不含影片連結。仍要建立草稿？")) return;
    const lead = String(sel.description || "").split("\n").filter((l) => l.trim() && !/^(章節|本集花費|裝備|本集重點)/.test(l)).slice(0, 2).join("\n");
    const tags = (sel.description.match(/#[^\s#]+/g) || []).slice(0, 8).join(" ");
    const caption = [sel.title, lead, tags].filter(Boolean).join("\n\n");
    const now = new Date().toISOString();
    setBusy(true);
    try {
      const ref = await db.collection(SOC_COLL).add({
        title: `Vlog ${sel.series || ""} EP${String(sel.ep).padStart(2, "0")} · ${sel.title}`.trim(),
        imageUrl: ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : "", scheduledAt: "", queueState: "draft", note: "由 Vlog 影片系列建立",
        source: { type: "vlog", episodeId: sel.id, series: sel.seriesId || "", ep: Number(sel.ep) || 0 },
        fb: { enabled: true, caption, link: vlYtUrl(ytId), state: "draft", attempts: 0, error: null, postId: null },
        ig: { enabled: false, state: "skipped" }, lock: { by: null, at: null }, createdAt: now, updatedAt: now,
      });
      setToast("已建立 PilotOne 貼文草稿 ✓（" + ref.id.slice(0, 6) + "…）到「PilotOne 審核」核准排程"); setTimeout(() => setToast(""), 5000);
    } catch (ex) { setErr("建立貼文失敗：" + errText(ex)); }
    setBusy(false);
  };

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
  const tabBtn = (id, label) => <button className={"ad-btn" + (tab === id ? " primary" : " ghost")} onClick={() => setTab(id)} style={{ padding: "8px 14px" }}>{label}</button>;
  const Counter = ({ n, max }) => <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: n > max ? "var(--danger)" : "var(--text-4)" }}>{n}／{max}</span>;
  const CopyBtn = ({ text, label }) => <button className="ad-btn ghost" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => copyText(text, setToast, label)}>⧉ 複製</button>;

  /* ---------- 列表 ---------- */
  if (!sel) {
    const rows = (list || []).filter((r) => seriesFilter === "全部" || r.series === seriesFilter);
    const done = (r) => VL_CHECK.filter(([k]) => r.checklist && r.checklist[k]).length;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>Vlog 影片系列</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{VL_COLL} · {list ? list.length : "…"} 集 · SEO 文案／章節／腳本／字幕／素材／發布</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ color: "var(--text-3)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={importOverwrite} onChange={(e) => setImportOverwrite(e.target.checked)} />覆寫已存在</label>
            <button className="ad-btn" onClick={importSeed} disabled={busy}>⬆ 匯入系列 JSON（冰島 12 集）</button>
            <button className="ad-btn primary" onClick={() => { setSel(vlBlank(maxSort)); setTab("seo"); }}>＋ 新增一集</button>
          </div>
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
        <div style={{ color: "var(--text-4)", fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
          流程：匯入種子（<code>data/vlog/iceland-2026.json</code>，成片與縮圖在 Google Drive「2026冰島旅行／YouTube製作包／EPxx」）→ 逐集編修標題、說明欄、標籤、章節、字幕 → 勾完檢查清單 → 上傳 YouTube 後填影片 ID、標記已發布 → 一鍵建立 PilotOne 貼文草稿。公開頁 <a href="/AllenI3Aurora/vlog.html" target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>vlog.html</a> 只列已發布集數。
        </div>
        {seriesList.length > 1 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {seriesList.map((s) => <button key={s} className="ad-btn ghost" onClick={() => setSeriesFilter(s)} style={{ padding: "6px 12px", fontSize: 12.5, borderColor: seriesFilter === s ? "var(--border-aurora)" : "var(--border)", background: seriesFilter === s ? "var(--brand-soft)" : "transparent", color: seriesFilter === s ? "var(--text-1)" : "var(--text-4)" }}>{s}</button>)}
          </div>
        )}
        {list == null ? <div style={{ color: "var(--text-3)", padding: 20 }}>載入中…</div>
          : rows.length === 0 ? <div style={{ color: "var(--text-3)", padding: 20 }}>尚無集數。按「匯入系列 JSON」載入冰島 12 集，或「新增一集」。</div>
          : <div style={{ display: "grid", gap: 10 }}>
            {rows.map((r) => (
              <button key={r.id} onClick={() => { setSel(vlNormalize(r)); setTab("seo"); }} style={{ textAlign: "left", cursor: "pointer", background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--brand)", fontSize: 13 }}>EP{String(r.ep || 0).padStart(2, "0")}</span>
                  <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: "var(--night-700)", color: "var(--text-2)" }}>{r.series || "—"}</span>
                  {vlBadge(r.status)}
                  <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{r.day || ""}{r.media && r.media.duration ? " · " + r.media.duration : ""}</span>
                  <span style={{ color: done(r) === VL_CHECK.length ? "var(--success)" : "var(--text-4)", fontSize: 11.5 }}>☑ {done(r)}／{VL_CHECK.length}</span>
                  {r.srt ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ 字幕 {srtParse(r.srt).length} 句</span> : null}
                  {Array.isArray(r.chapters) && r.chapters.length ? <span style={{ color: "var(--illumination)", fontSize: 11.5 }}>▣ {r.chapters.length} 章</span> : null}
                  {r.media && r.media.youtubeId ? <span style={{ color: "var(--success)", fontSize: 11.5 }}>▶ YouTube</span> : <span style={{ color: "var(--text-4)", fontSize: 11.5 }}>○ 未填影片 ID</span>}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 16 }}>{r.title || "（未命名）"}</div>
              </button>
            ))}
          </div>}
      </div>
    );
  }

  /* ---------- 編輯 ---------- */
  const ytId = vlYtId(sel.media.youtubeId || sel.media.youtubeUrl);
  const cues = srtParse(sel.srt); const cuesShort = srtParse(sel.srtShort);
  const descLines = String(sel.description || "").split("\n");
  const chapOk = sel.chapters.length >= 3 && sel.chapters[0] && sel.chapters[0].t === "00:00";
  const exportMeta = () => dl(`EP${String(sel.ep).padStart(2, "0")}_YouTube上傳文案.txt`, ["【標題】", sel.title, "", "【備用標題】", ...(sel.altTitles || []), "", "【說明欄】", sel.description, "", "【標籤】", sel.tags, "", "【縮圖文字】", sel.thumbnailText, "", "【置頂留言】", sel.pinnedComment].join("\n"));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="ad-btn ghost" onClick={() => setSel(null)}>← 返回列表</button>
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: 0 }}>{sel.__new ? "新增一集" : `EP${String(sel.ep).padStart(2, "0")} 編輯`}</h2>
            <div style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{sel.series || "—"} · {sel.day || ""} · {sel.id || "新"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {vlBadge(sel.status)}
          <button className="ad-btn primary" onClick={() => save()} disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
          {sel.status !== "published"
            ? <button className="ad-btn primary" disabled={busy} onClick={() => { if (!ytId && !window.confirm("尚未填 YouTube 影片 ID，仍要標記已發布？公開頁將無法嵌入影片。")) return; save({ status: "published", publishedAt: new Date().toISOString() }, "已標記為已發布 ✓"); }}>✓ 標記已發布</button>
            : <button className="ad-btn ghost" disabled={busy} onClick={() => save({ status: "ready" }, "已退回待上傳")}>退回待上傳</button>}
          <button className="ad-btn danger" onClick={remove} disabled={busy}>{sel.__new ? "取消" : "刪除"}</button>
        </div>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("seo", "標題與 SEO 文案")}{tabBtn("chapters", "章節與腳本")}{tabBtn("srt", `字幕 SRT（${cues.length}）`)}{tabBtn("media", "素材與影音")}{tabBtn("publish", "檢查與發布")}
      </div>

      {tab === "seo" && (
        <div>
          <div style={box}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">系列 series</label><input className="ad-in" value={sel.series} onChange={(e) => setF("series", e.target.value)} placeholder="冰島環島 2026" /></div>
              <div><label className="ad-lbl">系列代碼 seriesId</label><input className="ad-in" value={sel.seriesId} onChange={(e) => setF("seriesId", e.target.value)} placeholder="iceland2026" /></div>
              <div><label className="ad-lbl">集數 ep</label><input className="ad-in" type="number" value={sel.ep} onChange={(e) => setF("ep", e.target.value)} /></div>
              <div><label className="ad-lbl">排序 sort</label><input className="ad-in" type="number" value={sel.sort} onChange={(e) => setF("sort", e.target.value)} /></div>
              <div><label className="ad-lbl">對應日期 day</label><input className="ad-in" value={sel.day} onChange={(e) => setF("day", e.target.value)} placeholder="2026-09-25" /></div>
            </div>
          </div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><label className="ad-lbl" style={{ flex: 1 }}>主標題 title <Counter n={sel.title.length} max={YT_LIMIT.title} /></label><CopyBtn text={sel.title} label="已複製標題" /></div>
            <input className="ad-in" value={sel.title} onChange={(e) => setF("title", e.target.value)} />
            <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 6 }}>下標六法：具體數字（奇數佳）＋關鍵字＋受眾＋理由／承諾；可用「為什麼／如何」；標題須與內容相符。</div>
            {sel.altTitles.map((t, i) => (
              <div key={i} style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "end" }}>
                <div style={{ flex: 1 }}><label className="ad-lbl">備用標題 {String.fromCharCode(65 + i)}（A/B 測試）</label><input className="ad-in" value={t} onChange={(e) => setSel((s) => { const a = [...s.altTitles]; a[i] = e.target.value; return { ...s, altTitles: a }; })} /></div>
                <button className="ad-btn ghost" style={{ padding: "9px 10px" }} title="與主標題交換" onClick={() => setSel((s) => { const a = [...s.altTitles]; const m = s.title; const alt = a[i]; a[i] = m; return { ...s, title: alt, altTitles: a }; })}>⇅</button>
              </div>
            ))}
            <button className="ad-btn ghost" style={{ marginTop: 8, padding: "6px 10px" }} onClick={() => setF("altTitles", [...sel.altTitles, ""])}>＋ 備用標題</button>
          </div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><label className="ad-lbl" style={{ flex: 1 }}>說明欄 description <Counter n={sel.description.length} max={YT_LIMIT.description} /></label>
              <button className="ad-btn ghost" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => setF("description", descWithChapters(sel.description, sel.chapters))}>↻ 同步章節時間軸</button><CopyBtn text={sel.description} label="已複製說明欄" /></div>
            <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", padding: "8px 10px", marginBottom: 8, background: "var(--night-850)" }}>
              <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 4 }}>搜尋結果只顯示前 2 行：</div>
              <div style={{ color: "var(--text-2)", fontSize: 13, whiteSpace: "pre-wrap" }}>{descLines.slice(0, 2).join("\n") || "（空）"}</div>
            </div>
            <textarea className="ad-in" style={{ minHeight: 320, fontFamily: "var(--font-body)" }} value={sel.description} onChange={(e) => setF("description", e.target.value)} />
          </div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><label className="ad-lbl" style={{ flex: 1 }}>標籤 tags（逗號分隔）<Counter n={sel.tags.length} max={YT_LIMIT.tags} /></label><CopyBtn text={sel.tags} label="已複製標籤" /></div>
            <textarea className="ad-in" style={{ minHeight: 60, fontFamily: "var(--font-body)" }} value={sel.tags} onChange={(e) => setF("tags", e.target.value)} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{sel.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: "var(--radius-pill)", fontSize: 11.5, background: "var(--night-700)", color: "var(--text-2)" }}>{t}</span>)}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            <div style={box}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><label className="ad-lbl" style={{ flex: 1 }}>縮圖文字（大字｜小字）</label><CopyBtn text={sel.thumbnailText} /></div><input className="ad-in" value={sel.thumbnailText} onChange={(e) => setF("thumbnailText", e.target.value)} /></div>
            <div style={box}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><label className="ad-lbl" style={{ flex: 1 }}>置頂留言 pinnedComment</label><CopyBtn text={sel.pinnedComment} label="已複製置頂留言" /></div><textarea className="ad-in" style={{ minHeight: 120, fontFamily: "var(--font-body)" }} value={sel.pinnedComment} onChange={(e) => setF("pinnedComment", e.target.value)} /></div>
          </div>
          <button className="ad-btn" onClick={exportMeta}>⬇ 匯出上傳文案 .txt</button>
        </div>
      )}

      {tab === "chapters" && (
        <div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", flex: 1 }}>章節 chapters（{sel.chapters.length}）{!chapOk && <span style={{ color: "var(--danger)", fontSize: 12, marginLeft: 8 }}>YouTube 章節需首條 00:00 且至少 3 條</span>}</div>
              <button className="ad-btn ghost" style={{ padding: "6px 10px" }} onClick={() => {
                const found = [...String(sel.script || "").matchAll(/^## \[(\d\d:\d\d)(?:[–-]\d\d:\d\d)?\] (.+)$/gm)].map((m) => ({ t: m[1], name: m[2].trim() }));
                if (found.length) setF("chapters", found); else setErr("腳本裡找不到「## [mm:ss] 章節名」格式的標題");
              }}>從腳本擷取</button>
              <CopyBtn text={chaptersText(sel.chapters)} label="已複製章節" />
              <button className="ad-btn primary" style={{ padding: "6px 10px" }} onClick={() => setF("chapters", [...sel.chapters, { t: "", name: "" }])}>＋ 章節</button>
            </div>
            {sel.chapters.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto auto auto", gap: 8, marginBottom: 6, alignItems: "center" }}>
                <input className="ad-in" value={c.t} onChange={(e) => setChap(i, "t", e.target.value)} placeholder="mm:ss" style={{ fontFamily: "var(--font-mono)" }} />
                <input className="ad-in" value={c.name} onChange={(e) => setChap(i, "name", e.target.value)} placeholder="章節名" />
                <button className="ad-btn ghost" style={{ padding: "5px 9px" }} disabled={i === 0} onClick={() => setSel((s) => { const a = [...s.chapters]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...s, chapters: a }; })}>↑</button>
                <button className="ad-btn ghost" style={{ padding: "5px 9px" }} disabled={i === sel.chapters.length - 1} onClick={() => setSel((s) => { const a = [...s.chapters]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...s, chapters: a }; })}>↓</button>
                <button className="ad-btn danger" style={{ padding: "5px 9px" }} onClick={() => setF("chapters", sel.chapters.filter((_, x) => x !== i))}>✕</button>
              </div>
            ))}
          </div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><label className="ad-lbl" style={{ flex: 1 }}>旁白腳本與分鏡 script（Markdown，{String(sel.script || "").replace(/[^\u4e00-\u9fff]/g, "").length} 中文字）</label><button className="ad-btn ghost" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => dl(`EP${String(sel.ep).padStart(2, "0")}_旁白腳本與分鏡.md`, sel.script, "text/markdown")}>⬇ .md</button></div>
            <textarea className="ad-in" style={{ minHeight: 480, fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.6 }} value={sel.script} onChange={(e) => setF("script", e.target.value)} placeholder={"## [00:00] 冷開場\n旁白…\n> 🎬 B-ROLL：照片檔名區間"} />
          </div>
        </div>
      )}

      {tab === "srt" && (
        <div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <label className="ad-lbl" style={{ flex: 1, margin: 0 }}>正片字幕 srt · {cues.length} 句 · {cues.length ? `${fmtT(cues[0].a)} → ${fmtT(cues[cues.length - 1].b)}` : "—"}</label>
              <input className="ad-in" style={{ width: 90 }} value={shift} onChange={(e) => setShift(e.target.value)} title="平移秒數（可負）" />
              <button className="ad-btn ghost" style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => { const d = Number(shift) || 0; setF("srt", srtBuild(cues.map((c) => ({ ...c, a: c.a + d, b: c.b + d })))); }}>⇄ 整體平移（秒）</button>
              <button className="ad-btn ghost" style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => setF("srt", srtBuild(cues))}>重新編號／格式化</button>
              <button className="ad-btn ghost" style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => dl(`EP${String(sel.ep).padStart(2, "0")}_正片_字幕.srt`, sel.srt)}>⬇ .srt</button>
            </div>
            <textarea className="ad-in" style={{ minHeight: 420, fontSize: 12.5 }} value={sel.srt} onChange={(e) => setF("srt", e.target.value)} placeholder={"1\n00:00:01,000 --> 00:00:04,000\n字幕文字"} />
            {cues.length > 0 && (() => { const bad = cues.filter((c) => c.b <= c.a || c.text.split("\n").some((l) => l.length > 24)); return bad.length ? <div style={{ color: "var(--illumination)", fontSize: 12, marginTop: 6 }}>⚠ {bad.length} 句時間倒置或單行超過 24 字，請檢查。</div> : <div style={{ color: "var(--success)", fontSize: 12, marginTop: 6 }}>✓ 格式與長度檢查通過</div>; })()}
          </div>
          <div style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><label className="ad-lbl" style={{ flex: 1, margin: 0 }}>短版預告字幕 srtShort · {cuesShort.length} 句</label><button className="ad-btn ghost" style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => dl(`EP${String(sel.ep).padStart(2, "0")}_短版預告_字幕.srt`, sel.srtShort)}>⬇ .srt</button></div>
            <textarea className="ad-in" style={{ minHeight: 160, fontSize: 12.5 }} value={sel.srtShort} onChange={(e) => setF("srtShort", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "media" && (
        <div>
          <div style={box}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">YouTube 影片 ID 或網址</label><input className="ad-in" value={sel.media.youtubeId || sel.media.youtubeUrl} onChange={(e) => { setM("youtubeId", e.target.value); setM("youtubeUrl", vlYtUrl(vlYtId(e.target.value))); }} placeholder="dQw4w9WgXcQ 或 https://youtu.be/…" /></div>
              <div><label className="ad-lbl">長度 duration</label><input className="ad-in" value={sel.media.duration} onChange={(e) => setM("duration", e.target.value)} placeholder="18:00" /></div>
              <div><label className="ad-lbl">響度 loudness</label><input className="ad-in" value={sel.media.loudness} onChange={(e) => setM("loudness", e.target.value)} /></div>
              <div><label className="ad-lbl">旁白 voice</label><input className="ad-in" value={sel.media.voice} onChange={(e) => setM("voice", e.target.value)} /></div>
              <div><label className="ad-lbl">音樂 music</label><input className="ad-in" value={sel.media.music} onChange={(e) => setM("music", e.target.value)} /></div>
            </div>
            {ytId ? <div style={{ marginTop: 14, aspectRatio: "16/9", maxWidth: 640 }}><iframe title="yt" src={`https://www.youtube-nocookie.com/embed/${ytId}`} style={{ width: "100%", height: "100%", border: 0, borderRadius: "var(--radius-md)" }} allowFullScreen /></div>
              : <div style={{ marginTop: 12, color: "var(--text-4)", fontSize: 12 }}>填入影片 ID 後此處顯示預覽；公開頁 vlog.html 也以此嵌入。</div>}
          </div>
          <div style={box}>
            <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8 }}>Google Drive 成片與素材（檔案不進 repo）</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">Drive 資料夾</label><input className="ad-in" value={sel.media.driveFolder} onChange={(e) => setM("driveFolder", e.target.value)} /></div>
              <div><label className="ad-lbl">正片檔名</label><input className="ad-in" value={sel.media.fullVideo} onChange={(e) => setM("fullVideo", e.target.value)} /></div>
              <div><label className="ad-lbl">短版預告檔名</label><input className="ad-in" value={sel.media.trailer} onChange={(e) => setM("trailer", e.target.value)} /></div>
              <div><label className="ad-lbl">縮圖檔名／網址</label><input className="ad-in" value={sel.media.thumbnail} onChange={(e) => setM("thumbnail", e.target.value)} /></div>
            </div>
            {/^https?:/.test(sel.media.thumbnail || "") && <img src={sel.media.thumbnail} alt="" style={{ marginTop: 12, maxWidth: 320, borderRadius: "var(--radius-md)" }} />}
          </div>
          <div style={box}>
            <label className="ad-lbl">使用照片清單 assets.photos（每行一個檔名，{sel.assets.photos.length} 張；Canon 273A＝當日、iPhone IMG＝依 EXIF）</label>
            <textarea className="ad-in" style={{ minHeight: 160, fontSize: 12 }} value={sel.assets.photos.join("\n")} onChange={(e) => setSel((s) => ({ ...s, assets: { ...s.assets, photos: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } }))} />
          </div>
          <div style={box}>
            <label className="ad-lbl">製作備註 notes</label>
            <textarea className="ad-in" style={{ minHeight: 90, fontFamily: "var(--font-body)" }} value={sel.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="待補素材、下次重剪要改的地方…" />
          </div>
        </div>
      )}

      {tab === "publish" && (
        <div>
          <div style={box}>
            <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 10 }}>上傳前檢查清單</div>
            {VL_CHECK.map(([k, label]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", color: sel.checklist[k] ? "var(--text-1)" : "var(--text-3)", fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" checked={!!sel.checklist[k]} onChange={(e) => setChk(k, e.target.checked)} />{label}
              </label>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-4)" }}>標題 {sel.title.length}／{YT_LIMIT.title} · 說明欄 {sel.description.length}／{YT_LIMIT.description} · 標籤 {sel.tags.length}／{YT_LIMIT.tags} · 章節 {chapOk ? "✓" : "✗"} · 字幕 {cues.length} 句</div>
          </div>
          <div style={box}>
            <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8 }}>YouTube 上傳順序</div>
            <ol style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
              <li>YouTube Studio 上傳 Drive 的 <code>{sel.media.fullVideo || "正片"}</code>，標題／說明欄／標籤用上方「⧉ 複製」貼上。</li>
              <li>「字幕」頁匯入 <code>{`EP${String(sel.ep).padStart(2, "0")}_正片_字幕.srt`}</code>（語言：中文（台灣））。</li>
              <li>縮圖上傳 <code>{sel.media.thumbnail || "縮圖"}</code>；發布後貼上置頂留言。</li>
              <li>回到這裡填影片 ID → 勾完清單 → 「標記已發布」 → 「建立 PilotOne 貼文草稿」到審核面板排程。</li>
            </ol>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ad-btn" onClick={exportMeta}>⬇ 匯出上傳文案 .txt</button>
            <button className="ad-btn" onClick={() => dl(`${sel.id || "episode"}.json`, JSON.stringify(vlPayload(sel), null, 2), "application/json")}>⬇ 匯出本集 JSON</button>
            <button className="ad-btn primary" onClick={createSocialDraft} disabled={busy}>✈ 建立 PilotOne 貼文草稿</button>
          </div>
        </div>
      )}
    </div>
  );
}
window.VlogPanel = VlogPanel;
})();
