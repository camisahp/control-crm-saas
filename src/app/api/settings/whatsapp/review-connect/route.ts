import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { connectReviewNumber, EmbeddedSignupError } from "@/server/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (session) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Sólo el propietario puede conectar WhatsApp");
  const organization = await getDb()
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);
  try {
    const result = await connectReviewNumber({
      organizationId: session.organizationId,
      organizationSlug: organization[0]?.slug ?? null,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EmbeddedSignupError) {
      return apiError(error.code === "meta_unavailable" ? 503 : 422, error.code, error.message);
    }
    throw error;
  }
});
