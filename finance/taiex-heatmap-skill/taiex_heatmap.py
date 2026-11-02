#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股(TAIEX)類股熱力圖 - 台灣慣例配色（紅漲、綠跌）
文字大小依市值權重分級，並自動避免文字溢出/重疊
輸出 Facebook (1200x630) 與 Instagram (1080x1080) 兩種版型
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.textpath import TextPath
import squarify
import os

# ---------- 中文字型：Noto Sans CJK TC（乾淨、清晰、辨識度高） ----------
REG_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
BOLD_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
if not os.path.exists(REG_PATH):
    REG_PATH = BOLD_PATH = fm.findfont(fm.FontProperties(family="sans-serif"))

_REG_PROP = fm.FontProperties(fname=REG_PATH)
_BOLD_PROP = fm.FontProperties(fname=BOLD_PATH) if os.path.exists(BOLD_PATH) else _REG_PROP

def fp(size, weight="normal"):
    base = _BOLD_PROP if weight == "bold" else _REG_PROP
    prop = base.copy()
    prop.set_size(size)
    return prop

PX_PER_PT = 200 / 72  # dpi/72：字級(pt) 換算成畫布像素/資料座標高度
_PT2PX = PX_PER_PT * 1.08  # 寬度量測另加一點安全邊界，避免貼邊
_WIDTH_CACHE = {}

def text_width_px(text, fs, weight="normal"):
    key = (text, weight)
    w100 = _WIDTH_CACHE.get(key)
    if w100 is None:
        prop = _BOLD_PROP if weight == "bold" else _REG_PROP
        tp = TextPath((0, 0), text, size=100, prop=prop)
        w100 = tp.get_extents().width
        _WIDTH_CACHE[key] = w100
    return w100 * (fs / 100.0) * _PT2PX

def fs_for_height(height_px, factor=0.82):
    """像素高度上限 -> 對應的最大字級(pt)。字級(pt)換算像素高度需乘 dpi/72，
    這裡反向換算，避免各處直接把像素當字級使用而造成文字溢出。"""
    return max(0, height_px / (PX_PER_PT * factor))


def fit_fontsize(text, max_width_px, start_fs, weight="normal", min_fs=7):
    # 字寬與字級成線性比例，量測一次參考字級即可代數求解，
    # 避免逐步縮小字級時重複解析大型 CJK 字型檔（先前導致渲染逾時卡死）。
    ref_fs = 100.0
    w_ref = text_width_px(text, ref_fs, weight)
    if w_ref <= 0:
        return start_fs
    target_fs = max_width_px * ref_fs / w_ref
    return max(min_fs, min(start_fs, target_fs))

# ---------- 資料 (2026/07/08 收盤，個股權重為版面示意市值比重，非精確數字) ----------
DATE_STR = "07/08（三）"
INDEX_VAL = "45,734.41"
INDEX_CHG = "+255.30 (+0.56%)"
VOLUME = "量9,583億"

DATA = {
    "半導體": [
        ("2330", "台積電", 15.0, 1.02),
        ("2454", "聯發科", 3.5, -0.87),
        ("2303", "聯電", 2.0, 0.31),
        ("3711", "日月光", 1.5, 0.52),
        ("6488", "環球晶", 1.0, -0.40),
    ],
    "電子代工/零組件": [
        ("2317", "鴻海", 8.0, 0.21),
        ("2308", "台達電", 3.5, 0.26),
        ("2382", "廣達", 3.0, 1.07),
        ("4938", "和碩", 1.5, 0.32),
    ],
    "金融保險": [
        ("2881", "富邦金", 4.5, 1.22),
        ("2882", "國泰金", 4.0, 1.31),
        ("2891", "中信金", 3.5, 1.05),
        ("2884", "玉山金", 3.0, 0.92),
        ("2886", "兆豐金", 3.0, 1.10),
    ],
    "塑膠化工": [
        ("1303", "南亞", 3.5, 10.00),
        ("1301", "台塑", 3.0, 1.45),
        ("1326", "台化", 2.5, 1.18),
    ],
    "航運": [
        ("2603", "長榮", 3.5, 4.26),
        ("2609", "陽明", 2.25, 2.45),
        ("2615", "萬海", 2.25, 1.98),
    ],
    "電信": [
        ("2412", "中華電", 6.5, -0.48),
        ("4904", "遠傳", 6.5, -9.20),
    ],
    "鋼鐵/傳產": [
        ("2002", "中鋼", 6.0, 0.17),
        ("1216", "統一", 5.0, 0.28),
    ],
    "面板/光電": [
        ("2409", "友達", 4.0, 0.48),
        ("3481", "群創", 4.0, 0.82),
        ("3008", "大立光", 3.5, -0.55),
    ],
}

