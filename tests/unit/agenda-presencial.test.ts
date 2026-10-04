import { beforeAll, describe, expect, it, vi } from "vitest";
import { bookingPayload } from "@/server/agenda/http";
import { citasEnContexto, sinEnlaces, type FilaCita } from "@/server/agenda/context";
import { catalogPayload, presencialKnowledge, type Catalog } from "@/server/agenda/catalog";
import { resolverServicioYRecurso } from "@/server/agenda/catalog-query";
import { serializeBotProfile } from "@/server/bot/profile";
import { VERTICAL } from "@/lib/vertical";
import type { VerticalConfig } from "@/lib/vertical-config";
import type { schema } from "@/lib/db";

/**
 * 200 — La cita PRESENCIAL (barbería, spa): Zoom es solo el calendario del
 * equipo, así que su enlace jamás sale por `/api/bot/*`. Si sale, el cerebro
 * se lo comparte al cliente — y el cliente de una barbería no tiene nada que
 * hacer en una sala de Zoom. El operador lo sigue viendo en Citas (esas rutas
 * no pasan `presencial`).
 */

const h = vi.hoisted(() => ({
  result: null as unknown,
}));

vi.mock("@/server/agenda/flag", () => ({
  agendaEnabled: () => true,
  agendaDisabledResponse: () => new Response(null, { status: 404 }),
}));
vi.mock("@/server/bot/auth", () => ({
  requireBotKey: () => null,
  resolveInstanceOrg: async () => "org_1",
}));
vi.mock("@/server/agenda/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/agenda/service")>()),
  createSessionBooking: async () => h.result,
  rescheduleForConversation: async () => h.result,
}));

const RESULT = {
  booking: { id: "bk_1" },
  meetingLink: "https://zoom.us/j/123",
  linkPending: false,
  label: "mañana martes 29 a las 5:00 pm con Luis",
  service: { id: "sv_corte", name: "Corte clásico", durationMinutes: 45, instructions: "Llega 5 min antes." },
  resource: { id: "rs_luis", name: "Luis" },
  resourceLabel: "con Luis",
} as never;

describe("bookingPayload", () => {
  it("presencial: sin enlace (ni la llave), nada pendiente, y el qué/con quién", () => {
    const body = bookingPayload(RESULT, { presencial: true });
    expect(body).not.toHaveProperty("meetingLink");
    expect(JSON.stringify(body)).not.toContain("zoom.us");
    expect(body).toEqual({
      bookingId: "bk_1",
      linkPending: false,
      label: "mañana martes 29 a las 5:00 pm con Luis",
      presencial: true,
      service: "Corte clásico",
      instructions: "Llega 5 min antes.",
      resource: "Luis",
      resourceLabel: "con Luis",
    });
  });

  it("presencial con el proveedor caído: tampoco se promete un enlace", () => {
    const body = bookingPayload({ ...(RESULT as object), meetingLink: null, linkPending: true } as never, {
      presencial: true,
    });
    expect(body.linkPending).toBe(false);
  });

  it("sin presencial (la superficie del operador, o un negocio en línea) el enlace viaja", () => {
    expect(bookingPayload(RESULT)).toMatchObject({ meetingLink: "https://zoom.us/j/123" });
  });
});

describe("POST/PATCH /api/bot/bookings en esta instancia (presencial)", () => {
  let route: typeof import("@/app/api/bot/bookings/route");
  beforeAll(async () => {
    route = await import("@/app/api/bot/bookings/route");
  }, 60_000);

  it("la barbería es presencial", () => {
    expect(VERTICAL.cita.presencial).toBe(true);
  });

  it.each(["POST", "PATCH"] as const)("%s no deja salir el enlace", async (method) => {
    h.result = RESULT;
    const res = await route[method](
      new Request("http://crm.test/api/bot/bookings", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: "cv_1", startUtc: "2026-09-29T23:00:00.000Z" }),
      })
    );
    expect(res.status).toBe(method === "POST" ? 201 : 200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).not.toHaveProperty("meetingLink");
    expect(json.linkPending).toBe(false);
    expect(json.presencial).toBe(true);
    expect(json).toMatchObject({ service: "Corte clásico", resource: "Luis", instructions: "Llega 5 min antes." });
  });
});

