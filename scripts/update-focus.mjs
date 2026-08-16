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
    // stockradar.json 的 source（前台「查看完整訊號雷達原始資料」連結）優先指向當日
    // 完整 HTML 報表 StockRadar_TOP_YYYY-MM-DD.html，其次任一 StockRadar_TOP*.html。
    sourcePatterns: [/StockRadar_TOP_\d{4}-\d{2}-\d{2}\.html?$/i, /StockRadar_TOP.*\.html?$/i],
    textPatterns: [/caption.*\.txt$/i, /\.txt$/i],
    // 前台頁面以 data/stockradar.json 取得「Drive 最新雷達圖」；以下樣式挑出代表圖檔（優先 IG 版）。
    imgRadar: [/StockRadar_IG_\d{4}-\d{2}-\d{2}\.png$/i, /StockRadar.*IG.*\.png$/i, /StockRadar.*\d{4}-\d{2}-\d{2}\.png$/i, /StockRadar.*\.png$/i],
  },
  {
    key: "newsletter", path: ["newsletter", "day"], tag: "日報", tone: "illumination", icon: "paper",
    title: "艾倫極光日報", note: "每日速報", descFallback: "每日科技旅行攝影音樂動態",
    // 連結改連本站前台日報頁面（daily.html：顯示摘要內容與關鍵字 hashtag，附一鍵分享）。
    // linkPatterns 供 data/daily.json 挑出 Drive 當日代表文章（source，可看完整原文）與退回。
    site: true, sitePath: "daily.html",
    // Drive 當日 newsletter/day/YYYYMMDD 的代表文章：優先「艾倫極光日報_YYYYMMDD.pdf」品牌成品，
    // 其次任一 PDF，再退回品牌 HTML／markdown。註：日期資料夾內另有 email_draft.html／
    // pdf_source.html 等內部草稿檔，故不採一般 .html 樣式，避免連到草稿而非成品。
    linkPatterns: [/艾倫極光日報.*\.pdf$/i, /日報.*\.pdf$/i, /\.pdf$/i, /艾倫極光日報.*\.html?$/i, /日報.*\.html?$/i, /\.md$/i],
    // 摘要／內文重點自當日文字檔擷取：日報成品為 PDF（無法以文字讀取），故比照
    // 熱力圖／選股雷達，優先讀社群貼文文字檔（SocialPost／caption／日報 .txt），
    // 再退回任一 .txt 或 .md；找不到才用通用速報摘要。
    textPatterns: [/SocialPost.*\.txt$/i, /caption.*\.txt$/i, /艾倫極光日報.*\.txt$/i, /日報.*\.txt$/i, /\.txt$/i, /\.md$/i],
    // 前台頁面以 data/daily.json 取得「Drive 最新封面圖」；以下樣式挑出代表封面圖檔。
    imgCover: [/艾倫極光日報.*\.(png|jpe?g)$/i, /日報.*\.(png|jpe?g)$/i, /cover.*\.(png|jpe?g)$/i, /\.(png|jpe?g)$/i],
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
const SKIP = /(社群分享文案|建議搭配圖片|盤後速報|每日科技|資料日期說明|資料說明|目標日期|補產出|發布日|休市|本篇|提示|重點摘要|今日重點|三項訊號|風險提醒|艾倫極光日報|艾倫報報|ALLEN|排行總覽|Facebook|Instagram|建議|來源[:：]|版$)/;
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

/* 自來源文字內容擷取數行「內文重點」，供日報頁面（daily.html）條列顯示。
   逐行清理、跳過標題／宣告等非內文行，回傳前幾行足夠中文的內文。 */
const HL_MAX = 60; // 單則重點字數上限
function extractLines(raw, max = 4) {
  const lines = String(raw).split(/\r?\n/).map(cleanLine).filter(Boolean);
  const picked = [];
  for (const ln of lines) {
    if (SKIP.test(ln)) continue;
    if ((ln.match(/[一-鿿]/g) || []).length < 6) continue; // 需足夠中文，濾掉標籤／分隔行
    picked.push(ln.length > HL_MAX ? ln.slice(0, HL_MAX) + "…" : ln);
    if (picked.length >= max) break;
  }
  return picked;
}

/* 自選股雷達當日完整 HTML 報表（StockRadar_TOP_YYYY-MM-DD.html）解析 TOP10 明細，
   供 data/stockradar.json 前台頁面條列顯示個股與五項訊號（gc/ma/om/rev/eps）。
   報表版型會隨產出批次不同而變動，故同時支援兩種版型並自動判別，解析不出足夠
   列數時回傳空陣列（呼叫端會保留原有 top10 不覆蓋）：
   (A) 分欄版：每列約 18+ 個 <td>，五項訊號各自獨立成欄（儲存格內容以「是／否」開頭）。
   (B) 標籤版：每列約 10~12 個 <td>，KD／均線／營益率等訊號以「標籤：是／否」形式
       集中於少數儲存格（如「營益率>10%：4/4 是」「黃金交叉：否」）。 */
function parseStockradarTop10(html) {
  const stripTags = (s) => String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
  const startsYes = (s) => String(s).trim().charAt(0) === "是";
  const shortName = (cell) => {
    const paren = String(cell).match(/[（(]([^）)]{1,12})[）)]\s*$/) || String(cell).match(/[（(]([^）)]{1,12})[）)]/);
    if (paren) return paren[1];
    return String(cell).replace(/(股份有限公司|股份|有限公司|控股).*$/, "").trim();
  };
  const changeOf = (cell) => {
    const pv = String(cell).match(/([-+]?\d+(?:\.\d+)?)\s*%/);
    const neg = /▼/.test(cell) || (pv && pv[1].startsWith("-"));
    return { changePct: pv ? (neg ? "-" : "+") + pv[1].replace(/^[-+]/, "") + "%" : "", up: !neg };
  };
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let c;
    while ((c = cellRe.exec(m[1]))) cells.push(stripTags(c[1]));
    if (cells.length < 6) continue;                     // 表頭（<th>）或不完整列
    // 代碼：含 TPE/TWSE 等前綴或純數字代碼的儲存格。
    const codeCell = cells.find((x) => /(?:TPE|TWSE|TWO|TPO|OTC)[：:]?\s*\d{4,6}/.test(x)) || cells[2] || cells[1] || "";
    const codeMatch = String(codeCell).match(/(\d{4,6})/);
    if (!codeMatch) continue;
    let name, changePct, up, signals = [];
    if (cells.length >= 18) {
      // 版型 A：分欄。欄序＝日期,排名,代碼,名稱,產業,股價,漲跌幅,K,D,K>50,K>D,
      //          KD黃金交叉,大戶,散戶,均線多頭,營益率,營收年增,EPS年增,短評。
      name = shortName(cells[3]);
      ({ changePct, up } = changeOf(cells[6]));
      if (startsYes(cells[11])) signals.push("gc");
      if (startsYes(cells[14])) signals.push("ma");
      if (startsYes(cells[15])) signals.push("om");
      if (startsYes(cells[16])) signals.push("rev");
      if (startsYes(cells[17])) signals.push("eps");
    } else {
      // 版型 B：標籤。以內容辨識各欄位與訊號。
      const nameCell = cells.find((x) => /[（(][^）)]{1,12}[）)]/.test(x) && /[一-鿿]/.test(x) && !/[：:]/.test(x)) || cells[2] || "";
      name = shortName(nameCell);
      const pctCell = cells.find((x) => /[▲▼]/.test(x)) || cells.find((x) => /[-+]?\d+(?:\.\d+)?\s*%[）)]/.test(x)) || "";
      ({ changePct, up } = changeOf(pctCell));
      const rowText = cells.join(" ");
      // 各基本面訊號「達標」判定：於標籤後一小段內，優先看最靠近的「是／否」，
      // 其次看「x/4」達標季數（≥3 視為達標）。可容忍不同版型的呈現方式。
      const met = (label) => {
        const seg = (rowText.match(new RegExp(label + "[^\\n]{0,26}")) || [""])[0];
        const tail = seg.replace(new RegExp("^.*?" + label), "");
        const yn = tail.match(/(是|否)/);
        if (yn) return yn[1] === "是";
        const cnt = tail.match(/([0-4])\s*\/\s*4/);
        return cnt ? Number(cnt[1]) >= 3 : false;
      };
      // KD黃金交叉：標籤後為「是」才算（明確排除「否」）。
      const gseg = (rowText.match(/黃金交叉[^\n]{0,8}/) || [""])[0];
      if (/是/.test(gseg) && !/否/.test(gseg)) signals.push("gc");
      // 均線多頭：優先「含均線關鍵字且以是表述」的儲存格，其次用標籤達標判定。
      const maCell = cells.find((x) => /(半年線|半年|四線|多頭排列|均線)/.test(x));
      if ((maCell && (startsYes(maCell) || /多頭[^否]{0,8}是/.test(maCell) || /是[^否]{0,8}(月|季|均)/.test(maCell))) || met("均線多頭") || met("均線")) signals.push("ma");
      if (met("營益率")) signals.push("om");
      if (met("營收年增")) signals.push("rev");
      if (met("EPS年增") || met("EPS")) signals.push("eps");
    }
    rows.push({ code: codeMatch[1], name, changePct, up: !!up, signals });
    if (rows.length >= 10) break;
  }
  return rows;
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
      let summaryLines = [];
      try {
        let tf = null;
        for (const pat of src.textPatterns) { tf = files.find((x) => pat.test(x.name)); if (tf) break; }
        if (tf) {
          const raw = await readText(tf.id);
          const ex = extractDesc(raw); if (ex) desc = ex;
          summary = extractSummary(raw);
          summaryLines = extractLines(raw, 4);
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

          // 今日關注動態的熱力圖每更新到「新的一日」，前一日即移入 data/heatmap-archive.json
          // （歷期彙整頁以 kind「熱力圖」呈現）。以 no 去重，任何失敗都不影響主流程。
          const newDate = ymdDisplay(dateYmd);
          if (cur.date && cur.date !== newDate) {
            try {
              const HA = "data/heatmap-archive.json";
              let arch = [];
              try { arch = JSON.parse(readFileSync(HA, "utf8")); } catch { arch = []; }
              if (!Array.isArray(arch)) arch = [];
              const prevNo = "heatmap-" + String(cur.date).replace(/\D/g, "");
              if (!arch.some((x) => String(x.no) === prevNo)) {
                const prevListed = (cur.listed && cur.listed.drive) || "";
                const prevOtc = (cur.otc && cur.otc.drive) || "";
                arch.unshift({
                  no: prevNo, kind: "熱力圖", date: cur.date, tone: "insight",
                  title: `台股熱力圖 · 上市／上櫃｜${cur.date}`,
                  cover: prevListed || prevOtc,
                  link: prevListed || prevOtc,
                  listed: prevListed, otc: prevOtc,
                  summary: cur.summary || "", items: 2,
                });
                writeFileSync(HA, JSON.stringify(arch, null, 2) + "\n");
                console.log("已將前一日熱力圖移入 data/heatmap-archive.json：", prevNo);
              }
            } catch (e) { console.error("更新 data/heatmap-archive.json 失敗（略過）：", e.message); }
          }

          cur.date = newDate;
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

          // 今日關注動態的選股雷達每更新到「新的一日」，前一日即移入
          // data/stockradar-archive.json（歷期彙整以 kind「選股」呈現，卡片點擊
          // 開啟該日雷達圖）。以 no 去重，任何失敗都不影響主流程。
          const newDate = ymdDisplay(dateYmd);
          if (cur.date && cur.date !== newDate) {
            try {
              const SA2 = "data/stockradar-archive.json";
              let arch = [];
              try { arch = JSON.parse(readFileSync(SA2, "utf8")); } catch { arch = []; }
              if (!Array.isArray(arch)) arch = [];
              const prevNo = "stockradar-" + String(cur.date).replace(/\D/g, "");
              if (!arch.some((x) => String(x.no) === prevNo)) {
                const prevCover = (cur.radar && cur.radar.drive) || "";
                arch.unshift({
                  no: prevNo, kind: "選股", date: cur.date, tone: "intelligence",
                  title: `台股選股雷達 · TOP 10 訊號排行｜${cur.date}`,
                  desc: cur.desc || "",
                  cover: prevCover,
                  link: prevCover || cur.source || "",
                  summary: cur.summary || "", items: 10,
                });
                writeFileSync(SA2, JSON.stringify(arch, null, 2) + "\n");
                console.log("已將前一日選股雷達移入 data/stockradar-archive.json：", prevNo);
              }
            } catch (e) { console.error("更新 data/stockradar-archive.json 失敗（略過）：", e.message); }
          }

          cur.date = ymdDisplay(dateYmd);
          cur.dateLabel = `${ymdDisplay(dateYmd)}${dateYmd === today ? "" : "（最新）"}`;
          cur.asOf = ymdDisplay(today);
          if (desc) cur.desc = desc;
          if (summary) cur.summary = summary;
          cur.radar = Object.assign({ title: "TOP 10 訊號雷達", subtitle: "技術面轉強名單 · 依綜合訊號強度排序", local: "assets/stockradar/stockradar-ig.png" }, cur.radar || {});
          if (fRadar) cur.radar.drive = driveThumb(fRadar);
          // 原始資料連結（source）：優先當日完整 HTML 報表（StockRadar_TOP_YYYY-MM-DD.html），
          // 其次代表圖檔的 Drive 檢視連結，最後退回當日資料夾。
          let srcLink = "";
          for (const pat of (src.sourcePatterns || [])) { const f = files.find((x) => pat.test(x.name)); if (f) { srcLink = f.webViewLink || ""; break; } }
          if (!srcLink) { for (const pat of src.linkPatterns) { const f = files.find((x) => pat.test(x.name)); if (f) { srcLink = f.webViewLink || ""; break; } } }
          if (!srcLink) { try { srcLink = (await drive.files.get({ fileId: dateId, fields: "webViewLink", supportsAllDrives: true })).data.webViewLink || ""; } catch { /* 忽略 */ } }
          if (srcLink) cur.source = srcLink;

          // TOP10 明細：讀取當日完整 HTML 報表（StockRadar_TOP_YYYY-MM-DD.html）解析
          // 出 10 檔個股與五項訊號，更新 cur.top10（供前台條列顯示）。解析失敗維持原值。
          try {
            let htmlFile = null;
            for (const pat of (src.sourcePatterns || [])) { htmlFile = files.find((x) => pat.test(x.name)); if (htmlFile) break; }
            if (htmlFile) {
              const rows = parseStockradarTop10(await readText(htmlFile.id));
              // 可信度防呆：需解析出足夠列數，且至少一檔有基本面訊號（om/rev/eps）——
              // 若基本面欄位完全沒解析到（常見於報表換版），視為低可信度，保留原 top10
              // 不覆蓋，避免把「訊號幾乎全空」的錯誤結果推上線。
              const hasFund = rows.some((r) => (r.signals || []).some((s) => s === "om" || s === "rev" || s === "eps"));
              if (rows.length >= 8 && hasFund) cur.top10 = rows;
              else console.error(`選股雷達 TOP10 解析可信度不足（rows=${rows.length}, hasFund=${hasFund}），保留原 top10 不覆蓋。`);
            }
          } catch (e) { console.error("解析選股雷達 TOP10 失敗（略過）：", e.message); }

          cur.updatedAt = new Date().toISOString();
          writeFileSync(SR, JSON.stringify(cur, null, 2) + "\n");
          console.log("已更新 data/stockradar.json（Drive 最新選股雷達）");
        } catch (e) { console.error("更新 data/stockradar.json 失敗（略過）：", e.message); }
      }

      // 艾倫極光日報：data/daily.json 與 data/daily-archive.json 由 scripts/update-daily.mjs
      // （每日 08:00 排程）讀取當日日報 Google 文件產出並「單獨擁有」，此處不再寫入，
      // 僅讓 focus.json 的日報卡片與 data/daily.json 保持一致（單一真實來源）。
      if (src.key === "newsletter") {
        try {
          const d = JSON.parse(readFileSync("data/daily.json", "utf8"));
          const it = items.find((x) => x.tag === "日報");
          if (it && d) {
            if (d.summary) it.summary = d.summary;
            if (Array.isArray(d.sections) && d.sections.length) {
              const desc = d.sections.slice(0, 3).map((s) => String(s.title || "").replace(/\s*[\/·].*$/, "").trim()).filter(Boolean).join("・").slice(0, 18);
              if (desc) it.desc = desc;
            }
            if (d.date) it.meta = `${d.date} · 每日速報`;
          }
        } catch (e) { console.error("同步 focus 日報卡片（data/daily.json）失敗（略過）：", e.message); }
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
