/**
 * 200 — La forma de la configuración "vertical" (a qué giro sirve esta
 * instancia) y los helpers puros que la leen.
 *
 * El VALOR vive aparte, en `src/lib/vertical.ts`, a propósito: el mismo código
 * sirve a una barbería (el cliente elige barbero) y a un spa (el sistema asigna
 * cabina). Cada instalación cambia SOLO ese archivo de datos; esto no se toca.
 *
 * Sin BD ni `process.env` aquí dentro salvo `regresoDias`, que recibe el
 * entorno como parámetro: se puede importar desde el cliente (la UI pinta las
 * etiquetas "Barbero/Barberos") y se prueba sin montar nada.
 */

export type EtapaKind = "open" | "won" | "lost";

export type EtapaSembrada = { name: string; kind: EtapaKind };

/**
 * `cliente`: el cliente elige con quién (o "cualquiera"), y se le dice.
 * `automatica`: el sistema asigna el primer recurso libre; el cliente nunca
 * elige ni necesita saber cuál le tocó.
 */
export type ModoSeleccion = "cliente" | "automatica";

export type VerticalConfig = {
  /** Identificador corto del giro, solo informativo ("barberia", "spa"). */
  clave: string;
  /** Cómo se llama lo que se agenda: el barbero, la cabina, el consultorio. */
  recurso: { singular: string; plural: string };
  /** Cómo se llama lo que se vende: el servicio, el paquete, el tratamiento. */
  servicio: { singular: string; plural: string };
  seleccion: ModoSeleccion;
  cita: {
    /**
     * La cita es EN PERSONA, en el local del negocio. El conector (Zoom,
     * Google) sigue sirviendo de calendario de registro para el equipo, pero
     * su enlace JAMÁS llega al cliente: ninguna respuesta de `/api/bot/*` lo
     * lleva y ningún texto para el cliente lo menciona. El operador lo sigue
     * viendo en Citas.
     */
    presencial: boolean;
  };
  etapas: {
    /**
     * Etapas con las que nace la organización (primer registro). Vacío ⇒ las
     * de siempre de Vocero. Deben incluir al menos una `open`: la primera
     * `open` es donde nace cada lead nuevo.
     */
    seed: readonly EtapaSembrada[];
    /** Consultar horarios de un servicio lleva al lead aquí (solo hacia adelante). null = no aplica. */
    servicioElegido: string | null;
    /** Al crear la cita. null = el avance de siempre (siguiente etapa abierta). */
    citaAgendada: string | null;
    /** Al marcar la cita como realizada. null = no se mueve. */
    citaRealizada: string | null;
    /**
     * Pasados `dias` desde la última cita realizada, el lead que sigue en
     * `citaRealizada` pasa a `etapa` (trabajo periódico). null = no hay regreso.
     * `REGRESO_DIAS` en el entorno sobreescribe `dias` (útil para probar).
     */
    regreso: { etapa: string; dias: number } | null;
  };
};

/**
 * Nombre normalizado para comparar lo que escribe una persona (o un modelo)
 * contra lo configurado: sin mayúsculas, sin acentos y con los espacios
 * colapsados. «Asistió», «asistio» y « ASISTIÓ » son la misma etapa; «Luis» y
 * «luis» el mismo barbero.
 */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Dos nombres son el mismo, sin importar mayúsculas ni acentos? */
export function mismoNombre(a: string, b: string): boolean {
  return normalizarNombre(a) === normalizarNombre(b);
}

/**
 * Días del regreso vigentes: `REGRESO_DIAS` si es un entero ≥ 0, si no los
 * de la configuración. null si el giro no tiene regreso.
 */
export function regresoDias(
  config: VerticalConfig,
  raw: string | undefined
): number | null {
  if (!config.etapas.regreso) return null;
  const texto = (raw ?? "").trim();
  if (texto !== "") {
    const n = Number(texto);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return config.etapas.regreso.dias;
}

/** "Barberos y servicios": el título de la sección de ajustes. */
export function tituloCatalogo(config: VerticalConfig): string {
  return `${config.recurso.plural} y ${config.servicio.plural.toLowerCase()}`;
}
