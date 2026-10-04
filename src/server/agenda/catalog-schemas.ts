import { z } from "zod";
import { RESOURCE_COLOR_KEYS } from "@/lib/resource-colors";

/**
 * 200 — Lo que aceptan las rutas del catálogo (`/api/agenda/*`). Zod en la
 * frontera, como todo input externo; la normalización fina (horario, nombres
 * repetidos, ids ajenos) vive en `catalog-admin.ts`.
 */

const intervalSchema = z.object({ start: z.string(), end: z.string() });

const name = z.string().trim().min(1).max(80);
const texto = z.string().max(2000).nullish();

export const resourceCreateSchema = z.object({
  name,
  color: z.enum(RESOURCE_COLOR_KEYS as [string, ...string[]]).nullish(),
  /** null o ausente = el horario del negocio. */
  weeklyHours: z.record(z.string(), z.array(intervalSchema)).nullish(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  serviceIds: z.array(z.string().min(1)).max(500).optional(),
});

export const resourcePatchSchema = resourceCreateSchema.partial();

export const serviceCreateSchema = z.object({
  name,
  durationMinutes: z.number().int().min(5).max(600),
  /** Centavos enteros en la moneda del negocio. */
  priceCents: z.number().int().min(0).max(100_000_000).nullish(),
  description: texto,
  instructions: texto,
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(10_000).optional(),
  resourceIds: z.array(z.string().min(1)).max(500).optional(),
});

export const servicePatchSchema = serviceCreateSchema.partial();
