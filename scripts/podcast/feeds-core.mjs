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
const DROP = /(廣告|贊助|業配|警語|投資一定有風險|有賺有賠|公開說明書|申購|powered by|hosting provided|訂閱|五星|評分|評論|小額|粉絲團|粉專|官網|app\s*下載|app store|google play|youtube頻道|線上收聽|podcast：|合作|商務|聯絡|email|e-mail|line群組|詐騙|追蹤我們|follow|instagram|facebook|threads|discord|sponsor|ad-free|privacy|^note:|not investment advice|merch|slack|carve.?outs?|sign up|vote on future|^links?:|^-{3,}|^—+|^▍|^＃|^#)/i;
export function cleanShowNotes(html, max = 260) {
  let s = String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  // 「以上廣告…」之前全是廣告
  const adEnd = s.search(/[—-]{2,}\s*以上廣告[^—\n]*[—-]{0,}/);
  if (adEnd >= 0) s = s.slice(adEnd).replace(/^[—-]{2,}\s*以上廣告[^—\n]*[—-]*/, "");
  // 常見的單行串接（如「主持人：… 來賓：… 主題：…」）拆行
  s = s.replace(/\s*(主持人|來賓|主題|節目時間|本集播出日期|此集影片)\s*[：:]/g, "\n$1：");
  const lines = s.split(/\n+/)
    .map((l) => l.replace(/https?:\/\/\S+/g, "").replace(/[ \t　]+/g, " ").trim())
    .filter((l) => l.length >= 4 && !DROP.test(l) && !/^(節目時間|本集播出日期|此集影片)：/.test(l) && !/^[\d\s\p{P}\p{S}_]+$/u.test(l));
  const seen = new Set();
  let out = "";
  for (const l of lines) {
    if (seen.has(l)) continue;
    seen.add(l);
    if (out.length + l.length + 1 > max) {
      if (!out) out = l.slice(0, max - 1) + "…";
      else if (out.length < max * 0.6) out += "\n" + l.slice(0, max - out.length - 2) + "…";
      break;
    }
    out += (out ? "\n" : "") + l;
  }
  return out.trim();
}

/* 單一節目 → 前台集數物件（與 KIT.podcastEpisodes 同欄位，source 標記 rss） */
export function toEpisode(cfg, item) {
  const url = /^https:\/\//.test(item.link || "") ? item.link : (cfg.page || "");
  return {
    show: cfg.show,
    title: String(item.title || "").slice(0, 160),
    date: taipeiDate(item.pubDate),
    duration: formatDuration(item.duration),
    tone: cfg.tone || "insight",
    url: String(url).slice(0, 300),
    summary: cleanShowNotes(item.description),
    status: "published",
    source: "rss",
  };
}
