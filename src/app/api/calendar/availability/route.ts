import { withAuth } from "@/lib/api";
import { dayIsoInTz, timeInTz, dayLabelInTz } from "@/lib/time/slots";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { computeAvailability } from "@/server/agenda/availability";
import { getSettings } from "@/server/agenda/settings";
import { hasResources, loadCatalog } from "@/server/agenda/catalog";
import { resolverServicioYRecurso } from "@/server/agenda/catalog-query";
import { computeResourceAvailability } from "@/server/agenda/resource-availability";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 015 — Los huecos libres, para el operador.
 *
 * A diferencia de la superficie del bot, esta NO registra oferta: es la vista
 * de quien ya está mirando la agenda y elige de lo que ve.
 *
 * Sin huecos responde `{"slots":[]}` con 200: agenda llena es una respuesta,
 * no un error.
 *
 * 200 — Con recursos configurados y `?service=` (id o nombre), los huecos de
 * ese servicio; `?resource=` los limita a un recurso y `?exclude=<bookingId>`
 * deja fuera a la propia cita (para reprogramarla). Cada hueco trae
 * `resourceId` y `resource`. Un servicio o recurso que no se reconoce es 422
 * con la lista de nombres válidos. Sin `service`, lo de siempre.
 */
export const GET = withAuth(async (session, req: Request) => {
  if (!agendaEnabled()) return agendaDisabledResponse();

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const serviceRef = url.searchParams.get("service");

  const settings = await getSettings(session.organizationId);
  const now = new Date();
  const fromISO = from && ISO_DATE.test(from) ? from : undefined;
  const toISO = to && ISO_DATE.test(to) ? to : undefined;

  if (serviceRef) {
    const catalog = await loadCatalog(session.organizationId);
    if (hasResources(catalog)) {
      const resolved = resolverServicioYRecurso(
        catalog,
        serviceRef,
        url.searchParams.get("resource")
      );
      if (!resolved.ok) return Response.json(resolved.body, { status: 422 });
      const slots = await computeResourceAvailability(session.organizationId, {
        service: resolved.service,
        resources: resolved.resources,
        fromISO,
        toISO,
        settings,
        now,
        excludeBookingId: url.searchParams.get("exclude") ?? undefined,
      });
      return Response.json({
        slots: slots.map((s) => ({
          startUtc: s.startUtc,
          endUtc: s.endUtc,
          label: s.label,
          dayIso: dayIsoInTz(new Date(s.startUtc), settings.timezone),
          dayLabel: dayLabelInTz(s.startUtc, settings.timezone, now),
          time: timeInTz(s.startUtc, settings.timezone),
          resourceId: s.resourceId,
          resource: s.resourceName,
          serviceId: s.serviceId,
          service: s.serviceName,
        })),
      });
    }
  }

  const slots = await computeAvailability(session.organizationId, {
    fromISO,
    toISO,
    settings,
    now,
  });

  return Response.json({
    slots: slots.map((s) => ({
      ...s,
      dayIso: dayIsoInTz(new Date(s.startUtc), settings.timezone),
      dayLabel: dayLabelInTz(s.startUtc, settings.timezone, now),
      time: timeInTz(s.startUtc, settings.timezone),
    })),
  });
});
