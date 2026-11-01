# YouTube 串接 SOP（頻道同步・統計卡・電子報影片區塊）

> 後台：**YouTube 頻道**（`admin/#youtube`，面板 `admin/youtube.jsx`）
> 程式：`scripts/youtube/`（純邏輯 `core.mjs`、唯讀 API 客戶端 `client.mjs`、入口 `sync-channel.mjs`、測試 `channel.test.mjs`）
> 排程：`youtube-sync.yml`（台北每日 06:23、18:23）
> **影片上傳／排程公開**：由 PilotOne 的 YouTube 頻道處理，設定見 `docs/SOCIAL_SOP.md` 二之三。
> 日期一律台北時間（UTC+8）。

## 0. 功能一覽

| 功能 | 怎麼運作 | 位置 |
|---|---|---|
| 頻道影片清單 | 讀 uploads 播放清單最新 50 支（觀看／按讚／留言／長度／Shorts／公開狀態） | `aurora_youtube/videos`、`data/youtube.json`、後台「影片」分頁 |
| 頻道統計 | 訂閱／總觀看／影片數；每個台北日一筆走勢（最多 90 天） | `aurora_youtube/channel`、`aurora_youtube/history`、後台「總覽」 |
| 首頁統計卡 | 「YouTube 訂閱」＋ 7 天增減與近 8 點走勢，與 TAIEX 等並列 | `aurora_stats/youtube_subscribers`（同步排程寫入，`sort` 預設 5，可在後台「統計數據」調整） |
| 發布到 YouTube | PilotOne 中控台勾 YouTube → 核准；Vlog 面板「▶ 建立 YouTube 上傳排程（PilotOne）」帶入文案 | `aurora_social_posts` 的 `yt` 欄位；後台「上傳（PilotOne）」分頁唯讀顯示進度 |
| 電子報影片區塊 | 電子報編輯器區塊「YouTube 影片」（可從頻道清單挑選），或「影片」分頁「＋ 加入電子報」 | 網站內嵌 youtube-nocookie；信件縮圖＋實色「▶ 在 YouTube 觀看」按鈕；純文字版附網址 |

## 1. 授權前檢查清單（全部自有）

- [ ] 以**官方管理者帳號** `allenchen1113.official@gmail.com` 操作 Google Cloud Console（不要用個人帳號，曾因登錯帳號被權限擋下）。
- [ ] 已有 Repo Secret `FIREBASE_SERVICE_ACCOUNT`（需「Cloud Datastore 使用者」角色，與 PilotOne 共用）。
- [ ] Firestore 規則已部署 **r12**（新增 `aurora_youtube`、`aurora_youtube_meta`）。

## 2. 認證（擇一；兩者都有時優先 OAuth）

### A. 沿用 PilotOne 的 OAuth（建議）
已依 `docs/SOCIAL_SOP.md` 二之三設好 `YT_CLIENT_ID`／`YT_CLIENT_SECRET`／`YT_REFRESH_TOKEN` 就不用再做什麼：其 scope 含 `youtube.readonly`，同步會以 `mine=true` 讀官方頻道，**連私人／排程中影片也看得到**（後台「影片」分頁會標示「排程」）。

### B. 只讀 API Key
1. Cloud Console → API 和服務 → 啟用 **YouTube Data API v3**。
2. 憑證 → 建立 API 金鑰 →「限制金鑰」只勾 YouTube Data API v3。
3. 頻道 ID：YouTube Studio → 設定 → 頻道 → 進階設定（`UC` 開頭）。
4. Secrets：`YT_API_KEY`、`YT_CHANNEL_ID`。只看得到公開影片。

### 首次執行
GitHub Actions →「YouTube 頻道同步」→ Run workflow → 勾 **dry_run** 先看 log（應印出頻道名稱、訂閱、影片數）→ 再不勾跑一次正式寫入。之後每日 06:23／18:23 自動執行；排程監控會檢查 `data/youtube.json` 新鮮度（逾 14 小時警告、38 小時異常）。

## 3. 日常操作

- **看頻道成績**：後台「YouTube 頻道 → 總覽」。首頁統計卡同步更新。
- **影片放進電子報**：「影片」分頁 →「＋ 加入電子報…」選期別（加到最後一個區塊，已發布的期別會先確認）；或在「電子報」編輯區塊選「YouTube 影片」從下拉挑選，再補一句導讀。
- **上傳 Vlog**：「Vlog 影片系列 → 檢查與發布」→「▶ 建立 YouTube 上傳排程（PilotOne）」→「PilotOne 中控台」YouTube 分頁填**可直接下載的影片網址**（Drive 用 `drive.usercontent.google.com/download?id=…&export=download&confirm=t`）→ 選時間核准。進度可在「YouTube 頻道 → 上傳（PilotOne）」查看。

## 4. 錯誤對照

| 訊息 | 原因 | 處理 |
|---|---|---|
| `invalid_grant` | refresh token 被撤銷，或 OAuth 同意畫面仍在「測試中」（7 天失效） | 同意畫面改正式版 → 依 SOCIAL_SOP 重跑 `youtube-auth.mjs` 更新 `YT_REFRESH_TOKEN` |
| 這個 Google 帳號底下沒有 YouTube 頻道 | 授權時登入個人帳號 | 用官方管理者帳號重新授權 |
| 找不到頻道 `UC…` | `YT_CHANNEL_ID` 填錯 | 依第 2B 節重新複製 |
| `quotaExceeded` | 當日配額用完（與 PilotOne 上傳共用 10,000 單位） | 不用處理，下次排程自動恢復；同步一次僅數個單位 |
| 統計卡顯示「隱藏」 | 頻道設定隱藏訂閱數 | YouTube Studio → 設定 → 頻道 → 進階設定 |

## 5. 驗證（部署 SOP）

1. `node --test scripts/youtube/channel.test.mjs scripts/mail/mail.test.mjs scripts/mail/rules-shape.test.mjs scripts/monitor/monitor.test.mjs`
2. Rules Playground（規則 r12）：
   - 未登入 `get aurora_youtube/channel` → **允許**（前台與後台都讀得到）
   - 未登入 `create aurora_youtube/channel` → **拒絕**（只有排程器以 Admin SDK 寫）
   - 未登入 `get aurora_youtube_meta/sync` → **拒絕**；管理者 → 允許
3. 電子報：在草稿期別加一個 YouTube 區塊 → `newsletter-send.yml` 以 `dry_run`＋`test_to` 寄給自己，確認信件有縮圖與按鈕、純文字版有網址。

## 6. 本次一併修正
`scripts/mail/template.mjs` 原本只認區塊的 `b.type`，但後台與前台存的是 `b.t`，**正式寄出的電子報內文區塊會被整段略過**（只剩標題與「在網站上閱讀」連結）。已改為 `b.t || b.type`，並加測試鎖住。
