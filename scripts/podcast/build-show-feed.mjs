/* =====================================================================
   自有節目 RSS 產生器（social-publish.yml：有集數上架時、以及每輪常駐開始時執行）

   用法：node scripts/podcast/build-show-feed.mjs [--out 本機路徑]
   讀 scripts/podcast/show.json＋Firestore aurora_podcast_feed → podcast.xml，
   與 main 分支現有的 podcast.xml 比對，不同才以 GitHub Contents API 提交（GitHub Pages 對外提供）。
   訂閱網址：https://allenchen1113official.github.io/AllenI3Aurora/podcast.xml

   環境變數：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（讀集數）
     GH_TOKEN／GITHUB_REPOSITORY  提交 podcast.xml（workflow 的 GITHUB_TOKEN，contents: write）
     SOCIAL_DRY_RUN            '1' 時只印出 XML 摘要，不提交
     FEED_BRANCH               預設 main
   ===================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildShowFeed, checkShow, feedEpisodes } from "./show-feed-core.mjs";

const env = (n) => (process.env[n] || "").trim();
const here = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = "podcast.xml";

async function main() {
  const show = JSON.parse(readFileSync(join(here, "show.json"), "utf8"));
  const bad = checkShow(show);
  if (bad.length) throw new Error("show.json 不完整：" + bad.join("；"));
  const outIdx = process.argv.indexOf("--out");
  const dryRun = env("SOCIAL_DRY_RUN") === "1";

  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  if (!sa) { console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，podcast.xml 略過。"); return; }
  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(sa)) });
  const list = (await getFirestore().collection("aurora_podcast_feed").get()).docs.map((d) => d.data());
  const xml = buildShowFeed(show, list);
  const n = feedEpisodes(list).length;

  if (outIdx > 0) { writeFileSync(process.argv[outIdx + 1], xml); console.log(`podcast.xml 已寫到 ${process.argv[outIdx + 1]}（${n} 集）`); return; }
  if (dryRun) { console.log(`DRY-RUN podcast.xml：${n} 集，${Buffer.byteLength(xml)} bytes`); return; }

  const token = env("GH_TOKEN") || env("GITHUB_TOKEN"), repo = env("GITHUB_REPOSITORY"), branch = env("FEED_BRANCH") || "main";
  if (!token || !repo) { console.log("::warning::未設定 GH_TOKEN／GITHUB_REPOSITORY，podcast.xml 無法提交。"); return; }
  const api = `https://api.github.com/repos/${repo}/contents/${FEED_PATH}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  let sha = null;
  if (cur.ok) {
    const d = await cur.json();
    sha = d.sha;
    if (Buffer.from(d.content || "", "base64").toString("utf8") === xml) { console.log(`podcast.xml 無變動（${n} 集）`); return; }
  } else if (cur.status !== 404) throw new Error(`讀取現有 podcast.xml 失敗：HTTP ${cur.status}`);
  const res = await fetch(api, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({
    message: `chore(podcast): 更新 podcast.xml（${n} 集）[skip ci]`, content: Buffer.from(xml).toString("base64"), branch, ...(sha ? { sha } : {}),
    committer: { name: "github-actions[bot]", email: "41898282+github-actions[bot]@users.noreply.github.com" },
  }) });
  if (!res.ok) throw new Error(`提交 podcast.xml 失敗：HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log(`podcast.xml 已更新（${n} 集），GitHub Pages 約 1–3 分鐘後生效`);
}

main().catch((e) => {
  console.error("podcast.xml 產生失敗：", e);
  console.log(`::warning::podcast.xml 產生失敗（下一輪再試）：${(e && e.message) || e}`);
  process.exitCode = 1;
});
