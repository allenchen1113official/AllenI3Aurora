#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股盤前速報 — 品牌預設圖卡產生器（1200x630，FB/OG 尺寸）。

用途：產出 assets/prebrief/prebrief-card.png，作為盤前速報頁（prebrief.html）
與歷期彙整卡片的「站內備援圖」——當日 Drive 資料夾（AllenI3Aurora/finance/
TSMPreBrief/YYYYMMDD/）沒有圖檔時顯示此卡；有圖檔時由 data/prebrief.json 的
image（Drive 縮圖連結）優先顯示。

視覺沿用本站 Aurora tokens（tokens/colors.css）：夜空底 #0B1020、
aurora 漸層 #3DDC97 → #2DD4BF → #4F7BF0 → #7C3AED。

相依自動解決：中文字型（Noto Sans CJK TC）不存在時自動下載到暫存目錄。
執行：python3 scripts/prebrief/render_prebrief_card.py [輸出路徑]
（預設輸出 assets/prebrief/prebrief-card.png，於 repo 根目錄執行。）
"""
import os
import sys
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
NIGHT = (11, 16, 32)          # --night-900
CARD = (18, 26, 48)           # --night-800
TEXT1 = (238, 242, 252)
TEXT2 = (168, 178, 204)
TEXT3 = (120, 132, 160)
AURORA = [(61, 220, 151), (45, 212, 191), (79, 123, 240), (124, 58, 237)]

FONT_URLS = {
    "bold": "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf",
    "regular": "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf",
}


def font_path(kind):
    """取得字型檔路徑：先找系統／暫存，沒有就下載（相依自動解決）。"""
    name = "NotoSansCJKtc-%s.otf" % kind.capitalize()
    for d in ("/usr/share/fonts/opentype/noto",
              os.path.join(tempfile.gettempdir(), "prebrief-fonts")):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    d = os.path.join(tempfile.gettempdir(), "prebrief-fonts")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    print("下載字型 %s …" % name)
    urllib.request.urlretrieve(FONT_URLS[kind], p)
    return p


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def aurora_color(t):
    """在四段 aurora 漸層色之間取內插色（t: 0~1）。"""
    seg = min(int(t * 3), 2)
    return lerp(AURORA[seg], AURORA[seg + 1], t * 3 - seg)


def rounded_gradient(size, radius):
    """做一塊水平 aurora 漸層的圓角矩形（品牌方塊／色帶用）。"""
    w, h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    for x in range(w):
        c = aurora_color(x / max(w - 1, 1))
        for y in range(h):
            px[x, y] = c
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    img.putalpha(mask)
    return img


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/prebrief/prebrief-card.png"

    img = Image.new("RGB", (W, H), NIGHT)

    # 背景極光：數個彩色光暈（高斯模糊）疊在夜空上，右上偏亮、左下沉穩。
    glow = Image.new("RGB", (W, H), NIGHT)
    gd = ImageDraw.Draw(glow)
    blobs = [
        ((820, -140, 1420, 320), AURORA[2]),   # 右上 藍
        ((1020, 120, 1560, 560), AURORA[3]),   # 右中 紫
        ((-260, 330, 340, 830), AURORA[0]),    # 左下 綠
        ((180, 480, 760, 900), AURORA[1]),     # 下方 青
    ]
    for box, c in blobs:
        gd.ellipse(box, fill=c)
    glow = glow.filter(ImageFilter.GaussianBlur(130))
    img = Image.blend(img, glow, 0.42)
    d = ImageDraw.Draw(img)

    # 細緻星點
    import random
    rnd = random.Random(20260824)
    for _ in range(90):
        x, y = rnd.randint(0, W - 1), rnd.randint(0, H - 1)
        a = rnd.randint(18, 70)
        d.ellipse([x, y, x + 2, y + 2], fill=(255, 255, 255, a))

    f_brand = ImageFont.truetype(font_path("bold"), 34)
    f_mark = ImageFont.truetype(font_path("bold"), 40)
    f_tag = ImageFont.truetype(font_path("bold"), 26)
    f_title = ImageFont.truetype(font_path("bold"), 118)
    f_sub = ImageFont.truetype(font_path("regular"), 37)
    f_foot = ImageFont.truetype(font_path("regular"), 27)
    f_foot_b = ImageFont.truetype(font_path("bold"), 27)

    # 品牌列：漸層圓角方塊 I³ ＋ 艾倫報報 ALLEN I³ AURORA
    mx, my = 64, 56
    mark = rounded_gradient((84, 84), 24)
    img.paste(mark, (mx, my), mark)
    d.text((mx + 42, my + 40), "I³", font=f_mark, fill=(10, 14, 26), anchor="mm")
    d.text((mx + 108, my + 20), "艾倫報報", font=f_brand, fill=TEXT1, anchor="lm")
    d.text((mx + 108, my + 62), "ALLEN I³ AURORA", font=f_tag, fill=TEXT2, anchor="lm")

    # 右上標籤膠囊：盤前 · PRE-MARKET
    tag = "盤前 · PRE-MARKET"
    tw = d.textlength(tag, font=f_tag)
    bx1, bx0 = W - 64, W - 64 - (tw + 56)
    d.rounded_rectangle([bx0, my + 12, bx1, my + 72], radius=30,
                        outline=(94, 210, 180), width=2, fill=(20, 42, 52))
    d.text(((bx0 + bx1) / 2, my + 42), tag, font=f_tag, fill=(120, 226, 192), anchor="mm")

    # 主標題與副標
    d.text((64, 268), "台股盤前速報", font=f_title, fill=TEXT1, anchor="lm")
    band = rounded_gradient((520, 10), 5)
    img.paste(band, (68, 346), band)
    d = ImageDraw.Draw(img)
    d.text((64, 415), "昨日收盤與三大法人 · 隔夜美股 · 類股輪動 · 今日觀察點",
           font=f_sub, fill=TEXT2, anchor="lm")
    d.text((64, 472), "開盤前三分鐘，掌握多空關鍵", font=f_sub, fill=(120, 226, 192), anchor="lm")

    # 底部資訊列
    d.line([64, 548, W - 64, 548], fill=(52, 62, 92), width=2)
    d.text((64, 584), "洞察世界 · 累積智慧 · 點亮未來", font=f_foot_b, fill=TEXT2, anchor="lm")
    right = "allenchen1113official.github.io/AllenI3Aurora"
    d.text((W - 64, 584), right, font=f_foot, fill=TEXT3, anchor="rm")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print("已輸出", out, "%dx%d" % img.size)


if __name__ == "__main__":
    main()
