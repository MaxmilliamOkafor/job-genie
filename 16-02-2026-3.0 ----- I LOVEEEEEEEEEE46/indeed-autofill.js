/**
 * Job Genie - Native Indeed Autofill (lightweight)
 *
 * WHY NOT THE VENDOR ENGINE
 *   Indeed's apply flow (smartapply.indeed.com and the in-page apply
 *   widget) is a heavy React SPA. The multi-MB Jobright vendor bundle is
 *   denylisted on indeed.com because it crashes that SPA under memory
 *   pressure. This module fills Indeed's questions without that cost.
 *
 * ACTIVATION CONTRACT
 *   - ONLY on indeed.com application pages (smartapply flow / apply
 *     widget) -- never on search or listing pages.
 *   - ONLY when the master `autofill_enabled` toggle is TRUE, re-checked
 *     live on every run so a mid-session toggle-off stops it immediately.
 *   - Fills only: never clicks Continue or Submit, never touches the
 *     resume upload.
 *
 * All field intelligence lives in autofill-core.js; this module supplies
 * only the Indeed-specific page detection.
 */
(function () {
  'use strict';

  if (window.__JG_INDEED_AUTOFILL__) return;
  window.__JG_INDEED_AUTOFILL__ = true;

  const TAG = '[JG-Indeed]';
  const TOGGLE = 'autofill_enabled';
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

  function core() { return window.AutofillCore; }

  function isIndeedApplyPage() {
    const host = (location.hostname || '').toLowerCase();
    const href = (location.href || '').toLowerCase();
    if (host.includes('smartapply.indeed.com')) return true;
    if (host.endsWith('indeed.com')) {
      if (/[?&#/](apply|application|smartapply)/.test(href)) return true;
      if (document.querySelector('[data-testid*="apply" i], [id*="ia-container" i], .ia-Application, form[action*="apply" i]')) {
        return true;
      }
    }
    return false;
  }

  // Scope to the application form when we can find it, so we never touch
  // Indeed's search widgets that share the page.
  function applyRoot() {
    return document.querySelector(
      '.ia-Application, [id*="ia-container" i], [data-testid*="apply" i], form[action*="apply" i], main, form'
    ) || document.body;
  }

  let _lastCount = -1;
  let _busy = false;

  async function runFill(reason) {
    const none = (why) => ({ found: false, filled: 0, alreadySet: 0, answerable: 0, why });
    const C = core();
    if (!C) return none('core-missing');
    if (_busy) return none('busy');
    if (!(await C.isToggleOn(TOGGLE))) return none('toggle-off');
    if (!isIndeedApplyPage()) return none('no-apply-page');

    _busy = true;
    try {
      const profile = await C.loadProfile();
      if (!profile || !(profile.first_name || profile.firstName || profile.email)) {
        log('no profile data -- skipping');
        return none('no-profile');
      }
      const r = await C.fillContainer(applyRoot(), profile, {});
      if (r.filled > 0 && r.filled !== _lastCount) {
        log('filled ' + r.filled + ' field(s) (' + reason + ')');
        _lastCount = r.filled;
      }
      return { found: true, filled: r.filled, alreadySet: r.alreadySet, answerable: r.answerable, why: 'ok' };
    } catch (e) {
      log('fill error:', e && e.message);
      return none('error:' + (e && e.message));
    } finally {
      _busy = false;
    }
  }

  let _debounce = null;
  function schedule(reason) {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => { runFill(reason); }, 600);
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[TOGGLE] && changes[TOGGLE].newValue === true) {
        schedule('toggle-on');
      }
    });
  } catch (e) {}

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'JG_INDEED_AUTOFILL_RUN') {
        // Only the frame holding the application form should answer -- the
        // first sendResponse wins, so silent frames avoid masking it.
        if (!isIndeedApplyPage()) return false;
        runFill('run-now').then((r) => sendResponse(Object.assign({ ok: true }, r)));
        return true;
      }
    });
  } catch (e) {}

  // Direct entry point for the popup's "Fill Indeed now" (see the
  // LinkedIn module for why executeScript beats sendMessage here).
  window.__JG_INDEED_FILL_NOW__ = function () { return runFill('run-now'); };

  function watch() {
    if (!document.body) return;
    const obs = new MutationObserver(() => { if (isIndeedApplyPage()) schedule('dom-change'); });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    setTimeout(() => { try { obs.disconnect(); } catch (e) {} }, 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { schedule('load'); watch(); });
  } else {
    schedule('load');
    watch();
  }

  log('Indeed autofill ready (gated on toggle + apply page)');
})();
