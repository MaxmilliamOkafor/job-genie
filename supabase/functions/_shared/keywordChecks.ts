import { isGoLanguageMention } from './documentChecks.ts';
const REGIONS = new Set(`Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Ontario|Prince Edward Island|Quebec|Saskatchewan|Northwest Territories|Nunavut|Yukon|EMEA|APAC|LATAM|Europe|Asia|Africa|North America|South America|Middle East|Caribbean`.toLowerCase().split('|'));
const STATES = new Set('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|United Kingdom|United States|UK|USA|US|EU|European Union|Scotland|England|Wales|Northern Ireland'.toLowerCase().split("|"));
const PLACE_WORDS = new Set(('uae ksa uk usa us eu emea apac mena gcc latam anz dach nordics benelux sar remote hybrid onsite global worldwide '
  + 'dubai abu dhabi sharjah riyadh jeddah doha kuwait manama muscat cairo istanbul tel aviv london dublin belfast edinburgh manchester '
  + 'paris berlin munich frankfurt hamburg amsterdam rotterdam brussels zurich geneva vienna madrid barcelona lisbon milan rome warsaw '
  + 'krakow prague budapest bucharest stockholm oslo copenhagen helsinki tallinn singapore hong kong kowloon kuala lumpur jakarta bangkok '
  + 'manila ho chi minh hanoi taipei seoul tokyo osaka shanghai beijing shenzhen bangalore bengaluru mumbai delhi hyderabad pune chennai '
  + 'sydney melbourne auckland toronto vancouver montreal new york san francisco seattle austin boston chicago los angeles dallas miami '
  + 'denver atlanta washington lagos nairobi johannesburg cape town city region area').split(/\s+/));
let countryWords: Set<string> | null = null;
function placeOnly(key: string): boolean {
  if (!countryWords) {
    countryWords = new Set();
    try {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const n = names.of(String.fromCharCode(a, b));
        if (n && n.length > 2 && !/^[A-Z]{2}$/.test(n)) {
          for (const w of n.toLowerCase().replace(/[(),.&]/g, ' ').split(/\s+/)) {
            if (w.length > 2 && !/^(?:and|the|of|islands?|republic|united|states|saint|new|south|north|east|west|central)$/.test(w)) countryWords.add(w);
          }
        }
      }
    } catch { /* the list above only */ }
  }
  const words = key.replace(/[(),.]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => PLACE_WORDS.has(w) || countryWords!.has(w));
}

