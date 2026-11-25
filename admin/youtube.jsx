/* =====================================================================
   YouTube 頻道（後台導覽「YouTube 頻道」、admin/#youtube）
   五分頁：
     總覽  頻道統計與訂閱走勢（youtube-sync 每日同步：aurora_youtube/channel＋history）、同步狀態
     影片  最新影片清單（aurora_youtube/videos）→ 一鍵加入電子報（YouTube 區塊）
     上傳  PilotOne 的 YouTube 貼文（aurora_social_posts 中 yt.enabled）進度一覽；
           建立／核准在「PilotOne 中控台」（狀態機 scripts/social/core.mjs 的 yt 頻道）
     常看頻道  「常看 YouTube 重點筆記」要追的頻道（aurora_ytnotes/channels，公開讀）；
           Mac mini 的 ytnotes.py 每天台北 06:00 後第一次執行時讀取，與 Drive notes/youtube/channels.tsv 合併（後台為準）
     筆記影片  指定單支影片做重點筆記（aurora_ytnotes/videos，公開讀）；ytnotes.py 每次 run（每 15 分鐘）讀取並排入轉錄佇列，
           狀態取自 aurora_ops/ytnotes_progress
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

/* ---------------- 常看頻道（常看 YouTube 重點筆記） ----------------
   網址正規化與 scripts/ytnotes/ytnotes.py 的 channel_key 一致（同一頻道不重複、@handle 補 /videos） */
const YTN_DOC = () => db.collection("aurora_ytnotes").doc("channels");
const YTN_MAX = 50;
function channelKey(url) {
  let u = String(url || "").trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//.test(u)) u = "https://www.youtube.com/" + u.replace(/^(m\.|www\.)?youtube\.com\/?/, "").replace(/^\/+/, "");
  u = u.replace(/^https?:\/\/(m\.|www\.)?youtube\.com/, "https://www.youtube.com");
  if (/youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/.test(u)) u += "/videos";
  return u;
}
/* 只接受頻道頁（可帶 /videos、/shorts、/streams），不接受單支影片或播放清單 */
const validChannel = (k) => /^https:\/\/www\.youtube\.com\/(@[\w.%\-\u00b7\u3400-\u9fff]+|channel\/UC[\w-]{10,}|c\/[^/]+|user\/[^/]+)\/(videos|shorts|streams)$/.test(k);
const displayUrl = (k) => k.replace(/\/videos$/, "");
const YTN_SUGGEST = [
  ["https://www.youtube.com/@aiexplained-official", "AI Explained", "AI 應用"],
  ["https://www.youtube.com/@TwoMinutePapers", "Two Minute Papers", "AI 應用"],
  ["https://www.youtube.com/@anthropic-ai", "Anthropic", "AI 應用"],
  ["https://www.youtube.com/@AndrejKarpathy", "Andrej Karpathy", "AI 應用"],
  ["https://www.youtube.com/@EverythingSmartHome", "Everything Smart Home", "智慧家庭"],
  ["https://www.youtube.com/@home_assistant", "Home Assistant", "智慧家庭"],
  ["https://www.youtube.com/@yutinghaofinance", "游庭皓的財經皓角", "理財（幾乎每天直播，量大）"],
];

