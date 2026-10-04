import { describe, expect, it, vi } from "vitest";
import {
  activeNames,
  catalogKnowledge,
  durationLabel,
  eligibleResources,
  findByRef,
  hasResources,
  isAnyRef,
  offerableCatalog,
  priceLabel,
  type Catalog,
  type CatalogResource,
  type CatalogService,
} from "@/server/agenda/catalog";
import {
  collides,
  computeResourceSlots,
  countDayCandidates,
  expandDayForDuration,
  freeSlotsForResource,
  resourceSlotLabel,
  type BusyBlock,
} from "@/server/agenda/resource-availability";
import { isFreeAt, meetingTopic, reservationOrder } from "@/server/agenda/resource-booking";
import { esAvance, etapaPorNombre, type EtapaFila } from "@/server/agenda/etapas";
import { DEFAULT_CALENDAR_SETTINGS, type CalendarSettings } from "@/server/agenda/settings";
import { naturalLabelInTz } from "@/lib/time/slots";
import {
  mismoNombre,
  normalizarNombre,
  regresoDias,
  tituloCatalogo,
  type VerticalConfig,
} from "@/lib/vertical-config";
import { VERTICAL } from "@/lib/vertical";

// Las pruebas del motor usan la config de la barbería, sea cual sea el giro
// de esta instancia (vertical.ts cambia entre instalaciones).
vi.mock("@/lib/vertical", async () => await import("./fixtures/vertical-barberia"));

/**
 * 200 — Agenda por recurso: el motor puro. Sin BD ni reloj real, igual que
 * tests/unit/availability.test.ts. Lunes 28 sep 2026 en CDMX (UTC-6 todo el
 * año): las 17:00 locales son las 23:00Z.
 */

const MX = "America/Mexico_City";

function settings(over: Partial<CalendarSettings> = {}): CalendarSettings {
  return {
    ...DEFAULT_CALENDAR_SETTINGS,
    weeklyHours: {
      mon: [{ start: "10:00", end: "20:00" }],
      tue: [{ start: "10:00", end: "20:00" }],
    },
    slotMinutes: 30,
    minNoticeHours: 0,
    timezone: MX,
    ...over,
  };
}

function resource(over: Partial<CatalogResource> & { id: string; name: string }): CatalogResource {
  return { weeklyHours: null, color: null, active: true, position: 0, serviceIds: [], ...over };
}

function service(over: Partial<CatalogService> & { id: string; name: string }): CatalogService {
  return {
    durationMinutes: 45,
    priceCents: null,
    description: null,
    instructions: null,
    active: true,
    position: 0,
    resourceIds: [],
    ...over,
  };
}

const LUIS = resource({ id: "rs_luis", name: "Luis", position: 0 });
const DIEGO = resource({ id: "rs_diego", name: "Diego", position: 1 });
const MARCO = resource({ id: "rs_marco", name: "Marco", position: 2, active: false });

const CORTE = service({
  id: "sv_corte",
  name: "Corte clásico",
  durationMinutes: 45,
  priceCents: 25_000,
  resourceIds: ["rs_luis", "rs_diego"],
});
const BARBA = service({
  id: "sv_barba",
  name: "Barba",
  durationMinutes: 30,
  priceCents: 15_000,
  position: 1,
  resourceIds: ["rs_luis"],
});
const NINO = service({ id: "sv_nino", name: "Corte niño", durationMinutes: 30, priceCents: 18_000, position: 2 });

const CATALOG: Catalog = { resources: [LUIS, DIEGO, MARCO], services: [CORTE, BARBA, NINO] };

// Lunes 28 sep 2026, 09:00 CDMX.
const NOW = new Date("2026-09-28T15:00:00.000Z");
const MARTES = "2026-09-29";
const at = (local: string) => {
  // "17:00" del martes 29 en CDMX → ISO UTC.
  const [h, m] = local.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(2026, 8, 29, h + 6, m)).toISOString();
};
const busy = (resourceId: string | null, localStart: string, minutes: number): BusyBlock => ({
  resourceId,
  startMs: Date.parse(at(localStart)),
  endMs: Date.parse(at(localStart)) + minutes * 60_000,
});

