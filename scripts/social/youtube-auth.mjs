#!/usr/bin/env node
/* =====================================================================
   一次性：取得 YouTube Data API 的 OAuth refresh token（在本機執行）
   ---------------------------------------------------------------------
   前置：Google Cloud Console 建立 OAuth 2.0 用戶端（類型「桌面應用程式」），
         並啟用 YouTube Data API v3；詳見 docs/SOCIAL_SOP.md 二之三。
   用法：
     YT_CLIENT_ID=… YT_CLIENT_SECRET=… node scripts/social/youtube-auth.mjs
   流程：印出授權網址 → 瀏覽器登入「擁有頻道的 Google 帳號」並同意 →
         本機 http://127.0.0.1:8765 接到 code → 換 token → 印出 refresh token。
   注意：OAuth 同意畫面若仍為「測試」狀態，refresh token 7 天後失效；
         請在同意畫面把發布狀態改為「正式」（不需送審，scope 為敏感時僅自用亦可）。
   ===================================================================== */
import http from "node:http";
import { randomBytes } from "node:crypto";

const clientId = (process.env.YT_CLIENT_ID || "").trim();
const clientSecret = (process.env.YT_CLIENT_SECRET || "").trim();
if (!clientId || !clientSecret) { console.error("請設定環境變數 YT_CLIENT_ID 與 YT_CLIENT_SECRET。"); process.exit(1); }

const PORT = Number(process.env.PORT || 8765);
const REDIRECT = `http://127.0.0.1:${PORT}/`;
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const state = randomBytes(12).toString("hex");
const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: clientId, redirect_uri: REDIRECT, response_type: "code", scope: SCOPES.join(" "),
  access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== "/") { res.writeHead(404).end(); return; }
  const code = u.searchParams.get("code");
  if (u.searchParams.get("state") !== state || !code) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("授權失敗：" + (u.searchParams.get("error") || "缺少 code 或 state 不符"));
    return;
  }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: "authorization_code" }) });
    const data = await r.json();
    if (!r.ok || !data.refresh_token) throw new Error(data.error_description || data.error || `HTTP ${r.status}（若沒有 refresh_token，請到 myaccount.google.com/permissions 移除此 App 後重跑）`);
    const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${data.access_token}` } }).then((x) => x.json());
    const name = ch.items && ch.items[0] ? ch.items[0].snippet.title : "（此帳號沒有 YouTube 頻道！）";
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(`授權完成，頻道：${name}\n回到終端機複製 refresh token。`);
    console.log(`\n頻道：${name}\n\n請把下列值存入 GitHub Secrets：\n  YT_CLIENT_ID      = ${clientId}\n  YT_CLIENT_SECRET  = （你的 client secret）\n  YT_REFRESH_TOKEN  = ${data.refresh_token}\n`);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("換 token 失敗：" + e.message);
    console.error("換 token 失敗：", e.message);
  } finally {
    setTimeout(() => server.close(), 300);
  }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n1. 用瀏覽器開啟下列網址，登入擁有 YouTube 頻道的 Google 帳號並同意：\n\n${authUrl}\n\n2. 同意後會自動導回 ${REDIRECT}，本視窗會印出 refresh token。\n（等待中… Ctrl+C 取消）`);
});