function FollowChannels({ box, flash, setErr }) {
  const [items, setItems] = useState(null);
  const [saved, setSaved] = useState("[]");
  const [updatedAt, setUpdatedAt] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await YTN_DOC().get();
      const l = (d.exists && Array.isArray(d.data().items) ? d.data().items : []).map((x) => ({ url: channelKey(x.url), name: x.name || "", enabled: x.enabled !== false, addedAt: x.addedAt || "" }));
      setItems(l); setSaved(JSON.stringify(l)); setUpdatedAt(d.exists ? d.data().updatedAt || "" : "");
    } catch (ex) { setErr("讀取常看頻道失敗：" + errText(ex)); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const dirty = items != null && JSON.stringify(items) !== saved;
  const keyOf = channelKey(url);
  const dup = items && items.some((x) => x.url === keyOf);
  const canAdd = items && keyOf && validChannel(keyOf) && !dup && items.length < YTN_MAX;
  const add = (u = url, n = name) => {
    const k = channelKey(u);
    if (!validChannel(k)) return setErr("請貼頻道網址（例：https://www.youtube.com/@handle），不是單支影片或播放清單。");
    if (items.some((x) => x.url === k)) return setErr("這個頻道已在清單中。");
    if (items.length >= YTN_MAX) return setErr(`最多 ${YTN_MAX} 個頻道。`);
    setErr("");
    setItems((l) => [...l, { url: k, name: String(n || "").trim().slice(0, 60), enabled: true, addedAt: new Date().toISOString() }]);
    setUrl(""); setName("");
  };
  const patch = (i, p) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) => setItems((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = async () => {
    setBusy(true);
    try {
      const at = new Date().toISOString();
      await YTN_DOC().set({ items: items.map((x) => ({ url: x.url, name: x.name || "", enabled: !!x.enabled, addedAt: x.addedAt || at })), updatedAt: at });
      setSaved(JSON.stringify(items)); setUpdatedAt(at);
      flash("已儲存常看頻道 ✓ Mac mini 會在下一次每日掃描（台北 06:00 後）讀取");
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); }
    setBusy(false);
  };
  if (items == null) return <div style={{ color: "var(--text-3)" }}>載入中…</div>;
  const on = items.filter((x) => x.enabled).length;
  return (
    <div>
      <div style={{ ...box, color: "var(--text-3)", fontSize: 13, lineHeight: 1.8 }}>
        這裡的頻道會由 Mac mini 的 <code>ytnotes.py</code> 在<b style={{ color: "var(--text-1)" }}>每天台北 06:00 後第一次執行</b>時讀取（與 Drive <code>notes/youtube/channels.tsv</code> 合併，同一頻道以這裡為準），每個頻道看最新 5 支。
        新加入的頻道第一次只建立基準、不灌舊片，從下一支新片開始轉錄 → 每支新片一筆 PilotOne 草稿；超過 180 分鐘的影片略過。Shorts 要另加一行 <code>…/@handle/shorts</code>。
        <div style={{ marginTop: 6 }}>建議先放 5～6 個「每週 1～2 支」的頻道，審核量約每週 5～10 篇。</div>
      </div>

      <div style={{ ...box, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="ad-in" style={{ flex: "2 1 280px" }} placeholder="頻道網址，例：https://www.youtube.com/@handle" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canAdd) add(); }} />
        <input className="ad-in" style={{ flex: "1 1 160px" }} placeholder="顯示名稱（選填）" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canAdd) add(); }} />
        <button className="ad-btn" onClick={() => add()} disabled={!canAdd}>＋ 加入</button>
        {url && !canAdd ? <div style={{ width: "100%", color: "var(--illumination)", fontSize: 12 }}>{dup ? "已在清單中" : items.length >= YTN_MAX ? `最多 ${YTN_MAX} 個` : "需為頻道網址（@handle、/channel/UC…），不是單支影片"}</div> : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>共 {items.length} 個・啟用 {on} 個・上次儲存 {updatedAt ? tpeFmt(updatedAt) : "—"}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {dirty ? <button className="ad-btn ghost" onClick={load} disabled={busy}>還原</button> : null}
          <button className="ad-btn primary" onClick={save} disabled={!dirty || busy}>{busy ? "儲存中…" : dirty ? "💾 儲存變更" : "已儲存"}</button>
        </div>
      </div>

      {!items.length ? <div style={{ ...box, color: "var(--text-3)" }}>還沒有常看頻道。貼上網址加入，或從下方建議挑選。</div>
        : <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {items.map((x, i) => (
            <div key={x.url} style={{ ...box, marginBottom: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", opacity: x.enabled ? 1 : 0.6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)", fontSize: 12.5, cursor: "pointer" }}>
                <input type="checkbox" checked={x.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} />{x.enabled ? "啟用" : "暫停"}
              </label>
              <input className="ad-in" style={{ flex: "1 1 160px", maxWidth: 240 }} value={x.name} placeholder="名稱" onChange={(e) => patch(i, { name: e.target.value.slice(0, 60) })} />
              <a href={x.url} target="_blank" rel="noopener" style={{ flex: "2 1 220px", color: "var(--brand)", fontSize: 12.5, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{displayUrl(x.url)} ↗</a>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="ad-btn ghost" style={{ padding: "4px 8px" }} onClick={() => move(i, -1)} disabled={!i} aria-label="上移">↑</button>
                <button className="ad-btn ghost" style={{ padding: "4px 8px" }} onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="下移">↓</button>
                <button className="ad-btn ghost" style={{ padding: "4px 8px", color: "var(--danger)" }} onClick={() => { if (window.confirm(`從常看頻道移除「${x.name || displayUrl(x.url)}」？（已做好的筆記不受影響）`)) setItems((l) => l.filter((_, j) => j !== i)); }}>移除</button>
              </div>
            </div>
          ))}
        </div>}

      <div style={box}>
        <div style={{ color: "var(--text-2)", fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>建議頻道（加入前請點開確認網址正確）</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {YTN_SUGGEST.filter(([u]) => !items.some((x) => x.url === channelKey(u))).map(([u, n, tag]) => (
            <span key={u} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", padding: "3px 4px 3px 10px", fontSize: 12.5, color: "var(--text-2)" }}>
              <a href={u} target="_blank" rel="noopener" style={{ color: "var(--text-1)" }}>{n}</a><span style={{ color: "var(--text-4)" }}>{tag}</span>
              <button className="ad-btn ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => add(u, n)} disabled={items.length >= YTN_MAX}>＋</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 筆記影片（常看 YouTube 重點筆記：指定單支影片） ----------------
   清單存 aurora_ytnotes/videos（{items:[{url,note,addedAt,retry?}], updatedAt}，公開讀、管理者寫、最多 100 支）。
   Mac mini 的 ytnotes.py 每次 run（launchd 每 15 分鐘）開頭讀取：新影片排入佇列、移除且尚未開始的撤回、
   retry 值改變且沒有完成草稿的再排一次。影片 ID 規則與 ytnotes.py 的 video_key 一致（僅 YouTube）。
   進度沿用 PilotOne「YouTube 轉錄」的 aurora_ops/ytnotes_progress（管理者唯讀）。 */
const YTV_DOC = () => db.collection("aurora_ytnotes").doc("videos");
const YTV_MAX = 100;
function videoKey(url) {
  const s = String(url || "").trim();
  if (!/^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\//.test(s)) return "";
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : "";
}
const videoUrl = (url) => { const k = videoKey(url); return !k ? "" : /\/shorts\//.test(url) ? "https://www.youtube.com/shorts/" + k : watch(k); };
const YTV_ST = { unsaved: ["未儲存", "var(--illumination)"], waiting: ["等待 Mac mini 讀取", "var(--text-3)"], queued: ["排隊中", "var(--intelligence)"],
  processing: ["轉錄中", "var(--illumination)"], drafted: ["草稿完成・等筆記排程", "var(--intelligence)"], done: ["已送審", "var(--success)"], stale: ["無進度紀錄・可能已完成", "var(--text-4)"], failed: ["失敗", "var(--danger)"] };

function NoteVideos({ box, flash, setErr }) {
  const [items, setItems] = useState(null);
  const [saved, setSaved] = useState("[]");
  const [updatedAt, setUpdatedAt] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const load = useCallback(async () => {
    try {
      const d = await YTV_DOC().get();
      const l = (d.exists && Array.isArray(d.data().items) ? d.data().items : []).filter((x) => x && videoKey(x.url))
        .map((x) => ({ url: videoUrl(x.url), note: x.note || "", addedAt: x.addedAt || "", retry: x.retry || "" }));
      setItems(l); setSaved(JSON.stringify(l)); setUpdatedAt(d.exists ? d.data().updatedAt || "" : "");
    } catch (ex) { setErr("讀取筆記影片失敗：" + errText(ex)); setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => db.collection("aurora_ops").doc("ytnotes_progress").onSnapshot((d) => setProg(d.exists ? d.data() : {}), () => setProg({})), []);

  const dirty = items != null && JSON.stringify(items) !== saved;
  const savedKeys = new Set(JSON.parse(saved).map((x) => videoKey(x.url)));
  const lines = text.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean);
  const add = () => {
    const have = new Set(items.map((x) => videoKey(x.url)));
    const next = [], bad = []; let dup = 0;
    for (const l of lines) {
      const k = videoKey(l);
      if (!k) { bad.push(l); continue; }
      if (have.has(k)) { dup++; continue; }
      have.add(k); next.push({ url: videoUrl(l), note: "", addedAt: new Date().toISOString(), retry: "" });
    }
    const room = YTV_MAX - items.length, over = Math.max(0, next.length - room);
    if (next.length) setItems((l) => [...l, ...next.slice(0, Math.max(0, room))]);
    setText(bad.join("\n"));
    const msg = [bad.length ? `${bad.length} 行不是 YouTube 影片網址（已留在輸入框）` : "", dup ? `${dup} 支已在清單中` : "", over ? `超過 ${YTV_MAX} 支上限，${over} 支未加入` : ""].filter(Boolean).join("；");
    setErr(msg);
    if (next.length - over > 0) flash(`已加入 ${next.length - over} 支，按「儲存變更」後生效`);
  };
  const patch = (i, p) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const at = new Date().toISOString();
      const out = items.map((x) => { const o = { url: x.url, note: (x.note || "").slice(0, 120), addedAt: x.addedAt || at }; if (x.retry) o.retry = x.retry; return o; });
      await YTV_DOC().set({ items: out, updatedAt: at });
      setSaved(JSON.stringify(items)); setUpdatedAt(at); setErr("");
      flash("已儲存筆記影片 ✓ Mac mini 最慢 15 分鐘內讀取並開始轉錄");
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); }
    setBusy(false);
  };
  if (items == null) return <div style={{ color: "var(--text-3)" }}>載入中…</div>;

  const pmap = {}; ((prog && prog.items) || []).forEach((p) => { pmap[p.id] = p; });
  const fails = {}; ((prog && prog.failures) || []).forEach((f) => { if (f.id) fails[f.id] = f; });
  const stateOf = (x) => {
    const k = videoKey(x.url), p = pmap[k];
    if (p && YTV_ST[p.state]) return p.state;
    if (!savedKeys.has(k)) return "unsaved";
    if (fails[k]) return "failed";
    return Date.now() - Date.parse(x.addedAt || "") > 2 * 86400e3 ? "stale" : "waiting"; // 進度面板只留近 14 天／20 筆已送審
  };
  const doneCount = items.filter((x) => stateOf(x) === "done").length;
  const pending = items.filter((x) => ["waiting", "queued", "processing"].includes(stateOf(x))).length;
  const syncAge = prog && prog.syncedAt ? (Date.now() - Date.parse(prog.syncedAt)) / 60000 : null;

  return (
    <div>
      <div style={{ ...box, color: "var(--text-3)", fontSize: 13, lineHeight: 1.8 }}>
        在這裡貼<b style={{ color: "var(--text-1)" }}>單支 YouTube 影片</b>網址，Mac mini 的 <code>ytnotes.py</code> 每 15 分鐘執行時會讀這份清單並排入轉錄佇列 →
        草稿完成後由 Claude 筆記排程（台北 10:17／21:17）校正、產圖卡與三平台文案 → 每支影片一筆 PilotOne 草稿待審。
        這裡指定的影片不受 180 分鐘長度限制；做過的影片不會重複處理。還在排隊、尚未開始的影片，從清單移除並儲存即可撤回。
        {syncAge != null && syncAge > 15 ? <div style={{ marginTop: 6, color: "var(--illumination)" }}>⚠ 轉錄進度已 {Math.round(syncAge)} 分鐘沒同步，下方狀態可能不是最新（看「PilotOne 中控台 → YouTube 轉錄」）。</div> : null}
      </div>

      <div style={{ ...box }}>
        <textarea className="ad-in" rows={3} style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12.5, resize: "vertical" }}
          placeholder={"貼上影片網址，可一次多支（一行一個）\n例：https://www.youtube.com/watch?v=xxxxxxxxxxx 或 https://youtu.be/xxxxxxxxxxx"}
          value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <button className="ad-btn" onClick={add} disabled={!lines.length || items.length >= YTV_MAX}>＋ 加入清單{lines.length > 1 ? `（${lines.length} 行）` : ""}</button>
          <span style={{ color: "var(--text-4)", fontSize: 12 }}>支援 watch、youtu.be、Shorts、直播存檔網址；頻道與播放清單請到「常看頻道」。</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>共 {items.length}／{YTV_MAX} 支・進行中 {pending}・已送審 {doneCount}・上次儲存 {updatedAt ? tpeFmt(updatedAt) : "—"}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {doneCount ? <button className="ad-btn ghost" onClick={() => setItems((l) => l.filter((x) => stateOf(x) !== "done"))} disabled={busy}>清掉已送審（{doneCount}）</button> : null}
          {dirty ? <button className="ad-btn ghost" onClick={load} disabled={busy}>還原</button> : null}
          <button className="ad-btn primary" onClick={save} disabled={!dirty || busy}>{busy ? "儲存中…" : dirty ? "💾 儲存變更" : "已儲存"}</button>
        </div>
      </div>

      {!items.length ? <div style={{ ...box, color: "var(--text-3)" }}>清單是空的。貼上影片網址加入後按「儲存變更」。</div>
        : <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {items.map((x, i) => {
            const k = videoKey(x.url), p = pmap[k] || {}, st = stateOf(x), [label, color] = YTV_ST[st];
            const errMsg = st === "failed" ? (p.error || (fails[k] || {}).error || "") : "";
            return (
              <div key={k} style={{ ...box, marginBottom: 0, display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <a href={x.url} target="_blank" rel="noopener" style={{ flex: "0 0 auto" }}>
                  <img src={`https://i.ytimg.com/vi/${k}/mqdefault.jpg`} alt="" loading="lazy" width="128" height="72" style={{ display: "block", borderRadius: 6, objectFit: "cover", background: "var(--night-700)" }} />
                </a>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, background: "var(--night-700)", color, border: "1px solid var(--border)" }}>{label}{st === "processing" && p.stageLabel ? "・" + p.stageLabel : ""}</span>
                    {p.durationSec ? <span style={{ color: "var(--text-4)", fontSize: 12 }}>{Math.round(p.durationSec / 60)} 分鐘</span> : null}
                    {x.addedAt ? <span style={{ color: "var(--text-4)", fontSize: 12 }}>加入 {tpeFmt(x.addedAt)}</span> : null}
                  </div>
                  <div style={{ color: "var(--text-1)", fontWeight: 700, fontSize: 14, wordBreak: "break-word" }}>{p.title || "（讀取影片資訊後顯示標題）"}{p.author ? <span style={{ color: "var(--text-3)", fontWeight: 400 }}>　{p.author}</span> : null}</div>
                  <a href={x.url} target="_blank" rel="noopener" style={{ color: "var(--brand)", fontSize: 12, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{x.url} ↗</a>
                  {errMsg ? <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 4, wordBreak: "break-word" }}>✕ {errMsg}</div> : null}
                  <input className="ad-in" style={{ width: "100%", marginTop: 6 }} value={x.note} placeholder="備註（選填，只在後台顯示，例：想看的重點）" onChange={(e) => patch(i, { note: e.target.value.slice(0, 120) })} />
                </div>
                <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                  {st === "failed" ? <button className="ad-btn ghost" style={{ padding: "4px 8px" }} onClick={() => { patch(i, { retry: new Date().toISOString() }); flash("已標記重試，按「儲存變更」後 Mac mini 會再排一次"); }}>↻ 重試</button> : null}
                  <button className="ad-btn ghost" style={{ padding: "4px 8px", color: "var(--danger)" }} onClick={() => {
                    const warn = st === "processing" ? "這支正在轉錄，移除不會中斷，仍會產出草稿。" : ["drafted", "done"].includes(st) ? "已做好的草稿／筆記不受影響。" : "尚未開始的話會從轉錄佇列撤回。";
                    if (window.confirm(`從筆記影片移除「${p.title || k}」？\n${warn}`)) setItems((l) => l.filter((_, j) => j !== i));
                  }}>移除</button>
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
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
        {tabBtn("overview", "總覽")}{tabBtn("videos", `影片（${videos ? videos.length : "…"}）`)}{tabBtn("uploads", `上傳（PilotOne）${activeCount ? `・進行中 ${activeCount}` : ""}`)}{tabBtn("follow", "常看頻道")}{tabBtn("notevideos", "筆記影片")}
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

      {tab === "follow" && <FollowChannels box={box} flash={flash} setErr={setErr} />}
      {tab === "notevideos" && <NoteVideos box={box} flash={flash} setErr={setErr} />}

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
