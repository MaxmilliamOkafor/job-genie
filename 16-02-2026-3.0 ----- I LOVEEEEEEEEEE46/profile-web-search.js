/**
 * Job Genie - find LinkedIn profiles WITHOUT contacting LinkedIn
 *
 * This is step 1 of the email chain:
 *
 *   1. find a LinkedIn profile        -> publicIdentifier   <- here
 *   2. resolve that profile to email  -> Closely / ContactOut
 *
 * Step 2 was always wired: Closely's contacts/find takes
 * `lid[]=<publicIdentifier>`, and lidParser.js in Closely's own extension
 * confirms `lid` IS the publicIdentifier. Step 1 never ran, so the
 * providers were skipped as "needs-named-poster", the API was never
 * called, and the saved token never changed.
 *
 * WHY A SEARCH ENGINE RATHER THAN LINKEDIN
 * ----------------------------------------
 * Closely's own extension does step 1 through LinkedIn's private Voyager
 * API. That works, and it is against LinkedIn's User Agreement, and it is
 * the known cause of account restriction. For someone job hunting, losing
 * the account costs more than the convenience is worth.
 *
 * Search engines have already indexed the public profiles. Querying one
 * for `site:linkedin.com/in "Technical Recruiter" Stripe Dublin` returns
 * the same profile URLs, and the slug is right there in the link. The
 * request goes to the search provider; LinkedIn is never contacted, sees
 * no traffic, and has nothing to restrict.
 *
 * The cost is a search API key. Brave has a free tier; Serper is cheap.
 * Both are supported, plus Google Programmable Search.
 */
