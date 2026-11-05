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
export function filterJobKeywords(terms: string[], posting: string): string[] {
  return terms.filter((term) => !excludedKeyword(term) && (term.toLowerCase() !== 'go' || isGoLanguageMention(posting)));
}

/** Filter each extracted category before it can feed a prompt or score. */
export function filterJobKeywordLists<T extends Record<string, string[]>>(lists: T, posting: string): T {
  return Object.fromEntries(Object.entries(lists).map(([key, terms]) => [key, filterJobKeywords(terms, posting)])) as T;
}