export function excludedKeyword(term: string): boolean {
  const key = term.toLowerCase().trim();
  if (/\b(?:consultants|managers|engineers|analysts|developers|stakeholders|clients|partners|users|customers|vendors|employees|teams)$/.test(key)) return true;
  if (/\b(?:provinces?|states?|regions?|countries|territories|time zones?)$/.test(key)) return true;
  if (/^(?:utc|gmt|[ecmp][ds]t|bst|ist|cet|cest|aest|aedt)(?:\s*[+-]\s*\d+)?$/.test(key)) return true;
  if (/^go[- ](?:live|to)(?:\b|[- ])/.test(key)) return true;
  if (REGIONS.has(key) || STATES.has(key)) return true;
  // "Dubai UAE", "Hong Kong SAR", "Kuala Lumpur, Malaysia", "UK Remote"
  // (Bybit, 5 Nov): every word a place, so the phrase is where the job is.
  if (placeOnly(key)) return true;
  const countries = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (countries.of(code)?.toLowerCase() === key && key !== code.toLowerCase()) return true;
  }
  return false;
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeTerm = (term: string, flags = 'i') => new RegExp(`(?<![\\w&/+#])${escRe(term)}(?![\\w&/+#])`, flags);
const normName = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Phrases where a skill-shaped word is not asked of the candidate (10 Nov):
// "X is hiring", "our leadership team", "shipping models to production", and
// the departments a role partners with ("Partner with FP&A, Tax and Treasury").
const NOT_ASKED_SPANS: RegExp[] = [
  /\b(?:is|are|we're|we are|now|currently)\s+hiring\b/gi,
  /\b(?:our|the|senior|executive|wider|global)\s+leadership\s+team\b/gi,
  /\bshipping\s+(?:[\w-]+\s+){0,3}?(?:models?|features?|code|products?|software|updates?|releases?|to production)\b/gi,
  // Capitalised department names only, so "partner with engineering to build in Python" still asks for Python.
  /\b(?:[Pp]artner(?:s|ing)?|[Ww]ork(?:s|ing)?\s+closely|[Cc]ollaborat(?:e|es|ing)|[Ll]iais(?:e|es|ing))\s+(?:closely\s+)?with\s+(?:our\s+|the\s+)?[A-Z][\w&]*(?:\s+[A-Z][\w&]*)*(?:\s*,\s*[A-Z][\w&]*(?:\s+[A-Z][\w&]*)*)*(?:,?\s+and\s+[A-Z][\w&]*(?:\s+[A-Z][\w&]*)*)?/g,
];

/** The employer named by "X is hiring" when no company is supplied. */
export function postingEmployer(posting: string): string {
  const m = /^\s*([A-Z][\w&.' -]{1,40}?)\s+(?:is|are)\s+hiring\b/m.exec(String(posting || ''));
  return m ? m[1].trim() : '';
}

/** True when the posting only uses the term in a phrase that does not ask for it. */
export function onlyInNonRequirementPhrase(term: string, posting: string): boolean {
  const text = String(posting || '');
  const re = wholeTerm(term);
  if (!text || !re.test(text)) return false;
  let blanked = text;
  for (const span of NOT_ASKED_SPANS) blanked = blanked.replace(span, (m) => ' '.repeat(m.length));
  return !re.test(blanked);
}

/** "FP" from "FP&A" and "CI" from "CI/CD": never on its own in the posting. */
export function isFragmentOfLongerTerm(term: string, posting: string): boolean {
  const text = String(posting || '');
  if (!text || /[&/]/.test(term)) return false;
  const glued = new RegExp(`(?:[A-Za-z][&/]${escRe(term)}|${escRe(term)}[&/][A-Za-z])`, 'i');
  return glued.test(text) && !wholeTerm(term).test(text);
}

/** The employer's own name, unless the posting asks for experience with it by name. */
export function isEmployerName(term: string, posting: string, company = ''): boolean {
  const name = normName(company || postingEmployer(posting));
  if (!name || normName(term) !== name) return false;
  const asked = new RegExp(`\\b(?:experience|familiarity|knowledge|proficiency|expertise|background|hands-on)\\s+(?:\\w+\\s+){0,3}?(?:with|of|in|using)\\s+(?:[\\w-]+\\s+){0,4}?${escRe(String(term).trim())}\\b`, 'i');
  return !asked.test(String(posting || ''));
}

/** The requirement the posting actually names: "SOX controls" is SOX, "GAAP" under "US GAAP" is US GAAP. */
export function canonicalRequirement(term: string, posting: string): string {
  const t = String(term || '').trim();
  const text = String(posting || '');
  if (/^sox(?:\s+it)?\s+controls?$/i.test(t) && !/\bSOX\s+IT\s+controls?\b/i.test(text)) return 'SOX';
  if (/^gaap$/i.test(t)) {
    const q = /\b(US|U\.S\.|UK)\s+GAAP\b/i.exec(text);
    const bare = text.replace(/\b(?:US|U\.S\.|UK)\s+GAAP\b/gi, ' ');
    if (q && !/\bGAAP\b/i.test(bare)) return `${q[1].replace(/\./g, '').toUpperCase()} GAAP`;
  }
  return t;
}

export function filterJobKeywords(terms: string[], posting: string, company = ''): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms || []) {
    const term = canonicalRequirement(String(raw || ''), posting);
    if (!term) continue;
    if (excludedKeyword(term)) continue;
    if (term.toLowerCase() === 'go' && !isGoLanguageMention(posting)) continue;
    // Bare numbers and counts ("6+", "10", "6+ years") are never requirements.
    if (/^\d+(?:\.\d+)?\s*\+?\s*%?(?:\s*(?:yrs?|years?))?$/i.test(term)) continue;
    if (isEmployerName(term, posting, company)) continue;
    if (isFragmentOfLongerTerm(term, posting)) continue;
    if (onlyInNonRequirementPhrase(term, posting)) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/** Filter each extracted category before it can feed a prompt or score. */
export function filterJobKeywordLists<T extends Record<string, string[]>>(lists: T, posting: string, company = ''): T {
  return Object.fromEntries(Object.entries(lists).map(([key, terms]) => [key, filterJobKeywords(terms, posting, company)])) as T;
}