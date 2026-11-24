#!/usr/bin/env python3
"""
常聽 Podcast 重點筆記 · 成品打包（Claude 校正完一集後執行；照抄執行、不要重新設計）
=====================================================================
輸入：一集的收件匣資料夾 <INBOX>/<集數ID>/（集數ID＝<節目代碼>-<YYYYMMDD>，如 yutinghao-20261124）
  meta.json        ytnotes.py（podcast 模式）產生：show、code、title、url、audio_url、published、duration_sec、language…
  transcript.md    Claude 校正後的逐字稿（保留 [分:秒]；【?猜測】【聽不清】照標）——只存 Drive／後台，不公開
  note.json        Claude 撰寫：
    { "headline": "社群標題（依下標準則：具體數字、給理由、點名受眾、可用為什麼／如何；與內文相符）",
      "summary": ["重點摘要 3～5 行"],
      "cornell": {"rows": [{"cue": "線索", "note": "筆記"}], "summary": "一句話總結"},   # 4～6 列
      "posts": {                                   # 三平台各自不同的文案主體（自己的話；不含品牌列／來源／連結／標籤，程式會補）
        "fb": "開頭鉤子＋3～5 個重點＋一個互動提問（約 250～600 字）",
        "ig": "第一行就要抓住人的鉤子，短句分行、emoji 點綴、收藏／分享召喚（約 200～500 字）",
        "threads": "口語、短、有觀點的一段話（含換行，約 120～230 字）" },
      "hashtags": ["#台股", "…"],                  # 3～8 個；程式另補 #艾倫極光報報 #Podcast重點筆記
      "category": "理財"／"AI 應用"／"科技"…,
      "check": ["需要 Allen 核對的地方（選填）"] }

輸出（--out 為 notes/podcast 的鏡像根目錄；之後由 Claude 用 device_commit_files 寫回 Drive）：
  notes/<發布日期>_<節目>_<標題>.md 與同名 .txt     Obsidian 筆記（含逐字稿，只在 Drive）
  transcripts/<集數ID>.md                          後台逐字稿（focus-update 同步到 Firestore 管理者限定集合，不公開）
  index_entry.json                                 首頁「常聽 Podcast · 重點筆記」索引的一筆（由 merge_index.py 併入 index.json；不含逐字稿）
  <YYYYMMDD>/pilotone/<集數ID>/                     PilotOne 送審包（manifest.json topic pn-<集數ID>、fb/ig/threads.txt、莫蘭迪藍圖卡）
用法：
  python3 make_package.py <INBOX>/<集數ID> --out <輸出根目錄> [--date YYYYMMDD]
"""
import argparse, json, re, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
TPE = timezone(timedelta(hours=8))
BRAND = "艾倫極光報報 ALLEN I³ AURORA BRIEF"
SERIES = "常聽 Podcast 重點筆記"
WEEK = "一二三四五六日"
NOTICE = "以上為個人收聽後整理的重點筆記，非節目逐字轉載；完整內容請收聽原節目並支持創作者。"
LIMIT = {"ig": 2200, "th": 500, "tags": 30}
SITE = "https://allenchen1113official.github.io/AllenI3Aurora/"
SITE_NOTE = SITE + "podcast.html?pn={id}#pn-{id}"      # 網站「常聽 Podcast · 重點筆記」該集
CARD_THEME = "morandi-blue"                             # 圖卡色調：莫蘭迪藍色系（render_social_card.THEMES）
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,30}-\d{8}$")


def safe(s, n=50):
    s = re.sub(r'[\\/:*?"<>|\n\r\t#^\[\]]+', " ", str(s or "")).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:n].strip() or "untitled"


def dur_text(sec):
    sec = int(sec or 0)
    h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h} 小時 {m} 分" if h else (f"{m} 分" if m else f"{s} 秒")


