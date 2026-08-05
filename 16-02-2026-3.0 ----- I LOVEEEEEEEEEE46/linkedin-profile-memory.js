/**
 * Job Genie - Remembers LinkedIn profiles you have looked at
 *
 * WHY THIS EXISTS
 *   To resolve a recruiter's email, a provider needs their LinkedIn
 *   handle. Reading it from the ACTIVE tab works, but it forces the
 *   profile to be open at the moment you tailor -- so you would have to
 *   go and open it, which is the manual step this is supposed to remove.
 *
 *   Job hunting already involves looking at recruiters' profiles. This
 *   notes the ones you visit, so that when you later apply to that
 *   company the handle is already known and the follow-up finds its
 *   recipient with nothing extra to do.
 *
 * WHAT IT READS, AND WHAT IT DOES NOT
 *   The handle comes from the URL of a page you navigated to yourself.
 *   The name and headline come from the rendered page you are looking at.
 *   Nothing here drives LinkedIn, opens tabs, follows links, or calls its
 *   internal (Voyager) APIs -- automated browsing at volume is what gets
 *   accounts restricted, and it is not worth an email address.
 *
 *   Everything stays in chrome.storage.local on this machine. No profile
 *   is sent anywhere; only a handle you already have is later passed to
 *   the enrichment provider you chose, and only if enrichment is on.
 *
 *   window.JGProfileMemory
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Profiles]';
  const KEY = 'linkedin_profiles_seen';
  const MAX = 200;                        // a few months of ordinary browsing
  const TTL_MS = 90 * 24 * 60 * 60 * 1000; // people change jobs; so do recruiters

  function _clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function currentHandle() {
    try {
      const m = String(location.href).match(/linkedin\.com\/in\/([^/?#]+)/i);
      if (!m) return '';
      const slug = _clean(decodeURIComponent(m[1]));
      // The opaque URN form is not a public handle and resolves to nothing.
      return /^ACo[A-Za-z0-9_-]+$/.test(slug) ? '' : slug;
    } catch (e) { return ''; }
  }

  // Name and headline as displayed. The headline is what makes a remembered
  // profile useful later: "Technical Recruiter at <employer>" is how a
  // profile gets matched to the company you are applying to.
  function readProfile() {
    const handle = currentHandle();
    if (!handle) return null;
    const pick = (sel) => {
      try {
        const el = document.querySelector(sel);
        return el ? _clean(el.textContent).slice(0, 200) : '';
      } catch (e) { return ''; }
    };
    const name = pick('h1')
      || _clean((document.title || '').split('|')[0]);
    const headline = pick('.text-body-medium.break-words')
      || pick('[data-generated-suggestion-target] .text-body-medium')
      || pick('.top-card-layout__headline');
    const location_ = pick('.text-body-small.inline.t-black--light.break-words')
      || pick('.top-card__subline-item');
    return {
      handle,
      name: name.slice(0, 80),
      headline: headline.slice(0, 160),
      location: location_.slice(0, 80),
      at: Date.now(),
    };
  }

  function remember(entry) {
    if (!entry || !entry.handle) return;
    try {
      chrome.storage.local.get([KEY], (r) => {
        const all = (r && r[KEY]) || {};
        // Re-visiting refreshes the record rather than duplicating it, and
        // keeps whatever detail an earlier visit captured that this one
        // missed (LinkedIn renders the headline late).
        const prev = all[entry.handle] || {};
        all[entry.handle] = {
          handle: entry.handle,
          name: entry.name || prev.name || '',
          headline: entry.headline || prev.headline || '',
          location: entry.location || prev.location || '',
          at: entry.at,
        };
        const keys = Object.keys(all);
        // Evict the stalest first, not an arbitrary key.
        if (keys.length > MAX) {
          keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
          for (const k of keys.slice(0, keys.length - MAX)) delete all[k];
        }
        chrome.storage.local.set({ [KEY]: all }, () => {});
      });
    } catch (e) {}
  }

  /**
   * Remembered profiles whose headline names this employer, best first.
   * Callable from the popup, where `document` is the popup's own -- so it
   * reads storage only and never the page.
   */
  function forCompany(company, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const wanted = _clean(company).toLowerCase();
      if (!wanted) { resolve([]); return; }
      try {
        chrome.storage.local.get([KEY], (r) => {
          const all = (r && r[KEY]) || {};
          const now = Date.now();
          const hits = Object.values(all)
            .filter((p) => p && p.handle && (now - (p.at || 0) < TTL_MS))
            .filter((p) => String(p.headline || '').toLowerCase().indexOf(wanted) !== -1)
            .map((p) => {
              let score = 0;
              const h = String(p.headline || '').toLowerCase();
              // Someone who recruits for them, not just anyone who works there.
              if (/recruit|talent acquisition|talent partner/.test(h)) score += 30;
              if (/people|hr\b|human resources/.test(h)) score += 15;
              if (/head|lead|manager|director/.test(h)) score += 5;
              if (/sales|business development|account executive/.test(h)) score -= 25;
              // A profile looked at recently is more likely to be the one
              // that belongs to this application.
              score += Math.max(0, 10 - Math.floor((now - p.at) / (7 * 24 * 3600 * 1000)));
              return Object.assign({}, p, { score });
            })
            .sort((a, b) => b.score - a.score);
          resolve(hits.slice(0, o.limit || 3));
        });
      } catch (e) { resolve([]); }
    });
  }

  function forget() {
    return new Promise((resolve) => {
      try { chrome.storage.local.remove([KEY], () => resolve(true)); } catch (e) { resolve(false); }
    });
  }

  global.JGProfileMemory = { readProfile, remember, forCompany, forget, currentHandle, KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.JGProfileMemory;

  // Content-script side: record the profile being viewed. LinkedIn is a
  // single-page app, so the name and headline are usually not in the DOM
  // yet at document_idle, and navigating between profiles fires no page
  // load at all. Re-read on a short delay and whenever the path changes.
  try {
    if (typeof document !== 'undefined' && /linkedin\.com\/in\//i.test(location.href)) {
      const capture = () => { const p = readProfile(); if (p) remember(p); };
      capture();
      setTimeout(capture, 1500);
      setTimeout(capture, 4000);

      let lastPath = location.pathname;
      setInterval(() => {
        if (location.pathname === lastPath) return;
        lastPath = location.pathname;
        if (/\/in\//i.test(location.pathname)) { setTimeout(capture, 1200); }
      }, 1000);
      console.log(TAG, 'ready');
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
