import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncTemplates } from "@/server/whatsapp/templates";

const mocks = vi.hoisted(() => ({
  graph: vi.fn(), credentials: vi.fn(), select: vi.fn(), values: vi.fn(), update: vi.fn(),
  where: vi.fn(), returning: vi.fn(), inserted: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/meta/client", async (original) => ({ ...await original<typeof import("@/lib/meta/client")>(), graphRequest: mocks.graph }));
vi.mock("@/server/whatsapp/credentials", () => ({ getCredentialsByOrg: mocks.credentials, getCredentialsByWabaId: vi.fn(), markReconnectRequired: vi.fn() }));
vi.mock("@/lib/db", async (original) => ({
  ...await original<typeof import("@/lib/db")>(),
  getDb: () => ({
    select: () => ({ from: () => ({ where: mocks.select }) }),
    insert: () => ({ values: mocks.values }),
    update: () => ({ set: mocks.update }),
  }),
}));

const remote = { id: "123", name: "hello_world", language: "en_US", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Test message" }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted = [];
  mocks.credentials.mockResolvedValue({ wabaId: "456", token: "mock-only-value" });
  mocks.select.mockImplementation(async () => [...mocks.inserted]);
  mocks.values.mockImplementation((row: Record<string, unknown>) => ({ onConflictDoNothing: () => ({ returning: async () => { mocks.inserted.push(row); return [row]; } }) }));
  mocks.update.mockReturnValue({ where: mocks.where });
  mocks.where.mockResolvedValue(undefined);
  mocks.graph.mockResolvedValue({ data: [remote] });
});

describe("Template synchronization imports", () => {
  it("imports hello_world as approved only in the requested organization, then is idempotent", async () => {
    await expect(syncTemplates("org-review")).resolves.toBe(1);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-review", name: "hello_world", status: "approved", body: "Test message", waTemplateId: "123" }));
    await expect(syncTemplates("org-review")).resolves.toBe(0);
    expect(mocks.values).toHaveBeenCalledTimes(1);
  });
  it("does not import unsupported media templates", async () => {
    mocks.graph.mockResolvedValue({ data: [{ ...remote, components: [{ type: "HEADER", format: "IMAGE" }, ...remote.components] }] });
    await expect(syncTemplates("org-review")).resolves.toBe(0);
    expect(mocks.values).not.toHaveBeenCalled();
  });
  it("updates an existing template without overwriting its body", async () => {
    mocks.inserted.push({ id: "local-1", organizationId: "org-review", waTemplateId: "123", name: "hello_world", language: "en_US", status: "pending", category: "UTILITY", body: "Local body" });
    await expect(syncTemplates("org-review")).resolves.toBe(1);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
    expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty("body");
    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.where).toHaveBeenCalled();
  });
  it("follows cursors without using the provider next URL", async () => {
    mocks.graph.mockResolvedValueOnce({ data: [], paging: { next: "https://provider.invalid/private-next", cursors: { after: "next-cursor" } } }).mockResolvedValueOnce({ data: [remote] });
    await expect(syncTemplates("org-review")).resolves.toBe(1);
    expect(mocks.graph.mock.calls[1]?.[0]).toMatch(/^456\/message_templates\?/);
    expect(mocks.graph.mock.calls[1]?.[0]).toContain("after=next-cursor");
  });
  it("does not contact Meta when no number is connected", async () => {
    mocks.credentials.mockResolvedValue(null);
    await expect(syncTemplates("org-review")).rejects.toMatchObject({ code: "not_connected" });
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});
