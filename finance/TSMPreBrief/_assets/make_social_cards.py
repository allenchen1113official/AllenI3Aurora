#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""艾倫極光報報｜台股盤前速報 社群圖卡產生器
用法：
    1. 在同目錄準備 card_data.json（欄位見 _social_spec.md）
    2. python3 make_social_cards.py [輸出目錄]
產出：TSMPreBrief_FB_<DATE>.png (1200x630)
      TSMPreBrief_IG_<DATE>.png (1080x1350)
      TSMPreBrief_Threads_<DATE>.png (1080x1080)
版面會自動量測內容高度並等比縮放以塞進固定尺寸，不會溢出。
"""
import os, sys, json, pathlib
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE
CFG = json.loads((HERE / "card_data.json").read_text(encoding="utf-8"))

DATE_ISO = CFG["date_iso"]            # 2026-11-02
DATE_ZH  = CFG["date_zh"]             # 2026 年 11 月 2 日（週一）
BASIS    = CFG["basis"]
VIEW     = CFG["view"]
MARKETS  = [tuple(x) for x in CFG["markets"]]   # [名稱, 收盤, 漲跌幅, 補充]
PICKS    = [tuple(x) for x in CFG["picks"]]     # [代號, 名稱, 收盤, 漲跌幅, 量能, 備註]
PICKS_HEADLINE = CFG["picks_headline"]
PICKS_NOTE     = CFG["picks_note"]
CAL      = [tuple(x) for x in CFG["calendar"]]  # [標籤, 內容]

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;
  background:#FFFFFF;color:#12332B;-webkit-font-smoothing:antialiased;
}
.card{position:relative;overflow:hidden;background:
  radial-gradient(1100px 520px at 6% -16%, rgba(146,224,190,.60), transparent 62%),
  radial-gradient(980px 480px at 96% -8%, rgba(79,138,213,.46), transparent 64%),
  linear-gradient(180deg,#F6FBF8 0%,#FFFFFF 46%);
  display:flex;flex-direction:column;}
.badge{border-radius:15px;background:linear-gradient(135deg,#92E0BE 0%,#4F8AD5 100%);
  color:#0C2A22;font-weight:800;display:flex;align-items:center;justify-content:center;
  white-space:nowrap;line-height:1;box-shadow:0 4px 14px rgba(18,51,43,.18);}
.brow{display:flex;align-items:center;gap:14px;}
.bzh{font-weight:800;letter-spacing:1.6px;color:#12332B;white-space:nowrap;}
.bsep{width:1px;background:#C9DAD3;}
.ben{letter-spacing:1.1px;color:#2F6152;white-space:nowrap;}
h1{font-weight:800;letter-spacing:2px;color:#12332B;line-height:1.1;}
.date{color:#5A6F67;}
.basis{color:#2F6152;background:rgba(255,255,255,.78);border:1px solid #D7E2DC;
  border-left-style:solid;border-left-color:#4F8AD5;border-radius:8px;}
.sec{background:#FFFFFF;border:1px solid #D7E2DC;border-radius:14px;}
.slab{font-weight:800;letter-spacing:2px;color:#2F6152;display:flex;align-items:center;gap:8px;}
.slab i{display:inline-block;border-radius:4px;background:linear-gradient(135deg,#92E0BE,#4F8AD5);font-style:normal;}
.view{color:#12332B;}
.mrow{display:flex;align-items:baseline;border-bottom:1px solid #EAF1EE;}
.mrow:last-child{border-bottom:none;}
.mname{color:#2F6152;font-weight:700;}
.mval{font-weight:800;color:#12332B;text-align:right;font-variant-numeric:tabular-nums;}
.mchg{font-weight:800;text-align:right;font-variant-numeric:tabular-nums;}
.mnote{color:#7A8F87;}
.dn{color:#0F7D62}.up{color:#C9342F}
.zero{background:linear-gradient(135deg,rgba(146,224,190,.30),rgba(79,138,213,.16));
  border:1px solid #4F8AD5;border-radius:11px;text-align:center;font-weight:800;color:#12332B;}
.prow{display:flex;align-items:baseline;gap:10px;}
.pcode{font-weight:800;color:#2F6152;font-variant-numeric:tabular-nums;}
.pname{font-weight:800;color:#12332B;}
.pmul{font-weight:800;color:#C9342F;font-variant-numeric:tabular-nums;}
.pnote{color:#7A8F87;}
.crow{display:flex;gap:10px;align-items:baseline;}
.ctag{flex:0 0 auto;font-weight:800;color:#FFFFFF;background:#2F6152;border-radius:5px;text-align:center;}
.ctxt{color:#3F5B52;}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;
  border-top:1px solid #D7E2DC;color:#5A6F67;letter-spacing:.8px;}
.disc{color:#8AA096;}
"""


