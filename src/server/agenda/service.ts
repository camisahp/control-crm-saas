import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { labelInTz } from "@/lib/time/slots";
import { CONNECTOR_META, type ConnectorId } from "@/lib/agenda-connectors";
import { VERTICAL } from "@/lib/vertical";
import {
  computeAvailability,
  findSlot,
  type AvailableSlot,
} from "@/server/agenda/availability";
import { getSettings, type CalendarSettings } from "@/server/agenda/settings";
import {
  clearOffers,
  findOffered,
  getOffers,
  replaceOffers,
  type OfferedSlot,
} from "@/server/agenda/offers";
import {
  bindConnector,
  markConnectorAuthError,
} from "@/server/agenda/connectors";
import { ConnectorError } from "@/server/agenda/connectors/types";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { publish } from "@/server/events/bus";
import { BookingError, isUniqueViolation } from "@/server/agenda/errors";
import {
  eligibleResources,
  loadCatalog,
  offerableCatalog,
  type Catalog,
  type CatalogResource,
} from "@/server/agenda/catalog";
import {
  computeResourceAvailability,
  resourceSlotLabel,
} from "@/server/agenda/resource-availability";
import {
  meetingTopic,
  reservationOrder,
  reserveResourceSlot,
} from "@/server/agenda/resource-booking";
import { alRealizarCita, moverContactoAEtapa } from "@/server/agenda/etapas";

export { BookingError, type BookingErrorCode } from "@/server/agenda/errors";

/**
 * 015 — Ciclo de vida de la cita y las dos reglas INNEGOCIABLES:
 *
 *  1. Quien conduce la conversación (agente in-process o cerebro externo) solo
 *     puede reservar un instante que ya se ofreció a ESA conversación
 *     (`offered_slot`, comparación por epoch exacto).
 *  2. Al confirmar se re-valida el hueco y la base lo cierra con su índice
 *     único parcial; si se ocupó, se responde `slot_taken` con alternativas
 *     frescas y NO se crea nada. Nunca se confirma una reserva que no se creó.
 *
 * Y una regla de honestidad: la entrega de la reunión (el conector) corre
 * DESPUÉS de escribir la verdad del CRM y es best-effort. Si el proveedor está
 * caído, la cita se crea igual con el enlace pendiente — un tercero no puede
 * costarnos la conversión, ni hacernos prometer un enlace que no existe.
 */

type BookingRow = typeof schema.booking.$inferSelect;

export type BookingResult = {
  booking: BookingRow;
  meetingLink: string | null;
  linkPending: boolean;
  label: string;
  /** 200 — Solo en la agenda por recurso: qué se agendó y con quién. */
  service?: { id: string; name: string; durationMinutes: number; instructions: string | null } | null;
  resource?: { id: string; name: string } | null;
  /** "con Luis" cuando el cliente elige; null cuando asigna el sistema. */
  resourceLabel?: string | null;
};

/** Cuántas alternativas se devuelven cuando el hueco se ocupó. */
const FRESH_ALTERNATIVES = 3;

