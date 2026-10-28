# PilotOne · 社群自動發文 SOP（Facebook 粉專／Instagram／Threads）

**產品名：PilotOne（社群發文中控）** — 一次製作 · 一鍵起飛。品牌隸屬「艾倫報報 ALLEN I³ AURORA」，視覺沿用 Aurora tokens（夜空底＋極光漸層），標誌為 `assets/pilotone/pilotone-mark.svg`（極光航線環＋「1」）。

| 入口 | 網址 | 內容 |
|------|------|------|
| PilotOne 獨立管理頁 | https://allenchen1113official.github.io/AllenI3Aurora/admin/pilotone/ | 中控台（`#hub`）＋發文審核（`#review`）兩個面板，PilotOne 品牌殼 |
| 後台管理 | https://allenchen1113official.github.io/AllenI3Aurora/admin/ | 左側導覽「PilotOne 中控台」「PilotOne 審核」，與獨立頁共用同一份元件與 `aurora_social_posts` 佇列 |

兩個入口都用後台的管理者帳號登入（Firebase Auth，Email 需為 `OWNER_EMAIL`）；`admin/pilotone/index.html` 只是設定 `window.PILOTONE=true` 後載入同一份 `admin/admin.jsx`＋`admin/content-hub.jsx`，沒有另一套程式。文件中「後台『社群發文』」即 PilotOne 審核、「內容中控台」即 PilotOne 中控台。

後台審核 → GitHub Actions 排程器 → Meta Graph API。後台只負責內容與決策，Token 只存在 GitHub Secrets，前端完全碰不到。

```
電子報「Facebook / IG 貼文」分頁 ─┐
後台「社群發文 → 新增貼文」 ───────┴→ aurora_social_posts（draft，待審核）
                                        │ 你在後台編修、預覽、核准並設定時間
                                        ▼ queueState = pending
social-publish.yml（每 10 分鐘）── scripts/social/publish-social-posts.mjs
   ├─ 預定時間在 20 分鐘～29 天內 → 交給 Meta 原生排程（準時到分鐘）
   ├─ 已到期／20 分鐘內 → 立即發布
   ├─ 原生排程到期 → 對帳，標記已發布並取回貼文連結
   ├─ 取消請求 → 刪除 Meta 端排程貼文，退回待審核
   └─ Instagram／Threads（無原生排程）→ 到期前 5 分鐘內：建立容器 → 確認 FINISHED → 發布
```

後台「內容中控台 → 建立內容」可一次勾選 FB／IG／Threads 並逐平台微調文字；三個平台各自獨立，某平台失敗或 Token 失效不影響其他平台。IG、Threads 都是選用：沒設定對應 Secrets 時，該平台的貼文會標記失敗並說明缺什麼，FB 照常運作。

## 一、事前授權清單

| # | 項目 | 誰可以做 | 狀態 |
|---|------|----------|------|
| 1 | 擁有「艾倫報報」Facebook 粉專的完整管理權 | 自己 | ☐ |
| 2 | 建立 Meta Business 帳號，並把粉專加入 | 自己 | ☐ |
| 3 | 在 developers.facebook.com 建立 App（類型：Business） | 自己 | ☐ |
| 4 | GCP 專案 `alleni3aurora` 的 IAM 權限（加授服務帳戶角色） | 自己 | ☐ |
| 5 | GitHub repo 的 Secrets 設定權 | 自己 | ☐ |

## 二、Meta 設定

1. **建立 App**：developers.facebook.com → 我的應用程式 → 建立 → 類型選「Business」，連結到你的 Business 帳號。
2. **建立系統使用者**：business.facebook.com → 設定 → 使用者 → 系統使用者 → 新增（角色：管理員）。
3. **指派資產**：在該系統使用者頁面 →「指派資產」→ 選粉專「艾倫報報」→ 開啟「管理粉絲專頁」的完整權限；同一頁也把第 1 步的 App 指派給它。
4. **產生 Token**：系統使用者 →「產生新權杖」→ 選第 1 步的 App，到期時間選「永不」，勾選權限：
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
5. **換成粉專 Token**：系統使用者 Token 不能直接代表粉專發文，要再換一次（在本機終端機執行，`<SYSTEM_USER_TOKEN>` 換成上一步的值）：
   ```bash
   curl -s "https://graph.facebook.com/v25.0/me/accounts?access_token=<SYSTEM_USER_TOKEN>"
   ```
   回傳的 `data[]` 中找到「艾倫報報」，記下它的 `id`（＝ **META_PAGE_ID**）與 `access_token`（＝ **META_PAGE_TOKEN**，由不會過期的系統使用者 Token 換得，同樣不會過期）。
