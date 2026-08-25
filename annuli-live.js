/* =====================================================================
   個人年輪 × AllenAnnuli 整合資料層：
   從 AllenAnnuli（https://allenchen1113official.github.io/allenannuli/）
   的 Supabase 後端讀取「大事紀」與「數字統計」，成功時覆蓋
   window.KIT.annuli；失敗（離線、網域未授權、無資料）時先退回
   data/annuli.json（GitHub Actions 每日台北凌晨 01:00 同步的快照，
   見 scripts/update-annuli.mjs），仍失敗才保留原有資料
   （Firestore／kit.jsx 內建預設），網站照常運作。
   僅取資料、不引入 AllenAnnuli 的視覺樣式——色調維持本站 Aurora tokens。
   本檔於 <head> 載入，先啟動抓取並提供 ready promise，由 App 啟動時
   await 後合併進 window.KIT（與 aurora-data.js 相同模式）。
   ===================================================================== */
(function () {
  var SITE = "https://allenchen1113official.github.io/allenannuli/";
  var SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  var TONES = ["insight", "intelligence", "illumination"];
  var TIMEOUT_MS = 6000; // 逾時即放行，避免拖慢首次繪製

  window.ANNULI = window.ANNULI || {};
  window.ANNULI.siteUrl = SITE;
  window.ANNULI.adminUrl = SITE + "admin.html";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("載入失敗：" + src)); };
      document.head.appendChild(s);
    });
  }

  function withTimeout(p, ms) {
    return Promise.race([
      p,
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error("AllenAnnuli 讀取逾時")); }, ms); }),
    ]);
  }

  // 退援層：讀取排程同步的同源快照（data/annuli.json，每日 01:00 更新）。
  function loadSnapshot() {
    return fetch("/AllenI3Aurora/data/annuli.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (snap) {
        if (!snap || !snap.annuli || !snap.annuli.length) throw new Error("快照無年輪資料");
        window.ANNULI.stats = snap.stats || [];
        window.ANNULI.range = snap.range || null;
        window.ANNULI.count = snap.count || snap.annuli.length;
        window.ANNULI.snapshot = true;
        window.ANNULI.updatedAt = snap.updatedAt || null;
        return { annuli: snap.annuli, stats: snap.stats || [], range: snap.range };
      });
  }

  var liveFetch = (async function () {
    // supabase-js 與 AllenAnnuli 的加密設定檔（以本站網域解密；
    // github.io 與 localhost 皆在其授權清單內）
    await Promise.all([loadScript(SUPABASE_CDN), loadScript(SITE + "config.js")]);
    if (!window.supabase || typeof window.getSupabaseConfig !== "function") {
      throw new Error("AllenAnnuli 相依未就緒");
    }
    var cfg = await window.getSupabaseConfig();
    var client = window.supabase.createClient(cfg.url, cfg.anonKey);

    var evQ = client.from("events")
      .select("*, event_categories(category_id, categories(*))")
      .order("year", { ascending: true })
      .order("month", { ascending: true, nullsFirst: true })
      .order("sort_order", { ascending: true });
    var statQ = client.from("stats").select("*").eq("visible", true).order("sort_order");

    var res = await Promise.all([evQ, statQ]);
    if (res[0].error) throw res[0].error;
    var events = (res[0].data || []).filter(function (ev) { return ev.show_on_homepage !== false; });
    var stats = (res[1] && res[1].data) || [];
    if (!events.length) throw new Error("AllenAnnuli 無大事紀資料");

    var annuli = events.map(function (ev, i) {
      var cats = (ev.event_categories || [])
        .map(function (ec) { return ec.categories; })
        .filter(Boolean)
        .map(function (c) { return (c.icon ? c.icon + " " : "") + (c.name || ""); });
      return {
        year: String(ev.year),
        month: ev.month || null,
        day: ev.day || null,
        tone: TONES[i % TONES.length],
        title: ev.title || "",
        body: ev.summary || "",
        cats: cats,
      };
    });

    var years = events.map(function (ev) { return ev.year; });
    var range = { start: Math.min.apply(null, years), end: Math.max.apply(null, years) };

    window.ANNULI.stats = stats;
    window.ANNULI.range = range;
    window.ANNULI.count = events.length;
    window.ANNULI.live = true;
    return { annuli: annuli, stats: stats, range: range };
  })();

  window.ANNULI.ready = withTimeout(liveFetch, TIMEOUT_MS)
    .catch(function (e) {
      console.warn("[annuli] 即時讀取 AllenAnnuli 失敗，改用每日同步快照：", e);
      return loadSnapshot();
    })
    .catch(function (e2) {
      console.warn("[annuli] 快照亦不可用，改用現有年輪資料：", e2);
      return null;
    });
})();
