/* =====================================================================
   個人年輪每日同步（GitHub Actions 排程執行；台北每日凌晨 01:00）：
   從 AllenAnnuli（https://allenchen1113official.github.io/allenannuli/）
   同步「大事紀」與「數字統計」，寫入同源 data/annuli.json 快照，
   供前端 annuli-live.js 在瀏覽器端即時讀取失敗時退回使用。

   流程（與瀏覽器端 annuli-live.js 相同資料形狀）：
   1. 下載 AllenAnnuli 的 config.js（AES-256-GCM 加密設定檔），
      以與其瀏覽器端相同的 PBKDF2＋網域金鑰在 Node 解密出 Supabase 連線資訊。
   2. 以 Supabase REST 讀取 events（含分類）與 stats（visible）。
   3. 映射成 KIT.annuli 形狀後寫入 data/annuli.json。

   任一步驟失敗：保留現有 data/annuli.json 不覆蓋，exit 0（排程不失敗）。
   ===================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data/annuli.json");
const SITE = "https://allenchen1113official.github.io/allenannuli/";
const DOMAIN = "allenchen1113official.github.io"; // config.js 授權網域（金鑰種子）
const TONES = ["insight", "intelligence", "illumination"];

const b64 = (s) => Uint8Array.from(Buffer.from(s, "base64"));

/* ---------- 1) 取得並解密 AllenAnnuli 的 Supabase 設定 ---------- */
async function getSupabaseConfig() {
  const res = await fetch(SITE + "config.js", { cache: "no-store" });
  if (!res.ok) throw new Error(`下載 config.js 失敗：HTTP ${res.status}`);
  const src = await res.text();

  const encMatch = src.match(/const _ENCRYPTED\s*=\s*(\{[\s\S]*?\})\s*;/);
  const kMatch = src.match(/const _k\s*=\s*\[([\d,\s]+)\]/);
  if (!encMatch || !kMatch) throw new Error("config.js 格式不符（找不到 _ENCRYPTED／_k）");

  const encrypted = JSON.parse(encMatch[1]);
  const enc = encrypted[DOMAIN];
  if (!enc) throw new Error(`config.js 無 ${DOMAIN} 的加密資料`);

  const pepper = String.fromCharCode(...kMatch[1].split(",").map((n) => parseInt(n, 10)));
  const password = DOMAIN + pepper;

  const subtle = globalThis.crypto.subtle;
  const keyMaterial = await subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt: b64(enc.salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ---------- 2) Supabase REST 讀取 events 與 stats ---------- */
async function fetchRest(cfg, path) {
  const res = await fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/" + path, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
  });
  if (!res.ok) throw new Error(`Supabase 讀取失敗（${path.split("?")[0]}）：HTTP ${res.status}`);
  return res.json();
}

/* ---------- 主流程 ---------- */
try {
  const cfg = await getSupabaseConfig();
  const [eventsRaw, stats] = await Promise.all([
    fetchRest(cfg, "events?select=*,event_categories(category_id,categories(*))" +
      "&order=year.asc,month.asc.nullsfirst,sort_order.asc"),
    fetchRest(cfg, "stats?select=*&visible=eq.true&order=sort_order.asc"),
  ]);

  const events = (eventsRaw || []).filter((ev) => ev.show_on_homepage !== false);
  if (!events.length) throw new Error("AllenAnnuli 無大事紀資料");

  const annuli = events.map((ev, i) => {
    const cats = (ev.event_categories || [])
      .map((ec) => ec.categories)
      .filter(Boolean)
      .map((c) => (c.icon ? c.icon + " " : "") + (c.name || ""));
    return {
      year: String(ev.year),
      month: ev.month || null,
      day: ev.day || null,
      tone: TONES[i % TONES.length],
      title: ev.title || "",
      body: ev.summary || "",
      cats,
    };
  });

  const years = events.map((ev) => ev.year);
  const range = { start: Math.min(...years), end: Math.max(...years) };

  const payload = {
    updatedAt: new Date().toISOString(),
    source: SITE,
    count: events.length,
    range,
    stats: stats || [],
    annuli,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`已寫入 data/annuli.json → ${events.length} 段大事紀（${range.start} → ${range.end}）、${(stats || []).length} 項統計`);
} catch (e) {
  console.warn("同步 AllenAnnuli 失敗，保留現有 data/annuli.json：", e.message || e);
  if (!existsSync(OUT)) {
    // 首次執行且失敗：仍不產生空檔，前端會照常退回 Firestore／內建預設。
    console.warn("data/annuli.json 尚不存在，前端將使用內建年輪資料。");
  } else {
    console.log("現有快照維持不變：", readFileSync(OUT, "utf8").slice(0, 120).replace(/\s+/g, " ") + "…");
  }
  process.exit(0);
}