def markets_html(scale):
    rows = []
    for n, v, c, note in MARKETS:
        rows.append(
            f'<div class="mrow"><div class="mname" style="flex:0 0 {scale["mn"]}">{n}</div>'
            f'<div class="mval" style="flex:0 0 {scale["mv"]}">{v}</div>'
            f'<div class="mchg dn" style="flex:0 0 {scale["mc"]}">{c}</div>'
            f'<div class="mnote" style="flex:1;text-align:right">{note}</div></div>')
    return "".join(rows)


def picks_html():
    out = []
    for code, name, px, chg, mul, note in PICKS:
        out.append(
            f'<div class="prow"><span class="pcode">{code}</span><span class="pname">{name}</span>'
            f'<span class="{"up" if chg.strip().startswith(("+","＋")) else "dn"}">{chg}</span><span>收 {px}</span>'
            f'<span class="pmul">量 {mul}</span><span class="pnote">{note}</span></div>')
    return "".join(out)


def cal_html():
    return "".join(
        f'<div class="crow"><span class="ctag">{t}</span><span class="ctxt">{x}</span></div>'
        for t, x in CAL)


def build(w, h, s, zoom=None, measure=False):
    """s = scale dict of px sizes"""
    hh = "auto" if measure else f"{h}px"
    zz = f"zoom:{zoom};" if zoom else ""
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<style>{CSS}
.card{{width:{w}px;height:{hh};padding:{s['pad']};}}
.inner{{display:flex;flex-direction:column;flex:1;min-height:0;{zz}}}
.badge{{width:{s['badge']}px;height:{s['badge']}px;flex:0 0 {s['badge']}px;
  border-radius:{round(s['badge']*0.28)}px;font-size:{s['badgef']}px;}}
.badge sup{{font-size:{round(s['badgef']*0.56)}px;vertical-align:super;line-height:0;}}
.bzh{{font-size:{s['bzh']}px;}} .bsep{{height:{round(s['bzh']*1.05)}px;}} .ben{{font-size:{s['ben']}px;}}
h1{{font-size:{s['h1']}px;margin-top:{s['gap']}px;}}
.date{{font-size:{s['date']}px;margin-top:{round(s['gap']*0.35)}px;}}
.basis{{font-size:{s['basis']}px;padding:{round(s['basis']*0.6)}px {round(s['basis']*0.85)}px;
  border-left-width:{s['bar']}px;margin-top:{round(s['gap']*0.55)}px;line-height:1.55;}}
.sec{{padding:{s['secp']}px {round(s['secp']*1.12)}px;margin-top:{s['gap']}px;}}
.slab{{font-size:{s['slab']}px;margin-bottom:{round(s['secp']*0.62)}px;}}
.slab i{{width:{round(s['slab']*0.75)}px;height:{round(s['slab']*0.75)}px;}}
.view{{font-size:{s['view']}px;line-height:1.62;}}
.mrow{{padding:{s['mpad']}px 0;font-size:{s['m']}px;line-height:1.35;}}
.mnote{{font-size:{round(s['m']*0.80)}px;}}
.zero{{font-size:{s['zero']}px;padding:{round(s['zero']*0.52)}px;margin-bottom:{round(s['secp']*0.6)}px;}}
.prow{{font-size:{s['p']}px;padding:{round(s['p']*0.30)}px 0;}}
.pnote{{font-size:{round(s['p']*0.82)}px;}}
.crow{{font-size:{s['c']}px;padding:{round(s['c']*0.26)}px 0;line-height:1.5;}}
.ctag{{font-size:{round(s['c']*0.78)}px;padding:{round(s['c']*0.12)}px {round(s['c']*0.44)}px;
  min-width:{round(s['c']*3.2)}px;}}
