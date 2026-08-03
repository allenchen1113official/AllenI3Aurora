/* =====================================================================
   2026 年前的日報 — 由部落格文章彙整（伺服器端，由 GitHub Actions 執行）。

   來源：allenchen1113official/allenchen1113official 的 content/posts（Hugo 文章，
   TOML front matter）。取「日期 < 2026-01-01」且內文非空者，轉成「日報」期別，
   以現有 NewsletterIssue 版面（masthead＋封面＋blocks）呈現，供「歷期彙整」日報
   分頁瀏覽與站內閱讀。輸出同源 data/day-archive.json。

   用法：POSTS_DIR 指向已 checkout 的 content/posts 目錄（預設 ./_posts/content/posts）。
   讀不到來源時維持現有 data/day-archive.json 不變（不會失敗）。
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = "data/day-archive.json";
const POSTS_DIR = process.env.POSTS_DIR || "_posts/content/posts";
const STATIC_DIR = join(POSTS_DIR, "..", "..", "static"); // 部落格 static（含 images/post）
const BLOG_BASE = "https://allenchen1113official.github.io";
const CUTOFF = "2026-01-01"; // 僅取此日期之前的文章
const TONES = ["insight", "intelligence", "illumination"];
const FALLBACK_COVERS = [
  "../../assets/rabbit-reading.jpeg", "../../assets/rabbit-forest.jpeg",
  "../../assets/rabbit-golden.jpeg", "../../assets/rabbit-mountain.jpeg",
  "../../assets/rabbit-bike.jpeg", "../../assets/rabbit-proposal.jpeg",
];

function keepExisting(reason) {
  console.error(reason + " → 維持現有 " + OUT + " 不變。");
  process.exit(0);
}

/* 解析 TOML front matter（+++ … +++）與內文。 */
function parseFrontMatter(raw) {
  const m = raw.match(/^﻿?\s*\+\+\+\s*([\s\S]*?)\r?\n\+\+\+\s*\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z_]+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    let v = kv[2];
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    fm[kv[1]] = v;
  }
  return { fm, body: m[2] };
}

const absUrl = (u) => (/^https?:\/\//.test(u) ? u : BLOG_BASE + (u.startsWith("/") ? "" : "/") + u);

/* 行內 markdown 收斂為純文字（連結取文字、去粗斜體與行內碼與殘圖）。 */
function mdInline(t) {
  return String(t)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`/g, "")
    .trim();
}

/* 內文轉為現有版面的 blocks；並取第一張圖為封面。 */
function toBlocks(body) {
  let s = String(body)
    .replace(/\{\{<[\s\S]*?>\}\}/g, "")        // Hugo shortcodes
    .replace(/<style[\s\S]*?<\/style>/gi, "")  // <style> 區塊
    .replace(/<[^>]+>/g, "")                    // 其餘 HTML 標籤
    .replace(/:[a-z_]+:/g, "");                 // :emoji_code:
  const lines = s.split(/\r?\n/);
  const blocks = [];
  let cover = "";
  let para = [];
  const hasText = (x) => /[A-Za-z0-9一-鿿]/.test(x); // 至少含字母／數字／中文（濾掉純表情裝飾行）
  const flush = () => {
    if (para.length) { const text = para.join("\n").trim(); if (text) blocks.push({ t: "lead", text }); para = []; }
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const t = line.trim();
    const img = t.match(/^!\[[^\]]*\]\(([^)]+)\)/);
    if (img) { if (!cover) cover = img[1]; continue; } // 原始路徑，於 main 解析存在性
    if (!t) { flush(); continue; }
    const h = t.match(/^#{1,6}\s+(.+)/);
    if (h) { flush(); const text = mdInline(h[1]); if (text && hasText(text)) blocks.push({ t: "h2", text }); continue; }
    const q = t.match(/^>\s?(.*)/);
    if (q) { flush(); const text = mdInline(q[1]); if (text && hasText(text)) blocks.push({ t: "quote", text }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push({ t: "rule", label: "" }); continue; }
    const inline = mdInline(t);
    if (inline && hasText(inline)) para.push(inline);
  }
  flush();
  return { cover, blocks };
}

function ymdDisplay(dateStr) {
  const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "";
}
function ymdKey(dateStr) {
  const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : "00000000";
}

function main() {
  let files;
  try {
    files = readdirSync(POSTS_DIR).filter((f) => /\.md$/i.test(f));
  } catch (e) { keepExisting(`讀不到來源目錄 ${POSTS_DIR}：` + e.message); }
  if (!files || !files.length) keepExisting(`來源目錄無 .md 檔：${POSTS_DIR}`);

  const items = [];
  for (const f of files) {
    const full = join(POSTS_DIR, f);
    try {
      if (statSync(full).size === 0) continue; // 略過空檔
      const raw = readFileSync(full, "utf8");
      const { fm, body } = parseFrontMatter(raw);
      if (String(fm.draft) === "true") continue;
      const dateStr = fm.date || "";
      if (!/(\d{4})-(\d{2})-(\d{2})/.test(dateStr)) continue;
      if (dateStr.slice(0, 10) >= CUTOFF) continue; // 僅 2026 年之前
      const { cover: rawCover, blocks } = toBlocks(body);
      if (!blocks.length) continue; // 無可呈現內文則略過
      // 封面：外部網址直接用；部落格內圖需確認 static 下實際存在，否則退回預設圖。
      let cover = "";
      if (rawCover) {
        if (/^https?:\/\//.test(rawCover)) cover = rawCover;
        else if (existsSync(join(STATIC_DIR, rawCover.replace(/^\//, "")))) cover = absUrl(rawCover);
      }
      const slug = fm.slug || f.replace(/\.md$/i, "");
      const title = fm.title || slug;
      const desc = fm.description && fm.description !== title ? fm.description : "";
      const textLen = blocks.reduce((n, b) => n + (b.text ? b.text.length : 0), 0);
      items.push({
        no: slug,
        kind: "日報",
        date: ymdDisplay(dateStr),
        _key: ymdKey(dateStr),
        tone: TONES[items.length % TONES.length],
        title,
        subtitle: desc,
        cover: cover || FALLBACK_COVERS[items.length % FALLBACK_COVERS.length],
        author: "Allen Chen 主編",
        readMinutes: Math.max(1, Math.round(textLen / 400)),
        items: blocks.filter((b) => b.t === "h2" || b.t === "lead").length,
        blocks,
      });
    } catch (e) {
      console.error(`文章 ${f} 解析失敗：`, e.message);
    }
  }

  if (!items.length) keepExisting("無符合條件（2026 前、有內文）的文章");

  // 依日期新到舊排序，並移除內部排序鍵。
  items.sort((a, b) => (a._key < b._key ? 1 : a._key > b._key ? -1 : 0));
  for (const it of items) delete it._key;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(items, null, 2) + "\n");
  console.log("已寫入", OUT, "→", items.length, "篇 2026 年前日報");
}

main();
