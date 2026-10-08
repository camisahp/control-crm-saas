import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { completeEmbeddedSignup, EmbeddedSignupError } from "@/server/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  wabaId: z.string().regex(/^\d+$/),
  phoneNumberId: z.string().regex(/^\d+$/),
  code: z.string().trim().min(8).max(4096),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Sólo el propietario puede conectar WhatsApp");
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const result = await completeEmbeddedSignup({ organizationId: session.organizationId, ...body.data });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EmbeddedSignupError) {
      return apiError(error.code === "meta_unavailable" ? 503 : 422, error.code, error.message);
    }
    throw error;
  }
});
