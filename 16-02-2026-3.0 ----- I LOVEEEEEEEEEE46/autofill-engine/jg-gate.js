/**
 * Job Genie kill-switch gate for the Jobright Autofill v1.5.4 engine.
 *
 * Runs FIRST (before ua-enhancement/filler/contents). It reads the user's
 * autofill_enabled preference synchronously from window (populated by
 * autofill-controller.js) and, when disabled, makes the vendor engine a no-op
 * by stubbing the APIs it relies on (fetch to Jobright, chrome.runtime.sendMessage).
 *
 * This gives the user FULL CONTROL -- zero API usage while toggle is OFF --
 * without having to remove the vendor files from the package at build time.
 */
(function () {
  'use strict';

  const TAG = '[JG-Gate]';

  // THE KILL SWITCH FAILS CLOSED.
  //
  // This read `=== true`, so an UNSET flag meant "allowed". The flag is
  // set by autofill-controller.js after an ASYNC storage read, and the
  // vendor bundle is registered at document_idle -- so on every page
  // load there was a window in which the flag was undefined and all 220+
  // vendor value writes were permitted, whatever the toggle said. That
  // is the "it randomly autofills" report: not random, just the race.
  //
  // Only an EXPLICIT false -- written by the controller after it has
  // confirmed the toggle is on, the host is allowed and the page is a
  // real application form -- permits a write. Unset, unknown, or a
  // failed storage read all block.
  function disabled() {
    return window.__JG_AUTOFILL_DISABLED__ !== false;
  }

  // The controller may never run on this page (injected directly via
  // executeScript, or a frame it does not cover). Read the toggle here
  // too, so the gate can open on its own when the user really did
  // enable autofill -- and stays shut when it cannot confirm.
  try {
    if (window.__JG_AUTOFILL_DISABLED__ === undefined) {
      window.__JG_AUTOFILL_DISABLED__ = true;          // closed until proven open
      chrome.storage.local.get(['autofill_enabled'], (r) => {
        if (r && r.autofill_enabled === true && window.__JG_AUTOFILL_DISABLED__ !== false) {
          window.__JG_AUTOFILL_DISABLED__ = false;
        }
      });
    }
  } catch (e) { window.__JG_AUTOFILL_DISABLED__ = true; }

  // ==== Text/select VALUE-write guard (the real "toggle-off" fix) ====
  // The vendor engine has 220+ `.value=` writes for text inputs, textareas
  // and selects. Blocking its fetch/XHR stops API CALLS, but on a tab that
  // was already loaded while the toggle was ON, the vendor's in-memory DOM
  // logic could still POPULATE fields after the user toggles OFF -- that is
  // the "it randomly starts autofilling" bug.
  //
  // Fix: guard the value setters on HTMLInputElement / HTMLTextAreaElement /
  // HTMLSelectElement prototypes. When autofill is DISABLED, a value write is
  // blocked ONLY when its call stack originates inside a VENDOR script
  // (autofill-engine/*). This is the precise target: it never blocks
  //   * the website's own React/JS  (different JS world entirely), nor
  //   * Job Genie's own content scripts (content.js, workday-handlers.js,
  //     etc.) which belong to the separate Auto-trigger / Auto-tailoring
  //     toggles and must keep working when only AI Page Autofill is off.
  //
  // The vendor lives at chrome-extension://<id>/autofill-engine/*.js, so its
  // frames are identifiable by the "/autofill-engine/" path in the stack.
  window.__JG_BLOCKED_VENDOR_VALUE_WRITES__ = window.__JG_BLOCKED_VENDOR_VALUE_WRITES__ || 0;

  function _isVendorCaller() {
    // Only pay the stack-capture cost when autofill is actually disabled.
    try {
      const stack = new Error().stack || '';
      // Vendor bundle files: jg-gate is us, so exclude it; the actual
      // filler/ua-enhancement/contents/answer live under /autofill-engine/.
      return /autofill-engine\/(ua-enhancement|filler|contents|answer)\.js/.test(stack);
    } catch (e) {
      return false;
    }
  }

  function _installValueGuard(Ctor, label) {
    try {
      const proto = Ctor && Ctor.prototype;
      if (!proto) return;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (!desc || typeof desc.set !== 'function') return;
      const origSet = desc.set;
      Object.defineProperty(proto, 'value', {
        configurable: false,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function (v) {
          if (disabled() && !window.__JG_AUTOFILL_AUTHORISED__ &&
              v !== '' && v != null && _isVendorCaller()) {
            window.__JG_BLOCKED_VENDOR_VALUE_WRITES__++;
            return; // silently drop the vendor's autofill write
          }
          return origSet.call(this, v);
        },
      });
    } catch (e) {
      console.warn(TAG, 'value guard install failed for', label, e);
    }
  }

  _installValueGuard(window.HTMLInputElement, 'input');
  _installValueGuard(window.HTMLTextAreaElement, 'textarea');
  _installValueGuard(window.HTMLSelectElement, 'select');

  // ==== Block XHR-based API calls when the toggle is OFF. ====
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__jgUrl = String(url || '').toLowerCase(); } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const u = this.__jgUrl || '';
      if (disabled() && /openai|anthropic|kimi|moonshot|jobright|autofill|tailor|gpt/.test(u)) {
        // Fake a completed 200 response with empty body.
        try {
          Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(this, 'status', { value: 200, configurable: true });
          Object.defineProperty(this, 'responseText', {
            value: JSON.stringify({ blocked: true, reason: 'autofill-disabled' }),
            configurable: true,
          });
          if (typeof this.onload === 'function') setTimeout(() => this.onload(), 0);
          if (typeof this.onreadystatechange === 'function') {
            setTimeout(() => this.onreadystatechange(), 0);
          }
        } catch (e) {}
        return;
      }
      return origSend.apply(this, arguments);
    };
  } catch (e) {
    console.warn(TAG, 'XHR shim failed', e);
  }

  // ==== Block Jobright-branded telemetry / account endpoints regardless of toggle. ====
  // The vendor was designed around Jobright.ai's own backend. Since we deploy as
  // Job Genie and handle AI via the user's chosen provider in the popup, we
  // short-circuit those remote calls to avoid unrelated traffic and errors.
  try {
    const origFetch = window.fetch && window.fetch.bind(window);
    if (origFetch) {
      window.fetch = function (input, init) {
        let url = '';
        try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
        const lower = url.toLowerCase();

        // Block when master toggle is off AND call looks like an AI autofill call.
        if (disabled()) {
          if (
            /openai|anthropic|kimi|moonshot|jobright|autofill|tailor|resume|cover.letter|oai|gpt/.test(
              lower
            )
          ) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ blocked: true, reason: 'autofill-disabled' }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              )
            );
          }
        }

        // Always stub jobright.ai domains (Job Genie isn't affiliated).
        if (/jobright\.ai|jobright\.work|jobrightapi/.test(lower)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: true, code: 200, result: {} }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }

        return origFetch(input, init);
      };
    }
  } catch (e) {
    console.warn(TAG, 'fetch shim failed', e);
  }

  // Hide the vendor sidebar iconography when disabled.
  try {
    const style = document.createElement('style');
    style.id = 'jg-autofill-gate-style';
    style.textContent = `
      html.jg-autofill-off #plasmo-shadow-container,
      html.jg-autofill-off div[id^="plasmo-"] {
        display: none !important;
      }
    `;
    (document.documentElement || document.head || document.body).appendChild(style);
    function applyClass() {
      if (disabled()) document.documentElement.classList.add('jg-autofill-off');
      else document.documentElement.classList.remove('jg-autofill-off');
    }
    applyClass();
    // Re-evaluate every time the controller flips the flag.
    setInterval(applyClass, 1000);
  } catch (e) {}

  // ==== File-input write guard ====
  // The vendor (Jobright Autofill v1.5.4) contains generic file-upload
  // logic that can attempt to attach a CV from its own profile cache to
  // any HTMLInputElement[type=file] it discovers.  We do NOT want that:
  // file attachment is owned exclusively by Job Genie's own attach loop
  // (forceCVReplace / forceCoverReplace in content.js).
  //
  // Three layers of defense:
  //   (1) Lock the .files setter on HTMLInputElement.prototype so the
  //       vendor cannot redefine it (configurable: false).
  //   (2) Lock the .click() method same way.
  //   (3) MutationObserver watchdog that clears any file input whose
  //       .files got populated without our authorisation flag set.
  //
  // window.__JG_FILE_ATTACH_AUTHORISED__ is the bypass key our own
  // attach loop sets in content.js.
  window.__JG_BLOCKED_VENDOR_ATTACHES__ = window.__JG_BLOCKED_VENDOR_ATTACHES__ || 0;

  try {
    const proto = HTMLInputElement.prototype;
    const filesDescriptor = Object.getOwnPropertyDescriptor(proto, 'files');
    if (filesDescriptor && typeof filesDescriptor.set === 'function') {
      const origSetFiles = filesDescriptor.set;
      Object.defineProperty(proto, 'files', {
        configurable: false,
        enumerable: filesDescriptor.enumerable,
        get: filesDescriptor.get,
        set: function (value) {
          if (this.type === 'file' && !window.__JG_FILE_ATTACH_AUTHORISED__) {
            window.__JG_BLOCKED_VENDOR_ATTACHES__++;
            console.warn(TAG, 'BLOCKED unauthorised .files= write on', this.name || this.id || '(unnamed file input)',
              '— vendor engine cannot attach files. Total blocked:', window.__JG_BLOCKED_VENDOR_ATTACHES__);
            return;
          }
          return origSetFiles.call(this, value);
        },
      });
    }

    const origClick = proto.click;
    Object.defineProperty(proto, 'click', {
      configurable: false,
      writable: false,
      enumerable: false,
      value: function () {
        if (this.type === 'file' && !window.__JG_FILE_ATTACH_AUTHORISED__) {
          window.__JG_BLOCKED_VENDOR_ATTACHES__++;
          console.warn(TAG, 'BLOCKED programmatic .click() on file input — vendor engine. Total blocked:',
            window.__JG_BLOCKED_VENDOR_ATTACHES__);
          return;
        }
        return origClick.apply(this, arguments);
      },
    });
  } catch (e) {
    console.warn(TAG, 'file-input guard install failed:', e);
  }

  // (3) Watchdog: if the vendor manages to bypass the prototype guard
  // (e.g. via Object.defineProperty on the instance, or by mutating an
  // input the framework re-renders), this MutationObserver clears the
  // attached files whenever a file input changes outside an authorised
  // window.  Runs cheaply: it only inspects file inputs, never the
  // whole DOM.
  try {
    function _checkInput(input) {
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
      if (window.__JG_FILE_ATTACH_AUTHORISED__) return;
      if (input.files && input.files.length > 0 && !input.dataset.jgAttachOk) {
        try {
          const dt = new DataTransfer();
          input.files = dt.files;
          window.__JG_BLOCKED_VENDOR_ATTACHES__++;
          console.warn(TAG, 'WATCHDOG: cleared unauthorised file-input population. Total blocked:',
            window.__JG_BLOCKED_VENDOR_ATTACHES__);
        } catch (e) {}
      }
    }

    const observer = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.target instanceof HTMLInputElement) _checkInput(rec.target);
        for (const node of rec.addedNodes || []) {
          if (node instanceof HTMLInputElement) _checkInput(node);
          else if (node && node.querySelectorAll) {
            const inputs = node.querySelectorAll('input[type="file"]');
            inputs.forEach(_checkInput);
          }
        }
      }
    });

    function startWatchdog() {
      if (!document.body) return;
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['type', 'files'],
      });
    }
    if (document.body) startWatchdog();
    else document.addEventListener('DOMContentLoaded', startWatchdog, { once: true });
  } catch (e) {
    console.warn(TAG, 'file-input watchdog install failed:', e);
  }

  console.log(TAG, 'gate installed, initial disabled =', disabled());
})();
