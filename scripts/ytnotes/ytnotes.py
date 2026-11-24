#!/usr/bin/env python3
"""
常看 YouTube 重點筆記 · Mac mini 原生引擎（下載 → 判斷語言 → 轉錄草稿）
=====================================================================
只用 Python 標準函式庫；外部工具：yt-dlp、ffmpeg、mlx_whisper（英文／判斷語言／第二意見）、
FunASR 虛擬環境（中文，見 funasr_run.py）。安裝見 install.sh。

用法（由 launchd 每 15 分鐘呼叫 `run`；也可手動）：
  python3 ytnotes.py add <網址> [<網址>…]   # 排入佇列（Claude 在對話中「丟連結」就是寫這個佇列）
  python3 ytnotes.py run                     # 處理佇列；台北 06:00 後當天第一次 run 會先掃常看頻道
  python3 ytnotes.py scan                    # 只掃頻道、把新片排入佇列
  python3 ytnotes.py draft <網址>            # 立即處理一支（略過佇列）
  python3 ytnotes.py status                  # 佇列與收件匣狀態
  python3 ytnotes.py progress                # 重新產生並印出 _engine/progress.json

產出（給 Claude 校正）：ROOT/_inbox/<影片ID>/
  meta.json        標題、作者、頻道、發布日期、長度、網址、語言、轉錄方式、是否短影音
  draft.md         主草稿，每段開頭 [分:秒]（中文 FunASR；英文人工字幕或 whisper）
  draft_whisper.md 第二意見（中文且 ≤15 分鐘才有）
  frames/*.jpg     短影音（≤60 秒）的畫面截圖 3～5 張
  status.json      {"state": "drafted"|"failed", ...}；Claude 處理完改 "done" 並移到 _inbox/_done/
影片與音訊只放 ~/.ytnotes/tmp，用完即刪；不進雲端硬碟。

常聽 Podcast 重點筆記（同一引擎、同一把檔案鎖；2026-11-24 起）：
  python3 ytnotes.py podscan                 # 讀啟用節目的官方 RSS，把「每節目每天最新 1 集」排入 Podcast 佇列
  python3 ytnotes.py poddraft <節目代碼>     # 立即處理該節目最新一集（略過啟用判斷，測試用）
  run 每次都會先處理 YouTube 佇列，再處理 Podcast 佇列；距上次 podscan 超過 podcast_scan_min 分鐘就重掃。
  節目清單＝網站 scripts/podcast/feeds.json（RSS、代碼、語言），啟用與否以後台「Podcast 重點筆記」
  （Firestore aurora_podnotes/shows，公開讀）為準，後台沒設定的節目看 feeds.json 的 notes 欄位。
  產出：PODROOT/_inbox/<節目代碼>-<YYYYMMDD>/（meta.json、draft.md、status.json，格式同 YouTube）；
  PODROOT 預設為 ROOT 的兄弟資料夾 notes/podcast。音檔只放 ~/.ytnotes/tmp，用完即刪。

進度檔：ROOT/_engine/progress.json（PilotOne 中控台「YouTube 轉錄」面板的資料來源）
  每次 run 開始／結束、每支影片換階段時，以及轉錄等長時間步驟每 60 秒（心跳）覆寫一次；
  social-publish.yml 每 2 分鐘以 scripts/ytnotes/sync-progress.mjs 讀入 Firestore aurora_ops/ytnotes_progress。
  內容只有標題、階段、時間與錯誤摘要，不含逐字稿。格式見 build_progress()。
"""
import json, os, re, shutil, subprocess, sys, time, fcntl, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

TPE = timezone(timedelta(hours=8))
HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("YTNOTES_ROOT") or HERE.parent)          # …/AllenI3Aurora/notes/youtube
ENGINE = ROOT / "_engine"
INBOX = ROOT / "_inbox"
DICT = ROOT / "詞庫"
HOME = Path(os.environ.get("YTNOTES_HOME") or Path.home() / ".ytnotes")
TMP = HOME / "tmp"
CFG = {
    "whisper_model": "mlx-community/whisper-large-v3-turbo",
    "funasr_python": str(HOME / "funasr-venv" / "bin" / "python"),
    "cookies_from_browser": "",      # 例如 "chrome"：YouTube 要求登入驗證時才設
    "scan_hour": 6,                  # 台北幾點後開始當天的頻道掃描
    "scan_latest": 5,                # 每個頻道看最新幾支
    "batch_max": 20,                 # 每次 run 最多處理幾支
    "skip_longer_than_min": 180,     # 超過幾分鐘的影片不自動處理（手動 draft 不受限）
    # 後台「YouTube 頻道 → 常看頻道」存的清單（Firestore aurora_ytnotes/channels，公開讀）；設 "" 只用 channels.tsv
    "channels_url": "https://firestore.googleapis.com/v1/projects/alleni3aurora/databases/(default)/documents/aurora_ytnotes/channels",
    # 常聽 Podcast 重點筆記：節目清單（網站上的 feeds.json）與後台啟用設定（aurora_podnotes/shows，公開讀）；feeds_url 設 "" 停用
    "podcast_feeds_url": "https://allenchen1113official.github.io/AllenI3Aurora/scripts/podcast/feeds.json",
    "podnotes_shows_url": "https://firestore.googleapis.com/v1/projects/alleni3aurora/databases/(default)/documents/aurora_podnotes/shows",
    "podcast_root": "",              # 留空＝ROOT 的兄弟資料夾 notes/podcast
    "podcast_scan_min": 30,          # 每隔幾分鐘重讀一次 RSS
    "podcast_max_age_h": 36,         # 只處理多少小時內發布的集數（避免新啟用節目灌入舊集）
    "podcast_max_mb": 600,           # 音檔大小上限
}

def now_tpe():
    return datetime.now(TPE)

