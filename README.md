# content 分支：Claude 排程素材

這個分支只放 Claude 排程任務的社群素材與匯入紀錄，不部署到 GitHub Pages。

- `content/<topic>/<YYYYMMDD>/`：`manifest.json`＋`fb.txt`／`ig.txt`／`threads.txt`＋圖卡 PNG
- `content/<topic>/<YYYYMMDD>/_publish/`：匯入時轉好的 JPEG（由 social-publish.yml 寫入）
- `ops/ingest_log/<YYYYMMDD>.json`：各主題貼文狀態（給 AllenI3Aurora Agent 讀）

topic：`txf-flash`、`tsm-prebrief`、`daily`、`noon`、`heatmap`、`stockradar`。
格式與規則見 main 分支 `docs/SOCIAL_SOP.md` 第九之二節。
