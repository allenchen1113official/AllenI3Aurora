# -*- coding: utf-8 -*-
"""建立品牌圖卡素材（依附圖樣式重製）：漸層圖示 + 艾倫報報 / ALLEN I3 AURORA 文字組合"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

CJK_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
LATIN_BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
LATIN_SEMI = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"

SS = 4  # supersample for smooth edges


def rounded_mask(size, radius):
    m = Image.new("L", (size[0] * SS, size[1] * SS), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size[0] * SS - 1, size[1] * SS - 1), radius=radius * SS, fill=255)
    return m.resize(size, Image.LANCZOS)


def gradient_rgba(size, c0, c1):
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx / max(w - 1, 1) + yy / max(h - 1, 1)) / 2.0
    t = np.clip(t, 0, 1)
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    for i in range(3):
        arr[:, :, i] = (c0[i] + (c1[i] - c0[i]) * t).astype(np.uint8)
    arr[:, :, 3] = 255
    return Image.fromarray(arr, "RGBA")


def make_icon(size=300):
    grad = gradient_rgba((size, size), (126, 217, 168), (99, 172, 226))  # mint -> sky blue
    mask = rounded_mask((size, size), int(size * 0.24))
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)

    # subtle soft shadow beneath icon (returned separately composited by caller)
    draw = ImageDraw.Draw(icon)
    dark = (13, 46, 48)  # dark teal text colour

    # "AI" main + superscript "3" + "A"
    f_main = ImageFont.truetype(LATIN_BOLD, int(size * 0.40))
    f_sup = ImageFont.truetype(LATIN_BOLD, int(size * 0.22))

    txt_a1 = "AI"
    txt_sup = "3"
    txt_a2 = "A"
    w_a1 = draw.textlength(txt_a1, font=f_main)
    w_sup = draw.textlength(txt_sup, font=f_sup)
    w_a2 = draw.textlength(txt_a2, font=f_main)
    total_w = w_a1 + w_sup * 0.75 + w_a2
    start_x = (size - total_w) / 2
    baseline_y = size * 0.5

    bbox_main = f_main.getbbox("AI")
    main_h = bbox_main[3] - bbox_main[1]
    y_main = baseline_y - main_h / 2 - bbox_main[1]

    draw.text((start_x, y_main), txt_a1, font=f_main, fill=dark)
    x2 = start_x + w_a1
    # superscript raised
    bbox_sup = f_sup.getbbox(txt_sup)
    sup_h = bbox_sup[3] - bbox_sup[1]
    y_sup = y_main - sup_h * 0.32
    draw.text((x2, y_sup), txt_sup, font=f_sup, fill=dark)
    x3 = x2 + w_sup * 0.78
    draw.text((x3, y_main), txt_a2, font=f_main, fill=dark)
    return icon


def make_lockup(icon_size=200, out_path="brand_lockup.png"):
    icon = make_icon(icon_size)
    pad = int(icon_size * 0.18)

    # text block
    cjk_size = int(icon_size * 0.46)
    eng_size = int(icon_size * 0.155)
    f_cjk = ImageFont.truetype(CJK_BOLD, cjk_size)
    f_eng = ImageFont.truetype(LATIN_SEMI, eng_size)

    tmp = Image.new("RGBA", (10, 10))
    d = ImageDraw.Draw(tmp)
    cjk_text = "艾倫報報"
    eng_text = "ALLEN  I³  AURORA"
    cjk_w = d.textlength(cjk_text, font=f_cjk)
    # letter-spaced english text width
    eng_w = 0
    spacing = int(eng_size * 0.28)
    for ch in eng_text:
        eng_w += d.textlength(ch, font=f_eng) + spacing
    eng_w -= spacing

    text_w = int(max(cjk_w, eng_w))
    text_h = int(cjk_size * 1.15 + eng_size * 1.5)

    W = icon_size + pad + text_w + pad
    H = max(icon_size, text_h)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(icon, (0, (H - icon_size) // 2), icon)

    dtxt = ImageDraw.Draw(canvas)
    tx = icon_size + pad
    gap = int(cjk_size * 0.12)
    block_h = cjk_size * 1.05 + gap + eng_size * 1.1
    ty0 = (H - block_h) / 2

    teal = (58, 129, 118)
    gray = (137, 148, 156)
    dtxt.text((tx, ty0), cjk_text, font=f_cjk, fill=teal)
    ey = ty0 + cjk_size * 1.15 + gap
    cx = tx
    for ch in eng_text:
        dtxt.text((cx, ey), ch, font=f_eng, fill=gray)
        cx += d.textlength(ch, font=f_eng) + spacing

    canvas.save(out_path)
    print("saved", out_path, canvas.size)

    # icon-only asset too
    icon.save("brand_icon.png")
    print("saved brand_icon.png", icon.size)


if __name__ == "__main__":
    make_lockup()
