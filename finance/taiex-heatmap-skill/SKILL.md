---
name: "taiex-heatmap"
description: "產出台股上市(TWSE)/上櫃(TPEx)大型股熱力圖（treemap），紅漲綠跌、方塊大小依市值比例、右下角附「艾倫報報 ALLEN I³ AURORA」品牌圖卡，輸出Facebook(1200x630)與Instagram(1080x1080)格式。當使用者要求「台股熱力圖」「大盤熱力圖」「上市/上櫃熱力圖」「市值熱力圖」「台股類股表現圖」，或想要可分享到社群的台股當日行情視覺化圖卡時，務必使用此skill，即使使用者只說「幫我做張台股的圖」也要優先考慮這個skill而非從零設計。"
---

## 這個skill在做什麼

用 Python（matplotlib + squarify + Pillow）畫兩張「巢狀樹狀圖」（產業類股 → 個股兩層），呈現台股上市前100大、上櫃前50大代表股當日漲跌：色塊代表個股，顏色深淺依漲跌幅分5階（台灣慣例：紅漲、綠跌，不用中性灰），色塊大小依市值權重比例（經冪次壓縮以維持可讀性），每個市場各輸出 Facebook (1200x630) 與 Instagram (1080x1080) 兩種尺寸，圖卡右下角固定附上「艾倫報報 ALLEN I³ AURORA」品牌圖卡。

這是經過使用者多輪確認、最終驗收通過的成熟版本，`scripts/` 內的程式邏輯（字型量測、防重疊排版、5階配色公式、市值面積壓縮算法）都已調校過，**照抄執行即可，不要重新設計排版或配色邏輯**，除非使用者明確要求調整外觀。

## 執行步驟

### 1. 準備工作目錄

把 `scripts/` 資料夾內的 5 個檔案（`taiex_heatmap.py`、`taiex_data.py`、`taiex_heatmap_bymarket.py`、`make_brand_asset.py`、`render_one.py`）複製到本次任務的輸出資料夾中，在該資料夾內執行後續指令（程式間用相對匯入 `from taiex_heatmap import ...`，必須放在同一層目錄）。複製後檔案可能是唯讀，先執行 `chmod u+w *.py` 才能修改 `taiex_data.py`。

### 2. 查證當日真實收盤數據

`taiex_data.py` 裡的 `TWSE_OVERRIDES`、`TWSE_SECTOR_BASE`、`TPEX_OVERRIDES`、`TPEX_SECTOR_BASE` 是中性預設值（不是任何真實交易日的數字），**每次執行前都要重新查證並覆蓋**，否則圖卡會顯示無意義的假資料。

**最重要的一條規則：只採用「收盤」數字，絕不採用「盤中」快照。**

這是實務上最容易出錯、也最容易被使用者一眼看穿的地方。各家財經網站的個股頁面會依當下狀態標示「收盤」「市場盤中」「市場清盤」等字樣：

- 頁面標示「**收盤 | YYYY/MM/DD 14:30**」（Yahoo奇摩股市）→ 可採用。
- 頁面標示「**市場盤中 MM/DD hh:mm**」（鉅亨網等）→ **不可採用**。這是尚未收盤或跨日快取的即時報價，與當日收盤價經常差距很大。
- 頁面標示「市場清盤」「昨收＝最新」→ 代表該頁面沒有當日成交資料，不可採用。

實際教訓：某次執行時，上櫃權值股「群聯(8299)」取自鉅亨網標示「市場盤中 08/17 03:34」的快照，得到 +1.44%，但當日實際收盤為 **+0.24%**，圖卡發布後被使用者直接指出錯誤。群聯是上櫃市場市值權重最高的個股之一（約7.9%），方塊大、最顯眼，任何誤差都會被立刻發現。**每次執行都必須把 8299 排入強制查證清單第一順位，且必須確認來源頁面標示的是「收盤」。**

另一條同樣重要的規則：**漲跌方向要自己算。** 多數頁面主要區塊的「漲跌幅」文字不帶正負號，下跌時仍顯示為正數。務必以 `(成交 − 昨收) / 昨收` 自行計算並保留符號，不可直接抄頁面上的漲跌幅數字。

#### 查證方法（依可靠度排序）

1. **Yahoo奇摩股市個股頁**（最可靠，會明確標示「收盤 | 日期 14:30」）
   - 上市：`https://tw.stock.yahoo.com/quote/{代號}.TW`
   - 上櫃：`https://tw.stock.yahoo.com/quote/{代號}.TWO`
   - 若可用 Claude in Chrome，導航後用 `javascript_tool` 抽取：
     ```js
     const t="\n"+document.body.innerText;
     const g=k=>{const i=t.indexOf("\n"+k+"\n");return i<0?null:t.slice(i+k.length+2).split("\n")[0];};
     JSON.stringify({close:g("成交"),prev:g("昨收"),pct:g("漲跌幅")})
     ```
   - 進階技巧：在 Yahoo 個股頁的同源環境下，可用 `fetch("/quote/{代號}.TW")` 取回**伺服器端渲染**的 HTML，再用正則
     `>{標籤}<\/span><span[^>]*>([\d.,]+)<` 抽出「成交」「昨收」，一次 JS 呼叫可批次處理約 10 檔，比逐頁導航快很多。惟連續大量請求後 Yahoo 可能節流導致 fetch 掛起；一旦出現逾時就換方法，不要硬重試。
