# 社群自動發文 SOP（第一階段：Facebook 粉專）

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
   └─ 取消請求 → 刪除 Meta 端排程貼文，退回待審核
```

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

## 三、服務帳戶加授 Firestore 權限

排程器沿用既有的 `FIREBASE_SERVICE_ACCOUNT`（原本用來部署 Firestore 規則，角色見 firebase/SETUP_SOP.md 方式 C）。需要再加一個角色才能讀寫貼文佇列：

GCP Console → IAM 與管理 → IAM → 找到該服務帳戶 → 編輯 → 新增角色 **Cloud Datastore 使用者**（`roles/datastore.user`）→ 儲存。

## 四、GitHub Secrets

Repo → Settings → Secrets and variables → Actions：

| 名稱 | 類型 | 內容 |
|------|------|------|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | 既有，不用動（但要完成第三節） |
| `META_PAGE_TOKEN` | Secret | 第二節第 5 步的粉專 `access_token` |
| `META_PAGE_ID` | Secret | 第二節第 5 步的粉專 `id` |
| `META_GRAPH_VERSION` | Variable（選用） | 預設 `v25.0`；Meta 淘汰舊版前改成新版即可 |

未設定 Meta Secrets 時，排程器只印警告並略過，不會讓 workflow 失敗。

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

## 十、測試

```bash
node --test scripts/social/publish.test.mjs   # 22 項行為測試，不連外部服務
```

workflow 每次執行前也會先跑這組測試；push 到 main 時以 dry_run 模式執行。

## 下一階段

- **第二階段**：Instagram（容器兩段式發布、輪詢 `status_code`、冪等使用 `creationId`），IG 專用 1080×1080 圖卡。
- **第三階段**：Claude API 自動產生 FB／IG 文案草稿、「要求重寫」回饋、失敗通知信。