export async function createSessionBooking(input: {
  organizationId: string;
  startUtc: string;
  source: "manual" | "ai";
  /** Obligatoria en el camino conversacional; de ella sale el contacto. */
  conversationId?: string | null;
  /** Camino manual del operador. */
  contactId?: string | null;
  notes?: string | null;
  /**
   * true ⇒ exige que el instante figure entre los ofrecidos a la conversación
   * (agente/bot). El operador elige de la disponibilidad que está viendo, así
   * que reserva sin oferta previa.
   */
  requireOffer: boolean;
  /**
   * 200 — Agenda por recurso, camino del operador: con quién y qué. En el
   * camino del bot salen de la OFERTA (no se aceptan del cuerpo): se reserva
   * lo que se ofreció, con quien se ofreció.
   */
  resourceId?: string | null;
  serviceId?: string | null;
  now?: Date;
}): Promise<BookingResult> {
  const db = getDb();
  const settings = await getSettings(input.organizationId);

  if (Number.isNaN(Date.parse(input.startUtc))) {
    throw new BookingError("invalid", "Instante inválido");
  }

  // Contexto de la conversación: contacto y si es del Laboratorio.
  let isTest = false;
  let contactId = input.contactId ?? null;
  let contactName = "";
  if (input.conversationId) {
    const rows = await db
      .select({
        contactId: schema.conversation.contactId,
        isTest: schema.conversation.isTest,
      })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          input.organizationId,
          eq(schema.conversation.id, input.conversationId)
        )
      )
      .limit(1);
    const conv = rows[0];
    if (!conv) throw new BookingError("not_found", "Conversación no encontrada");
    isTest = conv.isTest;
    contactId = contactId ?? conv.contactId;
  }

  if (!contactId) {
    throw new BookingError("invalid", "La cita necesita un contacto");
  }
  contactName = await getContactName(input.organizationId, contactId);

  // REGLA 1: solo se reserva lo que se ofreció.
  let offered: OfferedSlot | null = null;
  if (input.requireOffer) {
    if (!input.conversationId) {
      throw new BookingError(
        "invalid",
        "Se necesita la conversación para validar la oferta"
      );
    }
    const offers = await getOffers(input.organizationId, input.conversationId);
    offered = findOffered(offers, input.startUtc);
    if (!offered) {
      throw new BookingError(
        "slot_not_offered",
        "Ese horario no se ofreció en esta conversación",
        offers
      );
    }
  }

  // 200 — Con recurso o servicio, la agenda por recurso. Sin ninguno de los
  // dos, TODO lo de abajo es exactamente el camino de siempre.
  const resourceId = input.requireOffer
    ? (offered?.resourceId ?? null)
    : (input.resourceId ?? null);
  const serviceId = input.requireOffer
    ? (offered?.serviceId ?? null)
    : (input.serviceId ?? null);
  if (resourceId || serviceId) {
    return createResourceSessionBooking({
      organizationId: input.organizationId,
      startUtc: input.startUtc,
      source: input.source,
      conversationId: input.conversationId ?? null,
      contactId,
      contactName,
      isTest,
      notes: input.notes ?? null,
      settings,
      resourceId,
      serviceId,
      // El operador eligió a mano: se respeta aunque el sistema asigne.
      strict: !input.requireOffer && Boolean(input.resourceId),
      now: input.now,
    });
  }

  // REGLA 2 (primera mitad): el hueco debe seguir libre AHORA.
  const slot = await findSlot(input.organizationId, input.startUtc, {
    now: input.now,
    settings,
  });
  if (!slot) {
    throw new BookingError(
      "slot_taken",
      "Ese horario ya no está disponible",
      await refreshOffer(input.organizationId, input.conversationId, {
        now: input.now,
      })
    );
  }

  const leadRows = await db
    .select({ id: schema.lead.id })
    .from(schema.lead)
    .where(
      scoped(
        schema.lead.organizationId,
        input.organizationId,
        eq(schema.lead.contactId, contactId)
      )
    )
    .limit(1);

  let booking: BookingRow;
  try {
    const inserted = await db
      .insert(schema.booking)
      .values({
        id: newId("booking"),
        organizationId: input.organizationId,
        kind: "session",
        source: input.source === "ai" ? "ai" : "manual",
        contactId,
        conversationId: input.conversationId ?? null,
        leadId: leadRows[0]?.id ?? null,
        scheduledAt: new Date(slot.startUtc),
        durationMinutes: settings.slotMinutes,
        // Copia histórica: si el negocio cambia de conector, esta cita conserva
        // el que le tocó y sigue hablando con él al moverse o cancelarse.
        connector: settings.connector,
        isTest,
        notes: input.notes ?? null,
      })
      .returning();
    booking = inserted[0]!;
  } catch (err) {
    // REGLA 2 (segunda mitad): la llave única cierra la carrera exacta. Dos
    // confirmaciones simultáneas del mismo instante — la perdedora sale por
    // aquí, sin cita creada.
    if (isUniqueViolation(err)) {
      throw new BookingError(
        "slot_taken",
        "Ese horario acaba de ocuparse",
        await refreshOffer(input.organizationId, input.conversationId, {
          now: input.now,
        })
      );
    }
    throw err;
  }

  // La oferta cumplió su propósito.
  if (input.conversationId) {
    await clearOffers(input.organizationId, input.conversationId).catch(
      (err) => {
        console.warn(`[agenda] no pude limpiar la oferta: ${err}`);
      }
    );
  }

  // Efectos secundarios: ninguno puede revertir la cita.
  const delivered = await deliverMeeting(booking, settings, contactName);
  await advanceLeadStage(
    input.organizationId,
    contactId,
    input.source === "ai" ? "bot" : "dueno"
  ).catch((err) => {
    console.warn(`[agenda] avance de etapa falló: ${err}`);
  });

  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: delivered.id },
  });

  return {
    booking: delivered,
    meetingLink: delivered.meetingLink,
    linkPending: delivered.linkPending,
    label: labelInTz(slot.startUtc, settings.timezone),
  };
}

/**
 * 200 — La cita en la agenda de un recurso. Mismas dos reglas que la de
 * siempre, con una diferencia: la re-validación y la escritura van juntas bajo
 * el candado del recurso (`reserveResourceSlot`), porque con duraciones
 * distintas el choque es un solape que el índice único no ve.
 */
