# YouTube 串接 SOP（頻道同步・上傳排程・電子報影片區塊）

> 後台：**YouTube 頻道**（`admin/#youtube`，面板 `admin/youtube.jsx`）
> 程式：`scripts/youtube/`（純邏輯 `core.mjs`、API 客戶端 `client.mjs`、測試 `youtube.test.mjs`）
> 排程：`youtube-sync.yml`（台北 06:23／18:23）、`youtube-upload.yml`（每 15 分鐘）
> 日期一律台北時間（UTC+8）。

## 0. 功能一覽

| 功能 | 怎麼運作 | 需要的認證 |
|---|---|---|
| 頻道影片清單 | `youtube-sync` 讀 uploads 播放清單最新 50 支 → `aurora_youtube/videos`、`data/youtube.json` | API Key 或 OAuth |
| 頻道統計 | 訂閱／觀看／影片數 → `aurora_youtube/channel`、每日走勢 `aurora_youtube/history`；首頁統計卡 `aurora_stats/youtube_subscribers`（與 TAIEX 並列） | API Key 或 OAuth |
| 發布到 YouTube | 後台「上傳排程」核准 → `youtube-upload` 從 Drive 下載成片 → 分段上傳（可續傳）→ 縮圖＋字幕 → 依公開時間交給 YouTube `publishAt` | **OAuth** |
| 電子報影片區塊 | 電子報編輯器新增「YouTube 影片」區塊（可從頻道清單挑選）；網站內嵌播放器、信件顯示縮圖＋觀看按鈕 | 無 |

## 1. 授權前檢查清單（全部自有，無第三方權限）

- [ ] 用**官方管理者帳號** `allenchen1113.official@gmail.com` 登入 Google Cloud Console（與 Firebase 同一個專案即可）。
- [ ] 確認頻道與 Drive「2026冰島旅行／YouTube製作包」都在這個帳號底下。
- [ ] 已有 Repo Secret `FIREBASE_SERVICE_ACCOUNT`（與 PilotOne 共用，需「Cloud Datastore 使用者」角色）。

## 2. 只讀：API Key（頻道清單＋統計）

1. Cloud Console → API 和服務 → 程式庫 → 啟用 **YouTube Data API v3**。
2. 憑證 → 建立憑證 → API 金鑰 → 「限制金鑰」只勾 YouTube Data API v3。
3. 頻道 ID：YouTube Studio → 設定 → 頻道 → 進階設定（`UC` 開頭）。
4. GitHub → Settings → Secrets and variables → Actions：`YT_API_KEY`、`YT_CHANNEL_ID`。
5. GitHub Actions →「YouTube 頻道同步」→ Run workflow（先勾 dry_run 看輸出，再正式跑一次）。

## 3. 完整：OAuth（上傳排程，同時讓同步看得到私人／排程中影片）

1. 啟用 **YouTube Data API v3** 與 **Google Drive API**。
2. OAuth 同意畫面：使用者類型「外部」→ 加入 scope `youtube.upload`、`youtube.force-ssl`、`drive.readonly`。
   **發布狀態一定要按「發布應用程式」改為正式版（In production）**——停在「測試中」時 refresh token **7 天就失效**。未經 Google 驗證會出現警告頁，自己授權時按「進階 → 繼續」即可。
3. 憑證 → 建立 OAuth 用戶端 ID →「電腦版應用程式」→ 取得 Client ID／Secret。
4. 在自己電腦取得 refresh token：
   ```bash
   YT_CLIENT_ID=xxx YT_CLIENT_SECRET=yyy node scripts/youtube/oauth-setup.mjs
   ```
   瀏覽器以**官方管理者帳號**同意後，終端機會印出「授權頻道」與 token。**先確認授權頻道名稱正確**（曾發生登入錯帳號被擋的情況）。
5. Secrets：`YT_CLIENT_ID`、`YT_CLIENT_SECRET`、`YT_REFRESH_TOKEN`。

### ⚠ 未通過 YouTube API 稽核的限制
未經 YouTube「API 服務稽核」的 Cloud 專案，用 API 上傳的影片**一律被鎖為私人**（上傳會成功並拿到影片 ID，但別人看不到）。排程器偵測到時會在工作上標示 ⚠ 警告。兩種做法：
- **短期**：讓排程器上傳＋設好縮圖、字幕、文案，再到 YouTube Studio 手動改公開（工作仍節省大部分人工）。
- **長期**：到 Google 申請 YouTube API Services Audit（說明用途：個人頻道自動排程上傳），通過後即可由 API 直接公開／排程公開。

### 配額
預設每日 10,000 單位、每日上傳上限約 100 支；各方法的單位成本以 Cloud Console「配額」頁為準。用完時工作顯示「配額已用完，明天自動續行」，不計入失敗次數。

## 4. 日常操作

