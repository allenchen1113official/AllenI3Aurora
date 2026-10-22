/* =====================================================================
   電子報信件版型（伺服器端共用）
   ---------------------------------------------------------------------
   暗色極光風格，全部行內樣式。郵件客戶端不支援 <style> 與 CSS 變數，
   所以這裡是 tokens/colors.css 的硬編對應值 —— 改品牌色時兩邊要一起改。

   Outlook 桌面版用 Word 排版引擎：不支援 linear-gradient 與 rgba()。
   若只寫 background:gradient，它會「沒有背景」—— 深色文字落在深色卡片上，
   「確認訂閱」按鈕直接消失。因此一律：實色打底（background-color，Outlook 讀這個）
   ＋ background-image 疊加漸層（現代客戶端讀這個），並輔以 bgcolor 屬性。
   ===================================================================== */

export const SITE = "https://allenchen1113official.github.io/AllenI3Aurora/";

export const C = {
  bg: "#0B1020",        // --night-900
  card: "#121933",      // --night-800
  line: "#232B47",      // 實色，取代 rgba(255,255,255,.09)
  wash: "#1A2141",      // Callout 底色
  hair: "#1C2340",      // 表格分隔線
  text1: "#F4F7FF",
  text2: "#B9C2DC",
  text4: "#6F7A99",
  link: "#8FA0C4",
  insight: "#3DDC97",
  intelligence: "#7C3AED",
  illumination: "#F0B429",
  up: "#E23B3B",        // 台股慣例 紅漲
  down: "#28A56C",      //           綠跌
  auroraSolid: "#3DDC97",
  aurora: "linear-gradient(120deg,#3DDC97,#2DD4BF,#4F7BF0,#7C3AED)",
  ctaSolid: "#3DDC97",
  cta: "linear-gradient(120deg,#3DDC97,#4F7BF0)",
  onAccent: "#06111F",
};

export const FONT = "'Nunito','Noto Sans TC',Arial,sans-serif";
export const FONT_BODY = "'Noto Sans TC',Arial,sans-serif";

/** 同時相容 Outlook 與現代客戶端的背景樣式。 */
export const bgFallback = (solid, gradient) =>
  `background-color:${solid};background-image:${gradient};`;

export const confirmUrl = (t) => SITE + "confirm.html?t=" + encodeURIComponent(t);
export const manageUrl = (t) => SITE + "manage.html?t=" + encodeURIComponent(t);
export const issueUrl = (no) => SITE + "?issue=" + encodeURIComponent(no);
export const privacyUrl = SITE + "privacy.html";

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function cadenceLabel(c) {
  const o = c || {}, out = [];
  if (o.day) out.push("日報");
  if (o.week) out.push("週報");
  if (o.month) out.push("月報");
  return out.length ? out.join("、") : "（未選擇）";
}

/**
 * 信件外框：品牌標頭 + 主標 + 前言 + （可選）CTA + 主體 + 頁尾。
 * @param {object} o
 * @param {string}  o.preheader   收件匣預覽文字
 * @param {string}  o.heading     主標（純文字）
 * @param {string}  [o.lead]      前言（允許 HTML）
 * @param {string}  [o.ctaUrl]    行動按鈕連結
 * @param {string}  [o.ctaText]   行動按鈕文字
 * @param {string}  [o.body]      主體（允許 HTML）
 * @param {string}  [o.footerNote] 頁尾第一行說明
 * @param {string}  [o.manage]    管理／退訂連結；有值才顯示退訂區
 */
