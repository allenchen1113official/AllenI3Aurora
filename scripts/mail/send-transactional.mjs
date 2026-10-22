/* =====================================================================
   訂閱確認信／歡迎信 worker（GitHub Actions：subscriber-mail.yml 每 10 分鐘）

   1. 把舊格式訂閱者（PR #69：email 為 doc id）搬成 token 文件（只在尚未完成時掃描）
   2. 掃 aurora_subscribers 的 mailState 佇列：need_confirm → 確認信；need_welcome → 歡迎信
   決策邏輯全在 core.mjs，可用 node --test scripts/mail/mail.test.mjs 驗證。

   環境變數（GitHub Secrets）：
     FIREBASE_SERVICE_ACCOUNT  服務帳戶 JSON（需「Cloud Datastore 使用者」角色）
     SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM
     MAIL_REPLY_TO             選填，預設同 MAIL_FROM
     MAIL_DRY_RUN=1            只列出不寄送
   缺設定時以 ::warning 略過本輪，不讓排程變紅燈（比照 social）。
   ===================================================================== */
import { migrateLegacy, runTransactional } from "./core.mjs";
import { env, createFirestoreStore, createSmtpMailer } from "./adapters.mjs";

async function main() {
  const dryRun = process.env.MAIL_DRY_RUN === "1";
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  if (!sa) { console.log("::warning::未設定 FIREBASE_SERVICE_ACCOUNT，略過本輪。見 docs/SUBSCRIBER_SOP.md。"); return; }
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"].filter((k) => !env(k));
  if (missing.length && !dryRun) { console.log(`::warning::未設定寄信 Secrets（${missing.join(", ")}），略過本輪。見 docs/SUBSCRIBER_SOP.md。`); return; }

  const store = await createFirestoreStore(sa);
  const mailer = createSmtpMailer();
  const nowIso = new Date().toISOString();

  // 舊資料搬遷：完成後寫下旗標，之後不再全表掃描
  const meta = await store.getMeta();
  let migration = null;
  if (!meta.legacyMigratedAt) {
    migration = await migrateLegacy({ store });
    console.log(`搬遷舊格式：掃描 ${migration.scanned}、舊格式 ${migration.legacy}、新建 ${migration.migrated}、合併 ${migration.merged}`);
    if (!dryRun) await store.setMeta({ legacyMigratedAt: nowIso, legacyMigration: migration });
  }

  const r = await runTransactional({ store, mailer, dryRun, log: console.log });
  console.log(`完成：寄出 ${r.sent}、略過 ${r.skipped}、失敗 ${r.failed}${dryRun ? "（dry-run）" : ""}`);
  if (!dryRun) await store.setMeta({ lastRunAt: nowIso, lastRun: r, runner: `gha-${process.env.GITHUB_RUN_ID || "local"}` });
}

main().catch((e) => { console.error("寄送流程異常：", e); process.exit(1); });