def log(*a):
    line = f"[{now_tpe():%Y-%m-%d %H:%M:%S}] " + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        with open(ENGINE / "run.log", "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass

def load_cfg():
    p = ENGINE / "config.json"
    if p.exists():
        CFG.update(json.loads(p.read_text(encoding="utf-8")))
    return CFG

def which(name, extra=()):
    for d in [*extra, "/opt/homebrew/bin", "/usr/local/bin", str(Path.home() / ".local/bin")]:
        p = Path(d) / name
        if p.exists():
            return str(p)
    return shutil.which(name) or name

YTDLP = lambda: which("yt-dlp")
FFMPEG = lambda: which("ffmpeg")
WHISPER = lambda: which("mlx_whisper")

HEARTBEAT_SEC = 60

def sh(cmd, timeout=None, check=True):
    """執行外部指令；等待期間每 HEARTBEAT_SEC 秒刷新一次進度檔（轉錄長片時面板才知道引擎還活著）"""
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.time() + timeout if timeout else None
    while True:
        wait = HEARTBEAT_SEC if deadline is None else max(0.1, min(HEARTBEAT_SEC, deadline - time.time()))
        try:
            out, err = p.communicate(timeout=wait)
            break
        except subprocess.TimeoutExpired:
            if deadline is not None and time.time() >= deadline:
                p.kill(); p.communicate()
                raise subprocess.TimeoutExpired(cmd, timeout)
            heartbeat()
    r = subprocess.CompletedProcess(cmd, p.returncode, out, err)
    if check and r.returncode != 0:
        raise RuntimeError(f"{Path(cmd[0]).name} 失敗（{r.returncode}）：{(r.stderr or r.stdout)[-800:]}")
    return r

def ytdlp_base():
    b = [YTDLP(), "--no-warnings", "--no-playlist"]
    if CFG.get("cookies_from_browser"):
        b += ["--cookies-from-browser", CFG["cookies_from_browser"]]
    return b

def ts(sec):
    sec = int(sec)
    return f"[{sec // 60:02d}:{sec % 60:02d}]" if sec < 3600 else f"[{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}]"

def safe(s, n=60):
    s = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", str(s or "")).strip()
    return s[:n].strip() or "untitled"

# ───────────────────────── 進度檔 ─────────────────────────
PROGRESS = lambda: ENGINE / "progress.json"
STAGES = {          # 階段代碼 → 中文（面板直接顯示 label，代碼供程式判斷）
    "scan": "掃描常看頻道", "meta": "讀取影片資訊", "download": "下載音訊", "lang": "判斷語言",
    "transcribe": "轉錄中", "second": "第二意見轉錄", "write": "寫入草稿",
}
RUN = {"state": "idle", "startedAt": None, "endedAt": None, "processed": 0}
CUR = {}            # 目前處理中的影片 {id,url,title,author,durationSec,lang,stage,startedAt,stageAt}
_LAST_BEAT = [0.0]

def _iso(t=None):
    return (t or now_tpe()).isoformat(timespec="seconds")

def _read_json(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}

def _item(d, state_override=None):
    """收件匣資料夾 → 進度項目（只取顯示用欄位，不含逐字稿）"""
    st, meta = _read_json(d / "status.json"), _read_json(d / "meta.json")
    state = state_override or st.get("state") or "unknown"
    is_pod = bool(re.match(r"^[a-z0-9][a-z0-9-]{1,30}-\d{8}$", d.name))     # 常聽 Podcast 集數（<節目代碼>-<YYYYMMDD>）
    it = {"id": d.name, "url": meta.get("url") or meta.get("audio_url") or ("" if is_pod else f"https://www.youtube.com/watch?v={d.name}"),
          "title": meta.get("title") or "", "author": meta.get("author") or "", "state": state,
          "at": st.get("at") or meta.get("drafted_at") or "", "durationSec": int(meta.get("duration_sec") or 0),
          "draftSeconds": int(meta.get("draft_seconds") or 0), "lang": meta.get("language") or "",
          "transcriber": meta.get("transcriber") or ""}
    if st.get("error"):
        it["error"] = str(st["error"])[-300:]
    if st.get("package"):
        it["package"] = str(st["package"])
    return it

def build_progress(now=None, done_days=14, done_max=20, log_lines=12):
    """組出 progress.json 內容。
    {version, updatedAt, host, engine:{state,startedAt,endedAt,processed,batchMax,intervalSec},
     current:{…,stage,stageLabel}|null, queue:[{id,url}], items:[{id,url,title,author,state,at,…}],
     failures:[{at,url,id,error}], log:[…]}
    items：處理中 → 佇列 → 收件匣（drafted／failed）→ 近 done_days 天已送審（done，最多 done_max 筆）"""
    now = now or now_tpe()
    q = read_queue()
    cur = dict(CUR) if CUR else None
    if cur:
        cur["stageLabel"] = STAGES.get(cur.get("stage"), cur.get("stage") or "")
    items, seen = [], set()
    if cur and cur.get("id"):
        items.append({**{k: cur.get(k) for k in ("id", "url", "title", "author", "durationSec", "lang")},
                      "state": "processing", "stage": cur.get("stage"), "stageLabel": cur["stageLabel"],
                      "at": cur.get("stageAt") or cur.get("startedAt") or ""})
        seen.add(cur["id"])
    queue = []
    for u in q[:50]:
        k = video_key(u)
        queue.append({"id": k, "url": u})
        if k and k not in seen:
            prev = INBOX / k
            it = _item(prev, "queued") if prev.is_dir() else {"id": k, "url": u, "title": "", "author": "", "state": "queued", "at": ""}
            it.pop("error", None)
            items.append(it); seen.add(k)
    if INBOX.exists():
        live = [d for d in INBOX.iterdir() if d.is_dir() and d.name not in ("_done",) and not d.name.startswith(".")]
        for d in sorted(live, key=lambda x: x.name):
            if d.name not in seen and (d / "status.json").exists():
                items.append(_item(d)); seen.add(d.name)
        done_dir = INBOX / "_done"
        if done_dir.is_dir():
            cutoff = now - timedelta(days=done_days)
            done = []
            for d in done_dir.iterdir():
                if not d.is_dir() or d.name in seen:
                    continue
                it = _item(d, "done")
                try:
                    t = datetime.fromisoformat(it["at"]) if it["at"] else datetime.fromtimestamp(d.stat().st_mtime, TPE)
                except ValueError:
                    t = datetime.fromtimestamp(d.stat().st_mtime, TPE)
                if t.tzinfo is None:
                    t = t.replace(tzinfo=TPE)
                if t >= cutoff:
                    done.append((t, it))
            items += [it for _, it in sorted(done, key=lambda x: x[0], reverse=True)[:done_max]]
    pin = podinbox()
    if pin.exists():                                    # 常聽 Podcast：收件匣與近期已送審（與 YouTube 共用面板）
        for d in sorted(x for x in pin.iterdir() if x.is_dir() and not x.name.startswith((".", "_"))):
            if d.name not in seen and (d / "status.json").exists():
                items.append(_item(d)); seen.add(d.name)
        pdone = pin / "_done"
        if pdone.is_dir():
            cutoff = now - timedelta(days=done_days)
            for d in sorted(pdone.iterdir(), key=lambda x: x.name, reverse=True)[:done_max]:
                if d.is_dir() and d.name not in seen and datetime.fromtimestamp(d.stat().st_mtime, TPE) >= cutoff:
                    items.append(_item(d, "done")); seen.add(d.name)
    failures = []
    fp = ENGINE / "failed.txt"
    if fp.exists():
        cutoff = (now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M")
        for line in fp.read_text(encoding="utf-8", errors="ignore").splitlines()[-30:]:
            cols = line.split("\t")
            if len(cols) >= 2 and cols[0] >= cutoff:
                failures.append({"at": cols[0], "url": cols[1], "id": video_key(cols[1]), "error": (cols[2] if len(cols) > 2 else "")[:300]})
    logs = []
    lp = ENGINE / "run.log"
    if lp.exists():
        logs = [l[:300] for l in lp.read_text(encoding="utf-8", errors="ignore").splitlines()[-log_lines:]]
    return {
        "version": 1, "updatedAt": _iso(now), "host": os.uname().nodename if hasattr(os, "uname") else "",
        "engine": {**RUN, "batchMax": CFG.get("batch_max"), "intervalSec": 900},
        "current": cur, "queue": queue, "items": items[:80], "failures": failures[-10:], "log": logs,
    }

def _lock_busy():
    """另一個 run 正持有檔案鎖？（手動 add／progress 時不可蓋掉執行中那一個寫的「處理中」狀態）"""
    try:
        with open(HOME / "run.lock", "a") as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(f, fcntl.LOCK_UN)
        return False
    except BlockingIOError:
        return True
    except OSError:
        return False

def write_progress(force=False):
    """原子覆寫 progress.json；寫不進去（雲端硬碟暫時不可用）也不影響轉錄。
    force：持鎖的 run 自己收尾時用（此時 state 已是 idle，但鎖還在自己手上）"""
    if not force and RUN["state"] != "running" and _lock_busy():
        return
    try:
        ENGINE.mkdir(parents=True, exist_ok=True)
        tmp = ENGINE / ".progress.json.tmp"
        tmp.write_text(json.dumps(build_progress(), ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, PROGRESS())
        _LAST_BEAT[0] = time.time()
    except Exception as e:          # noqa: BLE001 — 進度檔絕不可讓轉錄失敗
        print("寫入進度檔失敗：", e, flush=True)

def heartbeat():
    """長時間步驟的心跳：處理中且距上次寫入超過 HEARTBEAT_SEC 才寫"""
    if RUN["state"] == "running" and time.time() - _LAST_BEAT[0] >= HEARTBEAT_SEC - 1:
        write_progress()

def set_stage(stage, **info):
    """更新目前影片的階段並立即寫進度檔"""
    t = _iso()
    if not CUR.get("startedAt"):
        CUR["startedAt"] = t
    CUR.update({k: v for k, v in info.items() if v is not None})
    CUR["stage"], CUR["stageAt"] = stage, t
    write_progress()

def clear_stage():
    CUR.clear()
    write_progress()

# ───────────────────────── 佇列 ─────────────────────────
QUEUE = lambda: ENGINE / "queue.txt"
SEEN = lambda: ENGINE / "seen.json"

def read_queue():
    p = QUEUE()
    if not p.exists():
        return []
    return [l.strip() for l in p.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]

def write_queue(items):
    QUEUE().write_text("".join(f"{u}\n" for u in items), encoding="utf-8")

def video_key(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})", url)
    if m:
        return m.group(1)
    m = re.search(r"instagram\.com/(?:reel|p|tv)/([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None

def cmd_add(urls):
    q = read_queue()
    added = 0
    for u in urls:
        if u not in q and video_key(u):
            q.append(u); added += 1
        elif not video_key(u):
            log("無法辨識的網址，略過：", u)
    write_queue(q)
    log(f"佇列新增 {added} 支，共 {len(q)} 支")
    write_progress()

# ───────────────────────── 頻道掃描 ─────────────────────────
def channel_key(url):
    """頻道網址正規化：去尾斜線與查詢字串；@handle／channel／c／user 頁補 /videos（yt-dlp 才會列影片而不是分頁）"""
    u = str(url or "").strip().split("?")[0].split("#")[0].rstrip("/")
    if not u:
        return ""
    if not re.match(r"https?://", u):
        u = re.sub(r"^(m\.|www\.)?youtube\.com/?", "", u)
        u = "https://www.youtube.com/" + u.lstrip("/")
    u = re.sub(r"^https?://(m\.|www\.)?youtube\.com", "https://www.youtube.com", u)
    if re.search(r"youtube\.com/(@[^/]+|channel/[^/]+|c/[^/]+|user/[^/]+)$", u):
        u += "/videos"
    return u

def parse_tsv_channels(text):
    out = []
    for line in (text or "").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        url = cols[0].strip()
        if url:
            out.append({"url": url, "name": cols[1].strip() if len(cols) > 1 else "",
                        "enabled": (cols[2].strip() if len(cols) > 2 else "1") not in ("0", "否", "no", "off")})
    return out

def _fs_value(v):
    """Firestore REST 的型別化值 → Python 值（只處理本清單用到的型別）"""
    if not isinstance(v, dict):
        return None
    if "stringValue" in v: return v["stringValue"]
    if "booleanValue" in v: return bool(v["booleanValue"])
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "timestampValue" in v: return v["timestampValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v: return [_fs_value(x) for x in (v["arrayValue"].get("values") or [])]
    if "mapValue" in v: return {k: _fs_value(x) for k, x in (v["mapValue"].get("fields") or {}).items()}
    return None

def parse_remote_channels(doc):
    """aurora_ytnotes/channels 文件（REST JSON）→ [{url,name,enabled}]"""
    items = _fs_value({"mapValue": {"fields": (doc or {}).get("fields") or {}}}).get("items") or []
    out = []
    for it in items:
        if isinstance(it, dict) and str(it.get("url") or "").strip():
            out.append({"url": str(it["url"]).strip(), "name": str(it.get("name") or "").strip(),
                        "enabled": it.get("enabled") is not False})
    return out

def merge_channels(remote, local):
    """後台清單為主（同一頻道以後台的名稱／啟用為準）；channels.tsv 只有在後台沒有的頻道才補上"""
    seen, out = set(), []
    for ch in (remote or []) + (local or []):
        k = channel_key(ch["url"])
        if not k or k in seen:
            continue
        seen.add(k)
        out.append({**ch, "url": k})
    return out

def fetch_remote_channels():
    """讀後台清單；成功時寫快取 channels.remote.tsv，失敗時改讀快取。回傳 (清單, 來源說明)"""
    url = CFG.get("channels_url") or ""
    cache = ENGINE / "channels.remote.tsv"
    if not url:
        return [], "未設定"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=20) as r:
            items = parse_remote_channels(json.loads(r.read().decode("utf-8")))
        cache.write_text("# 後台「常看頻道」快取（自動產生，請到後台修改，勿手動編輯）\n" +
                         "".join(f"{c['url']}\t{c['name']}\t{1 if c['enabled'] else 0}\n" for c in items), encoding="utf-8")
        return items, "後台"
    except urllib.error.HTTPError as e:
        if e.code == 404:                     # 後台還沒存過清單
            return [], "後台（尚無清單）"
        err = e
    except Exception as e:                    # 網路或格式錯誤 → 用上次的快取
        err = e
    log("讀取後台常看頻道失敗，改用快取：", err)
    return (parse_tsv_channels(cache.read_text(encoding="utf-8")) if cache.exists() else []), "後台快取"

def read_channels():
    p = ROOT / "channels.tsv"
    local = parse_tsv_channels(p.read_text(encoding="utf-8")) if p.exists() else []
    remote, src = fetch_remote_channels()
    merged = merge_channels(remote, local)
    log(f"常看頻道：{src} {len(remote)} 個＋channels.tsv {len(local)} 個 → 啟用 {sum(1 for c in merged if c['enabled'])} 個")
    return [c for c in merged if c["enabled"]]

def cmd_scan():
    if RUN["state"] == "running":
        set_stage("scan", title="掃描常看頻道")
    seen = json.loads(SEEN().read_text(encoding="utf-8")) if SEEN().exists() else {}
    q = read_queue()
    new = 0
    for ch in read_channels():
        url = ch["url"]                       # 已由 channel_key 正規化
        try:
            r = sh([YTDLP(), "--no-warnings", "--flat-playlist", "-J", "--playlist-end", str(CFG["scan_latest"]), url], timeout=120)
            entries = json.loads(r.stdout).get("entries") or []
        except Exception as e:
            log("頻道掃描失敗：", ch["name"] or url, e)
            continue
        first_time = url not in seen
        known = set(seen.get(url, []))
        for e in entries:
            vid = e.get("id")
            if not vid or vid in known:
                continue
            known.add(vid)
            if first_time:
                continue        # 新加入的頻道：只記錄現有影片，從下一支新片開始做（避免一次灌入舊片）
            if (e.get("duration") or 0) > CFG["skip_longer_than_min"] * 60:
                log(f"超過 {CFG['skip_longer_than_min']} 分鐘，略過自動處理：", e.get("title"), vid)
                continue
            u = f"https://www.youtube.com/watch?v={vid}"
            if u not in q:
                q.append(u); new += 1
        seen[url] = sorted(known)[-200:] if len(known) > 200 else sorted(known)
        log(f"頻道 {ch['name'] or url}：{'建立基準' if first_time else '新片'} {len(entries) if first_time else ''}".strip())
    write_queue(q)
    SEEN().write_text(json.dumps(seen, ensure_ascii=False, indent=1), encoding="utf-8")
    (ENGINE / "last_scan.txt").write_text(now_tpe().strftime("%Y%m%d"), encoding="utf-8")
    log(f"頻道掃描完成：排入 {new} 支新片")
    if CUR.get("stage") == "scan":
        clear_stage()

# ───────────────────────── 轉錄 ─────────────────────────
def whisper_json(audio, outdir, language=None, clip=None):
    outdir.mkdir(parents=True, exist_ok=True)
    src = audio
    if clip:
        src = outdir / "clip.wav"
        sh([FFMPEG(), "-y", "-loglevel", "error", "-ss", str(clip[0]), "-t", str(clip[1]), "-i", str(audio), "-ac", "1", "-ar", "16000", str(src)])
    cmd = [WHISPER(), str(src), "--model", CFG["whisper_model"], "--output-format", "json", "--output-dir", str(outdir), "--verbose", "False"]
    if language:
        cmd += ["--language", language]
    sh(cmd, timeout=7200)
    return json.loads((outdir / (Path(src).stem + ".json")).read_text(encoding="utf-8"))

def segs_to_md(segs, gap=20.0):
    """segments [{start, text, spk?}] → 每段開頭 [分:秒]；換說話者或累積約 gap 秒換段"""
    lines, cur, t0, spk = [], [], None, None
    for s in segs:
        txt = (s.get("text") or "").strip()
        if not txt:
            continue
        if t0 is None:
            t0, spk = s["start"], s.get("spk")
        if cur and (s.get("spk") != spk or s["start"] - t0 >= gap):
            lines.append(f"{ts(t0)}{f' 〔說話者{spk}〕' if spk is not None else ''} {''.join(cur) if is_cjk(''.join(cur)) else ' '.join(cur)}")
            cur, t0, spk = [], s["start"], s.get("spk")
        cur.append(txt)
    if cur:
        lines.append(f"{ts(t0)}{f' 〔說話者{spk}〕' if spk is not None else ''} {''.join(cur) if is_cjk(''.join(cur)) else ' '.join(cur)}")
    return "\n\n".join(lines) + "\n"

def is_cjk(s):
    return len(re.findall(r"[一-鿿]", s)) > len(s) * 0.3

def parse_vtt(path):
    segs, last = [], ""
    block_t = None
    for line in Path(path).read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"(\d+):(\d+):(\d+)[.,](\d+)\s+-->", line) or re.match(r"(\d+):(\d+)[.,](\d+)\s+-->", line)
        if m:
            g = [int(x) for x in m.groups()]
            block_t = g[0] * 3600 + g[1] * 60 + g[2] if len(g) == 4 else g[0] * 60 + g[1]
            continue
        txt = re.sub(r"<[^>]+>", "", line).strip()
        if block_t is None or not txt or txt == last or txt.isdigit() or txt.startswith(("WEBVTT", "Kind:", "Language:")):
            continue
        segs.append({"start": block_t, "text": txt}); last = txt
    return segs

def manual_subs(info, prefixes):
    subs = info.get("subtitles") or {}            # 只看人工字幕；automatic_captions 不算
    for lang in subs:
        if any(lang == p or lang.startswith(p + "-") for p in prefixes) and "live_chat" not in lang:
            return lang
    return None

def transcribe(wav, work, out, meta, dur, info=None, url=None, lang_hint=None):
    """音訊 → out/draft.md（＋中文 ≤15 分鐘的 draft_whisper.md）；寫入 meta 的 language、transcriber。
    YouTube 與 Podcast 共用。info／url 只有 YouTube 才有（英文先找人工字幕）；lang_hint 為節目設定的語言。"""
    set_stage("lang")
    lang = lang_hint if lang_hint in ("zh", "en") else ""
    if not lang:
        # 判斷語言：中段 30 秒
        start = max(0, dur / 2 - 15) if dur > 40 else 0
        lid = whisper_json(wav, work / "lid", clip=(start, min(30, dur or 30)))
        lang = lid.get("language") or ""
        if len(re.sub(r"\s", "", lid.get("text") or "")) < 8 or lang not in ("zh", "en"):   # 聽到的話太少 → 看標題語言
            lang = "zh" if re.search(r"[一-鿿]", meta.get("title") or "") else "en"
    meta["language"] = lang
    set_stage("transcribe", lang=lang)
    if lang == "zh":
        hot = DICT / "熱詞.txt"; rep = DICT / "替換規則.tsv"
        sh([CFG["funasr_python"], str(HERE / "funasr_run.py"), str(wav), str(work / "funasr.json"),
            "--hotwords", str(hot), "--replace", str(rep)], timeout=7200)
        segs = json.loads((work / "funasr.json").read_text(encoding="utf-8"))
        (out / "draft.md").write_text(segs_to_md(segs), encoding="utf-8")
        meta["transcriber"] = "FunASR paraformer-zh＋fsmn-vad＋ct-punc＋cam++，OpenCC s2twp"
        if dur <= 15 * 60:
            set_stage("second")
            w = whisper_json(wav, work / "w2", language="zh")
            (out / "draft_whisper.md").write_text(segs_to_md(w.get("segments") or []), encoding="utf-8")
            meta["transcriber"] += "；whisper-large-v3-turbo 第二意見"
    else:
        lang_sub = manual_subs(info, ["en"]) if info else None
        if lang_sub:
            sh(ytdlp_base() + ["--skip-download", "--write-subs", "--sub-langs", lang_sub, "--sub-format", "vtt",
                               "-o", str(work / "subs.%(ext)s"), url], timeout=300)
            vtt = next(work.glob("subs*.vtt"))
            (out / "draft.md").write_text(segs_to_md(parse_vtt(vtt)), encoding="utf-8")
            meta["transcriber"] = f"YouTube 人工字幕（{lang_sub}）"
        else:
            w = whisper_json(wav, work / "w", language="en")
            (out / "draft.md").write_text(segs_to_md(w.get("segments") or []), encoding="utf-8")
            meta["transcriber"] = "mlx-whisper large-v3-turbo"
    return lang

def draft(url, force=False):
    load_cfg()
    key = video_key(url)
    if not key:
        raise RuntimeError(f"無法辨識的網址：{url}")
    out = INBOX / key
    st = out / "status.json"
    if st.exists() and not force and json.loads(st.read_text(encoding="utf-8")).get("state") in ("drafted", "done"):
        log("已有草稿，略過：", key); return out
    if (INBOX / "_done" / key).exists() and not force:
        log("已完成過，略過：", key); return out
    work = TMP / key
    shutil.rmtree(work, ignore_errors=True); work.mkdir(parents=True)
    out.mkdir(parents=True, exist_ok=True)
    t_start = time.time()
    CUR.clear()
    set_stage("meta", id=key, url=url)
    try:
        info = json.loads(sh(ytdlp_base() + ["-J", url], timeout=180).stdout)
        dur = float(info.get("duration") or 0)
        short = 0 < dur <= 60
        up = info.get("upload_date") or ""
        meta = {
            "id": key, "url": info.get("webpage_url") or url, "title": info.get("title"),
            "author": info.get("uploader") or info.get("channel"), "channel": info.get("channel"),
            "channel_url": info.get("channel_url") or info.get("uploader_url"),
            "published": f"{up[:4]}-{up[4:6]}-{up[6:8]}" if len(up) == 8 else "",
            "duration_sec": int(dur), "is_short": short, "platform": "instagram" if "instagram.com" in url else "youtube",
            "thumbnail": info.get("thumbnail"), "description": (info.get("description") or "")[:2000],
            "drafted_at": now_tpe().isoformat(timespec="seconds"),
        }
        set_stage("download", title=meta["title"] or "", author=meta["author"] or "", durationSec=int(dur))
        # 1. 下載（一律最低畫質；長片只抓音訊）
        if short:
            sh(ytdlp_base() + ["-f", "bv*+ba/b", "-S", "res:480", "-o", str(work / "media.%(ext)s"), url], timeout=900)
        else:
            sh(ytdlp_base() + ["-f", "ba/b", "-o", str(work / "media.%(ext)s"), url], timeout=1800)
        media = next(p for p in work.iterdir() if p.name.startswith("media."))
        wav = work / "audio.wav"
        sh([FFMPEG(), "-y", "-loglevel", "error", "-i", str(media), "-vn", "-ac", "1", "-ar", "16000", str(wav)], timeout=900)
        if short:
            fr = out / "frames"; fr.mkdir(exist_ok=True)
            n = 4
            for i in range(n):
                t = max(0.5, dur * (i + 0.5) / n)
                sh([FFMPEG(), "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(media), "-frames:v", "1", "-vf", "scale=480:-2", str(fr / f"frame_{i + 1}.jpg")], check=False)
        transcribe(wav, work, out, meta, dur, info=info, url=url)
        set_stage("write")
        meta["draft_seconds"] = int(time.time() - t_start)
        (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        st.write_text(json.dumps({"state": "drafted", "at": now_tpe().isoformat(timespec="seconds")}, ensure_ascii=False), encoding="utf-8")
        log(f"草稿完成：{key}｜{meta['author']}｜{meta['title']}｜{lang}｜{int(dur)}s｜耗時 {meta['draft_seconds']}s")
    except Exception as e:
        st.write_text(json.dumps({"state": "failed", "error": str(e)[-1500:], "at": now_tpe().isoformat(timespec="seconds")}, ensure_ascii=False), encoding="utf-8")
        log("失敗：", key, e)
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)      # 暫存一律刪除
        CUR.clear()
        write_progress()
    return out

# ───────────────────────── 常聽 Podcast 重點筆記 ─────────────────────────
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

PODQ = lambda: ENGINE / "pod_queue.json"          # [{id, code, show, title, url, audio_url, published, pub_iso, duration_sec, lang, description}]
PODSEEN = lambda: ENGINE / "pod_seen.json"        # {集數ID: {"state": "queued"|"failed", "attempts": n, "at": …}}
POD_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,30}-\d{8}$")
ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"
UA = "Mozilla/5.0 (Macintosh) AllenI3Aurora-podnotes/1.0"

def podroot():
    """notes/podcast（Drive）；測試時隨 ROOT 一起換到暫存目錄"""
    return Path(os.environ.get("PODNOTES_ROOT") or CFG.get("podcast_root") or (ROOT.parent / "podcast"))

def podinbox():
    return podroot() / "_inbox"

def _get(url, timeout=30, accept="*/*"):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept}), timeout=timeout) as r:
        return r.read()

