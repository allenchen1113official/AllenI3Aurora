# 艾倫極光日報 · 每日 08:00 自動換日排程

「今日關注動態」的 **艾倫極光日報** 每天上午 **08:00（台北時間）** 自動更新為當日
最新日期，並把前一日的日報卡片移入前台「歷期彙整」。

## 排程時間

- 觸發：`cron 0 0 * * *`（UTC）＝ 台北時間 **每日 08:00**。
- 日報主題（科技 · 旅行 · 攝影 · 音樂）非交易資料，週末與假日照常更新。

## 執行機制

排程以 **Claude Code Remote 定時任務（每次觸發開新的 Claude session）** 執行；每次
觸發於功能分支開發、驗證通過後依 `CLAUDE.md` 直接更新 `main`（GitHub Pages 由 `main`
部署）。session 內：

1. 判斷目標日＝今天（台北時間）。若當日 Drive 有新日報原文，優先帶入其摘要、封面與
   完整原文連結；查不到則沿用日報常設樣板，僅換日期即可（重點是「換到今天」）。
2. `git fetch origin main` 後以最新 `origin/main` 為基準建立功能分支。若
   `data/daily.json` 的 `date` 已等於今天，代表已更新過，直接結束（不重覆歸檔）。
3. 準備 `payload.json`（皆為選填，見下）並執行：

   ```
   node scripts/rotate-daily.mjs payload.json
   # 或不帶內容、只換到今天：
   node scripts/rotate-daily.mjs            # 以「今天（台北）」為目標日
   node scripts/rotate-daily.mjs 2026.08.08 # 指定目標日
   ```

   這會：
   - 把前一日的日報卡片 `unshift` 進 `data/daily-archive.json`（依 `no` 去重，
     前台「歷期彙整」以 kind「日報」呈現，卡片點擊開啟該日日報原文）；
   - 覆寫 `data/daily.json` 為最新一日（`daily.html` 讀取）；
   - 同步 `data/focus.json` 內「日報」卡片的 `meta`／`summary`（帶入新日期）。
4. 驗證：`node -e` 解析 `data/daily.json`、`data/daily-archive.json`、`data/focus.json`
   應成功，且 `data/daily.json` 的 `date` ＝今天。
5. `git commit` 後直接 `git push origin HEAD:main`（失敗以 2s/4s/8s/16s 退避重試）；
   若因分支保護被拒，改推功能分支並於回報中說明需人工開 PR 合併 `main`。

## payload.json 範例（皆為選填）

```json
{
  "date": "2026.08.08",
  "dateLabel": "2026/08/08（六）",
  "subtitle": "當日主題副標（未給沿用常設樣板）",
  "summary": "【日報】艾倫極光日報｜2026.08.08 …完整日報看這裡👇",
  "highlights": ["內文重點一", "內文重點二"],
  "hashtags": "#艾倫極光日報 #日報 #科技 #旅行 #攝影 #音樂 #每日速報 #艾倫報報 #AllenI3Aurora",
  "source": "https://drive.google.com/file/d/…/view",
  "coverDrive": "https://drive.google.com/thumbnail?id=…&sz=w1600",
  "note": "完整內容以 Google Drive 當日日報原文為準。"
}
```

未給任何欄位時，腳本會沿用既有值與常設樣板，僅把日期換到目標日——確保「換到今天」
這件事一定成立。

## 相關檔案

- `scripts/rotate-daily.mjs` —— 換日＋歸檔的可重複執行腳本（本排程呼叫）。
- `data/daily.json` —— 最新一日（前台 `daily.html` 讀取）。
- `data/daily-archive.json` —— 歷期彙整（前台以 kind「日報」呈現）。
- `data/focus.json` —— 今日關注動態（含「日報」卡片，隨換日同步日期）。
- `scripts/update-focus.mjs` —— 每 3 小時的 Drive 端更新（有新日報原文時也會換日與歸檔）；
  本排程確保「即使當日尚無 Drive 原文，早上 08:00 仍會換到今天」。

## 與 focus-update 工作流程的關係

`focus-update.yml`（GitHub Actions，每 3 小時）在 Drive 有「新的一日」資料夾時，
會透過 `update-focus.mjs` 自動換日與歸檔。本 08:00 排程是其「保底」：不依賴 Drive
是否已備妥當日原文，確保每天早上日報日期一定推進到今天；兩者以 `no` 去重、彼此相容。