2. **鉅亨網個股頁** `https://www.cnyes.com/twstock/{代號}` — meta-description 內含價格，但**必須先確認頁面標示為「收盤」而非「市場盤中」**，否則丟棄。
3. **WebSearch 文字搜尋** — 最不可靠，經常混入不同交易日的快照且互相矛盾，只能當作方向性交叉驗證，不可作為精確數字的唯一來源。

#### 強制查證清單

上市與上櫃**市值權重最高的前10檔**（依 `TWSE_WEIGHT` / `TPEX_WEIGHT` 排序）必須逐一查證，不可遺漏；理想上擴大到各20~30檔。上櫃務必包含 **8299 群聯**。查證完、產圖前，回頭對照一次清單確認每檔都已寫入 OVERRIDES。

查到的數字填入 `TWSE_OVERRIDES` / `TPEX_OVERRIDES`（格式：`"股票代碼": 漲跌幅%`），類股平均漲跌幅填入 `*_SECTOR_BASE`。**查不到當日收盤精確數字的個股，不要放進 OVERRIDES**（會自動退回同類股平均值 + 小幅可重現的模擬變化），也不要編造 —— 這是使用者特別在意的一點。

若使用者要求的是特定過去交易日，用該日期查證，並用環境變數 `TAIEX_TRADE_DATE=YYYY-MM-DD` 指定日期讓標題正確顯示。

### 3. 執行程式

```bash
python3 make_brand_asset.py     # 產出 brand_lockup.png 品牌圖卡素材
python3 taiex_data.py           # 確認印出 TWSE stocks: 100 / TPEx stocks: 50
TAIEX_TRADE_DATE=YYYY-MM-DD python3 render_one.py twse_fb
TAIEX_TRADE_DATE=YYYY-MM-DD python3 render_one.py twse_ig
TAIEX_TRADE_DATE=YYYY-MM-DD python3 render_one.py tpex_fb
TAIEX_TRADE_DATE=YYYY-MM-DD python3 render_one.py tpex_ig
```

沙盒環境偶爾較慢，一次跑一張圖仍逾時屬正常，重試該指令即可；不要把 4 張圖合併成一個指令執行。若使用者只要其中一個市場或格式，只跑對應參數即可。

### 4. 驗證

用 Read 工具檢視產出的圖，逐一確認：
- 標題日期正確、家數為「共 100 檔」／「共 50 檔」
- 文字沒有互相重疊、沒有超出色塊邊界
- 右下角有「艾倫報報 ALLEN I³ AURORA」品牌圖卡
- 上漲個股一律紅色系、下跌個股一律綠色系（不應出現大片中性灰色塊）
- **畫面中方塊最大的權值股數字，是否都來自標示「收盤」的來源**（上市看台積電、聯發科、台達電、鴻海；上櫃看穩懋、環球晶、群聯）

若有瑕疵，修正 `taiex_data.py` 的資料或再次執行，不要交付有明顯排版問題或可疑數字的圖檔。

### 5. 交付

用 present_files 附上產出的圖卡，並簡短說明資料查證程度（哪些個股是當日收盤查證的真實數字、哪些是類股平均模擬值），不需贅述繪圖技術細節。

## 已知環境限制（省時間用）

- `mcp__workspace__bash` 沒有外網，無法自行呼叫任何行情 API。
- `web_fetch` 有 provenance 限制，只能抓「使用者訊息中出現過」或「WebSearch 結果中出現過」的網址；TWSE / TPEx 官方 open API（`STOCK_DAY_ALL`、`tpex_mainboard_daily_close_quotes`）即使抓得到，內容常落後一個交易日，不適合當日資料來源。
- 熱力圖 PNG 轉 base64 上傳 Google Drive 時，字串長度務必壓到約 1 萬字元以內（例如轉 JPEG、quality 30~40、寬邊 170~300px），否則轉貼過程容易截斷造成檔案損毀。上傳後比對回傳的 `fileSize` 與本地檔案大小是否一致，不一致代表字串在傳輸中被弄壞，應 trash 掉重傳。

- 相依套件不一定預裝：執行前先 `pip install matplotlib squarify pillow numpy`（缺 squarify 是最常見的失敗原因）。
- 沙盒可能沒有腳本寫死路徑的字型：`/usr/share/fonts/opentype/noto/NotoSansCJK-{Regular,Bold}.ttc` 與 `/usr/share/fonts/truetype/google-fonts/Poppins-{Medium,Bold}.ttf`。缺字型時 `make_brand_asset.py` 直接失敗、`taiex_heatmap.py` 退回 sans-serif 使中文變豆腐格（2026-08-23 於 Claude Code 遠端沙盒實測確認）。補救：沙盒的 HTTPS 代理可通 fonts.gstatic.com，以 root 下載 Noto Sans TC 與 Poppins 放到上述路徑即可（.ttf 存成 .ttc 檔名亦可，freetype 依內容判格式）：

  ```bash
  mkdir -p /usr/share/fonts/opentype/noto /usr/share/fonts/truetype/google-fonts
  curl -s -o /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf"
  curl -s -o /usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf"
  curl -s -o /usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf "https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9V1s.ttf"
  curl -s -o /usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf "https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLCz7V1s.ttf"
  ```

  若連字型下載都失敗，改用系統既有 CJK 字型（如 `/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc`）覆蓋腳本頂端的字型路徑常數，不要用預設 sans-serif 硬渲染。上述網址若失效，向 `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&family=Poppins:wght@500;700` 以舊版 User-Agent（如 `Mozilla/4.0`）請求即可取得最新 ttf 網址。
