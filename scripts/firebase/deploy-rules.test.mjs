import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { deployRules, getAccessToken, rulesVersionOf, diagnosePermissions } from "./deploy-rules.mjs";

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const mockFetch = (routes) => {
  const calls = [];
  const f = async (url, init = {}) => {
    const key = `${init.method || "GET"} ${url}`;
    let body = null; if (init.body) { try { body = typeof init.body === "string" ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(String(init.body))); } catch { body = String(init.body); } }
    calls.push({ key, body, headers: init.headers });
    const r = routes.find(([m]) => (m instanceof RegExp ? m.test(key) : m === key));
    if (!r) throw new Error("unexpected call " + key);
    return typeof r[1] === "function" ? r[1](calls.at(-1)) : r[1];
  };
  f.calls = calls; return f;
};
const P = "https://firebaserules.googleapis.com/v1/projects/alleni3aurora";

test("既有 release：建 ruleset 後 PATCH 指向新 ruleset", async () => {
  const fetchImpl = mockFetch([
    [`POST ${P}/rulesets`, json(200, { name: "projects/alleni3aurora/rulesets/abc" })],
    [`GET ${P}/releases/cloud.firestore`, json(200, { name: "projects/alleni3aurora/releases/cloud.firestore", rulesetName: "old" })],
    [`PATCH ${P}/releases/cloud.firestore`, (c) => { assert.equal(c.body.release.rulesetName, "projects/alleni3aurora/rulesets/abc"); return json(200, {}); }],
  ]);
  const r = await deployRules({ project: "alleni3aurora", source: "rules_version = '2';", token: "T", fetchImpl });
  assert.equal(r.created, false);
  assert.equal(fetchImpl.calls[0].headers.authorization, "Bearer T");
  assert.equal(fetchImpl.calls[0].body.source.files[0].name, "firestore.rules");
});

test("release 不存在（404）：POST 建立", async () => {
  const fetchImpl = mockFetch([
    [`POST ${P}/rulesets`, json(200, { name: "projects/alleni3aurora/rulesets/n1" })],
    [`GET ${P}/releases/cloud.firestore`, json(404, { error: { message: "not found" } })],
    [`POST ${P}/releases`, (c) => { assert.equal(c.body.name, "projects/alleni3aurora/releases/cloud.firestore"); return json(200, {}); }],
  ]);
  const r = await deployRules({ project: "alleni3aurora", source: "x", token: "T", fetchImpl });
  assert.equal(r.created, true);
});

test("語法錯誤：ruleset 400 時訊息附行號，且不碰 release", async () => {
  const fetchImpl = mockFetch([
    [`POST ${P}/rulesets`, json(400, { error: { message: "Invalid ruleset", details: [{ issues: [{ description: "Unexpected 'allow'.", sourcePosition: { line: 7, column: 3 } }] }] } })],
  ]);
  await assert.rejects(() => deployRules({ project: "alleni3aurora", source: "x", token: "T", fetchImpl }), /建立 ruleset 失敗（HTTP 400）.*L7:3 Unexpected 'allow'/s);
  assert.equal(fetchImpl.calls.length, 1);
});

test("權限不足：403 直接丟出，不嘗試建立 release", async () => {
  const fetchImpl = mockFetch([[`POST ${P}/rulesets`, json(403, { error: { message: "The caller does not have permission", status: "PERMISSION_DENIED" } })]]);
  await assert.rejects(() => deployRules({ project: "alleni3aurora", source: "x", token: "T", fetchImpl }), /HTTP 403/);
});

test("dry-run 只打 :test 端點，有 ERROR 即失敗", async () => {
  const ok = mockFetch([[`POST ${P}:test`, json(200, { issues: [] })]]);
  const r = await deployRules({ project: "alleni3aurora", source: "x", token: "T", fetchImpl: ok, dryRun: true });
  assert.equal(r.rulesetName, null); assert.equal(ok.calls.length, 1);
  const bad = mockFetch([[`POST ${P}:test`, json(200, { issues: [{ severity: "ERROR", description: "boom", sourcePosition: { line: 2 } }] })]]);
  await assert.rejects(() => deployRules({ project: "alleni3aurora", source: "x", token: "T", fetchImpl: bad, dryRun: true }), /規則編譯錯誤.*L2 boom/s);
});

test("getAccessToken：以服務帳戶金鑰自簽 JWT 換 token，宣告正確", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa = { client_email: "deploy@alleni3aurora.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }), token_uri: "https://oauth2.googleapis.com/token" };
  const fetchImpl = mockFetch([[/^POST https:\/\/oauth2\.googleapis\.com\/token$/, json(200, { access_token: "ya29.x" })]]);
  const tok = await getAccessToken(sa, { fetchImpl, now: 1_700_000_000_000 });
  assert.equal(tok, "ya29.x");
  const form = fetchImpl.calls[0].body;
  assert.equal(form.grant_type, "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, b] = form.assertion.split(".").slice(0, 2).map((x) => JSON.parse(Buffer.from(x, "base64url").toString()));
  assert.equal(h.alg, "RS256");
  assert.equal(b.iss, sa.client_email);
  assert.match(b.scope, /auth\/firebase/);
  assert.equal(b.exp - b.iat, 3600);
  assert.equal(b.iat, 1_700_000_000);
  const bad = mockFetch([[/token$/, json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." })]]);
  await assert.rejects(() => getAccessToken(sa, { fetchImpl: bad }), /Invalid JWT Signature/);
});

test("rulesVersionOf 讀檔頭版次", () => {
  assert.equal(rulesVersionOf("// 規則版次：r12\n"), 12);
  assert.equal(rulesVersionOf("nothing"), null);
});

test("diagnosePermissions：列出已有與缺少的 firebaserules 權限", async () => {
  const f = mockFetch([[/testIamPermissions$/, json(200, { permissions: ["firebaserules.releases.get"] })]]);
  const d = await diagnosePermissions({ project: "alleni3aurora", token: "T", fetchImpl: f });
  assert.equal(d.ok, true); assert.deepEqual(d.has, ["firebaserules.releases.get"]);
  assert.ok(d.missing.includes("firebaserules.rulesets.create"));
  assert.equal(f.calls[0].body.permissions.length, 5);
  const g = mockFetch([[/testIamPermissions$/, json(403, { error: { message: "nope" } })]]);
  const e = await diagnosePermissions({ project: "alleni3aurora", token: "T", fetchImpl: g });
  assert.equal(e.ok, false); assert.match(e.note, /HTTP 403/);
});
