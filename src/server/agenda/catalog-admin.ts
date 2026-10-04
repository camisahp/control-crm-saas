import { eq, inArray, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { isResourceColor } from "@/lib/resource-colors";
import { normalizarNombre } from "@/lib/vertical-config";
import { publish } from "@/server/events/bus";
import { loadCatalog, type CatalogResource, type CatalogService } from "@/server/agenda/catalog";
import { normalizeWeeklyHours } from "@/server/agenda/settings";

/**
 * 200 — Alta, cambio y baja del catálogo (recursos, servicios y quién da qué),
 * para las rutas del operador `/api/agenda/*` y los scripts de siembra que las
 * llaman.
 *
 * Borrar algo que ya tiene citas NO lo borra: lo DESACTIVA. Las citas son
 * historia y conservan con quién y qué fueron; un recurso inactivo deja de
 * ofrecerse. Sin citas, se borra de verdad (y sus vínculos y ofertas con él).
 *
 * Los nombres activos no se repiten (sin mayúsculas ni acentos): "Luis" tiene
 * que significar una sola persona cuando el cliente lo pide.
 */

export class CatalogError extends Error {
  constructor(
    readonly code: "not_found" | "duplicate_name" | "invalid_body",
    readonly status: 404 | 409 | 422,
    message: string
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

export type ResourceInput = {
  name?: string;
  color?: string | null;
  /** null = el horario del negocio. */
  weeklyHours?: unknown;
  active?: boolean;
  position?: number;
  /** Reemplaza el conjunto completo de servicios que da. */
  serviceIds?: string[];
};

export type ServiceInput = {
  name?: string;
  durationMinutes?: number;
  priceCents?: number | null;
  description?: string | null;
  instructions?: string | null;
  active?: boolean;
  position?: number;
  /** Reemplaza el conjunto completo de recursos que lo dan. Vacío = cualquiera. */
  resourceIds?: string[];
};

function limpio(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  return t.length > 0 ? t : null;
}

function notifyChange(organizationId: string) {
  // La pantalla de Citas pinta nombres y colores: que se refresque.
  publish(organizationId, { type: "booking.updated", data: { bookingId: "" } });
}

async function assertUniqueName(
  organizationId: string,
  kind: "resource" | "service",
  name: string,
  exceptId?: string
) {
  const catalog = await loadCatalog(organizationId, { includeInactive: true });
  const rows: { id: string; name: string; active: boolean }[] =
    kind === "resource" ? catalog.resources : catalog.services;
  const wanted = normalizarNombre(name);
  const clash = rows.find((r) => r.active && r.id !== exceptId && normalizarNombre(r.name) === wanted);
  if (clash) {
    throw new CatalogError("duplicate_name", 409, `Ya existe "${clash.name}"`);
  }
}

async function nextPosition(organizationId: string, kind: "resource" | "service"): Promise<number> {
  const db = getDb();
  const table = kind === "resource" ? schema.agendaResource : schema.agendaService;
  const rows = await db
    .select({ top: max(table.position) })
    .from(table)
    .where(scoped(table.organizationId, organizationId));
  return (rows[0]?.top ?? -1) + 1;
}

async function assertOwnIds(
  organizationId: string,
  kind: "resource" | "service",
  ids: string[]
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const table = kind === "resource" ? schema.agendaResource : schema.agendaService;
  const rows = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(scoped(table.organizationId, organizationId, inArray(table.id, unique)));
  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new CatalogError("invalid_body", 422, `No existen: ${missing.join(", ")}`);
  }
  return unique;
}

function resourceValues(input: ResourceInput) {
  if (input.color !== undefined && input.color !== null && !isResourceColor(input.color)) {
    throw new CatalogError("invalid_body", 422, `Color desconocido: ${input.color}`);
  }
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.weeklyHours !== undefined
      ? { weeklyHours: input.weeklyHours === null ? null : normalizeWeeklyHours(input.weeklyHours) }
      : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
  };
}

function serviceValues(input: ServiceInput) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
    ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
    ...(input.description !== undefined ? { description: limpio(input.description) } : {}),
    ...(input.instructions !== undefined ? { instructions: limpio(input.instructions) } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
  };
}

async function findResource(organizationId: string, id: string): Promise<CatalogResource> {
  const catalog = await loadCatalog(organizationId, { includeInactive: true });
  const found = catalog.resources.find((r) => r.id === id);
  if (!found) throw new CatalogError("not_found", 404, "No existe");
  return found;
}

async function findService(organizationId: string, id: string): Promise<CatalogService> {
  const catalog = await loadCatalog(organizationId, { includeInactive: true });
  const found = catalog.services.find((s) => s.id === id);
  if (!found) throw new CatalogError("not_found", 404, "No existe");
  return found;
}

/** Reemplaza los vínculos de un lado (los del recurso o los del servicio). */
async function replaceLinks(
  organizationId: string,
  side: { resourceId: string } | { serviceId: string },
  otherIds: string[]
) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const where =
      "resourceId" in side
        ? eq(schema.agendaResourceService.resourceId, side.resourceId)
        : eq(schema.agendaResourceService.serviceId, side.serviceId);
    await tx
      .delete(schema.agendaResourceService)
      .where(scoped(schema.agendaResourceService.organizationId, organizationId, where));
    if (otherIds.length === 0) return;
    await tx.insert(schema.agendaResourceService).values(
      otherIds.map((other) =>
        "resourceId" in side
          ? { organizationId, resourceId: side.resourceId, serviceId: other }
          : { organizationId, resourceId: other, serviceId: side.serviceId }
      )
    );
  });
}

