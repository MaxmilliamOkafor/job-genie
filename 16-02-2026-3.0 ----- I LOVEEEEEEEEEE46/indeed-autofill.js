/**
 * Job Genie - Native Indeed Autofill (lightweight)
 *
 * WHY THIS EXISTS (not the heavy vendor engine):
 *   Indeed's apply flow (smartapply.indeed.com / the in-page "ia" apply
 *   widget) is a heavy React SPA. The 7.5 MB Jobright vendor bundle is
 *   denylisted on indeed.com precisely because it crashes that SPA under
 *   memory pressure. This module is a small, dependency-free filler that
 *   covers Indeed's own application questions without that cost.
 *
 * ACTIVATION CONTRACT (exactly what the user asked for):
 *   - ONLY on indeed.com application pages (smartapply flow / apply widget).
 *   - ONLY when the `autofill_enabled` toggle is TRUE.
 *   - Re-checks the toggle live on every run and reacts to toggle changes
 *     (a mid-session toggle-off stops it immediately; toggle-on triggers a
 *     fill if an apply form is present).
 *   - Never fills on a plain Indeed search/listing page.
 *   - Manual message JG_INDEED_AUTOFILL_RUN forces a run (Run Now), still
 *     gated on the toggle.
 *
 * It never clicks "Submit" or advances the flow -- it fills visible fields
 * and lets the user review and submit.
 */
