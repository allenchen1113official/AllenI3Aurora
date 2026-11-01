/* =====================================================================
   部署 Firestore 安全規則 — 直接呼叫 Firebase Rules REST API（不經 firebase-tools）
   firebase-tools 的 `deploy --only firestore:rules` 會先做 IAM 預檢（Service Usage、
   Datastore 索引、Firebase 檢視者），服務帳戶少一個角色就 403。
   Rules API 只需要「Firebase Rules Admin」（firebaserules.*），本腳本：
     1. 以服務帳戶金鑰自簽 JWT 換 access token（Node 內建 crypto，零相依）
     2. POST rulesets（語法錯誤在此即回 400，附行號）
     3. PATCH releases/cloud.firestore 指向新 ruleset（不存在則 POST 建立）
   用法：FIREBASE_SERVICE_ACCOUNT='<金鑰 JSON>' node scripts/firebase/deploy-rules.mjs [--project alleni3aurora] [--file firebase/firestore.rules] [--dry-run]
   純邏輯（deployRules）可注入 fetch／token 供測試：node --test scripts/firebase/deploy-rules.test.mjs
   ===================================================================== */
import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";

const API = "https://firebaserules.googleapis.com/v1";
const SCOPES = "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform";

/* 服務帳戶金鑰 → OAuth2 access token（JWT bearer 流程） */
export async function getAccessToken(sa, { fetchImpl = fetch, now = Date.now() } = {}) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: SCOPES, aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetchImpl(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`取得 access token 失敗（HTTP ${res.status}）：${data.error_description || data.error || JSON.stringify(data)}`);
  return data.access_token;
}

/* 把 Rules API 的錯誤整理成一行可讀訊息（語法錯誤附行號） */
function apiError(step, status, data) {
  const e = (data && data.error) || {};
  const issues = (e.details || []).flatMap((d) => d.issues || []).map((i) => `${i.sourcePosition ? `L${i.sourcePosition.line}:${i.sourcePosition.column} ` : ""}${i.description}`);
  return new Error(`${step} 失敗（HTTP ${status}）：${e.message || JSON.stringify(data)}${issues.length ? "\n  " + issues.join("\n  ") : ""}`);
}

/**
 * 部署規則：建立 ruleset → 讓 cloud.firestore release 指向它。
 * @returns {{ rulesetName:string, releaseName:string, created:boolean }}
 */
export async function deployRules({ project, source, token, fetchImpl = fetch, log = () => {}, dryRun = false }) {
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${API}/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };
  const ruleset = { source: { files: [{ name: "firestore.rules", content: source }] } };
  if (dryRun) {
    // test 端點只檢查語法／編譯，不建立任何東西
    const t = await call("POST", `projects/${project}:test`, { source: ruleset.source });
    if (!t.ok) throw apiError("規則編譯檢查", t.status, t.data);
    const issues = (t.data.issues || []).map((i) => `${i.severity || ""} ${i.sourcePosition ? `L${i.sourcePosition.line} ` : ""}${i.description}`);
    if (issues.some((x) => /^ERROR/.test(x))) throw new Error("規則編譯錯誤：\n  " + issues.join("\n  "));
    log(`dry-run：規則編譯通過${issues.length ? "（警告：" + issues.join("；") + "）" : ""}`);
    return { rulesetName: null, releaseName: `projects/${project}/releases/cloud.firestore`, created: false };
  }
  const rs = await call("POST", `projects/${project}/rulesets`, ruleset);
  if (!rs.ok) throw apiError("建立 ruleset", rs.status, rs.data);
  const rulesetName = rs.data.name;
  log(`ruleset 已建立：${rulesetName}`);
  const releaseName = `projects/${project}/releases/cloud.firestore`;
  const cur = await call("GET", releaseName);
  let created = false;
  if (cur.ok) {
    const up = await call("PATCH", releaseName, { release: { name: releaseName, rulesetName }, updateMask: "rulesetName" });
    if (!up.ok) throw apiError("更新 release", up.status, up.data);
  } else if (cur.status === 404) {
    const mk = await call("POST", `projects/${project}/releases`, { name: releaseName, rulesetName });
    if (!mk.ok) throw apiError("建立 release", mk.status, mk.data);
    created = true;
  } else throw apiError("讀取 release", cur.status, cur.data);
  log(`release 已${created ? "建立" : "更新"}：${releaseName} → ${rulesetName}`);
  return { rulesetName, releaseName, created };
}

