import { getEnv } from "@/lib/env";
import { graphRequest, MetaApiError } from "@/lib/meta/client";
import { saveCredentials } from "@/server/whatsapp/credentials";
import { subscribeAppToWaba, testConnection } from "@/server/whatsapp/connect";

export class EmbeddedSignupError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "invalid_connection"
      | "meta_unavailable"
      | "meta_error",
    message: string
  ) {
    super(message);
    this.name = "EmbeddedSignupError";
  }
}

type PhoneList = { data?: { id?: string }[] };

function configuredApp() {
  const env = getEnv();
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new EmbeddedSignupError(
      "not_configured",
      "La conexión con Meta aún no está configurada en el servidor"
    );
  }
  return { ...env, appId: env.META_APP_ID, appSecret: env.META_APP_SECRET };
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const env = configuredApp();
  const url = new URL("oauth/access_token", `${env.META_GRAPH_BASE_URL}/`);
  url.searchParams.set("client_id", env.appId);
  url.searchParams.set("client_secret", env.appSecret);
  url.searchParams.set("code", code);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new EmbeddedSignupError(
      "meta_unavailable",
      "No se pudo contactar a Meta. Inténtalo de nuevo."
    );
  }
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new EmbeddedSignupError(
      "meta_error",
      payload?.error?.message ?? "Meta no pudo autorizar la conexión"
    );
  }
  return payload.access_token;
}

async function assertPhoneBelongsToWaba(input: {
  wabaId: string;
  phoneNumberId: string;
  token: string;
}): Promise<void> {
  try {
    const phones = await graphRequest<PhoneList>(
      `${input.wabaId}/phone_numbers?fields=id`,
      { token: input.token }
    );
    if (!phones.data?.some((phone) => phone.id === input.phoneNumberId)) {
      throw new EmbeddedSignupError(
        "invalid_connection",
        "El número elegido no pertenece a la cuenta de WhatsApp seleccionada"
      );
    }
  } catch (error) {
    if (error instanceof EmbeddedSignupError) throw error;
    if (error instanceof MetaApiError && (error.status === 0 || error.status >= 500)) {
      throw new EmbeddedSignupError("meta_unavailable", "Meta no está disponible ahora");
    }
    throw new EmbeddedSignupError("meta_error", "Meta no pudo verificar la cuenta de WhatsApp");
  }
}

async function persistVerifiedConnection(input: {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
}): Promise<{ displayPhoneNumber: string; subscribed: string }> {
  await assertPhoneBelongsToWaba(input);
  const check = await testConnection(input.phoneNumberId, input.token);
  if (!check.ok) {
    throw new EmbeddedSignupError(
      check.code === "meta_unavailable" ? "meta_unavailable" : "invalid_connection",
      check.message
    );
  }
  await saveCredentials({
    organizationId: input.organizationId,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    token: input.token,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });
  const subscribed = await subscribeAppToWaba(input.wabaId, input.token);
  return { displayPhoneNumber: check.displayPhoneNumber, subscribed };
}

/** Finaliza un popup de Embedded Signup; el código sólo existe durante esta petición. */
export async function completeEmbeddedSignup(input: {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  code: string;
}): Promise<{ displayPhoneNumber: string; subscribed: string }> {
  const token = await exchangeCodeForToken(input.code);
  return persistVerifiedConnection({ ...input, token });
}

/** Conecta exclusivamente el WABA de revisión, sin revelar su token a la UI. */
export async function connectReviewNumber(input: {
  organizationId: string;
  organizationSlug: string | null;
}): Promise<{ displayPhoneNumber: string; subscribed: string }> {
  const env = getEnv();
  if (!env.REVIEW_TENANT_SLUG || !env.REVIEW_WABA_ID || !env.REVIEW_PHONE_NUMBER_ID || !env.REVIEW_SYSTEM_USER_TOKEN) {
    throw new EmbeddedSignupError("not_configured", "Falta configurar el número de revisión en el servidor");
  }
  if (input.organizationSlug !== env.REVIEW_TENANT_SLUG) {
    throw new EmbeddedSignupError("invalid_connection", "Esta acción sólo está disponible en el espacio de revisión");
  }
  return persistVerifiedConnection({
    organizationId: input.organizationId,
    wabaId: env.REVIEW_WABA_ID,
    phoneNumberId: env.REVIEW_PHONE_NUMBER_ID,
    token: env.REVIEW_SYSTEM_USER_TOKEN,
  });
}