MAX_WEIGHT = max(s[2] for stocks in DATA.values() for s in stocks)

BG = "#0a0d11"
HEADER_BG = "#161a20"
FOOTER_BG = "#161a20"
SECTOR_HDR_BG = "#10141a"
ACCENT = "#ffb020"

# 台灣慣例：紅漲、綠跌 —— 只要上漲就是紅色、只要下跌就是綠色，不使用中性灰
# （即使漲跌幅很小也維持紅／綠色相，不會因接近平盤而變成灰色）。
# 台股漲跌幅限制為 ±10%（漲停 / 跌停），單邊10個百分點；每邊各分5階、
# 每階2個百分點，由淺至深依漲跌幅擴大而加深，兩邊合計正好對應
# 20個百分點（±10%）的滿刻度。
RED_BANDS = [   # 上漲：淺紅 -> 深紅
    (0.0, 2.0, (214, 120, 110)),
    (2.0, 4.0, (196, 90, 78)),
    (4.0, 6.0, (170, 60, 52)),
    (6.0, 8.0, (148, 30, 28)),
    (8.0, 10.01, (128, 8, 10)),
]
GREEN_BANDS = [  # 下跌：淺綠 -> 深綠
    (0.0, 2.0, (110, 190, 140)),
    (2.0, 4.0, (78, 170, 112)),
    (4.0, 6.0, (55, 140, 90)),
    (6.0, 8.0, (28, 110, 65)),
    (8.0, 10.01, (8, 80, 44)),
]
LIMIT_PCT = 10.0  # 漲跌停限制


