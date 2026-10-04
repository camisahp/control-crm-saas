import { withAuth } from "@/lib/api";
import { VERTICAL } from "@/lib/vertical";
import { tituloCatalogo } from "@/lib/vertical-config";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { loadCatalog } from "@/server/agenda/catalog";

export const dynamic = "force-dynamic";

/**
 * 200 — Todo el catálogo de una vez, para las pantallas del operador (Ajustes
 * y Citas): cómo se llaman las cosas en este giro, los recursos y los
 * servicios, INCLUIDOS los inactivos.
 *
 * GET → { vertical: { titulo, recurso, servicio, seleccion, presencial },
 *         resources: [...], services: [...] } (mismas filas que
 *         `/api/agenda/resources` y `/api/agenda/services`).
 */
export const GET = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const catalog = await loadCatalog(session.organizationId, { includeInactive: true });
  return Response.json({
    vertical: {
      titulo: tituloCatalogo(VERTICAL),
      recurso: VERTICAL.recurso,
      servicio: VERTICAL.servicio,
      seleccion: VERTICAL.seleccion,
      presencial: VERTICAL.cita.presencial,
    },
    resources: catalog.resources,
    services: catalog.services,
  });
});
