# Bitácora de App Review · ControlChats / ControlCRM SaaS

_No registrar secretos, tokens, PIN, OTP ni valores de variables._

| Fecha (America/Bogota) | Hito | Evidencia / resultado | Estado |
| --- | --- | --- | --- |
| 2026-10-05 | Auditoría de páginas legales | Las tres URLs públicas respondieron HTTPS 200. Privacidad requiere responsable/país, procesadores/países, retención y plazo de eliminación. | Abierto |
| 2026-10-05 | Auditoría de código WhatsApp | Hay credenciales cifradas y webhook existente; Embedded Signup, callbacks firmados de cumplimiento y aislamiento cloud completo siguen pendientes. | Abierto |
| 2026-10-07 | App Business de Meta | Creada por el responsable; los identificadores y secretos fueron cargados en Coolify sin exponer sus valores. | Configurada, por probar en vivo |
| 2026-10-05 | Responsable y alcance inicial | Captura del portafolio confirma HERNANDEZ MORA EDWIN, Colombia. El producto se dirige inicialmente a Latinoamérica, sin oferta dirigida a la UE. | Confirmado |
| 2026-10-08 | Implementación Embedded Signup | SDK con `fedCM:false`; evento WABA/número; canje de código y validaciones en servidor; credencial cifrada; conexión restringida del número de revisión. `typecheck`, `lint` y 781 pruebas pasaron localmente. | Pendiente despliegue y evidencia viva |
