#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
艾倫報報 · Podcast 本機轉錄工具（OpenAI Whisper）
=====================================================================
在本機以 Whisper 模型將 Podcast 音檔高效轉為準確的中文逐字稿，並輸出：

  <音檔名>.txt        逐字稿全文（繁體中文，可直接貼入後台「逐字稿」欄）
  <音檔名>.srt        字幕檔（--srt 時輸出，含時間軸）
  <音檔名>.notes.md   筆記草稿範本（繁中摘要＋康乃爾筆記骨架，供後台編修）

轉錄引擎優先使用 faster-whisper（CTranslate2 重新實作，同精度下約快 4 倍、
記憶體減半），未安裝時退回官方 openai-whisper。繁體輸出策略：
  1) 轉錄時以繁體 initial_prompt 引導模型輸出繁體；
  2) 若已安裝 OpenCC，再以 s2twp（簡→台灣正體＋慣用詞）保底轉換。

安裝（擇一引擎；ffmpeg 為必要相依）：
  pip install faster-whisper opencc            # 建議
  pip install openai-whisper opencc            # 或官方版
用法示例：
  python scripts/podcast/transcribe.py ep123.mp3
  python scripts/podcast/transcribe.py ep123.mp3 --model large-v3 --srt
  python scripts/podcast/transcribe.py *.mp3 --output-dir transcripts
詳見 docs/PODCAST_WHISPER_SOP.md。
"""

import argparse
import sys
import time
from pathlib import Path

# 引導模型輸出台灣繁體中文的提示句（Whisper 會延續 prompt 的字形與語域）。
INITIAL_PROMPT = "以下是台灣的 Podcast 節目內容，請以繁體中文逐字記錄。"


def fmt_ts(sec: float) -> str:
    """秒數 → SRT 時間格式 00:00:00,000"""
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def load_converter(enabled: bool):
    """OpenCC s2twp 轉換器；未安裝或停用時回傳恆等函式。"""
    if not enabled:
        return lambda t: t
    try:
        from opencc import OpenCC
        cc = OpenCC("s2twp")
        return cc.convert
    except ImportError:
        print("※ 未安裝 OpenCC（pip install opencc），跳過繁體保底轉換；"
              "Whisper 已以繁體 prompt 引導，多數情況仍為繁體輸出。")
        return lambda t: t


def transcribe_faster_whisper(audio: Path, args):
    """faster-whisper 引擎：回傳 [(start, end, text), ...]；未安裝回傳 None。"""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    print(f"引擎：faster-whisper · 模型 {args.model} · device={args.device}")
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        str(audio),
        language=args.language,
        initial_prompt=INITIAL_PROMPT,
        beam_size=5,
        vad_filter=True,  # 跳過長靜音（片頭曲／廣告空檔），顯著加速
    )
    print(f"偵測語言：{info.language}（機率 {info.language_probability:.2f}）· 音長 {info.duration:.0f}s")
    return [(s.start, s.end, s.text.strip()) for s in segments]


def transcribe_openai_whisper(audio: Path, args):
    """官方 openai-whisper 引擎：回傳 [(start, end, text), ...]。"""
    try:
        import whisper
    except ImportError:
        sys.exit("錯誤：未安裝任何轉錄引擎。請先執行\n"
                 "  pip install faster-whisper   （建議，速度快、省記憶體）\n"
                 "或 pip install openai-whisper")
    print(f"引擎：openai-whisper · 模型 {args.model}")
    model = whisper.load_model(args.model)
    result = model.transcribe(
        str(audio),
        language=args.language,
        initial_prompt=INITIAL_PROMPT,
        verbose=False,
    )
    return [(s["start"], s["end"], s["text"].strip()) for s in result["segments"]]


NOTES_TEMPLATE = """# {stem} · 節目筆記草稿

> 由 transcribe.py 產生的骨架。填妥後貼入後台「Podcast 節目」對應欄位，
> 或交給 AI 依逐字稿（{stem}.txt）代為整理，再人工校對。

## 繁體中文摘要（summary，150–250 字）

（概括本集：主題、論點、結論與可行動的啟發）

## 康乃爾筆記（cornell.rows，左欄線索／右欄筆記）

| 線索 CUE | 筆記 NOTE |
| --- | --- |
|  |  |
|  |  |
|  |  |

## 底部總結（cornell.summary，2–3 句）

（收斂整集：核心結論與下一步行動）
"""


def main():
    ap = argparse.ArgumentParser(description="以本機 Whisper 將 Podcast 音檔轉為繁體中文逐字稿")
    ap.add_argument("audio", nargs="+", help="音檔路徑（mp3/m4a/wav/…，可多檔）")
    ap.add_argument("--model", default="medium",
                    help="模型大小：tiny/base/small/medium/large-v3（預設 medium；中文建議 medium 以上）")
    ap.add_argument("--language", default="zh", help="語言代碼（預設 zh）")
    ap.add_argument("--device", default="auto", help="faster-whisper 裝置：auto/cpu/cuda（預設 auto）")
    ap.add_argument("--compute-type", default="auto",
                    help="faster-whisper 精度：auto/int8/float16…（CPU 建議 int8）")
    ap.add_argument("--output-dir", default=None, help="輸出目錄（預設與音檔同層）")
    ap.add_argument("--srt", action="store_true", help="另輸出 .srt 字幕檔（含時間軸）")
    ap.add_argument("--no-traditional", action="store_true", help="停用 OpenCC 繁體保底轉換")
    ap.add_argument("--no-notes", action="store_true", help="不產生 .notes.md 筆記草稿範本")
    args = ap.parse_args()

    to_trad = load_converter(not args.no_traditional)

    for path in args.audio:
        audio = Path(path)
        if not audio.is_file():
            print(f"✗ 找不到音檔：{audio}", file=sys.stderr)
            continue
        out_dir = Path(args.output_dir) if args.output_dir else audio.parent
        out_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n=== 轉錄 {audio.name} ===")
        t0 = time.time()
        segs = transcribe_faster_whisper(audio, args)
        if segs is None:
            segs = transcribe_openai_whisper(audio, args)
        segs = [(a, b, to_trad(t)) for a, b, t in segs if t]
        elapsed = time.time() - t0

        stem = audio.stem
        txt_path = out_dir / f"{stem}.txt"
        text = "\n".join(t for _, _, t in segs)
        txt_path.write_text(text + "\n", encoding="utf-8")
        print(f"✓ 逐字稿：{txt_path}（{len(text)} 字，耗時 {elapsed:.0f}s）")

        if args.srt:
            srt_path = out_dir / f"{stem}.srt"
            lines = []
            for i, (a, b, t) in enumerate(segs, 1):
                lines += [str(i), f"{fmt_ts(a)} --> {fmt_ts(b)}", t, ""]
            srt_path.write_text("\n".join(lines), encoding="utf-8")
            print(f"✓ 字幕：{srt_path}")

        if not args.no_notes:
            notes_path = out_dir / f"{stem}.notes.md"
            if notes_path.exists():
                print(f"· 筆記草稿已存在，略過：{notes_path}")
            else:
                notes_path.write_text(NOTES_TEMPLATE.format(stem=stem), encoding="utf-8")
                print(f"✓ 筆記草稿範本：{notes_path}")

    print("\n完成。下一步：後台「Podcast 節目」新增一集 → 貼上逐字稿 → 編修摘要與康乃爾筆記 → 發布。")


if __name__ == "__main__":
    main()
