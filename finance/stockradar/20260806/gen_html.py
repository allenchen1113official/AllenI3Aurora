# -*- coding: utf-8 -*-
import json, html

TARGET_DATE = "2026-08-07"
DATA_ASOF = "2026-08-06"
WEEKDAY = "星期五"

stocks = [
    dict(rank=1, code="2395", name="研華(研華)", industry="電腦及週邊設備業(工業電腦)",
         price=622, chg=-1.74, k=66.89, d=60.83, gc=False,
         big_streak=1, small_streak=0, ma_bull=True, ma_note="",
         op_ratio="4/4", op_ok=True, rev_ratio="1/4", rev_ok=False, eps_ratio="4/4", eps_ok=True, eps_warn=False,
         src="TWSE STOCK_DAY(2026/07-08月)"),
    dict(rank=2, code="9939", name="宏全國際(宏全)", industry="其他業(飲料包材/瓶蓋充填代工)",
         price=142.5, chg=6.34, k=78.32, d=67.01, gc=False,
         big_streak=4, small_streak=0, ma_bull=False, ma_note="半年線(117.8)<年線(119.1)，未達完全多頭排列(四線皆↗)",
         op_ratio="4/4", op_ok=True, rev_ratio="0/4", rev_ok=False, eps_ratio="1/4", eps_ok=False, eps_warn=False,
         src="TWSE STOCK_DAY"),
    dict(rank=3, code="2301", name="光寶科技(光寶科)", industry="電腦及週邊設備業",
         price=252.5, chg=1.41, k=77.94, d=67.63, gc=False,
         big_streak=0, small_streak=1, ma_bull=False, ma_note="月線(215.1)<季線(217.9)，未達完全多頭排列",
         op_ratio="3/4", op_ok=True, rev_ratio="2/4", rev_ok=False, eps_ratio="3/4", eps_ok=True, eps_warn=False,
         src="TWSE STOCK_DAY"),
    dict(rank=4, code="3023", name="信邦電子(信邦)", industry="電子零組件業",
         price=323, chg=1.57, k=73.63, d=54.31, gc=False,
         big_streak=1, small_streak=1, ma_bull=False, ma_note="月線(304)<季線(311.9)，未達完全多頭排列",
         op_ratio="2/4", op_ok=False, rev_ratio="0/4", rev_ok=False, eps_ratio="1/4", eps_ok=False, eps_warn=False,
         src="TWSE STOCK_DAY"),
    dict(rank=5, code="6589", name="台康生技(台康生技)", industry="生技醫療業",
         price=48, chg=-1.34, k=72.63, d=57.49, gc=False,
         big_streak=3, small_streak=0, ma_bull=False, ma_note="季線<半年線且月線↘，未達多頭排列；掛牌時間較短，無10年均線資料",
         op_ratio="0/4", op_ok=False, rev_ratio="2/4", rev_ok=False, eps_ratio="1/4", eps_ok=False, eps_warn=True,
         src="TWSE STOCK_DAY(2025/07轉上市)"),
    dict(rank=6, code="3293", name="鈊象電子(鈊象)", industry="文化創意業(商用遊戲機/線上遊戲)",
         price=784, chg=0.90, k=81.84, d=77.07, gc=False,
         big_streak=2, small_streak=0, ma_bull=False, ma_note="半年線(714.9)<年線(717)，僅些微差距未達完全多頭排列(其餘三線排列正確且皆↗)",
         op_ratio="4/4", op_ok=True, rev_ratio="1/4", rev_ok=False, eps_ratio="3/4", eps_ok=True, eps_warn=False,
         src="TPEx tradingStock(上櫃)"),
    dict(rank=7, code="4912", name="聯德控股-KY(聯德控股)", industry="電子零組件業",
         price=90.9, chg=1.45, k=81.96, d=68.97, gc=False,
         big_streak=0, small_streak=0, ma_bull=False, ma_note="季線↘且月線(84.87)<季線(92.04)，未達多頭排列",
         op_ratio="0/4", op_ok=False, rev_ratio="1/4", rev_ok=False, eps_ratio="1/4", eps_ok=False, eps_warn=False,
         src="TWSE STOCK_DAY"),
    dict(rank=8, code="1785", name="光洋科技(光洋科)", industry="其他電子業(貴金屬材料/濺鍍薄膜)",
         price=115, chg=3.14, k=74.07, d=54.79, gc=False,
         big_streak=1, small_streak=0, ma_bull=False, ma_note="月線、季線皆呈↘，未達多頭排列；無10年均線資料",
         op_ratio="3/4", op_ok=True, rev_ratio="4/4", rev_ok=True, eps_ratio="3/4", eps_ok=True, eps_warn=True,
         src="TPEx tradingStock(上櫃)"),
    dict(rank=9, code="2027", name="大成不銹鋼工業(大成鋼)", industry="鋼鐵工業",
         price=46.1, chg=3.95, k=73.18, d=68.70, gc=False,
         big_streak=4, small_streak=0, ma_bull=True, ma_note="",
         op_ratio="4/4", op_ok=True, rev_ratio="0/4", rev_ok=False, eps_ratio="3/4", eps_ok=True, eps_warn=True,
         src="TWSE STOCK_DAY"),
    dict(rank=10, code="2408", name="南亞科技(南亞科)", industry="半導體業(DRAM記憶體)",
         price=459, chg=3.15, k=71.75, d=52.91, gc=False,
         big_streak=0, small_streak=2, ma_bull=True, ma_note="",
         op_ratio="3/4", op_ok=True, rev_ratio="4/4", rev_ok=True, eps_ratio="4/4", eps_ok=True, eps_warn=True,
         src="TWSE STOCK_DAY"),
]

