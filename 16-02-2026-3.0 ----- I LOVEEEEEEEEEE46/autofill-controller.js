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
      if (this.enabled) await this._requestInject({ reason: 'auto-on-load' });
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
        await this._requestInject({ reason: 'toggle-on' });
      }
      return this.enabled;
    },

    async runManual() {
      window.__JG_AUTOFILL_DISABLED__ = false; // one-shot override
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
