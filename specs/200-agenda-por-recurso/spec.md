# Feature Specification: Agenda por recurso (barberos, cabinas) y catálogo de servicios

**Feature Branch**: `main` (demo vocero-barberia; se lleva al spa por cherry-pick + su `vertical.ts`)

**Created**: 2026-09-28

**Status**: Implementado (CRM + Nea), gates verdes. Falta la prueba en vivo con WhatsApp real.

**Depende de**: [015 — Motor de agenda](../015-motor-agenda-universal/spec.md) (bandera `AGENDA`).

## Qué y por qué

La agenda de 015 es UNA por organización: una cita por instante y una duración
global. Dos negocios reales no caben ahí:

- **Barbería**: varios barberos atienden a la vez, cada uno con sus servicios y
  su horario; el cliente elige con quién («Quiero un corte con Luis mañana a
  las 5») o "cualquiera". El servicio define la duración (corte 45 min, corte +
  barba 60).
- **Spa**: varias cabinas; el cliente elige el paquete (masaje 90 min) y el
  sistema asigna cualquier cabina libre durante TODA la duración. El paquete
  trae indicaciones antes de la cita ("llega 10 min antes, sin cremas").

Los dos son **presenciales**: Zoom queda como calendario de registro del
equipo (el título dice con quién), pero el cliente nunca recibe un enlace.

Un solo código sirve a ambos, configurado por un archivo de datos por
instalación: `src/lib/vertical.ts` (forma y helpers en `vertical-config.ts`).
**Sin recursos activos, la agenda es exactamente la de 015** (mismo código,
mismos tests).

## Configuración del giro (`src/lib/vertical.ts`)

| Campo | Barbería | Spa |
|---|---|---|
| `recurso` | Barbero / Barberos | Cabina / Cabinas |
| `servicio` | Servicio / Servicios | Paquete / Paquetes |
| `seleccion` | `cliente` | `automatica` |
| `cita.presencial` | `true` | `true` |
| `etapas.seed` | Nuevo · Cita agendada · Asistió (won) · Vuelve en 3 semanas · Perdido (lost) | Nuevo · Paquete elegido · Reservado · Asistió (won) · Perdido (lost) |
| `etapas.servicioElegido` | `null` | `"Paquete elegido"` |
| `etapas.citaAgendada` | `"Cita agendada"` | `"Reservado"` |
| `etapas.citaRealizada` | `"Asistió"` | `"Asistió"` |
| `etapas.regreso` | `{ etapa: "Vuelve en 3 semanas", dias: 21 }` | `null` |

`REGRESO_DIAS` (entorno) sobreescribe `regreso.dias`. Las etapas se buscan por
nombre sin mayúsculas ni acentos; si una no existe en el tablero, esa
automatización no hace nada (en `citaAgendada`, se usa el avance de siempre).

## Datos (migración 0015, aditiva y re-ejecutable)

- `agenda_resource` (`rs_`): nombre, `weekly_hours` (NULL = el del negocio),
  `color` (clave de la paleta de identidad), `active`, `position`.
- `agenda_service` (`sv_`): nombre, `duration_minutes`, `price_cents`,
  `description`, `instructions` (antes de la cita), `active`, `position`.
- `agenda_resource_service` (PK recurso+servicio). Un servicio **sin
  vínculos** lo ofrece cualquier recurso activo.
- `booking.resource_id` / `service_id` y `offered_slot.resource_id` /
  `service_id` (NULL = agenda única).
- Candado anti doble-booking **por recurso**:
  `UNIQUE (organization_id, coalesce(resource_id,''), scheduled_at)` parcial
  (activas, no de prueba). Se crea antes de soltar el viejo. Los solapes con
  duraciones distintas los cierra la re-validación bajo
  `pg_advisory_xact_lock(hashtextextended('vocero:agenda:<org>:<recurso>'))`.

## Reglas del motor

- Disponibilidad = duración del servicio × horario del recurso − sus citas
  activas (cada una con su duración + respiro) − citas/bloqueos SIN recurso
  (ocupan a todos). Paso entre inicios = `slot_minutes`. Aviso mínimo y
  horizonte de siempre.
- Un hueco por instante: el recurso pedido o el primero libre por posición.
  La oferta recuerda recurso y servicio; reservar usa los de la oferta.
- Al reservar: si el recurso ofrecido ya no tiene el hueco, en `automatica` se
  toma otro libre del mismo instante; en `cliente` → 409 `slot_taken` con
  alternativas del mismo recurso (registradas como nueva oferta).
