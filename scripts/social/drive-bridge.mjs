/* =====================================================================
   PilotOne Drive 橋接（social-publish.yml 每輪在「素材匯入」之前執行）

   用法：node scripts/social/drive-bridge.mjs <content 分支的工作目錄>

   讀 Drive「AllenI3Aurora/<主題資料夾>/<YYYYMMDD>/pilotone/」送審包（台北今天＋昨天），
   以及主題家族「<家族資料夾>/<YYYYMMDD>/pilotone/<子代碼>/」（如 notes/youtube → yt-<影片ID>），
   producedAt 有變更者原樣複製到 content 分支 content/<topic>/<YYYYMMDD>/ 並推送，
   之後同一個 job 的 ingest-content.mjs 會建立 PilotOne 審核草稿。

   環境變數：
     GDRIVE_SERVICE_ACCOUNT  Google 服務帳戶 JSON（AllenI3Aurora 資料夾已分享為檢視者；與今日關注動態共用）
     GDRIVE_ROOT_ID          （選用）AllenI3Aurora 資料夾 id，預設 1dkY_552wJqQtzi-xXa5K_aNb6ka1iKO8
     SOCIAL_DRY_RUN          '1' 時只列出將同步的送審包，不寫檔、不推 git
     CONTENT_BRANCH          預設 content
   未設定 GDRIVE_SERVICE_ACCOUNT 時印出警告並略過（不影響後續匯入與發文）。
   ===================================================================== */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { taipeiDays } from "./ingest-core.mjs";
import { DRIVE_PATHS, DRIVE_FAMILIES, familyTopic, PKG_DIR, MANIFEST, referencedFiles, needsSync, pickFile, pickFolder, q, AUDIO_NAME, DRIVE_STUB, driveStub } from "./drive-bridge-core.mjs";

const env = (n) => (process.env[n] || "").trim();
const FOLDER_MIME = "application/vnd.google-apps.folder";
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

