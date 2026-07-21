/* =====================================================================
   前台資料層：若 Supabase 已設定，讀取各區塊資料並覆蓋 window.KIT；
   未設定或讀取失敗時，保留 kit.jsx 的內建預設資料（網站照常運作）。
   本檔於 <head> 載入（早於 kit.jsx），僅先啟動抓取並提供 ready promise，
   由 App 啟動時 await 後合併進 window.KIT。
   ===================================================================== */
(function () {
  window.AURORA = window.AURORA || {};

  // KIT 區塊鍵 → Supabase 資料表
  var TABLES = {
    stats: "aurora_stats",
    focus: "aurora_focus",
    reading: "aurora_reading",
    podcasts: "aurora_podcasts",
    links: "aurora_links",
    issues: "aurora_issues",
    annuli: "aurora_annuli",
  };

  var url = window.SUPABASE_URL;
  var key = window.SUPABASE_ANON_KEY;

  if (!url || !key || !window.supabase || !window.supabase.createClient) {
    window.AURORA.configured = false;
    window.AURORA.ready = Promise.resolve(null);
    return;
  }

  window.AURORA.configured = true;
  var client = window.supabase.createClient(url, key);
  window.AURORA.client = client;

  window.AURORA.ready = (async function () {
    try {
      var out = {};
      await Promise.all(Object.keys(TABLES).map(async function (kitKey) {
        var res = await client.from(TABLES[kitKey]).select("*").order("sort", { ascending: true });
        if (!res.error && Array.isArray(res.data) && res.data.length) out[kitKey] = res.data;
      }));
      window.AURORA.data = out;
      return out;
    } catch (e) {
      console.warn("[aurora] 讀取 Supabase 失敗，改用內建預設資料：", e);
      return null;
    }
  })();
})();
