# Firebase 設定 SOP · 艾倫報報 Allen I³ Aurora

本文件為「艾倫報報」儀表板串接 Firebase（Firestore + Authentication）的標準作業程序。
依序完成後，前台 `index.html` 會自動改讀 Firestore 資料，後台 `admin/` 可登入進行 CRUD。

> **設計原則**：Firebase 未設定時網站仍照常運作 —— 前台自動回退到 `kit.jsx` 內建預設資料，
> 後台顯示「後台尚未啟用」提示。因此設定過程不會讓線上網站中斷。

---

## 0. 事前準備

| 項目 | 說明 |
| --- | --- |
| Google 帳號 | 用來登入 [Firebase Console](https://console.firebase.google.com/) |
| 管理者 Email | 後台登入帳號，預設 `allenchen1113.official@gmail.com`（見 `firebase/firestore.rules` 的 `OWNER_EMAIL`） |
| 專案原始碼 | 本 repo，需可編輯 `firebase-config.js` 與部署到 GitHub Pages |

牽涉檔案總覽：

| 檔案 | 角色 |
| --- | --- |
| `firebase-config.js` | 前後台共用的 Web SDK 設定（**皆為公開值，可安全進版控**） |
| `firebase/firestore.rules` | Firestore 安全規則：公開讀、管理者寫 |
| `aurora-data.js` | 前台資料層，讀取 8 個 `aurora_*` collection 覆蓋 `window.KIT`（含 `aurora_podcast_episodes`） |
| `admin/admin.jsx` | 後台管理，Email/密碼登入 + 各區塊 CRUD + 一鍵種子初始化 |

---

## 1. 建立 Firebase 專案

1. 前往 <https://console.firebase.google.com/>，點 **新增專案 / Add project**。
2. 專案名稱建議 `allen-i3-aurora`（僅為顯示名稱，可自訂）。
3. Google Analytics 可**關閉**（本站不需要），按 **建立專案**。

## 2. 新增 Web 應用程式並取得 Config

1. 專案總覽頁點 **`</>`（Web）** 圖示新增應用程式。
2. 應用程式暱稱填 `aurora-web`；**不要**勾選「Firebase Hosting」（本站用 GitHub Pages）。
3. 註冊後畫面會顯示一段 `firebaseConfig`。之後也可在
   **專案設定 ⚙️ → 一般 → 你的應用程式 → SDK 設定與配置 → 選「Config」** 重新取得。

取得的內容形如：

```js
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "alleni3aurora.firebaseapp.com",
  projectId: "alleni3aurora",
  storageBucket: "alleni3aurora.firebasestorage.app",   // 新版主控台為 .firebasestorage.app（舊版為 .appspot.com）
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx",
  measurementId: "G-XXXXXXXXXX",                        // 選填：僅在開啟 Analytics 時出現
};
```

## 3. 填入 `firebase-config.js`

打開專案根目錄的 `firebase-config.js`，把上一步的值逐欄貼進 `window.FIREBASE_CONFIG`：

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "alleni3aurora.firebaseapp.com",
  projectId: "alleni3aurora",
  storageBucket: "alleni3aurora.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx",
  measurementId: "G-XXXXXXXXXX",   // 選填，可省略
};
```

> 這些是 Firebase Web 公開設定值，放前端與進版控都安全；真正的存取控制由**安全規則**負責。
> 前後台以 `apiKey` 與 `projectId` 是否有值來判定「已設定」並啟用 Firestore，兩者務必完整填寫；
> `measurementId` 為 Analytics 選填欄位，可保留或省略，不影響運作。

## 4. 啟用 Authentication（Email/密碼）

後台採 **Email/密碼** 登入（`admin.jsx` 的 `signInWithEmailAndPassword`）。

1. Console 左側 **Build → Authentication → 開始使用 / Get started**。
2. **Sign-in method** 分頁 → 啟用 **電子郵件/密碼（Email/Password）**，儲存。
3. **Users** 分頁 → **新增使用者**，輸入管理者 Email（`allenchen1113.official@gmail.com`）與密碼。
   這組帳密即後台登入用；務必與安全規則裡的 `OWNER_EMAIL` 一致。

> 若日後要更換管理者 Email：同步修改 (a) 此處的使用者帳號、(b) `firebase/firestore.rules` 的 `OWNER_EMAIL`。

## 5. 建立 Firestore Database

1. Console 左側 **Build → Firestore Database → 建立資料庫 / Create database**。
2. 模式選 **正式版 / Production mode**（規則稍後由步驟 6 覆蓋）。
3. 位置選離使用者近的區域（例如 `asia-east1` 台灣 / `asia-northeast1` 東京），建立後**不可更改**。

本站使用的 7 個 collection（皆含數值欄位 `sort`，前台以 `orderBy("sort")` 排序）：

| Collection | 區塊 | 主要欄位 |
| --- | --- | --- |
| `aurora_stats` | 統計數據 | `sort, label, value, unit, delta, tone, mode, data(json), link` |
| `aurora_focus` | 今日關注 | `sort, tag, tone, title, meta, icon` |
| `aurora_reading` | 待讀清單 | `sort, title, src, pct` |
| `aurora_podcasts` | Podcast | `sort, title, meta, tone` |
| `aurora_links` | 快速連結 | `sort, label, icon` |
| `aurora_issues` | 歷期報報 | `sort, no, kind, date, tone, title, items, cover`；發布流程欄位 `pubStatus`（draft/scheduled/published，缺值視為已發布）、`publishAt`（預計發布時間）、`publishedAt` |
| `aurora_annuli` | 個人年輪 | `sort, year, tone, title, body` |

另有 **電子報訂閱者** 相關 collection（不公開讀）：

| Collection | 用途 | 主要欄位 |
| --- | --- | --- |
| `aurora_subscribers` | 電子報使用者管理 | **doc id = 32 字元私密 token**；`email, status(pending/confirmed/unsubscribed/duplicate), cadence{day,week,month}, mailState, consent, source, createdAt, updatedAt, confirmedAt, unsubscribedAt, note` |
| `aurora_campaigns` | 每期寄送紀錄（已寄 Email 清單，重跑不重複） | `kind, no, sentTo[], sentCount, targetCount, failures[], finishedAt` |
| `aurora_subscribers_meta` | 寄信 worker 執行摘要 | `lastRunAt, lastRun, legacyMigratedAt` |

`aurora_subscribers` 權限與其他 collection 不同：**任何人可「建立」訂閱**（規則驗證欄位白名單、
email 格式、`consent=true`、至少一種節奏，且 `status` 鎖定 `pending`→ 必走確認信），
**憑 token 可「讀／改自己那一筆」**（確認、調整節奏、退訂、復訂；Email 與建立時間不可改），
**列表／刪除僅限管理者** —— 名單不可被列舉，也無法用別人的 Email 變更他的訂閱。
確認信／歡迎信與本期電子報由 GitHub Actions 寄出。完整流程與寄信設定見 **`docs/SUBSCRIBER_SOP.md`**。

## 6. 部署 Firestore 安全規則

把 `firebase/firestore.rules` 的內容套用到專案。規則語意：**任何人可讀、僅管理者 Email 可寫**。

**方式 A — Console（最簡單）**

1. **Firestore Database → 規則 / Rules** 分頁。
2. 貼上 `firebase/firestore.rules` 全文，按 **發布 / Publish**。

**方式 B — Firebase CLI**

本 repo 已附 `firebase.json`（規則指向 `firebase/firestore.rules`）與 `.firebaserc`（預設專案 `alleni3aurora`），
於專案根目錄可直接部署：

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

**方式 C — GitHub Actions 自動部署（一次設定，之後全自動）**

`.github/workflows/firestore-rules-deploy.yml` 會在 `firebase/firestore.rules` 合併進 `main` 時
自動部署，也可在 Actions 頁面手動觸發。部署腳本 `scripts/firebase/deploy-rules.mjs` 直接呼叫
Firebase Rules REST API（建立 ruleset → 把 `cloud.firestore` release 指向它），不經 firebase-tools，
因此服務帳戶只需 **Firebase Rules Admin（`roles/firebaserules.admin`）** 一個角色。
完整的 Secret／IAM 設定與部署 SOP 見下一節 **6-1**。

> ⚠️ **這一步不可省略。** 在 Firestore 建立資料庫時選「正式版 / Production mode」，其預設規則會**拒絕所有讀寫**；
> 未把本專案規則發布上去，後台任何寫入都會出現 **Missing or insufficient permissions**。

## 6-1. Secret／IAM 設定後部署規則 SOP（方式 C 詳細版）

適用時機：Actions「部署 Firestore 安全規則」出現 **HTTP 403「The caller does not have permission」**、
首次設定、或要更換 `FIREBASE_SERVICE_ACCOUNT` 金鑰時。全程約 10 分鐘，不影響線上網站。

### 6-1-0. 先弄清楚「這把 Secret 是誰、誰在用」

`FIREBASE_SERVICE_ACCOUNT` **不只給規則部署用**。下列 7 支 workflow 共用同一把金鑰，透過 firebase-admin
讀寫 Firestore：

| Workflow | 用途 | 需要的角色 |
| --- | --- | --- |
| `firestore-rules-deploy.yml` | 部署安全規則 | Firebase Rules Admin |
| `newsletter-send.yml` | 寄本期電子報 | Cloud Datastore 使用者 |
| `subscriber-mail.yml` | 確認信／歡迎信 | Cloud Datastore 使用者 |
| `social-publish.yml` | PilotOne 發文／YouTube 上傳 | Cloud Datastore 使用者 |
| `social-insights.yml` | 社群成效同步 | Cloud Datastore 使用者 |
| `schedule-monitor.yml` | 排程監控 | Cloud Datastore 使用者 |
| `youtube-sync.yml` | YouTube 頻道同步 | Cloud Datastore 使用者 |

（`GDRIVE_SERVICE_ACCOUNT` 是另一把，給 `daily-update`／`focus-update` 讀 Drive，與本節無關。）

**所以無論走哪條路，最後持有金鑰的服務帳戶都必須同時有這 2 個角色：**

| 角色 | ID | 用途 |
| --- | --- | --- |
| Firebase Rules Admin（Firebase 規則管理員） | `roles/firebaserules.admin` | 規則部署 |
| Cloud Datastore 使用者 | `roles/datastore.user` | 其他 6 支排程讀寫 Firestore |

**查目前金鑰是誰的**：Actions → 任一次「部署 Firestore 安全規則」run → Summary 頂端 annotation
`部署身分：服務帳戶 xxx@alleni3aurora.iam.gserviceaccount.com（金鑰所屬專案 …）`。
失敗時「Firestore 規則部署失敗」annotation 末尾會列「已有 […]；缺少 […]」的 firebaserules 權限。

### 6-1-1. 二選一

| | 方案 A：現有帳戶補角色（建議） | 方案 B：換成 `rules-deployer` 的金鑰 |
| --- | --- | --- |
| 動作 | IAM 加 1 個角色 | IAM 加 2 個角色＋建金鑰＋更新 Secret |
| 風險 | 無（Secret 不動） | Secret 換錯／角色漏給 → 6 支排程一起 403 |
| 適合 | 只想讓部署通過 | 想把「規則部署」與「排程讀寫」收斂到專用帳戶 |

> 兩案的 IAM 操作都在 **[Google Cloud Console](https://console.cloud.google.com/) → 頂端專案選單切到 `alleni3aurora`**（Firebase 的專案，**不是** `alleni3aurora-drive`）。

#### 方案 A：補角色給現有金鑰的帳戶

1. 從 6-1-0 的 annotation 抄下服務帳戶 Email（例如 `drive-reader@alleni3aurora.iam.gserviceaccount.com`）。
2. GCP Console → **IAM 與管理 → IAM** → 在清單找到該 Email（找不到就按「授予存取權」，主體貼該 Email）。
3. 鉛筆「編輯主體」→ **新增其他角色** → 搜尋 `Firebase Rules Admin` 選取 → **儲存**。
4. 確認同一列的角色也含 **Cloud Datastore 使用者**（既有排程本來就在跑的話一定有）。
5. 跳到 6-1-2 部署。**不需**重新產生金鑰或更新 GitHub Secret。

#### 方案 B：改用 `rules-deployer` 的金鑰

1. **補角色**：IAM 與管理 → IAM → 找 `rules-deployer@alleni3aurora.iam.gserviceaccount.com`（沒有 → 先到「服務帳戶」建立，名稱 `rules-deployer`）→ 編輯主體 → 確認同時有 **Firebase Rules Admin** 與 **Cloud Datastore 使用者** → 儲存。
2. **建金鑰**：IAM 與管理 → **服務帳戶** → 點 `rules-deployer` → **金鑰** 分頁 → **新增金鑰 → 建立新的金鑰 → JSON → 建立**，瀏覽器下載 `alleni3aurora-xxxx.json`。
3. **更新 Secret**：GitHub repo → **Settings → Secrets and variables → Actions** → `FIREBASE_SERVICE_ACCOUNT` 右側鉛筆 **Update** → 用文字編輯器開啟 JSON，**全選整段貼上**（含最外層 `{ }`，不是只貼 `private_key`）→ **Update secret**。
4. 本機 JSON 檔用完即刪；舊金鑰等 6-1-3 全部驗證通過後，再回「服務帳戶 → 金鑰」把舊帳戶（drive-reader）那把**停用或刪除**。

### 6-1-2. 部署規則

1. 確認 `main` 上的 `firebase/firestore.rules` 檔頭版次（`規則版次：rN`）大於目前線上版（Firebase Console → Firestore → 規則 可看）；PR 流程已強制遞增，一般不需手動改。
2. GitHub → **Actions** → 左側 **部署 Firestore 安全規則** → 右上 **Run workflow** → branch `main` → **Run workflow**。
3. 等約 1 分鐘，點進該 run 看三個判讀點：
   - Summary annotation **`部署身分`**：服務帳戶 Email 是你預期的那個（方案 B 應顯示 `rules-deployer@…`）。
   - 步驟「規則編譯檢查（dry-run）」印出 `dry-run：規則編譯通過`。
   - 步驟「部署」印出 **`✔ Firestore 規則已部署：projects/alleni3aurora/releases/cloud.firestore`**。
4. Firebase Console → Firestore → **規則** 分頁，檔頭版次與 `main` 一致即完成。

> IAM 角色變更偶爾需 1–2 分鐘生效；剛改完就跑而 403，等一下按 **Re-run jobs** 即可。

### 6-1-3. 驗證其他排程沒被影響（方案 B 必做；方案 A 可略）

Actions 手動 **Run workflow** 下列任一支，綠燈即代表 `datastore.user` 到位：
- **排程監控**（`schedule-monitor`，最快、冪等）或 **社群自動發文**（`social-publish`，佇列空時只是 no-op）。
- 之後 10 分鐘內 `subscriber-mail`／`social-publish` 的定時 run 也應維持綠燈；若出現
  `PERMISSION_DENIED: Missing or insufficient permissions` 代表金鑰帳戶缺 Cloud Datastore 使用者，回 6-1-1 補。

### 6-1-4. 部署後的應用

- 規則 r12 以後包含 `aurora_vlog_episodes`（Vlog）與 `aurora_youtube*`；部署成功後到後台 `admin/#vlog`
  按「⬆ 匯入系列 JSON（冰島 12 集）」，再進各集「素材與影音」／「影片預覽」編修。
