#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aurora Cartography — StockRadar Top 10 ranking cards.
Produces three PNGs from a stocks JSON + target date:
  1) Original  1080x1920 (single-column, full detail)
  2) Facebook  1200x630  (2-column x 5-row compact grid)
  3) Instagram 1080x1080 (2-column x 5-row compact grid)

Usage:
    python3 stockradar_cards.py <stocks_and_meta.json> <output_dir>

No external image assets are required — the "艾倫報報 ALLEN I3 AURORA" brand
mark (icon + wordmark) is drawn procedurally so this script has zero file
dependencies beyond the system Noto CJK fonts and the canvas-fonts pack.

Signal chips: only badges for TRUE indicators are drawn (gold outline).
FALSE indicators are omitted entirely (no gray placeholder chip). If a
stock has zero true indicators, a muted "本期無符合訊號" label is shown
instead so the empty space is clearly intentional, not missing data.
"""
import glob, json, re, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_DIR = None
for cand in glob.glob("/sessions/*/mnt/.claude/skills/canvas-design/canvas-fonts") + [
    os.path.expanduser("~/.claude/skills/canvas-design/canvas-fonts"),
    "/root/.claude/skills/canvas-design/canvas-fonts",
]:
    if os.path.isdir(cand):
        FONT_DIR = cand
        break
if not FONT_DIR:
    FONT_DIR = "/sessions/quirky-serene-curie/mnt/.claude/skills/canvas-design/canvas-fonts"

CJK_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
CJK_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
CJK_TC_IDX = 3

VOID_TOP   = (6, 9, 14)
VOID_BOT   = (11, 16, 24)
GOLD       = (196, 160, 92)
GOLD_DIM   = (94, 82, 58)
WHITE      = (243, 246, 250)
GRAY       = (129, 140, 156)
GRAY_DIM   = (58, 66, 78)
GREEN      = (57, 224, 149)
RED        = (255, 92, 110)
AURORA_G   = (0, 227, 155)
AURORA_B   = (47, 107, 255)

def F(name, size):
    return ImageFont.truetype(f"{FONT_DIR}/{name}", size)

def FC(path, size, index=CJK_TC_IDX):
    return ImageFont.truetype(path, size, index=index)

f_bigword = lambda s: F("BigShoulders-Regular.ttf", s)
f_name    = lambda s: FC(CJK_REG, s)
f_label   = lambda s: FC(CJK_REG, s)
f_mono    = lambda s: F("JetBrainsMono-Regular.ttf", s)

def short_name(full):
    m = re.search(r"\(([^)]+)\)", full)
    return m.group(1) if m else full

def text_w(draw, txt, font):
    b = draw.textbbox((0, 0), txt, font=font)
    return b[2] - b[0], b[3] - b[1]

def fit_text(draw, txt, font_fn, max_w, start_size, min_size=11):
    size = start_size
    while size > min_size:
        f = font_fn(size)
        w, _ = text_w(draw, txt, f)
        if w <= max_w:
            return f, w
        size -= 1
    return font_fn(min_size), text_w(draw, txt, font_fn(min_size))[0]

def draw_text_ra(draw, xr, y, txt, font, fill):
    w, h = text_w(draw, txt, font)
    draw.text((xr - w, y), txt, font=font, fill=fill)
    return w, h

def center_y(draw, txt, font, band_top, band_h):
    b0 = draw.textbbox((0, 0), txt, font=font)
    ink_h = b0[3] - b0[1]
    return band_top + (band_h - ink_h)/2 - b0[1]

TAG_DEFS = [
    ("KD黃金交叉",   "golden_cross"),
    ("均線多頭",     "ma_bull"),
    ("營益率>10%",   "op_margin_ok"),
    ("營收年增>20%", "rev_ok"),
    ("EPS年增>10%",  "eps_ok"),
]

def build_chip_font(draw, labels, zone_w, start, min_size=9):
    size = start
    while size > min_size:
        f = FC(CJK_REG, size)
        total = sum(text_w(draw, t, f)[0] + 20 + 10 for t in labels) - 10
        if total <= zone_w:
            return f
        size -= 1
    return FC(CJK_REG, min_size)

def rounded_gradient_square(size, radius_frac=0.19, c1=(118,205,183), c2=(96,175,214)):
    base = Image.new("RGBA", (size, size), (0,0,0,0))
    px = base.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2*(size-1))
            r = int(c1[0] + (c2[0]-c1[0])*t)
            g = int(c1[1] + (c2[1]-c1[1])*t)
            b = int(c1[2] + (c2[2]-c1[2])*t)
            px[x, y] = (r, g, b, 255)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size-1, size-1], radius=int(size*radius_frac), fill=255)
    base.putalpha(mask)
    return base

def brand_icon(size):
    icon = rounded_gradient_square(size)
    d = ImageDraw.Draw(icon)
    main_f = F("Outfit-Bold.ttf", int(size*0.34))
    sup_f = F("Outfit-Bold.ttf", int(size*0.19))
    t1, t2, t3 = "AI", "3", "A"
    b1 = d.textbbox((0,0), t1, font=main_f)
    b2 = d.textbbox((0,0), t2, font=sup_f)
    b3 = d.textbbox((0,0), t3, font=main_f)
    w1, h1 = b1[2]-b1[0], b1[3]-b1[1]
    w2, _  = b2[2]-b2[0], b2[3]-b2[1]
    w3, _  = b3[2]-b3[0], b3[3]-b3[1]
    gap = size*0.015
    total_w = w1 + gap + w2 + gap + w3
    x = (size - total_w)/2
    main_y = (size - h1)/2 - b1[1]
    navy = (16, 48, 50, 255)
    d.text((x, main_y), t1, font=main_f, fill=navy)
    x += w1 + gap
    d.text((x, main_y - h1*0.32), t2, font=sup_f, fill=navy)
    x += w2 + gap
    d.text((x, main_y), t3, font=main_f, fill=navy)
    return icon

def paste_brand_lockup(img, x, y, height):
    icon = brand_icon(height)
    img.paste(icon, (int(x), int(y)), icon)
    d = ImageDraw.Draw(img, "RGBA")
    cn_f = FC(CJK_BOLD, int(height*0.62))
    en_f = FC(CJK_REG, int(height*0.24))
    teal = (58, 129, 118, 255)
    gray = (137, 148, 156, 255)
    cn_x = x + height + height*0.18
    cn_y = y + height*0.03
    d.text((cn_x, cn_y), "艾倫報報", font=cn_f, fill=teal)
    cnw, cnh = text_w(d, "艾倫報報", cn_f)
    en_txt = "A L L E N   I³ A U R O R A"
    d.text((cn_x, cn_y + cnh + height*0.10), en_txt, font=en_f, fill=gray)
    total_w = height + height*0.18 + max(cnw, text_w(d, en_txt, en_f)[0])
    return total_w

def measure_brand_lockup(img, height):
    scratch = Image.new("RGBA", (max(int(height*6), 10), int(height*2)), (0,0,0,0))
    return paste_brand_lockup(scratch, 0, 0, height)

def base_canvas(W, H, band_h, star_max_y):
    img = Image.new("RGB", (W, H), VOID_TOP)
    px = img.load()
    for y in range(H):
        t = y / H
        r = int(VOID_TOP[0] + (VOID_BOT[0]-VOID_TOP[0])*t)
        g = int(VOID_TOP[1] + (VOID_BOT[1]-VOID_TOP[1])*t)
        b = int(VOID_TOP[2] + (VOID_BOT[2]-VOID_TOP[2])*t)
        for x in range(0, W, 4):
            for k in range(4):
                if x+k < W: px[x+k, y] = (r, g, b)
    draw = ImageDraw.Draw(img, "RGBA")

    grid_step = 52
    for gx in range(0, W+1, grid_step):
        draw.line([(gx, 0), (gx, H)], fill=(255,255,255,7), width=1)
    for gy in range(0, H+1, grid_step):
        draw.line([(0, gy), (W, gy)], fill=(255,255,255,7), width=1)

    import random
    random.seed(42)
    for _ in range(int(W*H/11000)):
        sx, sy = random.randint(0, W), random.randint(0, star_max_y)
        r = random.choice([1,1,1,2])
        a = random.randint(30, 90)
        draw.ellipse([sx-r, sy-r, sx+r, sy+r], fill=(255,255,255,a))

    aurora = Image.new("RGBA", (W, band_h), (0,0,0,0))
    ad = ImageDraw.Draw(aurora)
    for y in range(band_h):
        t = y / band_h
        r = int(AURORA_G[0] + (AURORA_B[0]-AURORA_G[0])*t)
        g = int(AURORA_G[1] + (AURORA_B[1]-AURORA_G[1])*t)
        b = int(AURORA_G[2] + (AURORA_B[2]-AURORA_G[2])*t)
        alpha = int(68 * (1-t)**1.4)
        ad.line([(0,y),(W,y)], fill=(r,g,b,alpha))
    aurora = aurora.filter(ImageFilter.GaussianBlur(max(int(W*0.035), 20)))
    img.paste(Image.alpha_composite(img.crop((0,0,W,band_h)).convert("RGBA"), aurora).convert("RGB"), (0,0))
    dark = Image.new("RGBA", (W, band_h), (5,7,11,88))
    img.paste(Image.alpha_composite(img.crop((0,0,W,band_h)).convert("RGBA"), dark).convert("RGB"), (0,0))
    return img, ImageDraw.Draw(img, "RGBA")

def draw_legend_and_header(img, draw, W, MARGIN, CONTENT_R, header_top, brand_h,
                            title_size, date_txt, sub_size_ratio=0.20, date_size_ratio=0.16,
                            legend_size_ratio=0.155):
    lockup_w = measure_brand_lockup(img, brand_h)
    paste_brand_lockup(img, MARGIN, header_top, brand_h)

    title_f = f_bigword(int(title_size*0.62))
    title_x = MARGIN + lockup_w + int(W*0.022)
    title_y = center_y(draw, "TOP 10", title_f, header_top, brand_h)
    draw.text((title_x, title_y), "TOP 10", font=title_f, fill=WHITE)
    tw, _ = text_w(draw, "TOP 10", title_f)

    sub_f = f_label(int(title_size*sub_size_ratio))
    sub_x = title_x + tw + int(W*0.018)
    sub_y = center_y(draw, "台股每日分析報表", sub_f, header_top, brand_h)
    draw.text((sub_x, sub_y), "台股每日分析報表", font=sub_f, fill=(206,213,222))

    date_f = FC(CJK_REG, int(title_size*date_size_ratio))
    dw, _ = text_w(draw, date_txt, date_f)
    date_y = center_y(draw, date_txt, date_f, header_top, brand_h)
    draw.text((CONTENT_R - dw, date_y), date_txt, font=date_f, fill=GOLD)

    header_end = header_top + brand_h + int(brand_h*0.45)
    draw.line([(MARGIN, header_end), (CONTENT_R, header_end)], fill=GOLD+(200,), width=2)

    legend_txt = "訊號說明　僅顯示達標訊號（金色標籤，最多5項，未達標不顯示）　均線多頭：月>季>半年>年多頭排列"
    lf, _ = fit_text(draw, legend_txt, lambda s: FC(CJK_REG, s), CONTENT_R-MARGIN, int(title_size*legend_size_ratio), 10)
    legend_y = header_end + int(brand_h*0.28)
    draw.text((MARGIN, legend_y), legend_txt, font=lf, fill=GRAY)
    legend_end = legend_y + text_w(draw, legend_txt, lf)[1] + int(brand_h*0.28)
    draw.line([(MARGIN, legend_end), (CONTENT_R, legend_end)], fill=GOLD_DIM+(200,), width=1)
    return legend_end

def draw_footer(img, draw, W, H, MARGIN, CONTENT_R, footer_top, footer_h):
    draw.line([(MARGIN, footer_top), (CONTENT_R, footer_top)], fill=GOLD+(200,), width=2)
    ic_h = int(footer_h*0.30)
    foot_y1 = footer_top + int(footer_h*0.18)
    icon = brand_icon(ic_h)
    img.paste(icon, (MARGIN, int(foot_y1)), icon)

    bf = f_label(int(footer_h*0.24))
    bx = MARGIN + ic_h + int(W*0.012)
    bbb = draw.textbbox((bx, foot_y1), "艾倫報報 ALLEN I³ AURORA", font=bf)
    draw.text((bx, foot_y1), "艾倫報報 ALLEN I³ AURORA", font=bf, fill=GOLD)

    line1_bottom = max(bbb[3], foot_y1 + ic_h)
    foot_y2 = line1_bottom + footer_h*0.14
    src_f = FC(CJK_REG, int(footer_h*0.155))
    line1 = "資料來源：TWSE / TPEx / Goodinfo! 台灣股市資訊網 · 僅供研究參考，非投資建議"
    lw, _ = text_w(draw, line1, src_f)
    draw.text((CONTENT_R - lw, foot_y2), line1, font=src_f, fill=GRAY)

def render_master(stocks, date_txt, out_path):
    W, H = 1080, 1920
    img, draw = base_canvas(W, H, band_h=420, star_max_y=160)
    MARGIN = 64
    CONTENT_R = W - MARGIN

    legend_end = draw_legend_and_header(img, draw, W, MARGIN, CONTENT_R,
                                         header_top=56, brand_h=44, title_size=52,
                                         date_txt=date_txt)

    ROWS_TOP = legend_end + 14
    FOOTER_TOP = 1800
    row_h = (FOOTER_TOP - ROWS_TOP) / 10.0

    RANK_COL_R = 202
    NAME_X = 230
    NAME_COL_R = 744
    PRICE_X_R = CONTENT_R
    TAG_ZONE_W = NAME_COL_R - NAME_X

    for mx in (RANK_COL_R, NAME_COL_R):
        draw.line([(mx, ROWS_TOP), (mx, FOOTER_TOP)], fill=GOLD_DIM+(255,), width=2)

    for i, s in enumerate(stocks):
        ry = ROWS_TOP + i * row_h
        ry_c = ry + row_h/2
        for mx in (RANK_COL_R, NAME_COL_R):
            draw.line([(mx-9, ry), (mx+9, ry)], fill=GOLD+(255,), width=2)

        rank_txt = f"{s['rank']:02d}"
        rf = f_bigword(74)
        rw, rh = text_w(draw, rank_txt, rf)
        draw.text((MARGIN + (RANK_COL_R-MARGIN-24-rw)/2, ry_c-rh/2-4), rank_txt, font=rf, fill=WHITE)

        label = f"{s['code']}  {short_name(s['name'])}"
        nf, _ = fit_text(draw, label, f_name, TAG_ZONE_W, 42, 26)
        draw.text((NAME_X, ry + row_h*0.10), label, font=nf, fill=WHITE)

        ok_defs = [(lbl, fld) for lbl, fld in TAG_DEFS if bool(s.get(fld))]
        row1_defs = ok_defs[0:3]
        row2_defs = ok_defs[3:5]
        if ok_defs:
            f1 = build_chip_font(draw, [lbl for lbl,_ in row1_defs], TAG_ZONE_W, 26, min_size=13)
            f2 = build_chip_font(draw, [lbl for lbl,_ in row2_defs], TAG_ZONE_W, 26, min_size=13) if row2_defs else f1
            tf = f1 if f1.size <= f2.size else f2
        else:
            tf = FC(CJK_REG, 22)
        chip_h = text_w(draw, "測", tf)[1] + 16

        def draw_chip_row(defs, tag_y):
            tx = NAME_X
            for name_lbl, ok_field in defs:
                tw2, th2 = text_w(draw, name_lbl, tf)
                chip_w = tw2 + 26
                draw.rounded_rectangle([tx, tag_y, tx+chip_w, tag_y+chip_h], radius=6,
                                        outline=GOLD+(255,), width=2, fill=GOLD+(30,))
                draw.text((tx+13, tag_y+(chip_h-th2)/2-2), name_lbl, font=tf, fill=GOLD)
                tx += chip_w + 12

        tag_y1 = ry + row_h*0.46
        tag_y2 = tag_y1 + chip_h + 10
        if ok_defs:
            draw_chip_row(row1_defs, tag_y1)
            if row2_defs:
                draw_chip_row(row2_defs, tag_y2)
        else:
            none_txt = "本期無符合訊號"
            draw.text((NAME_X, tag_y1+(chip_h-text_w(draw, none_txt, tf)[1])/2-2), none_txt, font=tf, fill=GRAY_DIM)

        price_txt = f"{s['price']:.2f}"
        pf = f_mono(48)
        draw_text_ra(draw, PRICE_X_R, ry + row_h*0.11, price_txt, pf, WHITE)

        chg = s['chg_pct']
        arrow = "▲" if chg > 0 else ("▼" if chg < 0 else "▬")
        chg_txt = f"{arrow} {abs(chg):.2f}%"
        cf = f_mono(31)
        ccolor = GREEN if chg > 0 else (RED if chg < 0 else GRAY)
        draw_text_ra(draw, PRICE_X_R, ry + row_h*0.56, chg_txt, cf, ccolor)

        if i < 9:
            sep_y = ry + row_h
            draw.line([(MARGIN, sep_y), (CONTENT_R, sep_y)], fill=(255,255,255,16), width=1)

    draw.line([(MARGIN, FOOTER_TOP), (CONTENT_R, FOOTER_TOP)], fill=GOLD+(200,), width=2)
    draw_footer(img, draw, W, H, MARGIN, CONTENT_R, FOOTER_TOP, H-FOOTER_TOP)
    img.save(out_path, "PNG", optimize=True)
    return out_path

def render_social(W, H, stocks, date_txt, out_path, brand_bh, title_size, tag_font_start):
    img, draw = base_canvas(W, H, band_h=int(H*0.30), star_max_y=int(H*0.075))
    MARGIN = int(W*0.045)
    CONTENT_R = W - MARGIN

    legend_end = draw_legend_and_header(img, draw, W, MARGIN, CONTENT_R,
                                         header_top=int(H*0.035), brand_h=brand_bh,
                                         title_size=title_size, date_txt=date_txt)

    footer_h = int(H*0.115)
    footer_top = H - footer_h
    draw_footer(img, draw, W, H, MARGIN, CONTENT_R, footer_top, footer_h)

    rows_top = legend_end + int(H*0.016)
    col_gap = int(W*0.032)
    col_w = (CONTENT_R - MARGIN - col_gap) / 2
    col_xs = [MARGIN, MARGIN + col_w + col_gap]
    row_h = (footer_top - int(H*0.012) - rows_top) / 5.0

    mid_x = MARGIN + col_w + col_gap/2
    draw.line([(mid_x, rows_top), (mid_x, footer_top - int(H*0.012))], fill=GOLD_DIM+(255,), width=2)

    RANK_W = col_w * 0.16

    for idx, s in enumerate(stocks):
        col = 0 if idx < 5 else 1
        row = idx % 5
        cx = col_xs[col]
        ry = rows_top + row * row_h
        name_x = cx + RANK_W + col_w*0.02

        if row > 0:
            draw.line([(cx, ry), (cx+col_w, ry)], fill=(255,255,255,14), width=1)

        top_pad = row_h * 0.03
        line1_y = ry + top_pad

        rank_txt = f"{s['rank']:02d}"
        rf, _ = fit_text(draw, rank_txt, f_bigword, RANK_W*0.95, int(row_h*0.32), 12)
        rbb = draw.textbbox((cx, line1_y), rank_txt, font=rf)
        draw.text((cx, line1_y), rank_txt, font=rf, fill=WHITE)

        price_txt = f"{s['price']:.2f}"
        pf, pw = fit_text(draw, price_txt, f_mono, col_w*0.34, int(row_h*0.22), 10)
        draw_text_ra(draw, cx+col_w, line1_y, price_txt, pf, WHITE)
        pbb = draw.textbbox((cx+col_w-pw, line1_y), price_txt, font=pf)

        name_zone = col_w - RANK_W - col_w*0.02 - col_w*0.36
        label = f"{s['code']} {short_name(s['name'])}"
        nf, _ = fit_text(draw, label, f_name, name_zone, int(row_h*0.22), 11)
        draw.text((name_x, line1_y), label, font=nf, fill=WHITE)
        nbb = draw.textbbox((name_x, line1_y), label, font=nf)

        line1_bottom = max(rbb[3], pbb[3], nbb[3])
        chg_y = pbb[3] + row_h*0.02
        chg = s['chg_pct']
        arrow = "▲" if chg > 0 else ("▼" if chg < 0 else "▬")
        chg_txt = f"{arrow}{abs(chg):.2f}%"
        cf, cw = fit_text(draw, chg_txt, f_mono, col_w*0.34, int(row_h*0.15), 9)
        draw_text_ra(draw, cx+col_w, chg_y, chg_txt, cf, GREEN if chg > 0 else (RED if chg < 0 else GRAY))
        cbb = draw.textbbox((cx+col_w-cw, chg_y), chg_txt, font=cf)

        tag_zone_w = col_w - RANK_W - col_w*0.02
        ok_defs = [(lbl, fld) for lbl, fld in TAG_DEFS if bool(s.get(fld))]
        row1_defs = ok_defs[0:3]
        row2_defs = ok_defs[3:5]
        if ok_defs:
            f1 = build_chip_font(draw, [lbl for lbl,_ in row1_defs], tag_zone_w, tag_font_start)
            f2 = build_chip_font(draw, [lbl for lbl,_ in row2_defs], tag_zone_w, tag_font_start) if row2_defs else f1
            tf = f1 if f1.size <= f2.size else f2
        else:
            tf = FC(CJK_REG, max(tag_font_start-4, 9))
        chip_h = max(text_w(draw, "測", tf)[1] + 7, 15)

        def draw_chip_row(defs, tag_y):
            tx = name_x
            for name_lbl, ok_field in defs:
                tw2, th2 = text_w(draw, name_lbl, tf)
                chip_w = tw2 + 16
                draw.rounded_rectangle([tx, tag_y, tx+chip_w, tag_y+chip_h], radius=5,
                                        outline=GOLD+(255,), width=1, fill=GOLD+(30,))
                draw.text((tx+8, tag_y+(chip_h-th2)/2-1), name_lbl, font=tf, fill=GOLD)
                tx += chip_w + 8

        tag_y1 = max(line1_bottom, cbb[3]) + row_h*0.02
        tag_y2 = tag_y1 + chip_h + row_h*0.015
        if ok_defs:
            draw_chip_row(row1_defs, tag_y1)
            if row2_defs:
                draw_chip_row(row2_defs, tag_y2)
        else:
            none_txt = "本期無符合訊號"
            draw.text((name_x, tag_y1+(chip_h-text_w(draw, none_txt, tf)[1])/2-1), none_txt, font=tf, fill=GRAY_DIM)

    img.save(out_path, "PNG", optimize=True)
    return out_path

def main():
    data_path, out_dir = sys.argv[1], sys.argv[2]
    with open(data_path, encoding="utf-8") as fp:
        meta = json.load(fp)
    stocks = meta["stocks"]
    assert len(stocks) == 10, "expected exactly 10 stocks"
    date_txt = f"{meta['target_date']} · {meta['weekday']}"
    d = meta["target_date"]

    os.makedirs(out_dir, exist_ok=True)
    p1 = render_master(stocks, date_txt, os.path.join(out_dir, f"StockRadar_Top10_Original_{d}.png"))
    p2 = render_social(1200, 630, stocks, date_txt, os.path.join(out_dir, f"StockRadar_Top10_Facebook_{d}.png"),
                        brand_bh=30, title_size=64, tag_font_start=13)
    p3 = render_social(1080, 1080, stocks, date_txt, os.path.join(out_dir, f"StockRadar_Top10_Instagram_{d}.png"),
                        brand_bh=40, title_size=84, tag_font_start=15)
    print("saved:", p1, p2, p3)

if __name__ == "__main__":
    main()
