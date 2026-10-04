import { parseBody, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { loadCatalog } from "@/server/agenda/catalog";
import { catalogErrorResponse, createService } from "@/server/agenda/catalog-admin";
import { serviceCreateSchema } from "@/server/agenda/catalog-schemas";

export const dynamic = "force-dynamic";

/**
 * 200 — Los servicios de la agenda (lo que se agenda: su duración manda).
 *
 * GET  → { services: [{ id, name, durationMinutes, priceCents|null,
 *          description|null, instructions|null, active, position,
 *          resourceIds }] }  (incluye inactivos; resourceIds [] = cualquiera)
 * POST { name, durationMinutes, priceCents?, description?, instructions?,
 *        active?, position?, resourceIds? } → 201 { service }.
 * 409 duplicate_name · 422 invalid_body.
 */
export const GET = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const catalog = await loadCatalog(session.organizationId, { includeInactive: true });
  return Response.json({ services: catalog.services });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const body = await parseBody(req, serviceCreateSchema);
  if (!body.ok) return body.response;
  try {
    const service = await createService(session.organizationId, body.data);
    return Response.json({ service }, { status: 201 });
  } catch (err) {
    return catalogErrorResponse(err);
  }
});
