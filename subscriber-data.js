/* =====================================================================
   電子報訂閱者資料層（前台共用）
   ---------------------------------------------------------------------
   1. 文件 ID 即「私密 token」（16 bytes 亂數 → 32 hex）。讀者不需註冊帳號，
      憑信中連結（?t=token）即可確認訂閱、調整節奏、退訂（capability URL）。
   2. 規則只開放 get（單筆，需知道 token），不開放 list，因此名單無法被列舉，
      也不能像舊版那樣「輸入別人的 Email 就把他退訂」或探測某 Email 是否在名單上。
   3. 訂閱送出後狀態為 pending，等讀者點確認信才轉 confirmed（Double Opt-in），
      確認信由 GitHub Actions 每 10 分鐘掃描 mailState 佇列寄出。
   4. 優先沿用 aurora-data.js 建立的 window.AURORA.db；獨立頁面（confirm／manage）
      沒有它時自行初始化。未設定 Firebase 時 configured = false，前台顯示替代說明。
   ===================================================================== */
(function () {
  var COL = "aurora_subscribers";
  var LS_KEY = "aurora.subscriber.token";
  var SITE = "https://allenchen1113official.github.io/AllenI3Aurora/";
  var API = (window.AURORA_SUB = window.AURORA_SUB || {});

  function siteBase() {
    try {
      var h = location.hostname;
      if (h === "localhost" || h === "127.0.0.1" || h === "") {
        var m = location.pathname.match(/^(.*?\/AllenI3Aurora\/)/);
        return location.origin + (m ? m[1] : "/");
      }
    } catch { /* 非瀏覽器環境 */ }
    return SITE;
  }
  API.siteBase = siteBase;
  API.confirmUrl = function (t) { return siteBase() + "confirm.html?t=" + encodeURIComponent(t); };
  API.manageUrl = function (t) { return siteBase() + "manage.html?t=" + encodeURIComponent(t); };
  API.privacyUrl = function () { return siteBase() + "privacy.html"; };

  /* ---------- 純函式（不依賴 Firebase） ---------- */
  API.EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  API.normalizeEmail = function (s) { return String(s == null ? "" : s).trim().toLowerCase(); };
  API.validEmail = function (s) {
    var e = API.normalizeEmail(s);
    return e.length > 0 && e.length <= 254 && API.EMAIL_RE.test(e);
  };
  API.normalizeCadence = function (c) {
    c = c || {};
    return { day: !!c.day, week: !!c.week, month: !!c.month };
  };
  API.cadenceLabel = function (c) {
    var n = API.normalizeCadence(c), out = [];
    if (n.day) out.push("日報");
    if (n.week) out.push("週報");
    if (n.month) out.push("月報");
    return out.length ? out.join(" · ") : "（未選擇）";
  };
  API.newToken = function () {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  };
  API.tokenFromUrl = function () {
    try { return (new URLSearchParams(location.search).get("t") || "").trim(); } catch { return ""; }
  };
  API.rememberToken = function (t) { try { localStorage.setItem(LS_KEY, t); } catch { /* 隱私模式 */ } };
  API.savedToken = function () { try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; } };
  API.forgetToken = function () { try { localStorage.removeItem(LS_KEY); } catch { /* 隱私模式 */ } };

  /* ---------- Firebase ---------- */
  var db = window.AURORA && window.AURORA.db;
  if (!db) {
    var cfg = window.FIREBASE_CONFIG;
    var ok = !!(cfg && cfg.apiKey && cfg.projectId && window.firebase && window.firebase.firestore);
    if (ok) {
      if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
      db = window.firebase.firestore();
    }
  }
  API.configured = !!db;
  if (!db) return;
  API.db = db;

  var nowIso = function () { return new Date().toISOString(); };
  var docRef = function (token) { return db.collection(COL).doc(String(token || "")); };

  /** 建立訂閱（pending，等確認信）。 */
  API.subscribe = async function (opts) {
    opts = opts || {};
    var email = API.normalizeEmail(opts.email);
    if (!API.validEmail(email)) throw new Error("EMAIL_INVALID");
    var cadence = API.normalizeCadence(opts.cadence);
    if (!cadence.day && !cadence.week && !cadence.month) throw new Error("CADENCE_EMPTY");
    var token = API.newToken();
    var ts = nowIso();
    await docRef(token).set({
      email: email, status: "pending", cadence: cadence, mailState: "need_confirm",
      consent: true, source: String(opts.source || "web").slice(0, 40), locale: "zh-Hant",
      createdAt: ts, updatedAt: ts,
    });
    API.rememberToken(token);
    return { token: token, email: email, cadence: cadence };
  };

  API.get = async function (token) {
    if (!token) return null;
    var snap = await docRef(token).get();
    return snap.exists ? Object.assign({ token: snap.id }, snap.data()) : null;
  };

  /** 確認：pending → confirmed，排入歡迎信。 */
  API.confirm = async function (token) {
    var cur = await API.get(token);
    if (!cur) throw new Error("NOT_FOUND");
    if (cur.status === "confirmed") return cur;
    if (cur.status === "duplicate") throw new Error("DUPLICATE");
    await docRef(token).update({
      status: "confirmed",
      mailState: cur.status === "pending" ? "need_welcome" : "idle",
      confirmedAt: cur.confirmedAt || nowIso(),
      updatedAt: nowIso(),
    });
    return await API.get(token);
  };

  /** 調整節奏；全關等同退訂。 */
  API.updateCadence = async function (token, cadence) {
    var cur = await API.get(token);
    if (!cur) throw new Error("NOT_FOUND");
    var n = API.normalizeCadence(cadence);
    if (!n.day && !n.week && !n.month) return await API.unsubscribe(token);
    await docRef(token).update({ cadence: n, updatedAt: nowIso() });
    return await API.get(token);
  };

  /** 退訂：保留紀錄（同意／撤回軌跡），不刪除。 */
  API.unsubscribe = async function (token) {
    var cur = await API.get(token);
    if (!cur) throw new Error("NOT_FOUND");
    await docRef(token).update({ status: "unsubscribed", mailState: "idle", unsubscribedAt: nowIso(), updatedAt: nowIso() });
    return await API.get(token);
  };

  /** 復訂：還原上次的節奏；全空時給合理預設。 */
  API.resubscribe = async function (token, cadence) {
    var cur = await API.get(token);
    if (!cur) throw new Error("NOT_FOUND");
    var pick = cadence && (cadence.day || cadence.week || cadence.month) ? cadence : cur.cadence;
    var n = API.normalizeCadence(pick);
    if (!n.day && !n.week && !n.month) n = { day: false, week: true, month: true };
    await docRef(token).update({ status: "confirmed", cadence: n, mailState: "idle", updatedAt: nowIso() });
    return await API.get(token);
  };
})();
