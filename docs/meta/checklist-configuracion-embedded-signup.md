# Checklist de configuración · Embedded Signup y App Review

_ControlChats / ControlCRM SaaS · 7 de octubre de 2026. No escribir secretos, tokens, PIN ni OTP en este archivo ni en chat._

## Estado previo obligatorio

- [ ] La nueva App Business de Meta se creó en el portafolio verificado correcto.
- [ ] La política de privacidad publicada incluye responsable, procesadores, países y retención reales.
- [ ] Se implementaron y desplegaron los callbacks de desautorización y eliminación de datos.
- [ ] Se implementó Embedded Signup por tenant y las pruebas automáticas están en verde.
- [ ] La edición cloud, resolución de tenant por host y aislamiento de sesión están comprobados antes de conectar clientes externos.

No activar `EDITION=cloud` solo por esta checklist: el guard de sesión y el
onboarding tenant-aware deben estar implementados primero.

## 1. Meta for Developers — datos no secretos

Anotar únicamente en el gestor de configuración de despliegue o en esta lista
por nombre, nunca sus valores sensibles:

- Identificador de la app → variable `META_APP_ID`.
- Identificador del ajuste de Facebook Login for Business → `META_CONFIG_ID`.
- Usar el mismo Graph API version que el backend; inicialmente `v25.0` mientras
  se implemente y pruebe el cambio de versión.
- Información básica:
  - Dominio: `controlchats.com`
  - Sitio web: `https://alta.controlchats.com`
  - Privacidad: `https://www.controlchats.com/pp`
  - Términos: `https://www.controlchats.com/condiciones-servicio`
  - Eliminación: URL pública actual hasta que se despliegue el callback firmado.
- Facebook Login for Business:
  - URI de redirección: `https://alta.controlchats.com/settings/whatsapp`
  - Dominio permitido para SDK: `https://alta.controlchats.com`
  - Callback de desautorización: `https://alta.controlchats.com/api/meta/deauthorize`, únicamente después de desplegarlo y comprobarlo.
- Webhooks: no configurar la URL definitiva ni suscribir campos hasta que el
  endpoint tenant-aware exista y el handshake haya sido probado desde internet.

## 2. Coolify — aplicación `control-crm-saas`, solo Production Runtime

Crear o actualizar estas variables directamente en Coolify. Marcar como secret
las indicadas; jamás poner valores en repositorio, capturas ni chat.

| Variable | Tipo | Origen / uso |
| --- | --- | --- |
| `META_APP_ID` | Configuración | ID de la App de Meta. |
| `META_APP_SECRET` | **Secret** | Información básica de Meta; solo servidor. |
| `META_CONFIG_ID` | Configuración | Ajuste de Facebook Login for Business. |
| `META_GRAPH_API_VERSION` | Configuración | `v25.0` inicialmente; frontend y backend deben coincidir. |
| `REVIEW_TENANT_SLUG` | Configuración | `meta-review`; solo cuando el tenant de revisión exista. |
| `REVIEW_WABA_ID` | Configuración | ID de la Test WABA. |
| `REVIEW_PHONE_NUMBER_ID` | Configuración | ID del número de prueba. |
| `REVIEW_SYSTEM_USER_TOKEN` | **Secret** | Token del usuario del sistema para conectar el número de prueba. |

Las existentes siguen siendo necesarias: `APP_BASE_URL=https://alta.controlchats.com`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` y `META_WEBHOOK_VERIFY_TOKEN`. El token de verificación por tenant y el estado de intentos no van en Coolify: los generará y cifrará el backend.

No hacen falta variables `NEXT_PUBLIC_*`: el frontend recibirá solo el App ID y
el Config ID no secretos desde un endpoint autenticado de configuración.

## 3. Meta Business Suite — número de revisión

Cuando la app y el código estén listos:

1. En **WhatsApp → Configuración de la API**, añadir solo tu teléfono de grabación como destinatario permitido del número de prueba.
2. En **Usuarios del sistema**, crear o reutilizar un usuario Admin.
3. Asignarle control total sobre la nueva app y la Test WABA.
4. Generar un token con únicamente `whatsapp_business_management` y `whatsapp_business_messaging`; pegarlo directamente en `REVIEW_SYSTEM_USER_TOKEN` de Coolify.
5. Copiar los IDs de WABA y Phone Number directamente a sus variables de Coolify.

## 4. Puertas antes de grabar

- [ ] El deployment muestra el commit nuevo y `/api/health` responde.
- [ ] El callback de desautorización rechaza un `signed_request` inválido.
- [ ] El callback de eliminación rechaza un `signed_request` inválido.
- [ ] El handshake del webhook devuelve el `hub.challenge` desde internet.
- [ ] La app está publicada.
- [ ] Un "Hola" desde el teléfono permitido entra a la bandeja y una respuesta vuelve al teléfono.
- [ ] `hello_world` llega al teléfono permitido.
- [ ] Una plantilla UTILITY creada desde ControlChats aparece con el estado que informa Meta.
- [ ] El popup "Conectar con Meta" abre con `fedCM: false` desde el workspace de revisión.

Solo después de completar y volver a probar estas puertas el mismo día se graban
los videos y se solicita acceso avanzado para `whatsapp_business_messaging` y
`whatsapp_business_management`.
