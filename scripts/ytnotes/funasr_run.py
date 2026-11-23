#!/usr/bin/env python3
"""
FunASR 中文轉錄（在 ~/.ytnotes/funasr-venv 的 Python 3.11 執行，由 ytnotes.py 呼叫）
  python funasr_run.py <audio.wav> <out.json> [--hotwords 熱詞.txt] [--replace 替換規則.tsv]
模型：paraformer-zh（SeACo，支援熱詞）＋ fsmn-vad 斷句 ＋ ct-punc 標點 ＋ cam++ 說話者辨識；
轉完套替換規則、OpenCC s2twp（台灣繁體用語）。輸出 [{start, end, text, spk}]（秒）。
"""
import json, sys
from pathlib import Path

def arg(name):
    a = sys.argv
    return a[a.index(name) + 1] if name in a else None

def load_hot(p):
    if not p or not Path(p).exists():
        return ""
    words = [l.split("#")[0].strip() for l in Path(p).read_text(encoding="utf-8").splitlines()]
    return " ".join(w for w in words if w)

def load_rep(p):
    out = []
    if p and Path(p).exists():
        for l in Path(p).read_text(encoding="utf-8").splitlines():
            if l.strip() and not l.startswith("#") and "\t" in l:
                a, b = l.split("\t", 1)
                if a.strip():
                    out.append((a.strip(), b.strip()))
    return out

def main():
    wav, out = sys.argv[1], sys.argv[2]
    from funasr import AutoModel
    import opencc
    cc = opencc.OpenCC("s2twp")
    model = AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", spk_model="cam++",
                      disable_update=True, log_level="ERROR")
    hot = load_hot(arg("--hotwords"))
    kw = {"batch_size_s": 300}
    if hot:
        kw["hotword"] = hot
    res = model.generate(input=wav, **kw)
    reps = load_rep(arg("--replace"))
    segs = []
    for r in res:
        for s in r.get("sentence_info") or [{"start": 0, "end": 0, "text": r.get("text", ""), "spk": None}]:
            t = cc.convert(s.get("text") or "")
            for a, b in reps:            # 替換規則在繁體上套用（詞庫以台灣繁體撰寫）
                t = t.replace(a, b)
            segs.append({"start": round((s.get("start") or 0) / 1000, 2), "end": round((s.get("end") or 0) / 1000, 2),
                         "text": t, "spk": s.get("spk")})
    Path(out).write_text(json.dumps(segs, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    main()
