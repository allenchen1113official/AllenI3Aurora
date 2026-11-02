#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json

with open("stocks_full.json", encoding="utf-8") as f:
    data = json.load(f)

TARGET_DATE = data["target_date"]
WEEKDAY = data["weekday"]
IS_BACKFILL = data["is_backfill"]
EXEC_DATE = data["exec_date"]
BROWSER_USED = data["browser_used"]
stocks = data["stocks"]

def badge(ok, yes_text="是", no_text="否"):
    color = "#1b7f4d" if ok else "#8a1f1f"
    bg = "#e3f8ec" if ok else "#fbe3e3"
    txt = yes_text if ok else no_text
    return f'<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:{bg};color:{color};font-weight:600;font-size:12.5px;">{txt}</span>'

backfill_notice = ""
if IS_BACKFILL:
    backfill_notice = f'''<div style="background:#fff4e5;border:1px solid #f0b429;color:#8a5a00;padding:10px 16px;border-radius:6px;margin:10px 0 4px 0;font-size:14px;">
    ⚠ 本次為補產出 {TARGET_DATE}（最近一個交易日）資料，非執行當日（{EXEC_DATE}）資料。執行日 {EXEC_DATE} 為非交易日，系統已自動回推至最近一個 TWSE 交易日。
    </div>'''

rows_html = []
for s in stocks:
    ma = s["ma"]
    ma_rows = "".join(
        f'<div>{k}線：{v[0]} {v[1]}</div>' for k, v in ma.items()
    )
    ma_order_note = "月&gt;季&gt;半年&gt;年"
    base_note = ""
    if s["base_small_note"]:
        base_note = '<div style="color:#b45309;font-size:12px;margin-top:4px;">⚠ 部分季度基期（去年同期EPS）金額過小，年增率數值參考性較低</div>'

    rows_html.append(f'''
    <tr>
      <td>{TARGET_DATE}</td>
      <td style="background:#dff5e1;text-align:center;font-weight:700;">{s['rank']}</td>
      <td style="background:#e1ecfa;font-weight:600;">TPE:{s['code']}</td>
      <td>{s['full']}<br><span style="color:#666;font-size:12.5px;">({s['short']})</span></td>
      <td>{s['industry']}</td>
      <td style="text-align:right;font-weight:600;">{s['price']:.2f}</td>
      <td style="text-align:right;color:{'#1b7f4d' if s['chg_pct']>=0 else '#c0392b'};font-weight:600;">{'+' if s['chg_pct']>=0 else ''}{s['chg_pct']:.2f}%</td>
      <td>
        K={s['K']:.2f} / D={s['D']:.2f}<br>
        K&gt;50：{badge(s['K_gt_50'])}　K&gt;D：{badge(s['K_gt_D'])}<br>
        黃金交叉：{badge(s['golden_cross'])}
      </td>
      <td>
        大戶(&gt;800張)：{s['big_pct']:.2f}%<br>連買 {s['big_streak']} 週<br>
        散戶(≤50張)：{s['small_pct']:.2f}%<br>連買 {s['small_streak']} 週
      </td>
      <td style="font-size:12.5px;">
        {ma_rows}
        <div style="margin-top:4px;color:#666;">判定條件：{ma_order_note}，且四線箭頭皆為↗</div>
        <div style="margin-top:4px;">均線多頭排列：{badge(s['ma_bull'])}</div>
      </td>
      <td style="font-size:12.5px;">
        營益率&gt;10%（近4季達標 {s['op_str']}）：{badge(s['op_ok'])}<br>
        營收年增&gt;20%（近4季達標 {s['rev_str']}）：{badge(s['rev_ok'])}<br>
        EPS年增&gt;10%（近4季達標 {s['eps_str']}）：{badge(s['eps_ok'])}
        {base_note}
      </td>
      <td style="font-size:13px;color:#333;">{s['comment']}</td>
    </tr>''')

html = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>台股每日分析報表 - TOP 10排行 ({TARGET_DATE})</title>
<style>
  body {{ font-family: "PingFang TC","Microsoft JhengHei","Noto Sans TC",Arial,sans-serif; margin:0; padding:24px; background:#f7f8fa; color:#1a1a1a; }}
  h1 {{ font-size:24px; margin-bottom:4px; }}
  .subtitle {{ color:#555; font-size:14px; margin-bottom:10px; }}
  table {{ border-collapse: collapse; width:100%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.08); font-size:13.5px; }}
  th {{ background:#2e7d4f; color:#fff; padding:10px 8px; text-align:left; position:sticky; top:0; }}
  td {{ padding:10px 8px; border-bottom:1px solid #eee; vertical-align:top; }}
  tr:hover {{ background:#fafcf9; }}
  .footer {{ margin-top:28px; font-size:13px; color:#444; line-height:1.9; background:#fff; padding:18px 22px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }}
  .footer h3 {{ margin-top:0; font-size:15px; }}
  .src-tag {{ display:inline-block;background:#eef2f7;color:#345;padding:1px 7px;border-radius:8px;font-size:11.5px;margin-left:4px; }}
  .meta-bar {{ font-size:12.5px; color:#777; margin-bottom:14px; }}
</style>
</head>
<body>
  <h1>台股每日分析報表 - TOP 10排行</h1>
  <div class="subtitle">目標日期：{TARGET_DATE}（{WEEKDAY}）</div>
  {backfill_notice}
  <div class="meta-bar">資料來源：Google Drive「StockRadar／StockList」試算表(TOP工作表) 提供當日排行代碼；股價與KD指標查證自 TWSE / TPEx 官方 API；籌碼、均線、財務指標查證自 Goodinfo!台灣股市資訊網。自動選用瀏覽器：{BROWSER_USED}。</div>
  <table>
    <thead>
      <tr>
        <th>日期</th>
        <th>排名</th>
        <th>股票代碼</th>
        <th>股票名稱</th>
        <th>產業</th>
        <th>股價<span class="src-tag">TWSE/TPEx</span></th>
        <th>漲跌幅<span class="src-tag">TWSE/TPEx</span></th>
        <th>KD指標(9,3,3)<span class="src-tag">TWSE/TPEx</span></th>
        <th>大戶/散戶連買週數<span class="src-tag">Goodinfo</span></th>
        <th>均線多頭排列<span class="src-tag">Goodinfo</span></th>
        <th>營益率/營收/EPS近4季達標<span class="src-tag">Goodinfo</span></th>
        <th>客觀短評</th>
      </tr>
    </thead>
    <tbody>
      {"".join(rows_html)}
    </tbody>
  </table>

  <div class="footer">
    <h3>資料來源與方法論說明</h3>
    <p><b>資料來源：</b>TOP10排行清單取自使用者 Google Drive「StockRadar」資料夾中「StockList」試算表之「TOP」工作表；股價、開高低收與KD計算所需歷史資料查證自台灣證券交易所（TWSE）「每日收盤行情」API 與證券櫃檯買賣中心（TPEx）「個股日成交資訊」API；股東持股分級（大戶/散戶）週統計、均線落點、單季財務數據查證自 Goodinfo!台灣股市資訊網。</p>
    <p><b>KD指標（隨機指標）：</b>採 9 日 RSV、K 值平滑常數 2/3、D 值平滑常數 2/3 之標準參數（9,3,3），初始 K=D=50，以最近約 2～3 個月（含暖身期）之每日高低收價逐日迭代計算。「黃金交叉」定義為前一交易日 K≤D，而當日 K&gt;D 之翻轉。</p>
    <p><b>大戶/散戶定義：</b>大戶＝集保庫存持股「&gt;800張～≤1千張」與「&gt;1千張」兩級佔股本比例加總；散戶＝「≤10張」與「&gt;10張～≤50張」兩級佔股本比例加總。「連買週數」定義為由最近一週往前回推，該項比例連續較前一週增加的週數，若最近一週較前一週減少則為 0。</p>
    <p><b>均線多頭排列定義：</b>取 Goodinfo 個股頁面「均線落點」表中「月」「季」「半年」「年」四條均線之數值與趨勢箭頭，須同時滿足：(1) 月線&gt;季線&gt;半年線&gt;年線之價格排列，且 (2) 四條均線之箭頭皆為向上（↗），方判定為「均線多頭排列：是」；若股票掛牌時間過短、缺半年線或年線資料，則保守判定為「否」。</p>
    <p><b>營益率/營收/EPS近4季達標判斷：</b>取 Goodinfo「單季經營績效」表中最近4個「已公告」季度（排除尚未公告之最新1～2季），分別判斷各季：(a) 單季營業利益率是否&gt;10%；(b) 單季營業收入是否較去年同季成長&gt;20%；(c) 單季稅後EPS是否較去年同季成長&gt;10%。三項各自統計近4季中達標之季數（如"3/4"），達標季數≥3 則對應布林值為「是」，否則為「否」。若去年同期EPS基期金額過小（&lt;0.1元），已於該檔個股之表格中加註提醒，但不影響達標判定之計算方式。</p>
    <p><b>客觀短評：</b>依當日漲跌幅、KD黃金交叉狀態、K值與50中軸及D值之相對位置、大戶/散戶連買週數、均線多頭排列狀態等既有查證數據，以固定規則生成之中性技術面描述，不涉及主觀投資建議或原創評論。</p>
    <p style="color:#999;">本報表僅供研究與資訊整理參考，不構成任何投資建議，投資人應自行判斷並承擔投資風險。</p>
  </div>
</body>
</html>'''

with open("StockRadar_TOP_{}.html".format(TARGET_DATE), "w", encoding="utf-8") as f:
    f.write(html)

print("HTML written")
