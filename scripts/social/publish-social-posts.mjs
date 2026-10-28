/* =====================================================================
   社群自動發文排程器（GitHub Actions：social-publish.yml 每 10 分鐘執行）

   讀 Firestore aurora_social_posts 中 queueState == 'pending' 的貼文，
   依 core.mjs 狀態機處理 Facebook 粉專（發文／原生排程／撤銷／對帳）、
   Instagram 與 Threads（容器兩段式發布）。
   執行摘要寫入 aurora_social_meta/runner，後台「社群發文／內容中控台」會顯示。

   環境變數（皆由 GitHub Secrets / Variables 提供；未設定的平台自動停用）：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（需「Cloud Datastore 使用者」角色）
     META_PAGE_TOKEN           粉專 Token（建議 Business Manager 系統使用者 Token）
     META_PAGE_ID              粉專 ID
     META_IG_USER_ID           IG 商業帳號 ID（沿用 META_PAGE_TOKEN，需 instagram_content_publish）
     THREADS_USER_ID           Threads 使用者 ID
     THREADS_TOKEN             Threads 長效 Token（排程器每日自動續期，續期後存於
                               aurora_social_secrets/threads，前端規則禁止讀取）
     META_GRAPH_VERSION        選填，預設 v25.0
     SOCIAL_DRY_RUN            '1' 時只列出將執行的動作，不呼叫發文 API、不改資料
   ===================================================================== */
import { createHash } from "node:crypto";
import { runOnce, createFbGraph, createIgGraph, createThreadsGraph, refreshThreadsToken, LOCK_STALE_MS, isAuthError, CHANNEL_LABEL } from "./core.mjs";

const COLL = "aurora_social_posts";
const META_DOC = "aurora_social_meta/runner";
const TH_SECRET_DOC = "aurora_social_secrets/threads";
const RUNNER = `gha-${process.env.GITHUB_RUN_ID || "local"}`;
const HOUR = 3600 * 1000;
const TH_REFRESH_EVERY_MS = 20 * HOUR; // 每日續期一次，60 天到期日隨之順延
const TH_RETRY_MS = HOUR;              // 續期失敗（如 Token 未滿 24 小時）1 小時後再試

const env = (name) => (process.env[name] || "").trim();

/* Threads Token：Secret 為種子；續期後的新 Token 存 Firestore（僅 Admin SDK 可讀）。
   使用者更新 THREADS_TOKEN Secret 時，以雜湊辨識並改用新種子。 */
async function threadsToken(db, seed, dryRun) {
  const ref = db.doc(TH_SECRET_DOC);
  const seedHash = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  const snap = await ref.get();
  const d = snap.exists && snap.data().seedHash === seedHash ? snap.data() : {};
  let token = d.token || seed;
  let expiresAt = d.expiresAt || null;
  let refreshError = null;
  const now = Date.now();
  const last = Date.parse(d.refreshedAt || "");
  const tried = Date.parse(d.refreshTriedAt || "");
  if (!dryRun && (!isFinite(last) || now - last > TH_REFRESH_EVERY_MS) && (!isFinite(tried) || now - tried > TH_RETRY_MS)) {
    try {
      const r = await refreshThreadsToken({ token });
      token = r.token; expiresAt = r.expiresAt;
      await ref.set({ token, expiresAt, seedHash, refreshedAt: new Date(now).toISOString(), refreshTriedAt: new Date(now).toISOString(), refreshError: null });
    } catch (e) {
      refreshError = e.message;
      await ref.set({ seedHash, refreshTriedAt: new Date(now).toISOString(), refreshError }, { merge: true });
    }
  }
  return { token, expiresAt, refreshError };
}

