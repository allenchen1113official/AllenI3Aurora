# 台股熱力圖 · 每日 19:00 自動更新排程

「台股熱力圖 · 上市／上櫃」每個交易日 **19:00（台北時間）** 自動更新為當日
最新收盤，並把前一日圖卡移入前台「歷期彙整」。

## 資料來源：使用者雲端硬碟（權威來源）

熱力圖**不再由排程自行上網查個股數據產圖**（實測會抓錯個股漲跌，例如 2026/08/14
一度把群聯誤植為上漲、漏掉台光電漲停）。改為**直接取用使用者雲端流程當日產出的
權威圖卡與社群文案**——這些檔案由使用者自有的雲端管線每個交易日約 **18:15（台北）**
產生並存放於 Google 雲端硬碟：

```
AllenI3Aurora/finance/heatmap/<YYYYMMDD>/
├─ TaiwanStock_Heatmap_Listed_<YYYY-MM-DD>_FB.png   → assets/heatmap/twse-heatmap-fb.png
├─ TaiwanStock_Heatmap_Listed_<YYYY-MM-DD>_IG.png   → assets/heatmap/twse-heatmap-ig.png
├─ TaiwanStock_Heatmap_OTC_<YYYY-MM-DD>_FB.png      → assets/heatmap/tpex-heatmap-fb.png
├─ TaiwanStock_Heatmap_OTC_<YYYY-MM-DD>_IG.png      → assets/heatmap/tpex-heatmap-ig.png
├─ SocialPost_Listed_<YYYY-MM-DD>.txt               （加權指數、買超、焦點個股文案）
└─ SocialPost_OTC_<YYYY-MM-DD>.txt                  （上櫃焦點個股文案）
```

- 對照：**Listed→twse（上市）**、**OTC→tpex（上櫃）**、**FB→fb**、**IG→ig**。
- 個股漲跌數字**內建於圖卡影像中**，排程只是「照抄」正確圖卡覆蓋站內圖，因此不會
  再出現個股數據錯誤。
- `data/heatmap.json` 的文案（summary／note／desc）與指數 header 由社群文案解析組成。

## 排程用的雲端 session 如何存取 Drive：公開資料夾 ＋ API 金鑰

排程觸發時開的是**全新的雲端 session，無法登入使用者的 Google 帳號**（定時任務
不能攜帶 Google Drive 連接器）。因此改用 **Google Drive REST API v3 ＋ API 金鑰**
存取——只要目標資料夾設為「知道連結的人可檢視」，用 API 金鑰即可列出與下載檔案，
無需 OAuth。

### 一次性設定（使用者需完成，否則排程會直接略過）

1. **把資料夾設為公開可讀**：在 Google 雲端硬碟把
   `AllenI3Aurora/finance/heatmap`（資料夾 id `1EPwjz8tbQ28lkE7u2QfE3fDTaiwsshLj`）
   分享設定改為「**知道連結的任何人 ─ 檢視者**」。權限會向下繼承到每日子資料夾，
   熱力圖本就要公開發社群，公開此資料夾風險低。
2. **建立 Google API 金鑰**：Google Cloud Console → 選一個專案 →「API 和服務」
   啟用 **Google Drive API** →「憑證」建立 **API 金鑰**（建議限制為僅 Drive API）。
3. **把金鑰存成環境變數**：在此排程所屬的 Claude Code Remote 環境設定新增
   環境變數 **`GDRIVE_API_KEY`**＝上一步的金鑰。排程 session 會自 `$GDRIVE_API_KEY`
   讀取。

> 若 `GDRIVE_API_KEY` 未設定、資料夾未公開、或當日圖尚未產出，排程會**乾淨略過、
> 不做任何變更、也不自行產圖**（避免再寫入錯誤數據）。

### REST 存取方式（排程 session 用 Bash + curl 經 agent proxy 執行）

```bash
FOLDER=1EPwjz8tbQ28lkE7u2QfE3fDTaiwsshLj
DAY=20260815            # 今天（台北）YYYYMMDD
DASH=2026-08-15         # 今天 YYYY-MM-DD
API="https://www.googleapis.com/drive/v3/files"

# 1) 找當日子資料夾 id（Drive REST 用 name，不是 title）
SUB=$(curl -s "$API?q=%27$FOLDER%27+in+parents+and+name%3D%27$DAY%27+and+mimeType%3D%27application/vnd.google-apps.folder%27&key=$GDRIVE_API_KEY&fields=files(id,name)" | python3 -c "import sys,json;f=json.load(sys.stdin)['files'];print(f[0]['id'] if f else '')")

# 2) 列出子資料夾內所有檔案（取得四張圖與兩個 txt 的 id/name）
curl -s "$API?q=%27$SUB%27+in+parents&key=$GDRIVE_API_KEY&fields=files(id,name,mimeType)"

# 3) 依 name 對照下載（alt=media 直接取檔案二進位／文字）
curl -sL "$API/<fileId>?alt=media&key=$GDRIVE_API_KEY" -o assets/heatmap/twse-heatmap-fb.png
```

