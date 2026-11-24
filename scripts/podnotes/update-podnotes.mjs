/* =====================================================================
   常聽 Podcast 重點筆記 · 網站與後台同步（focus-update.yml 每 3 小時執行）

   1. 讀 Drive「AllenI3Aurora/notes/podcast/index.json」（Claude 每集做完由 merge_index.py 更新）
      → data/podnotes.json（前台「常聽 Podcast · 重點筆記」；只有摘要與康乃爾筆記，絕不含逐字稿）
   2. 每集的莫蘭迪藍圖卡（Drive <YYYYMMDD>/pilotone/<集數ID>/PodNotes_*_FB|IG.png）→ assets/podnotes/<集數ID>_FB|IG.png
      （前台顯示用；已不在清單的圖卡刪除）
   3. 逐字稿 Drive transcripts/<集數ID>.md → Firestore aurora_podcast_transcripts/<集數ID>
      （規則：管理者唯讀、前端不可寫；後台「Podcast 重點筆記」瀏覽）。Drive 檔沒變就不寫。
   環境變數：GDRIVE_SERVICE_ACCOUNT（必要）、FIREBASE_SERVICE_ACCOUNT（第 3 步用；未設定則略過）、GDRIVE_ROOT_ID（選用）
   未設定或讀取失敗時維持現有檔案不變、結束碼 0。純邏輯在 podnotes-core.mjs。
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT, CARD_DIR, TRANSCRIPT_COLL, slimIndex, cardFiles, staleCards, parseTranscriptMd } from "./podnotes-core.mjs";

const env = (n) => (process.env[n] || "").trim();
const keep = (why) => { console.log(`常聽 Podcast 重點筆記同步略過：${why}（維持現有檔案）`); };

async function main() {
  const SA = env("GDRIVE_SERVICE_ACCOUNT");
  if (!SA) return keep("未提供 GDRIVE_SERVICE_ACCOUNT");
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(SA), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const list = async (query, fields = "files(id,name,modifiedTime,size,mimeType)") =>
    (await drive.files.list({ q: query + " and trashed = false", fields, pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [];
  const child = async (parent, name, folder = true) => {
    const l = await list(`'${q(parent)}' in parents and name = '${q(name)}'` + (folder ? " and mimeType = 'application/vnd.google-apps.folder'" : ""));
    return l.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0] || null;
  };
  const walk = async (parent, parts, lastIsFile = false) => {
    let id = parent, f = null;
    for (const [i, p] of parts.entries()) {
      f = await child(id, p, !(lastIsFile && i === parts.length - 1));
      if (!f) return null;
      id = f.id;
    }
    return f;
  };
  const text = async (id) => {
    const r = await drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "text" });
    return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
  };

  const root = env("GDRIVE_ROOT_ID") || "1dkY_552wJqQtzi-xXa5K_aNb6ka1iKO8";
  const base = await walk(root, ["notes", "podcast"]);
  if (!base) return keep("Drive 尚無 notes/podcast");

  /* 1. 索引 */
  const idxFile = await child(base.id, "index.json", false);
  if (!idxFile) return keep("Drive 尚無 notes/podcast/index.json（還沒有任何一集完成筆記）");
  let raw;
  try { raw = JSON.parse(await text(idxFile.id)); } catch (e) { return keep("index.json 無法解析：" + e.message); }
  const data = slimIndex(raw);
  const next = JSON.stringify(data, null, 1) + "\n";
  if (existsSync(OUT) && readFileSync(OUT, "utf8") === next) console.log("podnotes.json 無變動");
  else { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, next); console.log(`已更新 ${OUT}：${data.items.length} 集`); }

  /* 2. 圖卡 */
  mkdirSync(CARD_DIR, { recursive: true });
  let got = 0;
  for (const c of cardFiles(raw.items, data.items)) {
    const f = await walk(base.id, c.drive.split("/"), true);
    if (!f) { console.log(`::warning::Drive 找不到圖卡 notes/podcast/${c.drive}`); continue; }
    if (existsSync(c.site) && f.size && statSync(c.site).size === Number(f.size)) continue;
    const r = await drive.files.get({ fileId: f.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    const buf = Buffer.from(r.data);
    if (f.size && buf.length !== Number(f.size)) { console.log(`::warning::圖卡大小不符，略過 ${c.drive}`); continue; }
    writeFileSync(c.site, buf); got++;
  }
  const stale = staleCards(readdirSync(CARD_DIR), data.items);
  for (const n of stale) unlinkSync(`${CARD_DIR}/${n}`);
  console.log(`圖卡：下載 ${got} 張、移除 ${stale.length} 張`);

  /* 3. 逐字稿 → Firestore（管理者唯讀） */
  const FSA = env("FIREBASE_SERVICE_ACCOUNT");
  if (!FSA) return console.log("未設定 FIREBASE_SERVICE_ACCOUNT，略過逐字稿同步");
  const tdir = await child(base.id, "transcripts");
  if (!tdir) return console.log("Drive 尚無 notes/podcast/transcripts，略過逐字稿同步");
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(FSA)) });
  const fs = getFirestore();
  const files = (await list(`'${q(tdir.id)}' in parents and name contains '.md'`)).filter((f) => /\.md$/.test(f.name));
  let wrote = 0;
  for (const f of files) {
    const id = f.name.replace(/\.md$/, "");
    const ref = fs.collection(TRANSCRIPT_COLL).doc(id);
    const prev = (await ref.get()).data();
    if (prev && prev.driveModified === f.modifiedTime) continue;
    const doc = parseTranscriptMd(await text(f.id), { id, driveModified: f.modifiedTime });
    if (!doc) { console.log(`::warning::逐字稿格式不符，略過 ${f.name}`); continue; }
    await ref.set(doc); wrote++;
  }
  console.log(`逐字稿：Drive ${files.length} 份，更新 Firestore ${wrote} 份（${TRANSCRIPT_COLL}，管理者唯讀）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(`::warning::常聽 Podcast 重點筆記同步失敗（維持現有檔案）：${(e && e.message) || e}`); });
}