/* 403 診斷：testIamPermissions 不需任何權限即可呼叫，回報服務帳戶在專案上實際持有哪些 firebaserules 權限 */
export async function diagnosePermissions({ project, token, fetchImpl = fetch }) {
  const need = ["firebaserules.rulesets.create", "firebaserules.rulesets.test", "firebaserules.releases.get", "firebaserules.releases.create", "firebaserules.releases.update"];
  const res = await fetchImpl(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ permissions: need }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, note: `testIamPermissions HTTP ${res.status}：${(data.error && data.error.message) || ""}（專案不存在、或服務帳戶在該專案完全沒有任何角色時會如此）` };
  const has = data.permissions || [];
  return { ok: true, has, missing: need.filter((x) => !has.includes(x)) };
}

/* 讀規則檔頭的版次註解，供 log */
export function rulesVersionOf(source) {
  const m = source.match(/規則版次：r(\d+)/);
  return m ? Number(m[1]) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
  const project = arg("--project", "alleni3aurora");
  const file = arg("--file", "firebase/firestore.rules");
  const dryRun = process.argv.includes("--dry-run");
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  try {
    if (!raw.trim()) throw new Error("未設定 FIREBASE_SERVICE_ACCOUNT（服務帳戶金鑰 JSON）");
    let sa; try { sa = JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT 不是合法 JSON（請貼金鑰檔全文）"); }
    if (!sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT 缺少 client_email／private_key");
    const source = await readFile(file, "utf8");
    if (!/^rules_version = '2';/.test(source)) throw new Error("規則檔首行必須是 rules_version = '2';");
    console.log(`::notice title=部署身分::服務帳戶 ${sa.client_email}（金鑰所屬專案 ${sa.project_id || "?"}）→ 目標專案 ${project}｜規則版次 r${rulesVersionOf(source) ?? "?"}${dryRun ? "｜dry-run" : ""}`);
    if (sa.project_id && sa.project_id !== project) console.log(`::warning title=金鑰專案不符::Secret 金鑰屬於專案「${sa.project_id}」，但要部署到「${project}」；需在 ${project} 的 IAM 把 ${sa.client_email} 加為 Firebase Rules Admin，或改用 ${project} 內建立的服務帳戶金鑰。`);
    const token = await getAccessToken(sa);
    try {
      const r = await deployRules({ project, source, token, dryRun, log: (m) => console.log(m) });
      if (!dryRun) console.log(`✔ Firestore 規則已部署：${r.releaseName}`);
    } catch (e) {
      if (/HTTP 403/.test(String(e && e.message))) {
        const d = await diagnosePermissions({ project, token }).catch((x) => ({ ok: false, note: String(x && x.message || x) }));
        const detail = d.ok ? `已有 [${d.has.join(", ") || "無"}]；缺少 [${d.missing.join(", ")}]` : d.note;
        throw new Error(`${e.message}\n診斷：${sa.client_email} 在專案 ${project} 的 firebaserules 權限 → ${detail}。請到 GCP Console → IAM（專案 ${project}）為此服務帳戶加授「Firebase Rules Admin」（roles/firebaserules.admin），或確認 Secret 貼的是該帳戶的金鑰。`);
      }
      throw e;
    }
  } catch (e) {
    const msg = String(e && e.message || e);
    console.error(`::error title=Firestore 規則部署失敗::${msg.replace(/\n/g, " ")}`);
    process.exit(1);
  }
}
