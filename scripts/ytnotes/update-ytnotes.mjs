/* =====================================================================
   首頁「常看 YouTube · 重點筆記」資料同步（focus-update.yml 每 3 小時執行）

   讀 Drive「AllenI3Aurora/notes/youtube/index.json」（Claude 每支影片做完由 merge_index.py 更新），
   精簡後寫入 data/ytnotes.json（同源，供 Dashboard.jsx 的 YouTubeNotes 讀取）。
   授權同 update-focus.mjs：GDRIVE_SERVICE_ACCOUNT。未設定或讀取失敗時維持現有檔案不變。
   社群圖卡：送審包 notes/youtube/<added>/pilotone/<影片ID>/YTNotes_<影片ID>_<added>_{FB,IG}.png
   下載到 assets/ytnotes/<影片ID>-<added>_{FB,IG}.png（已存在者不重抓；不再被引用的舊圖自動清除），
   各筆加上 cards: { fb, ig }（網站相對路徑），前台「社群圖卡」按鈕讀這個欄位。
   純邏輯 slimIndex()／cardName()／attachCards()／staleCards() 供測試：node --test scripts/ytnotes/ytnotes.test.mjs
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const OUT = "data/ytnotes.json";
export const MAX_ITEMS = 60;
export const CARD_DIR = "assets/ytnotes";
const SAFE_ID = /^[A-Za-z0-9_-]{1,24}$/, SAFE_DATE = /^\d{8}$/;

/* 網站上的圖卡檔名（影片ID＋送審日期，重做同一支影片會換新檔名、不吃舊快取）；不合法回 "" */
export function cardName(v, k) {
  if (!v || !SAFE_ID.test(String(v.id || "")) || !SAFE_DATE.test(String(v.added || ""))) return "";
  return `${v.id}-${v.added}_${k.toUpperCase()}.png`;
}
/* Drive 送審包裡的原始檔名（make_package.py：YTNotes_<影片ID>_<送審日期>_FB.png） */
export const driveCardName = (v, k) => `YTNotes_${v.id}_${v.added}_${k.toUpperCase()}.png`;

/* 依本機已有的圖卡檔（Set）為每筆加上 cards；沒有任何圖卡的不加欄位 */
export function attachCards(items, have) {
  return items.map((v) => {
    const cards = {};
    for (const k of ["fb", "ig"]) { const n = cardName(v, k); if (n && have.has(n)) cards[k] = `${CARD_DIR}/${n}`; }
    return Object.keys(cards).length ? { ...v, cards } : v;
  });
}
/* 資料夾中不再被任何一筆引用的圖卡（只動符合命名規則的 png，其它檔案不碰） */
export function staleCards(files, items) {
  const keep = new Set(items.flatMap((v) => ["fb", "ig"].map((k) => cardName(v, k)).filter(Boolean)));
  return files.filter((f) => /^[A-Za-z0-9_-]+-\d{8}_(FB|IG)\.png$/.test(f) && !keep.has(f));
}
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

