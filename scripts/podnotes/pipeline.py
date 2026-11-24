#!/usr/bin/env python3
"""
常聽 Podcast 重點筆記 · 雲端管線（GitHub Actions podnotes.yml；2026-11-24 起取代 Mac mini 路線）
=====================================================================
音檔 → 逐字稿 → 摘要，全程在 GitHub Actions：
  1. 讀 scripts/podcast/feeds.json＋後台啟用設定（Firestore aurora_podnotes/shows），每個啟用節目
     取 36 小時內、同一台北日期最新的一集（集數ID＝<代碼>-<YYYYMMDD>；選集邏輯沿用 ytnotes.py）
  2. 下載 RSS 音檔 → ffmpeg 16 kHz 單聲道 → 中文 FunASR（scripts/ytnotes/funasr_run.py：paraformer-zh＋VAD＋標點＋
     說話者＋OpenCC 台灣繁體）／英文 faster-whisper → 逐字稿（每段 [分:秒]〔說話者N〕）
  3. 逐字稿寫 Firestore aurora_podcast_transcripts/<集數ID>（規則：管理者唯讀、前端不可寫；stage＝transcribed）
     ——公開 repo，逐字稿絕不寫進 repo、不印在 Actions 日誌
  4. 有 ANTHROPIC_API_KEY：把逐字稿交給 Claude（scripts/podnotes/prompt.md）→ 校正清單、headline、重點摘要、
     康乃爾筆記、FB／IG／Threads 三版文案 → make_package.py 驗證（失敗帶錯誤重寫，最多 3 次）、產莫蘭迪藍圖卡
     → 送審包寫到 content 分支工作目錄 content/pn-<集數ID>/<YYYYMMDD>/（social-publish 匯入 PilotOne 草稿）
     → 圖卡 assets/podnotes/、索引 data/podnotes.json（前台；不含逐字稿）→ Firestore 套用校正、stage＝noted
     沒有金鑰：只轉錄並保存逐字稿，加上金鑰後下一輪自動補做筆記
用法（workflow 內）：
  python3 scripts/podnotes/pipeline.py --content-dir _content [--episode <代碼>] [--force] [--dry-run]
環境變數：FIREBASE_SERVICE_ACCOUNT（必要）、ANTHROPIC_API_KEY（選用）、PODNOTES_MODEL（預設 claude-sonnet-5-5）
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "ytnotes"))
sys.path.insert(0, str(HERE))
import ytnotes as Y            # noqa: E402  parse_rss、pick_episodes、merge_shows、segs_to_md
import make_package as MP      # noqa: E402  build_copy、validate

TPE = timezone(timedelta(hours=8))
COLL = "aurora_podcast_transcripts"
SHOWS_DOC = ("aurora_podnotes", "shows")
FEEDS = REPO / "scripts" / "podcast" / "feeds.json"
DATA = REPO / "data" / "podnotes.json"
CARDS = REPO / "assets" / "podnotes"
MAX_ITEMS = 60
MAX_TRANSCRIPT = 250000          # Firestore 單一文件 1 MiB 以內
LLM_CHARS = 90000                # 交給模型的逐字稿上限（約 1.5 小時中文）
MAX_ATTEMPTS = 2
UA = "Mozilla/5.0 AllenI3Aurora-podnotes/2.0 (+https://allenchen1113official.github.io/AllenI3Aurora/)"


def log(*a):
    print(datetime.now(TPE).strftime("%H:%M:%S"), *a, flush=True)


def now_tpe():
    return datetime.now(TPE)


# ───────────────────────── 選集 ─────────────────────────
def enabled_shows(remote_doc):
    feeds = json.loads(FEEDS.read_text(encoding="utf-8")).get("shows") or []
    remote = {}
    for it in (remote_doc or {}).get("items") or []:
        if isinstance(it, dict) and str(it.get("code") or "").strip():
            remote[str(it["code"]).strip()] = {"enabled": it.get("enabled") is True}
    return Y.merge_shows(feeds, remote)


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, */*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def plan(shows, states, now, only=None, force=False, max_age_h=36):
    """→ [(ep, 動作)]：動作 transcribe＝要轉錄、note＝已轉錄待寫筆記。states：{集數ID: Firestore 文件}"""
    out = []
    for show in shows:
        if only and show["code"] != only:
            continue
        try:
            items = Y.parse_rss(fetch(show["feed"]))
        except Exception as e:                      # noqa: BLE001
            log(f"✗ RSS 讀取失敗 {show.get('show')}：{e}")
            continue
        if only:                                    # 手動指定節目：不看時間窗，取最新一集
            eps = Y.pick_episodes(show, items[:1], items[0]["pub"] if items else now, set(), 10 ** 6)
        else:
            eps = Y.pick_episodes(show, items, now, set(), max_age_h)[-1:]   # 每節目每次只取最新一天
        for ep in eps:
            ep["asr"] = show.get("asr") or ""          # feeds.json 可逐節目指定轉錄器（whisper：中英夾雜的節目）
            st = states.get(ep["id"]) or {}
            stage = st.get("stage")
            if force:
                out.append((ep, "transcribe"))
            elif stage == "noted":
                continue
            elif stage == "failed" and int(st.get("attempts") or 0) >= MAX_ATTEMPTS:
                log(f"略過（已失敗 {st.get('attempts')} 次）：{ep['id']}")
            elif stage == "transcribed" and st.get("transcript"):
                out.append((ep, "note"))
            else:
                out.append((ep, "transcribe"))
    return out


# ───────────────────────── 轉錄 ─────────────────────────
def sh(cmd, timeout=None):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        why = "被系統終止（多半是記憶體不足）" if r.returncode in (-9, 137) else f"結束碼 {r.returncode}"
        tail = re.sub(r"\s+", " ", (r.stderr or r.stdout or ""))[-600:]
        raise RuntimeError(f"{Path(cmd[1] if Path(cmd[0]).name.startswith('python') and len(cmd) > 1 else cmd[0]).name} 失敗（{why}）：{tail}")
    return r.stdout


CHUNK_SEC = 600          # 超過 SINGLE_MAX 秒的音檔切成 10 分鐘一段、逐段獨立程序轉錄（避免記憶體不足）
SINGLE_MAX = 1200


def offset_segs(segs, offset):
    return [dict(s, start=round(float(s.get("start") or 0) + offset, 2), end=round(float(s.get("end") or 0) + offset, 2), spk=None)
            for s in segs]


def funasr(wav, work, dur):
    """中文 FunASR：≤20 分鐘整段（含說話者辨識）；更長切 10 分鐘一段（不做說話者辨識）"""
    base = [sys.executable, str(REPO / "scripts" / "ytnotes" / "funasr_run.py")]
    extra = []
    for flag, p in (("--hotwords", HERE / "dict" / "熱詞.txt"), ("--replace", HERE / "dict" / "替換規則.tsv")):
        if p.exists():
            extra += [flag, str(p)]
    if dur <= SINGLE_MAX:
        out = work / "funasr.json"
        sh(base + [str(wav), str(out)] + extra, timeout=5400)
        return json.loads(out.read_text(encoding="utf-8")), "cam++"
    parts = work / "parts"; parts.mkdir()
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-f", "segment", "-segment_time", str(CHUNK_SEC), "-c", "copy",
        str(parts / "p%03d.wav")], timeout=600)
    segs = []
    files = sorted(parts.glob("p*.wav"))
    for i, f in enumerate(files):
        out = work / f"funasr_{i:03d}.json"
        sh(base + [str(f), str(out), "--no-spk"] + extra, timeout=3600)
        segs += offset_segs(json.loads(out.read_text(encoding="utf-8")), i * CHUNK_SEC)
        f.unlink()
    log(f"  分 {len(files)} 段轉錄完成")
    return segs, ""


def download(url, dest, max_mb=600):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    n = 0
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            n += len(b)
            if n > max_mb * 1024 * 1024:
                raise RuntimeError(f"音檔超過 {max_mb} MB")
            f.write(b)
    if n < 10240:
        raise RuntimeError(f"音檔太小（{n} bytes）")
    return n


def load_replace():
    p = HERE / "dict" / "替換規則.tsv"
    out = []
    if p.exists():
        for l in p.read_text(encoding="utf-8").splitlines():
            if l.strip() and not l.startswith("#") and "\t" in l:
                a, b = l.split("\t", 1)
                if a.strip():
                    out.append((a.strip(), b.strip()))
    return out


def whisper(wav, lang):
    """faster-whisper（英文，或 feeds.json asr=whisper 的中英夾雜節目）；中文轉台灣繁體並套替換規則"""
    from faster_whisper import WhisperModel
    name = os.environ.get("PODNOTES_WHISPER", "large-v3-turbo")
    model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    hot = HERE / "dict" / "熱詞.txt"
    prompt = None
    if lang == "zh" and hot.exists():          # 用熱詞當起始提示，提高專有名詞與繁體輸出的機率
        words = [w.split("#")[0].strip() for w in hot.read_text(encoding="utf-8").splitlines()]
        prompt = "以下是台灣繁體中文的財經與科技節目：" + "、".join(w for w in words if w)[:200]
    it, _ = model.transcribe(str(wav), language=lang, vad_filter=True, initial_prompt=prompt, condition_on_previous_text=False)
    segs = [{"start": s.start, "end": s.end, "text": s.text} for s in it]
    if lang == "zh":
        import opencc
        cc, reps = opencc.OpenCC("s2twp"), load_replace()
        for s in segs:
            t = cc.convert(s["text"])
            for a, b in reps:
                t = t.replace(a, b)
            s["text"] = t
    return segs, f"faster-whisper {name}" + ("，OpenCC s2twp" if lang == "zh" else "")


def transcribe(ep, work):
    """→ (逐字稿 markdown, 秒數, 語言, 轉錄器)"""
    media = work / "media.bin"
    mb = download(ep["audio_url"], media) / 1048576
    wav = work / "audio.wav"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(media), "-vn", "-ac", "1", "-ar", "16000", str(wav)], timeout=1800)
    media.unlink(missing_ok=True)
    dur = max(0.0, (wav.stat().st_size - 44) / 32000.0)
    lang = ep.get("lang") if ep.get("lang") in ("zh", "en") else ("zh" if re.search(r"[一-鿿]", ep.get("title") or "") else "en")
    log(f"  音檔 {mb:.1f} MB、{dur / 60:.1f} 分鐘、語言 {lang}")
    t0 = time.time()
    if lang == "zh" and ep.get("asr") != "whisper":
        segs, spk = funasr(wav, work, dur)
        engine = "FunASR paraformer-zh＋fsmn-vad＋ct-punc" + ("＋cam++" if spk else "（分段）") + "，OpenCC s2twp"
    else:
        segs, engine = whisper(wav, lang)
    md = Y.segs_to_md(segs)
    if len(re.sub(r"\s|\[[\d:]+\]|〔說話者\d+〕", "", md)) < 200:
        raise RuntimeError("逐字稿太短，可能辨識失敗")
    log(f"  轉錄完成：{len(md)} 字元、耗時 {int(time.time() - t0)} 秒")
    return md, int(dur), lang, engine


# ───────────────────────── 筆記（Claude API） ─────────────────────────
def call_claude(system, user, key, model, max_tokens=8000):
    body = json.dumps({"model": model, "max_tokens": max_tokens, "system": system,
                       "messages": [{"role": "user", "content": user}]}).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST", headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read().decode("utf-8"))
            return "".join(c.get("text", "") for c in d.get("content") or [] if c.get("type") == "text"), d.get("usage") or {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:300]
            last = RuntimeError(f"Claude API HTTP {e.code}：{msg}")
            if e.code in (400, 401, 403, 404):
                raise last
        except Exception as e:                      # noqa: BLE001
            last = e
        time.sleep(10 * (i + 1))
    raise last


def parse_json(text):
    s = str(text or "").strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    a, b = s.find("{"), s.rfind("}")
    if a < 0 or b <= a:
        raise ValueError("模型回覆不是 JSON")
    return json.loads(s[a:b + 1])


def apply_corrections(transcript, corrections, limit=40):
    """只套用逐字稿裡真的有的 from→to；回傳 (新逐字稿, 實際套用數)"""
    n = 0
    for c in (corrections or [])[:limit]:
        a, b = str((c or {}).get("from") or ""), str((c or {}).get("to") or "")
        if len(a) >= 2 and a != b and a in transcript and "\n" not in a + b and len(b) <= 40:
            transcript = transcript.replace(a, b); n += 1
    return transcript, n


def user_message(meta, transcript):
    body = transcript if len(transcript) <= LLM_CHARS else transcript[:LLM_CHARS] + "\n\n【以下逐字稿過長已截斷】"
    return "\n".join([
        f"節目：{meta['show']}", f"集數標題：{meta['title']}", f"發布日期：{meta['published']}",
        f"時長：{MP.dur_text(meta['duration_sec'])}", f"節目說明（僅供參考，可能含廣告）：{(meta.get('description') or '')[:1200]}",
        "", "<逐字稿>", body, "</逐字稿>"])


def write_note(meta, transcript, key, model):
    system = (HERE / "prompt.md").read_text(encoding="utf-8")
    msg = user_message(meta, transcript)
    note, errs, usage_all = None, [], []
    for attempt in range(3):
        u = msg if not errs else msg + "\n\n上一版 JSON 沒通過檢查，請修正後重新輸出完整 JSON：\n- " + "\n- ".join(errs)
        text, usage = call_claude(system, u, key, model)
        usage_all.append(usage)
        try:
            note = parse_json(text)
        except ValueError as e:
            errs = [str(e)]; continue
        copy, slash = MP.build_copy(meta, note, now_tpe().strftime("%Y%m%d"))
        errs = MP.validate(copy, slash, note, meta)
        if not errs:
            break
        log(f"  第 {attempt + 1} 版未通過：{'；'.join(errs)[:300]}")
    if errs:
        raise RuntimeError("筆記三次都沒通過驗證：" + "；".join(errs)[:500])
    tin = sum(int(u.get("input_tokens") or 0) for u in usage_all)
    tout = sum(int(u.get("output_tokens") or 0) for u in usage_all)
    log(f"  Claude {model}：{len(usage_all)} 次呼叫、輸入 {tin} tokens、輸出 {tout} tokens")
    return note


def slim_entry(entry, cards):
    c = entry.get("cornell") or {}
    pub = str(entry.get("published") or "")[:10]
    return {"id": entry["id"], "code": entry.get("code") or "", "show": entry.get("show") or "", "title": str(entry.get("title") or "")[:200],
            "url": entry.get("url") if str(entry.get("url") or "").startswith("https://") else "",
            "published": pub, "date": pub.replace("-", "."), "duration": entry.get("duration") or "",
            "category": entry.get("category") or "", "headline": str(entry.get("headline") or "")[:120], "language": entry.get("language") or "",
            "summary": [str(x)[:200] for x in (entry.get("summary") or [])][:5],
            "cornell": {"rows": [{"cue": str(r.get("cue", ""))[:40], "note": str(r.get("note", ""))[:240]} for r in (c.get("rows") or [])][:6],
                        "summary": str(c.get("summary") or "")[:240]},
            "cards": cards, "added": entry.get("added") or ""}


def merge_index(entry):
    d = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else {"items": []}
    items = [x for x in d.get("items") or [] if x.get("id") != entry["id"]] + [entry]
    items.sort(key=lambda x: (x.get("added", ""), x.get("published", ""), x.get("id", "")), reverse=True)
    items = items[:MAX_ITEMS]
    keep = {p.split("/")[-1] for x in items for p in (x.get("cards") or {}).values() if p}
    if CARDS.is_dir():
        for f in CARDS.glob("*.png"):
            if f.name not in keep:
                f.unlink()
    DATA.write_text(json.dumps({"updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": items},
                               ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def package(meta, transcript, note, content_dir, work):
    """make_package.py → content/pn-<ID>/<D>/、assets/podnotes/、data/podnotes.json"""
    D = now_tpe().strftime("%Y%m%d")
    inbox = work / "inbox" / meta["id"]; inbox.mkdir(parents=True, exist_ok=True)
    for name, obj in (("meta.json", meta), ("note.json", note)):
        (inbox / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    (inbox / "transcript.md").write_text(transcript, encoding="utf-8")
    out = work / "out"
    sh([sys.executable, str(HERE / "make_package.py"), str(inbox), "--out", str(out), "--date", D,
        "--produced-by", "podnotes.yml（GitHub Actions）"], timeout=600)
    pkg = out / D / "pilotone" / meta["id"]
    dest = Path(content_dir) / "content" / f"pn-{meta['id']}" / D
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for f in pkg.iterdir():
        if f.is_file():
            shutil.copy2(f, dest / f.name)
    CARDS.mkdir(parents=True, exist_ok=True)
    cards = {}
    for k in ("fb", "ig"):
        src = pkg / f"PodNotes_{meta['id']}_{k.upper()}.png"
        site = f"assets/podnotes/{meta['id']}_{k.upper()}.png"
        shutil.copy2(src, REPO / site)
        cards[k] = site
    entry = json.loads((out / "index_entry.json").read_text(encoding="utf-8"))
    merge_index(slim_entry(entry, cards))
    return f"content/pn-{meta['id']}/{D}"


# ───────────────────────── Firestore ─────────────────────────
def firestore():
    from google.cloud import firestore as fs
    from google.oauth2 import service_account
    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    creds = service_account.Credentials.from_service_account_info(info)
    return fs.Client(project=info["project_id"], credentials=creds)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--content-dir", required=True, help="content 分支的工作目錄")
    ap.add_argument("--episode", default="", help="只處理這個節目代碼的最新一集（不看時間窗）")
    ap.add_argument("--force", action="store_true", help="已處理過也重做")
    ap.add_argument("--max", type=int, default=6, help="本輪最多處理幾集")
    a = ap.parse_args()
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    model = os.environ.get("PODNOTES_MODEL", "").strip() or "claude-sonnet-5-5"
    db = firestore()
    sd = db.collection(SHOWS_DOC[0]).document(SHOWS_DOC[1]).get()
    shows = enabled_shows(sd.to_dict() if sd.exists else None)
    log(f"啟用節目 {len(shows)} 個：{'、'.join(s['show'] for s in shows)}｜筆記引擎：{model if key else '未設定 ANTHROPIC_API_KEY（只轉錄）'}")
    ids_states = {}
    now = now_tpe()
    # 先讀候選集數的狀態（plan 需要）
    todo = []
    for show in shows:
        if a.episode and show["code"] != a.episode:
            continue
        todo.append(show)
    states = {d.id: d.to_dict() for d in db.collection(COLL).where("stage", "in", ["transcribed", "noted", "failed"]).limit(500).stream()}
    jobs = plan(todo, states, now, only=a.episode or None, force=a.force)[: a.max]
    if not jobs:
        log("沒有要處理的集數"); return
    done = {"transcribed": 0, "noted": 0, "failed": 0}
    for ep, action in jobs:
        ref = db.collection(COLL).document(ep["id"])
        st = states.get(ep["id"]) or {}
        log(f"▶ {ep['id']}｜{ep['show']}｜{ep['title']}｜{action}")
        work = Path(tempfile.mkdtemp(prefix="pn-"))
        try:
            if action == "transcribe":
                md, dur, lang, engine = transcribe(ep, work)
                st = {"id": ep["id"], "code": ep["code"], "show": ep["show"], "title": ep["title"], "published": ep["published"],
                      "durationSec": dur, "language": lang, "transcriber": engine, "url": ep.get("url") or "",
                      "audioUrl": ep["audio_url"], "description": (ep.get("description") or "")[:2000],
                      "transcript": md[:MAX_TRANSCRIPT], "chars": len(md), "truncated": len(md) > MAX_TRANSCRIPT,
                      "stage": "transcribed", "attempts": 0, "error": "", "syncedAt": datetime.now(timezone.utc).isoformat()}
                ref.set(st)
                done["transcribed"] += 1
            if not key:
                continue
            meta = {"id": ep["id"], "code": ep["code"], "show": ep["show"], "title": ep["title"], "url": ep.get("url") or "",
                    "audio_url": ep["audio_url"], "published": ep["published"], "duration_sec": int(st.get("durationSec") or ep.get("duration_sec") or 0),
                    "language": st.get("language") or "", "transcriber": st.get("transcriber") or "", "description": st.get("description") or ""}
            note = write_note(meta, st["transcript"], key, model)
            fixed, n = apply_corrections(st["transcript"], note.get("corrections"))
            rel = package(meta, fixed, note, a.content_dir, work)
            ref.update({"transcript": fixed[:MAX_TRANSCRIPT], "chars": len(fixed), "stage": "noted", "corrections": n,
                        "headline": note.get("headline") or "", "check": [str(x)[:200] for x in (note.get("check") or [])][:20],
                        "notedAt": datetime.now(timezone.utc).isoformat(), "noteModel": model,
                        "transcriber": (st.get("transcriber") or "") + f"，Claude 校正 {n} 處"})
            done["noted"] += 1
            log(f"  ✓ 筆記完成、校正 {n} 處、送審包 {rel}")
        except Exception as e:                      # noqa: BLE001  單集失敗不影響其他集
            done["failed"] += 1
            msg = str(e)[:500]
            log(f"  ✗ {ep['id']} 失敗：{msg}")
            prev = int(st.get("attempts") or 0) + 1
            if st.get("stage") == "transcribed" and st.get("transcript"):
                ref.update({"attempts": prev, "error": msg})          # 已有逐字稿：保留 transcribed，下輪再試筆記
                if prev >= MAX_ATTEMPTS + 1:
                    ref.update({"stage": "failed"})
            else:
                ref.set({"id": ep["id"], "show": ep["show"], "title": ep["title"], "published": ep["published"], "url": ep.get("url") or "",
                         "stage": "failed", "attempts": prev, "error": msg, "syncedAt": datetime.now(timezone.utc).isoformat()}, merge=True)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    log(f"本輪：轉錄 {done['transcribed']}、筆記 {done['noted']}、失敗 {done['failed']}")
    gh = os.environ.get("GITHUB_STEP_SUMMARY")
    if gh:
        with open(gh, "a", encoding="utf-8") as f:
            f.write(f"### 常聽 Podcast 重點筆記\n- 轉錄 {done['transcribed']} 集、筆記 {done['noted']} 集、失敗 {done['failed']} 集\n"
                    + ("" if key else "- 尚未設定 `ANTHROPIC_API_KEY`：只轉錄並保存逐字稿，設定後下一輪補做筆記\n"))


if __name__ == "__main__":
    main()
