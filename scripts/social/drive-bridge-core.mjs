/* =====================================================================
   PilotOne Drive 橋接（純邏輯，供 drive-bridge.mjs 與測試共用）

   Claude 發文排程（Mac mini）不再用 Chrome 發文，而是在各主題的 Drive 日期資料夾下
   寫一個標準「送審包」：

     AllenI3Aurora/<主題資料夾>/<YYYYMMDD>/pilotone/
        manifest.json  ＋  fb.txt／ig.txt／threads.txt  ＋  圖卡 PNG／JPEG

   social-publish.yml 每輪先跑 drive-bridge.mjs：以 GDRIVE_SERVICE_ACCOUNT（唯讀）讀取
   台北「今天＋昨天」的送審包，原樣複製到 content 分支 content/<topic>/<YYYYMMDD>/，
   再交給既有的 ingest-content.mjs 驗證、轉 JPEG、建立 PilotOne 審核草稿。
   ===================================================================== */

/* 主題代碼 → AllenI3Aurora 底下的 Drive 資料夾路徑（與 ingest-core.mjs KNOWN_TOPICS 一致） */
export const DRIVE_PATHS = {
  "txf-flash": ["finance", "twex"],
  "tsm-prebrief": ["finance", "TSMPreBrief"],
  daily: ["newsletter", "day"],
  noon: ["newsletter", "noon"],
  heatmap: ["finance", "heatmap"],
  stockradar: ["finance", "stockradar"],
  "tw-whale-weekly": ["finance", "whale"],
};
/* 主題家族：同一天可有多份送審包，各放在 pilotone/<子代碼>/ 底下，topic＝<前綴>-<子代碼>。
   yt ＝ 常看 YouTube 重點筆記（每支影片一份；子代碼＝YouTube 影片 ID 或 IG 短碼），
   Drive：AllenI3Aurora/notes/youtube/<YYYYMMDD>/pilotone/<影片ID>/manifest.json… */
export const DRIVE_FAMILIES = {
  yt: { path: ["notes", "youtube"], sub: /^[A-Za-z0-9_-]{6,20}$/ },
};
export function familyTopic(prefix, sub) {
  const f = DRIVE_FAMILIES[prefix];
  return f && f.sub.test(String(sub || "")) ? `${prefix}-${sub}` : null;
}
export const PKG_DIR = "pilotone";
export const MANIFEST = "manifest.json";
const SAFE_NAME = /^[^/\\]+$/;

/* manifest 內引用的所有檔名（文案＋圖卡），去重、排除不安全路徑 */
export function referencedFiles(m) {
  const out = new Set();
  const bad = [];
  const p = (m && m.platforms) || {};
  for (const key of Object.keys(p)) {
    const c = p[key] || {};
    for (const n of [c.caption, ...(Array.isArray(c.images) ? c.images : [])]) {
      if (n == null || n === "") continue;
      const s = String(n);
      if (!SAFE_NAME.test(s) || s.includes("..") || s === MANIFEST) bad.push(s);
      else out.add(s);
    }
  }
  return { files: [...out], bad };
}

/* 是否需要把 Drive 送審包同步到 content 分支 */
export function needsSync(local, drive) {
  if (!drive) return { sync: false, reason: "Drive 無送審包" };
  if (!local) return { sync: true, reason: "content 分支尚無此送審包" };
  if (!drive.producedAt) return { sync: JSON.stringify(local) !== JSON.stringify(drive), reason: "manifest 無 producedAt，以內容比對" };
  if (local.producedAt === drive.producedAt) return { sync: false, reason: "producedAt 相同，素材未變更" };
  return { sync: true, reason: `producedAt 變更（${local.producedAt || "無"} → ${drive.producedAt}）` };
}

/* Drive 同名檔（含「(1)」副本或重複上傳）：取完全同名、最後修改者 */
export function pickFile(list, name) {
  const same = (list || []).filter((f) => f && f.name === name && !f.trashed);
  if (!same.length) return null;
  return same.sort((a, b) => String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")))[0];
}

/* Drive 同名資料夾（例如「20261118」與「20261118 2」）：只認完全同名，多筆時取最早建立者 */
export function pickFolder(list, name) {
  const same = (list || []).filter((f) => f && f.name === name && !f.trashed);
  if (!same.length) return null;
  return same.sort((a, b) => String(a.createdTime || "").localeCompare(String(b.createdTime || "")))[0];
}

/* Drive 查詢字串的單引號跳脫 */
export const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
