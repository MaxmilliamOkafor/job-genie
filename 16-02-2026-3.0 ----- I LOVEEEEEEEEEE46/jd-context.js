/**
 * Job Genie - Job context that survives the Apply navigation
 *
 * WHY THIS EXISTS
 *   Most ATS are two pages, not one. The posting is shown at one URL; the
 *   "Apply" button navigates to a DIFFERENT page that holds the form. On
 *   that second page the description is gone, the company name is often
 *   gone, and the address written in the JD body is gone. Everything the
 *   extension does downstream reads the CURRENT page:
 *
 *     keyword extraction   needs the description  -> nothing to extract
 *     tailoring            needs the description  -> nothing to tailor to
 *     the contact address  needs the JD body      -> no address found
 *     the follow-up email  needs company + title  -> addressed to nobody
 *
 *   Worse than failing, it overwrote: ats_lastJob was replaced on every
 *   detection, so arriving at the apply page destroyed the context
 *   captured on the posting a second earlier.
 *
 *   This keeps the posting, keyed so the apply page can find it again,
 *   and refuses to let a thinner reading of the same job replace a richer
 *   one. Nothing here is guesswork: a context is only ever reused for a
 *   page that resolves to the SAME posting.
 *
 * HOW A PAGE IS MATCHED BACK TO ITS POSTING, strongest signal first
 *   1. requisition id   the id in both URLs is the same posting, whatever
 *                       the paths look like
 *   2. tab lineage      the user pressed Apply in this tab moments ago
 *   3. path lineage     /jobs/123/apply sits under /jobs/123
 *
 *   window.JDContext
 */