async function createResourceSessionBooking(input: {
  organizationId: string;
  startUtc: string;
  source: "manual" | "ai";
  conversationId: string | null;
  contactId: string;
  contactName: string;
  isTest: boolean;
  notes: string | null;
  settings: CalendarSettings;
  resourceId: string | null;
  serviceId: string | null;
  strict: boolean;
  now?: Date;
}): Promise<BookingResult> {
  const db = getDb();
  const catalog = await loadCatalog(input.organizationId, { includeInactive: true });
  const service = input.serviceId
    ? catalog.services.find((s) => s.id === input.serviceId)
    : undefined;
  if (!service) {
    throw new BookingError(
      "invalid",
      input.serviceId ? "Ese servicio ya no existe" : "Falta el servicio de la cita"
    );
  }
  const requested = input.resourceId
    ? (catalog.resources.find((r) => r.id === input.resourceId) ?? null)
    : null;
  if (input.resourceId && !requested) {
    throw new BookingError("invalid", "Ese recurso ya no existe");
  }
  const offerable = offerableCatalog(catalog);
  const offerableService = offerable.services.find((s) => s.id === service.id);
  const eligible = offerableService ? eligibleResources(offerable, offerableService) : [];
  const order = reservationOrder({
    requested,
    eligible,
    seleccion: VERTICAL.seleccion,
    strict: input.strict,
  });

  const leadRows = await db
    .select({ id: schema.lead.id })
    .from(schema.lead)
    .where(
      scoped(
        schema.lead.organizationId,
        input.organizationId,
        eq(schema.lead.contactId, input.contactId)
      )
    )
    .limit(1);

  let booking: BookingRow | null = null;
  let chosen: CatalogResource | null = null;
  let raced = false;
  for (const resource of order) {
    try {
      booking = await reserveResourceSlot({
        organizationId: input.organizationId,
        resource,
        durationMinutes: service.durationMinutes,
        startUtc: input.startUtc,
        settings: input.settings,
        now: input.now,
        write: async (tx) => {
          const inserted = await tx
            .insert(schema.booking)
            .values({
              id: newId("booking"),
              organizationId: input.organizationId,
              kind: "session",
              source: input.source === "ai" ? "ai" : "manual",
              contactId: input.contactId,
              conversationId: input.conversationId,
              leadId: leadRows[0]?.id ?? null,
              scheduledAt: new Date(input.startUtc),
              // La duración es la del SERVICIO, capturada al crear.
              durationMinutes: service.durationMinutes,
              connector: input.settings.connector,
              isTest: input.isTest,
              notes: input.notes,
              resourceId: resource.id,
              serviceId: service.id,
            })
            .returning();
          return inserted[0]!;
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      raced = true;
      booking = null;
    }
    if (booking) {
      chosen = resource;
      break;
    }
  }

  if (!booking || !chosen) {
    throw new BookingError(
      "slot_taken",
      raced ? "Ese horario acaba de ocuparse" : "Ese horario ya no está disponible",
      await refreshResourceOffer(input.organizationId, input.conversationId, {
        catalog: offerable,
        serviceId: service.id,
        // Cuando el cliente eligió, las alternativas son con el MISMO recurso.
        resourceId: VERTICAL.seleccion === "cliente" ? (requested?.id ?? null) : null,
        settings: input.settings,
        now: input.now,
      })
    );
  }

  if (input.conversationId) {
    await clearOffers(input.organizationId, input.conversationId).catch((err) => {
      console.warn(`[agenda] no pude limpiar la oferta: ${err}`);
    });
  }

  const delivered = await deliverMeeting(booking, input.settings, input.contactName, {
    serviceName: service.name,
    resourceName: chosen.name,
  });
  await advanceLeadStage(
    input.organizationId,
    input.contactId,
    input.source === "ai" ? "bot" : "dueno"
  ).catch((err) => {
    console.warn(`[agenda] avance de etapa falló: ${err}`);
  });

  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: delivered.id },
  });

  return resourceResult(delivered, input.settings, input.now, service, chosen);
}

/** 200 — El resultado de una cita con recurso: etiqueta natural y qué/con quién. */
function resourceResult(
  booking: BookingRow,
  settings: CalendarSettings,
  now: Date | undefined,
  service: { id: string; name: string; durationMinutes: number; instructions: string | null },
  resource: { id: string; name: string }
): BookingResult {
  const { label, resourceLabel } = resourceSlotLabel({
    startUtc: booking.scheduledAt.toISOString(),
    timezone: settings.timezone,
    now: now ?? new Date(),
    resourceName: resource.name,
    seleccion: VERTICAL.seleccion,
  });
  return {
    booking,
    meetingLink: booking.meetingLink,
    linkPending: booking.linkPending,
    label,
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      instructions: service.instructions,
    },
    resource: { id: resource.id, name: resource.name },
    resourceLabel,
  };
}