export function shell(o) {
  const { preheader, heading, lead, ctaUrl, ctaText, body, footerNote, manage } = o;
  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<!--[if mso]><style>body,table,td,a{font-family:Arial,sans-serif !important;}</style><![endif]--></head>
<body bgcolor="${C.bg}" style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="max-width:600px;background-color:${C.card};border:1px solid ${C.line};border-radius:20px;">
    <tr><td style="padding:34px 34px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td bgcolor="${C.auroraSolid}" style="width:40px;height:40px;${bgFallback(C.auroraSolid, C.aurora)}border-radius:12px;text-align:center;vertical-align:middle;color:${C.onAccent};font-family:${FONT};font-weight:900;font-size:16px;">I³</td>
        <td style="padding-left:11px;font-family:${FONT};font-weight:900;font-size:19px;color:${C.text1};">艾倫報報</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 34px 0;font-family:${FONT};font-weight:900;font-size:24px;line-height:1.3;color:${C.text1};">${esc(heading)}</td></tr>
    ${lead ? `<tr><td style="padding:14px 34px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.75;color:${C.text2};">${lead}</td></tr>` : ""}
    ${ctaUrl ? `<tr><td style="padding:26px 34px 0;">
      <a href="${esc(ctaUrl)}" style="display:inline-block;${bgFallback(C.ctaSolid, C.cta)}color:${C.onAccent};text-decoration:none;font-family:${FONT};font-weight:800;font-size:15px;padding:14px 26px;border-radius:12px;mso-padding-alt:0;">${esc(ctaText)}</a>
    </td></tr>
    <tr><td style="padding:14px 34px 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.text4};word-break:break-all;">按鈕沒反應？把這段網址貼到瀏覽器：<br>${esc(ctaUrl)}</td></tr>` : ""}
    ${body ? `<tr><td style="padding:24px 34px 0;font-family:${FONT_BODY};font-size:14.5px;line-height:1.75;color:${C.text2};">${body}</td></tr>` : ""}
    <tr><td style="padding:28px 34px 30px;">
      <div style="border-top:1px solid ${C.line};padding-top:18px;font-family:${FONT_BODY};font-size:12px;line-height:1.7;color:${C.text4};">
        ${footerNote ? esc(footerNote) + "<br>" : ""}
        洞察世界．累積智慧．點亮未來。<br>
        ${manage ? `<a href="${esc(manage)}" style="color:${C.link};">管理訂閱</a> · <a href="${esc(manage)}" style="color:${C.link};">退訂</a> · ` : ""}<a href="${esc(privacyUrl)}" style="color:${C.link};">隱私權政策</a> · <a href="${esc(SITE)}" style="color:${C.link};">艾倫報報</a>
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/* ---------- 交易性信件 ---------- */

export function confirmMail(rec) {
  const url = confirmUrl(rec.token);
  return {
    subject: "請確認你的艾倫報報訂閱",
    html: shell({
      preheader: "只要一個點擊，訂閱就完成了。",
      heading: "還差一步，訂閱就完成了",
      lead: "謝謝你願意讓艾倫報報進到你的信箱。<br>為了確認這個地址真的是你的，請點下面的按鈕完成啟用。",
      ctaText: "確認訂閱",
      ctaUrl: url,
      body: `你選擇的節奏：<strong style="color:${C.text1};">${esc(cadenceLabel(rec.cadence))}</strong>（之後隨時可以調整）。<br>如果這不是你本人的操作，忽略這封信即可，我們不會再寄信給你。`,
      footerNote: "這封信寄給 " + rec.email,
      manage: null,
    }),
    text: [
      "還差一步，訂閱就完成了。", "",
      "請點擊以下連結，啟用你的艾倫報報訂閱：", url, "",
      "你選擇的節奏：" + cadenceLabel(rec.cadence),
      "如果這不是你本人的操作，忽略這封信即可。", "",
      "艾倫報報 " + SITE,
    ].join("\n"),
  };
}

export function welcomeMail(rec) {
  const mg = manageUrl(rec.token);
  return {
    subject: "歡迎加入艾倫報報 ✨",
    html: shell({
      preheader: "訂閱已啟用，下一期就會送到你信箱。",
      heading: "訂閱已啟用，歡迎你",
      lead: "我是 Allen。艾倫報報是我把每天散落的觀察——理財、工作、研究與生活——收斂成值得你花時間閱讀的東西。",
      ctaText: "看看最新一期",
      ctaUrl: SITE,
      body: `你目前訂閱的節奏是 <strong style="color:${C.text1};">${esc(cadenceLabel(rec.cadence))}</strong>。<br>
覺得太多或太少？隨時到<a href="${esc(mg)}" style="color:${C.insight};">偏好中心</a>調整，或一鍵退訂，我不會介意。<br><br>
最後一件事：這封信可以直接回覆。讀者的回信是我寫下去最大的動力。`,
      footerNote: "這封信寄給 " + rec.email,
      manage: mg,
    }),
    text: [
      "訂閱已啟用，歡迎你。", "",
      "我是 Allen。艾倫報報把每天散落的觀察——理財、工作、研究與生活——收斂成值得你花時間閱讀的東西。", "",
      "你目前訂閱的節奏：" + cadenceLabel(rec.cadence),
      "調整節奏或退訂：" + mg, "",
      "這封信可以直接回覆，讀者的回信是我寫下去最大的動力。", "",
      "艾倫報報 " + SITE,
    ].join("\n"),
  };
}

export function duplicateMail(rec, existingToken) {
  const mg = manageUrl(existingToken);
  return {
    subject: "你已經在艾倫報報的訂閱名單上了",
    html: shell({
      preheader: "不用重複訂閱，這是你的管理連結。",
      heading: "你已經訂閱了",
      lead: "這個地址已經在名單上，所以不需要再訂閱一次 —— 也不會收到兩份。",
      ctaText: "管理我的訂閱",
      ctaUrl: mg,
      body: "想調整節奏或退訂，都在同一個頁面。",
      footerNote: "這封信寄給 " + rec.email,
      manage: mg,
    }),
    text: [
      "你已經在艾倫報報的訂閱名單上了，不需要重複訂閱。", "",
      "調整節奏或退訂：" + mg, "",
      "艾倫報報 " + SITE,
    ].join("\n"),
  };
}

/* ---------- 電子報本文：內文區塊 → 信件 HTML ----------
   對應後台 NL_BLOCKS 與前台 NewsletterIssue.jsx 的區塊型別。 */

function parseRows(rows) {
  if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch { rows = []; } }
  return Array.isArray(rows) ? rows : [];
}
const br = (s) => esc(s).replace(/\n/g, "<br>");

