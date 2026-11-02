#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股選股雷達 — TOP 10 圖卡產生器（Facebook 1200x630 ＋ Instagram 1080x1080）。

視覺復刻自艾倫報報選股雷達既有成品（assets/stockradar/*.png）：
深青→夜藍漸層底＋淡星點與細格線、品牌表頭（AI³A 標誌＋艾倫報報＋TOP 10）、
雙欄各 5 檔（排名、代號股名、收盤價、紅漲綠跌漲跌幅、金色達標訊號標籤，
無訊號顯示「本期無符合訊號」）、頁尾品牌與資料來源聲明。

輸入：JSON（預設讀取目前目錄 stockradar.sample.json）
{
  "date": "2026-08-07",
  "weekday": "星期五",            // 選填，省略時由 date 自動計算
  "entries": [                    // 恰 10 檔，依排名排序
    {"code": "2395", "name": "研華", "price": "634.00",
     "changePct": "1.93", "up": true, "signals": ["ma", "om", "eps"]},
    ...
  ]
}
signals 鍵值：gc=黃金交叉、ma=均線多頭、om=營益率>10%、
rev=營收年增>20%、eps=EPS年增>10%（最多顯示 5 項，未達標不列）。

執行：python3 render_stockradar_card.py [資料.json] [fb|ig|both] [輸出目錄]
（預設 stockradar.sample.json、both、目前目錄；輸出
　StockRadar_FB_<date>.png 與 StockRadar_IG_<date>.png。）

相依自動解決：Pillow 之外的字型（Noto Sans CJK TC、Oswald、JetBrains Mono）
不存在時自動下載到暫存目錄。
"""
import datetime
import json
import os
import sys
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── 品牌色（取樣自既有成品）─────────────────────────────────────────
BG_TOP = (5, 41, 36)        # 上緣深青
BG_BOT = (10, 15, 23)       # 下緣夜藍
GOLD = (196, 160, 92)       # 標籤／品牌金
GOLD_RULE = (155, 132, 79)  # 分隔粗線金
GOLD_DIM = (94, 82, 58)     # 欄位分隔線
WHITE = (243, 246, 250)
GRAY = (150, 160, 172)
GRAY_DIM = (110, 120, 132)
RED = (255, 92, 110)        # 上漲
GREEN = (57, 224, 149)      # 下跌
TEAL = (107, 190, 198)      # 標誌底色
INK = (7, 16, 23)           # 標誌上的深色字

SIGNAL_LABELS = {
    "gc": "黃金交叉", "ma": "均線多頭", "om": "營益率>10%",
    "rev": "營收年增>20%", "eps": "EPS年增>10%",
}
WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]

FONT_SOURCES = {
    "NotoSansCJKtc-Bold.otf": "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf",
    "NotoSansCJKtc-Regular.otf": "https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf",
    "Oswald.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf",
    "JetBrainsMono-Bold.ttf": "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Bold.ttf",
}


def font_file(name):
    """取得字型檔：依序找快取目錄，沒有就下載（相依自動解決）。"""
    dirs = [os.path.join(tempfile.gettempdir(), "stockradar-fonts"),
            os.path.join(tempfile.gettempdir(), "prebrief-fonts"),
            "/usr/share/fonts/opentype/noto"]
    for d in dirs:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    d = dirs[0]
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    print("下載字型 %s …" % name)
    urllib.request.urlretrieve(FONT_SOURCES[name], p)
    return p


def load_fonts():
    cjk_b = font_file("NotoSansCJKtc-Bold.otf")
    cjk_r = font_file("NotoSansCJKtc-Regular.otf")
    osw = font_file("Oswald.ttf")
    mono = font_file("JetBrainsMono-Bold.ttf")

    def oswald(size):
        f = ImageFont.truetype(osw, size)
        try:
            f.set_variation_by_axes([600])  # 半粗，貼近成品的窄體標題
        except Exception:
            pass
        return f

    return {
        "cjk_b": lambda s: ImageFont.truetype(cjk_b, s),
        "cjk_r": lambda s: ImageFont.truetype(cjk_r, s),
        "osw": oswald,
        "mono": lambda s: ImageFont.truetype(mono, s),
    }


def make_bg(w, h):
    """深青→夜藍垂直漸層＋淡格線＋星點。"""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        c = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    d = ImageDraw.Draw(img, "RGBA")
    step = 54
    for x in range(0, w, step):
        d.line([x, 0, x, h], fill=(255, 255, 255, 5))
    for y in range(0, h, step):
        d.line([0, y, w, y], fill=(255, 255, 255, 5))
    import random
    rnd = random.Random(20260807)
    for _ in range(int(w * h / 12000)):
        x, y = rnd.randint(0, w - 1), rnd.randint(0, int(h * 0.35))
        d.ellipse([x, y, x + 1, y + 1], fill=(255, 255, 255, rnd.randint(30, 90)))
    return img


def weekday_of(date_str):
    try:
        y, m, dd = [int(x) for x in date_str.replace(".", "-").split("-")]
        return WEEKDAYS[datetime.date(y, m, dd).weekday()]
    except Exception:
        return ""


# ── 版面設定（fb / ig 各一組，數值以成品為基準調校）──────────────────
LAYOUTS = {
    "fb": dict(size=(1200, 630), margin=54, header_y=16, logo=44,
               rule1_y=64, note_y=78, rows_y0=100, row_h=90,
               col_gap=40, rank_size=42, name_size=27, price_size=30,
               pct_size=19, pill_size=15, foot_rule_y=552, foot_y=580,
               brand_size=26, top10_size=46, sub_size=19, date_size=17,
               note_size=14, disc_y=604),
    "ig": dict(size=(1080, 1080), margin=48, header_y=30, logo=54,
               rule1_y=96, note_y=112, rows_y0=145, row_h=159,
               col_gap=60, rank_size=58, name_size=34, price_size=38,
               pct_size=24, pill_size=17, foot_rule_y=950, foot_y=985,
               brand_size=30, top10_size=54, sub_size=22, date_size=20,
               note_size=17, disc_y=1042),
}


def draw_logo(img, d, x, y, size, F):
    r = max(8, size // 5)
    d.rounded_rectangle([x, y, x + size, y + size], radius=r, fill=TEAL)
    f = F["cjk_b"](int(size * 0.34))
    d.text((x + size / 2, y + size / 2), "AI³A", font=f, fill=INK, anchor="mm")


def render(fmt, data, out_dir, F):
    L = LAYOUTS[fmt]
    w, h = L["size"]
    img = make_bg(w, h)
    d = ImageDraw.Draw(img, "RGBA")
    M = L["margin"]

    # ── 表頭 ──
    hy = L["header_y"]
    logo = L["logo"]
    draw_logo(img, d, M, hy, logo, F)
    bx = M + logo + 14
    d.text((bx, hy + logo * 0.30), "艾倫報報", font=F["cjk_b"](int(logo * 0.52)), fill=GOLD, anchor="lm")
    d.text((bx, hy + logo * 0.82), "ALLEN I³AURORA", font=F["cjk_r"](int(logo * 0.26)), fill=GOLD_RULE, anchor="lm")
    tx = bx + int(logo * 0.52) * 4 + 28
    d.text((tx, hy + logo * 0.52), "TOP 10", font=F["osw"](L["top10_size"]), fill=WHITE, anchor="lm")
    t10w = d.textlength("TOP 10", font=F["osw"](L["top10_size"]))
    d.text((tx + t10w + 26, hy + logo * 0.56), "台股每日分析報表", font=F["cjk_r"](L["sub_size"]), fill=WHITE, anchor="lm")
    date_label = "%s ・ %s" % (data["date"], data.get("weekday") or weekday_of(data["date"]))
    d.text((w - M, hy + logo * 0.52), date_label, font=F["cjk_r"](L["date_size"]), fill=GRAY, anchor="rm")

    # ── 金色粗線＋訊號說明 ──
    d.line([M, L["rule1_y"], w - M, L["rule1_y"]], fill=GOLD_RULE, width=2)
    note = "訊號說明　僅顯示達標訊號（金色標籤，最多5項，未達標不顯示）"
    note2 = "均線多頭：月>季>半年>年多頭排列"
    f_note = F["cjk_r"](L["note_size"])
    d.text((M, L["note_y"]), note, font=f_note, fill=GRAY_DIM, anchor="lm")
    d.text((M + d.textlength(note, font=f_note) + 40, L["note_y"]), note2, font=f_note, fill=GRAY_DIM, anchor="lm")
    d.line([M, L["note_y"] + L["note_size"], w - M, L["note_y"] + L["note_size"]],
           fill=(255, 255, 255, 22), width=1)

    # ── 兩欄各 5 檔 ──
    entries = list(data["entries"])[:10]
    col_w = (w - 2 * M - L["col_gap"]) / 2
    div_x = w / 2
    y0, rh = L["rows_y0"], L["row_h"]
    d.line([div_x, y0 + 6, div_x, y0 + rh * 5 - 12], fill=GOLD_DIM, width=1)

    f_rank = F["osw"](L["rank_size"])
    f_name = F["cjk_b"](L["name_size"])
    f_price = F["mono"](L["price_size"])
    f_pct = F["mono"](L["pct_size"])
    f_pill = F["cjk_r"](L["pill_size"])
    f_none = F["cjk_r"](L["pill_size"])

    for i, e in enumerate(entries):
        col, row = divmod(i, 5)
        x = M + col * (col_w + L["col_gap"])
        y = y0 + row * rh
        cy = y + rh * 0.30
        d.text((x, cy), "%02d" % (i + 1), font=f_rank, fill=WHITE, anchor="lm")
        nx = x + L["rank_size"] * 1.9
        rx = x + col_w
        # 股名與價格不可重疊：股名可用寬度到「價格左緣 − 16px」為止，過寬逐級縮字。
        price_left = rx - d.textlength(str(e["price"]), font=f_price)
        label = "%s %s" % (e["code"], e["name"])
        nsize, fn = L["name_size"], f_name
        while nsize > int(L["name_size"] * 0.6) and d.textlength(label, font=fn) > price_left - 16 - nx:
            nsize -= 1
            fn = F["cjk_b"](nsize)
        d.text((nx, cy), label, font=fn, fill=WHITE, anchor="lm")
        d.text((rx, y + rh * 0.22), str(e["price"]), font=f_price, fill=WHITE, anchor="rm")
        pct = str(e.get("changePct", "")).lstrip("+-▲▼")
        arrow = "▲" if e.get("up") else "▼"
        d.text((rx, y + rh * 0.22 + L["price_size"] * 0.82), "%s%s%%" % (arrow, pct),
               font=f_pct, fill=(RED if e.get("up") else GREEN), anchor="rm")
        # 訊號標籤（金色框），無訊號顯示灰字說明。
        # 標籤列不可跨欄：預設自股名起排；放不下就改自排名起排，仍放不下則逐級縮字。
        sigs = [SIGNAL_LABELS[s] for s in e.get("signals", []) if s in SIGNAL_LABELS][:5]
        py = y + rh * 0.30 + L["name_size"] * 0.9 + 6
        if sigs:
            def pills_width(font, size):
                pad = int(size * 0.55) * 2
                return sum(d.textlength(s, font=font) + pad for s in sigs) + 8 * (len(sigs) - 1)
            psize = L["pill_size"]
            fp = f_pill
            sx = nx
            if pills_width(fp, psize) > x + col_w - nx:
                sx = x  # 自排名起排，用滿整欄寬
                while psize > 11 and pills_width(fp, psize) > col_w:
                    psize -= 1
                    fp = F["cjk_r"](psize)
            pad_x, pad_y = int(psize * 0.55), int(psize * 0.32)
            for s in sigs:
                tw = d.textlength(s, font=fp)
                bw = tw + pad_x * 2
                d.rounded_rectangle([sx, py, sx + bw, py + psize + pad_y * 2],
                                    radius=5, outline=GOLD, width=1)
                d.text((sx + bw / 2, py + (psize + pad_y * 2) / 2 + 1), s,
                       font=fp, fill=GOLD, anchor="mm")
                sx += bw + 8
        else:
            d.text((nx, py + L["pill_size"] * 0.8), "本期無符合訊號", font=f_none,
                   fill=GRAY_DIM, anchor="lm")
        if row < 4:
            d.line([x, y + rh - 6, x + col_w, y + rh - 6], fill=(255, 255, 255, 16), width=1)

    # ── 頁尾 ──
    d.line([M, L["foot_rule_y"], w - M, L["foot_rule_y"]], fill=GOLD_RULE, width=2)
    flogo = int(L["logo"] * 0.8)
    draw_logo(img, d, M, L["foot_y"], flogo, F)
    d.text((M + flogo + 14, L["foot_y"] + flogo / 2), "艾倫報報 ALLEN I³ AURORA",
           font=F["cjk_b"](L["brand_size"]), fill=GOLD, anchor="lm")
    d.text((w - M, L["disc_y"]), "資料來源：TWSE / TPEx / Goodinfo! 台灣股市資訊網 ・ 僅供研究參考，非投資建議",
           font=F["cjk_r"](L["note_size"] + 2), fill=GRAY, anchor="rm")

    out = os.path.join(out_dir, "StockRadar_%s_%s.png" % (fmt.upper(), data["date"]))
    img.save(out, "PNG")
    print("已輸出", out, "%dx%d" % img.size)
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "stockradar.sample.json"
    which = (sys.argv[2] if len(sys.argv) > 2 else "both").lower()
    out_dir = sys.argv[3] if len(sys.argv) > 3 else "."
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    if len(data.get("entries", [])) != 10:
        print("警告：entries 應為 10 檔，目前 %d 檔。" % len(data.get("entries", [])))
    F = load_fonts()
    fmts = ["fb", "ig"] if which == "both" else [which]
    for fmt in fmts:
        render(fmt, data, out_dir, F)


if __name__ == "__main__":
    main()
