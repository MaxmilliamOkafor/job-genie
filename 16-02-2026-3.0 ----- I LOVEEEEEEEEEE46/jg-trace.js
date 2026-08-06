/**
 * Job Genie - Popup tracer
 *
 * WHY THIS EXISTS
 *   A crash in the popup leaves no evidence. The popup's console is wiped
 *   the moment it closes, and the debug export carries only the content
 *   script's log -- so "it crashed" could never be turned into a cause,
 *   and every round of diagnosis was guesswork about which step failed.
 *
 * WHAT IT RECORDS
 *   Every call to every method on the popup class: arguments (shallow and
 *   redacted), return shape, duration, and the exact error with its stack
 *   when one is thrown. Plus every chrome.storage / chrome.tabs /
 *   chrome.scripting call, every fetch, and every uncaught error.
 *
 *   Instrumentation is applied by wrapping the prototype, so it covers
 *   methods that do not exist yet and cannot drift out of date. Nothing in
 *   the product needs to call it.
 *
 * WHAT IT NEVER RECORDS
 *   Credentials. Anything that looks like a password, token, API key or
 *   authorisation header is replaced before it reaches the buffer, because
 *   the whole point of this file is to produce something safe to paste
 *   into a bug report.
 *
 *   window.JGTrace
 */