- 之後凡 `firebase/firestore.rules` 變更合併進 `main`，workflow 會自動部署，不需再手動跑。

### 6-1-5. 疑難排解

| 症狀（Actions annotation） | 原因 | 處理 |
| --- | --- | --- |
| `HTTP 403 … 缺少 [firebaserules.rulesets.create, …]` | 金鑰帳戶沒有 Firebase Rules Admin | 6-1-1 方案 A 步驟 3 |
| `testIamPermissions HTTP 403`／`專案不存在` | 金鑰屬於別的專案（如 `alleni3aurora-drive`）或帳戶在 `alleni3aurora` 完全沒角色 | 看 `部署身分` 的「金鑰所屬專案」；改用 `alleni3aurora` 內帳戶的金鑰，或在 `alleni3aurora` IAM 加該 Email |
| `金鑰專案不符` warning | 同上 | 同上 |
| `FIREBASE_SERVICE_ACCOUNT 不是合法 JSON` | Secret 只貼了部分／多了引號 | 重新貼 JSON 全文 |
| `取得 access token 失敗 … invalid_grant` | 金鑰已被刪除／停用，或系統時間偏差 | 重新建金鑰並更新 Secret |
| `HTTP 400 … L12:5 …` | 規則語法錯誤（附行號） | 修 `firestore.rules`、版次 +1 後重新合併 |
| 版次檢查步驟失敗 | 檔頭 `規則版次：rN` 未遞增 | 依 CLAUDE.md 規則 +1 並更新「最後更新」 |
| 規則部署成功但其他排程 403 | 金鑰帳戶缺 Cloud Datastore 使用者 | 6-1-1 方案 B 步驟 1 |


