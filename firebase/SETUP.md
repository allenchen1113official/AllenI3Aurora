# Firebase 後台設定詳細文件

艾倫報報 · Allen I³ Aurora 的後台採 **Firebase**：
**Cloud Firestore**（資料庫）＋ **Firebase Authentication**（管理者登入）。

前台（儀表板）任何人可讀；後台（`/admin/`）需登入且 email 相符才能寫入。
在你完成本文件前，網站會自動使用 `ui_kits/aurora/kit.jsx` 的內建預設資料照常顯示，
後台則顯示「後台尚未啟用」。

---

## 0. 事前說明

| 項目 | 說明 |
| --- | --- |
| 費用 | 免費的 **Spark 方案**即可，本專案用量極小 |
| 需要動到的檔案 | 只有 `firebase-config.js`（貼入你的專案設定） |
| 安全規則來源 | `firebase/firestore.rules`（本 repo 已附） |
| 管理者 email | 預設 `allenchen1113.official@gmail.com`（可改，見 §5） |
| 公開值 | Firebase Web config（apiKey 等）為**公開值**，放前端是官方設計、安全 |

---

## 1. 建立 Firebase 專案

1. 前往 <https://console.firebase.google.com/> → **新增專案 / Add project**。
2. 專案名稱例如 `alleni3aurora`（名稱不影響程式）。
3. Google Analytics 可**關閉**（非必要）。
4. 建立完成後進入專案主控台。

---

## 2. 啟用 Cloud Firestore

1. 左側選單 → **建構 Build → Firestore Database** → **建立資料庫 / Create database**。
2. 模式：選 **Production mode（正式版）**（我們用自己的安全規則，不用測試模式）。
3. 位置 Location：建議 **`asia-east1`（台灣）** 或 `asia-northeast1`（東京）。
   > ⚠️ 位置**一旦選定不可更改**，請一次選好。
4. 按建立，等待初始化完成。

此時不需要手動建立 collection —— 之後在後台按「載入預設種子資料」會自動建立。

---

## 3. 部署 Firestore 安全規則

1. Firestore Database → 上方分頁 **規則 / Rules**。
2. 把本 repo 的 `firebase/firestore.rules` **整份內容**貼上，覆蓋預設規則。
3. 按 **發布 / Publish**。

規則重點：

```
match /aurora_stats/{doc}   { allow read: if true; allow write: if isOwner(); }
... 其餘 aurora_* collection 同理 ...
```

- `allow read: if true` → 前台任何人可讀。
- `allow write: if isOwner()` → 僅登入且 email 相符者可新增/修改/刪除。
- 未列出的其他 collection 預設拒絕（不影響、也不開放你其他資料）。

> CLI 方式（可選）：`firebase deploy --only firestore:rules`

---

## 4. 啟用 Authentication 並建立管理者帳號

1. 左側 → **建構 Build → Authentication** → **開始使用 / Get started**。
2. **Sign-in method** 分頁 → 啟用 **電子郵件/密碼 Email/Password**（第一個開關打開即可，不需啟用「電子郵件連結」）。
3. **Users** 分頁 → **新增使用者 / Add user**：
   - Email：`allenchen1113.official@gmail.com`（**必須**與安全規則中的 email 一致）
   - Password：自訂一組（這就是你登入後台的密碼）
4. （GitHub Pages 需要）**Authentication → Settings → Authorized domains** 確認/加入：
   - `allenchen1113official.github.io`
   - `localhost`（本機測試用；預設通常已有）

---

## 5. （可選）更換管理者 email

若不想用預設 email，需**同時**改兩處，兩者必須一致：

1. `firebase/firestore.rules` 內 `isOwner()` 的 email → 重新 **Publish**。
2. Authentication → Users 建立**相同 email** 的帳號。

---

## 6. 取得 Web 設定並填入 `firebase-config.js`

1. Firebase 主控台 → 左上 **專案設定 ⚙️ → 一般 General**。
2. 下方「你的應用程式」若沒有 Web App，按 **`</>`（Web）** 新增一個：
   - 暱稱例如 `aurora-web`，**不要**勾「同時設定 Firebase Hosting」（我們用 GitHub Pages）。
