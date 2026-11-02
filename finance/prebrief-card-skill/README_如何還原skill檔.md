# prebrief-card skill — 備份還原說明

本資料夾是 `prebrief-card.skill`（zip 格式）的「解壓逐檔」純文字備份：
`.skill` 內全部檔案皆為純文字，故不上傳 zip 本體（二進位經 base64 上傳易損毀），
改為逐檔以原檔名備份於此。依下表還原即可。

## 檔案大小對照表（還原後請逐檔核對位元組數）

| 檔案（zip 內路徑） | 位元組數 | 本資料夾對應檔 |
|---|---:|---|
| `prebrief-card/SKILL.md` | 4,185 | `SKILL.md` |
| `prebrief-card/scripts/render_prebrief_card.py` | 6,193 | `render_prebrief_card.py` |

（原 `prebrief-card.skill` 本體：5,613 bytes，共 2 檔。）

## 還原路徑 A：重組 `.skill` 檔（供 Claude「Save skill」安裝）

```bash
mkdir -p prebrief-card/scripts
# 下載本資料夾兩檔，放到對應位置：
#   SKILL.md               → prebrief-card/SKILL.md
#   render_prebrief_card.py → prebrief-card/scripts/render_prebrief_card.py
zip -r prebrief-card.skill prebrief-card/
# 將 prebrief-card.skill 附進 Claude 對話，按「Save skill」安裝。
```

## 還原路徑 B：直接放進 Claude Code skills 目錄

```bash
mkdir -p ~/.claude/skills/prebrief-card/scripts
cp SKILL.md ~/.claude/skills/prebrief-card/
cp render_prebrief_card.py ~/.claude/skills/prebrief-card/scripts/
# 重啟 Claude Code 後即可以「產一張盤前速報品牌圖卡」觸發。
```

## 本資料夾其他檔案

- `Prebrief_Card_Skill_TestReview_2026-08-25.html`：兩案例測試檢視頁（純文字版；
  含 generate_review 靜態頁的完整斷言與證據，圖卡以 HTML/CSS 重繪呈現）。
- `Prebrief_Card_Sample_2026-08-25.html`：示範產出的 HTML 重繪版
  （PNG 原檔不經 base64 上傳，正式檔在 repo `assets/prebrief/prebrief-card.png`）。

備份日期：2026-08-25。skill 產出：台股盤前速報品牌圖卡 1200x630
（AllenI3Aurora 網站盤前速報頁／歷期彙整的站內備援圖與 og:image）。
