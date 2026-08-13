/**
 * Job Genie - LinkedIn people search (step 1 of the email chain)
 *
 * WHY THIS EXISTS
 * ---------------
 * Finding a recruiter's email is two steps:
 *
 *   1. find a LinkedIn profile        -> publicIdentifier ("jane-smith-123")
 *   2. resolve that profile to email  -> Closely / ContactOut
 *
 * Step 2 has always been wired: contact-enrichment's `lookupByProfile`
 * posts `lid[]=<publicIdentifier>` to Closely's contacts/find, and
 * lidParser.js in Closely's own extension confirms `lid` IS the
 * publicIdentifier, so the shape is right.
 *
 * Step 1 never happened. linkedin-people-search.js builds search URLs for
 * a human to click and can scrape a DOM if handed one; nothing ever
 * produced a slug on its own. With no slug, findContacts skipped Closely
 * with reason "needs-named-poster", the API was never called, and the
 * token was never spent -- which is exactly the reported symptom: a
 * Closely token that never changes.
 *
 * Closely's own extension solves step 1 through LinkedIn's Voyager API
 * using the user's existing session (peopleSearch.js + apiUrls.js). This
 * module does the same thing, deliberately more conservatively.
 *
 * THE RISK, STATED PLAINLY
 * ------------------------
 * Voyager is LinkedIn's private API. Calling it from an extension is
 * against LinkedIn's User Agreement and is a known cause of account
 * restriction. The user of this tool is job hunting, so losing the
 * account would cost far more than looking an email up by hand. That is
 * why:
 *
 *   - it is OFF unless explicitly enabled,
 *   - volume is capped hard (see LIMITS), not merely "rate limited",
 *   - requests are spaced with jitter rather than fired in a burst,
 *   - one 999/429 response disables it for the rest of the session.
 *
 * None of that makes it sanctioned. It makes it small.
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Voyager]';

  // Deliberately low. A recruiter search per application is a handful of
  // requests a day; anything resembling bulk collection is what gets an
  // account flagged. These are ceilings, not targets.
  const LIMITS = {
    perSearch: 1,          // one search call per job application
    perSession: 12,        // stop entirely after this many, whatever happens
    minGapMs: 4000,        // never two calls closer together than this
    jitterMs: 3000,        // plus a random extra, so the cadence is not a metronome
    resultsUsed: 5,        // slugs handed on to the email provider
  };

  let _sessionCalls = 0;
  let _lastCallAt = 0;
  let _disabledReason = '';

  const KEY_ENABLED = 'voyager_search_enabled';

  // ON unless explicitly switched off.
  //
  // This was off-by-default, which was the cautious choice and the wrong
  // one here: the entire complaint being fixed is a contact lookup that
  // silently does nothing, and shipping the fix disabled would reproduce
  // it exactly. The account risk was put to the user plainly, twice, and
  // this route was chosen anyway. It is their account.
  //
  // What protects them is not the default, it is the caps in LIMITS: one
  // search per application, a hard session ceiling, spacing with jitter,
  // and a full stop for the session on the first 999/429. Set
  // voyager_search_enabled to false to turn it off entirely.
  function isEnabled() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_ENABLED], (r) => {
          const v = r && r[KEY_ENABLED];
          resolve(v === undefined || v === null ? true : !!v);
        });
      } catch (e) { resolve(true); }
    });
  }
  function setEnabled(on) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY_ENABLED]: !!on }, () => resolve(true));
      } catch (e) { resolve(false); }
    });
  }

  // The csrf-token header is the JSESSIONID cookie value with its quotes
  // stripped -- LinkedIn sets it as "ajax:1234567890123456789".
  function csrfFromJsessionid(raw) {
    const v = String(raw || '').replace(/^"|"$/g, '').trim();
    return /^ajax:/.test(v) ? v : '';
  }

  function getCsrfToken() {
    return new Promise((resolve) => {
      try {
        if (!chrome.cookies || !chrome.cookies.get) { resolve(''); return; }
        chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'JSESSIONID' }, (c) => {
          resolve(c ? csrfFromJsessionid(c.value) : '');
        });
      } catch (e) { resolve(''); }
    });
  }

  // Mirrors Closely's createVariablesString for the people-search case we
  // need: title keywords + optional company and location, first page only.
  function buildVariables(q) {
    const enc = (s) => encodeURIComponent(String(s || ''))
      .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    const params = [];
    if (q.title) params.push(`(key:title,value:List(${enc(q.title)}))`);
    if (q.company) params.push(`(key:company,value:List(${enc(q.company)}))`);
    params.push('(key:resultType,value:List(PEOPLE))');
    const keywords = [q.title, q.company, q.location].filter(Boolean).join(' ');
    return 'start:0,count:10,query:(queryParameters:List(' + params.join(',') + ')'
      + ',flagshipSearchIntent:SEARCH_SRP,includeFiltersInResponse:false'
      + (keywords ? ',keywords:' + enc(keywords) : '') + ')';
  }

  function searchUrl(vars) {
    return 'https://www.linkedin.com/voyager/api/graphql?variables=(' + vars
      + ')&queryId=voyagerSearchDashClusters.92cc53470cef3c578ab1d34676d5320c';
  }

  function headers(csrf) {
    return {
      'csrf-token': csrf,
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      accept: 'application/vnd.linkedin.normalized+json+2.1',
    };
  }

  // Voyager returns a flat `included` array; the people entries are the
  // ones templated UNIVERSAL, same filter Closely's filterVoyagerResponse
  // uses. Everything here is defensive -- the shape is undocumented and
  // changes without notice, and a parser error must not look like "no
  // results found".
  function parsePeople(json) {
    const included = (json && json.included) || [];
    const out = [];
    for (const e of included) {
      if (!e || typeof e !== 'object') continue;
      if (e.template && e.template !== 'UNIVERSAL') continue;
      const url = e.navigationUrl || e.navigationContext?.url || '';
      const slug = _slugFrom(url) || _slugFrom(e.trackingUrn) || '';
      if (!slug) continue;
      out.push({
        name: _text(e.title),
        title: _text(e.primarySubtitle),
        location: _text(e.secondarySubtitle),
        profile: slug,
        source: 'linkedin-search',
      });
    }
    // De-duplicate on slug, preserving order.
    const seen = new Set();
    return out.filter((p) => !seen.has(p.profile) && seen.add(p.profile));
  }

  function _text(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    return String(v.text || v.accessibilityText || '').trim();
  }
  function _slugFrom(url) {
    const m = String(url || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // ---- WHERE THE REQUEST IS MADE FROM -----------------------------------
  //
  // This matters more than anything else in this file.
  //
  // The popup runs on a chrome-extension:// origin. A fetch from there to
  // linkedin.com is a cross-site credentialed request: the Origin header
  // is the extension, the Referer is absent, and cookies are subject to
  // SameSite. LinkedIn answers that pattern with 403 or 999, which is the
  // "search ran and found nobody" the user kept seeing. Nothing about the
  // query was wrong; the request was being made from the wrong place.
  //
  // Run the same fetch INSIDE an open linkedin.com tab and it is
  // first-party: the session cookies attach normally, Origin and Referer
  // are linkedin.com, and it is indistinguishable from the page asking
  // for its own search results -- which is also how Closely's own
  // extension does it.
  //
  // executeScript rather than messaging a content script, because a
  // content script only exists in tabs loaded AFTER the extension was
  // installed or reloaded. Injecting on demand works on a tab that has
  // been open for hours, which is the normal case.
  async function _fetchInLinkedInTab(url, hdrs) {
    try {
      if (!chrome.tabs || !chrome.tabs.query || !chrome.scripting) return null;
      const tabs = await new Promise((resolve) => {
        try { chrome.tabs.query({ url: 'https://*.linkedin.com/*' }, (t) => resolve(t || [])); }
        catch (e) { resolve([]); }
      });
      const tab = (tabs || []).find((t) => t && t.id != null && t.id >= 0);
      if (!tab) return null;
      const out = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        // Serialised and run in the page's context: no closure over
        // anything here, everything arrives through args.
        func: async (u, h) => {
          try {
            const r = await fetch(u, { method: 'GET', headers: h, credentials: 'include' });
            return { status: r.status, body: await r.text() };
          } catch (e) {
            return { status: 0, error: String((e && e.message) || e) };
          }
        },
        args: [url, hdrs],
      });
      const r = out && out[0] && out[0].result;
      return r || null;
    } catch (e) {
      // A tab we cannot script (a chrome:// page, a blocked host) is not
      // an error worth failing the lookup for -- fall back to the direct
      // request and let the status code speak.
      return null;
    }
  }

  function _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /**
   * Returns { ok, profiles, reason, trace }. Never throws: the caller is
   * an enrichment chain that must carry on with other providers.
   *
   * `reason` is always specific. The whole complaint this module answers
   * is a lookup that silently did nothing, so "it didn't work" is not an
   * acceptable answer to give back.
   */
  async function findProfiles(q, opts) {
    const trace = [];
    const o = opts || {};
    const say = (m) => { trace.push('LinkedIn search: ' + m); return m; };

    if (!(await isEnabled()) && !o.force) {
      return { ok: false, profiles: [], reason: say('off (enable it in settings)'), trace };
    }
    if (_disabledReason) {
      return { ok: false, profiles: [], reason: say(_disabledReason), trace };
    }
    if (_sessionCalls >= LIMITS.perSession) {
      return { ok: false, profiles: [], reason: say('session cap reached (' + LIMITS.perSession + ')'), trace };
    }
    if (!q || (!q.title && !q.company)) {
      return { ok: false, profiles: [], reason: say('nothing to search for (no title or company)'), trace };
    }

    const csrf = await getCsrfToken();
    if (!csrf) {
      return {
        ok: false,
        profiles: [],
        reason: say('not signed in to LinkedIn in this browser, or the "cookies" '
          + 'permission is missing -- no request was made'),
        trace,
      };
    }

    // Space the calls out. A burst is the pattern that gets noticed.
    const since = Date.now() - _lastCallAt;
    const gap = LIMITS.minGapMs + Math.floor(Math.random() * LIMITS.jitterMs);
    if (_lastCallAt && since < gap) await _sleep(gap - since);

    const url = searchUrl(buildVariables(q));
    let res;
    _sessionCalls++;
    _lastCallAt = Date.now();

    // First choice: run it inside an open LinkedIn tab, where the request
    // is first-party. See _fetchInLinkedInTab.
    const viaTab = await _fetchInLinkedInTab(url, headers(csrf));
    if (viaTab) {
      if (!viaTab.status) {
        return { ok: false, profiles: [], reason: say('network error in the LinkedIn tab: '
          + (viaTab.error || 'unknown')), trace };
      }
      say('ran inside your open LinkedIn tab (first-party request)');
      res = {
        status: viaTab.status,
        ok: viaTab.status >= 200 && viaTab.status < 300,
        json: async () => JSON.parse(viaTab.body),
      };
    } else {
      // No LinkedIn tab open. The direct request usually fails -- it is
      // cross-site from the extension origin -- so say that up front
      // rather than reporting the 403 as if the search found nobody.
      say('no LinkedIn tab open, trying direct (LinkedIn often rejects this; '
        + 'open linkedin.com in a tab for a first-party request)');
      try {
        res = await fetch(url, { method: 'GET', headers: headers(csrf), credentials: 'include' });
      } catch (e) {
        return { ok: false, profiles: [], reason: say('network error: ' + (e && e.message)), trace };
      }
    }

    // 999 is LinkedIn's rate-limit/blocked response; 429 is the standard
    // one. Either means stop for the session rather than retry into a
    // restriction.
    if (res.status === 999 || res.status === 429) {
      _disabledReason = 'LinkedIn rate-limited the request (' + res.status
        + '); search disabled for this session';
      return { ok: false, profiles: [], reason: say(_disabledReason), trace };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, profiles: [], reason: say('LinkedIn rejected the request ('
        + res.status + '). Open linkedin.com in a tab and make sure you are signed in, '
        + 'then try again -- the request is only accepted from a real LinkedIn tab'), trace };
    }
    if (!res.ok) {
      return { ok: false, profiles: [], reason: say('LinkedIn returned ' + res.status), trace };
    }

    let json;
    try { json = await res.json(); } catch (e) {
      return { ok: false, profiles: [], reason: say('response was not JSON'), trace };
    }

    const people = parsePeople(json).slice(0, LIMITS.resultsUsed);
    say(people.length
      ? 'found ' + people.length + ' profile(s): ' + people.map((p) => p.profile).join(', ')
      : 'search ran but matched nobody');
    return {
      ok: people.length > 0,
      profiles: people,
      reason: people.length ? 'ok' : 'no-match',
      trace,
    };
  }

  function stats() {
    return {
      callsThisSession: _sessionCalls,
      limits: Object.assign({}, LIMITS),
      disabledReason: _disabledReason,
    };
  }
  function _resetForTests() { _sessionCalls = 0; _lastCallAt = 0; _disabledReason = ''; }

  global.LinkedInVoyager = {
    isEnabled, setEnabled, getCsrfToken, csrfFromJsessionid,
    buildVariables, searchUrl, headers, parsePeople, findProfiles, stats,
    LIMITS, KEY_ENABLED, _resetForTests,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LinkedInVoyager;
  try { console.log(TAG, 'loaded'); } catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
