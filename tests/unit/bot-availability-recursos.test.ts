import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarSettings } from "@/server/agenda/settings";
import type { Catalog } from "@/server/agenda/catalog";

// Las pruebas del motor usan la config de la barbería, sea cual sea el giro
// de esta instancia (vertical.ts cambia entre instalaciones).
vi.mock("@/lib/vertical", async () => await import("./fixtures/vertical-barberia"));

/**
 * 200 — `GET /api/bot/availability` en la agenda POR RECURSO: el servicio es
 * obligatorio, los 422 dicen cuáles son los nombres válidos, cada hueco lleva
 * con quién ("con Luis") y la oferta registra recurso y servicio — que es lo
 * que después reserva `POST /api/bot/bookings`. El motor es el de verdad; solo
 * se sustituyen la BD, la llave y el reloj.
 */

const h = vi.hoisted(() => ({
  replaceOffers: vi.fn(async (..._args: unknown[]) => {}),
  convRows: [{ id: "cv_1", contactId: "ct_1" }] as unknown[],
}));

const SETTINGS: CalendarSettings = {
  weeklyHours: {
    mon: [{ start: "10:00", end: "20:00" }],
    tue: [{ start: "10:00", end: "20:00" }],
    wed: [{ start: "10:00", end: "20:00" }],
    thu: [{ start: "10:00", end: "20:00" }],
    fri: [{ start: "10:00", end: "20:00" }],
    sat: [{ start: "10:00", end: "16:00" }],
  },
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 0,
  maxDaysAhead: 14,
  timezone: "America/Mexico_City",
  connector: "zoom",
  meetingLink: null,
};

const CATALOG: Catalog = {
  resources: [
    { id: "rs_luis", name: "Luis", weeklyHours: null, color: "azul", active: true, position: 0, serviceIds: ["sv_corte", "sv_barba"] },
    { id: "rs_diego", name: "Diego", weeklyHours: null, color: "verde", active: true, position: 1, serviceIds: ["sv_corte"] },
  ],
  services: [
    { id: "sv_corte", name: "Corte clásico", durationMinutes: 45, priceCents: 25_000, description: null, instructions: null, active: true, position: 0, resourceIds: ["rs_luis", "rs_diego"] },
    { id: "sv_barba", name: "Barba", durationMinutes: 30, priceCents: 15_000, description: null, instructions: null, active: true, position: 1, resourceIds: ["rs_luis"] },
  ],
};

// Lunes 28 sep 2026, 09:00 CDMX.
const NOW = new Date("2026-09-28T15:00:00.000Z");

vi.mock("@/server/agenda/flag", () => ({
  agendaEnabled: () => true,
  agendaDisabledResponse: () => new Response(null, { status: 404 }),
}));

vi.mock("@/server/bot/auth", () => ({
  requireBotKey: () => null,
  resolveInstanceOrg: async () => "org_1",
}));

// La conversación sale por `.limit()`; lo ocupado (sin límite) viene vacío.
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const where = () => ({
    limit: async () => h.convRows,
    then: (resolve: (v: unknown) => void) => resolve([]),
  });
  const chain = { select: () => chain, from: () => chain, where };
  return { schema, getDb: () => chain };
});

vi.mock("@/server/agenda/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/agenda/settings")>()),
  getSettings: async () => SETTINGS,
}));

vi.mock("@/server/agenda/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/agenda/catalog")>()),
  loadCatalog: async () => CATALOG,
}));

vi.mock("@/server/agenda/offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/agenda/offers")>()),
  replaceOffers: h.replaceOffers,
}));

let GET: typeof import("@/app/api/bot/availability/route").GET;

beforeAll(async () => {
  ({ GET } = await import("@/app/api/bot/availability/route"));
}, 60_000);

