# 協作備忘（永久記憶）

## 工作流程偏好
- **驗證成功後，直接合併／commit 到 `main`，不需每次詢問或提醒。**
  - 仍照常在功能分支開發、推送、開 PR。
  - 驗證通過（語法解析／邏輯檢查／可行的測試）後，即自行將該 PR 合併進 `main`，不必等待再次確認。
- 回報保持精簡，不重複提醒既定的合併流程。

## 時區規則（全站統一台北時間 UTC+8）
- **本站所有「今天／當日／交易日／星期」一律以台北時間（`Asia/Taipei`，UTC+8）為準。** 雲端執行環境給的 today 是 UTC，不可直接使用——台北 08:00 以前 UTC 仍是前一天，直接用會讓日期差一天。
- **Shell**：一律 `TZ=Asia/Taipei date +%Y%m%d`（資料夾名）／`+%Y-%m-%d`（檔名）／`+%Y.%m.%d`（`data/*.json` 的 `date`）／`+%u`（星期），不要用不帶 TZ 的 `date`。
- **Node 腳本**：日期用 `Intl.DateTimeFormat(..., { timeZone: "Asia/Taipei" })` 或 `Date.now() + 8*3600*1000` 再取 UTC 欄位（既有 `update-*.mjs`／`rotate-*.mjs` 皆已照此實作）；新腳本比照，勿用 `new Date().toISOString().slice(0,10)` 當「今天」。`updatedAt` 這類時間戳可維持 ISO UTC。
- **換日腳本**：排程或手動執行 `rotate-daily.mjs`／`rotate-heatmap.mjs` 時，盡量明確帶入台北日期參數或 payload 日期，不依賴預設值。
- **GitHub Actions cron 一律為 UTC**：新增或修改排程時，換算台北時間（UTC = 台北 − 8 小時），並在該行註解寫出對應的台北時間（如 `"0 0 * * *"   # 台北每日 08:00`）。注意跨日：台北 08:00 以前的排程，UTC 的星期會是前一天（如台北週一 04:00＝UTC 週日 20:00）。
- **Claude 排程任務**：cron 以 `CRON_TZ=Asia/Taipei` 撰寫；任務指令開頭須寫明「先用 `TZ=Asia/Taipei date` 取得台北日期，環境 today 是 UTC 不可直接用」。

## Skill 建立與測試流程（把可重複的產出流程打包成 skill 時照此做）
1. **建立**：以 `skill-creator` skill 進行；形式比照 `taiex-heatmap` —— `SKILL.md`（觸發時機寫進 frontmatter description、執行步驟、產後驗證清單、已知環境限制）＋ `scripts/`（把本次調校好的程式原樣打包，並註明「照抄執行、不要重新設計」）。附 `episode/data` 範例檔供試跑。腳本要與 repo 解耦（輸出預設目前目錄、相依自動解決如字型自動下載）。
2. **測試**：在乾淨目錄照 SKILL.md 步驟實跑，至少兩案例 —— 正常範例＋壓力案例（長內容、截斷、非預設參數），用 Read 目視驗證產出。
3. **檢視**：測試結果整理成 eval workspace（`iteration-N/eval-X/with_skill/outputs/`＋`eval_metadata.json` 斷言），用 skill-creator 的 `eval-viewer/generate_review.py --static` 產靜態檢視頁交給使用者過目；有 feedback 就迭代。
4. **封裝交付**：`python -m scripts.package_skill <skill目錄>`（於 skill-creator 目錄下執行；`.skill` 會產在該處，記得搬走、排除 `__pycache__`），以檔案卡片附給使用者按「Save skill」安裝。

## Skill 與二進位產出備份到 Google Drive（照此做，已驗證兩次）
- **鐵則**：超過約 5KB 的二進位絕不用 base64 經 `create_file` 上傳（助手輸出高熵字串必漂移損毀）；每次上傳後必比對回傳 `fileSize` 與本機位元組數，完全一致才算完成。
- **圖檔（PNG 圖卡等）**：依 `gdrive-image-backup-without-base64` skill 路徑 A——以純文字 HTML 重繪視覺後用 `textContent` 上傳（`text/html`＋`disableConversionToGoogleType: true`）；PNG 原檔留在 repo／本機供實際發布，兩者互補。
- **`.skill` 檔（zip）**：內容全為純文字 → 不傳 zip 本體，改「解壓逐檔」以 `textContent` 上傳（保留原檔名與對應 MIME），並附 `README_如何還原skill檔.md`（各檔大小對照表＋兩條還原路徑：`zip -r` 重組、或直接把資料夾放進 `~/.claude/skills/`）。
- **資料夾慣例**：Drive `AllenI3Aurora/<主題>/<skill名>-skill/`，主題與既有結構對齊。每個 skill 資料夾的標準內容物：skill 逐檔備份＋`README_如何還原skill檔.md`＋測試檢視頁 HTML（`*_TestReview_日期.html`）＋（選配）示範產出的 HTML 重繪版。現況（2026-08-25）：

  ```
  AllenI3Aurora/（Drive）
  ├── podcast/
  │   ├── Podcast_CornellCard_Sample_2026-08-21.html      # 示範圖卡 HTML 重繪版
  │   └── podcast-cornell-card-skill/
  │       ├── SKILL.md · render_social_card.py · episode.sample.json
  │       ├── README_如何還原skill檔.md
  │       └── Podcast_CornellCard_Skill_TestReview_2026-08-23.html
  └── finance/
      ├── taiex-heatmap-skill/
      │   ├── SKILL.md · taiex_heatmap.py · taiex_data.py
      │   │   · taiex_heatmap_bymarket.py · make_brand_asset.py · render_one.py
      │   ├── README_如何還原skill檔.md
      │   └── Taiex_Heatmap_Skill_TestReview_2026-08-23.html
      └── prebrief-card-skill/                # 盤前速報品牌圖卡（repo scripts/prebrief/ 打包版）
          ├── SKILL.md · render_prebrief_card.py
          ├── README_如何還原skill檔.md
          ├── Prebrief_Card_Skill_TestReview_2026-08-25.html
          └── Prebrief_Card_Sample_2026-08-25.html   # 示範圖卡 HTML 重繪版
  ```

