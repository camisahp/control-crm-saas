# Implementation Plan: ControlChats SaaS multi-tenant

**Branch**: `101-controlchats-saas` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

## Summary

Evolucionar el CRM actual de instancia única hacia una edición cloud de
ControlChats sin romper la edición estándar. El primer incremento introduce un
resolver puro de tenant por Host y sus pruebas. Los incrementos posteriores
ligan sesión, consultas, credenciales, agenda y onboarding Meta al tenant.

## Technical Context

**Language/Version**: TypeScript estricto, Node.js, Next.js 15 / React 19.

**Primary Dependencies**: Drizzle ORM, PostgreSQL, Better Auth, Zod; sin
dependencias de runtime nuevas para el primer incremento.

**Storage**: PostgreSQL self-hosted, migraciones Drizzle aditivas.

**Testing**: Vitest, Playwright/self-test de la UI y gates `pnpm typecheck`,
`pnpm lint`, `pnpm build`.

**Target Platform**: Coolify/Traefik y desarrollo local Windows; `*.lvh.me`
para emular subdominios localmente.

**Constraints**: secretos cifrados; cookies host-only; cero acceso cross-tenant;
no cambios de DNS, Coolify, Meta ni producción en esta fase.

## Constitution Check

**Antes de investigación: condicionado.** La Constitución 1.4.0 declara una
instancia por negocio y excluye plataforma centralizada. Este plan requiere una
enmienda 1.5.0 que conserve la edición self-hosted y admita explícitamente la
edición cloud bajo los mismos requisitos de aislamiento, soberanía y pruebas.
La enmienda se documentará y se aplicará antes de integrar cambios que alteren
sesión, provisioning o despliegue.

**Después de diseño del primer incremento: pasa parcialmente.** El resolver de
Host es puro, no añade dependencia ni datos, y es una barrera verificable. No
se activa el modo cloud ni se modifica autenticación hasta completar su diseño
y enmienda.

## Design

1. **Host resolver:** `src/lib/tenant-host.ts` normaliza el host y clasifica
   `landing`, `admin`, `onboarding`, `tenant` o `unknown`. Es determinista y no
   accede a BD, cabeceras ni variables globales; recibe `baseDomain`.
2. **Tenant guard:** una capa server-side convertirá el slug en organización,
   exigirá membresía y reemplazará la selección por primera membresía. La ruta
   estándar se conserva explícitamente mediante `EDITION=estandar`.
3. **Datos y agenda:** se sustituye la configuración global de vertical por un
   perfil operativo por `organization_id`, con migración y backfill seguro.
4. **Canal y Meta:** credenciales, verificación de webhook y estado de
   Embedded Signup se separan por organización y se cifran con el patrón actual.
5. **Infraestructura:** al final, se configura `BASE_DOMAIN`, DNS y TLS wildcard
   en Coolify; son tareas operativas con autorización explícita aparte.

## Project Structure

```text
src/
├── app/                    # rutas y UI Next.js
├── lib/tenant-host.ts       # resolver puro (nuevo)
├── lib/auth/                # Better Auth y sesión
├── server/auth/             # membresías y provisioning
├── server/agenda/           # agenda aislada por organización
└── server/whatsapp/         # canal y webhooks

drizzle/                     # migraciones SQL aditivas
tests/unit/                  # resolver y reglas de aislamiento
tests/e2e/                   # flujos visibles
specs/101-controlchats-saas/ # artefactos de esta iniciativa
```

**Structure Decision**: se mantiene el monolito Next.js existente; no se crea
un servicio nuevo mientras las fronteras de tenant puedan ser verificables en
el mismo repositorio.

## Verification Plan

- Pruebas unitarias de normalización y clasificación de Host.
- Pruebas de sesión A/B y de scoping de datos antes de activar cloud.
- Pruebas de migración/perfil de agenda por dos organizaciones.
- Sandbox Meta para Embedded Signup y reintentos de webhook.
- Matriz `EDITION=estandar`/`cloud`, agenda y atribución activadas/desactivadas.
- UI real en local con `cliente.lvh.me` antes del cambio de infraestructura.