describe("nombres: sin mayúsculas ni acentos", () => {
  it("normaliza y compara", () => {
    expect(normalizarNombre("  ASISTIÓ  ")).toBe("asistio");
    expect(mismoNombre("Corte Clasico", "corte clásico")).toBe(true);
    expect(mismoNombre("Luis", "Diego")).toBe(false);
  });

  it("findByRef: id, nombre exacto y el único parcial; nunca adivina entre varios", () => {
    expect(findByRef(CATALOG.resources, "rs_diego")?.name).toBe("Diego");
    expect(findByRef(CATALOG.resources, "luís")?.id).toBe("rs_luis");
    expect(findByRef(CATALOG.services, "corte clasico")?.id).toBe("sv_corte");
    expect(findByRef(CATALOG.services, "barba")?.id).toBe("sv_barba");
    // "corte" está en "Corte clásico" y en "Corte niño": ambiguo ⇒ null.
    expect(findByRef(CATALOG.services, "corte")).toBeNull();
    expect(findByRef([resource({ id: "x", name: "Luis Pérez" })], "Luis")?.id).toBe("x");
    expect(findByRef(CATALOG.resources, "Pedro")).toBeNull();
    expect(findByRef(CATALOG.resources, "")).toBeNull();
  });

  it("por palabras: 'corte y barba' es 'Corte + barba', nunca 'Barba'", () => {
    const servicios = [
      ...CATALOG.services,
      service({ id: "sv_cb", name: "Corte + barba", durationMinutes: 60 }),
    ];
    expect(findByRef(servicios, "corte y barba")?.id).toBe("sv_cb");
    // "+" en una URL llega como espacio: "Corte   barba".
    expect(findByRef(servicios, "Corte   barba")?.id).toBe("sv_cb");
    expect(findByRef(servicios, "Barba")?.id).toBe("sv_barba");
    expect(findByRef(servicios, "corte niño")?.id).toBe("sv_nino");
    expect(findByRef([service({ id: "sv_m", name: "Masaje 90 min" })], "masaje 90")?.id).toBe("sv_m");
    // Una palabra que no está en ningún nombre no se acomoda en otro.
    expect(findByRef(servicios, "corte con tinte")).toBeNull();
  });

  it("'cualquiera' (o nada) no es un recurso: es no tener preferencia", () => {
    expect(isAnyRef("Cualquiera")).toBe(true);
    expect(isAnyRef("")).toBe(true);
    expect(isAnyRef(null)).toBe(true);
    expect(isAnyRef("Luis")).toBe(false);
  });
});

describe("quién da qué", () => {
  it("un servicio con vínculos solo lo dan esos; sin vínculos, cualquiera activo", () => {
    expect(eligibleResources(CATALOG, BARBA).map((r) => r.id)).toEqual(["rs_luis"]);
    expect(eligibleResources(CATALOG, CORTE).map((r) => r.id)).toEqual(["rs_luis", "rs_diego"]);
    // Marco está inactivo: no aparece aunque el servicio sea "de cualquiera".
    expect(eligibleResources(CATALOG, NINO).map((r) => r.id)).toEqual(["rs_luis", "rs_diego"]);
  });

  it("hay catálogo con al menos un recurso ACTIVO", () => {
    expect(hasResources(CATALOG)).toBe(true);
    expect(hasResources({ resources: [MARCO], services: [CORTE] })).toBe(false);
    expect(hasResources({ resources: [], services: [CORTE] })).toBe(false);
  });

  it("lo ofrecible: un servicio que solo daba alguien inactivo NO se vuelve de cualquiera", () => {
    const soloMarco = service({ id: "sv_tinte", name: "Tinte", resourceIds: ["rs_marco"] });
    const out = offerableCatalog({ resources: [LUIS, MARCO], services: [soloMarco, NINO] });
    expect(out.services.map((s) => s.id)).toEqual(["sv_nino"]);
    expect(out.resources.map((r) => r.id)).toEqual(["rs_luis"]);
  });

  it("activeNames lista los válidos en orden", () => {
    expect(activeNames(CATALOG.resources)).toEqual(["Luis", "Diego"]);
  });
});

