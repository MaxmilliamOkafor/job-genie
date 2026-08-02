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
 * THREE INDEPENDENT SWITCHES
 *   linkedin_autofill_enabled    fill the visible step (never navigates)
 *   linkedin_autoadvance_enabled fill, then click Next/Continue/Review and
 *                                keep going through the whole flow
 *   linkedin_autosubmit_enabled  also press "Submit application"
 *
 *   Auto-advance stops AT the Submit button unless auto-submit is on, so
 *   the irreversible, outward-facing action stays a separate decision from
 *   the tedious one. Submitting cannot be undone and reaches a real
 *   employer, so it is opt-in rather than implied by "automate this".
 *
 * THE LOOP ALWAYS STOPS ITSELF
 *   - a required field it cannot answer (never guesses at an employer)
 *   - the step not changing after a click (LinkedIn rejected the input)
 *   - the Submit button, unless auto-submit is on
 *   - MAX_STEPS, so a loop can never run away
 *   It never uploads or swaps a resume file.
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
  const AUTO_TOGGLE = 'linkedin_autoadvance_enabled';
  const SUBMIT_TOGGLE = 'linkedin_autosubmit_enabled';
  const MAX_STEPS = 15;              // Easy Apply is never this long
  const STEP_TIMEOUT_MS = 8000;
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

  function core() { return window.AutofillCore; }

  // ---- Easy Apply dialog detection ------------------------------------
  // LinkedIn rotates class names frequently, so we lead with stable
  // semantics (role=dialog + an Easy Apply signature) and keep the class
  // hooks only as secondary hints.
  function findEasyApplyModal() {
    const candidates = document.querySelectorAll(
      '.jobs-easy-apply-modal, [data-test-modal][role="dialog"], [role="dialog"], .artdeco-modal,' +
      // A native <dialog> carries an IMPLICIT dialog role, so [role="dialog"]
      // never matches one. LinkedIn has been migrating Easy Apply onto native
      // dialogs and SDUI screens, and those were invisible to detection.
      ' dialog[open], dialog[data-testid="dialog"], [data-sdui-screen*="EasyApply" i]'
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

  // ---- auto-advance ----------------------------------------------------
  // Footer control for the current step. aria-label is the stable hook;
  // visible text is the fallback for locales/markup changes. Order matters:
  // "Submit application" must be tested before the generic primary button,
  // or the final step would be classified as a harmless "next".
  function findStepButton(modal) {
    const pick = (sel, kind) => {
      for (const el of modal.querySelectorAll(sel)) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (!el.offsetParent) continue;
        return { el, kind };
      }
      return null;
    };
    return pick('[aria-label*="Submit application" i]', 'submit')
      || pick('[aria-label*="Review your application" i]', 'review')
      || pick('[aria-label*="Continue to next step" i]', 'next')
      || (function () {
        for (const b of modal.querySelectorAll('button, [role="button"]')) {
          if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
          if (!b.offsetParent) continue;
          const t = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (!t) continue;
          // Anything that sends the application.
          if (/^(submit|send)( (your|my))? application$|^submit$|^send$|^send my application$/.test(t)) {
            return { el: b, kind: 'submit' };
          }
          if (/^review( your application)?$/.test(t)) return { el: b, kind: 'review' };
          // Advance-only wording, matched exactly so a stray "Apply to
          // another job" link can never be treated as navigation.
          if (/^(next|continue|continue applying|continue to application|save and continue)( .)?$/.test(t)) {
            return { el: b, kind: 'next' };
          }
        }
        return null;
      })();
  }

  // A required control we could not answer. Advancing past one either fails
  // validation or, worse, submits a blank answer to an employer, so the run
  // stops and hands back to the user instead of guessing.
  function unansweredRequired(modal) {
    const out = [];
    const C = core();
    const seen = new Set();
    for (const el of modal.querySelectorAll('input, select, textarea')) {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
      const req = el.required || el.getAttribute('aria-required') === 'true';
      if (!req) continue;
      try { if (!C.isVisible(el)) continue; } catch (e) {}
      if (type === 'radio' || type === 'checkbox') {
        const name = el.name || '';
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const group = modal.querySelectorAll('[name="' + CSS.escape(name) + '"]');
        if (![...group].some((r) => r.checked)) {
          out.push((C && C.questionFor(el)) || name);
        }
      } else if (!String(el.value || '').trim()) {
        out.push((C && C.labelFor(el)) || el.name || el.id || 'a required field');
      }
    }
    // LinkedIn's own inline validation, if it has already rendered.
    for (const e of modal.querySelectorAll('[role="alert"], .artdeco-inline-feedback--error')) {
      const t = (e.textContent || '').trim();
      if (t && out.indexOf(t) === -1) out.push(t);
    }
    return out;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Resolves once the step actually changes, so we never click twice into
  // a step that has not re-rendered yet.
  async function waitForStepChange(modal, prevSig) {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      const live = findEasyApplyModal();
      if (!live) return { changed: true, closed: true };
      if (stepSignature(live) !== prevSig) return { changed: true, modal: live };
    }
    return { changed: false, modal: findEasyApplyModal() || modal };
  }

  let _running = false;

  async function runAutoFlow(reason) {
    const C = core();
    const done = (status, detail, steps) => ({ status, detail: detail || '', steps: steps || 0 });
    if (!C) return done('error', 'autofill core not loaded');
    if (_running) return done('busy', 'a run is already in progress');
    if (!(await C.isToggleOn(TOGGLE))) return done('off', 'LinkedIn autofill toggle is off');
    if (!(await C.isToggleOn(AUTO_TOGGLE))) return done('off', 'auto-advance toggle is off');

    let modal = findEasyApplyModal();
    if (!modal) return done('no-modal', 'no Easy Apply dialog open');

    const allowSubmit = await C.isToggleOn(SUBMIT_TOGGLE);
    _running = true;
    let steps = 0;
    try {
      for (; steps < MAX_STEPS; steps++) {
        modal = findEasyApplyModal();
        if (!modal) return done('closed', 'dialog closed', steps);

        _lastSignature = '';
        const filled = await runFill('auto-advance');
        await sleep(300);              // let LinkedIn's React settle

        modal = findEasyApplyModal();
        if (!modal) return done('closed', 'dialog closed', steps);

        const missing = unansweredRequired(modal);
        if (missing.length) {
          return done('needs-you',
            'Stopped on a required question the profile has no answer for: '
            + missing.slice(0, 3).join('; '), steps);
        }

        const btn = findStepButton(modal);
        if (!btn) return done('no-button', 'no Next/Review/Submit button on this step', steps);

        if (btn.kind === 'submit' && !allowSubmit) {
          return done('at-submit',
            'Everything is filled and it is on the final step. Press Submit yourself, '
            + 'or turn on Auto-submit to have it pressed automatically.', steps);
        }

        const sig = stepSignature(modal);
        btn.el.click();
        log('clicked ' + btn.kind + ' (step ' + (steps + 1) + ')');

        if (btn.kind === 'submit') {
          await sleep(1200);
          return done('submitted', 'Application submitted.', steps + 1);
        }

        const moved = await waitForStepChange(modal, sig);
        if (moved.closed) return done('submitted', 'Dialog closed after the last step.', steps + 1);
        if (!moved.changed) {
          // Clicked, nothing moved: LinkedIn rejected something on this step.
          const blocked = unansweredRequired(moved.modal);
          return done('stuck',
            blocked.length
              ? 'LinkedIn is blocking on: ' + blocked.slice(0, 3).join('; ')
              : 'The step did not advance. Check for an unanswered question.', steps + 1);
        }
      }
      return done('max-steps', 'stopped after ' + MAX_STEPS + ' steps as a safety limit', steps);
    } catch (e) {
      return done('error', (e && e.message) || String(e), steps);
    } finally {
      _running = false;
    }
  }

  window.__JG_LINKEDIN_AUTO_FLOW__ = function () { return runAutoFlow('run-now'); };

  // ---- lifecycle -------------------------------------------------------
  // With auto-advance on, opening Easy Apply should complete the flow with
  // no click at all. Fall back to a single fill pass when it is off.
  let _debounce = null;
  function schedule(reason) {
    clearTimeout(_debounce);
    _debounce = setTimeout(async () => {
      const C = core();
      if (C && findEasyApplyModal() && (await C.isToggleOn(AUTO_TOGGLE))) {
        if (_running) return;
        const r = await runAutoFlow(reason);
        log('auto-advance finished:', r.status, r.detail);
        try { chrome.runtime.sendMessage({ action: 'JG_LINKEDIN_FLOW_RESULT', result: r }); } catch (e) {}
        return;
      }
      runFill(reason);
    }, 500);
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
      // The auto-advance loop mutates the DOM constantly as it clicks
      // through steps; re-entering on its own churn would fight itself.
      if (_running) return;
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
