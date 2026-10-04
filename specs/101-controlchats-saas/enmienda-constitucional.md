# Enmienda constitucional 1.5.0 — Edición cloud ControlChats

**Propuesta y aprobación del responsable**: 2026-10-04, mediante la decisión de proceder con ControlChats como SaaS multitenant para distintos negocios de servicios, con onboarding dentro del CRM.

## Cambio

La Constitución 1.4.0 definía el producto exclusivamente como una instancia self-hosted para un negocio y dejaba fuera la plataforma centralizada. Esta enmienda conserva esa distribución como `EDITION=estandar` y añade `EDITION=cloud`: una única instancia operada por ControlChats sirve muchas organizaciones aisladas.

En cloud, el tenant se deriva del Host (`{slug}.controlchats.com`), cada sesión es host-only y se valida contra una membresía de esa organización. Las organizaciones solo nacen desde alta controlada de plataforma, no de registro público. La plataforma no incorpora billing, borrado automático, reventa ni costeo de IA en esta enmienda: se decidirán en specs posteriores.

## Garantías que no cambian

- Todo dato y secreto sigue `organization_id` y aislamiento org-first.
- Credenciales por cliente siguen cifradas y nunca se exponen.
- Las integraciones externas se conservan detrás de adaptadores, son idempotentes y degradan sin perder la operación core.
- Ningún cambio de DNS, TLS, Coolify, App Review o producción se autoriza por esta enmienda; son pasos operativos posteriores con checklist y aprobación.

## Impacto

- **Principio II** aclara ambas ediciones sin añadir proveedores obligatorios.
- **Principio III** pasa de multi-tenancy latente a modo cloud exigible cuando `EDITION=cloud` está activo.
- **Principio VIII** admite la capa de plataforma mínima (alta y administración segura), conservando el foco de CRM de conversaciones por negocio.
- **Principio IX** exige un guion A/B de aislamiento antes de declarar cloud terminado.

**Versión**: 1.4.0 → 1.5.0 (MINOR: expansión material de la forma de operar, sin eliminar la edición self-hosted).
