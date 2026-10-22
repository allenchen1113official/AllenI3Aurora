/* =====================================================================
   電子報本文寄送 worker（GitHub Actions：newsletter-send.yml，僅手動觸發）

   把後台已發布的某一期寄給訂閱該節奏的已確認讀者。寄信不可逆，所以不排程。
   每期一份 aurora_campaigns/{kind}-{no} 記錄已寄 Email：重跑不重複、名單大時分輪續寄。
   決策邏輯在 core.mjs（node --test scripts/mail/mail.test.mjs）。

   環境變數：同 send-transactional.mjs，另加
     NL_KIND      日報 / 週報 / 月報 / 特刊（必要）
     NL_NO        期號；留空＝該期別最新一期「可寄的」（草稿與未到時間的排程不算）
     NL_TEST_TO   只寄給這個地址（試寄，不寫寄送紀錄）
     MAIL_DRY_RUN=1  只列出收件人，不寄送
   ===================================================================== */
import { runIssue } from "./core.mjs";
import { env, createFirestoreStore, createSmtpMailer } from "./adapters.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dryRun = process.env.MAIL_DRY_RUN === "1";
  const kind = env("NL_KIND");
  if (!kind) { console.log("::error::未指定 NL_KIND（日報／週報／月報／特刊）"); process.exit(1); }
  const sa = env("FIREBASE_SERVICE_ACCOUNT");
  if (!sa) { console.log("::error::未設定 FIREBASE_SERVICE_ACCOUNT。見 docs/SUBSCRIBER_SOP.md。"); process.exit(1); }
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"].filter((k) => !env(k));
  if (missing.length && !dryRun) { console.log(`::error::未設定寄信 Secrets（${missing.join(", ")}）。見 docs/SUBSCRIBER_SOP.md。`); process.exit(1); }

  const store = await createFirestoreStore(sa);
  const mailer = createSmtpMailer();
  const r = await runIssue({
    store, mailer, kind, no: env("NL_NO") || "", testTo: (env("NL_TEST_TO") || "").toLowerCase(),
    dryRun, sleep, log: console.log,
  });
  if (r.error) { console.log("::error::" + r.error); process.exit(1); }
  if (r.test) return;
  if (r.done && r.sent === 0 && r.remain === 0) { console.log("本期已全部寄送完成。"); return; }
  console.log(`本輪寄出 ${r.sent}、失敗 ${r.failed || 0}${r.remain > 0 ? `，尚餘 ${r.remain} 人（請再執行一次續寄）` : "，本期完成"}${dryRun ? "（dry-run）" : ""}`);
  if (r.remain > 0) console.log(`::notice::尚餘 ${r.remain} 人未寄，再 Run workflow 一次即可續寄（不會重複）。`);
}

main().catch((e) => { console.error("寄送流程異常：", e); process.exit(1); });
