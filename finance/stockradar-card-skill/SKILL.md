---
name: "stockradar-card"
description: "產出「台股選股雷達 TOP 10」品牌圖卡：深青夜空底、雙欄各 5 檔（排名、代號股名、收盤價、紅漲綠跌漲跌幅、金色達標訊號標籤）、艾倫報報 ALLEN I³ AURORA 品牌表頭與頁尾，輸出 Facebook(1200x630) 與 Instagram(1080x1080) 兩種尺寸。當使用者要求「選股雷達圖卡」「TOP10 訊號排行圖」「選股雷達 FB/IG 圖」「訊號雷達社群圖卡」，或要把當日 TOP10 選股清單做成可分享的品牌圖時，務必使用此 skill 照抄執行，不要從零重新設計版面。"
---

## 這個skill在做什麼

用 Python（Pillow）依既有成品樣式產出「台股選股雷達 TOP 10」圖卡：深青→夜藍漸層底＋淡格線星點；表頭為 AI³A 標誌＋金色「艾倫報報」＋窄體大字「TOP 10」＋「台股每日分析報表」與日期星期；主體雙欄各 5 檔——大號排名、代號＋股名（白）、右對齊等寬字收盤價、其下紅（漲▲）綠（跌▼）漲跌幅、股名下方金色圓角框「達標訊號標籤」（最多 5 項，無訊號顯示灰字「本期無符合訊號」）；欄間金色細分隔線、列間淡分隔線；頁尾金線＋品牌＋「資料來源：TWSE / TPEx / Goodinfo! 台灣股市資訊網 ・ 僅供研究參考，非投資建議」。每次輸出 FB(1200x630) 與 IG(1080x1080) 兩張（可只選一種）。

`scripts/render_stockradar_card.py` 是對照艾倫報報既有選股雷達成品逐項調校的版本（配色自成品取樣、標籤列有「不跨欄自動縮排／縮字」防呆），**照抄執行即可，不要重新設計版面或配色**，除非使用者明確要求調整外觀。

## 執行步驟

### 1. 準備工作目錄與資料

把 `scripts/` 內兩個檔案（`render_stockradar_card.py`、`stockradar.sample.json`）複製到本次任務的工作目錄。相依套件只有 Pillow，沒有就 `pip install pillow`。

依當日實際 TOP10 編輯資料 JSON（格式見 sample；`stockradar.sample.json` 是過去某日的示範資料，**不是當日行情，正式產圖前必須整份換成當日真實資料**）：

```json
{
  "date": "2026-08-07",
  "weekday": "星期五",            ← 選填，省略時由 date 自動計算
  "entries": [                    ← 恰 10 檔，依排名排序
    {"code": "2395", "name": "研華", "price": "634.00",
     "changePct": "1.93", "up": true, "signals": ["ma", "om", "eps"]}
  ]
}
```

- `signals` 鍵值：`gc`=黃金交叉、`ma`=均線多頭、`om`=營益率>10%、`rev`=營收年增>20%、`eps`=EPS年增>10%；只列「達標」項（最多 5 個），未達標不列，空陣列會顯示「本期無符合訊號」。
- `up` 是漲跌方向（true=漲紅▲、false=跌綠▼）；`changePct` 只填數字（不帶正負號與 %）。
- 數字務必用當日「收盤」查證值，不可用盤中快照，也不可編造——查不到就先問使用者。

### 2. 執行

```bash
python3 render_stockradar_card.py                    # 讀 stockradar.sample.json，輸出 FB＋IG
python3 render_stockradar_card.py 當日資料.json ig 輸出目錄   # 指定資料／單一格式（fb|ig|both）／輸出目錄
```

輸出檔名：`StockRadar_FB_<date>.png`、`StockRadar_IG_<date>.png`。
字型（Noto Sans CJK TC、Oswald、JetBrains Mono）不存在時自動下載到 `$TMPDIR/stockradar-fonts/`（CJK 兩檔合計約 33MB，第一次較慢屬正常，之後沿用快取）。

### 3. 產後驗證

用 Read 工具檢視兩張輸出圖，逐一確認：

- 尺寸正確（FB 1200x630、IG 1080x1080）；深青→夜藍漸層底。
- 表頭：AI³A 標誌、金色「艾倫報報」、TOP 10、日期與星期正確（星期要與日期相符）。
- 雙欄各 5 檔、順序 01–10；每檔代號股名、收盤價、漲跌幅與資料 JSON 一致。
- 上漲一律紅色▲、下跌一律綠色▼（方向與 `up` 相符，不可紅綠顛倒）。
- 訊號標籤金色框完整、**沒有跨過中央分隔線或超出邊界**；無訊號檔顯示「本期無符合訊號」。
- 頁尾品牌與資料來源聲明完整；中文無方框亂碼（有亂碼＝字型下載失敗，刪 `$TMPDIR/stockradar-fonts/` 重跑）。

### 4. 交付

用檔案附件工具（present_files / SendUserFile）附上兩張圖卡，簡短說明資料來源與日期。若需備份到 Google Drive，**不要把 PNG 走 base64 上傳**（>5KB 二進位必漂移損毀），改用 `gdrive-image-backup-without-base64` skill 的路徑（HTML 重繪版上傳、PNG 原檔留本機/repo/Drive 桌面同步）。

## 已知環境限制（省時間用）

- 此 skill **只負責畫圖，不負責選股**：TOP10 名單、價格與訊號由使用者的選股雷達管線（或使用者提供）決定；沒有資料時不要自行查行情硬湊，先要資料。
- 字型自動下載需要外網；封閉沙盒可預先把 `NotoSansCJKtc-Bold.otf`、`NotoSansCJKtc-Regular.otf`、`Oswald.ttf`、`JetBrainsMono-Bold.ttf` 放進 `$TMPDIR/stockradar-fonts/`。
- 標籤列防呆：同列標籤過寬時會先改從排名處起排、再逐級縮小字級（下限 11px），極端長股名＋滿 5 標籤時標籤會偏小，屬預期行為。
- 背景星點採固定亂數種子，同版本 Pillow 重跑輸出位元組一致，可用大小比對驗證傳輸未損毀。
