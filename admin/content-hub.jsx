/* =====================================================================
   內容中控台（Content Hub）— 一次製作、逐平台微調、排程與追蹤
   資料沿用 aurora_social_posts（與「社群發文」同一佇列），多平台欄位放在
   hub：{ stage, body, hashtags, category, platforms, variants }，排程器忽略此欄。
   實際送出由 social-publish.yml 處理：Facebook、Instagram、Threads 由排程器自動發布
   （各頻道狀態存在 fb／ig／th 欄位，狀態機見 scripts/social/core.mjs）；
   YouTube／Podcast 先存草稿與微調內容，待串接後啟用。
   需於 admin.jsx 之後載入（共用 db、auth、errText、socFbState、SocFbPreview…）。
   ===================================================================== */
(function () {
const { useState, useEffect, useCallback } = React;
const FbPreview = SocFbPreview; // admin.jsx 的 FB 貼文預覽

const HUB_PF = [
  { id: "fb", short: "FB", name: "Facebook 粉絲專頁", color: "#1877F2", live: true, api: "Meta Graph API（Token 存於 Secrets）", formats: "圖文 · 連結貼文" },
  { id: "ig", short: "IG", name: "Instagram 商業帳號", color: "#C13584", live: true, api: "Instagram Graph API（沿用 Meta Token）", formats: "單張圖片貼文（必須有圖）", limit: 2200 },
  { id: "th", short: "TH", name: "Threads", color: "#101010", live: true, api: "Threads API（長效 Token 每日自動續期）", formats: "文字 · 單張圖片", limit: 500 },
  { id: "yt", short: "YT", name: "YouTube 頻道", color: "#FF0000", phase: "第二階段", api: "YouTube Data API", formats: "影片 · Shorts", limit: 5000 },
  { id: "pc", short: "PC", name: "Podcast（RSS 託管）", color: "#7C3AED", phase: "第二階段", api: "RSS 託管", formats: "音檔 · Show notes" },
];
const HUB_RESERVED = [
  ["TT", "TikTok", "第二階段"], ["LN", "LINE 官方帳號", "第二階段"], ["X", "X", "第二階段"], ["RED", "小紅書", "第二階段"],
  ["IN", "LinkedIn", "第二階段"], ["PT", "Pinterest", "第二階段"], ["MD", "Medium", "第三階段"], ["GH", "GitHub Pages + Jekyll", "第三階段"],
];
const HUB_CATS = ["智慧家庭", "無人機", "智慧農業", "ITS", "智慧水資源", "AI 應用", "理財", "生活"];

/* 內容狀態（彙整 FB／IG／Threads 各頻道狀態，草稿再細分「草稿／待審核」） */
const HUB_ST = {
  draft:     { label: "草稿",   color: "var(--illumination)", bg: "var(--illumination-soft)" },
  review:    { label: "待審核", color: "var(--intelligence)", bg: "var(--intelligence-soft)" },
  scheduled: { label: "排程中", color: "var(--info)",         bg: "var(--info-soft)" },
  published: { label: "已發布", color: "var(--success)",      bg: "var(--success-soft)" },
  failed:    { label: "失敗",   color: "var(--danger)",       bg: "var(--danger-soft)" },
  rejected:  { label: "已退回", color: "var(--text-4)",       bg: "var(--night-700)" },
};
const HUB_ORDER = ["draft", "review", "scheduled", "published", "failed"];
const HUB_LIVE = ["fb", "ig", "th"]; // 排程器會發布的頻道
const HUB_ACTIVE = ["approved", "publishing", "processing", "scheduled", "cancel_requested"];
const HUB_CH_LABEL = { draft: "草稿", approved: "已核准・待送出", processing: "媒體處理中", publishing: "送出中", scheduled: "Meta 已排程",
  cancel_requested: "取消中", published: "已發布", failed: "失敗", skipped: "未啟用" };
const chOn = (r, ch) => !!(r[ch] && r[ch].enabled);
const chState = (r, ch) => (r[ch] && r[ch].state) || "draft";
const hubLiveOn = (r) => HUB_LIVE.filter((ch) => chOn(r, ch));
/* IG／Threads 串接前存的草稿只在 hub.platforms 記錄（ig 為 skipped 佔位）→ 沿用當時的勾選 */
const chWanted = (r, ch) => (!r[ch] || r[ch].state === "skipped") && !chOn(r, ch) ? !!(r.hub && r.hub.platforms && r.hub.platforms[ch]) : chOn(r, ch);
function hubStatus(r) {
  if (socIsRejected(r)) return "rejected";
  const sts = hubLiveOn(r).map((ch) => chState(r, ch));
  if (sts.some((x) => HUB_ACTIVE.includes(x))) return "scheduled";
  if (sts.includes("failed")) return "failed";
  if (sts.length && sts.every((x) => x === "published" || x === "skipped") && sts.includes("published")) return "published";
  return r.hub && r.hub.stage === "draft" ? "draft" : "review"; // 舊資料（無 hub）沿用「社群發文」的待審核
}
/* 第一個失敗頻道的錯誤訊息（附平台簡稱） */
function hubError(r) {
  const ch = HUB_LIVE.find((c) => chOn(r, c) && chState(r, c) === "failed" && r[c].error);
  if (!ch) return "";
  const e = r[ch].error;
  return ch.toUpperCase() + "：" + String(e.message || e);
}
/* 多頻道進度，例：已發布 2/3 */
function hubProgress(r) {
  const on = hubLiveOn(r);
  return { done: on.filter((ch) => chState(r, ch) === "published").length, total: on.length };
}
const hubPlatforms = (r) => HUB_PF.filter((p) => HUB_LIVE.includes(p.id)
  ? (p.id === "fb" ? !!(r.fb && r.fb.enabled !== false) : chWanted(r, p.id))
  : !!(r.hub && r.hub.platforms && r.hub.platforms[p.id]));
const hubWhen = (r) => HUB_LIVE.map((ch) => r[ch] && r[ch].enabled && r[ch].publishedAt).filter(Boolean).sort()[0] || r.scheduledAt || "";
/* 排程器回報的平台連線狀態（舊版只有 FB 欄位） */
function hubChannelHealth(meta, ch) {
  if (!meta || !meta.lastRunAt) return { ran: false };
  const c = meta.channels && meta.channels[ch];
  if (c) return { ran: true, configured: !!c.configured, ok: !!c.ok, name: c.name, error: c.error, expiresAt: c.expiresAt || null };
  return ch === "fb" ? { ran: true, configured: true, ok: !!meta.tokenOk, name: meta.pageName, error: meta.tokenError } : { ran: true, configured: false };
}
const healthTag = (h) => !h.ran ? ["draft", "尚未執行"] : !h.configured ? ["rejected", "尚未設定"] : h.ok ? ["published", "已連線"] : ["failed", "需重新授權"];

/* 台北時間（UTC+8）日期工具 */
const DAY = 86400000, TP = 8 * 3600000;
const tpMidnight = (t) => Math.floor((t + TP) / DAY) * DAY - TP;
const tpWeekStart = (t) => { const m = tpMidnight(t); return m - ((new Date(m + TP).getUTCDay() + 6) % 7) * DAY; };
const tpParts = (t) => { const d = new Date(t + TP); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }; };
const p2 = (n) => String(n).padStart(2, "0");
const tpHm = (iso) => { const t = Date.parse(iso || ""); if (!isFinite(t)) return "未定"; const p = tpParts(t); return p2(p.hh) + ":" + p2(p.mm); };
const tpMdHm = (iso) => { const t = Date.parse(iso || ""); if (!isFinite(t)) return "未排程"; const p = tpParts(t); return p2(p.m) + "/" + p2(p.d) + " " + p2(p.hh) + ":" + p2(p.mm); };
/* datetime-local ⇄ ISO：輸入框固定解讀為台北時間，不受瀏覽器時區影響 */
const tpInputToIso = (v) => { const t = Date.parse((v || "") + ":00Z"); return v && isFinite(t) ? new Date(t - TP).toISOString() : ""; };
const isoToTpInput = (iso) => { const t = Date.parse(iso || ""); if (!isFinite(t)) return ""; const p = tpParts(t); return p.y + "-" + p2(p.m) + "-" + p2(p.d) + "T" + p2(p.hh) + ":" + p2(p.mm); };
const WEEKDAY = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

/* ---------- 共用小元件 ---------- */
const card = { background: "var(--night-800)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" };
const h2s = { fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 16, fontWeight: 800, margin: 0 };
const muted = { color: "var(--text-3)", fontSize: 12.5 };
const linkBtn = { background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--brand)", fontSize: 13, fontFamily: "var(--font-body)" };

const RING = { published: "var(--success)", failed: "var(--danger)" };
function PfChip({ pf, off, size = 22, title, ring }) {
  return (
    <span title={title || pf.name} style={{ display: "inline-grid", placeItems: "center", width: size, height: size, flex: "none", borderRadius: size > 30 ? 10 : 6,
      background: pf.color, color: "var(--on-solid)", fontSize: size > 30 ? 12 : 10, fontWeight: 800, letterSpacing: ".02em",
      border: "1px solid var(--border-strong)", boxShadow: ring ? "0 0 0 2px " + ring : "none", opacity: off ? 0.3 : 1 }}>{pf.short}</span>
  );
}
/* 平台晶片列：外框標示各頻道結果（綠＝已發布、紅＝失敗、藍＝排程中），滑鼠移上看狀態 */
function PfRow({ r, all }) {
  const on = hubPlatforms(r).map((p) => p.id);
  const list = all ? HUB_PF : HUB_PF.filter((p) => on.includes(p.id));
  const tip = (p) => p.name + (!on.includes(p.id) ? "（未啟用）" : !HUB_LIVE.includes(p.id) ? "（尚未串接）" : " · " + (HUB_CH_LABEL[chState(r, p.id)] || chState(r, p.id)));
  const ring = (p) => on.includes(p.id) && HUB_LIVE.includes(p.id) ? (RING[chState(r, p.id)] || (HUB_ACTIVE.includes(chState(r, p.id)) ? "var(--info)" : null)) : null;
  return <div style={{ display: "flex", gap: 6 }}>{list.map((p) => <PfChip key={p.id} pf={p} off={!on.includes(p.id)} title={tip(p)} ring={ring(p)} />)}</div>;
}
/* 狀態標籤；多頻道時附進度（已發布 2/3） */
function HubTag({ r }) {
  const st = hubStatus(r), pg = hubProgress(r);
  const text = pg.total > 1 && ["scheduled", "published", "failed"].includes(st) && pg.done < pg.total ? `${HUB_ST[st].label} · ${pg.done}/${pg.total}` : null;
  return <StTag st={st} text={text} />;
}
function StTag({ st, text }) {
  const m = HUB_ST[st] || HUB_ST.draft;
  return <span style={{ padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", background: m.bg, color: m.color, border: "1px solid var(--border)" }}>{text || m.label}</span>;
}
function Pill({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 13px", borderRadius: "var(--radius-pill)", cursor: "pointer",
      fontSize: 13, fontFamily: "var(--font-body)", fontWeight: on ? 700 : 500, border: "1px solid " + (on ? "var(--border-aurora)" : "var(--border)"),
      background: on ? "var(--brand-soft)" : "transparent", color: on ? "var(--text-1)" : "var(--text-3)" }}>{children}</button>
  );
}
function Toggle({ on, onChange, disabled, children }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--text-2)", cursor: disabled ? "default" : "pointer", minHeight: 36, opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
      <span aria-hidden="true" style={{ width: 38, height: 22, borderRadius: 999, flex: "none", position: "relative", background: on ? "var(--brand)" : "var(--night-500)", transition: "background .15s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: "var(--on-solid)", transition: "left .15s" }} />
      </span>
      {children}
    </label>
  );
}
function Kpi({ label, value, sub, tone }) {
  return (
    <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={muted}>{label}</span>
      <strong style={{ fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1, color: tone || "var(--text-1)" }}>{value}</strong>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sub}</span>
    </div>
  );
}
function SecHead({ title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <h3 style={h2s}>{title}</h3>
      {action ? <button type="button" style={linkBtn} onClick={onAction}>{action}</button> : null}
    </div>
  );
}

