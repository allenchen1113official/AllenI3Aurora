---
name: "podcast-merged-notes"
description: "產出「常聽 Podcast × 最新一集重點筆記」合併區塊：把多個 Podcast 節目的各集 JSON（繁中摘要＋康乃爾筆記＋收聽連結）依節目分組、各取最新一集、日期排序並標記全站最新，輸出可貼回艾倫報報前台 kit.jsx 的 podcastEpisodes 陣列片段、合併結果 JSON、以及 Aurora 深色風格的合併區塊 HTML 預覽。當使用者要求「更新常聽 Podcast 筆記區塊」「新增一集 Podcast 摘要／康乃爾筆記到首頁」「產出 podcastEpisodes 資料」「預覽 Podcast 合併區塊」，或整理完 Whisper 逐字稿要把多集節目筆記合併上架時，務必使用此 skill，即使使用者只說「幫我把這幾集 Podcast 筆記整理上首頁」也要優先用這個 skill 而非從零設計。"
---

## 這個 skill 在做什麼

艾倫報報（Allen I³ Aurora）首頁右欄的「常聽 Podcast · 重點筆記」是一個合併區塊：每個常聽節目各顯示最新一集的繁中摘要卡（可展開一頁康乃爾筆記圖卡＋前往收聽連結），全站最新的一集加「最新一集」標記，尚無集數的常聽節目退回精簡連結卡殿後。

本 skill 用一支純標準函式庫的 Python 腳本（`scripts/build_merged_notes.py`）把「各集節目 JSON ＋ 常聽清單」合併計算，一次產出四個檔案：

| 產出 | 用途 |
| --- | --- |
| `merged.json` | 合併計算結果（排序、配對、最新標記），機器可讀、供核對 |
| `podcast_episodes.snippet.js` | 可直接取代 `ui_kits/aurora/kit.jsx` 內 `podcastEpisodes:` 的陣列值；亦可逐筆貼進後台 Firestore `aurora_podcast_episodes` |
| `podcasts.snippet.js` | 常聽清單片段（title 已剝除平台後綴），可取代 kit.jsx 內 `podcasts:` 的陣列值或貼進 Firestore `aurora_podcasts`（有給 `--shows` 才產出） |
| `merged_preview.html` | Aurora 深色風格的合併區塊靜態預覽（摘要卡＋可展開康乃爾筆記圖卡＋最新標記＋連結卡），交付前目視驗證用 |

腳本內的合併邏輯與前台 `ui_kits/aurora/Dashboard.jsx` 的 `mergedPodcastList()` **完全一致、已經使用者驗收**（草稿過濾、依 show 分組取最新、日期數字化排序同日比 sort、清單標題破折號前段與 show 互含配對、無集數退回連結卡、非常聽節目附加顯示），**照抄執行即可，不要重新設計合併或排版邏輯**，除非使用者明確要求調整。

社群圖檔（FB 1200×630／IG 1080×1080 康乃爾圖卡）不是本 skill 的範圍——那是 `podcast-cornell-card` skill（`render_social_card.py`）的工作，需要時提醒使用者接續使用。

## 執行步驟

### 1. 準備工作目錄與輸入

把 `scripts/build_merged_notes.py` 複製到本次任務的輸出資料夾（複製後可能唯讀，必要時 `chmod u+w`）。準備兩種輸入：

**各集節目 JSON**（一集一檔，放同一資料夾；欄位比照 `episodes.sample/` 內三個範例檔）：

```json
{
  "show": "股癌 Gooaye",            ← 必填，配對與分組的 key
  "title": "EP.整理盤心法",
  "date": "2026.08.21",             ← 必填，排序依據（數字化比大小）
  "duration": "58m",
  "tone": "insight",                ← insight / intelligence / illumination 三選一
  "url": "https://…",               ← 「前往收聽」連結
  "status": "published",            ← draft 會被過濾、不顯示
  "summary": "繁中摘要…",
  "cornell": { "rows": [{"cue": "…", "note": "…"}, …], "summary": "總結…" }
}
```

摘要與康乃爾筆記的內容來源照既有 SOP：本機 Whisper 轉錄逐字稿（repo 的 `scripts/podcast/transcribe.py`，見 `docs/PODCAST_WHISPER_SOP.md`）→ 依逐字稿撰寫（或 AI 代擬後人工校對）。**沒有逐字稿依據時不要編造集數內容**——寧可只填 show/url 讓該節目以連結卡呈現。

