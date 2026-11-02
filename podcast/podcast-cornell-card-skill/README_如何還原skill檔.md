# podcast-cornell-card.skill 備份說明

本資料夾是 `podcast-cornell-card.skill`（2026-08-23 打包，11,390 bytes）的**無損內容備份**。

`.skill` 本身是 zip 二進位檔，經 AI 助手 base64 上傳必定損毀（>5KB 限制，
見 gdrive-image-backup-without-base64 skill），因此改存它「解壓後的全部內容」
——三個純文字檔，逐一驗證過與原檔位元組一致：

| 檔案 | 在 .skill 內的路徑 | 大小 (bytes) |
| --- | --- | --- |
| `SKILL.md` | `podcast-cornell-card/SKILL.md` | 6,321 |
| `render_social_card.py` | `podcast-cornell-card/scripts/render_social_card.py` | 17,217 |
| `episode.sample.json` | `podcast-cornell-card/scripts/episode.sample.json` | 1,068 |

## 還原成 .skill（需要時）

```bash
mkdir -p podcast-cornell-card/scripts
# 把 SKILL.md 放進 podcast-cornell-card/
# 把 render_social_card.py、episode.sample.json 放進 podcast-cornell-card/scripts/
zip -r podcast-cornell-card.skill podcast-cornell-card
```

（zip 壓縮參數不同會使檔案大小與 11,390 略有出入，屬正常；skill 安裝只看內容。）

## 直接安裝（更簡單）

其實不必重組 zip：把 `podcast-cornell-card/` 資料夾（含上述三檔、維持目錄結構）
放進 Claude 的 skills 目錄（如 `~/.claude/skills/`）即可使用；或請 Claude
「用這三個檔案重新打包 podcast-cornell-card.skill」。
