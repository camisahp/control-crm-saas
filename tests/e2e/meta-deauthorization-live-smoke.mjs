// Humo HTTPS sin credenciales reales: ninguna petición posee firma válida.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
const base = "https://alta.controlchats.com";
const endpoint = `${base}/api/meta/deauthorize`;
const request = (url, options = {}) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(15_000), headers: { "cache-control": "no-cache", ...options.headers } });
const health = await request(`${base}/api/health`);
assert.equal(health.status, 200);
const version = await health.json();
assert.equal(version.ok, true);
if (process.argv[2]) assert.equal(version.commit, process.argv[2]);
console.log(`PASS health HTTP 200; runtime commit ${version.commit}; commitVerified=${version.commitVerified}`);
const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "99999999999999999999999999999999", issued_at: Math.floor(Date.now() / 1000) })).toString("base64url");
const synthetic = `${createHmac("sha256", "synthetic-invalid-production-signature-fixture").update(payload).digest("base64url")}.${payload}`;
const form = value => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ signed_request: value }) });
const cases = [
  ["GET", {}, 405],
  ["JSON rechazado", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, 415],
  ["campo vacío", form(""), 400],
  ["firma malformada", form("invalid-fixture"), 401],
  ["firma de otra clave sintética", form(synthetic), 401],
  ["parámetro duplicado", { ...form(""), body: new URLSearchParams([["signed_request", synthetic], ["signed_request", synthetic]]) }, 400],
  ["cuerpo acotado", form("x".repeat(33_000)), 413],
];
const results = [];
for (const [name, options, expected] of cases) {
  console.log(`CHECK ${name}`);
  const response = await request(endpoint, options);
  assert.equal(response.status, expected, name);
  if (name === "GET") assert.equal(response.headers.get("allow"), "POST");
  await response.arrayBuffer();
  results.push({ test: name, http: response.status });
  console.log(`PASS ${name}: HTTP ${response.status}`);
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), health: { http: health.status, commit: version.commit, commitVerified: version.commitVerified }, results,
  limit: "No prueba una firma real de Meta ni el camino válido contra la BD de producción." }, null, 2));