6. **驗證**（不會發文）：
   ```bash
   curl -s "https://graph.facebook.com/v25.0/<META_PAGE_ID>?fields=id,name&access_token=<META_PAGE_TOKEN>"
   ```
   回傳粉專名稱即正確。

> 只發自己的粉專、且操作者是 App 的管理員時，App 維持「開發模式」即可，不需送審。

## 二之一、Instagram 設定（選用）

前提：IG 帳號已轉為**商業帳號**（或創作者帳號），並在 IG App「帳號中心」連結到「艾倫報報」粉專。

1. 第二節第 4 步產生 Token 時，額外勾選：`instagram_basic`、`instagram_content_publish`，並在「指派資產」把 IG 帳號也指派給系統使用者。重新產生後照第 5 步換出新的粉專 Token，更新 `META_PAGE_TOKEN`。
2. 取得 IG 商業帳號 ID（＝ **META_IG_USER_ID**）：
   ```bash
   curl -s "https://graph.facebook.com/v25.0/<META_PAGE_ID>?fields=instagram_business_account&access_token=<META_PAGE_TOKEN>"
   ```
3. 驗證（不會發文）：
   ```bash
   curl -s "https://graph.facebook.com/v25.0/<META_IG_USER_ID>?fields=id,username&access_token=<META_PAGE_TOKEN>"
   ```

限制：IG 貼文**必須有圖片**（公開 https 網址），文字上限 2,200 字、hashtag 最多 30 個。Meta 官方只保證支援 JPEG；PNG 若被拒，錯誤會顯示在內容庫。

## 二之二、Threads 設定（選用）

Threads 用的是獨立的 API 與 Token（不能沿用 Meta 粉專 Token）。

1. developers.facebook.com → 建立 App → 使用案例選「存取 Threads API」，權限勾 `threads_basic`、`threads_content_publish`。
2. 在 App 的「Threads 測試人員」加入自己的 Threads 帳號，並到 Threads App → 設定 → 帳號 → 網站權限 接受邀請。
3. 用 App 的「使用者權杖產生器」產生短效 Token，換成 60 天長效 Token：
   ```bash
   curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<APP_SECRET>&access_token=<SHORT_TOKEN>"
   ```
   回傳的 `access_token` ＝ **THREADS_TOKEN**。
4. 取得使用者 ID（＝ **THREADS_USER_ID**）：
   ```bash
   curl -s "https://graph.threads.net/v1.0/me?fields=id,username&access_token=<THREADS_TOKEN>"
   ```

**自動續期**：長效 Token 60 天到期。排程器每天自動續期一次，新 Token 存在 Firestore `aurora_social_secrets/threads`（安全規則禁止前端讀寫，只有排程器能存取），所以 Secret 不需要每 60 天手動更新。後台「平台連線」會顯示到期日，剩不到 7 天會警示。若手動更新了 `THREADS_TOKEN` Secret，排程器會自動改用新的那一把。

限制：文字上限 500 字；可附一張圖片。

## 三、服務帳戶加授 Firestore 權限

排程器沿用既有的 `FIREBASE_SERVICE_ACCOUNT`（原本只用來部署 Firestore 規則，只有「Firebase Rules Admin」角色）。需要再加一個角色才能讀寫貼文佇列：

GCP Console → IAM 與管理 → IAM → 找到該服務帳戶 → 編輯 → 新增角色 **Cloud Datastore 使用者**（`roles/datastore.user`）→ 儲存。

## 四、GitHub Secrets

Repo → Settings → Secrets and variables → Actions：