(function (global) {
  'use strict';

  const KEY = 'jg_trace';
  const MAX = 1500;                 // enough for several full pipeline runs
  const MAX_STR = 300;

  let buffer = [];
  let enabled = true;
  let seq = 0;
  const t0 = Date.now();

  // ---- redaction --------------------------------------------------------
  // Applied to keys AND to values that look like credentials, because a
  // token turns up under plenty of names.
  const SECRET_KEY = /(pass(word)?|token|api_?key|secret|authorization|auth|credential|bearer|refresh)/i;
  // Whole storage keys whose VALUE is secret regardless of its shape. The
  // ATS credential vault is keyed by domain, so none of its keys match the
  // pattern above -- without this the passwords would be traced verbatim
  // and end up in something the user pastes into a bug report.
  const SECRET_STORE = /^(ats_accounts|followup_oauth_token|enrichment_config)$/;
  const SECRET_VAL = /^(Bearer\s+|ya29\.|eyJ[A-Za-z0-9_-]{10,})/;

  function redact(v, depth) {
    const d = depth || 0;
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'string') {
      if (SECRET_VAL.test(v)) return '[redacted]';
      return v.length > MAX_STR ? v.slice(0, MAX_STR) + '…(' + v.length + ')' : v;
    }
    if (t === 'number' || t === 'boolean') return v;
    if (t === 'function') return '[fn ' + (v.name || 'anon') + ']';
    if (d > 2) return '[…]';
    if (Array.isArray(v)) {
      return v.slice(0, 8).map((x) => redact(x, d + 1))
        .concat(v.length > 8 ? ['…+' + (v.length - 8)] : []);
    }
    if (v instanceof Error) return { error: v.message, stack: String(v.stack || '').split('\n').slice(0, 4) };
    if (t === 'object') {
      // DOM nodes and big blobs are noise; name them and move on.
      if (v.nodeType) return '[dom ' + (v.tagName || v.nodeName) + (v.id ? '#' + v.id : '') + ']';
      if (typeof Blob !== 'undefined' && v instanceof Blob) return '[blob ' + v.size + 'b]';
      const out = {};
      let n = 0;
      for (const k of Object.keys(v)) {
        if (n++ > 20) { out['…'] = 'more keys'; break; }
        out[k] = (SECRET_KEY.test(k) || SECRET_STORE.test(k)) ? '[redacted]' : redact(v[k], d + 1);
      }
      return out;
    }
    return String(v);
  }

  // ---- the buffer -------------------------------------------------------
  function log(scope, event, data) {
    if (!enabled) return;
    buffer.push({
      i: ++seq,
      ms: Date.now() - t0,             // relative: easier to read than clock time
      at: new Date().toISOString(),
      scope,
      event,
      data: data === undefined ? undefined : redact(data),
    });
    if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  }

  function error(scope, err, extra) {
    log(scope, 'ERROR', {
      message: (err && err.message) || String(err),
      stack: String((err && err.stack) || '').split('\n').slice(0, 8),
      extra,
    });
  }

  // ---- instrumentation --------------------------------------------------
  // Wrapping the prototype covers every method at once, including ones
  // added later, and records the thing that matters most: which call threw.
  const SKIP = /^(constructor|showToast|setStatus|logDebug|addDebugLog|updateProgress)$/;

  function instrument(proto, label) {
    if (!proto || proto.__jgTraced) return 0;
    let count = 0;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (SKIP.test(name)) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || typeof desc.value !== 'function' || desc.get || desc.set) continue;
      const original = desc.value;
      Object.defineProperty(proto, name, {
        configurable: true,
        writable: true,
        enumerable: desc.enumerable,
        value: function jgTraced(...args) {
          const started = Date.now();
          log(label, name + ' →', args.length ? args : undefined);
          let result;
          try {
            result = original.apply(this, args);
          } catch (e) {
            // Synchronous throw: the single most useful thing to capture.
            error(label, e, name + '() threw synchronously');
            throw e;
          }
          if (result && typeof result.then === 'function') {
            return result.then(
              (v) => { log(label, name + ' ✓', { ms: Date.now() - started, value: v }); return v; },
              (e) => { error(label, e, name + '() rejected after ' + (Date.now() - started) + 'ms'); throw e; }
            );
          }
          log(label, name + ' ✓', { ms: Date.now() - started, value: result });
          return result;
        },
      });
      count++;
    }
    proto.__jgTraced = true;
    log('trace', 'instrumented', { target: label, methods: count });
    return count;
  }

  // ---- chrome + network -------------------------------------------------
  // The APIs that fail for environmental reasons -- a restricted page, a
  // missing permission, a revoked token -- and whose failures are the
  // hardest to attribute after the fact.
  function instrumentChrome() {
    try {
      if (!global.chrome || global.chrome.__jgTraced) return;
      const wrapAsync = (obj, name, label) => {
        if (!obj || typeof obj[name] !== 'function') return;
        const orig = obj[name].bind(obj);
        obj[name] = function (...args) {
          log('chrome', label + ' →', args);
          try {
            const r = orig(...args);
            if (r && typeof r.then === 'function') {
              return r.then(
                (v) => { log('chrome', label + ' ✓', v); return v; },
                (e) => { error('chrome', e, label); throw e; }
              );
            }
            return r;
          } catch (e) { error('chrome', e, label); throw e; }
        };
      };
      const c = global.chrome;
      if (c.storage && c.storage.local) {
        wrapAsync(c.storage.local, 'get', 'storage.get');
        wrapAsync(c.storage.local, 'set', 'storage.set');
        wrapAsync(c.storage.local, 'remove', 'storage.remove');
      }
      if (c.tabs) wrapAsync(c.tabs, 'query', 'tabs.query');
      if (c.scripting) wrapAsync(c.scripting, 'executeScript', 'scripting.executeScript');
      if (c.runtime) wrapAsync(c.runtime, 'sendMessage', 'runtime.sendMessage');
      c.__jgTraced = true;
    } catch (e) {}
  }

  function instrumentFetch() {
    try {
      if (!global.fetch || global.fetch.__jgTraced) return;
      const orig = global.fetch.bind(global);
      const wrapped = function (url, init) {
        const started = Date.now();
        // Headers are redacted wholesale: they carry the API keys.
        log('net', 'fetch →', { url: String(url).split('?')[0], method: (init && init.method) || 'GET' });
        return orig(url, init).then(
          (res) => { log('net', 'fetch ✓', { url: String(url).split('?')[0], status: res.status, ms: Date.now() - started }); return res; },
          (e) => { error('net', e, String(url).split('?')[0]); throw e; }
        );
      };
      wrapped.__jgTraced = true;
      global.fetch = wrapped;
    } catch (e) {}
  }

  // ---- output -----------------------------------------------------------
  function snapshot() {
    return {
      exportedAt: new Date().toISOString(),
      extension: (() => { try { return chrome.runtime.getManifest().version; } catch (e) { return '?'; } })(),
      page: (() => { try { return location.href; } catch (e) { return ''; } })(),
      entries: buffer.length,
      trace: buffer,
    };
  }

  function asText() {
    const s = snapshot();
    const head = 'Job Genie trace  ' + s.exportedAt + '  v' + s.extension + '  ' + s.entries + ' entries';
    const lines = buffer.map((e) => {
      const d = e.data === undefined ? '' : '  ' + (() => {
        try { return JSON.stringify(e.data); } catch (x) { return '[unserialisable]'; }
      })();
      return String(e.ms).padStart(7) + 'ms  ' + e.scope + '  ' + e.event + d;
    });
    return [head, ''].concat(lines).join('\n');
  }

  function clear() { buffer = []; seq = 0; log('trace', 'cleared'); }

  // Survives the popup closing, which is when most of this is lost.
  function persist() {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [KEY]: snapshot() }, () => resolve(true)); }
      catch (e) { resolve(false); }
    });
  }

  function restore() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get([KEY], (r) => resolve((r && r[KEY]) || null)); }
      catch (e) { resolve(null); }
    });
  }

  function setEnabled(on) { enabled = !!on; }
  function isEnabled() { return enabled; }

  global.JGTrace = {
    log, error, instrument, instrumentChrome, instrumentFetch,
    snapshot, asText, clear, persist, restore, setEnabled, isEnabled, redact, KEY,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.JGTrace;

  // Instrument the environment immediately: a failure during startup is
  // exactly the kind this is meant to catch.
  instrumentChrome();
  instrumentFetch();
  log('trace', 'ready');
})(typeof window !== 'undefined' ? window : globalThis);
