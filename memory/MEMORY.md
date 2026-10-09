# Memoria del proyecto: control-crm-saas

_Última actualización: 2026-10-08 (America/Bogota)._
_Regla: actualizar este archivo al terminar cada hito relevante. No almacenar secretos._

## Objetivo del proyecto

Desplegar y operar una instancia self-hosted del CRM **Vocero** bajo el proyecto
de Coolify `control-crm-saas`. La aplicación usa Next.js, PostgreSQL, Drizzle,
Better Auth y canales de mensajería/IA opcionales. Ver `README.md` y `CLAUDE.md`
para el alcance y la arquitectura completos.

## Dirección vigente — 2026-10-03

- El dominio de producto acordado pasa a ser `controlchats.com`. No continuar
  cambios, DNS ni despliegues sobre `crmcontrol.sodiau.com`.
- La siguiente configuración externa deberá registrar el subdominio operativo
  que se defina bajo `controlchats.com`, actualizar `APP_BASE_URL` y volver a
  desplegar. No se han modificado aún Coolify, DNS, certificados ni webhooks.
- El código local incorpora la agenda SPA por recursos: paquetes, cabinas con
  asignación automática, disponibilidad según duración y protección contra
  doble reserva. La migración aditiva pendiente de desplegar es
  `0015_agenda_por_recurso.sql`; la función se activa en producción con
  `AGENDA=true`.

## SaaS multitenant y Meta — 2026-10-04

- El objetivo confirmado es convertir la instancia en una plataforma SaaS
  multitenant con onboarding de WhatsApp para una futura solicitud Meta Tech
  Provider. La documentación local `saas-multitenant`,
  `whatsapp-saas-meta-infra` y `whatsapp-meta-app-review` es la fuente de
  verdad del trabajo.
- Se inició el paso 0, inventario de atajos single-tenant, en
  `specs/101-controlchats-saas/research.md`. No se desplegará la agenda SPA
  fija como producto final: se convertirá en agenda genérica configurable por
  organización.
- Arquitectura propuesta por la receta, pendiente de implementar y configurar:
  landing `www.controlchats.com`, alta Meta en `alta.controlchats.com`,
  administración en `admin.controlchats.com` y tenants en
  `{slug}.controlchats.com`; requiere DNS y TLS comodín.
- Alta inicial decidida: administrada por el operador; no se habilita registro
  SaaS autoservicio. IA, cuotas, días de gracia y reventa siguen como decisiones
  explícitas pendientes en la spec.

## Estado comprobado de Coolify

- Servidor disponible: `localhost` (`host.docker.internal`), alcanzable y usable.
- Proyecto destino correcto: `control-crm-saas`.
  - UUID: `wov6v3eaukwf63w5tfvujhe2`.
  - Recursos visibles al 2026-09-29: una base PostgreSQL y una aplicación.
    `control-crm-saas-db` (`3ywvbp70aadl4upeoyya96p1`) aparece `Running` en
    el panel.
  - Aplicación creada: `control-crm-saas`
    (`ndpkitrpaqmtglszaysiocu8`), conectada a la rama `main` del repositorio
    público. Aún no ha sido desplegada.

## Recursos que no son el destino actual

Existe una aplicación sana llamada `control-crm.git:main-…` en el proyecto de
Coolify `Agente IA-Vocero`, no en `control-crm-saas`. Tiene dominios
`crm.sodiau.com` y `control-crm.sodiau.com` y despliegues previos exitosos. No
debe tomarse como destino del nuevo despliegue sin una decisión explícita.

## Variables de entorno para el despliegue

Requeridas por la aplicación según `docker-compose.yml` y `CLAUDE.md`:

- `APP_BASE_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY` (exactamente 32 bytes codificados en base64)
- `META_WEBHOOK_VERIFY_TOKEN`

Usuales u opcionales, según las funcionalidades elegidas:

