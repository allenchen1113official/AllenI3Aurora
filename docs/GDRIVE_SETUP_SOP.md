# Google Drive 存取設定 SOP — 今日關注動態自動更新

儀表板「今日關注動態」的資料由 GitHub Actions（`.github/workflows/focus-update.yml`
＋ `scripts/update-focus.mjs`）每 3 小時讀取 Google Drive 今日資料夾，彙整成
同源的 `data/focus.json` 供前端顯示。

本文說明如何授權 GitHub Actions 唯讀存取 Drive。整體概念：
建立一個「服務帳戶」（機器人 Google 帳號）→ 把 Drive 資料夾分享給它 →
把它的金鑰放進 GitHub Secret。約 10 分鐘。

> 未完成本設定時，網站仍會顯示 `data/focus.json` 內既有（種子化）內容，
> 只是不會每日自動更新；設定完成後即自動更新，不需改動程式碼。

---

## 資料來源（Drive 路徑，`YYYYMMDD`＝今日）

| Drive 路徑 | 對應卡片 |
| --- | --- |
| `AllenI3Aurora/finance/heatmap/YYYYMMDD/` | 台股熱力圖 |
| `AllenI3Aurora/finance/stockradar/YYYYMMDD/` | 選股雷達 |
| `AllenI3Aurora/newsletter/day/YYYYMMDD/` | 每日日報 |

當日資料夾尚未產生時，該來源會退回「最近一個日期資料夾」並在說明標註「（最新）」。

---

## A. 建立服務帳戶與金鑰（Google Cloud Console）

1. 前往 <https://console.cloud.google.com/> ，用 `allenchen1113.official@gmail.com` 登入。
2. 頂端專案選單 →「**新增專案**」（名稱例如 `alleni3aurora-drive`）→ 建立，並切換到該專案。
3. 啟用 API：左上選單 → **APIs & Services → Library** → 搜尋 **Google Drive API** →
   點進去 → **Enable（啟用）**。
4. 建立服務帳戶：**APIs & Services → Credentials** → 上方 **+ CREATE CREDENTIALS → Service account**。
   - Service account name：例如 `drive-reader` → **Create and continue**。
   - Role（角色）：**可略過**（不需專案角色，權限來自資料夾分享）→ **Continue → Done**。
5. 產生金鑰：Credentials 頁點剛建立的服務帳戶 → 分頁 **KEYS** →
   **ADD KEY → Create new key** → 選 **JSON** → **Create**。
   - 瀏覽器會下載一個 `.json` 檔（**這就是金鑰，請妥善保管、切勿外流或提交進 repo**）。
6. 記下該服務帳戶的 email，格式類似：
   `drive-reader@alleni3aurora-drive.iam.gserviceaccount.com`

---

## B. 把 Drive 資料夾分享給服務帳戶

1. 打開 Google Drive → 找到 **`AllenI3Aurora`** 資料夾（含 `finance/`、`newsletter/` 的那個）。
2. 右鍵 → **共用 / Share** → 貼上上一步的服務帳戶 email。
3. 權限選 **檢視者（Viewer）** → 傳送。
   - 只需分享最上層 `AllenI3Aurora`，底下 `finance/heatmap`、`stockradar`、
     `newsletter/day` 會自動繼承。

---

## C. 把金鑰放進 GitHub Secret

1. 前往 repo：**Settings → Secrets and variables → Actions**
   （<https://github.com/allenchen1113official/AllenI3Aurora/settings/secrets/actions>）。
2. **New repository secret**。
   - **Name**：`GDRIVE_SERVICE_ACCOUNT`（一字不差）
   - **Secret**：用文字編輯器打開剛下載的 `.json`，**全選、整份貼上**（含開頭 `{` 到結尾 `}`）。
3. **Add secret**。

---

## D. 測試與驗證

1. 前往 **Actions** 分頁 → 左側 **更新今日關注動態** → 右側 **Run workflow ▸ Run**（手動觸發一次）。
2. 查看該 run 的 log：
   - 成功：`已寫入 data/focus.json → N 則關注動態`。
   - 缺金鑰／未分享：會顯示對應訊息並**維持現狀**（流程不會失敗）。
3. 之後每 3 小時自動更新一次（另可隨 `focus-update.yml` / `update-focus.mjs` 異動觸發）。

---

## 疑難排解

| 訊息 | 原因與處理 |
| --- | --- |
| `未提供 GDRIVE_SERVICE_ACCOUNT` | Secret 未設定或名稱拼錯 → 依步驟 C 重設。 |
| `服務帳戶金鑰無效` | 貼上的 JSON 不完整或非金鑰檔 → 重貼完整 JSON。 |
| `找不到（或未分享）AllenI3Aurora 資料夾給服務帳戶` | 尚未把資料夾分享給服務帳戶 email → 依步驟 B 分享。 |
| `無法載入 googleapis 套件` | workflow 會自動 `npm install googleapis`，通常為暫時性網路問題，重跑即可。 |

---

## 安全性

- 金鑰只存在 GitHub Secret（加密、不會出現在 log）。
- 服務帳戶僅有你分享之資料夾的**唯讀**權限。
- 要撤銷：於 Drive 取消分享，或在 Cloud Console → Credentials 刪除金鑰。
- 切勿把 `.json` 金鑰檔提交進 repo。

---

## 相關檔案

- `.github/workflows/focus-update.yml` — 定時任務（每 3 小時 / 手動 / 相關檔案異動）。
- `scripts/update-focus.mjs` — 讀取 Drive、產生 `data/focus.json`。
- `data/focus.json` — 同源資料檔，前端「今日關注動態」讀取來源。
- `ui_kits/aurora/Dashboard.jsx` — 前端 `useFocusLive` 讀取並渲染。
