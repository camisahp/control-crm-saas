import type { OfferedSlot } from "@/server/agenda/offers";

/**
 * 015 — El error de dominio de la agenda. Vive en su propio módulo (y
 * `service.ts` lo re-exporta tal cual) para que el camino por recurso (200)
 * pueda lanzarlo sin importar el servicio completo: una importación circular
 * entre los dos dejaba la clase `undefined` según quién cargara primero.
 */

export type BookingErrorCode =
  | "slot_taken"
  | "slot_not_offered"
  | "not_found"
  | "invalid";

export class BookingError extends Error {
  code: BookingErrorCode;
  /**
   * Horarios para re-ofrecer. En `slot_taken` son alternativas frescas YA
   * registradas como la nueva oferta de la conversación; en `slot_not_offered`
   * es lo que sí se había ofrecido.
   */
  slots: OfferedSlot[];

  constructor(
    code: BookingErrorCode,
    message: string,
    slots: OfferedSlot[] = []
  ) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.slots = slots;
  }
}

/** 23505 = unique_violation de Postgres. */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  // Drizzle envuelve el error del driver: el código real viaja en `cause`.
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505"
  );
}
