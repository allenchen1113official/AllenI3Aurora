#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_merged_notes.py — 「常聽 Podcast × 最新一集重點筆記」合併區塊產出器
（艾倫報報 Allen I³ Aurora · podcast-merged-notes skill）

把各集 Podcast 節目 JSON（每集一檔：show/title/date/duration/tone/url/
status/summary/cornell）與「常聽 Podcast」清單 shows.json 合併計算，
產出三個檔案（皆輸出到目前工作目錄，與任何 repo 解耦）：

  1. merged.json                    合併計算結果（機器可讀：排序、配對、最新標記）
  2. podcast_episodes.snippet.js    可貼回 kit.jsx `podcastEpisodes:` 的陣列片段
                                    （亦可逐筆貼進後台 Firestore aurora_podcast_episodes）
  3. merged_preview.html            Aurora 深色風格的合併區塊靜態預覽
                                    （各節目摘要卡＋可展開康乃爾筆記圖卡＋最新一集標記
                                     ＋無集數節目的精簡連結卡）

合併邏輯與前台 ui_kits/aurora/Dashboard.jsx 的 mergedPodcastList() 完全一致，
已經使用者驗收，照抄執行、不要重新設計：
  - 只納入已發布集數（無 status 或 status == "published"；draft 過濾）
  - 依集數 show 欄位分組，每個節目各取最新一集
    （日期數字化大者優先，同日比 sort 大者）
  - 常聽清單項目 ↔ 節目：以清單 title 破折號前段與 show 互含比對（不分大小寫）
  - 有集數者依日期新→舊排序在前，全站最新一集標記 is_latest
  - 常聽清單中無對應集數的節目退回精簡連結卡、殿後
  - 不在常聽清單、但有集數的節目（後台新增）也一併顯示

用法：
  python3 build_merged_notes.py --episodes <資料夾或多個json檔> [--shows shows.json] [--outdir 目錄]

僅用 Python 標準函式庫，無任何外部相依。
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

VALID_TONES = {"insight", "intelligence", "illumination"}

# 平台後綴（如「AI懶人報 | Podcast on Spotify」）：配對與顯示前一律先剝除，
# 避免使用者直接複製平台頁標題時配對不到、或卡片上出現冗長後綴。
PLATFORM_SUFFIX = re.compile(r"\s*\|\s*Podcast\s+on\s+.+$", re.IGNORECASE)


def clean_show_title(t):
    return PLATFORM_SUFFIX.sub("", str(t or "")).strip()


# ── 合併邏輯（與 Dashboard.jsx 一致，照抄、勿改） ──────────────────────────
def ep_date_num(s):
    d = re.sub(r"\D", "", str(s if s is not None else ""))
    return int(d) if d else 0


def ep_sort_key(e):
    """遞減排序用 key：日期大者在前，同日 sort 大者在前。"""
    try:
        sort = float(e.get("sort") or 0)
    except (TypeError, ValueError):
        sort = 0
    return (ep_date_num(e.get("date")), sort)


def is_published(e):
    st = e.get("status")
    return (not st) or st == "published"


def latest_episode_by_show(episodes):
    by_show = {}
    for e in episodes:
        if not isinstance(e, dict) or not is_published(e):
            continue
        key = str(e.get("show") or "").strip()
        cur = by_show.get(key)
        if cur is None or ep_sort_key(e) > ep_sort_key(cur):
            by_show[key] = e
    return by_show


def find_episode_for_show(p, by_show):
    head = re.split(r"—|-{2,}", clean_show_title((p or {}).get("title")))[0].strip().lower()
    if not head:
        return None
    for show, ep in by_show.items():
        s = str(show or "").lower()
        if s and (head in s or s in head):
            return ep
    return None


def merged_podcast_list(shows, episodes):
    by_show = latest_episode_by_show(episodes)
    used = set()
    items = []
    for p in shows or []:
        ep = find_episode_for_show(p, by_show)
        if ep is not None:
            used.add(id(ep))
        items.append({"p": p, "ep": ep})
    for ep in by_show.values():
        if id(ep) not in used:
            items.append({"p": None, "ep": ep})
    with_ep = sorted([x for x in items if x["ep"]], key=lambda x: ep_sort_key(x["ep"]), reverse=True)
    link_only = [x for x in items if not x["ep"]]
    merged = with_ep + link_only
    for i, x in enumerate(merged):
        x["is_latest"] = bool(x["ep"]) and i == 0
    return merged