- Reprogramar: recurso/servicio del horario nuevo (oferta u operador); la
  duración sigue al servicio.
- Borrar un recurso/servicio con citas lo DESACTIVA.
- Título de la reunión: `"{servicio} con {recurso} · {cliente}"` (cliente
  elige) o `"{servicio} · {recurso} · {cliente}"` (automática); sin recurso,
  el de siempre.

## Contratos

### Bot (`X-API-Key`; 404 vacío con `AGENDA` apagada)

- `GET /api/bot/catalog` → `{ vertical: {recurso, servicio, seleccion, presencial}, services: [{id, name, durationMinutes, priceCents, priceLabel, description, instructions, resourceIds}], resources: [{id, name, serviceIds}] }` (solo lo activo y ofrecible).
- `GET /api/bot/availability?conversationId&[date]&[limit&perDay&days]&[service]&[resource]`
  - Con recursos: `service` (id o nombre) obligatorio; `resource` opcional
    (id, nombre, o "cualquiera"). Errores 422 con sobre anidado y lista
    hermana: `service_required` / `unknown_service` (+`services`),
    `unknown_resource` / `resource_not_offering_service` (+`resources`).
  - Cada slot: `startUtc, endUtc, label, dayIso, dayLabel, time, resource,
    resourceLabel ("con Luis" | null), service`. Arriba: `service {name,
    durationMinutes, instructions}`, `resource` (pedido o null), `seleccion`,
    y `query` como siempre.
- `POST|PATCH /api/bot/bookings {conversationId, startUtc}` → la respuesta de
  siempre + `service, resource, resourceLabel, instructions`. Presencial: sin
  `meetingLink`, `linkPending: false`, `presencial: true`.
- `GET /api/bot/context` → `booking.next|unresolved|lastClosed` con `service`
  y `resource`; presencial: sin `meetingLink`/`linkPending` y
  `booking.presencial: true`.
- `GET /api/bot/profile` → `kb` + bloques DERIVADOS del catálogo (precios,
  duraciones, quién hace qué, indicaciones, cita en persona) y
  `agenda: {presencial, seleccion, recurso, servicio}`.

### Operador (sesión)

- `GET|POST /api/agenda/resources`, `PATCH|DELETE /api/agenda/resources/:id`
  (`serviceIds` reemplaza vínculos).
- `GET|POST /api/agenda/services`, `PATCH|DELETE /api/agenda/services/:id`
  (`resourceIds` reemplaza vínculos).
- `GET /api/agenda/catalog` (todo, con inactivos y etiquetas del giro).
- `POST /api/agenda/regreso` (corre el regreso ya).
- `GET /api/calendar/availability?service&resource&exclude`.
- `POST /api/bookings` acepta `serviceId`/`resourceId` (sesión) y
  `resourceId` (bloqueo); `PATCH /api/bookings/:id` `reschedule` acepta
  `resourceId`/`serviceId`.
- Errores: 404 `not_found`, 409 `duplicate_name`, 422 `invalid_body`.

## Tablero

Cita creada → `citaAgendada` (desde cualquier etapa: quien vuelve reagenda);
realizada → `citaRealizada`; consulta de horarios con servicio →
`servicioElegido` (solo hacia adelante); trabajo in-process cada hora
(arranca en `instrumentation`, primera pasada al minuto) → `regreso` para
quien sigue en `citaRealizada`, con su última realizada de hace ≥ N días y sin
otra cita por delante. Todo por `moveLeadToStage`.

## Nea

`propose_slots(servicio?, recurso?)`; los 422 vuelven al modelo con los
nombres válidos; etiquetas "con Luis"; reserva/movimiento devuelven
servicio, con quién (solo si el cliente elige) e indicaciones; la
confirmación las repite. Presencial: nada de enlaces. Prompt: saber el
servicio antes de proponer, respetar al profesional pedido, repetir día, hora,
con quién e indicaciones. Los NUNCA intactos.

## Fuera de alcance / limitaciones conocidas

- La UI de Citas no crea sesiones a mano (tampoco antes); la API sí.
- "Próximos huecos" de Ajustes muestra la agenda del negocio, no por servicio.
- Un recurso tiene UNA franja por día desde la UI (la API acepta varias).
- Reprogramar por el bot mueve la PRÓXIMA cita con el servicio de la última
  consulta: el modelo debe consultar con el servicio de esa cita (el contexto
  lo trae).
- Una oferta vieja sin recurso (anterior al catálogo) reserva en la agenda
  única: esa cita ocupa a todos los recursos.


