# 艾倫極光日報 · 每日 08:00 自動換日排程

「今日關注動態」的 **艾倫極光日報** 每天上午 **08:00（台北時間）** 自動更新為當日
最新日期，並把前一日的日報卡片移入前台「歷期彙整」。

## 執行機制：GitHub Actions 純 cron（不依賴任何 session）

由 `.github/workflows/daily-rollover.yml` 排程執行，完全在 GitHub Actions 上跑，
以預設 `GITHUB_TOKEN`（`contents: write`）**直接推送 `main`**（GitHub Pages 由 `main`
部署）。不依賴 Claude session、不受 session 推送失敗或分支保護 fallback 影響，
比照 repo 內既有的 `focus-update.yml`／`taiex-update.yml` 更新機制。

- 觸發：`cron 0 0 * * *`（UTC）＝台北 **每日 08:00**。
- 亦支援 `workflow_dispatch`（可在 Actions 頁面手動觸發）與對本工作流程／腳本檔的
  `push` 觸發。
- 註：GitHub 排程為 best-effort，尖峰時可能延遲數分鐘觸發，屬正常現象。
- 日報主題（科技 · 旅行 · 攝影 · 音樂）非交易資料，週末與假日照常換日。

## 換日邏輯（`scripts/rotate-daily.mjs`）

工作流程呼叫 `node scripts/rotate-daily.mjs`（不帶參數＝以「今天（台北 UTC+8）」為
目標日）：

1. 若 `data/daily.json` 的 `date` **已是今天且無內容覆寫** → 完全不動作、直接結束
   （避免覆蓋 `focus-update.mjs` 由 Drive 帶入的當日較豐富摘要）。工作流程偵測到
   無檔案變動即略過提交。
2. 否則：把前一日的日報卡片 `unshift` 進 `data/daily-archive.json`（依 `no` 去重，
   前台「歷期彙整」以 kind「日報」呈現，卡片點擊開啟該日日報原文）；覆寫
   `data/daily.json` 為今天（`daily.html` 讀取）；同步 `data/focus.json`「日報」卡片
   的 `meta`／`summary`（帶入新日期）。

腳本亦可手動帶參數執行（供必要時補跑或帶入當日 Drive 內容）：

```
node scripts/rotate-daily.mjs                 # 以「今天（台北）」為目標日
node scripts/rotate-daily.mjs 2026.08.19       # 指定目標日
node scripts/rotate-daily.mjs payload.json     # 帶入當日 summary／subtitle／source 等
```

`payload.json` 選填欄位：`date`、`dateLabel`、`subtitle`、`summary`、`highlights`、
`hashtags`、`source`（Drive 原文連結）、`coverDrive`（封面縮圖）、`note`；未給欄位
沿用既有值與常設樣板。帶有任一內容覆寫欄位時，即使日期已是今天也會套用（不受
上述「無內容覆寫則不動作」限制）。

## 相關檔案

- `.github/workflows/daily-rollover.yml` —— 每日 08:00 純 cron 排程（本機制主體）。
- `scripts/rotate-daily.mjs` —— 換日＋歸檔的可重複執行腳本（工作流程呼叫）。
- `data/daily.json` —— 最新一日（前台 `daily.html` 讀取）。
- `data/daily-archive.json` —— 歷期彙整（前台以 kind「日報」呈現）。
- `data/focus.json` —— 今日關注動態（含「日報」卡片，隨換日同步日期）。

## 與 focus-update 工作流程的關係

`focus-update.yml`（每 3 小時）在 Drive 有「新的一日」資料夾時，會透過
`update-focus.mjs` 自動換日與歸檔並帶入當日摘要。本 08:00 排程是其「保底」：不依賴
Drive 是否已備妥當日原文，確保每天早上日報日期一定推進到今天。兩者以 `no` 去重、
且本排程在「日期已是今天」時不覆寫內容，因此彼此相容、不會互相洗掉資料。

> 備註：本機制取代先前以 Claude Code Remote 定時任務（開新 session）執行的換日排程
> ——純 cron 直接由 Actions 推送 `main`，不受 session 推送失敗影響，較穩定可靠。
