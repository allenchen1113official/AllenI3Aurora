#!/usr/bin/env python3
"""
常看 YouTube 重點筆記 · 成品打包（Claude 校正完一支影片後執行；照抄執行、不要重新設計）
=====================================================================
輸入：一支影片的收件匣資料夾 <INBOX>/<影片ID>/
  meta.json        ytnotes.py 產生（標題、作者、發布日期、長度、網址、語言、轉錄方式）
  transcript.md    Claude 校正後的逐字稿（保留 [分:秒]；【?猜測】【聽不清】照標）
  note.json        Claude 撰寫：
    { "headline": "社群標題（依下標準則；與內文相符）",
      "summary": ["重點摘要 3～5 行"],
      "cornell": {"rows": [{"cue": "線索", "note": "筆記"}], "summary": "一句話總結"},
      "screen_text": ["短影音畫面文字（選填）"],
      "hashtags": ["#AI", "…"],            # 3～6 個，不含 # 也可
      "category": "AI 應用",               # 首頁分類（選填）
      "check": ["需要 Allen 核對的地方（選填）"] }

輸出（--out 為 notes/youtube 的鏡像根目錄；之後由 Claude 用 device_commit_files 寫回 Drive）：
  notes/<發布日期>_<作者>_<標題>.md 與同名 .txt     Obsidian 筆記＋Drive 純文字副本
  index_entry.json                                  首頁「常看 YouTube · 重點筆記」索引的一筆（由呼叫端併入 index.json）
  <YYYYMMDD>/pilotone/<影片ID>/                     PilotOne 送審包（manifest.json、fb/ig/threads.txt、圖卡）
用法：
  python3 make_package.py <INBOX>/<影片ID> --out <輸出根目錄> [--date YYYYMMDD]
"""
import argparse, json, re, subprocess, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
TPE = timezone(timedelta(hours=8))
BRAND = "艾倫極光報報 ALLEN I³ AURORA BRIEF"
SERIES = "常看 YouTube 重點筆記"
WEEK = "一二三四五六日"
NOTICE = "以上為個人觀看後整理的重點筆記，非原片逐字轉載；完整內容請看原片並支持創作者。"
LIMIT = {"ig": 2200, "th": 500, "tags": 30}
SITE_NOTE = "https://allenchen1113official.github.io/AllenI3Aurora/?yt={vid}#ytnotes"   # 網站「常看 YouTube · 重點筆記」該支筆記
CARD_THEME = "morandi-indigo"   # 圖卡色調：莫蘭迪靛色系（render_social_card.THEMES）

def safe(s, n=50):
    s = re.sub(r'[\\/:*?"<>|\n\r\t#^\[\]]+', " ", str(s or "")).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:n].strip() or "untitled"

def dur_text(sec):
    sec = int(sec or 0)
    h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h} 小時 {m} 分" if h else (f"{m} 分 {s} 秒" if m else f"{s} 秒")

def tags_of(note, n):
    out = []
    for t in note.get("hashtags") or []:
        t = "#" + str(t).lstrip("#").replace(" ", "")
        if t != "#" and t not in out:
            out.append(t)
    for t in ("#艾倫極光報報", "#YouTube重點筆記"):
        if t not in out:
            out.append(t)
    return out[:n]

def build_note_md(meta, note, transcript):
    pub = meta.get("published") or ""
    fm = [
        "---",
        f"title: \"{meta.get('title','').replace(chr(34), '')}\"",
        f"source: {meta.get('url','')}",
        f"author: \"{meta.get('author','')}\"",
        f"channel_url: {meta.get('channel_url') or ''}",
        f"published: {pub}",
        f"duration: {dur_text(meta.get('duration_sec'))}",
        f"language: {meta.get('language','')}",
        f"transcriber: \"{meta.get('transcriber','')}，Claude 校正\"",
        f"video_id: {meta.get('id')}",
        "tags: [youtube, 重點筆記]",
        "---", "",
        f"# {meta.get('title','')}", "",
        f"> {meta.get('author','')}｜{pub}｜{dur_text(meta.get('duration_sec'))}｜[原片]({meta.get('url','')})", "",
        "## 重點摘要", "", *[f"- {x}" for x in note.get("summary") or []], "",
    ]
    c = note.get("cornell") or {}
    if c.get("rows"):
        fm += ["## 康乃爾筆記", "", "| 線索 | 筆記 |", "|---|---|",
               *[f"| {r.get('cue','')} | {r.get('note','').replace('|','｜')} |" for r in c["rows"]], "",
               f"**總結**：{c.get('summary','')}", ""]
    if note.get("screen_text"):
        fm += ["## 畫面文字", "", *[f"- {x}" for x in note["screen_text"]], ""]
    fm += ["## 逐字稿", "", transcript.strip(), ""]
    return "\n".join(fm)

