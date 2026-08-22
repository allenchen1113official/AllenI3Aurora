#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
艾倫報報 · Podcast 康乃爾筆記社群圖卡（比照台股熱力圖圖卡做法）
=====================================================================
把一集 Podcast 的康乃爾重點筆記渲染成可直接發社群的圖檔：

  Facebook  1200 x 630   →  assets/podcast/podcast-cornell-fb.png
  Instagram 1080 x 1080  →  assets/podcast/podcast-cornell-ig.png

版面採網站前台同款深色極光風：頁首（節目／集數／日期）→ 康乃爾兩欄
（左欄線索、右欄筆記）→ 底部總結，右下角固定附「艾倫報報 ALLEN I³ AURORA」
品牌圖卡（與熱力圖圖卡同一組品牌鎖定版式）。

資料來源（擇一）：
  --episode ep.json   後台同構的一集 JSON：
                      {show,title,date,duration,summary,cornell:{rows:[{cue,note}],summary}}
  （不帶參數）        內建示範集（與 kit.jsx 預設一致），供試跑與驗版面

用法：
  python scripts/podcast/render_social_card.py                    # 示範集，FB+IG
  python scripts/podcast/render_social_card.py --episode ep.json
  python scripts/podcast/render_social_card.py --formats fb --stem ep123

中文字型：依序尋找系統 Noto Sans CJK／PingFang／文泉驛；都沒有時自動從
fonts.gstatic.com 下載 Noto Sans TC 到 scripts/podcast/.fonts/（已 gitignore）。
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
FONT_CACHE = HERE / ".fonts"

# ---------- 色票（styles.css 深色極光風） ----------
BG = (7, 11, 20)            # --night-900
PANEL = (13, 19, 31)        # --night-850
PANEL2 = (18, 26, 41)       # --night-800
BORDER = (44, 56, 76)
TEXT1 = (234, 242, 248)     # 主文字
TEXT2 = (199, 209, 220)     # 次文字
TEXT3 = (137, 148, 160)     # 註記
MINT = (126, 217, 168)      # 極光綠（insight）
SKY = (99, 172, 226)        # 極光藍（intelligence）
GOLD = (255, 200, 87)       # 極光金（illumination）
TONE_COLORS = {"insight": MINT, "intelligence": SKY, "illumination": GOLD}

GSTATIC = {
    "NotoSansTC-Regular.ttf": "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf",
    "NotoSansTC-Bold.ttf": "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf",
    "Poppins-Medium.ttf": "https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9V1s.ttf",
    "Poppins-Bold.ttf": "https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLCz7V1s.ttf",
}


def _first_existing(paths):
    for p in paths:
        if p and Path(p).is_file():
            return str(p)
    return None


def _download(name):
    FONT_CACHE.mkdir(parents=True, exist_ok=True)
    dst = FONT_CACHE / name
    if not dst.is_file():
        print(f"下載字型 {name} …")
        urllib.request.urlretrieve(GSTATIC[name], dst)
    return str(dst)


def resolve_fonts():
    """回傳 (cjk_regular, cjk_bold, latin_medium, latin_bold) 字型檔路徑。"""
    cjk_reg = _first_existing([
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        str(FONT_CACHE / "NotoSansTC-Regular.ttf"),
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ])
    cjk_bold = _first_existing([
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        str(FONT_CACHE / "NotoSansTC-Bold.ttf"),
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ])
    try:
        if not cjk_reg:
            cjk_reg = _download("NotoSansTC-Regular.ttf")
        if not cjk_bold:
            cjk_bold = _download("NotoSansTC-Bold.ttf")
    except Exception as ex:  # 無網路時最後退回文泉驛
        print("※ 字型下載失敗：", ex)
    if not (cjk_reg and cjk_bold):
        sys.exit("錯誤：找不到可用的中文字型（Noto CJK / PingFang / 文泉驛皆無，下載亦失敗）。")

    latin_med = _first_existing([
        "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf",
        str(FONT_CACHE / "Poppins-Medium.ttf"),
    ])
    latin_bold = _first_existing([
        "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
        str(FONT_CACHE / "Poppins-Bold.ttf"),
    ])
    try:
        if not latin_med:
            latin_med = _download("Poppins-Medium.ttf")
        if not latin_bold:
            latin_bold = _download("Poppins-Bold.ttf")
    except Exception:
        latin_med = latin_med or cjk_reg
        latin_bold = latin_bold or cjk_bold
    return cjk_reg, cjk_bold, latin_med, latin_bold


CJK_REG, CJK_BOLD, LATIN_MED, LATIN_BOLD = resolve_fonts()
_FONTS = {}