3. 註冊後會看到 **SDK 設定與配置 → Config**，長這樣：

   ```js
   const firebaseConfig = {
     apiKey: "AIza............",
     authDomain: "alleni3aurora.firebaseapp.com",
     projectId: "alleni3aurora",
     storageBucket: "alleni3aurora.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef123456"
   };
   ```

4. 把這些值填進本 repo 的 **`firebase-config.js`**（保留 `window.FIREBASE_CONFIG = { ... }` 結構）：

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza............",
     authDomain: "alleni3aurora.firebaseapp.com",
     projectId: "alleni3aurora",
     storageBucket: "alleni3aurora.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef123456",
   };
   ```

5. **commit 並 push**，等 GitHub Pages 重新部署。

---

## 7. 初始化資料（種子）

1. 開啟後台：`https://allenchen1113official.github.io/AllenI3Aurora/admin/`
2. 用 §4 建立的 email／密碼登入。
3. 左側每個區塊（統計數據、今日關注、待讀清單、Podcast、快速連結、歷期報報、個人年輪），
   第一次進入是空的 → 按 **「載入預設種子資料」** 一鍵寫入目前網站的預設內容。
4. 之後即可對每一筆做 **新增／編輯／刪除**，前台重新整理就會顯示最新資料。

---

## 8. 資料模型（collection 與欄位）

所有 collection 皆以 `aurora_` 前綴；每筆文件都有 `sort`（數字，決定顯示順序）。

| Collection | 對應區塊 | 主要欄位 |
| --- | --- | --- |
| `aurora_stats` | 統計數據 | `sort, label, value, unit, delta, tone, mode, data(陣列), link` |
| `aurora_focus` | 今日關注 | `sort, tag, tone, title, meta, icon` |
| `aurora_reading` | 待讀清單 | `sort, title, src, pct` |
| `aurora_podcasts` | Podcast | `sort, title, meta, tone` |
| `aurora_links` | 快速連結 | `sort, label, icon` |
| `aurora_issues` | 歷期報報 | `sort, no, kind, date, tone, title, items, cover` |
| `aurora_annuli` | 個人年輪 | `sort, year, tone, title, body` |

欄位提示：

- `tone`：`insight` / `intelligence` / `illumination` / `neutral`（決定極光配色）。
- `mode`（stats）：`finance`（台股紅漲綠跌）或 `semantic`（綠漲紅跌）。
- `data`（stats）：走勢線數列，於後台以 JSON 陣列填寫，例如 `[6.2,6.6,6.3,7]`。
- `icon`：對應內建圖示名（如 `chart, briefcase, compass, sparkle, book, link, paper`）。
- `cover`（issues）：圖片路徑，例如 `../../assets/rabbit-golden.jpeg`。

---

## 9. 疑難排解

| 症狀 | 可能原因與解法 |
| --- | --- |
| 後台顯示「後台尚未啟用」 | `firebase-config.js` 的 `apiKey` / `projectId` 沒填或沒部署上去 |
| 登入失敗 `auth/invalid-credential` | email／密碼錯，或該帳號未在 Authentication 建立 |
| 登入後存檔出現 `Missing or insufficient permissions` | 登入 email 與規則中的 email 不一致；或規則沒 Publish |
| 登入卡住 `auth/unauthorized-domain` | 該網域未加入 Authentication → Settings → Authorized domains |
| 前台看不到你在後台的編輯 | 前台是讀取後合併，請**重新整理**頁面；或該區塊尚未載入種子 |
| 前台完全空白/報錯 | 讀取失敗會自動回退內建預設資料；打開瀏覽器 Console 看 `[aurora]` 警告訊息 |

---

## 10. 相關檔案

| 檔案 | 用途 |
| --- | --- |
| `firebase-config.js` | 你要填入的 Firebase Web 設定（公開值） |
| `firebase/firestore.rules` | Firestore 安全規則（貼到主控台或用 CLI 部署） |
| `aurora-data.js` | 前台讀取層：讀 Firestore 合併進 `window.KIT`，失敗則回退 |
| `admin/index.html`, `admin/admin.jsx` | 後台管理頁（登入 + 各區塊 CRUD） |
| `firebase/SETUP.md` | 本文件 |
