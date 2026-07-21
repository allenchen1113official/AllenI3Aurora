/* =====================================================================
   前台資料層：若 Firebase 已設定，讀取各區塊資料並覆蓋 window.KIT；
   未設定或讀取失敗時，保留 kit.jsx 的內建預設資料（網站照常運作）。
   本檔於 <head> 載入（早於 kit.jsx），僅先啟動抓取並提供 ready promise，
   由 App 啟動時 await 後合併進 window.KIT。
   ===================================================================== */
(function () {
  window.AURORA = window.AURORA || {};

  // KIT 區塊鍵 → Firestore collection
  var COLLECTIONS = {
    stats: "aurora_stats",
    focus: "aurora_focus",
    reading: "aurora_reading",
    podcasts: "aurora_podcasts",
    links: "aurora_links",
    issues: "aurora_issues",
    annuli: "aurora_annuli",
  };

  var cfg = window.FIREBASE_CONFIG;
  var ok = cfg && cfg.apiKey && cfg.projectId && window.firebase && window.firebase.firestore;

  if (!ok) {
    window.AURORA.configured = false;
    window.AURORA.ready = Promise.resolve(null);
    return;
  }

  window.AURORA.configured = true;
  if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
  var db = window.firebase.firestore();
  window.AURORA.db = db;

  window.AURORA.ready = (async function () {
    try {
      var out = {};
      await Promise.all(Object.keys(COLLECTIONS).map(async function (key) {
        var snap = await db.collection(COLLECTIONS[key]).orderBy("sort").get();
        var arr = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        if (arr.length) out[key] = arr;
      }));
      window.AURORA.data = out;
      return out;
    } catch (e) {
      console.warn("[aurora] 讀取 Firebase 失敗，改用內建預設資料：", e);
      return null;
    }
  })();
})();
