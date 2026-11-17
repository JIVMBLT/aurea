(() => {
  'use strict';

  // Barrera de pruebas: no proporciona una sesión de Supabase Auth.
  // El servidor guarda el hash bcrypt, el frontend solo recibe la sal.
  const cloud = window.AureaCloud;
  const email = String(window.AureaAuthConfig?.email || '').trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const PIN_RE = /^[0-9]{6}$/;

  let gate, form, pinInput, messageBox, submitButton;
  let readyPromise, resolveReady;
  let authenticated = false;
  let failures = 0;
  let blockedUntil = 0;

  function el(tag, attributes = {}, value) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(attributes)) {
      if (key === 'class') node.className = val;
      else node.setAttribute(key, String(val));
    }
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function mount() {
    if (gate) return;
    const style = el('style', { id: 'aurea-auth-styles' });
    style.textContent = [
      'body.aurea-auth-locked{overflow:hidden}',
      '.aurea-auth-gate{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#11100e 0%,#2b2115 55%,#11100e 100%);color:#211d18;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '.aurea-auth-gate[hidden]{display:none}',
      '.aurea-auth-card{width:min(100%,420px);background:#fff;border:1px solid rgba(198,151,67,.42);border-radius:22px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.42)}',
      '.aurea-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}',
      '.aurea-auth-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#1c1915;color:#d8ad62;font-family:Georgia,serif;font-size:24px}',
      '.aurea-auth-brand strong{display:block;font-family:Georgia,serif;font-size:24px;letter-spacing:.04em;color:#211d18}',
      '.aurea-auth-brand span{display:block;margin-top:2px;color:#7b7064;font-size:12px;letter-spacing:.08em;text-transform:uppercase}',
      '.aurea-auth-card h2{margin:0 0 8px;font-size:24px;color:#211d18}',
      '.aurea-auth-card p{margin:0 0 20px;color:#645d55;line-height:1.45}',
      '.aurea-auth-form{display:grid;gap:14px}',
      '.aurea-auth-form label{display:grid;gap:7px;font-size:13px;font-weight:700;color:#403a33}',
      '.aurea-auth-form input{width:100%;box-sizing:border-box;border:1px solid #cfc8bf;border-radius:12px;padding:13px 14px;background:#fff;color:#171411;font:inherit;outline:none}',
      '.aurea-auth-form input:focus{border-color:#b9852f;box-shadow:0 0 0 3px rgba(185,133,47,.17)}',
      '.aurea-auth-code{text-align:center;letter-spacing:.33em;font-size:24px!important;font-variant-numeric:tabular-nums}',
      '.aurea-auth-primary{min-height:46px;border:1px solid #211d18;border-radius:12px;padding:11px 16px;background:#211d18;color:#fff;font:inherit;font-weight:750;cursor:pointer}',
      '.aurea-auth-primary:hover{background:#3a3026}',
      '.aurea-auth-primary:disabled{cursor:not-allowed;opacity:.55}',
      '.aurea-auth-message{min-height:22px;margin:2px 0 0!important;font-size:13px;color:#645d55!important}',
      '.aurea-auth-message[data-kind="error"]{color:#a53030!important}',
      '.aurea-auth-note{margin:22px 0 0!important;padding-top:18px;border-top:1px solid #ece8e2;font-size:12px;color:#82796f!important}',
      '@media(max-width:520px){.aurea-auth-gate{padding:0;background:#fff}.aurea-auth-card{width:100%;min-height:100%;box-sizing:border-box;border:0;border-radius:0;padding:30px 22px;display:flex;flex-direction:column;justify-content:center;box-shadow:none}}'
    ].join('');

    gate = el('section', {
      id: 'aureaAuthGate', class: 'aurea-auth-gate',
      role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'aureaAuthTitle'
    });
    const card = el('div', { class: 'aurea-auth-card' });
    const brand = el('div', { class: 'aurea-auth-brand' });
    const brandName = el('div');
    brandName.append(
      el('strong', {}, 'Aurea'),
      el('span', {}, 'Control de proyectos')
    );
    brand.append(el('div', { class: 'aurea-auth-mark', 'aria-hidden': 'true' }, 'A'), brandName);
    const title = el('h2', { id: 'aureaAuthTitle' }, 'Acceso de pruebas');
    const intro = el('p', {}, 'Introduce el código numérico de 6 dígitos para continuar.');

    form = el('form', { class: 'aurea-auth-form', id: 'aureaPinForm' });
    const userLabel = el('label', {}, 'Correo');
    const userDisplay = el('input', { type: 'email', readonly: 'readonly', 'aria-label': 'Correo predeterminado' });
    userDisplay.value = email;
    userLabel.append(userDisplay);
    const pinLabel = el('label', { for: 'aureaPinInput' }, 'Código de acceso');
    pinInput = el('input', {
      id: 'aureaPinInput', class: 'aurea-auth-code',
      type: 'password', name: 'code', inputmode: 'numeric',
      autocomplete: 'off', pattern: '[0-9]{6}',
      maxlength: '6', minlength: '6',
      required: 'required', 'aria-describedby': 'aureaAuthMessage'
    });
    pinLabel.append(pinInput);
    submitButton = el('button', { class: 'aurea-auth-primary', type: 'submit' }, 'Entrar');
    form.append(userLabel, pinLabel, submitButton);

    messageBox = el('p', {
      id: 'aureaAuthMessage', class: 'aurea-auth-message',
      role: 'status', 'aria-live': 'polite'
    });
    const note = el('p', { class: 'aurea-auth-note' },
      'Acceso temporal de baja seguridad para pruebas. No identifica personas ni protege la API de datos.'
    );

    card.append(brand, title, intro, form, messageBox, note);
    gate.append(card);
    document.head.append(style);
    document.body.prepend(gate);
    document.body.classList.add('aurea-auth-locked');

    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      signIn();
    });
  }

  function setMessage(text, kind = '') {
    messageBox.textContent = text;
    messageBox.dataset.kind = kind;
  }

  function ready() {
    if (!emailValid || !cloud?.auth?.getLoginSalt || !cloud?.auth?.verifyLoginHash || !window.dcodeIO?.bcrypt) {
      submitButton.disabled = true;
      setMessage('Falta configurar el acceso de pruebas o cargar el motor bcrypt.', 'error');
      return false;
    }
    return true;
  }

  function unlock() {
    authenticated = true;
    pinInput.value = '';
    gate.hidden = true;
    document.body.classList.remove('aurea-auth-locked');
    document.body.classList.add('aurea-authenticated');
    if (resolveReady) {
      resolveReady();
      resolveReady = null;
    }
  }

  async function signIn() {
    if (!ready()) return;
    if (Date.now() < blockedUntil) {
      setMessage('Demasiados intentos. Espera un minuto antes de volver a probar.', 'error');
      return;
    }
    const pin = pinInput.value;
    pinInput.value = '';
    if (!PIN_RE.test(pin)) {
      setMessage('El código debe contener exactamente 6 dígitos.', 'error');
      pinInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Verificando…';
    setMessage('');
    try {
      const salt = await cloud.auth.getLoginSalt(email);
      if (!/^\$2[ab]\$[0-9]{2}\$[./A-Za-z0-9]{22}$/.test(salt || '')) {
        throw new Error('LOGIN_DISABLED');
      }
      const bcrypt = window.dcodeIO.bcrypt;
      const hashed = await new Promise((resolve, reject) => {
        bcrypt.hash(pin, salt, (error, result) => error ? reject(error) : resolve(result));
      });
      // Se envía solo el hash; el RPC consulta public.login con active=1.
      const valid = await cloud.auth.verifyLoginHash(email, hashed);
      if (!valid) throw new Error('LOGIN_DENIED');
      failures = 0;
      unlock();
    } catch (error) {
      failures++;
      if (failures >= 5) {
        blockedUntil = Date.now() + 60000;
        failures = 0;
      }
      setMessage('Código incorrecto, acceso desactivado o servicio no disponible.', 'error');
      pinInput.focus();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Entrar';
    }
  }

  function requireAccess() {
    mount();
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(resolve => {
      resolveReady = resolve;
      if (ready()) pinInput.focus();
    });
    return readyPromise;
  }

  async function signOut() {
    authenticated = false;
    window.location.reload();
  }

  mount();
  window.AureaAuth = {
    requireAccess,
    signOut,
    isAuthenticated: () => authenticated
  };
})();