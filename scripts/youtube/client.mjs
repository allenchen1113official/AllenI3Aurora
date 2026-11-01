/* =====================================================================
   YouTube Data API v3／Google Drive v3／OAuth 客戶端（Node 18+ 內建 fetch；fetchImpl 可注入供測試）
   - 頻道同步只需讀取：YT_API_KEY＋YT_CHANNEL_ID 即可；有 OAuth 時改用 mine=true。
   - 上傳需 OAuth refresh token（官方管理者帳號授權，scope 見 oauth-setup.mjs）。
   ===================================================================== */
import { YtError } from "./core.mjs";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const DRIVE = "https://www.googleapis.com/drive/v3";

async function asJson(res) { try { return await res.json(); } catch { return {}; } }
function toError(res, data, fallback) {
  const er = (data && data.error) || {};
  // Google API：{ error: { code, message, errors: [{ reason }] } }；OAuth：{ error: 'invalid_grant', error_description }
  if (typeof er === "string") return new YtError(`${er}${data.error_description ? "：" + data.error_description : ""}`, { status: res.status, reason: er });
  const reason = (er.errors && er.errors[0] && er.errors[0].reason) || (er.status === "PERMISSION_DENIED" ? "insufficientPermissions" : undefined);
  return new YtError(er.message || fallback || `HTTP ${res.status}`, { status: res.status, reason });
}

