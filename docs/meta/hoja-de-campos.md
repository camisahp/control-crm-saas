# Hoja de campos · ControlChats / ControlCRM SaaS · Meta Tech Provider

_Preparada el 5 de octubre de 2026. Los valores marcados **PENDIENTE** se completan con datos reales, nunca inventados. Los secretos no se anotan aquí._

## 1. Crear aplicación

- [ ] Nombre: `ControlChats`
- [ ] Caso de uso: **Conectar en WhatsApp**
- [ ] Portafolio: el portafolio comercial ya verificado de ControlChats

## 2. Información básica

- [ ] Nombre para mostrar: `ControlChats`
- [ ] Espacio de nombres: `controlchats` (confirmar disponibilidad)
- [ ] Dominio de la app: `controlchats.com`
- [ ] Correo de contacto: `info@sodiau.com`
- [ ] Privacidad: `https://www.controlchats.com/pp`
- [ ] Condiciones: `https://www.controlchats.com/condiciones-servicio`
- [ ] Eliminación de datos: usar inicialmente `https://www.controlchats.com/eliminacion-datos`; sustituir por callback cuando el endpoint firmado esté desplegado
- [ ] Ícono: **PENDIENTE — PNG 1024 × 1024 opaco**
- [ ] Categoría: `Bots de Messenger para empresas`
- [ ] Plataforma web: `https://alta.controlchats.com/settings/whatsapp`
- [ ] Delegado de protección de datos: No aplica inicialmente; el servicio se dirige a Latinoamérica y no a personas en la UE

## 3. Facebook Login for Business

- [ ] OAuth con cliente: Sí
- [ ] OAuth web: Sí
- [ ] Forzar reautenticación web: No
- [ ] URI estrictas: Sí
- [ ] HTTPS: Sí
- [ ] Navegador integrado: Sí
- [ ] SDK JavaScript: Sí
- [ ] URI de redirección: `https://alta.controlchats.com/settings/whatsapp`
- [ ] Dominio permitido para SDK: `https://alta.controlchats.com`
- [ ] Callback de desautorización: **PENDIENTE — endpoint firmado y desplegado**

## 4. Ajuste de Embedded Signup

- [ ] Nombre: `Embedded ControlChats Oct26`
- [ ] Variación: Registro insertado de WhatsApp
- [ ] Producto: WhatsApp Cloud API; no agregar Ads, Instagram ni Messenger
- [ ] Caducidad del identificador: Nunca
- [ ] Activos: Cuentas de WhatsApp; tareas mínimas `MANAGE_TEMPLATES`, `VIEW_TEMPLATES`, `VIEW_PHONE_ASSETS`, `MANAGE_PHONE_ASSETS`, `MESSAGING`
- [ ] Permisos: solo `whatsapp_business_management`, `whatsapp_business_messaging`
- [ ] Registrar el identificador del ajuste únicamente en el gestor de configuración, como `META_CONFIG_ID`

## 5. Webhooks y revisión

- [ ] URL, verificación y firma: **PENDIENTE — diseño tenant-aware y prueba pública**
- [ ] Campos: `messages`, `message_template_status_update`, `account_update`
- [ ] Número de prueba conectado al workspace de revisión
- [ ] App publicada
- [ ] Pruebas reales: handshake, entrante, respuesta, `hello_world`, plantilla nueva y popup

## 6. Gestión de datos

- [ ] Encargados: Sí
- [ ] Responsable: `HERNANDEZ MORA EDWIN`
- [ ] País del responsable: `Colombia`
- [ ] Procesadores y países: **PENDIENTE — verificar entidad legal y país efectivo de Hostinger, OpenRouter/GLM-5 Flash y demás subprocesadores reales**
- [ ] Retención/eliminación: **PENDIENTE — política concreta y publicada**
- [ ] Políticas sobre solicitudes de autoridades: **PENDIENTE — redactadas y aplicadas antes de marcarlas**
