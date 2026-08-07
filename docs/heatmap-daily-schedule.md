# 台股熱力圖 · 每日 20:00 自動更新排程

「台股熱力圖 · 上市／上櫃」每個交易日下午 **20:00（台北時間）** 自動更新為當日
最新收盤，並把前一日圖卡移入前台「歷期彙整」。

## 為什麼用 Claude 排程（而非純 GitHub Actions）

這項工作需要「查證當日真實收盤數字」與「重新產生熱力圖圖卡」，屬於需要判斷、
搜尋與影像產出的智慧型任務，純 cron 腳本無法完成。因此排程以 **Claude Code
Remote 定時任務（每次觸發開新的 Claude session）** 執行，session 內：

1. 判斷最近一個「已收盤的交易日」（非交易日／假日則不動作）。
2. 依 `taiex-heatmap` skill 用 WebSearch 查證當日加權指數、櫃買指數與主要
   個股／類股漲跌，覆蓋 `taiex_data.py` 後產出四張圖（上市／上櫃 × FB／IG）。
3. 準備 `payload.json`（見下），執行
   `node scripts/rotate-heatmap.mjs payload.json`：
   - 把「目前站內圖」複製為前一日歸檔圖
     `assets/heatmap/archive/<market>-<YYYYMMDD>-<fmt>.png`；
   - 前一日資訊 `unshift` 進 `data/heatmap-archive.json`（依 `no` 去重）；
   - 依 payload 覆寫 `data/heatmap.json` 為最新一日。
4. 把新圖覆蓋 `assets/heatmap/{twse,tpex}-heatmap-{fb,ig}.png`。
5. 在功能分支 commit、push、開 PR，驗證（JSON 解析、圖面檢查）通過後合併 `main`。

## 排程時間

- 觸發：`cron 0 12 * * 1-5`（UTC）＝ 台北時間 **週一至週五 20:00**。
- 台股 09:00–13:30 交易、約 15:00 盤後資料確認，20:00 執行可取得當日確定收盤。
- 遇國定假日／無新交易日，session 會自行判斷並跳過（不產生 commit）。

## payload.json 範例

```json
{
  "date": "2026.08.07",
  "dateLabel": "2026/08/07（五）",
  "asOf": "2026.08.07",
  "taiex": { "index": "44,225.91", "change": "-170.79", "changePct": "-0.38%", "up": false },
  "tpex":  { "index": "384.19",   "change": "-7.18",   "changePct": "-1.83%", "up": false },
  "summary": "【理財】台股熱力圖 · 上市／上櫃｜2026.08.07 …",
  "hashtags": "#台股 #台股熱力圖 #市值熱力圖 #上市 #上櫃 #艾倫報報 #AllenI3Aurora",
  "note": "加權指數為證交所 2026/08/07 收盤資料…資料僅供參考，不構成投資建議。"
}
```

## 相關檔案

- `scripts/rotate-heatmap.mjs` —— 換日＋歸檔的可重複執行腳本（本排程呼叫）。
- `data/heatmap.json` —— 最新一日（前台 `heatmap.html` 讀取）。
- `data/heatmap-archive.json` —— 歷期彙整（前台以 kind「熱力圖」呈現）。
- `assets/heatmap/` —— 最新一日站內圖；`assets/heatmap/archive/` 為歷期歸檔圖。
- `taiex-heatmap` skill —— 產圖邏輯（字型量測、防重疊、5 階配色、市值面積壓縮）。