export function renderBlocks(blocks) {
  const out = [];
  for (const b of blocks || []) {
    const type = b && b.type;
    if (type === "rule") {
      out.push(`<div style="margin:30px 0 18px;border-top:1px solid ${C.line};padding-top:16px;font-family:${FONT};font-weight:800;font-size:11.5px;letter-spacing:.12em;color:${C.insight};">${esc(b.label || "")}</div>`);
    } else if (type === "h2") {
      out.push(`<h2 style="margin:26px 0 10px;font-family:${FONT};font-weight:900;font-size:19px;line-height:1.4;color:${C.text1};">${esc(b.text || "")}</h2>`);
    } else if (type === "lead") {
      out.push(`<p style="margin:0 0 15px;font-family:${FONT_BODY};font-size:15px;line-height:1.8;color:${C.text2};">${br(b.text || "")}</p>`);
    } else if (type === "callout") {
      const tone = { insight: C.insight, intelligence: C.intelligence, illumination: C.illumination }[b.tone] || C.insight;
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr>
        <td bgcolor="${C.wash}" style="border-left:3px solid ${tone};background-color:${C.wash};border-radius:0 12px 12px 0;padding:14px 18px;">
          ${b.title ? `<div style="font-family:${FONT};font-weight:800;font-size:14.5px;color:${C.text1};margin-bottom:5px;">${esc(b.title)}</div>` : ""}
          <div style="font-family:${FONT_BODY};font-size:14px;line-height:1.7;color:${C.text2};">${br(b.text || "")}</div>
        </td></tr></table>`);
    } else if (type === "quote") {
      out.push(`<blockquote style="margin:22px 0;padding:0 0 0 18px;border-left:3px solid ${C.intelligence};font-family:${FONT_BODY};font-size:16px;line-height:1.7;color:${C.text1};font-style:italic;">${br(b.text || "")}</blockquote>`);
    } else if (type === "note") {
      out.push(`<p style="margin:14px 0;font-family:${FONT_BODY};font-size:12px;line-height:1.7;color:${C.text4};">${br(b.text || "")}</p>`);
    } else if (type === "table") {
      const head = String(b.head || "").split(",").map((h) => h.trim()).filter(Boolean);
      const th = head.map((h) => `<th style="text-align:left;padding:8px 10px;font-family:${FONT};font-size:11.5px;font-weight:800;letter-spacing:.05em;color:${C.text4};border-bottom:1px solid ${C.line};">${esc(h)}</th>`).join("");
      const tr = parseRows(b.rows).map((r) => {
        const cells = Array.isArray(r) ? r : [];
        // 最後一欄若為布林：true 漲／false 跌（台股慣例 紅漲綠跌），用於著色數值欄
        const flag = typeof cells[cells.length - 1] === "boolean" ? cells[cells.length - 1] : null;
        const cols = flag === null ? cells : cells.slice(0, -1);
        return "<tr>" + cols.map((c, i) => {
          const color = flag !== null && i === cols.length - 1 ? (flag ? C.up : C.down) : (i === 0 ? C.text1 : C.text2);
          const mono = i > 0 ? "font-family:'Courier New',monospace;" : `font-family:${FONT_BODY};`;
          return `<td style="padding:9px 10px;${mono}font-size:13.5px;color:${color};border-bottom:1px solid ${C.hair};">${esc(c)}</td>`;
        }).join("") + "</tr>";
      }).join("");
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`);
      if (b.note) out.push(`<p style="margin:-8px 0 16px;font-family:${FONT_BODY};font-size:11.5px;color:${C.text4};">${esc(b.note)}</p>`);
    }
    // 未知型別：安靜略過，不讓整封信爆掉
  }
  return out.join("\n");
}

