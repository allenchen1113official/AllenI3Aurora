/* Firestore / SMTP 介接（兩支 worker 共用）。純邏輯在 core.mjs。 */
import { randomBytes } from "node:crypto";

export const COLL = "aurora_subscribers";
export const META_DOC = "aurora_subscribers_meta/runner";

export function env(name) { return (process.env[name] || "").trim() || null; }

export function createSmtpMailer() {
  // 延遲載入：dry-run 或未設定時不需要 nodemailer
  let transportP = null;
  const FROM = env("MAIL_FROM") || "艾倫報報 <no-reply@example.com>";
  const REPLY = env("MAIL_REPLY_TO") || FROM;
  return {
    async send({ to, subject, html, text, headers }) {
      if (!transportP) {
        transportP = import("nodemailer").then((nm) => nm.default.createTransport({
          host: env("SMTP_HOST"),
          port: Number(env("SMTP_PORT") || 587),
          secure: Number(env("SMTP_PORT") || 587) === 465,
          auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
        }));
      }
      const t = await transportP;
      await t.sendMail({ from: FROM, to, replyTo: REPLY, subject, html, text, headers });
    },
  };
}

export async function createFirestoreStore(sa) {
  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();
  const col = db.collection(COLL);
  const row = (d) => ({ token: d.id, ...d.data() });
  return {
    db,
    newToken: () => randomBytes(16).toString("hex"),
    async listAll() { return (await col.get()).docs.map(row); },
    async listByField(f, v) { return (await col.where(f, "==", v).get()).docs.map(row); }, // 單欄位查詢，免複合索引
    async get(t) { const s = await col.doc(t).get(); return s.exists ? row(s) : null; },
    async set(t, d) { await col.doc(t).set(d); },
    async update(t, p) { await col.doc(t).update(p); },
    async delete(t) { await col.doc(t).delete(); },
    async listIssuesByKind(kind) { return (await db.collection("aurora_issues").where("kind", "==", kind).get()).docs.map((d) => ({ id: d.id, ...d.data() })); },
    async getCampaign(id) { const s = await db.collection("aurora_campaigns").doc(id).get(); return s.exists ? s.data() : null; },
    async setCampaign(id, d) { await db.collection("aurora_campaigns").doc(id).set(d, { merge: true }); },
    async getMeta() { const s = await db.doc(META_DOC).get(); return s.exists ? s.data() : {}; },
    async setMeta(p) { await db.doc(META_DOC).set(p, { merge: true }); },
  };
}