## 專案概要
- 純前端靜態網站（GitHub Pages），React 透過瀏覽器端 Babel standalone 載入，無建置步驟、無後端。
- 資料層：Firestore（`aurora-data.js`）覆蓋 `kit.jsx` 內建預設；讀取失敗則保留內建值。
- 首頁 TAIEX 加權指數：盤中經證交所 MIS 即時 API（`tse_t00.tw`，透過 CORS 代理），非交易時段用證交所 OpenAPI 收盤；見 `ui_kits/aurora/Dashboard.jsx`。
- 今日關注動態（`data/focus.json`，由 `focus-update.yml`→`update-focus.mjs` 讀 Drive 產出）四來源：台股盤前速報（`finance/TSMPreBrief`→`prebrief.html`＋`data/prebrief.json`；當日 Drive 圖卡優先、無則退回 `assets/prebrief/prebrief-card.png` 品牌圖卡（`scripts/prebrief/render_prebrief_card.py` 產出），換日時前一日移入 `data/prebrief-archive.json`，歷期彙整頁以 kind「盤前速報」呈現）、台股熱力圖（`finance/heatmap`→`heatmap.html`）、選股雷達（`finance/stockradar`→`stockradar.html`）、艾倫極光日報（`newsletter/day`→`daily.html`）。
- 個人年輪：整合 AllenAnnuli 網站（https://allenchen1113official.github.io/allenannuli/ ，Supabase 後端）。`annuli-live.js` 於前台載入其 `config.js`（網域授權解密）與 supabase-js，讀取大事紀＋數字統計覆蓋 `KIT.annuli`；讀取失敗先退回 `data/annuli.json`（`annuli-update.yml`→`update-annuli.mjs` 每日台北凌晨 01:00 同步的快照，Node 端以與瀏覽器相同流程解密 config.js、免 Secret），再退 Firestore／內建預設。首頁右下角年輪卡僅顯示年度（年度晶片＋同步狀態註記；點選年度展開該年度紀事、再點收合，見 `Dashboard.jsx` 的 `AnnuliYearsCard`）。視覺沿用本站 Aurora tokens，不引入 AllenAnnuli 樣式；年輪頁附連往互動年輪與後台新增的按鈕。
- Podcast 節目系統：本機 Whisper 轉錄（`scripts/podcast/transcribe.py`）→ 後台「Podcast 節目」編修逐字稿／繁中摘要／康乃爾筆記（`aurora_podcast_episodes`）→ 前台首頁「常聽 Podcast · 重點筆記」合併區塊依 show 分組、每個常聽節目各顯示最新一集摘要與筆記圖卡（無集數者退回精簡連結卡）；康乃爾筆記可輸出 FB/IG 社群圖檔（`scripts/podcast/render_social_card.py`，比照熱力圖圖卡附品牌鎖定）；SOP 見 `docs/PODCAST_WHISPER_SOP.md`。
- 電子報訂閱（Double Opt-in）：`aurora_subscribers` **doc id = 32 字元私密 token**（讀者信中連結的自助憑證；規則開放單筆 get、禁止 list）。前台 `subscriber-data.js`＋`Subscribe.jsx` 建立 `pending`→`subscriber-mail.yml` 每 10 分鐘執行 `scripts/mail/send-transactional.mjs` 寄確認信→`confirm.html` 轉 `confirmed`→歡迎信；`manage.html` 偏好中心（改節奏／退訂／復訂）；**不提供「輸入 Email 即退訂」**（會讓人退訂別人、探測名單）。本期電子報 `newsletter-send.yml` 手動觸發 `send-issue.mjs`（dry_run→test_to→正式；`aurora_campaigns/{期別}-{期號}` 記已寄名單，重跑不重複；草稿／未到時間的排程不寄）。版型 `scripts/mail/template.mjs`（Outlook 不支援漸層與 rgba，一律實色打底）。純邏輯在 `scripts/mail/core.mjs`，測試 `node --test scripts/mail/mail.test.mjs scripts/mail/rules-shape.test.mjs`（後者靜態比對前台／後台寫入 payload 與 `firestore.rules` 白名單，改規則或改寫入欄位時必跑——本環境無法起 Firestore 模擬器）。舊格式（doc id = email）由 worker 首次執行自動搬遷。個資告知頁 `privacy.html`。SOP 見 `docs/SUBSCRIBER_SOP.md`。
- 社群自動發文（第一階段 FB）：後台「社群發文」審核 `aurora_social_posts`（電子報 FB 分頁可一鍵送審）→ `social-publish.yml` 每 10 分鐘執行 `scripts/social/publish-social-posts.mjs`（狀態機在 `core.mjs`，20 分鐘～29 天內交給 Meta 原生排程，其餘到期立即發；transaction 鎖＋結果不明不重送）。Token 只在 Secrets（`META_PAGE_TOKEN`／`META_PAGE_ID`），服務帳戶需加「Cloud Datastore 使用者」角色；測試 `node --test scripts/social/publish.test.mjs`；SOP 見 `docs/SOCIAL_SOP.md`。IG 為第二階段。
