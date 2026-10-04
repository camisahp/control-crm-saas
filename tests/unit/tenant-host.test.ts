import { describe, expect, it } from "vitest";
import { normalizeHost, resolveTenantHost } from "@/lib/tenant-host";

describe("normalizeHost", () => {
  it("normaliza mayúsculas, puerto y punto final", () => {
    expect(normalizeHost(" CLINICA.ControlChats.com:3000. ")).toBe(
      "clinica.controlchats.com"
    );
  });
});

describe("resolveTenantHost", () => {
  const baseDomain = "controlchats.com";

  it.each([
    ["controlchats.com", "landing"],
    ["WWW.ControlChats.com:443", "landing"],
    ["admin.controlchats.com", "admin"],
    ["alta.controlchats.com", "onboarding"],
  ] as const)("clasifica %s como %s", (host, kind) => {
    expect(resolveTenantHost(host, baseDomain)).toMatchObject({ kind });
  });

  it("resuelve un tenant de primer nivel", () => {
    expect(resolveTenantHost("Clinica.controlchats.com.", baseDomain)).toEqual({
      kind: "tenant",
      host: "clinica.controlchats.com",
      slug: "clinica",
    });
  });

  it("admite *.lvh.me para probar subdominios localmente", () => {
    expect(resolveTenantHost("demo.lvh.me:3000", "lvh.me")).toMatchObject({
      kind: "tenant",
      slug: "demo",
    });
  });

  it.each([
    "api.controlchats.com",
    "a.controlchats.com",
    "-clinica.controlchats.com",
    "clinica-.controlchats.com",
    "otra.clinica.controlchats.com",
    "clinica.ejemplo.com",
  ])("no deriva un tenant de %s", (host) => {
    expect(resolveTenantHost(host, baseDomain)).toMatchObject({ kind: "unknown" });
  });
});
