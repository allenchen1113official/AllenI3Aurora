# 常看 YouTube 重點筆記 SOP

影片在 Mac mini 本機下載、轉錄（免費、不上傳影片到任何 AI 服務）→ Claude 校正成逐字稿與重點筆記 → Obsidian 筆記＋Drive 純文字副本 → 品牌圖卡與 FB／IG／Threads 文案送 PilotOne 審核 → 首頁「常看 YouTube · 重點筆記」。

## 架構

| 階段 | 在哪裡跑 | 程式 |
|---|---|---|
| 下載、判斷語言、轉錄草稿 | Mac mini 原生 macOS（launchd 每 15 分鐘） | `scripts/ytnotes/ytnotes.py`、`funasr_run.py`（安裝 `install.sh`） |
| 校正、筆記、圖卡、文案、送審包 | Claude（對話中丟連結，或每日排程） | `make_package.py`、`merge_index.py`、`scripts/podcast/render_social_card.py` |
| 送審包 → PilotOne 草稿 | `social-publish.yml`（Drive 橋接主題家族 `yt-<影片ID>`） | `scripts/social/drive-bridge*.mjs`、`ingest-core.mjs` |
| 首頁區塊 | `focus-update.yml`（每 3 小時） | `scripts/ytnotes/update-ytnotes.mjs` → `data/ytnotes.json` → `Dashboard.jsx` `YouTubeNotes` |

> Claude 的 device_bash 是 Mac mini 上的 Linux VM，連不到 YouTube、也跑不了 mlx-whisper，所以下載與轉錄一定在 macOS 本體由 launchd 執行；Claude 只讀寫 Drive 上的草稿與成品。

## Drive 結構（`AllenI3Aurora/notes/youtube/`）

```
_engine/        ytnotes.py · funasr_run.py · install.sh · make_package.py · merge_index.py · render_social_card.py
                config.json（選用） · queue.txt（待處理網址） · seen.json · failed.txt · run.log · versions.txt
_inbox/<影片ID>/ meta.json · draft.md · draft_whisper.md · frames/ · status.json（drafted → done）
_inbox/_done/   處理完的草稿資料夾
詞庫/           熱詞.txt · 替換規則.tsv（錯→對，Tab 分隔） · 校正紀錄.md
notes/          <發布日期>_<作者>_<標題>.md（Obsidian）＋同名 .txt（Drive 純文字）
channels.tsv    常看頻道（手動備用）：網址<Tab>名稱<Tab>啟用(1/0)；主要清單改在後台維護
index.json      首頁索引（merge_index.py）  索引.md  一支一行
<YYYYMMDD>/pilotone/<影片ID>/  送審包：manifest.json（topic yt-<影片ID>）· fb/ig/threads.txt · 圖卡
```

## 安裝（Mac mini，一次）

在「終端機」執行：

```bash
bash "$HOME/Library/CloudStorage/GoogleDrive-allenchen1113.official@gmail.com/我的雲端硬碟/AllenI3Aurora/notes/youtube/_engine/install.sh"
```

裝 yt-dlp、ffmpeg、uv、mlx-whisper（3.12）、FunASR 虛擬環境（3.11，`~/.ytnotes/funasr-venv`）、預先下載模型（約 3.6 GB），並註冊 launchd `official.allen.ytnotes`。macOS 若問「要取用 Google Drive 中的檔案」請按允許。版本記在 `_engine/versions.txt`。

## 常看頻道（後台維護）

後台「YouTube 頻道 → 常看頻道」（`admin/#youtube`，`admin/youtube.jsx` 的 `FollowChannels`）新增、暫停、改名、排序、移除頻道，存在 Firestore `aurora_ytnotes/channels`（`{items:[{url,name,enabled,addedAt}], updatedAt}`；規則：公開讀、僅管理者寫、最多 50 個）。

- Mac mini 的 `ytnotes.py` 每天台北 06:00 後第一次 `run` 掃頻道時，以 Firestore REST（免登入，`config.json` 的 `channels_url` 可改或設 `""` 停用）讀這份清單，與 `channels.tsv` 合併：同一頻道以後台為準，`channels.tsv` 只補後台沒有的。
- 讀取成功會寫快取 `_engine/channels.remote.tsv`；網路失敗時改用快取，不會因斷線漏掃。
- 網址正規化兩邊一致（`channel_key`／`channelKey`）：`@handle`、`/channel/UC…`、`/c/…`、`/user/…` 自動補 `/videos`；Shorts 另加 `…/shorts`；單支影片、播放清單不接受。
- 後台存檔後最慢到隔天 06:00 後才生效；要馬上掃可在 Mac mini 執行 `python3 ytnotes.py scan`。

## 規則

- 下載挑最低畫質；長片只抓音訊；≤60 秒短影音抓 480p 並截 4 張畫面。暫存在 `~/.ytnotes/tmp`，用完即刪。
- 語言：中段 30 秒給 whisper 判斷；聽到的字太少看標題。
- 中文：FunASR＋熱詞，轉完套替換規則、OpenCC s2twp；≤15 分鐘再跑 whisper 當第二意見。英文：YouTube 人工字幕優先（自動字幕不算），沒有才用 whisper。
- 校正：修錯字、同音字、標點、斷句；去口吃與「嗯」「呃」但保留口氣；拿不準標【?猜測】，聽不到標【聽不清】，不硬編。
- 社群貼文只放**自己的話寫的重點筆記**＋原片連結；逐字稿只存在筆記，不公開貼、不重新上傳原片。
- 頻道掃描：新加入的頻道第一次只建立基準（不灌舊片）；超過 180 分鐘的影片不自動處理；每輪最多 20 支；下載失敗記進 `failed.txt` 後跳過（先 `brew upgrade yt-dlp`）。
- 一次只跑一個轉錄（檔案鎖）；FunASR 約吃 3 GB 記憶體。

## 送審

`make_package.py` 產生 `manifest.json`（`topic: "yt-<影片ID>"`、`autoPublish: false`、`verified: true`），FB 用 1200×630、IG／Threads 用 1080×1080 康乃爾筆記圖卡（艾倫報報品牌鎖定）。Drive 橋接讀台北今天＋昨天的 `notes/youtube/<YYYYMMDD>/pilotone/*/`，同一天每支影片各一筆草稿（`cs_yt-<影片ID>_<YYYYMMDD>`），Allen 在 PilotOne 核准後才發布。

## 測試

`node --test scripts/social/bridge.test.mjs scripts/ytnotes/ytnotes.test.mjs`（含常看頻道規則白名單比對）、`python3 -m unittest scripts/ytnotes/test_channels.py`