def clean_title(t):
    """節目標題去掉開頭日期（如 2026/11/24(二)）與【系列名】，圖卡與短版來源用"""
    s = re.sub(r"【[^】]*】", " ", str(t or ""))
    s = re.sub(r"^\s*\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\s*([(（][^)）]{1,4}[)）])?\s*", "", s)
    return re.sub(r"\s+", " ", s).strip() or str(t or "").strip()


def tags_of(note, n):
    out = []
    for t in note.get("hashtags") or []:
        t = "#" + str(t).lstrip("#").replace(" ", "")
        if t != "#" and t not in out:
            out.append(t)
    for t in ("#艾倫極光報報", "#Podcast重點筆記"):
        if t not in out:
            out.append(t)
    return out[:n]


def source_text(meta, short=False):
    if short:
        t = clean_title(meta.get("title"))
        return f"🎧 節目來源：{meta.get('show','')}〈{t if len(t) <= 30 else t[:29] + '…'}〉"
    title = meta.get("title", "")
    return f"🎧 節目來源：{meta.get('show','')}〈{title}〉（{meta.get('published','')}・{dur_text(meta.get('duration_sec'))}）"


def build_copy(meta, note, date):
    d = datetime.strptime(date, "%Y%m%d")
    slash = d.strftime("%Y/%m/%d")
    day = f"{slash}（週{WEEK[d.weekday()]}）"
    head = str(note.get("headline") or meta.get("title")).strip()
    posts = note.get("posts") or {}
    site = SITE_NOTE.format(id=meta["id"])
    ep_url = meta.get("url") or ""
    c = note.get("cornell") or {}
    take = f"💡 一句話總結：{c.get('summary','')}" if c.get("summary") else ""
    fb = "\n".join([
        head, f"{BRAND}｜今日關注動態｜{SERIES} {day}", "", source_text(meta), "",
        str(posts.get("fb") or "").strip(), "", take, "",
        f"📝 康乃爾筆記全文：{site}", *([f"🎧 收聽原節目：{ep_url}"] if ep_url else []), "",
        NOTICE, "", " ".join(tags_of(note, 8)),
    ])
    ig = "\n".join([
        head, f"{BRAND}｜{SERIES} {day}", "", source_text(meta), "",
        str(posts.get("ig") or "").strip(), "", take, "",
        "📝 康乃爾筆記全文：個人檔案連結 → 艾倫報報「常聽 Podcast 重點筆記」",
        NOTICE, "", " ".join(tags_of(note, 15)),
    ])
    th = "\n".join([
        head, f"{BRAND}｜{SERIES} {slash}", source_text(meta, short=True), "",
        str(posts.get("threads") or "").strip(), "", f"📝 筆記：{site}", "#Podcast重點筆記",
    ])
    return {"fb": fb.strip() + "\n", "ig": ig.strip() + "\n", "th": th.strip() + "\n"}, slash


def validate(copy, slash, note, meta):
    errs = []
    if not ID_RE.match(str(meta.get("id") or "")):
        errs.append(f"meta.id 格式不符（<節目代碼>-<YYYYMMDD>）：{meta.get('id')}")
    posts = note.get("posts") or {}
    for k in ("fb", "ig", "threads"):
        if len(str(posts.get(k) or "").strip()) < 40:
            errs.append(f"posts.{k}：缺少或太短（三平台文案須各自撰寫）")
    if posts and len({str(posts.get(k) or "").strip() for k in ("fb", "ig", "threads")}) < 3:
        errs.append("posts：三平台文案不可相同，請依平台特性各自撰寫")
    for k, t in copy.items():
        if "節目來源" not in t: errs.append(f"{k}：缺節目來源")
        if slash not in t: errs.append(f"{k}：缺日期 {slash}")
        if BRAND not in t: errs.append(f"{k}：缺品牌列")
    if len(copy["ig"]) > LIMIT["ig"]: errs.append(f"ig：{len(copy['ig'])} 字元 > {LIMIT['ig']}，請精簡 posts.ig")
    if len(copy["th"]) > LIMIT["th"]: errs.append(f"threads：{len(copy['th'])} 字元 > {LIMIT['th']}，請精簡 posts.threads（不可硬截斷句子）")
    if len(re.findall(r"(^|\s)#[^\s#]+", copy["ig"])) > LIMIT["tags"]: errs.append("ig：hashtag 超過 30")
    site = SITE_NOTE.format(id=meta.get("id"))
    if site not in copy["fb"] or site not in copy["th"]: errs.append("fb／threads：缺網站筆記連結")
    if re.search(r"https?://", copy["ig"]): errs.append("ig：IG 內文連結無法點擊，請勿放網址")
    n = len(note.get("summary") or [])
    if not 3 <= n <= 5: errs.append(f"重點摘要應 3～5 行（目前 {n}）")
    rows = (note.get("cornell") or {}).get("rows") or []
    if not 4 <= len(rows) <= 6: errs.append(f"康乃爾筆記應 4～6 列（目前 {len(rows)}）")
    if not (note.get("cornell") or {}).get("summary"): errs.append("缺康乃爾一句話總結")
    if not str(note.get("headline") or "").strip(): errs.append("缺 headline")
    return errs