export async function createBlock(input: {
  organizationId: string;
  startUtc: string;
  durationMinutes: number;
  notes?: string | null;
  /** 200 — Bloquear solo a un recurso (la comida de Luis). Sin él, a todos. */
  resourceId?: string | null;
}): Promise<BookingRow> {
  if (Number.isNaN(Date.parse(input.startUtc))) {
    throw new BookingError("invalid", "Instante inválido");
  }
  const db = getDb();
  if (input.resourceId) {
    const catalog = await loadCatalog(input.organizationId, { includeInactive: true });
    if (!catalog.resources.some((r) => r.id === input.resourceId)) {
      throw new BookingError("invalid", "Ese recurso no existe");
    }
  }
  try {
    const inserted = await db
      .insert(schema.booking)
      .values({
        id: newId("booking"),
        organizationId: input.organizationId,
        kind: "block",
        source: "manual",
        scheduledAt: new Date(input.startUtc),
        durationMinutes: input.durationMinutes,
        notes: input.notes ?? null,
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      })
      .returning();
    const block = inserted[0]!;
    publish(input.organizationId, {
      type: "booking.updated",
      data: { bookingId: block.id },
    });
    return block;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new BookingError("slot_taken", "Ese horario ya está ocupado");
    }
    throw err;
  }
}

export async function rescheduleBooking(input: {
  organizationId: string;
  bookingId: string;
  startUtc: string;
  /**
   * 200 — Con quién y qué en el horario NUEVO. El bot los toma de la oferta
   * (puede haber pedido otro barbero); el operador, de lo que eligió. Sin
   * ellos se conservan los de la cita.
   */
  resourceId?: string | null;
  serviceId?: string | null;
  now?: Date;
}): Promise<BookingResult> {
  const db = getDb();
  const booking = await getOwnBooking(input.organizationId, input.bookingId);
  if (booking.status === "cancelada") {
    throw new BookingError("invalid", "La cita está cancelada");
  }

  const settings = await getSettings(input.organizationId);
  if (booking.resourceId || booking.serviceId || input.resourceId || input.serviceId) {
    return rescheduleResourceBooking({ ...input, booking, settings });
  }
  // excludeBookingId: la propia cita no debe bloquearse a sí misma.
  const slot = await findSlot(input.organizationId, input.startUtc, {
    excludeBookingId: booking.id,
    now: input.now,
    settings,
  });
  if (!slot) {
    throw new BookingError("slot_taken", "Ese horario ya no está disponible");
  }

  let next: BookingRow;
  try {
    const updated = await db
      .update(schema.booking)
      .set({ scheduledAt: new Date(slot.startUtc), updatedAt: new Date() })
      .where(eq(schema.booking.id, booking.id))
      .returning();
    next = updated[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new BookingError("slot_taken", "Ese horario acaba de ocuparse");
    }
    throw err;
  }

  // Mover la reunión en el proveedor conserva el enlace: es la MISMA reunión,
  // en otra hora. Un fallo aquí no deshace nada — el enlace anterior sigue
  // sirviendo en la práctica.
  await withConnector(next, settings, async (conn, externalRef) => {
    await conn.updateMeeting(externalRef, {
      startUtc: slot.startUtc,
      durationMinutes: next.durationMinutes,
      timezone: settings.timezone,
    });
  });

  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: next.id },
  });
  return {
    booking: next,
    meetingLink: next.meetingLink,
    linkPending: next.linkPending,
    label: labelInTz(slot.startUtc, settings.timezone),
  };
}

/**
 * 200 — Mover una cita con recurso: mismo candado que al crear. La duración
 * sigue al servicio (si cambió de servicio, cambia) y el recurso puede cambiar
 * si así se pidió — o, cuando asigna el sistema, si el suyo ya no tiene ese
 * hueco y otro sí.
 */
