/* =====================================================================
   艾倫極光日報 — 每日 08:00 定時更新腳本（伺服器端，由 GitHub Actions 執行）。

   讀取 Google Drive 當日（台北時區）newsletter/day/YYYYMMDD 資料夾內的
   「艾倫極光日報_YYYYMMDD_無樣式版」Google 文件（無樣式版格式穩定、便於解析），
   以 text/markdown 匯出後解析成七大主題的一頁式內容，寫入同源 data/daily.json：
     - sections：主題區塊（標題＋條列內容，每則附原始來源連結）
     - focusNote：今日重點
     - summary／hashtags：社群分享摘要與關鍵字（daily.html 顯示）
   並將前一日的 data/daily.json 狀態移入 data/daily-archive.json（歷期彙整），
   同時同步首頁「今日關注動態」focus.json 的日報卡片摘要。

   授權：需以 Google 服務帳戶（Service Account）唯讀存取 AllenI3Aurora 資料夾，
   金鑰（JSON 全文）由 GitHub Actions Secrets 提供：GDRIVE_SERVICE_ACCOUNT。
   詳見 docs/GDRIVE_SETUP_SOP.md。未設定或讀取失敗時，維持現有檔案不變（不會失敗）。
   ===================================================================== */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DAILY = "data/daily.json";
const ARCHIVE = "data/daily-archive.json";
const FOCUS = "data/focus.json";
const SITE_URL = "https://allenchen1113official.github.io/AllenI3Aurora/";
const SUMMARY_MAX = 150; // 摘要主體（今日重點濃縮）上限
const TONES = ["insight", "intelligence", "illumination"];

/* 台北時區今日 YYYYMMDD。 */
function taipeiYmd(date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}${p.month}${p.day}`;
}
const ymdDisplay = (ymd) => `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
function weekdayZh(ymd) {
  const wd = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), 12)).getUTCDay();
  return "日一二三四五六"[wd];
}

/* 去除 markdown 粗體／跳脫記號，保留文字。 */
function stripMd(s) {
  return String(s == null ? "" : s)
    .replace(/\\([*_[\]()])/g, "$1") // 跳脫字元 \* \_ 等
    .replace(/\*\*/g, "")             // 粗體
    .replace(/^#+\s*/, "")            // 標題井號
    .trim();
}
/* 移除標題前殘留的表情符號／亂碼位元組（無樣式版通常已乾淨，樣式版可能夾帶）。 */
function cleanTitle(s) {
  return stripMd(s).replace(/^[^一-鿿（\w【]+/, "").trim();
}

/* 將今日重點濃縮為 ~150 字摘要主體，於句末標點收尾。 */
function condense(text, max = SUMMARY_MAX) {
  const t = String(text || "").replace(/\s+/g, " ").trim(); // 收斂空白但保留英文詞間空格
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const cut = Math.max(head.lastIndexOf("。"), head.lastIndexOf("；"), head.lastIndexOf("，"));
  return (cut >= max * 0.5 ? head.slice(0, cut + 1) : head) + "…";
}

/* 主題標籤 → hashtag（無對應時由標題推導）。 */
const TAG_HASHTAG = {
  農業: "智慧農業", 家庭: "智慧家庭", 空拍: "無人機", 無人機: "無人機",
  旅行: "旅行", 冰島: "冰島旅行", 攝影: "攝影", 樂器: "薩克斯風",
  音樂: "薩克斯風", 網球: "網球", 科技: "科技",
};
function sectionHashtag(sec) {
  if (TAG_HASHTAG[sec.tag]) return "#" + TAG_HASHTAG[sec.tag];
  const t = String(sec.title || sec.tag || "").replace(/\s+/g, "").replace(/[\/·].*$/, "");
  return t ? "#" + t : "";
}

/* ---------- 解析（純函式，供測試重用） ----------
   無樣式版格式：
     **【TAG】TITLE**
     **<粗體引言>：**<內文>
     [來源：來源名](https://…)
     …（重複三則）
     **【重點】今日重點**
     <今日重點內文>
   回傳 { ymd, sections:[{tag,title,items:[{text,sourceName,source}]}], focusNote }。 */
export function parseDailyMarkdown(md) {
  const lines = String(md).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const srcRe = /\[來源[:：]\s*(.+?)\]\((https?:\/\/[^)]+)\)/;
  const headRe = /^\*{0,2}\\?【(.+?)】\s*(.*?)\s*\*{0,2}$/;
  const footRe = /(ALLEN\s*I|每日自動整理|點擊來源名稱|每日科技)/i;

  let ymd = null;
  const sections = [];
  let focusNote = "";
  let cur = null;         // 目前主題區塊
  let inFocus = false;    // 是否在「今日重點」段
  let pending = null;     // 等待來源配對的內文

  for (const ln of lines) {
    if (!ymd) { const m = ln.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/); if (m) ymd = m[1] + String(m[2]).padStart(2, "0") + String(m[3]).padStart(2, "0"); }

    // 主題標題行：（可選 **）【TAG】TITLE
    if (/^\*{0,2}\\?【/.test(ln)) {
      const h = ln.match(headRe);
      if (h) {
        const tag = cleanTitle(h[1]);
        const title = cleanTitle(h[2]) || tag;
        pending = null;
        if (/重點/.test(tag) || /今日重點/.test(title)) { inFocus = true; cur = null; }
        else { inFocus = false; cur = { tag, title, items: [] }; sections.push(cur); }
        continue;
      }
    }

    // 來源行：與前一則內文配對。
    const s = ln.match(srcRe);
    if (s && cur && pending) {
      cur.items.push({ text: pending, sourceName: stripMd(s[1]), source: s[2] });
      pending = null;
      continue;
    }
    if (s) continue; // 無配對內文的來源行，忽略

    // 頁首／頁尾／導言等雜訊行。
    if (footRe.test(ln) || /^艾倫極光日報\s*$/.test(stripMd(ln))) continue;

    // 一般內文行：主題段落存為待配對內文；今日重點段落累加為 focusNote。
    const text = stripMd(ln);
    if (!text) continue;
    if (inFocus) { focusNote += (focusNote ? "" : "") + text; }
    else if (cur) { pending = text; }
  }

  return { ymd, sections, focusNote: focusNote.trim() };
}