def F(kind, size):
    key = (kind, size)
    if key not in _FONTS:
        path = {"reg": CJK_REG, "bold": CJK_BOLD, "lat": LATIN_MED, "latb": LATIN_BOLD}[kind]
        _FONTS[key] = ImageFont.truetype(path, size)
    return _FONTS[key]


# ---------- 品牌鎖定版式（與熱力圖圖卡同款；文字色改深底可讀） ----------
def _rounded_mask(size, radius, ss=4):
    m = Image.new("L", (size[0] * ss, size[1] * ss), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size[0] * ss - 1, size[1] * ss - 1), radius=radius * ss, fill=255)
    return m.resize(size, Image.LANCZOS)


def _gradient(size, c0, c1):
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2.0
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3)) + (255,)
    return img


def make_brand_lockup(icon_size=64):
    """漸層圖示（AI³A）＋ 艾倫報報 / ALLEN I³ AURORA 文字組合，回傳 RGBA 圖。"""
    icon = Image.new("RGBA", (icon_size, icon_size), (0, 0, 0, 0))
    icon.paste(_gradient((icon_size, icon_size), MINT, SKY), (0, 0),
               _rounded_mask((icon_size, icon_size), int(icon_size * 0.24)))
    d = ImageDraw.Draw(icon)
    dark = (13, 46, 48)
    f_main = F("latb", int(icon_size * 0.40))
    f_sup = F("latb", int(icon_size * 0.22))
    w1 = d.textlength("AI", font=f_main)
    ws = d.textlength("3", font=f_sup)
    w2 = d.textlength("A", font=f_main)
    x = (icon_size - (w1 + ws * 0.78 + w2)) / 2
    bb = f_main.getbbox("AI")
    y = icon_size * 0.5 - (bb[3] - bb[1]) / 2 - bb[1]
    d.text((x, y), "AI", font=f_main, fill=dark)
    d.text((x + w1, y - f_sup.getbbox("3")[3] * 0.30), "3", font=f_sup, fill=dark)
    d.text((x + w1 + ws * 0.78, y), "A", font=f_main, fill=dark)

    cjk_size = int(icon_size * 0.42)
    eng_size = max(10, int(icon_size * 0.155))
    f_cjk = F("bold", cjk_size)
    f_eng = F("lat", eng_size)
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    cjk_text, eng_text = "艾倫報報", "ALLEN I³ AURORA"
    spacing = int(eng_size * 0.24)
    eng_w = sum(tmp.textlength(c, font=f_eng) + spacing for c in eng_text) - spacing
    text_w = int(max(tmp.textlength(cjk_text, font=f_cjk), eng_w))
    pad = int(icon_size * 0.20)
    W, H = icon_size + pad + text_w + 2, icon_size
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(icon, (0, 0), icon)
    d2 = ImageDraw.Draw(out)
    block_h = cjk_size * 1.08 + eng_size * 1.25
    ty = (H - block_h) / 2 - cjk_size * 0.12
    d2.text((icon_size + pad, ty), cjk_text, font=f_cjk, fill=TEXT1)
    cx = icon_size + pad
    ey = ty + cjk_size * 1.18
    for ch in eng_text:
        d2.text((cx, ey), ch, font=f_eng, fill=TEXT3)
        cx += tmp.textlength(ch, font=f_eng) + spacing
    return out


# ---------- 文字換行／截斷 ----------
def wrap_text(draw, text, font, max_width):
    """CJK 逐字換行（英數連續字串不拆），回傳行列表。"""
    lines, cur = [], ""
    token = ""
    def flush_token():
        nonlocal cur, token
        if not token:
            return
        if draw.textlength(cur + token, font=font) <= max_width:
            cur += token
        else:
            if cur:
                lines.append(cur)
            cur = token
        token = ""
    for ch in str(text).replace("\r", ""):
        if ch == "\n":
            flush_token()
            lines.append(cur)
            cur = ""
            continue
        if ch.isascii() and not ch.isspace():
            token += ch
            continue
        flush_token()
        if ch.isspace():
            ch = " " if cur else ""
        if not ch:
            continue
        if draw.textlength(cur + ch, font=font) <= max_width:
            cur += ch
        elif ch in "。，、；：！？）」』…％":
            cur += ch  # 避頭點：收尾標點不落單成行，允許微幅貼邊
        else:
            lines.append(cur)
            cur = ch.strip() or ""
    flush_token()
    if cur:
        lines.append(cur)
    return [l for l in lines if l != ""] or [""]


def clamp_lines(draw, lines, font, max_width, max_lines):
    if len(lines) <= max_lines:
        return lines
    kept = lines[:max_lines]
    last = kept[-1]
    while last and draw.textlength(last + "…", font=font) > max_width:
        last = last[:-1]
    kept[-1] = last + "…"
    return kept


