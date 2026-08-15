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
 *   - AND ONLY AFTER THE USER PRESSES "EASY APPLY" THEMSELVES.
 *
 *     Nothing here opens an application. The automatic path requires the
 *     dialog to be ALREADY OPEN, because that is the user's decision to
 *     apply to this job; without it there is nothing to continue and it
 *     returns immediately.
 *
 *     It used to find the Easy Apply button on whatever job the pane was
 *     showing and press it. Browsing a job board therefore opened an
 *     application on every role that was looked at, filled it, advanced
 *     it, and -- auto-submit ships ON -- submitted it. Applications were
 *     being sent to employers the user was merely scrolling past, and
 *     that cannot be taken back.
 *
 *     It also never clicks a job card, never navigates, and never works
 *     through a results list. The user chooses the job; this fills the
 *     form they opened.
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
 *
 *   It never uploads a resume file, and never changes a resume that is
 *   already selected. It WILL pick one when the step has none selected,
 *   because that step blocks Continue on a click rather than a value --
 *   so a run that had answered every question correctly still stalled
 *   there, reported as "stuck" with no field to point at.
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
  // ---- tracing ---------------------------------------------------------
  // This module runs in the PAGE, not the popup, so the popup's tracer
  // cannot see any of it -- and the page console is gone the moment the
  // tab navigates. Every decision is therefore recorded into a ring
  // buffer in chrome.storage.local, which the popup's trace export reads
  // back and prints alongside its own. Without it, "the autofill did
  // nothing" carries no information about WHICH of a dozen early returns
  // was taken.
  const TRACE_KEY = 'jg_linkedin_trace';
  const TRACE_MAX = 400;
  const _traceBuf = [];
  let _traceFlush = null;
  const _t0 = Date.now();

  function trace(event, data) {
    try {
      _traceBuf.push({
        ms: Date.now() - _t0,
        at: new Date().toISOString(),
        url: (location.href || '').slice(0, 140),
        frame: window.top === window ? 'top' : 'iframe',
        event,
        data: data === undefined ? undefined : _redact(data),
      });
      if (_traceBuf.length > TRACE_MAX) _traceBuf.splice(0, _traceBuf.length - TRACE_MAX);
      clearTimeout(_traceFlush);
      _traceFlush = setTimeout(_flushTrace, 400);
    } catch (e) {}
  }

  // The profile flows through here. Names and answers are the user's own,
  // but the trace is written to be pasted into a bug report, so anything
  // credential-shaped never reaches the buffer.
  const _SECRET = /(pass(word)?|token|api_?key|secret|auth|bearer|credential)/i;
  function _redact(v, depth) {
    const d = depth || 0;
    if (v === null || v === undefined) return v;
    const ty = typeof v;
    if (ty === 'string') return v.length > 160 ? v.slice(0, 160) + '…' : v;
    if (ty === 'number' || ty === 'boolean') return v;
    if (ty === 'function') return '[fn]';
    if (d > 2) return '[…]';
    if (Array.isArray(v)) return v.slice(0, 12).map((x) => _redact(x, d + 1));
    if (v && v.nodeType) return '[dom ' + (v.tagName || v.nodeName) + ']';
    if (ty === 'object') {
      const out = {};
      let n = 0;
      for (const k of Object.keys(v)) {
        if (n++ > 24) { out['…'] = 'more'; break; }
        out[k] = _SECRET.test(k) ? '[redacted]' : _redact(v[k], d + 1);
      }
      return out;
    }
    return String(v);
  }

  function _flushTrace() {
    try {
      chrome.storage.local.get([TRACE_KEY], (r) => {
        try {
          const prev = (r && r[TRACE_KEY]) || [];
          const merged = prev.concat(_traceBuf).slice(-TRACE_MAX);
          _traceBuf.length = 0;
          chrome.storage.local.set({ [TRACE_KEY]: merged }, () => {});
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Everything already logged to the console is traced too, so the two
  // never disagree about what happened.
  const log = (...a) => {
    try { console.log(TAG, ...a); } catch (e) {}
    try { trace('log', a.length === 1 ? a[0] : a); } catch (e) {}
  };

  window.__JG_LINKEDIN_TRACE__ = () => _traceBuf.slice();

  function core() { return window.AutofillCore; }

  // ---- Easy Apply dialog detection ------------------------------------
  // Matching container classes is fragile: LinkedIn rotates them, ships
  // A/B variants, and has been migrating to native <dialog> and SDUI
  // surfaces. So detection is INVERTED -- find the thing that barely ever
  // changes (the footer button that advances or submits the application),
  // then walk UP to whatever contains it. A step with no such button is
  // not a step we could drive anyway.

  // Rendered at all? Deliberately looser than a visibility check: the
  // container can legitimately be a zero-size wrapper around a visible
  // panel, and rejecting those was one way detection failed.
  function _rendered(el) {
    try {
      if (!el || !el.isConnected) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      if (el.getClientRects().length > 0) return true;
      return st.position === 'fixed' || !!el.offsetParent;
    } catch (e) {
      return false;
    }
  }

  const FOOTER_BTN_SEL = [
    '[aria-label*="Continue to next step" i]',
    '[aria-label*="Review your application" i]',
    '[aria-label*="Submit application" i]',
    '[aria-label*="next step" i]',
    '[data-easy-apply-next-button]',
    '[data-live-test-easy-apply-next-button]',
    '[data-live-test-easy-apply-submit-button]',
    '[data-control-name*="continue_unify" i]',
    '[data-control-name*="submit_unify" i]',
  ].join(',');

  const CONTAINER_SEL = [
    '.jobs-easy-apply-modal', '[data-test-modal][role="dialog"]', '[role="dialog"]',
    '.artdeco-modal', 'dialog', '[data-sdui-screen]', 'form', '.jobs-easy-apply-content',
  ].join(',');

  function _containerFor(btn) {
    // Nearest recognised shell...
    const shell = btn.closest(CONTAINER_SEL);
    if (shell && _rendered(shell)) return shell;
    // ...otherwise climb until we hold the questions as well as the button.
    let n = btn.parentElement;
    for (let i = 0; n && i < 8; i++, n = n.parentElement) {
      if (n.querySelector('input, select, textarea') && _rendered(n)) return n;
    }
    return btn.parentElement || null;
  }

  /**
   * Does this container carry the machinery of an application STEP?
   *
   * Matching the words "easy apply" alone matched the job pane itself --
   * the blue CTA on every job page says exactly that. Once the pane was
   * treated as a dialog, the first button anywhere inside it that looked
   * like a submit was clicked and the run reported
   *     "Application submitted after 1 step(s)"
   * with no dialog ever opened and nothing submitted.
   *
   * A real step always has a footer control that advances or sends it.
   * Nothing else counts.
   */
  // Unambiguous on their own -- no other control on LinkedIn says these.
  const STEP_TEXT = /^(submit application|submit your application|send application|review your application|continue to next step|continue applying)$/;
  // The real dialog's footer often just says "Next". So does a cookie
  // banner and a notifications dropdown, which is why this wording only
  // counts when the container also holds form fields to fill.
  const WEAK_STEP_TEXT = /^(next|review|continue)$/;

  // A step lives in a dialog. The job pane does not, and that is what
  // structurally separates the real thing from the page behind it --
  // far more reliable than any wording, which is shared by both.
  const DIALOG_SEL = [
    '.jobs-easy-apply-modal', '[data-test-modal]', '[role="dialog"]', 'dialog',
    '.artdeco-modal', '[data-sdui-screen]',
  ].join(',');

  function _isDialogish(el) {
    try { return !!(el && (el.matches(DIALOG_SEL) || el.closest(DIALOG_SEL))); }
    catch (e) { return false; }
  }

  function _hasStepMachinery(el) {
    try {
      if (!el) return false;
      // A labelled footer control is proof by itself.
      if (el.querySelector(FOOTER_BTN_SEL)) return true;
      const btns = el.querySelectorAll('button, [role="button"]');
      for (const b of btns) {
        const t = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (STEP_TEXT.test(t)) return true;
      }
      // Weak wording needs corroboration: something to actually fill.
      const fields = el.querySelectorAll('input:not([type=hidden]), select, textarea').length;
      if (!fields) return false;
      for (const b of btns) {
        const t = (b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (WEAK_STEP_TEXT.test(t)) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /** LinkedIn's own confirmation that the application went. */
  function _submissionConfirmed() {
    try {
      const t = (document.body.textContent || '').toLowerCase();
      return /your application was sent|application sent|application submitted|premium can help you/.test(t);
    } catch (e) {
      return false;
    }
  }

  function _describe(el) {
    if (!el) return null;
    try {
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        cls: String(el.className || '').slice(0, 90),
        role: el.getAttribute('role') || '',
        aria: (el.getAttribute('aria-label') || '').slice(0, 60),
        fields: el.querySelectorAll('input, select, textarea').length,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      };
    } catch (e) { return { err: String(e && e.message) }; }
  }

  // Why each dialog-shaped element on the page was accepted or rejected.
  // Filled on every detection run and reported by the diagnostic, because
  // "dialog: none" with the dialog plainly open in front of you is not a
  // diagnosis -- it is the absence of one.
  let _lastRejections = [];

  /**
   * What a person sees: a dialog, about an application, with something in
   * it to fill or a control to advance it.
   *
   * Tried BEFORE the button-first paths. Those work backwards from a
   * footer control and depend on its exact wording, and LinkedIn's varies
   * -- "Next" here, "Continue to next step" elsewhere, translated on a
   * non-English interface. The shape does not vary.
   */
  const APPLYISH = /apply to |easy apply|contact info|submit application|review your application|additional questions|work authoris|work authoriz|resume|your application/;

  function _directDialog() {
    _lastRejections = [];
    for (const el of document.querySelectorAll(DIALOG_SEL)) {
      let note = null;
      try {
        const rendered = _rendered(el);
        const fields = el.querySelectorAll(
          'input:not([type=hidden]):not([type=submit]), select, textarea').length;
        const machinery = _hasStepMachinery(el);
        const label = ((el.getAttribute('aria-label') || '') + ' '
          + (el.textContent || '').slice(0, 600)).toLowerCase();
        const applyish = APPLYISH.test(label);
        if (rendered && applyish && (machinery || fields)) {
          trace('modal.found', { via: 'dialog-shape', el: _describe(el) });
          return el;
        }
        note = { el: _describe(el), rendered, fields, machinery, applyish };
      } catch (e) {
        note = { err: String(e && e.message) };
      }
      _lastRejections.push(note);
    }
    return null;
  }

  function findEasyApplyModal() {
    // 0. The shape, which is what actually identifies it.
    const direct = _directDialog();
    if (direct) return direct;

    // 1. Button-first. The most reliable signal on the page.
    for (const btn of document.querySelectorAll(FOOTER_BTN_SEL)) {
      try {
        if (!_rendered(btn)) continue;
        const c = _containerFor(btn);
        if (c && _isDialogish(c)) { trace('modal.found', { via: 'footer-aria', el: _describe(c) }); return c; }
      } catch (e) {}
    }

    // 2. Text-first fallback: a button labelled by its text, not aria.
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      try {
        if (!_rendered(btn)) continue;
        const t = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        // EXACT step wording. "starts with" let anything beginning
        // "continue…" or "review…" nominate an entire page region as a
        // dialog.
        if (!STEP_TEXT.test(t) && !WEAK_STEP_TEXT.test(t)) continue;
        const c = _containerFor(btn);
        if (c && _isDialogish(c) && _hasStepMachinery(c)) {
          trace('modal.found', { via: 'step-text', btn: t, el: _describe(c) });
          return c;
        }
      } catch (e) {}
    }

    // 3. Container-first, as before, for a step with no footer button yet.
    const candidates = document.querySelectorAll(
      '.jobs-easy-apply-modal, [data-test-modal][role="dialog"], [role="dialog"], .artdeco-modal,' +
      // A native <dialog> carries an IMPLICIT dialog role, so [role="dialog"]
      // never matches one. LinkedIn has been migrating Easy Apply onto native
      // dialogs and SDUI screens, and those were invisible to detection.
      ' dialog[open], dialog[data-testid="dialog"], [data-sdui-screen*="EasyApply" i]'
    );
    for (const el of candidates) {
      try {
        if (!_rendered(el)) continue;
        // The WORDS are not enough: "Easy Apply" is the label of the CTA
        // on every job page, so any rendered dialog near it matched.
        if (!_hasStepMachinery(el)) continue;
        const label = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '').slice(0, 600);
        if (/easy apply|apply to |submit application|review your application|contact info/i.test(label)) {
          trace('modal.found', { via: 'container', el: _describe(el) });
          return el;
        }
      } catch (e) {}
    }
    return null;
  }

  // Reports what is actually on the page so a detection failure can be
  // diagnosed from a screenshot instead of guessed at. Read-only.
  window.__JG_LINKEDIN_DIAGNOSE__ = function () {
    const brief = (el) => {
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        cls: (el.className && String(el.className).slice(0, 80)) || '',
        role: el.getAttribute('role') || '',
        rendered: _rendered(el),
        rects: el.getClientRects ? el.getClientRects().length : -1,
      };
    };
    const btns = [...document.querySelectorAll('button, [role="button"]')]
      .filter((b) => _rendered(b))
      .map((b) => ({
        text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        aria: (b.getAttribute('aria-label') || '').slice(0, 50),
      }))
      .filter((b) => /next|continue|review|submit|apply/i.test(b.text + ' ' + b.aria))
      .slice(0, 10);
    const modal = findEasyApplyModal();

    // The results list. Every selector below is a guess at LinkedIn's
    // current markup, and a guess that has gone stale is invisible from
    // here -- the sweep simply finds nothing and reports "no job cards".
    // This says WHICH selector matched and which did not, so one paste
    // identifies the stale one instead of a round of guessing.
    const listProbe = {};
    for (const sel of [
      'li[data-occludable-job-id]', '[data-occludable-job-id]',
      '.jobs-search-results__list-item', '.scaffold-layout__list-item',
      '.job-card-container', 'a.job-card-container__link',
      'a[href*="/jobs/view/"]',
      '.jobs-search-results-list__list-item--active', '.job-card-container--active',
      '.jobs-search__job-details', '.jobs-details', '.job-view-layout',
      '.jobs-apply-button',
    ]) {
      try { listProbe[sel] = document.querySelectorAll(sel).length; } catch (e) { listProbe[sel] = 'err'; }
    }

    return {
      url: location.href.slice(0, 120),
      frames: window.top === window ? 'top' : 'iframe',
      // What the list driver sees. currentJobId must be a NUMBER on a
      // list page; '' means the selected card was not identified, and the
      // per-job dedupe cannot work.
      list: {
        currentJobId: (() => { try { return currentJobId(); } catch (e) { return 'err'; } })(),
        easyApplyLaunch: (() => { try { return !!findEasyApplyLaunch(); } catch (e) { return 'err'; } })(),
        selectorHits: listProbe,
      },
      dialogs: [...document.querySelectorAll('[role="dialog"], dialog, .artdeco-modal')].slice(0, 5).map(brief),
      footerButtons: btns,
      inputsOnPage: document.querySelectorAll('input, select, textarea').length,
      easyApplyCandidates: _easyApplyCandidates().slice(0, 8).map((c) => ({
        why: c.why, ok: c.ok, txt: c.txt.slice(0, 45), aria: c.aria.slice(0, 60),
        chosen: c.el === findEasyApplyLaunch(),
      })),
      launchFound: !!findEasyApplyLaunch(),
      modalFound: !!modal,
      // Every dialog-shaped element that was NOT accepted, and which
      // condition it failed. This is the line that names the bug.
      dialogsRejected: _lastRejections.slice(0, 6),
      modal: brief(modal),
      inputsInModal: modal ? modal.querySelectorAll('input, select, textarea').length : 0,
    };
  };

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
    const none = (why) => {
      trace('fill.skipped', { reason, why });
      return { found: false, filled: 0, alreadySet: 0, answerable: 0, why };
    };
    trace('fill.start', { reason });
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
      // Before the fields: the resume step blocks Continue on a click,
      // not on a value, so filling everything else still leaves it stuck.
      trace('resume.step', { outcome: selectResumeIfNone(modal) });
      const r = await C.fillContainer(modal, profile, {});
      trace('fill.done', { reason, filled: r.filled, alreadySet: r.alreadySet, answerable: r.answerable,
        step: sig.slice(0, 120) });
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
  /**
   * The resume step.
   *
   * Easy Apply nearly always has one, and it blocks Continue until a
   * document is chosen. Nothing here touched it, so a run that had filled
   * every question correctly stalled on the one step that needed a click
   * -- reported as "stuck", with no field to point at.
   *
   * The boundary stays where it was: an existing SELECTION is never
   * changed and no file is ever uploaded. This only chooses when nothing
   * is chosen, which is the difference between blocked and not.
   */
  function selectResumeIfNone(modal) {
    try {
      const cards = modal.querySelectorAll(
        '[class*="jobs-document-upload"] input[type="radio"],'
        + '[class*="document-upload"] input[type="radio"],'
        + '[class*="resume"] input[type="radio"]');
      let group = [...cards];

      // Fall back to any radio group whose surroundings talk about a
      // resume, for markup variants that do not carry those classes.
      if (!group.length) {
        for (const r of modal.querySelectorAll('input[type="radio"]')) {
          const scope = r.closest('fieldset, [role="radiogroup"], section, div');
          const txt = ((scope && scope.textContent) || '').toLowerCase();
          if (/resume|\bcv\b|curriculum/.test(txt) && !/cover/.test(txt)) group.push(r);
        }
      }
      if (!group.length) return 'no-resume-step';
      if (group.some((r) => r.checked)) return 'already-selected';

      const pick = group.find((r) => {
        try { return core() ? core().isVisible(r) : true; } catch (e) { return true; }
      }) || group[0];
      // Click the label where there is one: LinkedIn's radio is often
      // visually hidden behind a styled card, and clicking the input
      // directly does not always register with its handler.
      const label = pick.id
        ? modal.querySelector('label[for="' + CSS.escape(pick.id) + '"]')
        : pick.closest('label');
      (label || pick).click();
      if (!pick.checked) { try { pick.click(); } catch (e) {} }
      log('resume selected (none was)');
      return pick.checked ? 'selected' : 'could-not-select';
    } catch (e) {
      return 'error:' + (e && e.message);
    }
  }

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

  // ---- opening the dialog ----------------------------------------------
  // The flow used to begin only once the modal was already open, so on a
  // job listing it correctly reported "no dialog" and did nothing useful.
  // This finds the Easy Apply button on the listing and presses it.
  //
  // It requires the literal words "Easy Apply". A plain "Apply" button
  // hands off to the employer's own site in a new tab, which is a
  // different flow entirely and must never be clicked automatically.
  function _easyApplyCandidates() {
    const out = [];
    const seen = new Set();
    const add = (b, why) => {
      if (!b || seen.has(b)) return;
      seen.add(b);
      const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
      const aria = (b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      out.push({ el: b, txt, aria, why,
        ok: _rendered(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true' });
    };
    // Known CTA hooks first -- these are unambiguous.
    for (const b of document.querySelectorAll(
      '.jobs-apply-button, [data-live-test-job-apply-button], [data-control-name*="jobdetails_topcard_inapply" i]'
    )) add(b, 'cta-hook');
    // Then anything clickable that LOOKS like the CTA.
    for (const b of document.querySelectorAll('button, [role="button"], a[role="link"]')) add(b, 'scan');
    return out;
  }

  // The left-hand results list repeats "Easy Apply" as a label under every
  // card, and those cards are themselves clickable. Matching on "contains
  // Easy Apply anywhere" therefore selected a job card, whose click merely
  // switches the visible job -- no dialog, and it looked like the button
  // was broken. So the match is anchored and length-bounded: the CTA says
  // "Easy Apply" and almost nothing else.
  /**
   * Does this apply button send the user OFF LinkedIn?
   *
   * LinkedIn marks an external apply with an external-link icon inside the
   * button -- an <svg><use href="...external..."> -- and that marking is
   * structural, so it holds whatever language the interface is in. The
   * words "Easy Apply" do not: on a non-English LinkedIn the text check
   * matches nothing and the CTA is never found.
   *
   * (Taken from the Zippia extension's LinkedIn config, which uses this
   * same icon to find the external button because that is the one IT
   * wants. Here it is the exact negative signal: icon present means the
   * button is not ours.)
   */
  function _isExternalApply(el) {
    try {
      if (!el) return false;
      const holder = el.closest('.jobs-apply-button') || el;
      if (holder.querySelector('use[href*="external" i], use[*|href*="external" i]')) return true;
      // Fallbacks for the same meaning expressed differently.
      if (el.getAttribute('target') === '_blank') return true;
      const svg = holder.querySelector('svg[data-test-icon*="external" i], [data-test-icon*="external" i]');
      return !!svg;
    } catch (e) {
      return false;
    }
  }

  // THE "EASY APPLY" SEARCH FILTER IS NOT AN APPLY BUTTON.
  //
  // On the jobs search page LinkedIn shows a filter pill whose text is
  // exactly "Easy Apply". It matched the CTA test perfectly, so the flow
  // clicked it -- and clicking it re-runs the search with the filter
  // toggled. That is the "randomly searching or reloading different
  // roles" that was reported: not an application at all, just the filter
  // being switched on and off.
  const FILTER_SCOPE = [
    '[class*="search-reusables"]', '[class*="filter-pill"]', '[class*="filters-bar"]',
    '[class*="search-results-header"]', '.jobs-search-box', 'form[role="search"]',
    '[role="radiogroup"]', '[role="toolbar"]', 'header', 'nav',
  ].join(',');

  function _isSearchFilter(el) {
    try {
      if (!el) return false;
      if (el.closest(FILTER_SCOPE)) return true;
      // A filter is a TOGGLE and says so; an apply button never does.
      if (el.hasAttribute('aria-pressed')) return true;
      const r = (el.getAttribute('role') || '').toLowerCase();
      return r === 'radio' || r === 'checkbox' || r === 'switch';
    } catch (e) {
      return false;
    }
  }

  // Where a real CTA lives: on the job itself, not in the page chrome.
  const CTA_SCOPE = [
    '.jobs-apply-button', '.jobs-search__job-details', '.jobs-details',
    '.job-view-layout', '.jobs-details__main-content',
    '[class*="jobs-unified-top-card"]', '[class*="job-details-jobs-unified-top-card"]',
  ].join(',');

  function _inJobPane(el) {
    try { return !!(el && el.closest(CTA_SCOPE)); } catch (e) { return false; }
  }

  function _looksLikeEasyApplyCta(c) {
    if (!c.ok) return false;
    if (c.el.closest('[role="dialog"], dialog, .artdeco-modal')) return false;
    if (_isExternalApply(c.el)) return false;
    // Both required: never a filter, and it must belong to a job.
    if (_isSearchFilter(c.el)) return false;
    if (!_inJobPane(c.el)) return false;
    // A real CTA is a short button; a job card carries the whole listing.
    if (/^easy apply\b/i.test(c.aria)) return true;
    if (/\beasy apply\b/i.test(c.aria) && c.aria.length < 120) return true;
    if (/^easy apply$/i.test(c.txt)) return true;
    if (/^easy apply\b/i.test(c.txt) && c.txt.length <= 40) return true;
    // Non-English interface: the words never match, but a .jobs-apply-button
    // that is NOT marked external is still the in-app apply. Restricted to
    // the known CTA hook, so a stray "Apply" elsewhere can never qualify.
    if (c.why === 'cta-hook' && c.txt.length <= 40) return true;
    return false;
  }

  function findEasyApplyLaunch() {
    const cands = _easyApplyCandidates();
    // A known CTA hook is preferred, but it must STILL say "Easy Apply".
    // LinkedIn uses .jobs-apply-button for the external apply too, and that
    // one opens the employer's site in a new tab. Matching a bare "Apply"
    // here would spawn tabs while browsing. Missing a CTA is recoverable;
    // clicking the wrong one is not, so the words are required on every
    // path.
    const hook = cands.find((c) => c.why === 'cta-hook' && c.ok
      && !c.el.closest('[role="dialog"], dialog, .artdeco-modal')
      && !_isExternalApply(c.el)
      && !_isSearchFilter(c.el)
      && /\beasy apply\b/i.test(c.txt + ' ' + c.aria));
    if (hook) return hook.el;
    const match = cands.find(_looksLikeEasyApplyCta);
    return match ? match.el : null;
  }

  // LinkedIn's buttons are React components that sometimes listen on
  // pointer events rather than click, and the visible target can be a
  // <span> inside the button. Fire the full sequence on the innermost
  // element, then fall back to .click() on the button itself.
  function _robustClick(el) {
    const target = el.querySelector('span, svg') || el;
    const opts = { bubbles: true, cancelable: true, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      try {
        const Ctor = type.startsWith('pointer') && window.PointerEvent ? window.PointerEvent : window.MouseEvent;
        target.dispatchEvent(new Ctor(type, opts));
      } catch (e) {}
    }
    try { el.click(); } catch (e) {}
  }

  // Clicks Easy Apply and waits for the dialog to mount.
  async function openEasyApply() {
    if (findEasyApplyModal()) return true;
    const btn = findEasyApplyLaunch();
    if (!btn) return false;
    _robustClick(btn);
    log('clicked Easy Apply to open the dialog');
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      if (findEasyApplyModal()) return true;
      // LinkedIn sometimes puts a starter dialog in between -- a panel
      // with a single link-styled button that begins the application.
      // It has none of the footer buttons the modal detector looks for,
      // so the flow simply timed out on it. (The selector is Zippia's.)
      if (_clickApplyStarter()) log('cleared the apply-starter dialog');
    }
    return false;
  }

  function _clickApplyStarter() {
    try {
      const starter = document.querySelector(
        '[aria-labelledby*="jobs-apply-starter" i], [id*="jobs-apply-starter" i]');
      if (!starter || !_rendered(starter)) return false;
      const btn = starter.querySelector('button[role="link"], button, [role="button"]');
      if (!btn || !_rendered(btn) || btn.dataset.jgStarterClicked === '1') return false;
      btn.dataset.jgStarterClicked = '1';
      _robustClick(btn);
      return true;
    } catch (e) {
      return false;
    }
  }

  // The job this page is showing, so a run is never repeated for the same
  // posting. Without this, browsing listings with auto-advance on would
  // re-fire on every DOM change.
  /**
   * The requisition id of the job currently SHOWN.
   *
   * This used to fall back to location.pathname, which on
   * /jobs/search-results/ is the same string for every job in the list.
   * The per-job "already attempted" guard therefore marked the whole
   * page after the first attempt and refused to act on any other role --
   * the list looked alive while nothing was ever applied to.
   */
  /** The id the DOM says is on screen, ignoring the URL entirely. */
  function shownJobIdFromDom() {
    try {
      const active = document.querySelector(
        '.jobs-search-results-list__list-item--active, li.jobs-search-results__list-item--active,'
        + '.job-card-container--active, .jobs-search-results-list__list-item--highlighted,'
        + '[aria-current="page"]');
      const id = active && cardJobId(active);
      if (id) return id;
      const pane = document.querySelector(
        '.jobs-search__job-details, .jobs-details, .job-view-layout, .jobs-details__main-content');
      if (pane) {
        const d = pane.getAttribute('data-job-id') || pane.getAttribute('data-occludable-job-id');
        if (d && /^\d+$/.test(String(d))) return String(d);
        // The pane title's own link, which is where Zippia reads it from:
        // div.jobs-details h1 a. Checked before the looser sweep because
        // the title link is unambiguously THIS job, while any other
        // /jobs/view/ link in the pane may point at a related posting.
        for (const a of pane.querySelectorAll('h1 a, h1 ~ a, a[href*="/jobs/view/"], a[href*="/jobs/"]')) {
          // Looser than /jobs/view/(\d+): LinkedIn also serves /jobs/<id>.
          const pm = /\/jobs\/(?:.*\/)?(\d{6,})/.exec(a.getAttribute('href') || '');
          if (pm) return pm[1];
        }
      }
    } catch (e) {}
    return '';
  }

  function urlJobId() {
    const m = /[?&]currentJobId=(\d+)/.exec(location.href)
      || /\/jobs\/view\/(\d+)/.exec(location.pathname);
    return m ? m[1] : '';
  }

  function currentJobId() {
    // On a /jobs/view/ page the URL IS the job. On the split-pane list it
    // is not: ?currentJobId= is written by LinkedIn when a card is opened,
    // and it lags -- it still names the job the user arrived on while the
    // pane already shows another. Reading it first meant every card the
    // driver clicked looked like "not loaded yet" until the timeout, and
    // the whole list was skipped except the one job already in the URL.
    if (/\/jobs\/view\//.test(location.pathname)) return urlJobId();
    return shownJobIdFromDom() || urlJobId();
  }

  /**
   * Is the pane actually showing THIS job? Any of the DOM signals, or the
   * URL. Deliberately not just currentJobId(): a stale URL parameter must
   * never be able to veto what the DOM plainly shows.
   */
  function paneShowsJob(id) {
    if (!id) return false;
    return shownJobIdFromDom() === id || urlJobId() === id;
  }

  /** The requisition id a results-list card points at. */
  function cardJobId(card) {
    if (!card) return '';
    const direct = card.getAttribute('data-occludable-job-id')
      || card.getAttribute('data-job-id')
      || (card.querySelector('[data-occludable-job-id]') || {}).getAttribute?.call(
           card.querySelector('[data-occludable-job-id]'), 'data-occludable-job-id');
    if (direct && /^\d+$/.test(String(direct))) return String(direct);
    const a = card.matches && card.matches('a[href*="/jobs/view/"]')
      ? card : card.querySelector('a[href*="/jobs/view/"]');
    const m = a && /\/jobs\/view\/(\d+)/.exec(a.getAttribute('href') || '');
    return m ? m[1] : '';
  }
  const _attempted = new Set();

  let _running = false;

  async function runAutoFlow(reason) {
    const C = core();
    const done = (status, detail, steps) => {
      trace('flow.end', { reason, status, detail: detail || '', steps: steps || 0 });
      return { status, detail: detail || '', steps: steps || 0 };
    };
    trace('flow.start', { reason, jobId: currentJobId() });
    if (!C) return done('error', 'autofill core not loaded');
    if (_running) return done('busy', 'a run is already in progress');
    if (!(await C.isToggleOn(TOGGLE))) return done('off', 'LinkedIn autofill toggle is off');
    if (!(await C.isToggleOn(AUTO_TOGGLE))) return done('off', 'auto-advance toggle is off');

    // Open the dialog ourselves if it is not up yet. This is the step that
    // was missing: on a job listing the flow reported "no dialog" and
    // stopped, when what the user wants is for it to press Easy Apply.
    let modal = findEasyApplyModal();
    if (!modal) {
      const opened = await openEasyApply();
      if (!opened) {
        return done('no-modal', findEasyApplyLaunch()
          ? 'The Easy Apply dialog did not open.'
          : 'No Easy Apply button on this job. It may be an external "Apply" that goes to the company site.');
      }
      modal = findEasyApplyModal();
      if (!modal) return done('no-modal', 'The dialog opened but could not be read.');
    }

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
          trace('step.blocked', { step: steps + 1, missing: missing.slice(0, 6) });
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
        trace('step.click', { kind: btn.kind, step: steps + 1,
          label: (btn.el.getAttribute('aria-label') || btn.el.textContent || '').trim().slice(0, 60),
          button: _describe(btn.el), inside: _describe(modal) });
        btn.el.click();
        log('clicked ' + btn.kind + ' (step ' + (steps + 1) + ')');

        if (btn.kind === 'submit') {
          await sleep(1400);
          // Clicking a button is not evidence that an application was
          // sent. Reporting "Application submitted after 1 step(s)" when
          // nothing happened is worse than reporting a failure: it looks
          // like success and hides the bug. Require the dialog to have
          // closed, the step to have changed, or LinkedIn to say so.
          const still = findEasyApplyModal();
          const confirmed = !still || stepSignature(still) !== sig || _submissionConfirmed();
          if (!confirmed) {
            trace('submit.unconfirmed', { step: steps + 1 });
            return done('stuck',
              'Pressed Submit but nothing on the page changed. The application was NOT sent.',
              steps + 1);
          }
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

  // "Apply now" from the popup: press Easy Apply, then run the flow. Used
  // when auto-advance is on, so one click applies from a job listing.
  window.__JG_LINKEDIN_APPLY_NOW__ = function () {
    _attempted.add(currentJobId());
    return runAutoFlow('apply-now');
  };

  // ---- lifecycle -------------------------------------------------------
  // With auto-advance on, opening Easy Apply should complete the flow with
  // no click at all. Fall back to a single fill pass when it is off.
  let _debounce = null;
  let _firstRequestAt = 0;
  let _lastIdleKey = '';
  // A plain debounce never fires on a page that never stops mutating, and
  // LinkedIn never stops mutating: each burst cleared the pending timer,
  // so the fill was rescheduled forever and ran only if the page happened
  // to go quiet for a full 700ms. On a live job board it does not.
  // MAX_WAIT_MS forces a run once the first request is this old, however
  // much churn has arrived since.
  const MAX_WAIT_MS = 1500;

  function schedule(reason) {
    const now = Date.now();
    if (!_firstRequestAt) _firstRequestAt = now;
    if (now - _firstRequestAt >= MAX_WAIT_MS) {
      clearTimeout(_debounce);
      _firstRequestAt = 0;
      _run(reason);
      return;
    }
    clearTimeout(_debounce);
    _debounce = setTimeout(() => { _firstRequestAt = 0; _run(reason); }, 700);
  }

  function _run(reason) {
    return (async () => {
      const C = core();
      if (!C) return;
      if (_running) return;

      // NOTHING AUTOMATIC HAPPENS UNTIL THE USER PRESSES EASY APPLY.
      //
      // This used to look for the Easy Apply button on whatever job the
      // pane was showing and press it. Browsing a job board therefore
      // opened an application on every role that was looked at, filled
      // it, advanced it, and -- auto-submit ships ON -- SUBMITTED it. The
      // user was applying to jobs merely by scrolling past them, which is
      // both not what was asked for and irreversible.
      //
      // The dialog being ALREADY OPEN is the user's decision to apply.
      // Without it there is nothing here to continue.
      const open = findEasyApplyModal();
      if (!open) {
        // The activation rule. Seeing this in the trace is what tells the
        // difference between "the extension is broken" and "no dialog is
        // open, which is correct".
        // Idle is the NORMAL state -- it is true every time the page
        // mutates without a dialog open. Recording it each time wrote to
        // storage every few hundred milliseconds for as long as LinkedIn
        // was open, which is cost with no information: the second
        // identical line says nothing the first did not.
        const idleKey = reason + '|' + (currentJobId() || '');
        if (idleKey !== _lastIdleKey) {
          _lastIdleKey = idleKey;
          trace('idle', { reason, why: 'no Easy Apply dialog open -- waiting for the user to press it',
            easyApplyButtonOnPage: !!findEasyApplyLaunch(), jobId: currentJobId() });
        }
        return;
      }
      trace('active', { reason, jobId: currentJobId() });

      if (await C.isToggleOn(AUTO_TOGGLE)) {
        const r = await runAutoFlow(reason);
        log('auto-advance finished:', r.status, r.detail);
        try { chrome.runtime.sendMessage({ action: 'JG_LINKEDIN_FLOW_RESULT', result: r }); } catch (e) {}
        return;
      }
      runFill(reason);
    })();
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
  let _obs = null;
  function watch() {
    if (!document.body || _obs) return;
    // findEasyApplyModal() is a multi-selector querySelectorAll sweep with
    // a visibility check per hit. Running it on EVERY mutation is what
    // made the jobs list unusable: LinkedIn's search page mutates
    // continuously as cards virtualise in and out, so the sweep ran
    // hundreds of times a second on the main thread. The debounce below it
    // was never reached in time to help, because the cost was in the
    // observer callback itself, not in what it scheduled.
    let queued = false;
    const obs = new MutationObserver(() => {
      if (_running) return;
      if (queued) return;
      queued = true;
      // Coalesce a burst of mutations into one scan, off the critical path.
      setTimeout(() => {
        queued = false;
        if (_running) return;
        if (findEasyApplyModal()) schedule('dom-change');
        else _lastSignature = '';      // modal closed -> reset for next time
      }, 250);
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); _obs = obs; } catch (e) {}
  }

  /**
   * Only the jobs section.
   *
   * The script is registered for linkedin.com/*, which is the whole site
   * -- the feed, messaging, notifications, profiles. There is never an
   * Easy Apply dialog on any of those, but the observer ran on all of
   * them for the length of the session: an infinite-scroll feed mutates
   * without pause, so it swept the DOM every second or so, for hours,
   * finding nothing. That is the shape of a extension that "gradually
   * starts messing up" -- no single failure, just steady cost on every
   * page the user spends time on.
   */
  function onJobsSection() {
    return /\/jobs(\/|$)/.test(location.pathname);
  }

  function unwatch() {
    if (!_obs) return;
    try { _obs.disconnect(); } catch (e) {}
    _obs = null;
    clearTimeout(_debounce);
    _firstRequestAt = 0;
    log('left the jobs section, watcher stopped');
  }

  function syncLifecycle(reason) {
    if (onJobsSection()) {
      if (!_obs) { watch(); schedule(reason || 'enter-jobs'); }
    } else {
      unwatch();
    }
  }

  const start = () => {
    syncLifecycle('load');
    // LinkedIn is a single-page app: moving between the feed and the jobs
    // section never reloads, so the section has to be re-checked. A path
    // comparison is cheap enough to run forever; a DOM sweep is not.
    let lastPath = location.pathname;
    setInterval(() => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      _attempted.clear();
      syncLifecycle('spa-nav');
    }, 1000);
    log('LinkedIn Easy Apply autofill ready (fills only, never submits)');
  };

  if (location.hostname.endsWith('linkedin.com')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})();