(function (global) {
  'use strict';

  const KEY = 'jd_context_v1';
  const TTL_MS = 12 * 60 * 60 * 1000;   // a session's worth of applying
  const MAX_ENTRIES = 40;
  // A tab that navigated within this window is the same journey. Longer
  // than a page load, far shorter than "some other job later on".
  const TAB_LINEAGE_MS = 45 * 60 * 1000;

  // URL segments that mean "this is the apply step of the posting above",
  // across every supported ATS. Stripping them is what makes the posting
  // page and the application page resolve to the same key.
  const APPLY_TAIL = new RegExp(
    '(?:^|/)(?:' + [
      'apply', 'apply-now', 'applynow', 'application', 'applications',
      'submit', 'submission', 'candidate', 'candidates', 'register',
      'registration', 'login', 'signin', 'sign-in', 'signup', 'sign-up',
      'create-account', 'createaccount', 'new', 'start', 'form', 'step',
    ].join('|') + ')(?:/|$)', 'i');

  // The same set, used to recognise an application page from its URL.
  const APPLY_URL = /(?:\/|[?&#])(apply|application|applications|candidate|submit|register|signup|sign-up|createaccount|create-account)(?:\b|_|\/|=)/i;

  function _ap() {
    try { return global.ATSPlatforms || (typeof ATSPlatforms !== 'undefined' ? ATSPlatforms : null); }
    catch (e) { return null; }
  }

  function _host(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  /** The registrable-ish domain, so jobs.x.com and careers.x.com match. */
  function _domain(host) {
    const parts = String(host || '').split('.');
    if (parts.length <= 2) return host;
    // Two-label public suffixes that would otherwise collapse to the
    // suffix itself (co.uk, com.au...).
    const last2 = parts.slice(-2).join('.');
    if (/^(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(last2)) return parts.slice(-3).join('.');
    return last2;
  }

  /** Path with the apply/login/step tail removed, repeatedly. */
  function _basePath(pathname) {
    let p = String(pathname || '/').replace(/\/+$/, '') || '/';
    for (let i = 0; i < 4; i++) {
      const stripped = p.replace(new RegExp('/(?:' + [
        'apply', 'apply-now', 'applynow', 'application', 'applications',
        'submit', 'submission', 'candidate', 'candidates', 'register',
        'registration', 'login', 'signin', 'sign-in', 'signup', 'sign-up',
        'create-account', 'createaccount', 'new', 'start', 'form',
        'step\\d*', 'c',
      ].join('|') + ')$', 'i'), '');
      if (stripped === p) break;
      p = stripped || '/';
    }
    return p || '/';
  }

  /**
   * A stable identity for the POSTING behind a URL.
   * Requisition id when the URL carries one -- that is the same string on
   * the posting and on its apply page even when the paths diverge
   * completely -- otherwise the domain plus the de-applied path.
   */
  function keyFor(url) {
    const u = String(url || '');
    const AP = _ap();
    let id = '';
    try { id = (AP && AP.jobIdFromUrl && AP.jobIdFromUrl(u)) || ''; } catch (e) {}
    const host = _host(u);
    if (id) return 'id:' + _domain(host) + ':' + String(id).toLowerCase();
    let path = '/';
    try { path = new URL(u).pathname; } catch (e) {}
    return 'path:' + _domain(host) + ':' + _basePath(path).toLowerCase();
  }

  /** Does this page look like the application step rather than the posting? */
  function isApplicationPage(doc, url) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const u = String(url || (d && d.location && d.location.href) || '');
    if (APPLY_URL.test(u)) return true;
    if (!d) return false;
    try {
      // A form-heavy page with no description is an application page even
      // when the URL says nothing (Workday, iCIMS and SuccessFactors all
      // do this inside a single-page flow).
      const fields = d.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea').length;
      const files = d.querySelectorAll('input[type=file]').length;
      return (fields >= 6 || files >= 1) && _descLength(d) < 400;
    } catch (e) { return false; }
  }

  function _descLength(d) {
    const AP = _ap();
    let best = 0;
    try {
      const sels = (AP && AP.allDescriptionSelectors && AP.allDescriptionSelectors()) || ['main', 'article'];
      for (const s of sels) {
        try {
          const el = d.querySelector(s);
          if (el) best = Math.max(best, (el.textContent || '').trim().length);
        } catch (e) {}
      }
    } catch (e) {}
    return best;
  }

  // ---- storage ---------------------------------------------------------
  function _read() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (r) => {
          const list = (r && r[KEY]) || [];
          resolve(Array.isArray(list) ? list : []);
        });
      } catch (e) { resolve([]); }
    });
  }

  function _write(list) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [KEY]: list }, () => resolve(true)); }
      catch (e) { resolve(false); }
    });
  }

  function _fresh(list) {
    const now = Date.now();
    return list.filter((e) => e && e.at && (now - e.at) < TTL_MS);
  }

  /** How much a captured job is actually worth, for the no-downgrade rule. */
  function richness(job) {
    if (!job) return 0;
    let n = 0;
    n += Math.min(String(job.description || '').length, 6000) / 100;
    if (job.title) n += 5;
    if (job.company) n += 5;
    if (job.location) n += 2;
    if ((job.emails || []).length) n += 8;
    if ((job.keywords || []).length) n += 4;
    return n;
  }

  /**
   * Remember a posting. A thinner reading of the SAME posting never
   * replaces a richer one -- that rule is the whole point, because the
   * apply page is always the thinner reading.
   */
  async function capture(job, opts) {
    const o = opts || {};
    const url = o.url || (job && job.url) || '';
    if (!url) return null;
    const key = keyFor(url);
    const entry = {
      key,
      url,
      host: _host(url),
      tabId: (o.tabId === undefined || o.tabId === null) ? null : o.tabId,
      at: Date.now(),
      job: Object.assign({}, job, { url: (job && job.url) || url }),
    };
    const list = _fresh(await _read());
    const i = list.findIndex((e) => e.key === key);
    if (i !== -1) {
      const existing = list[i];
      if (richness(existing.job) > richness(entry.job)) {
        // Keep the richer capture, but let it follow the user's tab and
        // stay alive so the lineage match still finds it.
        existing.at = Date.now();
        if (entry.tabId !== null) existing.tabId = entry.tabId;
        await _write(list);
        return existing.job;
      }
      list.splice(i, 1);
    }
    list.unshift(entry);
    await _write(list.slice(0, MAX_ENTRIES));
    return entry.job;
  }

  /**
   * The posting behind this URL, if we have seen it.
   * Never returns a context belonging to a different employer: every path
   * requires either the same requisition id, the same tab within the
   * lineage window, or the same domain.
   */
  async function recall(url, opts) {
    const o = opts || {};
    const list = _fresh(await _read());
    if (!list.length) return null;
    const key = keyFor(url);
    const dom = _domain(_host(url));

    // 1. the same posting, by key (requisition id, or de-applied path)
    const exact = list.find((e) => e.key === key);
    if (exact) return Object.assign({}, exact.job, { _via: 'key' });

    // 2. the same tab, recently -- the user pressed Apply here
    if (o.tabId !== undefined && o.tabId !== null) {
      const now = Date.now();
      const sameTab = list.find((e) => e.tabId === o.tabId && (now - e.at) < TAB_LINEAGE_MS);
      // Cross-domain is legitimate here (a careers site handing off to an
      // ATS), and the tab is what ties them together.
      if (sameTab) return Object.assign({}, sameTab.job, { _via: 'tab' });
    }

    // 3. path lineage on the same domain: /jobs/123/apply under /jobs/123
    let path = '/';
    try { path = new URL(url).pathname.toLowerCase(); } catch (e) {}
    const under = list.filter((e) => {
      if (_domain(e.host) !== dom) return false;
      let p = '';
      try { p = new URL(e.url).pathname.toLowerCase().replace(/\/+$/, ''); } catch (e2) { return false; }
      return p && p !== '/' && path.indexOf(p) === 0;
    });
    if (under.length) {
      under.sort((a, b) => (b.at - a.at));
      return Object.assign({}, under[0].job, { _via: 'path' });
    }
    return null;
  }

  /**
   * The page's own reading, completed from the remembered posting.
   * The live page always wins where it actually has something; the
   * context only ever fills gaps. That ordering is what stops a stale
   * context from renaming the job the user is looking at.
   */
  function merge(fresh, remembered) {
    const f = fresh || {};
    const r = remembered || {};
    if (!remembered) return f;
    const pick = (a, b) => (String(a || '').trim() ? a : b);
    const out = Object.assign({}, r, f);
    out.title = pick(f.title, r.title);
    out.company = pick(f.company, r.company);
    out.location = pick(f.location, r.location);
    // The description is the field this whole module exists for: take
    // whichever is genuinely longer, since an apply page often carries a
    // one-line summary that would otherwise win by being non-empty.
    const fd = String(f.description || '');
    const rd = String(r.description || '');
    out.description = fd.length >= rd.length ? fd : rd;
    if (!(f.emails || []).length && (r.emails || []).length) out.emails = r.emails;
    if (!(f.keywords || []).length && (r.keywords || []).length) out.keywords = r.keywords;
    out.url = f.url || r.url;
    out._restoredFrom = r.url && r.url !== out.url ? r.url : undefined;
    out._via = r._via;
    return out;
  }

  /**
   * The one call the rest of the extension needs: given what this page
   * yields, return the best available picture of the job, and remember it.
   */
  async function reconcile(fresh, opts) {
    const o = opts || {};
    const url = o.url || (fresh && fresh.url) || '';
    const remembered = await recall(url, o);
    const merged = merge(fresh, remembered);
    if (url) await capture(merged, { url, tabId: o.tabId });
    return merged;
  }

  async function all() { return _fresh(await _read()); }
  function clear() { return _write([]); }

  global.JDContext = {
    keyFor, isApplicationPage, capture, recall, merge, reconcile, richness, all, clear,
    KEY, TTL_MS, TAB_LINEAGE_MS, APPLY_TAIL,
    _basePath, _domain,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.JDContext;
})(typeof window !== 'undefined' ? window : globalThis);
