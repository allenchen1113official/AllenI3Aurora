/* =====================================================================
   YouTube Data API v3 客戶端（OAuth refresh token → access token；可續傳上傳）
   ---------------------------------------------------------------------
   介面與 core.mjs 的「原生排程頻道」一致：
     upload({ title, description, tags, privacy, videoUrl, publishAt, uploadUri, onSession })
       → { videoId, url }
     status(videoId) → { privacyStatus, uploadStatus, publishAt, publishedAt }
     remove(videoId)
     checkToken() → { name }
   排程：privacy 為 public 時可帶 publishAt（影片先以 private 上傳，YouTube 到時自動公開）。
   續傳：初始化後的 session URI（約 1 天有效）經 onSession 回寫 Firestore，
         下一輪中斷重試時帶回 uploadUri，從已上傳的位移接續，不重傳整支影片。
   影片來源：videoUrl 需為可直接下載的 https 網址（先完整下載到暫存檔再上傳，
         GitHub Runner 磁碟約 14 GB）。
   fetchImpl／fs／tmpDir 皆可注入，youtube.test.mjs 以假物件測試。
   ===================================================================== */
import { createReadStream, createWriteStream, promises as fsp } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphError } from "./core.mjs";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YT_TITLE_MAX = 100;
export const YT_DESC_MAX = 5000;

/* 把 Google API 錯誤整理成 GraphError：auth＝需重新授權（不重試）、retryable＝暫時性 */
function ytError(status, data, fallback) {
  const er = (data && data.error) || {};
  const reason = (Array.isArray(er.errors) && er.errors[0] && er.errors[0].reason) || er.status || data?.error || "";
  const msg = er.message || data?.error_description || fallback || `HTTP ${status}`;
  const e = new GraphError(`YouTube：${msg}${reason ? `（${reason}）` : ""}`, { code: status, status, type: reason });
  e.auth = status === 401 || reason === "invalid_grant" || ["forbidden", "insufficientPermissions", "authError"].includes(reason);
  e.retryable = !e.auth && (status === 429 || status >= 500 || ["quotaExceeded", "rateLimitExceeded", "backendError", "internalError"].includes(reason));
  return e;
}

