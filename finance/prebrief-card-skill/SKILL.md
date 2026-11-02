---
name: "prebrief-card"
description: "產出「台股盤前速報」品牌圖卡（1200x630，FB/OG 尺寸）：夜空底＋極光漸層光暈、艾倫報報 ALLEN I³ AURORA 品牌列、「盤前 · PRE-MARKET」標籤膠囊、主標「台股盤前速報」與品牌標語，視覺沿用 AllenI3Aurora 網站 Aurora tokens。當使用者要求「盤前速報圖卡」「盤前速報品牌圖」「prebrief 圖卡／預設圖卡／備援圖」「盤前速報 og:image」，或要為盤前速報頁面、歷期彙整卡片、社群分享補一張品牌圖時，務必使用此 skill 照抄執行，不要從零重新設計圖卡。"
---

## 這個skill在做什麼

用 Python（Pillow）畫一張 1200x630 的「台股盤前速報」品牌圖卡：深夜空底（#0B1020）疊上四團極光光暈（#3DDC97 → #2DD4BF → #4F7BF0 → #7C3AED，高斯模糊）與可重現的星點（固定亂數種子，輸出位元組穩定可比對）；左上品牌列（漸層圓角方塊 I³ ＋「艾倫報報 ALLEN I³ AURORA」）、右上「盤前 · PRE-MARKET」標籤膠囊、置中偏左大字主標「台股盤前速報」＋漸層底線、兩行副標（內容範圍與「開盤前三分鐘，掌握多空關鍵」）、底部品牌標語與網址。

這張卡是「靜態品牌備援圖」：不吃當日行情資料、不帶日期，產一次可長期使用。在 AllenI3Aurora 網站上，當日 Drive 資料夾（`AllenI3Aurora/finance/TSMPreBrief/YYYYMMDD/`）沒有圖檔時，盤前速報頁（prebrief.html）與歷期彙整卡片就顯示此卡；它同時是 prebrief.html 的 og:image。

`scripts/render_prebrief_card.py` 是經驗收的成熟版本（配色取自網站 tokens/colors.css、版面經目視調校），**照抄執行即可，不要重新設計排版、配色或文案**，除非使用者明確要求調整外觀。

## 執行步驟

### 1. 準備

把 `scripts/render_prebrief_card.py` 複製到本次任務的工作目錄。相依套件只有 Pillow，沒有就 `pip install pillow`。

### 2. 執行

```bash
python3 render_prebrief_card.py            # 預設輸出 ./prebrief-card.png
python3 render_prebrief_card.py 自訂路徑.png  # 或指定輸出路徑（會自動建立中間目錄）
```

- 中文字型（Noto Sans CJK TC Bold/Regular）不存在時會自動下載到暫存目錄（`$TMPDIR/prebrief-fonts/`，來源 raw.githubusercontent.com/googlefonts/noto-cjk，兩檔合計約 33MB），第一次執行較慢屬正常；之後同機重跑會沿用快取。
- 若是為 AllenI3Aurora 網站更新站內備援圖，在 repo 根目錄執行並指定 `assets/prebrief/prebrief-card.png`。

### 3. 產後驗證

用 Read 工具檢視輸出圖，逐一確認：

- 尺寸 1200x630；整體為深夜空底＋右上藍紫、左下綠青的極光光暈。
- 左上品牌列：漸層圓角方塊內「I³」清晰、旁邊兩行「艾倫報報」「ALLEN I³ AURORA」。
- 右上膠囊「盤前 · PRE-MARKET」完整、未被裁切。
- 主標「台股盤前速報」六字完整清晰（若出現方框亂碼＝字型下載失敗，刪掉暫存字型目錄重跑）。
- 主標下方有一條由綠到紫的漸層底線；兩行副標與底部標語、網址皆完整未重疊。

### 4. 交付

用檔案附件工具（present_files / SendUserFile）附上圖卡。若需備份到 Google Drive，**不要把 PNG 走 base64 上傳**（>5KB 二進位必漂移損毀），改用 `gdrive-image-backup-without-base64` skill 的路徑（HTML 重繪版上傳、PNG 原檔留本機/repo）。

## 已知環境限制（省時間用）

- 字型自動下載需要外網（約 33MB）；在封閉沙盒可先把 `NotoSansCJKtc-Bold.otf`、`NotoSansCJKtc-Regular.otf` 放進 `$TMPDIR/prebrief-fonts/` 免下載。系統只有 emoji 字型時中文必空框，務必確認字型就緒。
- 星點用固定亂數種子（20260824），同版本 Pillow 重跑輸出應一致；不同 Pillow 版本可能有微小像素差，屬正常。
- 圖卡為靜態品牌卡，**不含日期與當日行情**；若使用者要的是「帶當日內容的盤前速報圖」，先確認需求，那不在此 skill 範圍（可另行設計或擴充，不要硬套）。
