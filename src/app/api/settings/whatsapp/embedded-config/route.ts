import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Los IDs de app/config no son secretos; el secreto jamás sale del servidor. */
export const GET = withAuth(async () => {
  const env = getEnv();
  if (!env.META_APP_ID || !env.META_CONFIG_ID) {
    return Response.json({ configured: false, reviewConfigured: false });
  }
  return Response.json({
    configured: true,
    appId: env.META_APP_ID,
    configId: env.META_CONFIG_ID,
    graphVersion: env.META_GRAPH_API_VERSION,
    reviewConfigured: Boolean(
      env.REVIEW_TENANT_SLUG &&
        env.REVIEW_WABA_ID &&
        env.REVIEW_PHONE_NUMBER_ID &&
        env.REVIEW_SYSTEM_USER_TOKEN
    ),
  });
});
