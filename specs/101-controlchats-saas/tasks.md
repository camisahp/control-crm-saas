# Tasks: ControlChats SaaS multi-tenant

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md)

## Phase 1 — Gobierno y base

- [x] T001 Documentar y ratificar la enmienda constitucional 1.5.0 para edición cloud, conservando self-hosted.
- [x] T002 [P] Inventariar fronteras actuales de tenant, sesión, agenda, Meta e infraestructura en `research.md`.
- [x] T003 [P] Definir spec, plan y tareas de ciclo completo en `specs/101-controlchats-saas/`.
- [ ] T004 Añadir documentación de variables `EDITION` y `BASE_DOMAIN` sin activar cloud.

## Phase 2 — Fundación de aislamiento

- [x] T005 [US1] Escribir pruebas de clasificación de Host en `tests/unit/tenant-host.test.ts`.
- [x] T006 [US1] Implementar el resolver puro en `src/lib/tenant-host.ts`.
- [ ] T007 [US1] Diseñar y probar el guard servidor que liga Host, organización y membresía.
- [ ] T008 [US1] Adaptar Better Auth a cookies host-only, trusted origins y sesión por host.
- [ ] T009 [US1] Crear pruebas A/B que demuestren aislamiento de sesión y datos.

## Phase 3 — Provisioning y perfil universal

- [ ] T010 [US2] Diseñar migración aditiva para perfil operativo por `organization_id`.
- [ ] T011 [US2] Reemplazar vertical SPA global por perfil del tenant y backfill seguro.
- [ ] T012 [US2] Adaptar catálogo, recursos, disponibilidad y UI a etiquetas configurables.
- [ ] T013 [US3] Completar notas y etiquetas org-scoped en contacto/conversación y verificar UI.
- [ ] T014 [US2] Ejecutar pruebas de dos giros y recursos múltiples.

## Phase 4 — Plataforma y Meta

- [ ] T015 [US1] Construir alta controlada de tenant, propietario y slug desde plataforma.
- [ ] T016 [US4] Diseñar estados, callback idempotente y credenciales por organización para Embedded Signup.
- [ ] T017 [US4] Implementar y probar onboarding Meta con sandbox y auditoría.
- [ ] T018 [US4] Hacer el webhook y sus credenciales tenant-aware sin exponer secretos.
- [ ] T019 [US5] Conectar atribución/CAPI existente a configuración por tenant y cubrir fallos best-effort.

## Phase 5 — Operación y lanzamiento

- [ ] T020 Crear guía de App Review/Advanced Access y evidencia de onboarding.
- [ ] T021 Preparar checklist de DNS wildcard, TLS y variables Coolify para aprobación explícita.
- [ ] T022 Con autorización explícita, aplicar cambio de dominio/infraestructura y verificar healthcheck.
- [ ] T023 Ejecutar matriz técnica, self-test UI y aislamiento A/B; documentar cualquier verificación humana pendiente.

## Execution order

T001–T004 → T005–T009 → T010–T014 → T015–T019 → T020–T023. El trabajo actual
comienza por T005/T006: no modifica datos, sesión ni infraestructura y crea la
barrera que el resto necesita.
