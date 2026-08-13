/**
 * REGIONAL FORMAT — what actually changes between countries, and what does not.
 * =============================================================================
 *
 * Two honest categories, and it matters which is which:
 *
 * DOES NOT VARY, AND IS NOT WHY ANYTHING GETS REJECTED
 *   Page size, margins, and page count are invisible to an ATS. Every
 *   parser -- Workday, Greenhouse, Lever, Taleo, iCIMS, SuccessFactors,
 *   Ashby, SmartRecruiters -- reads the text stream out of the DOCX/PDF.
 *   None of them reads <w:pgSz>. A CV is not rejected for being A4 in
 *   Boston. What DOES break parsing is structural: tables, text boxes,
 *   multi-column layouts, headers/footers, and images -- and this
 *   generator emits none of those, anywhere, for any region. That is the
 *   guarantee that keeps layout from ever being the reason.
 *
 * DOES VARY, AND IS WORTH GETTING RIGHT
 *   1. Spelling. Plenty of ATS keyword scoring is literal substring
 *      matching. A Chicago posting asking for "optimization" does not
 *      match a CV that says "optimisation". Same word, missed keyword.
 *      This is the one regional difference with a real scoring effect.
 *   2. Paper. A4 printed on US Letter loses the bottom of the page, and
 *      Letter printed on A4 leaves a dead band. Only matters once a human
 *      prints it -- but it costs nothing to get right.
 *   3. What the document is called. In the US, "CV" means the academic
 *      publication list; the word for this document is "resume".
 *
 * DELIBERATELY NOT DONE
 *   Photograph, date of birth, marital status, nationality, gender. Some
 *   European conventions still expect them. They are omitted for every
 *   region without exception: they are illegal to consider in the US and
 *   UK, they trigger anti-bias screening, a photo is an image and images
 *   are the single most reliable way to break a parser -- and the
 *   photograph is excluded by explicit instruction. No region flag turns
 *   any of these on. See tests/regional-format.test.cjs.
 */
