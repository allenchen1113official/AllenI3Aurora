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

/* 證交所日期字串轉西元 YYYY-MM-DD：OpenAPI 用民國年（7 碼 yyymmdd，
   如 1150730＝民國115年）；MIS 用西元（8 碼 yyyymmdd，如 20260731）。 */
function formatTwDate(raw) {
  const s = String(raw || "").trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{7}$/.test(s)) return `${+s.slice(0, 3) + 1911}-${s.slice(3, 5)}-${s.slice(5, 7)}`;
  return s;
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
  const date = formatTwDate(rows[rows.length - 1].date);
  const asOf = `${date} 收盤`;
  return { value: numFmt.format(last), delta: deltaLabel(pct, pts), points: +pts.toFixed(2), pct: +pct.toFixed(2), data: closes.slice(-9), date, asOf, live: false };
}

/* 從結果取資料日 YYYY-MM-DD（優先 date 欄位，否則解析 asOf）。 */
function resultDate(r) {
  if (!r) return "";
  if (r.date) return String(r.date);
  const m = String(r.asOf || "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/* MIS 即時 → 當前指數、漲跌。走勢沿用收盤歷史。
   - 交易時段：僅接受台北「今日」資料（盤中即時）。
   - 非交易時段：接受 MIS 保留的最近一個交易日收盤快照——只要不比 OpenAPI
     收盤舊即可。OpenAPI 收盤常延遲一天以上，若像舊版只收「今日」，
     跨過台北午夜後就會退回 OpenAPI 而把較新的收盤覆蓋成前一日。 */
function parseRealtime(json, history, now = new Date()) {
  const a = json && json.msgArray && json.msgArray[0];
  if (!a) return null;
  const cur = parseFloat(String(a.z || "").replace(/,/g, ""));
  const prev = parseFloat(String(a.y || "").replace(/,/g, ""));
  if (!Number.isFinite(cur) || cur <= 0 || !Number.isFinite(prev) || prev <= 0) return null;
  const date = a.d ? formatTwDate(a.d) : "";
  if (!date) return null;
  const today = formatTwDate(taipeiNowParts(now).ymd);
  const trading = isTradingHours(now) && date === today;
  if (isTradingHours(now) && date !== today) return null; // 盤中卻非今日＝尚未開盤／舊快照
  if (date > today) return null;
  const histDate = resultDate(history);
  if (histDate && date < histDate) return null; // 比 OpenAPI 收盤舊，不採用
  const pts = cur - prev, pct = prev ? (pts / prev) * 100 : 0;
  // 走勢以近幾日收盤為底，末點換成當前指數；若 OpenAPI 已含同一天收盤則換掉該點，避免重複。
  let spark;
  const hd = history && history.data;
  if (hd && hd.length) spark = histDate === date ? [...hd.slice(0, -1).slice(-8), cur] : [...hd.slice(-8), cur];
  return {
    value: numFmt.format(cur), delta: deltaLabel(pct, pts), points: +pts.toFixed(2), pct: +pct.toFixed(2),
    data: spark,
    date,
    asOf: trading ? `${a.t || ""} 盤中`.trim() : `${date} 收盤`,
    live: trading,
  };
}

/* 決定最終寫入值：取資料日較新者；同日時盤中/MIS 優先於 OpenAPI。
   絕不以較舊的資料日覆蓋現有檔案（防止「回退」成前一日收盤）。 */
export function pickResult({ realtime, history, existing }) {
  let result = realtime || history || null;
  if (realtime && history && resultDate(history) > resultDate(realtime)) result = history;
  if (!result) return null;
  const exDate = resultDate(existing);
  if (exDate && resultDate(result) < exDate) return null; // 比現有檔案舊 → 不覆蓋
  return result;
}

function readExisting() {
  try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return null; }
}

async function main() {
  // 走勢（sparkline）與收盤基準：一律取 OpenAPI 近 9 日收盤。
  let history = null;
  try { history = parseHistory(await fetchJSON(OPENAPI_HIST)); }
  catch (e) { console.error("OpenAPI 收盤抓取失敗：", e.message); }

  let realtime = null;
  try { realtime = parseRealtime(await fetchJSON(MIS_REALTIME), history); }
  catch (e) { console.error("MIS 抓取失敗：", e.message); }

  const existing = readExisting();
  console.log("OpenAPI：", history ? `${resultDate(history)} ${history.value}` : "無",
    "｜MIS：", realtime ? `${realtime.date} ${realtime.value}${realtime.live ? "（盤中）" : ""}` : "無",
    "｜現有：", existing ? `${resultDate(existing)} ${existing.value}` : "無");

  const result = pickResult({ realtime, history, existing });
  if (!result) {
    console.error("無較新資料（或來源皆失敗），維持現有 data/taiex.json 不變。");
    process.exit(0);
  }

  if (!result.date) result.date = resultDate(result);
  if (!result.data && existing && Array.isArray(existing.data)) result.data = existing.data;
  result.updatedAt = new Date().toISOString();

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("已寫入", OUT, "→", result.date, result.value, result.delta, result.live ? "(盤中)" : "(收盤)");
}

// 直接執行才跑 main（測試 import 時不執行）。
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { parseHistory, parseRealtime, resultDate, isTradingHours };
