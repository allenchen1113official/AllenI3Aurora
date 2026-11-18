/* =====================================================================
   PilotOne 審核通知（social-publish.yml 在素材匯入之後執行）

   用法：node scripts/social/notify-review.mjs <ingest 結果 JSON 路徑>

   讀 ingest-content.mjs 寫出的本輪結果，對「新建或重產的待審草稿」寄出一則彙整通知：
     - Email：沿用電子報的 SMTP Secrets（SMTP_HOST／SMTP_PORT／SMTP_USER／SMTP_PASS／MAIL_FROM），
              收件人 PILOTONE_NOTIFY_EMAIL（預設 allenchen1113.official@gmail.com）
     - LINE：LINE Messaging API push（LINE_CHANNEL_TOKEN＋LINE_USER_ID）
   未設定的管道自動略過；寄送失敗只發警告，不影響發文。SOCIAL_DRY_RUN=1 時只印出內容。
   （Claude 推播由 Mac mini 上的發文排程在送審後發出，不在這裡。）
   ===================================================================== */
import { existsSync, readFileSync } from "node:fs";
import { reviewItems, buildReviewMessage, lineText } from "./notify-core.mjs";
import { createSmtpMailer } from "../mail/adapters.mjs";

const env = (n) => (process.env[n] || "").trim();

async function main() {
  const path = process.argv[2];
  if (!path || !existsSync(path)) { console.log("審核通知：本輪沒有匯入結果，略過。"); return; }
  const items = reviewItems(JSON.parse(readFileSync(path, "utf8")));
  const msg = buildReviewMessage(items);
  if (!msg) { console.log("審核通知：本輪沒有新的待審貼文。"); return; }
  if (env("SOCIAL_DRY_RUN") === "1") { console.log(`審核通知 DRY-RUN：\n主旨：${msg.subject}\n${msg.text}`); return; }

  const sent = [];
  if (env("SMTP_HOST") && env("SMTP_USER")) {
    try {
      await createSmtpMailer().send({ to: env("PILOTONE_NOTIFY_EMAIL") || "allenchen1113.official@gmail.com", subject: msg.subject, html: msg.html, text: msg.text });
      sent.push("Email");
    } catch (e) { console.log(`::warning::審核通知 Email 寄送失敗：${e.message}`); }
  } else console.log("審核通知：未設定 SMTP Secrets，略過 Email。");

  if (env("LINE_CHANNEL_TOKEN") && env("LINE_USER_ID")) {
    try {
      const r = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env("LINE_CHANNEL_TOKEN")}` },
        body: JSON.stringify({ to: env("LINE_USER_ID"), messages: [{ type: "text", text: lineText(msg) }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      sent.push("LINE");
    } catch (e) { console.log(`::warning::審核通知 LINE 推送失敗：${e.message}`); }
  } else console.log("審核通知：未設定 LINE_CHANNEL_TOKEN／LINE_USER_ID，略過 LINE。");

  console.log(`審核通知：${items.length} 則待審，已送出 ${sent.length ? sent.join("＋") : "（無管道）"}`);
}

main().catch((e) => { console.log(`::warning::審核通知失敗：${(e && e.message) || e}`); });