def build_copy(meta, note, date):
    d = datetime.strptime(date, "%Y%m%d")
    slash = d.strftime("%Y/%m/%d")
    day = f"{slash}（週{WEEK[d.weekday()]}）"
    head = str(note.get("headline") or meta.get("title")).strip()
    src = f"📺 影片來源：{meta.get('author','')}〈{meta.get('title','')}〉（YouTube・{meta.get('published','')}・{dur_text(meta.get('duration_sec'))}）"
    summ = [f"• {x}" for x in note.get("summary") or []]
    c = note.get("cornell") or {}
    rows = [f"🔹 {r.get('cue','')}：{r.get('note','')}" for r in c.get("rows") or []]
    take = f"💡 一句話總結：{c.get('summary','')}" if c.get("summary") else ""
    url = meta.get("url", "")
    fb = "\n".join(x for x in [
        head, "", f"{BRAND}｜今日關注動態｜{SERIES} {day}", "", src, "",
        "📌 重點摘要", *summ, "", "📝 康乃爾筆記", *rows, "", take, "",
        f"🎬 原片：{url}", "", NOTICE, "", " ".join(tags_of(note, 6)),
    ] if x is not None)
    ig = "\n".join([
        head, f"{BRAND}｜{SERIES} {day}", "", src, "",
        "📌 重點摘要", *summ, "", "📝 康乃爾筆記", *rows, "", take, "",
        f"🎬 原片搜尋：{meta.get('author','')}〈{meta.get('title','')}〉（連結見 FB／Threads）",
        NOTICE, "", " ".join(tags_of(note, 12)),
    ])
    # Threads：單則 ≤500 字元，逐步刪減到符合
    def th_text(n_points, with_take=True, short_src=False):
        s = src if not short_src else f"📺 影片來源：{meta.get('author','')}〈{safe(meta.get('title'), 28)}〉"
        parts = [head, f"{BRAND}｜{SERIES} {slash}", s, ""]
        parts += [f"{'①②③④⑤'[i]} {x.lstrip('• ')}" for i, x in enumerate(summ[:n_points])]
        if with_take and take:
            parts += ["", take]
        parts += ["", f"原片：{url}", "#YouTube重點筆記"]
        return "\n".join(parts)
    th = None
    for args in [(3, True, False), (3, True, True), (3, False, True), (2, False, True), (1, False, True)]:
        th = th_text(*args)
        if len(th) <= LIMIT["th"]:
            break
    return {"fb": fb.strip() + "\n", "ig": ig.strip() + "\n", "th": th.strip() + "\n"}, slash

def source_line(meta):
    """圖卡上的影片來源備註：網址放前面，長標題截斷時連結仍保留"""
    vid = meta.get("id", "")
    link = f"youtu.be/{vid}" if meta.get("platform", "youtube") == "youtube" and vid else (meta.get("url") or "")
    return f"影片來源：YouTube · {link}｜{meta.get('author','')}〈{meta.get('title','')}〉"

def render_cards(meta, note, outdir, stem):
    sys.path.insert(0, str(HERE))
    try:
        import render_social_card as rc            # 與 Podcast 康乃爾圖卡同一支（打包時一併複製）
    except ImportError:
        sys.path.insert(0, str(HERE.parent / "podcast"))
        import render_social_card as rc
    c = note.get("cornell") or {}
    ep = {"kicker": "YOUTUBE · 重點筆記 · 康乃爾筆記", "show": meta.get("author", ""), "title": meta.get("title", ""),
          "date": (meta.get("published") or "").replace("-", "."), "duration": dur_text(meta.get("duration_sec")),
          "summary": " ".join(note.get("summary") or [])[:220],
          "cornell": {"rows": c.get("rows") or [], "summary": c.get("summary", "")},
          "theme": CARD_THEME, "source": source_line(meta),
          "footer": "艾倫報報 · 常看 YouTube 重點筆記｜allenchen1113official.github.io/AllenI3Aurora"}
    files = {}
    for k, size in (("fb", (1200, 630)), ("ig", (1080, 1080))):
        p = outdir / f"{stem}_{k.upper()}.png"
        rc.render_card(ep, size, p)
        files[k] = p.name
    return files

