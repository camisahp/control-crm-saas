import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeEmbeddedSignup, connectReviewNumber } from "@/server/whatsapp/embedded-signup";

const mocks = vi.hoisted(() => ({ save: vi.fn(), graph: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({
  META_APP_ID: "123", META_APP_SECRET: "mock-only-value",
  META_GRAPH_API_VERSION: "v25.0", META_GRAPH_BASE_URL: "https://meta.example.invalid",
  REVIEW_TENANT_SLUG: "meta-review", REVIEW_WABA_ID: "123",
  REVIEW_PHONE_NUMBER_ID: "456", REVIEW_SYSTEM_USER_TOKEN: "mock-only-value",
}) }));
vi.mock("@/lib/meta/client", async (original) => ({
  ...await original<typeof import("@/lib/meta/client")>(), graphRequest: mocks.graph,
}));
vi.mock("@/server/whatsapp/credentials", () => ({ saveCredentials: mocks.save }));
vi.mock("@/server/whatsapp/connect", () => ({ testConnection: vi.fn(), subscribeAppToWaba: vi.fn() }));

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
});
