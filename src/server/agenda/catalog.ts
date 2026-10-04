import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { formatMoneyCents } from "@/lib/money";
import { normalizarNombre, type VerticalConfig } from "@/lib/vertical-config";
import { normalizeWeeklyHours, type WeeklyHours } from "@/server/agenda/settings";

/**
 * 200 — El catálogo de la agenda por recurso: quién atiende (barberos,
 * cabinas), qué se agenda (servicios, paquetes) y quién ofrece qué.
 *
 * Todo lo que no toca la base es PURO y se prueba solo
 * (tests/unit/agenda-recursos.test.ts): resolver "Luis" o "corte clasico" a su
 * fila, qué recursos pueden dar un servicio, y el conocimiento que se le pasa
 * al agente.
 *
 * "Hay catálogo" = hay al menos un recurso ACTIVO. Sin eso, la agenda es la de
 * siempre (un recurso implícito y `slot_minutes`), exactamente como antes.
 */

export type CatalogResource = {
  id: string;
  name: string;
  /** null = el horario del negocio. */
  weeklyHours: WeeklyHours | null;
  color: string | null;
  active: boolean;
  position: number;
  serviceIds: string[];
};

export type CatalogService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
  description: string | null;
  instructions: string | null;
  active: boolean;
  position: number;
  /** Vacío = lo ofrece cualquier recurso activo. */
  resourceIds: string[];
};

export type Catalog = {
  resources: CatalogResource[];
  services: CatalogService[];
};

export const EMPTY_CATALOG: Catalog = { resources: [], services: [] };

/** ¿Esta organización agenda por recurso? */
export function hasResources(catalog: Catalog): boolean {
  return catalog.resources.some((r) => r.active);
}

/** Lo que "cualquiera" significa para un modelo o una persona. */
const CUALQUIERA = new Set([
  "",
  "cualquiera",
  "cualquier",
  "cualquiera disponible",
  "el que sea",
  "quien sea",
  "indistinto",
  "any",
  "sin preferencia",
]);

/** ¿La referencia pide "cualquiera" (o nada)? */
export function isAnyRef(ref: string | null | undefined): boolean {
  return CUALQUIERA.has(normalizarNombre(ref ?? ""));
}

/** Palabras que no distinguen un nombre de otro ("corte y barba" = "corte + barba"). */
const RELLENO = new Set(["y", "e", "con", "de", "del", "el", "la", "los", "las", "un", "una", "para"]);

/** Las palabras que cuentan de un nombre, sin acentos, signos ni relleno. */
function palabras(texto: string): string[] {
  return normalizarNombre(texto)
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !RELLENO.has(w));
}

/**
 * PURA: resuelve una referencia (id, o nombre sin importar mayúsculas ni
 * acentos) a su fila, en este orden:
 *  1. el id exacto;
 *  2. el nombre exacto;
 *  3. las MISMAS palabras ("corte y barba" → "Corte + barba");
 *  4. el ÚNICO nombre que trae todas las palabras pedidas ("Luis" → "Luis
 *     Pérez", "masaje 90" → "Masaje 90 min").
 * Nunca al revés: "corte y barba" NO es "Barba" aunque la contenga. Si hay más
 * de uno, no adivina: null, y quien llama lista los válidos para corregir.
 */
export function findByRef<T extends { id: string; name: string }>(
  rows: T[],
  ref: string | null | undefined
): T | null {
  const raw = (ref ?? "").trim();
  if (!raw) return null;
  const byId = rows.find((r) => r.id === raw);
  if (byId) return byId;
  const wanted = normalizarNombre(raw);
  if (!wanted) return null;
  const unico = (xs: T[]) => (xs.length === 1 ? xs[0]! : null);

  const exact = rows.filter((r) => normalizarNombre(r.name) === wanted);
  if (exact.length > 0) return unico(exact);

  const pedidas = palabras(raw);
  if (pedidas.length === 0) return null;
  const clave = (ws: string[]) => [...new Set(ws)].sort().join(" ");
  const mismas = rows.filter((r) => clave(palabras(r.name)) === clave(pedidas));
  if (mismas.length > 0) return unico(mismas);

  const contienen = rows.filter((r) => {
    const tiene = new Set(palabras(r.name));
    return pedidas.every((w) => tiene.has(w));
  });
  return unico(contienen);
}

