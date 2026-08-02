/**
 * Job Genie - LinkedIn Easy Apply Autofill
 *
 * ACTIVATION CONTRACT
 *   - ONLY on linkedin.com job pages.
 *   - ONLY when the DEDICATED `linkedin_autofill_enabled` toggle is TRUE.
 *     This is separate from the master `autofill_enabled` switch so the
 *     user can run LinkedIn autofill without loading the heavy vendor
 *     engine (which is denylisted on linkedin.com for good reason -- it
 *     crashes LinkedIn's SPA).
 *   - ONLY inside the Easy Apply dialog. It never touches feed, search,
 *     messaging, or profile pages.
 *
 * SAFETY CONTRACT (deliberate, and important)
 *   Easy Apply is multi-step and the final step's primary button is
 *   "Submit application". We therefore FILL ONLY: never click Continue,
 *   Next, Review, or Submit. The user drives navigation and submits.
 *   Each new step is detected and filled as it renders, so the flow still
 *   feels automatic without ever firing an application the user hasn't
 *   seen. It also never uploads or swaps a resume file.
 *
 * All field intelligence lives in autofill-core.js -- this module only
 * supplies the LinkedIn-specific scoping and step detection.
 */
(function () {
  'use strict';

  if (window.__JG_LINKEDIN_AUTOFILL__) return;
  window.__JG_LINKEDIN_AUTOFILL__ = true;

  const TAG = '[JG-LinkedIn]';
  const TOGGLE = 'linkedin_autofill_enabled';
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

  function core() { return window.AutofillCore; }

  // ---- Easy Apply dialog detection ------------------------------------
  // LinkedIn rotates class names frequently, so we lead with stable
  // semantics (role=dialog + an Easy Apply signature) and keep the class
  // hooks only as secondary hints.
  function findEasyApplyModal() {
    const candidates = document.querySelectorAll(
      '.jobs-easy-apply-modal, [data-test-modal][role="dialog"], [role="dialog"], .artdeco-modal'
    );
    for (const el of candidates) {
      try {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        const label = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '').slice(0, 400);
        // Signature of the apply flow: the wording or the step controls.
        if (/easy apply|apply to |submit application|review your application|contact info|resume/i.test(label)) {
          return el;
        }
        if (el.querySelector('[aria-label*="next step" i], [aria-label*="Review your application" i], [aria-label*="Submit application" i]')) {
          return el;
        }
      } catch (e) {}
    }
    return null;
  }

  function isLinkedInJobsPage() {
    const h = (location.hostname || '').toLowerCase();
    if (!h.endsWith('linkedin.com')) return false;
    return /\/jobs\//.test(location.pathname) || !!findEasyApplyModal();
  }

  // A fingerprint of the current step's questions. When this changes the
  // user has advanced, so the new step gets exactly one fill pass.
  function stepSignature(modal) {
    try {
      const C = core();
      const parts = [];
      const controls = modal.querySelectorAll('input, select, textarea');
      let i = 0;
      for (const el of controls) {
        if (i++ > 12) break;
        parts.push((el.name || el.id || '') + ':' + (C ? C.labelFor(el).slice(0, 40) : ''));
      }
      return parts.join('|') || (modal.textContent || '').slice(0, 160);
    } catch (e) {
      return String(Math.random());
    }
  }

  let _lastSignature = '';
  let _busy = false;

  // Every early return carries a REASON. The popup used to receive a bare
  // 0 for "no modal", "toggle off" and "every field was already filled by
  // LinkedIn" alike, and reported all three as "No fields filled. Open an
  // Easy Apply dialog first." -- which is actively wrong on the contact
  // step, where LinkedIn prefills name, phone and email from the profile.
  async function runFill(reason) {
    const none = (why) => ({ found: false, filled: 0, alreadySet: 0, answerable: 0, why });
    const C = core();
    if (!C) return none('core-missing');
    if (_busy) return none('busy');

    if (!(await C.isToggleOn(TOGGLE))) return none('toggle-off');
    const modal = findEasyApplyModal();
    if (!modal) return none('no-modal');

    const sig = stepSignature(modal);
    if (sig === _lastSignature && reason !== 'run-now') return none('step-already-done');

    _busy = true;
    try {
      const profile = await C.loadProfile();
      if (!profile || !(profile.first_name || profile.firstName || profile.email)) {
        log('no profile data -- skipping');
        return none('no-profile');
      }
      const r = await C.fillContainer(modal, profile, {});
      _lastSignature = sig;
      if (r.filled > 0) log('filled ' + r.filled + ' field(s) on this step (' + reason + ')');
      return { found: true, filled: r.filled, alreadySet: r.alreadySet, answerable: r.answerable, why: 'ok' };
    } catch (e) {
      log('fill error:', e && e.message);
      return none('error:' + (e && e.message));
    } finally {
      _busy = false;
    }
  }

  // Direct entry point for the popup's "Fill Easy Apply now".
  // chrome.tabs.sendMessage delivers only the FIRST frame's reply, so a
  // silent frame could mask the one holding the form. executeScript
  // returns a result per frame, so the popup can see them all.
  window.__JG_LINKEDIN_FILL_NOW__ = function () {
    _lastSignature = '';
    return runFill('run-now');
  };

  // ---- lifecycle -------------------------------------------------------
  let _debounce = null;
  function schedule(reason) {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => { runFill(reason); }, 500);
  }

  // Toggle flipped ON mid-session -> fill the open step immediately.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[TOGGLE]) {
        if (changes[TOGGLE].newValue === true) { _lastSignature = ''; schedule('toggle-on'); }
        else log('toggle OFF');
      }
    });
  } catch (e) {}

  // Manual Run Now from the popup (still gated on the toggle).
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'JG_LINKEDIN_AUTOFILL_RUN') {
        // With allFrames injection every frame receives this, but only the
        // FIRST sendResponse is delivered -- so a frame without the modal
        // must stay silent or it masks the frame that has the form.
        if (!findEasyApplyModal()) return false;
        _lastSignature = '';
        runFill('run-now').then((r) => sendResponse(Object.assign({ ok: true }, r)));
        return true;
      }
    });
  } catch (e) {}

  // Easy Apply is an SPA modal: watch for it opening and for each step
  // re-render. Observing document.body is necessary because the modal is
  // mounted outside the job container.
  function watch() {
    if (!document.body) return;
    const obs = new MutationObserver(() => {
      if (findEasyApplyModal()) schedule('dom-change');
      else _lastSignature = '';        // modal closed -> reset for next time
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }

  if (isLinkedInJobsPage() || location.hostname.endsWith('linkedin.com')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { schedule('load'); watch(); });
    } else {
      schedule('load');
      watch();
    }
    log('LinkedIn Easy Apply autofill ready (fills only, never submits)');
  }
})();
