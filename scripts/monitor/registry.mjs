/* =====================================================================
   排程監控 · 註冊表（瀏覽器與 Node 共用，純資料、無相依）

   - WORKFLOWS：各 GitHub Actions workflow 的顯示名稱與「可否自後台重跑／自動重試」政策。
     cron 本身不寫在這裡——監控代理每輪直接解析 .github/workflows/*.yml（含行尾的
     「# 台北…」註解），新增 workflow 不必改本檔也會被監控（套用 DEFAULT_POLICY）。
   - DATA_CHECKS：以「產出結果」判斷排程是否真的有做事（data/*.json 的日期／時間戳）。
   - CLAUDE_TASKS：Claude 排程任務（雲端 routine）。GitHub Actions 無法查詢其執行紀錄，
     改以對應產出的新鮮度判斷；重新執行需到 Claude 的排程頁操作。

   政策欄位：
     dispatch   後台可否觸發 workflow_dispatch（false＝只能到 GitHub Actions 頁操作）
     autoRetry  排程執行失敗時，監控代理自動「重跑失敗的工作」一次（只用於冪等的資料同步）
     catchUp    GitHub 延遲／丟棄排程時，監控代理以 workflow_dispatch 補跑（只用於冪等、可重複執行的工作）
     inputs     後台可帶入的 workflow_dispatch 參數白名單（其他參數一律丟棄）
     confirm    "strong"＝後台需輸入 workflow 名稱才可送出（影響正式環境的動作）
   ===================================================================== */

export const REPO = { owner: "allenchen1113official", repo: "AllenI3Aurora", branch: "main" };

const DRY_RUN = { dry_run: { type: "boolean", label: "只列出動作（dry run）", default: false } };

export const DEFAULT_POLICY = { label: "", category: "其他", dispatch: false, autoRetry: false, catchUp: false, inputs: {}, confirm: "" };

