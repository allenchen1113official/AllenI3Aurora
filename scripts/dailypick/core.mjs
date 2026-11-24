/* =====================================================================
   極光日報・每日來一股 · 個股分析順序（純邏輯，Node 與測試共用）

   分析順序：
     1. 後台「指定下一檔」（aurora_dailypick/overrides.pin，依指定順序）
     2. 優先組（tier 1）：上市市值前 100 ＋ 上櫃市值前 50，合併後依市值由大到小
     3. 其餘上市櫃普通股（tier 2）：依市值由大到小
   已分析（history）不再重複；後台「略過」者排除；當日不在清單中（下市、暫停交易）者標 delisted 保留紀錄。
   每日更新：市值與排名重算；母體裡第一次出現的代號記 addedAt（第一次建立清單時不算「新增」）。
   ===================================================================== */

export const TIER1 = { TWSE: 100, TPEx: 50 };
export const COMMON = /^[1-9]\d{3}$/; // 4 碼普通股（排除 ETF 00xx、特別股、TDR、權證）

// 證交所／櫃買中心產業別代碼
export const INDUSTRY = {
  "01": "水泥工業", "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維", "05": "電機機械", "06": "電器電纜",
  "08": "玻璃陶瓷", "09": "造紙工業", "10": "鋼鐵工業", "11": "橡膠工業", "12": "汽車工業", "14": "建材營造",
  "15": "航運業", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨", "19": "綜合", "20": "其他業", "21": "化學工業",
  "22": "生技醫療業", "23": "油電燃氣業", "24": "半導體業", "25": "電腦及週邊設備業", "26": "光電業",
  "27": "通信網路業", "28": "電子零組件業", "29": "電子通路業", "30": "資訊服務業", "31": "其他電子業",
  "32": "文化創意業", "33": "農業科技業", "34": "電子商務", "35": "綠能環保", "36": "數位雲端",
  "37": "運動休閒", "38": "居家生活", "80": "管理股票", "91": "存託憑證",
};

/** 台北日期 YYYY-MM-DD（環境 today 是 UTC，不可直接用） */
export function tpeDate(now = Date.now()) {
  return new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
}

const num = (s) => {
  const v = String(s ?? "").replace(/,/g, "").trim();
  if (v === "" || v === "--" || v === "-" || v === "---") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const roc = (s) => {
  const v = String(s ?? "").trim();
  if (/^\d{7}$/.test(v)) return `${+v.slice(0, 3) + 1911}-${v.slice(3, 5)}-${v.slice(5, 7)}`;
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return "";
};

/** 證交所 OpenAPI：STOCK_DAY_ALL（收盤）＋ t187ap03_L（公司基本資料、已發行股數） */
export function parseTwse(quotes = [], companies = []) {
  const co = new Map(companies.map((c) => [String(c["公司代號"] || "").trim(), c]));
  const out = [];
  let asof = "";
  for (const q of quotes) {
    const code = String(q.Code || "").trim();
    if (!COMMON.test(code)) continue;
    const c = co.get(code);
    const close = num(q.ClosingPrice);
    const shares = c ? num(c["已發行普通股數或TDR原股發行股數"]) : null;
    asof = asof || roc(q.Date);
    out.push(row(code, (c && String(c["公司簡稱"]).trim()) || String(q.Name || "").trim(), "TWSE", close, shares,
      c ? INDUSTRY[String(c["產業別"]).trim().padStart(2, "0")] || "" : "", c ? roc(c["上市日期"]) : ""));
  }
  return { asof, rows: out };
}

/** 櫃買中心 OpenAPI：tpex_mainboard_daily_close_quotes（收盤、Capitals＝發行股數）＋ mopsfin_t187ap03_O */
export function parseTpex(quotes = [], companies = []) {
  const co = new Map(companies.map((c) => [String(c.SecuritiesCompanyCode || "").trim(), c]));
  const out = [];
  let asof = "";
  for (const q of quotes) {
    const code = String(q.SecuritiesCompanyCode || "").trim();
    if (!COMMON.test(code)) continue;
    const c = co.get(code);
    asof = asof || roc(q.Date);
    out.push(row(code, (c && String(c.CompanyAbbreviation || "").trim()) || String(q.CompanyName || "").trim(), "TPEx",
      num(q.Close), num(q.Capitals), c ? INDUSTRY[String(c.SecuritiesIndustryCode || "").trim().padStart(2, "0")] || "" : "",
      c ? roc(c.DateOfListing) : ""));
  }
  return { asof, rows: out };
}

function row(code, name, market, close, shares, industry, listed) {
  const mcap = close && shares ? Math.round((close * shares) / 1e8) : null; // 億元
  return { code, name, market, close, mcap, industry, listed };
}

/** 後台設定：pin＝指定下一檔（依序）、skip＝不分析 */
export function normOverrides(o = {}) {
  const list = (a) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x).trim()).filter((x) => COMMON.test(x)))];
  return { pin: list(o.pin), skip: list(o.skip), updatedAt: o.updatedAt || "" };
}