- `META_APP_SECRET`, `META_GRAPH_API_VERSION`
- `OPENROUTER_API_TOKEN`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`,
  `OPENROUTER_JUDGE_MODEL`
- `BOT_API_KEY`, `BRAIN_HEALTH_URL`
- Banderas: `CHANNELS`, `AGENDA`, `ATRIBUCION`
- Integraciones de agenda, Zernio o Meta solo cuando se habiliten.

Los valores viven exclusivamente en Coolify y/o `.env` local, nunca aquí.

## Próximo hito: primer despliegue en control-crm-saas

Antes de ejecutar el despliegue hay que verificar y decidir:

1. Configurar la estrategia de compilación correcta: el repositorio contiene un
   `Dockerfile`, por lo que debe usarse `Dockerfile` (no `Static` ni Railpack).
2. Verificar DNS de `crmcontrol.sodia.com`; Coolify también añadió
   `www.crmcontrol.sodia.com`.
3. Conjunto mínimo de variables y el `DATABASE_URL` apuntando a la base correcta.
4. Volumen persistente para `/data` (adjuntos, logo e icono) y healthcheck
   `/api/health`.
5. Tras autorizar y cargar las variables, desplegar y verificar:
   estado healthy, URL pública, login, migraciones y healthcheck.

## Bitácora breve

- 2026-09-29: acceso al equipo Coolify verificado; servidor utilizable.
- 2026-09-29: se confirmó que `control-crm-saas` existe pero su PostgreSQL está
  detenida e unhealthy; no se realizaron cambios.
- 2026-09-29: se separó de la aplicación sana existente en otro proyecto para
  evitar desplegar sobre el recurso equivocado.
- 2026-09-29: se solicitó iniciar `control-crm-saas-db`; Coolify aceptó la
  solicitud, pero la base permaneció `exited:unhealthy`. Pendiente revisar el
  log de arranque autenticado para diagnosticarla.
- 2026-09-29: repositorio confirmado para la futura aplicación:
  `github.com/camisahp/control-crm-saas`; dominio previsto:
  `https://crmcontrol.sodia.com`.
- 2026-09-29: se creó la aplicación `control-crm-saas` en el proyecto correcto
  y se registró `https://crmcontrol.sodia.com`. No se ha iniciado ningún
  despliegue ni se han cargado secretos.
# Estado de despliegue — 2026-09-29

- Aplicación Coolify creada: `control-crm-saas` (`ndpkitrpaqmtglszaysiocu8`), repositorio `camisahp/control-crm-saas`, rama `main`.
- Configuración lista y verificada: Dockerfile `/Dockerfile`, puerto `3000`, volumen persistente `/data`, healthcheck HTTP `GET /api/health` en puerto `3000`.
- Base de datos `control-crm-saas-db` está `running:healthy`.
- Variables de producción y preview añadidas (valores secretos no se guardan aquí): `APP_BASE_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN`.
- Dominios configurados: `https://crmcontrol.sodia.com` y `https://www.crmcontrol.sodia.com`. Falta confirmar DNS y ejecutar el primer despliegue.
- No se ha hecho ningún despliegue todavía.
# DNS — 2026-09-29

- Cloudflare zone `sodiau.com` está activa.
- Registros A creados, con proxy desactivado (DNS only): `crmcontrol` y `www.crmcontrol` apuntan a `2.25.68.116`.
- Ambos registros responden correctamente desde el DNS autoritativo de Cloudflare. El resolvedor público `1.1.1.1` conservaba una respuesta negativa en caché al momento de la comprobación; esperar a que caduque antes de volver a validar en Coolify.
# Pausa de trabajo — 2026-09-29

- Usuario pausa el trabajo para continuar mañana.
- No desplegar todavía: esperar a que Coolify valide DNS para `crmcontrol.sodia.com` y `www.crmcontrol.sodia.com` (ambos A records ya están correctos en DNS autoritativo; hay caché negativa temporal en el resolvedor).
- Al retomar: abrir la aplicación en Coolify, ir a **Domains**, pulsar **Check DNS**. Cuando ambos den *Success*, pedir confirmación explícita al usuario e iniciar el primer deploy; revisar después los Deployment Logs y `https://crmcontrol.sodia.com`.
- No se han compartido ni guardado secretos en este archivo.
# Primer despliegue completado — 2026-09-30