async function rescheduleResourceBooking(input: {
  organizationId: string;
  booking: BookingRow;
  startUtc: string;
  resourceId?: string | null;
  serviceId?: string | null;
  settings: CalendarSettings;
  now?: Date;
}): Promise<BookingResult> {
  const { booking, settings } = input;
  const catalog = await loadCatalog(input.organizationId, { includeInactive: true });
  const serviceId = input.serviceId ?? booking.serviceId;
  const found = serviceId ? catalog.services.find((s) => s.id === serviceId) : undefined;
  // Un servicio borrado no impide mover la cita: se conserva su duración.
  const service = found ?? {
    id: null,
    name: null,
    durationMinutes: booking.durationMinutes,
    instructions: null,
  };
  const targetId = input.resourceId ?? booking.resourceId;
  const requested = targetId ? (catalog.resources.find((r) => r.id === targetId) ?? null) : null;
  const offerable = offerableCatalog(catalog);
  const offerableService = found ? offerable.services.find((s) => s.id === found.id) : undefined;
  const eligible = offerableService ? eligibleResources(offerable, offerableService) : [];
  const order = reservationOrder({
    requested,
    eligible,
    seleccion: VERTICAL.seleccion,
  });
  if (order.length === 0) {
    throw new BookingError("slot_taken", "Ese horario ya no está disponible");
  }

  let next: BookingRow | null = null;
  let chosen: CatalogResource | null = null;
  let raced = false;
  for (const resource of order) {
    try {
      next = await reserveResourceSlot({
        organizationId: input.organizationId,
        resource,
        durationMinutes: service.durationMinutes,
        startUtc: input.startUtc,
        settings,
        now: input.now,
        // La propia cita no debe bloquearse a sí misma.
        excludeBookingId: booking.id,
        write: async (tx) => {
          const updated = await tx
            .update(schema.booking)
            .set({
              scheduledAt: new Date(input.startUtc),
              durationMinutes: service.durationMinutes,
              resourceId: resource.id,
              ...(service.id ? { serviceId: service.id } : {}),
              updatedAt: new Date(),
            })
            .where(eq(schema.booking.id, booking.id))
            .returning();
          return updated[0]!;
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      raced = true;
      next = null;
    }
    if (next) {
      chosen = resource;
      break;
    }
  }
  if (!next || !chosen) {
    throw new BookingError(
      "slot_taken",
      raced ? "Ese horario acaba de ocuparse" : "Ese horario ya no está disponible"
    );
  }

  const moved = next;
  await withConnector(moved, settings, async (conn, externalRef) => {
    await conn.updateMeeting(externalRef, {
      startUtc: moved.scheduledAt.toISOString(),
      durationMinutes: moved.durationMinutes,
      timezone: settings.timezone,
    });
  });

  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: moved.id },
  });
  if (!service.id || !service.name) {
    const { label, resourceLabel } = resourceSlotLabel({
      startUtc: moved.scheduledAt.toISOString(),
      timezone: settings.timezone,
      now: input.now ?? new Date(),
      resourceName: chosen.name,
      seleccion: VERTICAL.seleccion,
    });
    return {
      booking: moved,
      meetingLink: moved.meetingLink,
      linkPending: moved.linkPending,
      label,
      service: null,
      resource: { id: chosen.id, name: chosen.name },
      resourceLabel,
    };
  }
  return resourceResult(
    moved,
    settings,
    input.now,
    { id: service.id, name: service.name, durationMinutes: service.durationMinutes, instructions: service.instructions },
    chosen
  );
}

/**
 * Reprograma la PRÓXIMA cita activa de la conversación. Es el camino del
 * agente: mover una cita no debería obligar a pausar la IA y pasarle el
 * problema a un humano.
 */
export async function rescheduleForConversation(input: {
  organizationId: string;
  conversationId: string;
  startUtc: string;
  now?: Date;
}): Promise<BookingResult> {
  const db = getDb();
  const now = input.now ?? new Date();

  const convRows = await db
    .select({ contactId: schema.conversation.contactId })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  const conv = convRows[0];
  if (!conv) throw new BookingError("not_found", "Conversación no encontrada");

  // Mismas reglas que al crear: el instante nuevo tiene que haberse ofrecido.
  const offers = await getOffers(input.organizationId, input.conversationId);
  const offered = findOffered(offers, input.startUtc);
  if (!offered) {
    throw new BookingError(
      "slot_not_offered",
      "Ese horario no se ofreció en esta conversación",
      offers
    );
  }

  const rows = await db
    .select()
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        input.organizationId,
        and(
          eq(schema.booking.contactId, conv.contactId),
          eq(schema.booking.kind, "session"),
          eq(schema.booking.status, "agendada"),
          gte(schema.booking.scheduledAt, now)
        )
      )
    )
    .orderBy(asc(schema.booking.scheduledAt))
    .limit(1);

  const target = rows[0];
  if (!target) {
    throw new BookingError("not_found", "No hay una cita activa que mover");
  }

  const result = await rescheduleBooking({
    organizationId: input.organizationId,
    bookingId: target.id,
    startUtc: input.startUtc,
    // 200 — Con quien se ofreció (puede ser otro barbero que el de antes).
    ...(offered.resourceId ? { resourceId: offered.resourceId } : {}),
    ...(offered.serviceId ? { serviceId: offered.serviceId } : {}),
    now: input.now,
  });
  await clearOffers(input.organizationId, input.conversationId).catch(() => {});
  return result;
}

