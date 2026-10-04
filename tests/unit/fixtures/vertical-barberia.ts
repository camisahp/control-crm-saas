import type { VerticalConfig } from "@/lib/vertical-config";

/** Config de la BARBERÍA, fija para las pruebas del motor: no dependen del giro de esta instancia. */
export const VERTICAL: VerticalConfig = {
  clave: "barberia",
  recurso: { singular: "Barbero", plural: "Barberos" },
  servicio: { singular: "Servicio", plural: "Servicios" },
  seleccion: "cliente",
  // En persona: Zoom es solo el calendario de registro del equipo; el cliente
  // nunca recibe un enlace de reunión.
  cita: { presencial: true },
  etapas: {
    seed: [
      { name: "Nuevo", kind: "open" },
      { name: "Cita agendada", kind: "open" },
      { name: "Asistió", kind: "won" },
      { name: "Vuelve en 3 semanas", kind: "open" },
      { name: "Perdido", kind: "lost" },
    ],
    servicioElegido: null,
    citaAgendada: "Cita agendada",
    citaRealizada: "Asistió",
    regreso: { etapa: "Vuelve en 3 semanas", dias: 21 },
  },
};
