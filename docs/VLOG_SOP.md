# Vlog 影片系列 SOP（後台「Vlog 影片系列」· `aurora_vlog_episodes`）

## 資料與檔案在哪
- **文案／章節／腳本／字幕**：Firestore `aurora_vlog_episodes`（doc id = `<seriesId>-epNN`，例 `iceland2026-ep03`）。後台面板 `admin/vlog.jsx`。
- **種子資料**：`data/vlog/<系列>.json`（含全部欄位，可離線編修後再「匯入系列 JSON」；勾「覆寫已存在」會以 merge 覆蓋 Firestore 現值）。
- **成片／短版預告／縮圖**：Google Drive「2026冰島旅行／YouTube製作包／EPxx」（MP4 190–310 MB，不進 repo）；每集 `media.driveFolder`／`fullVideo`／`trailer`／`thumbnail` 記錄檔名。
- **公開頁**：`vlog.html` 只列 `status == "published"` 的集數，有 YouTube ID 就嵌入播放器。

## 每集流程
1. 後台 → Vlog 影片系列 → 點集數。
2. **標題與 SEO 文案**：主標題 ≤100 字（依 JessieLAB 六法：數字＋關鍵字＋受眾＋承諾）；備用標題可「⇅」與主標題交換做 A/B；說明欄前 2 行是搜尋摘要；標籤 ≤500 字；每欄都有「⧉ 複製」直接貼到 YouTube Studio。
3. **章節與腳本**：章節首條必為 `00:00`、至少 3 條；改完按說明欄的「↻ 同步章節時間軸」。重剪後若章節時間變動，用「從腳本擷取」或手改。
4. **字幕 SRT**：可整體平移（重剪片頭長度變動時）、重新編號、下載 `.srt`；檢查會標出時間倒置與單行 >24 字。
5. **素材與影音**：填 YouTube 影片 ID（或網址）後即顯示預覽；記錄 Drive 檔名與使用照片清單。
6. **檢查與發布**：五項清單（個資／響度／字幕／縮圖／已上傳）→「標記已發布」→「✈ 建立 PilotOne 貼文草稿」（FB 圖文＋YouTube 連結，縮圖用 `img.youtube.com/vi/<id>/maxresdefault.jpg`）→ 到「PilotOne 審核」核准排程。

## 製作規格（冰島環島 2026）
- 每集 18:00、1080p30；男聲旁白（Kokoro `zm_yunxi`，離線 TTS）；對白字幕燒錄＋同步 SRT；原創生成背景音樂（D 大調 96 BPM，側鏈閃避人聲）；母帶 **-14 LUFS／True Peak ≤ -1 dBTP**。
- 個資：訂位代號、證件、電話、Email、卡號、車牌、收據一律不入鏡；花費金額可公開。
- 製作腳本（TTS、字幕、組片、母帶）留在製作環境，不進 repo；重剪時沿用同一份旁白音軌與 SRT。
