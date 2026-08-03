/* =====================================================================
   今日關注動態 — 定時更新腳本（伺服器端，由 GitHub Actions 執行）。

   比照 TAIEX／運動：伺服器端讀取 Google Drive，將「今日」的內容彙整成
   同源 data/focus.json 供前端讀取，作為儀表板「今日關注動態」的資料來源。

   每一則除標題外，另附：
   - link：連結到該來源當日的代表檔案（可點擊開啟內容）。
   - desc：約 10 字的簡要內容（自來源文字檔擷取，失敗則用預設）。

   資料來源（Google Drive，皆以 YYYYMMDD＝今日 命名的日期資料夾）：
     AllenI3Aurora/finance/heatmap/YYYYMMDD/      台股熱力圖
     AllenI3Aurora/finance/stockradar/YYYYMMDD/   選股雷達
     AllenI3Aurora/newsletter/day/YYYYMMDD/       每日日報
   若當日資料夾尚未產生，該來源退回「最近一個日期資料夾」，並於說明標註
   實際日期；三者皆無則保留現有 data/focus.json（不覆蓋）。

   授權：需以 Google 服務帳戶（Service Account）唯讀存取上述資料夾，
   金鑰（JSON 全文）由 GitHub Actions Secrets 提供：GDRIVE_SERVICE_ACCOUNT。
   詳見 docs/GDRIVE_SETUP_SOP.md。未設定或讀取失敗時，維持現有檔案不變。
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "data/focus.json";
const SA = process.env.GDRIVE_SERVICE_ACCOUNT;
const DESC_MAX = 18; // 約 10 餘字上限
const SUMMARY_MAX = 125; // 社群分享文字摘要上限（約 125 字元）
// 本站前台網址：熱力圖等來源會連此處的站內頁面（HTML）。
// 艾倫極光日報則直接連 Google Drive 最近一日的日報文章（見 SOURCES.newsletter）。
const SITE_URL = "https://allenchen1113official.github.io/AllenI3Aurora/";

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

/* 三個來源：Drive 路徑、卡片樣式、代表檔（link）與文字檔（desc）挑選規則。 */
const SOURCES = [
  {
    key: "heatmap", path: ["finance", "heatmap"], tag: "理財", tone: "insight", icon: "chart",
    title: "台股熱力圖 · 上市／上櫃", note: "市值熱力圖", descFallback: "台股上市櫃市值熱力圖",
    // 連結改連本站前台熱力圖頁面（HTML 連結說明＋上市/上櫃熱力圖）；linkPatterns 僅供退回。
    site: true, sitePath: "heatmap.html",
    linkPatterns: [/Heatmap.*Listed.*FB.*\.png$/i, /Heatmap.*\.png$/i],
    textPatterns: [/SocialPost.*Listed.*\.txt$/i, /SocialPost.*\.txt$/i],
    // 前台頁面以 data/heatmap.json 取得「Drive 最新圖」；以下樣式挑出上市／上櫃 FB 圖檔。
    imgListed: [/Heatmap.*Listed.*FB.*\.png$/i, /Heatmap.*(TWSE|上市).*FB.*\.png$/i, /Heatmap.*FB.*\.png$/i],
    imgOtc: [/Heatmap.*(OTC|TPEx|上櫃).*FB.*\.png$/i],
  },
  {
    key: "stockradar", path: ["finance", "stockradar"], tag: "選股", tone: "intelligence", icon: "compass",
    title: "台股選股雷達", note: "訊號雷達", descFallback: "台股 TOP10 訊號排行",
    // 連結改連本站前台選股雷達頁面（HTML 說明 TOP10 分析＋一鍵分享）；linkPatterns 供 stockradar.json 挑圖與退回。
    site: true, sitePath: "stockradar.html",
    linkPatterns: [/StockRadar_IG_\d{4}-\d{2}-\d{2}\.png$/i, /StockRadar.*\d{4}-\d{2}-\d{2}\.png$/i, /StockRadar.*\.png$/i],
    textPatterns: [/caption.*\.txt$/i, /\.txt$/i],
    // 前台頁面以 data/stockradar.json 取得「Drive 最新雷達圖」；以下樣式挑出代表圖檔（優先 IG 版）。
    imgRadar: [/StockRadar_IG_\d{4}-\d{2}-\d{2}\.png$/i, /StockRadar.*IG.*\.png$/i, /StockRadar.*\d{4}-\d{2}-\d{2}\.png$/i, /StockRadar.*\.png$/i],
  },
  {
    key: "newsletter", path: ["newsletter", "day"], tag: "日報", tone: "illumination", icon: "paper",
    title: "艾倫極光日報", note: "每日速報", descFallback: "每日科技旅行攝影音樂動態",
    // 連結直接連 Google Drive 最近一日 newsletter/day/YYYYMMDD 的代表文章：
    // 優先 HTML，其次 PDF，再退回 markdown；皆無則連到當日資料夾。
    linkPatterns: [/\.html?$/i, /\.pdf$/i, /日報.*\.md$/i, /\.md$/i],
    textPatterns: [/\.md$/i],
  },
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

/* 自來源文字內容擷取「約 10 字」的簡要內容；找不到合適內容回傳空字串。
   策略：跳過標題／分隔／宣告等非內文行（含中文字數不足者），取首個內文行，
   於 8～上限字之間的標點處收尾，形成通順短句。 */
const SKIP = /(社群分享文案|建議搭配圖片|盤後速報|每日科技|資料日期說明|今日重點|三項訊號|風險提醒|艾倫極光日報|艾倫報報|ALLEN|排行總覽|Facebook|Instagram|建議|來源[:：]|版$)/;
function extractDesc(raw) {
  const lines = String(raw).split(/\r?\n/).map(cleanLine).filter(Boolean);
  for (const ln of lines) {
    if (SKIP.test(ln)) continue;
    const cjk = (ln.match(/[一-鿿]/g) || []).length;
    if (cjk < 6) continue;                       // 需足夠中文，濾掉標籤／分隔行
    // 於 8～上限字之間的最後一個標點處收尾；無標點則硬切。
    const head = ln.slice(0, DESC_MAX + 4);
    let cut = -1, re = /[，。！、；：]/g, m;
    while ((m = re.exec(head))) { if (m.index >= 8 && m.index <= DESC_MAX) cut = m.index; }
    let out = cut >= 0 ? head.slice(0, cut) : ln.slice(0, DESC_MAX);
    if (ln.length > out.length) out += "…";
    return out;
  }
  return "";
}

/* 自來源文字內容擷取「約 125 字元」的社群分享摘要；找不到合適內容回傳空字串。
   累積數行內文（跳過標題／宣告等非內文行）串成通順短文，於上限處收尾。 */
function extractSummary(raw) {
  const lines = String(raw).split(/\r?\n/).map(cleanLine).filter(Boolean);
  const picked = [];
  let total = 0;
  for (const ln of lines) {
    if (SKIP.test(ln)) continue;
    if ((ln.match(/[一-鿿]/g) || []).length < 6) continue; // 需足夠中文，濾掉標籤／分隔行
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

  const today = taipeiYmd();
  const items = [];

  for (const src of SOURCES) {
    try {
      let parent = rootId;
      for (const seg of src.path) { parent = parent && (await childFolder(seg, parent)); }
      if (!parent) continue;

      // 優先今日；否則取最近一個 YYYYMMDD 日期資料夾。
      let dateId = await childFolder(today, parent);
      let dateYmd = today;
      if (!dateId) {
        const dates = (await listChildren(`'${parent}' in parents and mimeType='application/vnd.google-apps.folder'`, "id,name"))
          .filter((f) => /^\d{8}$/.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
        if (!dates.length) continue;
        dateId = dates[0].id; dateYmd = dates[0].name;
      }

      const files = await listChildren(`'${dateId}' in parents`, "id,name,mimeType,webViewLink");

      // 連結：熱力圖等 site 來源連本站前台頁面；其餘（含艾倫極光日報）
      // 連 Drive 最近一日資料夾的代表檔，找不到就連到當日資料夾本身。
      let link = "";
      if (src.site && src.sitePath) {
        link = `${SITE_URL}${src.sitePath}`;
      } else if (src.site) {
        link = `${SITE_URL}?issue=${dateYmd.slice(0, 4)}-${dateYmd.slice(4, 6)}-${dateYmd.slice(6, 8)}`;
      } else {
        for (const pat of src.linkPatterns) { const f = files.find((x) => pat.test(x.name)); if (f) { link = f.webViewLink || ""; break; } }
        if (!link) {
          try { link = (await drive.files.get({ fileId: dateId, fields: "webViewLink", supportsAllDrives: true })).data.webViewLink || ""; } catch { /* 忽略 */ }
        }
      }

      // 簡要內容（desc，約 10 字）與社群摘要（summary，約 125 字元）：自文字檔擷取，失敗用預設。
      let desc = src.descFallback;
      let summary = "";
      try {
        let tf = null;
        for (const pat of src.textPatterns) { tf = files.find((x) => pat.test(x.name)); if (tf) break; }
        if (tf) {
          const raw = await readText(tf.id);
          const ex = extractDesc(raw); if (ex) desc = ex;
          summary = extractSummary(raw);
        }
      } catch (e) { console.error(`來源 ${src.key} 擷取簡要失敗：`, e.message); }

      const meta = `${ymdDisplay(dateYmd)} · ${src.note}${dateYmd === today ? "" : "（最新）"}`;
      items.push({ tag: src.tag, tone: src.tone, title: src.title, desc, summary, meta, icon: src.icon, link });

      // 熱力圖：另更新 data/heatmap.json，讓前台頁面優先顯示「Drive 最新圖」。
      // 全程 try/catch，任何失敗都不影響 focus.json 產出。
      if (src.key === "heatmap") {
        try {
          const pick = (pats) => { for (const p of (pats || [])) { const f = files.find((x) => p.test(x.name)); if (f) return f; } return null; };
          const driveThumb = (f) => (f && f.id) ? `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600` : "";
          const fListed = pick(src.imgListed);
          const fOtc = pick(src.imgOtc);
          const HM = "data/heatmap.json";
          let cur = {};
          try { cur = JSON.parse(readFileSync(HM, "utf8")); } catch { cur = {}; }
          cur.date = ymdDisplay(dateYmd);
          cur.dateLabel = `${ymdDisplay(dateYmd)}${dateYmd === today ? "" : "（最新）"}`;
          cur.asOf = ymdDisplay(today);
          if (summary) cur.summary = summary;
          cur.listed = Object.assign({ title: "上市 · TWSE", subtitle: "市值前 100 大代表股", local: "assets/heatmap/twse-heatmap-fb.png" }, cur.listed || {});
          cur.otc = Object.assign({ title: "上櫃 · TPEx", subtitle: "市值前 50 大代表股", local: "assets/heatmap/tpex-heatmap-fb.png" }, cur.otc || {});
          if (fListed) cur.listed.drive = driveThumb(fListed);
          if (fOtc) cur.otc.drive = driveThumb(fOtc);
          cur.updatedAt = new Date().toISOString();
          writeFileSync(HM, JSON.stringify(cur, null, 2) + "\n");
          console.log("已更新 data/heatmap.json（Drive 最新熱力圖）");
        } catch (e) { console.error("更新 data/heatmap.json 失敗（略過）：", e.message); }
      }

      // 選股雷達：另更新 data/stockradar.json，讓前台頁面優先顯示「Drive 最新雷達圖」，
      // 並保留原始資料連結（source）。全程 try/catch，任何失敗都不影響 focus.json 產出。
      if (src.key === "stockradar") {
        try {
          const pick = (pats) => { for (const p of (pats || [])) { const f = files.find((x) => p.test(x.name)); if (f) return f; } return null; };
          const driveThumb = (f) => (f && f.id) ? `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600` : "";
          const fRadar = pick(src.imgRadar);
          const SR = "data/stockradar.json";
          let cur = {};
          try { cur = JSON.parse(readFileSync(SR, "utf8")); } catch { cur = {}; }
          cur.date = ymdDisplay(dateYmd);
          cur.dateLabel = `${ymdDisplay(dateYmd)}${dateYmd === today ? "" : "（最新）"}`;
          cur.asOf = ymdDisplay(today);
          if (summary) cur.summary = summary;
          cur.radar = Object.assign({ title: "TOP 10 訊號雷達", subtitle: "技術面轉強名單 · 依綜合訊號強度排序", local: "assets/stockradar/stockradar-ig.png" }, cur.radar || {});
          if (fRadar) cur.radar.drive = driveThumb(fRadar);
          // 原始資料連結：優先代表圖檔的 Drive 檢視連結，否則連當日資料夾。
          let srcLink = "";
          for (const pat of src.linkPatterns) { const f = files.find((x) => pat.test(x.name)); if (f) { srcLink = f.webViewLink || ""; break; } }
          if (!srcLink) { try { srcLink = (await drive.files.get({ fileId: dateId, fields: "webViewLink", supportsAllDrives: true })).data.webViewLink || ""; } catch { /* 忽略 */ } }
          if (srcLink) cur.source = srcLink;
          cur.updatedAt = new Date().toISOString();
          writeFileSync(SR, JSON.stringify(cur, null, 2) + "\n");
          console.log("已更新 data/stockradar.json（Drive 最新選股雷達）");
        } catch (e) { console.error("更新 data/stockradar.json 失敗（略過）：", e.message); }
      }
    } catch (e) {
      console.error(`來源 ${src.key} 讀取失敗：`, e.message);
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
