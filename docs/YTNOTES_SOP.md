# 常看 YouTube 重點筆記 SOP

> 2026-11-24 起同一引擎也處理「常聽 Podcast 重點筆記」（RSS 音檔），見 `docs/PODNOTES_SOP.md`；共用 `_engine/`、詞庫、檔案鎖與進度檔。

影片在 Mac mini 本機下載、轉錄（免費、不上傳影片到任何 AI 服務）→ Claude 校正成逐字稿與重點筆記 → Obsidian 筆記＋Drive 純文字副本 → 品牌圖卡與 FB／IG／Threads 文案送 PilotOne 審核 → 首頁「常看 YouTube · 重點筆記」。

## 架構

| 階段 | 在哪裡跑 | 程式 |
|---|---|---|
| 下載、判斷語言、轉錄草稿 | Mac mini 原生 macOS（launchd 每 15 分鐘） | `scripts/ytnotes/ytnotes.py`、`funasr_run.py`（安裝 `install.sh`） |
| 校正、筆記、圖卡、文案、送審包 | Claude（對話中丟連結，或每日排程） | `make_package.py`、`merge_index.py`、`scripts/podcast/render_social_card.py` |
| 送審包 → PilotOne 草稿 | `social-publish.yml`（Drive 橋接主題家族 `yt-<影片ID>`） | `scripts/social/drive-bridge*.mjs`、`ingest-core.mjs` |
| 首頁區塊 | `focus-update.yml`（每 3 小時） | `scripts/ytnotes/update-ytnotes.mjs` → `data/ytnotes.json` → `Dashboard.jsx` `YouTubeNotes`（首頁只放最新 1 則，「更多筆記」連到 `ytnotes.html` 全部清單） |
| 指定單支影片 | 後台「YouTube 頻道 → 筆記影片」→ Mac mini 每次 run 讀取 | `admin/youtube.jsx` `NoteVideos` → Firestore `aurora_ytnotes/videos` → `ytnotes.py` `sync_remote_videos()` → `queue.txt` |
| 轉錄進度面板 | Mac mini 寫進度檔 → `social-publish.yml` 每 2 分鐘同步 | `ytnotes.py`（`progress.json`）→ `scripts/ytnotes/sync-progress.mjs` → Firestore `aurora_ops/ytnotes_progress` → PilotOne 中控台「YouTube 轉錄」 |

> Claude 的 device_bash 是 Mac mini 上的 Linux VM，連不到 YouTube、也跑不了 mlx-whisper，所以下載與轉錄一定在 macOS 本體由 launchd 執行；Claude 只讀寫 Drive 上的草稿與成品。

## Drive 結構（`AllenI3Aurora/notes/youtube/`）

```
_engine/        ytnotes.py · funasr_run.py · install.sh · make_package.py · merge_index.py · render_social_card.py
                config.json（選用） · queue.txt（待處理網址，純文字一行一個；不是 Google 文件） · videos.remote.json（後台筆記影片同步紀錄） · seen.json · failed.txt · run.log · versions.txt
                progress.json（轉錄進度，引擎自動覆寫，勿手動編輯）
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

## 筆記影片（後台指定單支影片）

後台「YouTube 頻道 → 筆記影片」（`admin/#youtube`，`admin/youtube.jsx` 的 `NoteVideos`）貼單支影片網址（可一次多行）、寫備註、移除、對失敗的影片按「重試」，存在 Firestore `aurora_ytnotes/videos`（`{items:[{url,note,addedAt,retry?}], updatedAt}`；規則：公開讀、僅管理者寫、最多 100 支）。