def validate(copy, slash, note, meta):
    errs = []
    for k, t in copy.items():
        if "影片來源" not in t:
            errs.append(f"{k}：缺影片來源")
        if slash not in t:
            errs.append(f"{k}：缺日期 {slash}")
        if BRAND not in t:
            errs.append(f"{k}：缺品牌列")
    if len(copy["ig"]) > LIMIT["ig"]: errs.append(f"ig：{len(copy['ig'])} 字元 > {LIMIT['ig']}")
    if len(copy["th"]) > LIMIT["th"]: errs.append(f"threads：{len(copy['th'])} 字元 > {LIMIT['th']}")
    if len(re.findall(r"(^|\s)#[^\s#]+", copy["ig"])) > LIMIT["tags"]: errs.append("ig：hashtag 超過 30")
    if meta.get("url", "") not in copy["fb"] or meta.get("url", "") not in copy["th"]: errs.append("fb／threads：缺原片網址")
    n = len(note.get("summary") or [])
    if not 3 <= n <= 5: errs.append(f"重點摘要應 3～5 行（目前 {n}）")
    if not (note.get("cornell") or {}).get("rows"): errs.append("缺康乃爾筆記")
    if not str(note.get("headline") or "").strip(): errs.append("缺 headline")
    return errs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inbox")
    ap.add_argument("--out", required=True)
    ap.add_argument("--date", default=datetime.now(TPE).strftime("%Y%m%d"), help="送審日期（台北，預設今天）")
    ap.add_argument("--produced-by", default="ytnotes")
    a = ap.parse_args()
    src, out = Path(a.inbox), Path(a.out)
    meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    note = json.loads((src / "note.json").read_text(encoding="utf-8"))
    transcript = (src / "transcript.md").read_text(encoding="utf-8")
    vid = meta["id"]

    copy, slash = build_copy(meta, note, a.date)
    errs = validate(copy, slash, note, meta)
    if errs:
        print("驗證失敗：\n- " + "\n- ".join(errs)); sys.exit(2)

    name = f"{meta.get('published') or a.date}_{safe(meta.get('author'), 24)}_{safe(meta.get('title'), 50)}"
    nd = out / "notes"; nd.mkdir(parents=True, exist_ok=True)
    md = build_note_md(meta, note, transcript)
    (nd / f"{name}.md").write_text(md, encoding="utf-8")
    (nd / f"{name}.txt").write_text(md, encoding="utf-8")

    pkg = out / a.date / "pilotone" / vid; pkg.mkdir(parents=True, exist_ok=True)
    for k, fn in (("fb", "fb.txt"), ("ig", "ig.txt"), ("th", "threads.txt")):
        (pkg / fn).write_text(copy[k], encoding="utf-8")
    stem = f"YTNotes_{vid}_{a.date}"
    cards = render_cards(meta, note, pkg, stem)
    now = datetime.now(TPE).isoformat(timespec="seconds")
    manifest = {"version": 1, "topic": f"yt-{vid}", "date": f"{a.date[:4]}-{a.date[4:6]}-{a.date[6:]}",
                "title": copy["fb"].splitlines()[0], "link": SITE_NOTE.format(vid=vid), "autoPublish": False, "verified": True,
                "platforms": {"fb": {"caption": "fb.txt", "images": [cards["fb"]]},
                              "ig": {"caption": "ig.txt", "images": [cards["ig"]]},
                              "threads": {"caption": "threads.txt", "images": [cards["ig"]]}},
                "producedBy": a.produced_by, "producedAt": now}
    (pkg / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    entry = {"id": vid, "title": meta.get("title"), "author": meta.get("author"), "channel_url": meta.get("channel_url"),
             "url": meta.get("url"), "published": meta.get("published"), "duration": dur_text(meta.get("duration_sec")),
             "language": meta.get("language"), "category": note.get("category") or "AI 應用",
             "headline": note.get("headline"), "summary": note.get("summary"), "cornell": note.get("cornell"),
             "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if meta.get("platform") == "youtube" else meta.get("thumbnail"),
             "note_file": f"notes/{name}.md", "added": a.date}
    (out / "index_entry.json").write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"note": f"notes/{name}.md", "package": f"{a.date}/pilotone/{vid}/", "cards": cards,
                      "threads_len": len(copy["th"]), "ig_len": len(copy["ig"])}, ensure_ascii=False))

if __name__ == "__main__":
    main()