describe("huecos por duración del servicio", () => {
  it("el paso es slot_minutes y la cita tiene que CABER entera en la franja", () => {
    const slots = expandDayForDuration(MARTES, [{ start: "10:00", end: "11:30" }], MX, 45, 30);
    // 10:00, 10:30 caben (terminan 10:45 y 11:15); 11:00 terminaría 11:45: no.
    expect(slots.map((s) => s.startUtc)).toEqual([at("10:00"), at("10:30")]);
    expect(slots[0]!.endUtc).toBe(at("10:45"));
  });

  it("una cita de 60 min a las 17:00 impide un corte de 45 a las 17:30 (solape, no mismo instante)", () => {
    const free = freeSlotsForResource({
      settings: settings(),
      resource: LUIS,
      durationMinutes: 45,
      busy: [busy("rs_luis", "17:00", 60)],
      fromISO: MARTES,
      toISO: MARTES,
      now: NOW,
    }).map((s) => s.startUtc);
    expect(free).not.toContain(at("17:00"));
    expect(free).not.toContain(at("17:30"));
    // 16:30 + 45 = 17:15 > 17:00 también choca; 16:00 + 45 = 16:45 no.
    expect(free).not.toContain(at("16:30"));
    expect(free).toContain(at("16:00"));
    expect(free).toContain(at("18:00"));
  });

  it("la cita de OTRO barbero no ocupa a este; un bloqueo sin recurso ocupa a todos", () => {
    const base = { settings: settings(), durationMinutes: 45, fromISO: MARTES, toISO: MARTES, now: NOW };
    const conDiego = freeSlotsForResource({ ...base, resource: LUIS, busy: [busy("rs_diego", "17:00", 60)] });
    expect(conDiego.map((s) => s.startUtc)).toContain(at("17:00"));
    const comida = freeSlotsForResource({ ...base, resource: LUIS, busy: [busy(null, "14:00", 60)] });
    expect(comida.map((s) => s.startUtc)).not.toContain(at("14:00"));
    expect(comida.map((s) => s.startUtc)).not.toContain(at("13:30"));
  });

  it("el respiro separa las citas en los dos sentidos", () => {
    const slot = { startUtc: at("18:00"), endUtc: at("18:45") };
    // Cita de 17:00 a 17:50 + 15 de respiro = libre desde 18:05: las 18:00 chocan.
    expect(collides(slot, 15, [{ ...busy("rs_luis", "17:00", 50), endMs: Date.parse(at("18:05")) }])).toBe(true);
    // A las 18:45 + 15 = 19:00, justo cuando empieza la siguiente: no choca.
    expect(collides(slot, 15, [busy("rs_luis", "19:00", 30)])).toBe(false);
    expect(collides(slot, 16, [busy("rs_luis", "19:00", 30)])).toBe(true);
  });

  it("cada recurso con su horario; sin horario propio, el del negocio", () => {
    const tarde = resource({ id: "rs_t", name: "Tarde", weeklyHours: { tue: [{ start: "16:00", end: "18:00" }] } });
    const free = freeSlotsForResource({
      settings: settings(),
      resource: tarde,
      durationMinutes: 60,
      busy: [],
      fromISO: MARTES,
      toISO: MARTES,
      now: NOW,
    });
    expect(free.map((s) => s.startUtc)).toEqual([at("16:00"), at("16:30"), at("17:00")]);
  });

  it("respeta el aviso mínimo", () => {
    const hoy = freeSlotsForResource({
      settings: settings({ minNoticeHours: 2 }),
      resource: LUIS,
      durationMinutes: 30,
      busy: [],
      fromISO: "2026-09-28",
      toISO: "2026-09-28",
      now: NOW, // 09:00 local ⇒ desde las 11:00
    });
    expect(hoy[0]!.startUtc).toBe("2026-09-28T17:00:00.000Z");
  });
});

