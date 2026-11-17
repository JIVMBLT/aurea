# AUREA - Acceso compartido de pruebas

Esta rama reemplaza el OTP por una sola pantalla de contraseña. La autenticación es real en Supabase Auth: el frontend nunca recibe la contraseña desde GitHub Actions. **No apto para producción:** todos los usuarios comparten identidad y permisos; no hay trazabilidad por persona ni revocación individual.

## Configuración requerida

En GitHub, Settings > Secrets and variables > Actions:

**Repository secrets**
- `AUREA_TEST_PASSWORD`: contraseña compartida robusta, mínimo 12 caracteres. No usar un secreto que ya tenga otros propósitos.
- `SUPABASE_SERVICE_ROLE_KEY`: clave de servicio privada de Supabase, usada solamente en el job de provisión; jamás en la web pública.

**Repository variables**
- `AUREA_TEST_EMAIL`: dirección de la cuenta compartida de pruebas (será visible públicamente en `auth-config.js`).
- `SUPABASE_URL`: URL del proyecto Supabase.

El workflow `.github/workflows/aurea-test-access.yml` crea o actualiza ese usuario, lo vincula a `companies.code='aurea'` mediante `company_members`, crea la configuración pública que contiene **solo el correo** y publica `dist` en GitHub Pages. Se ejecuta **solo manualmente**.

## Primer despliegue

GitHub exige que un workflow de `workflow_dispatch` exista en la rama predeterminada para poder lanzarlo normalmente desde Actions. Antes de ejecutarlo, revisar y fusionar **solo la configuración del workflow y los archivos del acceso** a la rama predeterminada, o coordinar su adopción desde una rama por el equipo. El job hace checkout explícito de `request`. Asegurar que Pages esté configurado para publicar con **GitHub Actions**, no con una rama.

No ejecutar el workflow con cambios no revisados en `scripts/provision-test-user.mjs` en `request`: durante la provisión dispone de una clave administrativa. El repositorio puede seguir siendo público porque la clave administrativa es un secreto de Actions, pero sus permisos son amplios.

La app requiere que la base de datos tenga las tablas `companies` y `company_members` tal como las espera `supabase-adapter.js`, y las políticas RLS apropiadas para los permisos de la cuenta compartida.

## Rotar la contraseña

Actualizar `AUREA_TEST_PASSWORD` en Secrets y volver a ejecutar el workflow. La contraseña anterior dejará de servir para inicios de sesión nuevos. Para revocar también sesiones que ya estén abiertas, se necesita invalidarlas en Supabase; cambiar solo la contraseña no garantiza su cierre inmediato.

## Limitaciones

- Sin una validación exitosa contra Supabase, la pantalla no desbloquea la aplicación.
- La configuración `auth-config.js` se genera en el despliegue; **no** se almacena un correo fijo ni la contraseña en el repositorio.
- No se ha comprobado que los secretos estén creados, ni que GitHub Pages y la base estén listos: el despliegue real está pendiente.
- Los datos locales de IndexedDB no constituyen un almacén cifrado por este login.