# ── 輸入載入與檢核 ─────────────────────────────────────────────────────────
def load_episodes(paths):
    files = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            files += sorted(p.glob("*.json"))
        elif p.exists():
            files.append(p)
        else:
            sys.exit(f"[錯誤] 找不到輸入：{p}")
    eps, problems = [], []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            sys.exit(f"[錯誤] {f} 不是合法 JSON：{e}")
        for e in (data if isinstance(data, list) else [data]):
            if not isinstance(e, dict):
                problems.append(f"{f}: 內容不是物件，略過")
                continue
            e.setdefault("_src", f.name)
            eps.append(e)
    return eps, problems


def check_episode(e):
    """檢核單集欄位；回傳警告訊息清單（不中止，僅提醒）。"""
    warns = []
    src = e.get("_src", "?")
    if not str(e.get("show") or "").strip():
        warns.append(f"{src}: 缺 show（節目名）——將無法與常聽清單配對")
    if not str(e.get("date") or "").strip():
        warns.append(f"{src}: 缺 date——排序會退到最後")
    if e.get("tone") and e["tone"] not in VALID_TONES:
        warns.append(f"{src}: tone「{e['tone']}」不合法（僅 insight/intelligence/illumination），前台會退回 insight")
    c = e.get("cornell") or {}
    rows = c.get("rows") if isinstance(c, dict) else None
    if not (isinstance(rows, list) and any((r or {}).get("cue") or (r or {}).get("note") for r in rows)) and not (isinstance(c, dict) and c.get("summary")):
        warns.append(f"{src}: 無康乃爾筆記（cornell.rows / cornell.summary）——前台不會出現「康乃爾筆記圖卡」按鈕")
    if not str(e.get("summary") or "").strip():
        warns.append(f"{src}: 缺 summary（繁中摘要）——摘要卡會只剩標題")
    return warns


# ── 輸出 1：kit.jsx podcastEpisodes 陣列片段 ────────────────────────────────
def emit_snippet(merged, out):
    eps = []
    for i, x in enumerate(e for e in merged if e["ep"]):
        ep = {k: v for k, v in x["ep"].items() if not k.startswith("_")}
        ep["sort"] = i + 1  # 依合併順序重編，維持 kit.jsx 慣例
        ep.setdefault("status", "published")
        eps.append(ep)
    body = json.dumps(eps, ensure_ascii=False, indent=2)
    out.write_text(
        "// 可直接取代 ui_kits/aurora/kit.jsx 內 podcastEpisodes: [...] 的陣列值，\n"
        "// 或逐筆貼進後台 Firestore aurora_podcast_episodes（一集一份文件）。\n"
        "// JSON 即合法 JS 陣列字面值，貼上即可。\n"
        + body + "\n",
        encoding="utf-8",
    )
    return len(eps)


