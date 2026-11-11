# 排程監控 SOP（schedule-monitor）

監控本站所有排程的執行情形，並在後台提供「重新執行」的接口。時間一律台北（UTC+8）。

## 架構

```
GitHub Actions 各排程 ─┐                         ┌─ 後台「排程監控」頁（admin/#monitor、admin/monitor/）
data/*.json 產出 ───────┼─► 監控代理（每 5 分鐘）──┤   即時訂閱 aurora_ops/schedule_status
Claude 排程任務（產出）─┘   schedule-monitor.yml   │   「重新執行」→ aurora_ops_requests（佇列）
                           scripts/monitor/        └─ GitHub Issue 告警（label: schedule-monitor）
```

| 檔案 | 用途 |
|---|---|
| `scripts/monitor/registry.mjs` | 各 workflow 顯示名稱與政策（可否後台觸發、自動重試、補跑、可帶參數）、產出新鮮度檢查、Claude 排程清單 |
| `scripts/monitor/core.mjs` | 純邏輯：cron 推算、健康度、新鮮度、請求驗證。瀏覽器與代理共用同一份 |
| `scripts/monitor/run-monitor.mjs` | 監控代理本體 |
| `scripts/monitor/monitor.test.mjs` | 行為測試＋後台 payload 與 `firestore.rules` 白名單靜態比對（代理每輪先跑） |
| `admin/schedule-monitor.jsx` | 後台 RWD 面板（`window.ScheduleMonitorPanel`） |
| `admin/monitor/index.html` | 獨立入口（手機加到主畫面用） |

## 監控代理每輪做什麼

1. 解析 `.github/workflows/*.yml` 的 cron 與行尾「# 台北…」註解，抓每個 workflow 最近 15 次執行。
2. 處理後台請求：`queued → dispatched → running → completed／failed`（另有 `rejected`、`cancelled`、`expired`）。以 transaction 認領，兩輪重疊也不會重複觸發。
3. 自我修復（`MONITOR_AUTOHEAL=off` 可關）：
   - **自動重試**：`autoRetry` 的排程失敗（排程觸發、第一次嘗試、3 小時內）→ 重跑失敗的工作一次；再失敗就判定異常並告警。
   - **補跑**：GitHub 尖峰時會延遲甚至丟棄排程（實測 `*/10` 的社群發文、訂閱信常數小時才跑一次）。`catchUp` 的工作超過應觸發時間仍未執行 → 以 `workflow_dispatch` 補跑（dispatch 不受排程節流）。每輪最多 6 個動作。
4. 告警（`MONITOR_ISSUES=off` 可關）：狀態為「異常／已停用」時開 Issue，恢復後留言並自動關閉。
5. 快照寫入 Firestore `aurora_ops/schedule_status`，代理日誌寫 `aurora_ops/agent`；Step Summary 也有一份表格。

## AllenI3Aurora Agent（Claude 排程巡檢與自動修復）

GitHub Actions 看不到 Claude 排程的執行內容，因此另有一個 Claude 排程「AllenI3Aurora Agent」（`trig_014J2SYkJeqeJ8S2QvSM4WAH`，台北 07:41／09:41／19:41／21:41／23:41）負責：

| 檢查 | 補救 |
|---|---|
| 9 個 Claude 排程是否啟用、今日是否觸發（`list_triggers`） | 漏跑 → `fire_trigger` 補跑；被停用 → 推播請 Allen 確認（不自動啟用） |
| 產出資料夾必要檔案是否齊全、PNG 尺寸、文字檔格式（Threads ≤500 字、三版文案、日報 7 領域＋來源網址、禁用詞） | 不齊或不合格 → 帶缺漏清單 `fire_trigger` 原排程重跑；重複資料夾 `D 2` 以 `mv -n` 併回 |
| FB／IG／Threads 是否已發布（Chrome 唯讀查看個人頁） | 已觸發 3 小時內未發＝待 Allen 確認（推播提醒一次）；逾時或漏跑 → 重新觸發發文排程「重新備稿」 |