def build_note_md(meta, note, transcript):
    pub = meta.get("published") or ""
    c = note.get("cornell") or {}
    lines = [
        "---",
        f"title: \"{str(meta.get('title','')).replace(chr(34), '')}\"",
        f"show: \"{meta.get('show','')}\"",
        f"source: {meta.get('url','')}",
        f"audio: {meta.get('audio_url','')}",
        f"published: {pub}",
        f"duration: {dur_text(meta.get('duration_sec'))}",
        f"language: {meta.get('language','')}",
        f"transcriber: \"{meta.get('transcriber','')}，Claude 校正\"",
        f"episode_id: {meta.get('id')}",
        "tags: [podcast, 重點筆記]",
        "---", "",
        f"# {meta.get('show','')}｜{meta.get('title','')}", "",
        f"> {pub}｜{dur_text(meta.get('duration_sec'))}｜[收聽]({meta.get('url','')})", "",
        f"**社群標題**：{note.get('headline','')}", "",
        "## 重點摘要", "", *[f"- {x}" for x in note.get("summary") or []], "",
        "## 康乃爾筆記", "", "| 線索 | 筆記 |", "|---|---|",
        *[f"| {r.get('cue','')} | {str(r.get('note','')).replace('|','｜')} |" for r in c.get("rows") or []], "",
        f"**總結**：{c.get('summary','')}", "",
        "## 逐字稿", "", transcript.strip(), "",
    ]
    return "\n".join(lines)


def build_transcript_md(meta, transcript):
    """後台逐字稿檔：開頭固定 3 行中繼資料（sync-transcripts.mjs 解析），空一行後為逐字稿本文"""
    head = {"id": meta.get("id"), "show": meta.get("show"), "title": meta.get("title"), "published": meta.get("published"),
            "duration_sec": int(meta.get("duration_sec") or 0), "language": meta.get("language"),
            "transcriber": f"{meta.get('transcriber','')}，Claude 校正", "url": meta.get("url")}
    return "<!-- podnotes-transcript " + json.dumps(head, ensure_ascii=False) + " -->\n\n" + transcript.strip() + "\n"


