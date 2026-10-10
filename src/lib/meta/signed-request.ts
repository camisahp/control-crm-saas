import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaSignedIdentity = { userId: string; issuedAt: number };

/** Firma de Meta; nunca aceptar un userID aportado sin prueba criptográfica. */
export function verifyMetaSignedRequest(
  value: string,
  appSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): MetaSignedIdentity | null {
  if (!appSecret || value.length > 16_384) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [signature, payload] = parts;
  if (!signature || !payload || !/^[A-Za-z0-9_-]+$/.test(signature) || !/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  const received = Buffer.from(signature, "base64url");
  const decoded = Buffer.from(payload, "base64url");
  if (received.toString("base64url") !== signature || decoded.toString("base64url") !== payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = JSON.parse(decoded.toString("utf8")) as Record<string, unknown>;
    if (!data || data.algorithm !== "HMAC-SHA256" || typeof data.user_id !== "string" ||
        !/^\d{1,128}$/.test(data.user_id) || typeof data.issued_at !== "number" ||
        !Number.isSafeInteger(data.issued_at) || data.issued_at <= 0 || data.issued_at > nowSeconds + 60) return null;
    return { userId: data.user_id, issuedAt: data.issued_at };
  } catch { return null; }
}