/* ---------- 由解析結果組出 data/daily.json 物件（純函式，供測試重用） ---------- */
export function buildDailyJson(parsed, ymd, opts = {}) {
  const date = ymdDisplay(ymd);
  const sections = (parsed.sections || []).map((s, i) => ({
    tag: s.tag, tone: TONES[i % TONES.length], title: s.title,
    items: (s.items || []).map((it) => ({ text: it.text, sourceName: it.sourceName, source: it.source })),
  }));
  const lead = condense(parsed.focusNote || "");
  const summary = `【日報】艾倫極光日報｜${date} ${lead} 洞察世界·累積智慧·點亮未來，完整日報看這裡👇`;
  const secTags = sections.map(sectionHashtag).filter(Boolean);
  const hashtags = ["#艾倫極光日報", "#日報"].concat(secTags)
    .concat(["#艾倫報報", "#AllenI3Aurora", "#洞察世界", "#累積智慧", "#點亮未來"]).join(" ");
  // highlights（通用版面備援）：取前四區塊每則內文的引言（：之前）。
  const highlights = sections.slice(0, 4).map((s) => {
    const t = (s.items[0] && s.items[0].text) || "";
    return t.split("：")[0].slice(0, 60);
  }).filter(Boolean);

  return {
    date, dateLabel: `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}（${weekdayZh(ymd)}）`,
    asOf: date, title: "艾倫極光日報", subtitle: "每日科技與生活動態",
    summary, hashtags, focusNote: parsed.focusNote || "",
    sections, topics: [
      { key: "tech", label: "科技", desc: "AI、產品與產業動態，掌握趨勢先機" },
      { key: "travel", label: "旅行", desc: "路線、景點與旅途靈感，收藏下一段旅程" },
      { key: "photo", label: "攝影", desc: "影像、器材與構圖啟發，記錄生活視角" },
      { key: "music", label: "音樂", desc: "新曲、專輯與現場精選，為一天配上聲音" },
    ],
    highlights,
    cover: { title: "今日日報封面", drive: "", local: "assets/rabbit-reading.jpeg" },
    source: opts.source || "",
    note: "每日日報彙整科技與生活動態，每則附原始來源連結。完整內容以 Google Drive 當日日報原文為準；本頁為一頁式彙整呈現。",
    updatedAt: opts.updatedAt || new Date().toISOString(),
  };
}

/* ---------- 前一日移入歷期彙整（以 no 去重） ---------- */
export function rollArchive(prev) {
  if (!prev || !prev.date) return false;
  let arch = [];
  try { arch = JSON.parse(readFileSync(ARCHIVE, "utf8")); } catch { arch = []; }
  if (!Array.isArray(arch)) arch = [];
  const no = "daily-" + String(prev.date).replace(/\D/g, "");
  if (arch.some((x) => String(x.no) === no)) return false;
  const headline = String(prev.summary || "").replace(/^【[^】]*】/, "")
    .replace(/^\s*艾倫極光日報[｜|]\s*[\d.]+\s*/, "").replace(/。.*$/, "").trim();
  arch.unshift({
    no, kind: "日報", date: prev.date, tone: "illumination",
    title: `艾倫極光日報｜${prev.date}`, subtitle: headline || (prev.subtitle || ""),
    cover: (prev.cover && prev.cover.drive) || (SITE_URL + "assets/rabbit-reading.jpeg"),
    author: "Allen Chen 主編", readMinutes: 3, items: (prev.sections && prev.sections.length) || 4,
    summary: prev.summary || "",
    link: prev.source || (SITE_URL + "daily.html"),
  });
  writeFileSync(ARCHIVE, JSON.stringify(arch, null, 2) + "\n");
  return true;
}

