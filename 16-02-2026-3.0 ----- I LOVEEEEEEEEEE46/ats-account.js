/**
 * Job Genie - ATS account creation and sign-in
 *
 * WHY THIS EXISTS
 *   Workday, Taleo, iCIMS, SuccessFactors, Oracle, BrassRing, Avature,
 *   Cornerstone, UKG and ADP all make you register before you can apply.
 *   The autofill engine skipped password fields entirely
 *   (autofill-core.js), so every one of those applications stopped dead at
 *   the account wall and had to be finished by hand.
 *
 * HOW CREDENTIALS ARE HANDLED, AND WHY
 *   A password is generated per ATS domain rather than reused. Reusing one
 *   password across dozens of job sites means a breach at the least
 *   careful of them hands over all the others; a unique one per site
 *   contains the damage to that site. This is what a password manager does
 *   and the reason is the same.
 *
 *   Three rules are enforced in code, not left to the caller:
 *
 *     1. A password is only ever filled on the registrable domain it was
 *        created for. A look-alike domain gets nothing. This is the
 *        property that stops a phishing page harvesting the vault.
 *     2. Nothing is filled over plain http. Credentials do not go over a
 *        connection that can be read in transit.
 *     3. The vault is excluded from the trace and from every log.
 *
 *   Passwords are stored in chrome.storage.local, which is isolated per
 *   extension but NOT encrypted at rest -- anyone with access to the
 *   machine's profile can read it. That is the same guarantee Chrome's own
 *   password store gives without a device passphrase, and it is worth
 *   knowing rather than assuming. Never reuse a password you care about
 *   here; let it generate one.
 *
 *   window.ATSAccount
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Account]';
  const KEY_VAULT = 'ats_accounts';        // domain -> { email, password, createdAt, platform }
  const KEY_ENABLED = 'ats_account_enabled';

  function _clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // ---- domain identity --------------------------------------------------
  // Credentials are keyed on the REGISTRABLE domain, so a credential made
  // on acme.wd1.myworkdayjobs.com is offered on acme.wd5.myworkdayjobs.com
  // (the same employer's tenant) but never on a different site.
  const MULTI_PART_TLD = /\.(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/i;
  function registrableDomain(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^www\./, '');
    const parts = h.split('.').filter(Boolean);
    if (parts.length <= 2) return h;
    return MULTI_PART_TLD.test(h) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  }

  function sameSite(a, b) {
    const x = registrableDomain(a);
    const y = registrableDomain(b);
    return !!x && x === y;
  }

  // ---- password generation ---------------------------------------------
  // ATS password rules are strict and inconsistent: most demand upper,
  // lower, digit and symbol, several cap the length, and several reject
  // symbols they did not anticipate. This uses a conservative symbol set
  // that every one of them accepts, and guarantees one of each class so a
  // generated password is never rejected for "not complex enough".
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: transcription errors
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';  // no l
  const DIGIT = '23456789';                   // no 0 or 1
  const SYMBOL = '!@#$%*?-_';                 // accepted everywhere tested

  function _randomInt(max) {
    // crypto, not Math.random: a predictable password is not a password.
    try {
      const a = new Uint32Array(1);
      (global.crypto || global.msCrypto).getRandomValues(a);
      return a[0] % max;
    } catch (e) {
      return Math.floor(Math.random() * max);
    }
  }

  function generatePassword(length) {
    const n = Math.max(12, Math.min(Number(length) || 16, 20));
    const pools = [UPPER, LOWER, DIGIT, SYMBOL];
    const chars = [];
    // One from each class first, so complexity rules always pass.
    for (const pool of pools) chars.push(pool[_randomInt(pool.length)]);
    const all = pools.join('');
    while (chars.length < n) chars.push(all[_randomInt(all.length)]);
    // Shuffle, or the first four characters would always be one per class.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = _randomInt(i + 1);
      const tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.join('');
  }

  // ---- the vault --------------------------------------------------------
  function _readVault() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get([KEY_VAULT], (r) => resolve((r && r[KEY_VAULT]) || {})); }
      catch (e) { resolve({}); }
    });
  }

  function _writeVault(v) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [KEY_VAULT]: v }, () => resolve(true)); }
      catch (e) { resolve(false); }
    });
  }

  /** The credential for a hostname, or null. Never falls back to another site. */
  async function credentialFor(hostname) {
    const key = registrableDomain(hostname);
    if (!key) return null;
    const vault = await _readVault();
    return vault[key] || null;
  }

  /**
   * The credential for this site, creating one if there is none.
   * The email is always the user's real address -- an ATS sends the
   * application confirmation there, and a made-up address loses it.
   */
  async function ensureCredential(hostname, email, platform) {
    const key = registrableDomain(hostname);
    if (!key) return null;
    const addr = _clean(email);
    if (!addr || addr.indexOf('@') === -1) return null;

    const vault = await _readVault();
    if (vault[key] && vault[key].password) {
      // Keep the existing password; the account already uses it.
      if (addr && vault[key].email !== addr) vault[key].email = addr;
      await _writeVault(vault);
      return vault[key];
    }
    vault[key] = {
      email: addr,
      password: generatePassword(16),
      createdAt: Date.now(),
      platform: platform || '',
      domain: key,
    };
    await _writeVault(vault);
    log('created a credential for', key);
    return vault[key];
  }

  async function listCredentials() {
    const vault = await _readVault();
    return Object.keys(vault).map((d) => Object.assign({ domain: d }, vault[d]))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function removeCredential(domain) {
    const vault = await _readVault();
    delete vault[registrableDomain(domain)];
    await _writeVault(vault);
    return true;
  }

  // Deliberately not logged: this file must never put a password in the
  // console, the trace, or an error message.
  function log(...a) { try { console.log(TAG, ...a); } catch (e) {} }

  // ---- form recognition -------------------------------------------------
  const SIGNUP_HINT = /(create|register|sign\s*up|new account|join|get started)/i;
  const SIGNIN_HINT = /(sign\s*in|log\s*in|login|returning|existing)/i;

  // Exact hooks where an ATS gives them, so recognition does not depend on
  // heuristics that a redesign breaks. Workday's are stable automation IDs
  // and are worth preferring over any amount of label matching.
  const PLATFORM_FIELDS = {
    workday: {
      host: /workday|myworkdayjobs/i,
      email: "input[data-automation-id='email']",
      password: "input[data-automation-id='password']",
      confirm: "input[data-automation-id='verifyPassword']",
      // Workday will NOT create the account unless this is ticked. Filling
      // the fields and pressing submit without it fails validation, which
      // looks like a broken form rather than a missed checkbox.
      agree: "input[data-automation-id='createAccountCheckbox']",
      submitSignup: "[data-automation-id='createAccountSubmitButton']",
      submitSignin: "[data-automation-id='signInSubmitButton']",
      signupForm: '.signUp-formWrap form',
      signinForm: '.emailLogin-formWrap form',
      error: "[data-automation-id='errorMessage']",
    },
    icims: {
      host: /icims/i,
      // iCIMS renders the credential form inside an iframe, which is why
      // the document-only search below is not enough on its own.
      error: '.iCIMS_ErrorMessage',
      signinPage: '.iCIMS_LoginPage',
    },
  };

  function _platformFields(hostname) {
    for (const key of Object.keys(PLATFORM_FIELDS)) {
      if (PLATFORM_FIELDS[key].host && PLATFORM_FIELDS[key].host.test(String(hostname || ''))) {
        return Object.assign({ key }, PLATFORM_FIELDS[key]);
      }
    }
    return null;
  }

  /**
   * Documents to search: this one, plus any same-origin frame. iCIMS puts
   * its login form in icims_formFrame, so a document-only search finds
   * nothing there and the account wall looks impassable.
   */
  function _documents(doc) {
    const out = [doc];
    try {
      for (const frame of doc.querySelectorAll('iframe')) {
        try {
          const inner = frame.contentDocument;
          // Cross-origin frames throw or return null; that is correct and
          // this must not attempt to work around it.
          if (inner && inner.querySelector) out.push(inner);
        } catch (e) { /* cross-origin, nothing to do */ }
      }
    } catch (e) {}
    return out;
  }

  function _visible(el) {
    try {
      if (!el || el.disabled || el.readOnly) return false;
      if (el.type === 'hidden') return false;
      const cs = (el.ownerDocument.defaultView || global).getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
      return true;
    } catch (e) { return true; }
  }

  function _describe(el) {
    // Everything a field says about itself, for matching.
    const bits = [el.name, el.id, el.getAttribute('aria-label'), el.placeholder,
      el.getAttribute('autocomplete'), el.getAttribute('data-automation-id')];
    try {
      const labels = el.labels && el.labels.length ? el.labels[0].textContent : '';
      bits.push(labels);
    } catch (e) {}
    return _clean(bits.filter(Boolean).join(' ')).toLowerCase();
  }

  /**
   * What kind of credential form is on this page, and which fields it has.
   * Returns { kind: 'signup'|'signin'|'none', email, password, confirm,
   *           confirmEmail, submit }
   */
  function detectForm(doc, hostname) {
    const d0 = doc || (typeof document !== 'undefined' ? document : null);
    const none = { kind: 'none', email: null, password: null, confirm: null, confirmEmail: null, submit: null };
    if (!d0) return none;

    // Search this document and any same-origin frame, first match wins.
    for (const d of _documents(d0)) {
      const hit = _detectIn(d, hostname);
      if (hit.kind !== 'none') return hit;
    }
    return none;
  }

  function _detectIn(d, hostname) {
    const none = { kind: 'none', email: null, password: null, confirm: null, confirmEmail: null, submit: null };
    const pf = _platformFields(hostname
      || (typeof location !== 'undefined' ? location.hostname : ''));

    // Platform hooks first: an exact automation ID beats any heuristic.
    if (pf && pf.password) {
      try {
        const pw = d.querySelector(pf.password);
        if (pw && _visible(pw)) {
          const confirm = pf.confirm ? d.querySelector(pf.confirm) : null;
          const kind = (confirm && _visible(confirm)) ? 'signup' : 'signin';
          return {
            kind,
            email: pf.email ? d.querySelector(pf.email) : null,
            password: pw,
            confirm: (confirm && _visible(confirm)) ? confirm : null,
            confirmEmail: null,
            agree: pf.agree ? d.querySelector(pf.agree) : null,
            submit: d.querySelector(kind === 'signup' ? pf.submitSignup : pf.submitSignin),
            platform: pf.key,
            doc: d,
          };
        }
      } catch (e) {}
    }

    let passwords = [];
    let emails = [];
    try {
      passwords = Array.from(d.querySelectorAll('input[type="password"]')).filter(_visible);
      emails = Array.from(d.querySelectorAll(
        'input[type="email"], input[type="text"][name*="mail" i], input[type="text"][id*="mail" i], '
        + 'input[autocomplete="username"], input[type="text"][data-automation-id*="mail" i]'
      )).filter(_visible);
    } catch (e) { return none; }

    if (!passwords.length) return none;

    // Two password fields means "new password" plus "confirm" -- the
    // clearest signal there is, and it beats any wording heuristic.
    let kind;
    if (passwords.length >= 2) kind = 'signup';
    else {
      const page = _clean((d.body && d.body.textContent) || '').slice(0, 4000);
      const near = _describe(passwords[0]) + ' ' + page.slice(0, 600);
      if (SIGNUP_HINT.test(near) && !SIGNIN_HINT.test(_describe(passwords[0]))) kind = 'signup';
      else if (/new password|create password/i.test(_describe(passwords[0]))) kind = 'signup';
      else kind = 'signin';
    }

    // A confirm-email field appears on Workday and Taleo registration.
    let confirmEmail = null;
    for (const e of emails) {
      if (/confirm|verify|re-?enter|retype/i.test(_describe(e))) { confirmEmail = e; break; }
    }
    const email = emails.find((e) => e !== confirmEmail) || emails[0] || null;

    let submit = null;
    try {
      const form = passwords[0].form;
      const scope = form || d;
      const buttons = Array.from(scope.querySelectorAll(
        'button[type="submit"], input[type="submit"], button, [role="button"]'
      )).filter(_visible);
      const wanted = kind === 'signup' ? SIGNUP_HINT : SIGNIN_HINT;
      submit = buttons.find((b) => wanted.test(_clean(b.textContent || b.value)))
        || buttons.find((b) => b.type === 'submit')
        || null;
    } catch (e) {}

    return {
      kind,
      email,
      password: passwords[0] || null,
      confirm: passwords.length >= 2 ? passwords[1] : null,
      confirmEmail,
      agree: null,
      submit,
      platform: '',
      doc: d,
    };
  }

  // ---- filling ----------------------------------------------------------
  function _setValue(el, value) {
    if (!el) return false;
    try {
      const proto = el instanceof (global.HTMLTextAreaElement || function () {})
        ? global.HTMLTextAreaElement.prototype : global.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(el, value);
      else el.value = value;
      // React and Angular listen for these; a bare .value assignment is
      // invisible to them and the field reverts on submit.
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  /**
   * Fill the credential form on this page.
   *
   * Refuses on a domain with no stored credential, and over plain http.
   * Returns { ok, kind, reason, created } and never throws.
   */
  async function fillCredentialForm(opts) {
    const o = opts || {};
    const doc = o.document || (typeof document !== 'undefined' ? document : null);
    const loc = o.location || (typeof location !== 'undefined' ? location : null);
    if (!doc || !loc) return { ok: false, reason: 'no-document' };

    // Rule 2: never over plain http, and never on a URL that carries
    // embedded credentials (https://user:pass@host). The second is worth
    // guarding even though browsers strip it: a page reached that way is
    // not the origin it appears to be, and it is the standard check the
    // Jobright extension applies before trusting any URL.
    if (String(loc.protocol) !== 'https:') return { ok: false, reason: 'insecure-page' };
    try {
      const u = new URL(String(loc.href));
      if (u.username || u.password) return { ok: false, reason: 'credentials-in-url' };
    } catch (e) { return { ok: false, reason: 'unparseable-url' }; }

    const host = loc.hostname;
    const form = detectForm(doc, host);
    if (form.kind === 'none') return { ok: false, reason: 'no-credential-form' };
    let cred = await credentialFor(host);
    let created = false;

    if (!cred) {
      // Signing IN with no stored credential means the account was made
      // elsewhere. Guessing a password would lock it, so stop.
      if (form.kind === 'signin') return { ok: false, kind: form.kind, reason: 'no-saved-credential' };
      if (!o.email) return { ok: false, kind: form.kind, reason: 'no-email' };
      cred = await ensureCredential(host, o.email, o.platform || '');
      created = true;
    }
    if (!cred) return { ok: false, kind: form.kind, reason: 'no-credential' };

    // Rule 1: the credential must belong to THIS site. Belt and braces --
    // credentialFor already keys on the registrable domain, and this
    // catches a caller that passed one in.
    if (cred.domain && !sameSite(cred.domain, host)) {
      return { ok: false, kind: form.kind, reason: 'domain-mismatch' };
    }

    const filled = [];
    if (form.email && _setValue(form.email, cred.email)) filled.push('email');
    if (form.confirmEmail && _setValue(form.confirmEmail, cred.email)) filled.push('confirm-email');
    if (form.password && _setValue(form.password, cred.password)) filled.push('password');
    if (form.confirm && _setValue(form.confirm, cred.password)) filled.push('confirm-password');

    // Workday refuses to create the account unless its own "create account"
    // box is ticked. Without this the fields are all correct, submit is
    // pressed, and validation fails -- which reads as a broken form rather
    // than a missed checkbox.
    if (form.kind === 'signup' && form.agree && !form.agree.checked) {
      try {
        form.agree.click();
        if (!form.agree.checked) {
          form.agree.checked = true;
          form.agree.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (form.agree.checked) filled.push('create-account-checkbox');
      } catch (e) {}
    }

    if (!filled.length) return { ok: false, kind: form.kind, reason: 'nothing-fillable' };

    log(form.kind, 'form filled on', registrableDomain(host), '(' + filled.join(', ') + ')');
    return {
      ok: true,
      kind: form.kind,
      created,
      filled,
      domain: registrableDomain(host),
      platform: form.platform || '',
      canSubmit: !!form.submit,
    };
  }

  /**
   * What the site said after a submit, when it says it in a place we know.
   * A failed registration that looks like success is worse than a visible
   * failure: the application continues against an account that does not
   * exist.
   */
  function formError(doc, hostname) {
    const d0 = doc || (typeof document !== 'undefined' ? document : null);
    if (!d0) return '';
    const pf = _platformFields(hostname || (typeof location !== 'undefined' ? location.hostname : ''));
    const selectors = [pf && pf.error, '[role="alert"]', '.error-message', '[class*="errorMessage" i]']
      .filter(Boolean);
    for (const d of _documents(d0)) {
      for (const sel of selectors) {
        try {
          const el = d.querySelector(sel);
          const txt = el && _clean(el.textContent);
          if (txt) return txt.slice(0, 200);
        } catch (e) {}
      }
    }
    return '';
  }

  /** Press the form's own submit control. Separate, so filling never submits by itself. */
  function submitCredentialForm(doc, hostname) {
    const form = detectForm(doc || (typeof document !== 'undefined' ? document : null), hostname);
    if (!form.submit) return false;
    try { form.submit.click(); return true; } catch (e) { return false; }
  }

  function isEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_ENABLED], (r) => {
          // Ships ON, like the other automation preferences; an explicit
          // false still turns it off.
          resolve(!(r && r[KEY_ENABLED] === false));
        });
      } catch (e) { resolve(false); }
    });
  }

  global.ATSAccount = {
    registrableDomain, sameSite, generatePassword,
    credentialFor, ensureCredential, listCredentials, removeCredential,
    detectForm, fillCredentialForm, submitCredentialForm, formError, isEnabled,
    PLATFORM_FIELDS,
    KEY_VAULT, KEY_ENABLED,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ATSAccount;
})(typeof window !== 'undefined' ? window : globalThis);
