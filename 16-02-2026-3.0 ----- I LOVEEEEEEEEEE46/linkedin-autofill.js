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
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

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

  function findEasyApplyModal() {
    // 1. Button-first. The most reliable signal on the page.
    for (const btn of document.querySelectorAll(FOOTER_BTN_SEL)) {
      try {
        if (!_rendered(btn)) continue;
        const c = _containerFor(btn);
        if (c) return c;
      } catch (e) {}
    }

    // 2. Text-first fallback: a button labelled by its text, not aria.
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      try {
        if (!_rendered(btn)) continue;
        const t = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!/^(next|continue|review|submit application|submit your application|send application)/.test(t)) continue;
        const c = _containerFor(btn);
        // Guard against unrelated "Next" buttons elsewhere on the page.
        if (c && /apply|contact info|resume|work authoris|work authoriz/i.test((c.textContent || '').slice(0, 800))) {
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
        const label = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '').slice(0, 600);
        if (/easy apply|apply to |submit application|review your application|contact info/i.test(label)) return el;
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
    let cards = [];
    try {
      cards = resultCards().slice(0, 8).map((c) => ({
        id: c.id,
        text: (c.el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      }));
    } catch (e) { cards = [{ error: String(e && e.message) }]; }

    return {
      url: location.href.slice(0, 120),
      frames: window.top === window ? 'top' : 'iframe',
      // What the list driver sees. currentJobId must be a NUMBER on a
      // list page; '' means the selected card was not identified, and the
      // per-job dedupe cannot work.
      list: {
        looksLikeListPage: (() => { try { return isResultsListPage(); } catch (e) { return 'err'; } })(),
        cardsFound: cards.length,
        cards,
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
      // Before the fields: the resume step blocks Continue on a click,
      // not on a value, so filling everything else still leaves it stuck.
      selectResumeIfNone(modal);
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
  function _looksLikeEasyApplyCta(c) {
    if (!c.ok) return false;
    if (c.el.closest('[role="dialog"], dialog, .artdeco-modal')) return false;
    // A real CTA is a short button; a job card carries the whole listing.
    if (/^easy apply\b/i.test(c.aria)) return true;
    if (/\beasy apply\b/i.test(c.aria) && c.aria.length < 120) return true;
    if (/^easy apply$/i.test(c.txt)) return true;
    if (/^easy apply\b/i.test(c.txt) && c.txt.length <= 40) return true;
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
    }
    return false;
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
        const a = pane.querySelector('a[href*="/jobs/view/"]');
        const pm = a && /\/jobs\/view\/(\d+)/.exec(a.getAttribute('href') || '');
        if (pm) return pm[1];
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
    const done = (status, detail, steps) => ({ status, detail: detail || '', steps: steps || 0 });
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

  // "Apply now" from the popup: press Easy Apply, then run the flow. Used
  // when auto-advance is on, so one click applies from a job listing.
  window.__JG_LINKEDIN_APPLY_NOW__ = function () {
    _attempted.add(currentJobId());
    return runAutoFlow('apply-now');
  };

  // ---- the results list ------------------------------------------------
  //
  // Everything above applies to the job that is OPEN. On
  // /jobs/search-results/ no job is open -- the right pane is a skeleton
  // until a card is clicked -- so the flow found no Easy Apply button,
  // returned "no-modal", and nothing ever happened however many roles
  // were listed. This walks the list: click a card, wait for its pane,
  // run the flow, move on.
  //
  // BOUNDS, because this submits real applications to real employers and
  // cannot be undone:
  //   - a job already applied to is never applied to again, remembered
  //     across sessions by requisition id. Recruiters see every past
  //     application from the same candidate, so a duplicate is worse than
  //     a miss.
  //   - MAX_JOBS_PER_RUN caps a single sweep.
  //   - with auto-submit OFF nothing is ever submitted: it fills one job,
  //     stops, and says so, rather than leaving a trail of half-completed
  //     dialogs across the whole list.
  const APPLIED_KEY = 'linkedin_applied_jobs';
  const APPLIED_TTL_MS = 180 * 24 * 60 * 60 * 1000;   // six months
  const MAX_JOBS_PER_RUN = 25;
  const BETWEEN_JOBS_MS = 1500;

  const CARD_SEL = [
    'li[data-occludable-job-id]', '[data-occludable-job-id]',
    '.jobs-search-results__list-item', '.scaffold-layout__list-item',
    '.job-card-container',
  ].join(',');

  function resultCards() {
    const seen = new Set();
    const out = [];
    for (const el of document.querySelectorAll(CARD_SEL)) {
      const id = cardJobId(el);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, el });
    }
    return out;
  }

  function loadApplied() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([APPLIED_KEY], (r) => {
          const m = (r && r[APPLIED_KEY]) || {};
          const now = Date.now();
          const fresh = {};
          for (const k of Object.keys(m)) if (now - m[k] < APPLIED_TTL_MS) fresh[k] = m[k];
          resolve(fresh);
        });
      } catch (e) { resolve({}); }
    });
  }

  function markApplied(id) {
    return new Promise((resolve) => {
      loadApplied().then((m) => {
        m[id] = Date.now();
        try { chrome.storage.local.set({ [APPLIED_KEY]: m }, () => resolve(true)); }
        catch (e) { resolve(false); }
      });
    });
  }

  /**
   * Has the right-hand pane finished rendering this job?
   *
   * Deliberately NOT "is there an Easy Apply button": a role with an
   * external apply never grows one, so waiting for it burned the full
   * timeout on every such job. Over a list where a third of the roles
   * apply off-site that is most of the run spent waiting for something
   * that was never coming.
   */
  function paneRendered(id) {
    if (!paneShowsJob(id)) return false;
    if (findEasyApplyLaunch() || findEasyApplyModal()) return true;
    const pane = document.querySelector(
      '.jobs-search__job-details, .jobs-details, .job-view-layout, .jobs-details__main-content');
    if (!pane) return false;
    // Any apply CTA at all, or the title: either means the pane is loaded
    // and we can decide whether this job is ours.
    if (pane.querySelector('.jobs-apply-button, [class*="apply-button" i], [class*="applyButton" i]')) return true;
    return !!pane.querySelector('h1, .job-details-jobs-unified-top-card__job-title');
  }

  async function waitForPane(id, ms) {
    const until = Date.now() + (ms || 8000);
    while (Date.now() < until) {
      if (paneRendered(id)) return true;
      await sleep(150);
    }
    return paneShowsJob(id);
  }

  function cardLink(card) {
    return card.querySelector('a.job-card-container__link, a.job-card-list__title, a[href*="/jobs/view/"]')
      || card.querySelector('a') || card;
  }

  async function runListFlow(reason) {
    const C = core();
    const summary = { status: 'ok', applied: 0, skipped: 0, seen: 0, detail: '', stoppedBy: '' };
    if (!C) { summary.status = 'error'; summary.detail = 'autofill core not loaded'; return summary; }
    if (_running) { summary.status = 'busy'; return summary; }
    if (!(await C.isToggleOn(TOGGLE))) { summary.status = 'off'; summary.detail = 'LinkedIn autofill toggle is off'; return summary; }
    if (!(await C.isToggleOn(AUTO_TOGGLE))) { summary.status = 'off'; summary.detail = 'auto-advance toggle is off'; return summary; }

    const allowSubmit = await C.isToggleOn(SUBMIT_TOGGLE);
    const applied = await loadApplied();
    const cards = resultCards();
    summary.seen = cards.length;
    if (!cards.length) { summary.status = 'no-jobs'; summary.detail = 'no job cards on this page'; return summary; }

    log('list flow starting over ' + cards.length + ' card(s) (' + reason + ')');
    for (const card of cards) {
      if (summary.applied >= MAX_JOBS_PER_RUN) {
        summary.stoppedBy = 'cap';
        summary.detail = 'stopped at the ' + MAX_JOBS_PER_RUN + '-application limit for one run';
        break;
      }
      if (applied[card.id]) { summary.skipped++; continue; }
      if (_attempted.has(card.id)) { summary.skipped++; continue; }

      try { card.el.scrollIntoView({ block: 'center' }); } catch (e) {}
      await sleep(250);
      try { cardLink(card.el).click(); } catch (e) { summary.skipped++; continue; }

      const ready = await waitForPane(card.id, 9000);
      if (!ready) { summary.skipped++; continue; }

      _attempted.add(card.id);
      if (!findEasyApplyLaunch() && !findEasyApplyModal()) {
        // An external "Apply" that opens the employer's own site. Not ours.
        summary.skipped++;
        continue;
      }

      _lastSignature = '';
      const r = await runAutoFlow('list:' + card.id);
      log('job ' + card.id + ' -> ' + r.status + ' ' + r.detail);

      if (r.status === 'submitted') {
        summary.applied++;
        await markApplied(card.id);
      } else if (r.status === 'at-submit') {
        // auto-submit is off. Filling the rest of the list would leave a
        // trail of half-finished dialogs the user has to clean up.
        summary.status = 'at-submit';
        summary.stoppedBy = 'auto-submit-off';
        summary.detail = 'Filled and stopped at the final step. Turn on Auto-submit to have the '
          + 'rest of the list applied to automatically.';
        break;
      } else if (r.status === 'needs-you') {
        summary.skipped++;
        summary.detail = r.detail;
      } else {
        summary.skipped++;
      }

      if (!allowSubmit) break;
      await sleep(BETWEEN_JOBS_MS);
    }

    if (!summary.detail) {
      summary.detail = summary.applied + ' applied, ' + summary.skipped + ' skipped, of '
        + summary.seen + ' listed';
    }
    log('list flow finished: ' + JSON.stringify(summary));
    return summary;
  }

  function isResultsListPage() {
    return /\/jobs\/(search|search-results|collections)/.test(location.pathname)
      && resultCards().length > 0;
  }

  window.__JG_LINKEDIN_LIST_FLOW__ = function () { return runListFlow('run-now'); };

  // ---- lifecycle -------------------------------------------------------
  // With auto-advance on, opening Easy Apply should complete the flow with
  // no click at all. Fall back to a single fill pass when it is off.
  let _debounce = null;
  let _listRunning = false;
  function schedule(reason) {
    clearTimeout(_debounce);
    _debounce = setTimeout(async () => {
      const C = core();
      if (!C) return;
      if (_running) return;

      if (await C.isToggleOn(AUTO_TOGGLE)) {
        const open = findEasyApplyModal();

        // A results list with nothing open: work through it. Without this
        // the code below looked for an Easy Apply button on a page that
        // has none until a card is clicked, gave up, and the whole list
        // sat there untouched.
        if (!open && isResultsListPage()) {
          if (_listRunning) return;
          _listRunning = true;
          try {
            const s = await runListFlow(reason);
            try { chrome.runtime.sendMessage({ action: 'JG_LINKEDIN_LIST_RESULT', result: s }); } catch (e) {}
          } finally {
            _listRunning = false;
          }
          return;
        }

        // Not open yet: only start if this job has an Easy Apply button we
        // have not already tried. The per-job guard is what stops browsing
        // a results list from re-firing on every DOM change, and stops a
        // dismissed dialog from being reopened underneath the user.
        if (!open) {
          const jobId = currentJobId();
          if (jobId && _attempted.has(jobId)) return;
          if (!findEasyApplyLaunch()) return;
          if (jobId) _attempted.add(jobId);
        }
        const r = await runAutoFlow(reason);
        log('auto-advance finished:', r.status, r.detail);
        try { chrome.runtime.sendMessage({ action: 'JG_LINKEDIN_FLOW_RESULT', result: r }); } catch (e) {}
        return;
      }
      runFill(reason);
    }, 700);
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
