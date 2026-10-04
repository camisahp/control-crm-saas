import { BookingError } from "@/server/agenda/errors";
import type { BookingResult } from "@/server/agenda/service";

/**
 * 015 — La traducción entre el dominio y HTTP, en un solo sitio.
 *
 * Vive aquí y no dentro de los `route.ts` por dos razones: Next solo admite
 * handlers como exports de una ruta (así que no serían testeables), y porque
 * los códigos y la FORMA del error son contrato observable, no un detalle.
 *
 * Las dos lecciones que costaron caro en producción y que este módulo fija:
 *  - Crear responde **201**, no 200. Un cliente que validaba `=== 200` dejó a
 *    todos los leads sin agendar durante horas, y los mocks no lo vieron
 *    porque respondían 200.
 *  - El error va ANIDADO (`{"error":{"code":…}}`) con `slots` como HERMANO. Un
 *    mock con la forma plana escondió el camino de re-oferta durante semanas:
 *    todo 409 se leía como conflicto genérico y las alternativas nunca se
 *    ofrecían.
 */

export type BookingPayload = {
  bookingId: string;
  /** Ausente en una cita PRESENCIAL: el enlace es del equipo, no del cliente. */
  meetingLink?: string | null;
  linkPending: boolean;
  label: string;
  /** 200 — Solo en la cita presencial: no hay enlace que dar ni que prometer. */
  presencial?: true;
  /** 200 — Solo en la agenda por recurso. */
  service?: string;
  resource?: string;
  /** "con Luis" cuando el cliente elige; null cuando asigna el sistema. */
  resourceLabel?: string | null;
  /** Indicaciones antes de la cita, para repetírselas al cliente. */
  instructions?: string | null;
};

/**
 * El cuerpo de una reserva para quien conduce la conversación.
 *
 * `presencial` (200, `VERTICAL.cita.presencial`): la cita es en el local del
 * negocio y el conector es solo el calendario del equipo. Entonces el enlace
 * NO viaja —ni siquiera como null, que un cliente podría leer como "todavía
 * no"— y `linkPending` va en false: no hay nada que prometer. La superficie
 * del operador llama sin opciones y lo sigue viendo.
 */
export function bookingPayload(
  result: BookingResult,
  opts: { presencial?: boolean } = {}
): BookingPayload {
  const presencial = opts.presencial === true;
  return {
    bookingId: result.booking.id,
    ...(presencial ? {} : { meetingLink: result.meetingLink }),
    /**
     * true ⇒ la cita EXISTE pero el proveedor aún no entregó el enlace.
     * Confirma la cita y di que el enlace llega luego; no prometas uno que no
     * tienes.
     */
    linkPending: presencial ? false : result.linkPending,
    label: result.label,
    ...(presencial ? { presencial: true as const } : {}),
    ...(result.service
      ? { service: result.service.name, instructions: result.service.instructions }
      : {}),
    ...(result.resource
      ? { resource: result.resource.name, resourceLabel: result.resourceLabel ?? null }
      : {}),
  };
}

export function bookingErrorStatus(code: BookingError["code"]): number {
  switch (code) {
    case "not_found":
      return 404;
    case "invalid":
      return 422;
    case "slot_taken":
    case "slot_not_offered":
      return 409;
  }
}

/** Traduce un `BookingError` al sobre estándar. Cualquier otro error se relanza. */
export function bookingErrorResponse(err: unknown): Response {
  if (!(err instanceof BookingError)) throw err;
  const code = err.code === "invalid" ? "invalid_body" : err.code;
  return Response.json(
    { error: { code, message: err.message }, slots: err.slots },
    { status: bookingErrorStatus(err.code) }
  );
}
