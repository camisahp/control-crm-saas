# Feature Specification: ControlChats SaaS multi-tenant

**Feature Branch**: `101-controlchats-saas`

**Created**: 2026-10-04

**Status**: In progress — ciclo completo; el despliegue, DNS y Meta se mantienen fuera de esta fase de código.

**Input**: Convertir el CRM desplegado en ControlChats, un SaaS para negocios de
servicios con uno o varios profesionales. Debe servir a spa, odontología,
abogacía, reparaciones y otros giros; incluir agenda, notas, etiquetas y, más
adelante, atribución de anuncios y retorno de conversiones a Meta. El alta de
clientes debe ser compatible con Meta Tech Provider / Embedded Signup.

## Decisiones de producto ratificadas para v1

- `www.controlchats.com` será la página pública; `alta.controlchats.com` el
  onboarding; `admin.controlchats.com` la plataforma; cada cliente operará en
  `{slug}.controlchats.com`.
- Esta primera entrega crea clientes por un flujo controlado de plataforma; no
  hay registro público ni cobro automático. Así se evita crear organizaciones
  huérfanas antes de que el onboarding Meta esté validado.
- La agenda es configurable por organización: nombre de recurso/profesional,
  servicio, modo de selección y campos operativos. Ningún cliente nace marcado
  como SPA.
- La IA es opcional y queda apagada por organización hasta que se defina el
  modelo comercial y de consumo. El CRM y la agenda funcionan sin IA.
- La atribución y CAPI ya existen como capacidad con bandera; en esta iniciativa
  se preservan y se conectarán al alta Meta por organización, sin enviar eventos
  hasta que un cliente los configure.

## User Scenarios & Testing

### User Story 1 - Entrar al CRM correcto (Priority: P1)

Como usuario de un negocio, entro por el subdominio de mi empresa y solo veo y
puedo operar la organización a la que pertenezco.

**Why this priority**: sin aislamiento por host no hay SaaS seguro.

**Independent Test**: resolver hosts de plataforma, cliente y desconocidos;
iniciar sesión de un miembro en el host propio y comprobar que el host de otro
cliente no acepta ni devuelve su sesión o datos.

**Acceptance Scenarios**:

1. **Given** `clinica.controlchats.com`, **When** se resuelve la solicitud,
   **Then** se identifica únicamente el tenant `clinica`.
2. **Given** `www`, `admin` o `alta`, **When** se resuelve la solicitud,
   **Then** nunca se interpreta como tenant.
3. **Given** un usuario miembro de `clinica`, **When** solicita recursos de
   `dentista.controlchats.com`, **Then** recibe acceso denegado sin filtrar
   datos ni aceptar su cookie del otro host.

---

### User Story 2 - Configurar una agenda de cualquier giro (Priority: P1)

Como dueño de un negocio de servicios, nombro mi tipo de negocio, mis recursos
(profesionales, cabinas, abogados o técnicos), mis servicios y los campos que
mi operación necesita, para que las citas hablen el lenguaje de mi negocio.

**Why this priority**: es la propuesta de valor que hace reutilizable el CRM.

**Independent Test**: crear dos perfiles distintos (por ejemplo odontología y
reparaciones), agendar con sus respectivos recursos y comprobar que ningún
texto, dato ni configuración se cruza ni queda forzada a SPA.

**Acceptance Scenarios**:

1. **Given** una organización nueva, **When** su dueño completa el perfil,
   **Then** puede guardar tipo de negocio, etiquetas de recurso y servicio,
   selección automática o por cliente, y campos adicionales.
2. **Given** varios profesionales activos, **When** se ofrece disponibilidad,
   **Then** solo aparecen recursos y horarios del tenant y servicio elegidos.
3. **Given** un negocio que usa "técnico" en lugar de "profesional", **When**
   abre la agenda, **Then** la interfaz usa su etiqueta configurada.

---

### User Story 3 - Gestionar conversaciones que convierten (Priority: P2)

Como equipo de atención, registro notas y etiquetas de un contacto y puedo
agendar, completar o cancelar una cita sin perder el contexto de WhatsApp.

**Independent Test**: crear un contacto, añadir una nota y etiqueta, reservar
una cita y comprobar que el equipo del mismo tenant ve ese contexto y el de
otro tenant no.

---

### User Story 4 - Dar de alta WhatsApp de un cliente (Priority: P2)

Como operador de ControlChats, inicio el onboarding de Meta para una
organización concreta y guardo los identificadores y credenciales resultantes
cifrados y aislados para que pueda recibir y responder WhatsApp.

**Independent Test**: con el sandbox de Meta, completar el callback de una
organización y confirmar que solo esa organización queda conectada; repetir el
callback no duplica el efecto.

---

### User Story 5 - Mejorar la calidad de anuncios (Priority: P3)

