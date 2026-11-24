/* =====================================================================
   PilotOne 審核通知（純邏輯）：素材匯入建立／更新了待審草稿時，組出 Email 與 LINE 訊息。
   實際寄送在 notify-review.mjs。
   ===================================================================== */
import { topicInfo } from "./ingest-core.mjs";

export const REVIEW_URL = "https://allenchen1113official.github.io/AllenI3Aurora/admin/pilotone/#review";
const CH_LABEL = { fb: "FB", ig: "IG", th: "Threads", pc: "Podcast" };

/* 匯入結果 → 需要人工審核的項目（新建或重產、且非自動發布） */
export function reviewItems(results) {
  return (results || []).filter((r) => r && (r.status === "created" || r.status === "updated") && !r.auto);
}

const slash = (ymd) => (/^\d{8}$/.test(ymd || "") ? `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}` : ymd || "");
const label = (r) => (topicInfo(r.topic) && topicInfo(r.topic).label) || r.topic;
const chans = (r) => (Array.isArray(r.channels) && r.channels.length ? r.channels.map((c) => CH_LABEL[c] || c).join("＋") : "FB＋IG＋Threads");

export function buildReviewMessage(items, { url = REVIEW_URL } = {}) {
  if (!items.length) return null;
  const lines = items.map((r) => `・${label(r)} ${slash(r.date)}｜${chans(r)}${r.status === "updated" ? "（素材已重產）" : ""}${r.title ? `\n  ${r.title}` : ""}`);
  const head = `PilotOne 有 ${items.length} 則貼文待審核`;
  const text = `【${head}】\n${lines.join("\n")}\n\n請到 PilotOne 審核：核准後由官方 API 發布到 FB 粉專「艾倫報報」／Instagram／Threads。\n${url}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = items.map((r) =>
    `<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;font-weight:700;color:#12332B">${esc(label(r))}</td>` +
    `<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;color:#2F6152">${esc(slash(r.date))}</td>` +
    `<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;color:#2F6152">${esc(chans(r))}${r.status === "updated" ? "（重產）" : ""}</td>` +
    `<td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;color:#12332B">${esc(r.title || "")}</td></tr>`).join("");
  const html =
    `<div style="font-family:Arial,'Noto Sans TC',sans-serif;background:#DEE7E2;padding:24px">` +
    `<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">` +
    `<div style="font-size:12px;letter-spacing:.12em;color:#2F6152;font-weight:700">PILOTONE · 艾倫報報 ALLEN I³ AURORA</div>` +
    `<h2 style="margin:8px 0 16px;color:#12332B;font-size:20px">${esc(head)}</h2>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>` +
    `<p style="color:#2F6152;font-size:13px;line-height:1.6;margin:16px 0">核准後由官方 API 發布到 FB 粉專「艾倫報報」／Instagram／Threads；未核准的貼文不會發出，也不會過期。</p>` +
    `<a href="${esc(url)}" style="display:inline-block;background:#12332B;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">前往 PilotOne 審核</a>` +
    `</div></div>`;
  return { subject: `［PilotOne 待審核］${items.map((r) => `${label(r)} ${slash(r.date)}`).join("、")}`.slice(0, 180), text, html };
}

/* LINE 文字訊息上限 5,000 字元 */
export const lineText = (msg) => (msg.text.length > 4900 ? msg.text.slice(0, 4890) + "…" : msg.text);
