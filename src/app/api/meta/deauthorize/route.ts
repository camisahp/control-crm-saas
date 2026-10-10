import { getEnv } from "@/lib/env";
import { verifyMetaSignedRequest } from "@/lib/meta/signed-request";
import { deauthorizeMetaSubject } from "@/server/whatsapp/deauthorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
const error = (status: number, code: string) => Response.json({ error: code }, { status, headers });

export function GET() {
  return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
}

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.META_APP_SECRET || !env.META_APP_ID) return error(503, "not_configured");
  if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") return error(415, "unsupported_content_type");
  // Limitar también transferencia chunked; no confiar sólo en Content-Length.
  const reader = req.body?.getReader();
  if (!reader) return error(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 32_768) { await reader.cancel(); return error(413, "request_too_large"); }
      chunks.push(chunk.value);
    }
  } catch { return error(400, "invalid_request"); }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const values = form.getAll("signed_request");
  if (values.length !== 1 || !values[0]) return error(400, "invalid_request");
  const identity = verifyMetaSignedRequest(values[0], env.META_APP_SECRET);
  if (!identity) return error(401, "invalid_signed_request");
  try {
    await deauthorizeMetaSubject(env.META_APP_ID, identity);
    // Confirma recepción, no informa número de tenants ni identidades.
    return Response.json({ ok: true }, { headers });
  } catch { return error(503, "temporarily_unavailable"); }
}
