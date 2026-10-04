import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { addDaysISO, todayInTz } from "@/lib/time/slots";
import type { ModoSeleccion } from "@/lib/vertical-config";
import type { CatalogResource } from "@/server/agenda/catalog";
import {
  freeSlotsForResource,
  getResourceBusy,
  utcWindow,
} from "@/server/agenda/resource-availability";
import type { CalendarSettings } from "@/server/agenda/settings";

/**
 * 200 — Reservar un instante en la agenda de UN recurso sin que dos reservas
 * se pisen.
 *
 * El índice único por recurso solo ve instantes idénticos. Con duraciones
 * distintas el choque es un SOLAPE (una de 60 min a las 17:00 y una de 45 a las
 * 17:30), y eso no lo expresa un índice. Por eso la re-validación corre dentro
 * de una transacción con `pg_advisory_xact_lock` por (organización, recurso):
 * dos reservas del mismo barbero se forman en fila, la segunda relee lo
 * ocupado ya con la primera escrita, y ve el solape. Barberos distintos no se
 * esperan entre sí.
 */

type BookingRow = typeof schema.booking.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** La llave del candado: estable por organización y recurso. */
export function lockKey(organizationId: string, resourceId: string): string {
  return `vocero:agenda:${organizationId}:${resourceId}`;
}

/**
 * PURA: ¿este instante es un hueco libre de este recurso? Se recalcula el día
 * (±1) con la MISMA función que ofreció, para que "libre" signifique lo mismo
 * al ofrecer y al reservar: horario del recurso, paso, aviso mínimo y lo
 * ocupado.
 */
export function isFreeAt(input: {
  settings: CalendarSettings;
  resource: Pick<CatalogResource, "id" | "weeklyHours">;
  durationMinutes: number;
  busy: Parameters<typeof freeSlotsForResource>[0]["busy"];
  startUtc: string;
  now: Date;
}): boolean {
  const target = Date.parse(input.startUtc);
  if (Number.isNaN(target)) return false;
  const day = todayInTz(new Date(target), input.settings.timezone);
  return freeSlotsForResource({
    settings: input.settings,
    resource: input.resource,
    durationMinutes: input.durationMinutes,
    busy: input.busy,
    fromISO: addDaysISO(day, -1),
    toISO: addDaysISO(day, 1),
    now: input.now,
  }).some((s) => Date.parse(s.startUtc) === target);
}

/**
 * Bajo el candado del recurso: re-valida el instante y, si sigue libre, corre
 * `write` (el INSERT o el UPDATE) en la misma transacción. Devuelve la fila
 * escrita, o null si ese recurso ya no tiene el hueco. Un 23505 (carrera con
 * una cita SIN recurso, que no toma este candado) sale como excepción y quien
 * llama lo traduce.
 */
export async function reserveResourceSlot(input: {
  organizationId: string;
  resource: Pick<CatalogResource, "id" | "weeklyHours">;
  durationMinutes: number;
  startUtc: string;
  settings: CalendarSettings;
  now?: Date;
  excludeBookingId?: string;
  write: (tx: Tx) => Promise<BookingRow>;
}): Promise<BookingRow | null> {
  const now = input.now ?? new Date();
  const tz = input.settings.timezone;
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey(input.organizationId, input.resource.id)}, 0))`
    );
    const day = todayInTz(new Date(input.startUtc), tz);
    const busy = await getResourceBusy(input.organizationId, {
      ...utcWindow(addDaysISO(day, -1), addDaysISO(day, 1), tz, now),
      bufferMinutes: input.settings.bufferMinutes,
      excludeBookingId: input.excludeBookingId,
      db: tx,
    });
    const free = isFreeAt({
      settings: input.settings,
      resource: input.resource,
      durationMinutes: input.durationMinutes,
      busy,
      startUtc: input.startUtc,
      now,
    });
    if (!free) return null;
    return input.write(tx);
  });
}

/**
 * PURA: en qué orden se intenta reservar. El recurso ofrecido (o pedido) va
 * primero; si el sistema asigna ("automatica") y ese se ocupó, cualquier otro
 * que dé el servicio a esa misma hora sirve igual — al cliente no se le
 * prometió una cabina. Cuando el cliente eligió ("cliente") se le dijo "con
 * Luis": otro barbero sería cambiarle la cita sin preguntarle.
 */
export function reservationOrder<T extends { id: string }>(input: {
  requested: T | null;
  eligible: T[];
  seleccion: ModoSeleccion;
  /** El operador eligió a mano: se respeta aunque el sistema asigne. */
  strict?: boolean;
}): T[] {
  if (!input.requested) return input.eligible;
  if (input.strict || input.seleccion === "cliente") return [input.requested];
  return [input.requested, ...input.eligible.filter((r) => r.id !== input.requested!.id)];
}

/**
 * PURA: el título de la reunión en el proveedor (Zoom, Google).
 * - cliente elige: "Corte clásico con Luis · Ana"
 * - sistema asigna: "Masaje 90 min · Cabina 2 · Ana"
 * - sin recurso ni servicio: el de siempre, "Cita — Ana".
 */
export function meetingTopic(input: {
  contactName: string;
  serviceName?: string | null;
  resourceName?: string | null;
  seleccion: ModoSeleccion;
}): string {
  const contacto = input.contactName.trim();
  const servicio = input.serviceName?.trim() || null;
  const recurso = input.resourceName?.trim() || null;
  if (!servicio && !recurso) return contacto ? `Cita — ${contacto}` : "Cita";
  const que = servicio ?? "Cita";
  const cabeza =
    input.seleccion === "cliente" && recurso
      ? `${que} con ${recurso}`
      : [que, recurso].filter(Boolean).join(" · ");
  return contacto ? `${cabeza} · ${contacto}` : cabeza;
}