describe("asignación: un recurso por instante", () => {
  it("gana el primero libre por posición; si está ocupado, el siguiente", () => {
    const slots = computeResourceSlots({
      settings: settings(),
      resources: [LUIS, DIEGO],
      durationMinutes: 45,
      busy: [busy("rs_luis", "17:00", 45)],
      fromISO: MARTES,
      toISO: MARTES,
      now: NOW,
    });
    const at17 = slots.find((s) => s.startUtc === at("17:00"));
    const at12 = slots.find((s) => s.startUtc === at("12:00"));
    expect(at17?.resourceId).toBe("rs_diego");
    expect(at12?.resourceId).toBe("rs_luis");
    // Un solo hueco por instante, en orden.
    const inicios = slots.map((s) => s.startUtc);
    expect(new Set(inicios).size).toBe(inicios.length);
    expect([...inicios].sort()).toEqual(inicios);
  });

  it("con los dos ocupados a las 17:00, ese instante no se ofrece", () => {
    const slots = computeResourceSlots({
      settings: settings(),
      resources: [LUIS, DIEGO],
      durationMinutes: 45,
      busy: [busy("rs_luis", "17:00", 45), busy("rs_diego", "16:30", 90)],
      fromISO: MARTES,
      toISO: MARTES,
      now: NOW,
    });
    expect(slots.map((s) => s.startUtc)).not.toContain(at("17:00"));
  });

  it("cerrado vs lleno: cuenta los turnos del día sin mirar lo ocupado", () => {
    const base = { settings: settings(), resources: [LUIS, DIEGO], durationMinutes: 60 };
    expect(countDayCandidates({ ...base, dateISO: "2026-10-03" })).toBe(0); // sábado
    // 10:00-20:00 con paso de 30 y 60 min: 19 inicios por barbero.
    expect(countDayCandidates({ ...base, dateISO: MARTES })).toBe(38);
  });

  it("isFreeAt reconoce el hueco exacto y rechaza el que ya se ocupó", () => {
    const base = { settings: settings(), resource: LUIS, durationMinutes: 45, now: NOW };
    expect(isFreeAt({ ...base, busy: [], startUtc: at("17:00") })).toBe(true);
    expect(isFreeAt({ ...base, busy: [busy("rs_luis", "17:30", 30)], startUtc: at("17:00") })).toBe(false);
    // Fuera del paso (17:10) o del horario (21:00): no es un hueco.
    expect(isFreeAt({ ...base, busy: [], startUtc: at("17:10") })).toBe(false);
    expect(isFreeAt({ ...base, busy: [], startUtc: at("21:00") })).toBe(false);
  });
});

describe("cómo se dice", () => {
  it("la etiqueta natural: mañana, día, hora en 12 h; el mes solo si es otro", () => {
    expect(naturalLabelInTz(at("17:00"), MX, NOW)).toBe("mañana martes 29 a las 5:00 pm");
    expect(naturalLabelInTz("2026-09-28T16:30:00.000Z", MX, NOW)).toBe("hoy lunes 28 a las 10:30 am");
    expect(naturalLabelInTz("2026-10-03T18:00:00.000Z", MX, NOW)).toBe(
      "sábado 3 de octubre a las 12:00 pm"
    );
  });

  it("cuando el cliente elige lleva 'con Luis'; cuando asigna el sistema, no", () => {
    const base = { startUtc: at("17:00"), timezone: MX, now: NOW, resourceName: "Luis" };
    expect(resourceSlotLabel({ ...base, seleccion: "cliente" })).toEqual({
      label: "mañana martes 29 a las 5:00 pm con Luis",
      resourceLabel: "con Luis",
    });
    expect(resourceSlotLabel({ ...base, resourceName: "Cabina 2", seleccion: "automatica" })).toEqual({
      label: "mañana martes 29 a las 5:00 pm",
      resourceLabel: null,
    });
  });

  it("el título de la reunión nombra servicio y recurso", () => {
    expect(
      meetingTopic({ contactName: "Ana", serviceName: "Corte clásico", resourceName: "Luis", seleccion: "cliente" })
    ).toBe("Corte clásico con Luis · Ana");
    expect(
      meetingTopic({ contactName: "Ana", serviceName: "Masaje 90 min", resourceName: "Cabina 2", seleccion: "automatica" })
    ).toBe("Masaje 90 min · Cabina 2 · Ana");
    // Sin recurso ni servicio: el título de siempre.
    expect(meetingTopic({ contactName: "Ana", seleccion: "cliente" })).toBe("Cita — Ana");
    expect(meetingTopic({ contactName: "", seleccion: "cliente" })).toBe("Cita");
  });

  it("precio y duración legibles", () => {
    expect(priceLabel(25_000, "MXN")).toBe("$250");
    expect(priceLabel(25_050, "MXN")).toBe("$250.50");
    expect(priceLabel(null, "MXN")).toBeNull();
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(90)).toBe("1 h 30 min");
  });
});