# ---------- 圖卡渲染 ----------
def render_card(ep, size, out_path):
    W, H = size
    is_ig = H > 800
    img = Image.new("RGB", (W, H), BG)

    # 頂部極光光暈（低調、不搶內容）
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-W * 0.25, -H * 0.45, W * 0.55, H * 0.18), fill=(16, 44, 38))
    gd.ellipse((W * 0.45, -H * 0.5, W * 1.25, H * 0.12), fill=(15, 32, 52))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(int(H * 0.09))), 0.9)
    d = ImageDraw.Draw(img)

    M = int(W * 0.045)                       # 版面邊距
    tone = TONE_COLORS.get(ep.get("tone"), MINT)

    # --- 頁首 ---
    y = M
    f_kicker = F("bold", int(H * (0.020 if is_ig else 0.030)))
    d.text((M, y), "CORNELL NOTES · 康乃爾筆記", font=f_kicker, fill=tone)
    meta = " · ".join(x for x in [ep.get("date"), ep.get("duration")] if x)
    if meta:
        f_meta = F("reg", int(H * (0.018 if is_ig else 0.027)))
        d.text((W - M - d.textlength(meta, font=f_meta), y + f_kicker.size * 0.08), meta, font=f_meta, fill=TEXT3)
    y += int(f_kicker.size * 1.7)

    title = (ep.get("show") or "")
    if title and ep.get("title"):
        title += " — "
    title += ep.get("title") or ""
    f_title = F("bold", int(H * (0.034 if is_ig else 0.055)))
    for line in clamp_lines(d, wrap_text(d, title, f_title, W - 2 * M), f_title, W - 2 * M, 2):
        d.text((M, y), line, font=f_title, fill=TEXT1)
        y += int(f_title.size * 1.28)
    y += int(H * 0.012)
    d.line((M, y, W - M, y), fill=BORDER, width=2)
    y += int(H * 0.022)

    # --- 底部先保留：總結面板 + 品牌列 ---
    f_sum_lb = F("bold", int(H * (0.016 if is_ig else 0.024)))
    f_sum = F("reg", int(H * (0.021 if is_ig else 0.030)))
    summary = (ep.get("cornell") or {}).get("summary") or ep.get("summary") or ""
    sum_lines = clamp_lines(d, wrap_text(d, summary, f_sum, W - 2 * M - int(W * 0.04)),
                            f_sum, W - 2 * M - int(W * 0.04), 3 if is_ig else 2) if summary else []
    brand = make_brand_lockup(int(H * (0.052 if is_ig else 0.080)))
    brand_h = brand.size[1] + int(H * 0.028)
    sum_h = (int(f_sum_lb.size * 1.6) + len(sum_lines) * int(f_sum.size * 1.5) + int(H * 0.035)) if sum_lines else 0
    body_bottom = H - M - brand_h - sum_h

    # --- 康乃爾兩欄 ---
    cue_w = int((W - 2 * M) * 0.26)
    note_x = M + cue_w + int(W * 0.025)
    note_w = W - M - note_x
    f_col = F("bold", int(H * (0.014 if is_ig else 0.021)))
    d.text((M, y), "線索 CUES", font=f_col, fill=TEXT3)
    d.text((note_x, y), "筆記 NOTES", font=f_col, fill=TEXT3)
    y += int(f_col.size * 1.9)

    f_cue = F("bold", int(H * (0.023 if is_ig else 0.034)))
    f_note = F("reg", int(H * (0.021 if is_ig else 0.031)))
    rows = [r for r in ((ep.get("cornell") or {}).get("rows") or []) if r.get("cue") or r.get("note")]
    max_note_lines = 3 if is_ig else 2
    # 先量測每列高度，決定可容納的列數，再把剩餘空間均分為行距（版面不留大片空白）
    blocks = []
    fit_y = y
    for r in rows:
        cue_lines = clamp_lines(d, wrap_text(d, r.get("cue", ""), f_cue, cue_w), f_cue, cue_w, 2)
        note_lines = clamp_lines(d, wrap_text(d, r.get("note", ""), f_note, note_w), f_note, note_w, max_note_lines)
        row_h = max(len(cue_lines) * int(f_cue.size * 1.4), len(note_lines) * int(f_note.size * 1.5)) + int(H * 0.020)
        if fit_y + row_h > body_bottom:
            break
        blocks.append((cue_lines, note_lines, row_h))
        fit_y += row_h
    drawn = len(blocks)
    extra = 0
    if drawn:
        extra = min(int((body_bottom - fit_y) / (drawn + 1)), int(H * (0.055 if is_ig else 0.030)))
    for i, (cue_lines, note_lines, row_h) in enumerate(blocks):
        ly = y
        for line in cue_lines:
            d.text((M, ly), line, font=f_cue, fill=tone)
            ly += int(f_cue.size * 1.4)
        ly = y
        for line in note_lines:
            d.text((note_x, ly), line, font=f_note, fill=TEXT2)
            ly += int(f_note.size * 1.5)
        y += row_h + extra
        if i < drawn - 1:
            d.line((M, y - int(H * 0.010) - extra // 2, W - M, y - int(H * 0.010) - extra // 2), fill=(30, 40, 56), width=1)
    if drawn < len(rows):
        d.text((M, y), f"…及另外 {len(rows) - drawn} 個重點（完整筆記見網站）",
               font=F("reg", int(H * (0.016 if is_ig else 0.024))), fill=TEXT3)

    # --- 總結面板 ---
    if sum_lines:
        sy = H - M - brand_h - sum_h + int(H * 0.008)
        pad = int(W * 0.02)
        d.rounded_rectangle((M, sy, W - M, sy + sum_h - int(H * 0.012)), radius=int(H * 0.018),
                            fill=PANEL, outline=BORDER, width=2)
        d.rectangle((M, sy + int(H * 0.014), M + 5, sy + sum_h - int(H * 0.026)), fill=tone)
        ty = sy + int(H * 0.012)
        d.text((M + pad, ty), "總結 SUMMARY", font=f_sum_lb, fill=tone)
        ty += int(f_sum_lb.size * 1.6)
        for line in sum_lines:
            d.text((M + pad, ty), line, font=f_sum, fill=TEXT1)
            ty += int(f_sum.size * 1.5)

    # --- 品牌列 ---
    by = H - M - brand.size[1]
    img.paste(brand, (W - M - brand.size[0], by), brand)
    f_site = F("reg", int(H * (0.015 if is_ig else 0.022)))
    d.text((M, by + (brand.size[1] - f_site.size) // 2),
           "逐字稿 · 摘要 · 康乃爾筆記｜allenchen1113official.github.io/AllenI3Aurora",
           font=f_site, fill=TEXT3)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"✓ {out_path}（{W}x{H}）")


SAMPLE = {
    "show": "股癌 Gooaye", "title": "EP.整理盤心法", "date": "2026.08.21", "duration": "58m",
    "tone": "insight",
    "summary": "本集聚焦整理盤的操作心法：指數區間震盪時，重點不是預測方向，而是控制部位與等待訊號。",
    "cornell": {
        "rows": [
            {"cue": "整理盤定義", "note": "指數量縮、區間震盪，多空皆難有趨勢行情；勝率低、盈虧比差，操作應降頻。"},
            {"cue": "部位控制", "note": "資金分批進出、保留現金水位；不重倉猜底摸頭，等突破或帶量表態再加碼。"},
            {"cue": "AI 供應鏈", "note": "近期修正屬籌碼換手、非基本面轉壞；留意法人回補與月營收確認趨勢。"},
            {"cue": "心態提醒", "note": "無聊的盤做無聊的事：檢視持股邏輯、更新觀察清單，勝過頻繁交易。"},
        ],
        "summary": "整理盤的核心是「等」：控制部位、留住現金、降低交易頻率，把力氣花在檢視邏輯與觀察清單上，待趨勢表態再出手。",
    },
}

SIZES = {"fb": (1200, 630), "ig": (1080, 1080)}


def main():
    ap = argparse.ArgumentParser(description="Podcast 康乃爾筆記 → FB/IG 社群圖卡")
    ap.add_argument("--episode", help="一集 JSON（後台欄位同構）；省略則用內建示範集")
    ap.add_argument("--formats", default="fb,ig", help="輸出格式，逗號分隔：fb,ig（預設兩者）")
    ap.add_argument("--outdir", default=str(REPO / "assets" / "podcast"), help="輸出目錄（預設 assets/podcast）")
    ap.add_argument("--stem", default="podcast-cornell", help="輸出檔名字首（預設 podcast-cornell）")
    args = ap.parse_args()

    if args.episode:
        ep = json.loads(Path(args.episode).read_text(encoding="utf-8"))
    else:
        ep = SAMPLE
        print("未指定 --episode，使用內建示範集。")

    outdir = Path(args.outdir)
    for fmt in [f.strip() for f in args.formats.split(",") if f.strip()]:
        if fmt not in SIZES:
            sys.exit(f"錯誤：未知格式 {fmt}（可用：{', '.join(SIZES)}）")
        render_card(ep, SIZES[fmt], outdir / f"{args.stem}-{fmt}.png")
    print("完成。可直接發布至 Facebook（1200x630）／Instagram（1080x1080）。")


if __name__ == "__main__":
    main()
