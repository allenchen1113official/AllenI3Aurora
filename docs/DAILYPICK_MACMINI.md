# 極光日報・每日來一股：Mac mini 本機排程設定

雲端排程碰不到 Mac mini 的 Chrome（Claude in Chrome），而且證交所、公開資訊觀測站、櫃買中心、集保的網站都被雲端網路擋下，所以「每日來一股」改由 Mac mini 本機執行。雲端排程 `trig_01AvzcAubP2YPje9PTMJ7JEA` 和 `trig_01VC1abuTATbeq5ZtLdr8i9y` 都已停用。

## 一、Mac mini 先準備好（只做一次）

1. 在 Mac mini 終端機把兩個 repo clone 到固定位置（已有就略過）：

   ```bash
   mkdir -p ~/claude && cd ~/claude
   ```

   ```bash
   git clone https://github.com/allenchen1113official/StockAdvisor.git
   ```

   ```bash
   git clone https://github.com/allenchen1113official/AllenI3Aurora.git
   ```

   確認 `git push` 不會跳出帳密詢問（用 GitHub CLI `gh auth login` 或 macOS 鑰匙圈登入過一次即可）。
2. 安裝圖卡相依套件：

   ```bash
   python3 -m pip install --user playwright pyyaml
   ```

3. Chrome 已安裝 Claude in Chrome 擴充功能並登入同一個 Claude 帳號；執行時間（台北 17:30）Mac mini 不要休眠、Chrome 保持開啟。
4. 先手動試跑一次：在 Mac mini 的 Claude（桌面版 Claude Code 或 Cowork），工作資料夾選 `~/claude`，把下面第二節的指令整段貼上執行，確認能完成。

## 二、建立本機排程

在 Mac mini 的 Claude 桌面版建立排程任務（實際按鈕名稱以畫面為準）：

- 名稱：`極光日報・每日來一股（每日 17:30）`
- 時間：每天 17:30（Mac mini 系統時區需為台北；若排程設定可寫 cron，用 `CRON_TZ=Asia/Taipei 30 17 * * *`）
- 工作資料夾：`~/claude`
- 允許的工具：Bash、檔案讀寫、WebSearch、Claude in Chrome（不然每次會停在權限詢問）
- 指令（整段貼上）：

```text
執行「極光日報・每日來一股」。先用 `TZ=Asia/Taipei date` 取得台北日期（不要用未指定時區的日期）。每天都執行，不限交易日：週末或證交所休市日照常分析，行情與籌碼資料以最近一個交易日為準，並在圖卡與文案註明資料日期。

0. 準備 repo（每次都做）：兩個 repo 在 ~/claude/StockAdvisor 與 ~/claude/AllenI3Aurora。兩個都執行 `git -C <dir> checkout main && git -C <dir> pull --rebase origin main`（工作樹有未提交變更就先 `git stash`）。目錄不存在就 `git clone` 到上述路徑。失敗就不做後續步驟，推播「M/D 每日來一股未執行：GitHub repo 無法同步（<哪個 repo、錯誤訊息原文>）」後結束。

1. 完整依照 ~/claude/StockAdvisor/skills/aurora-daily-pick/SKILL.md 執行（SKILL.md 若有「非交易日不執行」之類的條件，以本指令「每天都執行」為準）：
   - 第 1 步：在 StockAdvisor 目錄執行 `python3 -m daily_pick.pick BUNDLE`，依 AllenI3Aurora 的分析順序清單（data/dailypick/queue.json：後台指定 → 上市市值前 100＋上櫃前 50 依市值 → 其餘依市值；已分析不重複）取下一檔，不要自行改選。
   - 第 3 步：用 Claude in Chrome（本機 Chrome）在公開資訊觀測站、證交所或櫃買中心、集保分頁執行 daily_pick/browser/ 的收集器抓個股深度資料。Chrome 沒連上就停止，推播「Mac mini 的 Chrome 未連線，每日來一股未執行」。
   - 第 4 步：用 WebSearch 撰寫 qualitative.json（查不到的 AI 指標不要填）。
   - 第 5 步：`python3 -m daily_pick.run BUNDLE daily_pick/YYYYMMDD --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` 產出 5 張圖卡、三平台文案、指標報告。
2. 依 SKILL.md 第 6 步檢查：資料完整度 < 60% 或 MISSING > 15 項就不發布，改回報缺哪些資料；用 Read 逐張檢查 PNG 不重疊、不溢出。
3. 依第 7 步交付：產出存到 StockAdvisor daily_pick/YYYYMMDD/（YYYYMMDD＝台北執行日期）並推送 main；用 `python3 -m daily_pick.record daily_pick/YYYYMMDD/analysis_代號_YYYYMMDD.json --aurora ~/claude/AllenI3Aurora` 寫入 data/dailypick/history.json，在 AllenI3Aurora commit 後推送 main（清單會自動標為已分析並重排）。push 被拒時先 `git pull --rebase` 再推一次；仍失敗就在推播中說明。
4. 交付 5 張圖卡、社群文案 md、指標報告 md；發一則推播：「M/D 每日來一股：代號 名稱 綜合 X 分（燈號），最強／最弱面向，模型判讀；分析順序第 N 位，優先組剩 M 檔」。社群貼文只準備草稿，不要直接發布。
5. 關閉自己開的瀏覽器分頁。所有內容需標示「非投資建議」。
```

## 三、建好之後

- 把本機排程的 ID 或名稱告訴 Claude，同步更新 `scripts/monitor/registry.mjs`、`docs/DAILYPICK_SOP.md` 與 `CLAUDE.md`。
- 目前分析順序第 1 位是 2330 台積電（11/24 雲端試跑停在第 3 步，沒有寫入紀錄）。
