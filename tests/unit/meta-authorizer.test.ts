import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMetaAuthorizer } from "@/server/whatsapp/authorizer";

const fixture = vi.hoisted(() => ({ secret: "synthetic-authorizer-fixture", fetch: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ META_APP_ID: "123", META_APP_SECRET: fixture.secret,
  META_GRAPH_API_VERSION: "v25.0", META_GRAPH_BASE_URL: "https://meta.example.invalid" }) }));
const now = Math.floor(Date.now() / 1000);
const token = "synthetic-token-fixture";
function signed(issuedAt = now, key = fixture.secret) {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "111", issued_at: issuedAt })).toString("base64url");
  return `${createHmac("sha256", key).update(payload).digest("base64url")}.${payload}`;
}
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", fixture.fetch); });
afterEach(() => vi.unstubAllGlobals());

describe("identidad verificable del autorizante", () => {
  it("acepta prueba reciente de Meta sin introspección ni devolver secretos", async () => {
    expect(await resolveMetaAuthorizer(token, signed())).toEqual({ appId: "123", userId: "111", issuedAt: now });
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each([signed(now - 1000), signed(now, "wrong-fixture-key"), "malformed"])("rechaza prueba vieja o falsa sin fallback permisivo", async value => {
    expect(await resolveMetaAuthorizer(token, value)).toBeNull();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("sólo acepta USER verificado para esta app en el fallback", async () => {
    fixture.fetch.mockResolvedValue(Response.json({ data: { is_valid: true, type: "USER", app_id: "123", user_id: "111", issued_at: now } }));
    expect(await resolveMetaAuthorizer(token)).toEqual({ appId: "123", userId: "111", issuedAt: now });
    const [url, options] = fixture.fetch.mock.calls[0]!;
    expect((url as URL).pathname).toBe("/v25.0/debug_token");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    { type: "SYSTEM_USER" }, { app_id: "999" }, { is_valid: false },
    { issued_at: now - 1000 }, { issued_at: now + 3600 }, { user_id: "organization" },
  ])("no inventa identidad humana a partir de un token incompatible", async override => {
    fixture.fetch.mockResolvedValue(Response.json({ data: { is_valid: true, type: "USER", app_id: "123", user_id: "111", issued_at: now, ...override } }));
    expect(await resolveMetaAuthorizer(token)).toBeNull();
  });
  it("degrada de forma segura ante fallo del proveedor", async () => {
    fixture.fetch.mockRejectedValue(new Error("synthetic-provider-private-detail"));
    expect(await resolveMetaAuthorizer(token)).toBeNull();
  });
});
