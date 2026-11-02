import sys
from taiex_heatmap_bymarket import render_market
from taiex_data import DATA_TWSE, DATA_TPEX

which = sys.argv[1]
jobs = {
    "twse_fb": (DATA_TWSE, 1200, 630, "taiex_heatmap_twse_facebook.png", "上市大型股熱力圖", "台股上市(TWSE) 市值前100大代表股", 100),
    "twse_ig": (DATA_TWSE, 1080, 1080, "taiex_heatmap_twse_instagram.png", "上市大型股熱力圖", "台股上市(TWSE) 市值前100大代表股", 100),
    "tpex_fb": (DATA_TPEX, 1200, 630, "taiex_heatmap_tpex_facebook.png", "上櫃大型股熱力圖", "台股上櫃(TPEx) 市值前50大代表股", 50),
    "tpex_ig": (DATA_TPEX, 1080, 1080, "taiex_heatmap_tpex_instagram.png", "上櫃大型股熱力圖", "台股上櫃(TPEx) 市值前50大代表股", 50),
}
DATA, W, H, out_path, title, sub, n = jobs[which]
render_market(DATA, W, H, out_path, title, sub, n)
