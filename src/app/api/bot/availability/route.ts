import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";
import { scoped } from "@/lib/db/tenant";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { agendaDisabledResponse, agendaEnabled } from "@/server/agenda/flag";
import { addDaysISO, todayInTz } from "@/lib/time/slots";
import {
  buildCandidateSlots,
  computeAvailability,
} from "@/server/agenda/availability";
import { getSettings } from "@/server/agenda/settings";
import { armarHuecos, daysWithAgenda } from "@/server/agenda/spread";
import { replaceOffers } from "@/server/agenda/offers";
import { VERTICAL } from "@/lib/vertical";
import { hasResources, loadCatalog } from "@/server/agenda/catalog";
import {
  computeResourceAvailability,
  countDayCandidates,
} from "@/server/agenda/resource-availability";
import { resolverServicioYRecurso } from "@/server/agenda/catalog-query";
import { alElegirServicio } from "@/server/agenda/etapas";

export const dynamic = "force-dynamic";

/**
 * 015 — Los horarios que se le van a ofrecer al cliente, para quien conduce la
 * conversación.
 *
 * A diferencia de la vista del operador, esta REGISTRA la oferta: es ese
 * registro lo que después habilita la reserva. Sin él, `POST /api/bot/bookings`
 * rechaza cualquier instante.
 *
 * El catálogo reservable (`limit`) es más ancho que el menú que el agente
 * enseña: guardar solo los tres que se muestran deja al agente sin nada
 * legítimo que aceptar cuando el cliente pide otro día.
 *
 * Sin `date` es un REPARTO (hasta `perDay` horas de cada día) y `query` dice
 * hasta dónde llega. Con `date=YYYY-MM-DD` (día en la zona del negocio)
 * devuelve las horas libres de ESE día, repartidas a lo largo del día, y
 * `query.status` dice por qué no hay ninguna. Sin esto, a «¿mañana en la
 * tarde?» el cerebro solo veía las tres primeras horas de mañana y contestaba
 * que solo había mañana (`src/server/agenda/spread.ts`, `armarHuecos`).
 *
 * 200 — Agenda por recurso. Con al menos un recurso activo (barbero, cabina),
 * `service` (id o nombre) es OBLIGATORIO y `resource` (id o nombre) opcional:
 * - falta `service` → 422 `service_required` con `services` (los nombres).
 * - `service` desconocido → 422 `unknown_service` con `services`.
 * - `resource` desconocido → 422 `unknown_resource` con `resources`.
 * - `resource` que no da ese servicio → 422 `resource_not_offering_service`
 *   con `resources` (los que sí lo dan).
 * Cada hueco trae `resource`, `service` y `resourceLabel` ("con Luis" cuando
 * el cliente elige; null cuando asigna el sistema), y la oferta registra con
 * quién y qué — es lo que después reserva `POST /api/bot/bookings`. Sin
 * recursos, todo es exactamente lo de siempre y `service`/`resource` se
 * ignoran.
 */

const LIMITS = {
  limit: { min: 1, max: 48, def: 12 },
  perDay: { min: 1, max: 8, def: 3 },
  days: { min: 1, max: 14, def: 5 },
};

function clamp(raw: string | null, l: { min: number; max: number; def: number }) {
  // Ausente o vacío ⇒ el default del contrato. `Number(null)` es 0, no NaN:
  // sin este corte, pedir sin parámetros daba UN hueco de UN día.
  if (raw === null || raw.trim() === "") return l.def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return l.def;
  return Math.max(l.min, Math.min(l.max, Math.round(n)));
}