/** ¿Este recurso ofrece este servicio? Un servicio sin vínculos, cualquiera. */
export function offersService(resource: CatalogResource, service: CatalogService): boolean {
  if (service.resourceIds.length === 0) return true;
  return service.resourceIds.includes(resource.id);
}

/** PURA: recursos activos que pueden dar el servicio, en su orden. */
export function eligibleResources(catalog: Catalog, service: CatalogService): CatalogResource[] {
  return catalog.resources
    .filter((r) => r.active && offersService(r, service))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** "$250.00" en la moneda del negocio, o null sin precio. */
export function priceLabel(priceCents: number | null, currency: string): string | null {
  const full = formatMoneyCents(priceCents, currency);
  // "$250.00" se lee mejor "$250" cuando no hay centavos.
  return full ? full.replace(/[.,]00(?=\D*$)/, "") : null;
}

/** "45 min", "1 h", "1 h 30 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * PURA: lo que el agente tiene que saber del catálogo, como bloques de
 * conocimiento (la misma forma que las entradas `block` del knowledge base).
 * Se DERIVA del catálogo en cada lectura: no se guarda, así que nunca se
 * desincroniza de lo que el dueño configuró.
 */
export function catalogKnowledge(
  catalog: Catalog,
  vertical: VerticalConfig,
  currency: string
): string[] {
  const services = catalog.services
    .filter((s) => s.active)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const resources = catalog.resources
    .filter((r) => r.active)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  if (services.length === 0 && resources.length === 0) return [];

  const blocks: string[] = [];
  const servicioPl = vertical.servicio.plural;
  const recursoSg = vertical.recurso.singular.toLowerCase();
  const recursoPl = vertical.recurso.plural.toLowerCase();

  if (services.length > 0) {
    const lines = services.map((s) => {
      const price = priceLabel(s.priceCents, currency);
      const facts = [price, durationLabel(s.durationMinutes)].filter(Boolean).join(" · ");
      const desc = s.description?.trim() ? ` — ${s.description.trim()}` : "";
      return `- ${s.name}: ${facts}${desc}`;
    });
    blocks.push(`${servicioPl} que ofrece el negocio (nombre exacto, precio y duración):\n${lines.join("\n")}`);
  }

  if (vertical.seleccion === "cliente" && resources.length > 0) {
    const lines = resources.map((r) => {
      const offered = services.filter((s) => offersService(r, s)).map((s) => s.name);
      return `- ${r.name}: ${offered.length > 0 ? offered.join(", ") : `(sin ${servicioPl.toLowerCase()} asignados)`}`;
    });
    blocks.push(
      `${vertical.recurso.plural} y qué ${servicioPl.toLowerCase()} hace cada uno:\n${lines.join("\n")}\n` +
        `El cliente puede elegir ${recursoSg} o pedir cualquiera disponible.`
    );
  }

  const withInstructions = services.filter((s) => s.instructions?.trim());
  if (withInstructions.length > 0) {
    const lines = withInstructions.map((s) => `- ${s.name}: ${s.instructions!.trim()}`);
    blocks.push(`Indicaciones antes de la cita (dilas al confirmar):\n${lines.join("\n")}`);
  }

  if (vertical.seleccion === "automatica") {
    blocks.push(
      `Las ${recursoPl} las asigna el sistema automáticamente: no preguntes por ${recursoSg} ni ofrezcas elegirla.`
    );
  }
  return blocks;
}

/** Nombres activos, en orden: lo que se lista cuando algo no se reconoció. */
export function activeNames<T extends { name: string; active: boolean; position: number }>(
  rows: T[]
): string[] {
  return rows
    .filter((r) => r.active)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((r) => r.name);
}

/**
 * El catálogo de la organización. Con `includeInactive: false` (lo del bot)
 * solo lo que se puede ofrecer; el operador ve todo.
 */
export async function loadCatalog(
  organizationId: string,
  opts: { includeInactive?: boolean } = {}
): Promise<Catalog> {
  const db = getDb();
  const [resourceRows, serviceRows, links] = await Promise.all([
    db
      .select()
      .from(schema.agendaResource)
      .where(scoped(schema.agendaResource.organizationId, organizationId))
      .orderBy(asc(schema.agendaResource.position), asc(schema.agendaResource.createdAt)),
    db
      .select()
      .from(schema.agendaService)
      .where(scoped(schema.agendaService.organizationId, organizationId))
      .orderBy(asc(schema.agendaService.position), asc(schema.agendaService.createdAt)),
    db
      .select({
        resourceId: schema.agendaResourceService.resourceId,
        serviceId: schema.agendaResourceService.serviceId,
      })
      .from(schema.agendaResourceService)
      .where(scoped(schema.agendaResourceService.organizationId, organizationId)),
  ]);

  const resources: CatalogResource[] = resourceRows.map((r) => ({
    id: r.id,
    name: r.name,
    weeklyHours: r.weeklyHours === null ? null : normalizeWeeklyHours(r.weeklyHours),
    color: r.color,
    active: r.active,
    position: r.position,
    serviceIds: links.filter((l) => l.resourceId === r.id).map((l) => l.serviceId),
  }));
  const services: CatalogService[] = serviceRows.map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    description: s.description,
    instructions: s.instructions,
    active: s.active,
    position: s.position,
    resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId),
  }));

  if (opts.includeInactive) return { resources, services };
  return offerableCatalog({ resources, services });
}