/* Drive 索引 → 前台用的精簡資料（只留顯示欄位、過濾缺網址者、新到舊、最多 MAX_ITEMS 筆） */
export function slimIndex(idx) {
  const items = (idx && Array.isArray(idx.items) ? idx.items : [])
    .filter((x) => x && x.id && /^https:\/\//.test(String(x.url || "")))
    .map((x) => ({
      id: str(x.id, 24), title: str(x.title, 160), author: str(x.author, 60), channelUrl: /^https:\/\//.test(String(x.channel_url || "")) ? str(x.channel_url, 200) : "",
      url: str(x.url, 200), date: str(x.published, 10), duration: str(x.duration, 20), category: str(x.category, 20),
      headline: str(x.headline, 120), thumbnail: /^https:\/\//.test(String(x.thumbnail || "")) ? str(x.thumbnail, 300) : "",
      summary: (Array.isArray(x.summary) ? x.summary : []).slice(0, 5).map((s) => str(s, 160)),
      cornell: { rows: ((x.cornell && x.cornell.rows) || []).slice(0, 6).map((r) => ({ cue: str(r.cue, 40), note: str(r.note, 200) })),
        summary: str(x.cornell && x.cornell.summary, 240) },
      added: str(x.added, 8),
    }))
    .sort((a, b) => (b.added + b.date).localeCompare(a.added + a.date))
    .slice(0, MAX_ITEMS);
  return { updatedAt: idx && idx.updatedAt ? str(idx.updatedAt, 40) : "", items };
}

/* 下載缺少的社群圖卡；單張失敗只略過那張（下一輪再補），回傳本機現有圖卡檔名 Set */
export async function syncCards(drive, list, esc, items) {
  mkdirSync(CARD_DIR, { recursive: true });
  const local = () => new Set(readdirSync(CARD_DIR));
  const have = local();
  let got = 0;
  for (const v of items) {
    for (const k of ["fb", "ig"]) {
      const n = cardName(v, k);
      if (!n || have.has(n)) continue;
      try {
        const f = (await list(`name='${esc(driveCardName(v, k))}' and mimeType='image/png'`))[0];
        if (!f) continue;
        const r = await drive.files.get({ fileId: f.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
        const buf = Buffer.from(r.data);
        if (buf.length < 1000 || buf.readUInt32BE(0) !== 0x89504e47) { console.error(`圖卡格式不符，略過：${n}`); continue; }
        writeFileSync(`${CARD_DIR}/${n}`, buf); have.add(n); got++;
      } catch (e) { console.error(`圖卡下載失敗（${n}）：${e.message}`); }
    }
  }
  for (const f of staleCards([...have], items)) { try { unlinkSync(`${CARD_DIR}/${f}`); have.delete(f); } catch (e) {} }
  // 空檔（中斷寫入）不算數
  for (const f of [...have]) { try { if (!statSync(`${CARD_DIR}/${f}`).size) have.delete(f); } catch (e) { have.delete(f); } }
  console.log(`社群圖卡：新下載 ${got} 張，現有 ${[...have].filter((f) => f.endsWith(".png")).length} 張`);
  return have;
}

function keepExisting(reason) { console.error(reason + " → 維持現有 " + OUT + " 不變。"); process.exit(0); }

async function main() {
  const SA = process.env.GDRIVE_SERVICE_ACCOUNT;
  if (!SA) keepExisting("未提供 GDRIVE_SERVICE_ACCOUNT");
  let google;
  try { ({ google } = await import("googleapis")); } catch (e) { keepExisting("無法載入 googleapis：" + e.message); }
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(SA), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const list = async (q) => (await drive.files.list({ q: q + " and trashed=false", fields: "files(id,name,modifiedTime)", pageSize: 50,
    supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [];
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const child = async (name, parent, folder = true) => {
    const l = await list(`name='${esc(name)}' and '${parent}' in parents` + (folder ? " and mimeType='application/vnd.google-apps.folder'" : ""));
    return l.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0] || null;
  };
  try {
    const root = process.env.GDRIVE_ROOT_ID || "1dkY_552wJqQtzi-xXa5K_aNb6ka1iKO8";
    const notes = await child("notes", root);
    const yt = notes && await child("youtube", notes.id);
    const f = yt && await child("index.json", yt.id, false);
    if (!f) keepExisting("Drive 尚無 notes/youtube/index.json");
    const res = await drive.files.get({ fileId: f.id, alt: "media", supportsAllDrives: true }, { responseType: "text" });
    const slim = slimIndex(JSON.parse(typeof res.data === "string" ? res.data : JSON.stringify(res.data)));
    const have = await syncCards(drive, list, esc, slim.items);
    const data = { ...slim, items: attachCards(slim.items, have) };
    const next = JSON.stringify(data, null, 1) + "\n";
    if (existsSync(OUT) && readFileSync(OUT, "utf8") === next) { console.log("ytnotes 無變動"); return; }
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, next);
    console.log(`已更新 ${OUT}：${data.items.length} 筆`);
  } catch (e) { keepExisting("讀取失敗：" + e.message); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