- Despliegue exitoso en Coolify: UUID `mezfsqjgw8sifi6hj7f05neh`, commit `b3469f9b60d49671262d471bc8014af7a035025c` (release 1.4.0).
- Estado actual de la aplicación: `running:healthy`; el endpoint interno `/api/health` funciona.
- Correcciones realizadas al healthcheck: host `127.0.0.1`, puerto `3000`, ruta `/api/health`, inicio `180` segundos, intervalo 5 s, reintentos 10. El uso anterior de `localhost` ocasionaba rechazos de conexión durante la comprobación.
- La aplicación responde públicamente por el proxy y redirige `/` a `/inbox` (HTTP 307).
- Pendiente: Coolify aún marca `crmcontrol.sodia.com` y `www.crmcontrol.sodia.com` como *DNS mismatch* aunque los A records públicos autoritativos apuntan a `2.25.68.116`. El certificado HTTPS presentado aún no pasa la verificación de confianza; no pedir al usuario que lo omita. Revisar/forzar emisión de certificado cuando la validación DNS de Coolify se actualice.
- Evidencia posterior: el puerto público 80 redirige correctamente a HTTPS y la aplicación responde a través del proxy con `307 /inbox`; una app existente (`crm.sodiau.com`) en este mismo servidor sí presenta un certificado confiable. Por tanto, el pendiente es específico de la emisión para el dominio nuevo, no del servidor ni del CRM.

# Pausa de trabajo — 2026-09-30

- El usuario reiniciará su equipo antes de continuar. No requiere ningún cambio adicional en Coolify ni en Cloudflare durante la pausa.
- Al abrir `https://crmcontrol.sodia.com` desde su navegador, Windows/Edge muestra `DNS_PROBE_FINISHED_NXDOMAIN`: el resolver DNS local todavía informa que el dominio no existe.
- La siguiente acción acordada para retomar es ejecutar en Windows PowerShell `ipconfig /flushdns`, cerrar y reabrir el navegador y volver a probar la URL. Si persiste, configurar de forma guiada los DNS del adaptador de Windows hacia Cloudflare (`1.1.1.1` y `1.0.0.1`; considerar sus equivalentes IPv6 si hiciera falta).
- El diagnóstico local confirmó que las consultas DNS desde el entorno de trabajo también agotaron el tiempo de espera; esto no afecta el despliegue que ya está `running:healthy`.
- No almacenar ni solicitar de nuevo los secretos ya cargados en Coolify.

# Causa encontrada del DNS — 2026-09-30

- El dominio configurado en Coolify y en `APP_BASE_URL` es `crmcontrol.sodia.com` (sin la letra `u`).
- Los registros A mostrados por el usuario fueron creados en la zona Cloudflare `sodiau.com` (con la letra `u`), por lo que realmente publican `crmcontrol.sodiau.com` y `www.crmcontrol.sodiau.com`.
- Esta diferencia explica el `DNS_PROBE_FINISHED_NXDOMAIN` global: no es una caché ni un problema del despliegue. Antes de modificar algo, el usuario debe confirmar si el dominio final será `sodia.com` o `sodiau.com`.

# Dominio definitivo y verificación pública — 2026-09-30

- El usuario confirmó que el dominio correcto es `sodiau.com`.
- En Coolify se corrigieron los dominios a `https://crmcontrol.sodiau.com` y `https://www.crmcontrol.sodiau.com`; ambos validaron DNS con éxito.
- `APP_BASE_URL` fue actualizado a `https://crmcontrol.sodiau.com` en los ámbitos Production y Preview.
- Redespliegue posterior completado con éxito: UUID `znvhd60fgunfbatjznmxjszy`, terminado a las `2026-09-30 20:48:42 UTC`.
- Verificación externa completa: `https://crmcontrol.sodiau.com/login` carga la página pública de inicio de sesión de Vocero, con certificado HTTPS válido. El siguiente hito es crear la cuenta inicial desde ese enlace, cuando el usuario lo autorice.

# Registro y modelo de acceso — 2026-09-30

- La cuenta inicial ya fue creada por el usuario.
- El registro público está protegido en servidor: solo se permite mientras no exista ninguna organización. Tras el primer registro, `POST /sign-up/email` devuelve 403; el enlace `/register` puede seguir visible, pero no permite crear otra cuenta.
- La excepción es `ALLOW_SIGNUP=true`; esa variable no forma parte de la configuración cargada para esta instancia y no debe añadirse salvo decisión explícita.
- Las cuentas adicionales se crean por el propietario desde la gestión de equipo y se agregan a su organización.
- El estado actual es multiusuario con aislamiento por organización, pero no es aún un autoservicio SaaS de múltiples clientes: para que nuevos clientes creen sus propias organizaciones se debe diseñar e implementar un flujo de alta multitenant separado.

