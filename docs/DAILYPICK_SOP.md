# 極光日報・每日來一股 · 個股分析順序 SOP

## 架構
| 元件 | 位置 | 說明 |
|---|---|---|
| 分析順序清單 | `data/dailypick/queue.json`、`queue.csv` | `dailypick-queue.yml` 自動產生，勿手改 |
| 分析紀錄 | `data/dailypick/history.json` | Claude 排程分析完追加一筆（append-only） |
| 後台設定 | Firestore `aurora_dailypick/overrides` | `pin`（指定下一檔，依序）、`skip`（不分析）；公開讀、管理者寫 |
| 後台頁 | `admin/#dailypick`（`admin/dailypick.jsx`） | 分析順序／分析紀錄／新增股票、指定與略過、下載 CSV |
| 更新程式 | `scripts/dailypick/update-queue.mjs`（純邏輯 `core.mjs`） | 測試 `node --test scripts/dailypick/dailypick.test.mjs` |
| 分析引擎 | StockAdvisor repo `daily_pick/`、`skills/aurora-daily-pick/SKILL.md` | Claude 排程 `trig_018R4XEwmQjjXz4oVd4k4Lg5`（台北 17:41，週一至週五） |

## 順序規則
1. 後台「指定下一檔」（依指定順序）
2. 優先組：上市市值前 100＋上櫃市值前 50，合併後依市值由大到小
3. 其餘上市櫃 4 碼普通股，依市值由大到小（排除 ETF、特別股、TDR、權證）

市值＝OpenAPI 收盤價 × 已發行股數（上市 `t187ap03_L`、上櫃收盤行情 `Capitals`），每個交易日重算排名。
已分析者不再排入；略過者狀態為「略過」；當日不在母體者（下市、暫停交易）標「下市／暫停」並保留紀錄。
母體第一次出現的代號記 `addedAt`、當日標 `isNew`（第一次建立清單時不算新增）。

## 每日流程（台北時間）
- 16:47 `dailypick-queue.yml` 重算清單；17:23 再算一次（套用 16:47 後才儲存的後台指定／略過）；06:13 補位；監控代理丟棄時自動補跑
- 17:41 Claude 排程（StockAdvisor `python3 -m daily_pick.pick`）以 GitHub API 讀 `queue.json` 取第一檔待分析（能連到 Firestore 時再套一次後台設定；雲端環境通常連不到，所以後台設定請 17:20 前儲存）→ 分析 → `python3 -m daily_pick.record` 追加 `history.json` 推送 main → 觸發本 workflow 立即重排
- 資料量不足（上市 < 700 或上櫃 < 500 檔有市值）時不覆寫清單

## history.json 格式
```json
{"date":"2026-11-23","code":"2609","name":"陽明","market":"TWSE","industry":"航運業","score":69.8,"light":"黃燈","rating":"中性","folder":"daily_pick/20261123"}
```
`folder` 為 StockAdvisor repo（私人）內的產出資料夾，後台「報告 ↗」連到 GitHub。
