# Verificación del callback — 2026-10-10

## Local, reproducible

- `pnpm install --frozen-lockfile`: correcto. Nueva dependencia sólo de
  desarrollo `@electric-sql/pglite@0.3.14`. No cambia versiones de los paquetes
  existentes; se preservó el peer de Zod de better-call del lockfile anterior.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1`:
  83 archivos, 858 pruebas correctas. Incluye el handler real por HTTP contra
  PostgreSQL aislado en memoria, con todas las migraciones de Drizzle.
- Tipos y ESLint completo: sin errores. Build Next: correcto.
- Revocación A preserva credenciales B/manual, conversación, mensaje y contacto.
  Firma falsa, callback anterior, repetición, otra identidad y sustitución manual
  no desconectan una autorización ajena/nueva. Guardado con prueba revocada falla.
- Embedded Signup simulado: canje, prueba firmada, activos, cifrado y suscripción;
  ausencia de identidad humana falla sin guardar. Review-connect manual conserva
  su comportamiento, sin inventar identidad humana.

PGlite ejecuta PostgreSQL, pero no demuestra carga ni concurrencia de múltiples
conexiones del VPS. Los locks transaccionales se revisaron; no es un benchmark.

## Producción

Pendiente despliegue/humo. No se eliminó autorización real de ninguna persona.
SSH rechazó el acceso disponible; navegador integrado falló al inicializar.
No se solicitaron ni recuperaron secretos para saltar esas restricciones.

## Alcance que no debe afirmarse

Las credenciales manuales/anteriores no poseen asociación humana verificable.
No se revocan por nombre, correo, slug ni por el identificador SYSTEM_USER.
La identidad firmada del SDK de un onboarding auténtico está pendiente de prueba.
La ruta no borra historial, no elimina WABA/número y no solicita permisos nuevos.
App Review no fue enviada y ninguna prueba local garantiza aprobación de Meta.
