# Podcast（RSS 託管）SOP — 艾倫極光報報 ALLEN I³ AURORA

PilotOne 的第五個頻道 `pc`。一集 Podcast＝一筆 `aurora_social_posts`，和 FB／IG／Threads／YouTube 一樣**一律經 PilotOne 人工核准**才上架。

> 常聽節目「抓別人的 RSS 做筆記」是 `scripts/podcast/feeds-core.mjs`／`update-feeds.mjs`，與本 SOP 無關。

## 架構

```
音檔（Drive 送審包／https 網址／Drive 分享連結）
  → PilotOne 核准（中控台「建立內容」或「PilotOne 審核」）
  → social-publish.yml 常駐輪詢（每 2 分鐘）scripts/social/publish-social-posts.mjs
       core.mjs planPodcast：預定時間前 5 分鐘內 publish_now
       podcast.mjs：下載音檔 → GitHub Releases「podcast-<台北年度>」附件 → Firestore aurora_podcast_feed/<貼文 id>
  → 有集數上架即跑 scripts/podcast/build-show-feed.mjs
       show.json＋aurora_podcast_feed → podcast.xml（Contents API 提交到 main）
  → GitHub Pages：https://allenchen1113official.github.io/AllenI3Aurora/podcast.xml
  → Apple Podcasts／Spotify／YouTube Music／KKBOX 定期抓 RSS（通常數十分鐘～數小時）
```

| 項目 | 位置 |
|---|---|
| 節目設定（名稱、簡介、分類、owner email、封面網址） | `scripts/podcast/show.json` |
| 節目封面 3000×3000 | `assets/podcast/show-cover-3000.jpg`（`python3 scripts/podcast/render_show_cover.py` 重產） |
| 音檔 | GitHub Releases `podcast-2026`、`podcast-2027`…（每集一個附件，檔名 `<台北日期>-<貼文id>.<副檔名>`） |
| 集數資料 | Firestore `aurora_podcast_feed/<貼文 id>`（只有排程器以 Admin SDK 讀寫；前端規則預設拒絕） |
| RSS | repo 根目錄 `podcast.xml`（自動產生，**不要手改**，下次重建會被覆蓋） |
| 測試 | `node --test scripts/social/podcast.test.mjs scripts/podcast/show-feed.test.mjs` |

不需要新增任何 Secret：上傳 Releases 與提交 `podcast.xml` 用 workflow 內建的 `GITHUB_TOKEN`（`contents: write`）；Drive 音檔沿用 `GDRIVE_SERVICE_ACCOUNT`。

## 一次性設定：把節目送上各平台

RSS 裡至少要有 **1 集**才能送審。建議第一集發一支 1–2 分鐘的節目介紹（Show notes 寫「episodeType: trailer」，見下方 manifest；預告不佔集數）。

