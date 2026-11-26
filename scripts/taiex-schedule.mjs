/* =====================================================================
   加權指數 TAIEX 更新時程（純邏輯，供 taiex-update.yml 常駐輪詢使用）。

   規則（2026-11-26，一律台北時間 UTC+8）：
   1. 交易日交易期間（週一至週五 09:00–13:35）：即時更新，每 2 分鐘抓 MIS 即時指數。
   2. 交易日收盤後：13:36、13:45 取收盤值，15:10 再以 OpenAPI 確認一次。
   3. 其餘時間（夜間、週末、休市日）：每日凌晨 01:00 更新一次即可。

   休市判定：平日 09:40 後 data/taiex.json 的資料日仍不是今天 → 視為休市，
   不再密集輪詢；但為了避免「來源暫時抓不到」被誤判，收盤前每 15 分鐘探測一次。

   CLI：node scripts/taiex-schedule.mjs → 印出「<phase> <距下次更新秒數> <下次更新台北時間>」
   ===================================================================== */
import { readFileSync } from "node:fs";

const H8 = 8 * 3600 * 1000;
const MIN = 60 * 1000;

export const SESSION_START = 9 * 60;        // 09:00 開盤
export const SESSION_END = 13 * 60 + 35;    // 13:35 收盤值出現後結束密集輪詢（13:30 收盤＋結算緩衝）
export const HOLIDAY_CHECK = 9 * 60 + 40;   // 09:40 後仍無今日資料 → 視為休市
export const POLL_TRADING_SEC = 120;        // 交易期間輪詢間隔
export const POLL_PROBE_SEC = 900;          // 疑似休市時的探測間隔
export const CLOSE_EVENTS = [13 * 60 + 36, 13 * 60 + 45, 15 * 60 + 10]; // 收盤後更新時點
export const DAILY_EVENT = 1 * 60;          // 每日 01:00

/* 台北當下：星期（0=日…6=六）、當日分鐘數、YYYY-MM-DD、當日 00:00 的 epoch 毫秒。 */
export function taipeiParts(now = Date.now()) {
  const d = new Date(+now + H8);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    midnight: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - H8,
  };
}

const isWeekday = (dow) => dow >= 1 && dow <= 5;
const fmtTpe = (ms) => new Date(ms + H8).toISOString().slice(0, 16).replace("T", " ");

/* 決定下一次更新：回傳 { phase, delaySec, at }。
   phase：trading（交易期間）／probe（疑似休市探測）／close（收盤後）／open（等開盤）／daily（每日 01:00）
   dataDate：data/taiex.json 目前的資料日（YYYY-MM-DD）。 */
export function planNext(now = Date.now(), dataDate = "") {
  now = +now;
  const t = taipeiParts(now);
  const weekday = isWeekday(t.dow);
  const tradedToday = dataDate === t.date;

  if (weekday && t.minutes >= SESSION_START && t.minutes < SESSION_END) {
    const suspectClosed = t.minutes >= HOLIDAY_CHECK && !tradedToday;
    const sec = suspectClosed ? POLL_PROBE_SEC : POLL_TRADING_SEC;
    // 不要睡過收盤：最遲在第一個收盤後時點醒來
    const untilClose = Math.ceil((t.midnight + CLOSE_EVENTS[0] * MIN - now) / 1000);
    const delaySec = Math.max(5, Math.min(sec, untilClose));
    return { phase: suspectClosed ? "probe" : "trading", delaySec, at: fmtTpe(now + delaySec * 1000) };
  }

  // 非交易期間：找出下一個固定時點
  const events = [];
  for (let off = 0; off <= 7; off++) {
    const day0 = t.midnight + off * 24 * 3600 * 1000;
    const dow = (t.dow + off) % 7;
    events.push({ at: day0 + DAILY_EVENT * MIN, phase: "daily" });
    if (isWeekday(dow)) events.push({ at: day0 + SESSION_START * MIN, phase: "open" });
    if (off === 0 && weekday && tradedToday) for (const m of CLOSE_EVENTS) events.push({ at: day0 + m * MIN, phase: "close" });
  }
  const next = events.filter((e) => e.at > now + 5000).sort((a, b) => a.at - b.at)[0];
  return { phase: next.phase, delaySec: Math.ceil((next.at - now) / 1000), at: fmtTpe(next.at) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let dataDate = "";
  try { dataDate = String(JSON.parse(readFileSync("data/taiex.json", "utf8")).date || ""); } catch { /* 沒檔案＝未知 */ }
  const p = planNext(Date.now(), dataDate);
  console.log(`${p.phase} ${p.delaySec} ${p.at.replace(" ", "T")}`);
}
