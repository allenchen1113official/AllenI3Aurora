# 電子報訂閱者管理 — 設定、上線與維運 SOP

> 對應功能：前台訂閱表單、Double Opt-in 確認、偏好中心／退訂、後台「訂閱用戶」與「寄送紀錄」、
> 排程寄信 worker（`scripts/mail/`）、個資告知頁 `privacy.html`。
> 設計前提與全站一致：**純前端靜態站，沒有自有後端；GitHub Actions 是唯一的伺服器端。**
> Firestore collection 總覽見 `firebase/SETUP_SOP.md`。

---

## 一、整體流程

```
訪客填 Email ─▶ aurora_subscribers/{token}  status=pending, mailState=need_confirm
                     │
   subscriber-mail.yml（每 10 分鐘）掃佇列 ─▶ 寄確認信
                     │
   讀者點 confirm.html?t={token} ─▶ status=confirmed, mailState=need_welcome ─▶ 下一輪寄歡迎信
                     │
   每封信底部「管理訂閱」─▶ manage.html?t={token}  調整節奏／退訂／復訂
                     │
   newsletter-send.yml（手動）─▶ 把後台已發布的某一期寄給訂閱該節奏者，記入 aurora_campaigns
```

**token 就是身分。** 文件 ID 是 32 字元亂數，同時作為讀者的自助憑證（capability URL）：
讀者不需註冊帳號、不需密碼；規則只開放單筆 `get`、不開放 `list`，名單無法被列舉。

### 與舊版（2026-08 PR #69／#76）的差異，以及為什麼要改

| 舊版 | 問題 | 新版 |
|---|---|---|
| doc id ＝ email，未登入即可 `update` 任何 email 的文件 | **任何人輸入別人的 Email 就能把他退訂或改節奏**；而且 update 成功／失敗的差異讓人能**探測某 Email 是否在名單上** | doc id ＝ 私密 token，只能改自己那一筆 |
| 送出即 `active`，無確認信 | **任何人可替任何 Email「訂閱」**（訂閱炸彈）；收件人沒同意卻收到信 → 投訴率拉高、Gmail 直接丟垃圾桶；個資法上也拿不出「本人同意」的證據 | Double Opt-in，點確認信才生效 |
| 沒有寄信程式 | 名單收了、信寄不出去 | 確認信／歡迎信自動，本期電子報手動 |

舊格式資料**不需要手動處理**：worker 第一次執行時會自動把它們搬成 token 文件，
`active` 視為 `confirmed`（讀者當時已在表單勾選同意）、`unsubscribed` 維持退訂，
來源標為 `web-legacy`。搬遷結果寫在 `aurora_subscribers_meta/runner`，後台「寄送紀錄」頁可看到。

---

## 二、一次性設定（上線前必做）

### 0. 權限與機密

| 需要 | 用途 | 怎麼確認 |
|---|---|---|
| Firebase 專案 `alleni3aurora` Owner／Editor | 規則、服務帳戶 | Firebase Console → 專案設定 → 使用者和權限 |
| GitHub repo Admin | Secrets | 你是擁有者 |
| Google 帳號已開兩步驟驗證（路線 A） | 才看得到 App Password | myaccount.google.com → 安全性 |
| 網域 DNS 編輯權（路線 B） | SPF／DKIM／DMARC | 註冊商後台 |

全部都在你自己的帳號底下，**不需要向第三方申請**；唯一例外是網域登記在他人名下。

會產生的機密：**服務帳戶金鑰 JSON**（持有者可讀寫整個 Firestore，含所有 Email）、**SMTP 密碼**。
兩者只能存在 GitHub Secrets，**絕不 commit**，即使是 private repo、即使馬上刪——git 歷史會留著。

### 1. Firestore 規則

`firebase/firestore.rules` 合併進 `main` 時由 `firestore-rules-deploy.yml` 自動部署（需 `FIREBASE_SERVICE_ACCOUNT`，已設）。
部署後**務必**到 Firebase Console → Firestore → 規則 → **Rules Playground** 跑這六個案例——
規則寫錯分兩種：太嚴 → 訂閱壞掉，你馬上發現；**太鬆 → 名單外洩，沒有任何錯誤訊息會提醒你**。

| # | 模擬 | 預期 |
|---|---|---|
| 1 | `create` `/aurora_subscribers/abcdefghij0123456789abcdefghij12`，未驗證，資料如下 ① | ✅ 允許 |
| 2 | 同上但 `status` 改 `"confirmed"` | ❌ 拒絕（不能略過確認信直接進名單） |
| 3 | 同 1 但文件 ID 改成 `abc` | ❌ 拒絕（token 太短可被猜） |
| 4 | `get` 同一路徑，未驗證 | ✅ 允許（憑 token 自助管理） |
| 5 | `list` `/aurora_subscribers`，未驗證 | ❌ 拒絕（**最重要**：名單不可列舉） |
| 6 | 同 5，已驗證且 email = `allenchen1113.official@gmail.com` | ✅ 允許 |

