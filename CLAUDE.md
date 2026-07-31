# 協作備忘（永久記憶）

## 工作流程偏好
- **驗證成功後，直接合併／commit 到 `main`，不需每次詢問或提醒。**
  - 仍照常在功能分支開發、推送、開 PR。
  - 驗證通過（語法解析／邏輯檢查／可行的測試）後，即自行將該 PR 合併進 `main`，不必等待再次確認。
- 回報保持精簡，不重複提醒既定的合併流程。

## 專案概要
- 純前端靜態網站（GitHub Pages），React 透過瀏覽器端 Babel standalone 載入，無建置步驟、無後端。
- 資料層：Firestore（`aurora-data.js`）覆蓋 `kit.jsx` 內建預設；讀取失敗則保留內建值。
- 首頁 TAIEX 加權指數：盤中經證交所 MIS 即時 API（`tse_t00.tw`，透過 CORS 代理），非交易時段用證交所 OpenAPI 收盤；見 `ui_kits/aurora/Dashboard.jsx`。
