import { parseBody, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { loadCatalog } from "@/server/agenda/catalog";
import { catalogErrorResponse, createResource } from "@/server/agenda/catalog-admin";
import { resourceCreateSchema } from "@/server/agenda/catalog-schemas";

export const dynamic = "force-dynamic";

/**
 * 200 — Los recursos de la agenda (barberos, cabinas), para el operador y los
 * scripts de siembra.
 *
 * GET  → { resources: [{ id, name, weeklyHours|null, color|null, active,
 *          position, serviceIds }] }  (incluye inactivos)
 * POST { name, color?, weeklyHours?, active?, position?, serviceIds? }
 *      → 201 { resource }. 409 duplicate_name · 422 invalid_body.
 */
export const GET = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const catalog = await loadCatalog(session.organizationId, { includeInactive: true });
  return Response.json({ resources: catalog.resources });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const body = await parseBody(req, resourceCreateSchema);
  if (!body.ok) return body.response;
  try {
    const resource = await createResource(session.organizationId, body.data);
    return Response.json({ resource }, { status: 201 });
  } catch (err) {
    return catalogErrorResponse(err);
  }
});