def emit_shows_snippet(shows, out):
    """常聽清單片段：title 剝除平台後綴後輸出，可貼回 kit.jsx podcasts: 的陣列值。"""
    rows = [{
        "sort": i + 1,
        "title": clean_show_title(p.get("title")),
        "meta": str(p.get("meta") or ""),
        "tone": p.get("tone") if p.get("tone") in VALID_TONES else "insight",
        "url": str(p.get("url") or ""),
    } for i, p in enumerate(shows or [])]
    out.write_text(
        "// 可直接取代 ui_kits/aurora/kit.jsx 內 podcasts: [...] 的陣列值（常聽 Podcast 清單），\n"
        "// 或逐筆貼進後台 Firestore aurora_podcasts。title 已剝除「| Podcast on …」平台後綴。\n"
        + json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(rows)


# ── 輸出 2：Aurora 風格靜態預覽 ─────────────────────────────────────────────
CSS = """
:root{--night-900:#070b14;--night-850:#0b1120;--night-800:#101a2e;--night-700:#1b2a45;
--border:#223252;--text-1:#eef3ff;--text-2:#b8c4de;--text-3:#7c8bab;
--insight:#ff5d7e;--intelligence:#4f8cff;--illumination:#ffc24b;
--insight-soft:rgba(255,93,126,.14);--intelligence-soft:rgba(79,140,255,.14);--illumination-soft:rgba(255,194,75,.16)}
*{box-sizing:border-box}body{margin:0;background:var(--night-900);color:var(--text-1);
font:14px/1.6 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;padding:32px 16px}
.wrap{max-width:520px;margin:0 auto}
.kicker{font-size:11px;letter-spacing:.12em;font-weight:800;color:var(--intelligence)}
h1{font-size:20px;margin:4px 0 18px}
.card{background:var(--night-850);border:1px solid var(--border);border-radius:16px;padding:18px;margin-bottom:12px}
.card.ep{border-left:3px solid var(--tone)}
.head{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.dot{width:40px;height:40px;border-radius:12px;background:var(--tone-soft);color:var(--tone);
display:grid;place-items:center;font-size:18px;flex:none}
.badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.badge{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--tone-soft);color:var(--tone)}
.badge.latest{background:var(--illumination-soft);color:var(--illumination)}
.meta{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--text-3)}
.title{font-weight:800;font-size:15px;margin-top:4px}
.summary{color:var(--text-2);font-size:13.5px;white-space:pre-wrap;margin:0 0 12px}
.btnrow{display:flex;gap:8px;flex-wrap:wrap}
a.btn,summary.btn{display:inline-block;font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:10px;
border:1px solid var(--border);color:var(--text-1);text-decoration:none;cursor:pointer;background:var(--night-800)}
details{margin-top:10px}details>summary{list-style:none}details>summary::-webkit-details-marker{display:none}
.cornell{border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-top:10px;background:var(--night-850)}
.c-head{padding:14px 18px;background:linear-gradient(135deg,var(--intelligence-soft),transparent);border-bottom:1px solid var(--border)}
.c-brand{display:flex;justify-content:space-between;gap:8px;font-size:11px}
.c-brand b{color:var(--intelligence);letter-spacing:.1em}.c-brand span{font-family:ui-monospace,monospace;color:var(--text-3)}
.c-title{font-weight:800;font-size:14.5px;margin-top:6px}
.c-cols{display:grid;grid-template-columns:.9fr 1.8fr;gap:10px;padding:8px 18px;font-size:11px;
letter-spacing:.08em;font-weight:700;color:var(--text-3);border-bottom:1px solid var(--border)}
.c-row{display:grid;grid-template-columns:.9fr 1.8fr;gap:10px;padding:10px 18px;border-bottom:1px solid var(--night-700)}
.c-row:last-of-type{border-bottom:none}
.cue{font-weight:800;font-size:13px;color:var(--tone)}
.note{color:var(--text-2);font-size:13px;white-space:pre-wrap}
.c-sum{padding:12px 18px;border-top:1px solid var(--border);background:var(--night-900)}
.c-sum b{display:block;font-size:11px;letter-spacing:.08em;color:var(--text-3);margin-bottom:6px}
.c-sum div{font-size:13px;white-space:pre-wrap}
.linkcard .row{display:flex;gap:13px;align-items:center}
.linkcard .t{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.linkcard .m{color:var(--text-3);font-size:12px}
.foot{color:var(--text-3);font-size:11.5px;text-align:center;margin-top:20px}
"""

TONE_ICON = "\U0001F3A7"  # 🎧


def tone_vars(tone):
    t = tone if tone in VALID_TONES else "insight"
    return f"--tone:var(--{t});--tone-soft:var(--{t}-soft)"


def render_episode_card(x):
    ep, esc = x["ep"], html.escape
    tone = tone_vars(ep.get("tone"))
    meta = " · ".join(filter(None, [str(ep.get("date") or ""), str(ep.get("duration") or "")]))
    latest = '<span class="badge latest">● 最新一集</span>' if x["is_latest"] else ""
    summary = f'<p class="summary">{esc(str(ep.get("summary") or ""))}</p>' if ep.get("summary") else ""
    listen = f'<a class="btn" href="{esc(str(ep["url"]))}" target="_blank" rel="noopener">前往收聽 ↗</a>' if ep.get("url") else ""
    c = ep.get("cornell") or {}
    rows = [r for r in (c.get("rows") or []) if isinstance(r, dict) and (r.get("cue") or r.get("note"))]
    csum = c.get("summary") or ep.get("summary") or ""
    cornell = ""
    if rows or csum:
        body = ""
        if rows:
            body += '<div class="c-cols"><span>線索 CUES</span><span>筆記 NOTES</span></div>'
            body += "".join(
                f'<div class="c-row"><span class="cue">{esc(str(r.get("cue") or ""))}</span>'
                f'<span class="note">{esc(str(r.get("note") or ""))}</span></div>' for r in rows)
        if csum:
            body += f'<div class="c-sum"><b>總結 SUMMARY</b><div>{esc(str(csum))}</div></div>'
        title = esc(" — ".join(filter(None, [str(ep.get("show") or ""), str(ep.get("title") or "")])))
        cornell = (
            f'<details><summary class="btn">康乃爾筆記圖卡 ▾</summary><div class="cornell">'
            f'<div class="c-head"><div class="c-brand"><b>CORNELL NOTES · 康乃爾筆記</b>'
            f'<span>艾倫報報 · Allen I³ Aurora</span></div>'
            f'<div class="c-title">{title}</div><div class="meta">{esc(meta)}</div></div>{body}</div></details>')
    return (
        f'<div class="card ep" style="{tone}"><div class="head"><span class="dot">{TONE_ICON}</span>'
        f'<div><div class="badges"><span class="badge">{esc(str(ep.get("show") or "Podcast"))}</span>{latest}'
        f'<span class="meta">{esc(meta)}</span></div>'
        f'<div class="title">{esc(str(ep.get("title") or ""))}</div></div></div>'
        f'{summary}<div class="btnrow">{listen}</div>{cornell}</div>')


def render_link_card(p):
    esc = html.escape
    tone = tone_vars((p or {}).get("tone"))
    url = str((p or {}).get("url") or "")
    inner = (
        f'<div class="row"><span class="dot" style="{tone}">{TONE_ICON}</span>'
        f'<div style="flex:1;min-width:0"><div class="t">{esc(clean_show_title(p.get("title")))}</div>'
        f'<div class="m">{esc(str(p.get("meta") or ""))}</div></div><span>↗</span></div>')
    if url:
        inner = f'<a href="{esc(url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">{inner}</a>'
    return f'<div class="card linkcard" style="{tone}">{inner}</div>'


def emit_preview(merged, out):
    cards = "".join(render_episode_card(x) if x["ep"] else render_link_card(x["p"]) for x in merged)
    out.write_text(
        "<!doctype html><html lang='zh-Hant'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>常聽 Podcast · 重點筆記 — 合併區塊預覽</title>"
        f"<style>{CSS}</style></head><body><div class='wrap'>"
        "<div class='kicker'>PODCAST · 最新一集</div><h1>常聽 Podcast · 重點筆記</h1>"
        f"{cards}<div class='foot'>艾倫報報 · Allen I³ Aurora — podcast-merged-notes 預覽（點「康乃爾筆記圖卡」可展開）</div>"
        "</div></body></html>", encoding="utf-8")


# ── 主流程 ─────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="產出「常聽 Podcast × 最新一集重點筆記」合併區塊")
    ap.add_argument("--episodes", nargs="+", required=True, help="集數 JSON 檔或資料夾（可多個）")
    ap.add_argument("--shows", help="常聽 Podcast 清單 shows.json（省略則只顯示有集數的節目）")
    ap.add_argument("--outdir", default=".", help="輸出目錄（預設目前目錄）")
    a = ap.parse_args()

    episodes, problems = load_episodes(a.episodes)
    shows = []
    if a.shows:
        shows = json.loads(Path(a.shows).read_text(encoding="utf-8"))
        if not isinstance(shows, list):
            sys.exit("[錯誤] shows.json 必須是陣列")

    for e in episodes:
        problems += check_episode(e)
    for w in problems:
        print(f"[提醒] {w}")

    merged = merged_podcast_list(shows, episodes)
    if not merged:
        sys.exit("[錯誤] 沒有任何可顯示的節目（集數皆為草稿？常聽清單為空？）")

    outdir = Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    result = [{
        "kind": "episode" if x["ep"] else "link",
        "is_latest": x["is_latest"],
        "show": (x["ep"] or {}).get("show") or clean_show_title((x["p"] or {}).get("title")),
        "title": (x["ep"] or {}).get("title"),
        "date": (x["ep"] or {}).get("date"),
        "url": (x["ep"] or x["p"] or {}).get("url"),
        "has_cornell": bool(x["ep"] and (x["ep"].get("cornell") or {}).get("rows")),
    } for x in merged]
    (outdir / "merged.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    n = emit_snippet(merged, outdir / "podcast_episodes.snippet.js")
    emit_preview(merged, outdir / "merged_preview.html")
    ns = emit_shows_snippet(shows, outdir / "podcasts.snippet.js") if shows else 0

    # 未提供筆記及摘要的常聽節目：以連結卡呈現屬正常設計，用 [資訊] 說明而非警告。
    link_shows = [x["show"] for x in result if x["kind"] == "link"]
    if link_shows:
        print(f"\n[資訊] 下列 {len(link_shows)} 個節目未提供筆記及摘要，以連結卡呈現（屬正常；"
              "之後補上該節目的集數 JSON 重跑，即自動升級為摘要卡）：")
        for s in link_shows:
            print(f"  · {s}")

    print(f"\n合併結果：共 {len(merged)} 張卡（摘要卡 {n} 張、連結卡 {len(merged) - n} 張）")
    for i, x in enumerate(result):
        mark = " ★最新一集" if x["is_latest"] else ""
        kind = "摘要卡" if x["kind"] == "episode" else "連結卡"
        print(f"  {i + 1}. [{kind}] {x['show']}" + (f" — {x['title']} ({x['date']})" if x["kind"] == "episode" else "") + mark)
    outs = ["merged.json", "podcast_episodes.snippet.js", "merged_preview.html"] + (["podcasts.snippet.js"] if ns else [])
    print("\n輸出：" + "｜".join(str(outdir / f) for f in outs))


if __name__ == "__main__":
    main()
