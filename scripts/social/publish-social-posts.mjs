/* =====================================================================
   社群自動發文排程器（GitHub Actions：social-publish.yml 每 10 分鐘執行）

   讀 Firestore aurora_social_posts 中 queueState == 'pending' 的貼文，
   依 core.mjs 狀態機處理 Facebook 粉專發文／原生排程／撤銷／對帳。
   執行摘要寫入 aurora_social_meta/runner，後台「社群發文」頁會顯示。

   環境變數（皆由 GitHub Secrets / Variables 提供）：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（需「Cloud Datastore 使用者」角色）
     META_PAGE_TOKEN           粉專 Token（建議 Business Manager 系統使用者 Token）
     META_PAGE_ID              粉專 ID
     META_GRAPH_VERSION        選填，預設 v25.0
     SOCIAL_DRY_RUN            '1' 時只列出將執行的動作，不呼叫 Graph、不改資料
   ===================================================================== */
import { runOnce, createFbGraph, LOCK_STALE_MS, isAuthError } from "./core.mjs";

const COLL = "aurora_social_posts";
const META_DOC = "aurora_social_meta/runner";
const RUNNER = `gha-${process.env.GITHUB_RUN_ID || "local"}`;

function env(name, { required = true } = {}) {
  const v = (process.env[name] || "").trim();
  if (!v && required) return null;
  return v;
}

async function main() {
  const dryRun = process.env.SOCIAL_DRY_RUN === "1";
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  const token = env("META_PAGE_TOKEN");
  const pageId = env("META_PAGE_ID");
  if (!sa) {
    console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，略過本輪。設定方式見 docs/SOCIAL_SOP.md。");
    return;
  }
  if (!token || !pageId) {
    console.log("::warning::未設定 META_PAGE_TOKEN / META_PAGE_ID，略過本輪（尚未完成 Meta 設定）。見 docs/SOCIAL_SOP.md。");
    return;
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();
  const col = db.collection(COLL);

  const store = {
    async listPending() {
      // 單欄位查詢，不需複合索引
      const snap = await col.where("queueState", "==", "pending").get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async claim(id, now) {
      const ref = col.doc(id);
      return db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const d = s.data();
        if (d.queueState !== "pending") return null;
        const at = Date.parse((d.lock && d.lock.at) || "");
        if (d.lock && d.lock.by && isFinite(at) && now - at < LOCK_STALE_MS) return null;
        tx.update(ref, { lock: { by: RUNNER, at: new Date(now).toISOString() } });
        return { id, ...d };
      });
    },
    async update(id, patch) { await col.doc(id).update(patch); },
  };

  const graph = createFbGraph({ token, pageId, version: env("META_GRAPH_VERSION", { required: false }) || "v25.0" });

  // 先檢查 Token：失效時直接記錄並讓 workflow 失敗（GitHub 會寄信通知）
  let tokenOk = true, tokenError = null, pageName = null;
  try { pageName = (await graph.checkToken()).name || null; }
  catch (e) { tokenOk = false; tokenError = e.message; }

  let summary = { total: 0, results: [], authFailed: false, failed: 0 };
  if (tokenOk) summary = await runOnce({ store, graph, dryRun });

  if (!dryRun) {
    await db.doc(META_DOC).set({
      lastRunAt: new Date().toISOString(),
      runId: RUNNER,
      tokenOk: tokenOk && !summary.authFailed,
      tokenError: tokenError || (summary.authFailed ? "發文時 Token／權限遭拒" : null),
      pageName,
      processed: summary.total,
      actions: summary.results.map((r) => `${r.id}:${r.action}${r.error ? "!" : ""}`).slice(0, 50),
      failed: summary.failed,
    }, { merge: true });
  }

  console.log(`本輪處理 ${summary.total} 筆；不可重試失敗 ${summary.failed} 筆${dryRun ? "（DRY-RUN）" : ""}`);
  if (!tokenOk || summary.authFailed) {
    console.log(`::error::Meta Token 或權限有問題：${tokenError || "發文時遭拒"}。請依 docs/SOCIAL_SOP.md 重新產生 Token 並更新 META_PAGE_TOKEN。`);
    process.exitCode = 1;
  } else if (summary.failed > 0) {
    console.log("::error::有貼文發布失敗，請至後台「社群發文」查看錯誤並處理。");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(isAuthError(e) ? "Meta 認證錯誤：" : "執行失敗：", e);
  process.exitCode = 1;
});
