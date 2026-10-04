import { parseBody, withAuth } from "@/lib/api";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import {
  catalogErrorResponse,
  deleteService,
  updateService,
} from "@/server/agenda/catalog-admin";
import { servicePatchSchema } from "@/server/agenda/catalog-schemas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 200 — Un servicio.
 *
 * PATCH { name?, durationMinutes?, priceCents?, description?, instructions?,
 *         active?, position?, resourceIds? (reemplaza el conjunto) } → { service }
 * DELETE → { deleted, deactivated }: con citas se DESACTIVA; sin citas se borra.
 * 404 not_found · 409 duplicate_name · 422 invalid_body.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const { id } = await ctx.params;
  const body = await parseBody(req, servicePatchSchema);
  if (!body.ok) return body.response;
  try {
    const service = await updateService(session.organizationId, id, body.data);
    return Response.json({ service });
  } catch (err) {
    return catalogErrorResponse(err);
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const { id } = await ctx.params;
  try {
    return Response.json(await deleteService(session.organizationId, id));
  } catch (err) {
    return catalogErrorResponse(err);
  }
});
