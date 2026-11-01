/* =====================================================================
   YouTube 頻道（後台導覽「YouTube 頻道」、admin/#youtube）
   三分頁：
     總覽     頻道統計（youtube-sync 每日同步，aurora_youtube/channel＋history）與排程器狀態
     影片     最新影片清單（aurora_youtube/videos）→ 一鍵加入電子報草稿（YouTube 區塊）
     上傳排程 aurora_youtube_uploads：從 Vlog 集數帶入文案／Drive 成片／字幕 → 核准 →
             youtube-upload.yml 每 15 分鐘上傳、交給 YouTube 原生排程公開（狀態機 scripts/youtube/core.mjs）
   日期一律台北時間。需於 admin.jsx 之後載入（共用 db、auth、errText、OWNER_EMAIL）。掛 window.YouTubePanel。
   ===================================================================== */
(function () {
const { useState, useEffect, useCallback } = React;
const YT_UP = "aurora_youtube_uploads";
const YT_LIMIT = { title: 100, description: 5000, tags: 500 };
const CATS = [["19", "旅遊與活動"], ["22", "人物與網誌"], ["28", "科學與技術"], ["27", "教育"], ["10", "音樂"], ["17", "運動"], ["2", "汽車與交通工具"]];
const ST = {
  draft:            { label: "草稿",          color: "var(--text-2)",       bg: "var(--night-700)" },
  approved:         { label: "已核准・待上傳", color: "var(--illumination)", bg: "var(--illumination-soft)" },
  uploading:        { label: "上傳中",        color: "var(--illumination)", bg: "var(--illumination-soft)" },
  processing:       { label: "YouTube 處理中", color: "var(--intelligence)", bg: "var(--intelligence-soft)" },
  scheduled:        { label: "已排程公開",     color: "var(--intelligence)", bg: "var(--brand-soft)" },
  cancel_requested: { label: "撤銷中",        color: "var(--illumination)", bg: "var(--illumination-soft)" },
  published:        { label: "已完成",        color: "var(--success)",      bg: "var(--success-soft)" },
  failed:           { label: "失敗",          color: "var(--danger)",       bg: "var(--night-700)" },
};
const ACTIVE = ["approved", "uploading", "processing", "scheduled", "cancel_requested"];
const PRIV = { public: "公開", unlisted: "不公開（知道連結者可看）", private: "私人" };

/* 台北時間 ↔ ISO（datetime-local 一律視為台北時間，不依瀏覽器時區） */
const tpeInput = (iso) => { const t = Date.parse(iso || ""); return isFinite(t) ? new Date(t + 8 * 3600e3).toISOString().slice(0, 16) : ""; };
const tpeToIso = (v) => { const t = Date.parse((v || "") + ":00+08:00"); return isFinite(t) ? new Date(t).toISOString() : ""; };
const tpeFmt = (iso) => { const s = tpeInput(iso); return s ? s.replace("T", " ") : "—"; };
const num = (n) => { n = Number(n) || 0; return n >= 1e4 ? (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "萬" : n.toLocaleString("en-US"); };
const ago = (iso) => { const t = Date.parse(iso || ""); if (!isFinite(t)) return "從未"; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + " 分鐘前" : m < 2880 ? Math.round(m / 60) + " 小時前" : Math.round(m / 1440) + " 天前"; };
const watch = (id) => "https://www.youtube.com/watch?v=" + id;
const core = () => window.AuroraYouTubeCore || null;

function Badge({ state }) {
  const m = ST[state] || ST.draft;
  return <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: m.bg, color: m.color, border: "1px solid var(--border)", whiteSpace: "nowrap" }}>{m.label}</span>;
}
function Spark({ data, w = 220, h = 44 }) {
  const pts = (data || []).filter((x) => x != null);
  if (pts.length < 2) return <div style={{ color: "var(--text-4)", fontSize: 12 }}>累積兩天以上資料後顯示走勢</div>;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 4 - (v - lo) / span * (h - 8)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="訂閱走勢"><path d={d} fill="none" stroke="var(--illumination)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function blankJob() {
  return { __new: true, title: "", description: "", tags: "", privacy: "public", categoryId: "19", madeForKids: false, language: "zh-TW",
    scheduledAt: "", drive: { folder: "", file: "", thumbnail: "" }, captions: { srt: "", lang: "zh-TW", name: "中文（台灣）" },
    source: { type: "manual" }, state: "draft", attempts: 0, error: null, note: "" };
}
function jobPayload(j) {
  return {
    title: j.title || "", description: j.description || "", tags: j.tags || "", privacy: j.privacy || "public",
    categoryId: String(j.categoryId || "19"), madeForKids: !!j.madeForKids, language: j.language || "zh-TW",
    scheduledAt: j.scheduledAt || "", note: j.note || "",
    drive: { folder: (j.drive && j.drive.folder) || "", file: (j.drive && j.drive.file) || "", thumbnail: (j.drive && j.drive.thumbnail) || "" },
    captions: { srt: (j.captions && j.captions.srt) || "", lang: (j.captions && j.captions.lang) || "zh-TW", name: (j.captions && j.captions.name) || "中文（台灣）" },
    source: j.source || { type: "manual" },
    updatedAt: new Date().toISOString(),
  };
}
/* 與 core.mjs validateJob 同規則；核心模組尚未載入時的備援 */
function validate(j) {
  const c = core();
  if (c) return c.validateJob(j);
  const e = [];
  if (!String(j.title || "").trim()) e.push("缺少標題");
  if (!j.videoId && !(j.drive && j.drive.file)) e.push("缺少 Drive 成片檔名");
  return e;
}

function YouTubePanel() {
  const [tab, setTab] = useState(() => (location.hash === "#youtube-uploads" ? "uploads" : "overview"));
  const [channel, setChannel] = useState(undefined);
  const [history, setHistory] = useState([]);
  const [videos, setVideos] = useState(null);
  const [meta, setMeta] = useState({});
  const [jobs, setJobs] = useState(null);
  const [issues, setIssues] = useState(null);
  const [vlogs, setVlogs] = useState(null);
  const [sel, setSel] = useState(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  const loadChannel = useCallback(async () => {
    try {
      const [c, h, v, s, u] = await Promise.all(["channel", "history", "videos"].map((d) => db.collection("aurora_youtube").doc(d).get())
        .concat(["sync", "uploader"].map((d) => db.collection("aurora_youtube_meta").doc(d).get().catch(() => null))));
      setChannel(c.exists ? c.data() : null);
      setHistory((h.exists && h.data().days) || []);
      setVideos((v.exists && v.data().items) || []);
      setMeta({ sync: s && s.exists ? s.data() : null, uploader: u && u.exists ? u.data() : null });
    } catch (ex) { setErr("讀取頻道資料失敗：" + errText(ex)); setChannel(null); setVideos([]); }
  }, []);
  const loadJobs = useCallback(async () => {
    try { const snap = await db.collection(YT_UP).orderBy("createdAt", "desc").limit(100).get(); setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }
    catch (ex) { setErr("讀取上傳排程失敗：" + errText(ex)); setJobs([]); }
  }, []);
  useEffect(() => { loadChannel(); loadJobs(); }, [loadChannel, loadJobs]);
  // 上傳進行中時每 30 秒自動重新整理進度
  useEffect(() => {
    if (!(jobs || []).some((j) => ["uploading", "processing", "approved"].includes(j.state))) return;
    const t = setInterval(loadJobs, 30000); return () => clearInterval(t);
  }, [jobs, loadJobs]);

  const loadIssues = async () => {
    if (issues) return;
    try { const snap = await db.collection("aurora_issues").get(); setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 30)); }
    catch (ex) { setErr("讀取電子報失敗：" + errText(ex)); setIssues([]); }
  };
  const loadVlogs = async () => {
    if (vlogs) return;
    try { const snap = await db.collection("aurora_vlog_episodes").orderBy("sort").get(); setVlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }
    catch (ex) { setErr("讀取 Vlog 集數失敗：" + errText(ex)); setVlogs([]); }
  };

  /* 影片 → 電子報：在選定的期別最後面加一個 YouTube 區塊 */
  const addToIssue = async (v, issueId) => {
    const is = (issues || []).find((x) => x.id === issueId);
    if (!is) return;
    if ((is.pubStatus || "published") === "published" && !window.confirm(`「${is.kind} 第 ${is.no} 期」已發布，加入後前台會立即顯示這支影片。確定？`)) return;
    setBusy(true);
    try {
      const blocks = [...(Array.isArray(is.blocks) ? is.blocks : []), { t: "youtube", url: watch(v.id), videoId: v.id, title: v.title, text: "" }];
      await db.collection("aurora_issues").doc(is.id).update({ blocks });
      setIssues((l) => l.map((x) => (x.id === is.id ? { ...x, blocks } : x)));
      flash(`已加入「${is.kind} 第 ${is.no} 期」最後一個區塊 ✓ 可到「電子報」調整位置與導讀`);
    } catch (ex) { setErr("加入電子報失敗：" + errText(ex)); }
    setBusy(false);
  };

  /* ---------- 上傳排程：編輯／核准／撤銷 ---------- */
  const fromVlog = (epId) => {
    const e = (vlogs || []).find((x) => x.id === epId);
    if (!e) return;
    const m = e.media || {};
    setSel((s) => ({ ...s, title: e.title || "", description: e.description || "", tags: e.tags || "",
      drive: { folder: m.driveFolder || "", file: m.fullVideo || "", thumbnail: m.thumbnail || "" },
      captions: { ...s.captions, srt: e.srt || "" },
      source: { type: "vlog", episodeId: e.id, series: e.seriesId || "", ep: Number(e.ep) || 0 } }));
    flash(`已帶入 EP${String(e.ep || 0).padStart(2, "0")} 的文案、Drive 檔名與字幕`);
  };
  const saveJob = async (extra) => {
    setBusy(true); setErr("");
    const payload = { ...jobPayload(sel), ...(extra || {}) };
    try {
      let id = sel.id;
      if (sel.__new) {
        const now = new Date().toISOString();
        const ref = await db.collection(YT_UP).add({ ...payload, state: payload.state || "draft", attempts: 0, error: null, videoId: null,
          uploadUrl: null, uploadedBytes: 0, totalBytes: 0, extras: {}, lock: { by: null, at: null }, createdAt: now });
        id = ref.id;
      } else await db.collection(YT_UP).doc(sel.id).update(payload);
      await loadJobs(); setSel(null); setBusy(false); return id;
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); setBusy(false); return null; }
  };
  const approve = async (immediate) => {
    const errs = validate(sel);
    if (errs.length) { setErr("無法核准：" + errs.join("；")); return; }
    let iso = "";
    if (!immediate) {
      iso = tpeToIso(when);
      if (!iso) { setErr("請選擇公開時間（台北時間），或按「立即上傳並公開」。"); return; }
      if (Date.parse(iso) < Date.now() - 60000) { setErr("公開時間已過，請重選或改按「立即上傳並公開」。"); return; }
    }
    const lead = iso ? (Date.parse(iso) - Date.now()) / 60000 : 0;
    const msg = !iso ? `核准立即上傳？影片將以「${PRIV[sel.privacy] || "公開"}」發布到 YouTube。`
      : lead >= 15 ? `核准排程：上傳後先設為私人，於 ${tpeFmt(iso)}（台北）由 YouTube 自動公開。` : "公開時間在 15 分鐘內，上傳完成後會直接依「公開狀態」發布。確定？";
    if (!window.confirm(msg + "\n\n上傳由排程器每 15 分鐘執行，大檔可能需要 1～2 輪。")) return;
    const id = await saveJob({ scheduledAt: iso, state: "approved", attempts: 0, error: null, warning: null,
      review: { approvedAt: new Date().toISOString(), by: (auth.currentUser && auth.currentUser.email) || "" } });
    if (id) flash("已核准 ✓ 排程器下一輪開始上傳");
  };
  const cancel = async (j) => {
    if (!window.confirm(j.videoId ? "撤銷後影片會改為私人並取消排程公開（不會刪除影片），工作退回草稿。確定？" : "撤銷這個上傳工作？")) return;
    setBusy(true);
    try {
      const ref = db.collection(YT_UP).doc(j.id);
      await db.runTransaction(async (tx) => {
        const d = (await tx.get(ref)).data() || {};
        const at = Date.parse((d.lock && d.lock.at) || "");
        const idle = !(d.lock && d.lock.by && isFinite(at) && Date.now() - at < 90 * 60000);
        // 尚未交給 YouTube（沒有影片、沒有上傳 session）且沒被排程器鎖住 → 直接退回草稿；其餘交排程器處理
        if (d.state === "approved" && !d.videoId && !d.uploadUrl && idle) tx.update(ref, { state: "draft", updatedAt: new Date().toISOString() });
        else tx.update(ref, { state: "cancel_requested", updatedAt: new Date().toISOString() });
      });
      await loadJobs(); flash("已送出撤銷 ✓");
    } catch (ex) { setErr("撤銷失敗：" + errText(ex)); }
    setBusy(false);
  };
  const retry = async (j) => {
    setBusy(true);
    try { await db.collection(YT_UP).doc(j.id).update({ state: "approved", attempts: 0, error: null, updatedAt: new Date().toISOString() }); await loadJobs(); flash("已重新排入 ✓"); }
    catch (ex) { setErr("重試失敗：" + errText(ex)); }
    setBusy(false);
  };
  const removeJob = async (j) => {
    if (!window.confirm(j.videoId ? "只刪除這筆排程紀錄，YouTube 上的影片不受影響。確定？" : "刪除這個上傳工作？")) return;
    try { await db.collection(YT_UP).doc(j.id).delete(); await loadJobs(); setSel(null); } catch (ex) { setErr("刪除失敗：" + errText(ex)); }
  };

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
  const tabBtn = (id, label) => <button className={"ad-btn" + (tab === id ? " primary" : " ghost")} onClick={() => { setTab(id); setSel(null); }} style={{ padding: "8px 14px" }}>{label}</button>;
  const Stat = ({ label, value, sub }) => (
    <div style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", minWidth: 120 }}>
      <div style={{ color: "var(--text-4)", fontSize: 11.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, color: "var(--text-1)" }}>{value}</div>
      {sub ? <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{sub}</div> : null}
    </div>
  );
  const activeCount = (jobs || []).filter((j) => ACTIVE.includes(j.state)).length;

  /* ---------- 上傳工作編輯 ---------- */
  if (sel) {
    const locked = !["draft", "failed", "published"].includes(sel.state || "draft");
    const set = (k, v) => setSel((s) => ({ ...s, [k]: v }));
    const setD = (k, v) => setSel((s) => ({ ...s, drive: { ...s.drive, [k]: v } }));
    const errs = validate(sel);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <button className="ad-btn ghost" onClick={() => setSel(null)}>← 返回</button>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 20, margin: 0, flex: 1 }}>{sel.__new ? "新增上傳工作" : "編輯上傳工作"}</h2>
          <Badge state={sel.state} />
        </div>
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
        {locked && <div style={{ ...box, color: "var(--illumination)", fontSize: 13 }}>此工作已交給排程器（{(ST[sel.state] || {}).label}），需先撤銷才能修改。</div>}
        <fieldset disabled={locked || busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div style={box}>
            <label className="ad-lbl">從 Vlog 集數帶入（標題／說明欄／標籤／Drive 成片與縮圖／字幕）</label>
            <select className="ad-in" value="" onFocus={loadVlogs} onChange={(e) => fromVlog(e.target.value)}>
              <option value="">{vlogs ? `選擇集數…（${vlogs.length} 集）` : "點選載入集數…"}</option>
              {(vlogs || []).map((e) => <option key={e.id} value={e.id}>{e.series || ""} EP{String(e.ep || 0).padStart(2, "0")} · {e.title}{e.media && e.media.youtubeId ? "（已有影片 ID）" : ""}</option>)}
            </select>
            {sel.source && sel.source.type === "vlog" ? <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 6 }}>來源：{sel.source.episodeId}（上傳完成後自動回填影片 ID；公開後標記為已發布）</div> : null}
          </div>
          <div style={box}>
            <label className="ad-lbl">標題 <span style={{ color: sel.title.length > YT_LIMIT.title ? "var(--danger)" : "var(--text-4)" }}>{sel.title.length}／{YT_LIMIT.title}</span></label>
            <input className="ad-in" value={sel.title} onChange={(e) => set("title", e.target.value)} />
            <label className="ad-lbl" style={{ marginTop: 12 }}>說明欄 <span style={{ color: sel.description.length > YT_LIMIT.description ? "var(--danger)" : "var(--text-4)" }}>{sel.description.length}／{YT_LIMIT.description}</span></label>
            <textarea className="ad-in" style={{ minHeight: 220, fontFamily: "var(--font-body)" }} value={sel.description} onChange={(e) => set("description", e.target.value)} />
            <label className="ad-lbl" style={{ marginTop: 12 }}>標籤（逗號分隔，總長 500 內，超出部分上傳時捨去）</label>
            <textarea className="ad-in" style={{ minHeight: 56, fontFamily: "var(--font-body)" }} value={sel.tags} onChange={(e) => set("tags", e.target.value)} />
          </div>
          <div style={box}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">公開狀態（立即發布時採用）</label>
                <select className="ad-in" value={sel.privacy} onChange={(e) => set("privacy", e.target.value)}>{Object.keys(PRIV).map((k) => <option key={k} value={k}>{PRIV[k]}</option>)}</select></div>
              <div><label className="ad-lbl">類別</label>
                <select className="ad-in" value={sel.categoryId} onChange={(e) => set("categoryId", e.target.value)}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label className="ad-lbl">語言</label><input className="ad-in" value={sel.language} onChange={(e) => set("language", e.target.value)} /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-2)", fontSize: 13, paddingTop: 22 }}><input type="checkbox" checked={!!sel.madeForKids} onChange={(e) => set("madeForKids", e.target.checked)} />為兒童打造（影響留言與廣告）</label>
            </div>
          </div>
          <div style={box}>
            <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8 }}>Google Drive 成片（官方管理者帳號的 Drive）</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div><label className="ad-lbl">資料夾路徑（/ 分隔）</label><input className="ad-in" value={sel.drive.folder} onChange={(e) => setD("folder", e.target.value)} placeholder="2026冰島旅行/YouTube製作包/EP01" /></div>
              <div><label className="ad-lbl">成片檔名、檔案 ID 或分享網址</label><input className="ad-in" value={sel.drive.file} onChange={(e) => setD("file", e.target.value)} placeholder="EP01_正片18分鐘.mp4" /></div>
              <div><label className="ad-lbl">縮圖檔名（≤ 2 MB，選填）</label><input className="ad-in" value={sel.drive.thumbnail} onChange={(e) => setD("thumbnail", e.target.value)} placeholder="EP01_縮圖.jpg" /></div>
            </div>
            <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 8 }}>自訂縮圖需頻道已完成電話驗證；字幕會以「{sel.captions.name}」上傳。</div>
          </div>
          <div style={box}>
            <label className="ad-lbl">字幕 SRT（選填，{(sel.captions.srt.match(/-->/g) || []).length} 句）</label>
            <textarea className="ad-in" style={{ minHeight: 120, fontSize: 12 }} value={sel.captions.srt} onChange={(e) => setSel((s) => ({ ...s, captions: { ...s.captions, srt: e.target.value } }))} />
          </div>
        </fieldset>
        {sel.videoId ? <div style={{ ...box, fontSize: 13, color: "var(--text-2)" }}>已上傳：<a href={watch(sel.videoId)} target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>{sel.videoId}</a>（再次核准只會更新文案與公開設定，不會重新上傳）</div> : null}
        {!locked && (
          <div style={{ ...box, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <label className="ad-lbl">公開時間（台北）</label>
              <input className="ad-in" type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setErr(""); }} style={{ width: "auto" }} />
            </div>
            <button className="ad-btn primary" disabled={busy} onClick={() => approve(false)}>✓ 核准排程上傳</button>
            <button className="ad-btn" disabled={busy} onClick={() => approve(true)}>立即上傳並公開</button>
            <button className="ad-btn ghost" disabled={busy} onClick={async () => { if (await saveJob()) flash("已儲存草稿 ✓"); }}>儲存草稿</button>
            {!sel.__new && <button className="ad-btn danger" disabled={busy} onClick={() => removeJob(sel)}>刪除</button>}
            {errs.length ? <div style={{ color: "var(--illumination)", fontSize: 12, width: "100%" }}>⚠ {errs.join("；")}</div> : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>YouTube 頻道</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>aurora_youtube · {YT_UP} · youtube-sync／youtube-upload</div>
        </div>
        <button className="ad-btn ghost" onClick={() => { loadChannel(); loadJobs(); }} disabled={busy}>↻ 重新整理</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("overview", "總覽")}{tabBtn("videos", `影片（${videos ? videos.length : "…"}）`)}{tabBtn("uploads", `上傳排程${activeCount ? `（進行中 ${activeCount}）` : ""}`)}
      </div>

      {tab === "overview" && (
        channel === undefined ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
        : !channel ? (
          <div style={{ ...box, color: "var(--text-3)", fontSize: 13.5, lineHeight: 1.8 }}>
            尚未同步頻道資料。請依 <code>docs/YOUTUBE_SOP.md</code> 在 GitHub Secrets 設定 <code>YT_API_KEY</code>＋<code>YT_CHANNEL_ID</code>（只讀）或 OAuth 三件組（含上傳），
            再到「排程監控」或 GitHub Actions 手動執行「YouTube 頻道同步」。
          </div>
        ) : (
          <div>
            <div style={{ ...box, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {channel.thumb ? <img src={channel.thumb} alt="" style={{ width: 64, height: 64, borderRadius: "50%" }} /> : null}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20, color: "var(--text-1)" }}>{channel.title}</div>
                <a href={channel.url} target="_blank" rel="noopener" style={{ color: "var(--brand)", fontSize: 13 }}>{channel.handle || channel.id} ↗</a>
                <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 4 }}>同步：{ago(channel.updatedAt)}（{tpeFmt(channel.updatedAt)}）</div>
              </div>
              <Stat label="訂閱" value={channel.subscribers == null ? "隱藏" : num(channel.subscribers)} />
              <Stat label="總觀看" value={num(channel.views)} />
              <Stat label="影片" value={num(channel.videos)} />
            </div>
            <div style={box}>
              <div style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 8 }}>訂閱走勢（近 {Math.min(history.length, 30)} 天，台北日期）</div>
              <Spark data={history.slice(-30).map((h) => h.subscribers)} w={520} />
              <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 6 }}>首頁統計卡「YouTube 訂閱」由同步排程寫入 aurora_stats/youtube_subscribers，與 TAIEX 並列顯示。</div>
            </div>
          </div>
        )
      )}

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {[["頻道同步 youtube-sync", meta.sync, (m) => `模式：${m.mode === "oauth" ? "OAuth（含私人影片）" : "API Key（只讀公開）"} · 影片 ${m.videos}`],
            ["上傳排程 youtube-upload", meta.uploader, (m) => `本輪 ${m.processed || 0} 筆 · 失敗 ${m.failed || 0}${m.quota ? " · 配額用完" : ""}`]].map(([label, m, line]) => (
            <div key={label} style={box}>
              <div style={{ color: "var(--text-2)", fontSize: 13.5, fontWeight: 700 }}>{label}</div>
              {!m ? <div style={{ color: "var(--text-4)", fontSize: 12.5, marginTop: 6 }}>尚未執行（未設定 Secrets 時排程器只會略過）</div> : (
                <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
                  <div style={{ color: m.error ? "var(--danger)" : "var(--success)" }}>{m.error ? "✕ " + m.error : "● 正常"}</div>
                  <div style={{ color: "var(--text-3)" }}>最後執行：{ago(m.lastRunAt)} · {line(m)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "videos" && (
        videos == null ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
        : !videos.length ? <div style={{ color: "var(--text-3)" }}>尚無影片資料（頻道同步執行後出現）。</div>
        : <div style={{ display: "grid", gap: 10 }}>
          {videos.map((v) => (
            <div key={v.id} style={{ ...box, marginBottom: 0, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <a href={watch(v.id)} target="_blank" rel="noopener" style={{ position: "relative", flex: "none" }}>
                <img src={v.thumb} alt="" style={{ width: 168, aspectRatio: "16/9", objectFit: "cover", borderRadius: "var(--radius-md)", display: "block" }} />
                <span style={{ position: "absolute", right: 6, bottom: 6, background: "#000", color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>{v.duration}</span>
              </a>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 15 }}>{v.title}</div>
                <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{tpeFmt(v.publishedAt)}</span><span>👁 {num(v.views)}</span><span>♥ {num(v.likes)}</span><span>💬 {num(v.comments)}</span>
                  {v.isShort ? <span style={{ color: "var(--illumination)" }}>Shorts</span> : null}
                  {v.privacy !== "public" ? <span style={{ color: "var(--intelligence)" }}>{v.publishAt ? "排程 " + tpeFmt(v.publishAt) : PRIV[v.privacy] || v.privacy}</span> : null}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="ad-btn ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => { navigator.clipboard.writeText(watch(v.id)).then(() => flash("已複製網址 ✓"), () => window.prompt("複製網址：", watch(v.id))); }}>⧉ 網址</button>
                <select className="ad-in" style={{ width: "auto", padding: "6px 8px", fontSize: 12.5 }} value="" onFocus={loadIssues} onChange={(e) => addToIssue(v, e.target.value)} disabled={busy}>
                  <option value="">＋ 加入電子報…</option>
                  {(issues || []).map((is) => <option key={is.id} value={is.id}>{is.kind} 第 {is.no} 期 · {(is.title || "").slice(0, 24)}{(is.pubStatus || "published") !== "published" ? "（草稿）" : ""}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "uploads" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button className="ad-btn primary" onClick={() => { setSel(blankJob()); setWhen(""); setErr(""); loadVlogs(); }}>＋ 新增上傳工作</button>
            <div style={{ color: "var(--text-4)", fontSize: 12, flex: 1, minWidth: 260 }}>核准後由 youtube-upload 每 15 分鐘處理：Drive 下載 → 分段上傳（可續傳）→ 縮圖＋字幕 → 依公開時間交給 YouTube 排程。每輪上傳一支。</div>
          </div>
          {jobs == null ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
            : !jobs.length ? <div style={{ ...box, color: "var(--text-3)" }}>尚無上傳工作。可從 Vlog 集數帶入文案後核准。</div>
            : <div style={{ display: "grid", gap: 10 }}>
              {jobs.map((j) => {
                const pct = j.totalBytes ? Math.min(100, Math.round((j.uploadedBytes || 0) / j.totalBytes * 100)) : 0;
                return (
                  <div key={j.id} style={{ ...box, marginBottom: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <Badge state={j.state} />
                      <span style={{ color: "var(--text-3)", fontSize: 12 }}>{j.scheduledAt ? "公開 " + tpeFmt(j.scheduledAt) : "立即"} · {PRIV[j.privacy] || "公開"}</span>
                      {j.source && j.source.type === "vlog" ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ Vlog EP{String(j.source.ep || 0).padStart(2, "0")}</span> : null}
                      {j.videoId ? <a href={watch(j.videoId)} target="_blank" rel="noopener" style={{ color: "var(--brand)", fontSize: 12 }}>▶ {j.videoId}</a> : null}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 15 }}>{j.title || "（未命名）"}</div>
                    <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 2 }}>{[j.drive && j.drive.folder, j.drive && j.drive.file].filter(Boolean).join(" / ")}</div>
                    {j.state === "uploading" || (j.totalBytes && j.state === "approved" && j.uploadedBytes) ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ height: 6, background: "var(--night-700)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: "var(--illumination)" }} /></div>
                        <div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 3 }}>{pct}% · {((j.uploadedBytes || 0) / 1048576).toFixed(0)}／{(j.totalBytes / 1048576).toFixed(0)} MB · {ago(j.updatedAt)}更新</div>
                      </div>
                    ) : null}
                    {j.extras && (j.extras.thumbnail || j.extras.captions) ? <div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 6 }}>縮圖：{j.extras.thumbnail || "—"} · 字幕：{j.extras.captions || "—"}</div> : null}
                    {j.error ? <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>✕ {j.error}{j.attempts ? `（第 ${j.attempts} 次）` : ""}</div> : null}
                    {j.warning ? <div style={{ color: "var(--illumination)", fontSize: 12.5, marginTop: 6 }}>⚠ {j.warning}</div> : null}
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {["draft", "failed", "published"].includes(j.state || "draft") && <button className="ad-btn ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={() => { setSel({ ...blankJob(), ...j, __new: false, drive: { ...blankJob().drive, ...(j.drive || {}) }, captions: { ...blankJob().captions, ...(j.captions || {}) } }); setWhen(tpeInput(j.scheduledAt)); setErr(""); }}>{j.state === "published" ? "檢視／重新核准" : "編輯／核准"}</button>}
                      {j.state === "failed" && <button className="ad-btn" style={{ padding: "5px 10px", fontSize: 12.5 }} disabled={busy} onClick={() => retry(j)}>↻ 重試</button>}
                      {["approved", "uploading", "processing", "scheduled"].includes(j.state) && <button className="ad-btn danger" style={{ padding: "5px 10px", fontSize: 12.5 }} disabled={busy} onClick={() => cancel(j)}>撤銷</button>}
                    </div>
                  </div>
                );
              })}
            </div>}
        </div>
      )}
    </div>
  );
}
window.YouTubePanel = YouTubePanel;
})();