## 7. 初始化資料

有兩種方式在空資料庫建立初始內容：

- **一鍵種子（建議）**：完成步驟 1–6 後開啟後台 `admin/`，登入管理者帳號，
  各區塊若為空會出現「初始化預設資料」按鈕，點擊即寫入 `admin.jsx` 內建的 `SEED` 範例。
- **手動新增**：在後台各區塊逐筆「新增」→ 填欄位 → 儲存；記得填 `sort`（數字）控制顯示順序。

## 8. 驗證（Verification）

完成後依序確認：

- [ ] **前台顯示** — 開啟 `index.html`（GitHub Pages 網址），資料改由 Firestore 提供；
      瀏覽器 Console 無 `[aurora] 讀取 Firebase 失敗` 警告。
- [ ] **公開讀** — 以未登入的無痕視窗開前台，各區塊資料正常呈現。
- [ ] **後台登入** — 開 `admin/`，以管理者帳密登入成功（未設定時應顯示「後台尚未啟用」）。
- [ ] **寫入權限** — 後台新增/修改/刪除一筆，重新整理前台可見變更。
- [ ] **權限隔離** — 用非管理者帳號登入後嘗試寫入應被拒絕（規則生效）。
- [ ] **回退機制** — 暫時清空 `firebase-config.js` 任一必填欄位，前台仍以內建預設資料正常顯示。
- [ ] **訂閱寫入** — 前台「訂閱管理」頁以未登入身分送出 Email，顯示「確認信已寄出」；
      後台「訂閱用戶」面板可看到該筆（狀態：待確認）。