# Dirección SaaS multitenant — 2026-10-01

- Se revisó la skill interna `arnes-saas-multitenant` (su receta `saas-multitenant`) y la constitución vigente del proyecto.
- La instancia actual conserva el modelo base de organizaciones, Better Auth organization y `scoped()`, pero sigue operando como una instancia de un solo negocio: el registro público se cierra después de la primera organización.
- Convertirla en SaaS multitenant no se resuelve habilitando el registro. Requiere ciclo completo de spec/plan/tasks/implement: inventario de atajos single-tenant, resolución de tenant por Host/subdominio, autorización y sesión host-only, webhook y credenciales por organización, alta/plataforma, TLS comodín y guion A/B de aislamiento como gate.
- Dominio base probable para el diseño: `sodiau.com`; decisiones aún necesarias y que deben quedar en el spec: elegibilidad de alta, modelo de cobro, responsabilidad del consumo IA y si habrá agencias/reventa.

# ControlChats SaaS — 2026-10-04

- El usuario definió el dominio objetivo como `controlchats.com` (con
  `www.controlchats.com` ya comprado y propagado). No modificar todavía los
  dominios actuales de Coolify (`crmcontrol.sodiau.com`) ni `APP_BASE_URL`:
  el cambio requiere el código cloud, DNS/TLS wildcard y autorización explícita
  de operación.
- Se revisó la receta local `arnes-saas-multitenant` y se inició el ciclo
  completo en `specs/101-controlchats-saas/`: `research.md`, `spec.md`,
  `plan.md` y `tasks.md`. La primera entrega conserva `EDITION=estandar` y
  prepara `EDITION=cloud`; no habilita registro público ni billing.
- Dirección de hosts documentada: `www.controlchats.com` público,
  `alta.controlchats.com` onboarding Meta, `admin.controlchats.com` plataforma
  y `{slug}.controlchats.com` para cada cliente. Localmente se usará
  `{slug}.lvh.me`.
- T005/T006 terminadas: `src/lib/tenant-host.ts` aporta resolución pura y
  normalizada de Host (público, admin, alta, tenant o desconocido), sin BD,
  sesión ni variables globales. `tests/unit/tenant-host.test.ts` pasó 13/13.
  `pnpm typecheck`, `pnpm lint` y `git diff --check` también pasaron para el
  cambio actual. La siguiente frontera es diseñar la enmienda constitucional y
  el guard que conecte Host, membresía y sesión; no se debe elegir la primera
  membresía en edición cloud.
- La agenda se debe volver universal por organización (tipo de negocio,
  etiquetas para recurso/profesional y servicio, selección y campos), no SPA.
  El código importado de agenda por recurso sigue pendiente de esa conversión.
- La enmienda 1.5.0 está documentada en
  `specs/101-controlchats-saas/enmienda-constitucional.md` y aplicada a
  `.specify/memory/constitution.md`. Conserva `EDITION=estandar` y habilita la
  edición cloud sujeta a sesión por Host, cookies host-only y prueba A/B de
  aislamiento. No habilita registro público, billing ni cambios operativos.
- Marca de plataforma fijada el 2026-10-04: `Control Chats`. Se usa el activo
  local `public/control-crm-logo.png` en login, barra lateral y favicon. La
  normalización convierte el valor legado exacto `Vocero` a `Control Chats`,
  pero conserva nombres personalizados de clientes.

# Operación Control Chats — 2026-10-04

- El recurso de producción correcto es la aplicación Coolify
  `control-crm-saas` (`ndpkitrpaqmtglszaysiocu8`) en el proyecto
  `control-crm-saas`. Está sana y sus dominios de CRM incluyen
  `alta.controlchats.com` y `admin.controlchats.com`; `www.controlchats.com`
  queda reservado para la web pública en Systeme.io.
- El despliegue `4f44e1f` terminó correctamente y usa
  `public/control-crm-logo-v2.png`, sin el detalle visual del logotipo anterior.
- La cuenta existente `sycserviciodigital@gmail.com` tiene proveedor
  `credential`. La contraseña temporal vigente fue validada por el endpoint de
  autenticación sin encabezado Origin (HTTP 200); no registrar su valor aquí.
