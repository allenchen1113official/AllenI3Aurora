/* =====================================================================
   電子報寄送核心（純邏輯，無 I/O）
   ---------------------------------------------------------------------
   比照 scripts/social/core.mjs：所有 Firestore／SMTP 存取都透過注入的
   store / mailer 介面，這裡只做決策，因此可用 node --test 完整驗證。

   資料模型 aurora_subscribers/{token}
     token 為 32 字元亂數 doc id，同時是讀者的自助憑證（信中連結 ?t=token）。
     status     pending | confirmed | unsubscribed | duplicate
     cadence    { day, week, month } 布林
     mailState  need_confirm | need_welcome | idle | failed   ← 單欄位查詢佇列
     consent, source, createdAt, updatedAt, confirmedAt, unsubscribedAt,
     confirmSentAt, welcomeSentAt, retries, lastError, note

   舊資料（PR #69）以 email 為 doc id、status 為 active；
   migrateLegacy() 會把它們搬成 token 文件並視為已確認（讀者當時已在表單同意）。
   ===================================================================== */

import { confirmMail, welcomeMail, duplicateMail, issueMail, manageUrl } from "./template.mjs";

export const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
export const MAX_RETRIES = 3;
export const BATCH = 50;
export const MAX_PER_RUN = 200;
export const SEND_INTERVAL_MS = 400;

export const KIND_CADENCE = { "日報": "day", "週報": "week", "月報": "month" }; // 特刊 → 全體

export const normalizeCadence = (c) => {
  const o = c || {};
  return { day: !!o.day, week: !!o.week, month: !!o.month };
};
export const anyCadence = (c) => { const n = normalizeCadence(c); return n.day || n.week || n.month; };
export const isLegacyId = (id) => typeof id === "string" && id.includes("@");

