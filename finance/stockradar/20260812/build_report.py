#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, os

TARGET_DATE = "2026-08-12"
WEEKDAY = "星期三"
DATA_DATE = "2026-08-11"
DATA_WEEKDAY = "星期二"

stocks = [
  {"rank":1,"code":"2059","name":"川湖科技股份有限公司(川湖)","industry":"電子零組件業","price":12315,"chg_pct":3.44,
   "k":93.41,"d":85.71,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":1,"small_w":5,"ma_bull":True,
   "op_ok":True,"op_r":"4/4","rev_ok":True,"rev_r":"4/4","eps_ok":True,"eps_r":"4/4",
   "src_price":"TWSE","notes":""},
  {"rank":2,"code":"2395","name":"研華股份有限公司(研華)","industry":"電腦及週邊設備業","price":661,"chg_pct":-0.90,
   "k":75.42,"d":69.77,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":0,"small_w":0,"ma_bull":True,
   "op_ok":True,"op_r":"4/4","rev_ok":False,"rev_r":"1/4","eps_ok":True,"eps_r":"4/4",
   "src_price":"TWSE","notes":""},
  {"rank":3,"code":"2603","name":"長榮海運股份有限公司(長榮)","industry":"航運業","price":218,"chg_pct":1.87,
   "k":84.82,"d":77.33,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":5,"small_w":0,"ma_bull":False,
   "op_ok":True,"op_r":"3/4","rev_ok":False,"rev_r":"0/4","eps_ok":False,"eps_r":"0/4",
   "src_price":"TWSE","notes":"2026Q2財報尚未公告(董事會排定08/13),採用近4個已公告季度(26Q1、25Q4、25Q3、25Q2);受去年運價高基期影響,營收與EPS年增為負;月線<季線,均線未呈多頭排列"},
  {"rank":4,"code":"3293","name":"鈊象電子股份有限公司(鈊象)","industry":"文化創意業","price":804,"chg_pct":1.52,
   "k":89.70,"d":84.42,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":0,"small_w":0,"ma_bull":False,
   "op_ok":True,"op_r":"4/4","rev_ok":False,"rev_r":"1/4","eps_ok":True,"eps_r":"3/4",
   "src_price":"TPEx","notes":"上櫃股,KD以TPEx資料計算;2026Q2尚未公告,採用26Q1、25Q4、25Q3、25Q2"},
  {"rank":5,"code":"1303","name":"南亞塑膠工業股份有限公司(南亞)","industry":"塑膠工業","price":190,"chg_pct":2.70,
   "k":81.61,"d":66.02,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":0,"small_w":3,"ma_bull":False,
   "op_ok":False,"op_r":"0/4","rev_ok":False,"rev_r":"0/4","eps_ok":True,"eps_r":"3/4",
   "src_price":"TWSE","notes":"月線箭頭↘,均線未呈多頭排列;EPS年增比較基期偏低(25Q1=0.06元、25Q4=0.04元、25Q3=0.01元,皆<0.1元),成長率參考性低"},
  {"rank":6,"code":"1717","name":"長興材料工業股份有限公司(長興)","industry":"化學工業","price":71.9,"chg_pct":2.71,
   "k":88.87,"d":78.68,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":1,"small_w":0,"ma_bull":False,
   "op_ok":False,"op_r":"0/4","rev_ok":False,"rev_r":"0/4","eps_ok":True,"eps_r":"3/4",
   "src_price":"TWSE","notes":"月線<季線且季線箭頭↘,均線未呈多頭排列"},
  {"rank":7,"code":"2637","name":"慧洋海運股份有限公司(慧洋-KY)","industry":"航運業","price":87.3,"chg_pct":-0.91,
   "k":85.07,"d":76.17,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":1,"small_w":0,"ma_bull":True,
   "op_ok":True,"op_r":"4/4","rev_ok":False,"rev_r":"1/4","eps_ok":False,"eps_r":"2/4",
   "src_price":"TWSE","notes":"2026Q1 EPS去年同期基期為負(2025Q1 EPS=-0.24元),成長率以「轉正」認定達標;2026Q2尚未公告,採用26Q1、25Q4、25Q3、25Q2"},
  {"rank":8,"code":"2383","name":"台光電子材料股份有限公司(台光電)","industry":"電子零組件業","price":5535,"chg_pct":4.63,
   "k":88.91,"d":79.60,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":0,"small_w":2,"ma_bull":False,
   "op_ok":True,"op_r":"4/4","rev_ok":True,"rev_r":"4/4","eps_ok":True,"eps_r":"4/4",
   "src_price":"TWSE","notes":"月線<季線,均線未呈嚴格多頭排列,惟基本面三項指標近4季全數達標"},
  {"rank":9,"code":"2454","name":"聯發科技股份有限公司(聯發科)","industry":"半導體業","price":4020,"chg_pct":1.52,
   "k":83.05,"d":75.22,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":1,"small_w":0,"ma_bull":False,
   "op_ok":True,"op_r":"4/4","rev_ok":False,"rev_r":"0/4","eps_ok":False,"eps_r":"0/4",
   "src_price":"TWSE","notes":"月線<季線,均線未呈多頭排列;近4季營收與EPS較去年同期呈小幅衰退"},
  {"rank":10,"code":"6213","name":"聯茂電子股份有限公司(聯茂)","industry":"電子零組件業","price":452,"chg_pct":5.73,
   "k":89.67,"d":72.94,"k_gt_50":True,"k_gt_d":True,"golden_cross":False,
   "big_w":1,"small_w":0,"ma_bull":True,
   "op_ok":False,"op_r":"1/4","rev_ok":False,"rev_r":"2/4","eps_ok":True,"eps_r":"3/4",
   "src_price":"TWSE","notes":""},
]

