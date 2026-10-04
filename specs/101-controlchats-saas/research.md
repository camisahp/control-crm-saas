# 101 — Inventario de atajos single-tenant

**Fecha:** 2026-10-04  
**Carril:** ciclo completo — cambia el modelo de plataforma, autenticación,
webhooks y contratos externos.  
**Método:** paso 0 de la skill `saas-multitenant` incluida en el proyecto.

## Hallazgo principal

El CRM ya tiene una buena base de aislamiento de datos: las tablas de dominio
llevan `organization_id`, las consultas de dominio usan `scoped()` y el bus SSE
se particiona por organización. Pero la aplicación todavía **elige una
organización implícita** para login, sesión, marca, bot y webhooks. Por eso no
se puede desplegar aún como SaaS de muchas empresas.

## Inventario

| Archivo | Atajo actual | Riesgo con dos empresas | Reemplazo previsto | Paso |
|---|---|---|---|---|
| `src/server/auth/on-signup.ts` | El primer usuario crea la única org, slug `principal` y etapas globales; `resolveMembership()` devuelve la primera membresía. | Un usuario con dos negocios entra al negocio incorrecto; no hay alta de tenants. | Aprovisionamiento explícito crea la org y el slug; membresía se busca contra la org resuelta por Host. | 3, 7 |
| `src/server/auth/registration.ts` y `src/lib/auth/index.ts` | El registro se cierra cuando existe cualquier organización; Better Auth expone el plugin `organization`. | El alta SaaS no existe y las rutas genéricas podrían crear organizaciones fuera del flujo controlado. | Cerrar creación genérica; alta y superadmin son las únicas puertas de aprovisionamiento. | 3, 7 |
| `src/lib/auth/session.ts` | La sesión se resuelve con la primera membresía del usuario. | Cookie válida de A podría operar B si el usuario tiene ambas membresías. | Resolver Host → tenant, exigir membresía en esa organización y usar cookies host-only. | 1, 3 |
| `src/server/branding.ts` | Sin sesión usa `organization limit 1` para marca y favicon. | Login/landing de B puede enseñar la marca de A. | Cargar marca por tenant del Host; hosts reservados tienen marca de plataforma. | 1, 3 |
| `src/server/bot/auth.ts` | `resolveInstanceOrg()` cachea `organization limit 1`; una sola `BOT_API_KEY` y presupuesto global. | El cerebro puede leer/escribir el tenant equivocado y un cliente afecta la cuota de otro. | Credencial derivada y rate limit por organización; rutas del bot reciben y validan tenant. | 4, 5 |
| `src/app/api/webhooks/*/[webhookToken]` y `src/app/api/settings/webhook/route.ts` | Un verify token de entorno y una URL única para toda la instancia. | La puerta no prueba que el cuerpo pertenece a la organización; no sirve para múltiples números/tenants. | Token derivado por organización, URL por tenant y guardián que compara puerta, número y credenciales antes de ingerir. | 4 |
| `src/server/whatsapp/connect.ts` | Trata el override como WABA-global. | Con varios números de una WABA puede cambiarse el ruteo de otros clientes. | Embedded Signup desde `alta.` y override por número; no re-suscribir ni borrar callbacks existentes. | 6 |
| `src/lib/env.ts`, `src/lib/ai/index.ts`, `src/lib/crypto/index.ts` | `APP_BASE_URL`, token/modelo IA, verify token y clave de bot son valores únicos de instancia. | Dominio y cerebro no pueden diferenciar clientes; un token de IA se comparte sin control. | Dominio base y secreto de plataforma por entorno; conexiones y llaves de IA cifradas por organización. | 5, 8 |
| `src/lib/auth/index.ts` | `baseURL` equivale a un único host y no hay origen confiable para subdominios. | CSRF/login fallan en tenants y una sesión puede cruzar hosts si se configura de forma amplia. | `trustedOrigins` explícitos para apex, hosts reservados y patrón de tenants; cookies host-only. | 1, 3, 8 |
| `src/lib/vertical.ts`, `src/server/auth/on-signup.ts`, `src/server/agenda/etapas.ts` | El giro SPA y sus etapas viven en `VERTICAL`, global para toda la instancia. | Dentistas, abogados y técnicos heredan cabinas/paquetes de SPA. | Perfil de negocio por organización: nombres de recurso/servicio, selección, campos y automatizaciones configurables; presets no cambian datos históricos. | Feature de agenda genérica, después de 1–3 |
| `src/server/agenda/etapas.ts` | El trabajo de regreso recorre todas las orgs correctamente, pero consulta la configuración global. | Aplica reglas SPA a empresas que no son SPA. | Leer la configuración propia de cada org durante el job; conservar el barrido por org. | Feature de agenda genérica |
| `src/instrumentation-node.ts` | Limpieza de corridas actualiza todas las organizaciones sin filtrar. | No cruza datos: es una reparación intencional de estado por tenant. | Mantenerlo como excepción documentada de plataforma; sus efectos siguen en filas ya aisladas. | Verificar en 9 |
| `src/lib/db/schema.ts`, `src/lib/db/tenant.ts`, `src/server/events/bus.ts`, media y credenciales | `organization_id`, `scoped()`, SSE `org:<id>`, rutas de media y credenciales ya están por organización. | Base sólida, pero debe probarse en flujos reales. | Conservar; ampliar el guion A/B a todas las superficies nuevas. | 2, 5, 9 |

## Decisiones que NO se inventan

- **Alta inicial:** gestionada por el operador, no autoservicio. El onboarding
  de cada negocio ocurre dentro de su tenant.
- **Dominio propuesto por la receta:** `www.controlchats.com` para landing,
  `alta.controlchats.com` para Embedded Signup, `admin.controlchats.com` para
  plataforma y `{slug}.controlchats.com` para cada negocio. Es necesario DNS
  comodín y TLS comodín antes del paso 8; no se configura aún.
- **IA, cuotas, período de gracia y reventa:** `NEEDS CLARIFICATION` para la
  spec. No se asumen en código.

## Siguiente paso

Crear `spec.md`, `plan.md` y `tasks.md` de 101. El primer incremento de código
es únicamente la resolución pura Host → tenant/host reservado, con sus tests;
no cambia Coolify, DNS ni los webhooks existentes.