.foot{{font-size:{s['foot']}px;padding-top:{round(s['gap']*0.7)}px;margin-top:{s['gap']}px;}}
.disc{{font-size:{s['foot']}px;}}
{s.get('extra','')}
</style></head><body>
<div class="card"><div class="inner">
  <div class="brow">
    <div class="badge">AI<sup>3</sup>A</div>
    <div style="display:flex;align-items:center;gap:{round(s['bzh']*0.62)}px">
      <span class="bzh">艾倫極光報報</span><span class="bsep"></span>
      <span class="ben">Allen I<sup style="font-size:{round(s['ben']*0.72)}px">3</sup> Aurora Brief</span>
    </div>
  </div>
  <h1>台股盤前速報</h1>
  <div class="date">{DATE_ZH} · 台北時間清晨彙整</div>
  <div class="basis">{BASIS}</div>

  <div class="body">
  <div class="sec"><div class="slab"><i></i>一句話開盤觀點</div>
    <div class="view">{VIEW}</div></div>

  <div class="sec"><div class="slab"><i></i>五市速讀</div>
    {markets_html(s)}</div>

  <div class="sec"><div class="slab"><i></i>績優選股（均線多頭 ＋ 大戶增持 ＋ 量增）</div>
    <div class="zero">{PICKS_HEADLINE}</div>
    {picks_html()}
    <div class="pnote" style="margin-top:{round(s['p']*0.45)}px">
      {PICKS_NOTE}</div></div>

  <div class="sec"><div class="slab"><i></i>今日財經行事曆</div>
    {cal_html()}</div>
  </div>

  <div class="foot">
    <div>Allen I<sup style="font-size:{round(s['foot']*0.72)}px">3</sup> Aurora Brief · 艾倫極光報報　|　Allen Chen · Est. 2026</div>
    <div class="disc">本內容為資料彙整，非投資建議</div>
  </div>
</div></div></body></html>"""


SPECS = {
    "IG": dict(w=1080, h=1350, s=dict(
        pad="52px 56px 44px", badge=72, badgef=21, bzh=27, ben=15, h1=52, date=19,
        basis=16, bar=5, gap=22, secp=20, slab=17, view=23, m=22, mpad=9,
        zero=21, p=20, c=19, foot=14,
        mn="200px", mv="150px", mc="110px")),
    "FB": dict(w=1200, h=630, s=dict(
        pad="34px 40px 28px", badge=54, badgef=16, bzh=21, ben=12, h1=38, date=15,
        basis=13, bar=4, gap=13, secp=14, slab=13.5, view=17, m=16.5, mpad=5.5,
        zero=16, p=15, c=14.5, foot=11,
        mn="150px", mv="110px", mc="84px",
        extra=""".body{display:grid;grid-template-columns:1.06fr 1fr;gap:0 14px;align-items:start;}
.body .sec:nth-child(1){grid-column:1 / -1;}
.body .sec:nth-child(2){grid-column:1;}
.body .sec:nth-child(3){grid-column:2;}
.body .sec:nth-child(4){grid-column:2;}
.mnote{white-space:nowrap;}""")),
    "Threads": dict(w=1080, h=1080, s=dict(
        pad="40px 46px 34px", badge=62, badgef=18, bzh=23, ben=13, h1=42, date=16,
        basis=14, bar=4, gap=15, secp=16, slab=15, view=19.5, m=18.5, mpad=6.5,
        zero=18, p=17, c=16.5, foot=12.5,
        mn="170px", mv="125px", mc="95px")),
}


def main():
    outs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for key, spec in SPECS.items():
            w, h, sc = spec["w"], spec["h"], spec["s"]
            # pass 1 - natural height
            f = OUT / f"_card_{key}.html"
            f.write_text(build(w, h, sc, measure=True), encoding="utf-8")
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.goto(f"file://{f}", wait_until="networkidle")
            nat = pg.evaluate("document.querySelector('.card').scrollHeight")
            pg.close()
            zoom = None
            if nat > h:
                zoom = round((h / nat) * 0.995, 4)
            # pass 2 - fixed height, scaled to fit
            f.write_text(build(w, h, sc, zoom=zoom), encoding="utf-8")
            png = OUT / f"TSMPreBrief_{key}_{DATE_ISO}.png"
            pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            pg.goto(f"file://{f}", wait_until="networkidle")
            over = pg.evaluate("document.querySelector('.card').scrollHeight")
            pg.screenshot(path=str(png))
            pg.close()
            outs.append((key, nat, zoom, over, h, os.path.getsize(png)))
        b.close()
    for k, nat, z, over, h, size in outs:
        flag = "OK" if over <= h + 1 else "STILL OVERFLOWING"
        print(f"{k}: natural={nat} zoom={z} final={over}/{h} {flag} {size}b")


if __name__ == "__main__":
    main()
