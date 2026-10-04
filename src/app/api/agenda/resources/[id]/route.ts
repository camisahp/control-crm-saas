import { parseBody, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  catalogErrorResponse,
  deleteResource,
  updateResource,
} from "@/server/agenda/catalog-admin";
import { resourcePatchSchema } from "@/server/agenda/catalog-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 200 — Un recurso.
 *
 * PATCH { name?, color?, weeklyHours? (null = el del negocio), active?,
 *         position?, serviceIds? (reemplaza el conjunto) } → { resource }
 * DELETE → { deleted, deactivated }: con citas se DESACTIVA (las citas son
 *          historia); sin citas se borra.
 * 404 not_found · 409 duplicate_name · 422 invalid_body.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const { id } = await ctx.params;
  const body = await parseBody(req, resourcePatchSchema);
  if (!body.ok) return body.response;
  try {
    const resource = await updateResource(session.organizationId, id, body.data);
    return Response.json({ resource });
  } catch (err) {
    return catalogErrorResponse(err);
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const { id } = await ctx.params;
  try {
    return Response.json(await deleteResource(session.organizationId, id));
  } catch (err) {
    return catalogErrorResponse(err);
  }
});