def parse_duration(v):
    """itunes:duration：秒數或 hh:mm:ss → 秒"""
    s = str(v or "").strip()
    if not s:
        return 0
    try:
        if s.isdigit():
            return int(s)
        n = 0
        for part in s.split(":"):
            n = n * 60 + int(float(part))
        return n
    except ValueError:
        return 0

def parse_rss(xml_bytes):
    """RSS → [{title, link, audio_url, pub (aware datetime), duration_sec, description, guid}]，新到舊"""
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.iter("item"):
        g = lambda tag: (it.findtext(tag) or "").strip()
        enc = it.find("enclosure")
        audio = (enc.get("url") if enc is not None else "") or ""
        try:
            pub = parsedate_to_datetime(g("pubDate"))
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if not audio.startswith("http"):
            continue
        desc = g("description") or g(ITUNES + "summary")
        out.append({"title": g("title"), "link": g("link"), "audio_url": audio, "pub": pub, "guid": g("guid"),
                    "duration_sec": parse_duration(it.findtext(ITUNES + "duration")),
                    "description": re.sub(r"<[^>]+>", " ", desc)[:2000]})
    return sorted(out, key=lambda x: x["pub"], reverse=True)

def parse_remote_shows(doc):
    """aurora_podnotes/shows 文件（REST JSON）→ {代碼: {"enabled": bool}}"""
    items = _fs_value({"mapValue": {"fields": (doc or {}).get("fields") or {}}}).get("items") or []
    return {str(it.get("code")).strip(): {"enabled": it.get("enabled") is True}
            for it in items if isinstance(it, dict) and str(it.get("code") or "").strip()}