export const WORKFLOWS = {
  "taiex-update.yml":           { label: "加權指數 TAIEX",        category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "focus-update.yml":           { label: "今日關注動態",          category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "daily-update.yml":           { label: "艾倫極光日報（Drive）", category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "daily-rollover.yml":         { label: "日報每日換日",          category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "annuli-update.yml":          { label: "個人年輪同步",          category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "exercise-update.yml":        { label: "運動資料 Garmin",       category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "day-archive.yml":            { label: "2026 年前日報彙整",     category: "資料同步", dispatch: true,  autoRetry: true, catchUp: true },
  "social-publish.yml":         { label: "PilotOne 社群發文",     category: "社群",     dispatch: true,  autoRetry: false, catchUp: true, inputs: DRY_RUN },
  "social-insights.yml":        { label: "社群成效同步",          category: "社群",     dispatch: true,  autoRetry: true, catchUp: true,  inputs: DRY_RUN },
  "subscriber-mail.yml":        { label: "訂閱確認／歡迎信",      category: "電子報",   dispatch: true,  autoRetry: false, catchUp: true, inputs: DRY_RUN },
  "newsletter-send.yml":        { label: "寄送本期電子報",        category: "電子報",   dispatch: false, autoRetry: false,
                                  reason: "寄信不可逆，請到 GitHub Actions 頁依 dry_run → test_to → 正式 的順序手動執行。" },
  "firestore-rules-deploy.yml": { label: "Firestore 規則部署",    category: "維運",     dispatch: true,  autoRetry: false, confirm: "strong" },
  "pages-build-deployment":     { label: "GitHub Pages 部署",     category: "維運",     dispatch: false, autoRetry: false,
                                  reason: "由 GitHub 在 main 更新時自動部署；需要重新部署時推送任一 commit 即可。" },
  "schedule-monitor.yml":       { label: "排程監控代理",          category: "維運",     dispatch: true,  autoRetry: false },
};

export function policyFor(file) {
  const p = WORKFLOWS[file] || {};
  return { ...DEFAULT_POLICY, ...p, inputs: { ...(p.inputs || {}) } };
}

/* 產出新鮮度檢查（日期一律台北時間）
   type "date"：field 為 YYYY.MM.DD；cadence daily＝每天、weekday＝週一至週五（休市日會落後一天，只記警告）；
                readyAt＝當日產出最晚應就緒的台北時間（之前只要求前一期）。
   type "age" ：field 為 ISO 時間戳；超過 warnHours／failHours 即警告／異常；空值視為「尚未設定」。 */
export const DATA_CHECKS = [
  { key: "prebrief",   label: "台股盤前速報",       file: "data/prebrief.json",           type: "date", field: "date",     cadence: "weekday", readyAt: "09:30",
    source: "Claude 排程 06:00 → focus-update 帶入" },
  { key: "daily",      label: "艾倫極光日報（內容）", file: "data/newsletter-current.json", type: "date", field: "day.date", cadence: "daily",   readyAt: "11:30",
    source: "Claude 排程 07:00 → focus-update 讀 Drive" },
  { key: "daily-date", label: "日報換日",           file: "data/daily.json",              type: "date", field: "date",     cadence: "daily",   readyAt: "09:30",
    source: "daily-rollover／daily-update 08:00" },
  { key: "heatmap",    label: "台股熱力圖",         file: "data/heatmap.json",            type: "date", field: "date",     cadence: "weekday", readyAt: "23:45",
    source: "Claude 排程 18:00 → focus-update 帶入" },
  { key: "stockradar", label: "台股選股雷達",       file: "data/stockradar.json",         type: "date", field: "date",     cadence: "weekday", readyAt: "23:59",
    source: "Claude 排程 21:30 → focus-update 23:30 帶入", lagGraceDays: 1 },
  { key: "taiex",      label: "加權指數快照",       file: "data/taiex.json",              type: "age",  field: "updatedAt", warnHours: 26, failHours: 74,
    source: "taiex-update" },
  { key: "annuli",     label: "個人年輪快照",       file: "data/annuli.json",             type: "age",  field: "updatedAt", warnHours: 26, failHours: 50,
    source: "annuli-update 01:00" },
  { key: "exercise",   label: "運動資料",           file: "data/exercise.json",           type: "age",  field: "updatedAt", warnHours: 8,  failHours: 30,
    source: "exercise-update（需 GARMIN_* Secrets）" },
];

/* Claude 排程任務（2026-10-30 盤點；cron 為台北時間）。
   check＝對應的 DATA_CHECKS key；發文類任務需 Allen 每次確認，無法自動驗證，check 留空。 */
export const CLAUDE_TASKS = [
  { id: "trig_015t1mPpSXjxpW9UvpexfaLs", name: "台股盤前速報",              cron: "CRON_TZ=Asia/Taipei 0 6 * * 1-5",   check: "prebrief" },
  { id: "trig_01X7LmRceXNfnvqQ8kDzRdEK", name: "艾倫極光日報",              cron: "CRON_TZ=Asia/Taipei 0 7 * * *",     check: "daily" },
  { id: "trig_0134Mk14zpeYqRZmF81d3hCS", name: "台股熱力圖（上市／上櫃）",   cron: "CRON_TZ=Asia/Taipei 0 18 * * 1-5",  check: "heatmap" },
  { id: "trig_015VuRq61T3jNPWYmmg64RCZ", name: "台股選股雷達 TOP 10",        cron: "CRON_TZ=Asia/Taipei 30 21 * * 1-5", check: "stockradar" },
  { id: "trig_01Dz4wx74V1MnnHGaheaXrj4", name: "盤前速報｜FB＋IG 發文",      cron: "CRON_TZ=Asia/Taipei 30 6 * * 1-5",  check: "", manual: true },
  { id: "trig_01AhPQ5phpLMW8vyKVMnVhuj", name: "極光日報｜FB＋IG＋Threads 發文", cron: "CRON_TZ=Asia/Taipei 8 8 * * *",   check: "", manual: true },
  { id: "trig_01KeuuacckZZsdd8UgCpd3dk", name: "熱力圖｜FB＋IG＋Threads 發文", cron: "CRON_TZ=Asia/Taipei 56 19 * * 1-5", check: "", manual: true },
  { id: "trig_018cCAAwpSA8wce1uVfd3PH2", name: "選股雷達｜FB＋IG＋Threads 發文", cron: "CRON_TZ=Asia/Taipei 0 23 * * 1-5", check: "", manual: true },
];