def comment(s):
    parts = []
    if s["chg_pct"] > 0:
        parts.append(f"今日上漲{s['chg_pct']:.2f}%")
    elif s["chg_pct"] < 0:
        parts.append(f"今日下跌{abs(s['chg_pct']):.2f}%")
    else:
        parts.append("今日平盤")
    if s["k"] > 80:
        parts.append(f"KD高檔鈍化區(K={s['k']:.1f})")
    elif s["k_gt_d"]:
        parts.append(f"K({s['k']:.1f})上穿D({s['d']:.1f}),短線動能偏多")
    else:
        parts.append(f"K({s['k']:.1f})低於D({s['d']:.1f}),短線動能偏弱")
    if s["ma_bull"]:
        parts.append("均線呈多頭排列")
    else:
        parts.append("均線尚未呈完整多頭排列")
    ok_count = sum([s["op_ok"], s["rev_ok"], s["eps_ok"]])
    parts.append(f"基本面三項指標(營益率/營收/EPS)近4季達標{ok_count}/3項")
    return "，".join(parts) + "。（客觀技術面短評，依KD與均線資料生成，非投資建議）"

for s in stocks:
    s["comment"] = comment(s)

# ---------- Card meta JSON ----------
card_meta = {
    "target_date": TARGET_DATE,
    "weekday": WEEKDAY,
    "is_backfill": False,
    "stocks": [
        {
            "rank": s["rank"], "code": s["code"], "name": s["name"],
            "price": s["price"], "chg_pct": s["chg_pct"],
            "golden_cross": s["golden_cross"], "ma_bull": s["ma_bull"],
            "op_margin_ok": s["op_ok"], "rev_ok": s["rev_ok"], "eps_ok": s["eps_ok"],
        } for s in stocks
    ]
}
with open("stockradar_cards_meta.json", "w", encoding="utf-8") as f:
    json.dump(card_meta, f, ensure_ascii=False, indent=2)

# ---------- HTML report ----------
def yn(b):
    return '<span class="yes">是 ✓</span>' if b else '<span class="no">否 ✕</span>'

def chg_html(v):
    cls = "up" if v > 0 else ("down" if v < 0 else "flat")
    arrow = "▲" if v > 0 else ("▼" if v < 0 else "▬")
    return f'<span class="{cls}">{arrow} {v:+.2f}%</span>'

rows = ""
for s in stocks:
    rows += f"""
    <tr>
      <td>{DATA_DATE}（{DATA_WEEKDAY}）</td>
      <td class="rank-cell">{s['rank']}</td>
      <td class="code-cell">TPE:{s['code']}</td>
      <td>{s['name']}</td>
      <td>{s['industry']}</td>
      <td class="num">{s['price']:.2f}</td>
      <td class="num">{chg_html(s['chg_pct'])}</td>
      <td class="num">K={s['k']:.2f}<br>D={s['d']:.2f}<br>K&gt;50: {yn(s['k_gt_50'])}<br>K&gt;D: {yn(s['k_gt_d'])}<br>黃金交叉: {yn(s['golden_cross'])}<br><span class="src">來源:{s['src_price']}</span></td>
      <td class="num">大戶連買:{s['big_w']}週<br>散戶連買:{s['small_w']}週<br><span class="src">來源:Goodinfo</span></td>
      <td>{yn(s['ma_bull'])}<br><span class="src">來源:Goodinfo</span></td>
      <td>營益率&gt;10%: {s['op_r']} {yn(s['op_ok'])}<br>營收年增&gt;20%: {s['rev_r']} {yn(s['rev_ok'])}<br>EPS年增&gt;10%: {s['eps_r']} {yn(s['eps_ok'])}<br><span class="src">來源:Goodinfo</span>{'<br><span class="warn">⚠ '+s['notes']+'</span>' if s['notes'] else ''}</td>
      <td class="comment">{s['comment']}</td>
    </tr>"""

