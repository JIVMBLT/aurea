-- AUREA: retirar el acceso anónimo de pruebas.
-- Ejecutar cuando se active Supabase Auth y antes de cargar información real.

revoke update on public.companies from anon;
revoke select, insert, update, delete on
  public.clients,
  public.suppliers,
  public.product_categories,
  public.products,
  public.projects,
  public.project_items,
  public.budget_lines,
  public.expenses,
  public.expense_attachments
from anon;

drop policy if exists anon_test_companies_select on public.companies;
drop policy if exists anon_test_companies_update on public.companies;

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
    execute format('drop policy if exists anon_test_select on public.%I', table_name);
    execute format('drop policy if exists anon_test_insert on public.%I', table_name);
    execute format('drop policy if exists anon_test_update on public.%I', table_name);
    execute format('drop policy if exists anon_test_delete on public.%I', table_name);
  end loop;
end;
$$;

drop policy if exists anon_test_aurea_files_select on storage.objects;
drop policy if exists anon_test_aurea_files_insert on storage.objects;
drop policy if exists anon_test_aurea_files_update on storage.objects;
drop policy if exists anon_test_aurea_files_delete on storage.objects;