/**
 * PURA: solo lo que se puede ofrecer. Un servicio que solo daban recursos que
 * ya no están activos NO se ofrece: quitarle los vínculos lo volvería "de
 * cualquiera", y dejarlo lo ofrecería sin nadie que lo dé.
 */
export function offerableCatalog(catalog: Catalog): Catalog {
  const activeResourceIds = new Set(catalog.resources.filter((r) => r.active).map((r) => r.id));
  const services = catalog.services
    .filter((s) => s.active)
    .filter((s) => s.resourceIds.length === 0 || s.resourceIds.some((id) => activeResourceIds.has(id)))
    .map((s) => ({ ...s, resourceIds: s.resourceIds.filter((id) => activeResourceIds.has(id)) }));
  const serviceIds = new Set(services.map((s) => s.id));
  return {
    resources: catalog.resources
      .filter((r) => r.active)
      .map((r) => ({ ...r, serviceIds: r.serviceIds.filter((id) => serviceIds.has(id)) })),
    services,
  };
}

/**
 * PURA — 200: `GET /api/bot/catalog`. Solo lo ofrecible (ya filtrado por
 * `loadCatalog`). `resourceIds` vacío = lo da cualquiera; `serviceIds` de cada
 * recurso ya resuelve esa regla, para que quien consume no tenga que saberla.
 */
export function catalogPayload(catalog: Catalog, vertical: VerticalConfig, currency: string) {
  const services = [...catalog.services].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name)
  );
  const resources = [...catalog.resources].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name)
  );
  return {
    vertical: {
      recurso: vertical.recurso,
      servicio: vertical.servicio,
      seleccion: vertical.seleccion,
      presencial: vertical.cita.presencial,
    },
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
      priceLabel: priceLabel(s.priceCents, currency),
      description: s.description,
      instructions: s.instructions,
      resourceIds: s.resourceIds,
    })),
    resources: resources.map((r) => ({
      id: r.id,
      name: r.name,
      serviceIds: services.filter((s) => offersService(r, s)).map((s) => s.id),
    })),
  };
}

/**
 * PURA — 200: en un negocio presencial, lo que el agente tiene que saber de
 * DÓNDE es la cita. La dirección no se inventa aquí: vive en el conocimiento
 * que el dueño escribió.
 */
export function presencialKnowledge(vertical: VerticalConfig): string[] {
  if (!vertical.cita.presencial) return [];
  return [
    "Las citas de este negocio son EN PERSONA, en su local (la dirección está en este mismo conocimiento; si no aparece, no la inventes: di que el equipo se la confirma). No hay enlace ni videollamada: nunca ofrezcas, prometas ni menciones uno.",
  ];
}