/** 分析紀錄：同代號取最新一筆 */
export function latestHistory(history = []) {
  const m = new Map();
  for (const h of Array.isArray(history) ? history : history.items || []) {
    const code = String(h.code || "").trim();
    if (!COMMON.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(h.date || "")) continue;
    if (!m.has(code) || m.get(code).date < h.date) m.set(code, h);
  }
  return m;
}

/**
 * 建立分析順序清單
 * @param universe  [{code,name,market,close,mcap,industry,listed}]（上市＋上櫃）
 * @param prev      前一版 queue.json（可為 null＝第一次建立）
 * @param history   分析紀錄 [{date,code,name,score,light,rating,folder}]
 * @param overrides {pin,skip}
 */
export function buildQueue({ universe, prev = null, history = [], overrides = {}, today, asof = "", nextN = 10 }) {
  const ov = normOverrides(overrides);
  const hist = latestHistory(history);
  const prevMap = new Map(((prev && prev.items) || []).map((x) => [x.code, x]));
  const firstBuild = !prev || !prev.asof || !(prev.items || []).some((x) => x.mcap); // 初始檔（尚無市值資料）也視為第一次建立

  // 優先組：各市場市值排名
  const tierRank = new Map();
  for (const mk of ["TWSE", "TPEx"]) {
    universe.filter((u) => u.market === mk && u.mcap).sort((a, b) => b.mcap - a.mcap || a.code.localeCompare(b.code))
      .forEach((u, i) => tierRank.set(u.code, { rank: i + 1, tier: i < TIER1[mk] ? 1 : 2 }));
  }
  const seen = new Set();
  const items = [];
  for (const u of universe) {
    if (seen.has(u.code)) continue;
    seen.add(u.code);
    const p = prevMap.get(u.code);
    const h = hist.get(u.code);
    const tr = tierRank.get(u.code) || { rank: null, tier: 2 };
    items.push({
      code: u.code, name: u.name || (p && p.name) || "", market: u.market, industry: u.industry || (p && p.industry) || "",
      mcap: u.mcap, close: u.close, tier: tr.tier, marketRank: tr.rank,
      status: h ? "done" : ov.skip.includes(u.code) ? "skipped" : "pending",
      pinned: !h && ov.pin.includes(u.code) ? ov.pin.indexOf(u.code) + 1 : 0,
      analyzedAt: h ? h.date : "", score: h && h.score != null ? h.score : null, light: h ? h.light || "" : "",
      rating: h ? h.rating || "" : "", folder: h ? h.folder || "" : "",
      addedAt: (p && p.addedAt) || today, isNew: !firstBuild && !p, listed: u.listed || "",
    });
  }
  // 不在今日母體：已下市／暫停交易，保留紀錄（已分析者仍顯示分析日）
  for (const p of (prev && prev.items) || []) {
    if (seen.has(p.code)) continue;
    const h = hist.get(p.code);
    items.push({ ...p, status: h ? "done" : "delisted", pinned: 0, isNew: false,
      analyzedAt: h ? h.date : p.analyzedAt || "", score: h ? h.score ?? null : p.score ?? null, light: h ? h.light || "" : p.light || "",
      rating: h ? h.rating || "" : p.rating || "", folder: h ? h.folder || "" : p.folder || "" });
    seen.add(p.code);
  }
  // 已分析但不在母體也不在前一版（例如第一次建立前已做過）：補一筆
  for (const [code, h] of hist) {
    if (seen.has(code)) continue;
    items.push({ code, name: h.name || "", market: h.market || "", industry: h.industry || "", mcap: null, close: null, tier: 2, marketRank: null,
      status: "done", pinned: 0, analyzedAt: h.date, score: h.score ?? null, light: h.light || "", rating: h.rating || "", folder: h.folder || "",
      addedAt: today, isNew: false, listed: "" });
  }

  const order = (x) => [x.pinned ? 0 : 1, x.pinned || 0, x.status === "delisted" ? 3 : x.tier, -(x.mcap || 0), x.code];
  items.sort((a, b) => {
    const A = order(a), B = order(b);
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1;
    return 0;
  });
  items.forEach((x, i) => { x.rank = i + 1; });

  const next = items.filter((x) => x.status === "pending").slice(0, nextN).map((x) => ({ code: x.code, name: x.name, market: x.market, tier: x.tier, rank: x.rank, pinned: x.pinned }));
  const cnt = (f) => items.filter(f).length;
  return {
    date: today, asof, updatedAt: new Date().toISOString(),
    rule: "指定下一檔 → 優先組（上市市值前 100＋上櫃市值前 50，依市值）→ 其餘上市櫃普通股（依市值）；已分析不重複、略過者排除",
    counts: {
      total: items.length, tier1: cnt((x) => x.tier === 1 && x.status !== "delisted"), done: cnt((x) => x.status === "done"),
      pending: cnt((x) => x.status === "pending"), tier1Pending: cnt((x) => x.tier === 1 && x.status === "pending"),
      skipped: cnt((x) => x.status === "skipped"), delisted: cnt((x) => x.status === "delisted"), newToday: cnt((x) => x.isNew && x.addedAt === today),
    },
    next, newToday: items.filter((x) => x.isNew && x.addedAt === today).map((x) => x.code),
    items,
  };
}

