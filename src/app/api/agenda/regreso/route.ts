import { withAuth } from "@/lib/api";
import { VERTICAL } from "@/lib/vertical";
import { regresoDias } from "@/lib/vertical-config";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { ejecutarRegreso } from "@/server/agenda/etapas";

export const dynamic = "force-dynamic";

/**
 * 200 — Corre YA el regreso de esta organización (lo mismo que hace el trabajo
 * de cada hora): mueve a la etapa de regreso a quien sigue en la de "asistió"
 * con su última cita realizada de hace `dias` o más, y sin otra cita por
 * delante. Sirve para probar con `REGRESO_DIAS=0` sin esperar la hora.
 *
 * POST → { moved, dias, etapa } · `dias`/`etapa` null si el giro no tiene
 * regreso (entonces `moved` es 0).
 */
export const POST = withAuth(async (session) => {
  if (!agendaEnabled()) return agendaDisabledResponse();
  const dias = regresoDias(VERTICAL, process.env.REGRESO_DIAS);
  const moved = await ejecutarRegreso(session.organizationId);
  return Response.json({ moved, dias, etapa: VERTICAL.etapas.regreso?.etapa ?? null });
});
