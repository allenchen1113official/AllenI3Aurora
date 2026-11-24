/* =====================================================================
   常聽 Podcast RSS → 最新一集（純邏輯，無相依；測試 node --test scripts/podcast/feeds.test.mjs）
   - parseLatestItem(xml)：取 RSS 第一個 <item>（依 pubDate 最新者）
   - cleanShowNotes(html)：節目說明去廣告／連結／訂閱宣傳，留下主題、來賓與內容重點
   - formatDuration / taipeiDate：時長與台北日期（YYYY.MM.DD）
   ===================================================================== */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}

function tag(block, name) {
  const re = new RegExp("<" + name.replace(":", "\\:") + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name.replace(":", "\\:") + ">", "i");
  const m = block.match(re);
  if (!m) return "";
  let v = m[1].trim();
  const cd = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cd ? cd[1].trim() : decodeEntities(v);
}
function attr(block, name, a) {
  const m = block.match(new RegExp("<" + name + "\\b[^>]*\\b" + a + "=\"([^\"]*)\"", "i"));
  return m ? decodeEntities(m[1]) : "";
}

export function parseItems(xml) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const b = m[1];
    items.push({
      title: decodeEntities(tag(b, "title")),
      pubDate: tag(b, "pubDate"),
      duration: tag(b, "itunes:duration"),
      link: tag(b, "link") || attr(b, "enclosure", "url"),
      guid: tag(b, "guid"),
      description: tag(b, "description") || tag(b, "content:encoded") || tag(b, "itunes:summary"),
    });
  }
  return items;
}

export function parseLatestItem(xml) {
  const items = parseItems(xml).filter((x) => x.title);
  if (!items.length) return null;
  const t = (x) => Date.parse(x.pubDate) || 0;
  return items.reduce((a, b) => (t(b) > t(a) ? b : a), items[0]);
}

/* 秒數或 hh:mm:ss → 「1h 12m」「19m」 */
export function formatDuration(d) {
  const s = String(d || "").trim();
  if (!s) return "";
  let sec;
  if (/^\d+$/.test(s)) sec = Number(s);
  else {
    const p = s.split(":").map(Number);
    if (p.some((n) => !isFinite(n))) return "";
    sec = p.reduce((acc, n) => acc * 60 + n, 0);
  }
  const m = Math.round(sec / 60);
  if (!m) return "";
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/* pubDate → 台北日期 YYYY.MM.DD（全站時區規則） */
export function taipeiDate(pubDate) {
  const t = Date.parse(pubDate);
  if (!isFinite(t)) return "";
  const d = new Date(t + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* 節目說明 → 重點摘要文字：去 HTML、連結、廣告段與訂閱宣傳。 */
const DROP = /(廣告|贊助|業配|警語|投資一定有風險|有賺有賠|公開說明書|申購|powered by|hosting provided|訂閱|五星|評分|評論|小額|粉絲團|粉專|官網|app\s*下載|app store|google play|youtube頻道|線上收聽|podcast：|合作|商務|聯絡|email|e-mail|line群組|詐騙|追蹤我們|follow|instagram|facebook|threads|discord|sponsor|ad-free|privacy|^note:|not investment advice|merch|slack|carve.?outs?|sign up|vote on future|^links?:|^-{3,}|^—+|^▍|^＃|^#|免責|非個股推薦|自行.{0,6}判斷|僅供參考|打賞|退款|來信|追蹤|會員|^此集影片|^"{2,})/i;
/* 節目說明 → 乾淨的內容行（去 HTML、連結、廣告段與訂閱宣傳）。 */
export function showNoteLines(html) {
  let s = String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  // 「以上廣告…」之前全是廣告
  const adEnd = s.search(/[—-]{2,}\s*以上廣告[^—\n]*[—-]{0,}/);
  if (adEnd >= 0) s = s.slice(adEnd).replace(/^[—-]{2,}\s*以上廣告[^—\n]*[—-]*/, "");
  // 常見的單行串接（如「主持人：… 來賓：… 主題：…」）拆行
  s = s.replace(/\s*(主持人|來賓|主題|節目時間|本集播出日期|此集影片)\s*[：:]/g, "\n$1：");
  const seen = new Set();
  return s.split(/\n+/)
    .map((l) => l.replace(/https?:\/\/\S+/g, "").replace(/[ \t\u3000]+/g, " ").trim())
    .filter((l) => l.length >= 4 && !DROP.test(l) && !/^(節目時間|本集播出日期|此集影片)：/.test(l) && !/^[\d\s\p{P}\p{S}_]+$/u.test(l))
    .filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
}

/* 內容行 → 摘要文字（最多 max 字；maxLines 限制行數，如股癌只取首行主題、其後多為業配）。 */
export function composeSummary(lines, max = 260, maxLines = 0) {
  let out = "";
  const use = maxLines > 0 ? lines.slice(0, maxLines) : lines;
  for (const l of use) {
    if (out.length + l.length + 1 > max) {
      if (!out) out = l.slice(0, max - 1) + "…";
      else if (out.length < max * 0.6) out += "\n" + l.slice(0, max - out.length - 2) + "…";
      break;
    }
    out += (out ? "\n" : "") + l;
  }
  return out.trim();
}

export function cleanShowNotes(html, max = 260, maxLines = 0) {
  return composeSummary(showNoteLines(html), max, maxLines);
}

/* 最新一集的摘要：扣掉與前幾集重複出現的行（節目固定介紹、免責聲明、追蹤連結等樣板）；
   全被扣光時退回「主題：<標題>」（去日期與【系列名】）。 */
export function latestSummary(items, latest, cfg = {}) {
  const others = new Set();
  const key = (x) => (x.guid || "") + "|" + x.title + "|" + x.pubDate;
  items.filter((x) => key(x) !== key(latest)).slice(0, 6).forEach((x) => showNoteLines(x.description).forEach((l) => others.add(l)));
  const own = showNoteLines(latest.description).filter((l) => !others.has(l));
  const sum = composeSummary(own, cfg.maxChars || 260, cfg.maxLines || 0);
  if (sum) return sum;
  const topic = String(latest.title || "")
    .replace(/【[^】]*】/g, "").replace(/\d{4}[./]\d{1,2}[./]\d{1,2}(\s*[(（][^)）]*[)）])?/g, "").replace(/\s+/g, " ").trim();
  return topic ? "主題：" + topic : "";
}

/* 單一節目 → 前台集數物件（與 KIT.podcastEpisodes 同欄位，source 標記 rss） */
export function toEpisode(cfg, item, items) {
  const url = /^https:\/\//.test(item.link || "") ? item.link : (cfg.page || "");
  return {
    show: cfg.show,
    title: String(item.title || "").slice(0, 160),
    date: taipeiDate(item.pubDate),
    duration: formatDuration(item.duration),
    tone: cfg.tone || "insight",
    url: String(url).slice(0, 300),
    summary: items && items.length > 1 ? latestSummary(items, item, cfg) : cleanShowNotes(item.description, cfg.maxChars || 260, cfg.maxLines || 0),
    status: "published",
    source: "rss",
  };
}