describe("el orden de reserva", () => {
  const eligible = [LUIS, DIEGO];
  it("cliente: solo el que se le prometió", () => {
    expect(reservationOrder({ requested: DIEGO, eligible, seleccion: "cliente" }).map((r) => r.id)).toEqual([
      "rs_diego",
    ]);
  });
  it("automática: el ofrecido primero y, si se ocupó, cualquier otro", () => {
    expect(reservationOrder({ requested: DIEGO, eligible, seleccion: "automatica" }).map((r) => r.id)).toEqual([
      "rs_diego",
      "rs_luis",
    ]);
  });
  it("el operador que eligió a mano se respeta aunque el sistema asigne", () => {
    expect(
      reservationOrder({ requested: DIEGO, eligible, seleccion: "automatica", strict: true }).map((r) => r.id)
    ).toEqual(["rs_diego"]);
  });
  it("sin recurso pedido: todos los que pueden, en orden", () => {
    expect(reservationOrder({ requested: null, eligible, seleccion: "cliente" }).map((r) => r.id)).toEqual([
      "rs_luis",
      "rs_diego",
    ]);
  });
});

describe("el conocimiento que se le pasa al agente", () => {
  const barberia: VerticalConfig = { ...VERTICAL, seleccion: "cliente" };
  const spa: VerticalConfig = {
    ...VERTICAL,
    recurso: { singular: "Cabina", plural: "Cabinas" },
    servicio: { singular: "Paquete", plural: "Paquetes" },
    seleccion: "automatica",
  };

  it("barbería: servicios con precio y duración, y qué hace cada barbero", () => {
    const kb = catalogKnowledge(CATALOG, barberia, "MXN").join("\n\n");
    expect(kb).toContain("- Corte clásico: $250 · 45 min");
    expect(kb).toContain("- Barba: $150 · 30 min");
    expect(kb).toContain("- Luis: Corte clásico, Barba, Corte niño");
    expect(kb).toContain("- Diego: Corte clásico, Corte niño");
    // El inactivo no existe para el cliente.
    expect(kb).not.toContain("Marco");
  });

  it("spa: indicaciones antes de la cita, y que la cabina no se elige", () => {
    const masaje = service({
      id: "sv_m",
      name: "Masaje 90 min",
      durationMinutes: 90,
      priceCents: 120_000,
      instructions: "Llega 10 min antes, sin cremas.",
    });
    const kb = catalogKnowledge(
      { resources: [resource({ id: "rs_c1", name: "Cabina 1" })], services: [masaje] },
      spa,
      "MXN"
    ).join("\n\n");
    expect(kb).toContain("- Masaje 90 min: $1,200 · 1 h 30 min");
    expect(kb).toContain("- Masaje 90 min: Llega 10 min antes, sin cremas.");
    expect(kb).toContain("no preguntes por cabina");
    expect(kb).not.toContain("Cabina 1:");
  });

  it("sin catálogo no hay nada que agregar", () => {
    expect(catalogKnowledge({ resources: [], services: [] }, barberia, "MXN")).toEqual([]);
  });

  it("el título de la sección sale del giro", () => {
    expect(tituloCatalogo(barberia)).toBe("Barberos y servicios");
    expect(tituloCatalogo(spa)).toBe("Cabinas y paquetes");
  });
});

