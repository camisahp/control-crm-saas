# Ficha del SaaS · ControlChats / ControlCRM SaaS

_Preparada el 5 de octubre de 2026 (America/Bogota). No contiene secretos, tokens, PIN ni OTP._

## Confirmado

| Dato | Valor |
| --- | --- |
| Producto | ControlChats / ControlCRM SaaS |
| Modelo | SaaS multi-tenant: cada negocio conecta y conserva su propia WABA y número |
| Dominio principal | `controlchats.com` |
| Espacio de revisión | `https://alta.controlchats.com/settings/whatsapp` |
| Términos | `https://www.controlchats.com/condiciones-servicio` |
| Privacidad | `https://www.controlchats.com/pp` |
| Eliminación pública | `https://www.controlchats.com/eliminacion-datos` |
| Infraestructura | VPS Hostinger, Coolify autogestionado, PostgreSQL y OpenRouter con GLM-5 Flash |
| Portafolio de Meta | Verificado; existe otra app funcional en él |
| Estado de la nueva app | Aún no creada |
| Primera revisión | Solo `whatsapp_business_messaging` y `whatsapp_business_management` |
| Responsable de datos | HERNANDEZ MORA EDWIN |
| País del responsable | Colombia |
| Contacto de privacidad | `info@sodiau.com` |
| Mercado inicial | Latinoamérica; no se dirige inicialmente a personas en la UE |

## Pendiente de confirmar antes de crear o enviar la app

- Ícono PNG opaco de exactamente 1024 × 1024.
- Nombre legal y país de procesamiento de Hostinger, OpenRouter y cualquier proveedor efectivo del modelo GLM-5 Flash; confirmar si PostgreSQL procesa únicamente en el VPS.
- Retención concreta de mensajes, contactos, adjuntos, registros operativos y copias de seguridad; plazo y método de eliminación o anonimización.
- Políticas escritas para solicitudes de autoridades públicas: evaluación de legalidad, impugnación de solicitudes no legítimas, minimización y registro de respuesta.

## Hechos que todavía requieren prueba en vivo

- Handshake público de webhook, firma y callbacks de eliminación/desautorización.
- Número de prueba conectado al tenant de revisión, mensaje entrante, respuesta, `hello_world` y plantilla nueva.
- Popup de Embedded Signup y flujo completo de un tenant simulado.
