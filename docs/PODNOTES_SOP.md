# 常聽 Podcast 重點筆記 SOP

**音檔 → 逐字稿 → 摘要，全程在 GitHub Actions**（2026-11-24 起；取代原本依賴 Mac mini 與 Claude 排程的路線）。
Allen 的決定：只做後台勾選的節目（先開 游庭皓的財經皓角、兆華與股惑仔、AI懶人報），每節目每天最新 1 集；逐字稿不公開；圖卡莫蘭迪藍；一律經 PilotOne 人工核准發布；摘要引擎用 Anthropic API。

## 流程（`.github/workflows/podnotes.yml` → `scripts/podnotes/pipeline.py`）

1. **選集**：讀 `scripts/podcast/feeds.json`（RSS、代碼、語言）＋後台「Podcast 重點筆記 → 啟用節目」（Firestore `aurora_podnotes/shows`；沒設定的節目看 feeds.json 的 `notes`）。每個啟用節目取 36 小時內、同一台北日期最新的一集；集數 ID＝`<代碼>-<YYYYMMDD>`。選集沿用 `scripts/ytnotes/ytnotes.py` 的 `parse_rss`／`pick_episodes`。
2. **轉錄**：下載 RSS 音檔（上限 600 MB）→ ffmpeg 16 kHz 單聲道 → 中文 FunASR（`scripts/ytnotes/funasr_run.py`：paraformer-zh＋fsmn-vad＋ct-punc 標點＋OpenCC 台灣繁體；≤20 分鐘整段並加 cam++ 說話者，更長切 10 分鐘一段、各段獨立程序、不做說話者並以 `sentence_timestamp` 取逐句時間——整段跑長音檔會記憶體不足被終止）；英文或 `feeds.json` 標 `"asr": "whisper"` 的中英夾雜節目（AI懶人報）用 faster-whisper（`PODNOTES_WHISPER`，預設 large-v3-turbo，中文再轉台灣繁體）→ 逐字稿（每段 `[分:秒]`）。熱詞與固定錯字替換：`scripts/podnotes/dict/熱詞.txt`、`替換規則.tsv`（節目名、主持人、常見公司名；實跑發現新的固定錯字就加）。2026-11-24 實測：53 分鐘中文約 7 分鐘、18 分鐘 Whisper 約 7 分鐘。
3. **保存逐字稿**：寫 Firestore `aurora_podcast_transcripts/<集數ID>`（`stage: transcribed`）。規則 r14：**管理者唯讀、前端不可寫**。repo 是公開的，逐字稿**不寫進 repo、不印在 Actions 日誌**。
4. **筆記**（需 Secret `ANTHROPIC_API_KEY`）：逐字稿（上限約 9 萬字）＋節目資訊交給 Claude（`vars.PODNOTES_MODEL`，預設 `claude-sonnet-5-5`；指令 `scripts/podnotes/prompt.md`），回傳 JSON：校正清單（只套用逐字稿裡真的有的 from→to）、headline（依 Allen 的下標準則）、3～5 行摘要、康乃爾 4～6 列＋一句話總結、FB／IG／Threads 三版各自撰寫的文案、hashtag、待核對清單。`make_package.py` 驗證（字數、三版不可相同、IG 不放網址…），不過就帶著錯誤請模型重寫，最多 3 次。
5. **產出**：莫蘭迪藍圖卡（FB 1200×630、IG 1080×1080）→ 送審包推 `content` 分支 `content/pn-<集數ID>/<YYYYMMDD>/`（topic `pn-<集數ID>`）→ `social-publish.yml` 匯入成 PilotOne 草稿 `cs_pn-<集數ID>_<YYYYMMDD>` 並通知審核；圖卡 `assets/podnotes/<集數ID>_FB|IG.png`、前台索引 `data/podnotes.json`（最多 60 集，不含逐字稿）推 main；Firestore 套用校正、`stage: noted`、記下待核對清單。
6. **沒有金鑰**：只做 1～3，`stage` 停在 `transcribed`；設定金鑰後下一輪自動補做筆記。

排程：台北每日 10:17／13:47／20:17／22:47（GitHub cron 可能延遲，排程監控會自動補跑）。手動：Actions →「常聽 Podcast 重點筆記」→ Run workflow，可填節目代碼（只做該節目最新一集、不看時間窗）與 `force`（已處理也重做）。

失敗：轉錄失敗記 `stage: failed`，下一輪自動重試，累計 2 次放棄；寫筆記失敗保留逐字稿、下一輪重試。後台「處理進度」看每集階段、錯誤與待核對處。

## 前台與後台

- 前台：`aurora-data.js` 讀 `data/podnotes.json` 成 `AURORA.podNotes`（source `notes`），同節目同日優先於後台／內建與 RSS 節目說明；首頁只放最新 1 則，`podcast.html` 列各節目最新一集＋歷期重點筆記；`podcast.html?pn=<集數ID>#pn-<集數ID>` 直接展開該集圖卡（社群文案用這個連結）。
- 後台 `admin/#podnotes`：筆記與逐字稿（可搜尋、複製）／處理進度／啟用節目。

## 設定

| 項目 | 位置 |
|---|---|
| `ANTHROPIC_API_KEY` | GitHub repo → Settings → Secrets and variables → Actions → Secrets |
| `PODNOTES_MODEL`（選用） | 同上 → Variables（不設＝claude-sonnet-5-5） |
| `FIREBASE_SERVICE_ACCOUNT` | 既有 Secret（寫逐字稿、讀啟用設定） |
| 新增常聽節目 | `scripts/podcast/feeds.json` 加 `show`、`code`、`feed`、`lang`、`notes` |

## 舊路線（已停用）

Mac mini `ytnotes.py` 的 Podcast 掃描（`podcast_feeds_url` 預設空字串）與 Claude 排程 `trig_01BHPcUndhA9rdPUWyxAELGW` 已停用；程式保留作本機備用，不要兩條路線同時開。

## 測試

`python3 -m unittest scripts/podnotes/test_pipeline.py scripts/podnotes/test_package.py scripts/ytnotes/test_podcast.py`、`node --test scripts/podnotes/podnotes.test.mjs scripts/social/bridge.test.mjs`。workflow 每次執行前也會先跑 Python 測試。
