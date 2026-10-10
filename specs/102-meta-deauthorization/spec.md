# Desautorización de Meta — ControlChats

Fecha: 2026-10-10. Carril: ciclo completo (migración y callback público).
Autorizado: implementar, probar y desplegar sólo control-crm-saas/main.
Estado: implementado y verificado localmente; rollout y pruebas públicas pendientes.

Cuando Meta informa que un autorizante retira la app, el SaaS debe retirar
únicamente sus credenciales verificadas, sin borrar conversaciones ni activos
de Meta. Una firma inválida no produce escrituras. Las conexiones manuales
anteriores no se atribuyen a una identidad por nombre, correo o slug.

## Aceptación

1. POST /api/meta/deauthorize recibe form-urlencoded signed_request, verifica
   HMAC-SHA256 con el secreto existente, algoritmo, identidad y issued_at.
   Formato/firma inválidos: 400/401; secreto ausente: 503; método GET: 405.
2. La identidad del nuevo Embedded Signup proviene de signedRequest de Meta
   verificado y reciente. Si no existe, sólo se admite debug_token válido de
   tipo USER y app_id coincidente. SYSTEM_USER no equivale al humano autorizante.
   Sin prueba: no guardar la conexión; error seguro, sin secretos.
3. Revocación: retirar fila de credencial por organización y sujeto verificado,
   preservando mensajes, contactos, archivos, plantillas y otras conexiones.
4. Repeticiones y callbacks anteriores a una nueva autorización no desconectan
   una conexión nueva. Revocación y guardado se serializan por sujeto.
5. Sujeto sin conexión: confirmar recepción, no atribuirle una conexión manual.
   Mantener marca mínima de revocación para impedir una conexión en carrera.
6. Credenciales manuales/número de revisión quedan sin asociación humana hasta
   disponer de prueba. No se modifica la otra app Meta ni se pide otro permiso.
7. Test A/B, integración HTTP local, tipos/lint/build/suite y humo HTTPS posterior
   al rollout. No declarar revocación humana real probada sólo por un 200.

## Fuera de alcance

Eliminación de datos/historial, cancelación del número/WABA, desconexión de otros
productos, cambios legales públicos, permisos adicionales y carga de App Review.

## Límite explícito del flujo de Meta

La captura de signedRequest en el SDK aún no está probada con un alta real.
El token empresarial SYSTEM_USER, sin esa prueba, no identifica al humano.
Por seguridad ese nuevo alta se rechaza antes de guardar/suscribir; no se
declara onboarding externo completo ni se añaden permisos para eludirlo.
La conexión manual del número de revisión sigue funcionando sin esa asociación.
