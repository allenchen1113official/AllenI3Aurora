# taiex-heatmap.skill（2026-08-23 更新版）備份說明

本資料夾是更新版 `taiex-heatmap.skill`（2026-08-23 打包，23,912 bytes；
新增「已知環境限制」：相依套件與字型缺失補救指令）的**無損內容備份**。

`.skill` 本身是 zip 二進位檔，經 AI 助手 base64 上傳必定損毀（>5KB 限制，
見 gdrive-image-backup-without-base64 skill），因此改存它「解壓後的全部內容」
——六個純文字檔，逐一驗證過與原檔位元組一致：

| 檔案 | 在 .skill 內的路徑 | 大小 (bytes) |
| --- | --- | --- |
| `SKILL.md` | `taiex-heatmap/SKILL.md` | 9,974 |
| `taiex_heatmap.py` | `taiex-heatmap/scripts/taiex_heatmap.py` | 13,859 |
| `taiex_data.py` | `taiex-heatmap/scripts/taiex_data.py` | 16,062 |
| `taiex_heatmap_bymarket.py` | `taiex-heatmap/scripts/taiex_heatmap_bymarket.py` | 11,546 |
| `make_brand_asset.py` | `taiex-heatmap/scripts/make_brand_asset.py` | 4,151 |
| `render_one.py` | `taiex-heatmap/scripts/render_one.py` | 853 |

## 還原成 .skill（需要時）

```bash
mkdir -p taiex-heatmap/scripts
# 把 SKILL.md 放進 taiex-heatmap/
# 把五個 .py 放進 taiex-heatmap/scripts/
zip -r taiex-heatmap.skill taiex-heatmap
```

（zip 壓縮參數不同會使檔案大小與 23,912 略有出入，屬正常；skill 安裝只看內容。）

## 直接安裝（更簡單）

不必重組 zip：把 `taiex-heatmap/` 資料夾（含上述六檔、維持目錄結構）放進
Claude 的 skills 目錄（如 `~/.claude/skills/`）即可使用；或請 Claude
「用這六個檔案重新打包 taiex-heatmap.skill」。

相關備份：`AllenI3Aurora/podcast/podcast-cornell-card-skill/`（Podcast 康乃爾
筆記圖卡 skill，同一套備份做法）。
