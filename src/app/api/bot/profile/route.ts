import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { serializeBotProfile } from "@/server/bot/profile";
import { VERTICAL } from "@/lib/vertical";
import { agendaEnabled } from "@/server/agenda/flag";
import {
  catalogKnowledge,
  loadCatalog,
  presencialKnowledge,
} from "@/server/agenda/catalog";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/**
 * Perfil del agente + knowledge base para un cerebro externo.
 * GET /api/bot/profile → {profile, kb, resources}. Sin caché: cada consulta
 * refleja lo que el dueño dejó en la UI al momento (el TTL vive del lado del
 * bot, que es quien sabe cada cuánto le conviene releer).
 *
 * 200 — Con la agenda encendida, `kb` suma al final lo que se DERIVA del
 * catálogo (servicios con precio y duración, quién da qué, indicaciones antes
 * de la cita, y si la cita es en persona) y la respuesta lleva `agenda`:
 * `{ presencial, seleccion, recurso, servicio }`. Nada de eso se guarda.
 */
export async function GET(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const db = getDb();
  const profiles = await db
    .select()
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profiles[0];
  if (!profile) {
    // Condición esperada (instancia sin perfil): el bot cae a su brief local.
    return apiError(404, "no_profile", "La instancia no tiene perfil de agente");
  }

  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));

  if (!agendaEnabled()) return Response.json(serializeBotProfile(profile, kb));

  const [catalog, branding] = await Promise.all([
    loadCatalog(organizationId),
    getBranding(organizationId),
  ]);
  const generated = [
    ...catalogKnowledge(catalog, VERTICAL, branding.currency),
    ...presencialKnowledge(VERTICAL),
  ];
  return Response.json({
    ...serializeBotProfile(profile, kb, generated),
    agenda: {
      presencial: VERTICAL.cita.presencial,
      seleccion: VERTICAL.seleccion,
      recurso: VERTICAL.recurso,
      servicio: VERTICAL.servicio,
    },
  });
}