- Mac mini 的 `ytnotes.py` **每次 `run`（launchd 每 15 分鐘）開頭**以 Firestore REST 讀這份清單（`config.json` 的 `videos_url`，設 `""` 停用）：新出現的影片排到 `queue.txt` 尾端；同步紀錄寫 `_engine/videos.remote.json`，做過的不會重複排。
- 從清單移除並儲存：還在排隊、尚未開始的會從佇列撤回（只撤回後台排入的；頻道掃描或 `add` 排的不動）。已在轉錄或已有草稿的不受影響。
- 「重試」：寫入新的 `retry` 時間，下一次 run 看到值改變且沒有完成的草稿就再排一次。
- 讀取失敗（斷線）時本輪不排入也不撤回。後台指定的影片不受 180 分鐘長度限制。
- 清單上每支影片的狀態（等待讀取／排隊中／轉錄中／草稿完成／已送審／失敗）取自 `aurora_ops/ytnotes_progress`，與 PilotOne「YouTube 轉錄」面板同一份資料；超過 2 天且進度面板已無紀錄者顯示「無進度紀錄・可能已完成」。
- 要馬上讀取可在 Mac mini 執行 `python3 ytnotes.py videos`。

### 操作步驟（後台）

1. 以管理者帳號登入後台 →「YouTube 頻道」→「筆記影片」分頁。
2. 在輸入框貼影片網址（一行一支，可一次多支；支援 `watch?v=`、`youtu.be/`、`/shorts/`、`/live/`）→「＋ 加入清單」。重複的會略過；不是影片的網址（頻道、播放清單）會留在輸入框並提示，頻道請改到「常看頻道」。
3. 需要的話填備註（只在後台顯示）→ 按「💾 儲存變更」。**沒按儲存 Mac mini 讀不到**，該列會標「未儲存」。
4. 等 Mac mini 下一次執行（最慢 15 分鐘），狀態依序變為：等待 Mac mini 讀取 → 排隊中 → 轉錄中（附階段）→ 草稿完成・等筆記排程 → 已送審。草稿完成後由 Claude 筆記排程（台北 10:17／21:17）產筆記、圖卡、文案，到 PilotOne 審核。
5. 維護：
   - **撤回**：還在「等待讀取／排隊中」的影片，按「移除」再「儲存變更」；已在轉錄的不會中斷、已有草稿或筆記的不受影響。
   - **重試**：狀態「失敗」的影片按「↻ 重試」再「儲存變更」（先看失敗原因；403 類多半要在 Mac mini `brew upgrade yt-dlp`）。
   - **清理**：「清掉已送審」一次移除做完的影片再儲存；清單上限 100 支。
   - 「無進度紀錄・可能已完成」＝加入超過 2 天、進度面板已不再保留該筆（只留近 14 天／20 筆已送審），到 `ytnotes.html` 或 PilotOne 內容庫確認後可移除。

### 欄位與上限

| 欄位 | 說明 |
|---|---|
| `url` | 正規化後的影片網址（`https://www.youtube.com/watch?v=<ID>` 或 `…/shorts/<ID>`）；影片 ID 規則與 `ytnotes.py` 的 `video_key` 一致 |
| `note` | 備註，最多 120 字，只在後台顯示 |
| `addedAt` | 加入時間（ISO UTC；畫面以台北時間顯示） |
| `retry` | 按「重試」時寫入的時間；引擎看到值改變才重排（沒按過就沒有此欄） |

規則 r16：`aurora_ytnotes/videos` 公開讀（引擎免登入讀取，**清單內容等同公開，備註勿寫私密資訊**）、僅管理者寫、只允許 `items`／`updatedAt` 兩欄、最多 100 支。

## 規則

- 下載挑最低畫質；長片只抓音訊；≤60 秒短影音抓 480p 並截 4 張畫面。暫存在 `~/.ytnotes/tmp`，用完即刪。
- 語言：中段 30 秒給 whisper 判斷；聽到的字太少看標題。
- 中文：FunASR＋熱詞，轉完套替換規則、OpenCC s2twp；≤15 分鐘再跑 whisper 當第二意見。英文：YouTube 人工字幕優先（自動字幕不算），沒有才用 whisper。
- 校正：修錯字、同音字、標點、斷句；去口吃與「嗯」「呃」但保留口氣；拿不準標【?猜測】，聽不到標【聽不清】，不硬編。
- 社群貼文只放**自己的話寫的重點筆記**＋原片連結；逐字稿只存在筆記，不公開貼、不重新上傳原片。
- 頻道掃描：新加入的頻道第一次只建立基準（不灌舊片）；超過 180 分鐘的影片不自動處理；每輪最多 20 支；下載失敗記進 `failed.txt` 後跳過（先 `brew upgrade yt-dlp`）。
- 一次只跑一個轉錄（檔案鎖）；FunASR 約吃 3 GB 記憶體。

