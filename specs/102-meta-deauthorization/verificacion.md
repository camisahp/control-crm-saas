# Verificación del callback — 2026-10-10

## Local, reproducible

- `pnpm install --frozen-lockfile`: correcto. Nueva dependencia sólo de
  desarrollo `@electric-sql/pglite@0.3.14`. No cambia versiones de los paquetes
  existentes; se preservó el peer de Zod de better-call del lockfile anterior.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1`:
  83 archivos, 858 pruebas correctas. Incluye el handler real por HTTP contra
  PostgreSQL aislado en memoria, con todas las migraciones de Drizzle.
- Tipos y ESLint completo: sin errores. Build Next: correcto.
- `node tests/e2e/meta-deauthorization-ui.mjs`: PASS en Edge headless, renderiza
  el componente real. Ambos órdenes de respuesta SDK/FINISH transportan la
  prueba; origen falso no dispara POST; error recuperable habilita el botón.
  Todo por localhost, sin red externa, cuentas ni credenciales reales.
- Revocación A preserva credenciales B/manual, conversación, mensaje y contacto.
  Firma falsa, callback anterior, repetición, otra identidad y sustitución manual
  no desconectan una autorización ajena/nueva. Guardado con prueba revocada falla.
- Embedded Signup simulado: canje, prueba firmada, activos, cifrado y suscripción;
  ausencia de identidad humana falla sin guardar. Review-connect manual conserva
  su comportamiento, sin inventar identidad humana.

PGlite ejecuta PostgreSQL, pero no demuestra carga ni concurrencia de múltiples
conexiones del VPS. Los locks transaccionales se revisaron; no es un benchmark.

## Producción

Coolify terminó rollout fuzh6wma9fa6dbprye3yqwwa el 2026-10-10 a las
14:38:24 UTC para commit5780267; app running:healthy. Migración aditiva aplicada
por el arranque normal del contenedor antes de servir. No se inspeccionaron
credenciales de producción ni se eliminó autorización real de ninguna persona.

`node tests/e2e/meta-deauthorization-live-smoke.mjs 5780267`: PASS a las
14:39:02 UTC. Health200 y commit runtime5780267; commitVerified:false, por tanto
no atribuirle prueba de commit horneado. Ruta nueva accesible por HTTPS sin login:
GET405/AllowPOST, JSON415, campo vacío400, firma malformada401, firma con otra
clave sintética401, campo duplicado400, cuerpo excesivo413. Primer intento
durante el cambio de contenedor agotó el timeout; reintento tras fin del rollout
completó en 1.7s. No hubo rollback, cancelación ni reinicio adicional.

No se ejecutó POST firmado válidamente en producción: falta acceso para firmar
la prueba exclusivamente dentro del servidor. El camino válido y sus efectos
están verificados localmente contra PostgreSQL, no mediante el secreto real.
SSH rechazó el acceso disponible; navegador integrado falló al inicializar.
No se solicitaron ni recuperaron secretos para saltar esas restricciones.

## Alcance que no debe afirmarse

Las credenciales manuales/anteriores no poseen asociación humana verificable.
No se revocan por nombre, correo, slug ni por el identificador SYSTEM_USER.
La identidad firmada del SDK de un onboarding auténtico está pendiente de prueba.
La ruta no borra historial, no elimina WABA/número y no solicita permisos nuevos.
App Review no fue enviada y ninguna prueba local garantiza aprobación de Meta.
