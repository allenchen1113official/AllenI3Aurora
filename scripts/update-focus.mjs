/* =====================================================================
   今日關注動態 — 定時更新腳本（伺服器端，由 GitHub Actions 執行）。

   比照 TAIEX／運動：伺服器端讀取 Google Drive，將「今日」的內容彙整成
   同源 data/focus.json 供前端讀取，作為儀表板「今日關注動態」的資料來源。

   資料來源（Google Drive，皆以 YYYYMMDD＝今日 命名的日期資料夾）：
     AllenI3Aurora/finance/heatmap/YYYYMMDD/      台股熱力圖
     AllenI3Aurora/finance/stockradar/YYYYMMDD/   選股雷達
     AllenI3Aurora/newsletter/day/YYYYMMDD/       每日日報
   若當日資料夾尚未產生，該來源退回「最近一個日期資料夾」，並於說明標註
   實際日期；三者皆無則保留現有 data/focus.json（不覆蓋）。

   授權：需以 Google 服務帳戶（Service Account）唯讀存取上述資料夾，
   金鑰（JSON 全文）由 GitHub Actions Secrets 提供：
     GDRIVE_SERVICE_ACCOUNT
   並將 Drive 的「AllenI3Aurora」資料夾以「檢視者」分享給該服務帳戶 email。
   未設定金鑰或讀取失敗時，維持現有 data/focus.json 不變（不會失敗）。
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "data/focus.json";
const SA = process.env.GDRIVE_SERVICE_ACCOUNT;

function keepExisting(reason) {
  console.error(reason + " → 維持現有 " + OUT + " 不變。");
  process.exit(0);
}

/* 台北時區今日 YYYYMMDD。 */
function taipeiYmd(date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}${p.month}${p.day}`;
}
const ymdDisplay = (ymd) => `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;

/* 三個來源的定義：Drive 路徑（相對 AllenI3Aurora）與呈現用的卡片樣式。 */
const SOURCES = [
  { key: "heatmap", path: ["finance", "heatmap"], tag: "理財", tone: "insight", icon: "chart", title: "台股熱力圖 · 上市／上櫃", note: "市值熱力圖" },
  { key: "stockradar", path: ["finance", "stockradar"], tag: "選股", tone: "intelligence", icon: "compass", title: "台股選股雷達", note: "訊號雷達" },
  { key: "newsletter", path: ["newsletter", "day"], tag: "日報", tone: "illumination", icon: "paper", title: "艾倫極光日報", note: "每日速報" },
];

async function main() {
  if (!SA) keepExisting("未提供 GDRIVE_SERVICE_ACCOUNT");

  let google;
  try { ({ google } = await import("googleapis")); }
  catch (e) { keepExisting("無法載入 googleapis 套件：" + e.message); }

  let drive;
  try {
    const credentials = JSON.parse(SA);
    const auth = new google.auth.GoogleAuth({
      credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    drive = google.drive({ version: "v3", auth });
  } catch (e) { keepExisting("服務帳戶金鑰無效：" + e.message); }

  const listFolders = async (q) => {
    const res = await drive.files.list({
      q: q + " and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name)", pageSize: 100,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  };
  const childFolder = async (name, parentId) => {
    const esc = name.replace(/'/g, "\\'");
    const list = await listFolders(`name='${esc}' and '${parentId}' in parents`);
    return list[0] ? list[0].id : null;
  };

  // 由分享給服務帳戶的根資料夾往下解析路徑。
  let rootId;
  try {
    const roots = await listFolders("name='AllenI3Aurora'");
    if (!roots.length) keepExisting("找不到（或未分享）AllenI3Aurora 資料夾給服務帳戶");
    rootId = roots[0].id;
  } catch (e) { keepExisting("Drive 讀取失敗：" + e.message); }

  const today = taipeiYmd();
  const items = [];

  for (const src of SOURCES) {
    try {
      let parent = rootId;
      for (const seg of src.path) { parent = parent && (await childFolder(seg, parent)); }
      if (!parent) continue; // 該來源路徑不存在

      // 優先今日；否則取最近一個 YYYYMMDD 日期資料夾。
      let dateId = await childFolder(today, parent);
      let dateYmd = today;
      if (!dateId) {
        const dates = (await listFolders(`'${parent}' in parents`))
          .filter((f) => /^\d{8}$/.test(f.name))
          .sort((a, b) => (a.name < b.name ? 1 : -1));
        if (!dates.length) continue;
        dateId = dates[0].id; dateYmd = dates[0].name;
      }
      const meta = `${ymdDisplay(dateYmd)} · ${src.note}${dateYmd === today ? "" : "（最新）"}`;
      items.push({ tag: src.tag, tone: src.tone, title: src.title, meta, icon: src.icon });
    } catch (e) {
      console.error(`來源 ${src.key} 讀取失敗：`, e.message); // 單一來源失敗不影響其他
    }
  }

  if (!items.length) keepExisting("三個來源皆無可用資料夾");

  const result = { items, asOf: ymdDisplay(today), updatedAt: new Date().toISOString() };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("已寫入", OUT, "→", items.length, "則關注動態");
}

main().catch((e) => {
  console.error(e);
  try { readFileSync(OUT); process.exit(0); } catch { process.exit(1); }
});
