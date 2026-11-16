-- AUREA: acceso anónimo TEMPORAL para pruebas sin pantalla de inicio de sesión.
-- Ejecutar después del esquema principal en Supabase SQL Editor.
-- IMPORTANTE: retirar estas políticas antes de cargar información real o publicar el portal.

grant usage on schema public to anon;

grant select, update on public.companies to anon;
grant select, insert, update, delete on
  public.clients,
  public.suppliers,
  public.product_categories,
  public.products,
  public.projects,
  public.project_items,
  public.budget_lines,
  public.expenses,
  public.expense_attachments
to anon;

alter table public.companies enable row level security;

drop policy if exists anon_test_companies_select on public.companies;
drop policy if exists anon_test_companies_update on public.companies;

create policy anon_test_companies_select
on public.companies
for select
to anon
using (code = 'aurea');

create policy anon_test_companies_update
on public.companies
for update
to anon
using (code = 'aurea')
with check (code = 'aurea');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients',
    'suppliers',
    'product_categories',
    'products',
    'projects',
    'project_items',
    'budget_lines',
    'expenses',
    'expense_attachments'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists anon_test_select on public.%I', table_name);
    execute format('drop policy if exists anon_test_insert on public.%I', table_name);
    execute format('drop policy if exists anon_test_update on public.%I', table_name);
    execute format('drop policy if exists anon_test_delete on public.%I', table_name);

    execute format(
      'create policy anon_test_select on public.%I
       for select to anon
       using (
         company_id = (
           select id from public.companies where code = ''aurea''
         )
       )',
      table_name
    );

    execute format(
      'create policy anon_test_insert on public.%I
       for insert to anon
       with check (
         company_id = (
           select id from public.companies where code = ''aurea''
         )
       )',
      table_name
    );

    execute format(
      'create policy anon_test_update on public.%I
       for update to anon
       using (
         company_id = (
           select id from public.companies where code = ''aurea''
         )
       )
       with check (
         company_id = (
           select id from public.companies where code = ''aurea''
         )
       )',
      table_name
    );

    execute format(
      'create policy anon_test_delete on public.%I
       for delete to anon
       using (
         company_id = (
           select id from public.companies where code = ''aurea''
         )
       )',
      table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'aurea-files',
  'aurea-files',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

drop policy if exists anon_test_aurea_files_select on storage.objects;
drop policy if exists anon_test_aurea_files_insert on storage.objects;
drop policy if exists anon_test_aurea_files_update on storage.objects;
drop policy if exists anon_test_aurea_files_delete on storage.objects;

create policy anon_test_aurea_files_select
on storage.objects
for select
to anon
using (
  bucket_id = 'aurea-files'
  and (storage.foldername(name))[1] = (
    select id::text from public.companies where code = 'aurea'
  )
);

create policy anon_test_aurea_files_insert
on storage.objects
for insert
to anon
with check (
  bucket_id = 'aurea-files'
  and (storage.foldername(name))[1] = (
    select id::text from public.companies where code = 'aurea'
  )
);

create policy anon_test_aurea_files_update
on storage.objects
for update
to anon
using (
  bucket_id = 'aurea-files'
  and (storage.foldername(name))[1] = (
    select id::text from public.companies where code = 'aurea'
  )
)
with check (
  bucket_id = 'aurea-files'
  and (storage.foldername(name))[1] = (
    select id::text from public.companies where code = 'aurea'
  )
);

create policy anon_test_aurea_files_delete
on storage.objects
for delete
to anon
using (
  bucket_id = 'aurea-files'
  and (storage.foldername(name))[1] = (
    select id::text from public.companies where code = 'aurea'
  )
);

-- Validación rápida: debe devolver una sola fila.
select id, code, name
from public.companies
where code = 'aurea';
