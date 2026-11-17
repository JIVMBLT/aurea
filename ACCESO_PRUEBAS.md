# AUREA: acceso por PIN en fase de pruebas

La pantalla pide **un unico codigo numerico de seis digitos**. El correo configurado se usa internamente y no aparece en el formulario. El PIN se verifica con bcrypt contra `public.login`; se mantiene en memoria un comprobante derivado del hash para solicitar los datos de AUREA.

## Pasos obligatorios en Supabase SQL Editor

1. La tabla `public.login` debe contener el correo configurado en `auth-config.js`, el hash bcrypt de **exactamente seis digitos** y `active = 1`.
2. Si no se ejecuto previamente, ejecutar `sql/aurea_login_rpc.sql`: crea `aurea_login_salt` y `aurea_login_verify`.
3. Ejecutar `sql/aurea_pin_data_access.sql`: agrega la comprobacion del PIN a las politicas RLS de las tablas de datos de AUREA y permite las operaciones a la funcion `anon` **solo con el comprobante correcto**. Este script modifica permisos y politicas. Revisarlo antes de ejecutarlo, especialmente si las tablas se comparten con otros clientes o aplicaciones.
4. Desplegar `main` en GitHub Pages, configurado para GitHub Actions. El workflow `aurea-test-access.yml` no utiliza ningun Secret.

Sin el segundo SQL, el PIN permite desbloquear la pantalla, pero las consultas a las tablas de datos pueden seguir fallando. Si el SQL falla por ausencia de `company_id` u otra incompatibilidad, el bloque transaccional revierte todo.

## Flujo y limitaciones

- El navegador solicita la sal bcrypt, genera el hash del codigo y lo compara por RPC.
- Si es valido, las solicitudes posteriores incluyen `x-aurea-email` y `x-aurea-pin-proof` para que la funcion `aurea_pin_authorized()` lo verifique mediante RLS. No se utiliza Supabase Auth ni se requiere una segunda cuenta.
- Los datos se consultan por la empresa `companies.code = 'aurea'`.
- **Solo modo de pruebas:** el hash enviado se puede copiar/reutilizar como credencial. Un PIN de seis digitos es vulnerable a ataques de fuerza bruta; el limitador de intentos en la pagina no controla el servidor.
- Las politicas de **Supabase Storage** (`storage.objects`) no se incluyen en este cambio. Adjuntos y fotos pueden continuar requiriendo permisos adicionales.
- Las funciones y el esquema de la base no se han ejecutado desde GitHub. La integracion de extremo a extremo debe probarse en el entorno real.

## Enlaces principales

- `auth-password.js`: pantalla y validacion del PIN.
- `supabase-adapter.js`: client Supabase sin sesion Auth, conexions y encabezados.
- `sql/aurea_login_rpc.sql`: RPC del login.
- `sql/aurea_pin_data_access.sql`: autorizacion para datos y RLS.