def merge_shows(feeds, remote):
    """feeds.json 的節目 × 後台啟用設定 → 啟用中的節目（後台有設定以後台為準，否則看 feeds.json 的 notes）"""
    out = []
    for f in feeds:
        code = str(f.get("code") or "").strip()
        if not code or not f.get("feed"):
            continue
        on = remote[code]["enabled"] if code in remote else bool(f.get("notes"))
        if on:
            out.append(f)
    return out

def read_podcast_shows():
    """讀網站 feeds.json 與後台啟用設定；成功時寫快取，網路失敗時改用快取（不因斷線漏掃）"""
    cache = ENGINE / "podcast_shows.cache.json"
    try:
        feeds = json.loads(_get(CFG["podcast_feeds_url"], accept="application/json").decode("utf-8")).get("shows") or []
        remote, src = {}, "feeds.json"
        url = CFG.get("podnotes_shows_url") or ""
        if url:
            try:
                remote = parse_remote_shows(json.loads(_get(url, accept="application/json").decode("utf-8")))
                src = "後台＋feeds.json"
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                src = "feeds.json（後台尚無設定）"
        shows = merge_shows(feeds, remote)
        cache.write_text(json.dumps(shows, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception as e:                    # noqa: BLE001
        log("讀取 Podcast 節目設定失敗，改用快取：", e)
        shows, src = (json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else []), "快取"
    log(f"常聽 Podcast：{src} → 啟用 {len(shows)} 個節目（{'、'.join(s.get('show','') for s in shows)}）")
    return shows

def tpe_ymd(dt):
    return dt.astimezone(TPE).strftime("%Y%m%d")

def pick_episodes(show, items, now, done, max_age_h=36):
    """每節目每天最新 1 集：max_age_h 內發布、依台北日期分組取最新、集數ID 未做過。回傳 [集數 dict]（舊到新）"""
    code = show["code"]
    picked, dates = [], set()
    for it in items:                                   # 已新到舊
        if now - it["pub"] > timedelta(hours=max_age_h):
            break
        ymd = tpe_ymd(it["pub"])
        if ymd in dates:
            continue                                   # 同一天只取最新那一集
        dates.add(ymd)
        eid = f"{code}-{ymd}"
        if eid in done or not POD_ID.match(eid):
            continue
        picked.append({"id": eid, "code": code, "show": show.get("show") or code, "title": it["title"],
                       "url": it["link"] if it["link"].startswith("http") else (show.get("page") or ""),
                       "audio_url": it["audio_url"], "published": it["pub"].astimezone(TPE).strftime("%Y-%m-%d"),
                       "pub_iso": it["pub"].astimezone(TPE).isoformat(timespec="seconds"), "duration_sec": it["duration_sec"],
                       "lang": show.get("lang") or "", "description": it["description"], "guid": it["guid"]})
    return list(reversed(picked))

def read_podq():
    try:
        return json.loads(PODQ().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []

def write_podq(q):
    PODQ().write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")

def pod_done_ids():
    """已排入、已有草稿、已送審或已放棄（失敗 ≥2 次）的集數ID"""
    done = {e["id"] for e in read_podq()}
    for d in (podinbox(), podinbox() / "_done"):
        if d.is_dir():
            done |= {x.name for x in d.iterdir() if x.is_dir() and not x.name.startswith((".", "_"))}
    seen = _read_json(PODSEEN())
    done |= {k for k, v in seen.items() if isinstance(v, dict) and (v.get("state") != "failed" or int(v.get("attempts") or 0) >= 2)}
    return done

def cmd_podscan(force=False):
    if not CFG.get("podcast_feeds_url"):
        return 0
    stamp = ENGINE / "last_podscan.txt"
    if not force and stamp.exists():
        try:
            if time.time() - float(stamp.read_text().strip()) < int(CFG["podcast_scan_min"]) * 60:
                return 0
        except ValueError:
            pass
    stamp.write_text(str(time.time()), encoding="utf-8")
    if RUN["state"] == "running":
        set_stage("scan", title="掃描常聽 Podcast")
    q, done, new, now = read_podq(), pod_done_ids(), 0, now_tpe()
    for show in read_podcast_shows():
        try:
            items = parse_rss(_get(show["feed"], timeout=40, accept="application/rss+xml, application/xml, */*"))
        except Exception as e:                # noqa: BLE001
            log("Podcast RSS 讀取失敗：", show.get("show"), e)
            continue
        for ep in pick_episodes(show, items, now, done, int(CFG["podcast_max_age_h"])):
            if ep["duration_sec"] > CFG["skip_longer_than_min"] * 60:
                log(f"超過 {CFG['skip_longer_than_min']} 分鐘，略過自動處理：", ep["show"], ep["title"]); continue
            q.append(ep); done.add(ep["id"]); new += 1
            log("Podcast 排入：", ep["id"], ep["show"], ep["title"])
    write_podq(q)
    log(f"Podcast 掃描完成：排入 {new} 集，佇列 {len(q)} 集")
    if CUR.get("stage") == "scan":
        clear_stage()
    return new

def download_audio(url, dest, max_mb=600):
    """串流下載音檔（不經 yt-dlp）；超過上限即中止"""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    n, cap = 0, int(max_mb) * 1024 * 1024
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            n += len(chunk)
            if n > cap:
                raise RuntimeError(f"音檔超過 {max_mb} MB 上限")
            f.write(chunk)
            heartbeat()
    if n < 10 * 1024:
        raise RuntimeError(f"音檔太小（{n} bytes），可能不是音訊")
    return n

def draft_podcast(ep, force=False):
    """一集 Podcast → podinbox()/<集數ID>/（meta.json、draft.md、status.json）"""
    load_cfg()
    eid = ep["id"]
    if not POD_ID.match(eid):
        raise RuntimeError(f"集數ID 格式不符：{eid}")
    out = podinbox() / eid
    st = out / "status.json"
    if not force and ((st.exists() and _read_json(st).get("state") in ("drafted", "done")) or (podinbox() / "_done" / eid).exists()):
        log("已有草稿，略過：", eid); return out
    work = TMP / ("pod-" + eid)
    shutil.rmtree(work, ignore_errors=True); work.mkdir(parents=True)
    out.mkdir(parents=True, exist_ok=True)
    t_start = time.time()
    CUR.clear()
    set_stage("download", id=eid, url=ep.get("url") or ep["audio_url"], title=ep.get("title") or "", author=ep.get("show") or "",
              durationSec=int(ep.get("duration_sec") or 0))
    try:
        ext = re.search(r"\.(mp3|m4a|aac|mp4|wav|ogg)(?:\?|$)", ep["audio_url"], re.I)
        media = work / ("media." + (ext.group(1).lower() if ext else "mp3"))
        download_audio(ep["audio_url"], media, CFG.get("podcast_max_mb", 600))
        wav = work / "audio.wav"
        sh([FFMPEG(), "-y", "-loglevel", "error", "-i", str(media), "-vn", "-ac", "1", "-ar", "16000", str(wav)], timeout=1800)
        media.unlink(missing_ok=True)
        dur = max(0.0, (wav.stat().st_size - 44) / 32000.0)          # 16 kHz、16-bit、單聲道
        meta = {"id": eid, "kind": "podcast", "code": ep["code"], "show": ep["show"], "author": ep["show"],
                "title": ep["title"], "url": ep.get("url") or "", "audio_url": ep["audio_url"], "guid": ep.get("guid") or "",
                "published": ep["published"], "pub_iso": ep.get("pub_iso") or "", "duration_sec": int(dur or ep.get("duration_sec") or 0),
                "description": ep.get("description") or "", "drafted_at": now_tpe().isoformat(timespec="seconds")}
        transcribe(wav, work, out, meta, dur, lang_hint=ep.get("lang"))
        set_stage("write")
        meta["draft_seconds"] = int(time.time() - t_start)
        (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        st.write_text(json.dumps({"state": "drafted", "at": now_tpe().isoformat(timespec="seconds")}, ensure_ascii=False), encoding="utf-8")
        log(f"Podcast 草稿完成：{eid}｜{meta['show']}｜{meta['title']}｜{meta['language']}｜{int(dur)}s｜耗時 {meta['draft_seconds']}s")
    except Exception as e:
        st.write_text(json.dumps({"state": "failed", "error": str(e)[-1500:], "at": now_tpe().isoformat(timespec="seconds")}, ensure_ascii=False), encoding="utf-8")
        log("Podcast 失敗：", eid, e)
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)      # 音檔與暫存一律刪除
        CUR.clear()
        write_progress()
    return out

def _run_podcast_batch(budget):
    """處理 Podcast 佇列（最多 budget 集）；失敗記 failed.txt 與 pod_seen（最多自動重試 1 次）"""
    try:
        cmd_podscan()
    except Exception as e:                    # noqa: BLE001 — 掃描失敗不影響 YouTube
        log("Podcast 掃描失敗：", e)
    q, done = read_podq(), 0
    while q and done < budget:
        ep = q[0]
        seen = _read_json(PODSEEN())
        try:
            draft_podcast(ep)
            seen[ep["id"]] = {"state": "drafted", "at": _iso()}
        except Exception as e:                # noqa: BLE001
            prev = seen.get(ep["id"]) or {}
            seen[ep["id"]] = {"state": "failed", "attempts": int(prev.get("attempts") or 0) + 1, "at": _iso(), "error": str(e)[:300]}
            with open(ENGINE / "failed.txt", "a", encoding="utf-8") as f:
                f.write(f"{now_tpe():%Y-%m-%d %H:%M}\tpodcast:{ep['id']} {ep.get('audio_url','')}\t{str(e)[:300]}\n")
            if seen[ep["id"]]["attempts"] < 2:            # 失敗的收件匣資料夾移除，下次掃描可再排一次
                shutil.rmtree(podinbox() / ep["id"], ignore_errors=True)
        PODSEEN().write_text(json.dumps(dict(list(seen.items())[-400:]), ensure_ascii=False, indent=1), encoding="utf-8")
        q = [x for x in read_podq() if x.get("id") != ep["id"]]
        write_podq(q)
        done += 1
        RUN["processed"] = RUN.get("processed", 0) + 1
        write_progress()
    if done:
        log(f"Podcast 本輪處理 {done} 集，佇列剩 {len(q)} 集")
    return done

def cmd_poddraft(code):
    """手動：立即處理某節目最新一集（不看啟用設定與時間窗，測試用）"""
    feeds = json.loads(_get(CFG["podcast_feeds_url"], accept="application/json").decode("utf-8")).get("shows") or []
    show = next((f for f in feeds if f.get("code") == code), None)
    if not show:
        raise SystemExit(f"feeds.json 沒有節目代碼 {code}")
    items = parse_rss(_get(show["feed"], timeout=40))
    eps = pick_episodes(show, items[:1], items[0]["pub"] if items else now_tpe(), set(), 10 ** 6)
    for ep in eps:
        draft_podcast(ep, force=True)

# ───────────────────────── run／status ─────────────────────────
def cmd_run():
    load_cfg()
    ENGINE.mkdir(parents=True, exist_ok=True)
    lock = open(HOME / "run.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)   # 一次只跑一個（FunASR 約吃 3 GB 記憶體）
    except BlockingIOError:
        print("另一個 run 正在執行，略過"); return      # 進度檔由執行中的那一個負責更新
    RUN.update(state="running", startedAt=_iso(), endedAt=None, processed=0)
    write_progress()
    try:
        _run_batch()
    finally:
        RUN.update(state="idle", endedAt=_iso())
        CUR.clear()
        write_progress(force=True)

def _run_batch():
    last = (ENGINE / "last_scan.txt").read_text().strip() if (ENGINE / "last_scan.txt").exists() else ""
    if now_tpe().hour >= int(CFG["scan_hour"]) and last != now_tpe().strftime("%Y%m%d"):
        cmd_scan()
    q = read_queue()
    done = 0
    while q and done < CFG["batch_max"]:
        url = q[0]
        try:
            draft(url)
        except Exception as e:
            fails = ENGINE / "failed.txt"
            with open(fails, "a", encoding="utf-8") as f:
                f.write(f"{now_tpe():%Y-%m-%d %H:%M}\t{url}\t{str(e)[:300]}\n")   # 403 等失敗：記錄後跳過
        q = read_queue()
        if q and q[0] == url:
            q = q[1:]
        write_queue(q)
        done += 1
        RUN["processed"] = done
        write_progress()          # 佇列已移除這支 → 面板不會短暫把剛完成的影片顯示成「排隊中」
    if done:
        log(f"本輪處理 {done} 支，佇列剩 {len(q)} 支")
    _run_podcast_batch(max(1, CFG["batch_max"] - done))

def cmd_status():
    q = read_queue()
    print(f"佇列 {len(q)} 支"); [print("  ", u) for u in q[:20]]
    if INBOX.exists():
        for d in sorted(INBOX.iterdir()):
            if d.is_dir() and d.name != "_done" and (d / "status.json").exists():
                print(d.name, json.loads((d / "status.json").read_text(encoding="utf-8")).get("state"))

def main():
    for p in (ENGINE, INBOX, TMP, DICT):
        p.mkdir(parents=True, exist_ok=True)
    try:
        podinbox().mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    a = sys.argv[1:]
    if not a:
        print(__doc__); return
    load_cfg()
    if a[0] == "add": cmd_add(a[1:])
    elif a[0] == "run": cmd_run()
    elif a[0] == "scan": cmd_scan()
    elif a[0] == "draft": [draft(u, force="--force" in a) for u in a[1:] if not u.startswith("--")]
    elif a[0] == "status": cmd_status()
    elif a[0] == "podscan": cmd_podscan(force=True); print(json.dumps(read_podq(), ensure_ascii=False, indent=1))
    elif a[0] == "poddraft": [cmd_poddraft(c) for c in a[1:]]
    elif a[0] == "progress":
        write_progress(); print(PROGRESS().read_text(encoding="utf-8") if PROGRESS().exists() else "{}")
    else: print(__doc__)

if __name__ == "__main__":
    main()
