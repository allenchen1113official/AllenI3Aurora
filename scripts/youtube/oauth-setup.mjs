/* =====================================================================
   取得 YouTube／Drive 的 OAuth refresh token（在自己的電腦上執行一次）

   用法：
     YT_CLIENT_ID=xxx YT_CLIENT_SECRET=yyy node scripts/youtube/oauth-setup.mjs
   1. 瀏覽器開啟印出的網址，用「官方管理者帳號」（擁有頻道與 Drive 成片的那個）登入並同意。
      ⚠ 請確認右上角是官方帳號，不是個人帳號——登錯帳號拿到的 token 會上傳到錯的頻道。
   2. 同意後瀏覽器導回 http://127.0.0.1:53682/，終端機印出 refresh token。
   3. 貼到 GitHub → Settings → Secrets → Actions：YT_REFRESH_TOKEN（另存 YT_CLIENT_ID、YT_CLIENT_SECRET）。

   前置：Google Cloud Console 建立「電腦版應用程式（Desktop app）」OAuth 用戶端，
   並把 OAuth 同意畫面發布為「正式版（In production）」——停在「測試中」的話 refresh token 7 天就失效。
   ===================================================================== */
import { createServer } from "node:http";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",     // 上傳影片、設定縮圖
  "https://www.googleapis.com/auth/youtube.force-ssl",  // 讀頻道（含私人影片）、更新文案／公開設定、上傳字幕
  "https://www.googleapis.com/auth/drive.readonly",     // 從 Drive 讀成片與縮圖
];
const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/`;
const id = process.env.YT_CLIENT_ID, secret = process.env.YT_CLIENT_SECRET;
if (!id || !secret) { console.error("請先設定環境變數 YT_CLIENT_ID 與 YT_CLIENT_SECRET"); process.exit(1); }

const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: id, redirect_uri: REDIRECT, response_type: "code", scope: SCOPES.join(" "),
  access_type: "offline", prompt: "consent", include_granted_scopes: "true",
});
console.log("\n請用瀏覽器開啟（以官方管理者帳號登入）：\n\n" + url + "\n");

const server = createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get("code");
  if (!code) { res.end(u.searchParams.get("error") || "等待授權…"); return; }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const d = await r.json();
    if (!d.refresh_token) throw new Error(JSON.stringify(d));
    // 順便確認授權的是哪個頻道，避免登錯帳號
    const ch = await (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: "Bearer " + d.access_token } })).json();
    const name = ch.items && ch.items[0] ? `${ch.items[0].snippet.title}（${ch.items[0].id}）` : "（此帳號沒有 YouTube 頻道！）";
    res.end("完成，可以關閉此頁回到終端機。");
    console.log("授權頻道：" + name);
    console.log("取得的 scope：" + d.scope);
    console.log("\nYT_REFRESH_TOKEN =\n" + d.refresh_token + "\n");
  } catch (e) {
    res.end("失敗：" + e.message); console.error("換發失敗：", e.message);
  }
  server.close();
});
server.listen(PORT, "127.0.0.1");