### 上傳一集 Vlog
1. 「Vlog 影片系列」→ 該集 →「檢查與發布」→ **▶ 排入 YouTube 上傳**（以目前文案、Drive 檔名、字幕建立草稿）。
2. 「YouTube 頻道 → 上傳排程」→ 編輯／核准 → 選**公開時間（台北）**→「✓ 核准排程上傳」；或「立即上傳並公開」。
   - 公開時間在 15 分鐘後：上傳時先設私人，由 YouTube 在該時間自動公開（分鐘級準時）。
   - 15 分鐘內或立即：上傳完成後依「公開狀態」發布。
3. 排程器每 15 分鐘一輪、每輪一支；畫面每 30 秒更新進度。完成後自動回填 Vlog 的影片 ID 與「已上傳」勾選，**真正公開後**才把 Vlog 標記為已發布（公開頁 `vlog.html` 才會出現）。

### 狀態與處理
| 狀態 | 意義 | 可做的事 |
|---|---|---|
| 草稿 | 未交給排程器 | 編輯、核准、刪除 |
| 已核准・待上傳 | 下一輪開始上傳 | 撤銷（直接退回草稿） |
| 上傳中 | 分段上傳，中斷會從斷點續傳 | 撤銷 |
| YouTube 處理中 | 上傳完成，等 YouTube 轉檔 | 撤銷 |
| 已排程公開 | 交給 YouTube `publishAt` | 撤銷（影片改私人、取消排程，不刪影片） |
| 已完成 | 已發布（或被鎖為私人，見 ⚠） | 檢視／重新核准（只更新文案與公開設定，**不會重新上傳**） |
| 失敗 | 不可重試的錯誤或逾期 | 依錯誤修正後「重試」 |

**不會重複上傳的保證**：上傳 session 網址存在工作上；中斷後先向 YouTube 查詢已收到多少位元組再續傳，若最後一段其實已送達，查詢會直接取得影片。已有影片 ID 的工作再核准只改文案。

### 影片加入電子報
- 「YouTube 頻道 → 影片」每支影片右側「＋ 加入電子報…」選期別 → 加到該期最後一個區塊。
- 或在「電子報」編輯器新增區塊「YouTube 影片」→ 從下拉選單挑選，或貼網址。
- 網站：內嵌 youtube-nocookie 播放器；信件：縮圖連到影片＋紅色「▶ 在 YouTube 觀看」按鈕（實色、無漸層，Outlook 相容）；純文字版附網址。

## 5. 錯誤代碼對照

| 訊息／reason | 原因 | 處理 |
|---|---|---|
| `invalid_grant` | refresh token 被撤銷、過期（同意畫面仍在測試中＝7 天）、或改了密碼 | 確認同意畫面為正式版 → 重跑 `oauth-setup.mjs` 更新 `YT_REFRESH_TOKEN` |
| `insufficientPermissions` | 授權時沒勾到某個 scope | 重跑 `oauth-setup.mjs`（排程器 log 會列出缺少的 scope） |
| `youtubeSignupRequired` | 授權的帳號沒有頻道 | 用官方管理者帳號重新授權 |
| `quotaExceeded`／`uploadLimitExceeded` | 當日配額或上傳數用完 | 不用處理，隔天自動續行 |
| Drive 找不到資料夾／檔案 | 路徑或檔名不符、檔案不在授權帳號的 Drive | 修正「資料夾路徑」「成片檔名」或直接貼 Drive 檔案網址後重試 |
| 縮圖：`forbidden` | 頻道未完成電話驗證，不能用自訂縮圖 | YouTube Studio 完成驗證；縮圖失敗不影響上傳 |
| 已完成但 ⚠ 被鎖為私人 | 專案未通過 API 稽核 | 見第 3 節 |
| 預定時間已逾期超過 24 小時 | 排程器停擺多時，避免發過時內容 | 重設公開時間再核准 |

## 6. 金鑰輪替
- API Key：Cloud Console 建新金鑰 → 更新 `YT_API_KEY` → 刪舊金鑰。
- OAuth：Google 帳戶 → 安全性 → 第三方存取權 移除舊授權 → 重跑 `oauth-setup.mjs` → 更新 `YT_REFRESH_TOKEN`。Client Secret 外洩時在 Cloud Console 重設並同步更新 `YT_CLIENT_SECRET`。

## 7. 驗證（部署 SOP）
1. `node --test scripts/youtube/youtube.test.mjs scripts/mail/mail.test.mjs scripts/mail/rules-shape.test.mjs scripts/monitor/monitor.test.mjs`
2. Firestore 規則 r12 部署後，Rules Playground 驗證：
   - 未登入 `get aurora_youtube/channel` → **允許**（前台公開資料）
   - 未登入 `write aurora_youtube/channel` → **拒絕**（只有排程器寫）
   - 未登入 `list aurora_youtube_uploads` → **拒絕**（上傳工作不公開，這條最容易無聲出錯）
   - 管理者 `create aurora_youtube_uploads/x` → **允許**
3. 手動跑「YouTube 頻道同步」dry_run → 正式；「YouTube 上傳排程」先用一支短片、公開狀態「私人」測一輪。
