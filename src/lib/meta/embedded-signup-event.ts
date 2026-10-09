const META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
]);

/** Acepta únicamente eventos FINISH de los orígenes exactos de Meta. */
export function parseEmbeddedSignupEvent(
  origin: string,
  data: unknown
): { wabaId: string; phoneNumberId: string } | null {
  if (!META_ORIGINS.has(origin)) return null;
  let payload: unknown;
  try { payload = typeof data === "string" ? JSON.parse(data) : data; }
  catch { return null; }
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  if (event.type !== "WA_EMBEDDED_SIGNUP" || event.event !== "FINISH") return null;
  if (!event.data || typeof event.data !== "object") return null;
  const ids = event.data as Record<string, unknown>;
  if (typeof ids.waba_id !== "string" || !/^\d+$/.test(ids.waba_id)) return null;
  if (typeof ids.phone_number_id !== "string" || !/^\d+$/.test(ids.phone_number_id)) return null;
  return { wabaId: ids.waba_id, phoneNumberId: ids.phone_number_id };
}
