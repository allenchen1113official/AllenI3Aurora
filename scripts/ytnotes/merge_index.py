#!/usr/bin/env python3
"""
把 make_package.py 產生的 index_entry.json 併入筆記索引（照抄執行）
  python3 merge_index.py <index.json> <索引.md> <index_entry.json> [<index_entry.json> …]
index.json：{"updatedAt": ISO, "items": [...]}，依 added／published 新到舊、同 id 覆蓋、最多 300 筆
（首頁「常看 YouTube · 重點筆記」由 ytnotes-update.yml 讀這份）。
索引.md：一支一行「- 發布日期｜作者｜[[筆記檔名]]｜原片網址」。
"""
import json, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

def main():
    idx_p, md_p, entries = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    data = json.loads(idx_p.read_text(encoding="utf-8")) if idx_p.exists() else {"items": []}
    items = {it["id"]: it for it in data.get("items", [])}
    for e in entries:
        it = json.loads(Path(e).read_text(encoding="utf-8"))
        items[it["id"]] = it
    lst = sorted(items.values(), key=lambda x: (x.get("added") or "", x.get("published") or ""), reverse=True)[:300]
    data = {"updatedAt": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"), "items": lst}
    idx_p.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = ["# 常看 YouTube 重點筆記 · 索引", "", "（一支一行，新到舊；由 merge_index.py 產生）", ""]
    for it in lst:
        stem = Path(it.get("note_file", "")).stem
        lines.append(f"- {it.get('published','')}｜{it.get('author','')}｜[[{stem}]]｜{it.get('url','')}")
    md_p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"索引共 {len(lst)} 筆")

if __name__ == "__main__":
    main()