const unsubHeaders = (token) => ({
  "List-Unsubscribe": `<${manageUrl(token)}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

/* ---------------------------------------------------------------------
   舊資料搬遷：email 為 id → token 為 id。冪等：同 email 已有 token 文件就只刪舊的。
   --------------------------------------------------------------------- */
export async function migrateLegacy({ store, now = () => new Date().toISOString() }) {
  const all = await store.listAll();
  const legacy = all.filter((r) => isLegacyId(r.token));
  const byEmail = new Map();
  for (const r of all) if (!isLegacyId(r.token) && r.email) byEmail.set(r.email, r);

  let migrated = 0, merged = 0;
  for (const old of legacy) {
    const email = String(old.email || old.token).trim().toLowerCase();
    if (!byEmail.has(email)) {
      const token = store.newToken();
      const ts = now();
      const status = old.status === "unsubscribed" ? "unsubscribed" : "confirmed";
      const doc = {
        email,
        status,
        cadence: normalizeCadence(old.cadence || old.topics),
        mailState: "idle",
        consent: old.consent !== false,
        source: "web-legacy",
        locale: "zh-Hant",
        createdAt: old.createdAt || ts,
        updatedAt: ts,
        confirmedAt: old.createdAt || ts, // 當時已於表單同意，視為已確認
        note: [old.note, "自舊格式搬遷（原 doc id 為 email）"].filter(Boolean).join("；"),
      };
      if (status === "unsubscribed") doc.unsubscribedAt = old.updatedAt || ts;
      if (!anyCadence(doc.cadence)) doc.cadence = { day: false, week: true, month: true };
      await store.set(token, doc);
      byEmail.set(email, { token, ...doc });
      migrated++;
    } else {
      merged++;
    }
    await store.delete(old.token);
  }
  return { scanned: all.length, legacy: legacy.length, migrated, merged };
}

/* ---------------------------------------------------------------------
   交易性信件：確認信／歡迎信佇列
   --------------------------------------------------------------------- */
export async function runTransactional({ store, mailer, now = () => new Date().toISOString(), nowMs = Date.now, dryRun = false, log = () => {} }) {
  let sent = 0, skipped = 0, failed = 0;

  // unsubToken：一鍵退訂表頭要指向「生效中」的那筆；重複訂閱通知的收件紀錄本身
  // 即將標為 duplicate，若表頭指向它，讀者按退訂會打到一筆死紀錄、什麼都不會發生。
  const deliver = async (rec, mail, { unsubToken }) => {
    const headers = unsubToken ? unsubHeaders(unsubToken) : {};
    if (dryRun) { log(`[dry-run] → ${rec.email} 「${mail.subject}」`); return; }
    await mailer.send({ to: rec.email, subject: mail.subject, html: mail.html, text: mail.text, headers });
  };
  const markFail = async (rec, e) => {
    const retries = Number(rec.retries || 0) + 1;
    failed++;
    log(`✗ ${rec.email}：${e.message}（第 ${retries} 次）`);
    await store.update(rec.token, {
      retries,
      lastError: String(e.message || e).slice(0, 300),
      mailState: retries >= MAX_RETRIES ? "failed" : rec.mailState,
      updatedAt: now(),
    });
  };

  /* 1. 確認信 */
  const pending = (await store.listByField("mailState", "need_confirm")).slice(0, BATCH);
  for (const rec of pending) {
    try {
      if (rec.confirmSentAt && nowMs() - Date.parse(rec.confirmSentAt) < RESEND_COOLDOWN_MS) { skipped++; continue; }
      // 同 email 已有生效中的訂閱 → 不再產生第二份，改寄「已在名單」通知
      const same = await store.listByField("email", rec.email);
      const live = same.find((d) => d.token !== rec.token && d.status === "confirmed");
      if (live) {
        await deliver(rec, duplicateMail(rec, live.token), { unsubToken: live.token });
        await store.update(rec.token, { status: "duplicate", mailState: "idle", updatedAt: now() });
        sent++; continue;
      }
      await deliver(rec, confirmMail(rec), { unsubToken: null });
      await store.update(rec.token, { mailState: "idle", confirmSentAt: now(), retries: 0, updatedAt: now() });
      sent++;
    } catch (e) { await markFail(rec, e); }
  }

  /* 2. 歡迎信 */
  const welcome = (await store.listByField("mailState", "need_welcome")).slice(0, BATCH);
  for (const rec of welcome) {
    try {
      if (rec.status !== "confirmed") { await store.update(rec.token, { mailState: "idle" }); skipped++; continue; }
      await deliver(rec, welcomeMail(rec), { unsubToken: rec.token });
      await store.update(rec.token, { mailState: "idle", welcomeSentAt: now(), retries: 0, updatedAt: now() });
      sent++;
    } catch (e) { await markFail(rec, e); }
  }

  return { sent, skipped, failed };
}

/* ---------------------------------------------------------------------
   電子報本文
   --------------------------------------------------------------------- */

/** 挑出要寄的那一期；草稿不寄、排程未到不寄。回傳 { issue } 或 { error }。 */
export function selectIssue(issues, kind, no, nowMs = Date.now()) {
  const list = (issues || []).filter((i) => i && i.kind === kind);
  if (!list.length) return { error: `找不到任何「${kind}」` };
  // 與前台 aurora-data.js 的 issueVisible 同一條規則：草稿不算、排程要到時間
  const visible = (i) => {
    const st = i.pubStatus || "published";
    if (st === "published") return true;
    if (st === "scheduled") { const t = Date.parse(i.publishAt || ""); return isFinite(t) && t <= nowMs; }
    return false;
  };
  const newest = (arr) => [...arr].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.no) - Number(a.no))[0];
  let issue;
  if (no) {
    issue = list.find((i) => String(i.no) === String(no));
    if (!issue) return { error: `找不到 ${kind} 第 ${no} 期` };
  } else {
    // 留空＝最新一期「可寄的」：草稿與未到時間的排程不算最新
    issue = newest(list.filter(visible));
    if (!issue) return { error: `「${kind}」沒有任何已發布的期別可寄` };
  }
  const st = issue.pubStatus || "published";
  if (st === "draft") return { error: `${kind} 第 ${issue.no} 期仍是草稿，請先在後台發布` };
  if (st === "scheduled" && !visible(issue)) return { error: `${kind} 第 ${issue.no} 期排程於 ${issue.publishAt || "?"} 發布，尚未到時間` };
  const blocks = Array.isArray(issue.blocks) ? issue.blocks : [];
  if (!blocks.length) return { error: `${kind} 第 ${issue.no} 期還沒有內文區塊` };
  return { issue, blocks };
}

/** 符合節奏的已確認讀者。特刊 → 全體。 */
export function targetsFor(subs, kind) {
  const key = KIND_CADENCE[kind] || null;
  return (subs || [])
    .filter((r) => r.status === "confirmed" && r.email)
    .filter((r) => (key ? !!normalizeCadence(r.cadence)[key] : true));
}

export async function runIssue({
  store, mailer, kind, no = "", testTo = "", dryRun = false,
  now = () => new Date().toISOString(), nowMs = Date.now, sleep = async () => {},
  maxPerRun = MAX_PER_RUN, log = () => {},
}) {
  const issues = await store.listIssuesByKind(kind);
  const picked = selectIssue(issues, kind, no, nowMs());
  if (picked.error) return { error: picked.error };
  const { issue, blocks } = picked;
  log(`本期：${kind} 第 ${issue.no} 期 · ${issue.date || "無日期"} · ${issue.title || "(無標題)"}（${blocks.length} 個區塊）`);

  const send = async (to, token) => {
    const mail = issueMail(issue, blocks, token);
    if (dryRun) { log(`  [dry-run] → ${to}　「${mail.subject}」`); return; }
    await mailer.send({ to, subject: mail.subject, html: mail.html, text: mail.text, headers: unsubHeaders(token) });
  };

  if (testTo) {
    await send(testTo, "TEST-TOKEN");
    log(`試寄完成 → ${testTo}（未寫入寄送紀錄）`);
    return { test: true, issue: { kind, no: issue.no } };
  }

  const targets = targetsFor(await store.listByField("status", "confirmed"), kind);
  const campaignId = `${kind}-${issue.no}`;
  const camp = (await store.getCampaign(campaignId)) || null;
  const already = new Set((camp && camp.sentTo) || []);
  const queue = targets.filter((r) => !already.has(r.email));
  log(`符合節奏：${targets.length} 人；已寄過 ${already.size} 人；本輪待寄 ${queue.length} 人`);
  if (!queue.length) return { done: true, sent: 0, remain: 0, targets: targets.length };

  const batch = queue.slice(0, maxPerRun);
  const sentNow = [], failures = [];
  for (const r of batch) {
    try { await send(r.email, r.token); sentNow.push(r.email); }
    catch (e) { failures.push({ email: r.email, error: String(e.message || e).slice(0, 200) }); log(`  ✗ ${r.email}：${e.message}`); }
    await sleep(SEND_INTERVAL_MS);
  }

  if (!dryRun) {
    const sentTo = [...already, ...sentNow];
    await store.setCampaign(campaignId, {
      campaignId, kind, no: String(issue.no), title: issue.title || "", date: issue.date || "",
      cadenceKey: KIND_CADENCE[kind] || "all",
      sentTo, sentCount: sentTo.length, targetCount: targets.length,
      failures: failures.slice(0, 50),
      startedAt: (camp && camp.startedAt) || now(),
      updatedAt: now(),
      finishedAt: sentTo.length >= targets.length ? now() : null,
    });
  }
  const remain = queue.length - batch.length;
  return { done: remain === 0, sent: sentNow.length, failed: failures.length, remain, targets: targets.length };
}