- 補救上限：每任務每日 2 次、間隔 ≥40 分鐘，並以 `send_later` 45 分鐘後複查；達上限推播請 Allen 處理。
- **Agent 不會按下發布**：公開發文仍須 Allen 在各發文排程的對話中回覆「發布」。
- 巡檢報告寫在 Drive `AllenI3Aurora/ops/agent/status_latest.json`（另存 `status_YYYYMMDD_HHMM.json` 歷史、`state_YYYYMMDD.json` 補救計數）。監控代理以 `GDRIVE_SERVICE_ACCOUNT` 讀入、經 `core.normalizeAgentReport()` 白名單過濾後寫進 `aurora_ops/schedule_status.claudeAgent`，後台「Claude 排程任務」區顯示每項的檔案數、文案圖卡、三平台發文狀態與補救紀錄。
- 報告超過 11 小時未更新＝注意、26 小時＝異常（Agent 本身停擺）；報告缺席時退回 `data/*.json` 新鮮度判斷。
- Agent 需在 Mac mini 的 Claude 桌面版開啟「需要這台電腦／Require this computer」才能讀本機資料夾與 Chrome；未開啟時只能用 Drive 連接器做存在性檢查並把報告上傳 Drive。

## 健康度判斷

| 狀態 | 條件 |
|---|---|
| 異常 | 連續 2 次失敗、重試後仍失敗、不重試的工作失敗；漏跑：高頻排程 ≥12 次、一般排程 ≥2 次；workflow 被停用 |
| 注意 | 失敗待自動重試、高頻漏跑 ≥3 次、一般漏跑 1 次、近 20 次成功率 <70%、手動工作最近一次失敗 |
| 執行中／正常／待命 | 其餘 |

寬限：間隔 ≤15 分鐘給 40 分、≤3 小時給 60 分、其餘 2 小時；間隔以「目前所在時段」計算（TAIEX 盤中 5 分、盤後數小時）。
產出新鮮度：`date` 型以台北日曆與就緒時間推算應有的最新一期，落後 1 期警告（交易日型可能是休市）、2 期以上異常；`age` 型看時間戳。

## 後台重新執行

- **排入佇列（預設）**：寫入 `aurora_ops_requests`，代理下一輪以 `GITHUB_TOKEN` 觸發。前端不持有任何密鑰。延遲約 5 分鐘（GitHub 尖峰時可能更久）。
- **即時觸發（選用）**：在面板「設定」貼上 Fine-grained Token（只選本 repo、只給 Actions: Read and write、設到期日）。Token 只存在該瀏覽器（預設關分頁即清除），按下即呼叫 GitHub API，並寫一筆 `mode: direct` 紀錄讓代理追蹤結果。
- 不開放：`newsletter-send.yml`（寄信不可逆，照 dry_run → test_to → 正式到 Actions 頁手動）、GitHub Pages 部署。
- `firestore-rules-deploy.yml` 需輸入檔名確認。可帶參數只有註冊表白名單（目前為社群／訂閱的 `dry_run`）。
- Claude 排程任務無法由 GitHub 觸發，面板只顯示其產出是否到位；重新執行請到 Claude 的排程頁。

## 設定

- Secrets：沿用 `FIREBASE_SERVICE_ACCOUNT`（需「Cloud Datastore 使用者」）。未設定時代理照常監控與開 Issue，只是沒有快照與佇列。
- 規則：`firebase/firestore.rules` 新增 `aurora_ops`（管理者唯讀）與 `aurora_ops_requests`（管理者建立；只能把 queued 改 cancelled）。
- 新增 workflow：不用改程式就會被監控（套用預設政策：不可後台觸發）。要開放觸發／自動重試／補跑，在 `registry.mjs` 的 `WORKFLOWS` 加一行。只對**冪等**的工作開 `autoRetry`／`catchUp`。
- Claude 排程有增減時，更新 `registry.mjs` 的 `CLAUDE_TASKS`（cron 為台北時間）。

## 測試

```bash
node --test scripts/monitor/monitor.test.mjs
MONITOR_DRY_RUN=1 node scripts/monitor/run-monitor.mjs   # 本機只評估（需 GITHUB_TOKEN 或未登入額度）
```