- Diagnóstico de acceso desde navegador: una prueba con Origin
  `https://alta.controlchats.com` devolvió HTTP 403 `INVALID_ORIGIN`. La causa
  fue que `APP_BASE_URL` en Coolify conservaba un host anterior. El usuario
  informó el 2026-10-05 que ya está en `https://alta.controlchats.com`; falta
  comprobar login y sesión con una prueba pública antes de usarlo como evidencia
  de App Review.

## Preparación App Review Meta — 2026-10-05

- Se auditaron por HTTPS las páginas públicas de términos, privacidad y
  eliminación de datos bajo `www.controlchats.com`; las tres respondieron 200.
- La política de privacidad todavía debe completarse antes de cualquier envío:
  razón social y país del responsable que coincidan con el portafolio Meta,
  procesadores y países reales, retención concreta, y plazo/proceso de
  eliminación. Los términos y la página de eliminación deben actualizar su
  correo/identidad para que coincidan con esa misma información.
- Se crearon `docs/meta/ficha-saas.md`, `docs/meta/hoja-de-campos.md` y
  `docs/meta/bitacora-app-review.md`; solo contienen hechos verificados y
  pendientes, nunca secretos.
- La captura del portafolio verificado confirma responsable: `HERNANDEZ MORA
  EDWIN`, país Colombia; el correo de contacto inicial se mantiene como
  `info@sodiau.com`. El producto se dirige inicialmente a Latinoamérica y no a
  personas en la UE. Se redactó el borrador de páginas legales en
  `docs/meta/textos-legales-propuestos.md`; no debe publicarse hasta confirmar
  los procesadores/países reales y adoptar operativamente sus plazos.
- GLM-5 por OpenRouter puede enrutar solicitudes entre múltiples proveedores.
  Antes de declarar países de procesamiento o activar IA para clientes, fijar o
  documentar los proveedores/regiones reales. La IA debe permanecer apagada en
  el tenant de revisión mientras eso no esté resuelto.
- Se añadió `docs/meta/checklist-configuracion-embedded-signup.md` con las
  variables de Coolify, pasos del número de prueba y puertas de verificación.
  A fecha 2026-10-07 el código todavía no implementa Embedded Signup,
  callbacks firmados de cumplimiento ni el webhook tenant-aware; no desplegar
  ni enviar App Review como si esas funciones existieran.
- El 2026-10-07 se verificó por MCP que el recurso correcto
  `control-crm-saas` está `running:healthy` y que las claves de producción y
  preview para `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`,
  `META_GRAPH_API_VERSION`, `REVIEW_TENANT_SLUG`, `REVIEW_WABA_ID`,
  `REVIEW_PHONE_NUMBER_ID` y `REVIEW_SYSTEM_USER_TOKEN` existen. Los valores
  no se leyeron. El healthcheck público de `alta.controlchats.com` respondió
  200; el commit servido continúa siendo `4f44e1f`, anterior a la futura
  implementación de Embedded Signup.
- La app de Meta ya fue creada por el usuario y sus identificadores/secretos se
  cargaron manualmente en Coolify. No se han leído ni registrado sus valores.
- El 2026-10-08 se implementó el primer flujo ejecutable de Embedded Signup:
  SDK con `fedCM:false`, captura de WABA/número desde el evento de Meta,
  canje de `code` sólo en el servidor, validación WABA→número, cifrado de la
  credencial y suscripción best-effort de la WABA. También se creó un botón
  restringido al slug del tenant de revisión para conectar el número de prueba
  usando exclusivamente el token de usuario del sistema en servidor.
- Validación local de esta implementación: `pnpm typecheck`, `pnpm lint` y
  `pnpm test` (781 pruebas) pasaron. Aún faltan evidencia real posterior al
  despliegue: popup, conexión del número de prueba, webhook, plantilla y envío.
- Siguen siendo bloqueantes antes de enviar App Review: publicar las páginas
  legales completas y grabar/validar el flujo vivo. El aislamiento cloud
  host-aware y callbacks completos de desautorización/eliminación continúan
  como trabajo SaaS pendiente; no representarlos como terminados.

## Operación VPS — 2026-10-08

- Hostinger aplicó limitación de CPU. La causa identificada fue el servicio
  `Hermes-Agent`: su proceso de dashboard consumía 100% de CPU de forma
  sostenida. RAM (~3.7 GB de 6 GB) y disco estaban dentro de rango.