1. **確認 RSS**：瀏覽器打開訂閱網址，看得到 `<item>`；可用 [Podbase](https://podba.se/validate/) 或 [Cast Feed Validator](https://www.castfeedvalidator.com/) 檢查。
2. **Apple Podcasts**：[Podcasts Connect](https://podcastsconnect.apple.com/) → ＋ → 新節目 → 「新增具有 RSS 訂閱的節目」→ 貼訂閱網址 → 送審（約 1–5 天）。
3. **Spotify**：[Spotify for Creators](https://creators.spotify.com/) → 「我已有 Podcast」→ 貼 RSS → 驗證碼會寄到 `show.json` 的 owner email（allenchen1113.official@gmail.com）。
4. **YouTube Music**：YouTube Studio → 內容 → Podcast → 「透過 RSS 摘要提交 Podcast」。注意：YouTube 會把每集轉成頻道上的影片。
5. **KKBOX**（台灣）：KKBOX Podcast 提交頁貼 RSS。
6. （選用）[Podcast Index](https://podcastindex.org/add) 提交，涵蓋大部分開源播放器。

送出後各平台的節目網址可回填到網站或電子報。

## 日常：發一集

### A. PilotOne 中控台手動建立
1. 建立內容 → 主稿填標題與內文（＝Show notes），上方「連結」可填本集網頁。
2. 右側切到 **PC** 分頁 → 啟用 → 音檔填：
   - `https://…/episode.mp3`（可直接下載的 https 網址），或
   - Google Drive 分享連結（檔案要在 Drive `AllenI3Aurora/` 底下，或分享給服務帳戶；排程器用服務帳戶下載，不需要公開分享）。
3. 集數標題留空沿用主稿標題。送交審核或直接核准（立即／指定時間）。

### B. Drive 送審包（給 Claude 排程，例如 NotebookLM 產的日報音檔）
放在 `AllenI3Aurora/podcast/episodes/<YYYYMMDD>/pilotone/<子代碼>/`（子代碼 2–40 個英數、`-`、`_`，如 `ep001`、`daily-1124`），topic＝`pc-<子代碼>`。也可以把 `platforms.podcast` 加進既有主題的送審包（例如日報），同一筆貼文就同時有 FB／IG／Threads 與 Podcast。

```json
{
  "version": 1,
  "topic": "pc-ep001",
  "date": "2026-11-24",
  "title": "EP001｜AI 代理人與智慧交通號誌",
  "link": "https://allenchen1113official.github.io/AllenI3Aurora/",
  "autoPublish": false,
  "verified": true,
  "producedAt": "2026-11-24T08:30:00+08:00",
  "platforms": {
    "podcast": { "caption": "podcast.txt", "audio": "episode.mp3", "title": "EP001｜AI 代理人與智慧交通號誌", "duration": 912, "episodeType": "full", "explicit": false }
  }
}
```

- `podcast.txt`＝Show notes（純文字，網址自動轉連結；不要求含日期）。
- `audio` 支援 MP3／M4A／AAC／WAV（建議 MP3 128 kbps 或 M4A），單檔 ≤ 500 MB。
- `duration`（秒）可省略，排程器會自動解析；`episodeType` 為 `full`／`trailer`／`bonus`。
- Drive 橋接**不會**把音檔推進 git：content 分支只放 `episode.mp3.drive.json` 指標，發布時才由排程器從 Drive 下載。

## 狀態與排錯

| 狀態 | 說明 |
|---|---|
| `approved` | 已核准，等預定時間（前 5 分鐘內）上架 |
| `publishing` | 上傳中；若排程器中斷，鎖過期（15 分鐘）後**直接重送**——同一筆貼文沿用同一附件與 guid，不會出現重複集數 |
| `published` | 已上架，`pc.enclosureUrl`／`pc.episode` 可在中控台看到 |
| `failed` | 看錯誤訊息：音檔下載失敗、Drive 權限、檔案不是音檔、逾期 24 小時…；修正後在內容庫重新核准 |

- **下架某一集**：Firestore Console 把 `aurora_podcast_feed/<貼文 id>` 的 `hidden` 改成 `true`，下次常駐輪詢開始（或下一集上架）時 `podcast.xml` 會移除該集。各平台已下載的副本不一定立即消失。**不要刪 Release 附件**，已收聽的人會壞連結。
- **改節目資訊**：改 `scripts/podcast/show.json` 並推上 main（push 會觸發 social-publish 單輪 dry-run 驗證；正式重建在下一次常駐開始）。`feedUrl` 一旦送出平台就不要再改。
- **集數編號**：上架當下「未隱藏的非預告集數＋1」，之後固定不變。
- **podcast.xml 沒更新**：看 social-publish 的 log「podcast.xml …」；失敗會保留旗標下一輪再試。

## 權限與安全

- 音檔是公開附件（RSS 本來就公開），不要放未授權或含個資的錄音。
- `podcast:locked=yes`＋owner email：防止別人把這個 RSS 匯入其他託管平台冒用。
- 審核通知（Email／LINE）會把 Podcast 列為「Podcast」頻道。
