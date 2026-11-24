/* =====================================================================
   首頁「常聽 Podcast · 重點筆記」最新一集同步（focus-update.yml 每 3 小時執行）

   依 scripts/podcast/feeds.json 逐一抓各節目官方 RSS，取最新一集（標題／台北日期／時長／
   連結／節目說明整理的摘要），寫入 data/podcast-episodes.json（同源）。前台 aurora-data.js
   讀入後與 Firestore／內建集數合併：同節目以日期新者為準，後台編修（含康乃爾筆記）的較新集數優先。
   單一節目抓取失敗時沿用上次該節目的資料；全部失敗則維持現有檔案不變。
   純邏輯在 feeds-core.mjs：node --test scripts/podcast/feeds.test.mjs
   ===================================================================== */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseItems, parseLatestItem, toEpisode } from "./feeds-core.mjs";

const OUT = "data/podcast-episodes.json";
const CFG = "scripts/podcast/feeds.json";
const UA = "Mozilla/5.0 (compatible; AllenI3Aurora-podcast-sync/1.0; +https://allenchen1113official.github.io/AllenI3Aurora/)";

async function get(url, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: ctl.signal, redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function resolveFeed(cfg) {
  if (cfg.feed) return cfg.feed;
  const j = JSON.parse(await get("https://itunes.apple.com/search?media=podcast&limit=1&term=" + encodeURIComponent(cfg.term || cfg.show)));
  const f = j.results && j.results[0] && j.results[0].feedUrl;
  if (!f) throw new Error("iTunes 查無 RSS");
  return f;
}

async function main() {
  const { shows } = JSON.parse(readFileSync(CFG, "utf8"));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { items: [] };
  const prevBy = new Map((prev.items || []).map((x) => [x.show, x]));
  const items = [];
  let ok = 0;
  for (const cfg of shows) {
    try {
      const xml = await get(await resolveFeed(cfg));
      const it = parseLatestItem(xml);
      if (!it) throw new Error("RSS 無集數");
      const all = parseItems(xml).sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
      const ep = toEpisode(cfg, it, all);
      items.push(ep);
      ok++;
      console.log(`✓ ${cfg.show}｜${ep.date}｜${ep.title}`);
    } catch (e) {
      console.error(`✗ ${cfg.show}：${e.message}`);
      if (prevBy.has(cfg.show)) items.push(prevBy.get(cfg.show));
    }
  }
  if (!ok) { console.error("全部節目抓取失敗 → 維持現有 " + OUT + " 不變。"); return; }
  const body = (x) => JSON.stringify(x.items);
  if (body({ items }) === body(prev)) { console.log("podcast-episodes 無變動"); return; }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 1) + "\n");
  console.log(`已寫入 ${OUT}（${items.length} 個節目）`);
}

main().catch((e) => { console.error("podcast 同步失敗：" + e.message); process.exit(0); });
