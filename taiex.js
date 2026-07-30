/* =====================================================================
   加權指數 TAIEX 即時／最新交易資訊抓取層
   ---------------------------------------------------------------------
   資料來源：臺灣證券交易所 OpenAPI（openapi.twse.com.tw）
     · 具 CORS 標頭（Access-Control-Allow-Origin: *），可於純前端靜態站
       （GitHub Pages）直接以 fetch 讀取，無需任何後端代理。
     · MI_5MINS_INDEX：當日每 5 分鐘的大盤指數（交易時間內即時更新）。
     · MI_INDEX：最近一個交易日的收盤行情（含漲跌百分比）。

   策略：
     · 交易時間 / 當日有盤中資料 → 取 5 分鐘序列的最新值為「即時報價」，
       並以最近收盤（昨收）為基準計算漲跌幅；同時提供整日走勢供 Sparkline。
     · 非交易日 / 盤前 / 抓取不到盤中資料 → 退回 MI_INDEX 的「最新收盤資訊」。
     · 全部失敗 → 回傳 null，前端沿用 kit.jsx／Firebase 的內建靜態值。

   對外介面：window.TAIEX.fetchLatest() → Promise<Result|null>
     Result = {
       value:   "23,588.42"     // 已格式化字串
       valueNum: 23588.42
       delta:   "+0.75%"        // 已格式化字串（可能為 null）
       deltaPct: 0.75           // 帶正負號
       up:      true
       series:  [..number..]    // 走勢（Sparkline 用，可能為 null）
       asOf:    "13:25"         // 盤中最新資料時間（可能為 null）
       date:    "20260729"      // 資料日期 yyyymmdd（可能為 null）
       intraday: true           // true=交易時間即時 / false=最新收盤
       source:  "twse-openapi"
     }
   ===================================================================== */