/** 純文字版：客戶端關閉 HTML 時的備援，也有助降低垃圾信評分。 */
export function renderText(issue, blocks, mgUrl) {
  const lines = [`艾倫報報 · ${issue.kind} 第 ${issue.no} 期`, issue.date || "", "", issue.title || "", ""];
  if (issue.subtitle) lines.push(issue.subtitle, "");
  for (const b of blocks || []) {
    if (b.type === "rule") lines.push("", "── " + (b.label || "") + " ──");
    else if (b.type === "h2") lines.push("", "【" + (b.text || "") + "】");
    else if (b.type === "lead" || b.type === "note") lines.push(b.text || "");
    else if (b.type === "callout") lines.push((b.title ? "▍" + b.title + "：" : "▍") + (b.text || ""));
    else if (b.type === "quote") {
      // 作者常常自己就打了引號，別再包一層變成「「…」」
      const q = String(b.text || "").trim();
      lines.push(/^[「『"'].*[」』"']$/.test(q) ? q : "「" + q + "」");
    } else if (b.type === "table") {
      lines.push(String(b.head || "").split(",").map((s) => s.trim()).join(" | "));
      for (const r of parseRows(b.rows)) {
        const cells = Array.isArray(r) ? r : [];
        const cols = typeof cells[cells.length - 1] === "boolean" ? cells.slice(0, -1) : cells;
        lines.push(cols.join(" | "));
      }
      if (b.note) lines.push(b.note);
    }
  }
  lines.push("", "線上閱讀：" + issueUrl(issue.no), "調整節奏或退訂：" + mgUrl, "", "艾倫報報 " + SITE);
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export function issueMail(issue, blocks, token) {
  const mg = manageUrl(token);
  const head = [issue.kind, "第 " + issue.no + " 期", issue.date].filter(Boolean).join(" · ");
  return {
    subject: `${issue.kind} 第 ${issue.no} 期｜${issue.title || "艾倫報報"}`,
    html: shell({
      preheader: issue.subtitle || issue.title || "本期艾倫報報已送達。",
      heading: issue.title || "艾倫報報",
      lead: `<span style="font-family:'Courier New',monospace;font-size:12.5px;color:${C.text4};letter-spacing:.04em;">${esc(head)}</span>`
        + (issue.subtitle ? `<br><br>${br(issue.subtitle)}` : ""),
      body: renderBlocks(blocks) +
        `<div style="margin-top:26px;"><a href="${esc(issueUrl(issue.no))}" style="color:${C.insight};font-family:${FONT};font-weight:800;font-size:14px;text-decoration:none;">在網站上閱讀本期 →</a></div>`,
      footerNote: "本期為 " + issue.kind + "。",
      manage: mg,
    }),
    text: renderText(issue, blocks, mg),
  };
}
