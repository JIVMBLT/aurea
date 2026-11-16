(() => {
  'use strict';

  const cloud = window.AureaCloud;
  if (!cloud || !cloud.auth) {
    console.error('AUREA Auth no pudo iniciarse: falta el adaptador de Supabase.');
    return;
  }

  let gate;
  let emailStep;
  let codeStep;
  let emailInput;
  let codeInput;
  let messageBox;
  let sendButton;
  let verifyButton;
  let resendButton;
  let requestedEmail = '';
  let readyPromise;
  let resolveReady;
  let resendTimer;
  let authenticated = false;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function createElement(tag, attributes, text) {
    const element = document.createElement(tag);
    Object.entries(attributes || {}).forEach(([name, value]) => {
      if (name === 'class') element.className = value;
      else if (name === 'hidden') element.hidden = value;
      else element.setAttribute(name, value);
    });
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function mount() {
    if (gate) return;

    const style = createElement('style', { id: 'aurea-auth-styles' });
    style.textContent = [
      'body.aurea-auth-locked{overflow:hidden}',
      '.aurea-auth-gate{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#11100e 0%,#2b2115 55%,#11100e 100%);color:#17202b;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '.aurea-auth-gate[hidden]{display:none}',
      '.aurea-auth-card{width:min(100%,420px);background:#fff;border:1px solid rgba(198,151,67,.42);border-radius:22px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.42)}',
      '.aurea-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}',
      '.aurea-auth-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#1c1915;color:#d8ad62;font-family:Georgia,serif;font-size:24px}',
      '.aurea-auth-brand strong{display:block;font-family:Georgia,serif;font-size:24px;letter-spacing:.04em;color:#211d18}',
      '.aurea-auth-brand span{display:block;margin-top:2px;color:#7b7064;font-size:12px;letter-spacing:.08em;text-transform:uppercase}',
      '.aurea-auth-card h2{margin:0 0 8px;font-size:24px;color:#211d18}',
      '.aurea-auth-card p{margin:0 0 20px;color:#645d55;line-height:1.45}',
      '.aurea-auth-form{display:grid;gap:14px}',
      '.aurea-auth-form[hidden]{display:none}',
      '.aurea-auth-form label{display:grid;gap:7px;font-size:13px;font-weight:700;color:#403a33}',
      '.aurea-auth-form input{width:100%;box-sizing:border-box;border:1px solid #cfc8bf;border-radius:12px;padding:13px 14px;background:#fff;color:#171411;font:inherit;outline:none}',
      '.aurea-auth-form input:focus{border-color:#b9852f;box-shadow:0 0 0 3px rgba(185,133,47,.17)}',
      '.aurea-auth-code{font-size:24px!important;letter-spacing:.32em;text-align:center;font-variant-numeric:tabular-nums}',
      '.aurea-auth-primary,.aurea-auth-secondary{min-height:46px;border-radius:12px;padding:11px 16px;font:inherit;font-weight:750;cursor:pointer}',
      '.aurea-auth-primary{border:1px solid #211d18;background:#211d18;color:#fff}',
      '.aurea-auth-primary:hover{background:#3a3026}',
      '.aurea-auth-secondary{border:1px solid #d2cbc2;background:#fff;color:#403a33}',
      '.aurea-auth-primary:disabled,.aurea-auth-secondary:disabled{cursor:not-allowed;opacity:.55}',
      '.aurea-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.aurea-auth-message{min-height:22px;margin:2px 0 0!important;font-size:13px;color:#7b5a1d!important}',
      '.aurea-auth-message[data-kind="error"]{color:#a53030!important}',
      '.aurea-auth-message[data-kind="success"]{color:#236b3a!important}',
      '.aurea-auth-note{margin:22px 0 0!important;padding-top:18px;border-top:1px solid #ece8e2;font-size:12px;color:#82796f!important}',
      '@media(max-width:520px){.aurea-auth-gate{padding:0;background:#fff}.aurea-auth-card{width:100%;min-height:100%;box-sizing:border-box;border:0;border-radius:0;padding:30px 22px;display:flex;flex-direction:column;justify-content:center;box-shadow:none}}'
    ].join('');

    gate = createElement('section', {
      id: 'aureaAuthGate',
      class: 'aurea-auth-gate',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'aureaAuthTitle'
    });

    const card = createElement('div', { class: 'aurea-auth-card' });
    const brand = createElement('div', { class: 'aurea-auth-brand' });
    brand.append(
      createElement('div', { class: 'aurea-auth-mark', 'aria-hidden': 'true' }, 'A'),
      (() => {
        const box = createElement('div');
        box.append(
          createElement('strong', {}, 'Aurea'),
          createElement('span', {}, 'Control de proyectos')
        );
        return box;
      })()
    );

    const title = createElement('h2', { id: 'aureaAuthTitle' }, 'Acceso sin contraseña');
    const intro = createElement(
      'p',
      {},
      'Recibe un código de seis dígitos en el correo autorizado para entrar.'
    );

    emailStep = createElement('form', { class: 'aurea-auth-form', id: 'aureaEmailStep' });
    const emailLabel = createElement('label', {}, 'Correo electrónico');
    emailInput = createElement('input', {
      type: 'email',
      name: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      maxlength: '254',
      required: 'required',
      placeholder: 'nombre@empresa.com'
    });
    emailLabel.append(emailInput);
    sendButton = createElement('button', { class: 'aurea-auth-primary', type: 'submit' }, 'Enviar código');
    emailStep.append(emailLabel, sendButton);

    codeStep = createElement('form', {
      class: 'aurea-auth-form',
      id: 'aureaCodeStep',
      hidden: true
    });
    const codeLabel = createElement('label', {}, 'Código de acceso');
    codeInput = createElement('input', {
      class: 'aurea-auth-code',
      type: 'text',
      name: 'code',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: '6',
      pattern: '[0-9]{6}',
      required: 'required',
      placeholder: '000000',
      'aria-describedby': 'aureaAuthMessage'
    });
    codeLabel.append(codeInput);
    verifyButton = createElement('button', { class: 'aurea-auth-primary', type: 'submit' }, 'Verificar y entrar');
    const actions = createElement('div', { class: 'aurea-auth-actions' });
    resendButton = createElement('button', { class: 'aurea-auth-secondary', type: 'button' }, 'Reenviar código');
    const changeButton = createElement('button', { class: 'aurea-auth-secondary', type: 'button' }, 'Cambiar correo');
    actions.append(resendButton, changeButton);
    codeStep.append(codeLabel, verifyButton, actions);

    messageBox = createElement('p', {
      id: 'aureaAuthMessage',
      class: 'aurea-auth-message',
      role: 'status',
      'aria-live': 'polite'
    });

    const note = createElement(
      'p',
      { class: 'aurea-auth-note' },
      'El acceso es únicamente por invitación. AUREA nunca te pedirá una contraseña.'
    );

    card.append(brand, title, intro, emailStep, codeStep, messageBox, note);
    gate.append(card);
    document.head.append(style);
    document.body.prepend(gate);
    document.body.classList.add('aurea-auth-locked');

    emailStep.addEventListener('submit', event => {
      event.preventDefault();
      requestCode(false);
    });
    codeStep.addEventListener('submit', event => {
      event.preventDefault();
      verifyCode();
    });
    resendButton.addEventListener('click', () => requestCode(true));
    changeButton.addEventListener('click', showEmailStep);
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    });
  }

  function setMessage(message, kind) {
    messageBox.textContent = message || '';
    messageBox.dataset.kind = kind || '';
  }

  function setBusy(button, busy, busyLabel, idleLabel) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }

  function readableError(error, phase) {
    const code = error && error.code;
    const message = String((error && error.message) || '').toLowerCase();

    if (code === 'otp_expired' || message.includes('expired')) {
      return 'El código venció. Solicita uno nuevo.';
    }
    if (
      code === 'over_email_send_rate_limit' ||
      code === 'over_request_rate_limit' ||
      message.includes('rate limit')
    ) {
      return 'Se alcanzó el límite temporal de envíos. Espera unos minutos e inténtalo nuevamente.';
    }
    if (code === 'otp_disabled') {
      return 'El acceso por código todavía no está habilitado en Supabase.';
    }
    if (code === 'AUREA_MEMBERSHIP_REQUIRED' || code === 'AUREA_COMPANY_REQUIRED') {
      return error.message;
    }
    if (phase === 'verify') {
      return 'El código no es válido. Revísalo o solicita uno nuevo.';
    }
    return 'No fue posible enviar el código. Verifica que el correo haya sido invitado.';
  }

  function showEmailStep() {
    requestedEmail = '';
    codeInput.value = '';
    emailStep.hidden = false;
    codeStep.hidden = true;
    setMessage('');
    clearInterval(resendTimer);
    resendButton.disabled = false;
    resendButton.textContent = 'Reenviar código';
    setTimeout(() => emailInput.focus(), 0);
  }

  function showCodeStep(email) {
    requestedEmail = email;
    emailStep.hidden = true;
    codeStep.hidden = false;
    codeInput.value = '';
    setMessage('Si el correo está autorizado, recibirá un código de seis dígitos.', 'success');
    startResendCountdown();
    setTimeout(() => codeInput.focus(), 0);
  }

  function startResendCountdown() {
    clearInterval(resendTimer);
    let remaining = 60;
    resendButton.disabled = true;
    resendButton.textContent = 'Reenviar en ' + remaining + ' s';
    resendTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resendTimer);
        resendButton.disabled = false;
        resendButton.textContent = 'Reenviar código';
        return;
      }
      resendButton.textContent = 'Reenviar en ' + remaining + ' s';
    }, 1000);
  }

  async function requestCode(isResend) {
    const email = isResend ? requestedEmail : emailInput.value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setMessage('Captura un correo electrónico válido.', 'error');
      if (!isResend) emailInput.focus();
      return;
    }

    const button = isResend ? resendButton : sendButton;
    setBusy(button, true, 'Enviando…', isResend ? 'Reenviar código' : 'Enviar código');
    setMessage('');

    try {
      await cloud.auth.sendOtp(email);
      showCodeStep(email);
    } catch (error) {
      setMessage(readableError(error, 'send'), 'error');
    } finally {
      if (!isResend) setBusy(sendButton, false, 'Enviando…', 'Enviar código');
    }
  }

  async function verifyCode() {
    const token = codeInput.value.replace(/\D/g, '');
    if (token.length !== 6) {
      setMessage('Captura los seis dígitos del código.', 'error');
      codeInput.focus();
      return;
    }

    setBusy(verifyButton, true, 'Verificando…', 'Verificar y entrar');
    setMessage('');

    try {
      await cloud.auth.verifyOtp(requestedEmail, token);
      const context = await cloud.connect();
      unlock(context);
    } catch (error) {
      if (
        error &&
        (error.code === 'AUREA_MEMBERSHIP_REQUIRED' || error.code === 'AUREA_COMPANY_REQUIRED')
      ) {
        try { await cloud.auth.signOut(); } catch (_) {}
      }
      setMessage(readableError(error, 'verify'), 'error');
      codeInput.select();
    } finally {
      setBusy(verifyButton, false, 'Verificando…', 'Verificar y entrar');
    }
  }

  function unlock(context) {
    authenticated = true;
    clearInterval(resendTimer);
    gate.hidden = true;
    document.body.classList.remove('aurea-auth-locked');
    document.body.classList.add('aurea-authenticated');
    if (resolveReady) {
      resolveReady(context);
      resolveReady = null;
    }
  }

  async function restoreSession() {
    try {
      const session = await cloud.auth.getSession();
      if (!session) return false;
      const context = await cloud.connect();
      unlock(context);
      return true;
    } catch (error) {
      if (
        error &&
        (error.code === 'AUREA_MEMBERSHIP_REQUIRED' || error.code === 'AUREA_COMPANY_REQUIRED')
      ) {
        setMessage(error.message, 'error');
      }
      try { await cloud.auth.signOut(); } catch (_) {}
      return false;
    }
  }

  function requireAccess() {
    mount();
    if (readyPromise) return readyPromise;

    readyPromise = new Promise(resolve => {
      resolveReady = resolve;
      restoreSession().then(restored => {
        if (!restored) {
          gate.hidden = false;
          document.body.classList.add('aurea-auth-locked');
          setTimeout(() => emailInput.focus(), 0);
        }
      });
    });

    return readyPromise;
  }

  async function signOut() {
    await cloud.auth.signOut();
    window.location.reload();
  }

  cloud.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && authenticated) window.location.reload();
  });

  mount();

  window.AureaAuth = {
    requireAccess,
    signOut,
    isAuthenticated: () => authenticated
  };
})();
