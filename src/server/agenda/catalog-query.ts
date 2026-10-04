import { VERTICAL } from "@/lib/vertical";
import {
  activeNames,
  eligibleResources,
  findByRef,
  isAnyRef,
  offersService,
  type Catalog,
  type CatalogResource,
  type CatalogService,
} from "@/server/agenda/catalog";

/**
 * 200 — De "corte clásico" y "Luis" (lo que escribe un modelo o una persona)
 * a filas del catálogo, con los errores que le dicen a quien pregunta cómo
 * corregirse: cada 422 lleva la lista de nombres VÁLIDOS, para que el cerebro
 * le pregunte al cliente en vez de inventar.
 *
 * PURA: recibe el catálogo ya cargado (solo lo ofrecible).
 */

export type ResolucionError = {
  error: { code: string; message: string };
  services?: string[];
  resources?: string[];
};

export type Resolucion =
  | {
      ok: true;
      service: CatalogService;
      /** El que se pidió; null = cualquiera. */
      resource: CatalogResource | null;
      /** En quién buscar, en orden de preferencia. */
      resources: CatalogResource[];
    }
  | { ok: false; body: ResolucionError };

export function resolverServicioYRecurso(
  catalog: Catalog,
  serviceRef: string | null | undefined,
  resourceRef: string | null | undefined
): Resolucion {
  const servicios = activeNames(catalog.services);
  const servicioSg = VERTICAL.servicio.singular.toLowerCase();
  const recursoSg = VERTICAL.recurso.singular.toLowerCase();

  if (!serviceRef?.trim()) {
    return {
      ok: false,
      body: {
        error: {
          code: "service_required",
          message:
            servicios.length > 0
              ? `Falta el ${servicioSg}: pregúntale al cliente cuál de estos quiere`
              : `El negocio aún no tiene ${VERTICAL.servicio.plural.toLowerCase()} configurados`,
        },
        services: servicios,
      },
    };
  }

  const service = findByRef(catalog.services, serviceRef);
  if (!service) {
    return {
      ok: false,
      body: {
        error: {
          code: "unknown_service",
          message: `No reconozco el ${servicioSg} "${serviceRef.trim()}": usa uno de estos nombres`,
        },
        services: servicios,
      },
    };
  }

  const eligible = eligibleResources(catalog, service);
  if (isAnyRef(resourceRef)) {
    return { ok: true, service, resource: null, resources: eligible };
  }

  const resource = findByRef(catalog.resources, resourceRef);
  if (!resource) {
    return {
      ok: false,
      body: {
        error: {
          code: "unknown_resource",
          message: `No reconozco el ${recursoSg} "${String(resourceRef).trim()}": usa uno de estos nombres`,
        },
        resources: activeNames(catalog.resources),
      },
    };
  }
  if (!offersService(resource, service)) {
    return {
      ok: false,
      body: {
        error: {
          code: "resource_not_offering_service",
          message: `${resource.name} no ofrece ${service.name}; lo ofrecen estos`,
        },
        resources: eligible.map((r) => r.name),
      },
    };
  }
  return { ok: true, service, resource, resources: [resource] };
}
