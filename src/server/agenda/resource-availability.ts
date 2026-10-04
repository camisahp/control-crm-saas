import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  addDaysISO,
  eachDateInRange,
  naturalLabelInTz,
  todayInTz,
  weekdayKeyOf,
  zonedWallClockToUtc,
  type Interval,
  type SlotUtc,
} from "@/lib/time/slots";
import type { ModoSeleccion } from "@/lib/vertical-config";
import { VERTICAL } from "@/lib/vertical";
import type { AvailableSlot } from "@/server/agenda/availability";
import type { CatalogResource, CatalogService } from "@/server/agenda/catalog";
import { getSettings, type CalendarSettings, type WeeklyHours } from "@/server/agenda/settings";

/**
 * 200 — Disponibilidad POR RECURSO:
 *   (duración del servicio × horario del recurso) − citas activas de ESE
 *   recurso (cada una con su propia duración + respiro) − bloqueos del negocio.
 *
 * Diferencias con la agenda única (`availability.ts`, que no cambia):
 * - La duración es la del SERVICIO, no `slot_minutes`. `slot_minutes` queda
 *   como el PASO entre inicios posibles (cada 30 min por defecto).
 * - Lo ocupado se mide con la duración de cada cita: una de 60 min a las
 *   17:00 impide un corte de 45 a las 17:30 aunque el índice único no lo vea.
 * - Una cita o bloqueo SIN recurso ocupa a todos: es la agenda de antes o un
 *   bloqueo del negocio entero (comida, día festivo).
 * - Por instante sale UN hueco con UN recurso: el pedido o, si no se pidió
 *   ninguno, el primero libre por posición. La oferta se reserva por instante
 *   (`findOffered` compara epoch exacto), así que dos barberos en el mismo
 *   minuto no caben en ella — y no hace falta: el cliente oye "con Luis".
 */

/** Una cita que ocupa agenda; `endMs` ya incluye el respiro. */
export type BusyBlock = { resourceId: string | null; startMs: number; endMs: number };

export type AssignedSlot = SlotUtc & { resourceId: string };

export type ResourceSlot = AvailableSlot & {
  resourceId: string;
  resourceName: string;
  serviceId: string;
  serviceName: string;
  /** "con Luis" cuando el cliente elige; null cuando asigna el sistema. */
  resourceLabel: string | null;
};

/**
 * PURA: los inicios posibles de UN día para una duración dada. Avanza de
 * `stepMinutes` en `stepMinutes` desde el inicio de cada franja y solo emite
 * el hueco si la cita CABE completa dentro de la franja.
 */
export function expandDayForDuration(
  dayISODate: string,
  intervals: Interval[],
  tz: string,
  durationMinutes: number,
  stepMinutes: number
): SlotUtc[] {
  const out: SlotUtc[] = [];
  if (durationMinutes <= 0 || stepMinutes <= 0) return out;
  for (const iv of intervals) {
    const start = zonedWallClockToUtc(dayISODate, iv.start, tz);
    const end = zonedWallClockToUtc(dayISODate, iv.end, tz);
    if (!start || !end || end <= start) continue;
    for (
      let t = start.getTime(), guard = 0;
      t + durationMinutes * 60_000 <= end.getTime() && guard < 1000;
      t += stepMinutes * 60_000, guard++
    ) {
      out.push({
        startUtc: new Date(t).toISOString(),
        endUtc: new Date(t + durationMinutes * 60_000).toISOString(),
      });
    }
  }
  return out;
}

/** PURA: el horario que rige a un recurso (el suyo o el del negocio). */
export function hoursOf(resource: Pick<CatalogResource, "weeklyHours">, settings: CalendarSettings): WeeklyHours {
  return resource.weeklyHours ?? settings.weeklyHours;
}

/** PURA: todos los inicios posibles de un recurso en el rango, sin mirar lo ocupado. */
export function resourceCandidates(input: {
  settings: CalendarSettings;
  weeklyHours: WeeklyHours;
  durationMinutes: number;
  fromISO: string;
  toISO: string;
}): SlotUtc[] {
  const { settings } = input;
  const tz = settings.timezone;
  const out: SlotUtc[] = [];
  for (const date of eachDateInRange(input.fromISO, input.toISO)) {
    const weekday = weekdayKeyOf(date, tz);
    if (!weekday) continue;
    const intervals = input.weeklyHours[weekday] ?? [];
    if (intervals.length === 0) continue;
    out.push(
      ...expandDayForDuration(date, intervals, tz, input.durationMinutes, settings.slotMinutes)
    );
  }
  return out;
}