- [ ] **Double Opt-in** — 設好寄信 Secrets 後 10 分鐘內收到確認信，點擊後 `confirm.html` 顯示「訂閱已啟用」，
      後台狀態轉「訂閱中」，再 10 分鐘內收到歡迎信。
- [ ] **偏好中心** — 歡迎信底部「管理訂閱」→ `manage.html?t=…` 可調整節奏、退訂、復訂，後台同步。
- [ ] **名單保護** — 未登入時 `firebase.firestore().collection("aurora_subscribers").get()` 應被拒絕；
      對任意 token 執行 `create` 時若 `status` 不是 `pending` 應被拒絕；
      未登入時變更 `email`／`createdAt` 或刪除文件應被拒絕。Rules Playground 六案例見 `docs/SUBSCRIBER_SOP.md`。

全部通過即設定完成。

---

## 疑難排解

| 症狀 | 可能原因 / 解法 |
| --- | --- |
| 後台顯示「後台尚未啟用」 | `firebase-config.js` 的 `apiKey` 或 `projectId` 未填；補齊後重新整理 |
| 前台 Console 出現讀取失敗警告，改用預設資料 | Firestore 尚未建立、規則未發布、或網路/網域限制；檢查步驟 5、6 |
| 登入報 `auth/...` 錯誤 | 未啟用 Email/密碼登入，或該 Email 未在 Authentication → Users 建立 |
| **種子/儲存寫入失敗：Missing or insufficient permissions** | 兩種原因之一：① 尚未把 `firebase/firestore.rules` 發布到專案（見步驟 6）；② 登入 Email ≠ 規則的 `OWNER_EMAIL`。後台錯誤訊息現會直接標示目前登入身分以協助判斷 |
| 可讀不可寫（寫入被拒） | 登入 Email 與 `firestore.rules` 的 `OWNER_EMAIL` 不一致；兩處需相同 |
| 資料順序錯亂 | 文件缺少數值 `sort` 欄位；補上並重新整理（前台以 `orderBy("sort")` 排序） |

## 安全備註

- `firebase-config.js` 的六個欄位為 Firebase 公開設定，放前端與進版控皆安全。
- 真正的存取控制在 `firebase/firestore.rules`，切勿放寬為 `allow write: if true`。
- 管理者密碼屬機密，**不要**寫入任何原始碼或版控檔案。