/** Idempotente: cancelar una cita ya cancelada no falla ni cambia nada. */
export async function cancelBooking(input: {
  organizationId: string;
  bookingId: string;
}): Promise<void> {
  const db = getDb();
  const booking = await getOwnBooking(input.organizationId, input.bookingId);
  if (booking.status === "cancelada") return;

  await db
    .update(schema.booking)
    .set({ status: "cancelada", updatedAt: new Date() })
    .where(eq(schema.booking.id, booking.id));

  const settings = await getSettings(input.organizationId);
  await withConnector(booking, settings, async (conn, externalRef) => {
    await conn.deleteMeeting(externalRef);
  });

  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: booking.id },
  });
}

export async function markBookingStatus(input: {
  organizationId: string;
  bookingId: string;
  status: "realizada" | "no_show";
}): Promise<void> {
  const db = getDb();
  const booking = await getOwnBooking(input.organizationId, input.bookingId);
  try {
    await db
      .update(schema.booking)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(schema.booking.id, booking.id));
  } catch (err) {
    // Reactivar a `realizada` un instante que otra cita ya ocupa.
    if (isUniqueViolation(err)) {
      throw new BookingError("slot_taken", "Ese horario ya está ocupado");
    }
    throw err;
  }
  // 200 — Asistió: el lead pasa a la etapa del giro (`VERTICAL.etapas`).
  // Best-effort: marcar la cita ya quedó en firme.
  if (input.status === "realizada" && booking.kind === "session" && booking.contactId) {
    await alRealizarCita(input.organizationId, booking.contactId);
  }
  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: booking.id },
  });
}

/**
 * Reintenta la entrega de una cita que quedó sin enlace porque el proveedor
 * falló. Habla con el conector con el que NACIÓ la cita, no con el activo.
 *
 * Sin esto, un hipo del proveedor sería una pérdida silenciosa que nadie
 * repara — que es exactamente lo que pasa hoy en el fork.
 */
export async function retryMeetingLink(input: {
  organizationId: string;
  bookingId: string;
}): Promise<BookingResult> {
  const booking = await getOwnBooking(input.organizationId, input.bookingId);
  if (!booking.linkPending) {
    throw new BookingError("invalid", "Esta cita no tiene un enlace pendiente");
  }
  const settings = await getSettings(input.organizationId);
  const contactName = booking.contactId
    ? await getContactName(input.organizationId, booking.contactId)
    : "";
  const delivered = await deliverMeeting(
    booking,
    settings,
    contactName,
    await bookingNames(input.organizationId, booking)
  );

  publish(input.organizationId, {
    type: "booking.updated",
    data: { bookingId: delivered.id },
  });
  return {
    booking: delivered,
    meetingLink: delivered.meetingLink,
    linkPending: delivered.linkPending,
    label: labelInTz(delivered.scheduledAt.toISOString(), settings.timezone),
  };
}

/**
 * Crea la reunión en el proveedor y la guarda en la cita.
 *
 * SANDBOX: una cita del Laboratorio jamás llega a un conector. La aserción va
 * aquí, ANTES de resolver cuál es, para que valga igual para todos — hoy y
 * para el que agregue un fork mañana.
 */
