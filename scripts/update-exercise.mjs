/* =====================================================================
   運動資料定時更新腳本（伺服器端，由 GitHub Actions 執行）。

   比照 TAIEX：伺服器端抓取無 CORS 限制，向 Garmin Connect 取得近期運動
   活動，彙整「本週運動時數」寫入同源 data/exercise.json 供前端讀取，
   確保儀表板首頁的「運動」卡永遠是最新資訊（不受 Firestore 舊值影響）。

   資料來源：Garmin Connect（個人檔案）
     https://connect.garmin.com/app/profile/50e697d9-3333-4ec3-a1e1-eebf531414c3
   需以帳號登入才能取活動資料，帳密由 GitHub Actions Secrets 提供：
     GARMIN_EMAIL、GARMIN_PASSWORD
   未設定帳密或抓取失敗時，保留現有 data/exercise.json（不覆蓋成空值），
   與 TAIEX 相同的「失敗即維持現值」策略。

   統計口徑：
   - value：本週（台北時區，週一 00:00 起）所有活動的移動總時數（hr）。
   - delta：相對上週總時數的百分比變化（如「+12%」）。
   - data ：近 8 天每日運動時數（走勢 sparkline）。
   ===================================================================== */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "data/exercise.json";
const EMAIL = process.env.GARMIN_EMAIL;
const PASSWORD = process.env.GARMIN_PASSWORD;

/* 保留現有檔案、不覆蓋成空值後結束（與 TAIEX 相同的降級策略）。 */
function keepExisting(reason) {
  console.error(reason + " → 維持現有 " + OUT + " 不變。");
  process.exit(0);
}

/* 台北時區的 yyyy-mm-dd（用於分週、分日彙整）。 */
function taipeiYmd(date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

/* 台北時區「今天」為週幾（1=一 … 7=日）。 */
function taipeiIsoDow(date) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", weekday: "short" }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd] || 1;
}

/* 由某日回推 n 天的 yyyy-mm-dd（以台北時區日界計，用 UTC 位移近似）。 */
function ymdDaysAgo(baseYmd, n) {
  const d = new Date(baseYmd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/* Garmin 活動的開始日期（台北時區 yyyy-mm-dd）。
   startTimeLocal 形如「2026-08-01 07:30:00」（Garmin 已是當地時間）。 */
function activityYmd(act) {
  const s = String(act.startTimeLocal || act.startTimeGMT || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function activitySeconds(act) {
  const d = Number(act.duration || act.movingDuration || act.elapsedDuration || 0);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

const hrFmt = (sec) => (sec / 3600).toFixed(1);

async function main() {
  if (!EMAIL || !PASSWORD) {
    keepExisting("未提供 GARMIN_EMAIL / GARMIN_PASSWORD");
  }

  // garmin-connect 於 workflow 內以 npm 動態安裝；此處延後匯入以利無帳密時直接降級。
  let GarminConnect;
  try {
    ({ GarminConnect } = await import("garmin-connect"));
  } catch (e) {
    keepExisting("無法載入 garmin-connect 套件：" + e.message);
  }

  let activities = [];
  try {
    const client = new GarminConnect({ username: EMAIL, password: PASSWORD });
    await client.login();
    // 取最近 40 筆活動，足以涵蓋本週與上週。
    activities = await client.getActivities(0, 40);
    if (!Array.isArray(activities)) activities = [];
  } catch (e) {
    keepExisting("Garmin 登入或抓取失敗：" + e.message);
  }

  if (!activities.length) keepExisting("Garmin 無活動資料");

  // 週界：以台北時區「本週一 00:00」為界。
  const now = new Date();
  const todayYmd = taipeiYmd(now);
  const dow = taipeiIsoDow(now);               // 1=一 … 7=日
  const thisMondayYmd = ymdDaysAgo(todayYmd, dow - 1);
  const lastMondayYmd = ymdDaysAgo(thisMondayYmd, 7);

  let thisWeek = 0, lastWeek = 0;
  // 近 8 天每日時數走勢（索引 0＝7 天前 … 7＝今天）。
  const daily = new Array(8).fill(0);
  const dayKeys = Array.from({ length: 8 }, (_, i) => ymdDaysAgo(todayYmd, 7 - i));

  for (const act of activities) {
    const ymd = activityYmd(act);
    if (!ymd) continue;
    const sec = activitySeconds(act);
    if (ymd >= thisMondayYmd) thisWeek += sec;
    else if (ymd >= lastMondayYmd) lastWeek += sec;
    const di = dayKeys.indexOf(ymd);
    if (di >= 0) daily[di] += sec;
  }

  const pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);
  const result = {
    value: hrFmt(thisWeek),
    unit: "hr",
    delta: (pct >= 0 ? "+" : "") + pct + "%",
    data: daily.map((s) => +(s / 3600).toFixed(1)),
    asOf: `本週 ${thisMondayYmd}~${todayYmd}`,
    updatedAt: new Date().toISOString(),
  };

  // 若本週尚無活動、走勢全 0，保留現值避免顯示 0.0。
  if (result.data.every((v) => v === 0) && result.value === "0.0") {
    keepExisting("本週與近 8 天皆無活動資料");
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log("已寫入", OUT, "→", result.value, result.unit, result.delta, result.asOf);
}

main().catch((e) => {
  // 任何未預期錯誤也不覆蓋現有檔案。
  console.error(e);
  try { readFileSync(OUT); process.exit(0); } catch { process.exit(1); }
});