(function (global) {
  'use strict';

  // ---- Paper -----------------------------------------------------------
  // US Letter (216x279mm) territory. Everywhere else on earth is A4
  // (210x297mm), including Brazil and Argentina, which is why paper and
  // spelling are two separate lists rather than one "region".
  const LETTER_COUNTRIES = new Set([
    'US', 'CA', 'MX', 'PH',
    'CL', 'CO', 'CR', 'DO', 'EC', 'GT', 'HN', 'NI', 'PA', 'PE', 'PR', 'SV', 'VE',
  ]);

  // ---- Spelling --------------------------------------------------------
  // Where business English is American English. The rest of the world --
  // UK, Ireland, the EU, Africa, South Asia, Australia, New Zealand,
  // Singapore, Malaysia, Hong Kong, the Gulf -- writes British English.
  const US_ENGLISH_COUNTRIES = new Set([
    'US', 'CA', 'MX', 'PH', 'JP', 'KR', 'CN', 'TW', 'IL',
    'AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'GT', 'HN',
    'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
  ]);

  // Page geometry. Twips for OOXML (1440/inch), millimetres for anything
  // that wants them, and the string jsPDF expects.
  const PAGES = {
    A4:     { name: 'A4',     twips: { w: 11906, h: 16838 }, mm: { w: 210, h: 297 }, pdf: 'a4' },
    LETTER: { name: 'LETTER', twips: { w: 12240, h: 15840 }, mm: { w: 216, h: 279 }, pdf: 'letter' },
  };

  // ---- Country recognition --------------------------------------------
  // Written-out names and the aliases that actually turn up in postings.
  // "Remote - United States", "London, UK", "Dublin, Ireland", "Munich,
  // Germany", "Lagos, Nigeria", "Bengaluru, India".
  const COUNTRY_NAMES = {
    'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'u.s.': 'US',
    'u.s.a.': 'US', 'america': 'US', 'the united states': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'u.k.': 'GB', 'great britain': 'GB',
    'britain': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
    'northern ireland': 'GB',
    'ireland': 'IE', 'republic of ireland': 'IE', 'eire': 'IE',
    'canada': 'CA', 'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR',
    'chile': 'CL', 'colombia': 'CO', 'peru': 'PE', 'uruguay': 'UY',
    'venezuela': 'VE', 'ecuador': 'EC', 'costa rica': 'CR', 'panama': 'PA',
    'guatemala': 'GT', 'puerto rico': 'PR', 'dominican republic': 'DO',
    'germany': 'DE', 'deutschland': 'DE', 'france': 'FR', 'spain': 'ES',
    'italy': 'IT', 'netherlands': 'NL', 'the netherlands': 'NL', 'holland': 'NL',
    'belgium': 'BE', 'switzerland': 'CH', 'austria': 'AT', 'poland': 'PL',
    'portugal': 'PT', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK',
    'finland': 'FI', 'czech republic': 'CZ', 'czechia': 'CZ', 'romania': 'RO',
    'hungary': 'HU', 'greece': 'GR', 'bulgaria': 'BG', 'croatia': 'HR',
    'slovakia': 'SK', 'slovenia': 'SI', 'estonia': 'EE', 'latvia': 'LV',
    'lithuania': 'LT', 'luxembourg': 'LU', 'iceland': 'IS', 'malta': 'MT',
    'cyprus': 'CY', 'ukraine': 'UA', 'turkey': 'TR', 'türkiye': 'TR',
    'nigeria': 'NG', 'south africa': 'ZA', 'kenya': 'KE', 'ghana': 'GH',
    'egypt': 'EG', 'morocco': 'MA', 'ethiopia': 'ET', 'tanzania': 'TZ',
    'uganda': 'UG', 'rwanda': 'RW', 'senegal': 'SN', 'tunisia': 'TN',
    'india': 'IN', 'pakistan': 'PK', 'bangladesh': 'BD', 'sri lanka': 'LK',
    'china': 'CN', 'japan': 'JP', 'south korea': 'KR', 'korea': 'KR',
    'taiwan': 'TW', 'hong kong': 'HK', 'singapore': 'SG', 'malaysia': 'MY',
    'indonesia': 'ID', 'thailand': 'TH', 'vietnam': 'VN', 'philippines': 'PH',
    'australia': 'AU', 'new zealand': 'NZ',
    'united arab emirates': 'AE', 'uae': 'AE', 'saudi arabia': 'SA',
    'qatar': 'QA', 'kuwait': 'KW', 'bahrain': 'BH', 'oman': 'OM',
    'israel': 'IL', 'jordan': 'JO', 'lebanon': 'LB',
  };

  // Two-letter codes we will accept as countries when they appear in the
  // trailing position of a location. Restricted to codes we actually have
  // a rule for, so a stray token cannot silently pick a region.
  const KNOWN_ISO2 = new Set(
    Object.values(COUNTRY_NAMES).concat(Array.from(LETTER_COUNTRIES))
      .concat(Array.from(US_ENGLISH_COUNTRIES))
  );

  // US state codes and names. "Austin, TX" and "Austin, Texas" both have
  // to resolve to the US, and neither carries the word "United States".
  const US_STATES = {
    al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
    co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
    hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa',
    ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland',
    ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi',
    mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada',
    nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York',
    nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma',
    or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina',
    sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont',
    va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin',
    wy: 'Wyoming', dc: 'District of Columbia',
  };
  const US_STATE_CODES = new Set(Object.keys(US_STATES));
  const US_STATE_NAMES = new Set(Object.values(US_STATES).map((s) => s.toLowerCase()));

  // Canadian provinces, for the same reason: "Toronto, ON".
  const CA_PROVINCES = new Set(['on', 'qc', 'bc', 'ab', 'mb', 'sk', 'ns', 'nb', 'nl', 'pe', 'yt', 'nt', 'nu']);
  const CA_PROVINCE_NAMES = new Set(['ontario', 'quebec', 'québec', 'british columbia',
    'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick',
    'newfoundland', 'newfoundland and labrador', 'prince edward island']);

  // Codes that are a US state AND a country. Resolving these by country
  // first would send "Ontario, CA" to Canada and "Los Angeles, CA" to
  // Canada as well. The state reading wins when a city precedes it.
  const AMBIGUOUS = new Set(['ca', 'in', 'de', 'la', 'ma', 'me', 'mo', 'pa', 'sc', 'va', 'ne', 'ms', 'mt', 'md', 'al', 'ar', 'co', 'ct', 'ga', 'id', 'ky', 'mn', 'nc', 'ok', 'sd', 'tn']);

  function iso2FromToken(token) {
    const t = String(token || '').trim().toLowerCase().replace(/\.$/, '');
    if (!t) return null;
    if (COUNTRY_NAMES[t]) return COUNTRY_NAMES[t];
    if (/^[a-z]{2}$/.test(t)) {
      const up = t.toUpperCase();
      if (KNOWN_ISO2.has(up)) return up;
    }
    return null;
  }

  /**
   * Work out which country a posting's location refers to.
   *
   * Returns an ISO2 code, or null when the string carries no country at
   * all ("Remote", "Hybrid", ""). Null is a real answer and callers are
   * expected to fall back rather than guess -- inventing a country here
   * would silently switch a CV's spelling on no evidence.
   */
  function detectCountry(location) {
    const raw = String(location == null ? '' : location).trim();
    if (!raw) return null;

    // "Remote - United States", "Hybrid (Dublin, Ireland)", "Remote, EMEA"
    const cleaned = raw
      .replace(/[()[\]]/g, ',')
      .replace(/\b(remote|hybrid|on-?site|in-?office|flexible|work from home|wfh)\b/gi, ',')
      .replace(/\s+/g, ' ');

    const parts = cleaned.split(/\s*[,;/|]\s*|\s+-\s+/)
      .map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;

    // Walk right to left: the country is conventionally last.
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i].toLowerCase();

      if (US_STATE_NAMES.has(p)) return 'US';
      if (CA_PROVINCE_NAMES.has(p)) return 'CA';

      // A bare two-letter token that is both a state and a country: read
      // it as a state when something precedes it ("Austin, TX" /
      // "Los Angeles, CA"), and as a country when it stands alone.
      if (/^[a-z]{2}$/.test(p) && AMBIGUOUS.has(p) && i > 0) {
        if (US_STATE_CODES.has(p)) return 'US';
        if (CA_PROVINCES.has(p)) return 'CA';
      }

      const iso = iso2FromToken(p);
      if (iso) return iso;

      if (US_STATE_CODES.has(p) && i > 0) return 'US';
      if (CA_PROVINCES.has(p) && i > 0) return 'CA';
    }

    // Last resort: a country name sitting inside a longer phrase, e.g.
    // "Greater London, United Kingdom Area".
    const low = cleaned.toLowerCase();
    let best = null;
    for (const name of Object.keys(COUNTRY_NAMES)) {
      if (name.length < 4) continue;
      if (new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(low)) {
        if (!best || name.length > best.length) best = name;
      }
    }
    return best ? COUNTRY_NAMES[best] : null;
  }

  /**
   * Everything the generators need for one application, from the posting's
   * location. `fallbackLocation` is the candidate's own location, used only
   * when the posting says nothing -- a CV with no evidence about where it
   * is going keeps the format the candidate already had.
   */
  function resolveRegion(location, fallbackLocation) {
    let iso2 = detectCountry(location);
    let source = 'posting';
    if (!iso2) {
      iso2 = detectCountry(fallbackLocation);
      source = iso2 ? 'candidate' : 'default';
    }

    // No evidence anywhere: A4 and British English. That is the correct
    // default for an Ireland-based candidate and the correct default for
    // the majority of the world; it is never wrong enough to matter,
    // because neither choice can cause a rejection.
    const page = iso2 && LETTER_COUNTRIES.has(iso2) ? PAGES.LETTER : PAGES.A4;
    const spelling = iso2 && US_ENGLISH_COUNTRIES.has(iso2) ? 'US' : 'UK';

    return {
      iso2: iso2 || null,
      source,
      page: page.name,
      pageTwips: page.twips,
      pageMm: page.mm,
      pdfFormat: page.pdf,
      spelling,
      // "CV" everywhere except North America, where it means the academic
      // document and "resume" is the word for this one.
      documentWord: (iso2 === 'US' || iso2 === 'CA') ? 'Resume' : 'CV',
      // Never true. Present so that any future caller reaching for a
      // region-specific photo finds an explicit "no" rather than an
      // absence, and so the guarantee is testable.
      includePhoto: false,
      includeDateOfBirth: false,
      includeMaritalStatus: false,
      includeNationality: false,
    };
  }

  const RegionalFormat = {
    detectCountry,
    resolveRegion,
    PAGES,
    LETTER_COUNTRIES,
    US_ENGLISH_COUNTRIES,
  };

  global.RegionalFormat = RegionalFormat;
  if (typeof module !== 'undefined' && module.exports) module.exports = RegionalFormat;
})(typeof globalThis !== 'undefined' ? globalThis : this);
