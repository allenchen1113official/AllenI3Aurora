/* =====================================================================
   Podcast（RSS 託管）發布客戶端 — PilotOne 的 pc 頻道
   ---------------------------------------------------------------------
   音檔託管在本 repo 的 GitHub Releases（每年一個 release：podcast-<YYYY>，
   每集一個附件），RSS 由 scripts/podcast/build-feed.mjs 依 Firestore
   aurora_podcast_feed 產生 podcast.xml，經 GitHub Pages 對外提供；
   Apple Podcasts／Spotify／YouTube Music 只要訂閱那一個網址。

   介面（core.mjs 的 runPc 使用）：
     publish({ id, title, notes, audioUrl, audioDriveId, audioName, duration, explicit, episodeType, link, now })
       → { guid, url, enclosureUrl, length, type, duration, episode }
     checkToken() → { name }

   冪等：同一筆貼文重跑時
     - release 附件已存在（同檔名）→ 不重新下載上傳，沿用
     - aurora_podcast_feed/<id> 已存在 → 保留原本的 guid、集數、pubDate
   所以「上一輪送出後未回寫」可以安全重送，不會在 RSS 出現兩集。

   音檔來源：audioDriveId（Drive 送審包，服務帳戶下載）或 audioUrl（https；
   Google Drive 分享連結會自動轉成檔案 id 改走服務帳戶）。
   fetchImpl／driveDownload／feed 皆由呼叫端注入，podcast.test.mjs 以假物件測試。
   ===================================================================== */
import { GraphError } from "./core.mjs";

export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const AUDIO_TYPES = { mp3: "audio/mpeg", m4a: "audio/x-m4a", mp4: "audio/mp4", aac: "audio/aac", wav: "audio/wav" };
export const AUDIO_RE = /\.(mp3|m4a|mp4|aac|wav)$/i;
export const guidOf = (id) => `aurora-pc-${id}`;
export const releaseTag = (iso) => `podcast-${new Date(Date.parse(iso) + 8 * 3600 * 1000).getUTCFullYear()}`; // 台北年度

/* Google Drive 分享連結 → 檔案 id（不是 Drive 連結回 null） */
export function driveIdOf(url) {
  const s = String(url || "");
  if (!/^https:\/\/(drive|docs)\.google\.com\/|^https:\/\/drive\.usercontent\.google\.com\//i.test(s)) return null;
  const m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

/* 附件檔名：<台北日期>-<安全化 id>.<副檔名>（同一筆貼文永遠同名 → 冪等） */
export function assetName(id, iso, ext) {
  const d = new Date(Date.parse(iso) + 8 * 3600 * 1000);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const safe = String(id).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "episode";
  return `${ymd}-${safe}.${ext}`;
}

/* 由檔名或內容判斷格式；不是音檔（例如 Drive 的 HTML 警告頁）回 null */
export function sniffAudio(buf, name = "") {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const at = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (at(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return "mp3";
  if (at(4, "ftyp")) return /\.mp4$/i.test(name) ? "mp4" : "m4a";
  if (at(0, "RIFF") && at(8, "WAVE")) return "wav";
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return "aac"; // ADTS
  return null;
}

const looksText = (buf) => { const b = buf.subarray(0, 512); return b.length > 0 && b.every((x) => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127) || x >= 0xc0 || (x >= 0x80 && x < 0xc0)) && /^\s*[<{[]/.test(Buffer.from(b).toString("utf8")); };

/* ---------- 長度（秒）：MP3（Xing／VBRI／CBR 推算）、M4A（mvhd）、WAV ---------- */
const MP3_BITRATE = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],   // MPEG-1 Layer III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],      // MPEG-2/2.5 Layer III
};
const MP3_RATE = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function mp3Duration(b) {
  let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  for (const lim = Math.min(b.length - 4, i + 64 * 1024); i < lim; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) continue; // 只認 Layer III
    const rate = MP3_RATE[ver][sr], kbps = MP3_BITRATE[ver === 3 ? 1 : 2][br];
    const spf = ver === 3 ? 1152 : 576;
    const mono = (b[i + 3] >> 6) === 3;
    const side = ver === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
    const x = i + 4 + side, tag = String.fromCharCode(b[x], b[x + 1], b[x + 2], b[x + 3]);
    if ((tag === "Xing" || tag === "Info") && (b[x + 7] & 1)) {
      const frames = (b[x + 8] << 24 >>> 0) + (b[x + 9] << 16) + (b[x + 10] << 8) + b[x + 11];
      return Math.round(frames * spf / rate);
    }
    const v = i + 36;
    if (String.fromCharCode(b[v], b[v + 1], b[v + 2], b[v + 3]) === "VBRI") {
      const frames = (b[v + 14] << 24 >>> 0) + (b[v + 15] << 16) + (b[v + 16] << 8) + b[v + 17];
      return Math.round(frames * spf / rate);
    }
    return Math.round((b.length - i) * 8 / (kbps * 1000)); // CBR
  }
  return null;
}
function m4aDuration(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const walk = (start, end) => {
    for (let p = start; p + 8 <= end;) {
      let size = dv.getUint32(p);
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      let hdr = 8;
      if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16; } else if (size === 0) size = end - p;
      if (size < hdr) return null;
      if (type === "moov") return walk(p + hdr, Math.min(end, p + size));
      if (type === "mvhd") {
        const q = p + hdr, v1 = b[q] === 1;
        const scale = dv.getUint32(q + (v1 ? 20 : 12));
        const dur = v1 ? Number(dv.getBigUint64(q + 24)) : dv.getUint32(q + 16);
        return scale ? Math.round(dur / scale) : null;
      }
      p += size;
    }
    return null;
  };
  return walk(0, b.length);
}
function wavDuration(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let byteRate = 0;
  for (let p = 12; p + 8 <= b.length;) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), size = dv.getUint32(p + 4, true);
    if (id === "fmt ") byteRate = dv.getUint32(p + 16, true);
    if (id === "data") return byteRate ? Math.round(size / byteRate) : null;
    p += 8 + size + (size & 1);
  }
  return null;
}
export function audioDuration(buf, kind) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    if (kind === "mp3") return mp3Duration(b);
    if (kind === "m4a" || kind === "mp4") return m4aDuration(b);
    if (kind === "wav") return wavDuration(b);
  } catch { /* 解析失敗就不填長度（RSS 允許省略 itunes:duration） */ }
  return null;
}

