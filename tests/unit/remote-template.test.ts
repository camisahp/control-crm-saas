import { describe, expect, it } from "vitest";
import { importableTemplateBody, type RemoteTemplate } from "@/lib/meta/remote-template";

const remote: RemoteTemplate = { id: "123", name: "hello_world", language: "en_US", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: "Test message" }] };

describe("Remote templates supported by the current sender", () => {
  it("imports a body-only approved template", () => expect(importableTemplateBody(remote)).toBe("Test message"));
  it("allows static text header and footer", () => expect(importableTemplateBody({ ...remote, components: [{ type: "HEADER", format: "TEXT", text: "Test" }, ...remote.components!, { type: "FOOTER", text: "Footer" }] })).toBe("Test message"));
  it("allows positional body variables", () => expect(importableTemplateBody({ ...remote, components: [{ type: "BODY", text: "Test {{1}} {{2}}" }] })).toBe("Test {{1}} {{2}}"));
  it.each([
    { type: "HEADER", format: "IMAGE" },
    { type: "HEADER", format: "TEXT", text: "Test {{1}}" },
    { type: "BUTTONS" },
  ])("rejects unsupported component $type / $format", (component) => expect(importableTemplateBody({ ...remote, components: [component, ...remote.components!] })).toBeNull());
  it.each(["Test {{name}}", "Test {{2}}", "Test {{1}} {{3}}", ""]) ("rejects invalid body %s", (text) => expect(importableTemplateBody({ ...remote, components: [{ type: "BODY", text }] })).toBeNull());
  it("rejects named parameter format", () => expect(importableTemplateBody({ ...remote, parameter_format: "NAMED" })).toBeNull());
  it("rejects missing metadata or components", () => {
    expect(importableTemplateBody({ ...remote, id: undefined })).toBeNull();
    expect(importableTemplateBody({ ...remote, components: undefined })).toBeNull();
  });
});