(function () {
  "use strict";

  var API = "https://openapi.twse.com.tw/v1";
  var URL_5MIN = API + "/indicesReport/MI_5MINS_INDEX"; // 當日每 5 分鐘指數
  var URL_DAILY = API + "/exchangeReport/MI_INDEX";     // 最近交易日收盤行情

  /* ---------- 小工具 ---------- */

  function getJSON(url) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // 去除 HTML 標籤、千分位逗號後轉數字（保留正負號與小數點）
  function parseNum(x) {
    if (x == null) return NaN;
    var s = String(x).replace(/<[^>]*>/g, "").replace(/,/g, "").replace(/[^\d.+-]/g, "");
    return parseFloat(s);
  }

  // 依序嘗試精確鍵名，找不到再用正則挑選
  function pickKey(keys, exacts, test) {
    for (var i = 0; i < exacts.length; i++) {
      if (keys.indexOf(exacts[i]) !== -1) return exacts[i];
    }
    if (test) {
      for (var j = 0; j < keys.length; j++) {
        if (test(keys[j])) return keys[j];
      }
    }
    return null;
  }

  // 正規化日期 → yyyymmdd（支援西元 8 碼與民國 7 碼）
  function normDate(x) {
    var d = String(x == null ? "" : x).replace(/\D/g, "");
    if (d.length === 8) return d;
    if (d.length === 7) return String(parseInt(d.slice(0, 3), 10) + 1911) + d.slice(3);
    return d || null;
  }

  // 台北時區的今天 yyyymmdd
  function taipeiYmd() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date()).replace(/-/g, "");
    } catch (e) { return ""; }
  }

  function fmtVal(v) {
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(p) {
    if (!isFinite(p)) return null;
    return (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
  }

  /* ---------- 解析：當日 5 分鐘序列 ---------- */
  function parseFive(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var keys = Object.keys(rows[0]);
    var valKey = pickKey(keys, ["發行量加權股價指數"],
      function (k) { return /加權/.test(k) && !/未含/.test(k); });
    var timeKey = pickKey(keys, ["時間", "Time", "time"], function (k) { return /時間|time/i.test(k); });
    var dateKey = pickKey(keys, ["日期", "Date", "date"], function (k) { return /日期|date/i.test(k); });
    if (!valKey) return null;

    var series = [], date = null;
    for (var i = 0; i < rows.length; i++) {
      var v = parseNum(rows[i][valKey]);
      if (!isFinite(v) || v <= 0) continue;
      series.push({ t: timeKey ? String(rows[i][timeKey]).trim() : "", v: v });
      if (dateKey && rows[i][dateKey]) date = normDate(rows[i][dateKey]);
    }
    if (!series.length) return null;
    return { series: series, last: series[series.length - 1], date: date };
  }

  /* ---------- 解析：最近交易日收盤（發行量加權股價指數列） ---------- */
  function parseDaily(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var keys = Object.keys(rows[0]);
    var nameKey = pickKey(keys, ["指數", "指數名稱", "Name", "name"],
      function (k) { return /指數/.test(k) && !/收盤|開盤|最高|最低|漲跌/.test(k); });
    var closeKey = pickKey(keys, ["收盤指數"], function (k) { return /收盤/.test(k); });
    var pctKey = pickKey(keys, ["漲跌百分比"], function (k) { return /百分比/.test(k); });
    var ptsKey = pickKey(keys, ["漲跌點數"], function (k) { return /點數/.test(k); });
    var dirKey = pickKey(keys, ["漲跌(+/-)", "漲跌"],
      function (k) { return /漲跌/.test(k) && !/點數|百分比/.test(k); });
    if (!nameKey || !closeKey) return null;

    var row = null;
    for (var i = 0; i < rows.length; i++) {
      var nm = String(rows[i][nameKey] == null ? "" : rows[i][nameKey]).replace(/\s/g, "");
      if (nm === "發行量加權股價指數" || /發行量加權股價指數/.test(nm)) { row = rows[i]; break; }
    }
    if (!row) return null;

    var value = parseNum(row[closeKey]);
    if (!isFinite(value)) return null;

    var pctAbs = pctKey ? Math.abs(parseNum(row[pctKey])) : NaN;
    // 判斷漲跌方向：綜合漲跌點數、百分比、方向欄位的符號 / 顏色 / 文字
    var ptsRaw = ptsKey ? String(row[ptsKey] == null ? "" : row[ptsKey]) : "";
    var pctRaw = pctKey ? String(row[pctKey] == null ? "" : row[pctKey]) : "";
    var dirRaw = dirKey ? String(row[dirKey] == null ? "" : row[dirKey]) : "";
    var sign = 1;
    if (/-/.test(ptsRaw) || /-/.test(pctRaw) || /green|綠|跌/i.test(dirRaw) || /^\s*-/.test(dirRaw)) {
      sign = -1;
    }
    var signedPct = isFinite(pctAbs) ? sign * pctAbs : NaN;

    return { value: value, signedPct: signedPct };
  }

  /* ---------- 主流程 ---------- */
  function fetchLatest() {
    var pFive = getJSON(URL_5MIN).then(parseFive).catch(function () { return null; });
    var pDaily = getJSON(URL_DAILY).then(parseDaily).catch(function () { return null; });

    return Promise.all([pFive, pDaily]).then(function (arr) {
      var intr = arr[0], day = arr[1];
      var today = taipeiYmd();

      // 情境一：當日盤中／收盤已有 5 分鐘資料 → 即時報價
      if (intr && intr.series.length && (!today || intr.date === today || !intr.date)) {
        // 僅在日期確為今日時視為「即時」；日期缺失時保守處理仍採盤中值
        var isToday = !today || !intr.date || intr.date === today;
        var value = intr.last.v;
        var signedPct = NaN;

        if (day && isFinite(day.value)) {
          if (Math.abs(day.value - value) < 0.5 && isFinite(day.signedPct)) {
            // MI_INDEX 已更新為當日收盤 → 直接採用其官方漲跌幅
            signedPct = day.signedPct;
          } else {
            // MI_INDEX 仍為昨收 → 以昨收為基準計算盤中漲跌幅
            signedPct = ((value - day.value) / day.value) * 100;
          }
        }

        if (isToday) {
          return {
            value: fmtVal(value),
            valueNum: value,
            delta: fmtPct(signedPct),
            deltaPct: signedPct,
            up: !isFinite(signedPct) || signedPct >= 0,
            series: intr.series.map(function (s) { return s.v; }),
            asOf: intr.last.t || null,
            date: intr.date || today || null,
            intraday: true,
            source: "twse-openapi",
          };
        }
      }

      // 情境二：退回最新收盤資訊
      if (day && isFinite(day.value)) {
        return {
          value: fmtVal(day.value),
          valueNum: day.value,
          delta: fmtPct(day.signedPct),
          deltaPct: day.signedPct,
          up: !isFinite(day.signedPct) || day.signedPct >= 0,
          series: null,
          asOf: null,
          date: null,
          intraday: false,
          source: "twse-openapi",
        };
      }

      return null;
    }).catch(function () { return null; });
  }

  window.TAIEX = { fetchLatest: fetchLatest };
})();
