#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
上市(TWSE) / 上櫃(TPEx) 大型股熱力圖
沿用 taiex_heatmap.py 已驗證過的字型/配色/防重疊邏輯，套用到兩個較大的資料集，
並輸出可供 Facebook (1200x630) 及 Instagram (1080x1080) 分享的版型，
右下角加註「艾倫報報 ALLEN I3 AURORA」品牌圖卡。
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
import datetime
import os

from taiex_heatmap import (
    fp, fit_fontsize, text_width_px, layout_treemap, PX_PER_PT, fs_for_height,
    color_for, UP_COLOR, DOWN_COLOR,
    BG, HEADER_BG, FOOTER_BG, SECTOR_HDR_BG, ACCENT,
)
from taiex_data import DATA_TWSE, DATA_TPEX

# 交易日日期：預設抓今天，但因收盤資料通常是「最近一個已收盤的交易日」
# （例如週一早上執行時，最新收盤其實是上週五），可用環境變數 TAIEX_TRADE_DATE
# 覆寫（格式 YYYY-MM-DD），對應 taiex_data.py 內填入的漲跌幅究竟是哪一天的數字。
_WEEKDAY_CJK = ["一", "二", "三", "四", "五", "六", "日"]
_trade_date_env = os.environ.get("TAIEX_TRADE_DATE")
if _trade_date_env:
    _d = datetime.date.fromisoformat(_trade_date_env)
else:
    _d = datetime.date.today()
DATE_STR = f"{_d.month:02d}/{_d.day:02d}（{_WEEKDAY_CJK[_d.weekday()]}）"

# 區塊面積 = 市值權重 ^ AREA_POWER：因台股市值集中度極高（如台積電單一個股
# 市值權重可達 40%+），若面積與市值權重完全線性呈現，其餘個股方塊將小到
# 無法辨識。採冪次壓縮後仍維持「權重越大方塊越大」的單調關係，兼顧比例
# 呈現與版面可讀性。
AREA_POWER = 0.62

BRAND_LOCKUP = "brand_lockup.png"


