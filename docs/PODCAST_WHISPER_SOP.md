# Podcast 節目 SOP · 本機 Whisper 逐字稿 → 摘要 → 康乃爾筆記 → 發布

「艾倫報報」Podcast 後台的標準作業流程：在**本機**以 OpenAI Whisper 模型將
Podcast 音檔高效轉為準確的**繁體中文逐字稿**，於後台編修**繁中摘要**與
**一頁康乃爾重點筆記圖卡**，發布後前台首頁即顯示**最新一集**的摘要與筆記圖卡。

## 流程總覽

```
音檔（mp3/m4a/…）
  │  python scripts/podcast/transcribe.py 音檔.mp3        ← 本機 Whisper 轉錄
  ▼
逐字稿 .txt ＋ 筆記草稿 .notes.md
  │  依逐字稿撰寫（或請 AI 代擬後人工校對）摘要與康乃爾筆記
  ▼
後台 /admin →「Podcast 節目」→ 新增一集 → 貼上逐字稿／摘要／筆記 → 發布
  ▼
前台首頁「本集重點摘要」：最新一集繁中摘要 ＋ 康乃爾筆記圖卡
  │ （選配）後台「預覽筆記圖卡」→ 匯出本集 JSON
  ▼
python scripts/podcast/render_social_card.py --episode 本集.json
  → FB（1200×630）／IG（1080×1080）社群圖檔（assets/podcast/）
```

## 1. 本機環境安裝（一次性）

需求：Python 3.9+、ffmpeg。

```bash
# macOS
brew install ffmpeg
# Windows: winget install ffmpeg / Ubuntu: sudo apt install ffmpeg

# 轉錄引擎（擇一；建議 faster-whisper：同精度約快 4 倍、記憶體減半）
pip install faster-whisper opencc
# 或官方版
pip install openai-whisper opencc
```

OpenCC 為選配：Whisper 已以繁體 prompt 引導輸出繁體，OpenCC（`s2twp`）
再做「簡→台灣正體＋慣用詞」保底轉換，確保逐字稿全繁體。

## 2. 轉錄

```bash
python scripts/podcast/transcribe.py ep123.mp3
python scripts/podcast/transcribe.py ep123.mp3 --model large-v3 --srt   # 更準＋字幕
python scripts/podcast/transcribe.py *.mp3 --output-dir transcripts     # 批次
```

輸出（與音檔同層或 `--output-dir`）：

| 檔案 | 用途 |
| --- | --- |
| `ep123.txt` | 繁中逐字稿全文 → 貼入後台「逐字稿 transcript」欄 |
| `ep123.notes.md` | 摘要＋康乃爾筆記**草稿範本**（自行或請 AI 依逐字稿填寫） |
| `ep123.srt` | 字幕檔（`--srt` 時輸出，含時間軸） |

模型選擇（中文聽寫建議 `medium` 起跳）：

| 模型 | 速度 | 中文準確度 | 適用 |
| --- | --- | --- | --- |
| `small` | 快 | 尚可 | 快速草稿 |
| `medium`（預設） | 中 | 佳 | 日常轉錄 |
| `large-v3` | 慢 | 最佳 | 正式發布、多人對談 |

CPU 機器建議加 `--compute-type int8` 提速；有 NVIDIA GPU 用 `--device cuda`。

## 3. 撰寫摘要與康乃爾筆記

依 `ep123.txt` 逐字稿完成 `ep123.notes.md`（也可將逐字稿交給 AI 代擬、再人工校對）：

- **繁中摘要（summary）**：150–250 字，概括主題、論點、結論與可行動的啟發。
- **康乃爾筆記（cornell.rows）**：每列＝左欄「線索／關鍵字」＋右欄「筆記內容」。
- **底部總結（cornell.summary）**：2–3 句收斂整集；留空則圖卡沿用上方摘要。

## 4. 後台輸入與發布

1. 開啟 `/AllenI3Aurora/admin/` 登入 → 左側「**Podcast 節目**」。
2. 「＋ 新增一集」：填節目（show）、集數標題、日期（`2026.08.22`）、長度、收聽連結。
3. 「基本資料與逐字稿」分頁貼上 `ep123.txt` 全文。
4. 「摘要與康乃爾筆記」分頁貼上摘要、逐列輸入線索／筆記、底部總結。
5. 「預覽筆記圖卡」確認一頁康乃爾圖卡版面 → 右上「**✓ 發布**」。
   （草稿不會出現在前台；可隨時「退回草稿」下架。）

## 5. 社群圖卡（FB／IG，比照台股熱力圖圖卡）

把該集康乃爾筆記輸出為可直接發社群的圖檔（深色極光風、右下角「艾倫報報
ALLEN I³ AURORA」品牌圖卡，與熱力圖圖卡同一組品牌鎖定版式）：

```bash
pip install pillow                                     # 一次性
python scripts/podcast/render_social_card.py           # 內建示範集，試跑驗版面
python scripts/podcast/render_social_card.py --episode ep123.json
python scripts/podcast/render_social_card.py --episode ep123.json --stem ep123
```

- 輸出：`assets/podcast/{stem}-fb.png`（1200×630）與 `{stem}-ig.png`（1080×1080），
  預設 stem 為 `podcast-cornell`。
- `--episode` 的 JSON 由後台「預覽筆記圖卡」分頁的「**⬇ 匯出本集 JSON**」下載，
  欄位與後台一致（`show/title/date/duration/tone/summary/cornell`）。
- 中文字型自動尋找系統 Noto Sans CJK／PingFang／文泉驛；都沒有時自動從
  fonts.gstatic.com 下載 Noto Sans TC 到 `scripts/podcast/.fonts/`（不進版控）。
- 版面自動處理：CJK 逐字換行（含避頭點）、超長筆記省略、列數超出以
  「…及另外 N 個重點」註記、內容偏少時自動均分行距。

## 6. 前台顯示規則

- 資料存於 Firestore `aurora_podcast_episodes`（公開讀、僅管理者寫；
  規則見 `firebase/firestore.rules`，需重新發布規則一次）。
- 前台 `aurora-data.js` 讀取時過濾草稿；首頁右欄「**本集重點摘要**」取
  **最新一集**（日期新者優先，同日比 sort 大者）顯示繁中摘要，
  「康乃爾筆記圖卡」按鈕展開一頁圖卡（線索欄／筆記欄／底部總結）。
- Firestore 未設定或讀取失敗時，沿用 `kit.jsx` 內建示範集數，網站照常運作。

## 疑難排解

| 症狀 | 處理 |
| --- | --- |
| `ffmpeg not found` | 安裝 ffmpeg 並確認在 PATH |
| 逐字稿出現簡體字 | 安裝 OpenCC（`pip install opencc`）後重跑 |
| 轉錄太慢 | 改 `--model small`、加 `--compute-type int8`，或使用 GPU（`--device cuda`） |
| 後台儲存權限不足 | 以管理者 email 登入；並確認已發布最新 `firestore.rules` |
| 前台看不到新集數 | 確認該集已「發布」（非草稿），重新整理頁面 |