async function deliverMeeting(
  booking: BookingRow,
  settings: CalendarSettings,
  contactName: string,
  names?: { serviceName?: string | null; resourceName?: string | null }
): Promise<BookingRow> {
  if (booking.isTest) return booking;
  const connectorId = (booking.connector ?? settings.connector) as ConnectorId;

  try {
    const conn = await bindConnector(
      booking.organizationId,
      connectorId,
      settings
    );

    // Si la cita YA tiene reunión, esto es un reintento: se vuelve a leer, no
    // se crea otra. Sin esta rama, reintentar el enlace de un evento de Google
    // dejaría al dueño con dos citas en su calendario.
    const meeting =
      booking.externalRef && conn.refreshMeeting
        ? await conn.refreshMeeting(booking.externalRef)
        : await conn.createMeeting({
            // 200 — "Corte clásico con Luis · Ana"; sin recurso, el de siempre.
            topic: meetingTopic({
              contactName,
              serviceName: names?.serviceName,
              resourceName: names?.resourceName,
              seleccion: VERTICAL.seleccion,
            }),
            startUtc: booking.scheduledAt.toISOString(),
            durationMinutes: booking.durationMinutes,
            timezone: settings.timezone,
            notes: booking.notes ?? undefined,
          });

    return await persistDelivery(booking.id, {
      externalRef: meeting.externalId ?? booking.externalRef,
      meetingLink: meeting.joinUrl,
      // Un conector que promete enlace por cita y no lo trajo todavía deja la
      // cita "sin enlace" — reintentable. `enlace-fijo` sin sala configurada,
      // en cambio, no tiene nada pendiente: simplemente no hay enlace.
      linkPending: CONNECTOR_META[connectorId].perBookingLink && !meeting.joinUrl,
    });
  } catch (err) {
    console.warn(
      `[agenda] el conector ${connectorId} no pudo entregar la reunión: ${err}`
    );
    if (err instanceof ConnectorError && err.isAuthError) {
      await markConnectorAuthError(booking.organizationId, connectorId).catch(
        () => {}
      );
    }
    // La cita ya existe y se queda: el enlace es lo único que falta. Se
    // conserva la referencia externa si ya la había, para que el reintento
    // sepa que no debe crear otra reunión.
    return await persistDelivery(booking.id, {
      externalRef: booking.externalRef,
      meetingLink: null,
      linkPending: true,
    });
  }
}

async function persistDelivery(
  bookingId: string,
  values: {
    externalRef: string | null;
    meetingLink: string | null;
    linkPending: boolean;
  }
): Promise<BookingRow> {
  const db = getDb();
  const rows = await db
    .update(schema.booking)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.booking.id, bookingId))
    .returning();
  return rows[0]!;
}

/**
 * Corre un efecto sobre el proveedor de una cita ya creada (mover, borrar).
 * Best-effort y con el mismo guardarraíl de sandbox. Sin `external_ref` no hay
 * nada que mover: el conector no generó reunión (p. ej. el enlace fijo).
 */
async function withConnector(
  booking: BookingRow,
  settings: CalendarSettings,
  run: (
    conn: Awaited<ReturnType<typeof bindConnector>>,
    externalRef: string
  ) => Promise<void>
): Promise<void> {
  if (booking.isTest || !booking.externalRef) return;
  const connectorId = (booking.connector ?? settings.connector) as ConnectorId;
  try {
    const conn = await bindConnector(
      booking.organizationId,
      connectorId,
      settings
    );
    await run(conn, booking.externalRef);
  } catch (err) {
    console.warn(`[agenda] efecto en ${connectorId} falló: ${err}`);
    if (err instanceof ConnectorError && err.isAuthError) {
      await markConnectorAuthError(booking.organizationId, connectorId).catch(
        () => {}
      );
    }
  }
}

/**
 * Alternativas frescas para re-ofrecer. Si hay conversación, quedan
 * REGISTRADAS como su nueva oferta: el cliente puede aceptar una de inmediato
 * y la validación seguirá siendo válida.
 */
async function refreshOffer(
  organizationId: string,
  conversationId: string | null | undefined,
  opts: { now?: Date }
): Promise<OfferedSlot[]> {
  let fresh: AvailableSlot[] = [];
  try {
    fresh = (await computeAvailability(organizationId, { now: opts.now })).slice(
      0,
      FRESH_ALTERNATIVES
    );
  } catch (err) {
    console.warn(`[agenda] no pude calcular alternativas: ${err}`);
    return [];
  }
  const offers: OfferedSlot[] = fresh.map((s) => ({
    startUtc: s.startUtc,
    label: s.label,
  }));
  if (conversationId && offers.length > 0) {
    await replaceOffers(organizationId, conversationId, offers).catch((err) => {
      console.warn(`[agenda] no pude registrar la nueva oferta: ${err}`);
    });
  }
  return offers;
}

/**
 * 200 — Nombres del servicio y el recurso de una cita (para el título de la
 * reunión al reintentar). Sin ids no toca la base: la agenda de siempre no
 * paga una consulta de más.
 */
async function bookingNames(
  organizationId: string,
  booking: BookingRow
): Promise<{ serviceName: string | null; resourceName: string | null }> {
  if (!booking.serviceId && !booking.resourceId) return { serviceName: null, resourceName: null };
  const catalog = await loadCatalog(organizationId, { includeInactive: true });
  return {
    serviceName: catalog.services.find((s) => s.id === booking.serviceId)?.name ?? null,
    resourceName: catalog.resources.find((r) => r.id === booking.resourceId)?.name ?? null,
  };
}