async function main() {
  const dir = process.argv[2];
  const dryRun = env("SOCIAL_DRY_RUN") === "1";
  const branch = env("CONTENT_BRANCH") || "content";
  const sa = env("GDRIVE_SERVICE_ACCOUNT");
  if (!dir || !existsSync(dir)) { console.log(`Drive 橋接：找不到 content 工作目錄 ${dir || "(未指定)"}，略過。`); return; }
  if (!sa) { console.log("::warning::未設定 GDRIVE_SERVICE_ACCOUNT，Drive 橋接略過（Claude 排程送審包不會進 PilotOne）。"); return; }

  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(sa), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
  const drive = google.drive({ version: "v3", auth });
  const FIELDS = "files(id,name,mimeType,modifiedTime,createdTime,size,trashed)";
  const list = async (query) => {
    const out = [];
    let pageToken;
    do {
      const r = await drive.files.list({ q: query, fields: `nextPageToken,${FIELDS}`, pageSize: 200, pageToken,
        includeItemsFromAllDrives: true, supportsAllDrives: true });
      out.push(...(r.data.files || []));
      pageToken = r.data.nextPageToken;
    } while (pageToken);
    return out;
  };
  const childFolder = async (parent, name) =>
    pickFolder(await list(`'${q(parent)}' in parents and name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`), name);
  const download = async (id) => Buffer.from((await drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" })).data);

  const root = env("GDRIVE_ROOT_ID") || "1dkY_552wJqQtzi-xXa5K_aNb6ka1iKO8";
  const topicFolder = {};
  for (const [topic, segs] of Object.entries(DRIVE_PATHS)) {
    let id = root;
    for (const s of segs) { const f = id && await childFolder(id, s); id = f ? f.id : null; }
    topicFolder[topic] = id;
    if (!id) console.log(`Drive 橋接：找不到 ${segs.join("/")}（${topic}），略過該主題。`);
  }

  const resolvePath = async (segs) => {
    let id = root;
    for (const s of segs) { const f = id && await childFolder(id, s); id = f ? f.id : null; }
    return id;
  };
  const days = taipeiDays(Date.now(), 1);
  const synced = [];
  let checked = 0;

  /* 處理一份送審包資料夾 pkg（Drive folder），同步到 content/<topic>/<ymd>/ */
  const syncPackage = async (topic, ymd, pkg) => {
    const tag = `[${topic}/${ymd}]`;
    checked++;
    const files = await list(`'${q(pkg.id)}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`);
    const mf = pickFile(files, MANIFEST);
    if (!mf) { console.log(`::warning::${tag} Drive 送審包缺 manifest.json，略過`); return; }
    let m;
    try { m = JSON.parse((await download(mf.id)).toString("utf8")); }
    catch (e) { console.log(`::warning::${tag} manifest.json 無法解析：${e.message}`); return; }
    const outDir = join(dir, "content", topic, ymd);
    const localPath = join(outDir, MANIFEST);
    let local = null;
    try { local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, "utf8")) : null; } catch { local = null; }
    const plan = needsSync(local, m);
    if (!plan.sync) { console.log(`${tag} 略過：${plan.reason}`); return; }
    const { files: refs, bad } = referencedFiles(m);
    if (bad.length) { console.log(`::warning::${tag} manifest 含不安全檔名（${bad.join("、")}），略過`); return; }
    const missing = refs.filter((n) => !pickFile(files, n));
    if (missing.length) { console.log(`::warning::${tag} 送審包缺檔：${missing.join("、")}（Drive 可能尚未同步完成，下一輪再試）`); return; }
    if (dryRun) { console.log(`${tag} DRY-RUN 將同步 ${refs.length + 1} 個檔案（${plan.reason}）`); synced.push(`${topic}/${ymd}`); return; }
    mkdirSync(outDir, { recursive: true });
    for (const n of refs) {
      const f = pickFile(files, n);
      if (AUDIO_NAME.test(n)) writeFileSync(join(outDir, n + DRIVE_STUB), JSON.stringify(driveStub(f), null, 2) + "\n"); // 音檔只留 Drive 指標
      else writeFileSync(join(outDir, n), await download(f.id));
    }
    writeFileSync(localPath, JSON.stringify(m, null, 2) + "\n"); // manifest 最後寫，確保檔案齊全才會被匯入
    console.log(`${tag} 已同步 ${refs.length + 1} 個檔案（${plan.reason}）`);
    synced.push(`${topic}/${ymd}`);
  };

  for (const [topic, tid] of Object.entries(topicFolder)) {
    if (!tid) continue;
    for (const d of days) {
      const dayF = await childFolder(tid, d.ymd);
      const pkg = dayF && await childFolder(dayF.id, PKG_DIR);
      if (pkg) await syncPackage(topic, d.ymd, pkg);
    }
  }

  /* 主題家族：pilotone/<子代碼>/ 各為一份送審包 */
  for (const [prefix, fam] of Object.entries(DRIVE_FAMILIES)) {
    const fid = await resolvePath(fam.path);
    if (!fid) { console.log(`Drive 橋接：找不到 ${fam.path.join("/")}（${prefix}-*），略過該家族。`); continue; }
    for (const d of days) {
      const dayF = await childFolder(fid, d.ymd);
      const pkgRoot = dayF && await childFolder(dayF.id, PKG_DIR);
      if (!pkgRoot) continue;
      const subs = await list(`'${q(pkgRoot.id)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`);
      for (const name of [...new Set(subs.map((f) => f.name))]) {
        const topic = familyTopic(prefix, name);
        if (!topic) { console.log(`::warning::[${prefix}/${d.ymd}] 子資料夾「${name}」不是有效代碼，略過`); continue; }
        await syncPackage(topic, d.ymd, pickFolder(subs, name));
      }
    }
  }

  if (!dryRun && synced.length) {
    git(dir, "add", "-A", "content");
    if (git(dir, "status", "--porcelain", "content")) {
      git(dir, "commit", "-m", `content: Drive 送審包同步（${synced.join("、")}）[skip ci]`);
      git(dir, "push", "origin", `HEAD:${branch}`);
    }
  }
  console.log(`Drive 橋接完成：檢查 ${checked} 份送審包，同步 ${synced.length} 份${dryRun ? "（DRY-RUN）" : ""}`);
}

main().catch((e) => {
  console.error("Drive 橋接失敗：", e);
  console.log(`::warning::Drive 橋接失敗（不影響既有佇列發文）：${(e && e.message) || e}`);
  process.exitCode = 1;
});
