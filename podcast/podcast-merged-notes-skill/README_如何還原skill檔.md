# podcast-merged-notes skill · 還原說明

本資料夾是 `podcast-merged-notes.skill`（v2，2026-08-25）的**解壓逐檔備份**。
`.skill` 檔本質是 zip，內容全為純文字，故不上傳 zip 本體，改逐檔以原檔名備份，
避免二進位經 base64 上傳漂移損毀。

## 檔案清單與大小對照（還原後請逐檔核對位元組數）

| 檔案 | 位元組 | MIME |
| --- | ---: | --- |
| `SKILL.md` | 8,073 | text/markdown |
| `scripts/build_merged_notes.py` | 18,776 | text/x-python |
| `shows.sample.json` | 1,448 | application/json |
| `episodes.sample/gooaye.json` | 1,492 | application/json |
| `episodes.sample/manny.json` | 1,564 | application/json |
| `episodes.sample/lexfridman.json` | 1,483 | application/json |

（`Podcast_MergedNotes_Skill_TestReview_2026-08-25.html` 為測試檢視頁，僅供檢視，不屬 skill 內容物。）

## 還原路徑一：重組 .skill 檔

把上表檔案依原始資料夾結構放好（`scripts/`、`episodes.sample/` 為子資料夾），然後：

```bash
mkdir -p podcast-merged-notes/scripts podcast-merged-notes/episodes.sample
# 將各檔放入對應位置後：
zip -r podcast-merged-notes.skill podcast-merged-notes/ -x "*__pycache__*"
```

在 Claude 對話中以檔案附上 `.skill`，按「Save skill」即可安裝。

## 還原路徑二：直接放入 skills 資料夾（免打包）

```bash
mkdir -p ~/.claude/skills/podcast-merged-notes
# 依上表結構把檔案放進去即可，Claude Code 會自動載入
```

## 這個 skill 在做什麼（摘要）

把各集 Podcast 節目 JSON（繁中摘要＋康乃爾筆記）與常聽清單合併計算，
產出「常聽 Podcast × 最新一集重點筆記」合併區塊的四件產出：
`merged.json`、`podcast_episodes.snippet.js`（貼回 kit.jsx / Firestore）、
`podcasts.snippet.js`（常聽清單片段）、`merged_preview.html`（Aurora 風格預覽）。
未提供筆記及摘要的節目以連結卡呈現（屬正常設計）；
節目名的「| Podcast on Spotify」等平台後綴會自動剝除再配對。
詳見 `SKILL.md`。

## v2 變更（2026-08-25）

- 常聽清單範例擴充為 8 個實際節目（新增財經一路發、兆華與股惑仔、AI懶人報、
  游庭皓的財經皓角、Acquired，連結皆為查證過的官方 Spotify show 頁）
- 平台後綴正規化（配對與顯示前剝除「| Podcast on …」）
- 未提供筆記的節目改以 `[資訊]` 友善列出（連結卡屬正常，非錯誤）
- 新增 `podcasts.snippet.js` 產出