(function (global) {
  'use strict';

  const TAG = '[JG-ProfileSearch]';
  const KEY_CFG = 'profile_search_cfg';   // { provider, key }

  // Result cap. More than a handful is not better: each one costs a
  // credit at step 2, and the right person is near the top or not there.
  const MAX_RESULTS = 5;

  const ENGINES = {
    brave: {
      label: 'Brave Search',
      keyUrl: 'https://brave.com/search/api/',
      hint: 'Brave Search API has a free tier. Paste the subscription token.',
      build: (q, key) => ({
        url: 'https://api.search.brave.com/res/v1/web/search?count=10&q=' + encodeURIComponent(q),
        init: { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': key } },
      }),
      // Brave nests results under web.results[].url
      links: (j) => ((j && j.web && j.web.results) || []).map((r) => r && r.url),
    },
    serper: {
      label: 'Serper',
      keyUrl: 'https://serper.dev/',
      hint: 'Serper gives Google results over a simple API. Paste the API key.',
      build: (q, key) => ({
        url: 'https://google.serper.dev/search',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
          body: JSON.stringify({ q, num: 10 }),
        },
      }),
      links: (j) => ((j && j.organic) || []).map((r) => r && r.link),
    },
    google: {
      label: 'Google Programmable Search',
      keyUrl: 'https://programmablesearchengine.google.com/',
      hint: 'Needs an API key AND an engine id, entered as "key:engineId".',
      build: (q, key) => {
        const [k, cx] = String(key).split(':');
        return {
          url: 'https://www.googleapis.com/customsearch/v1?num=10&key='
            + encodeURIComponent(k || '') + '&cx=' + encodeURIComponent(cx || '')
            + '&q=' + encodeURIComponent(q),
          init: { method: 'GET', headers: { Accept: 'application/json' } },
        };
      },
      links: (j) => ((j && j.items) || []).map((r) => r && r.link),
    },
  };

  function loadConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_CFG], (r) => resolve((r && r[KEY_CFG]) || {}));
      } catch (e) { resolve({}); }
    });
  }
  function saveConfig(cfg) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY_CFG]: cfg || {} }, () => resolve(true));
      } catch (e) { resolve(false); }
    });
  }

  /**
   * The query. Quoting the title matters: unquoted, a search for
   * Technical Recruiter returns anyone whose page contains both words.
   * The site: filter is what keeps the results to profile pages rather
   * than company pages or job posts.
   */
  function buildQuery(q) {
    const parts = ['site:linkedin.com/in'];
    const titles = (q.titles && q.titles.length ? q.titles : [q.title]).filter(Boolean);
    if (titles.length === 1) parts.push('"' + titles[0] + '"');
    else if (titles.length > 1) parts.push('(' + titles.map((t) => '"' + t + '"').join(' OR ') + ')');
    if (q.company) parts.push('"' + q.company + '"');
    if (q.location) parts.push(q.location);
    return parts.join(' ');
  }

  // linkedin.com/in/<slug> -- also handles country subdomains (ie., uk.)
  // and the trailing locale segments search engines often keep.
  function slugFromUrl(url) {
    const m = String(url || '').match(/^https?:\/\/(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#]+)/i);
    if (!m) return '';
    const slug = decodeURIComponent(m[1]).trim();
    // Reject the obvious non-profiles a SERP sometimes returns.
    if (!slug || slug.length < 2 || /^(edit|new|me)$/i.test(slug)) return '';
    return slug;
  }

  function profilesFromLinks(links) {
    const out = [];
    const seen = new Set();
    for (const url of links || []) {
      const slug = slugFromUrl(url);
      if (!slug || seen.has(slug.toLowerCase())) continue;
      seen.add(slug.toLowerCase());
      out.push({ profile: slug, url: String(url), source: 'web-search' });
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }

  /**
   * Returns { ok, profiles, reason, trace }. Never throws.
   *
   * Every failure names its cause. The bug this module exists to fix was
   * a lookup that silently did nothing, so "no results" must never be the
   * answer when the truth is "no key saved" or "the search never ran".
   */
  async function findProfiles(q, opts) {
    const trace = [];
    const say = (m) => { trace.push('Profile search: ' + m); return m; };
    const o = opts || {};

    const cfg = o.config || await loadConfig();
    const engine = ENGINES[cfg.provider];
    if (!engine) {
      return { ok: false, profiles: [], reason: say('no search provider chosen'), trace };
    }
    if (!cfg.key) {
      return { ok: false, profiles: [], reason: say(engine.label + ': no API key saved'), trace };
    }
    if (!q || (!q.company && !q.title && !(q.titles || []).length)) {
      return { ok: false, profiles: [], reason: say('nothing to search for (no title or company)'), trace };
    }

    const query = buildQuery(q);
    say('querying ' + engine.label + ' for ' + JSON.stringify(query));

    const { url, init } = engine.build(query, cfg.key);
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      return { ok: false, profiles: [], reason: say('network error: ' + (e && e.message)), trace };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, profiles: [], reason: say(engine.label + ' rejected the API key ('
        + res.status + ')'), trace };
    }
    if (res.status === 429) {
      return { ok: false, profiles: [], reason: say(engine.label + ' rate limit reached (429) '
        + '- the free tier may be exhausted for now'), trace };
    }
    if (!res.ok) {
      return { ok: false, profiles: [], reason: say(engine.label + ' returned ' + res.status), trace };
    }

    let json;
    try { json = await res.json(); } catch (e) {
      return { ok: false, profiles: [], reason: say('response was not JSON'), trace };
    }

    const profiles = profilesFromLinks(engine.links(json));
    say(profiles.length
      ? 'found ' + profiles.length + ' profile(s): ' + profiles.map((p) => p.profile).join(', ')
      : 'search ran but returned no LinkedIn profiles');
    return {
      ok: profiles.length > 0,
      profiles,
      reason: profiles.length ? 'ok' : 'no-match',
      trace,
    };
  }

  global.ProfileWebSearch = {
    ENGINES, MAX_RESULTS, KEY_CFG,
    loadConfig, saveConfig, buildQuery, slugFromUrl, profilesFromLinks, findProfiles,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ProfileWebSearch;
  try { console.log(TAG, 'loaded'); } catch (e) {}
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