① 案例 1 資料：
```json
{ "email": "test@example.com", "status": "pending", "cadence": { "day": false, "week": true, "month": true },
  "mailState": "need_confirm", "consent": true, "source": "web", "locale": "zh-Hant",
  "createdAt": "2026-10-23T00:00:00.000Z", "updatedAt": "2026-10-23T00:00:00.000Z" }
```

### 1-b. 規則自動部署目前是壞的（6/6 失敗），先手動貼

`firestore-rules-deploy.yml` 自 8 月建立以來每次都失敗在「部署規則」這一步（Secret 檢查有過）。
`subscriber-mail.yml` 用同一把 `FIREBASE_SERVICE_ACCOUNT` 卻能正常讀 Firestore，所以金鑰本身沒問題——
是這個服務帳戶**缺「Firebase Rules Admin」角色**（部署規則需要，讀寫資料不需要）。

- **立刻**：Firebase Console → Firestore → 規則 → 貼上 `firebase/firestore.rules` 全文 → 發布 → 跑下方六案例。
- **治本**：Google Cloud Console → IAM → 找到該服務帳戶 → 新增角色 **Firebase Rules Admin**（`roles/firebaserules.admin`）
  → Actions → 「部署 Firestore 安全規則」→ Run workflow 確認轉綠。之後規則改動就會自動部署。

### 2. 服務帳戶角色

既有的 `FIREBASE_SERVICE_ACCOUNT`（規則部署用）需**加上「Cloud Datastore 使用者」角色**才能讀寫訂閱者，
與社群發文 worker 相同（見 `docs/SOCIAL_SOP.md`）。若已為社群發文加過，此步可略。

### 3. 寄信路線與 Secrets

| | 路線 A：個人 Gmail | 路線 B：自有網域 + ESP（Brevo） |
|---|---|---|
| 需要碰 DNS | 否 | 是 |
| 每日上限 | ~500 收件人（**無法申請調高**） | 免費 300/日（9,000/月）起 |
| 累積的是誰的信譽 | Google 的 | **你自己的** |
| 適合 | 先把流程跑通 | 對外公開招募前 |

> App Password 僅個人 Gmail（已開 2SV）可用；Workspace 帳號須走 OAuth。`allenchen1113.official@gmail.com` 是個人帳號，可走 A。

**路線 A**：myaccount.google.com → 安全性 → 兩步驟驗證 → 應用程式密碼 → 建立 → 16 碼（輸入時去空格）。

Repo → Settings → Secrets and variables → Actions：