## 轉錄進度面板（PilotOne 中控台 → 「YouTube 轉錄」分頁；儀表板也有一張小卡）

- **進度檔**：`ytnotes.py` 在每次 `run` 開始／結束、每支影片換階段（讀取資訊 → 下載音訊 → 判斷語言 → 轉錄 → 第二意見〔中文 ≤15 分鐘〕→ 寫入草稿），以及轉錄等長步驟每 60 秒（心跳）原子覆寫 `_engine/progress.json`。只含標題、階段、時間、錯誤摘要，不含逐字稿。手動 `add` 或 `progress` 時若 launchd 的 run 正在跑（持有檔案鎖），不會蓋掉它寫的「處理中」狀態。`python3 ytnotes.py progress` 可立即重產並印出。
- **同步**：`social-publish.yml` 常駐輪詢每 2 分鐘跑 `scripts/ytnotes/sync-progress.mjs`：以 `GDRIVE_SERVICE_ACCOUNT`（唯讀）讀進度檔，白名單精簡後寫 Firestore `aurora_ops/ytnotes_progress`（規則：管理者唯讀、僅服務帳戶寫，不需改規則）；內容沒變就不寫；失敗只印警告，不影響發文。
- **面板狀態**：排隊中 → 轉錄中（顯示目前階段與已耗時；轉錄沒有百分比）→ 草稿完成（等 Claude 筆記排程 10:17／21:17）→ 已送審（`_inbox/_done`，14 天內）→ 對照 PilotOne 草稿 `cs_yt-<影片ID>_<日期>` 的審核／發布狀態；失敗附 `failed.txt` 原因。
- **健康警示**：同步超過 15 分鐘沒更新 →「同步中斷」（social-publish 停了，看排程監控）；轉錄中超過 10 分鐘沒心跳 →「可能卡住」（Mac mini 睡眠、離線或 Drive 暫停同步）；閒置超過 35 分鐘沒回報 →「引擎沒回報」（launchd 沒在跑，重跑 `install.sh`）。
- **時效**：Mac mini 寫檔 → Google Drive 上傳（通常 1 分鐘內）→ 最慢 2 分鐘同步 → 面板即時更新（onSnapshot）。
- **更新引擎**：repo 的 `scripts/ytnotes/ytnotes.py` 改版後，要複製到 Drive `notes/youtube/_engine/ytnotes.py`（launchd 跑的是 Drive 上那份；下一次 15 分鐘喚醒即生效，不必重裝）。

## 引擎部署與故障排除

### 更新引擎（repo 改版後）

launchd 執行的是 Drive `notes/youtube/_engine/` 裡的檔案，repo 合併後**不會自動生效**：

1. 把 repo `scripts/ytnotes/ytnotes.py`（`funasr_run.py` 有改也一起）複製到 Drive `_engine/` 覆蓋同名檔。Claude 在綁定 Mac mini 的對話中以 device_commit_files 寫入；手動則直接在 Finder 覆蓋。
2. 比對 sha256 與位元組數和 repo 版本完全一致（`shasum -a 256 ytnotes.py`）。2026-11-25 版：`ytnotes.py` `db8f67ad…5b4ba2`（53096 bytes）、`funasr_run.py` `dc94e30f…4d450d`。
3. 不必重裝；下一次 15 分鐘喚醒即使用新版。
4. 確認：`_engine/progress.json` 的 `updatedAt` 有更新、PilotOne「YouTube 轉錄」面板不再顯示「引擎沒回報」。

> 2026-11-25 檢查發現 Drive `_engine/ytnotes.py` 停在 11/23 的舊版（21926 bytes，無進度檔功能），11/24 的進度面板改版當時沒有部署到 Drive，已於 11/25 補上。**每次引擎改版都要做上面第 1～2 步並留下 sha256。**

### 引擎沒在跑（影片一直停在「等待 Mac mini 讀取」）

