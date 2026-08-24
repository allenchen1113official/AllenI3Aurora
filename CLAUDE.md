# 協作備忘（永久記憶）

## 工作流程偏好
- **驗證成功後，直接合併／commit 到 `main`，不需每次詢問或提醒。**
  - 仍照常在功能分支開發、推送、開 PR。
  - 驗證通過（語法解析／邏輯檢查／可行的測試）後，即自行將該 PR 合併進 `main`，不必等待再次確認。
- 回報保持精簡，不重複提醒既定的合併流程。

## Skill 建立與測試流程（把可重複的產出流程打包成 skill 時照此做）
1. **建立**：以 `skill-creator` skill 進行；形式比照 `taiex-heatmap` —— `SKILL.md`（觸發時機寫進 frontmatter description、執行步驟、產後驗證清單、已知環境限制）＋ `scripts/`（把本次調校好的程式原樣打包，並註明「照抄執行、不要重新設計」）。附 `episode/data` 範例檔供試跑。腳本要與 repo 解耦（輸出預設目前目錄、相依自動解決如字型自動下載）。
2. **測試**：在乾淨目錄照 SKILL.md 步驟實跑，至少兩案例 —— 正常範例＋壓力案例（長內容、截斷、非預設參數），用 Read 目視驗證產出。
3. **檢視**：測試結果整理成 eval workspace（`iteration-N/eval-X/with_skill/outputs/`＋`eval_metadata.json` 斷言），用 skill-creator 的 `eval-viewer/generate_review.py --static` 產靜態檢視頁交給使用者過目；有 feedback 就迭代。
4. **封裝交付**：`python -m scripts.package_skill <skill目錄>`（於 skill-creator 目錄下執行；`.skill` 會產在該處，記得搬走、排除 `__pycache__`），以檔案卡片附給使用者按「Save skill」安裝。

## Skill 與二進位產出備份到 Google Drive（照此做，已驗證兩次）
- **鐵則**：超過約 5KB 的二進位絕不用 base64 經 `create_file` 上傳（助手輸出高熵字串必漂移損毀）；每次上傳後必比對回傳 `fileSize` 與本機位元組數，完全一致才算完成。
- **圖檔（PNG 圖卡等）**：依 `gdrive-image-backup-without-base64` skill 路徑 A——以純文字 HTML 重繪視覺後用 `textContent` 上傳（`text/html`＋`disableConversionToGoogleType: true`）；PNG 原檔留在 repo／本機供實際發布，兩者互補。
- **`.skill` 檔（zip）**：內容全為純文字 → 不傳 zip 本體，改「解壓逐檔」以 `textContent` 上傳（保留原檔名與對應 MIME），並附 `README_如何還原skill檔.md`（各檔大小對照表＋兩條還原路徑：`zip -r` 重組、或直接把資料夾放進 `~/.claude/skills/`）。
- **資料夾慣例**：Drive `AllenI3Aurora/<主題>/<skill名>-skill/`，主題與既有結構對齊。每個 skill 資料夾的標準內容物：skill 逐檔備份＋`README_如何還原skill檔.md`＋測試檢視頁 HTML（`*_TestReview_日期.html`）＋（選配）示範產出的 HTML 重繪版。現況（2026-08-23）：

  ```
  AllenI3Aurora/（Drive）
  ├── podcast/
  │   ├── Podcast_CornellCard_Sample_2026-08-21.html      # 示範圖卡 HTML 重繪版
  │   └── podcast-cornell-card-skill/
  │       ├── SKILL.md · render_social_card.py · episode.sample.json
  │       ├── README_如何還原skill檔.md
  │       └── Podcast_CornellCard_Skill_TestReview_2026-08-23.html
  └── finance/
      └── taiex-heatmap-skill/
          ├── SKILL.md · taiex_heatmap.py · taiex_data.py
          │   · taiex_heatmap_bymarket.py · make_brand_asset.py · render_one.py
          ├── README_如何還原skill檔.md
          └── Taiex_Heatmap_Skill_TestReview_2026-08-23.html
  ```

## 專案概要
- 純前端靜態網站（GitHub Pages），React 透過瀏覽器端 Babel standalone 載入，無建置步驟、無後端。
- 資料層：Firestore（`aurora-data.js`）覆蓋 `kit.jsx` 內建預設；讀取失敗則保留內建值。
- 首頁 TAIEX 加權指數：盤中經證交所 MIS 即時 API（`tse_t00.tw`，透過 CORS 代理），非交易時段用證交所 OpenAPI 收盤；見 `ui_kits/aurora/Dashboard.jsx`。
- 今日關注動態（`data/focus.json`，由 `focus-update.yml`→`update-focus.mjs` 讀 Drive 產出）四來源：台股盤前速報（`finance/TSMPreBrief`→`prebrief.html`＋`data/prebrief.json`）、台股熱力圖（`finance/heatmap`→`heatmap.html`）、選股雷達（`finance/stockradar`→`stockradar.html`）、艾倫極光日報（`newsletter/day`→`daily.html`）。
- 個人年輪：整合 AllenAnnuli 網站（https://allenchen1113official.github.io/allenannuli/ ，Supabase 後端）。`annuli-live.js` 於前台載入其 `config.js`（網域授權解密）與 supabase-js，讀取大事紀＋數字統計覆蓋 `KIT.annuli`；讀取失敗退回 Firestore／內建預設。視覺沿用本站 Aurora tokens，不引入 AllenAnnuli 樣式；年輪頁附連往互動年輪與後台新增的按鈕。
- Podcast 節目系統：本機 Whisper 轉錄（`scripts/podcast/transcribe.py`）→ 後台「Podcast 節目」編修逐字稿／繁中摘要／康乃爾筆記（`aurora_podcast_episodes`）→ 前台首頁顯示最新一集摘要與筆記圖卡；康乃爾筆記可輸出 FB/IG 社群圖檔（`scripts/podcast/render_social_card.py`，比照熱力圖圖卡附品牌鎖定）；SOP 見 `docs/PODCAST_WHISPER_SOP.md`。