/* refresh token → access token（約 1 小時有效） */
export async function getAccessToken({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await asJson(res);
  if (!res.ok || !data.access_token) throw toError(res, data, "OAuth 換發 access token 失敗");
  return { token: data.access_token, scope: data.scope || "", expiresIn: data.expires_in || 0 };
}

export function createYouTube({ accessToken = "", apiKey = "", fetchImpl = fetch }) {
  const auth = (headers = {}) => (accessToken ? { ...headers, Authorization: `Bearer ${accessToken}` } : headers);
  const withKey = (q) => (accessToken || !apiKey ? q : { ...q, key: apiKey });
  async function req(method, base, path, { query = {}, json, body, headers = {}, okStatus } = {}) {
    const url = `${base}/${path}?${new URLSearchParams(withKey(query))}`;
    const init = { method, headers: auth(headers) };
    if (json !== undefined) { init.body = JSON.stringify(json); init.headers["Content-Type"] = "application/json; charset=UTF-8"; }
    else if (body !== undefined) init.body = body;
    let res;
    try { res = await fetchImpl(url, init); } catch (e) { throw new Error("網路錯誤：" + (e && e.message ? e.message : e)); }
    if (okStatus ? !okStatus.includes(res.status) : !res.ok) throw toError(res, await asJson(res));
    return res;
  }
  const get = async (path, query) => asJson(await req("GET", API, path, { query }));

  return {
    async channel({ id, mine } = {}) {
      const d = await get("channels", { part: "snippet,statistics,contentDetails", ...(mine ? { mine: "true" } : { id }) });
      return (d.items && d.items[0]) || null;
    },
    /* uploads 播放清單最新的影片 ID（最多 max 筆，依上傳時間新→舊） */
    async uploadIds(playlistId, max = 50) {
      const ids = []; let pageToken = "";
      while (ids.length < max) {
        const d = await get("playlistItems", { part: "contentDetails", playlistId, maxResults: String(Math.min(50, max - ids.length)), ...(pageToken ? { pageToken } : {}) });
        for (const it of d.items || []) ids.push(it.contentDetails.videoId);
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
      }
      return ids;
    },
    async videos(ids) {
      const out = [];
      for (let i = 0; i < ids.length; i += 50) {
        const d = await get("videos", { part: "snippet,contentDetails,statistics,status", id: ids.slice(i, i + 50).join(",") });
        out.push(...(d.items || []));
      }
      return out;
    },
    async getVideo(id) {
      const d = await get("videos", { part: "status,processingDetails,snippet", id });
      return (d.items && d.items[0]) || null;
    },
    async updateVideo(id, resource, part) {
      const res = await req("PUT", API, "videos", { query: { part }, json: { id, ...resource } });
      return asJson(res);
    },
    /* resumable 上傳：回傳 session URI（約一週內有效） */
    async startUpload(meta, size, mime) {
      const res = await req("POST", UPLOAD, "videos", {
        query: { uploadType: "resumable", part: "snippet,status", notifySubscribers: "true" },
        json: meta,
        headers: { "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": mime || "video/*" },
      });
      const loc = res.headers.get("location");
      if (!loc) throw new YtError("YouTube 未回傳上傳網址（Location）", { status: 500 });
      return loc;
    },
    async putChunk(url, buf, start, end, total) {
      let res;
      try {
        res = await fetchImpl(url, { method: "PUT", headers: auth({ "Content-Range": `bytes ${start}-${end - 1}/${total}` }), body: buf });
      } catch (e) { throw new Error("上傳中斷：" + (e && e.message ? e.message : e)); }
      return parseUploadResponse(res);
    },
    async queryUpload(url, total) {
      let res;
      try { res = await fetchImpl(url, { method: "PUT", headers: auth({ "Content-Range": `bytes */${total}` }) }); }
      catch (e) { throw new Error("查詢續傳點失敗：" + (e && e.message ? e.message : e)); }
      if (res.status === 404 || res.status === 410) return { expired: true };
      return parseUploadResponse(res);
    },
    async setThumbnail(videoId, data, mime) {
      await req("POST", UPLOAD, "thumbnails/set", { query: { videoId, uploadType: "media" }, body: data, headers: { "Content-Type": mime || "image/jpeg" } });
    },
    /* captions.insert（multipart/related：JSON metadata＋SRT 內容） */
    async insertCaption(videoId, srt, language, name) {
      const boundary = "aurora" + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ snippet: { videoId, language, name, isDraft: false } });
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n--${boundary}--`;
      await req("POST", UPLOAD, "captions", { query: { part: "snippet", uploadType: "multipart" }, body, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } });
    },
  };
}

/* 308 Resume Incomplete：Range: bytes=0-N → 下一段從 N+1；沒有 Range＝一個位元組都還沒收到 */
export async function parseUploadResponse(res) {
  if (res.status === 308) {
    const r = res.headers.get("range");
    const m = r && r.match(/bytes=\d+-(\d+)/);
    return { next: m ? Number(m[1]) + 1 : 0 };
  }
  if (res.status === 200 || res.status === 201) return { video: await asJson(res) };
  throw toError(res, await asJson(res), `上傳失敗 HTTP ${res.status}`);
}

/* ---------- Google Drive（同一把 OAuth，scope drive.readonly） ---------- */
const DRIVE_ID = /^[A-Za-z0-9_-]{25,}$/;
export function driveIdFrom(s) {
  const v = String(s || "").trim();
  const m = v.match(/\/d\/([A-Za-z0-9_-]{25,})/) || v.match(/[?&]id=([A-Za-z0-9_-]{25,})/);
  if (m) return m[1];
  return DRIVE_ID.test(v) && !/\.\w{2,4}$/.test(v) ? v : "";
}
const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function createDrive({ accessToken, fetchImpl = fetch }) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  async function call(path, query = {}) {
    const res = await fetchImpl(`${DRIVE}/${path}?${new URLSearchParams({ supportsAllDrives: "true", ...query })}`, { headers });
    if (!res.ok) throw toError(res, await asJson(res), `Drive HTTP ${res.status}`);
    return res;
  }
  async function list(qs) {
    const d = await asJson(await call("files", { q: qs, fields: "files(id,name,size,mimeType,modifiedTime)", pageSize: "10", includeItemsFromAllDrives: "true", orderBy: "modifiedTime desc" }));
    return d.files || [];
  }
  return {
    /* 依「資料夾路徑＋檔名」或「檔案 ID／網址」找到檔案。資料夾路徑以 / 分隔，從第一層名稱開始逐層往下找。 */
    async resolve({ folder = "", file }) {
      const id = driveIdFrom(file);
      if (id) return asJson(await call(`files/${id}`, { fields: "id,name,size,mimeType" }));
      let parent = null;
      for (const seg of String(folder).split("/").map((s) => s.trim()).filter(Boolean)) {
        const found = await list(`name = '${q(seg)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parent ? ` and '${parent}' in parents` : ""}`);
        if (!found.length) throw new YtError(`Drive 找不到資料夾「${seg}」（路徑：${folder}）`, { status: 404, reason: "driveNotFound" });
        parent = found[0].id;
      }
      const files = await list(`name = '${q(file)}' and trashed = false${parent ? ` and '${parent}' in parents` : ""}`);
      if (!files.length) throw new YtError(`Drive 找不到檔案「${file}」${folder ? `（資料夾：${folder}）` : ""}`, { status: 404, reason: "driveNotFound" });
      return files[0];
    },
    async stream(fileId) { return (await call(`files/${fileId}`, { alt: "media" })).body; },
    async bytes(fileId) { return Buffer.from(await (await call(`files/${fileId}`, { alt: "media" })).arrayBuffer()); },
  };
}