| 名稱 | 類型 | 內容 |
|------|------|------|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | 既有，不用動（但要完成第三節） |
| `META_PAGE_TOKEN` | Secret | 第二節第 5 步的粉專 `access_token` |
| `META_PAGE_ID` | Secret | 第二節第 5 步的粉專 `id` |
| `META_IG_USER_ID` | Secret（選用） | 第二之一節的 IG 商業帳號 ID |
| `THREADS_USER_ID` | Secret（選用） | 第二之二節的 Threads 使用者 ID |
| `THREADS_TOKEN` | Secret（選用） | 第二之二節的 Threads 長效 Token |
| `META_GRAPH_VERSION` | Variable（選用） | 預設 `v25.0`；Meta 淘汰舊版前改成新版即可 |

所有平台都未設定時，排程器只印警告並略過，不會讓 workflow 失敗。某平台 Token 失效時，只暫停該平台（貼文保持排程中），workflow 會失敗讓 GitHub 寄信通知。

## 五、首次上線驗證

1. Actions →「社群自動發文（Facebook）」→ Run workflow → 勾選 **dry_run** → 執行。log 應顯示 Token 正常與「本輪處理 0 筆」。
2. 後台「社群發文」頂端的排程器狀態會顯示最後執行時間與粉專名稱（dry_run 不寫入，所以要等下一輪正式執行，約 10 分鐘）。
3. 建一則測試貼文，排程到 30 分鐘後 → 核准。約 10 分鐘內狀態應變成「Meta 已排程」，粉專後台的「發佈工具 → 排定的貼文」也看得到。
4. 按「取消 Meta 排程」，確認粉專排程被刪除、後台退回待審核。
5. 最後用「立即發布」發一則正式貼文確認完整流程。

## 六、狀態對照

| fb.state | 後台顯示 | 誰改的 | 下一步 |
|----------|----------|--------|--------|
| `draft` | 待審核 | 後台 | 編修 → 核准 |
| `approved` | 已核准・待送出 | 後台 | 排程器下一輪送出；送出前可「撤回核准」 |
| `publishing` | 送出中 | 排程器 | 呼叫 Graph API 期間（帶鎖） |
| `scheduled` | Meta 已排程 | 排程器 | 到時 Meta 發出、排程器對帳；可「取消 Meta 排程」 |
| `cancel_requested` | 取消中 | 後台 | 排程器刪除 Meta 端貼文 → `draft` |
| `published` | 已發布 | 排程器 | 完成，附貼文連結 |
| `failed` | 失敗 | 排程器 | 看錯誤訊息，修正後重新核准 |

IG／Threads（`ig.state`、`th.state`）：

| 狀態 | 後台顯示 | 說明 |
|------|----------|------|
| `draft` | 草稿 | 編修中 |
| `approved` | 已核准・待送出 | 到期前 5 分鐘內由排程器建立容器 |
| `processing` | 媒體處理中 | 容器已建立，平台還在處理圖片；下一輪再確認 |
| `publishing` | 送出中 | 發布請求進行中（帶鎖）。若中斷，下一輪會查容器狀態：已發出就標記完成，未發出才重送，不會重複發文 |
| `cancel_requested` | 取消中 | 排程器退回草稿（未發布的容器 24 小時後自動失效） |
| `published` | 已發布 | 附貼文連結 |
| `failed` | 失敗 | 看錯誤訊息，修正後重新核准 |

`queueState` 是排程器唯一查詢的欄位（單欄位查詢，不需複合索引）：`pending` 表示需要排程器處理；`draft`／`rejected`／`done` 都不處理。

## 七、安全設計

- **重複發文防護**：每筆先以 transaction 取得 15 分鐘的鎖才呼叫 API。若上一輪送出後沒有回寫結果（例如 runner 中途被終止），下一輪會標記為「結果不明」的失敗，**不會自動重送**，請先到粉專確認。
- **過時內容防護**：預定時間已逾期超過 24 小時（例如排程器停擺）不自動發布。
- **重試**：頻率限制、5xx、網路錯誤最多重試 3 次；Token 失效（190）或權限不足（10、200–299）不重試，workflow 會失敗，GitHub 會寄信通知。
- **權限**：`aurora_social_posts` 僅管理者帳號可讀寫，不公開；`aurora_social_meta` 僅排程器可寫。後台若登入的不是管理者帳號，會顯示警示並停用按鈕。

## 八、錯誤代碼速查

