/**
 * 200 — El color de cada recurso (barbero, cabina) en el calendario de Citas.
 *
 * Es la PALETA DE IDENTIDAD de los avatares (`src/lib/utils.ts`), la excepción
 * deliberada a "nada de colores literales" de `tailwind.config.ts`: tonos
 * medios saturados, legibles con texto claro (`text-brand-fg`) en los dos
 * temas. En la base se guarda la CLAVE, nunca la clase: cambiar un tono aquí
 * no deja filas huérfanas.
 */

export const RESOURCE_COLORS = {
  azul: { label: "Azul", bg: "bg-[#3985d1]" },
  terracota: { label: "Terracota", bg: "bg-[#d17139]" },
  violeta: { label: "Violeta", bg: "bg-[#9e39d1]" },
  verde: { label: "Verde", bg: "bg-[#30a657]" },
  frambuesa: { label: "Frambuesa", bg: "bg-[#ce3b6c]" },
  ambar: { label: "Ámbar", bg: "bg-[#b67c20]" },
  turquesa: { label: "Turquesa", bg: "bg-[#30a6a6]" },
  indigo: { label: "Índigo", bg: "bg-[#6954d4]" },
} as const;

export type ResourceColor = keyof typeof RESOURCE_COLORS;

export const RESOURCE_COLOR_KEYS = Object.keys(RESOURCE_COLORS) as ResourceColor[];

export function isResourceColor(value: unknown): value is ResourceColor {
  return typeof value === "string" && value in RESOURCE_COLORS;
}

/**
 * La clase de fondo de un recurso. Sin color elegido se reparte por su lugar
 * en la lista, para que dos barberos nunca salgan iguales por omisión.
 */
export function resourceColorClass(color: string | null | undefined, index: number): string {
  if (isResourceColor(color)) return RESOURCE_COLORS[color].bg;
  const key = RESOURCE_COLOR_KEYS[Math.abs(index) % RESOURCE_COLOR_KEYS.length] ?? "azul";
  return RESOURCE_COLORS[key].bg;
}