/* =====================================================================
   01 儀表板
   ===================================================================== */
function HubDashboard({ list, meta, go, openPost }) {
  const now = Date.now(), today = tpMidnight(now), wk = tpWeekStart(now);
  const inRange = (r, a, b) => { const t = Date.parse(hubWhen(r)); return isFinite(t) && t >= a && t < b; };
  const live = list.filter((r) => ["scheduled", "published"].includes(hubStatus(r)));
  const week = live.filter((r) => inRange(r, wk, wk + 7 * DAY));
  const weekPf = new Set(week.flatMap((r) => hubPlatforms(r).map((p) => p.id)));
  const todayAll = list.filter((r) => hubStatus(r) !== "rejected" && inRange(r, today, today + DAY)).sort((a, b) => hubWhen(a).localeCompare(hubWhen(b)));
  const todayPending = todayAll.filter((r) => hubStatus(r) === "scheduled");
  const next = todayPending.find((r) => Date.parse(hubWhen(r)) >= now);
  const drafts = list.filter((r) => ["draft", "review"].includes(hubStatus(r)));
  const stale = drafts.filter((r) => now - Date.parse(r.updatedAt || r.createdAt || "") > 3 * DAY).length;
  const failed = list.filter((r) => hubStatus(r) === "failed" && now - Date.parse(r.updatedAt || "") < 7 * DAY);
  const recent = list.filter((r) => hubStatus(r) === "published").sort((a, b) => hubWhen(b).localeCompare(hubWhen(a))).slice(0, 6);
  const tp = tpParts(now);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={muted}>{tp.y} 年 {tp.m} 月 {tp.d} 日（{WEEKDAY[tp.w].slice(1)}）· 台北時間</div>
      <section aria-label="關鍵指標" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <Kpi label="本週排定發布" value={week.length} sub={`${weekPf.size} 個平台 · ${week.length} 篇內容`} />
        <Kpi label="今日待發布" value={todayPending.length} sub={next ? `下一筆 ${tpHm(hubWhen(next))} · ${hubPlatforms(next).map((p) => p.short).join("/") || "—"}` : "今日已無待發布"} />
        <Kpi label="待審核草稿" value={drafts.length} sub={stale ? <span style={{ color: "var(--warning)" }}>{stale} 篇超過 3 天未處理</span> : "皆在 3 天內"} />
        <Kpi label="發布失敗（7 日）" value={failed.length} tone={failed.length ? "var(--danger)" : undefined}
          sub={failed.length ? String(hubError(failed[0]) || "請至內容庫查看").slice(0, 40) : "無失敗紀錄"} />
      </section>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, flex: "2 1 420px", minWidth: 0 }}>
          <SecHead title="今日發布排程" action="查看完整日曆" onAction={() => go("calendar")} />
          {todayAll.length === 0 ? <div style={{ ...muted, padding: "18px 0" }}>今天沒有排定的內容。</div> : todayAll.map((r) => {
            const st = hubStatus(r), fail = st === "failed";
            return (
              <button key={r.id} type="button" onClick={() => openPost(r)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 13px", textAlign: "left", cursor: "pointer", borderRadius: "var(--radius-md)",
                border: "1px solid " + (fail ? "var(--danger)" : "var(--border)"), background: fail ? "var(--danger-soft)" : "var(--night-850)", color: "inherit", font: "inherit" }}>
                <strong style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-1)", width: 48, flex: "none" }}>{tpHm(hubWhen(r))}</strong>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "（未命名）"}</span>
                  <span style={{ fontSize: 12, color: fail ? "var(--danger)" : "var(--text-3)" }}>{fail ? "發布失敗，點開查看原因後重試" : (r.hub && r.hub.category) || "社群貼文"}</span>
                </span>
                <PfRow r={r} />
                <HubTag r={r} />
              </button>
            );
          })}
        </div>

        <div style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12, flex: "1 1 240px" }}>
          <SecHead title="平台連線狀態" action="管理" onAction={() => go("platforms")} />
          {HUB_PF.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PfChip pf={p} size={24} />
              <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-2)" }}>{p.name}</span>
              {p.live
                ? (() => { const [t, l] = healthTag(hubChannelHealth(meta, p.id)); return <StTag st={t} text={l} />; })()
                : <StTag st="rejected" text={p.phase} />}
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>後續階段預留</span>
            <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{HUB_RESERVED.slice(0, 5).map((x) => x[1]).join(" · ")}</span>
          </div>
        </div>
      </section>

      <section style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <SecHead title="最近發布" action="前往內容庫" onAction={() => go("library")} />
        <HubTable rows={recent} openPost={openPost} empty="尚無已發布內容。" compact />
      </section>
    </div>
  );
}

