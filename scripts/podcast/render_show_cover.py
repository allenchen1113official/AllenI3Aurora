#!/usr/bin/env python3
"""
自有節目封面（Apple Podcasts／Spotify 規格：3000×3000、RGB JPEG、< 1 MB）
輸出 assets/podcast/show-cover-3000.jpg；scripts/podcast/show.json 的 image 指向它。

用法：python3 scripts/podcast/render_show_cover.py [輸出路徑]
字型：Noto Sans CJK TC（系統字型）＋ Poppins；缺字型時會報錯而不是默默換成方框字。
品牌：深夜底＋極光綠／青／紫光帶，AI³A 圖示（與 assets/brand_icon.png 同配色，向量重繪避免放大糊掉）。
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 3000
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets/podcast/show-cover-3000.jpg"

CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-{w}.ttc"
POP = "/usr/share/fonts/truetype/google-fonts/Poppins-{w}.ttf"


def cjk(weight, size):
    # ttc 內 TC 的索引依字重不同，以名稱比對
    path = CJK.format(w=weight)
    for i in range(10):
        try:
            f = ImageFont.truetype(path, size, index=i)
        except OSError:
            break
        if f.getname()[0].startswith("Noto Sans CJK TC"):
            return f
    raise SystemExit(f"找不到 Noto Sans CJK TC（{path}）")


def pop(weight, size):
    return ImageFont.truetype(POP.format(w=weight), size)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ---------- 背景：深夜漸層 ----------
img = Image.new("RGB", (S, S), (6, 9, 16))
px = img.load()
top, bottom = (10, 20, 30), (4, 6, 12)
grad = Image.new("RGB", (1, S))
for y in range(S):
    grad.putpixel((0, y), lerp(top, bottom, y / S))
img = grad.resize((S, S))

# ---------- 極光光帶（模糊的多邊形，疊加） ----------
glow = Image.new("RGB", (S, S), (0, 0, 0))
g = ImageDraw.Draw(glow)
g.polygon([(-200, 1100), (900, 700), (2000, 900), (3200, 500), (3200, 900), (2100, 1300), (900, 1100), (-200, 1500)], fill=(46, 204, 140))
g.polygon([(-200, 1500), (1000, 1150), (2200, 1350), (3200, 1050), (3200, 1350), (2200, 1650), (1000, 1450), (-200, 1800)], fill=(40, 160, 200))
g.polygon([(400, 600), (1400, 350), (2600, 500), (3200, 200), (3200, 450), (2500, 760), (1400, 620), (400, 860)], fill=(124, 58, 237))
glow = glow.filter(ImageFilter.GaussianBlur(260))
img = Image.blend(img, Image.composite(glow, img, Image.new("L", (S, S), 255)), 0.55)

# 細微星點
d = ImageDraw.Draw(img)
import random
random.seed(1113)
for _ in range(260):
    x, y = random.randrange(S), random.randrange(int(S * 0.62))
    r = random.choice([2, 2, 3, 4])
    c = random.randint(150, 230)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(c, c, min(255, c + 20)))

# ---------- AI³A 圖示（向量重繪） ----------
IC = 900
icon = Image.new("RGB", (IC, IC))
for y in range(IC):
    for x in range(0, IC, 4):
        t = (x + y) / (2 * IC)
        c = lerp((118, 214, 168), (90, 160, 222), t)
        for k in range(4):
            if x + k < IC:
                icon.putpixel((x + k, y), c)
mask = Image.new("L", (IC, IC), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, IC - 1, IC - 1], radius=200, fill=255)
di = ImageDraw.Draw(icon)
ink = (18, 26, 36)
f_big, f_sup = pop("Bold", 330), pop("Bold", 170)
w_ai = di.textlength("AI", font=f_big)
w_a = di.textlength("A", font=f_big)
gap = 70
x0 = (IC - (w_ai + gap + w_a)) / 2
base_y = 300
di.text((x0, base_y), "AI", font=f_big, fill=ink)
di.text((x0 + w_ai + gap, base_y), "A", font=f_big, fill=ink)
di.text((x0 + w_ai + gap / 2 - di.textlength("3", font=f_sup) / 2, base_y - 70), "3", font=f_sup, fill=ink)
# 陰影
shadow = Image.new("L", (S, S), 0)
ImageDraw.Draw(shadow).rounded_rectangle([S // 2 - IC // 2 + 20, 520 + 40, S // 2 + IC // 2 + 20, 520 + IC + 40], radius=200, fill=150)
shadow = shadow.filter(ImageFilter.GaussianBlur(60))
img.paste((0, 0, 0), (0, 0), shadow)
img.paste(icon, (S // 2 - IC // 2, 520), mask)

# ---------- 文字 ----------
d = ImageDraw.Draw(img)


def center(text, font, y, fill, spacing=0):
    if spacing:
        widths = [d.textlength(ch, font=font) for ch in text]
        total = sum(widths) + spacing * (len(text) - 1)
        x = (S - total) / 2
        for ch, w in zip(text, widths):
            d.text((x, y), ch, font=font, fill=fill)
            x += w + spacing
    else:
        d.text(((S - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)


center("艾倫極光報報", cjk("Black", 340), 1560, (240, 246, 250))
center("ALLEN I³ AURORA", pop("Medium", 150), 2000, (150, 226, 196), spacing=34)
# PODCAST 膠囊
f_pill = pop("Bold", 120)
label = "PODCAST"
lw = sum(d.textlength(c, font=f_pill) for c in label) + 26 * (len(label) - 1)
pw, ph = lw + 220, 210
px0, py0 = (S - pw) / 2, 2300
d.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=ph / 2, fill=(124, 58, 237))
center(label, f_pill, py0 + 30, (255, 255, 255), spacing=26)
center("AI · 智慧交通 · 智慧水資源 · 無人機 · 理財", cjk("Medium", 112), 2660, (176, 190, 204))

img = img.convert("RGB")
OUT.parent.mkdir(parents=True, exist_ok=True)
for q in (90, 85, 80, 75):
    img.save(OUT, "JPEG", quality=q, optimize=True, progressive=True)
    if OUT.stat().st_size < 900 * 1024:
        break
print(f"{OUT} {img.size} {OUT.stat().st_size // 1024} KB")
