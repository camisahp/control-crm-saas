import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { StageChangeSource } from "@/lib/types";
import { normalizarNombre, regresoDias } from "@/lib/vertical-config";
import { VERTICAL } from "@/lib/vertical";
import { agendaEnabled } from "@/server/agenda/flag";
import { moveLeadToStage } from "@/server/leads/stage-history";

/**
 * 200 — La agenda mueve el tablero según el giro (`VERTICAL.etapas`):
 *
 * - consultar horarios de un servicio → `servicioElegido` (solo hacia adelante)
 * - crear la cita → `citaAgendada`
 * - marcarla realizada → `citaRealizada`
 * - N días después de la última realizada → `regreso` (trabajo periódico)
 *
 * Todo pasa por `moveLeadToStage`, la ÚNICA puerta que escribe la etapa (un
 * test de vigilancia lo exige): mover y registrar en la bitácora son la misma
 * operación. Las etapas se buscan por NOMBRE sin importar mayúsculas ni
 * acentos; si el dueño renombró o borró una, esa automatización simplemente
 * no hace nada.
 */

export type EtapaFila = { id: string; name: string; position: number; kind: "open" | "won" | "lost" };

/** PURA: la etapa con ese nombre (sin mayúsculas ni acentos), o null. */
export function etapaPorNombre(etapas: EtapaFila[], nombre: string | null | undefined): EtapaFila | null {
  if (!nombre) return null;
  const buscado = normalizarNombre(nombre);
  return etapas.find((e) => normalizarNombre(e.name) === buscado) ?? null;
}

/**
 * PURA: ¿mover de `actual` a `destino` es avanzar? Solo desde una etapa
 * abierta y hacia una posición posterior: quien ya reservó o ya asistió no
 * regresa a "Paquete elegido" por volver a preguntar horarios.
 */
export function esAvance(etapas: EtapaFila[], actualId: string, destino: EtapaFila): boolean {
  const actual = etapas.find((e) => e.id === actualId);
  if (!actual) return true;
  return actual.kind === "open" && destino.position > actual.position;
}

export type ResultadoMovimiento = "moved" | "unchanged" | "no_lead" | "stage_not_found" | "not_forward";