/* 內容表格（儀表板「最近發布」與內容庫共用） */
function HubTable({ rows, openPost, empty, compact }) {
  const th = { textAlign: "left", fontWeight: 600, color: "var(--text-3)", fontSize: 12, padding: "9px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td = { padding: "11px 10px", borderBottom: "1px solid var(--border-subtle)", verticalAlign: "middle", fontSize: 13.5, color: "var(--text-2)" };
  if (!rows.length) return <div style={{ ...muted, padding: "18px 0" }}>{empty}</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: compact ? 560 : 760 }}>
        <thead><tr>
          <th style={th}>內容</th>{compact ? null : <th style={th}>分類</th>}<th style={th}>{compact ? "平台" : "平台發布狀態"}</th>
          <th style={th}>{compact ? "發布時間" : "排程 / 發布時間"}</th><th style={th}>狀態</th><th style={th}></th>
        </tr></thead>
        <tbody>{rows.map((r) => {
          const st = hubStatus(r);
          const err = st === "failed" ? hubError(r) : "";
          return (
            <tr key={r.id}>
              <td style={{ ...td, maxWidth: 340 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {!compact ? (r.imageUrl
                    ? <img src={r.imageUrl} alt="" style={{ width: 42, height: 42, borderRadius: "var(--radius-md)", objectFit: "cover", flex: "none", background: "var(--night-700)" }} />
                    : <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: "var(--radius-md)", flex: "none", background: "var(--aurora-gradient-soft)" }} />) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <strong style={{ color: "var(--text-1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "（未命名）"}</strong>
                    {!compact ? <span style={{ fontSize: 12, color: err ? "var(--danger)" : "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {err || ("更新於 " + tpMdHm(r.updatedAt || r.createdAt))}</span> : null}
                  </div>
                </div>
              </td>
              {compact ? null : <td style={{ ...td, whiteSpace: "nowrap" }}>{(r.hub && r.hub.category) || "—"}</td>}
              <td style={td}><PfRow r={r} all={!compact} /></td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{tpMdHm(hubWhen(r))}</td>
              <td style={td}><HubTag r={r} /></td>
              <td style={{ ...td, textAlign: "right" }}>
                <button className={"ad-btn" + (st === "review" ? " primary" : " ghost")} style={{ padding: "6px 11px", fontSize: 12.5, whiteSpace: "nowrap" }} onClick={() => openPost(r)}>
                  {st === "review" ? "審核" : st === "draft" || st === "rejected" ? "繼續編輯" : st === "failed" ? "查看重試" : "檢視"}
                </button>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

/* =====================================================================
   02 排程日曆（週檢視，台北時間）
   ===================================================================== */
function HubCalendar({ list, openPost, newPost }) {
  const [wk, setWk] = useState(() => tpWeekStart(Date.now()));
  const [pf, setPf] = useState("all");
  const today = tpMidnight(Date.now());
  const rows = list.filter((r) => hubStatus(r) !== "rejected" && (pf === "all" || hubPlatforms(r).some((p) => p.id === pf)));
  const days = Array.from({ length: 7 }, (_, i) => wk + i * DAY);
  const inWeek = rows.filter((r) => { const t = Date.parse(hubWhen(r)); return isFinite(t) && t >= wk && t < wk + 7 * DAY; });
  const undated = rows.filter((r) => !isFinite(Date.parse(hubWhen(r))));
  const a = tpParts(wk), b = tpParts(wk + 6 * DAY);
  const count = (st) => inWeek.filter((r) => hubStatus(r) === st).length;
  const edge = { draft: "var(--illumination)", review: "var(--intelligence)", scheduled: "var(--info)", published: "var(--success)", failed: "var(--danger)" };

  const Ev = ({ r }) => {
    const st = hubStatus(r);
    return (
      <button type="button" onClick={() => openPost(r)} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 9, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
        borderRadius: "var(--radius-md)", border: "1px solid var(--border)", borderLeft: "4px solid " + edge[st], background: st === "failed" ? "var(--danger-soft)" : "var(--night-850)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-3)" }}>{tpHm(hubWhen(r))}</span>
        <strong style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: "var(--text-1)" }}>{r.title || "（未命名）"}</strong>
        <PfRow r={r} />
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button className="ad-btn ghost" aria-label="上一週" onClick={() => setWk(wk - 7 * DAY)}>‹</button>
        <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", fontSize: 14.5, minWidth: 190, textAlign: "center" }}>{a.y}/{p2(a.m)}/{p2(a.d)} – {p2(b.m)}/{p2(b.d)}</strong>
        <button className="ad-btn ghost" aria-label="下一週" onClick={() => setWk(wk + 7 * DAY)}>›</button>
        <button className="ad-btn" onClick={() => setWk(tpWeekStart(Date.now()))}>今天</button>
        <span style={{ flex: 1 }} />
        <span style={muted}>所有時間以台北時間（UTC+8）顯示</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ ...muted, marginRight: 4 }}>平台篩選</span>
        <Pill on={pf === "all"} onClick={() => setPf("all")}>全部</Pill>
        {HUB_PF.map((p) => <Pill key={p.id} on={pf === p.id} onClick={() => setPf(p.id)}><PfChip pf={p} size={20} />{p.name.split(/[ （]/)[0]}</Pill>)}
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-3)", flexWrap: "wrap" }}>
          {["published", "scheduled", "review", "draft", "failed"].map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: edge[k] }} />{HUB_ST[k].label}</span>
          ))}
        </div>
      </div>

      <section aria-label="本週排程" style={{ ...card, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", minWidth: 840 }}>
          {days.map((d, i) => {
            const p = tpParts(d), on = d === today;
            return (
              <div key={"h" + d} style={{ padding: 11, borderBottom: "1px solid var(--border)", borderRight: i < 6 ? "1px solid var(--border-subtle)" : 0, background: on ? "var(--brand-soft)" : "transparent", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 12, color: on ? "var(--brand)" : "var(--text-3)", fontWeight: on ? 700 : 500 }}>{WEEKDAY[p.w]}{on ? " · 今天" : ""}</span>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, color: on ? "var(--brand)" : "var(--text-1)" }}>{p.d === 1 ? p2(p.m) + "/01" : p.d}</strong>
              </div>
            );
          })}
          {days.map((d, i) => {
            const evs = inWeek.filter((r) => { const t = Date.parse(hubWhen(r)); return t >= d && t < d + DAY; }).sort((x, y) => hubWhen(x).localeCompare(hubWhen(y)));
            return (
              <div key={"c" + d} style={{ padding: 9, minHeight: 420, borderRight: i < 6 ? "1px solid var(--border-subtle)" : 0, background: d === today ? "rgba(45,212,191,0.04)" : "transparent", display: "flex", flexDirection: "column", gap: 8 }}>
                {evs.map((r) => <Ev key={r.id} r={r} />)}
                {i === 6 ? (
                  <button type="button" onClick={newPost} style={{ minHeight: 40, border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-3)", fontSize: 12, cursor: "pointer" }}>＋ 新增排程</button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {undated.length ? (
        <section style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={muted}>未排定時間（{undated.length}）</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>{undated.map((r) => <Ev key={r.id} r={r} />)}</div>
        </section>
      ) : null}

      <section style={{ ...card, padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12, color: "var(--text-3)" }}>本週合計</span><strong style={{ fontSize: 18, color: "var(--text-1)" }}>{inWeek.length} 筆排程</strong></div>
        {HUB_ORDER.map((k) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12, color: "var(--text-3)" }}>{HUB_ST[k].label}</span><strong style={{ fontSize: 18, color: HUB_ST[k].color }}>{count(k)}</strong></div>
        ))}
      </section>
    </div>
  );
}

/* =====================================================================
   03 建立內容 — 主稿 → 逐平台微調 → 排程與審核
   ===================================================================== */
function hubBlank() {
  return { __new: true, id: null, title: "", body: "", hashtags: "", category: HUB_CATS[0], imageUrl: "", link: "", note: "",
    platforms: { fb: true, ig: false, th: false, yt: false, pc: false }, variants: { fb: "", ig: "", th: "", yt: "", pc: "" },
    fb: { state: "draft" }, queueState: "draft", scheduledAt: "", mode: "time", when: "", needReview: true };
}
function hubFromPost(r) {
  const h = r.hub || {};
  return { __new: false, id: r.id, title: r.title || "", body: h.body != null ? h.body : (r.fb && r.fb.caption) || "", hashtags: h.hashtags || "",
    category: h.category || HUB_CATS[0], imageUrl: r.imageUrl || "", link: (r.fb && r.fb.link) || "", note: r.note || "",
    platforms: Object.assign({ ig: false, th: false, yt: false, pc: false }, h.platforms || {},
      { fb: !!(r.fb && r.fb.enabled !== false), ig: chWanted(r, "ig"), th: chWanted(r, "th") }),
    variants: Object.assign({ fb: "", ig: "", th: "", yt: "", pc: "" }, h.variants || {}),
    hub: r.hub || null, fb: Object.assign({ state: "draft" }, r.fb || {}), ig: r.ig || null, th: r.th || null, queueState: r.queueState || "draft", scheduledAt: r.scheduledAt || "",
    mode: "time", when: isoToTpInput(r.scheduledAt), needReview: false };
}
const hubMaster = (s) => [s.body.trim(), s.hashtags.trim()].filter(Boolean).join("\n\n");
const hubText = (s, id) => (s.variants[id] || "").trim() || hubMaster(s);

function HubComposer({ init, reload, flash, go }) {
  const [s, setS] = useState(init);
  const [tab, setTab] = useState("fb");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setS(init); setErr(""); }, [init]);

  const who = (auth && auth.currentUser && auth.currentUser.email) || "";
  const st = s.__new ? "draft" : hubStatus(s);
  // 任一頻道仍在排程器手上（已核准／處理中／Meta 已排程…）或全部已發布 → 只能檢視
  const editable = who === OWNER_EMAIL && (s.__new || s.queueState === "rejected" || (st !== "scheduled" && st !== "published"));
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const setPf = (id, v) => setS((x) => ({ ...x, platforms: { ...x.platforms, [id]: v } }));
  const setVar = (id, v) => setS((x) => ({ ...x, variants: { ...x.variants, [id]: v } }));
  const chosen = HUB_PF.filter((p) => s.platforms[p.id]);
  const pf = HUB_PF.find((p) => p.id === tab);

  const hubField = (stage) => ({ stage, body: s.body, hashtags: s.hashtags, category: s.category, platforms: s.platforms, variants: s.variants });
  /* 已發布的頻道維持原狀；失敗的保留錯誤供參考，重新核准時才清除 */
  const keepState = (ch) => { const x = chState(s, ch); return x === "published" || x === "failed" ? x : "draft"; };
  const save = async (stage) => {
    setBusy(true); setErr("");
    const now = new Date().toISOString();
    try {
      let id = s.id;
      if (s.__new) {
        const ref = await db.collection(SOC_COLL).add({
          title: s.title, imageUrl: s.imageUrl.trim(), note: s.note, scheduledAt: "", queueState: "draft", source: { type: "hub" },
          fb: { enabled: !!s.platforms.fb, caption: hubText(s, "fb"), link: s.link.trim(), state: "draft", attempts: 0, error: null, postId: null },
          ig: { enabled: !!s.platforms.ig, caption: hubText(s, "ig"), state: "draft", attempts: 0, error: null },
          th: { enabled: !!s.platforms.th, caption: hubText(s, "th"), state: "draft", attempts: 0, error: null },
          lock: { by: null, at: null }, hub: hubField(stage), createdAt: now, updatedAt: now,
        });
        id = ref.id;
      } else {
        const upd = { title: s.title, imageUrl: s.imageUrl.trim(), "fb.enabled": !!s.platforms.fb, "fb.caption": hubText(s, "fb"), "fb.link": s.link.trim(), hub: hubField(stage), updatedAt: now };
        for (const ch of ["ig", "th"]) Object.assign(upd, { [ch + ".enabled"]: !!s.platforms[ch], [ch + ".caption"]: hubText(s, ch), [ch + ".state"]: keepState(ch) });
        if (s.queueState === "rejected") upd.queueState = "draft"; // 退回後重新編修，回到佇列
        await db.collection(SOC_COLL).doc(id).update(upd);
      }
      setS((x) => ({ ...x, __new: false, id, queueState: x.queueState === "rejected" ? "draft" : x.queueState }));
      await reload();
      setBusy(false); return id;
    } catch (ex) { setErr("儲存失敗：" + errText(ex)); setBusy(false); return false; }
  };

  /* 這次要交給排程器的頻道：已啟用、且尚未發布 */
  const toSend = HUB_LIVE.filter((ch) => s.platforms[ch] && chState(s, ch) !== "published");
  const sendNames = toSend.map((ch) => HUB_PF.find((p) => p.id === ch).name.split(/[ （]/)[0]).join("、");
  const validate = () => {
    if (!s.title.trim()) return "請填寫標題。";
    if (!chosen.length) return "請至少選擇一個發布平台。";
    if (!toSend.length) return "請至少啟用 Facebook、Instagram 或 Threads 其中之一（YouTube／Podcast 尚未串接，只會保存內容）。";
    const img = s.imageUrl.trim();
    if (img && !/^https:\/\//i.test(img)) return "圖片需為 https:// 開頭的公開網址（平台會直接下載）。";
    if (s.link && !/^https?:\/\//i.test(s.link.trim())) return "連結需為完整網址（https://…）。";
    if (toSend.includes("fb") && !hubText(s, "fb") && !img) return "Facebook 貼文至少需要內文或圖片。";
    if (toSend.includes("ig") && !img) return "Instagram 貼文必須有圖片，請填寫圖片網址或取消 IG。";
    if (toSend.includes("th") && !hubText(s, "th") && !img) return "Threads 貼文至少需要文字或圖片。";
    for (const ch of toSend) {
      const pf = HUB_PF.find((p) => p.id === ch);
      if (pf.limit && [...hubText(s, ch)].length > pf.limit) return `${pf.name} 文字超過 ${pf.limit.toLocaleString()} 字上限，請在「逐平台微調」縮短。`;
    }
    return "";
  };

  const saveDraft = async () => { if (await save("draft")) flash("已儲存草稿 ✓"); };
  const submit = async () => {
    const v = validate(); if (v) { setErr(v); return; }
    if (await save("review")) { flash("已送交審核 ✓ 可在內容庫或「社群發文」核准"); go("library"); }
  };
  /* 核准：要發的頻道設為 approved、queueState=pending，交給排程器（FB 寫入與「社群發文」相同） */
  const approve = async () => {
    const v = validate(); if (v) { setErr(v); return; }
    let iso;
    if (s.mode === "now") {
      if (!window.confirm(`確認立即發布到 ${sendNames}？排程器下一輪（約 10 分鐘內）送出，送出後即公開。`)) return;
      iso = new Date().toISOString();
    } else {
      iso = tpInputToIso(s.when);
      if (!iso) { setErr("請先選擇發布時間。"); return; }
      if (Date.parse(iso) < Date.now() - 60000) { setErr("發布時間已過；若要馬上發，請改選「立即發布」。"); return; }
    }
    const id = await save("review");
    if (!id) return;
    setBusy(true);
    try {
      const upd = { scheduledAt: iso, queueState: "pending", "review.approvedAt": new Date().toISOString(), "review.by": who, lock: { by: null, at: null }, updatedAt: new Date().toISOString() };
      for (const ch of toSend) Object.assign(upd, { [ch + ".state"]: "approved", [ch + ".attempts"]: 0, [ch + ".error"]: null }, ch === "fb" ? {} : { [ch + ".containerId"]: null });
      await db.collection(SOC_COLL).doc(id).update(upd);
      await reload();
      flash(s.mode === "now" ? "已核准立即發布 ✓ 排程器下一輪送出" : `已核准 ✓ 將於 ${isoToTpInput(iso).replace("T", " ")}（台北）發布到 ${sendNames}`);
      go("calendar");
    } catch (ex) { setErr("核准失敗：" + errText(ex)); }
    setBusy(false);
  };

  const step = (n, label, on) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: 999, fontSize: 12.5, fontWeight: 800,
        background: on ? "var(--aurora-gradient)" : "var(--night-700)", color: on ? "var(--text-on-accent)" : "var(--text-3)", border: "1px solid var(--border)" }}>{n}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? "var(--text-1)" : "var(--text-3)" }}>{label}</span>
    </div>
  );
  const sec = { ...card, padding: 18, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 };
  const len = (t) => [...(t || "")].length;
  const preview = { title: s.title, imageUrl: s.imageUrl.trim(), scheduledAt: s.mode === "now" ? "" : tpInputToIso(s.when), fb: { caption: hubText(s, "fb"), link: s.link.trim() } };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}><button type="button" style={linkBtn} onClick={() => go("library")}>內容庫</button> / {s.__new ? "建立內容" : "編輯內容"}</div>
          <h3 style={{ ...h2s, fontSize: 20 }}>一次製作，多平台發布</h3>
        </div>
        {!s.__new ? <HubTag r={s} /> : null}
        {editable ? <button className="ad-btn" disabled={busy} onClick={saveDraft}>儲存草稿</button> : null}
      </div>
      {!editable ? (
        <div style={{ ...card, padding: 14, fontSize: 13, color: "var(--illumination)", borderColor: "var(--illumination)" }}>
          {who !== OWNER_EMAIL ? `目前登入非管理者帳號（${OWNER_EMAIL}），僅能檢視。` : "此內容已交給排程器（或已發布），僅能檢視；如需撤回或取消 Meta 排程，請至左側「社群發文」。"}
        </div>
      ) : null}
      {err ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div> : null}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        {step(1, "主稿內容", true)}<span style={{ flex: "0 0 28px", height: 1, background: "var(--border-strong)" }} />
        {step(2, "逐平台微調", chosen.length > 0)}<span style={{ flex: "0 0 28px", height: 1, background: "var(--border-strong)" }} />
        {step(3, "排程與審核", !!(s.when || s.mode === "now"))}
      </div>

      <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
        <section aria-label="主稿內容" style={{ ...sec, flex: "1 1 340px" }}>
          <h3 style={h2s}>主稿（所有平台共用）</h3>
          <div><label className="ad-lbl" htmlFor="hub-title">標題</label><input id="hub-title" className="ad-in" value={s.title} onChange={(e) => set("title", e.target.value)} placeholder="例：Home Assistant 自動化 3 個新手最常踩的坑" />
            <div style={{ ...muted, fontSize: 11.5, marginTop: 5 }}>下標原則：數字＋目標族群＋承諾</div></div>
          <div><label className="ad-lbl" htmlFor="hub-body">內文</label><textarea id="hub-body" className="ad-in" style={{ minHeight: 150, fontFamily: "var(--font-body)", lineHeight: 1.6 }} value={s.body} onChange={(e) => set("body", e.target.value)} /></div>
          <div><label className="ad-lbl" htmlFor="hub-image">圖片網址（https，公開可下載）</label><input id="hub-image" className="ad-in" value={s.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {SOC_IMAGE_PICKS.map((x) => <button key={x.path} type="button" className="ad-btn ghost" style={{ padding: "4px 9px", fontSize: 11.5 }} onClick={() => set("imageUrl", SOC_SITE_BASE + x.path)}>{x.label}</button>)}
            </div></div>
          <div><label className="ad-lbl" htmlFor="hub-link">連結（選填）</label><input id="hub-link" className="ad-in" value={s.link} onChange={(e) => set("link", e.target.value)} placeholder="https://…" /></div>
          <div><label className="ad-lbl" htmlFor="hub-tags">標籤 / Hashtag</label><input id="hub-tags" className="ad-in" value={s.hashtags} onChange={(e) => set("hashtags", e.target.value)} placeholder="#智慧家庭 #自動化" /></div>
          <div><label className="ad-lbl" htmlFor="hub-cat">內容分類</label>
            <select id="hub-cat" className="ad-in" value={s.category} onChange={(e) => set("category", e.target.value)}>{HUB_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        </section>

        <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <section aria-label="逐平台微調" style={sec}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h3 style={h2s}>發布平台與微調</h3><span style={muted}>已選 {chosen.length} 個平台</span>
          </div>
          <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {HUB_PF.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} onClick={() => setTab(p.id)}
                className={"ad-btn" + (tab === p.id ? " primary" : " ghost")} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px", opacity: s.platforms[p.id] || tab === p.id ? 1 : 0.6 }}>
                <PfChip pf={p} size={20} />{p.short}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: "var(--radius-md)", background: "var(--night-850)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ color: "var(--text-1)", fontSize: 14 }}>{pf.name}</strong>
                <span style={{ fontSize: 12, color: pf.live ? "var(--text-3)" : "var(--warning)" }}>
                  {!pf.live ? `${pf.phase}串接 · 目前僅保存內容` : s[pf.id] && s[pf.id].state && s[pf.id].state !== "draft" ? "排程器自動發布 · " + (HUB_CH_LABEL[s[pf.id].state] || s[pf.id].state) : "排程器自動發布"}</span>
              </div>
              <Toggle on={s.platforms[pf.id]} onChange={(v) => setPf(pf.id, v)}>啟用</Toggle>
            </div>
            {pf.live && s[pf.id] && s[pf.id].error ? <div style={{ fontSize: 12.5, color: "var(--danger)", lineHeight: 1.6 }}>上次錯誤：{String(s[pf.id].error.message || s[pf.id].error)}</div> : null}
            {pf.id === "ig" && s.platforms.ig ? <div style={{ fontSize: 12, color: s.imageUrl.trim() ? "var(--text-3)" : "var(--warning)", lineHeight: 1.6 }}>
              {s.imageUrl.trim() ? "IG 會使用主稿圖片；Meta 官方保證支援 JPEG，PNG 若被拒會顯示在錯誤訊息。" : "IG 貼文必須有圖片，請在主稿填寫圖片網址。"}</div> : null}
            <div>
              <label className="ad-lbl" htmlFor="hub-variant">{pf.id === "pc" ? "Show notes（留空沿用主稿）" : "說明文字（留空沿用主稿）"}</label>
              <textarea id="hub-variant" className="ad-in" style={{ minHeight: 130, fontFamily: "var(--font-body)", lineHeight: 1.6 }} value={s.variants[pf.id]} placeholder={hubMaster(s) || "沿用主稿"} onChange={(e) => setVar(pf.id, e.target.value)} />
              <div style={{ fontSize: 11.5, marginTop: 5, color: pf.limit && len(hubText(s, pf.id)) > pf.limit ? "var(--danger)" : "var(--text-3)" }}>
                {s.variants[pf.id].trim() ? "已覆寫主稿" : "沿用主稿"} · {len(hubText(s, pf.id)).toLocaleString()}{pf.limit ? " / " + pf.limit.toLocaleString() + " 字" : " 字"}
              </div>
            </div>
          </div>
        </section>

        <section aria-label="預覽與排程" style={sec}>
          <h3 style={h2s}>預覽</h3>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {tab === "fb" ? <FbPreview p={preview} /> : (
              <div style={{ width: "100%", padding: 14, borderRadius: "var(--radius-md)", background: "var(--night-850)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><PfChip pf={pf} size={24} /><strong style={{ color: "var(--text-1)", fontSize: 13 }}>{pf.name}</strong></div>
                {s.imageUrl ? <img src={s.imageUrl} alt="" style={{ width: "100%", borderRadius: "var(--radius-md)", background: "var(--night-700)" }} /> : null}
                <div style={{ fontSize: 13.5, color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{hubText(s, pf.id) || <span style={{ color: "var(--text-4)" }}>（尚無內文）</span>}</div>
              </div>
            )}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={h2s}>排程</h3>
            {[["now", "立即發布"], ["time", "指定時間（全平台相同）"]].map(([k, l]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--text-2)", minHeight: 32, cursor: "pointer" }}>
                <input type="radio" name="hub-when" checked={s.mode === k} onChange={() => set("mode", k)} />{l}
              </label>
            ))}
            {s.mode === "time" ? (
              <div><label className="ad-lbl" htmlFor="hub-when">發布時間（台北 UTC+8）</label><input id="hub-when" className="ad-in" type="datetime-local" value={s.when} onChange={(e) => set("when", e.target.value)} /></div>
            ) : null}
            <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>FB：{SOC_NATIVE_MIN_MIN} 分鐘～29 天內交給 Meta 原生排程（分鐘級準時）。IG／Threads 沒有原生排程，於預定時間前 5 分鐘內由排程器送出（每 10 分鐘一輪，尖峰可能延遲）。</div>
            <Toggle on={s.needReview} onChange={(v) => set("needReview", v)}>發布前需審核（先送交待審核）</Toggle>
            {editable ? (
              <button className="ad-btn primary" disabled={busy} onClick={s.needReview ? submit : approve}>
                {s.needReview ? "送交審核" : s.mode === "now" ? "核准並立即發布" : `確認排程 · ${toSend.length} 個平台`}
              </button>
            ) : null}
            {chosen.some((p) => !p.live) ? <div style={{ fontSize: 12, color: "var(--warning)" }}>
              {chosen.filter((p) => !p.live).map((p) => p.short).join("、")} 尚未串接，內容會保存，暫不發布。</div> : null}
          </div>
        </section>
        </div>
      </fieldset>
    </div>
  );
}

/* =====================================================================
   04 內容庫與發布管理
   ===================================================================== */
const HUB_PAGE = 20;
function hubCsv(rows) {
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const head = ["標題", "分類", "平台", "排程/發布時間（台北）", "狀態", "更新時間（台北）"];
  return "﻿" + [head, ...rows.map((r) => [r.title, (r.hub && r.hub.category) || "", hubPlatforms(r).map((p) => p.short).join("/"), tpMdHm(hubWhen(r)), HUB_ST[hubStatus(r)].label, tpMdHm(r.updatedAt)])]
    .map((l) => l.map(esc).join(",")).join("\r\n");
}
function HubLibrary({ list, openPost, query, setQuery }) {
  const [f, setF] = useState("all");
  const [pf, setPf] = useState("all");
  const [cat, setCat] = useState("all");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [f, pf, cat, query]);
  const q = query.trim().toLowerCase();
  const base = list.filter((r) => (pf === "all" || hubPlatforms(r).some((p) => p.id === pf)) && (cat === "all" || (r.hub && r.hub.category) === cat)
    && (!q || [r.title, r.hub && r.hub.hashtags, r.fb && r.fb.caption].some((x) => String(x || "").toLowerCase().includes(q))));
  const rows = base.filter((r) => f === "all" || hubStatus(r) === f).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const pages = Math.max(1, Math.ceil(rows.length / HUB_PAGE));
  const shown = rows.slice(page * HUB_PAGE, page * HUB_PAGE + HUB_PAGE);
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([hubCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "content-hub-" + TZDate() + ".csv"; a.click(); URL.revokeObjectURL(url);
  };
  const sel = { width: "auto", minHeight: 36, padding: "6px 10px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ ...muted, flex: "1 1 260px" }}>一篇主稿對應多個平台的發布紀錄，可追蹤每個平台的狀態</span>
        <button className="ad-btn ghost" onClick={exportCsv} disabled={!rows.length}>匯出 CSV</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Pill on={f === "all"} onClick={() => setF("all")}>全部 <b>{base.length}</b></Pill>
        {[...HUB_ORDER, "rejected"].map((k) => <Pill key={k} on={f === k} onClick={() => setF(k)}>{HUB_ST[k].label} <b>{base.filter((r) => hubStatus(r) === k).length}</b></Pill>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <select className="ad-in" aria-label="平台" style={sel} value={pf} onChange={(e) => setPf(e.target.value)}>
          <option value="all">全部平台</option>{HUB_PF.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="ad-in" aria-label="分類" style={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">全部分類</option>{HUB_CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="ad-in" type="search" aria-label="搜尋內容" placeholder="搜尋標題、內文或標籤" style={{ ...sel, flex: "1 1 200px" }} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <section aria-label="內容清單" style={{ ...card, padding: "6px 14px 12px" }}>
        <HubTable rows={shown} openPost={openPost} empty="沒有符合條件的內容。" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, flexWrap: "wrap" }}>
          <span style={muted}>顯示 {rows.length ? page * HUB_PAGE + 1 : 0}–{page * HUB_PAGE + shown.length}，共 {rows.length} 筆</span>
          <span style={{ flex: 1 }} />
          <button className="ad-btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>上一頁</button>
          <span style={{ ...muted, fontFamily: "var(--font-mono)" }}>{page + 1} / {pages}</span>
          <button className="ad-btn ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>下一頁</button>
        </div>
      </section>
    </div>
  );
}
const TZDate = () => { const p = tpParts(Date.now()); return p.y + "-" + p2(p.m) + "-" + p2(p.d); };

/* =====================================================================
   05 平台連線管理（Token 只存在 GitHub Secrets，此頁唯讀顯示排程器回報）
   ===================================================================== */
function HubPlatforms({ list, meta, reload }) {
  const lastRun = meta && meta.lastRunAt ? Date.parse(meta.lastRunAt) : NaN;
  const ran = isFinite(lastRun);
  const stale = ran && Date.now() - lastRun > 45 * 60000;
  const health = Object.fromEntries(HUB_LIVE.map((ch) => [ch, hubChannelHealth(meta, ch)]));
  const pending = (ch) => list.filter((r) => chOn(r, ch) && HUB_ACTIVE.includes(chState(r, ch))).length;
  const lastPub = (ch) => list.map((r) => chOn(r, ch) && chState(r, ch) === "published" && r[ch].publishedAt).filter(Boolean).sort().pop();
  const ENV = { fb: "META_PAGE_TOKEN／META_PAGE_ID", ig: "META_IG_USER_ID（沿用 META_PAGE_TOKEN）", th: "THREADS_USER_ID／THREADS_TOKEN" };
  const thExp = health.th.expiresAt ? Date.parse(health.th.expiresAt) : NaN;
  const thDays = isFinite(thExp) ? Math.floor((thExp - Date.now()) / DAY) : null;
  const broken = HUB_LIVE.filter((ch) => health[ch].ran && health[ch].configured && !health[ch].ok);
  const connected = HUB_LIVE.filter((ch) => health[ch].ok).length;
  const kv = (k, v, tone) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--text-3)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right", color: tone || "var(--text-2)" }}>{v}</span>
    </div>
  );
  const pcard = { ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 };
  const rules = [
    "時區固定為台北（UTC+8）",
    "排程器每 10 分鐘執行一次（GitHub Actions · social-publish.yml）",
    `FB 發布時間在 ${SOC_NATIVE_MIN_MIN} 分鐘～29 天內交給 Meta 原生排程`,
    "IG／Threads 以容器兩段式發布，到期前 5 分鐘內送出",
    "結果不明不重送，避免重複發文；失敗可在內容庫重新核准",
    "某平台 Token 失效時只暫停該平台，其他平台照常發布",
    "Threads Token 每日自動續期，60 天到期日隨之順延",
    "平台 Token 只存在 Repo Secrets 與排程器專用資料，不出現在前端",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ ...muted, flex: "1 1 260px" }}>以伺服器端 Token 連線；狀態由排程器每輪回報（最後執行 {ran ? tpMdHm(meta.lastRunAt) : "—"}）</span>
        <button className="ad-btn ghost" onClick={reload}>檢查所有連線</button>
      </div>
      {broken.length || stale ? (
        <div role="alert" style={{ ...card, padding: "12px 16px", borderColor: "var(--danger)", background: "var(--danger-soft)", fontSize: 13, color: "var(--text-1)", lineHeight: 1.7 }}>
          {broken.map((ch) => <div key={ch}>{HUB_PF.find((p) => p.id === ch).name} Token 異常：{health[ch].error || "請更新 " + ENV[ch]}。{pending(ch)} 筆排程暫停，更新 Secrets 後排程器會自動接續。</div>)}
          {stale ? <div>排程器超過 45 分鐘未執行，請檢查 GitHub Actions 是否被停用。</div> : null}
        </div>
      ) : null}
      {thDays != null && thDays < 7 ? (
        <div role="alert" style={{ ...card, padding: "12px 16px", borderColor: "var(--warning)", background: "var(--warning-soft)", fontSize: 13, color: "var(--text-1)", lineHeight: 1.7 }}>
          Threads Token 將於 {tpMdHm(health.th.expiresAt)} 到期（剩 {Math.max(thDays, 0)} 天）。{health.th.refreshError ? "自動續期失敗：" + health.th.refreshError + "。" : ""}請重新產生長效 Token 並更新 THREADS_TOKEN。
        </div>
      ) : null}

      <section aria-label="第一階段核心平台" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><h3 style={h2s}>第一階段 · 核心平台</h3><span style={muted}>{connected} / {HUB_PF.length} 已連線</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
          {HUB_PF.map((p) => {
            const h = health[p.id];
            const [tag, tagText] = p.live ? healthTag(h) : ["rejected", "尚未串接"];
            return (
              <article key={p.id} style={pcard}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PfChip pf={p} size={40} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <strong style={{ color: "var(--text-1)", fontSize: 14 }}>{p.name}</strong>
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.live ? (h.name || (h.configured === false ? "Secrets 未設定" : "—")) : p.phase}</span>
                  </div>
                  <StTag st={tag} text={tagText} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {kv("授權方式", p.api)}
                  {kv("支援格式", p.formats)}
                  {p.live ? kv("最近發布", lastPub(p.id) ? tpMdHm(lastPub(p.id)) : "—") : kv("內容保存", list.filter((r) => r.hub && r.hub.platforms && r.hub.platforms[p.id]).length + " 篇")}
                  {p.live ? kv("排程中", pending(p.id) + " 筆") : null}
                  {p.id === "th" && h.expiresAt ? kv("Token 到期", tpMdHm(h.expiresAt), thDays != null && thDays < 7 ? "var(--warning)" : undefined) : null}
                  {p.live && h.ran && h.configured === false ? kv("需要的 Secrets", ENV[p.id], "var(--warning)") : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-label="後續階段平台" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><h3 style={h2s}>第二、三階段 · 預留</h3><span style={muted}>依內容類型擴充，尚未啟用</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {HUB_RESERVED.map(([s, n, ph]) => (
            <div key={s} style={{ ...card, padding: 12, display: "flex", alignItems: "center", gap: 10, opacity: 0.75 }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 34, height: 34, borderRadius: 8, background: "var(--night-700)", color: "var(--text-3)", fontSize: 11, fontWeight: 800, border: "1px dashed var(--border-strong)" }}>{s}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 13, color: "var(--text-2)" }}>{n}</strong><span style={{ fontSize: 11.5, color: "var(--text-4)" }}>{ph}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="全域發布規則" style={{ ...card, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={h2s}>全域發布規則</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "6px 22px", color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.6 }}>
          {rules.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>規則由 scripts/social/core.mjs 實作，設定步驟見 docs/SOCIAL_SOP.md。</span>
      </section>
    </div>
  );
}

/* =====================================================================
   主元件：頂部分頁切換五個畫面，共用同一份 aurora_social_posts 資料
   ===================================================================== */
const HUB_VIEWS = [
  { id: "dash", label: "儀表板" }, { id: "calendar", label: "排程日曆" }, { id: "compose", label: "建立內容" },
  { id: "library", label: "內容庫" }, { id: "platforms", label: "平台連線" },
];

function ContentHubPanel() {
  const [view, setView] = useState("dash");
  const [list, setList] = useState(null);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState(hubBlank);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const snap = await db.collection(SOC_COLL).get();
      setList(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
    } catch (ex) { setErr("讀取失敗：" + errText(ex)); setList([]); }
    try { const m = await db.doc(SOC_META_DOC).get(); setMeta(m.exists ? m.data() : {}); } catch { setMeta({}); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 4200); };
  const openPost = (r) => { setDraft(hubFromPost(r)); setView("compose"); setToast(""); };
  const newPost = () => { setDraft(hubBlank()); setView("compose"); setToast(""); };
  const go = (v) => { if (v === "compose") newPost(); else setView(v); };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-1)", fontSize: 22, margin: 0 }}>內容中控台</h2>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{SOC_COLL} · 一次製作 → 逐平台微調 → 排程發布（第一階段自動發 FB）</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ad-btn ghost" onClick={load}>重新整理</button>
          <button className="ad-btn primary" onClick={newPost}>＋ 建立內容</button>
        </div>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {HUB_VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={"ad-btn" + (view === v.id ? " primary" : " ghost")} style={{ padding: "8px 14px" }}
            onClick={() => (v.id === "compose" && view !== "compose" ? newPost() : setView(v.id))}>{v.label}</button>
        ))}
      </div>
      {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>{toast}</div>}
      {list == null ? <div style={{ color: "var(--text-3)" }}>載入中…</div>
        : view === "dash" ? <HubDashboard list={list} meta={meta} go={go} openPost={openPost} />
        : view === "calendar" ? <HubCalendar list={list} openPost={openPost} newPost={newPost} />
        : view === "compose" ? <HubComposer init={draft} reload={load} flash={flash} go={go} />
        : view === "library" ? <HubLibrary list={list} openPost={openPost} query={query} setQuery={setQuery} />
        : <HubPlatforms list={list} meta={meta} reload={load} />}
    </div>
  );
}

window.ContentHubPanel = ContentHubPanel;
})();
