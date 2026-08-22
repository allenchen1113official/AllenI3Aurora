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
| `aurora-data.js` | 前台資料層，讀取 7 個 `aurora_*` collection 覆蓋 `window.KIT` |
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
| `aurora_issues` | 歷期報報 | `sort, no, kind, date, tone, title, items, cover` |
| `aurora_annuli` | 個人年輪 | `sort, year, tone, title, body` |

另有 **電子報訂閱者** collection（非 `sort` 排序、不公開讀）：

| Collection | 區塊 | 主要欄位 |
| --- | --- | --- |
| `aurora_subscribers` | 電子報使用者管理 | doc id = email 小寫；`email, cadence{day,week,month}, status, consent, source, createdAt, updatedAt, note` |

`aurora_subscribers` 權限與其他 collection 不同：**任何人可「建立」訂閱**（前台訂閱表單用，
規則會驗證欄位白名單、email 格式、`consent=true`、至少勾一種節奏），
**讀取／修改／刪除僅限管理者** —— email 名單不會被外部讀走。
同一 email 重複訂閱會因規則僅允許 create 而被拒，前台以此提示「已訂閱過」。
後台「訂閱用戶」面板提供統計、搜尋篩選、節奏調整、退訂／復訂、手動新增與 CSV 匯出。

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

> ⚠️ **這一步不可省略。** 在 Firestore 建立資料庫時選「正式版 / Production mode」，其預設規則會**拒絕所有讀寫**；
> 未把本專案規則發布上去，後台任何寫入都會出現 **Missing or insufficient permissions**。

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
- [ ] **訂閱寫入** — 前台「訂閱管理」頁以未登入身分送出 Email，成功顯示「訂閱成功」；
      後台「訂閱用戶」面板可看到該筆（狀態：訂閱中）。
- [ ] **重複訂閱** — 同一 Email 再送出一次，前台顯示「已經訂閱過」提示（規則僅允許 create）。
- [ ] **名單保護** — 未登入時嘗試讀取 `aurora_subscribers`（例如前台 Console 執行
      `firebase.firestore().collection("aurora_subscribers").get()`）應被拒絕。

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
