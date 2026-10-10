import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeEmbeddedSignup, connectReviewNumber } from "@/server/whatsapp/embedded-signup";

const mocks = vi.hoisted(() => ({ save: vi.fn(), graph: vi.fn(), fetch: vi.fn(), check: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({
  META_APP_ID: "123", META_APP_SECRET: "mock-only-value",
  META_GRAPH_API_VERSION: "v25.0", META_GRAPH_BASE_URL: "https://meta.example.invalid",
  REVIEW_TENANT_SLUG: "meta-review", REVIEW_WABA_ID: "123",
  REVIEW_PHONE_NUMBER_ID: "456", REVIEW_SYSTEM_USER_TOKEN: "mock-only-value",
}) }));
vi.mock("@/lib/meta/client", async (original) => ({
  ...await original<typeof import("@/lib/meta/client")>(), graphRequest: mocks.graph,
}));
vi.mock("@/server/whatsapp/credentials", async (original) => ({ ...await original<typeof import("@/server/whatsapp/credentials")>(), saveCredentials: mocks.save }));
vi.mock("@/server/whatsapp/connect", () => ({ testConnection: mocks.check, subscribeAppToWaba: mocks.subscribe }));

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => vi.unstubAllGlobals());

describe("Embedded Signup: errores y acceso al espacio de revisión", () => {
  it("no devuelve el texto crudo de Meta ni guarda credenciales tras un canje fallido", async () => {
    mocks.fetch.mockResolvedValue(Response.json({error:{message:"provider-private-detail"}}, {status:400}));
    const result = completeEmbeddedSignup({organizationId:"org-review",wabaId:"123",phoneNumberId:"456",code:"mock-code"});
    await expect(result).rejects.toMatchObject({code:"meta_error"});
    await expect(result).rejects.not.toThrow("provider-private-detail");
    expect(mocks.save).not.toHaveBeenCalled();
    const url = mocks.fetch.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe("/v25.0/oauth/access_token");
    expect(url.searchParams.has("redirect_uri")).toBe(false);
    expect(mocks.fetch.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });
  it("rechaza otra organización antes de contactar a Meta o guardar algo", async () => {
    await expect(connectReviewNumber({organizationId:"org-client",organizationSlug:"principal"}))
      .rejects.toMatchObject({code:"invalid_connection"});
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.graph).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("canjea y guarda sólo identidad firmada reciente; suscribe sin exponer el token", async () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "111", issued_at: issuedAt })).toString("base64url");
    const signedRequest = `${createHmac("sha256", "mock-only-value").update(payload).digest("base64url")}.${payload}`;
    mocks.fetch.mockResolvedValue(Response.json({ access_token: "synthetic-token-fixture" }));
    mocks.graph.mockResolvedValue({ data: [{ id: "456" }] });
    mocks.check.mockResolvedValue({ ok: true, displayPhoneNumber: "synthetic-phone", verifiedName: "Fixture" });
    mocks.subscribe.mockResolvedValue("subscribed");
    const result = await completeEmbeddedSignup({ organizationId: "org-review", wabaId: "123", phoneNumberId: "456", code: "mock-code", signedRequest });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-review", authorization: { appId: "123", userId: "111", issuedAt } }));
    expect(result).toEqual({ displayPhoneNumber: "synthetic-phone", subscribed: "subscribed" });
    expect(JSON.stringify(result)).not.toContain("synthetic-token-fixture");
  });
  it("sin identidad humana verificable no guarda ni suscribe una cuenta", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ access_token: "synthetic-token-fixture" }))
      .mockResolvedValueOnce(Response.json({ data: { is_valid: true, type: "SYSTEM_USER", app_id: "123", user_id: "111" } }));
    await expect(completeEmbeddedSignup({ organizationId: "org-review", wabaId: "123", phoneNumberId: "456", code: "mock-code" }))
      .rejects.toMatchObject({ code: "invalid_connection" });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it("número manual de revisión sigue conectándose sin atribuirle identidad humana", async () => {
    mocks.graph.mockResolvedValue({ data: [{ id: "456" }] });
    mocks.check.mockResolvedValue({ ok: true, displayPhoneNumber: "synthetic-phone", verifiedName: "Fixture" });
    mocks.subscribe.mockResolvedValue("subscribed");
    await connectReviewNumber({ organizationId: "org-review", organizationSlug: "meta-review" });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-review", authorization: undefined }));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
