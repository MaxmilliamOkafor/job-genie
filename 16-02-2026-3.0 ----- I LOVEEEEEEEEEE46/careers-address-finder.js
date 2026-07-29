/**
 * Job Genie - Published Recruiting Address Finder
 *
 * When a job posting carries no contact email, this looks for one the
 * employer PUBLISHED on their own website -- careers@, talent@,
 * recruiting@, jobs@ and friends. Those mailboxes exist precisely so
 * applicants can write to them, which is why this is a safe fallback:
 * every address it can return is one the company put on a public page
 * itself, aimed at candidates.
 *
 * It does NOT guess or construct addresses (no firstname.lastname@
 * pattern-building) and it does not look anybody up in a third-party
 * contact database. If the company published nothing, it returns nothing.
 *
 * Runs in the background service worker, which is the only context that
 * can fetch cross-origin pages.  window.CareersAddressFinder
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Careers]';

  // Mailboxes intended for candidates, best first.
  const CANDIDATE_LOCAL = [
    'recruiting', 'recruitment', 'talent', 'talentacquisition', 'careers',
    'career', 'jobs', 'job', 'hiring', 'apply', 'applications', 'hr',
    'people', 'resume', 'resumes', 'cv',
  ];
  const CANDIDATE_RE = new RegExp('^(' + CANDIDATE_LOCAL.join('|') + ')([._-]?[a-z]{0,12})?$', 'i');

  // Never contact these, even when published.
  const BLOCKED_LOCAL = /^(noreply|no-reply|donotreply|postmaster|abuse|privacy|legal|compliance|dpo|gdpr|security|press|media|investor|sales|marketing|billing|support|unsubscribe|webmaster)$/i;

  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;

  // ATS hosts are never the employer's own domain.
  const ATS_HOST = /(greenhouse|lever|ashbyhq|workday|myworkdayjobs|smartrecruiters|icims|taleo|jobvite|bamboohr|recruitee|jazzhr|workable|teamtailor|breezy|personio|rippling|successfactors|avature|eightfold|csod|brassring|linkedin|indeed|glassdoor)\./i;

  /**
   * The employer's own domain. ATS URLs encode the company slug
   * (job-boards.greenhouse.io/celonis/... -> celonis), which is a far more
   * reliable seed than the display name.
   */
  function guessDomains(companyName, jdUrl) {
    const out = [];
    const push = (d) => { if (d && out.indexOf(d) === -1) out.push(d); };

    const u = String(jdUrl || '');
    try {
      const parsed = new URL(u);
      if (!ATS_HOST.test(parsed.hostname)) {
        // Careers site on the employer's own domain.
        push(parsed.hostname.replace(/^(www|jobs|careers|apply|boards|job-boards)\./i, ''));
      } else {
        // ATS slug -> company.com is the overwhelmingly common case.
        const slug = (parsed.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
        if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) && slug !== 'embed') push(slug + '.com');
      }
    } catch (e) {}

    const name = String(companyName || '').toLowerCase()
      .replace(/\b(inc|llc|ltd|limited|gmbh|plc|corp|corporation|co|company|group|holdings|technologies|technology|labs|ai)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (name.length >= 3) { push(name + '.com'); push(name + '.io'); }
    return out.slice(0, 3);
  }

  function _score(email) {
    const parts = String(email).toLowerCase().split('@');
    const local = parts[0];
    if (!local || parts.length !== 2) return -1;
    if (BLOCKED_LOCAL.test(local)) return -1;
    const m = local.match(CANDIDATE_RE);
    if (!m) return -1;
    const idx = CANDIDATE_LOCAL.indexOf(m[1].toLowerCase());
    return 100 - (idx < 0 ? 50 : idx);   // earlier in the list = better
  }

  // Pages where a company publishes a candidate-facing mailbox.
  const PATHS = ['/careers', '/careers/contact', '/jobs', '/about/careers', '/contact', '/company/careers', '/'];

  async function _fetchText(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 6000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', credentials: 'omit' });
      if (!res.ok) return '';
      const type = res.headers.get('content-type') || '';
      if (!/text|html/i.test(type)) return '';
      const text = await res.text();
      return text.slice(0, 400000);
    } catch (e) {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }

  function _harvestFromHtml(html, domain) {
    const found = [];
    const seen = new Set();
    const consider = (raw) => {
      const e = String(raw || '').trim().replace(/^mailto:/i, '').split('?')[0];
      const key = e.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      // Only the employer's own domain -- avoids agency/vendor addresses
      // that appear in page footers.
      const host = key.split('@')[1] || '';
      const root = domain.split('.').slice(-2).join('.');
      if (!host.endsWith(root)) return;
      const score = _score(e);
      if (score > 0) found.push({ email: e, score });
    };

    // mailto: links are the strongest signal -- an explicit invitation.
    const mailtos = html.match(/mailto:[^"'>\s]+/gi) || [];
    for (const m of mailtos) consider(m);
    const plain = html.match(EMAIL_RE) || [];
    for (const p of plain) consider(p);

    found.sort((a, b) => b.score - a.score);
    return found;
  }

  /**
   * @returns {{email,source,candidates,domainsTried}} -- email is '' when
   * the company published nothing candidate-facing.
   */
  async function find({ companyName, jdUrl, maxPages } = {}) {
    const domains = guessDomains(companyName, jdUrl);
    const limit = maxPages || 4;
    const all = [];
    const tried = [];

    for (const domain of domains) {
      for (let i = 0; i < PATHS.length && tried.length < limit; i++) {
        const url = 'https://' + domain + PATHS[i];
        tried.push(url);
        const html = await _fetchText(url);
        if (!html) continue;
        const hits = _harvestFromHtml(html, domain);
        if (hits.length) {
          all.push(...hits.map((h) => Object.assign({}, h, { source: url })));
          // A mailto on the careers page is as good as it gets; stop early.
          if (hits[0].score >= 95) {
            all.sort((a, b) => b.score - a.score);
            return {
              email: all[0].email,
              source: all[0].source,
              candidates: all.slice(0, 5).map((x) => x.email),
              domainsTried: tried,
            };
          }
        }
      }
      if (all.length) break;
    }

    all.sort((a, b) => b.score - a.score);
    return {
      email: all.length ? all[0].email : '',
      source: all.length ? all[0].source : '',
      candidates: all.slice(0, 5).map((x) => x.email),
      domainsTried: tried,
    };
  }

  const CareersAddressFinder = { find, guessDomains, _score };
  global.CareersAddressFinder = CareersAddressFinder;
  if (typeof module !== 'undefined' && module.exports) module.exports = CareersAddressFinder;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