- Con autorización del usuario se reinició Hermes; el servicio terminó en
  estado `exited` y el usuario confirmó que debe permanecer desactivado. No
  reiniciarlo automáticamente. Esto no desconecta WABAs, números ni tokens de
  WhatsApp; sí deja las funciones propias de Hermes indisponibles.
- Aunque Hostinger confirmó que retiró la limitación y Hermes quedó apagado,
  los despliegues remotos continuaron detenidos durante `next build`.
  Localmente la compilación llegó a completar Webpack correctamente; el
  siguiente intento limita el heap de Node a 1.5 GB sólo en la etapa builder.
- El intento `cxdv3ordlwij6p0ddxb2jk6x` del commit `28488a8` fue cancelado
  después de unos seis minutos. Sin logs ni métricas no se puede concluir que
  estaba congelado ni que faltaba RAM; el estado `in_progress` no prueba esas
  causas. La compilación local tampoco quedó verificada de principio a fin.
- Reevaluación de acceso: la app continúa `running:healthy`; el conector
  devuelve `Missing required permissions: read:sensitive` al pedir un resumen
  del despliegue. El MCP disponible no incluye ejecución de comandos ni
  terminal del servidor. El diagnóstico exhaustivo necesita primero logs y,
  si éstos no explican el problema, terminal/SSH autenticada por el propietario.
- Verificación posterior del código local: `node node_modules/next/dist/bin/next
  build` completó compilación, tipos, generación de páginas y build traces,
  devolviendo `NEXT_BUILD_EXIT=0`. Entorno local Windows con Node 24.15.0;
  esto no sustituye validar la imagen standalone Linux/Node 22 de producción.
- Tras el aviso de reemplazo del token, el MCP todavía deniega
  `read:sensitive`. La configuración global usa
  `bearer_token_env_var="COOLIFY_MCP_TOKEN"`. Se comprobó sólo presencia:
  disponible en el proceso, ausente en User/Machine de Windows. No se leyeron
  ni registraron valores de credenciales. Hace falta actualizar el valor en
  el entorno que inicia Codex y reabrir la aplicación para verificar el acceso.

## Corrección del diagnóstico y despliegue confirmado — 2026-10-08

- Una comprobación fuera del sandbox confirmó que Windows User sí contiene el
  token nuevo, pero no coincide con el que heredó el proceso de Codex. El MCP
  nativo sigue usando la credencial anterior. La API REST está deshabilitada
  (`You are not allowed to access the API`). Una conexión MCP nueva usando la
  variable User permite consultar logs; el valor nunca se imprime ni almacena.
- Los logs del intento cancelado `cxdv3ordlwij6p0ddxb2jk6x` muestran que la
  imagen ya había terminado y el contenedor esperaba el periodo de salud de
  180 segundos. Fue incorrecto concluir que la compilación seguía congelada.
- El despliegue `5e8rvhrgjs7j0hnfp67bjeqs` terminó `finished` a las
  2026-10-09 02:11:37 UTC (2026-10-08, Bogotá), con commit `28488a8`.
  Imagen construida, primer healthcheck healthy, contenedores viejos retirados.
  HTTPS `/api/health` devolvió `ok:true`, commit `28488a8`, versión 1.4.0.
  `commitVerified:false`: el commit es runtime, no está horneado en el build.
- El propietario inició sesión en el navegador integrado. WhatsApp muestra
  los botones de Meta y de número de prueba. Un ChunkLoadError de la página
  anterior desapareció al recargar tras el despliegue.
- Prueba real de `review-connect`: rechazada antes de contactar a Meta porque
  la organización actual no coincide con `REVIEW_TENANT_SLUG`. Se añade al
  endpoint de configuración un diagnóstico owner-only del slug actual para
  corregir ese valor sin quitar la protección ni afectar clientes.
- El popup todavía no está verificado: el clic en el navegador integrado no
  produjo una pestaña de Meta observable ni un error del SDK. Necesita una
  comprobación en un navegador que permita ese popup, con el perfil admin.
- Ajustes de seguridad preparados: canje OAuth con versión explícita, timeout
  y error público sin detalles del proveedor; parser de eventos de Embedded
  Signup con orígenes exactos y reinicio de selección entre intentos. El
  diagnóstico del espacio de revisión se expone sólo al propietario.