export function createYouTubeClient({ clientId, clientSecret, refreshToken, fetchImpl = fetch, tmpDir = tmpdir(), now = Date.now }) {
  let cached = null; // { token, exp }

  async function token() {
    if (cached && cached.exp - now() > 60 * 1000) return cached.token;
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
    const res = await fetchImpl(TOKEN_URL, { method: "POST", body });
    let data = {};
    try { data = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok || !data.access_token) throw ytError(res.status === 400 && data.error === "invalid_grant" ? 401 : res.status, data, "取得 access token 失敗");
    cached = { token: data.access_token, exp: now() + Number(data.expires_in || 3600) * 1000 };
    return cached.token;
  }

  async function api(method, path, { query = {}, body } = {}) {
    const url = `${API}/${path}?${new URLSearchParams(query)}`;
    const res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return {};
    let data = {};
    try { data = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok) throw ytError(res.status, data);
    return data;
  }

  /* 下載影片到暫存檔，回傳 { path, size, type } */
  async function download(videoUrl) {
    let res;
    try { res = await fetchImpl(videoUrl, { method: "GET", redirect: "follow" }); }
    catch (e) { throw new Error("下載影片失敗（網路錯誤）：" + (e && e.message ? e.message : e)); }
    if (!res.ok || !res.body) { const e = new Error(`下載影片失敗：HTTP ${res.status}（請確認影片網址為公開可直接下載）`); e.retryable = false; throw e; }
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (type && !/^(video|application\/octet-stream|binary)/.test(type)) { const e = new Error(`影片網址回傳的不是影片（Content-Type ${type}），請改用可直接下載的連結`); e.retryable = false; throw e; }
    const path = join(tmpDir, `yt-${now()}-${Math.random().toString(36).slice(2)}.bin`);
    await pipeline(Readable.fromWeb ? Readable.fromWeb(res.body) : res.body, createWriteStream(path));
    const size = (await fsp.stat(path)).size;
    if (!size) { await fsp.unlink(path).catch(() => {}); const e = new Error("影片檔為空（0 bytes）"); e.retryable = false; throw e; }
    return { path, size, type: type && type.startsWith("video") ? type : "video/*" };
  }

  /* 查詢續傳位移：回傳 { done, offset, data } */
  async function probe(uploadUri, size) {
    const res = await fetchImpl(uploadUri, { method: "PUT", headers: { Authorization: `Bearer ${await token()}`, "Content-Range": `bytes */${size}`, "Content-Length": "0" } });
    if (res.status === 200 || res.status === 201) return { done: true, data: await res.json().catch(() => ({})) };
    if (res.status === 308) {
      const range = res.headers.get("range") || "";
      const m = /bytes=0-(\d+)/.exec(range);
      return { done: false, offset: m ? Number(m[1]) + 1 : 0 };
    }
    if (res.status === 404 || res.status === 410) return { expired: true }; // session 已失效，重新初始化
    throw ytError(res.status, await res.json().catch(() => ({})), "查詢上傳進度失敗");
  }

  return {
    async checkToken() {
      const r = await api("GET", "channels", { query: { part: "snippet", mine: "true" } });
      const c = r.items && r.items[0];
      if (!c) throw ytError(403, {}, "此 Google 帳號沒有 YouTube 頻道");
      return { name: c.snippet && c.snippet.title ? c.snippet.title : c.id, channelId: c.id };
    },

    async upload({ title, description = "", tags = [], privacy = "public", videoUrl, publishAt = null, categoryId = "28", uploadUri = null, onSession = async () => {} }) {
      const file = await download(videoUrl);
      try {
        const snippet = { title: String(title || "").slice(0, YT_TITLE_MAX), description: String(description || "").slice(0, YT_DESC_MAX), tags: tags.slice(0, 50), categoryId };
        const status = { privacyStatus: publishAt ? "private" : privacy, selfDeclaredMadeForKids: false, ...(publishAt ? { publishAt } : {}) };
        let uri = uploadUri, offset = 0, result = null;
        if (uri) {
          const p = await probe(uri, file.size);
          if (p.done) result = p.data; else if (p.expired) uri = null; else offset = p.offset;
        }
        if (!uri && !result) {
          const res = await fetchImpl(`${UPLOAD}?${new URLSearchParams({ uploadType: "resumable", part: "snippet,status" })}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Length": String(file.size), "X-Upload-Content-Type": file.type },
            body: JSON.stringify({ snippet, status }),
          });
          if (!res.ok) throw ytError(res.status, await res.json().catch(() => ({})), "初始化上傳失敗");
          uri = res.headers.get("location");
          if (!uri) throw new Error("初始化上傳未回傳 session URI");
          await onSession(uri);
        }
        for (let attempt = 0; !result && attempt < 3; attempt++) {
          const res = await fetchImpl(uri, {
            method: "PUT",
            headers: { Authorization: `Bearer ${await token()}`, "Content-Length": String(file.size - offset), "Content-Type": file.type,
              ...(offset ? { "Content-Range": `bytes ${offset}-${file.size - 1}/${file.size}` } : {}) },
            body: createReadStream(file.path, offset ? { start: offset } : undefined),
            duplex: "half",
          }).catch((e) => ({ ok: false, status: 0, netError: e }));
          if (res.status === 200 || res.status === 201) { result = await res.json(); break; }
          if (res.status === 308 || res.status === 0 || res.status >= 500) {
            const p = await probe(uri, file.size);
            if (p.done) { result = p.data; break; }
            if (p.expired) throw Object.assign(new Error("上傳 session 已失效，下一輪重新上傳"), { retryable: true });
            offset = p.offset;
            continue;
          }
          throw ytError(res.status, await res.json().catch(() => ({})), "上傳影片失敗");
        }
        if (!result || !result.id) throw Object.assign(new Error("上傳多次中斷，下一輪從中斷點續傳"), { retryable: true, keepSession: true });
        return { videoId: result.id, url: `https://youtu.be/${result.id}` };
      } finally {
        await fsp.unlink(file.path).catch(() => {});
      }
    },

    async status(videoId) {
      const r = await api("GET", "videos", { query: { part: "status,snippet", id: videoId } });
      const v = r.items && r.items[0];
      if (!v) return { missing: true };
      return { privacyStatus: v.status.privacyStatus, uploadStatus: v.status.uploadStatus, publishAt: v.status.publishAt || null,
        publishedAt: v.snippet && v.snippet.publishedAt, failureReason: v.status.failureReason || v.status.rejectionReason || null };
    },

    async remove(videoId) { return api("DELETE", "videos", { query: { id: videoId } }); },
  };
}
