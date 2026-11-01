/* =====================================================================
   YouTube Data API v3（唯讀）／OAuth 客戶端（Node 18+ 內建 fetch；fetchImpl 可注入供測試）
   - YT_API_KEY＋YT_CHANNEL_ID：只讀公開資料。
   - 或沿用 PilotOne 的 OAuth（YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN，
     scope 含 youtube.readonly）：改用 mine=true，可看到私人／排程中影片。
   ===================================================================== */
import { YtError } from "./core.mjs";

const API = "https://www.googleapis.com/youtube/v3";

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
      return ids.slice(0, max);
    },
    async videos(ids) {
      const out = [];
      for (let i = 0; i < ids.length; i += 50) {
        const d = await get("videos", { part: "snippet,contentDetails,statistics,status", id: ids.slice(i, i + 50).join(",") });
        out.push(...(d.items || []));
      }
      return out;
    },
  };
}
