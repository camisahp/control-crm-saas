import { apiError } from "@/lib/api";
import { VERTICAL } from "@/lib/vertical";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { catalogPayload, loadCatalog } from "@/server/agenda/catalog";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/**
 * 200 — El catálogo de la agenda por recurso, para quien conduce la
 * conversación: qué se ofrece (con precio, duración, descripción e
 * indicaciones antes de la cita), quién lo da, y cómo se llaman las cosas en
 * este giro (`vertical`).
 *
 * GET /api/bot/catalog → {
 *   vertical: { recurso: {singular, plural}, servicio: {singular, plural},
 *               seleccion: "cliente" | "automatica", presencial },
 *   services: [{ id, name, durationMinutes, priceCents, priceLabel,
 *                description, instructions, resourceIds }],
 *   resources: [{ id, name, serviceIds }]
 * }
 *
 * Solo lo ACTIVO y ofrecible. `resourceIds: []` = lo da cualquiera. Sin
 * catálogo, las listas vienen vacías (200): la agenda es la de siempre.
 * Con la agenda apagada, 404 vacío como el resto de su superficie.
 */
export async function GET(req: Request) {
  if (!agendaEnabled()) return agendaDisabledResponse();

  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const [catalog, branding] = await Promise.all([
    loadCatalog(organizationId),
    getBranding(organizationId),
  ]);
  return Response.json(catalogPayload(catalog, VERTICAL, branding.currency));
}