async function leerEtapas(organizationId: string): Promise<EtapaFila[]> {
  return getDb()
    .select({
      id: schema.pipelineStage.id,
      name: schema.pipelineStage.name,
      position: schema.pipelineStage.position,
      kind: schema.pipelineStage.kind,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
}

/** Mueve el lead de un contacto a la etapa nombrada. */
export async function moverContactoAEtapa(
  organizationId: string,
  contactId: string,
  nombreEtapa: string,
  opts: { source: StageChangeSource; soloAvanzar?: boolean }
): Promise<ResultadoMovimiento> {
  const db = getDb();
  const leads = await db
    .select({ id: schema.lead.id, stageId: schema.lead.stageId })
    .from(schema.lead)
    .where(
      scoped(schema.lead.organizationId, organizationId, eq(schema.lead.contactId, contactId))
    )
    .limit(1);
  const lead = leads[0];
  if (!lead) return "no_lead";

  const etapas = await leerEtapas(organizationId);
  const destino = etapaPorNombre(etapas, nombreEtapa);
  if (!destino) return "stage_not_found";
  if (lead.stageId === destino.id) return "unchanged";
  if (opts.soloAvanzar && !esAvance(etapas, lead.stageId, destino)) return "not_forward";

  const res = await moveLeadToStage({
    organizationId,
    leadId: lead.id,
    toStageId: destino.id,
    source: opts.source,
    // Si alguien nombró "perdido" una etapa de estas, el motivo no se inventa
    // pero tampoco puede faltar: se registra lo que pasó.
    lossReason: destino.kind === "lost" ? "otro" : null,
    lossNote: destino.kind === "lost" ? "Movido por la agenda" : null,
    extra: { lastActivityAt: new Date() },
  });
  return res.ok ? (res.changed ? "moved" : "unchanged") : "no_lead";
}

/** Consultar horarios de un servicio (el lead ya eligió qué quiere). Best-effort. */
export async function alElegirServicio(organizationId: string, contactId: string): Promise<void> {
  const etapa = VERTICAL.etapas.servicioElegido;
  if (!etapa) return;
  await moverContactoAEtapa(organizationId, contactId, etapa, {
    source: "bot",
    soloAvanzar: true,
  }).catch((err) => console.warn(`[agenda] etapa "${etapa}" al elegir servicio falló: ${err}`));
}

/** La cita se marcó como realizada. Best-effort. */
export async function alRealizarCita(organizationId: string, contactId: string): Promise<void> {
  const etapa = VERTICAL.etapas.citaRealizada;
  if (!etapa) return;
  await moverContactoAEtapa(organizationId, contactId, etapa, { source: "dueno" }).catch((err) =>
    console.warn(`[agenda] etapa "${etapa}" al realizar la cita falló: ${err}`)
  );
}

/* ------------------------------------------------------------------ */
/* Regreso: "Vuelve en 3 semanas"                                      */
/* ------------------------------------------------------------------ */

const DIA_MS = 86_400_000;

/**
 * Mueve a la etapa de regreso a los leads que siguen en `citaRealizada` y cuya
 * última cita realizada tiene al menos `dias` días — y que no tienen ya otra
 * cita por delante. Devuelve cuántos movió.
 */
export async function ejecutarRegreso(
  organizationId: string,
  opts: { now?: Date; dias?: number } = {}
): Promise<number> {
  const regreso = VERTICAL.etapas.regreso;
  const dias = opts.dias ?? regresoDias(VERTICAL, process.env.REGRESO_DIAS);
  if (!regreso || dias === null) return 0;

  const etapas = await leerEtapas(organizationId);
  const desde = etapaPorNombre(etapas, VERTICAL.etapas.citaRealizada);
  const hacia = etapaPorNombre(etapas, regreso.etapa);
  if (!desde || !hacia || desde.id === hacia.id) return 0;

  const now = opts.now ?? new Date();
  const corte = new Date(now.getTime() - dias * DIA_MS).toISOString();
  const ahora = now.toISOString();

  const db = getDb();
  const candidatos = await db
    .select({ leadId: schema.lead.id })
    .from(schema.lead)
    .innerJoin(
      schema.booking,
      and(
        eq(schema.booking.contactId, schema.lead.contactId),
        eq(schema.booking.organizationId, schema.lead.organizationId)
      )
    )
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        eq(schema.lead.stageId, desde.id),
        eq(schema.booking.status, "realizada"),
        eq(schema.booking.kind, "session"),
        eq(schema.booking.isTest, false),
        // Quien ya tiene su siguiente cita no "vuelve": ya volvió.
        sql`not exists (select 1 from ${schema.booking} b2 where b2.contact_id = ${schema.lead.contactId} and b2.organization_id = ${schema.lead.organizationId} and b2.kind = 'session' and b2.status = 'agendada' and b2.is_test = false and b2.scheduled_at >= ${ahora}::timestamp)`
      )
    )
    .groupBy(schema.lead.id)
    .having(sql`max(${schema.booking.scheduledAt}) <= ${corte}::timestamp`);

  let movidos = 0;
  for (const c of candidatos) {
    const res = await moveLeadToStage({
      organizationId,
      leadId: c.leadId,
      toStageId: hacia.id,
      source: "sistema",
      extra: { lastActivityAt: now },
    }).catch((err) => {
      console.warn(`[agenda] regreso del lead ${c.leadId} falló: ${err}`);
      return null;
    });
    if (res?.ok && res.changed) movidos += 1;
  }
  return movidos;
}

/** El regreso para TODAS las organizaciones de la instancia. */
export async function ejecutarRegresoGlobal(now = new Date()): Promise<number> {
  const orgs = await getDb().select({ id: schema.organization.id }).from(schema.organization);
  let total = 0;
  for (const o of orgs) {
    total += await ejecutarRegreso(o.id, { now }).catch((err) => {
      console.warn(`[agenda] regreso de la organización ${o.id} falló: ${err}`);
      return 0;
    });
  }
  return total;
}

/** Cada cuánto corre el regreso. Una hora basta: la regla se mide en días. */
export const REGRESO_INTERVALO_MS = 60 * 60_000;
/** La primera pasada, un poco después de arrancar (las migraciones ya corrieron). */
const REGRESO_PRIMERA_MS = 60_000;

const globalForJobs = globalThis as unknown as { __voceroRegreso?: ReturnType<typeof setInterval> };

/**
 * Arranca el trabajo periódico del regreso, in-process como todo el trabajo en
 * segundo plano de Vocero (sin colas externas). Una sola vez por proceso; no
 * hace nada con la agenda apagada o si el giro no tiene regreso. Los timers no
 * retienen el proceso (`unref`).
 */
export function iniciarTrabajoDeRegreso(): boolean {
  if (!agendaEnabled()) return false;
  if (regresoDias(VERTICAL, process.env.REGRESO_DIAS) === null) return false;
  if (globalForJobs.__voceroRegreso) return true;

  const correr = () => {
    void ejecutarRegresoGlobal()
      .then((n) => {
        if (n > 0) console.log(`[agenda] regreso: ${n} lead(s) movido(s) a "${VERTICAL.etapas.regreso?.etapa}"`);
      })
      .catch((err) => console.warn(`[agenda] el trabajo de regreso falló: ${err}`));
  };
  const primera = setTimeout(correr, REGRESO_PRIMERA_MS);
  primera.unref?.();
  const intervalo = setInterval(correr, REGRESO_INTERVALO_MS);
  intervalo.unref?.();
  globalForJobs.__voceroRegreso = intervalo;
  return true;
}