def comment(s):
    parts = []
    if s["chg"] > 0:
        parts.append(f"當日上漲{s['chg']:.2f}%")
    elif s["chg"] < 0:
        parts.append(f"當日下跌{abs(s['chg']):.2f}%")
    else:
        parts.append("當日平盤")
    kd_bits = []
    kd_bits.append("K>50" if s["k"] > 50 else "K≤50")
    kd_bits.append("K>D" if s["k"] > s["d"] else "K≤D")
    parts.append(f"KD指標{'/'.join(kd_bits)}(K={s['k']:.1f}、D={s['d']:.1f})")
    if s["gc"]:
        parts.append("今日出現KD黃金交叉")
    if s["k"] > 80:
        parts.append("K值已達相對高檔區")
    elif s["k"] < 20:
        parts.append("K值處於相對低檔區")
    return "，".join(parts) + "。（純技術面客觀描述，非投資建議）"

def yn(b):
    return '<span class="tag-yes">是</span>' if b else '<span class="tag-no">否</span>'

def chg_html(chg):
    cls = "up" if chg > 0 else ("down" if chg < 0 else "flat")
    arrow = "▲" if chg > 0 else ("▼" if chg < 0 else "▬")
    return f'<span class="{cls}">{arrow} {chg:+.2f}%</span>'

rows_html = []
for s in stocks:
    cmt = comment(s)
    row = f"""
    <tr>
      <td class="col-rank">{s['rank']}</td>
      <td class="col-code">TPE:{s['code']}</td>
      <td>{html.escape(s['name'])}</td>
      <td>{html.escape(s['industry'])}</td>
      <td class="num">{s['price']:.2f}</td>
      <td class="num">{chg_html(s['chg'])}</td>
      <td class="num">K={s['k']:.1f} / D={s['d']:.1f}<br>
          <span class="mini">K&gt;50: {yn(s['k']>50)}　K&gt;D: {yn(s['k']>s['d'])}</span><br>
          <span class="mini">黃金交叉: {yn(s['gc'])}</span>
      </td>
      <td class="num">大戶連買 {s['big_streak']} 週<br>散戶連買 {s['small_streak']} 週</td>
      <td class="num">{yn(s['ma_bull'])}{f'<br><span class="mini">{html.escape(s["ma_note"])}</span>' if s['ma_note'] else ''}</td>
      <td class="num">
        營益率&gt;10%：{s['op_ratio']} {yn(s['op_ok'])}<br>
        營收年增&gt;20%：{s['rev_ratio']} {yn(s['rev_ok'])}<br>
        EPS年增&gt;10%：{s['eps_ratio']} {yn(s['eps_ok'])}
        {'<br><span class="mini warn">＊部分季度基期過小，年增率數值參考性較低</span>' if s['eps_warn'] else ''}
      </td>
      <td class="cmt">{html.escape(cmt)}</td>
      <td class="mini src">{html.escape(s['src'])}<br>Goodinfo!(持股分級/均線落點/單季經營績效)</td>
    </tr>"""
    rows_html.append(row)

