/* =====================================================================
   加權指數 TAIEX 定時更新腳本（伺服器端，由 GitHub Actions 執行）。

   伺服器端抓取無 CORS 限制，可靠取得證交所資料，寫入同源
   data/taiex.json 供前端讀取，確保儀表板首頁永遠是最新資訊。

   區分交易／非交易時段：
   - 交易時段（台北 週一至週五 09:00–13:30）：抓 MIS 即時指數（tse_t00.tw）。
   - 非交易時段或即時抓取失敗：抓 OpenAPI「加權指數歷史資料」最新收盤。
   走勢（sparkline）一律取 OpenAPI 近 9 個交易日收盤。
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "data/taiex.json";
const OPENAPI_HIST = "https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST";
const MIS_REALTIME = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0";

const numFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n) => (n >= 0 ? "+" : "-") + numFmt.format(Math.abs(n));
const deltaLabel = (pct, pts) => `${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(2)}% · ${signed(pts)}`;

/* 台北時區當下的 週幾 / 分鐘數 / yyyymmdd。 */
function taipeiNowParts(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return { weekday: p.weekday, minutes: +p.hour * 60 + +p.minute, ymd: `${p.year}${p.month}${p.day}` };
}
function isTradingHours(now = new Date()) {
  const t = taipeiNowParts(now);
  if (t.weekday === "Sat" || t.weekday === "Sun") return false;
  return t.minutes >= 9 * 60 && t.minutes <= 13 * 60 + 30;
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (AllenI3Aurora TAIEX updater)",
      Referer: "https://mis.twse.com.tw/",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/* OpenAPI 收盤歷史 → 最新收盤、漲跌與近 9 日走勢。 */
function parseHistory(items) {
  if (!Array.isArray(items)) return null;
  const rows = items
    .map((it) => ({
      date: String((it && (it.Date || it.date)) || ""),
      close: parseFloat(String((it && (it.ClosingIndex || it.closingIndex)) || "").replace(/,/g, "")),
    }))
    .filter((r) => r.date && Number.isFinite(r.close));
  if (!rows.length) return null;
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const closes = rows.map((r) => r.close);
  const last = closes[closes.length - 1];
  const prev = closes.length > 1 ? closes[closes.length - 2] : last;
  const pts = last - prev, pct = prev ? (pts / prev) * 100 : 0;
  const ymd = rows[rows.length - 1].date; // yyyymmdd
  const asOf = ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)} 收盤` : `${ymd} 收盤`;
  return { value: numFmt.format(last), delta: deltaLabel(pct, pts), points: +pts.toFixed(2), pct: +pct.toFixed(2), data: closes.slice(-9), asOf, live: false };
}

/* MIS 即時 → 當前指數、漲跌。走勢沿用收盤歷史。 */
function parseRealtime(json, sparkFallback) {
  const a = json && json.msgArray && json.msgArray[0];
  if (!a) return null;
  const cur = parseFloat(String(a.z || "").replace(/,/g, ""));
  const prev = parseFloat(String(a.y || "").replace(/,/g, ""));
  if (!Number.isFinite(cur) || cur <= 0 || !Number.isFinite(prev) || prev <= 0) return null;
  if (a.d && String(a.d) !== taipeiNowParts().ymd) return null; // 僅接受今日即時
  const pts = cur - prev, pct = prev ? (pts / prev) * 100 : 0;
  return {
    value: numFmt.format(cur), delta: deltaLabel(pct, pts), points: +pts.toFixed(2), pct: +pct.toFixed(2),
    data: sparkFallback && sparkFallback.length ? sparkFallback : undefined,
    asOf: a.t ? `${a.t} 盤中` : "盤中", live: true,
  };
}

async function main() {
  // 走勢與收盤基準（也是非交易時段的主要值）。
  let history = null;
  try { history = parseHistory(await fetchJSON(OPENAPI_HIST)); }
  catch (e) { console.error("OpenAPI 收盤抓取失敗：", e.message); }

  let result = history;

  // 交易時段：以 MIS 即時覆蓋。
  if (isTradingHours()) {
    try {
      const rt = parseRealtime(await fetchJSON(MIS_REALTIME), history && history.data);
      if (rt) result = rt;
    } catch (e) { console.error("MIS 即時抓取失敗，改用收盤：", e.message); }
  }

  if (!result) {
    // 全數失敗：保留現有檔案，不覆蓋成空值。
    console.error("無可用資料，維持現有 data/taiex.json 不變。");
    process.exit(0);
  }

  result.updatedAt = new Date().toISOString();

  // 保留現有走勢以免即時來源無走勢時清空。
  if (!result.data) {
    try {
      const cur = JSON.parse(readFileSync(OUT, "utf8"));
      if (Array.isArray(cur.data)) result.data = cur.data;
    } catch { /* 無現檔 */ }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("已寫入", OUT, "→", result.value, result.delta, result.live ? "(盤中)" : "(收盤)");
}

main().catch((e) => { console.error(e); process.exit(1); });
