/**
 * Job Genie - Contact enrichment (opt-in, key-based)
 *
 * WHERE THIS SITS IN THE CHAIN
 *   1. jd-contact-extractor.js  - addresses printed in the posting's text
 *   2. jd-contact-sources.js    - mailto: links, JSON-LD applicationContact,
 *                                 LinkedIn "meet the hiring team" poster
 *   3. background careers-page  - the employer's own published careers inbox
 *   4. THIS FILE                - a lookup through a provider the user has
 *                                 an account with
 *
 *   Steps 1-3 are things the employer PUBLISHED. This runs only when all
 *   three came back empty, which is most Workday and Taleo roles. An
 *   enriched address NEVER outranks a published one: if the employer
 *   printed an address, that is the address they want used.
 *
 * KEYS
 *   Every provider here authenticates the user to THEIR OWN account, using
 *   that provider's own API. Nothing is scraped, derived, or lifted from
 *   another extension's session, and no LinkedIn internal (Voyager)
 *   endpoint is touched -- that is what gets a LinkedIn account restricted.
 *
 *   Two shapes of credential, both handled:
 *     - issued keys  (ContactOut, Hunter, Apollo): the user generates a key
 *       in their provider dashboard and pastes it in, as with the Gmail
 *       client ID.
 *     - minted tokens (Closely): Closely publishes no dashboard key, but
 *       its API issues a bearer token to an account holder at
 *       /v1/login/check. createKey() performs that exchange with the user's
 *       own Closely login, stores ONLY the returned tokens, and refreshes
 *       them at /v1/login/refresh when they expire. The password is used
 *       for exactly one request and is never written to storage.
 *
 * WHAT THE USER SHOULD KNOW, AND THE UI SAYS
 *   An enriched address is a business email obtained from a data provider,
 *   not one the recipient gave you. In the EU that needs a lawful basis
 *   under GDPR and the obligation sits with the sender. Off by default.
 *
 *   window.ContactEnrichment
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Enrich]';
  const KEY_CFG = 'enrichment_config';     // { provider, enabled, keys:{ id:{...} } }
  const KEY_CACHE = 'enrichment_cache';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // a week; people change jobs
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

  function _clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // The public handle out of a LinkedIn URL. Rejects the opaque URN form,
  // which is not a public handle and resolves to nothing.
  function _profileSlugFromUrl(url) {
    const m = String(url || '').match(/\/in\/([^/?#]+)/);
    if (!m) return '';
    const slug = _clean(decodeURIComponent(m[1]));
    return /^ACo[A-Za-z0-9_-]+$/.test(slug) ? '' : slug;
  }

  // A provider that has no address for someone still returns a row. These
  // are placeholders, not addresses, and must never reach a recruiter.
  const PLACEHOLDER_RE = /^(email_not_unlocked|not_unlocked|locked|hidden|unavailable|domain_only|SEARCH)@|^(SEARCH|LOCKED)$/i;
  function isRealEmail(v) {
    const e = _clean(v);
    if (!e || e.indexOf('@') === -1) return false;
    if (PLACEHOLDER_RE.test(e)) return false;
    return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
  }

  // ---- targeting --------------------------------------------------------
  // The point of using the JD's own context: "recruiter at Nortal in Dublin"
  // reaches someone who can act on THIS application, where a bare company
  // lookup returns whoever the provider ranks first, usually a salesperson.
  //
  // Tiers are tried in order and the search stops at the first tier that
  // returns anyone, so a talent partner is preferred over an HR mailbox.
  const TITLE_TIERS = [
    ['Technical Recruiter', 'Talent Acquisition Partner', 'Talent Acquisition Specialist',
     'Recruiting Manager', 'Recruiter'],
    ['Talent Acquisition', 'Talent Partner', 'People Partner', 'Head of Talent'],
    ['Head of People', 'HR Manager', 'People Operations', 'HR Business Partner'],
  ];

  // The hiring manager for the role's own function, as a later fallback: on
  // a small team the manager is the person actually reading applications.
  function functionTitles(roleTitle) {
    const t = String(roleTitle || '').toLowerCase();
    if (/data scien|machine learning|\bml\b|\bai\b|analytics/.test(t)) return ['Head of Data', 'Data Science Manager', 'Analytics Manager'];
    if (/engineer|developer|software|devops|platform/.test(t)) return ['Engineering Manager', 'Head of Engineering', 'VP Engineering'];
    if (/product manager|product owner|\bproduct\b/.test(t)) return ['Head of Product', 'Product Director'];
    if (/project manager|programme|program manager|delivery|scrum/.test(t)) return ['Head of Delivery', 'Programme Director', 'PMO Manager'];
    if (/design|\bux\b|\bui\b/.test(t)) return ['Head of Design', 'Design Director'];
    if (/market/.test(t)) return ['Head of Marketing', 'Marketing Director'];
    if (/sales|account exec/.test(t)) return ['Sales Director', 'Head of Sales'];
    if (/finance|account(ant|ing)/.test(t)) return ['Finance Director', 'Head of Finance'];
    return [];
  }

  /**
   * The ordered set of searches to run for one job posting. Company is
   * required -- without it there is nothing to scope a search to, and an
   * unscoped search returns a stranger.
   */
  function buildQueries(ctx) {
    const company = _clean(ctx && ctx.company);
    if (!company) return [];
    const location = _clean(ctx && ctx.location);
    const domain = _clean(ctx && ctx.domain);
    const base = { company, location, domain };
    const out = TITLE_TIERS.map((titles) => Object.assign({}, base, { titles }));

    const fn = functionTitles(ctx && ctx.title);
    if (fn.length) out.push(Object.assign({}, base, { titles: fn }));

    // Last attempt with the location filter dropped: the recruiter for a
    // Dublin role often sits in another office, and an over-tight filter
    // returns nothing rather than the right person.
    if (location) {
      out.push(Object.assign({}, base, { titles: TITLE_TIERS[0].concat(TITLE_TIERS[1]), location: '' }));
    }
    return out;
  }

  // How well a returned person matches what we asked for. Providers rank by
  // their own relevance, which is not ours -- a "Sales Recruiter" and a
  // "Technical Recruiter" both match "recruiter", and only one of them will
  // read this application.
  function scoreCandidate(person, q, ctx) {
    const title = String(person.title || '').toLowerCase();
    const loc = String(person.location || '').toLowerCase();
    let s = 0;

    for (let tier = 0; tier < TITLE_TIERS.length; tier++) {
      if (TITLE_TIERS[tier].some((t) => title.indexOf(t.toLowerCase()) !== -1)) {
        s += 30 - tier * 8;                       // tier 0 is the best match
        break;
      }
    }
    if (/talent|recruit/.test(title)) s += 10;
    if (/head|lead|manager|director|principal|senior/.test(title)) s += 4;
    // A sourcer or a sales rep with "recruitment" in the title is noise.
    if (/sales|business development|account executive|partnerships/.test(title)) s -= 25;
    if (/intern\b|assistant/.test(title)) s -= 6;

    const wantLoc = String((q && q.location) || (ctx && ctx.location) || '').toLowerCase();
    if (wantLoc && loc) {
      const token = wantLoc.split(/[,/]/)[0].trim();
      if (token && loc.indexOf(token) !== -1) s += 12;
    }
    // Providers that report their own confidence: fold it in, scaled well
    // below the title signal so a confident wrong person never wins.
    if (typeof person.confidence === 'number') s += Math.round(person.confidence / 10);
    if (person.verified) s += 5;
    return s;
  }

  // ---- providers --------------------------------------------------------
  // Each entry declares: how a search request is built, how a response maps
  // to { name, title, company, location, email, confidence }, and how its
  // credential is obtained and tested. Adding a provider is adding an entry.
  const PROVIDERS = {
    hunter: {
      label: 'Hunter.io',
      keyKind: 'api-key',
      keyUrl: 'https://hunter.io/api-keys',
      hint: 'Dashboard -> API -> API Keys. Free tier includes lookups each month.',
      // Hunter searches by company or domain and can filter to the HR
      // department directly, which is exactly the population we want.
      request: (q, cred) => {
        const p = new URLSearchParams();
        if (q.domain) p.set('domain', q.domain); else p.set('company', q.company);
        p.set('department', 'hr');
        p.set('limit', '10');
        p.set('api_key', cred.apiKey);
        return { url: 'https://api.hunter.io/v2/domain-search?' + p.toString(), init: { method: 'GET' } };
      },
      parse: (json) => {
        const d = (json && json.data) || {};
        return ((d.emails) || []).map((e) => ({
          name: _clean([e.first_name, e.last_name].filter(Boolean).join(' ')),
          title: _clean(e.position),
          company: _clean(d.organization),
          location: '',
          email: _clean(e.value),
          confidence: typeof e.confidence === 'number' ? e.confidence : undefined,
          verified: e.verification && e.verification.status === 'valid',
        }));
      },
      test: (cred) => ({
        url: 'https://api.hunter.io/v2/account?api_key=' + encodeURIComponent(cred.apiKey),
        init: { method: 'GET' },
      }),
    },

    contactout: {
      label: 'ContactOut',
      keyKind: 'api-key',
      keyUrl: 'https://contactout.com/dashboard/api',
      hint: 'Dashboard -> API. Searches LinkedIn profiles by company, role and '
        + 'location, then resolves verified work emails.',
      // v1, not v2, and the key travels in a `token` header. ContactOut also
      // accepts x-api-key on some endpoints, so both are sent -- an ignored
      // header costs nothing, and a wrong one costs every lookup.
      // Accept is required or the API can answer with a non-JSON body.
      request: (q, cred) => ({
        url: 'https://api.contactout.com/v1/people/search',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            token: cred.apiKey,
            'x-api-key': cred.apiKey,
          },
          body: JSON.stringify({
            company: q.company ? [q.company] : undefined,
            job_title: q.titles,
            location: q.location ? [q.location] : undefined,
            // People who hold the title NOW. Without this the search happily
            // returns someone who was a recruiter there four years ago, and
            // the note goes to a stranger at a company they have left.
            current_titles_only: true,
            // Filtered at the source rather than only penalised in scoring:
            // a sales rep whose title contains "talent" is pure noise here.
            exclude_job_titles: ['Sales', 'Business Development', 'Account Executive'],
            reveal_info: true,
            page: 1,
          }),
        },
      }),
      parse: (json) => {
        const rows = (json && (json.profiles || json.data || json.results)) || [];
        // The search answers with an object keyed by profile id as often as
        // with an array.
        const list = Array.isArray(rows) ? rows : Object.values(rows);
        return list.map((p) => {
          const ci = p.contact_info || p.contactInfo || p;
          const pick = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
          // Work addresses first: a personal Gmail is both less likely to be
          // read for a job and less welcome to receive it there.
          const emails = []
            .concat(pick(ci.work_emails), pick(ci.work_email))
            .concat(pick(ci.emails), pick(ci.email))
            .filter(Boolean);
          return {
            name: _clean(p.full_name || p.name),
            title: _clean(p.title || p.job_title || p.headline),
            company: _clean(typeof p.company === 'string' ? p.company : (p.company && p.company.name))
              || _clean(p.company_name),
            location: _clean(p.location),
            email: _clean(emails[0]),
            // Kept so a result with no inline address can still be resolved
            // through the profile endpoint, which returns a VERIFIED work
            // address. See _resolveProfiles.
            profile: _clean(p.li_vanity || p.linkedin_vanity)
              || _profileSlugFromUrl(p.linkedin_url || p.li_url || p.url),
          };
        });
      },
      // ContactOut can also resolve a single LinkedIn profile, which means
      // it covers BOTH cases on its own: the named job poster where the
      // page has a hiring-team card, and a company search where it does
      // not. That is why it is the default.
      // email_type=work is required -- without it the response carries no
      // real-time verified work address, which is the only kind worth
      // writing to about a job.
      lookupByProfile: (slug, cred) => ({
        url: 'https://api.contactout.com/v1/people/linkedin?profile='
          + encodeURIComponent('https://www.linkedin.com/in/' + slug)
          + '&email_type=work',
        init: {
          method: 'GET',
          headers: { Accept: 'application/json', token: cred.apiKey, 'x-api-key': cred.apiKey },
        },
      }),
      parseProfile: (json) => {
        const p = (json && (json.profile || json.data || json)) || {};
        const ci = p.contact_info || p.contactInfo || p;
        const pick = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
        const emails = []
          .concat(pick(ci.work_email), pick(ci.work_emails))
          .concat(pick(ci.email), pick(ci.emails))
          .filter(Boolean);
        const company = typeof p.company === 'string'
          ? p.company : _clean(p.company && p.company.name);
        return emails.map((em) => ({
          name: _clean(p.full_name || p.name),
          title: _clean(p.title || p.headline),
          company,
          location: _clean(p.location),
          email: _clean(em),
        }));
      },
      test: (cred) => ({
        url: 'https://api.contactout.com/v1/stats',
        init: {
          method: 'GET',
          headers: { Accept: 'application/json', token: cred.apiKey, 'x-api-key': cred.apiKey },
        },
      }),
    },

    apollo: {
      label: 'Apollo.io',
      keyKind: 'api-key',
      keyUrl: 'https://app.apollo.io/#/settings/integrations/api',
      hint: 'Settings -> Integrations -> API. Basic plans must use the api_search endpoint.',
      request: (q, cred) => ({
        // api_search, not search: /mixed_people/search returns 403 on Basic.
        url: 'https://api.apollo.io/api/v1/mixed_people/api_search',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': cred.apiKey },
          body: JSON.stringify({
            q_organization_name: q.company || undefined,
            person_titles: q.titles,
            person_locations: q.location ? [q.location] : undefined,
            page: 1,
            per_page: 10,
          }),
        },
      }),
      parse: (json) => {
        const list = (json && (json.people || json.contacts)) || [];
        return list.map((p) => ({
          name: _clean(p.name || [p.first_name, p.last_name].filter(Boolean).join(' ')),
          title: _clean(p.title),
          company: _clean(p.organization && p.organization.name),
          location: _clean([p.city, p.country].filter(Boolean).join(', ')),
          // Apollo returns a masked placeholder unless the record is
          // unlocked; isRealEmail() drops those rather than mailing them.
          email: _clean(p.email),
        }));
      },
      test: (cred) => ({
        url: 'https://api.apollo.io/api/v1/auth/health',
        init: { method: 'GET', headers: { 'x-api-key': cred.apiKey } },
      }),
    },

    closely: {
      label: 'Closely',
      keyKind: 'account',            // no dashboard key: the API mints one
      keyUrl: 'https://app.closelyhq.com/',
      hint: 'Closely publishes no dashboard API key. Sign in with your Closely '
        + 'account below and Job Genie exchanges it for an API token through '
        + "Closely's own login endpoint. Your password is used once and never stored.",
      // Closely resolves a contact FROM a LinkedIn profile, not from a
      // company+title search, so it is only usable when a LinkedIn profile
      // for the poster is known. jd-contact-sources.js supplies that from
      // the "meet the hiring team" card; without it Closely has nothing to
      // look up, and lookupByProfile() is used instead of request().
      searchByCompany: false,
      lookupByProfile: (slug, cred) => ({
        url: 'https://api.closelyhq.com/explorer/contacts/find',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Bearer ' + cred.token,
          },
          body: 'lid[]=' + encodeURIComponent(slug) + '&contact[]=email&contact[]=phone',
        },
      }),
      parseProfile: (json) => {
        const entries = (json && json.data && json.data.entries) || [];
        const out = [];
        for (const e of entries) {
          for (const em of (e.emails || [])) {
            out.push({
              name: _clean(e.full_name || [e.first_name, e.last_name].filter(Boolean).join(' ')),
              title: _clean(e.title || e.headline),
              company: _clean(e.company),
              location: _clean(e.location),
              email: _clean(em),
            });
          }
        }
        return out;
      },
      // Closely's own login endpoint, the same one its extension uses.
      createKey: (creds) => ({
        url: 'https://api.closelyhq.com/v1/login/check',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: creds.email, password: creds.password }),
        },
      }),
      parseKey: (json) => (json && json.token
        ? { token: json.token, refreshToken: json.refresh_token || '', at: Date.now() }
        : null),
      refreshKey: (cred) => ({
        url: 'https://api.closelyhq.com/v1/login/refresh',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: cred.refreshToken }),
        },
      }),
      test: (cred) => ({
        url: 'https://api.closelyhq.com/credits/',
        init: { method: 'GET', headers: { Authorization: 'Bearer ' + cred.token } },
      }),
      parseTest: (json) => {
        const d = (json && json.data) || {};
        const bal = (+d.paid_balance || 0) + (+d.free_balance || 0);
        return { detail: bal ? bal + ' credit(s) available' : 'connected' };
      },
    },
  };

  function listProviders() {
    return Object.keys(PROVIDERS).map((id) => ({
      id,
      label: PROVIDERS[id].label,
      keyKind: PROVIDERS[id].keyKind,
      keyUrl: PROVIDERS[id].keyUrl || '',
      hint: PROVIDERS[id].hint || '',
      searchByCompany: PROVIDERS[id].searchByCompany !== false,
    }));
  }

  // ---- config -----------------------------------------------------------
  // Credentials are per provider, so switching providers does not discard a
  // key the user pasted earlier.
  function loadConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_CFG], (r) => {
          const c = (r && r[KEY_CFG]) || {};
          if (!c.keys) c.keys = {};
          resolve(c);
        });
      } catch (e) { resolve({ keys: {} }); }
    });
  }

  function _writeConfig(next) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [KEY_CFG]: next }, () => resolve(true)); }
      catch (e) { resolve(false); }
    });
  }

  async function saveConfig(patch) {
    const prev = await loadConfig();
    const next = Object.assign({}, prev, patch || {});
    next.keys = Object.assign({}, prev.keys, (patch && patch.keys) || {});
    return _writeConfig(next);
  }

  /** Store a pasted key for one provider. Never touches the others. */
  async function saveKey(providerId, cred) {
    const cfg = await loadConfig();
    const id = providerId || cfg.provider || 'contactout';
    const clean = Object.assign({}, cred);
    if (clean.apiKey) clean.apiKey = _clean(clean.apiKey);
    delete clean.password;                        // never persisted, ever
    cfg.keys[id] = Object.assign({}, cfg.keys[id], clean);
    // Saving a key must NOT silently repoint the active provider: adding a
    // Hunter key as backup would otherwise demote the Closely account the
    // user chose to lead with. The provider is set where it is chosen, in
    // the dropdown. Only seed it when nothing has been chosen at all.
    if (!cfg.provider) cfg.provider = id;
    await _writeConfig(cfg);
    return true;
  }

  async function clearKey(providerId) {
    const cfg = await loadConfig();
    delete cfg.keys[providerId];
    await _writeConfig(cfg);
    return true;
  }

  async function getCred(providerId) {
    const cfg = await loadConfig();
    return (cfg.keys && cfg.keys[providerId]) || null;
  }

  function hasCred(cred, provider) {
    if (!cred) return false;
    return provider.keyKind === 'account' ? !!cred.token : !!cred.apiKey;
  }

  // ---- key creation (account-style providers) ---------------------------
  /**
   * Exchange the user's own provider login for an API token. Only Closely
   * needs this; key-style providers just store what the user pasted.
   *
   * The password is a parameter and a request body and nothing else: it is
   * never written to chrome.storage, never logged, and never retained after
   * this call returns.
   */
  async function createKey(providerId, creds) {
    const provider = PROVIDERS[providerId];
    if (!provider) return { ok: false, reason: 'unknown-provider' };
    if (provider.keyKind !== 'account' || !provider.createKey) {
      return { ok: false, reason: 'not-applicable', message: provider.label + ' issues keys from its own dashboard.' };
    }
    if (!creds || !creds.email || !creds.password) {
      return { ok: false, reason: 'missing-credentials', message: 'Enter your ' + provider.label + ' email and password.' };
    }
    try {
      const req = provider.createKey(creds);
      const res = await fetch(req.url, req.init);
      const json = await res.json().catch(() => null);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: 'bad-credentials', message: 'Sign-in rejected by ' + provider.label + '.' };
      }
      if (!res.ok) {
        return { ok: false, reason: 'http-' + res.status, message: _clean(json && json.message) || (provider.label + ' returned HTTP ' + res.status) };
      }
      const cred = provider.parseKey(json);
      if (!cred) {
        return { ok: false, reason: 'no-token', message: _clean(json && json.message) || 'No token returned.' };
      }
      // The account address is stored alongside the token so the UI can say
      // WHICH account is connected. It is the user's own address, not a
      // secret, and without it a connected state is unverifiable at a
      // glance. The password is not part of `cred` and never will be.
      await saveKey(providerId, Object.assign({}, cred, { accountEmail: _clean(creds.email) }));
      log('key created for', providerId);
      return { ok: true, message: provider.label + ' connected. Token stored on this device only.' };
    } catch (e) {
      return { ok: false, reason: 'network', message: 'Could not reach ' + provider.label + '.' };
    }
  }

  /** Closely's tokens expire; renew silently rather than failing a lookup. */
  async function refreshCred(providerId, cred) {
    const provider = PROVIDERS[providerId];
    if (!provider || !provider.refreshKey || !cred || !cred.refreshToken) return null;
    try {
      const req = provider.refreshKey(cred);
      const res = await fetch(req.url, req.init);
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const next = provider.parseKey(json);
      if (!next) return null;
      if (!next.refreshToken) next.refreshToken = cred.refreshToken;
      await saveKey(providerId, next);
      return next;
    } catch (e) { return null; }
  }

  /**
   * Prove a credential works before a live application depends on it. Says
   * what the provider said, so a wrong key is nameable rather than silent.
   */
  async function testKey(providerId) {
    const id = providerId || (await loadConfig()).provider || 'contactout';
    const provider = PROVIDERS[id];
    if (!provider || !provider.test) return { ok: false, message: 'No test available for this provider.' };
    let cred = await getCred(id);
    if (!hasCred(cred, provider)) {
      return { ok: false, message: provider.keyKind === 'account' ? 'Not signed in yet.' : 'No API key saved yet.' };
    }
    try {
      let req = provider.test(cred);
      let res = await fetch(req.url, req.init);
      if (res.status === 401 && provider.refreshKey) {
        const fresh = await refreshCred(id, cred);
        if (fresh) { cred = fresh; req = provider.test(cred); res = await fetch(req.url, req.init); }
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: provider.keyKind === 'account'
          ? 'Session expired - sign in again.'
          : 'Key rejected by ' + provider.label + ' (401/403). Check you copied the whole key.' };
      }
      if (res.status === 429) return { ok: false, message: provider.label + ' rate limit reached. Try again later.' };
      if (!res.ok) return { ok: false, message: provider.label + ' returned HTTP ' + res.status + '.' };
      const json = await res.json().catch(() => null);
      const extra = provider.parseTest ? provider.parseTest(json) : null;
      return { ok: true, message: provider.label + ' key works' + (extra && extra.detail ? ' - ' + extra.detail : '') + '.' };
    } catch (e) {
      return { ok: false, message: 'Could not reach ' + provider.label + '.' };
    }
  }

  // ---- cache ------------------------------------------------------------
  // Lookups cost credits, the same employer is applied to more than once,
  // and a recruiter does not change weekly.
  function _cacheKey(ctx) {
    return _clean(ctx && ctx.company).toLowerCase() + '|' + _clean(ctx && ctx.title).toLowerCase();
  }

  function readCache(ctx) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_CACHE], (r) => {
          const all = (r && r[KEY_CACHE]) || {};
          const hit = all[_cacheKey(ctx)];
          resolve(hit && hit.at && Date.now() - hit.at < CACHE_TTL_MS ? (hit.results || []) : null);
        });
      } catch (e) { resolve(null); }
    });
  }

  function writeCache(ctx, results) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_CACHE], (r) => {
          const all = (r && r[KEY_CACHE]) || {};
          all[_cacheKey(ctx)] = { at: Date.now(), results };
          const keys = Object.keys(all);
          if (keys.length > 200) delete all[keys[0]];
          chrome.storage.local.set({ [KEY_CACHE]: all }, () => resolve(true));
        });
      } catch (e) { resolve(false); }
    });
  }

  function clearCache() {
    return new Promise((resolve) => {
      try { chrome.storage.local.remove([KEY_CACHE], () => resolve(true)); } catch (e) { resolve(false); }
    });
  }

  // ---- lookup -----------------------------------------------------------
  /**
   * ctx: { company, title, location, domain, linkedinProfiles:[slug] }
   * Returns { ok, results:[{name,title,company,location,email,score}], source, reason }
   *
   * Never throws. Enrichment failing must not break a tailoring run: the
   * CV and cover letter are the product, this is an extra.
   */
  async function findContacts(ctx, opts) {
    const o = opts || {};
    const cfg = await loadConfig();
    if (cfg.enabled !== true) return { ok: false, results: [], reason: 'disabled' };
    if (!ctx || (!ctx.company && !(ctx.linkedinProfiles || []).length)) {
      return { ok: false, results: [], reason: 'no-company' };
    }

    if (!o.noCache) {
      const cached = await readCache(ctx);
      if (cached) return { ok: true, results: cached, source: 'cache' };
    }

    // Providers cover different situations, so one alone leaves gaps.
    // Closely resolves a NAMED job poster, which is the most accurate
    // answer there is -- but it needs a LinkedIn profile handle, which
    // only a LinkedIn posting supplies. On a Workday or Taleo role there
    // is no poster card, so a company-search provider has to take over or
    // there is no address at all.
    //
    // Order: whatever the user selected, then any other provider they have
    // a key for. Every provider is tried before reporting nothing found.
    // A running account of what was tried and why. Without it a lookup that
    // quietly does nothing is indistinguishable from one that ran and found
    // nobody, and the user has no way to tell which.
    const trace = [];
    const chain = [];
    let credentialledButUnusable = 0;
    const first = o.provider || cfg.provider || 'contactout';
    for (const id of [first].concat(Object.keys(PROVIDERS))) {
      if (chain.indexOf(id) !== -1 || !PROVIDERS[id]) continue;
      if (!hasCred(await getCred(id), PROVIDERS[id])) {
        trace.push(PROVIDERS[id].label + ': skipped, no key saved');
        continue;
      }
      // A provider that can only resolve a named profile is pointless when
      // the page named nobody. Skipping it saves a wasted call.
      const usable = PROVIDERS[id].searchByCompany !== false || (ctx.linkedinProfiles || []).length;
      if (usable) chain.push(id);
      else {
        credentialledButUnusable++;
        trace.push(PROVIDERS[id].label + ': skipped, it can only resolve a named LinkedIn '
          + 'poster and this page named nobody (no credits used)');
      }
    }
    if (!chain.length) {
      // Distinguishing these matters: "add a key" is wrong advice for
      // someone who has a working Closely account but is looking at a
      // Workday posting, where there is no named poster to resolve.
      return credentialledButUnusable
        ? { ok: false, results: [], reason: 'needs-named-poster', trace }
        : { ok: false, results: [], reason: 'no-api-key', trace };
    }

    const collected = [];
    let lastReason = 'no-match';
    for (const id of chain) {
      const r = await _findWith(id, ctx, o);
      trace.push(PROVIDERS[id].label + ': ' + (r.results.length
        ? r.results.length + ' contact(s) found'
        : (r.reason || 'nothing found')) + ' after ' + (r.calls || 0) + ' request(s)');
      if (r.results.length) { collected.push.apply(collected, r.results); break; }
      if (r.reason && r.reason !== 'no-match') lastReason = r.reason;
    }

    // De-duplicate on address, keeping the best-scoring appearance. The
    // isRealEmail guard is belt-and-braces: the search step deliberately
    // keeps address-less rows so they can be resolved, and none of those
    // may survive into something that gets mailed.
    const byEmail = new Map();
    for (const p of collected.filter((x) => isRealEmail(x.email))) {
      const k = p.email.toLowerCase();
      if (!byEmail.has(k) || byEmail.get(k).score < p.score) byEmail.set(k, p);
    }
    const results = Array.from(byEmail.values()).sort((a, b) => b.score - a.score).slice(0, 5);

    await writeCache(ctx, results);
    if (!results.length) {
      // "Nobody matched" is a successful lookup with an empty answer; only
      // a provider that actually failed is not ok. Collapsing the two would
      // make a rejected key look like an employer with no recruiters.
      return { ok: lastReason === 'no-match', results: [], reason: lastReason, triedProviders: chain, trace };
    }
    log('found ' + results.length + ' contact(s) at ' + (ctx.company || 'the posting')
      + ' via ' + (results[0].provider || chain[0]));
    return { ok: true, results, source: results[0].provider || chain[0], triedProviders: chain, trace };
  }

  /** One provider's attempt. Returns { results, reason, calls } and never throws. */
  async function _findWith(id, ctx, o) {
    const provider = PROVIDERS[id];
    let cred = await getCred(id);
    let calls = 0;

    // Runs one request and normalises every failure mode into a reason.
    const call = async (req, parse, q, opts2) => {
      calls++;
      let res;
      try { res = await fetch(req.url, req.init); }
      catch (e) { return { fatal: 'network' }; }

      if (res.status === 401 && provider.refreshKey) {
        const fresh = await refreshCred(id, cred);
        if (fresh) {
          cred = fresh;
          try { res = await fetch(req.url, req.init); } catch (e) { return { fatal: 'network' }; }
        }
      }
      if (res.status === 401 || res.status === 403) return { fatal: 'bad-api-key' };
      if (res.status === 429) return { fatal: 'rate-limited' };
      if (res.status === 402) return { fatal: 'out-of-credits' };
      if (!res.ok) return { rows: [] };

      const json = await res.json().catch(() => null);
      let rows = [];
      try { rows = parse(json) || []; } catch (e) { rows = []; }
      // The search step keeps rows that carry a LinkedIn handle but no
      // address, because those are exactly the ones worth resolving. Every
      // other caller wants addresses only.
      const keepEmpty = !!(opts2 && opts2.keepEmpty);
      return {
        rows: rows
          .filter((p) => isRealEmail(p.email) || (keepEmpty && p.profile))
          .map((p) => Object.assign({}, p, { score: scoreCandidate(p, q || {}, ctx) })),
      };
    };

    const out = [];

    // Profile-first: when the posting named the person who posted it, the
    // right answer is that person, not the best guess from a company search.
    const profiles = (ctx.linkedinProfiles || []).filter(Boolean);
    if (provider.lookupByProfile && profiles.length) {
      for (const slug of profiles.slice(0, 3)) {
        const r = await call(provider.lookupByProfile(slug, cred), provider.parseProfile, {});
        if (r.fatal) return { results: [], reason: r.fatal, calls };
        // A named poster outranks anyone a company search turns up.
        for (const p of r.rows) {
          out.push(Object.assign({}, p, { score: p.score + 40, source: 'job-poster', provider: id }));
        }
      }
    }

    if (!out.length && provider.searchByCompany !== false && provider.request) {
      for (const q of buildQueries(ctx)) {
        // The search identifies WHO. It does not always carry a usable
        // address, and the one it does carry is not necessarily verified.
        const r = await call(provider.request(q, cred), provider.parse, q, { keepEmpty: true });
        if (r.fatal) return { results: [], reason: r.fatal, calls };
        if (!r.rows.length) continue;

        // Rank first, then resolve. Resolving costs a credit per profile,
        // so it is spent on the two best matches rather than on everyone
        // the search happened to return.
        const ranked = r.rows
          .map((p) => Object.assign({}, p, { score: scoreCandidate(p, q, ctx) }))
          .sort((a, b) => b.score - a.score);

        for (const p of ranked) {
          if (isRealEmail(p.email)) { out.push(Object.assign({}, p, { provider: id })); continue; }
          // No inline address: resolve the profile the search found. This
          // is the step that returns a VERIFIED work address, which is the
          // whole point of going through a provider rather than guessing
          // firstname.lastname@company.com.
          if (p.profile && provider.lookupByProfile && out.length < 2) {
            const rp = await call(provider.lookupByProfile(p.profile, cred), provider.parseProfile, q);
            if (rp.fatal) break;
            for (const hit of rp.rows) {
              out.push(Object.assign({}, p, hit, {
                provider: id,
                score: p.score + 6,          // verified beats an inline guess
                verifiedVia: 'profile',
              }));
            }
          }
        }
        if (out.length) break;
      }
    }
    return { results: out, reason: out.length ? '' : 'no-match', calls };
  }

  /**
   * The single best contact, or ''. Called by the follow-up composer ONLY
   * after the posting, its structured data and the careers page all came
   * back with nothing.
   */
  async function bestEmail(ctx) {
    const r = await findContacts(ctx);
    if (!r.ok || !r.results.length) return { email: '', name: '', reason: r.reason || 'none' };
    const top = r.results[0];
    return {
      email: top.email,
      name: top.name || '',
      title: top.title || '',
      source: 'enriched',
      provider: r.source || '',
      alternatives: r.results.slice(1),
    };
  }

  global.ContactEnrichment = {
    listProviders, loadConfig, saveConfig, saveKey, clearKey, getCred,
    createKey, testKey, refreshCred,
    buildQueries, functionTitles, scoreCandidate, isRealEmail,
    findContacts, bestEmail, clearCache,
    PROVIDERS, TITLE_TIERS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ContactEnrichment;
})(typeof window !== 'undefined' ? window : globalThis);