def render_cards(meta, note, outdir, stem):
    for p in (HERE, HERE.parent / "podcast"):
        sys.path.insert(0, str(p))
    import render_social_card as rc                       # 與 Podcast／YouTube 康乃爾圖卡同一支（打包時一併複製）
    c = note.get("cornell") or {}
    ep = {"kicker": "PODCAST · 重點筆記 · 康乃爾筆記", "show": meta.get("show", ""), "title": clean_title(meta.get("title")),
          "date": (meta.get("published") or "").replace("-", "."), "duration": dur_text(meta.get("duration_sec")),
          "summary": " ".join(note.get("summary") or [])[:220],
          "cornell": {"rows": c.get("rows") or [], "summary": c.get("summary", "")},
          "theme": CARD_THEME, "source": f"節目來源：{meta.get('show','')}〈{meta.get('title','')}〉",
          "footer": "艾倫報報 · 常聽 Podcast 重點筆記｜allenchen1113official.github.io/AllenI3Aurora"}
    files = {}
    for k, size in (("fb", (1200, 630)), ("ig", (1080, 1080))):
        p = outdir / f"{stem}_{k.upper()}.png"
        rc.render_card(ep, size, p)
        files[k] = p.name
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inbox")
    ap.add_argument("--out", required=True)
    ap.add_argument("--date", default=datetime.now(TPE).strftime("%Y%m%d"), help="送審日期（台北，預設今天）")
    ap.add_argument("--produced-by", default="podnotes")
    ap.add_argument("--no-cards", action="store_true", help="只驗證文案、不產圖（測試用）")
    a = ap.parse_args()
    src, out = Path(a.inbox), Path(a.out)
    meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    note = json.loads((src / "note.json").read_text(encoding="utf-8"))
    transcript = (src / "transcript.md").read_text(encoding="utf-8")
    eid = meta["id"]

    copy, slash = build_copy(meta, note, a.date)
    errs = validate(copy, slash, note, meta)
    if errs:
        print("驗證失敗：\n- " + "\n- ".join(errs)); sys.exit(2)

    name = f"{meta.get('published') or a.date}_{safe(meta.get('show'), 24)}_{safe(meta.get('title'), 50)}"
    nd = out / "notes"; nd.mkdir(parents=True, exist_ok=True)
    md = build_note_md(meta, note, transcript)
    (nd / f"{name}.md").write_text(md, encoding="utf-8")
    (nd / f"{name}.txt").write_text(md, encoding="utf-8")
    td = out / "transcripts"; td.mkdir(parents=True, exist_ok=True)
    (td / f"{eid}.md").write_text(build_transcript_md(meta, transcript), encoding="utf-8")

    rel = f"{a.date}/pilotone/{eid}"
    pkg = out / rel; pkg.mkdir(parents=True, exist_ok=True)
    for k, fn in (("fb", "fb.txt"), ("ig", "ig.txt"), ("th", "threads.txt")):
        (pkg / fn).write_text(copy[k], encoding="utf-8")
    stem = f"PodNotes_{eid}"
    cards = {"fb": f"{stem}_FB.png", "ig": f"{stem}_IG.png"} if a.no_cards else render_cards(meta, note, pkg, stem)
    now = datetime.now(TPE).isoformat(timespec="seconds")
    manifest = {"version": 1, "topic": f"pn-{eid}", "date": f"{a.date[:4]}-{a.date[4:6]}-{a.date[6:]}",
                "title": copy["fb"].splitlines()[0], "link": SITE_NOTE.format(id=eid), "autoPublish": False, "verified": True,
                "platforms": {"fb": {"caption": "fb.txt", "images": [cards["fb"]]},
                              "ig": {"caption": "ig.txt", "images": [cards["ig"]]},
                              "threads": {"caption": "threads.txt", "images": [cards["ig"]]}},
                "producedBy": a.produced_by, "producedAt": now}
    (pkg / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    entry = {"id": eid, "code": meta.get("code"), "show": meta.get("show"), "author": meta.get("show"),
             "title": meta.get("title"), "url": meta.get("url"), "published": meta.get("published"),
             "duration": dur_text(meta.get("duration_sec")), "language": meta.get("language"),
             "category": note.get("category") or "理財", "headline": note.get("headline"),
             "summary": note.get("summary"), "cornell": note.get("cornell"),
             "cards": {"fb": f"{rel}/{cards['fb']}", "ig": f"{rel}/{cards['ig']}"},
             "note_file": f"notes/{name}.md", "added": a.date}
    (out / "index_entry.json").write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"note": f"notes/{name}.md", "package": rel + "/", "cards": cards,
                      "fb_len": len(copy["fb"]), "ig_len": len(copy["ig"]), "threads_len": len(copy["th"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