## 每日流程（排程 session 內執行）

1. 目標交易日＝今天（台北）。週末／台股休市日 → 略過。
2. 用 `$GDRIVE_API_KEY` 找當日子資料夾；若不存在或四張圖未齊 → 略過（雲端當日未就緒）。
3. `git fetch origin main`、`git checkout -B claude/heatmap-daily-<YYYYMMDD>` 以最新
   `origin/main` 為基準。`data/heatmap.json` 的 date 已是今天 → 結束（不重覆歸檔）。
4. 下載四張圖到暫存，下載兩個 `SocialPost_*.txt`。
5. 解析指數與焦點文案：
   - **加權指數**（點數／漲跌／%／買超）取自 `SocialPost_Listed_*.txt`。
   - **櫃買指數** 兩個社群文案通常只有敘述、沒有精確點數 → 用**一次** WebSearch
     只補「櫃買指數 收盤點數／漲跌」（此為公開明確數字、非易錯的個股資料）。
   - summary／note／desc 依社群文案的焦點個股組成（個股數字直接引用文案，不另查）。
6. 準備 `payload.json`（見下），在 repo 根目錄執行
   `node scripts/rotate-heatmap.mjs payload.json`：
   - 把「目前站內圖」複製為前一日歸檔圖 `assets/heatmap/archive/<market>-<YYYYMMDD>-<fmt>.png`；
   - 前一日資訊 `unshift` 進 `data/heatmap-archive.json`（依 `no` 去重）；
   - 依 payload 覆寫 `data/heatmap.json`、同步 `data/focus.json` 熱力圖卡。
7. 把下載的四張圖覆蓋 `assets/heatmap/{twse,tpex}-heatmap-{fb,ig}.png`。
8. 驗證（JSON 解析、date＝今天）後 commit、`git push origin HEAD:main`
   （分支保護被拒則推分支並說明需人工合併）。

## 排程時間

- 觸發：`cron 0 11 * * 1-5`（UTC）＝ 台北時間 **週一至週五 19:00**。
- 雲端圖約 18:15（台北）產出，19:00 執行時已就緒。
- 遇休市／當日圖未產出，session 自行判斷並略過（不產生 commit）。

## payload.json 範例

```json
{
  "date": "2026.08.14",
  "dateLabel": "2026/08/14（五）",
  "asOf": "2026.08.14",
  "desc": "台積電殺尾翻黑跌210點，台光電噴8.35%",
  "taiex": { "index": "45,811.01", "change": "-210.47", "changePct": "-0.46%", "up": false },
  "tpex":  { "index": "400.95",   "change": "-5.17",   "changePct": "-1.27%", "up": false },
  "summary": "【理財】台股熱力圖 · 上市／上櫃｜2026.08.14 …完整熱力圖看這裡👇",
  "hashtags": "#台股 #台股熱力圖 #市值熱力圖 #上市 #上櫃 #艾倫報報 #AllenI3Aurora",
  "note": "熱力圖與個股漲跌幅由艾倫報報雲端流程（finance/heatmap/<YYYYMMDD>）當日產出，資料僅供參考，不構成投資建議。"
}
```

> `desc` 為選填：首頁「今日關注動態」熱力圖卡的約 10–15 字簡述，`rotate-heatmap.mjs`
> 會一併同步 `data/focus.json` 該則的 `desc／summary／meta`；未提供則沿用舊 `desc`。

## 相關檔案

- `scripts/rotate-heatmap.mjs` —— 換日＋歸檔的可重複執行腳本（本排程呼叫）。
- `data/heatmap.json` —— 最新一日（前台 `heatmap.html` 讀取）。
- `data/heatmap-archive.json` —— 歷期彙整（前台以 kind「熱力圖」呈現）。
- `assets/heatmap/` —— 最新一日站內圖；`assets/heatmap/archive/` 為歷期歸檔圖。
