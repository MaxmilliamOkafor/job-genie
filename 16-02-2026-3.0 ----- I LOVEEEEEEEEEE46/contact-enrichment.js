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
 *   under GDPR and the obligation sits with the sender.
 *
 *   ON by default, with Closely as the default provider. It still costs
 *   nothing and contacts nobody until a provider credential is saved, and
 *   it is only ever consulted when the posting, its structured data and
 *   the employer's careers page all published nothing. Every address it
 *   returns is shown for review before any message is sent.
 *
 *   window.ContactEnrichment
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Enrich]';
  const KEY_CFG = 'enrichment_config';     // { provider, enabled, keys:{ id:{...} } }
  const KEY_CACHE = 'enrichment_cache';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // a week; people change jobs
  const MISS_TTL_MS = 2 * 60 * 60 * 1000;         // a miss is usually a fixable setup problem
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

  // Closely's own serialize(): nested values become bracketed keys, so
  // { company: ['Nortal'] } is company[0]=Nortal. Matching their house
  // style matters -- their confirmed endpoint rejects JSON.
  function _formEncode(obj, prefix) {
    const parts = [];
    for (const k of Object.keys(obj || {})) {
      const key = prefix ? prefix + '[' + k + ']' : k;
      const v = obj[k];
      if (v === undefined || v === null) continue;
      if (typeof v === 'object') parts.push(_formEncode(v, key));
      else parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
    }
    return parts.filter(Boolean).join('&');
  }

  // A personal mailbox is the wrong address for a job application. It is
  // less likely to be read in a work context, and arriving there uninvited
  // reads as a cold approach rather than a follow-up. Providers return
  // these freely -- ContactOut will hand back a gmail.com address and put
  // "find work email" behind a separate action -- so the preference has to
  // be applied here.
  const FREEMAIL = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
    'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
    'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
    'gmx.com', 'gmx.net', 'yandex.com', 'mail.com', 'zoho.com',
  ]);
  // ---- reading a provider's answer without knowing its exact shape ----
  //
  // Every provider here documents its request and not its response, and
  // the responses differ between accounts and change without notice. A
  // parser written against one observed shape returns [] for all the
  // others, and because parse errors are swallowed upstream, a lookup
  // that fetched a perfectly good email is indistinguishable from one
  // that found nobody. That is exactly the "it runs and does nothing"
  // this module exists to stop, so the readers below accept every shape
  // these APIs plausibly return rather than one.

  // An address list, however it is expressed: a bare string, an array of
  // strings, an array of objects keyed email/address/value/work_email, or
  // a single such object. The object case matters most -- _clean() on an
  // object yields "[object Object]", which is not an address but is a
  // non-empty string, so it survives further than a null would.
  function _emailStrings(v) {
    const out = [];
    const take = (x) => {
      if (!x) return;
      if (typeof x === 'string') { out.push(x); return; }
      if (Array.isArray(x)) { x.forEach(take); return; }
      if (typeof x === 'object') {
        take(x.email || x.address || x.value || x.email_address
          || x.work_email || x.personal_email);
      }
    };
    take(v);
    return out.map(_clean).filter(Boolean);
  }

  // The array of people in a response, wherever the provider put it.
  function _entryList(json) {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    const d = json.data;
    const cands = [
      d && d.entries, d && d.contacts, d && d.people, d && d.results, d && d.profiles,
      Array.isArray(d) ? d : null,
      json.entries, json.contacts, json.people, json.results, json.profiles,
    ];
    for (const c of cands) if (Array.isArray(c) && c.length) return c;
    // A single person returned unwrapped.
    const one = (d && typeof d === 'object' && !Array.isArray(d)) ? d : json;
    if (one && typeof one === 'object'
        && (one.emails || one.email || one.full_name || one.first_name)) return [one];
    return [];
  }

  // ---- last resort: find the address wherever it is ---------------------
  //
  // The readers above cover every shape these APIs are known to answer
  // with. This covers the ones they are not.
  //
  // Waiting for a human to paste the unrecognised response back to a
  // developer is not a fix -- it is the same silent failure with a longer
  // feedback loop. So when a provider returns 200 and no reader
  // recognises it, walk the whole response and take any string that IS an
  // email address, attributing it to the nearest enclosing object that
  // carries a name. A new shape then works on the first try, with nobody
  // in the loop.
  //
  // The risk of a scan this broad is picking up an address that is not
  // the person's, so:
  //   - the provider's own domains are excluded, or an error body
  //     mentioning support@ becomes a "contact"
  //   - unattended mailboxes are excluded for the same reason
  //   - isRealEmail still applies downstream, and it is the send step's
  //     last guard
  const _PROVIDER_DOMAINS = /(closelyhq|contactout|hunter|apollo|linkedin)\.(io|com|co)$/i;
  const _EMAIL_EXACT = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[a-z]{2,}$/i;

  function _deepFindContacts(json) {
    const out = [];
    const seen = new Set();

    const nameish = (o, prev) => ({
      name: _clean(o.full_name || o.name || o.fullName
        || [o.first_name || o.firstName, o.last_name || o.lastName].filter(Boolean).join(' ')) || prev.name,
      title: _clean(o.title || o.job_title || o.jobTitle || o.headline || o.position) || prev.title,
      company: _clean(typeof o.company === 'string' ? o.company
        : (o.company && o.company.name) || o.company_name || o.organization) || prev.company,
      location: _clean(o.location || o.city || o.country) || prev.location,
    });

    const walk = (node, ctx, depth) => {
      if (!node || depth > 8 || out.length > 25) return;
      if (Array.isArray(node)) { for (const n of node) walk(n, ctx, depth + 1); return; }
      if (typeof node !== 'object') return;

      const here = nameish(node, ctx);
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'string') {
          const val = v.trim();
          if (!_EMAIL_EXACT.test(val)) continue;
          const dom = val.split('@')[1] || '';
          if (_PROVIDER_DOMAINS.test(dom)) continue;
          if (UNATTENDED_RE.test(val)) continue;
          const key = val.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ name: here.name, title: here.title, company: here.company,
            location: here.location, email: val });
        } else {
          walk(v, here, depth + 1);
        }
      }
    };

    walk(json, { name: '', title: '', company: '', location: '' }, 0);
    return out;
  }

  // What a response actually looked like, for the trace. Keys and types
  // only -- never values, because these responses carry personal data and
  // the trace is shown in the UI and pasted into bug reports.
  function _shapeOf(json, depth) {
    const d = depth == null ? 2 : depth;
    if (json === null || json === undefined) return String(json);
    if (Array.isArray(json)) {
      return json.length ? '[' + (d > 0 ? _shapeOf(json[0], d - 1) : '...') + ' x' + json.length + ']' : '[]';
    }
    if (typeof json !== 'object') return typeof json;
    const keys = Object.keys(json).slice(0, 12);
    if (!d) return '{' + keys.join(',') + '}';
    return '{' + keys.map((k) => k + ':' + _shapeOf(json[k], d - 1)).join(', ') + '}';
  }

  function isPersonalEmail(v) {
    const at = String(v || '').lastIndexOf('@');
    if (at === -1) return false;
    return FREEMAIL.has(String(v).slice(at + 1).toLowerCase().trim());
  }

  // A provider that has no address for someone still returns a row. These
  // are placeholders, not addresses, and must never reach a recruiter.
  const PLACEHOLDER_RE = /^(email_not_unlocked|not_unlocked|locked|hidden|unavailable|domain_only|SEARCH)@|^(SEARCH|LOCKED)$/i;
  // An unattended mailbox is a valid address and never a person. Sending a
  // follow-up to noreply@ is worse than sending nothing: it is guaranteed
  // not to be read, and it still spends a provider credit to find. This
  // sits in isRealEmail rather than in one reader so that it holds for
  // every provider and every response shape.
  const UNATTENDED_RE = /^(no-?reply|do-?not-?reply|donotreply|postmaster|mailer-daemon|abuse|bounce|unsubscribe)\b/i;

  function isRealEmail(v) {
    const e = _clean(v);
    if (!e || e.indexOf('@') === -1) return false;
    if (PLACEHOLDER_RE.test(e)) return false;
    if (UNATTENDED_RE.test(e)) return false;
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

  // ---- who this role actually belongs to --------------------------------
  // "The right person for THIS job" is three separate questions -- the
  // right company, the right country, the right discipline -- and a title
  // alone answers none of them. A "Technical Recruiter" is the perfect
  // match for a software role and the wrong person for a nursing one; the
  // same name at the same company in another country is a different
  // office with a different pipeline.

  // Discipline of a role title OR of a person's title. Matching these is
  // what separates the recruiter who owns this requisition from a
  // colleague who owns a different one.
  const DISCIPLINES = [
    ['data', /data scien|machine learning|\bml\b|\bai\b|analytics|data engineer|bi\b|business intelligence/],
    ['engineering', /engineer|developer|software|devops|platform|sre\b|backend|frontend|full.?stack|infrastructur|cloud|security|qa\b|test automation/],
    ['product', /product manager|product owner|\bproduct\b/],
    ['delivery', /project manager|programme|program manager|delivery|scrum|agile|pmo\b/],
    ['design', /design|\bux\b|\bui\b|creative/],
    ['marketing', /market|brand|content|seo\b|communications|\bpr\b/],
    ['sales', /sales|account exec|business development|partnerships|revenue|customer success/],
    ['finance', /finance|account(ant|ing)|audit|tax\b|treasury|controller/],
    ['legal', /legal|counsel|solicitor|paralegal|compliance/],
    ['healthcare', /nurse|nursing|clinical|physician|doctor|healthcare|medical|pharmac/],
    ['operations', /operations|logistics|supply chain|warehouse|procurement|facilities/],
    ['support', /support|service desk|helpdesk|customer service/],
    ['hr', /\bhr\b|human resources|people ops|people partner|talent|recruit/],
  ];

  function disciplineOf(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return '';
    for (const [name, re] of DISCIPLINES) if (re.test(t)) return name;
    return '';
  }

  // The discipline a RECRUITER covers, which is not the same question:
  // "Technical Recruiter" is an hr title whose coverage is engineering.
  // Read past the recruiting words to whatever they qualify.
  function recruiterCovers(title) {
    const t = String(title || '').toLowerCase();
    if (!/talent|recruit|sourc|hiring/.test(t)) return '';
    const stripped = t.replace(/talent acquisition|talent|recruit(ing|ment|er)?|sourcer|sourcing|hiring|partner|specialist|manager|lead|head of|senior|principal/g, ' ');
    const d = disciplineOf(stripped);
    // "Technical Recruiter" says engineering without naming it.
    if (!d && /\btech(nical)?\b|\beng\b/.test(t)) return 'engineering';
    return d === 'hr' ? '' : d;
  }

  const _isRecruiterTitle = (t) => /talent|recruit|sourc|hiring manager|people partner|\bhr\b|human resources/i.test(String(t || ''));

  // The hiring manager for the role's own function, as a later fallback: on
  // a small team the manager is the person actually reading applications.
  const FUNCTION_TITLES = {
    data: ['Head of Data', 'Data Science Manager', 'Analytics Manager'],
    engineering: ['Engineering Manager', 'Head of Engineering', 'VP Engineering'],
    product: ['Head of Product', 'Product Director'],
    delivery: ['Head of Delivery', 'Programme Director', 'PMO Manager'],
    design: ['Head of Design', 'Design Director'],
    marketing: ['Head of Marketing', 'Marketing Director'],
    sales: ['Sales Director', 'Head of Sales'],
    finance: ['Finance Director', 'Head of Finance'],
    legal: ['Head of Legal', 'General Counsel'],
    healthcare: ['Clinical Manager', 'Head of Nursing', 'Medical Director'],
    operations: ['Head of Operations', 'Operations Manager'],
    support: ['Head of Customer Support', 'Support Manager'],
  };

  function functionTitles(roleTitle) {
    return FUNCTION_TITLES[disciplineOf(roleTitle)] || [];
  }

  // ---- company and country identity -------------------------------------
  const _LEGAL = /\b(ltd|limited|llc|inc|incorporated|plc|gmbh|bv|nv|ab|oy|as|sa|srl|spa|pty|corp|corporation|co|company|group|holdings|international|global|technologies|technology|solutions|services|consulting)\b/g;
  function _normCompany(s) {
    return String(s || '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(_LEGAL, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function _companyAgrees(a, b) {
    const x = _normCompany(a), y = _normCompany(b);
    if (!x || !y) return null;                    // cannot tell
    if (x === y) return true;
    // One being a prefix/suffix of the other covers "Nortal" vs
    // "Nortal Ireland", which is the same employer.
    return x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
  }

  // Country aliases, so "Dublin, IE" and "Dublin, Ireland" are one place
  // and "Dublin, Ohio" is not.
  const _COUNTRIES = [
    ['ireland', /^(ireland|ie|irl|republic of ireland|eire)$/],
    ['united kingdom', /^(united kingdom|uk|gb|gbr|great britain|england|scotland|wales|northern ireland)$/],
    ['united states', /^(united states|united states of america|usa|us|u s|america)$/],
    ['germany', /^(germany|de|deu|deutschland)$/],
    ['france', /^(france|fr|fra)$/],
    ['spain', /^(spain|es|esp)$/],
    ['netherlands', /^(netherlands|nl|nld|holland)$/],
    ['poland', /^(poland|pl|pol)$/],
    ['india', /^(india|in|ind)$/],
    ['canada', /^(canada|ca|can)$/],
    ['australia', /^(australia|au|aus)$/],
    ['estonia', /^(estonia|ee|est)$/],
    ['portugal', /^(portugal|pt|prt)$/],
    ['italy', /^(italy|it|ita)$/],
    ['sweden', /^(sweden|se|swe)$/],
    ['switzerland', /^(switzerland|ch|che)$/],
    ['belgium', /^(belgium|be|bel)$/],
  ];
  function _countryOf(loc) {
    const parts = String(loc || '').split(',').map((p) => _clean(p).toLowerCase()).filter(Boolean);
    // Scan from the end: the country is conventionally last, but "Dublin,
    // County Dublin, Ireland" and "Remote - Ireland" both put it there too.
    for (let i = parts.length - 1; i >= 0; i--) {
      for (const [name, re] of _COUNTRIES) if (re.test(parts[i])) return name;
    }
    return '';
  }
  function _cityOf(loc) {
    const first = String(loc || '').split(/[,/]/)[0];
    return _clean(first).toLowerCase().replace(/^(remote|hybrid|onsite)\s*[-–]?\s*/, '').trim();
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
    const disc = disciplineOf(ctx && ctx.title);
    // Providers can filter at the source, which is cheaper and cleaner than
    // penalising afterwards -- but excluding "Sales" from a SALES vacancy
    // removes exactly the right desk. Decided once here and carried on the
    // query, so no provider has to work it out again.
    const exclude = disc === 'sales' ? [] : ['Sales', 'Business Development', 'Account Executive'];
    const base = { company, location, domain, exclude };
    const out = [];

    // The full per-field target list when it is loaded: an SRE vacancy asks
    // for "Senior Site Reliability Engineer" and a security one for a CISO,
    // rather than both settling for "Engineering Manager". Falls back to the
    // coarse tiers below when the module is absent.
    const LPS = global.LinkedInPeopleSearch;
    if (LPS && typeof LPS.targetTitles === 'function') {
      for (const g of LPS.targetTitles(ctx && ctx.title)) {
        out.push(Object.assign({}, base, { titles: g.titles.slice(0, 6), tier: g.tier }));
      }
      if (location) {
        // Same last resort as below: the recruiter for a Dublin role often
        // sits in another office, and an over-tight filter returns nobody.
        out.push(Object.assign({}, base, {
          titles: LPS.allTargetTitles(ctx && ctx.title).slice(0, 8), location: '',
        }));
      }
      return out;
    }

    // Ask for the recruiter who covers THIS discipline before asking for
    // recruiters in general. At any employer big enough to have several,
    // the generic query returns whichever one the provider ranks highest,
    // which is not the one who owns this requisition.
    const DISC_RECRUITERS = {
      engineering: ['Technical Recruiter', 'Engineering Recruiter', 'Technical Talent Partner'],
      data: ['Technical Recruiter', 'Data Recruiter', 'Technical Talent Partner'],
      product: ['Product Recruiter', 'Technical Recruiter'],
      design: ['Design Recruiter', 'Technical Recruiter'],
      sales: ['Sales Recruiter', 'Commercial Recruiter', 'GTM Recruiter'],
      marketing: ['Marketing Recruiter', 'Commercial Recruiter'],
      finance: ['Finance Recruiter', 'Corporate Recruiter'],
      legal: ['Legal Recruiter', 'Corporate Recruiter'],
      healthcare: ['Clinical Recruiter', 'Healthcare Recruiter'],
      operations: ['Operations Recruiter', 'Corporate Recruiter'],
      delivery: ['Technical Recruiter', 'Corporate Recruiter'],
      support: ['Corporate Recruiter'],
    };
    if (DISC_RECRUITERS[disc]) out.push(Object.assign({}, base, { titles: DISC_RECRUITERS[disc] }));

    for (const titles of TITLE_TIERS) out.push(Object.assign({}, base, { titles }));

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
    if (/intern\b|assistant/.test(title)) s -= 6;

    // ---- the right DISCIPLINE, not just the right kind of job ----------
    // Any large employer has several recruiters. Only one of them owns
    // this requisition, and the title usually says which: a "Sales
    // Recruiter" will not read an application for a platform engineer.
    const roleDisc = disciplineOf(ctx && ctx.title);
    const covers = recruiterCovers(person.title);
    const personDisc = disciplineOf(person.title);

    if (roleDisc && covers) {
      // A recruiter who names a discipline: strong either way.
      s += covers === roleDisc ? 16 : -18;
    } else if (roleDisc && !_isRecruiterTitle(person.title) && personDisc) {
      // Not a recruiter -- so this is a line manager. The head of the
      // role's own function is the decision maker; the head of a
      // different one is a stranger.
      s += personDisc === roleDisc ? 14 : -12;
    }

    // A sales rep with "partnerships" in the title is noise -- unless the
    // job itself is a sales job, where that is exactly the right desk.
    if (roleDisc !== 'sales'
        && /sales|business development|account executive|partnerships/.test(title)) s -= 25;

    // ---- the right COMPANY ---------------------------------------------
    // Providers match on a company NAME, which drifts: a former employee,
    // or a same-named firm in another market, comes back looking correct.
    const wantCompany = (q && q.company) || (ctx && ctx.company);
    const sameCompany = _companyAgrees(person.company, wantCompany);
    if (sameCompany === true) s += 18;
    // Demonstrably somewhere else. This has to outweigh every other
    // signal combined: a perfectly-titled recruiter at the wrong employer
    // cannot help with this application, and writing to them is a cold
    // approach to a stranger about a job they do not hire for. Anyone
    // actually at the company outranks them, however imperfect.
    else if (sameCompany === false) s -= 60;

    // ---- the right COUNTRY, then the right city ------------------------
    const wantLoc = String((q && q.location) || (ctx && ctx.location) || '');
    const wantCountry = _countryOf(wantLoc), haveCountry = _countryOf(person.location);
    if (wantCountry && haveCountry) {
      // Dublin, Ireland and Dublin, Ohio are not the same hiring market.
      s += wantCountry === haveCountry ? 14 : -30;
    }
    const wantCity = _cityOf(wantLoc);
    if (wantCity && loc && loc.indexOf(wantCity) !== -1) s += 12;
    // Providers that report their own confidence: fold it in, scaled well
    // below the title signal so a confident wrong person never wins.
    if (typeof person.confidence === 'number') s += Math.round(person.confidence / 10);
    if (person.verified) s += 5;

    // A work address at the employer's own domain is the one that belongs
    // in a job follow-up. A personal mailbox is a last resort, not a tie.
    if (person.email) {
      if (isPersonalEmail(person.email)) s -= 20;
      else {
        s += 6;
        const dom = String((ctx && ctx.domain) || '').toLowerCase();
        if (dom && person.email.toLowerCase().endsWith('@' + dom)) s += 8;
      }
    }
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
            // Empty for a SALES vacancy -- excluding "Sales" there would
            // drop the one recruiter who owns the requisition.
            exclude_job_titles: (q.exclude && q.exclude.length) ? q.exclude : undefined,
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
        // _emailStrings rather than a bare pick(): ContactOut returns
        // work_email as a plain string on some plans and as
        // {email,type} objects on others, and _clean() on an object
        // yields "[object Object]" -- a non-empty string that survives
        // as far as the send step.
        const emails = _emailStrings(ci.work_email).concat(_emailStrings(ci.work_emails))
          .concat(_emailStrings(ci.email)).concat(_emailStrings(ci.emails));
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
      // Closely's CONFIRMED capability is profile -> verified email, the
      // same second step ContactOut uses and the expensive half of the job.
      // What it does not publish is the first step: a company/role/location
      // search that produces candidate profiles. Their extension never
      // calls one, and no such endpoint is documented.
      //
      // searchByCompany stays false so Closely is never asked to do
      // something it cannot, but searchProbe below looks for a Lead Finder
      // endpoint once, using the account's own token. If Closely exposes
      // one, it is used from then on and Closely covers both steps like
      // ContactOut. If not, profiles come from the page and from whatever
      // profile the user supplies.
      searchByCompany: false,
      // Closely's own product name for people search is "Lead Finder", and
      // auth/me reports has_lead_finder for accounts that have it. These
      // are the paths their API's own naming implies. Probed once, in
      // order, with the result remembered so it is never re-probed.
      searchProbe: [
        'https://api.closelyhq.com/explorer/people/search',
        'https://api.closelyhq.com/explorer/contacts/search',
        'https://api.closelyhq.com/leadfinder/search',
        'https://api.closelyhq.com/explorer/search',
      ],
      // Closely's confirmed endpoint posts form-urlencoded with bracket
      // notation (their own serialize()), NOT JSON. A probe that only spoke
      // JSON would fail even on a correct path, so both encodings are
      // tried, form first because that is their house style.
      searchEncodings: (q) => {
        const fields = {
          company: q.company ? [q.company] : [],
          job_title: q.titles || [],
          location: q.location ? [q.location] : [],
          page: 1,
          limit: 10,
        };
        return [
          { contentType: 'application/x-www-form-urlencoded', body: _formEncode(fields) },
          { contentType: 'application/json', body: JSON.stringify(fields) },
        ];
      },
      searchHeaders: (cred, contentType) => ({
        'Content-Type': contentType,
        Accept: 'application/json',
        Authorization: 'Bearer ' + cred.token,
      }),
      // Tolerant on purpose: an undocumented response shape is the whole
      // reason this is a probe. Anything carrying a profile handle is
      // useful, because the handle is what the confirmed endpoint needs.
      parseSearch: (json) => {
        const rows = (json && (json.data?.entries || json.entries || json.data
          || json.profiles || json.results)) || [];
        const list = Array.isArray(rows) ? rows : Object.values(rows);
        return list.filter((p) => p && typeof p === 'object').map((p) => ({
          name: _clean(p.full_name || p.name
            || [p.first_name || p.firstName, p.last_name || p.lastName].filter(Boolean).join(' ')),
          title: _clean(p.title || p.job_title || p.headline || p.jobs?.[0]?.position),
          company: _clean(typeof p.company === 'string' ? p.company
            : (p.company?.name || p.company_name || p.jobs?.[0]?.company)),
          location: _clean(p.location || p.country),
          email: _clean((p.emails || [])[0] || p.email),
          profile: _clean(p.lid || p.li_vanity || p.public_identifier)
            || _profileSlugFromUrl(p.linkedin_url || p.profile_url || p.url),
        }));
      },
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
      // Shape-tolerant on purpose. This previously read only
      // data.entries[].emails[] with string emails, and returned nothing
      // for every other shape Closely might answer with -- including
      // emails as {email,type} objects, a singular `email` field, entries
      // at the top level, and `data` as a bare array, which threw. The
      // throw was swallowed upstream, so all four failures looked
      // identical to "this person has no address on file".
      parseProfile: (json) => {
        const out = [];
        for (const e of _entryList(json)) {
          if (!e || typeof e !== 'object') continue;
          const emails = _emailStrings(e.emails).concat(_emailStrings(e.email))
            .concat(_emailStrings(e.work_email)).concat(_emailStrings(e.contact_info));
          const seen = new Set();
          for (const em of emails) {
            const k = em.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({
              name: _clean(e.full_name || e.name
                || [e.first_name || e.firstName, e.last_name || e.lastName].filter(Boolean).join(' ')),
              title: _clean(e.title || e.job_title || e.headline),
              company: _clean(typeof e.company === 'string' ? e.company
                : (e.company && e.company.name) || e.company_name),
              location: _clean(e.location || e.country),
              email: em,
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
  // Defaults live HERE and nowhere else. A toggle that ships ON has no
  // stored value until it is touched, so every reader that decides for
  // itself what "unset" means is a chance for the interface to draw one
  // thing while the code does another -- which has already happened twice
  // in this extension.
  const DEFAULT_ENABLED = true;
  const DEFAULT_PROVIDER = 'closely';

  function _withDefaults(c) {
    const out = c || {};
    if (!out.keys) out.keys = {};
    if (out.enabled === undefined) out.enabled = DEFAULT_ENABLED;
    if (!out.provider) out.provider = DEFAULT_PROVIDER;
    return out;
  }

  function loadConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_CFG], (r) => {
          resolve(_withDefaults((r && r[KEY_CFG]) || {}));
        });
      } catch (e) { resolve(_withDefaults({})); }
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
    const id = providerId || cfg.provider || DEFAULT_PROVIDER;
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
    // Misses recorded while this key was missing or wrong are now stale:
    // keeping them would mean a corrected key changed nothing until they
    // expired. Positive results are discarded too, which costs one lookup.
    await clearCache();
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
    const id = providerId || (await loadConfig()).provider || DEFAULT_PROVIDER;
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
      // A missing status endpoint says nothing about the key. Reporting it
      // as a failure would send someone hunting for a new key when the one
      // they have is fine -- the only test that proves a key is the lookup
      // itself, which "Find contact for this job now" runs.
      if (res.status === 404 || res.status === 405) {
        return { ok: true, message: provider.label + ' has no status endpoint to check, so the key '
          + 'could not be confirmed here. Use "Find contact for this job now" to test it for real.' };
      }
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
    // The poster handle is part of the key. Without it, two postings that
    // both failed to yield a company name shared the single key "|" and
    // returned each other's answers.
    return _clean(ctx && ctx.company).toLowerCase()
      + '|' + _clean(ctx && ctx.title).toLowerCase()
      + '|' + ((ctx && ctx.linkedinProfiles) || []).join(',').toLowerCase();
  }

  function readCache(ctx) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY_CACHE], (r) => {
          const all = (r && r[KEY_CACHE]) || {};
          const hit = all[_cacheKey(ctx)];
          if (!hit || !hit.at) { resolve(null); return; }
          // A found recruiter is good for a week. A MISS is not: it is
          // usually a key that was missing, wrong or out of credits at the
          // time, and caching that for a week meant fixing the key changed
          // nothing for the next seven days. Retry misses the same day.
          const ttl = (hit.results && hit.results.length) ? CACHE_TTL_MS : MISS_TTL_MS;
          resolve(Date.now() - hit.at < ttl ? (hit.results || []) : null);
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

    // STEP 1: FIND A PROFILE, SO STEP 2 HAS SOMETHING TO RESOLVE.
    //
    // Closely can only turn a LinkedIn profile into an email; it has no
    // people search, and its own extension does that half through
    // LinkedIn's Voyager API. Without this, a posting that named nobody
    // meant Closely was skipped as "needs-named-poster", its API was
    // never called, and the saved token was never spent -- a lookup that
    // silently did nothing, which is precisely what was reported.
    //
    // Off by default and capped hard; see linkedin-voyager.js for why.
    // Web search first, always. It asks a search engine for the profiles
    // that are already indexed, so LinkedIn is never contacted, sees no
    // traffic, and has nothing to restrict. The Voyager route below does
    // the same job by calling LinkedIn's private API, which works and is
    // against their User Agreement -- it stays off unless deliberately
    // enabled, and is only reached if the safe route found nobody.
    const needProfiles = () => !(ctx.linkedinProfiles || []).length;
    const searchQuery = {
      title: ctx.searchTitle || ctx.jobTitle || ctx.title || '',
      titles: ctx.searchTitles || [],
      company: ctx.company || '',
      location: ctx.location || '',
    };
    // Why step 1 came back empty, kept for the caller. Without it a
    // failed profile search is reported as "this page names nobody",
    // which sends the user off to buy a second provider when the real
    // cause is that they are not signed in to LinkedIn in this browser.
    const profileWhy = [];
    const adoptProfiles = (found) => {
      (found.trace || []).forEach((t) => trace.push(t));
      if (!found.ok && found.reason) profileWhy.push(found.reason);
      if (found.ok && found.profiles.length) {
        // Hand the slugs on in the shape the providers already expect.
        ctx = Object.assign({}, ctx, {
          linkedinProfiles: found.profiles.map((p) => p.profile),
          linkedinCandidates: found.profiles,
        });
      }
    };

    if (needProfiles() && typeof ProfileWebSearch !== 'undefined'
        && (searchQuery.company || searchQuery.title || searchQuery.titles.length)) {
      try {
        adoptProfiles(await ProfileWebSearch.findProfiles(searchQuery));
      } catch (e) {
        trace.push('Profile search: failed (' + (e && e.message) + ')');
      }
    }

    if (needProfiles() && typeof LinkedInVoyager !== 'undefined'
        && (searchQuery.company || searchQuery.title)) {
      try {
        adoptProfiles(await LinkedInVoyager.findProfiles(searchQuery,
          { force: o.forceLinkedInSearch }));
      } catch (e) {
        trace.push('LinkedIn search: failed (' + (e && e.message) + ')');
      }
    }
    const first = o.provider || cfg.provider || DEFAULT_PROVIDER;
    for (const id of [first].concat(Object.keys(PROVIDERS))) {
      if (chain.indexOf(id) !== -1 || !PROVIDERS[id]) continue;
      if (!hasCred(await getCred(id), PROVIDERS[id])) {
        trace.push(PROVIDERS[id].label + ': skipped, no key saved');
        continue;
      }
      // A provider that can only resolve a named profile is pointless when
      // the page named nobody. Skipping it saves a wasted call. One with a
      // search endpoint still has something to try -- unless a previous
      // probe already established that it has none, in which case it is
      // back to being profile-only.
      const p = PROVIDERS[id];
      const probed = (cfg.searchEndpoints || {})[id];
      const canSearch = p.searchByCompany !== false
        || (p.searchProbe && probed !== '' && ctx.company);
      const usable = canSearch || (ctx.linkedinProfiles || []).length;
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
        ? { ok: false, results: [], reason: 'needs-named-poster',
            profileWhy: profileWhy.join('; '), trace }
        : { ok: false, results: [], reason: 'no-api-key',
            profileWhy: profileWhy.join('; '), trace };
    }

    const collected = [];
    let lastReason = 'no-match';
    for (const id of chain) {
      const r = await _findWith(id, ctx, o);
      trace.push(PROVIDERS[id].label + ': ' + (r.results.length
        ? r.results.length + ' contact(s) found'
        : (r.reason || 'nothing found')) + ' after ' + (r.calls || 0) + ' request(s)');
      // Notes are only recorded when something notable happened: a
      // response that parsed to nobody, or one whose shape had to be read
      // by the fallback scan. Surface them either way -- a lookup that
      // succeeded through the fallback is working, but the shape has
      // moved and that is worth knowing before it moves further.
      (r.notes || []).forEach((n) => trace.push('  ' + n));
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
      return { ok: lastReason === 'no-match', results: [], reason: lastReason,
        profileWhy: profileWhy.join('; '), triedProviders: chain, trace };
    }
    log('found ' + results.length + ' contact(s) at ' + (ctx.company || 'the posting')
      + ' via ' + (results[0].provider || chain[0]));
    return { ok: true, results, source: results[0].provider || chain[0], triedProviders: chain, trace };
  }

  /**
   * Which search endpoint this provider actually answers on, or ''.
   *
   * Only for providers whose search is undocumented but whose account is
   * real. Each candidate is asked once with the user's own token; a 404 or
   * 405 means "not this one", anything that parses means "this one". The
   * answer is stored so the probing happens at most once, and a negative
   * answer is stored too -- re-probing on every lookup would be noise
   * against their API for no benefit.
   */
  // meter: optional { n } incremented once per probe request. The probe
  // uses fetch directly rather than call(), so without this its requests
  // are invisible and the diagnostic reports "0 request(s)" for a lookup
  // that just made eight -- which reads as "it never ran".
  async function _resolveSearchEndpoint(id, provider, cred, ctx, meter) {
    const cfg = await loadConfig();
    const known = (cfg.searchEndpoints || {})[id];
    if (known !== undefined) return known || null;

    let found = null;
    const q = (buildQueries(ctx) || [])[0] || { company: ctx.company, titles: ['Recruiter'] };
    const encodings = provider.searchEncodings(q);

    outer:
    for (const url of provider.searchProbe) {
      for (const enc of encodings) {
        try {
          if (meter) meter.n++;
          const res = await fetch(url, {
            method: 'POST',
            headers: provider.searchHeaders(cred, enc.contentType),
            body: enc.body,
          });
          // Not this path at all: skip its other encoding too.
          if (res.status === 404 || res.status === 501) continue outer;
          // Right path, wrong encoding or wrong shape: try the next encoding.
          if (res.status === 405 || res.status === 415 || res.status === 422) continue;
          // A credential problem is not an endpoint problem. Stop and record
          // nothing, so a refreshed token probes again instead of being
          // stuck with a false "no endpoint".
          if (res.status === 401 || res.status === 403) return null;
          if (!res.ok) continue;
          const json = await res.json().catch(() => null);
          if (!json) continue;
          // It answered with JSON. Only accept it if the parser can find
          // people in it -- an endpoint that exists but returns something
          // unrelated is not a search.
          let rows = [];
          try { rows = provider.parseSearch(json) || []; } catch (e) { rows = []; }
          if (!rows.length && !(json.data || json.entries || json.profiles || json.results)) continue;
          found = { url, contentType: enc.contentType };
          break outer;
        } catch (e) { /* network: try the next candidate */ }
      }
    }

    const next = await loadConfig();
    next.searchEndpoints = Object.assign({}, next.searchEndpoints, { [id]: found || '' });
    await _writeConfig(next);
    log(found ? 'search endpoint for ' + id + ': ' + found.url + ' (' + found.contentType + ')'
      : 'no search endpoint for ' + id);
    return found;
  }

  /** One provider's attempt. Returns { results, reason, calls } and never throws. */
  async function _findWith(id, ctx, o) {
    const provider = PROVIDERS[id];
    let cred = await getCred(id);
    let calls = 0;
    // Shape diagnostics for responses that parsed to nobody. Surfaced in
    // the trace by the caller.
    const notes = [];

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
      let parseError = '';
      try { rows = parse(json) || []; }
      catch (e) { rows = []; parseError = (e && e.message) || 'parse failed'; }

      // The provider answered, and no reader recognised the shape. Rather
      // than report nothing and wait for someone to diagnose it, find the
      // addresses in whatever came back. Applies to every provider,
      // because every one of them can change its response.
      if (!rows.length && json) {
        const deep = _deepFindContacts(json);
        if (deep.length) {
          rows = deep;
          notes.push(provider.label + ': response shape was not recognised, so the '
            + 'addresses were read directly out of it (' + deep.length + ' found). '
            + 'Shape: ' + _shapeOf(json));
        }
      }
      // A 200 that yields nobody is the failure mode that reads as "the
      // lookup did nothing". Record what actually came back -- keys and
      // types only, never values -- so the next run says which shape the
      // provider answered with instead of leaving it to guesswork.
      if (!rows.length) {
        notes.push(provider.label + ': ' + (parseError ? 'parse error (' + parseError + '), ' : '')
          + 'HTTP ' + res.status + ' returned ' + _shapeOf(json));
      }
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
        if (r.fatal) return { results: [], reason: r.fatal, calls, notes };
        // A named poster outranks anyone a company search turns up.
        for (const p of r.rows) {
          out.push(Object.assign({}, p, { score: p.score + 40, source: 'job-poster', provider: id }));
        }
      }
    }

    // A provider with no documented search endpoint but a working account:
    // look for one once, then use it like any other search. The result --
    // found or absent -- is remembered, so this costs at most one round of
    // probing per install and never repeats.
    let probedAndFoundNothing = false;
    if (!out.length && !profiles.length && provider.searchProbe && ctx.company) {
      const meter = { n: 0 };
      const endpoint = await _resolveSearchEndpoint(id, provider, cred, ctx, meter);
      calls += meter.n;
      probedAndFoundNothing = !(endpoint && endpoint.url);
      if (endpoint && endpoint.url) {
        for (const q of buildQueries(ctx)) {
          const enc = provider.searchEncodings(q)
            .find((e) => e.contentType === endpoint.contentType) || provider.searchEncodings(q)[0];
          const r = await call({
            url: endpoint.url,
            init: {
              method: 'POST',
              headers: provider.searchHeaders(cred, enc.contentType),
              body: enc.body,
            },
          }, provider.parseSearch, q, { keepEmpty: true });
          if (r.fatal) return { results: [], reason: r.fatal, calls, notes };
          if (!r.rows.length) continue;

          const ranked = r.rows
            .map((p) => Object.assign({}, p, { score: scoreCandidate(p, q, ctx) }))
            .sort((a, b) => b.score - a.score);
          for (const p of ranked) {
            if (isRealEmail(p.email)) { out.push(Object.assign({}, p, { provider: id })); continue; }
            // The handle is the point: hand it to the confirmed endpoint.
            if (p.profile && provider.lookupByProfile && out.length < 2) {
              const rp = await call(provider.lookupByProfile(p.profile, cred), provider.parseProfile, q);
              if (rp.fatal) break;
              for (const hit of rp.rows) {
                out.push(Object.assign({}, p, hit, { provider: id, score: p.score + 6, verifiedVia: 'profile' }));
              }
            }
          }
          if (out.length) break;
        }
      }
    }

    if (!out.length && provider.searchByCompany !== false && provider.request) {
      for (const q of buildQueries(ctx)) {
        // The search identifies WHO. It does not always carry a usable
        // address, and the one it does carry is not necessarily verified.
        const r = await call(provider.request(q, cred), provider.parse, q, { keepEmpty: true });
        if (r.fatal) return { results: [], reason: r.fatal, calls, notes };
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
    // "no-match" reads as "it looked and nobody was there". For a
    // profile-only provider that was never given a profile, nothing was
    // looked at -- and the fix is to open the recruiter's profile, not to
    // change providers or top up credits. Say which it was.
    const profileOnly = provider.searchByCompany === false
      && (!provider.searchProbe || probedAndFoundNothing);
    const reason = out.length ? ''
      : (profileOnly && !profiles.length) ? 'needs-named-poster'
      : 'no-match';
    return { results: out, reason, calls, notes };
  }

  /**
   * The single best contact, or ''. Called by the follow-up composer ONLY
   * after the posting, its structured data and the careers page all came
   * back with nothing.
   */
  async function bestEmail(ctx) {
    const r = await findContacts(ctx);
    if (!r.ok || !r.results.length) {
      return { email: '', name: '', reason: r.reason || 'none',
        // What stopped step 1, when step 1 is what stopped. The caller
        // shows this instead of guessing at generic advice.
        profileWhy: r.profileWhy || '', trace: r.trace || [] };
    }
    const top = r.results[0];
    return {
      email: top.email,
      name: top.name || '',
      title: top.title || '',
      personal: isPersonalEmail(top.email),
      source: 'enriched',
      provider: r.source || '',
      alternatives: r.results.slice(1),
    };
  }

  /**
   * One named person -> their verified work address, through whichever
   * provider holds a credential. This is the step every provider here can
   * do, so it works even where a company search is unavailable.
   */
  async function resolveProfile(profileOrUrl, opts) {
    const o = opts || {};
    const cfg = await loadConfig();
    if (cfg.enabled !== true) return { ok: false, results: [], reason: 'disabled' };

    const raw = _clean(profileOrUrl);
    // A string that LOOKS like a profile URL but yields no usable handle --
    // an opaque ACo... URN, or a company page -- must be rejected, not
    // passed through whole. Falling back to the raw input would send the
    // entire URL to the provider as if it were a handle.
    const looksLikeUrl = /linkedin\.com|^https?:|\//i.test(raw);
    const slug = _profileSlugFromUrl(raw) || (looksLikeUrl ? '' : raw.replace(/^@/, ''));
    if (!slug || /\s/.test(slug) || /^ACo[A-Za-z0-9_-]+$/.test(slug)) {
      return { ok: false, results: [], reason: 'bad-profile' };
    }

    const order = [o.provider || cfg.provider || DEFAULT_PROVIDER].concat(Object.keys(PROVIDERS));
    const tried = [];
    for (const id of order) {
      const provider = PROVIDERS[id];
      if (!provider || !provider.lookupByProfile || tried.indexOf(id) !== -1) continue;
      const cred = await getCred(id);
      if (!hasCred(cred, provider)) continue;
      tried.push(id);

      const r = await _findWith(id, { linkedinProfiles: [slug] }, {});
      if (r.results.length) {
        return { ok: true, results: r.results, source: id, profile: slug };
      }
      if (r.reason && r.reason !== 'no-match') {
        return { ok: false, results: [], reason: r.reason, source: id, profile: slug };
      }
    }
    return {
      ok: tried.length > 0,
      results: [],
      reason: tried.length ? 'no-match' : 'no-api-key',
      triedProviders: tried,
      profile: slug,
    };
  }

  global.ContactEnrichment = {
    listProviders, loadConfig, saveConfig, saveKey, clearKey, getCred, resolveProfile,
    createKey, testKey, refreshCred,
    buildQueries, functionTitles, scoreCandidate, isRealEmail, isPersonalEmail,
    disciplineOf, recruiterCovers,
    DEFAULT_ENABLED, DEFAULT_PROVIDER,
    findContacts, bestEmail, clearCache,
    PROVIDERS, TITLE_TIERS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ContactEnrichment;
})(typeof window !== 'undefined' ? window : globalThis);
