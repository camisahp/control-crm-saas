import type { VerticalConfig } from "@/lib/vertical-config";

/**
 * 200 — A qué giro sirve ESTA instancia. Es el único archivo que cambia entre
 * instalaciones de la agenda por recurso: el código lo lee todo de aquí.
 *
 * Este es el spa: el cliente elige un PAQUETE y el sistema le asigna una
 * cabina libre durante todo el paquete (nunca elige cabina). Una barbería,
 * por ejemplo, sería:
 *
 *   recurso: { singular: "Barbero", plural: "Barberos" },
 *   servicio: { singular: "Servicio", plural: "Servicios" },
 *   seleccion: "cliente",
 *   etapas: {
 *     seed: [Nuevo (open), Cita agendada (open), Asistió (won),
 *            Vuelve en 3 semanas (open), Perdido (lost)],
 *     servicioElegido: null,
 *     citaAgendada: "Cita agendada",
 *     citaRealizada: "Asistió",
 *     regreso: { etapa: "Vuelve en 3 semanas", dias: 21 },
 *   }
 *
 * Los nombres de etapa se buscan sin distinguir mayúsculas ni acentos; si una
 * etapa nombrada aquí no existe en el tablero, esa automatización no hace nada
 * (y en `citaAgendada`, se usa el avance de siempre).
 */
export const VERTICAL: VerticalConfig = {
  clave: "spa",
  recurso: { singular: "Cabina", plural: "Cabinas" },
  servicio: { singular: "Paquete", plural: "Paquetes" },
  seleccion: "automatica",
  // En persona: Zoom es solo el calendario de registro del equipo; el cliente
  // nunca recibe un enlace de reunión.
  cita: { presencial: true },
  etapas: {
    seed: [
      { name: "Nuevo", kind: "open" },
      { name: "Paquete elegido", kind: "open" },
      { name: "Reservado", kind: "open" },
      { name: "Asistió", kind: "won" },
      { name: "Perdido", kind: "lost" },
    ],
    servicioElegido: "Paquete elegido",
    citaAgendada: "Reservado",
    citaRealizada: "Asistió",
    regreso: null,
  },
};