/**
 * PURA: ¿el hueco [inicio, inicio + duración + respiro) choca con algo? Lo
 * ocupado ya trae su respiro al final, así que las dos citas quedan separadas
 * por él sin importar cuál va primero.
 */
export function collides(
  slot: SlotUtc,
  bufferMinutes: number,
  busy: BusyBlock[]
): boolean {
  const start = Date.parse(slot.startUtc);
  const end = Date.parse(slot.endUtc) + Math.max(0, bufferMinutes) * 60_000;
  return busy.some((b) => start < b.endMs && b.startMs < end);
}

/** PURA: lo ocupado que le toca a un recurso: lo suyo y lo de todos. */
export function busyFor(resourceId: string, busy: BusyBlock[]): BusyBlock[] {
  return busy.filter((b) => b.resourceId === null || b.resourceId === resourceId);
}

/**
 * PURA: los huecos libres de UN recurso — horario − aviso mínimo − ocupado.
 */
export function freeSlotsForResource(input: {
  settings: CalendarSettings;
  resource: Pick<CatalogResource, "id" | "weeklyHours">;
  durationMinutes: number;
  busy: BusyBlock[];
  fromISO: string;
  toISO: string;
  now: Date;
}): SlotUtc[] {
  const { settings } = input;
  const minStartMs = input.now.getTime() + settings.minNoticeHours * 3_600_000;
  const own = busyFor(input.resource.id, input.busy);
  return resourceCandidates({
    settings,
    weeklyHours: hoursOf(input.resource, settings),
    durationMinutes: input.durationMinutes,
    fromISO: input.fromISO,
    toISO: input.toISO,
  })
    .filter((c) => Date.parse(c.startUtc) >= minStartMs)
    .filter((c) => !collides(c, settings.bufferMinutes, own));
}

/**
 * PURA: el motor completo. `resources` llega YA filtrado (activos que dan el
 * servicio, o solo el que se pidió) y en su orden de preferencia: en cada
 * instante gana el primero libre.
 */
export function computeResourceSlots(input: {
  settings: CalendarSettings;
  resources: Pick<CatalogResource, "id" | "weeklyHours">[];
  durationMinutes: number;
  busy: BusyBlock[];
  fromISO: string;
  toISO: string;
  now: Date;
}): AssignedSlot[] {
  const byInstant = new Map<number, AssignedSlot>();
  for (const resource of input.resources) {
    for (const slot of freeSlotsForResource({ ...input, resource })) {
      const key = Date.parse(slot.startUtc);
      if (!byInstant.has(key)) byInstant.set(key, { ...slot, resourceId: resource.id });
    }
  }
  return [...byInstant.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

/**
 * PURA: cuántos turnos tiene un día en el horario de estos recursos, sin mirar
 * lo ocupado. Distingue "ese día no abrimos" (0) de "ese día está lleno".
 */
export function countDayCandidates(input: {
  settings: CalendarSettings;
  resources: Pick<CatalogResource, "weeklyHours">[];
  durationMinutes: number;
  dateISO: string;
}): number {
  return input.resources.reduce(
    (n, r) =>
      n +
      resourceCandidates({
        settings: input.settings,
        weeklyHours: hoursOf(r, input.settings),
        durationMinutes: input.durationMinutes,
        fromISO: input.dateISO,
        toISO: input.dateISO,
      }).length,
    0
  );
}

/**
 * PURA: la etiqueta que se le dice al cliente. Cuando el cliente elige
 * ("cliente"), lleva con quién: "mañana martes 29 a las 5:00 pm con Luis".
 * Cuando asigna el sistema, la cabina no se menciona: puede cambiar al
 * reservar si otra reserva ganó ese lugar.
 */
export function resourceSlotLabel(input: {
  startUtc: string;
  timezone: string;
  now: Date;
  resourceName: string;
  seleccion: ModoSeleccion;
}): { label: string; resourceLabel: string | null } {
  const base = naturalLabelInTz(input.startUtc, input.timezone, input.now);
  const resourceLabel = input.seleccion === "cliente" ? `con ${input.resourceName}` : null;
  return { label: resourceLabel ? `${base} ${resourceLabel}` : base, resourceLabel };
}

/** Cuánto mira hacia atrás la lectura de lo ocupado: una cita larga que empezó antes del rango. */
const LOOKBACK_MS = 24 * 3_600_000;

type Queryable = Pick<ReturnType<typeof getDb>, "select">;

/**
 * Las citas activas que ocupan a estos recursos (y las que no tienen recurso,
 * que ocupan a todos) en un rango de instantes. `db` puede ser una
 * transacción: la re-validación al reservar lee DENTRO del candado.
 */
export async function getResourceBusy(
  organizationId: string,
  input: {
    fromUtc: Date;
    toUtc: Date;
    bufferMinutes: number;
    excludeBookingId?: string;
    db?: Queryable;
  }
): Promise<BusyBlock[]> {
  const db = input.db ?? getDb();
  const rows = await db
    .select({
      id: schema.booking.id,
      resourceId: schema.booking.resourceId,
      scheduledAt: schema.booking.scheduledAt,
      durationMinutes: schema.booking.durationMinutes,
    })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(
          // Canceladas y no-show liberan el hueco.
          inArray(schema.booking.status, ["agendada", "realizada"]),
          // Sandbox: una cita de prueba no consume la agenda real.
          eq(schema.booking.isTest, false),
          gte(schema.booking.scheduledAt, new Date(input.fromUtc.getTime() - LOOKBACK_MS)),
          lt(schema.booking.scheduledAt, input.toUtc)
        )
      )
    );
  const buffer = Math.max(0, input.bufferMinutes) * 60_000;
  return rows
    .filter((r) => r.id !== input.excludeBookingId)
    .map((r) => ({
      resourceId: r.resourceId,
      startMs: r.scheduledAt.getTime(),
      endMs: r.scheduledAt.getTime() + r.durationMinutes * 60_000 + buffer,
    }));
}