describe("etapas del giro", () => {
  const etapas: EtapaFila[] = [
    { id: "s1", name: "Nuevo", position: 0, kind: "open" },
    { id: "s2", name: "Paquete elegido", position: 1, kind: "open" },
    { id: "s3", name: "Reservado", position: 2, kind: "open" },
    { id: "s4", name: "Asistió", position: 3, kind: "won" },
    { id: "s5", name: "Perdido", position: 4, kind: "lost" },
  ];

  it("se buscan por nombre sin mayúsculas ni acentos", () => {
    expect(etapaPorNombre(etapas, "asistio")?.id).toBe("s4");
    expect(etapaPorNombre(etapas, "RESERVADO")?.id).toBe("s3");
    expect(etapaPorNombre(etapas, "Vuelve")).toBeNull();
    expect(etapaPorNombre(etapas, null)).toBeNull();
  });

  it("'solo hacia adelante' no regresa a quien ya reservó o asistió", () => {
    const elegido = etapas[1]!;
    expect(esAvance(etapas, "s1", elegido)).toBe(true);
    expect(esAvance(etapas, "s3", elegido)).toBe(false);
    expect(esAvance(etapas, "s4", elegido)).toBe(false); // desde una ganada
  });

  it("REGRESO_DIAS sobreescribe los días del giro; basura se ignora", () => {
    expect(regresoDias(VERTICAL, undefined)).toBe(21);
    expect(regresoDias(VERTICAL, "0")).toBe(0);
    expect(regresoDias(VERTICAL, "3")).toBe(3);
    expect(regresoDias(VERTICAL, "tres")).toBe(21);
    expect(regresoDias({ ...VERTICAL, etapas: { ...VERTICAL.etapas, regreso: null } }, "3")).toBeNull();
  });

  it("la barbería siembra su tablero con una etapa abierta primero", () => {
    expect(VERTICAL.etapas.seed[0]).toEqual({ name: "Nuevo", kind: "open" });
    for (const nombre of [VERTICAL.etapas.citaAgendada, VERTICAL.etapas.citaRealizada, VERTICAL.etapas.regreso?.etapa]) {
      expect(etapaPorNombre(
        VERTICAL.etapas.seed.map((e, i) => ({ id: String(i), name: e.name, position: i, kind: e.kind })),
        nombre
      )).not.toBeNull();
    }
  });
});

describe("Citas: filtro y color por recurso", () => {
  it("filtra por recurso; los bloqueos del negocio entero se ven en todos", async () => {
    const { filterByResource } = await import("@/components/bookings/booking-look");
    const citas = [
      { id: "a", kind: "session", resource: { id: "rs_luis" } },
      { id: "b", kind: "session", resource: { id: "rs_diego" } },
      { id: "c", kind: "block", resource: null },
      { id: "d", kind: "block", resource: { id: "rs_diego" } },
      { id: "e", kind: "session", resource: null },
    ];
    expect(filterByResource(citas, null).map((c) => c.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(filterByResource(citas, "rs_luis").map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterByResource(citas, "rs_diego").map((c) => c.id)).toEqual(["b", "c", "d"]);
  });

  it("una cita que viene se pinta del color de su recurso; las demás, de su estado", async () => {
    const { bookingTone } = await import("@/components/bookings/booking-look");
    const { resourceColorClass } = await import("@/lib/resource-colors");
    const base = { kind: "session", status: "agendada" } as never;
    expect(bookingTone(base, resourceColorClass("verde", 0)).box).toContain("bg-[#30a657]");
    expect(bookingTone(base).box).toContain("bg-brand");
    expect(bookingTone({ kind: "session", status: "realizada" } as never, "bg-[#30a657]").box).toContain(
      "bg-success-tint"
    );
    // Sin color elegido, se reparte por posición: dos recursos no salen iguales.
    expect(resourceColorClass(null, 0)).not.toBe(resourceColorClass(null, 1));
  });
});
