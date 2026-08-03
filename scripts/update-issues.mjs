/* =====================================================================
   本期報報 — 定時更新腳本（伺服器端，由 GitHub Actions 執行）。

   讀取 Google Drive 三個電子報資料夾的「當期」內容，彙整成同源
   data/newsletter-current.json，供前端「本期報報」以日報／週報／月報切換，
   各自顯示當期摘要卡並連到完整 HTML 頁面。比照 update-focus.mjs 的機制。

   資料來源（Google Drive，皆以 YYYYMMDD＝日期 命名的日期資料夾）：
     AllenI3Aurora/newsletter/day/YYYYMMDD/     日報
     AllenI3Aurora/newsletter/week/YYYYMMDD/    週報
     AllenI3Aurora/newsletter/month/YYYYMMDD/   月報
   每個節奏取「最近一個日期資料夾」為當期，擷取：
     - title：自 markdown 標題／首行內文擷取（失敗用預設）。
     - summary：約 125 字元社群摘要（自文字檔擷取，失敗留空由前端組出）。
     - date：日期資料夾（YYYYMMDD）轉顯示格式。
     - link：本站前台電子報頁面（HTML，依日期深連結 ?issue=YYYY-MM-DD）。

   授權同 update-focus.mjs：GDRIVE_SERVICE_ACCOUNT（服務帳戶金鑰 JSON 全文）。
   未設定或讀取失敗時，維持現有 data/newsletter-current.json 不變（不會失敗）。
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "data/newsletter-current.json";
const SA = process.env.GDRIVE_SERVICE_ACCOUNT;
const SUMMARY_MAX = 125; // 社群分享文字摘要上限（約 125 字元）
const SITE_URL = "https://allenchen1113official.github.io/AllenI3Aurora/";

function keepExisting(reason) {
  console.error(reason + " → 維持現有 " + OUT + " 不變。");
  process.exit(0);
}

const ymdDisplay = (ymd) => `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
const ymdIso = (ymd) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/* 三個節奏：Drive 路徑、卡片樣式與預設值。 */
const CADENCES = [
  { key: "day", path: ["newsletter", "day"], kind: "日報", tone: "illumination",
    titleFallback: "艾倫極光日報", note: "每日速報" },
  { key: "week", path: ["newsletter", "week"], kind: "週報", tone: "insight",
    titleFallback: "艾倫報報 · 本週彙整", note: "每週深度" },
  { key: "month", path: ["newsletter", "month"], kind: "月報", tone: "intelligence",
    titleFallback: "艾倫報報 · 本月回顧", note: "每月沉澱" },
];

/* 清理一行文字：移除 URL、markdown 記號、表情符號、多餘空白。 */
function cleanLine(s) {
  return String(s)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "") // emoji（代理對）
    .replace(/[#>*_`~\\]/g, "")
    .replace(/[｜|─—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SKIP = /(社群分享文案|建議搭配圖片|盤後速報|資料日期說明|今日重點|風險提醒|艾倫極光日報|艾倫報報|ALLEN|排行總覽|Facebook|Instagram|建議|來源[:：]|版$)/;

/* 自來源文字擷取標題：優先 markdown 標題，否則取首個足夠長的內文行。 */
function extractTitle(raw) {
  const lines = String(raw).split(/\r?\n/);
  for (const l of lines) {
    const m = l.match(/^#{1,3}\s+(.+)/);
    if (m) { const t = cleanLine(m[1]); if (t && !SKIP.test(t)) return t.slice(0, 40); }
  }
  for (const l of lines.map(cleanLine).filter(Boolean)) {
    if (!SKIP.test(l) && (l.match(/[一-鿿]/g) || []).length >= 4) return l.slice(0, 40);
  }
  return "";
}

/* 自來源文字擷取「約 125 字元」的社群分享摘要；找不到回傳空字串。 */
function extractSummary(raw) {
  const lines = String(raw).split(/\r?\n/).map(cleanLine).filter(Boolean);
  const picked = [];
  let total = 0;
  for (const ln of lines) {
    if (SKIP.test(ln)) continue;
    if ((ln.match(/[一-鿿]/g) || []).length < 6) continue;
    picked.push(ln);
    total += ln.length + 1;
    if (total >= SUMMARY_MAX) break;
  }
  if (!picked.length) return "";
  let out = picked.join("，");
  if (out.length > SUMMARY_MAX) out = out.slice(0, SUMMARY_MAX - 1) + "…";
  return out;
}

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

  const listChildren = async (q, fields) => {
    const res = await drive.files.list({
      q: q + " and trashed=false", fields: `files(${fields})`, pageSize: 200,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  };
  const childFolder = async (name, parentId) => {
    const esc = name.replace(/'/g, "\\'");
    const l = await listChildren(`name='${esc}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder'`, "id,name");
    return l[0] ? l[0].id : null;
  };
  const readText = async (fileId) => {
    const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "text" });
    return typeof res.data === "string" ? res.data : String(res.data || "");
  };

  let rootId;
  try {
    const roots = await listChildren("name='AllenI3Aurora' and mimeType='application/vnd.google-apps.folder'", "id,name");
    if (!roots.length) keepExisting("找不到（或未分享）AllenI3Aurora 資料夾給服務帳戶");
    rootId = roots[0].id;
  } catch (e) { keepExisting("Drive 讀取失敗：" + e.message); }

  const out = {};

  for (const cad of CADENCES) {
    try {
      let parent = rootId;
      for (const seg of cad.path) { parent = parent && (await childFolder(seg, parent)); }
      if (!parent) continue;

      // 取最近一個 YYYYMMDD 日期資料夾為當期。
      const dates = (await listChildren(`'${parent}' in parents and mimeType='application/vnd.google-apps.folder'`, "id,name"))
        .filter((f) => /^\d{8}$/.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
      if (!dates.length) continue;
      const dateId = dates[0].id;
      const dateYmd = dates[0].name;

      const files = await listChildren(`'${dateId}' in parents`, "id,name,mimeType");

      // 標題與摘要：自 markdown／文字檔擷取，失敗用預設。
      let title = cad.titleFallback;
      let summary = "";
      try {
        const tf = files.find((x) => /\.md$/i.test(x.name)) || files.find((x) => /\.txt$/i.test(x.name));
        if (tf) {
          const raw = await readText(tf.id);
          const t = extractTitle(raw); if (t) title = t;
          summary = extractSummary(raw);
        }
      } catch (e) { console.error(`節奏 ${cad.key} 擷取內容失敗：`, e.message); }

      out[cad.key] = {
        kind: cad.kind,
        tone: cad.tone,
        note: cad.note,
        date: ymdDisplay(dateYmd),
        title,
        summary,
        link: `${SITE_URL}?issue=${ymdIso(dateYmd)}`,
      };
    } catch (e) {
      console.error(`節奏 ${cad.key} 讀取失敗：`, e.message);
    }
  }

  if (!Object.keys(out).length) keepExisting("三個節奏皆無可用資料夾");

  const result = { ...out, updatedAt: new Date().toISOString() };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("已寫入", OUT, "→", Object.keys(out).join("／"));
}

main().catch((e) => {
  console.error(e);
  try { readFileSync(OUT); process.exit(0); } catch { process.exit(1); }
});
