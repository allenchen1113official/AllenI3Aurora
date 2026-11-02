# stockradar-card skill — 備份還原說明

本資料夾是 `stockradar-card.skill`（zip 格式）的「解壓逐檔」純文字備份：
`.skill` 內全部檔案皆為純文字，故不上傳 zip 本體（二進位經 base64 上傳易損毀），
改為逐檔以原檔名備份於此。依下表還原即可。

## 檔案大小對照表（還原後請逐檔核對位元組數）

| 檔案（zip 內路徑） | 位元組數 | 本資料夾對應檔 |
|---|---:|---|
| `stockradar-card/SKILL.md` | 5,370 | `SKILL.md` |
| `stockradar-card/scripts/render_stockradar_card.py` | 12,851 | `render_stockradar_card.py` |
| `stockradar-card/scripts/stockradar.sample.json` | 1,274 | `stockradar.sample.json` |

（原 `stockradar-card.skill` 本體：9,125 bytes，共 3 檔。）

## 還原路徑 A：重組 `.skill` 檔（供 Claude「Save skill」安裝）

```bash
mkdir -p stockradar-card/scripts
# 下載本資料夾三檔，放到對應位置：
#   SKILL.md                 → stockradar-card/SKILL.md
#   render_stockradar_card.py → stockradar-card/scripts/render_stockradar_card.py
#   stockradar.sample.json   → stockradar-card/scripts/stockradar.sample.json
zip -r stockradar-card.skill stockradar-card/
# 將 stockradar-card.skill 附進 Claude 對話，按「Save skill」安裝。
```

## 還原路徑 B：直接放進 Claude Code skills 目錄

```bash
mkdir -p ~/.claude/skills/stockradar-card/scripts
cp SKILL.md ~/.claude/skills/stockradar-card/
cp render_stockradar_card.py stockradar.sample.json ~/.claude/skills/stockradar-card/scripts/
# 重啟 Claude Code 後即可以「產選股雷達 TOP10 圖卡」觸發。
```

## 本資料夾其他檔案

- `Stockradar_Card_Skill_TestReview_2026-08-25.html`：兩案例測試檢視頁（純文字版；
  含 generate_review 靜態頁的完整斷言與證據，圖卡以 HTML/CSS 重繪呈現）。
- `Stockradar_Card_Sample_2026-08-25.html`：示範產出（2026-08-07 樣本資料）的 HTML 重繪版
  （PNG 原檔不經 base64 上傳；站內備援圖在 repo `assets/stockradar/`，
  每日成品在 Drive `finance/stockradar/YYYYMMDD/`）。

備份日期：2026-08-25。skill 產出：台股選股雷達 TOP 10 品牌圖卡
FB(1200x630)＋IG(1080x1080)，視覺復刻自艾倫報報既有選股雷達成品；
此 skill 只負責畫圖，TOP10 名單與訊號由選股雷達管線提供。
