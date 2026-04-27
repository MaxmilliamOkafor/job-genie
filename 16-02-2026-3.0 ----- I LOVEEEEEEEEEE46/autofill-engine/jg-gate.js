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

  // When the controller decides to allow autofill it sets this to false.
  // Default to whatever controller already set; otherwise allow (so manual Run Now works).
  function disabled() {
    return window.__JG_AUTOFILL_DISABLED__ === true;
  }

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
  // Mechanism: hijack the .files setter and the .click() method on
  // HTMLInputElement.  Calls are allowed ONLY when our own attach loop
  // has flipped window.__JG_FILE_ATTACH_AUTHORISED__ on.  Any other
  // caller (the vendor engine, page JS, etc.) is silently no-op'd while
  // the autofill toggle is on.  When the toggle is off the vendor never
  // runs in the first place, so this guard is a defense-in-depth.
  try {
    const proto = HTMLInputElement.prototype;
    const filesDescriptor = Object.getOwnPropertyDescriptor(proto, 'files');
    if (filesDescriptor && typeof filesDescriptor.set === 'function') {
      const origSetFiles = filesDescriptor.set;
      Object.defineProperty(proto, 'files', {
        configurable: true,
        enumerable: filesDescriptor.enumerable,
        get: filesDescriptor.get,
        set: function (value) {
          if (this.type === 'file' && !window.__JG_FILE_ATTACH_AUTHORISED__) {
            console.warn(TAG, 'BLOCKED unauthorised file-input write (vendor engine cannot attach files)');
            return;
          }
          return origSetFiles.call(this, value);
        },
      });
    }

    const origClick = proto.click;
    proto.click = function () {
      if (this.type === 'file' && !window.__JG_FILE_ATTACH_AUTHORISED__) {
        // We allow user-initiated clicks (isTrusted MouseEvents are
        // generated by the browser, not via .click()), so this only
        // blocks programmatic .click() calls from the vendor engine.
        console.warn(TAG, 'BLOCKED programmatic .click() on file input (vendor engine)');
        return;
      }
      return origClick.apply(this, arguments);
    };
  } catch (e) {
    console.warn(TAG, 'file-input guard install failed:', e);
  }

  console.log(TAG, 'gate installed, initial disabled =', disabled());
})();
