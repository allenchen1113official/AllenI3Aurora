---
name: podcast-cornell-card
description: 把一集 Podcast 的康乃爾重點筆記（線索／筆記／總結）渲染成可直接發社群的圖檔：Facebook(1200x630) 與 Instagram(1080x1080)，深色極光風、右下角附「艾倫報報 ALLEN I³ AURORA」品牌圖卡（與台股熱力圖圖卡同款品牌鎖定）。當使用者要求「podcast 筆記圖卡」「康乃爾筆記圖卡」「節目重點圖卡」「把這集摘要／筆記做成 FB/IG 圖」，或提供一集節目的摘要、逐字稿、筆記想輸出成社群圖檔時，務必使用此 skill，即使只說「幫這集做張分享圖」也要優先用這個 skill 而非從零設計。
---

# Podcast 康乃爾筆記社群圖卡

## 這個 skill 在做什麼

用 Python（Pillow）把一集 Podcast 的康乃爾筆記渲染成兩張社群圖檔：色系與版面採「艾倫報報」網站前台同款深色極光風 —— 頁首（CORNELL NOTES 標籤＋節目／集數／日期）→ 康乃爾兩欄（左欄線索 CUES 極光綠粗體、右欄筆記 NOTES）→ 底部總結 SUMMARY 面板 → 右下角品牌鎖定（漸層 AI³A 圖示＋艾倫報報／ALLEN I³ AURORA）。

這是經過使用者驗收的成熟版本。`scripts/render_social_card.py` 內的排版邏輯（CJK 逐字換行含避頭點、超長截斷、列數放不下的「…及另外 N 個重點」註記、內容偏少時自動均分行距、字型自動解決）都已調校過，**照抄執行即可，不要重新設計版面或配色**，除非使用者明確要求調整外觀。

同一套流程在網站 repo（AllenI3Aurora）內也有一份：`scripts/podcast/render_social_card.py`（輸出至 `assets/podcast/`）。若當前工作目錄就是該 repo，直接用 repo 內那份並讓產出進版控；否則用本 skill 附帶的 scripts。

## 執行步驟

### 1. 準備工作目錄

把 `scripts/` 內的 `render_social_card.py`（與參考用 `episode.sample.json`）複製到本次任務的輸出資料夾，在該資料夾內執行。複製後檔案可能唯讀，先 `chmod u+w *.py`。需要 Pillow：`pip install pillow`（一次性）。

### 2. 準備一集的 episode JSON

欄位與後台「Podcast 節目」一致（後台「預覽筆記圖卡」分頁可直接「⬇ 匯出本集 JSON」）：

```json
{
  "show": "節目名稱", "title": "EP.集數標題", "date": "2026.08.21", "duration": "58m",
  "tone": "insight",
  "summary": "繁中摘要（總結留空時圖卡底部沿用此欄）",
  "cornell": {
    "rows": [ { "cue": "線索／關鍵字", "note": "對應的重點一兩句" } ],
    "summary": "底部總結，2–3 句"
  }
}
```

內容從何而來（依情境）：
- 使用者給了現成 JSON（後台匯出）→ 直接用。
- 使用者給了摘要／筆記文字 → 整理成上述結構；`cue` 要短（2–6 字關鍵詞），`note` 一兩句完整白話。
- 使用者只給逐字稿 → 先依逐字稿撰寫繁中摘要與康乃爾筆記再填入。**只根據使用者提供的內容整理，不要編造節目裡沒有的論點**——筆記圖卡會被公開發布，錯誤內容會被聽過節目的人一眼看穿。

版面容量（超過會自動截斷或省略，不是錯誤，但最好一開始就裁到剛好）：
- rows 建議 3–6 列；FB 版每列筆記最多 2 行、IG 版 3 行，過長自動加「…」。
- 放不下的列會以「…及另外 N 個重點」註記；總結 FB 2 行／IG 3 行。
- `tone` 決定線索欄與總結色條顏色：`insight` 綠（預設）、`intelligence` 藍、`illumination` 金。

### 3. 執行

```bash
python3 render_social_card.py --episode 本集.json                  # FB+IG 皆出
python3 render_social_card.py --episode 本集.json --stem ep123     # 自訂檔名字首
python3 render_social_card.py --formats fb --episode 本集.json     # 只出其中一種
python3 render_social_card.py                                      # 不帶參數＝內建示範集（試跑驗環境）
```

輸出 `{stem}-fb.png`（1200×630）與 `{stem}-ig.png`（1080×1080），預設 stem 為 `podcast-cornell`、輸出至目前目錄（`--outdir` 可改）。

中文字型自動依序尋找系統 Noto Sans CJK／PingFang／文泉驛；都沒有時自動從 fonts.gstatic.com 下載 Noto Sans TC 到腳本同層 `.fonts/`（沙盒的 HTTPS 代理可通）。下載失敗且無任何 CJK 字型時腳本會明確報錯——此時不要改用預設字型硬渲染（中文會變豆腐格）。

### 4. 驗證（產圖後必做）

用 Read 工具檢視兩張圖，逐一確認：
- 節目名、集數標題、日期、長度正確（就是使用者給的那一集，不是示範集）
- 線索欄與筆記欄文字沒有互相重疊、沒有超出邊界；「。」等標點沒有單獨成行
- 底部總結面板存在且文字完整（或合理截斷）
- 右下角有「艾倫報報 ALLEN I³ AURORA」品牌圖卡
- 若列數被截斷，畫面有「…及另外 N 個重點」註記；截掉太多（>2 列）時，建議精簡 rows 重出

有瑕疵就修 JSON 或重跑，不要交付有明顯排版問題的圖檔。

### 5. 交付

用 present_files／SendUserFile 附上兩張圖卡，簡短說明內容出處（後台匯出／依逐字稿整理），不需贅述繪圖技術細節。

### 6.（選配）備份到 Google Drive

使用者要求「上傳雲端硬碟／備份 Drive」時：PNG **不要**用 base64 經 create_file 上傳（>5KB 必損毀），改依 `gdrive-image-backup-without-base64` skill 的路徑 A——把圖卡內容以純文字 HTML 重繪後用 `textContent` 上傳（`contentMimeType: text/html`、`disableConversionToGoogleType: true`），目標資料夾為 Drive 的 `AllenI3Aurora/podcast/`。上傳後比對回傳 `fileSize` 與本機檔案大小一致才算完成。PNG 原檔保留本機（或 repo `assets/podcast/`）供實際發布。

## 已知環境限制（省時間用）

- 無外網呼叫 Podcast 平台 API；逐字稿由使用者提供，或依 repo 的 `docs/PODCAST_WHISPER_SOP.md` 在本機以 Whisper 轉錄。
- 沙盒通常沒有 Noto CJK／Poppins，首次執行會自動下載字型（約 14MB），屬正常；同一工作目錄重跑會用 `.fonts/` 快取。
- 圖卡渲染極快（單張 <2 秒），逾時多半是字型下載——重跑同指令即可續用已下載的部分。
