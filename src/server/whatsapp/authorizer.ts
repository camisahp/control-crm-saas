import { getEnv } from "@/lib/env";
import { verifyMetaSignedRequest } from "@/lib/meta/signed-request";

export type VerifiedAuthorizer = { appId: string; userId: string; issuedAt: number };

/** No confundir al SYSTEM_USER del token empresarial con el autorizante humano. */
export async function resolveMetaAuthorizer(token: string, signedRequest?: string): Promise<VerifiedAuthorizer | null> {
  const env = getEnv();
  if (!env.META_APP_ID || !env.META_APP_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  if (signedRequest) {
    const identity = verifyMetaSignedRequest(signedRequest, env.META_APP_SECRET, now);
    if (!identity || identity.issuedAt < now - 900) return null;
    return { appId: env.META_APP_ID, ...identity };
  }
  // Fallback sólo para tokens USER: introspección autenticada en el servidor.
  const url = new URL(`${env.META_GRAPH_API_VERSION}/debug_token`, `${env.META_GRAPH_BASE_URL}/`);
  url.searchParams.set("input_token", token);
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${env.META_APP_ID}|${env.META_APP_SECRET}` } });
    if (!response.ok) return null;
    const payload = await response.json() as { data?: { is_valid?: boolean; type?: string; app_id?: string; user_id?: string; issued_at?: number } };
    const data = payload.data;
    if (!data || data.is_valid !== true || data.type !== "USER" || data.app_id !== env.META_APP_ID ||
        typeof data.user_id !== "string" || !/^\d{1,128}$/.test(data.user_id) ||
        !Number.isSafeInteger(data.issued_at) || !data.issued_at || data.issued_at < now - 900 || data.issued_at > now + 60) return null;
    return { appId: env.META_APP_ID, userId: data.user_id, issuedAt: data.issued_at };
  } catch { return null; }
}
