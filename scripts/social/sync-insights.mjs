/* =====================================================================
   社群成效同步（GitHub Actions：social-insights.yml 每日台北 09:00 前後執行）

   掃描 aurora_social_posts 中 queueState == 'done' 的貼文，對近 30 天已發布的
   FB／IG／Threads 頻道抓取觸及與互動，寫回各貼文的 stats 欄位；
   執行摘要寫入 aurora_social_meta/insights，後台內容中控台顯示。

   環境變數：與 publish-social-posts.mjs 相同（未設定的平台自動略過）
     FIREBASE_SERVICE_ACCOUNT、META_PAGE_TOKEN、THREADS_TOKEN、META_GRAPH_VERSION
     FB 需 Token 具 read_insights／pages_read_engagement；IG 需 instagram_manage_insights；
     Threads 需 threads_manage_insights。缺權限的指標會被略過，不會中斷。
     SOCIAL_DRY_RUN = '1' 時只印出結果，不寫入。
   ===================================================================== */
import { createInsightsClients, syncInsights } from "./insights.mjs";
import { threadsToken } from "./threads-token.mjs";

const COLL = "aurora_social_posts";
const META_DOC = "aurora_social_meta/insights";
const env = (name) => (process.env[name] || "").trim();

async function main() {
  const dryRun = process.env.SOCIAL_DRY_RUN === "1";
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  const metaToken = env("META_PAGE_TOKEN"), thSeed = env("THREADS_TOKEN");
  if (!sa || (!metaToken && !thSeed)) {
    console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT 或任何平台 Token，略過成效同步。見 docs/SOCIAL_SOP.md。");
    return;
  }
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();
  const col = db.collection(COLL);

  // 成效同步不續期 Token（交給發文排程器），只讀取目前有效的那一把
  const th = thSeed ? await threadsToken(db, thSeed, { refresh: false }) : null;
  const clients = createInsightsClients({ metaToken, threadsToken: th && th.token, version: env("META_GRAPH_VERSION") || "v25.0" });
  const store = {
    async listPublished() {
      const snap = await col.where("queueState", "==", "done").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async update(id, patch) { await col.doc(id).update(patch); },
  };

  const r = await syncInsights({ store, clients, dryRun });
  if (!dryRun) {
    await db.doc(META_DOC).set({
      lastRunAt: new Date().toISOString(),
      scanned: r.scanned, updated: r.updated,
      errors: r.errors.slice(0, 20).map((e) => `${e.id}:${e.ch}:${e.error}`),
    });
  }
  console.log(`掃描 ${r.scanned} 筆，更新 ${r.updated} 筆成效；讀取失敗 ${r.errors.length} 次${dryRun ? "（DRY-RUN）" : ""}`);
  // 全部頻道都讀不到（多半是 Token 或權限）才讓 workflow 失敗；個別貼文被刪除等情況只記錄
  if (r.errors.length && !r.updated) {
    console.log("::error::成效全部讀取失敗，請確認 Token 權限（read_insights、instagram_manage_insights、threads_manage_insights）。");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("執行失敗：", e); process.exitCode = 1; });