| 代碼 | 意義 | 處理 |
|------|------|------|
| 190 | Token 失效／被撤銷 | 重做第二節第 4–5 步，更新 `META_PAGE_TOKEN` |
| 10、200 | 權限不足 | 確認系統使用者對粉專有完整權限、Token 勾了 `pages_manage_posts` |
| 100 | 參數錯誤（常見：圖片網址抓不到） | 確認圖片為公開 https 網址、可直接在瀏覽器開啟 |
| 4、17、32、613 | 頻率限制 | 自動重試；持續發生就拉長發文間隔 |
| 368 | 被判定為垃圾內容 | 調整內文（減少重複連結、hashtag） |

## 九、已知限制

- GitHub Actions 的 cron 尖峰時段可能延遲 10–30 分鐘。20 分鐘以後的排程交給 Meta，不受影響；「立即發布」則會等到下一輪。
- 公開 repo 若 60 天沒有任何 commit，GitHub 會自動停用排程 workflow。本 repo 每天都有自動更新，目前不會發生；後台若顯示「超過 45 分鐘未執行」請到 Actions 檢查。
- 站內圖卡（熱力圖、選股雷達等）是固定檔名、每日覆寫。交給 Meta 排程時，圖片在排程當下就上傳定格；立即發布則用送出當下的版本。

## 八之一、內容庫批次操作

後台「內容中控台 → 內容庫」勾選多筆後可批次處理，每筆各自檢查，不符合的略過並列出原因：

| 操作 | 規則 |
|------|------|
| 核准排程 | 可統一指定排程時間（台北），留空沿用各篇原時間；檢查同「建立內容」（IG 必須有圖、字數上限等）。失敗的貼文也可用這個重新核准，只會重送失敗的平台 |
| 取消排程 | 還沒送出的退回草稿；FB 已交給 Meta 排程、IG／Threads 處理中的改為取消請求，由排程器下一輪收尾；正在送出中的無法取消 |
| 複製為新草稿 | 複製標題、圖片、各平台文字，狀態全部回到草稿，不帶成效數字 |
| 封存／取消封存 | 封存後只在「已封存」篩選出現，儀表板與日曆不顯示；排程中的要先取消 |
| 刪除 | 只能刪除未發布的內容；已發布的保留紀錄與成效，請改用封存 |

## 九之一、成效同步

`social-insights.yml` 每日台北 08:47 執行 `scripts/social/sync-insights.mjs`，抓近 30 天已發布貼文的觸及與互動，寫入各貼文的 `stats`（總計與各平台明細），後台「內容中控台」儀表板的「近 30 天成效」、最近發布與內容庫表格會顯示，CSV 匯出也包含這兩欄。

| 平台 | 觸及 | 互動 | 需要的權限 |
|------|------|------|------------|
| Facebook | `post_impressions_unique`（取不到改用 `post_media_view`） | 心情＋留言＋分享 | `read_insights`、`pages_read_engagement` |
| Instagram | `reach` | 讚＋留言＋分享＋收藏 | `instagram_manage_insights` |
| Threads | `views` | 讚＋回覆＋轉發＋引用 | `threads_manage_insights` |

- Meta 不時汰換指標名稱，所以每個指標個別請求，取不到的就略過，不會中斷整批。
- 使用與發文排程器相同的 Secrets，不需另外設定；Threads 沿用排程器續期後的 Token。
- 某些貼文讀取失敗只記錄在 `aurora_social_meta/insights`；全部都失敗（多半是權限不足）才會讓 workflow 失敗。
- 手動執行：Actions →「社群成效同步」→ Run workflow（可勾 dry_run 只看數字不寫入）。

## 十、測試

```bash
node --test scripts/social/publish.test.mjs   # 39 項行為測試（FB 22＋IG／Threads 17），不連外部服務
node --test scripts/social/insights.test.mjs  # 7 項成效同步測試
```

workflow 每次執行前也會先跑這組測試；push 到 main 時以 dry_run 模式執行。

## 下一階段

- ~~**第二階段**：Instagram、Threads~~（已完成：容器兩段式發布、冪等使用 `creation_id`、Threads Token 自動續期）。待做：IG 專用 1080×1080 JPEG 圖卡、輪播與 Reels。
- **第三階段**：Claude API 自動產生 FB／IG 文案草稿、「要求重寫」回饋、失敗通知信。
