(() => {
  'use strict';

  const CONFIG = Object.freeze({
    url: 'https://cricjzdizuzvgnmkbnkm.supabase.co',
    publishableKey: 'sb_publishable_C8Re_xwmAvWlThgai-WukQ_X9wl96oL',
    companyCode: 'aurea',
    bucket: 'aurea-files'
  });

  const sdk = window.supabase;
  const client = sdk && sdk.createClient
    ? sdk.createClient(CONFIG.url, CONFIG.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'aurea-auth'
        }
      })
    : null;

  let company = null;
  let membership = null;
  let authenticatedUser = null;
  const filePaths = new Map();
  const pendingAttachments = new Map();

  const compact = object => Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
  const millis = value => value ? new Date(value).getTime() : Date.now();
  const iso = value => value ? new Date(Number(value)).toISOString() : undefined;
  const numberOrNull = value =>
    value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
      ? null
      : Number(value);
  const dateOrNull = value => value || null;
  const safeName = value => String(value || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'archivo';

  function assertReady() {
    if (!client || !company) throw new Error('Supabase no está conectado');
  }

  async function result(request) {
    const response = await request;
    if (response.error) throw response.error;
    return response.data;
  }

  async function rows(table) {
    assertReady();
    return result(client.from(table).select('*').eq('company_id', company.id));
  }

  function withTimes(record, source) {
    if (source.createdAt) record.created_at = iso(source.createdAt);
    if (source.updatedAt) record.updated_at = iso(source.updatedAt);
    return compact(record);
  }

  function companyToLegacy(row) {
    return {
      id: 'co_' + row.code,
      name: row.name || row.short_name || 'Aurea',
      rfc: row.rfc || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      prefix: row.folio_prefix || 'AUR-COT-',
      validity: row.quote_validity_days ?? 15,
      ivaRate: Number(row.iva_rate ?? 16),
      notes: row.default_quote_notes || '',
      logo: row.logo_path || '',
      lastFx: row.last_fx ?? '',
      matCats: row.material_types || [],
      matUnits: row.units || [],
      supCats: row.supplier_categories || []
    };
  }

  function clientToLegacy(row) {
    return {
      id: row.id,
      companyId: CONFIG.companyCode,
      name: row.name,
      client: row.name,
      legalName: row.legal_name || '',
      rfc: row.rfc || '',
      contactName: row.contact_name || '',
      contactRole: row.contact_role || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      location: row.location || '',
      source: row.source || '',
      createdDate: row.registered_on || '',
      notes: row.notes || '',
      stage: row.stage || 'Cliente',
      prob: row.probability,
      amount: row.estimated_amount,
      nextDate: row.next_action_date || '',
      prevStage: row.previous_stage || '',
      wonAt: row.won_on || '',
      wonAmount: row.won_amount,
      lostAt: row.lost_on || '',
      lostReason: row.lost_reason || '',
      quote: row.quote || undefined,
      createdAt: millis(row.created_at),
      updatedAt: millis(row.updated_at)
    };
  }

  function supplierToLegacy(row) {
    return {
      id: row.id,
      name: row.name,
      supCat: row.supplier_category || '',
      contactName: row.contact_name || '',
      phone: row.phone || '',
      email: row.email || '',
      website: row.website || '',
      city: row.city || '',
      state: row.state || '',
      country: row.country || '',
      address: row.address || '',
      port: row.shipping_port || '',
      currency: row.currency || 'USD',
      notes: row.notes || '',
      createdAt: millis(row.created_at),
      updatedAt: millis(row.updated_at)
    };
  }

  function categoryToLegacy(row) {
    return {
      id: row.id,
      supplierId: row.supplier_id,
      name: row.name,
      category: row.material_type || '',
      fraccion: row.tariff_fraction || '',
      igi: row.igi_rate ?? '',
      reqNom: !!row.requires_nom,
      noms: row.noms || [],
      desc: row.description || '',
      createdAt: millis(row.created_at),
      updatedAt: millis(row.updated_at)
    };
  }

  function productToLegacy(row, categories) {
    const category = categories.get(row.category_id);
    if (row.photo_path) filePaths.set(row.photo_path, row.photo_path);
    return {
      id: row.id,
      supplierId: row.supplier_id,
      productId: row.category_id || '',
      name: row.name,
      model: row.model || '',
      category: category ? (category.material_type || category.name || '') : '',
      unit: row.unit || 'pza',
      reqInstall: !!row.requires_installation,
      reqPostSale: !!row.requires_after_sales,
      ownTariff: !!row.uses_own_tariff,
      fraccion: row.tariff_fraction || '',
      igi: row.igi_rate ?? '',
      reqNom: !!row.requires_nom,
      noms: row.noms || [],
      refCost: row.reference_cost ?? '',
      refCur: row.reference_currency || 'USD',
      notes: row.notes || '',
      photoId: row.photo_path || '',
      createdAt: millis(row.created_at),
      updatedAt: millis(row.updated_at)
    };
  }

  function lineToLegacy(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      amount: Number(row.amount || 0),
      cur: row.currency || 'MXN',
      order: row.sort_order || 0,
      auto: !!row.auto_generated,
      createdAt: millis(row.created_at),
      updatedAt: millis(row.updated_at)
    };
  }

  async function all(store) {
    assertReady();

    if (store === 'settings') return [companyToLegacy(company)];
    if (store === 'prospects') return (await rows('clients')).map(clientToLegacy);
    if (store === 'suppliers') return (await rows('suppliers')).map(supplierToLegacy);
    if (store === 'products') return (await rows('product_categories')).map(categoryToLegacy);

    if (store === 'materials') {
      const [productRows, categoryRows] = await Promise.all([
        rows('products'),
        rows('product_categories')
      ]);
      const categories = new Map(categoryRows.map(row => [row.id, row]));
      return productRows.map(row => productToLegacy(row, categories));
    }

    if (store === 'lines') return (await rows('budget_lines')).map(lineToLegacy);

    if (store === 'projects') {
      const [projectRows, itemRows] = await Promise.all([
        rows('projects'),
        rows('project_items')
      ]);
      const grouped = new Map();
      itemRows
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .forEach(row => {
          if (!grouped.has(row.project_id)) grouped.set(row.project_id, []);
          if (row.photo_path) filePaths.set(row.photo_path, row.photo_path);
          grouped.get(row.project_id).push({
            id: row.id,
            matId: row.product_id || '',
            supplierId: row.supplier_id || '',
            name: row.product_name,
            supplierName: row.supplier_name || '',
            category: row.category_name || '',
            unit: row.unit || 'pza',
            qty: String(row.quantity ?? 1),
            unitCost: String(row.unit_cost ?? 0),
            cur: row.currency || 'MXN',
            photoId: row.photo_path || ''
          });
        });

      return projectRows.map(row => ({
        id: row.id,
        companyId: CONFIG.companyCode,
        clientProspectId: row.client_id,
        fromProspectId: row.client_id,
        name: row.name,
        client: row.client_name || '',
        contactName: row.contact_name || '',
        phone: row.contact_phone || '',
        email: row.contact_email || '',
        location: row.location || '',
        start: row.start_date || '',
        end: row.end_date || '',
        income: row.contract_amount,
        status: row.status || 'En curso',
        desc: row.description || '',
        folio: row.quote_folio || '',
        quoteDate: row.quote_date || '',
        validity: row.quote_validity_days ?? '',
        ivaRate: Number(row.iva_rate ?? 16),
        quoteNotes: row.quote_notes || '',
        items: grouped.get(row.id) || [],
        createdAt: millis(row.created_at),
        updatedAt: millis(row.updated_at)
      }));
    }

    if (store === 'expenses') {
      const [expenseRows, attachmentRows] = await Promise.all([
        rows('expenses'),
        rows('expense_attachments')
      ]);
      const grouped = new Map();
      attachmentRows.forEach(row => {
        filePaths.set(row.id, row.storage_path);
        if (!grouped.has(row.expense_id)) grouped.set(row.expense_id, []);
        grouped.get(row.expense_id).push({
          id: row.id,
          name: row.file_name,
          type: row.mime_type
        });
      });
      return expenseRows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        lineId: row.budget_line_id,
        date: row.expense_date,
        amount: Number(row.amount || 0),
        concept: row.concept,
        supplier: row.supplier_name || '',
        docType: row.document_type || 'Ticket',
        folio: row.document_folio || '',
        pay: row.payment_method || 'Efectivo',
        notes: row.notes || '',
        files: grouped.get(row.id) || [],
        createdAt: millis(row.created_at),
        updatedAt: millis(row.updated_at)
      }));
    }

    if (store === 'files') {
      const [attachments, products, expenses] = await Promise.all([
        rows('expense_attachments'),
        rows('products'),
        rows('expenses')
      ]);
      const expenseProjects = new Map(expenses.map(row => [row.id, row.project_id]));
      const references = [
        ...attachments.map(row => ({
          id: row.id,
          expenseId: row.expense_id,
          projectId: expenseProjects.get(row.expense_id),
          name: row.file_name,
          type: row.mime_type,
          path: row.storage_path
        })),
        ...products.filter(row => row.photo_path).map(row => ({
          id: row.photo_path,
          materialId: row.id,
          name: row.photo_path.split('/').pop(),
          type: 'image/jpeg',
          path: row.photo_path
        }))
      ];

      const output = [];
      for (const reference of references) {
        const download = await client.storage.from(CONFIG.bucket).download(reference.path);
        if (download.error) throw download.error;
        output.push({ ...reference, blob: download.data });
      }
      return output;
    }

    return [];
  }

  async function putSettings(value) {
    const patch = compact({
      name: value.name,
      rfc: value.rfc,
      phone: value.phone,
      email: value.email,
      address: value.address,
      folio_prefix: value.prefix,
      quote_validity_days: value.validity,
      iva_rate: value.ivaRate,
      default_quote_notes: value.notes,
      logo_path: value.logo,
      last_fx: numberOrNull(value.lastFx),
      material_types: value.matCats,
      units: value.matUnits,
      supplier_categories: value.supCats
    });
    company = await result(
      client.from('companies').update(patch).eq('id', company.id).select('*').single()
    );
  }

  async function put(store, value) {
    assertReady();

    if (store === 'settings') return putSettings(value);

    if (store === 'prospects') {
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        name: value.client || value.name,
        legal_name: value.legalName || null,
        rfc: value.rfc || null,
        contact_name: value.contactName || null,
        contact_role: value.contactRole || null,
        phone: value.phone || null,
        email: value.email || null,
        address: value.address || null,
        location: value.location || null,
        source: value.source || null,
        registered_on: value.createdDate || null,
        notes: value.notes || null,
        stage: value.stage || 'Cliente',
        probability: numberOrNull(value.prob),
        estimated_amount: numberOrNull(value.amount),
        next_action_date: dateOrNull(value.nextDate),
        previous_stage: value.prevStage || null,
        won_on: dateOrNull(value.wonAt),
        won_amount: numberOrNull(value.wonAmount),
        lost_on: dateOrNull(value.lostAt),
        lost_reason: value.lostReason || null,
        quote: value.quote
      }, value);
      await result(client.from('clients').upsert(record));
      return;
    }

    if (store === 'suppliers') {
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        name: value.name,
        supplier_category: value.supCat || null,
        contact_name: value.contactName || null,
        phone: value.phone || null,
        email: value.email || null,
        website: value.website || null,
        city: value.city || null,
        state: value.state || null,
        country: value.country || null,
        address: value.address || null,
        shipping_port: value.port || null,
        currency: value.currency || 'USD',
        notes: value.notes || null
      }, value);
      await result(client.from('suppliers').upsert(record));
      return;
    }

    if (store === 'products') {
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        supplier_id: value.supplierId,
        name: value.name,
        material_type: value.category || null,
        tariff_fraction: value.fraccion || null,
        igi_rate: numberOrNull(value.igi),
        requires_nom: !!value.reqNom,
        noms: value.noms || [],
        description: value.desc || null
      }, value);
      await result(client.from('product_categories').upsert(record));
      return;
    }

    if (store === 'materials') {
      const photoPath = filePaths.get(value.photoId) || value.photoId || null;
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        supplier_id: value.supplierId,
        category_id: value.productId || null,
        name: value.name,
        model: value.model || null,
        unit: value.unit || 'pza',
        requires_installation: !!value.reqInstall,
        requires_after_sales: !!value.reqPostSale,
        uses_own_tariff: !!value.ownTariff,
        tariff_fraction: value.fraccion || null,
        igi_rate: numberOrNull(value.igi),
        requires_nom: !!value.reqNom,
        noms: value.noms || [],
        reference_cost: numberOrNull(value.refCost),
        reference_currency: value.refCur || 'USD',
        notes: value.notes || null,
        photo_path: photoPath
      }, value);
      await result(client.from('products').upsert(record));
      return;
    }

    if (store === 'projects') {
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        client_id: value.clientProspectId || value.fromProspectId,
        name: value.name,
        client_name: value.client || null,
        contact_name: value.contactName || null,
        contact_phone: value.phone || null,
        contact_email: value.email || null,
        location: value.location || null,
        start_date: dateOrNull(value.start),
        end_date: dateOrNull(value.end),
        contract_amount: numberOrNull(value.income),
        status: value.status || 'En curso',
        description: value.desc || null,
        quote_folio: value.folio || null,
        quote_date: dateOrNull(value.quoteDate),
        quote_validity_days: numberOrNull(value.validity),
        iva_rate: numberOrNull(value.ivaRate) ?? 16,
        quote_notes: value.quoteNotes || null
      }, value);
      await result(client.from('projects').upsert(record));

      if (Array.isArray(value.items)) {
        await result(client.from('project_items').delete().eq('project_id', value.id));
        if (value.items.length) {
          const items = value.items.map((item, index) => ({
            id: item.id,
            company_id: company.id,
            project_id: value.id,
            product_id: item.matId || null,
            supplier_id: item.supplierId || null,
            product_name: item.name,
            supplier_name: item.supplierName || null,
            category_name: item.category || null,
            unit: item.unit || 'pza',
            quantity: Number(item.qty || 0),
            unit_cost: Number(item.unitCost || 0),
            currency: item.cur || 'MXN',
            photo_path: filePaths.get(item.photoId) || item.photoId || null,
            sort_order: index
          }));
          await result(client.from('project_items').insert(items));
        }
      }
      return;
    }

    if (store === 'lines') {
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        project_id: value.projectId,
        name: value.name,
        amount: Number(value.amount || 0),
        currency: value.cur || 'MXN',
        sort_order: value.order || 0,
        auto_generated: !!value.auto
      }, value);
      await result(client.from('budget_lines').upsert(record));
      return;
    }

    if (store === 'expenses') {
      const record = withTimes({
        id: value.id,
        company_id: company.id,
        project_id: value.projectId,
        budget_line_id: value.lineId,
        expense_date: value.date,
        amount: Number(value.amount || 0),
        concept: value.concept,
        supplier_name: value.supplier || null,
        document_type: value.docType || 'Ticket',
        document_folio: value.folio || null,
        payment_method: value.pay || 'Efectivo',
        notes: value.notes || null
      }, value);
      await result(client.from('expenses').upsert(record));
      const queued = pendingAttachments.get(value.id);
      if (queued && queued.length) {
        await result(client.from('expense_attachments').upsert(queued));
        pendingAttachments.delete(value.id);
      }
      return;
    }

    if (store === 'files') {
      const folder = value.expenseId
        ? 'expenses/' + value.expenseId
        : 'products/' + (value.materialId || 'unassigned');
      const path = company.id + '/' + folder + '/' + value.id + '-' + safeName(value.name);
      const upload = await client.storage.from(CONFIG.bucket).upload(path, value.blob, {
        upsert: true,
        contentType: value.type || value.blob.type || 'application/octet-stream'
      });
      if (upload.error) throw upload.error;
      filePaths.set(value.id, path);
      filePaths.set(path, path);

      if (value.expenseId) {
        const attachment = {
          id: value.id,
          company_id: company.id,
          expense_id: value.expenseId,
          file_name: value.name || 'evidencia',
          mime_type: value.type || value.blob.type || 'application/octet-stream',
          storage_path: path,
          file_size: value.blob.size || null
        };
        const inserted = await client.from('expense_attachments').upsert(attachment);
        if (inserted.error) {
          if (inserted.error.code === '23503') {
            const queued = pendingAttachments.get(value.expenseId) || [];
            queued.push(attachment);
            pendingAttachments.set(value.expenseId, queued);
          } else {
            throw inserted.error;
          }
        }
      }

      if (value.materialId) {
        await client.from('products')
          .update({ photo_path: path })
          .eq('id', value.materialId);
      }
    }
  }

  async function getFilePath(id) {
    if (filePaths.has(id)) return filePaths.get(id);
    if (String(id).includes('/')) return String(id);

    const attachment = await client.from('expense_attachments')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();
    if (attachment.error) throw attachment.error;
    if (attachment.data) {
      filePaths.set(id, attachment.data.storage_path);
      return attachment.data.storage_path;
    }
    return '';
  }

  async function get(store, id) {
    assertReady();
    if (store !== 'files') return undefined;
    const path = await getFilePath(id);
    if (!path) return undefined;
    const download = await client.storage.from(CONFIG.bucket).download(path);
    if (download.error) throw download.error;
    return { id, blob: download.data };
  }

  async function remove(store, id) {
    assertReady();

    if (store === 'files') {
      const path = await getFilePath(id);
      if (path) {
        const removed = await client.storage.from(CONFIG.bucket).remove([path]);
        if (removed.error) throw removed.error;
        await client.from('products').update({ photo_path: null }).eq('photo_path', path);
      }
      await client.from('expense_attachments').delete().eq('id', id);
      filePaths.delete(id);
      return;
    }

    const table = {
      prospects: 'clients',
      suppliers: 'suppliers',
      products: 'product_categories',
      materials: 'products',
      projects: 'projects',
      lines: 'budget_lines',
      expenses: 'expenses'
    }[store];

    if (table) await result(client.from(table).delete().eq('id', id));
  }

  async function clear(store) {
    assertReady();
    if (store === 'settings') return;

    if (store === 'files') {
      const references = await all('files');
      const paths = references.map(reference => reference.path).filter(Boolean);
      if (paths.length) {
        const removed = await client.storage.from(CONFIG.bucket).remove(paths);
        if (removed.error) throw removed.error;
      }
      await result(client.from('expense_attachments').delete().eq('company_id', company.id));
      return;
    }

    const table = {
      prospects: 'clients',
      suppliers: 'suppliers',
      products: 'product_categories',
      materials: 'products',
      projects: 'projects',
      lines: 'budget_lines',
      expenses: 'expenses'
    }[store];

    if (table) await result(client.from(table).delete().eq('company_id', company.id));
  }

  async function fileURL(id) {
    assertReady();
    const path = await getFilePath(id);
    if (!path) return '';
    const signed = await client.storage.from(CONFIG.bucket).createSignedUrl(path, 3600);
    if (signed.error) throw signed.error;
    return signed.data.signedUrl;
  }

  function accessError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function getSession() {
    if (!client) throw new Error('No se cargó la librería de Supabase');
    const response = await client.auth.getSession();
    if (response.error) throw response.error;
    return response.data.session;
  }

  async function getUser() {
    if (!client) throw new Error('No se cargó la librería de Supabase');
    const response = await client.auth.getUser();
    if (response.error) throw response.error;
    if (!response.data.user) {
      throw accessError('Inicia sesión para continuar.', 'AUREA_AUTH_REQUIRED');
    }
    return response.data.user;
  }

  async function sendOtp(email) {
    if (!client) throw new Error('No se cargó la librería de Supabase');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) throw accessError('Captura tu correo.', 'AUREA_EMAIL_REQUIRED');
    const response = await client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false }
    });
    if (response.error) throw response.error;
    return normalizedEmail;
  }

  async function signInWithPassword(email, password) {
    if (!client) throw new Error('No se cargó la librería de Supabase');
    if (!email || !password) throw accessError('Falta configuración de acceso.', 'AUREA_AUTH_CONFIGURATION');
    const response = await client.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password)
    });
    if (response.error) throw response.error;
    return response.data.session;
  }

  async function verifyOtp(email, token) {
    if (!client) throw new Error('No se cargó la librería de Supabase');
    const response = await client.auth.verifyOtp({
      email: String(email || '').trim().toLowerCase(),
      token: String(token || '').replace(/\D/g, ''),
      type: 'email'
    });
    if (response.error) throw response.error;
    return response.data.session;
  }

  async function signOut() {
    if (!client) return;
    const response = await client.auth.signOut({ scope: 'local' });
    company = null;
    membership = null;
    authenticatedUser = null;
    if (response.error) throw response.error;
  }

  function onAuthStateChange(callback) {
    if (!client) return { unsubscribe() {} };
    const subscription = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        company = null;
        membership = null;
        authenticatedUser = null;
      }
      callback(event, session);
    });
    return subscription.data.subscription;
  }

  async function connect() {
    if (!client) throw new Error('No se cargó la librería de Supabase');

    authenticatedUser = await getUser();
    const memberships = await result(
      client
        .from('company_members')
        .select('company_id')
        .eq('user_id', authenticatedUser.id)
    );

    if (!memberships || !memberships.length) {
      throw accessError(
        'Tu cuenta no tiene acceso a AUREA. Solicita una invitación al administrador.',
        'AUREA_MEMBERSHIP_REQUIRED'
      );
    }

    company = null;
    membership = null;

    for (const candidate of memberships) {
      const response = await client
        .from('companies')
        .select('*')
        .eq('id', candidate.company_id)
        .eq('code', CONFIG.companyCode)
        .maybeSingle();

      if (response.error) throw response.error;
      if (response.data) {
        company = response.data;
        membership = candidate;
        break;
      }
    }

    if (!company) {
      throw accessError(
        'Tu cuenta no pertenece a la empresa AUREA.',
        'AUREA_COMPANY_REQUIRED'
      );
    }

    return {
      companyId: company.id,
      code: company.code,
      user: authenticatedUser,
      membership
    };
  }

  window.AureaCloud = {
    config: CONFIG,
    client,
    connect,
    all,
    get,
    put,
    delete: remove,
    clear,
    fileURL,
    auth: {
      getSession,
      getUser,
      sendOtp,
      signInWithPassword,
      verifyOtp,
      signOut,
      onAuthStateChange
    },
    currentUser: () => authenticatedUser,
    currentMembership: () => membership,
    isConnected: () => !!company && !!authenticatedUser
  };
})();
