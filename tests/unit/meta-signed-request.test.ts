import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaSignedRequest } from "@/lib/meta/signed-request";

const fixtureKey = "synthetic-signature-fixture";
const now = 1_800_000_000;
function sign(data: unknown, key = fixtureKey) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${createHmac("sha256", key).update(payload).digest("base64url")}.${payload}`;
}
const valid = { algorithm: "HMAC-SHA256", user_id: "111", issued_at: now };

describe("signed_request de Meta", () => {
  it("verifica firma y devuelve únicamente identidad/fecha", () => {
    expect(verifyMetaSignedRequest(sign({ ...valid, extra: "ignored" }), fixtureKey, now)).toEqual({ userId: "111", issuedAt: now });
  });
  it.each(["", ".", "x.y.z", "x.y", "!abc.xyz", "x".repeat(16_385)])("rechaza formato inválido", (value) => {
    expect(verifyMetaSignedRequest(value, fixtureKey, now)).toBeNull();
  });
  it("rechaza otra clave o payload manipulado", () => {
    expect(verifyMetaSignedRequest(sign(valid, "other-fixture"), fixtureKey, now)).toBeNull();
    expect(verifyMetaSignedRequest(sign(valid).replace(/.$/, "A"), fixtureKey, now)).toBeNull();
  });
  it.each([
    { ...valid, algorithm: "none" }, { ...valid, user_id: 111 },
    { ...valid, user_id: "" }, { ...valid, user_id: "org-A" },
    { ...valid, issued_at: 0 }, { ...valid, issued_at: now + 61 },
    { ...valid, issued_at: 1.5 }, { ...valid, issued_at: "1800000000" }, null,
  ])("rechaza identidad/algoritmo/fecha inválidos aun con firma correcta", (value) => {
    expect(verifyMetaSignedRequest(sign(value), fixtureKey, now)).toBeNull();
  });
  it("no rechaza sólo por antigüedad de entrega del callback", () => {
    expect(verifyMetaSignedRequest(sign({ ...valid, issued_at: now - 100_000 }), fixtureKey, now)).not.toBeNull();
  });
});
