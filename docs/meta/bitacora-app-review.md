# Bitácora de App Review · ControlChats / ControlCRM SaaS

_No registrar secretos, tokens, PIN, OTP ni valores de variables._

| Fecha (America/Bogota) | Hito | Evidencia / resultado | Estado |
| --- | --- | --- | --- |
| 2026-10-05 | Auditoría de páginas legales | Las tres URLs públicas respondieron HTTPS 200. Privacidad requiere responsable/país, procesadores/países, retención y plazo de eliminación. | Abierto |
| 2026-10-05 | Auditoría de código WhatsApp | Hay credenciales cifradas y webhook existente; Embedded Signup, callbacks firmados de cumplimiento y aislamiento cloud completo siguen pendientes. | Abierto |
| 2026-10-07 | App Business de Meta | Creada por el responsable; los identificadores y secretos fueron cargados en Coolify sin exponer sus valores. | Configurada, por probar en vivo |
| 2026-10-05 | Responsable y alcance inicial | Captura del portafolio confirma HERNANDEZ MORA EDWIN, Colombia. El producto se dirige inicialmente a Latinoamérica, sin oferta dirigida a la UE. | Confirmado |
| 2026-10-08 | Implementación Embedded Signup | SDK con `fedCM:false`; evento WABA/número; canje de código y validaciones en servidor; credencial cifrada; conexión restringida del número de revisión. `typecheck`, `lint` y 781 pruebas pasaron localmente. | Pendiente despliegue y evidencia viva |
| 2026-10-08 | Despliegue confirmado | Coolify `5e8rvhrgjs7j0hnfp67bjeqs` finished, commit `28488a8`; contenedor healthy y HTTPS healthcheck ok. El intento previo se canceló durante la espera de salud, después de construir la imagen. | Desplegado |
| 2026-10-08 | Prueba del número de revisión | Botón visible, pero el servidor rechaza la conexión porque la organización actual no coincide con `REVIEW_TENANT_SLUG`; aún no se envió un mensaje de WhatsApp. | Configuración por corregir |
| 2026-10-08 | Endurecimiento y diagnóstico | OAuth versionado con timeout y errores seguros; orígenes exactos para eventos; diagnóstico owner-only del espacio. ESLint, TypeScript, build y 796 pruebas locales aprobados. | Publicación remota pendiente |
| 2026-10-08 | Conexión real del número de prueba | Ajustes 7893cab desplegados; REVIEW_TENANT_SLUG corregido a principal. El propietario autorizó la conexión y Meta validó WABA/número; badge Conectado visible. | Conectado; recepción y envío pendientes |
| 2026-10-08 | Popup en navegador del propietario | El propietario informó que abrió Meta y muestra Continuar. No se completó autorización ni alta. | Apertura reportada, recorrido pendiente |
| 2026-10-08 | Importación de plantillas | Sincronización anterior no importaba hello_world. Corrección tenant-scoped e idempotente con formatos soportados; 813 pruebas y build locales aprobados. | Publicación remota pendiente |