/**
 * 200 — Alternativas frescas en la agenda por recurso: el mismo servicio y,
 * cuando el cliente eligió, el mismo recurso. Quedan REGISTRADAS como la nueva
 * oferta, con su recurso y servicio, igual que en `refreshOffer`.
 */
async function refreshResourceOffer(
  organizationId: string,
  conversationId: string | null | undefined,
  opts: {
    catalog: Catalog;
    serviceId: string;
    resourceId: string | null;
    settings: CalendarSettings;
    now?: Date;
  }
): Promise<OfferedSlot[]> {
  let offers: OfferedSlot[] = [];
  try {
    const service = opts.catalog.services.find((s) => s.id === opts.serviceId);
    if (!service) return [];
    const eligible = eligibleResources(opts.catalog, service);
    const resources = opts.resourceId
      ? eligible.filter((r) => r.id === opts.resourceId)
      : eligible;
    const fresh = await computeResourceAvailability(organizationId, {
      service,
      resources,
      settings: opts.settings,
      now: opts.now,
    });
    offers = fresh.slice(0, FRESH_ALTERNATIVES).map((s) => ({
      startUtc: s.startUtc,
      label: s.label,
      resourceId: s.resourceId,
      serviceId: s.serviceId,
    }));
  } catch (err) {
    console.warn(`[agenda] no pude calcular alternativas: ${err}`);
    return [];
  }
  if (conversationId && offers.length > 0) {
    await replaceOffers(organizationId, conversationId, offers).catch((err) => {
      console.warn(`[agenda] no pude registrar la nueva oferta: ${err}`);
    });
  }
  return offers;
}

async function getOwnBooking(
  organizationId: string,
  bookingId: string
): Promise<BookingRow> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        eq(schema.booking.id, bookingId)
      )
    )
    .limit(1);
  if (!rows[0]) throw new BookingError("not_found", "Cita no encontrada");
  return rows[0];
}

async function getContactName(
  organizationId: string,
  contactId: string
): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ name: schema.contact.name })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        eq(schema.contact.id, contactId)
      )
    )
    .limit(1);
  return rows[0]?.name ?? "";
}

/**
 * El lead avanza a la siguiente etapa abierta al agendar — solo hacia adelante,
 * nunca retrocede.
 *
 * Pasa por `moveLeadToStage`, la única puerta que puede escribir `stage_id`:
 * mover el lead y registrar el movimiento en la bitácora son la misma
 * operación. Escribir el UPDATE aquí no truena, solo hace que las gráficas
 * mientan meses después — y hay un test de vigilancia que lo impide.
 */
async function advanceLeadStage(
  organizationId: string,
  contactId: string,
  source: "bot" | "dueno"
): Promise<void> {
  // 200 — Si el giro nombra su etapa de "cita agendada", va ahí (desde donde
  // esté: quien vuelve a los 21 días también reagenda). Si esa etapa no existe
  // en el tablero, el avance de siempre.
  const etapa = VERTICAL.etapas.citaAgendada;
  if (etapa) {
    const res = await moverContactoAEtapa(organizationId, contactId, etapa, { source });
    if (res !== "stage_not_found") return;
  }
  const db = getDb();
  const leads = await db
    .select({ id: schema.lead.id, stageId: schema.lead.stageId })
    .from(schema.lead)
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        eq(schema.lead.contactId, contactId)
      )
    )
    .limit(1);
  const lead = leads[0];
  if (!lead) return;

  const stages = await db
    .select({
      id: schema.pipelineStage.id,
      position: schema.pipelineStage.position,
      kind: schema.pipelineStage.kind,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  const currentIdx = stages.findIndex((s) => s.id === lead.stageId);
  if (currentIdx < 0) return;
  const nextOpen = stages.find((s, i) => i > currentIdx && s.kind === "open");
  if (!nextOpen) return; // ya está en la última etapa abierta (o en un ancla)

  await moveLeadToStage({
    organizationId,
    leadId: lead.id,
    toStageId: nextOpen.id,
    source,
    extra: { lastActivityAt: new Date() },
  });
}

/** Citas que ocupan agenda de verdad. */
export const ACTIVE_STATUSES = ["agendada", "realizada"] as const;

/** ¿Hay alguna cita activa para este contacto? Lo usa el agente. */
export async function hasActiveBooking(
  organizationId: string,
  contactId: string,
  now = new Date()
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        and(
          eq(schema.booking.contactId, contactId),
          eq(schema.booking.kind, "session"),
          inArray(schema.booking.status, [...ACTIVE_STATUSES]),
          gte(schema.booking.scheduledAt, now)
        )
      )
    )
    .limit(1);
  return rows.length > 0;
}
