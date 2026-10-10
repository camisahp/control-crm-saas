# Plan y revisión constitucional

1. Parser puro y acotado de signed_request. No registrar cuerpo, firma o secretos.
2. Añadir sujeto/fecha de autorización nullable a meta_credentials, sin cambiar
   conexiones existentes. Registro global de sujetos Meta con máximo issued_at
   revocado, sin tokens, contenido ni acceso a datos de organizaciones.
3. Guardado/revocación transaccionales con bloqueo de sujeto; revocación sólo
   mediante actor+app y scoped organization. Guardado manual limpia asociaciones.
4. Capturar signedRequest opcional del SDK; fallback debug_token USER solamente.
5. Route Node pública POST, respuestas genéricas; sin CSRF de sesión porque Meta
   autentica por firma. Bounded body y error sin detalle de proveedor/DB.
6. Migración aditiva, tests puros y funcionales; sólo después commit/push/deploy.

Constitution check: credenciales cifradas; Meta es dependencia ya permitida;
idempotencia y org-first para efectos sobre datos de negocio. El registro de
sujetos es identidad de autenticación, como user/account (globales), NO entidad
de dominio: no guarda datos de tenants y no permite seleccionarlos por omisión.
Es necesario para callback previo al guardado y evitar reconectar con prueba
revocada. Esta excepción está visible; ninguna tabla de dominio pierde tenant.

Riesgo SDK: response_type code puede omitir signedRequest. No inventar identidad
ni cambiar el flujo a permisos extras. Si el token es SYSTEM_USER y no hay
signedRequest verificable, el alta falla de forma segura y se informa su límite.
El número manual de revisión no se reconecta ni migra por suposición.