async function pedir(qs: string) {
  const res = await GET(new Request(`http://crm.test/api/bot/availability?${qs}`));
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

type Slot = {
  startUtc: string;
  label: string;
  time: string;
  resource: string;
  resourceLabel: string | null;
  service: string;
};

const oferta = () =>
  (h.replaceOffers.mock.calls[0]?.[2] ?? []) as {
    startUtc: string;
    label: string;
    resourceId?: string;
    serviceId?: string;
  }[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.replaceOffers.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("el servicio es obligatorio y los errores dicen qué sí existe", () => {
  it("sin service → 422 service_required con los servicios", async () => {
    const { status, json } = await pedir("conversationId=cv_1");
    expect(status).toBe(422);
    expect(json).toMatchObject({
      error: { code: "service_required" },
      services: ["Corte clásico", "Barba"],
    });
    expect(h.replaceOffers).not.toHaveBeenCalled();
  });

  it("service desconocido → 422 unknown_service", async () => {
    const { status, json } = await pedir("conversationId=cv_1&service=Tinte");
    expect(status).toBe(422);
    expect(json).toMatchObject({ error: { code: "unknown_service" }, services: ["Corte clásico", "Barba"] });
  });

  it("resource desconocido → 422 unknown_resource con los recursos", async () => {
    const { status, json } = await pedir("conversationId=cv_1&service=corte%20clasico&resource=Pedro");
    expect(status).toBe(422);
    expect(json).toMatchObject({ error: { code: "unknown_resource" }, resources: ["Luis", "Diego"] });
  });

  it("un recurso que no da ese servicio → 422 con quién sí", async () => {
    const { status, json } = await pedir("conversationId=cv_1&service=Barba&resource=Diego");
    expect(status).toBe(422);
    expect(json).toMatchObject({
      error: { code: "resource_not_offering_service" },
      resources: ["Luis"],
    });
  });
});

describe("«Quiero un corte con Luis mañana a las 5»", () => {
  it("los huecos de Luis para ese servicio, dichos con él, y la oferta los recuerda", async () => {
    const { status, json } = await pedir(
      "conversationId=cv_1&service=corte%20cl%C3%A1sico&resource=luis&date=2026-09-29"
    );
    expect(status).toBe(200);
    const slots = json!.slots as Slot[];
    expect(slots.length).toBeGreaterThan(0);
    expect(new Set(slots.map((s) => s.resource))).toEqual(new Set(["Luis"]));
    const cinco = slots.find((s) => s.time === "17:00");
    expect(cinco).toMatchObject({
      label: "mañana martes 29 a las 5:00 pm con Luis",
      resourceLabel: "con Luis",
      service: "Corte clásico",
    });
    expect(json!.query).toMatchObject({ date: "2026-09-29", status: "available" });
    expect(json!.service).toMatchObject({ name: "Corte clásico", durationMinutes: 45 });
    expect(json!.resource).toBe("Luis");
    expect(json!.seleccion).toBe("cliente");

    // Lo que se registró es lo que después se reserva: con quién y qué.
    const registrada = oferta().find((o) => o.startUtc === cinco!.startUtc);
    expect(registrada).toMatchObject({ resourceId: "rs_luis", serviceId: "sv_corte" });
    // Un corte de 45 min a las 19:30 no cabe antes de las 20:00.
    expect(slots.map((s) => s.time)).not.toContain("19:30");
    expect(slots.map((s) => s.time)).toContain("19:00");
  });

  it("sin barbero (o 'cualquiera') asigna el primero libre por posición", async () => {
    for (const qs of ["", "&resource=cualquiera"]) {
      h.replaceOffers.mockClear();
      const { status, json } = await pedir(`conversationId=cv_1&service=Corte%20cl%C3%A1sico${qs}`);
      expect(status).toBe(200);
      const slots = json!.slots as Slot[];
      expect(slots[0]).toMatchObject({ resource: "Luis", resourceLabel: "con Luis" });
      expect(json!.resource).toBeNull();
      expect(oferta()[0]).toMatchObject({ resourceId: "rs_luis", serviceId: "sv_corte" });
    }
  });

  it("un día cerrado se dice 'closed' y no borra la oferta vigente", async () => {
    const { status, json } = await pedir("conversationId=cv_1&service=Barba&date=2026-10-04");
    expect(status).toBe(200);
    expect(json!.slots).toEqual([]);
    expect(json!.query).toMatchObject({ date: "2026-10-04", status: "closed" });
    expect(h.replaceOffers).not.toHaveBeenCalled();
  });
});
