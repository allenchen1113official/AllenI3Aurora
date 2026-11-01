/* =====================================================================
   YouTube 頻道（後台導覽「YouTube 頻道」、admin/#youtube）
   三分頁：
     總覽  頻道統計與訂閱走勢（youtube-sync 每日同步：aurora_youtube/channel＋history）、同步狀態
     影片  最新影片清單（aurora_youtube/videos）→ 一鍵加入電子報（YouTube 區塊）
     上傳  PilotOne 的 YouTube 貼文（aurora_social_posts 中 yt.enabled）進度一覽；
           建立／核准在「PilotOne 中控台」（狀態機 scripts/social/core.mjs 的 yt 頻道）
   日期一律台北時間。需於 admin.jsx 之後載入（共用 db、errText、SOC_COLL）。掛 window.YouTubePanel。
   ===================================================================== */
(function () {
const { useState, useEffect, useCallback } = React;
const YT_ST = { draft: "草稿", approved: "已核准・待上傳", publishing: "上傳中", scheduled: "已排程公開", cancel_requested: "取消中",
  published: "已發布", failed: "失敗", skipped: "未啟用" };
const YT_ST_COLOR = { approved: "var(--illumination)", publishing: "var(--illumination)", scheduled: "var(--intelligence)", cancel_requested: "var(--illumination)",
  published: "var(--success)", failed: "var(--danger)" };
const PRIV = { public: "公開", unlisted: "不公開（知道連結者可看）", private: "私人" };

/* 台北時間 ↔ ISO（datetime-local 一律視為台北時間，不依瀏覽器時區） */
const tpeInput = (iso) => { const t = Date.parse(iso || ""); return isFinite(t) ? new Date(t + 8 * 3600e3).toISOString().slice(0, 16) : ""; };
const tpeToIso = (v) => { const t = Date.parse((v || "") + ":00+08:00"); return isFinite(t) ? new Date(t).toISOString() : ""; };
const tpeFmt = (iso) => { const s = tpeInput(iso); return s ? s.replace("T", " ") : "—"; };
const num = (n) => { n = Number(n) || 0; return n >= 1e4 ? (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "萬" : n.toLocaleString("en-US"); };
const ago = (iso) => { const t = Date.parse(iso || ""); if (!isFinite(t)) return "從未"; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + " 分鐘前" : m < 2880 ? Math.round(m / 60) + " 小時前" : Math.round(m / 1440) + " 天前"; };
const watch = (id) => "https://www.youtube.com/watch?v=" + id;

function Spark({ data, w = 220, h = 44 }) {
  const pts = (data || []).filter((x) => x != null);
  if (pts.length < 2) return <div style={{ color: "var(--text-4)", fontSize: 12 }}>累積兩天以上資料後顯示走勢</div>;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 4 - (v - lo) / span * (h - 8)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="訂閱走勢"><path d={d} fill="none" stroke="var(--illumination)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function YouTubePanel() {
  const [tab, setTab] = useState("overview");
  const [channel, setChannel] = useState(undefined);
  const [history, setHistory] = useState([]);
  const [videos, setVideos] = useState(null);
  const [meta, setMeta] = useState({});
  const [jobs, setJobs] = useState(null);
  const [issues, setIssues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 4000); };

  const loadChannel = useCallback(async () => {
    try {
      const [c, h, v, s] = await Promise.all(["channel", "history", "videos"].map((d) => db.collection("aurora_youtube").doc(d).get())
        .concat([db.collection("aurora_youtube_meta").doc("sync").get().catch(() => null)]));
      setChannel(c.exists ? c.data() : null);
      setHistory((h.exists && h.data().days) || []);
      setVideos((v.exists && v.data().items) || []);
      setMeta({ sync: s && s.exists ? s.data() : null });
    } catch (ex) { setErr("讀取頻道資料失敗：" + errText(ex)); setChannel(null); setVideos([]); }
  }, []);
  /* PilotOne 的 YouTube 貼文：單欄位查詢 yt.enabled == true，不需複合索引 */
  const loadJobs = useCallback(async () => {
    try {
      const snap = await db.collection(SOC_COLL).where("yt.enabled", "==", true).get();
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.scheduledAt || b.createdAt || "").localeCompare(String(a.scheduledAt || a.createdAt || ""))));
    } catch (ex) { setErr("讀取 PilotOne YouTube 貼文失敗：" + errText(ex)); setJobs([]); }
  }, []);
  useEffect(() => { loadChannel(); loadJobs(); }, [loadChannel, loadJobs]);

  const loadIssues = async () => {
    if (issues) return;
    try { const snap = await db.collection("aurora_issues").get(); setIssues(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 30)); }
    catch (ex) { setErr("讀取電子報失敗：" + errText(ex)); setIssues([]); }
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

  const box = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14 };
  const tabBtn = (id, label) => <button className={"ad-btn" + (tab === id ? " primary" : " ghost")} onClick={() => setTab(id)} style={{ padding: "8px 14px" }}>{label}</button>;
  const Stat = ({ label, value, sub }) => (
    <div style={{ background: "var(--night-850)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", minWidth: 120 }}>
      <div style={{ color: "var(--text-4)", fontSize: 11.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, color: "var(--text-1)" }}>{value}</div>
      {sub ? <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{sub}</div> : null}
    </div>
  );
  const ytState = (j) => (j.yt && j.yt.state) || "draft";
  const activeCount = (jobs || []).filter((j) => ["approved", "publishing", "scheduled", "cancel_requested"].includes(ytState(j))).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>YouTube 頻道</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>aurora_youtube · youtube-sync · 上傳走 PilotOne</div>
        </div>
        <button className="ad-btn ghost" onClick={() => { loadChannel(); loadJobs(); }} disabled={busy}>↻ 重新整理</button>
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("overview", "總覽")}{tabBtn("videos", `影片（${videos ? videos.length : "…"}）`)}{tabBtn("uploads", `上傳（PilotOne）${activeCount ? `・進行中 ${activeCount}` : ""}`)}
      </div>

      {tab === "overview" && (
        channel === undefined ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
        : !channel ? (
          <div style={{ ...box, color: "var(--text-3)", fontSize: 13.5, lineHeight: 1.8 }}>
            尚未同步頻道資料。請依 <code>docs/YOUTUBE_SOP.md</code> 在 GitHub Secrets 設定 <code>YT_API_KEY</code>＋<code>YT_CHANNEL_ID</code>（只讀）或 OAuth 三件組（含上傳），
            再到「排程監控」或 GitHub Actions 手動執行「YouTube 頻道同步」。OAuth 與 PilotOne 的 YouTube 頻道共用同一組 Secrets。
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
          {[["頻道同步 youtube-sync", meta.sync, (m) => `模式：${m.mode === "oauth" ? "OAuth（含私人影片）" : "API Key（只讀公開）"} · 影片 ${m.videos}`]].map(([label, m, line]) => (
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
          <div style={{ ...box, color: "var(--text-3)", fontSize: 13, lineHeight: 1.8 }}>
            影片上傳與排程公開由 <b style={{ color: "var(--text-1)" }}>PilotOne 的 YouTube 頻道</b> 處理：到「PilotOne 中控台 → 建立內容」勾 YouTube、填可直接下載的影片網址、標題與可見度後核准；
            公開影片會先以私人上傳並交給 YouTube 定時公開（可續傳）。Vlog 集數可在「Vlog 影片系列 → 檢查與發布」按「▶ 建立 YouTube 上傳草稿」帶入文案。設定見 <code>docs/SOCIAL_SOP.md</code> 二之三。
            <div style={{ marginTop: 8 }}><a className="ad-btn" href="/AllenI3Aurora/admin/pilotone/" target="_blank" rel="noopener" style={{ textDecoration: "none", display: "inline-block" }}>開啟 PilotOne 中控台 ↗</a></div>
          </div>
          {jobs == null ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
            : !jobs.length ? <div style={{ ...box, color: "var(--text-3)" }}>目前沒有啟用 YouTube 的 PilotOne 貼文。</div>
            : <div style={{ display: "grid", gap: 10 }}>
              {jobs.map((j) => {
                const y = j.yt || {}; const st = ytState(j);
                return (
                  <div key={j.id} style={{ ...box, marginBottom: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: "var(--night-700)", color: YT_ST_COLOR[st] || "var(--text-2)", border: "1px solid var(--border)" }}>{YT_ST[st] || st}</span>
                      <span style={{ color: "var(--text-3)", fontSize: 12 }}>{j.scheduledAt ? "預定 " + tpeFmt(j.scheduledAt) : "未排程"} · {PRIV[y.privacy] || "公開"}</span>
                      {j.source && j.source.type === "vlog" ? <span style={{ color: "var(--intelligence)", fontSize: 11.5 }}>◆ Vlog EP{String(j.source.ep || 0).padStart(2, "0")}</span> : null}
                      {y.videoId ? <a href={watch(y.videoId)} target="_blank" rel="noopener" style={{ color: "var(--brand)", fontSize: 12 }}>▶ {y.videoId}</a> : null}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--text-1)", fontSize: 15 }}>{y.title || j.title || "（未命名）"}</div>
                    {!y.videoUrl && ["draft", "failed"].includes(st) ? <div style={{ color: "var(--illumination)", fontSize: 12.5, marginTop: 6 }}>⚠ 尚未填影片網址（到 PilotOne 中控台 YouTube 分頁填入）</div> : null}
                    {y.error ? <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>✕ {y.error}</div> : null}
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
