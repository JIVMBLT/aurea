-- AUREA / PRUEBAS: acceso a datos usando EXCLUSIVAMENTE el PIN de 6 digitos.
-- Ejecutar como propietario en Supabase SQL Editor.
-- NO da acceso publico sin conocer el hash del PIN validado.
-- No es autenticacion fuerte: el hash se transmite y puede reutilizarse.
-- Afecta tablas del modulo; no modifica storage.objects ni company_members.

begin;

create or replace function public.aurea_pin_authorized()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.login as l
    where lower(btrim(l."user")) =
      lower(btrim((nullif(current_setting('request.headers', true), '')::jsonb)->>'x-aurea-email'))
      and l."pass" =
      (nullif(current_setting('request.headers', true), '')::jsonb)->>'x-aurea-pin-proof'
      and l.active = 1
      and l."pass" ~ '^\$2[ab]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  )
$function$;

revoke all on function public.aurea_pin_authorized() from public, anon, authenticated;
grant execute on function public.aurea_pin_authorized() to anon;

-- Las politicas RESTRICTIVE requieren el PIN aun cuando existan
-- otras politicas anon permisivas en estas mismas tablas.
alter table public.companies enable row level security;
revoke all on table public.companies from anon;
grant select, update on table public.companies to anon;

drop policy if exists aurea_pin_gate_companies on public.companies;
create policy aurea_pin_gate_companies
on public.companies as restrictive for all to anon
using (code = 'aurea' and (select public.aurea_pin_authorized()))
with check (code = 'aurea' and (select public.aurea_pin_authorized()));

drop policy if exists aurea_pin_allow_companies on public.companies;
create policy aurea_pin_allow_companies
on public.companies as permissive for all to anon
using (true) with check (true);

do $migration$
declare
  tbl text;
  tenant_filter text := 'company_id = (select id from public.companies where code = ''aurea'' limit 1)';
begin
  foreach tbl in array ARRAY[
    'clients', 'suppliers', 'product_categories', 'products',
    'budget_lines', 'projects', 'project_items', 'expenses',
    'expense_attachments'
  ]
  loop
    if to_regclass(format('public.%I', tbl)) is null then
      raise exception 'Falta la tabla public.%', tbl;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'company_id'
    ) then
      raise exception 'La tabla public.% no tiene company_id; revisar esquema antes de aplicar', tbl;
    end if;

    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on table public.%I from anon', tbl);
    execute format('grant select, insert, update, delete on table public.%I to anon', tbl);

    execute format('drop policy if exists aurea_pin_gate_data on public.%I', tbl);
    execute format(
      'create policy aurea_pin_gate_data on public.%I as restrictive for all to anon ' ||
      'using ((select public.aurea_pin_authorized()) and (%s)) ' ||
      'with check ((select public.aurea_pin_authorized()) and (%s))',
      tbl, tenant_filter, tenant_filter
    );

    execute format('drop policy if exists aurea_pin_allow_data on public.%I', tbl);
    execute format(
      'create policy aurea_pin_allow_data on public.%I as permissive for all to anon ' ||
      'using (true) with check (true)',
      tbl
    );
  end loop;
end
$migration$;

commit;

-- Advertencia:
-- La API con un hash de PIN reutilizable es un acceso temporal de baja seguridad.
-- Supabase Storage requiere politicas propias; este script NO las modifica.
