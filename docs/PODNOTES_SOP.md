# 常聽 Podcast 重點筆記 SOP

常聽節目每集：Mac mini 本機下載音檔並轉錄（免費、不上傳到任何 AI 服務）→ Claude 校正逐字稿、寫康乃爾筆記與 FB／IG／Threads 三版文案、產生莫蘭迪藍品牌圖卡 → PilotOne 人工審核發布 → 前台「常聽 Podcast · 重點筆記」顯示筆記與圖卡。**逐字稿只在 Drive 與後台，不在前台公開、不放進社群文案。**

2026-11-24 Allen 決定：只做後台勾選的節目（先開 游庭皓的財經皓角、兆華與股惑仔、AI懶人報），每節目每天只做最新 1 集。

## 架構

| 階段 | 在哪裡跑 | 程式 |
|---|---|---|
| 讀 RSS、挑集數、下載音檔、轉錄草稿 | Mac mini 原生 macOS（launchd `official.allen.ytnotes` 每 15 分鐘，與常看 YouTube 共用引擎與檔案鎖） | `scripts/ytnotes/ytnotes.py`（`podscan`、`draft_podcast`）、`funasr_run.py` |
| 校正、康乃爾筆記、三平台文案、圖卡、送審包 | Claude 排程「常聽 Podcast 重點筆記｜PilotOne 送審」（`trig_01BHPcUndhA9rdPUWyxAELGW`，台北每日 11:23／22:23；**需在 Mac mini 的 Claude 桌面 App 開啟「Require this computer」**） | `scripts/podnotes/make_package.py`、`scripts/ytnotes/merge_index.py`、`scripts/podcast/render_social_card.py`（主題 `morandi-blue`） |
| 送審包 → PilotOne 草稿 | `social-publish.yml`（Drive 橋接主題家族 `pn`） | `scripts/social/drive-bridge*.mjs`、`ingest-core.mjs`（topic `pn-<集數ID>`） |
| 前台筆記＋圖卡、後台逐字稿 | `focus-update.yml`（每 3 小時） | `scripts/podnotes/update-podnotes.mjs` → `data/podnotes.json`、`assets/podnotes/`、Firestore `aurora_podcast_transcripts` |
| 前台 | GitHub Pages | `Dashboard.jsx`（首頁只放最新 1 則）、`podcast.html`（各節目最新一集＋歷期重點筆記；`?pn=<集數ID>#pn-<集數ID>` 直接展開該集圖卡） |
| 後台 | `admin/#podnotes` | `admin/podnotes.jsx`：筆記與逐字稿／轉錄進度／啟用節目 |

## 集數 ID 與選集規則

- 集數 ID＝`<節目代碼>-<台北發布日期 YYYYMMDD>`，例：`yutinghao-20261124`。節目代碼在 `scripts/podcast/feeds.json` 的 `code`。
- 每次 run 若距上次超過 30 分鐘就重讀 RSS（`podcast_scan_min`）；只看 36 小時內發布的集數（`podcast_max_age_h`），同一台北日期只取最新那一集；新啟用的節目不會補做舊集。
- 超過 180 分鐘的集數不自動處理；音檔上限 600 MB。下載直接抓 RSS 的 enclosure（不用 yt-dlp），暫存在 `~/.ytnotes/tmp`，用完即刪。
- 語言：feeds.json 的 `lang`（zh／en）；沒填才用 whisper 判斷。中文 FunASR＋熱詞＋替換規則＋OpenCC（≤15 分鐘加 whisper 第二意見），英文 mlx-whisper。
- 失敗會記進 `_engine/failed.txt`（`podcast:<集數ID>`），下一次掃描自動重試 1 次，再失敗就放棄（後台「轉錄進度」會顯示原因）。

## 啟用節目