/* ---------- 同步首頁 focus.json 的日報卡片 ---------- */
export function patchFocus(daily) {
  let focus;
  try { focus = JSON.parse(readFileSync(FOCUS, "utf8")); } catch { return false; }
  if (!focus || !Array.isArray(focus.items)) return false;
  const it = focus.items.find((x) => x.tag === "日報" || (x.title || "").includes("艾倫極光日報"));
  if (!it) return false;
  // 卡片簡述：取前三個主題標題（去除「 / IoT」等後綴）串接，約 10 餘字。
  const desc = (daily.sections || []).slice(0, 3).map((s) => String(s.title || "").replace(/\s*[\/·].*$/, "").trim()).filter(Boolean).join("・").slice(0, 18);
  it.desc = desc || it.desc;
  it.summary = daily.summary;
  it.meta = `${daily.date} · 每日速報`;
  it.link = SITE_URL + "daily.html";
  focus.updatedAt = new Date().toISOString();
  writeFileSync(FOCUS, JSON.stringify(focus, null, 2) + "\n");
  return true;
}

/* ---------- 伺服器端主流程（讀 Drive → 更新檔案） ---------- */
async function main() {
  const SA = process.env.GDRIVE_SERVICE_ACCOUNT;
  const keep = (reason) => { console.error(reason + " → 維持現有 " + DAILY + " 不變。"); process.exit(0); };
  if (!SA) keep("未提供 GDRIVE_SERVICE_ACCOUNT");

  let google;
  try { ({ google } = await import("googleapis")); } catch (e) { keep("無法載入 googleapis：" + e.message); }

  let drive;
  try {
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(SA), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    drive = google.drive({ version: "v3", auth });
  } catch (e) { keep("服務帳戶金鑰無效：" + e.message); }

  const list = async (q, fields) => (await drive.files.list({
    q: q + " and trashed=false", fields: `files(${fields})`, pageSize: 200,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  })).data.files || [];
  const childFolder = async (name, parentId) => {
    const l = await list(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder'`, "id,name");
    return l[0] ? l[0].id : null;
  };
  const exportDoc = async (fileId) => {
    const res = await drive.files.export({ fileId, mimeType: "text/markdown" }, { responseType: "text" });
    return typeof res.data === "string" ? res.data : String(res.data || "");
  };

  let rootId;
  try {
    const roots = await list("name='AllenI3Aurora' and mimeType='application/vnd.google-apps.folder'", "id,name");
    if (!roots.length) keep("找不到（或未分享）AllenI3Aurora 資料夾給服務帳戶");
    rootId = roots[0].id;
  } catch (e) { keep("Drive 讀取失敗：" + e.message); }

  let dayParent = rootId;
  for (const seg of ["newsletter", "day"]) { dayParent = dayParent && (await childFolder(seg, dayParent)); }
  if (!dayParent) keep("找不到 newsletter/day 資料夾");

  // 當日資料夾，否則取最近一個 YYYYMMDD。
  const today = taipeiYmd();
  let dateId = await childFolder(today, dayParent);
  let ymd = today;
  if (!dateId) {
    const dates = (await list(`'${dayParent}' in parents and mimeType='application/vnd.google-apps.folder'`, "id,name"))
      .filter((f) => /^\d{8}$/.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
    if (!dates.length) keep("newsletter/day 下無日期資料夾");
    dateId = dates[0].id; ymd = dates[0].name;
  }

  const files = await list(`'${dateId}' in parents and mimeType='application/vnd.google-apps.document'`, "id,name,webViewLink");
  // 優先「無樣式版」（格式穩定），否則退回任一「艾倫極光日報_YYYYMMDD」文件。
  const pick = (re) => files.find((f) => re.test(f.name));
  const doc = pick(/無樣式版/) || pick(new RegExp("艾倫極光日報_" + ymd)) || pick(/艾倫極光日報/);
  if (!doc) keep(`newsletter/day/${ymd} 內找不到艾倫極光日報文件`);

  let md;
  try { md = await exportDoc(doc.id); } catch (e) { keep("匯出日報文件失敗：" + e.message); }

  const parsed = parseDailyMarkdown(md);
  if (!parsed.sections.length) keep("解析日報內容失敗（無主題區塊）");
  const useYmd = parsed.ymd || ymd;
  // 完整原文連結：優先「有樣式」的成品文件，否則用當前文件。
  const styled = pick(new RegExp("艾倫極光日報_" + useYmd + "$")) || doc;
  const daily = buildDailyJson(parsed, useYmd, { source: styled.webViewLink || doc.webViewLink || "" });

  // 若日期改變，前一日移入歷期彙整。
  let prev = null;
  try { prev = JSON.parse(readFileSync(DAILY, "utf8")); } catch { prev = null; }
  if (prev && prev.date && prev.date !== daily.date) { if (rollArchive(prev)) console.log("已將前一日移入 data/daily-archive.json：", prev.date); }

  writeFileSync(DAILY, JSON.stringify(daily, null, 2) + "\n");
  console.log(`已更新 ${DAILY}（${daily.date}，${daily.sections.length} 個主題區塊）`);
  if (patchFocus(daily)) console.log("已同步 focus.json 日報卡片");
}

// 僅在直接執行時跑主流程；被 import（測試）時只匯出純函式。
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); try { readFileSync(DAILY); process.exit(0); } catch { process.exit(1); } });
}