/* GitHub API 錯誤 → GraphError（401／403 權限＝需人工；5xx／429＝可重試） */
function ghError(status, data, what) {
  const msg = (data && data.message) || `HTTP ${status}`;
  const e = new GraphError(`GitHub Releases：${what}失敗（${msg}）`, { code: status, status });
  e.auth = status === 401 || (status === 403 && !/rate limit/i.test(msg));
  e.retryable = !e.auth && (status === 429 || status >= 500 || /rate limit/i.test(msg));
  return e;
}

/*
 * repo：owner/name；token：GITHUB_TOKEN（contents: write）
 * feed：{ get(id) → doc|null, list() → doc[], set(id, doc) }（Firestore aurora_podcast_feed）
 * driveDownload(id) → Promise<Buffer>（選用；未提供時遇到 Drive 來源會失敗）
 */
export function createPodcastClient({ repo, token, feed, driveDownload = null, fetchImpl = fetch, maxBytes = MAX_AUDIO_BYTES }) {
  const API = `https://api.github.com/repos/${repo}`;
  const headers = (extra = {}) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...extra });
  async function gh(method, url, { body, what, ok404 = false, raw } = {}) {
    let res;
    try { res = await fetchImpl(url, { method, headers: headers(raw ? raw.headers : body ? { "Content-Type": "application/json" } : {}), ...(raw ? { body: raw.body } : body ? { body: JSON.stringify(body) } : {}) }); }
    catch (e) { throw new Error(`GitHub Releases：${what}網路錯誤（${(e && e.message) || e}）`); }
    if (ok404 && res.status === 404) return null;
    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok) throw ghError(res.status, data, what);
    return data;
  }

  async function ensureRelease(tag) {
    const r = await gh("GET", `${API}/releases/tags/${encodeURIComponent(tag)}`, { what: "查詢 release ", ok404: true });
    if (r) return r;
    return gh("POST", `${API}/releases`, { what: "建立 release ", body: {
      tag_name: tag, name: `Podcast 音檔 ${tag.slice(8)}（艾倫極光報報 ALLEN I³ AURORA）`,
      body: "PilotOne 自動上傳的 Podcast 音檔，RSS：podcast.xml。請勿刪除附件，否則已發布的集數會無法播放。",
      draft: false, prerelease: false, make_latest: "false",
    } });
  }
  async function findAsset(rel, name) {
    for (let page = 1; page <= 10; page++) {
      const list = await gh("GET", `${API}/releases/${rel.id}/assets?per_page=100&page=${page}`, { what: "列出附件" });
      const hit = (list || []).find((a) => a.name === name);
      if (hit) return hit;
      if (!list || list.length < 100) return null;
    }
    return null;
  }

  async function fetchAudio({ audioUrl, audioDriveId }) {
    const did = audioDriveId || driveIdOf(audioUrl);
    let buf;
    if (did) {
      if (!driveDownload) throw Object.assign(new Error("音檔在 Google Drive，但排程器未設定 GDRIVE_SERVICE_ACCOUNT，無法下載。"), { retryable: false });
      try { buf = await driveDownload(did); }
      catch (e) {
        const st = e && (e.code || (e.response && e.response.status));
        const hint = st === 404 || st === 403 ? "（請確認檔案放在 AllenI3Aurora 資料夾內，或已分享給服務帳戶）" : "";
        throw Object.assign(new Error(`Drive 音檔下載失敗：${(e && e.message) || e}${hint}`), { retryable: !(st === 404 || st === 403) });
      }
    } else {
      if (!/^https:\/\//i.test(String(audioUrl || ""))) throw Object.assign(new Error("Podcast 缺少音檔（需要 https 網址或 Drive 檔案）。"), { retryable: false });
      let res;
      try { res = await fetchImpl(audioUrl, { method: "GET", redirect: "follow" }); }
      catch (e) { throw new Error(`音檔下載網路錯誤：${(e && e.message) || e}`); }
      if (!res.ok) throw Object.assign(new Error(`音檔下載失敗：HTTP ${res.status}`), { retryable: res.status >= 500 || res.status === 429 });
      const len = Number(res.headers.get("content-length") || 0);
      if (len > maxBytes) throw Object.assign(new Error(`音檔 ${Math.round(len / 1048576)} MB 超過上限 ${Math.round(maxBytes / 1048576)} MB。`), { retryable: false });
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (buf.length > maxBytes) throw Object.assign(new Error(`音檔超過上限 ${Math.round(maxBytes / 1048576)} MB。`), { retryable: false });
    return buf;
  }

  return {
    async checkToken() {
      const r = await gh("GET", API, { what: "檢查 repo " });
      return { name: `${r.full_name} · Releases` };
    },

    async publish({ id, title, notes, audioUrl, audioDriveId, audioName, duration, explicit = false, episodeType = "full", link = "", now = Date.now() }) {
      const old = await feed.get(id);
      const pubIso = (old && old.pubDate) || new Date(now).toISOString();
      const ext0 = String((audioName || audioUrl || "").match(AUDIO_RE)?.[1] || "").toLowerCase();
      const tag = releaseTag(pubIso);
      const rel = await ensureRelease(tag);

      // 已上傳過（重跑／結果不明）：沿用附件，不重新下載
      let asset = ext0 ? await findAsset(rel, assetName(id, pubIso, ext0)) : null;
      let kind = ext0, secs = Number(duration) > 0 ? Math.round(Number(duration)) : (old && old.duration) || null;
      if (!asset) {
        const buf = await fetchAudio({ audioUrl, audioDriveId });
        // 認不出格式時：像文字／HTML（Drive 警告頁、登入頁）一律拒絕，其餘才沿用副檔名
        kind = sniffAudio(buf, audioName || audioUrl) || (looksText(buf) ? null : ext0);
        if (!kind || !AUDIO_TYPES[kind]) throw Object.assign(new Error("下載到的檔案不是音檔（MP3／M4A／AAC／WAV）；若是 Drive 連結，請確認檔案權限或改用 Drive 送審包。"), { retryable: false });
        if (!secs) secs = audioDuration(buf, kind);
        const name = assetName(id, pubIso, kind);
        asset = await findAsset(rel, name);
        if (!asset) {
          const up = rel.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(name)}&label=${encodeURIComponent(String(title || name).slice(0, 120))}`;
          asset = await gh("POST", up, { what: "上傳音檔", raw: { headers: { "Content-Type": AUDIO_TYPES[kind], "Content-Length": String(buf.length) }, body: buf } });
        }
      }
      const type = AUDIO_TYPES[kind] || asset.content_type || "audio/mpeg";
      const episode = (old && old.episode) || (await feed.list()).filter((d) => !d.hidden && d.episodeType !== "trailer").length + (episodeType === "trailer" ? 0 : 1);
      const doc = {
        guid: (old && old.guid) || guidOf(id), postId: id,
        title: String(title || "").trim(), notes: String(notes || "").trim(), link: String(link || "").trim(),
        enclosure: { url: asset.browser_download_url, length: Number(asset.size) || 0, type },
        duration: secs || null, explicit: !!explicit, episodeType, episode: episodeType === "trailer" ? null : episode,
        pubDate: pubIso, hidden: old ? !!old.hidden : false, release: tag, assetId: asset.id,
        createdAt: (old && old.createdAt) || new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
      };
      await feed.set(id, doc);
      return { guid: doc.guid, url: doc.enclosure.url, enclosureUrl: doc.enclosure.url, length: doc.enclosure.length, type, duration: doc.duration, episode: doc.episode };
    },
  };
}