rows_joined = "\n".join(rows_html)

html_doc = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>台股每日分析報表 - TOP 10排行 - {TARGET_DATE}</title>
<style>
  :root {{
    --green: #1a7a3c;
    --green-light: #e3f5e8;
    --blue-light: #e3edf9;
    --red: #d0021b;
    --gray: #666;
    --border: #ddd;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif;
    background: #f7f8fa;
    color: #222;
    margin: 0;
    padding: 24px;
    line-height: 1.6;
  }}
  .wrap {{ max-width: 1400px; margin: 0 auto; }}
  h1 {{
    font-size: 26px;
    margin-bottom: 4px;
    color: #113;
  }}
  .subtitle {{
    color: var(--gray);
    font-size: 15px;
    margin-bottom: 4px;
  }}
  .backfill-note {{
    background: #fff3cd;
    border: 1px solid #ffe08a;
    color: #7a5b00;
    padding: 10px 14px;
    border-radius: 6px;
    margin: 12px 0 20px;
    font-size: 14px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    font-size: 13.5px;
  }}
  thead th {{
    background: var(--green);
    color: #fff;
    padding: 10px 8px;
    text-align: left;
    position: sticky;
    top: 0;
  }}
  tbody td {{
    padding: 10px 8px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }}
  tbody tr:nth-child(even) {{ background: #fafbfc; }}
  .col-rank {{ background: var(--green-light); font-weight: bold; text-align: center; width: 40px; }}
  .col-code {{ background: var(--blue-light); font-weight: bold; white-space: nowrap; }}
  .num {{ white-space: nowrap; }}
  .up {{ color: var(--red); font-weight: bold; }}
  .down {{ color: var(--green); font-weight: bold; }}
  .flat {{ color: var(--gray); }}
  .tag-yes {{ color: #fff; background: #c9820f; padding: 1px 6px; border-radius: 4px; font-size: 12px; }}
  .tag-no {{ color: #666; background: #e8e8e8; padding: 1px 6px; border-radius: 4px; font-size: 12px; }}
  .mini {{ font-size: 11.5px; color: var(--gray); }}
  .mini.warn {{ color: #a15c00; }}
  .cmt {{ max-width: 260px; font-size: 12.5px; color: #333; }}
  .src {{ max-width: 160px; color: #888; }}
  footer {{
    margin-top: 28px;
    padding: 18px;
    background: #fff;
    border-radius: 8px;
    font-size: 13px;
    color: #444;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }}
  footer h2 {{ font-size: 16px; margin-top: 0; }}
  footer ul {{ margin: 6px 0; padding-left: 20px; }}
  .legend-note {{ color: var(--gray); font-size: 13px; margin-bottom: 16px; }}
</style>
</head>
<body>
<div class="wrap">
  <h1>台股每日分析報表 - TOP 10排行</h1>
  <div class="subtitle">目標日期：{TARGET_DATE}（{WEEKDAY}）</div>
  <div class="backfill-note">
    ⚠ 提醒：Google試算表「StockList / TOP」工作表尚無 {TARGET_DATE} 當日資料（可能因當日盤後名單尚未更新），
    本報表已改用試算表中最新一列資料，即 <b>{DATA_ASOF}</b>（TOP1~TOP10 排行）作為本次分析對象；
    股價、漲跌幅、KD等技術指標亦以 {DATA_ASOF}（或各股最近可得之交易日）資料為準，非 {TARGET_DATE} 當日交易資料，請留意日期差異。
  </div>
  <div class="legend-note">
    註：漲跌幅顏色採台股慣例（紅漲綠跌）。「是/否」標示為布林判定結果；比例欄位（如 3/4）表示最近4個已公告季度中達標的季數。
  </div>
  <table>
    <thead>
      <tr>
        <th>排名</th>
        <th>股票代碼</th>
        <th>股票名稱</th>
        <th>產業</th>
        <th>股價</th>
        <th>漲跌幅</th>
        <th>KD指標</th>
        <th>大戶/散戶連買週數</th>
        <th>均線多頭排列</th>
        <th>營益率／營收／EPS 近4季達標</th>
        <th>客觀短評</th>
        <th>資料來源</th>
      </tr>
    </thead>
    <tbody>
      {rows_joined}
    </tbody>
  </table>

  <footer>
    <h2>資料來源與方法論說明</h2>
    <ul>
      <li><b>TOP10排行來源：</b>Google Drive「StockRadar」資料夾之「StockList」試算表「TOP」工作表。本次因當日（{TARGET_DATE}）資料尚未更新，改用最新一列（{DATA_ASOF}）之TOP1~TOP10股票代碼。</li>
      <li><b>股票名稱／產業：</b>透過網路公開資訊查證整理，格式為「全名(常用簡稱)」。</li>
      <li><b>股價／漲跌幅／KD指標：</b>上市股票取自台灣證券交易所(TWSE) STOCK_DAY API 每日開高低收資料；上櫃股票取自證券櫃檯買賣中心(TPEx) tradingStock API。KD採標準9,3,3參數：RSV=(收盤價-最近9日最低價)/(最近9日最高價-最近9日最低價)×100；K值=前一日K值×2/3+RSV×1/3；D值=前一日D值×2/3+K值×1/3，初始K=D=50。「黃金交叉」定義為當日K值由前一日K≤D翻轉為K&gt;D。</li>
      <li><b>大戶／散戶連買週數：</b>資料來源Goodinfo!台灣股市資訊網「股權分散表」週資料。大戶定義為持股 &gt;800張（＞800~≤1,000張＋＞1,000張兩級加總）；散戶定義為持股 ≤50張（≤10張＋＞10~≤50張兩級加總）。連買週數為最近連續幾週該比例較前一週增加，若本週較上週減少則計為0。</li>
      <li><b>均線多頭排列：</b>資料來源Goodinfo!「均線落點」表。定義為月線&gt;季線&gt;半年線&gt;年線，且月/季/半年/年四條均線之近期走勢箭頭皆為「↗向上」。若股票掛牌時間較短、無半年線或年線資料，標示為「資料不足」並判定為否。</li>
      <li><b>營益率／營收年增／EPS年增近4季達標：</b>資料來源Goodinfo!「單季經營績效」表，取最近4個已公告季度（排除尚未公告之季度）分別判斷：(a)單季營業利益率是否&gt;10%；(b)單季營收是否較去年同季成長&gt;20%；(c)單季稅後EPS是否較去年同季成長&gt;10%。三項各自統計4季中達標季數，達標≥3季則對應布林值為「是」。若計算年增率時去年同期基期金額過小或為負（如EPS轉盈虧），報表將加註「基期過小，數值參考性低」提醒。</li>
      <li><b>客觀短評：</b>依當日KD數值（K值/D值相對關係、是否&gt;50、是否黃金交叉）與漲跌幅資料自動生成之中性技術面描述，僅供參考，非投資建議，亦非使用者原創評論。</li>
      <li><b>免責聲明：</b>本報表所有資訊皆為公開資料整理與客觀計算結果，僅供研究參考，不構成任何投資建議，投資人應自行判斷並承擔投資風險。</li>
    </ul>
  </footer>
</div>
</body>
</html>
"""

with open("/sessions/dreamy-focused-dijkstra/mnt/outputs/20260807/StockRadar_TOP_2026-08-07.html", "w", encoding="utf-8") as f:
    f.write(html_doc)

print("HTML written, length:", len(html_doc))