(function () {
  'use strict';

  if (window.__JG_INDEED_AUTOFILL__) return;
  window.__JG_INDEED_AUTOFILL__ = true;

  const TAG = '[JG-Indeed]';
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

  const STORAGE_KEY = 'autofill_enabled';

  function isEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (r) => resolve(r && r[STORAGE_KEY] === true));
      } catch (e) { resolve(false); }
    });
  }

  function getProfile() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['ats_profile', 'ua_profile'], (r) => {
          const a = (r && r.ats_profile) || {};
          const b = (r && r.ua_profile) || {};
          // ats_profile is the parsed Job Genie profile; ua_profile is the
          // autofill engine's editable copy. Merge, preferring ua_profile
          // fields the user explicitly set.
          resolve(Object.assign({}, a, b));
        });
      } catch (e) { resolve({}); }
    });
  }

  // ---- Is this an Indeed APPLICATION page (not a listing/search)? -------
  function isIndeedApplyPage() {
    const host = (location.hostname || '').toLowerCase();
    const href = (location.href || '').toLowerCase();
    if (host.includes('smartapply.indeed.com')) return true;
    if (host.endsWith('indeed.com')) {
      if (/[?&#/](apply|application|smartapply)/.test(href)) return true;
      // In-page apply widget container that Indeed injects.
      if (document.querySelector('[data-testid*="apply" i], [id*="ia-container" i], .ia-Application, form[action*="apply" i]')) {
        return true;
      }
    }
    return false;
  }

  // ---- label resolution (mirrors the engine's approach, trimmed) -------
  function labelFor(el) {
    try {
      if (el.id) {
        const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]');
        if (l && l.textContent.trim()) return l.textContent.trim();
      }
      const wrap = el.closest('label');
      if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) { const ref = document.getElementById(lb); if (ref && ref.textContent.trim()) return ref.textContent.trim(); }
      // Indeed renders question text in a preceding heading/legend.
      const grp = el.closest('fieldset, [role="group"], [class*="question" i], [class*="Question" i]');
      if (grp) {
        const q = grp.querySelector('legend, h1, h2, h3, [class*="label" i], [class*="Label" i]');
        if (q && q.textContent.trim()) return q.textContent.trim().slice(0, 120);
      }
      const prev = el.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.trim()) return prev.textContent.trim().slice(0, 120);
      return (el.getAttribute('placeholder') || el.name || el.id || '').trim();
    } catch (e) { return ''; }
  }

  const DEFAULTS = {
    authorized: 'Yes', sponsorship: 'No', relocation: 'Yes', country: 'Ireland',
    phoneCode: '+353', years: '5', howHeard: 'Indeed', availability: 'Immediately',
  };

  function guessValue(label, p) {
    const l = (label || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    if (!l) return '';
    if (/first.?name|given.?name/.test(l)) return p.first_name || p.firstName || '';
    if (/last.?name|family.?name|surname/.test(l)) return p.last_name || p.lastName || '';
    if (/full.?name|your name|^name$/.test(l) && !/company|user/.test(l)) return ((p.first_name || p.firstName || '') + ' ' + (p.last_name || p.lastName || '')).trim();
    if (/\bemail\b/.test(l)) return p.email || '';
    if (/phone|mobile|cell|telephone/.test(l) && !/code|country/.test(l)) return p.phone || '';
    if (/^city$|\bcity\b|current.?city/.test(l)) return p.city || '';
    if (/\b(state|province|region)\b/.test(l) && !/please\s+state|stated\b/.test(l)) return p.state || '';
    if (/zip|postal|eircode/.test(l)) return p.postal_code || p.zip || '';
    if (/country/.test(l) && !/code|phone|dial/.test(l)) return (p.country || DEFAULTS.country);
    if (/address|street/.test(l)) return p.address || '';
    if (/linkedin/.test(l)) return p.linkedin || p.linkedin_profile_url || '';
    if (/github|portfolio|website|personal.?url/.test(l)) return p.website || p.github || p.portfolio || '';
    if (/university|school|college/.test(l)) return p.school || p.university || '';
    if (/\bdegree\b/.test(l)) return p.degree || "Bachelor's";
    if (/company|employer|current.?company/.test(l)) return p.current_company || p.company || '';
    if (/title|position|current.?title|job.?title/.test(l) && !/company|authoriz|eligib|sponsor/.test(l)) return p.current_title || p.title || '';
    if (/years.*(exp|work)|total.*experience|how.*many.*years/.test(l)) return DEFAULTS.years;
    if (/authoriz|eligible|work.*right|legal.*right/.test(l)) return DEFAULTS.authorized;
    if (/what.*sponsor|which.*sponsor|sponsor(ship)?.*(would|do).*(require|need)/.test(l)) return 'None - I do not require sponsorship.';
    if (/sponsor|visa|immigration|work.?permit/.test(l)) return DEFAULTS.sponsorship;
    if (/relocat|willing.*move/.test(l)) return DEFAULTS.relocation;
    if (/how.*hear|where.*(find|learn)|source/.test(l) && !/prefer/.test(l)) return DEFAULTS.howHeard;
    if (/availab|start.?date|when.*(start|available)|notice/.test(l)) return DEFAULTS.availability;
    if (/salary|compensation|desired.?pay|expected.?pay/.test(l)) return p.expected_salary || '';
    if (/country.?code|phone.?code|dial.?code/.test(l)) return p.phoneCountryCode || DEFAULTS.phoneCode;
    if (/\bage\b|over.*18|at.*least.*18/.test(l)) return 'Yes';
    if (/convicted|criminal|felony/.test(l)) return 'No';
    return '';
  }

  // ---- fill a single control, dispatching React-friendly events --------
  function setNativeValue(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(el, value);
      else el.value = value;
    } catch (e) { el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillSelect(el, value) {
    const want = value.toLowerCase();
    let matched = false;
    for (const opt of el.options) {
      const t = (opt.textContent || '').trim().toLowerCase();
      const v = (opt.value || '').trim().toLowerCase();
      if (t === want || v === want || (want.length > 2 && (t.includes(want) || want.includes(t)))) {
        el.value = opt.value;
        matched = true;
        break;
      }
    }
    if (matched) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return matched;
  }

  function fillRadioGroup(name, value) {
    const want = value.toLowerCase();
    const group = document.querySelectorAll('input[type="radio"][name="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]');
    for (const r of group) {
      const lbl = labelFor(r).toLowerCase();
      if (lbl === want || lbl.includes(want) || want.includes(lbl)) {
        r.click();
        return true;
      }
    }
    return false;
  }

  async function runFill(reason) {
    if (!(await isEnabled())) { log('toggle OFF -- not filling (' + reason + ')'); return 0; }
    if (!isIndeedApplyPage()) { log('not an Indeed apply page -- skipping'); return 0; }
    const p = await getProfile();
    if (!p || !(p.first_name || p.firstName || p.email)) { log('no profile data -- skipping'); return 0; }

    let filled = 0;
    const seenRadio = new Set();
    const controls = document.querySelectorAll('input, select, textarea');
    for (const el of controls) {
      try {
        if (el.disabled || el.readOnly) continue;
        const type = (el.type || '').toLowerCase();
        if (['hidden', 'file', 'submit', 'button', 'password'].includes(type)) continue;
        const label = labelFor(el);
        if (!label) continue;
        const value = guessValue(label, p);
        if (!value) continue;

        if (el.tagName === 'SELECT') {
          if (fillSelect(el, value)) filled++;
        } else if (type === 'radio') {
          if (el.name && !seenRadio.has(el.name)) {
            seenRadio.add(el.name);
            if (fillRadioGroup(el.name, value)) filled++;
          }
        } else if (type === 'checkbox') {
          // Only tick affirmative-consent style checkboxes.
          if (/agree|acknowledge|consent|confirm|certif/i.test(label) && !el.checked) { el.click(); filled++; }
        } else {
          if (String(el.value || '').trim()) continue; // never overwrite user input
          setNativeValue(el, value);
          filled++;
        }
      } catch (e) {}
    }
    if (filled > 0) log('filled ' + filled + ' field(s) (' + reason + ')');
    return filled;
  }

  // ---- lifecycle -------------------------------------------------------
  let _debounce = null;
  function scheduleFill(reason) {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => { runFill(reason); }, 600);
  }

  // React to the toggle flipping ON mid-session (fill now if applicable);
  // OFF just means the next runFill no-ops.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue === true) {
        scheduleFill('toggle-on');
      }
    });
  } catch (e) {}

  // Manual Run Now from the popup.
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'JG_INDEED_AUTOFILL_RUN') {
        runFill('run-now').then((n) => sendResponse({ ok: true, filled: n }));
        return true;
      }
    });
  } catch (e) {}

  // Indeed's apply form loads late and re-renders between steps; watch
  // briefly (only while on an apply page) and fill when fields appear.
  function watch() {
    if (!isIndeedApplyPage()) return;
    const obs = new MutationObserver(() => { if (isIndeedApplyPage()) scheduleFill('dom-change'); });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    // Stop watching after 90s -- multi-step flows re-arm on navigation.
    setTimeout(() => { try { obs.disconnect(); } catch (e) {} }, 90000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { scheduleFill('load'); watch(); });
  } else {
    scheduleFill('load');
    watch();
  }

  log('Indeed autofill ready (gated on toggle + apply page)');
})();
