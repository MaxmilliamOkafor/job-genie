/**
 * Job Genie - Published contact sources on a job page
 *
 * WHY THIS EXISTS
 *   jd-contact-extractor.js scores addresses found in the job's TEXT. That
 *   misses three places employers routinely publish a contact, none of
 *   which appear in visible prose:
 *
 *     1. mailto: links       - an address deliberately made clickable,
 *                              often behind wording like "questions?" with
 *                              the address itself never rendered as text.
 *     2. JSON-LD JobPosting  - schema.org structured data that most ATS
 *                              emit for Google Jobs. It can carry
 *                              applicationContact, hiringOrganization and
 *                              a recruiter name, in machine-readable form.
 *     3. LinkedIn job poster - the "Meet the hiring team" card names the
 *                              human who posted the role.
 *
 *   All three are data the employer chose to publish. Nothing here guesses,
 *   pattern-builds, or looks anything up in a third-party database: no
 *   address is produced that the page did not already contain, and the
 *   LinkedIn card yields a NAME only, never an address.
 *
 * Runs in the page (content-script context). Pure DOM reads, no network.
 *   window.JDContactSources.harvest() -> { emails:[], names:[], org, jobId }
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Sources]';

  function _clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  // ---- 1. mailto: links -------------------------------------------------
  // The surrounding text is captured too: "Questions? Email Aoife" tells the
  // scorer this is a human contact rather than a legal inbox.
  function fromMailtoLinks(doc) {
    const out = [];
    try {
      for (const a of doc.querySelectorAll('a[href^="mailto:"]')) {
        const raw = a.getAttribute('href') || '';
        const addr = _clean(raw.slice(7).split('?')[0]);
        if (!addr || addr.indexOf('@') === -1) continue;
        const ctx = _clean((a.textContent || '') + ' ' + _clean(a.parentElement && a.parentElement.textContent).slice(0, 160));
        out.push({ email: addr, context: ctx, source: 'mailto' });
      }
    } catch (e) {}
    return out;
  }

  // ---- 2. schema.org JobPosting ----------------------------------------
  // Emitted by most ATS so the role appears in Google Jobs. Structured, so
  // no parsing guesswork.
  function _walkJsonLd(node, hits) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => _walkJsonLd(n, hits)); return; }
    const type = String(node['@type'] || '').toLowerCase();
    if (type.indexOf('jobposting') !== -1) hits.push(node);
    for (const k of Object.keys(node)) {
      if (node[k] && typeof node[k] === 'object') _walkJsonLd(node[k], hits);
    }
  }

  function fromJsonLd(doc) {
    const emails = [];
    const names = [];
    let org = '';
    let orgUrl = '';
    let jobId = '';
    try {
      for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
        let data;
        try { data = JSON.parse(el.textContent || ''); } catch (e) { continue; }
        const hits = [];
        _walkJsonLd(data, hits);
        for (const p of hits) {
          const ho = p.hiringOrganization;
          if (!org) org = _clean(typeof ho === 'string' ? ho : (ho && ho.name));
          // The employer's OWN website, which most ATS emit for Google
          // Jobs. On a Greenhouse or Workday posting the page's own host
          // is the ATS vendor's, shared by thousands of employers, so this
          // is the only structured way to learn whose mail domain to
          // prefer for this application.
          if (!orgUrl && ho && typeof ho === 'object') {
            const same = Array.isArray(ho.sameAs) ? ho.sameAs[0] : ho.sameAs;
            orgUrl = _clean(ho.url || same);
          }
          if (!jobId) {
            jobId = _clean(p.identifier && (typeof p.identifier === 'string' ? p.identifier : p.identifier.value));
          }
          // applicationContact / contactPoint carry a real address when present.
          for (const key of ['applicationContact', 'contactPoint', 'author', 'recruiter']) {
            const c = p[key];
            if (!c) continue;
            const list = Array.isArray(c) ? c : [c];
            for (const item of list) {
              if (typeof item === 'string') continue;
              const em = _clean(item && item.email);
              if (em && em.indexOf('@') !== -1) {
                emails.push({ email: em, context: _clean(item.name) + ' ' + key, source: 'json-ld' });
              }
              const nm = _clean(item && item.name);
              if (nm && /^[A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+){1,2}$/.test(nm)) names.push({ name: nm, source: 'json-ld' });
            }
          }
        }
      }
    } catch (e) {}
    return { emails, names, org, orgUrl, jobId };
  }

  // ---- 3. LinkedIn job poster ------------------------------------------
  // "Meet the hiring team" names the person who posted the role. This is a
  // NAME source only -- LinkedIn never publishes the address, and this
  // module will not construct one.
  //
  // The public profile slug from the card's own href is captured alongside
  // the name. It is not an address and is not treated as one; it is the
  // handle a user's own enrichment provider needs in order to look this
  // person up under their own account, and without it the only fallback is
  // a company-wide guess at who might be handling the role.
  function _profileSlug(href) {
    const m = String(href || '').match(/\/in\/([^/?#]+)/);
    if (!m) return '';
    const slug = _clean(decodeURIComponent(m[1]));
    // Reject LinkedIn's opaque URN form: it is not a public profile handle.
    return /^ACo[A-Za-z0-9_-]+$/.test(slug) ? '' : slug;
  }

  function fromLinkedInPoster(doc) {
    const names = [];
    try {
      const cards = doc.querySelectorAll(
        '.hirer-card__hirer-information, [class*="hirer-card"], [data-test-id*="hirer"], .jobs-poster__name'
      );
      for (const card of cards) {
        const anchor = card.querySelector('a[href*="/in/"]');
        const link = anchor || card;
        const txt = _clean(link.textContent).split('•')[0].trim();
        // A person's name, not a job title or a sentence.
        if (/^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(txt) && txt.length <= 60) {
          const entry = { name: txt, source: 'linkedin-poster' };
          const slug = _profileSlug(anchor && anchor.getAttribute('href'));
          if (slug) entry.profile = slug;
          // The line under the name is usually their title, which tells the
          // scorer whether this is a recruiter or the hiring manager.
          const sub = card.querySelector('.hirer-card__hirer-job-title, [class*="job-title"], [class*="subtitle"]');
          if (sub) entry.title = _clean(sub.textContent).slice(0, 120);
          names.push(entry);
        }
      }
    } catch (e) {}
    return names;
  }

  // ---- 3b. any LinkedIn profile the posting itself links to -------------
  // The hiring-team card is a LinkedIn-only feature, but employers link a
  // named recruiter's profile from ATS postings too: "questions? reach out
  // to <a href="linkedin.com/in/aoifebyrne">Aoife</a>". That is a person
  // the employer chose to point at, and the handle is what a lookup needs.
  //
  // Deliberately narrow: only profile links inside the posting, never the
  // page's own navigation or share widgets, which link the COMPANY page or
  // the reader's own profile rather than anybody involved in hiring.
  function fromProfileLinks(doc) {
    const out = [];
    const SKIP = /(share|nav|header|footer|cookie|banner|menu|social|follow)/i;
    try {
      for (const a of doc.querySelectorAll('a[href*="linkedin.com/in/"], a[href^="/in/"]')) {
        const href = a.getAttribute('href') || '';
        const slug = _profileSlug(href);
        if (!slug) continue;
        // Walk a little way up looking for a reason to reject this link.
        let skip = false;
        let node = a;
        for (let i = 0; i < 4 && node; i++) {
          const id = (node.getAttribute && (node.getAttribute('id') || '')) || '';
          const cls = (node.getAttribute && (node.getAttribute('class') || '')) || '';
          const role = (node.getAttribute && (node.getAttribute('role') || '')) || '';
          if (SKIP.test(id + ' ' + cls + ' ' + role) || /^(nav|header|footer)$/i.test(node.tagName || '')) {
            skip = true; break;
          }
          node = node.parentElement;
        }
        if (skip) continue;
        const txt = _clean(a.textContent).slice(0, 60);
        const entry = { name: txt, source: 'profile-link', profile: slug };
        // The link text is often the person's name, but it is just as often
        // "LinkedIn" or the URL. Keep the handle either way; only claim a
        // name when it reads like one.
        if (!/^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(txt)) entry.name = '';
        out.push(entry);
      }
    } catch (e) {}
    return out;
  }

  // ---- 4. meta tags -----------------------------------------------------
  function fromMeta(doc) {
    const out = { org: '', emails: [] };
    try {
      const og = doc.querySelector('meta[property="og:site_name"]');
      if (og) out.org = _clean(og.getAttribute('content'));
      for (const m of doc.querySelectorAll('meta[name="reply-to"], meta[name="email"], meta[property="article:author"]')) {
        const v = _clean(m.getAttribute('content'));
        if (v && v.indexOf('@') !== -1) out.emails.push({ email: v, context: 'meta', source: 'meta' });
      }
    } catch (e) {}
    return out;
  }

  /**
   * Everything the PAGE publishes. Ordered by how directly the employer
   * offered it as a contact route, which is the order the scorer should
   * prefer when two sources disagree.
   */
  function harvest(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return { emails: [], names: [], org: '', orgUrl: '', jobId: '' };

    const ld = fromJsonLd(d);
    const meta = fromMeta(d);
    const emails = []
      .concat(fromMailtoLinks(d))       // explicitly made clickable
      .concat(ld.emails)                // declared as the application contact
      .concat(meta.emails);

    // De-duplicate, keeping the earliest (highest-intent) source.
    const seen = new Set();
    const uniqueEmails = [];
    for (const e of emails) {
      const k = e.email.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueEmails.push(e);
    }

    const names = [].concat(ld.names).concat(fromLinkedInPoster(d)).concat(fromProfileLinks(d));
    // De-duplicate on the handle where there is one, otherwise the name:
    // the same recruiter often appears both in the hiring card and as a
    // link in the body, and a nameless profile link is still useful.
    const seenN = new Set();
    const uniqueNames = names.filter((n) => {
      const k = (n.profile || n.name || '').toLowerCase();
      if (!k || seenN.has(k)) return false;
      seenN.add(k);
      return true;
    });

    return {
      emails: uniqueEmails,
      names: uniqueNames,
      org: ld.org || meta.org || '',
      orgUrl: ld.orgUrl || '',
      jobId: ld.jobId || '',
    };
  }

  global.JDContactSources = { harvest, fromMailtoLinks, fromJsonLd, fromLinkedInPoster, fromProfileLinks, fromMeta };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.JDContactSources;
  try { console.log(TAG, 'ready'); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
