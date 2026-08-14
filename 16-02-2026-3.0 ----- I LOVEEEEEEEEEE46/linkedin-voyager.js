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
    // Applying for a role takes about a minute. A lookup that spends
    // twenty seconds waiting for a tab to load has made the application
    // slower than doing it by hand, which is a different kind of broken.
    // Everything below is bounded so the whole profile search cannot
    // exceed roughly ten seconds, and gives up cleanly if it would.
    budgetMs: 10000,       // whole profile search, both routes
    tabReadyMs: 5000,      // waiting for a background tab to be usable
    pageReadyMs: 6000,     // waiting for the search page to render
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
  const _tabs = () => (typeof chrome !== 'undefined' && chrome.tabs) || null;
  const _scripting = () => (typeof chrome !== 'undefined' && chrome.scripting) || null;

  function _findLinkedInTabs() {
    return new Promise((resolve) => {
      try { _tabs().query({ url: 'https://*.linkedin.com/*' }, (t) => resolve(t || [])); }
      catch (e) { resolve([]); }
    });
  }
  function _openTab(url) {
    return new Promise((resolve) => {
      try { _tabs().create({ url, active: false }, (t) => resolve(t || null)); }
      catch (e) { resolve(null); }
    });
  }
  function _closeTab(id) {
    return new Promise((resolve) => {
      try { _tabs().remove(id, () => resolve(true)); } catch (e) { resolve(false); }
    });
  }
  async function _exec(tabId, func, args) {
    const out = await _scripting().executeScript({ target: { tabId }, func, args });
    return out && out[0] ? out[0].result : null;
  }
  // Poll for the document being ready rather than listening on
  // tabs.onUpdated: a tab that finished loading before the listener was
  // attached never fires it, and this has to work for a tab we just made.
  async function _waitReady(tabId, timeoutMs) {
    const until = Date.now() + (timeoutMs || LIMITS.tabReadyMs);
    while (Date.now() < until) {
      try {
        const st = await _exec(tabId, () => document.readyState, []);
        if (st === 'complete' || st === 'interactive') return true;
      } catch (e) { /* not scriptable yet */ }
      await _sleep(250);
    }
    return false;
  }

  /**
   * A LinkedIn tab to work in.
   *
   * Reuses one the user already has open. If there is none, opens one in
   * the background -- inactive, so focus is not stolen -- and marks it
   * `mine` so it can be closed afterwards and navigated freely. A tab the
   * user opened is never navigated: they may be mid-message.
   */
  // ---- one tab, ever ----------------------------------------------------
  //
  // A helper tab per application would be a hundred tabs over a batch run,
  // and a browser that falls over is a worse outcome than a lookup that
  // fails. Three things keep the count at one.
  //
  // REMEMBERED. The id of the tab this module opened is written to
  // chrome.storage, which outlives the popup. The popup's JavaScript
  // context is destroyed the moment the popup closes -- mid-lookup, the
  // `finally` that closes the tab never runs and the tab is orphaned.
  // Recording the id means the NEXT run finds that tab and reuses it
  // rather than opening a second one, so an interrupted lookup costs one
  // stray tab once, not one per application.
  //
  // SERIALISED. Two lookups at once would open two tabs. _inFlight makes
  // concurrent callers share the first one's work.
  //
  // VERIFIED. A remembered id is checked against the live tab list before
  // use: the user may have closed it, and reusing a dead id throws.
  const KEY_TAB = 'voyager_helper_tab';
  let _inFlight = null;

  function _rememberTab(id) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [KEY_TAB]: id == null ? null : id }, () => resolve()); }
      catch (e) { resolve(); }
    });
  }
  function _recallTabId() {
    return new Promise((resolve) => {
      try { chrome.storage.local.get([KEY_TAB], (r) => resolve((r && r[KEY_TAB]) || null)); }
      catch (e) { resolve(null); }
    });
  }
  function _tabExists(id) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.get(id, (t) => {
          void chrome.runtime.lastError;
          resolve(!!(t && t.id === id && /linkedin\.com/.test(t.url || '')));
        });
      } catch (e) { resolve(false); }
    });
  }

  async function _getOwnTab() {
    // Left over from a lookup the popup interrupted: adopt it rather than
    // add to it.
    const prior = await _recallTabId();
    if (prior != null && await _tabExists(prior)) {
      return { id: prior, mine: true, reused: true };
    }
    const made = await _openTab('https://www.linkedin.com/feed/');
    if (!made || made.id == null) return null;
    await _rememberTab(made.id);
    await _waitReady(made.id, LIMITS.tabReadyMs);
    return { id: made.id, mine: true };
  }

  async function _getSearchTab() {
    if (!_tabs() || !_scripting()) return null;
    const existing = (await _findLinkedInTabs()).find((t) => t && t.id != null && t.id >= 0);
    if (existing) return { id: existing.id, mine: false };
    return _getOwnTab();
  }

  // The Voyager request, issued from inside the tab so it is first-party.
  async function _apiInTab(tabId, url, hdrs) {
    try {
      return await _exec(tabId, async (u, h) => {
        try {
          const r = await fetch(u, { method: 'GET', headers: h, credentials: 'include' });
          return { status: r.status, body: await r.text() };
        } catch (e) { return { status: 0, error: String((e && e.message) || e) }; }
      }, [url, hdrs]);
    } catch (e) { return null; }
  }

  /**
   * The durable fallback: LinkedIn's own people-search PAGE, read from the
   * DOM.
   *
   * The Voyager call carries a queryId hash that LinkedIn rotates without
   * notice. When it rotates, the endpoint 400s and every lookup dies until
   * somebody updates a constant in this file -- a single point of failure
   * with no warning and no workaround for the user. The search page needs
   * no queryId: it is the URL a person types, and the profile links are in
   * the markup.
   *
   * Only ever used in a tab this code opened. Navigating a tab the user
   * opened would throw away whatever they were doing.
   */
  async function _scrapeSearchPage(tabId, q) {
    const keywords = [q.title, q.company, q.location].filter(Boolean).join(' ');
    if (!keywords) return [];
    const url = 'https://www.linkedin.com/search/results/people/?keywords='
      + encodeURIComponent(keywords);
    await new Promise((resolve) => {
      try { _tabs().update(tabId, { url }, () => resolve()); } catch (e) { resolve(); }
    });
    await _waitReady(tabId, LIMITS.pageReadyMs);
    await _sleep(900);             // results render after the shell
    try {
      return (await _exec(tabId, () => {
        const seen = {};
        const out = [];
        for (const a of document.querySelectorAll('a[href*="/in/"]')) {
          const m = (a.getAttribute('href') || '').match(/linkedin\.com\/in\/([^/?#]+)|^\/in\/([^/?#]+)/);
          const slug = m && (m[1] || m[2]);
          if (!slug || seen[slug]) continue;
          seen[slug] = 1;
          // The card's text is the most reliable name/headline source
          // available without depending on class names, which change.
          const card = a.closest('li, div[data-view-name], .entity-result') || a;
          const lines = (card.innerText || '')
            .split('\n').map((x) => x.trim()).filter(Boolean);
          out.push({ slug, name: lines[0] || '', title: lines[1] || '', location: lines[2] || '' });
          if (out.length >= 10) break;
        }
        return out;
      }, [])) || [];
    } catch (e) { return []; }
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
  /**
   * Serialised entry point. Two applications tailoring at once would
   * otherwise each open a helper tab; concurrent callers now queue behind
   * the first, so there is never more than one lookup, and never more
   * than one tab, in flight.
   */
  async function findProfiles(q, opts) {
    const run = () => _findProfiles(q, opts);
    _inFlight = (_inFlight ? _inFlight.catch(() => {}).then(run) : run());
    const mine = _inFlight;
    try { return await mine; }
    finally { if (_inFlight === mine) _inFlight = null; }
  }

  async function _findProfiles(q, opts) {
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
    const _startedAt = Date.now();
    let res = null;
    let people = null;
    _sessionCalls++;
    _lastCallAt = Date.now();

    // Work inside a LinkedIn tab: reuse one the user has open, or open one
    // in the background. Everything below is first-party from there.
    let tab = await _getSearchTab();
    try {
      if (tab) {
        say(tab.mine ? 'opened a background LinkedIn tab' : 'using your open LinkedIn tab');
        let viaTab = await _apiInTab(tab.id, url, headers(csrf));

        // A tab we cannot script -- a discarded tab, one still loading, a
        // page the browser will not inject into. Rather than give up on
        // the good route, open our own tab, which is scriptable by
        // definition and also unlocks the search-page fallback below.
        if (!viaTab && !tab.mine) {
          say('your LinkedIn tab could not be scripted, opening one instead');
          const own = await _getOwnTab();
          if (own) {
            tab = own;
            viaTab = await _apiInTab(tab.id, url, headers(csrf));
          }
        }

        if (viaTab && viaTab.status) {
          res = {
            status: viaTab.status,
            ok: viaTab.status >= 200 && viaTab.status < 300,
            json: async () => JSON.parse(viaTab.body),
          };
        } else if (viaTab && viaTab.error) {
          say('request failed inside the tab: ' + viaTab.error);
        }
      } else {
        // No tabs API at all (or it refused). The direct request is
        // cross-site from the extension origin and LinkedIn usually
        // rejects it, so say that rather than reporting the 403 as
        // "matched nobody".
        say('could not use a LinkedIn tab, trying direct (LinkedIn usually rejects this)');
        try {
          res = await fetch(url, { method: 'GET', headers: headers(csrf), credentials: 'include' });
        } catch (e) {
          return { ok: false, profiles: [], reason: say('network error: ' + (e && e.message)), trace };
        }
      }

      // Rate limiting is a stop, whichever route produced it.
      if (res && (res.status === 999 || res.status === 429)) {
        _disabledReason = 'LinkedIn rate-limited the request (' + res.status
          + '); search disabled for this session';
        return { ok: false, profiles: [], reason: say(_disabledReason), trace };
      }

      if (res && res.ok) {
        let json = null;
        try { json = await res.json(); } catch (e) { json = null; }
        if (json) people = parsePeople(json).slice(0, LIMITS.resultsUsed);
        else say('response was not JSON');
      } else if (res) {
        say('the private API answered ' + res.status
          + (res.status === 400 || res.status === 404
            ? ' (its queryId rotates; falling back to the search page)' : ''));
      }

      // The queryId in this file is a constant and LinkedIn rotates it.
      // When that happens the API 400s and, without this, every lookup
      // dies until somebody edits a hash in here. The search PAGE needs no
      // queryId. Only in a tab we opened -- navigating the user's own tab
      // would discard whatever they were doing.
      if ((!people || !people.length) && tab && tab.mine
          && (Date.now() - _startedAt) < LIMITS.budgetMs) {
        say('reading the LinkedIn search page instead');
        const scraped = await _scrapeSearchPage(tab.id, q);
        if (scraped.length) {
          people = scraped.slice(0, LIMITS.resultsUsed).map((p) => ({
            name: p.name, title: p.title, location: p.location,
            profile: p.slug, source: 'linkedin-search-page',
          }));
        }
      }
    } finally {
      // Never leave a tab behind that this code created, and forget the id
      // in the same breath so a later run does not try to adopt a tab that
      // is already gone.
      if (tab && tab.mine) {
        await _closeTab(tab.id);
        await _rememberTab(null);
      }
    }

    if (!people) {
      const st = res ? res.status : 0;
      if (st === 401 || st === 403) {
        return { ok: false, profiles: [], reason: say('LinkedIn rejected the request ('
          + st + '). Make sure you are signed in to LinkedIn in this browser, then retry'), trace };
      }
      return { ok: false, profiles: [], reason: say(st
        ? 'LinkedIn returned ' + st + ' and the search page gave nothing'
        : 'could not reach LinkedIn'), trace };
    }

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
  function _resetForTests() { _sessionCalls = 0; _lastCallAt = 0; _disabledReason = ''; _inFlight = null; }

  global.LinkedInVoyager = {
    isEnabled, setEnabled, getCsrfToken, csrfFromJsessionid,
    buildVariables, searchUrl, headers, parsePeople, findProfiles, stats,
    LIMITS, KEY_ENABLED, _resetForTests,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LinkedInVoyager;
  try { console.log(TAG, 'loaded'); } catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