html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>台股每日分析報表 - TOP 10排行 {TARGET_DATE}</title>
<style>
  body {{ font-family: "Noto Sans TC","Microsoft JhengHei",sans-serif; background:#f4f6f5; color:#222; margin:0; padding:24px; }}
  h1 {{ color:#1a5c38; margin-bottom:4px; }}
  .subtitle {{ color:#555; margin-bottom:6px; }}
  .backfill-note {{ background:#fff3cd; border:1px solid #e0c36c; color:#7a5c00; padding:10px 14px; border-radius:6px; margin:10px 0 18px; font-size:14px; }}
  table {{ border-collapse: collapse; width:100%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.1); font-size:13px; }}
  th, td {{ border:1px solid #d5dbd8; padding:8px 10px; vertical-align:top; text-align:left; }}
  th {{ background:#2e7d4f; color:#fff; font-weight:600; position:sticky; top:0; }}
  td.rank-cell {{ background:#e3f3e6; font-weight:700; text-align:center; }}
  td.code-cell {{ background:#e3edf7; font-weight:700; white-space:nowrap; }}
  td.num {{ white-space:nowrap; }}
  .up {{ color:#c0392b; font-weight:700; }}       /* 台股慣例：漲=紅 */
  .down {{ color:#1e8449; font-weight:700; }}     /* 台股慣例：跌=綠 */
  .flat {{ color:#666; font-weight:700; }}
  .yes {{ color:#c0392b; font-weight:600; }}
  .no {{ color:#555; }}
  .src {{ color:#888; font-size:11px; }}
  .warn {{ color:#a15c00; font-size:11px; }}
  .comment {{ max-width:260px; font-size:12.5px; color:#333; }}
  footer {{ margin-top:28px; font-size:13px; color:#444; background:#fff; padding:18px 22px; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.08); }}
  footer h2 {{ font-size:15px; color:#1a5c38; margin-top:0; }}
  footer ul {{ margin:6px 0 14px 20px; padding:0; }}
  footer li {{ margin-bottom:4px; }}
</style>
</head>
<body>
  <h1>台股每日分析報表 - TOP 10排行</h1>
  <div class="subtitle">目標日期：{TARGET_DATE}（{WEEKDAY}）</div>
  <div class="backfill-note">
    ⚠ 試算表（Google Drive／StockRadar／StockList，TOP工作表）尚無 {TARGET_DATE} 當日資料，已改用試算表中最新一列 <b>{DATA_DATE}（{DATA_WEEKDAY}）</b> 之 TOP1~TOP10 排行資料。
    本報表所有股價、漲跌幅、KD、大戶/散戶連買週數、均線與營運指標，皆以 {DATA_DATE} 該交易日（或最近可得之資料）為查證基準，並非 {TARGET_DATE} 當日之交易資料，請留意此時間差。
  </div>
  <table>
    <thead>
      <tr>
        <th>日期</th><th>排名</th><th>股票代碼</th><th>股票名稱</th><th>產業</th>
        <th>股價</th><th>漲跌幅</th><th>KD指標</th><th>大戶/散戶連買</th><th>均線多頭排列</th>
        <th>營益率/營收/EPS近4季達標</th><th>客觀短評</th>
      </tr>
    </thead>
    <tbody>{rows}
    </tbody>
  </table>

  <footer>
    <h2>資料來源與方法論說明</h2>
    <ul>
      <li><b>TOP10排行來源：</b>Google Drive／StockRadar／StockList 試算表 TOP 工作表（gid=0）。</li>
      <li><b>股價／漲跌幅／KD：</b>台灣證券交易所（TWSE）STOCK_DAY API 或證券櫃檯買賣中心（TPEx）tradingStock API 之每日開高低收資料計算。KD參數：RSV週期N=9日，K值平滑=前值×2/3+RSV×1/3，D值平滑=前值×2/3+K×1/3，初始K=D=50。「黃金交叉」定義為前一交易日K&lt;D、當日K&gt;D。</li>
      <li><b>大戶／散戶連買週數：</b>Goodinfo!台灣股市資訊網「股權分散表（週）」。大戶比例＝(＞800~≤1,000張)＋(＞1,000張)兩級持股佔比加總；散戶比例＝(≤10張)＋(＞10~≤50張)兩級持股佔比加總；連買週數＝比例連續較前一週增加之週數，本週較上週減少則歸零。</li>
      <li><b>均線多頭排列：</b>Goodinfo!「均線落點」資料。定義為月線＞季線＞半年線＞年線，且四條均線箭頭皆為向上（↗）；若無半年線或年線資料則標示「資料不足」並視為不成立。</li>
      <li><b>單季營益率／營收年增／EPS年增近4季達標：</b>Goodinfo!「單季經營績效」資料。取最近4個已公告季度，分別判斷單季營益率是否&gt;10%、單季營收較去年同季成長是否&gt;20%、單季EPS較去年同季成長是否&gt;10%；各項達標≥3季則視為整體達標（true）。若去年同期基期金額過小（如EPS&lt;0.1元），成長率數值參考性較低，已於對應儲存格加註提醒。</li>
      <li><b>客觀短評：</b>依當日漲跌幅、KD數值與均線排列狀態自動生成之中性技術面描述，僅供參考，非投資建議，亦非使用者原創之「艾倫小評」內容。</li>
      <li>本報表僅供研究與資訊整理參考，不構成任何投資建議，投資人應自行判斷並承擔投資風險。</li>
    </ul>
  </footer>
</body>
</html>
"""

with open(f"StockRadar_TOP_{TARGET_DATE}.html", "w", encoding="utf-8") as f:
    f.write(html)

print("done")