| 檢查 | 位置 | 判讀 |
|---|---|---|
| 最後一次啟動時間 | `~/.ytnotes/run.lock` 的修改時間 | 每次 `run` 都會更新；超過 30 分鐘沒變＝launchd 沒有啟動工作 |
| 執行紀錄 | `~/.ytnotes/launchd.log`、Drive `_engine/run.log` | 有錯誤訊息照訊息處理；完全沒有新紀錄＝工作沒被觸發 |
| 當天頻道掃描 | Drive `_engine/last_scan.txt` | 內容應為台北今天日期（06:00 後） |
| 進度檔 | Drive `_engine/progress.json` | `updatedAt` 應在 15 分鐘內 |

處理（Mac mini 終端機）：

```bash
launchctl print gui/$(id -u)/official.allen.ytnotes | head -20      # 看工作是否已載入、上次結束狀態
launchctl kickstart -k gui/$(id -u)/official.allen.ytnotes           # 立即重跑一次
```

- `print` 回報找不到服務 → 重跑 `_engine/install.sh`（會重新註冊 launchd，不會重下載已有的模型）。
- 有載入但沒有週期執行 → 確認 Mac mini 沒有進入睡眠、已登入使用者帳號（LaunchAgent 只在登入後執行）。
- 讀不到 Drive 上的檔案（`Resource deadlock avoided`／`Operation timed out`）→ 開啟 Google Drive 電腦版確認已登入且同步未暫停。

> 2026-11-25 事件：launchd 自 11/24 20:23（台北）後沒有再啟動（`run.lock`、`launchd.log` 皆未更新，11/25 沒有 06:00 頻道掃描），記錄檔無錯誤訊息；以上述指令重啟。

## 送審

`make_package.py` 產生 `manifest.json`（`topic: "yt-<影片ID>"`、`autoPublish: false`、`verified: true`），FB 用 1200×630、IG／Threads 用 1080×1080 康乃爾筆記圖卡（艾倫報報品牌鎖定）。圖卡色調為**莫蘭迪靛色系**（`render_social_card.py` 的 `THEMES["morandi-indigo"]`：灰靛頁首帶＋霧白底；`make_package.py` 的 `CARD_THEME` 可切換，Podcast 圖卡維持預設 `aurora`），品牌列左側備註影片來源「影片來源：YouTube · youtu.be/<ID>｜作者〈標題〉」；三平台文案也都以「📺 影片來源：作者〈標題〉」開頭（`validate` 會檢查）。PilotOne 審核頁除 Facebook 預覽外，另列出 Instagram／Threads 的圖卡與文案（含字數），三平台圖卡一併審核。`manifest.json` 另帶 `link`＝網站該支筆記 `https://allenchen1113official.github.io/AllenI3Aurora/?yt=<影片ID>#ytnotes`（匯入時寫入 `fb.link`，FB 接在內文最後；首頁看到 `?yt=` 會把該支排第一、展開康乃爾圖卡並捲動到「常看 YouTube · 重點筆記」）。PilotOne 內容中控台「編輯內容」：連結空白時預設帶入上述網址；Hashtag 自動取自 FB 文案結尾的標籤段（主稿＝文案去掉標籤段，IG／Threads 原文案保留為逐平台微調）；新增「圖卡」欄位逐平台列出實際發布的圖卡，可人工換圖（本篇 FB／IG 圖卡、站內圖卡或自訂 https 網址）、調整順序、移除或加圖，存檔寫回各平台 `imageUrls`，預覽同步顯示。Drive 橋接讀台北今天＋昨天的 `notes/youtube/<YYYYMMDD>/pilotone/*/`，同一天每支影片各一筆草稿（`cs_yt-<影片ID>_<YYYYMMDD>`），Allen 在 PilotOne 核准後才發布。

## 測試

`node --test scripts/social/bridge.test.mjs scripts/ytnotes/ytnotes.test.mjs scripts/ytnotes/progress.test.mjs`（含常看頻道規則白名單比對、進度檔精簡與引擎↔同步↔面板↔規則↔workflow 接線）、`python3 -m unittest scripts/ytnotes/test_channels.py scripts/ytnotes/test_videos.py scripts/ytnotes/test_progress.py`（進度檔內容、心跳、run 流程、檔案鎖協調）