**常聽清單 shows.json**（陣列；欄位比照 `shows.sample.json`，範例已含 8 個實際常聽節目與查證過的官方連結）：`title`（節目名，可含「— 集名」後綴，配對取破折號前段）、`meta`、`tone`、`url`。這份清單決定哪些節目「即使沒有集數也要顯示（連結卡）」；省略 `--shows` 則只顯示有集數的節目。

兩個實務要點：

- **平台後綴自動剝除**：從 Spotify 等平台頁複製的名稱常帶「`| Podcast on Spotify`」後綴（如「AI懶人報 | Podcast on Spotify」），配對與顯示前會自動剝除，直接照貼即可、不必手動清理。
- **未提供筆記及摘要的節目屬正常**：清單中沒有集數 JSON 的節目（例如財經一路發、兆華與股惑仔、AI懶人報、游庭皓的財經皓角、Acquired 這類尚未做筆記的常聽節目）會以精簡連結卡呈現、殿後，執行時以 `[資訊]` 逐一列出——這是設計行為，不是錯誤；之後補上該節目的集數 JSON 重跑即自動升級為摘要卡。**絕不要為了補滿摘要卡而編造集數內容**；節目的收聽連結要查證官方來源（Spotify show 頁、官網），不可虛構網址。

### 2. 執行程式

```bash
python3 build_merged_notes.py --episodes <集數資料夾> --shows shows.json
```

- `--episodes` 可給資料夾或多個 `.json` 檔；`--outdir` 可改輸出目錄（預設目前目錄）。
- 執行時會逐檔檢核欄位並印出 `[提醒]`（缺 show／date／summary、tone 不合法、無康乃爾筆記等），以及最終合併順序清單。提醒不會中止執行，但**每一條都要看過**，屬資料疏漏就補檔重跑。

### 3. 套用產出

依使用者情境擇一（或都做）：

- **內建預設**：把 `podcast_episodes.snippet.js` 的陣列貼回 repo `ui_kits/aurora/kit.jsx` 的 `podcastEpisodes:`、`podcasts.snippet.js` 的陣列貼回 `podcasts:`（JSON 即合法 JS 字面值）。改完照 repo 慣例 `npx oxlint -c _adherence.oxlintrc.json` 驗證再 commit。
- **後台資料**：逐筆貼進 Firestore `aurora_podcast_episodes`（一集一份文件），前台會自動覆蓋內建預設。
- **預覽確認**：把 `merged_preview.html` 交給使用者（或以 Read 目視）確認版面與內容。

## 產後驗證清單

用 Read 檢視 `merged.json` 與 `merged_preview.html`，逐一確認：

- 每個常聽節目各恰好一張摘要卡（同節目多集時只留最新一集，舊集不得出現）
- 摘要卡依日期新→舊排序；**只有第一張**掛「最新一集」標記
- 草稿（`status: "draft"`）的集數完全沒有出現
- 常聽清單中沒有集數的節目，以連結卡形式排在所有摘要卡之後，且執行輸出的 `[資訊]` 清單與連結卡一一對應
- 連結卡與 `podcasts.snippet.js` 的節目名沒有殘留「| Podcast on …」平台後綴
- 每張摘要卡展開後：康乃爾圖卡有「線索 CUES／筆記 NOTES」兩欄與「總結 SUMMARY」，右上有「艾倫報報 · Allen I³ Aurora」品牌字樣
- 有 `url` 的卡片「前往收聽」連結正確；中文、全形符號、長內容沒有亂碼或溢出
- `podcast_episodes.snippet.js` 的 `sort` 已依合併順序重編、每筆都有 `status: "published"`

若有瑕疵，修正輸入 JSON 後重跑，不要交付含錯誤配對或漏標記的產出。

## 已知環境限制

- 腳本只用 Python 標準函式庫，任何有 `python3` 的環境皆可跑，無需網路、無需安裝套件。
- 與 repo 完全解耦：輸出預設在目前目錄，套回 kit.jsx／Firestore 是人工（或後續指令）步驟。
- 配對規則是「清單 title（剝除平台後綴後）破折號前段 ↔ 集數 show 互含（不分大小寫）」；若節目名寫法差異太大（如簡稱 vs 全名）仍會配對不到、變成一張連結卡＋一張獨立摘要卡——把 shows.json 的 title 或集數的 show 改成互含的寫法即可。
- 預覽 HTML 的展開用 `<details>`，任何瀏覽器可開；它是驗證用示意，前台實際樣式以 `Dashboard.jsx` 為準。
