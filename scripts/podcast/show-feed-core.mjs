/* =====================================================================
   自有節目 RSS（podcast.xml）· 純邏輯
   ---------------------------------------------------------------------
   輸入：節目設定 scripts/podcast/show.json＋Firestore aurora_podcast_feed 的集數
        （PilotOne pc 頻道發布時由 scripts/social/podcast.mjs 寫入）
   輸出：Apple Podcasts／Spotify／YouTube Music／Podcast Index 相容的 RSS 2.0
        （itunes:*、podcast:* 命名空間）。
   lastBuildDate 取最新一集的時間，內容沒變就產生完全相同的 XML → 不會每輪都 commit。
   注意：常聽節目「抓別人 RSS」是 feeds-core.mjs，與本檔無關。
   ===================================================================== */
import { createHash } from "node:crypto";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cdata = (s) => `<![CDATA[${String(s ?? "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;

/* 秒 → HH:MM:SS */
export function fmtDuration(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  const p = (x) => String(x).padStart(2, "0");
  return `${p(Math.floor(n / 3600))}:${p(Math.floor((n % 3600) / 60))}:${p(n % 60)}`;
}

/* Podcast Index podcast:guid：UUIDv5（namespace ead4c236-…）套在去掉 scheme 與結尾斜線的 feed 網址 */
export function podcastGuid(feedUrl) {
  const ns = Buffer.from("ead4c236bf5858c6a2c6a6b28d128cb6", "hex");
  const name = String(feedUrl).replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/* Show notes 純文字 → 簡單 HTML（段落、換行、網址轉連結） */
export function notesHtml(text) {
  const paras = String(text || "").replace(/\r\n/g, "\n").trim().split(/\n[ \t]*\n/).filter(Boolean);
  const link = (s) => esc(s).replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)）。，、」』]/g, (u) => `<a href="${u}">${u}</a>`);
  return paras.map((p) => `<p>${p.split("\n").map(link).join("<br>")}</p>`).join("");
}
const plain = (text, max = 4000) => { const t = String(text || "").replace(/\s+/g, " ").trim(); return [...t].length > max ? [...t].slice(0, max - 1).join("") + "…" : t; };

/* 可上 RSS 的集數：未隱藏、有 enclosure，新到舊 */
export function feedEpisodes(list) {
  return (list || []).filter((e) => e && !e.hidden && e.enclosure && /^https:\/\//.test(e.enclosure.url || ""))
    .sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)) || String(b.guid).localeCompare(String(a.guid)));
}

export function buildShowFeed(show, list) {
  const eps = feedEpisodes(list);
  const last = eps[0] ? new Date(eps[0].pubDate) : new Date("2026-11-24T00:00:00Z");
  const cats = (show.categories || []).map(([c, sub]) => sub
    ? `    <itunes:category text="${esc(c)}">\n      <itunes:category text="${esc(sub)}"/>\n    </itunes:category>`
    : `    <itunes:category text="${esc(c)}"/>`).join("\n");
  const items = eps.map((e) => {
    const link = e.link || show.link;
    return [
      "    <item>",
      `      <title>${esc(e.title)}</title>`,
      `      <itunes:title>${esc(e.title)}</itunes:title>`,
      `      <description>${cdata(notesHtml(e.notes) || esc(e.title))}</description>`,
      `      <content:encoded>${cdata(notesHtml(e.notes) || esc(e.title))}</content:encoded>`,
      `      <itunes:summary>${esc(plain(e.notes || e.title))}</itunes:summary>`,
      `      <link>${esc(link)}</link>`,
      `      <guid isPermaLink="false">${esc(e.guid)}</guid>`,
      `      <pubDate>${new Date(e.pubDate).toUTCString()}</pubDate>`,
      `      <enclosure url="${esc(e.enclosure.url)}" length="${Number(e.enclosure.length) || 0}" type="${esc(e.enclosure.type || "audio/mpeg")}"/>`,
      e.duration ? `      <itunes:duration>${fmtDuration(e.duration)}</itunes:duration>` : null,
      `      <itunes:episodeType>${esc(e.episodeType || "full")}</itunes:episodeType>`,
      e.episode ? `      <itunes:episode>${Number(e.episode)}</itunes:episode>` : null,
      `      <itunes:explicit>${e.explicit ? "true" : "false"}</itunes:explicit>`,
      e.image ? `      <itunes:image href="${esc(e.image)}"/>` : null,
      "    </item>",
    ].filter(Boolean).join("\n");
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>${esc(show.title)}</title>
    <link>${esc(show.link)}</link>
    <atom:link href="${esc(show.feedUrl)}" rel="self" type="application/rss+xml"/>
    <description>${esc(show.description)}</description>
    <language>${esc(show.language || "zh-tw")}</language>
    <copyright>${esc(show.copyright || "")}</copyright>
    <lastBuildDate>${last.toUTCString()}</lastBuildDate>
    <generator>PilotOne · 艾倫報報 ALLEN I³ AURORA</generator>
    <image>
      <url>${esc(show.image)}</url>
      <title>${esc(show.title)}</title>
      <link>${esc(show.link)}</link>
    </image>
    <itunes:title>${esc(show.title)}</itunes:title>
    <itunes:subtitle>${esc(show.subtitle || "")}</itunes:subtitle>
    <itunes:summary>${esc(show.description)}</itunes:summary>
    <itunes:author>${esc(show.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${esc(show.owner && show.owner.name)}</itunes:name>
      <itunes:email>${esc(show.owner && show.owner.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${esc(show.image)}"/>
${cats}
    <itunes:explicit>${show.explicit ? "true" : "false"}</itunes:explicit>
    <itunes:type>${esc(show.type || "episodic")}</itunes:type>
    <itunes:keywords>${esc((show.keywords || []).join(","))}</itunes:keywords>
    <podcast:locked owner="${esc(show.owner && show.owner.email)}">yes</podcast:locked>
    <podcast:guid>${podcastGuid(show.feedUrl)}</podcast:guid>
${items}
  </channel>
</rss>
`;
}

/* 節目設定的必要欄位檢查（Apple 審核會擋的項目） */
export function checkShow(show) {
  const errs = [];
  for (const k of ["title", "description", "author", "link", "feedUrl", "image", "language"]) if (!String(show[k] || "").trim()) errs.push(`缺少 ${k}`);
  if (!show.owner || !/@/.test(show.owner.email || "")) errs.push("缺少 owner.email（Apple／Spotify 驗證節目所有權用）");
  if (!Array.isArray(show.categories) || !show.categories.length) errs.push("至少要有一個 categories");
  for (const k of ["link", "feedUrl", "image"]) if (show[k] && !/^https:\/\//.test(show[k])) errs.push(`${k} 必須是 https 網址`);
  return errs;
}