/** Rango de fechas del negocio → instantes UTC [inicio del primero, fin del último). */
export function utcWindow(fromISO: string, toISO: string, tz: string, now: Date) {
  return {
    fromUtc: zonedWallClockToUtc(fromISO, "00:00", tz) ?? new Date(0),
    toUtc:
      zonedWallClockToUtc(addDaysISO(toISO, 1), "00:00", tz) ??
      new Date(now.getTime() + 86_400_000 * 61),
  };
}

/**
 * Los huecos libres de un servicio con estos recursos, etiquetados para el
 * cliente. `resources` en orden de preferencia (ver `computeResourceSlots`).
 */
export async function computeResourceAvailability(
  organizationId: string,
  opts: {
    service: Pick<CatalogService, "id" | "name" | "durationMinutes">;
    resources: Pick<CatalogResource, "id" | "name" | "weeklyHours">[];
    fromISO?: string;
    toISO?: string;
    now?: Date;
    settings?: CalendarSettings;
    excludeBookingId?: string;
    seleccion?: ModoSeleccion;
    db?: Queryable;
  }
): Promise<ResourceSlot[]> {
  if (opts.resources.length === 0) return [];
  const settings = opts.settings ?? (await getSettings(organizationId));
  const now = opts.now ?? new Date();
  const tz = settings.timezone;
  const from = opts.fromISO ?? todayInTz(now, tz);
  const to = opts.toISO ?? addDaysISO(from, settings.maxDaysAhead);

  const busy = await getResourceBusy(organizationId, {
    ...utcWindow(from, to, tz, now),
    bufferMinutes: settings.bufferMinutes,
    excludeBookingId: opts.excludeBookingId,
    db: opts.db,
  });
  const names = new Map(opts.resources.map((r) => [r.id, r.name]));
  const seleccion = opts.seleccion ?? VERTICAL.seleccion;

  return computeResourceSlots({
    settings,
    resources: opts.resources,
    durationMinutes: opts.service.durationMinutes,
    busy,
    fromISO: from,
    toISO: to,
    now,
  }).map((s) => {
    const resourceName = names.get(s.resourceId) ?? "";
    const { label, resourceLabel } = resourceSlotLabel({
      startUtc: s.startUtc,
      timezone: tz,
      now,
      resourceName,
      seleccion,
    });
    return {
      startUtc: s.startUtc,
      endUtc: s.endUtc,
      label,
      resourceId: s.resourceId,
      resourceName,
      serviceId: opts.service.id,
      serviceName: opts.service.name,
      resourceLabel,
    };
  });
}