export async function createResource(
  organizationId: string,
  input: ResourceInput & { name: string }
): Promise<CatalogResource> {
  await assertUniqueName(organizationId, "resource", input.name);
  const serviceIds = input.serviceIds
    ? await assertOwnIds(organizationId, "service", input.serviceIds)
    : [];
  const id = newId("agendaResource");
  const values = resourceValues(input);
  await getDb()
    .insert(schema.agendaResource)
    .values({
      id,
      organizationId,
      name: input.name.trim(),
      weeklyHours: null,
      color: null,
      ...values,
      position: input.position ?? (await nextPosition(organizationId, "resource")),
    });
  if (serviceIds.length > 0) await replaceLinks(organizationId, { resourceId: id }, serviceIds);
  notifyChange(organizationId);
  return findResource(organizationId, id);
}

export async function updateResource(
  organizationId: string,
  id: string,
  input: ResourceInput
): Promise<CatalogResource> {
  const current = await findResource(organizationId, id);
  const becomesActive = input.active ?? current.active;
  if (becomesActive && (input.name !== undefined || input.active === true)) {
    await assertUniqueName(organizationId, "resource", input.name ?? current.name, id);
  }
  const values = resourceValues(input);
  if (Object.keys(values).length > 0) {
    await getDb()
      .update(schema.agendaResource)
      .set({ ...values, updatedAt: new Date() })
      .where(scoped(schema.agendaResource.organizationId, organizationId, eq(schema.agendaResource.id, id)));
  }
  if (input.serviceIds) {
    const ids = await assertOwnIds(organizationId, "service", input.serviceIds);
    await replaceLinks(organizationId, { resourceId: id }, ids);
  }
  notifyChange(organizationId);
  return findResource(organizationId, id);
}

export async function deleteResource(
  organizationId: string,
  id: string
): Promise<{ deleted: boolean; deactivated: boolean }> {
  await findResource(organizationId, id);
  const db = getDb();
  const used = await db
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(scoped(schema.booking.organizationId, organizationId, eq(schema.booking.resourceId, id)))
    .limit(1);
  if (used.length > 0) {
    await db
      .update(schema.agendaResource)
      .set({ active: false, updatedAt: new Date() })
      .where(scoped(schema.agendaResource.organizationId, organizationId, eq(schema.agendaResource.id, id)));
    notifyChange(organizationId);
    return { deleted: false, deactivated: true };
  }
  await db
    .delete(schema.agendaResource)
    .where(scoped(schema.agendaResource.organizationId, organizationId, eq(schema.agendaResource.id, id)));
  notifyChange(organizationId);
  return { deleted: true, deactivated: false };
}

export async function createService(
  organizationId: string,
  input: ServiceInput & { name: string; durationMinutes: number }
): Promise<CatalogService> {
  await assertUniqueName(organizationId, "service", input.name);
  const resourceIds = input.resourceIds
    ? await assertOwnIds(organizationId, "resource", input.resourceIds)
    : [];
  const id = newId("agendaService");
  await getDb()
    .insert(schema.agendaService)
    .values({
      id,
      organizationId,
      name: input.name.trim(),
      durationMinutes: input.durationMinutes,
      ...serviceValues(input),
      position: input.position ?? (await nextPosition(organizationId, "service")),
    });
  if (resourceIds.length > 0) await replaceLinks(organizationId, { serviceId: id }, resourceIds);
  notifyChange(organizationId);
  return findService(organizationId, id);
}

export async function updateService(
  organizationId: string,
  id: string,
  input: ServiceInput
): Promise<CatalogService> {
  const current = await findService(organizationId, id);
  const becomesActive = input.active ?? current.active;
  if (becomesActive && (input.name !== undefined || input.active === true)) {
    await assertUniqueName(organizationId, "service", input.name ?? current.name, id);
  }
  const values = serviceValues(input);
  if (Object.keys(values).length > 0) {
    await getDb()
      .update(schema.agendaService)
      .set({ ...values, updatedAt: new Date() })
      .where(scoped(schema.agendaService.organizationId, organizationId, eq(schema.agendaService.id, id)));
  }
  if (input.resourceIds) {
    const ids = await assertOwnIds(organizationId, "resource", input.resourceIds);
    await replaceLinks(organizationId, { serviceId: id }, ids);
  }
  notifyChange(organizationId);
  return findService(organizationId, id);
}

export async function deleteService(
  organizationId: string,
  id: string
): Promise<{ deleted: boolean; deactivated: boolean }> {
  await findService(organizationId, id);
  const db = getDb();
  const used = await db
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(scoped(schema.booking.organizationId, organizationId, eq(schema.booking.serviceId, id)))
    .limit(1);
  if (used.length > 0) {
    await db
      .update(schema.agendaService)
      .set({ active: false, updatedAt: new Date() })
      .where(scoped(schema.agendaService.organizationId, organizationId, eq(schema.agendaService.id, id)));
    notifyChange(organizationId);
    return { deleted: false, deactivated: true };
  }
  await db
    .delete(schema.agendaService)
    .where(scoped(schema.agendaService.organizationId, organizationId, eq(schema.agendaService.id, id)));
  notifyChange(organizationId);
  return { deleted: true, deactivated: false };
}

/** La traducción a HTTP, igual para las cuatro rutas. */
export function catalogErrorResponse(err: unknown): Response {
  if (!(err instanceof CatalogError)) throw err;
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}