def render_market(DATA, W, H, out_path, main_title, subtitle, stock_count):
    dpi = 200
    scale = W / 1920.0  # 以 1920 寬的版面參數為基準，依畫布寬度等比縮放

    fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    ax.axis("off")

    margin = 26 * scale

    ax.add_patch(plt.Rectangle((0, 0), W, 5 * scale, color=ACCENT, zorder=3))

    title_h = 118 * scale
    ax.add_patch(plt.Rectangle((0, 5 * scale), W, title_h - 5 * scale, color=HEADER_BG, zorder=1))

    title_fs = 30 * scale
    sub_fs = 15 * scale
    right_fs1 = 22 * scale
    legend_fs = 14 * scale

    row1_y = title_h * 0.34
    row2_y = title_h * 0.74

    ax.text(margin, row1_y, main_title, fontproperties=fp(title_fs, "bold"),
             color="white", va="center", ha="left", zorder=2)
    ax.text(W - margin, row1_y, "TAIEX", fontproperties=fp(right_fs1, "bold"),
             color="#4ea1ff", va="center", ha="right", zorder=2)

    sw = 14 * scale
    cursor = W - margin
    w_down = text_width_px("下跌", legend_fs)
    swatch_down_x = cursor - w_down - 8 * scale - sw
    cursor2 = swatch_down_x - 16 * scale
    w_up = text_width_px("上漲", legend_fs)
    swatch_up_x = cursor2 - w_up - 8 * scale - sw
    legend_left_edge = swatch_up_x - 20 * scale

    ax.text(W - margin, row2_y, "下跌", fontproperties=fp(legend_fs), color="#c7d0d9",
             va="center", ha="right", zorder=2)
    ax.add_patch(plt.Rectangle((swatch_down_x, row2_y - sw / 2), sw, sw,
                                color=[c / 255 for c in DOWN_COLOR], zorder=2))
    ax.text(cursor2, row2_y, "上漲", fontproperties=fp(legend_fs), color="#c7d0d9",
             va="center", ha="right", zorder=2)
    ax.add_patch(plt.Rectangle((swatch_up_x, row2_y - sw / 2), sw, sw,
                                color=[c / 255 for c in UP_COLOR], zorder=2))

    sub_text = f"{subtitle}   ·   {DATE_STR}   ·   共 {stock_count} 檔"
    sub_fs_fit = fit_fontsize(sub_text, legend_left_edge - margin - 16 * scale, sub_fs, min_fs=9 * scale)
    ax.text(margin, row2_y, sub_text, fontproperties=fp(sub_fs_fit), color="#c7d0d9",
             va="center", ha="left", zorder=2)

    footer_h = 78 * scale
    chart_top = title_h + 8 * scale
    chart_h = H - chart_top - footer_h - 6 * scale

    sector_names = list(DATA.keys())
    sector_mcap = [sum(s[2] for s in DATA[name]) for name in sector_names]
    sector_sizes = [m ** AREA_POWER for m in sector_mcap]
    sector_rects = layout_treemap(sector_sizes, 4 * scale, chart_top, W - 8 * scale, chart_h)

    pad = 6 * scale
    header_h = 24 * scale

    MAX_WEIGHT = max(s[2] for stocks in DATA.values() for s in stocks)
    NAME_FS_MIN, NAME_FS_MAX = 8 * scale, 40 * scale

    for name, rect in zip(sector_names, sector_rects):
        sx, sy, sdx, sdy = rect["x"] + pad, rect["y"] + pad, rect["dx"] - 2 * pad, rect["dy"] - 2 * pad
        if sdx <= 4 or sdy <= 4:
            continue
        hh = min(header_h, max(0, sdy * 0.22))
        hdr_patch = plt.Rectangle((sx, sy), sdx, hh, color=SECTOR_HDR_BG, zorder=2)
        ax.add_patch(hdr_patch)
        fsize_base = (9 if sdx < 100 * scale else 12) * scale
        fsize_cap = min(fsize_base, fs_for_height(hh * 0.86))
        if fsize_cap >= 6.5 * scale:
            fsize = fit_fontsize(name, sdx - 10 * scale, fsize_cap, weight="bold", min_fs=6.5 * scale)
            hdr_txt = ax.text(sx + 6 * scale, sy + hh / 2, name, fontproperties=fp(fsize, "bold"),
                     color="#eef2f6", va="center", ha="left", zorder=3)
            hdr_txt.set_clip_path(hdr_patch)
        ax.add_patch(plt.Rectangle((sx, sy), sdx, sdy, fill=False,
                                    edgecolor="#020304", linewidth=1.2, zorder=4))

        stocks = DATA[name]
        stock_sizes = [s[2] ** AREA_POWER for s in stocks]
        inner_y = sy + hh
        inner_h = sdy - hh
        if inner_h <= 2:
            continue
        stock_rects = layout_treemap(stock_sizes, sx, inner_y, sdx, inner_h)
        for (code, sname, w, pct), r in zip(stocks, stock_rects):
            rx, ry, rdx, rdy = r["x"] + 2.5 * scale, r["y"] + 2.5 * scale, r["dx"] - 5 * scale, r["dy"] - 5 * scale
            if rdx <= 0 or rdy <= 0:
                continue
            cell_patch = plt.Rectangle((rx, ry), rdx, rdy, facecolor=color_for(pct),
                                        edgecolor=BG, linewidth=1.0, zorder=2)
            ax.add_patch(cell_patch)
            cy = ry + rdy / 2
            pct_str = f"{pct:+.2f}%"

            weight_scale = (w / MAX_WEIGHT) ** 0.55
            name_fs_target = NAME_FS_MIN + (NAME_FS_MAX - NAME_FS_MIN) * weight_scale

            if rdx >= 34 * scale and rdy >= 28 * scale:
                name_fs = fit_fontsize(sname, rdx - 6 * scale, name_fs_target, weight="bold", min_fs=7 * scale)
                pct_fs_target = max(7 * scale, name_fs * 0.6)
                pct_fs = fit_fontsize(pct_str, rdx - 6 * scale, pct_fs_target, min_fs=6.5 * scale)
                name_h_px = name_fs * PX_PER_PT * 0.82
                pct_h_px = pct_fs * PX_PER_PT * 0.82
                need_h = name_h_px + pct_h_px + 2 * scale
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
                    fs_cap = min(name_fs_target, fs_for_height(rdy - 4 * scale))
                    combo = f"{sname}  {pct_str}"
                    fs_combo = fit_fontsize(combo, rdx - 10 * scale, fs_cap, weight="bold", min_fs=0.1)
                    if fs_combo >= 8 * scale:
                        t3 = ax.text(rx + rdx / 2, cy, combo, fontproperties=fp(fs_combo, "bold"),
                                      color="white", va="center", ha="center", zorder=3)
                        t3.set_clip_path(cell_patch)
                    else:
                        fs_single = fit_fontsize(pct_str, rdx - 6 * scale, fs_cap, min_fs=6.5 * scale)
                        t3 = ax.text(rx + rdx / 2, cy, pct_str, fontproperties=fp(fs_single, "bold"),
                                      color="white", va="center", ha="center", zorder=3)
                        t3.set_clip_path(cell_patch)
            elif rdx >= 16 * scale and rdy >= 12 * scale:
                fs_cap = min(11 * scale, fs_for_height(rdy - 3 * scale))
                fs_single = fit_fontsize(pct_str, rdx - 4 * scale, fs_cap, min_fs=6 * scale)
                t3 = ax.text(rx + rdx / 2, cy, pct_str, fontproperties=fp(fs_single),
                              color="white", va="center", ha="center", zorder=3)
                t3.set_clip_path(cell_patch)

    ax.add_patch(plt.Rectangle((0, H - footer_h), W, footer_h, color=FOOTER_BG, zorder=1))
    disc_line1 = "資料來源：公開財經報導之市值權重與名單整理，因交易所即時市值排行為動態網頁無法逐檔擷取，名單與排序為概略示意、非官方精確名次"
    disc_line2 = "方塊大小約略反映市值比例（經壓縮處理以利閱讀）；漲跌幅除少數已標註來源者外為同類股模擬示意值，僅供參考，不構成投資建議"
    disc_avail_w = W - 18 * scale * 2 - 190 * scale  # 右側預留品牌圖卡空間
    disc_fs1 = fit_fontsize(disc_line1, disc_avail_w, 12 * scale, min_fs=6.5 * scale)
    disc_fs2 = fit_fontsize(disc_line2, disc_avail_w, 12 * scale, min_fs=6.5 * scale)
    disc_fs = min(disc_fs1, disc_fs2)
    ax.text(18 * scale, H - footer_h * 0.68, disc_line1,
             fontproperties=fp(disc_fs), color="#8b95a1", va="center", ha="left", zorder=2)
    ax.text(18 * scale, H - footer_h * 0.28, disc_line2,
             fontproperties=fp(disc_fs), color="#8b95a1", va="center", ha="left", zorder=2)

    fig.savefig(out_path, facecolor=BG, dpi=dpi)
    plt.close(fig)

    # ---- 貼上品牌圖卡（艾倫報報 ALLEN I3 AURORA）於右下角 ----
    base = Image.open(out_path).convert("RGBA")
    logo = Image.open(BRAND_LOCKUP).convert("RGBA")
    target_h = int(footer_h * 0.66)
    ratio = target_h / logo.height
    logo = logo.resize((int(logo.width * ratio), target_h), Image.LANCZOS)
    lx = base.width - logo.width - int(16 * scale)
    ly = base.height - int(footer_h) + (int(footer_h) - target_h) // 2
    base.alpha_composite(logo, (lx, ly))
    base.convert("RGB").save(out_path)

    print("saved", out_path, "stocks:", stock_count, "size:", (W, H))


if __name__ == "__main__":
    n_twse = sum(len(v) for v in DATA_TWSE.values())
    n_tpex = sum(len(v) for v in DATA_TPEX.values())
    assert n_twse == 100, f"上市家數錯誤：{n_twse}"
    assert n_tpex == 50, f"上櫃家數錯誤：{n_tpex}"

    jobs = [
        (DATA_TWSE, "上市大型股熱力圖", "台股上市(TWSE) 市值前100大代表股", n_twse, "twse"),
        (DATA_TPEX, "上櫃大型股熱力圖", "台股上櫃(TPEx) 市值前50大代表股", n_tpex, "tpex"),
    ]
    sizes = [(1200, 630, "facebook"), (1080, 1080, "instagram")]

    for DATA, main_title, subtitle, n, tag in jobs:
        for W, H, fmt in sizes:
            out_path = f"taiex_heatmap_{tag}_{fmt}.png"
            render_market(DATA, W, H, out_path, main_title, subtitle, n)
