-- AUREA: validar un PIN de 6 digitos ya guardado como bcrypt en public.login.
-- Ejecutar UNA VEZ en Supabase SQL Editor, como propietario de public.login.
-- La cuenta predeterminada se obtiene de AUREA_TEST_EMAIL y NO se registra aqui.
-- No reemplaza Supabase Auth ni emite sesiones/JWT.

begin;

-- Evita consultas directas de los hashes mediante la Data API.
alter table public.login enable row level security;
revoke all privileges on table public.login from public, anon, authenticated;

-- Solo devuelve la sal bcrypt (29 caracteres), no el hash completo.
create or replace function public.aurea_login_salt(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select left(l."pass", 29)
  from public.login as l
  where lower(btrim(l."user")) = lower(btrim(p_email))
    and l.active = 1
    and l."pass" ~ '^\$2[ab]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  limit 1
$fn$;

-- Comprueba el hash bcrypt calculado en el navegador y el estatus activo.
-- IMPORTANTE: el hash enviado se puede reutilizar como credencial;
-- es solo una barrera de pruebas, no autentica la API de datos.
create or replace function public.aurea_login_verify(p_email text, p_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.login as l
    where lower(btrim(l."user")) = lower(btrim(p_email))
      and l.active = 1
      and l."pass" = p_hash
      and length(p_hash) = 60
  )
$fn$;

revoke all on function public.aurea_login_salt(text) from public;
revoke all on function public.aurea_login_verify(text, text) from public;
grant execute on function public.aurea_login_salt(text) to anon, authenticated;
grant execute on function public.aurea_login_verify(text, text) to anon, authenticated;

commit;

-- Comprobacion opcional (solo SQL Editor):
-- select "user", left("pass", 7) as prefijo_bcrypt, active
-- from public.login;