Como negocio que usa anuncios Click-to-WhatsApp, veo de qué anuncio llegó una
conversación y puedo configurar qué desenlaces reales se reportan a Meta.

**Independent Test**: ingestar un referral de prueba, marcar un lead calificado
o una venta y verificar un solo evento saliente por desenlace cuando la bandera
y configuración del tenant están activas.

### Edge Cases

- Un host con puerto, mayúsculas o punto final se normaliza antes de resolverlo.
- Un subdominio reservado, inválido o desconocido no revela si existe otra
  organización.
- Un usuario con varias membresías debe seleccionar una organización mediante
  su host; no se elige silenciosamente la primera.
- La agenda se degrada sin conectores externos: una reserva válida no se pierde
  por un proveedor de videollamada caído.
- Reintentos de Meta y de su callback no pueden crear dos conexiones ni dos
  reservas.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST resolver el tenant de forma pura a partir del
  Host y `BASE_DOMAIN`, reservando los hosts de plataforma y normalizando puerto,
  mayúsculas y punto final.
- **FR-002**: En edición cloud, la sesión y cada consulta MUST estar ligadas al
  tenant resuelto por Host y a una membresía explícita; ninguna elección por
  "primera membresía" es válida para una solicitud de cliente.
- **FR-003**: Las cookies de autenticación MUST ser host-only; no se compartirán
  entre subdominios de clientes.
- **FR-004**: Toda entidad y credencial de dominio MUST conservar
  `organization_id` y acceso org-first.
- **FR-005**: La plataforma MUST permitir alta controlada de organización,
  propietario y slug único; el registro público permanece cerrado en cloud.
- **FR-006**: La agenda MUST guardar un perfil por organización con tipo de
  negocio, etiquetas de recurso/servicio, estrategia de asignación y campos
  configurables, sin valores SPA globales.
- **FR-007**: Notas y etiquetas MUST estar aisladas por organización y visibles
  junto al contacto/conversación de ese tenant.
- **FR-008**: Las credenciales de Meta MUST ser por organización, cifradas en
  reposo, enmascaradas en respuestas y revocables sin afectar a otros clientes.
- **FR-009**: Embedded Signup MUST iniciarse y finalizarse asociado a una
  organización concreta, validar estado/anti-replay y registrar el resultado de
  forma idempotente.
- **FR-010**: Los webhooks entrantes MUST resolverse al tenant correcto antes de
  procesar efectos; los reintentos permanecen idempotentes.
- **FR-011**: La atribución y CAPI MUST seguir siendo opt-in por tenant y no
  bloquear una conversación, cita o movimiento de lead si Meta falla.
- **FR-012**: `EDITION=estandar` MUST conservar el comportamiento actual de
  instancia única durante la migración; `EDITION=cloud` habilita la resolución
  por dominio.
- **FR-013**: La documentación MUST separar código terminado de acciones
  operativas pendientes: DNS/TLS wildcard, variables de Coolify, Meta App
  Review y Advanced Access.

### Key Entities

- **Tenant por host**: resultado normalizado de un Host, que puede ser página
  pública, plataforma, alta o slug de organización.
- **Perfil operativo**: configuración por organización que adapta agenda y UI a
  un giro, recursos, servicios y campos.
- **Onboarding Meta**: intento y resultado idempotente asociado a una única
  organización, con referencias externas y auditoría.
- **Credencial de canal**: secreto cifrado de una organización y número/cuenta
  de Meta, nunca compartido ni devuelto en claro.

## Success Criteria

- **SC-001**: La matriz de hosts cubre los casos públicos, reservados, tenant,
  desconocido y local y pasa en pruebas unitarias.
- **SC-002**: Una solicitud autenticada no puede leer ni modificar datos de un
  tenant distinto, demostrado por pruebas A/B de aislamiento.
- **SC-003**: Un operador puede crear un tenant de prueba con perfil de negocio
  y una agenda funcional sin editar código ni usar nomenclatura de SPA.
- **SC-004**: El flujo de Meta para un tenant se puede ejecutar contra sandbox
  sin secretos expuestos y con callback repetido idempotente.
- **SC-005**: Typecheck, lint, tests relevantes, build y self-test de la UI
  pasan antes de cualquier despliegue.

## Assumptions

- El dominio base cloud es `controlchats.com`; los dominios personalizados de
  clientes no entran en v1.
- La infraestructura seguirá en el proyecto Coolify ya verificado, pero no se
  cambia hasta que el código y el plan operativo estén aprobados.
- La App de Meta se someterá a revisión como Tech Provider; el acceso avanzado y
  la evidencia de revisión son una dependencia operativa, no un supuesto de
  código. Meta documenta Embedded Signup como el flujo de onboarding para
  Solution/Tech Providers y exige los permisos aprobados correspondientes.
- Facturación, reventa por agencias, límites de uso y el modelo de coste de IA
  se deciden fuera de este primer incremento.