| Secret | 值 | 必要 |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com`（B：`smtp-relay.brevo.com`） | ✅ |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | `allenchen1113.official@gmail.com`（B：Brevo 登入帳號） | ✅ |
| `SMTP_PASS` | 16 碼 App Password（B：Brevo SMTP key） | ✅ |
| `MAIL_FROM` | `艾倫報報 <allenchen1113.official@gmail.com>` | ✅ |
| `MAIL_REPLY_TO` | 收讀者回信的地址，留空同上 | |

**路線 A 的坑**：`MAIL_FROM` 必須是 `SMTP_USER` 本人或 Gmail 已驗證別名，否則 Gmail 會改寫 From，品牌名就不見了。

### 4. 網域驗證

- **路線 A**：不需要、也無法設定 DNS（gmail.com 的 SPF/DKIM 由 Google 維護）。只要寄一封給自己 → Gmail「顯示原始郵件」→ SPF／DKIM／DMARC 三個 PASS 即可。
- **路線 B**：ESP 後台新增網域 → 依它給的值到 DNS 加三筆 TXT（SPF `include:`、DKIM selector、DMARC）。
  **DMARC 先 `p=none`** 觀察 2～4 週，確認所有合法寄件來源都通過，再升 `quarantine` → `reject`；
  直接上 `reject` 的典型災難是某個你忘了的服務（聯絡表單、行事曆）被整批拒收而且沒人通知你。
  建議一併開 Google Postmaster Tools 看投訴率（Google 要求 <0.1%、絕不碰 0.3%）。

### 5. 驗證

1. Actions →「寄送訂閱信件」→ Run workflow，勾 **dry run** → log 應出現 `完成：寄出 N、略過 …（dry-run）`，
   第一次還會有 `搬遷舊格式：…`。
2. 前台「訂閱管理」用自己的 Email 送出 → 後台「訂閱用戶」出現「待確認」。
3. 等排程（或手動 Run，不勾 dry run）→ 收確認信 → 點擊 → 「訂閱已啟用」→ 後台轉「訂閱中」→ 收歡迎信。
4. 歡迎信底部「管理訂閱」→ 改節奏、退訂、復訂 → 後台同步。
5. 收到的信「顯示原始郵件」SPF／DKIM／DMARC 皆 PASS。

| log 訊息 | 原因 | 處理 |
|---|---|---|
| `::warning::未設定 FIREBASE_SERVICE_ACCOUNT` | Secret 缺 | 補上 |
| `::warning::未設定寄信 Secrets（…）` | 該項缺 | 補上 |
| `535-5.7.8 Username and Password not accepted` | 用了一般密碼或 16 碼含空格 | 重建 App Password，去空格 |
| `534-5.7.9` | 2SV 沒開 | 先開 |
| `PERMISSION_DENIED` / `7 PERMISSION_DENIED` | 服務帳戶缺 Datastore 角色 | 見第 2 步 |
| `Daily sending quota exceeded` | 超過 Gmail 每日上限 | 等 24h，考慮路線 B |

### 6. 個資告知頁（`privacy.html`）需你確認的預設值

| 位置 | 目前寫法 | 你要決定 |
|---|---|---|
| 第四節 期間 | 退訂後保留 **2 年** | 年限 |
| 第四節 對象 | 「電子郵件寄送服務」 | 選定 ESP 後改成實際名稱 |
| 第五節 回覆時限 | **15 日內** | 寫了就要做到 |
| 第一節 性質 | 註明與任職機關無涉 | 符合服務機關規定 |

個資法部分條文已於 114/11/11 修正公布（新增非公務機關個資事故通知義務），**施行日期由行政院另定、尚未指定**；
第六節已預寫事故通知承諾，待公告後再檢視。此頁是依法條結構寫的實務文件，不是法律意見。

---

## 三、日常維運

- **後台 → 訂閱用戶**：統計（含待確認／各節奏收件人數）、搜尋、篩選、調整節奏、退訂／復訂、
  **重寄確認信**（pending 者）、**複製管理連結**（讀者弄丟信時給他）、手動新增（視為已確認）、匯出 CSV。
- **退訂 vs 刪除**：預設用「退訂」。刪除會抹掉同意／撤回軌跡；只有當事人要求刪除資料時才刪。
- **寄送失敗**：列上顯示 `寄送失敗 N 次：錯誤`，連續 3 次後停手；修好設定再按「重寄確認信」。
- **讀者弄丟所有信**：請他在首頁重新訂閱一次，worker 會偵測到同 Email 已確認、改寄「已在名單」通知附管理連結。

---

## 四、寄送一期電子報

確認信／歡迎信是**自動**的；本期內容是**手動**的——寄信不可逆，應由人按下送出。

1. 後台 → 電子報，編好內文並**發布**（草稿不寄；排程者要到時間才寄）。
2. 後台 → 訂閱用戶，看「日報／週報／月報」人數確認這期會寄給幾個人。
3. Actions → **寄送本期電子報** → Run workflow：

| 欄位 | 說明 |
|---|---|
| `kind` | 日報→訂日報者、週報→訂週報者、月報→訂月報者、**特刊→全體已確認者** |
| `no` | 留空＝該期別最新一期「已發布」者 |
| `test_to` | 填了就**只寄這一封**給你，不動寄送紀錄。**正式前務必先試寄**，並在實際會用的信箱（含 Outlook）看版面 |
| `dry_run` | 只列收件人，完全不寄 |

順序：`dry_run` → `test_to` → 正式。每期對應 `aurora_campaigns/{期別}-{期號}` 記已寄 Email：
**中途失敗直接重跑**不會有人收到兩份；超過 200 人時每輪 200 封，log 提示尚餘人數，再跑一次續寄。
後台「寄送紀錄」頁可看進度條與失敗明細。

---

## 五、信件版型與客戶端相容性

版型在 `scripts/mail/template.mjs`。**Outlook 桌面版用 Word 排版引擎，不支援 CSS 漸層與 `rgba()`**：
只寫 `background: linear-gradient(...)` 會變成「沒有背景」，深色文字落在深色卡片上，「確認訂閱」按鈕直接消失。
因此一律 `background-color` 實色打底 ＋ `background-image` 疊漸層 ＋ `bgcolor` 屬性，`C.wash/C.hair` 為 rgba 的實色替代。
`mail.test.mjs` 有靜態相容性檢查（含反向驗證：舊寫法會失敗），改版型後跑 `node --test scripts/mail/mail.test.mjs`。

---

## 六、已知限制與後續

1. **無退信（bounce）自動處理**：SMTP 單向，硬退信不回寫。名單數百人以上換 SES／Brevo 接 webhook，`bounced` 狀態可再加。
2. **防灌注只有 honeypot ＋ 規則**：`apiKey` 本就公開，有心人可寫腳本灌 pending。下一步是 Firebase App Check（reCAPTCHA v3）——
   注意開啟「強制執行」前必須先讓所有觸及 Firestore 的頁面都帶權杖並觀察一週，否則連前台讀取都會被拒。
3. **無開信／點擊追蹤**：刻意不做，隱私權政策也明寫「不放追蹤像素」。
4. **確認信最長 10 分鐘延遲**：要即時只能上 Cloud Functions（Blaze）。
5. **本期寄送需手動觸發**：刻意設計。累積幾期經驗再決定要不要自動化。
