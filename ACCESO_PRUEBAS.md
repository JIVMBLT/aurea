# AUREA - Login provisional de seis digitos

Implementacion en la rama `request`. Esta pantalla es una **barrera visual de pruebas**, no autenticacion completa. La API de Supabase y sus tablas deben seguir protegidas con RLS/autenticacion propia; el PIN no crea un JWT ni otorga identidad de Supabase.

## Configuracion y requisitos

1. Ejecutar `sql/aurea_login_rpc.sql` en Supabase SQL Editor como administrador de la tabla.
2. Comprobar que `public.login` contiene `"user" = 'jvera@bltmexico.com.mx'`, `active=1` y un hash bcrypt de **exactamente seis digitos numericos** en `"pass"`. Si se hasheo otra palabra o codigo, no se validara un PIN de seis digitos.
3. La variable de GitHub `AUREA_TEST_EMAIL` debe coincidir con el correo de `public.login`. El frontend lo muestra solo lectura.
4. El workflow `.github/workflows/aurea-test-access.yml` construye `auth-config.js` con el correo y publica la app mediante Actions. **No utiliza ni necesita** `AUREA_TEST_PASSWORD` ni `SUPABASE_SERVICE_ROLE_KEY`. No revela el hash de la BD.
5. Para ejecutar `workflow_dispatch` desde GitHub Actions normalmente debe existir el workflow en la rama predeterminada. Revisar el cambio antes de incorporarlo a main. GitHub Pages debe estar configurado para Actions.

## Flujo

1. Usuario introduce PIN de seis digitos.
2. La funcion `aurea_login_salt` entrega unicamente la sal bcrypt del registro activo.
3. El frontend genera el hash bcrypt, con la misma sal y costo que el hash almacenado, y lo manda a `aurea_login_verify`.
4. La funcion compara el hash exacto con `public.login.pass` y `active=1`. Devuelve booleano.
5. Si es correcto se muestra la interfaz; si no, permanece en login. Hay un limitador **solo local** de cinco intentos / un minuto, que no constituye proteccion frente a fuerza bruta remota.

## Riesgos y restricciones

- El hash calculado en el navegador actua como credencial reutilizable. Quien lo capture podria repetir la llamada RPC. No almacenar informacion sensible basandose unicamente en esta barrera.
- La sal bcrypt visible permite fuerza bruta fuera de linea sobre un PIN de solo un millon de combinaciones. La base de datos nunca entrega el hash original al navegador.
- No hay sesion de Supabase Auth. El adaptador actual intentara `AureaCloud.connect()` al cargar los datos; si no existe una sesion real, **la app puede caer al respaldo local de IndexedDB**, no se sincronizara con Supabase. No se debe eludir RLS para forzar la conexion.
- Los Secret existentes pueden conservarse por compatibilidad, pero ya no se usan en este workflow.
- Pendiente probar extremo a extremo despues de ejecutar el SQL y desplegar la rama. No modificar `main` sin revision.