後台「Podcast 重點筆記 → 啟用節目」勾選後存到 Firestore `aurora_podnotes/shows`（`{items:[{code, enabled}], updatedAt}`；規則：公開讀、僅管理者寫、最多 30 個）。Mac mini 引擎以 REST 免登入讀取，與網站上的 `scripts/podcast/feeds.json` 合併：後台有設定以後台為準，沒設定的節目看 feeds.json 的 `notes`。新增常聽節目＝在 feeds.json 加一筆（`show`、`code`、`feed`、`lang`、`notes`），合併到 main 後引擎與後台自動讀到。

## Drive 結構（`AllenI3Aurora/notes/podcast/`）

```
_inbox/<集數ID>/       meta.json · draft.md · draft_whisper.md（中文短集才有）· status.json（drafted → done）
_inbox/_done/          處理完的草稿資料夾
notes/                 <發布日期>_<節目>_<標題>.md（Obsidian，含逐字稿）＋同名 .txt
transcripts/<集數ID>.md 後台逐字稿（focus-update 同步到 Firestore 管理者唯讀集合）
index.json · 索引.md   前台索引（merge_index.py；不含逐字稿）
<YYYYMMDD>/pilotone/<集數ID>/  送審包：manifest.json（topic pn-<集數ID>）· fb/ig/threads.txt · PodNotes_<集數ID>_FB.png（1200×630）· _IG.png（1080×1080）
```

引擎的檔案（`ytnotes.py` 等）、佇列（`_engine/pod_queue.json`）、紀錄（`pod_seen.json`、`run.log`、`failed.txt`）、詞庫都與常看 YouTube 共用 `notes/youtube/_engine/` 與 `notes/youtube/詞庫/`。**引擎部署**：launchd 跑的是 Drive `notes/youtube/_engine/ytnotes.py`。Podcast 筆記排程每次執行先比對 repo 與 Drive 的 `ytnotes.py`／`funasr_run.py` 雜湊，不同就經 Mac mini 寫入新版並記進 `_engine/versions.txt`，所以合併到 main 後最慢下一次排程就部署。送審包程式（`make_package.py`、`render_social_card.py`、`merge_index.py`）排程直接用 repo 版本，不需複製。

## note.json（Claude 撰寫）與文案規則

`make_package.py` 開頭有完整格式。重點：
- `headline` 依 Allen 的下標準則（具體數字、給點進來的理由、點名受眾、可用為什麼／如何、與內文相符不做標題黨）。
- `summary` 3～5 行；`cornell.rows` 4～6 列＋`cornell.summary` 一句話總結。
- `posts.fb`／`posts.ig`／`posts.threads` **三版各自撰寫、不可相同**：FB 鉤子開頭＋條列重點＋互動提問；IG 第一行抓人、短句分行、收藏分享召喚、不放網址；Threads 口語有觀點、精簡。程式自動補品牌列、日期、節目來源、網站筆記連結（FB／Threads）、收聽連結（FB）、免責聲明與 hashtag，並驗證 IG ≤2,200 字元、hashtag ≤30、Threads ≤500 字元。
- 文案與圖卡只放**自己的話寫的重點筆記**＋原節目連結；逐字稿不放進文案、不上網站、不重新上傳原音檔。

## 送審與發布

Drive 橋接讀台北今天＋昨天的 `notes/podcast/<YYYYMMDD>/pilotone/*/`，每集一筆草稿 `cs_pn-<集數ID>_<YYYYMMDD>`（預設草稿，不自動發）。PilotOne 中控台「編輯內容」的連結空白時預設帶入網站該集筆記 `podcast.html?pn=<集數ID>#pn-<集數ID>`。Allen 在 PilotOne 核准後才發布。

## 測試

`python3 -m unittest scripts/ytnotes/test_podcast.py scripts/podnotes/test_package.py`（RSS 解析、每天最新 1 集、啟用設定合併、失敗重試、進度面板、送審包驗證）、`node --test scripts/podnotes/podnotes.test.mjs scripts/social/bridge.test.mjs`（前台資料不含逐字稿、圖卡路徑、逐字稿解析、規則／workflow／引擎接線、主題家族 pn）。