export async function GET(req: Request) {
  // La bandera se evalúa ANTES que la llave: si esta instancia no tiene
  // agenda, el endpoint no existe — no hay nada que autenticar.
  if (!agendaEnabled()) return agendaDisabledResponse();

  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) {
    return apiError(422, "invalid_body", "Falta conversationId");
  }
  // `date` es opcional; vacío cuenta como ausente. Mal formada o inexistente
  // en el calendario (2026-02-31) → 422, nunca un 500 ni el reparto callado.
  const date = url.searchParams.get("date")?.trim() || null;
  if (date !== null && !fechaValida(date)) {
    return apiError(
      422,
      "invalid_body",
      "date debe ser una fecha real en formato YYYY-MM-DD"
    );
  }

  const db = getDb();
  const rows = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  if (!rows[0]) return apiError(404, "not_found", "Conversación no encontrada");

  const limit = clamp(url.searchParams.get("limit"), LIMITS.limit);
  const perDay = clamp(url.searchParams.get("perDay"), LIMITS.perDay);
  const days = clamp(url.searchParams.get("days"), LIMITS.days);

  const settings = await getSettings(organizationId);
  const catalog = await loadCatalog(organizationId);
  if (hasResources(catalog)) {
    return porRecurso({
      organizationId,
      conversationId,
      date,
      limit,
      perDay,
      days,
      settings,
      catalog,
      serviceRef: url.searchParams.get("service"),
      resourceRef: url.searchParams.get("resource"),
    });
  }

  const now = new Date();
  const hoy = todayInTz(now, settings.timezone);
  // Un día fuera de lo agendable ni se calcula: no hay nada que buscar.
  const dentro =
    !date || (date >= hoy && date <= addDaysISO(hoy, settings.maxDaysAhead));
  const todos = dentro
    ? await computeAvailability(organizationId, {
        settings,
        now,
        ...(date ? { fromISO: date, toISO: date } : {}),
      })
    : [];
  const { slots, query } = armarHuecos({
    todos,
    timezone: settings.timezone,
    now,
    maxDaysAhead: settings.maxDaysAhead,
    limit,
    perDay,
    days,
    date,
    candidatosDelDia:
      date && dentro ? buildCandidateSlots(settings, date, date).length : 0,
  });

  // Reemplazo completo: la oferta vigente es siempre la última. Pero una
  // consulta por día que no encontró nada NO borra lo ya ofrecido: el cliente
  // que pregunta por el sábado y oye «ese día no abrimos» todavía puede
  // quedarse con el viernes que se le dio antes.
  if (!date || slots.length > 0) {
    await replaceOffers(
      organizationId,
      conversationId,
      slots.map((s) => ({ startUtc: s.startUtc, label: s.label }))
    );
  }

  return Response.json({
    slots: slots.map((s) => ({
      startUtc: s.startUtc,
      endUtc: s.endUtc,
      label: s.label,
      dayIso: s.dayIso,
      dayLabel: s.dayLabel,
      time: s.time,
    })),
    // Los días que NO están aquí no tienen agenda HASTA `query.coveredUntil`:
    // lo posterior no se revisó, y de cada día se ven hasta `query.perDay`
    // horas. Para un día concreto, se pregunta con `date`.
    diasConAgenda: daysWithAgenda(slots),
    query,
  });
}

/**
 * 200 — La misma consulta, en la agenda por recurso: la duración es la del
 * servicio y cada hueco lleva con quién. El reparto, `date` y `query` son los
 * de siempre (`armarHuecos`).
 */
async function porRecurso(input: {
  organizationId: string;
  conversationId: string;
  date: string | null;
  limit: number;
  perDay: number;
  days: number;
  settings: Awaited<ReturnType<typeof getSettings>>;
  catalog: Awaited<ReturnType<typeof loadCatalog>>;
  serviceRef: string | null;
  resourceRef: string | null;
}): Promise<Response> {
  const { settings, date, organizationId, conversationId } = input;
  const resolved = resolverServicioYRecurso(input.catalog, input.serviceRef, input.resourceRef);
  if (!resolved.ok) return Response.json(resolved.body, { status: 422 });
  const { service, resources, resource } = resolved;

  const now = new Date();
  const hoy = todayInTz(now, settings.timezone);
  const dentro =
    !date || (date >= hoy && date <= addDaysISO(hoy, settings.maxDaysAhead));
  const todos = dentro
    ? await computeResourceAvailability(organizationId, {
        service,
        resources,
        settings,
        now,
        seleccion: VERTICAL.seleccion,
        ...(date ? { fromISO: date, toISO: date } : {}),
      })
    : [];
  const { slots, query } = armarHuecos({
    todos,
    timezone: settings.timezone,
    now,
    maxDaysAhead: settings.maxDaysAhead,
    limit: input.limit,
    perDay: input.perDay,
    days: input.days,
    date,
    candidatosDelDia:
      date && dentro
        ? countDayCandidates({
            settings,
            resources,
            durationMinutes: service.durationMinutes,
            dateISO: date,
          })
        : 0,
  });

  if (!date || slots.length > 0) {
    await replaceOffers(
      organizationId,
      conversationId,
      slots.map((s) => ({
        startUtc: s.startUtc,
        label: s.label,
        resourceId: s.resourceId,
        serviceId: s.serviceId,
      }))
    );
  }

  // Preguntar horarios de un servicio ya es elegirlo (en el spa, "Paquete
  // elegido"). Best-effort y solo hacia adelante.
  if (VERTICAL.etapas.servicioElegido) {
    const conv = await getDb()
      .select({ contactId: schema.conversation.contactId })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          organizationId,
          eq(schema.conversation.id, conversationId)
        )
      )
      .limit(1);
    if (conv[0]) await alElegirServicio(organizationId, conv[0].contactId);
  }

  return Response.json({
    slots: slots.map((s) => ({
      startUtc: s.startUtc,
      endUtc: s.endUtc,
      label: s.label,
      dayIso: s.dayIso,
      dayLabel: s.dayLabel,
      time: s.time,
      resource: s.resourceName,
      resourceLabel: s.resourceLabel,
      service: s.serviceName,
    })),
    diasConAgenda: daysWithAgenda(slots),
    query,
    service: {
      name: service.name,
      durationMinutes: service.durationMinutes,
      instructions: service.instructions,
    },
    // El recurso que se pidió (null = cualquiera) y cómo elige este negocio.
    resource: resource ? resource.name : null,
    seleccion: VERTICAL.seleccion,
  });
}

/** YYYY-MM-DD que además existe en el calendario (nada de 2026-02-31). */
function fechaValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
