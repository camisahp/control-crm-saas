import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Los IDs de app/config no son secretos; el secreto jamás sale del servidor. */
export const GET = withAuth(async (session) => {
  const env = getEnv();
  // Diagnóstico no sensible, restringido al propietario y su organización.
  const organization = session.role === "owner"
    ? await getDb().select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, session.organizationId))
      .limit(1)
    : [];
  const organizationSlug = organization[0]?.slug;
  if (!env.META_APP_ID || !env.META_CONFIG_ID) {
    return Response.json({ configured: false, reviewConfigured: false });
  }
  return Response.json({
    configured: true,
    appId: env.META_APP_ID,
    configId: env.META_CONFIG_ID,
    graphVersion: env.META_GRAPH_API_VERSION,
    ...(session.role === "owner" ? {
      organizationSlug,
      reviewOrganizationMatches: Boolean(
        organizationSlug && organizationSlug === env.REVIEW_TENANT_SLUG
      ),
    } : {}),
    reviewConfigured: Boolean(
      session.role === "owner" && env.REVIEW_TENANT_SLUG &&
        env.REVIEW_WABA_ID &&
        env.REVIEW_PHONE_NUMBER_ID &&
        env.REVIEW_SYSTEM_USER_TOKEN
    ),
  });
});
