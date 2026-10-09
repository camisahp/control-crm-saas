import { validateBodyVariables } from "@/lib/templates";

export type RemoteTemplate = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  rejected_reason?: string;
  parameter_format?: string;
  components?: { type?: string; format?: string; text?: string }[];
};

/** Only import templates that the current body-only sender can actually send. */
export function importableTemplateBody(remote: RemoteTemplate): string | null {
  if (!remote.id || !remote.name || !remote.language || !remote.category) return null;
  if (remote.parameter_format === "NAMED" || !Array.isArray(remote.components)) return null;
  if (!remote.components.every((component) => {
    if (component.type === "BODY") return true;
    return (component.type === "FOOTER" || (component.type === "HEADER" && component.format === "TEXT"))
      && typeof component.text === "string" && !component.text.includes("{{");
  })) return null;
  const bodies = remote.components.filter((component) => component.type === "BODY");
  const body = bodies[0]?.text;
  if (bodies.length !== 1 || typeof body !== "string" || !body.trim()) return null;
  // Named or malformed placeholders would otherwise be sent without parameters.
  if (body.replace(/\{\{\s*\d+\s*\}\}/g, "").includes("{{")) return null;
  return validateBodyVariables(body) ? null : body;
}