/** queue.json 輸出：每檔一行，方便 diff 與人工對照 */
export function serialize(q) {
  const { items, ...head } = q;
  return JSON.stringify({ ...head, items: [] }, null, 1).replace(/"items": \[\]\n\}$/, '"items": [\n' + items.map((x) => JSON.stringify(x)).join(",\n") + "\n]\n}\n");
}

/** CSV（Excel 可開，含 BOM） */
export function toCsv(q) {
  const ST = { done: "已分析", pending: "待分析", skipped: "略過", delisted: "下市／暫停" };
  const head = ["順序", "代號", "名稱", "市場", "產業", "組別", "市場市值排名", "市值(億)", "狀態", "分析日期", "綜合分數", "燈號", "指定順位", "加入清單日期"];
  const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  const lines = q.items.map((x) => [x.rank, x.code, x.name, x.market === "TWSE" ? "上市" : x.market === "TPEx" ? "上櫃" : "", x.industry,
    x.tier === 1 ? "優先組" : "一般", x.marketRank ?? "", x.mcap ?? "", ST[x.status] || x.status, x.analyzedAt, x.score ?? "", x.light, x.pinned || "", x.addedAt].map(esc).join(","));
  return "﻿" + [head.join(","), ...lines].join("\n") + "\n";
}

/** 母體健全性：資料量太少（API 異常／休市回空）時不覆寫 */
export function sane(universe) {
  const tw = universe.filter((u) => u.market === "TWSE" && u.mcap).length;
  const tp = universe.filter((u) => u.market === "TPEx" && u.mcap).length;
  return { ok: tw >= 700 && tp >= 500, tw, tp };
}