- Verificación local de estos ajustes: ESLint, TypeScript y build Next completo
  pasaron; Vitest: 77 archivos y 796 pruebas aprobadas, incluidas 15 pruebas
  nuevas del parser y del backend. La publicación remota de estos ajustes
  y las pruebas vivas del flujo siguen pendientes.
- Ajustes publicados como `7893cab`: despliegue `ptvltffiecscyp2al8xgmb6g`
  finished a las 02:31:00 UTC. La UI confirmó organización `principal`.
  Se cambió exclusivamente `REVIEW_TENANT_SLUG` de `meta-review` a `principal`
  en Coolify; deploy `pb4rgahyr8qsaz1flnuwai2v` finished 02:39:10 UTC.
- Con aprobación explícita del usuario, `Conectar número de prueba` completó
  validación real contra Meta y guardó la conexión; la UI muestra `Conectado`.
  Esto no demuestra todavía recepción por webhook ni entrega de mensajes.
  El usuario confirmó que en su navegador con Facebook abre el diálogo Meta
  y muestra Continuar; no se han aprobado permisos ni completado el signup.
- Se detectó que syncTemplates sólo actualizaba filas locales y no importaba
  hello_world. Se prepara importación tenant-scoped, idempotente y paginada
  de plantillas soportadas por el sender actual (BODY posicional; encabezado
  y pie estáticos). Se excluyen formatos multimedia, botones y parámetros
  nombrados. Build completo, tipos, lint y 813 pruebas locales aprobados.
- Privacidad pública reevaluada: HTTP 200, responsable y Colombia presentes;
  retención aún vaga y sin plazos concretos. No afirmar cumplimiento total.
- Los healthchecks de Coolify registran curl inexistente con exit 0. HTTPS
  /api/health sí responde ok tras el rollout, pero esa configuración interna
  necesita revisión para no producir falsos positivos. Hubo 502 transitorios
  al retirar contenedores; no se midió aún disponibilidad continua o capacidad.
- Importación desplegada en `a727164`, deploy `qenjpucims7vz0qqeposf1ia`
  finished a las 02:49:05 UTC. Sincronización viva importó hello_world y otra
  plantilla; la UI muestra aprobadas. OAuth/callback de Meta del popup aún
  no completados (sólo apertura reportada por el propietario).
- Diagnóstico desde el terminal del contenedor (salida limitada, sin secretos):
  WABA suscrita a la app correcta; sin override; GET de app subscriptions vacío;
  handshake público HTTP 200 y challenge correcto. Tras autorización explícita,
  se creó suscripción activa whatsapp_business_account para messages,
  message_template_status_update y account_update, host alta.controlchats.com.
  Meta devolvió HTTP 200/success true y GET confirmó los campos.
- Verificación pública de seguridad: token de verificación incorrecto → 403;
  POST sin firma → 401; payload vacío con firma válida → 200. No creó mensajes.
- El propietario confirmó publicación de la app. Llegó el mensaje real de su
  teléfono permitido; respuesta manual autorizada enviada desde el CRM muestra
  estado read recibido por webhook. La plantilla controlchats_revision_20261008
  fue creada con aprobación del propietario; UI Pendiente de Meta, es/UTILITY.
- UI abierta de 24 h sólo ofrecía textos rápidos, no envío real de plantilla.
  Se añade acceso al TemplateSender también allí. Se oculta por defecto la
  configuración manual/webhook y se retira el fragmento de token del banner
  para permitir grabar sin divulgar credenciales.
- Coolify rechazó comandos de healthcheck custom; al recargar conserva HTTP
  request y tiempos originales (no se persistió ese cambio). Se añade curl al
  runner para corregir la dependencia que falta, conservando wget de la imagen.
  Node y wget fueron probados en vivo con exit 0 contra el endpoint interno.
- OpenRouter no está operativo en esta instancia: UI muestra ausencia de
  OPENROUTER_API_TOKEN. Las pruebas actuales usan respuesta manual y no afirman
  que IA o capacidad para 100 tenants estén verificadas.
- Verificación local del selector real de plantillas y pantalla segura para
  grabar: suite Vitest completa finalizó con exit 0; build Next completo,
  incluidos lint y tipos, exit 0. Publicación de estos últimos ajustes pendiente.