async function main() {
  const dryRun = process.env.SOCIAL_DRY_RUN === "1";
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  const metaToken = env("META_PAGE_TOKEN"), pageId = env("META_PAGE_ID"), igUserId = env("META_IG_USER_ID");
  const thUserId = env("THREADS_USER_ID"), thSeed = env("THREADS_TOKEN");
  const version = env("META_GRAPH_VERSION") || "v25.0";
  const configured = { fb: !!(metaToken && pageId), ig: !!(metaToken && igUserId), th: !!(thUserId && thSeed) };
  if (!sa) {
    console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，略過本輪。設定方式見 docs/SOCIAL_SOP.md。");
    return;
  }
  if (!configured.fb && !configured.ig && !configured.th) {
    console.log("::warning::尚未設定任何社群平台的 Secrets（Meta 或 Threads），略過本輪。見 docs/SOCIAL_SOP.md。");
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

  /* 各平台客戶端與 Token 檢查：失效的平台本輪暫停（貼文保持 pending），其他平台照常 */
  const clients = {};
  const health = {};
  let thToken = null;
  if (configured.fb) clients.fb = createFbGraph({ token: metaToken, pageId, version });
  if (configured.ig) clients.ig = createIgGraph({ token: metaToken, igUserId, version });
  if (configured.th) {
    thToken = await threadsToken(db, thSeed, dryRun);
    clients.th = createThreadsGraph({ token: thToken.token, userId: thUserId });
  }
  for (const ch of Object.keys(clients)) {
    try { health[ch] = { ok: true, name: (await clients[ch].checkToken()).name || null, error: null }; }
    catch (e) { health[ch] = { ok: false, name: null, error: e.message }; }
  }
  const paused = Object.keys(health).filter((ch) => !health[ch].ok);
  const { fb: graph, ...graphs } = clients;

  let summary = { total: 0, results: [], authFailed: false, authChannels: [], failed: 0 };
  if (paused.length < Object.keys(clients).length) summary = await runOnce({ store, graph, graphs, paused, dryRun });
  for (const ch of summary.authChannels) if (health[ch]) health[ch] = { ...health[ch], ok: false, error: health[ch].error || "發文時 Token／權限遭拒" };

  if (!dryRun) {
    const chMeta = (ch) => ({ configured: configured[ch], ok: configured[ch] ? !!(health[ch] && health[ch].ok) : null,
      name: (health[ch] && health[ch].name) || null, error: (health[ch] && health[ch].error) || null });
    await db.doc(META_DOC).set({
      lastRunAt: new Date().toISOString(),
      runId: RUNNER,
      // 第一階段欄位（FB），後台既有畫面沿用
      tokenOk: configured.fb ? !!(health.fb && health.fb.ok) : false,
      tokenError: configured.fb ? (health.fb && health.fb.error) || null : "未設定 META_PAGE_TOKEN／META_PAGE_ID",
      pageName: (health.fb && health.fb.name) || null,
      channels: {
        fb: chMeta("fb"),
        ig: chMeta("ig"),
        th: { ...chMeta("th"), expiresAt: thToken ? thToken.expiresAt : null, refreshError: thToken ? thToken.refreshError : null },
      },
      processed: summary.total,
      actions: summary.results.map((r) => `${r.id}:${r.action}${r.error ? "!" : ""}`).slice(0, 50),
      failed: summary.failed,
    }, { merge: true });
  }

  console.log(`本輪處理 ${summary.total} 筆；不可重試失敗 ${summary.failed} 筆${dryRun ? "（DRY-RUN）" : ""}`);
  for (const ch of Object.keys(health)) console.log(`  ${CHANNEL_LABEL[ch]}: ${health[ch].ok ? "● 正常 " + (health[ch].name || "") : "✕ " + health[ch].error}`);
  if (thToken && thToken.expiresAt) console.log(`  Threads Token 到期：${thToken.expiresAt}${thToken.refreshError ? `（續期失敗：${thToken.refreshError}）` : ""}`);
  const bad = Object.keys(health).filter((ch) => !health[ch].ok);
  if (bad.length) {
    console.log(`::error::${bad.map((ch) => CHANNEL_LABEL[ch]).join("、")} 的 Token 或權限有問題，這些平台本輪暫停。請依 docs/SOCIAL_SOP.md 更新對應 Secrets。`);
    process.exitCode = 1;
  } else if (summary.failed > 0) {
    console.log("::error::有貼文發布失敗，請至後台「內容中控台 → 內容庫」查看錯誤並處理。");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(isAuthError(e) ? "認證錯誤：" : "執行失敗：", e);
  process.exitCode = 1;
});
