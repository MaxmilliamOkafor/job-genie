/**
 * Where a vacancy is, read from the employer's own location text.
 *
 * "Dublin, IE", "Co. Dublin", "Ireland", "Remote - Ireland" and "Remote, EMEA"
 * all describe places a Dublin candidate can work; "Dublin, Ohio" does not.
 * placesOf() reads each place a posting names into a country, a city and, for
 * remote postings, the region the remote work covers. Nothing is guessed: an
 * unknown word stays unknown and a bare "Remote" has no region. Pure: the job
 * import stores the first place, and the website checks every place.
 */

/** Cities whose country is not in doubt for this user's searches. */
export const CITY_COUNTRY: Record<string, string> = {
  dublin: 'Ireland', cork: 'Ireland', galway: 'Ireland', limerick: 'Ireland', waterford: 'Ireland',
  london: 'United Kingdom', manchester: 'United Kingdom', edinburgh: 'United Kingdom', glasgow: 'United Kingdom',
  belfast: 'United Kingdom', birmingham: 'United Kingdom', bristol: 'United Kingdom', leeds: 'United Kingdom',
  paris: 'France', lyon: 'France', berlin: 'Germany', munich: 'Germany', hamburg: 'Germany', frankfurt: 'Germany',
  amsterdam: 'Netherlands', rotterdam: 'Netherlands', madrid: 'Spain', barcelona: 'Spain', lisbon: 'Portugal',
  porto: 'Portugal', braga: 'Portugal', warsaw: 'Poland', krakow: 'Poland', zurich: 'Switzerland', geneva: 'Switzerland',
  stockholm: 'Sweden', copenhagen: 'Denmark', oslo: 'Norway', helsinki: 'Finland', vienna: 'Austria',
  prague: 'Czechia', brussels: 'Belgium', milan: 'Italy', rome: 'Italy', budapest: 'Hungary',
  'new york': 'United States', 'san francisco': 'United States', seattle: 'United States', austin: 'United States',
  boston: 'United States', chicago: 'United States', 'los angeles': 'United States',
  toronto: 'Canada', vancouver: 'Canada', montreal: 'Canada', sydney: 'Australia', melbourne: 'Australia',
  singapore: 'Singapore', bangalore: 'India', bengaluru: 'India', tokyo: 'Japan', 'tel aviv': 'Israel',
  'sao paulo': 'Brazil', 'são paulo': 'Brazil',
};

/** Country words and codes, mapped to one name. "CA" is left out: California or Canada. */
export const COUNTRY_ALIASES: Record<string, string> = {
  ie: 'Ireland', ireland: 'Ireland', 'republic of ireland': 'Ireland', roi: 'Ireland',
  uk: 'United Kingdom', gb: 'United Kingdom', 'united kingdom': 'United Kingdom', 'great britain': 'United Kingdom',
  england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom', 'northern ireland': 'United Kingdom',
  us: 'United States', usa: 'United States', 'united states': 'United States', 'united states of america': 'United States',
  de: 'Germany', germany: 'Germany', fr: 'France', france: 'France', nl: 'Netherlands', netherlands: 'Netherlands',
  es: 'Spain', spain: 'Spain', pt: 'Portugal', portugal: 'Portugal', pl: 'Poland', poland: 'Poland',
  ch: 'Switzerland', switzerland: 'Switzerland', se: 'Sweden', sweden: 'Sweden', dk: 'Denmark', denmark: 'Denmark',
  no: 'Norway', norway: 'Norway', fi: 'Finland', finland: 'Finland', at: 'Austria', austria: 'Austria',
  be: 'Belgium', belgium: 'Belgium', it: 'Italy', italy: 'Italy', hu: 'Hungary', hungary: 'Hungary',
  cz: 'Czechia', czechia: 'Czechia', 'czech republic': 'Czechia', canada: 'Canada', au: 'Australia', australia: 'Australia',
  sg: 'Singapore', singapore: 'Singapore', in: 'India', india: 'India', jp: 'Japan', japan: 'Japan',
  il: 'Israel', israel: 'Israel', br: 'Brazil', brazil: 'Brazil', mx: 'Mexico', mexico: 'Mexico',
  kr: 'South Korea', 'south korea': 'South Korea',
};

