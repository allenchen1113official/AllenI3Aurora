/* =====================================================================
   Threads 長效 Token 管理（發文排程器與成效同步共用）
   ===================================================================== */
import { createHash } from "node:crypto";
import { refreshThreadsToken } from "./core.mjs";

const TH_SECRET_DOC = "aurora_social_secrets/threads";
const HOUR = 3600 * 1000;
const TH_REFRESH_EVERY_MS = 20 * HOUR; // 每日續期一次，60 天到期日隨之順延
const TH_RETRY_MS = HOUR;              // 續期失敗（如 Token 未滿 24 小時）1 小時後再試

/* Threads Token：Secret 為種子；續期後的新 Token 存 Firestore（僅 Admin SDK 可讀）。
   使用者更新 THREADS_TOKEN Secret 時，以雜湊辨識並改用新種子。 */
export async function threadsToken(db, seed, { refresh = true } = {}) {
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
  if (refresh && (!isFinite(last) || now - last > TH_REFRESH_EVERY_MS) && (!isFinite(tried) || now - tried > TH_RETRY_MS)) {
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
