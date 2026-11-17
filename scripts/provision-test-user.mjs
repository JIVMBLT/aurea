import { createClient } from '@supabase/supabase-js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUREA_TEST_EMAIL', 'AUREA_TEST_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error('Falta configuracion privada: ' + key);
}

const email = process.env.AUREA_TEST_EMAIL.trim().toLowerCase();
const password = process.env.AUREA_TEST_PASSWORD;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('AUREA_TEST_EMAIL no es valido.');
if (password.length < 12) throw new Error('La clave de pruebas debe tener al menos 12 caracteres.');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let user;
for (let page = 1; page <= 100; page++) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (result.error) throw result.error;
  user = result.data.users.find(candidate => candidate.email?.toLowerCase() === email);
  if (user || result.data.users.length < 200) break;
}

if (user) {
  const updated = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (updated.error) throw updated.error;
  user = updated.data.user;
} else {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  user = created.data.user;
}

const companyResult = await admin.from('companies').select('id').eq('code', 'aurea').single();
if (companyResult.error) throw companyResult.error;

const membershipResult = await admin.from('company_members')
  .select('company_id')
  .eq('company_id', companyResult.data.id)
  .eq('user_id', user.id)
  .maybeSingle();
if (membershipResult.error) throw membershipResult.error;

if (!membershipResult.data) {
  const inserted = await admin.from('company_members').insert({
    user_id: user.id, company_id: companyResult.data.id
  });
  if (inserted.error) throw inserted.error;
}

console.log('Cuenta de pruebas de AUREA aprovisionada y vinculada a su empresa.');
