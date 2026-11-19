/* =====================================================================
   Claude 排程素材匯入 · 純邏輯（與 Firestore／git／檔案系統解耦）
   ---------------------------------------------------------------------
   Claude 排程任務把當日成品推到 repo 的 content 分支：
     content/<topic>/<YYYYMMDD>/manifest.json ＋ fb.txt／ig.txt／threads.txt ＋ 圖卡
   ingest-content.mjs（social-publish.yml 每 10 分鐘先執行）讀這些素材，
   轉成 PilotOne 佇列 aurora_social_posts 的一筆貼文：
     - 一般主題 → 草稿（queueState=draft），等 Allen 在「PilotOne 審核」核准
     - 允許自動發布的主題（SOCIAL_AUTO_TOPICS，預設無＝全部人工審核）且
       manifest.autoPublish && manifest.verified → 直接核准、立即發布
   文件 id 固定 cs_<topic>_<YYYYMMDD>：同一天同主題只會有一筆，重跑不重複。
   ===================================================================== */

export const KNOWN_TOPICS = {
  "txf-flash": { label: "台股台指期快訊", category: "理財" },
  "tsm-prebrief": { label: "台股盤前速報", category: "理財" },
  daily: { label: "艾倫極光日報", category: "生活" },
  noon: { label: "艾倫極光午報", category: "AI 應用" },
  heatmap: { label: "台股熱力圖．上市／上櫃", category: "理財" },
  stockradar: { label: "台股選股雷達", category: "理財" },
  "tw-whale-weekly": { label: "台股大戶籌碼週報", category: "理財" },
};
// 2026-11-18 Allen 決定：所有主題（含台指期快訊）一律經 PilotOne 人工審核；要開放自動發布請設 Repo Variable SOCIAL_AUTO_TOPICS
export const DEFAULT_AUTO_TOPICS = [];
export const LIMITS = { ig: 2200, th: 500, igHashtags: 30, maxImages: { fb: 10, ig: 10, th: 20 } };
export const CHANNEL_FILES = { fb: "fb.txt", ig: "ig.txt", th: "threads.txt" };
const MANIFEST_CH = { fb: "fb", ig: "ig", threads: "th" }; // manifest.platforms 的 key → PilotOne 頻道
const IMG_RE = /\.(png|jpe?g)$/i;

export const docIdOf = (topic, ymd) => `cs_${topic}_${ymd}`;

/* 台北日期：today 與 yesterday（YYYYMMDD、YYYY-MM-DD、YYYY/MM/DD） */
export function taipeiDays(now = Date.now(), back = 1) {
  const out = [];
  for (let i = 0; i <= back; i++) {
    const d = new Date(now + 8 * 3600 * 1000 - i * 86400 * 1000);
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), dd = String(d.getUTCDate()).padStart(2, "0");
    out.push({ ymd: `${y}${m}${dd}`, dash: `${y}-${m}-${dd}`, slash: `${y}/${m}/${dd}` });
  }
  return out;
}