describe("el contexto del cerebro", () => {
  const fila = (extra: Partial<FilaCita> = {}): FilaCita => ({
    id: "bk_1",
    kind: "session",
    status: "agendada",
    isTest: false,
    scheduledAt: new Date("2026-09-29T23:00:00.000Z"),
    durationMinutes: 45,
    meetingLink: "https://zoom.us/j/123",
    linkPending: true,
    updatedAt: new Date("2026-09-28T12:00:00.000Z"),
    serviceName: "Corte clásico",
    resourceName: "Luis",
    ...extra,
  });

  it("las citas llevan qué y con quién; presencial, sin enlace ni pendiente", () => {
    const citas = citasEnContexto([fila()], "America/Mexico_City", new Date("2026-09-28T15:00:00.000Z"));
    expect(citas.next).toMatchObject({ service: "Corte clásico", resource: "Luis", meetingLink: "https://zoom.us/j/123" });
    const presencial = sinEnlaces(citas);
    expect(presencial.presencial).toBe(true);
    expect(presencial.next).not.toHaveProperty("meetingLink");
    expect(presencial.next).not.toHaveProperty("linkPending");
    expect(JSON.stringify(presencial)).not.toContain("zoom.us");
    expect(presencial.next).toMatchObject({ service: "Corte clásico", resource: "Luis" });
  });

  it("sin recurso ni servicio la cita conserva exactamente su forma de siempre", () => {
    const citas = citasEnContexto(
      [fila({ serviceName: null, resourceName: null })],
      "America/Mexico_City",
      new Date("2026-09-28T15:00:00.000Z")
    );
    expect(Object.keys(citas.next!).sort()).toEqual(
      ["endUtc", "id", "label", "linkPending", "meetingLink", "startUtc", "status"].sort()
    );
  });
});

describe("lo que el agente sabe del negocio", () => {
  type AgentProfile = typeof schema.agentProfile.$inferSelect;
  const perfil = {
    id: "ap_1",
    organizationId: "org_1",
    enabled: false,
    name: "Nea",
    tone: null,
    instructions: null,
    escalationRules: null,
    greeting: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentProfile;

  it("el conocimiento derivado se agrega después del que escribió el dueño", () => {
    const out = serializeBotProfile(perfil, [], ["Servicios:\n- Corte clásico: $250 · 45 min"]);
    expect(out.kb).toBe("Servicios:\n- Corte clásico: $250 · 45 min");
    expect(serializeBotProfile(perfil, []).kb).toBe("(knowledge base vacío)");
  });

  it("presencial: la cita es en el local y no hay enlace", () => {
    const [linea] = presencialKnowledge(VERTICAL);
    expect(linea).toContain("EN PERSONA");
    expect(linea).toContain("No hay enlace ni videollamada");
    const enLinea: VerticalConfig = { ...VERTICAL, cita: { presencial: false } };
    expect(presencialKnowledge(enLinea)).toEqual([]);
  });
});

describe("catálogo para el cerebro", () => {
  const catalog: Catalog = {
    resources: [
      { id: "rs_c1", name: "Cabina 1", weeklyHours: null, color: null, active: true, position: 0, serviceIds: [] },
      { id: "rs_c2", name: "Cabina 2", weeklyHours: null, color: null, active: true, position: 1, serviceIds: [] },
    ],
    services: [
      {
        id: "sv_m",
        name: "Masaje 90 min",
        durationMinutes: 90,
        priceCents: 120_000,
        description: "Relajante",
        instructions: "Llega 10 min antes, sin cremas.",
        active: true,
        position: 0,
        resourceIds: [],
      },
    ],
  };
  const spa: VerticalConfig = {
    ...VERTICAL,
    recurso: { singular: "Cabina", plural: "Cabinas" },
    servicio: { singular: "Paquete", plural: "Paquetes" },
    seleccion: "automatica",
  };

  it("vertical, servicios con precio e indicaciones, y quién da qué ya resuelto", () => {
    expect(catalogPayload(catalog, spa, "MXN")).toEqual({
      vertical: {
        recurso: { singular: "Cabina", plural: "Cabinas" },
        servicio: { singular: "Paquete", plural: "Paquetes" },
        seleccion: "automatica",
        presencial: true,
      },
      services: [
        {
          id: "sv_m",
          name: "Masaje 90 min",
          durationMinutes: 90,
          priceCents: 120_000,
          priceLabel: "$1,200",
          description: "Relajante",
          instructions: "Llega 10 min antes, sin cremas.",
          resourceIds: [],
        },
      ],
      // Sin vínculos lo da cualquier cabina: ya viene resuelto.
      resources: [
        { id: "rs_c1", name: "Cabina 1", serviceIds: ["sv_m"] },
        { id: "rs_c2", name: "Cabina 2", serviceIds: ["sv_m"] },
      ],
    });
  });

  it("«¿Tienen masaje de 90 min?» resuelve el paquete y busca en todas las cabinas", () => {
    const r = resolverServicioYRecurso(catalog, "masaje 90", null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.service.id).toBe("sv_m");
      expect(r.resources.map((x) => x.id)).toEqual(["rs_c1", "rs_c2"]);
      expect(r.resource).toBeNull();
    }
  });
});