/** Two-letter codes stored with each vacancy. */
export const COUNTRY_CODE: Record<string, string> = {
  Ireland: 'IE', 'United Kingdom': 'GB', 'United States': 'US', Germany: 'DE', France: 'FR', Netherlands: 'NL',
  Spain: 'ES', Portugal: 'PT', Poland: 'PL', Switzerland: 'CH', Sweden: 'SE', Denmark: 'DK', Norway: 'NO',
  Finland: 'FI', Austria: 'AT', Belgium: 'BE', Italy: 'IT', Hungary: 'HU', Czechia: 'CZ', Canada: 'CA',
  Australia: 'AU', Singapore: 'SG', India: 'IN', Japan: 'JP', Israel: 'IL', Brazil: 'BR', Mexico: 'MX',
  'South Korea': 'KR',
};

export const COUNTRY_FROM_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_CODE).map(([name, code]) => [code, name]),
);

const US_STATES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
  de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan',
  mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada',
  nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york state', nc: 'north carolina',
  nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island',
  sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia',
  wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia',
};
const US_STATE_NAMES = new Set(Object.values(US_STATES));

/** Remote regions as employers write them, mapped to one stored name. */
const REGION_WORDS: Array<[RegExp, string]> = [
  [/^(?:uk\s*(?:&|and)\s*ireland|uki|ireland\s*(?:&|and)\s*(?:the\s+)?uk|british isles)$/i, 'UK & Ireland'],
  [/^(?:emea|europe,? middle east(?:,? and|,? &)? africa)$/i, 'EMEA'],
  [/^(?:eu|european union|eea|eu\/eea)$/i, 'EU'],
  [/^(?:europe|european|continental europe|cet|cet timezone|european time ?zones?)$/i, 'Europe'],
  [/^(?:worldwide|anywhere|global|globally|international|any location|all locations|anywhere in the world)$/i, 'Worldwide'],
  [/^(?:north america|amer|na)$/i, 'North America'],
  [/^(?:americas|latam|latin america|south america)$/i, 'Americas'],
  [/^(?:apac|asia pacific|asia-pacific|asia)$/i, 'APAC'],
];

const EU = new Set([
  'Ireland', 'Germany', 'France', 'Netherlands', 'Spain', 'Portugal', 'Poland', 'Sweden', 'Denmark', 'Finland',
  'Austria', 'Belgium', 'Italy', 'Hungary', 'Czechia',
]);
const EUROPE = new Set([...EU, 'United Kingdom', 'Switzerland', 'Norway']);
const EMEA = new Set([...EUROPE, 'Israel']);

/** Whether remote work open to this region can be done from the country. */
export function regionCovers(region: string | null | undefined, country: string): boolean {
  if (!region || !country) return false;
  if (region === country || region === 'Worldwide') return true;
  switch (region) {
    case 'UK & Ireland': return country === 'Ireland' || country === 'United Kingdom';
    case 'EU': return EU.has(country);
    case 'Europe': return EUROPE.has(country);
    case 'EMEA': return EMEA.has(country);
    case 'North America': return country === 'United States' || country === 'Canada' || country === 'Mexico';
    case 'Americas': return ['United States', 'Canada', 'Mexico', 'Brazil'].includes(country);
    case 'APAC': return ['Singapore', 'India', 'Japan', 'Australia', 'South Korea'].includes(country);
    default: return false;
  }
}

/** The regions whose remote work a country can take, for narrowing a search. */
export function regionsCovering(country: string): string[] {
  if (!country) return [];
  return [country, 'UK & Ireland', 'EU', 'Europe', 'EMEA', 'North America', 'Americas', 'APAC', 'Worldwide']
    .filter((r) => regionCovers(r, country));
}

export interface Place {
  /** Country name ("Ireland"), or null when the text does not say. */
  country: string | null;
  /** City as written, tidied ("Dublin" from "Co. Dublin" or "Dublin 2"). */
  city: string | null;
  remote: boolean;
  /** For remote work: the region it covers ("EMEA", "Ireland"), or null when unstated. */
  region: string | null;
}

const squash = (v: string) => String(v ?? '').replace(/\s+/g, ' ').trim();
const titleCase = (v: string) => v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

const REMOTE_WORD = /\b(?:remote|remotely|work from home|wfh|distributed|telecommute|fully remote)\b/i;
const NOISE = /\b(?:remote|remotely|fully|hybrid|on-?site|in-?office|office|based|first|friendly|work from home|wfh|distributed|telecommute|location|locations|only|preferred|time ?zones?|timezone)\b/gi;

