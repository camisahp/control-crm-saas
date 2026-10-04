/**
 * Clasifica un Host sin consultar BD ni leer el entorno.
 *
 * La resolución de la organización (slug -> organization_id) pertenece a la
 * capa server-side. Mantener este paso puro permite probar la frontera antes
 * de conectar sesión, cookies o consultas de datos.
 */
export type TenantHost =
  | { kind: "landing"; host: string }
  | { kind: "admin"; host: string }
  | { kind: "onboarding"; host: string }
  | { kind: "tenant"; host: string; slug: string }
  | { kind: "unknown"; host: string };

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "admin",
  "alta",
  "api",
  "app",
  "mail",
  "smtp",
  "imap",
  "static",
  "assets",
  "cdn",
  "status",
  "soporte",
  "ayuda",
  "blog",
  "docs",
  "panel",
]);

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Elimina puerto, mayúsculas y punto final de un Host HTTP. */
export function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase().replace(/\.+$/, "");
  if (!trimmed) return "";

  // Los hosts del producto son DNS, no IPv6. Aun así, no reinterpretamos una
  // dirección entre corchetes como tenant: queda como host desconocido.
  if (trimmed.startsWith("[")) return trimmed;

  const colon = trimmed.lastIndexOf(":");
  if (colon === -1) return trimmed;
  const port = trimmed.slice(colon + 1);
  return /^\d+$/.test(port) ? trimmed.slice(0, colon) : trimmed;
}

/**
 * Resuelve superficies de ControlChats y un slug de cliente de primer nivel.
 * `baseDomain` se inyecta para soportar producción y `*.lvh.me` en local.
 */
export function resolveTenantHost(host: string, baseDomain: string): TenantHost {
  const normalizedHost = normalizeHost(host);
  const normalizedBase = normalizeHost(baseDomain);
  if (!normalizedHost || !normalizedBase) {
    return { kind: "unknown", host: normalizedHost };
  }

  if (
    normalizedHost === normalizedBase ||
    normalizedHost === `www.${normalizedBase}`
  ) {
    return { kind: "landing", host: normalizedHost };
  }

  const suffix = `.${normalizedBase}`;
  if (!normalizedHost.endsWith(suffix)) {
    return { kind: "unknown", host: normalizedHost };
  }

  // Solo se permiten subdominios de primer nivel: a.b.controlchats.com no
  // puede heredar ni adivinar el tenant b.
  const subdomain = normalizedHost.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) {
    return { kind: "unknown", host: normalizedHost };
  }
  if (subdomain === "admin") return { kind: "admin", host: normalizedHost };
  if (subdomain === "alta") {
    return { kind: "onboarding", host: normalizedHost };
  }
  if (RESERVED_SUBDOMAINS.has(subdomain) || !SLUG.test(subdomain)) {
    return { kind: "unknown", host: normalizedHost };
  }
  return { kind: "tenant", host: normalizedHost, slug: subdomain };
}
