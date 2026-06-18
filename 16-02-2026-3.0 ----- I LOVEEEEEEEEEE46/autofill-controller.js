/**
 * Job Genie - AI Page Autofill Controller
 *
 * Bridges the "AI Page Autofill" toggle (popup) and the Run Now button with the
 * Jobright Autofill v1.5.4 Ultimate Edition engine bundled under /autofill-engine.
 *
 * Responsibilities:
 *  1. Mirror the `autofill_enabled` preference from chrome.storage.local onto a
 *     runtime kill-switch (window.__JG_AUTOFILL_DISABLED__) so the vendor engine
 *     can short-circuit silently when the user toggles it off.
 *  2. Ask the background service worker to inject the vendor engine only when the
 *     user opts in -- no API usage occurs while the toggle is off.
 *  3. Provide a manual "Run Now" entrypoint that injects (if needed) and triggers
 *     the vendor engine, bypassing the toggle for one-shot use.
 *  4. Expose window.AutofillController so the existing content.js handlers can
 *     delegate cleanly.
 */
(function () {
  'use strict';

  if (window.AutofillController && window.AutofillController.__jgBridge) return;

  const STORAGE_KEY = 'autofill_enabled';
  const TAG = '[JG-Autofill]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // ===================================================================
  // Host denylist -- third layer of defense (alongside background.js
  // excludeMatches + denylist in injectAutofillEngine).  On these hosts
  // the controller self-disables and never messages the background, so
  // no autofill code path can run -- even Run Now from the popup.
  // Keep in sync with AUTOFILL_DENYLIST_HOSTS in background.js.
  // ===================================================================
  const DENYLIST_HOSTS = [
    'hiring.cafe', 'linkedin.com', 'indeed.com', 'glassdoor.com',
    'levels.fyi', 'teamblind.com', 'otta.com', 'welcometothejungle.com',
    'angel.co', 'wellfound.com', 'jobright.ai',
    'chat.openai.com', 'chatgpt.com', 'claude.ai',
  ];

  function _isDeniedHost() {
    try {
      const host = window.location.hostname || '';
      return DENYLIST_HOSTS.some((h) => host === h || host.endsWith('.' + h));
    } catch (e) {
      return false;
    }
  }

  // ===================================================================
  // Eligibility gate -- the fix for "fires on websites it shouldn't".
  // The controller content script runs on <all_urls> (needed so autofill
  // can reach the long tail of 150+ ATS platforms we don't hardcode), but
  // it must NOT pull in the multi-MB vendor engine on a random news site /
  // blog / app that has no job-application form. We only auto-inject when
  // the page is either a known ATS host OR shows real application-form
  // signals. Everything else is left completely untouched (zero usage).
  // ===================================================================
  // Full ATS domains -- matched as a domain suffix (host === d or *.d).
  const ATS_DOMAINS = [
    'greenhouse.io', 'workday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
    'bullhorn.com', 'bullhornstaffing.com', 'teamtailor.com', 'workable.com',
    'icims.com', 'oraclecloud.com', 'taleo.net', 'lever.co',
    'ashbyhq.com', 'jobvite.com', 'bamboohr.com', 'recruitee.com', 'jazzhr.com',
    'applytojob.com', 'successfactors.com', 'brassring.com', 'csod.com',
    'zohorecruit.com', 'personio.com', 'breezy.hr', 'metacareers.com',
    'eightfold.ai', 'phenom.com', 'avature.net', 'gr8people.com', 'job-boards.greenhouse.io',
  ];
  // Application subdomains -- matched only as a leading label (jobs.X /
  // careers.X / apply.X), never mid-domain ("lifecareers.io" won't match).
  const ATS_SUBDOMAIN_PREFIXES = ['jobs.', 'careers.', 'apply.', 'recruiting.', 'jobboards.', 'job-boards.', 'career.', 'talent.'];

  function _isAtsHost() {
    try {
      const host = (window.location.hostname || '').toLowerCase();
      if (!host) return false;
      if (ATS_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) return true;
      if (ATS_SUBDOMAIN_PREFIXES.some((p) => host.startsWith(p))) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  // Cheap synchronous check: does this page look like a job application?
  function _hasApplicationSignals() {
    try {
      // A resume/CV file upload is the strongest single signal.
      const fileInputs = document.querySelectorAll('input[type="file"]');
      if (fileInputs.length > 0) {
        for (const fi of fileInputs) {
          const hay = ((fi.name || '') + ' ' + (fi.id || '') + ' ' + (fi.accept || '') + ' ' +
            (fi.getAttribute('aria-label') || '')).toLowerCase();
          if (/resume|cv|cover|upload|attach|\.pdf|\.docx?/.test(hay)) return true;
        }
        // Any file input on an apply-ish URL is enough.
        if (/apply|application|career|job/i.test(location.href)) return true;
      }
      // Apply-form text markers + an actual form on the page.
      const url = location.href.toLowerCase();
      const urlLooksApply = /\/(apply|application|applications|job|jobs|career|careers|candidate|submit-application)/.test(url)
        || /(^|\.)apply\./.test(location.hostname);
      if (urlLooksApply && document.querySelector('form, input, textarea, select')) {
        const bodyText = (document.body && document.body.innerText || '').slice(0, 6000).toLowerCase();
        if (/apply for|application|first name|last name|resume|cover letter|work authoriz|are you legally/.test(bodyText)) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Eligible now = known ATS host OR clear application-form signals.
  function _isEligibleNow() {
    return _isAtsHost() || _hasApplicationSignals();
  }

  if (_isDeniedHost()) {
    log('On denied host (' + window.location.hostname + ') -- autofill controller fully disabled');
    // Install a NO-OP controller so any code that references
    // window.AutofillController doesn't crash.
    window.AutofillController = {
      __jgBridge: true,
      __deniedHost: true,
      enabled: false,
      vendorInjected: false,
      setEnabled: async () => false,
      runManual: async () => ({ success: false, reason: 'denied-host' }),
      init: async () => {},
    };
    window.__JG_AUTOFILL_DISABLED__ = true;
    return;
  }

  const Controller = {
    __jgBridge: true,
    enabled: false,
    vendorInjected: false,
    vendorInjecting: false,

    async _readEnabled() {
      try {
        const r = await new Promise((resolve) =>
          chrome.storage.local.get([STORAGE_KEY], resolve)
        );
        // Default OFF: "Toggle off to save API usage" is the advertised behaviour.
        return r[STORAGE_KEY] === true;
      } catch (e) {
        return false;
      }
    },

    async init() {
      this.enabled = await this._readEnabled();
      window.__JG_AUTOFILL_DISABLED__ = !this.enabled;
      log('Init, enabled =', this.enabled);
      if (!this.enabled) return;

      // ELIGIBILITY GATE: only pull in the vendor engine on actual
      // job-application pages. On a random website (no ATS host, no
      // application form) we do nothing -- no inject, no API usage.
      if (_isEligibleNow()) {
        log('Eligible page -- injecting on load');
        await this._requestInject({ reason: 'auto-on-load' });
        return;
      }

      // Not eligible at load. Many ATS forms are SPAs whose upload field
      // appears a few seconds later, so watch briefly for an application
      // form to materialise -- but give up after a short window so we
      // never sit observing a random site indefinitely.
      this._watchForEligibility();
    },

    _watchForEligibility() {
      if (this._eligibilityWatcher || !document.body) return;
      let done = false;
      const finish = (eligible) => {
        if (done) return;
        done = true;
        try { observer.disconnect(); } catch (e) {}
        clearTimeout(timer);
        if (eligible && this.enabled) {
          log('Application form appeared -- injecting');
          this._requestInject({ reason: 'form-appeared' });
        } else if (!eligible) {
          log('No application form within window -- staying dormant (no injection)');
        }
      };
      const observer = new MutationObserver(() => {
        if (_isEligibleNow()) finish(true);
      });
      this._eligibilityWatcher = observer;
      try {
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) { return; }
      // Hard stop after 12s -- a real ATS form loads well within this;
      // a random site never will, and we stop watching either way.
      const timer = setTimeout(() => finish(false), 12000);
    },

    async setEnabled(value) {
      this.enabled = !!value;
      window.__JG_AUTOFILL_DISABLED__ = !this.enabled;
      try {
        await new Promise((resolve) =>
          chrome.storage.local.set({ [STORAGE_KEY]: this.enabled }, resolve)
        );
      } catch (e) {}
      log('Toggle ->', this.enabled);
      if (this.enabled) {
        // Respect the eligibility gate on toggle-on too: only inject if
        // this is an application page, else watch briefly. Prevents the
        // engine loading when the user enables autofill on a random tab.
        if (_isEligibleNow()) {
          await this._requestInject({ reason: 'toggle-on' });
        } else {
          this._watchForEligibility();
        }
      } else {
        // Toggling OFF: actively neutralise any vendor instance already
        // running on this tab. The kill-switch flag above makes jg-gate's
        // value/file/fetch guards block all further vendor writes, and we
        // tear down the vendor's visible UI + any pending timers it owns.
        this._teardownVendor();
      }
      return this.enabled;
    },

    _teardownVendor() {
      try {
        // Remove the vendor's injected sidebar / shadow hosts so nothing
        // stays interactive after the user turns autofill off.
        document
          .querySelectorAll('#plasmo-shadow-container, div[id^="plasmo-"], [data-jobright-helper]')
          .forEach((el) => { try { el.remove(); } catch (e) {} });
        document.documentElement.classList.add('jg-autofill-off');
        // Tell the vendor (and our own listeners) to stop, best-effort.
        window.dispatchEvent(new CustomEvent('jobright:autofill:stop'));
        window.dispatchEvent(new CustomEvent('ultimate-autofill:stop'));
        log('Vendor torn down after toggle OFF');
      } catch (e) {
        warn('teardown error', e);
      }
    },

    async runManual() {
      // Strictly gate on the toggle: when AI Page Autofill is OFF, refuse to
      // run even from the manual entrypoint. Tailoring (Extract & Apply) is a
      // separate flow and remains unaffected.
      const enabled = await this._readEnabled();
      this.enabled = enabled;
      window.__JG_AUTOFILL_DISABLED__ = !enabled;
      if (!enabled) {
        log('Manual run blocked: AI Page Autofill is OFF');
        return { success: false, blocked: true, reason: 'autofill-disabled', filledCount: 0 };
      }
      await this._requestInject({ reason: 'manual-run', force: true });

      // The vendor engine exposes several entrypoints.  We fire every reasonable
      // trigger so at least one engages regardless of which modules have loaded.
      const triggers = [
        () => window.postMessage({ type: 'JG_AUTOFILL_RUN_NOW', source: 'jobgenie' }, '*'),
        () => window.dispatchEvent(new CustomEvent('jobright:autofill:run')),
        () => window.dispatchEvent(new CustomEvent('ultimate-autofill:run')),
        () => { try { window.__uaFillUnfilled && window.__uaFillUnfilled(); } catch (e) { warn(e); } },
        () => { try { window.__uaAutoPilot && window.__uaAutoPilot(); } catch (e) { warn(e); } },
        () => { try { window.__uaAutoTailorResume && window.__uaAutoTailorResume(); } catch (e) { warn(e); } },
      ];
      for (const t of triggers) { try { t(); } catch (e) {} }

      // Give vendor engine a moment to execute, then best-effort count fields.
      await new Promise((r) => setTimeout(r, 800));
      const filledCount = this._estimateFilledCount();
      log('Manual run complete, filled ~', filledCount);
      return { success: true, filledCount };
    },

    _estimateFilledCount() {
      let n = 0;
      try {
        document.querySelectorAll('input, textarea, select').forEach((el) => {
          if (el.type === 'hidden' || el.disabled) return;
          const v = (el.value || '').trim();
          if (v && v.length > 0 && !el.dataset.jgBaseline) n += 1;
        });
      } catch (e) {}
      return n;
    },

    async _requestInject({ reason, force = false } = {}) {
      if (!force && this.vendorInjected) return { ok: true, cached: true };
      if (this.vendorInjecting) return { ok: true, pending: true };
      this.vendorInjecting = true;
      try {
        const resp = await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              { action: 'JG_AUTOFILL_INJECT', reason },
              (r) => resolve(r || { ok: false, error: 'no response' })
            );
          } catch (e) {
            resolve({ ok: false, error: String(e) });
          }
        });
        if (resp && resp.ok) {
          this.vendorInjected = true;
          log('Vendor engine injected:', reason);
        } else {
          warn('Inject failed:', resp && resp.error);
        }
        return resp;
      } finally {
        this.vendorInjecting = false;
      }
    },
  };

  window.AutofillController = Controller;

  // React to popup toggle changes live (secondary to content.js message routing).
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    if (message.action === 'TOGGLE_AUTOFILL') {
      Controller.setEnabled(!!message.enabled).then((v) =>
        sendResponse({ ok: true, enabled: v })
      );
      return true;
    }
    if (message.action === 'JG_AUTOFILL_RUN_MANUAL') {
      Controller.runManual().then((r) => sendResponse(r));
      return true;
    }
  });

  // Reflect external storage changes (e.g. when popup updates before content loads).
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const v = changes[STORAGE_KEY].newValue === true;
      Controller.enabled = v;
      window.__JG_AUTOFILL_DISABLED__ = !v;
      if (v && !Controller.vendorInjected) {
        Controller._requestInject({ reason: 'storage-change' });
      }
    });
  } catch (e) {}

  Controller.init();
})();