const countHashtags = (t) => (String(t).match(/(^|\s)#[^\s#]+/g) || []).length;
const len = (t) => [...String(t || "")].length;

/*
 * 驗證一份 manifest。
 *   m        manifest 物件
 *   folder   { topic, ymd }（由資料夾路徑得出，manifest 內容須與之相符）
 *   files    { has(name) → bool, text(name) → string }（資料夾內檔案存取）
 * 回傳 { ok, errors[], channels: { fb|ig|th: { caption, images[] } } }
 */
export function validateManifest(m, folder, files) {
  const errors = [];
  const channels = {};
  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest.json 不是有效的 JSON 物件"], channels };
  if (m.version !== 1) errors.push(`version 應為 1（目前 ${m.version}）`);
  if (m.topic !== folder.topic) errors.push(`topic「${m.topic}」與資料夾「${folder.topic}」不符`);
  if (!KNOWN_TOPICS[folder.topic]) errors.push(`未知的主題代碼「${folder.topic}」`);
  const dash = `${folder.ymd.slice(0, 4)}-${folder.ymd.slice(4, 6)}-${folder.ymd.slice(6, 8)}`;
  const slash = dash.replace(/-/g, "/");
  if (m.date !== dash) errors.push(`date「${m.date}」與資料夾日期 ${dash} 不符`);
  if (!String(m.title || "").trim()) errors.push("缺少 title");
  const plats = m.platforms && typeof m.platforms === "object" ? m.platforms : {};
  const keys = Object.keys(plats);
  if (!keys.length) errors.push("platforms 沒有任何平台");
  for (const k of keys) {
    const ch = MANIFEST_CH[k];
    if (!ch) { errors.push(`不支援的平台「${k}」（只接受 fb、ig、threads）`); continue; }
    const p = plats[k] || {};
    const capName = p.caption || CHANNEL_FILES[ch];
    let caption = "";
    if (!files.has(capName)) errors.push(`${k}：找不到文案檔 ${capName}`);
    else caption = String(files.text(capName) || "").replace(/\r\n/g, "\n").trim();
    if (files.has(capName) && !caption) errors.push(`${k}：文案檔 ${capName} 是空的`);
    if (caption && !caption.includes(slash)) errors.push(`${k}：文案未包含當日日期 ${slash}`);
    if (ch === "ig" && len(caption) > LIMITS.ig) errors.push(`ig：文案 ${len(caption)} 字元，超過 ${LIMITS.ig}`);
    if (ch === "ig" && countHashtags(caption) > LIMITS.igHashtags) errors.push(`ig：hashtag ${countHashtags(caption)} 個，超過 ${LIMITS.igHashtags}`);
    if (ch === "th" && len(caption) > LIMITS.th) errors.push(`threads：文案 ${len(caption)} 字元，超過 ${LIMITS.th}`);
    const images = Array.isArray(p.images) ? p.images.map(String) : [];
    for (const img of images) {
      if (!IMG_RE.test(img)) errors.push(`${k}：圖片 ${img} 不是 PNG／JPEG`);
      else if (!files.has(img)) errors.push(`${k}：找不到圖片 ${img}`);
    }
    if (ch === "ig" && !images.length) errors.push("ig：Instagram 貼文必須有圖片");
    if (images.length > LIMITS.maxImages[ch]) errors.push(`${k}：圖片 ${images.length} 張，超過 ${LIMITS.maxImages[ch]} 張`);
    channels[ch] = { caption, images };
  }
  return { ok: errors.length === 0, errors, channels };
}

/* 是否可自動發布：主題在白名單，且 manifest 宣告 autoPublish 與 verified 皆為 true */
export function isAutoPublish(m, autoTopics = DEFAULT_AUTO_TOPICS) {
  return !!(m && autoTopics.includes(m.topic) && m.autoPublish === true && m.verified === true);
}

/*
 * 組出 aurora_social_posts 文件（欄位與後台「建立內容」相同，另加頻道 imageUrls）。
 *   urlOf(file) → 該圖片已轉 JPEG 的公開 https 網址
 */
export function buildPost(m, folder, channels, { urlOf, auto, nowIso }) {
  const t = KNOWN_TOPICS[folder.topic] || { category: "生活" };
  const ch = (id) => {
    const c = channels[id];
    const base = { enabled: !!c, caption: c ? c.caption : "", state: c ? (auto ? "approved" : "draft") : "draft", attempts: 0, error: null,
      imageUrls: c ? c.images.map(urlOf) : [] };
    if (id === "fb") Object.assign(base, { link: "", postId: null });
    else Object.assign(base, { containerId: null });
    return base;
  };
  const fb = ch("fb"), ig = ch("ig"), th = ch("th");
  const first = fb.imageUrls[0] || ig.imageUrls[0] || th.imageUrls[0] || "";
  return {
    title: String(m.title).trim(),
    imageUrl: first,
    note: `Claude 排程素材匯入：${t.label || folder.topic} ${m.date}`,
    scheduledAt: auto ? nowIso : "",
    queueState: auto ? "pending" : "draft",
    source: { type: "claude-schedule", topic: folder.topic, date: m.date, producedBy: m.producedBy || null, producedAt: m.producedAt || null,
      manifestPath: `content/${folder.topic}/${folder.ymd}/manifest.json`, autoPublish: !!auto },
    fb, ig, th,
    yt: { enabled: false, caption: "", state: "draft", attempts: 0, error: null, videoId: null },
    lock: { by: null, at: null },
    review: auto ? { approvedAt: nowIso, by: "auto:claude-schedule" } : { approvedAt: null, by: null },
    // 後台「建立內容」編輯器讀 hub：主稿＝FB 文案，IG／Threads 以逐平台覆寫保留原文，避免編修時被主稿蓋掉
    hub: { stage: "review", body: fb.caption, hashtags: "", category: t.category,
      platforms: { fb: !!channels.fb, ig: !!channels.ig, th: !!channels.th, yt: false, pc: false },
      variants: { fb: "", ig: ig.caption, th: th.caption, yt: "", pc: "" } },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/* 既有文件的處理方式：create／update／skip（附原因） */
const UNTOUCHED = ["draft", "failed", undefined, null, ""];
export function planIngest(existing, m) {
  if (!existing) return { action: "create" };
  const src = existing.source || {};
  if (src.type !== "claude-schedule") return { action: "skip", reason: "同 id 文件不是 Claude 排程素材，不覆蓋" };
  if (src.producedAt && m.producedAt && src.producedAt === m.producedAt) return { action: "skip", reason: "素材未變更" };
  const busy = ["fb", "ig", "th"].some((c) => existing[c] && existing[c].enabled && !UNTOUCHED.includes(existing[c].state));
  if (busy) return { action: "skip", reason: "已核准、發布中或已發布，不覆蓋（如需改稿請在後台處理）" };
  return { action: "update" };
}

/* 匯入紀錄中每筆貼文的狀態摘要（給 AllenI3Aurora Agent 讀） */
export function postSummary(id, d) {
  const ch = (c) => {
    const x = d && d[c];
    if (!x || !x.enabled) return null;
    const url = x.permalink || (c === "fb" && x.postId ? `https://www.facebook.com/${x.postId}` : null);
    return { state: x.state || "draft", url, error: x.error || null };
  };
  return { id, topic: d && d.source ? d.source.topic : null, queueState: d ? d.queueState : null, fb: ch("fb"), ig: ch("ig"), th: ch("th") };
}