def color_for(pct, cap=LIMIT_PCT):
    p = max(-cap, min(cap, pct))
    bands = RED_BANDS if p >= 0 else GREEN_BANDS
    mag = abs(p)
    for lo, hi, rgb in bands:
        if lo <= mag < hi:
            return (rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    rgb = bands[-1][2]
    return (rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)


# 圖例用色（取深紅／深綠代表最高階）
UP_COLOR = RED_BANDS[-1][2]
DOWN_COLOR = GREEN_BANDS[-1][2]


def layout_treemap(sizes, x, y, dx, dy):
    norm = squarify.normalize_sizes(sizes, dx, dy)
    return squarify.squarify(norm, x, y, dx, dy)


def render(W, H, out_path, mode="fb"):
    dpi = 200
    fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.axis("off")

    # ---- 頂部細緻強調線 ----
    ax.add_patch(plt.Rectangle((0, 0), W, 4, color=ACCENT, zorder=3))

    # ---- Title bar ----
    title_h = 112 if mode == "fb" else 152
    ax.add_patch(plt.Rectangle((0, 4), W, title_h - 4, color=HEADER_BG, zorder=1))

    title_fs = 27 if mode == "fb" else 32
    sub_fs = 12 if mode == "fb" else 14
    right_fs1 = 20 if mode == "fb" else 24
    legend_fs = 12 if mode == "fb" else 14

    row1_y = title_h * 0.36
    row2_y = title_h * 0.76

    # 標題列只放標題與 TAIEX 標誌，兩者都很短，任何版型都不會相撞
    ax.text(24, row1_y, "台股類股熱力圖", fontproperties=fp(title_fs, "bold"),
             color="white", va="center", ha="left", zorder=2)
    ax.text(W - 24, row1_y, "TAIEX", fontproperties=fp(right_fs1, "bold"),
             color="#4ea1ff", va="center", ha="right", zorder=2)

    # ---- 圖例（放第二列右側，先畫出來量出寬度，再回頭限制左側指數文字的可用寬度） ----
    sw = 13
    cursor = W - 24
    w_down = text_width_px("下跌", legend_fs)
    swatch_down_x = cursor - w_down - 8 - sw
    cursor2 = swatch_down_x - 16
    w_up = text_width_px("上漲", legend_fs)
    swatch_up_x = cursor2 - w_up - 8 - sw
    legend_left_edge = swatch_up_x - 20

    ax.text(W - 24, row2_y, "下跌", fontproperties=fp(legend_fs), color="#c7d0d9",
             va="center", ha="right", zorder=2)
    ax.add_patch(plt.Rectangle((swatch_down_x, row2_y - sw / 2), sw, sw,
                                color=[c / 255 for c in DOWN_COLOR], zorder=2))
    ax.text(cursor2, row2_y, "上漲", fontproperties=fp(legend_fs), color="#c7d0d9",
             va="center", ha="right", zorder=2)
    ax.add_patch(plt.Rectangle((swatch_up_x, row2_y - sw / 2), sw, sw,
                                color=[c / 255 for c in UP_COLOR], zorder=2))

    sub_text = f"加權指數 {INDEX_VAL}   {INDEX_CHG}   ·   {DATE_STR}   ·   {VOLUME}"
    sub_fs_fit = fit_fontsize(sub_text, legend_left_edge - 24 - 16, sub_fs, min_fs=9)
    ax.text(24, row2_y, sub_text,
             fontproperties=fp(sub_fs_fit), color="#c7d0d9", va="center", ha="left", zorder=2)

    footer_h = 42 if mode == "fb" else 58
    chart_top = title_h + 8
    chart_h = H - chart_top - footer_h - 6

    # ---- Sector-level treemap ----
    sector_names = list(DATA.keys())
    sector_sizes = [sum(s[2] for s in DATA[name]) for name in sector_names]
    sector_rects = layout_treemap(sector_sizes, 4, chart_top, W - 8, chart_h)

    pad = 7
    header_h = 25 if mode == "fb" else 29

    # 市值→字級 對照範圍（明確依權重分級，越大市值字越大）
    NAME_FS_MIN, NAME_FS_MAX = (10, 34) if mode == "fb" else (11, 38)

    for name, rect in zip(sector_names, sector_rects):
        sx, sy, sdx, sdy = rect["x"] + pad, rect["y"] + pad, rect["dx"] - 2 * pad, rect["dy"] - 2 * pad
        if sdx <= 4 or sdy <= 4:
            continue
        hh = min(header_h, max(0, sdy * 0.24))
        hdr_patch = plt.Rectangle((sx, sy), sdx, hh, color=SECTOR_HDR_BG, zorder=2)
        ax.add_patch(hdr_patch)
        fsize_base = 13 if mode == "fb" else 15
        if sdx < 110:
            fsize_base = 10
        fsize_cap = min(fsize_base, fs_for_height(hh * 0.86))
        if fsize_cap >= 6.5:
            fsize = fit_fontsize(name, sdx - 12, fsize_cap, weight="bold", min_fs=6.5)
            hdr_txt = ax.text(sx + 7, sy + hh / 2, name, fontproperties=fp(fsize, "bold"),
                     color="#eef2f6", va="center", ha="left", zorder=3)
            hdr_txt.set_clip_path(hdr_patch)
        # 細分隔線讓相鄰產業類別更清楚
        ax.add_patch(plt.Rectangle((sx, sy), sdx, sdy, fill=False,
                                    edgecolor="#020304", linewidth=1.4, zorder=4))

        stocks = DATA[name]
        stock_sizes = [s[2] for s in stocks]
        inner_y = sy + hh
        inner_h = sdy - hh
        if inner_h <= 2:
            continue
        stock_rects = layout_treemap(stock_sizes, sx, inner_y, sdx, inner_h)
        for (code, sname, w, pct), r in zip(stocks, stock_rects):
            rx, ry, rdx, rdy = r["x"] + 4, r["y"] + 4, r["dx"] - 8, r["dy"] - 8
            if rdx <= 0 or rdy <= 0:
                continue
            cell_patch = plt.Rectangle((rx, ry), rdx, rdy, facecolor=color_for(pct),
                                        edgecolor=BG, linewidth=1.3, zorder=2)
            ax.add_patch(cell_patch)
            cy = ry + rdy / 2
            pct_str = f"{pct:+.2f}%"

            # 依市值權重決定「目標」字級（市值越大字越大），再以可用空間收斂避免溢出
            weight_scale = (w / MAX_WEIGHT) ** 0.55
            name_fs_target = NAME_FS_MIN + (NAME_FS_MAX - NAME_FS_MIN) * weight_scale

            if rdx >= 40 and rdy >= 34:
                name_fs = fit_fontsize(sname, rdx - 8, name_fs_target, weight="bold", min_fs=8)
                pct_fs_target = max(8, name_fs * 0.62)
                pct_fs = fit_fontsize(pct_str, rdx - 8, pct_fs_target, min_fs=7)
                # 字級(pt) -> 實際像素高度需乘上 dpi/72；先前遺漏此換算導致名稱與漲跌幅文字重疊
                name_h_px = name_fs * PX_PER_PT * 0.82
                pct_h_px = pct_fs * PX_PER_PT * 0.82
                line_gap = 3
                need_h = name_h_px + pct_h_px + line_gap
                if rdy >= need_h:
                    name_y = cy - need_h / 2 + name_h_px / 2
                    pct_y = cy + need_h / 2 - pct_h_px / 2
                    t1 = ax.text(rx + rdx / 2, name_y, sname,
                                  fontproperties=fp(name_fs, "bold"), color="white",
                                  va="center", ha="center", zorder=3)
                    t2 = ax.text(rx + rdx / 2, pct_y, pct_str,
                                  fontproperties=fp(pct_fs), color="white",
                                  va="center", ha="center", zorder=3)
                    t1.set_clip_path(cell_patch)
                    t2.set_clip_path(cell_patch)
                else:
                    fs_cap = min(name_fs_target, fs_for_height(rdy - 6))
                    combo = f"{sname}  {pct_str}"
                    fs_combo = fit_fontsize(combo, rdx - 10, fs_cap, weight="bold", min_fs=0.1)
                    if fs_combo >= 8:
                        t3 = ax.text(rx + rdx / 2, cy, combo, fontproperties=fp(fs_combo, "bold"),
                                      color="white", va="center", ha="center", zorder=3)
                        t3.set_clip_path(cell_patch)
                    else:
                        fs_single = fit_fontsize(pct_str, rdx - 8, fs_cap, min_fs=7)
                        t3 = ax.text(rx + rdx / 2, cy, pct_str, fontproperties=fp(fs_single, "bold"),
                                      color="white", va="center", ha="center", zorder=3)
                        t3.set_clip_path(cell_patch)
            elif rdx >= 22 and rdy >= 15:
                fs_cap = min(13, fs_for_height(rdy - 4))
                fs_single = fit_fontsize(pct_str, rdx - 6, fs_cap, min_fs=6.5)
                t3 = ax.text(rx + rdx / 2, cy, pct_str, fontproperties=fp(fs_single),
                              color="white", va="center", ha="center", zorder=3)
                t3.set_clip_path(cell_patch)

    # ---- Footer ----
    ax.add_patch(plt.Rectangle((0, H - footer_h), W, footer_h, color=FOOTER_BG, zorder=1))
    disclaimer = "資料來源：公開財經報導整理；文字大小依個股市值權重分級，僅供參考，不構成投資建議"
    disc_fs = fit_fontsize(disclaimer, W - 32, 11 if mode == "fb" else 12, min_fs=7)
    ax.text(16, H - footer_h / 2, disclaimer,
             fontproperties=fp(disc_fs), color="#8b95a1", va="center", ha="left", zorder=2)

    fig.savefig(out_path, facecolor=BG, dpi=dpi)
    plt.close(fig)
    print("saved", out_path)


if __name__ == "__main__":
    render(1200, 630, "taiex_heatmap_facebook.png", mode="fb")
    render(1080, 1080, "taiex_heatmap_instagram.png", mode="ig")