function regionOf(part: string): string | null {
  const key = squash(part.replace(/[()]/g, ''));
  for (const [re, name] of REGION_WORDS) if (re.test(key)) return name;
  return null;
}

/** A country named by a word, or by a code written in capitals ("IE", not "in"). */
function countryOfPart(part: string): string | null {
  const key = squash(part).replace(/\.$/, '');
  const lower = key.toLowerCase();
  if (lower.length <= 3) return key === key.toUpperCase() ? COUNTRY_ALIASES[lower] ?? null : null;
  return COUNTRY_ALIASES[lower] ?? null;
}

function stateOf(part: string): { code: string } | null {
  const key = squash(part).replace(/\.$/, '');
  const lower = key.toLowerCase();
  if (lower.length === 2 && key === key.toUpperCase() && US_STATES[lower]) return { code: lower };
  if (US_STATE_NAMES.has(lower) && !COUNTRY_ALIASES[lower]) return { code: lower };
  return null;
}

function cityOf(part: string): string | null {
  const city = squash(
    part
      .replace(/^(?:co\.?|county)\s+/i, '')
      .replace(/\s+(?:\d{1,2}|city(?: centre| center)?|area|metro(?:politan)?(?: area)?|region)$/i, '')
      .replace(/[^\p{L}\p{N}' .-]/gu, ' '),
  );
  return /\p{L}{2,}/u.test(city) ? city : null;
}

/** Read one place ("Remote - Ireland", "Dublin, OH", "Co. Dublin"). */
export function parsePlace(text: string, workplaceType?: string | null): Place {
  const raw = squash(text);
  const remote = REMOTE_WORD.test(raw) || workplaceType === 'Remote';
  const parts = raw
    .replace(/\(([^)]*)\)/g, ', $1')
    .split(/\s*(?:,|\s[-\u2013\u2014|]\s|:|\s\/\s)\s*/)
    .map((p) => squash(p.replace(NOISE, ' ').replace(/^(?:in|within|from|across|-)\s+/i, '').replace(/^[-\s]+|[-\s]+$/g, '')))
    .filter(Boolean);

  let city: string | null = null;
  let named: string | null = null;
  let state: { code: string } | null = null;
  let region: string | null = null;
  for (const part of parts) {
    const r = regionOf(part);
    if (r) { region = region ?? r; continue; }
    const c = countryOfPart(part);
    if (c) { named = named ?? c; continue; }
    const s = stateOf(part);
    if (s && city) { state = state ?? s; continue; }
    if (/^(?:leinster|munster|connacht|ulster|province|county|co\.?)$/i.test(part)) continue;
    if (!city) city = cityOf(part);
  }

  const known = city ? CITY_COUNTRY[city.toLowerCase()] ?? null : null;
  let country: string | null;
  if (state) country = state.code === 'ca' && known === 'Canada' ? 'Canada' : 'United States';
  else if (named && known && named !== known) country = known; // "Dublin, US" is Dublin, Ireland for these employers
  else country = named ?? known;

  if (city && COUNTRY_ALIASES[city.toLowerCase()]) city = null;
  if (remote && !region) region = country;
  return { country, city: city ? titleCase(city) : null, remote, region: remote ? region : null };
}

/** Every place a posting names: "Dublin, Ireland; London, UK" is two. */
export function placesOf(location: string | null | undefined, workplaceType?: string | null): Place[] {
  const text = squash(String(location ?? ''));
  if (!text) return workplaceType === 'Remote' ? [{ country: null, city: null, remote: true, region: null }] : [];
  return text
    .split(/\s*(?:;|\s\|\s|\bor\b|\n|\s&\s(?=remote\b))\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parsePlace(p, workplaceType));
}

/** What the job import stores for a posting: its first place. */
export function storedPlace(location: string | null | undefined, workplaceType?: string | null): {
  country_code: string | null;
  city: string | null;
  remote_region: string | null;
} {
  const first = placesOf(location, workplaceType)[0];
  if (!first) return { country_code: null, city: null, remote_region: null };
  return {
    country_code: first.country ? COUNTRY_CODE[first.country] ?? null : null,
    city: first.city,
    remote_region: first.remote ? first.region : null,
  };
}

/** How a matched place is labelled in results: "Dublin", "Ireland" or "Remote, EMEA". */
export function placeLabel(place: Place): string {
  if (place.remote) return place.region ? `Remote, ${place.region}` : 'Remote';
  return place.city ?? place.country ?? '';
}
