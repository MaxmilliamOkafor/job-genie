/**
 * Job titles, company names and places on saved records.
 *
 * Saved jobs come from many writers (this site, the extension, older imports),
 * so a title can arrive as the browser tab text ("Job Application for <role> at
 * <employer>"), a company as a web-address slug ("Signalandstrand"), and a
 * place as "Republic of Ireland ()" or "Dublin, US". These pure helpers are
 * applied when a job is saved and again when old rows are shown. They never
 * invent a place or an employer: they only unwrap, tidy and reuse what the
 * user's own rows already say.
 */

const WRAPPER = /^\s*(?:job\s+)?application\s+for\s+(?:the\s+)?/i;
const SITE_WORDS =
  'careers?|jobs?|job board|jobs board|greenhouse|lever|ashby|ashbyhq|workday|smartrecruiters|workable|recruitee|teamtailor|personio|bamboohr|hiring|join us|apply';
const SITE_SUFFIX = new RegExp(`\\s+[-\u2013\u2014]\\s+(?:${SITE_WORDS})\\s*$`, 'i');
const PLACEHOLDER_COMPANY = /^(?:unknown(?: company)?|n\/?a|-)?$/i;

const squash = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** "at Stripe | Greenhouse" and "at Acme - Careers" keep only the employer. */
export function dropSiteSuffix(employer: string): string {
  let out = squash(employer).split(/\s+\|\s+/)[0];
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(SITE_SUFFIX, '').trim();
  }
  return out;
}

/**
 * "Job Application for <role> at <employer>" and "Application for the <role>
 * at <employer>" give the role and the employer. The role is everything before
 * the LAST " at ", so a " - " inside the role ("Global Payouts - Hunter") stays.
 * The employer is used only when the row has no company of its own.
 */
export function unwrapJobTitle(rawTitle: string, rawCompany = ''): { title: string; company: string } {
  const title = squash(rawTitle);
  const company = squash(rawCompany);
  const ownCompany = PLACEHOLDER_COMPANY.test(company) ? '' : company;
  if (!WRAPPER.test(title)) return { title, company: ownCompany || company };
  let role = title.replace(WRAPPER, '');
  let employer = '';
  const at = role.toLowerCase().lastIndexOf(' at ');
  if (at > 0) {
    employer = dropSiteSuffix(role.slice(at + 4));
    role = role.slice(0, at).trim();
  } else {
    role = role.split(/\s+\|\s+/)[0].trim();
  }
  if (!role) return { title, company: ownCompany || company };
  return { title: role, company: ownCompany || employer || company };
}

// ---------------------------------------------------------------- places

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
const COUNTRY_ALIASES: Record<string, string> = {
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

/** The country a word or code names, or null when it names none (or is ambiguous). */
export function countryOf(value: string): string | null {
  const key = squash(value).toLowerCase().replace(/\.$/, '');
  return COUNTRY_ALIASES[key] ?? null;
}

/**
 * A place as it should be printed: no empty brackets, no repeated parts, and
 * never a known city paired with another country ("Dublin, US" is Dublin,
 * Ireland for these employers). Unknown places are left as written.
 */
export function displayLocation(raw: string | null | undefined): string {
  const cleaned = squash(String(raw ?? ''))
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;|/-]+|[\s,;|/-]+$/g, '')
    .trim();
  if (!cleaned) return '';
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const part of cleaned.split(',').map((p) => p.trim()).filter(Boolean)) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  if (parts.length === 2) {
    const known = CITY_COUNTRY[parts[0].toLowerCase()];
    const named = countryOf(parts[1]);
    if (known && named && named !== known) return `${parts[0]}, ${known}`;
  }
  return parts.join(', ');
}

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleCase = (v: string) => v.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const CITIES = Object.keys(CITY_COUNTRY).sort((a, b) => b.length - a.length);
const COUNTRY_NAMES = Array.from(new Set(Object.keys(COUNTRY_ALIASES).filter((k) => k.length > 3))).sort(
  (a, b) => b.length - a.length,
);

/**
 * "Senior Product Manager, Marketing AI Dublin, Ireland" shows as "Senior
 * Product Manager, Marketing AI" when the row's location already holds Dublin.
 * When the row has no location the place moves there instead of being lost.
 * A title naming a different place from the location is left alone.
 */
export function stripPlaceFromTitle(title: string, location: string): { title: string; location: string } {
  const t = squash(title);
  const loc = squash(location);
  const lower = loc.toLowerCase();
  const headOk = (head: string) => head.split(/\s+/).filter(Boolean).length >= 2;
  for (const city of CITIES) {
    const re = new RegExp(
      `^(.*?\\S)\\s*(?:[,|(\u2013\u2014-]\\s*)?\\(?${escapeRegex(city)}(?:\\s*,\\s*([\\p{L} .]+?))?\\)?\\s*$`,
      'iu',
    );
    const m = re.exec(t);
    if (!m) continue;
    const country = m[2] ? countryOf(m[2]) : null;
    if (m[2] && !country) continue;
    const head = m[1].replace(/[\s,|(\u2013\u2014-]+$/, '').trim();
    if (!headOk(head)) continue;
    if (lower && !lower.includes(city)) continue;
    return { title: head, location: loc || `${titleCase(city)}, ${country ?? CITY_COUNTRY[city]}` };
  }
  for (const name of COUNTRY_NAMES) {
    const re = new RegExp(`^(.*?\\S)\\s*[,|(\u2013\u2014-]\\s*\\(?${escapeRegex(name)}\\)?\\s*$`, 'iu');
    const m = re.exec(t);
    if (!m) continue;
    const head = m[1].replace(/[\s,|(\u2013\u2014-]+$/, '').trim();
    if (!headOk(head)) continue;
    const country = COUNTRY_ALIASES[name];
    if (lower && !lower.includes(name) && !lower.includes(country.toLowerCase())) continue;
    return { title: head, location: loc || country };
  }
  return { title: t, location: loc };
}

// ---------------------------------------------------------------- companies

/** Case, spaces and punctuation ignored; "&" reads as "and". */
export function companyKey(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** One word, no inner capitals or punctuation: how a web-address slug reads. */
export function looksBuiltFromAddress(name: string): boolean {
  const n = squash(name);
  return /^[\p{Lu}\p{Ll}][\p{Ll}\p{N}]+$/u.test(n) && n.length >= 4;
}

/**
 * The name the user's other rows use for each employer. Only spellings that
 * read as a real name (a space, punctuation or an inner capital) qualify, and
 * the most common one wins; ties keep the first seen.
 */
export function companyAliasMap(names: Iterable<string>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const name = squash(raw);
    if (!name || looksBuiltFromAddress(name)) continue;
    const key = companyKey(name);
    if (!key) continue;
    const byName = counts.get(key) ?? new Map<string, number>();
    byName.set(name, (byName.get(name) ?? 0) + 1);
    counts.set(key, byName);
  }
  const out = new Map<string, string>();
  for (const [key, byName] of counts) {
    let best = '';
    let bestCount = 0;
    for (const [name, count] of byName) if (count > bestCount) {
      best = name;
      bestCount = count;
    }
    out.set(key, best);
  }
  return out;
}

export function displayCompany(name: string, aliases?: Map<string, string>): string {
  const n = squash(name);
  if (!aliases || !looksBuiltFromAddress(n)) return n;
  return aliases.get(companyKey(n)) ?? n;
}

// ---------------------------------------------------------------- records

export interface JobLike {
  title: string;
  company: string;
  location?: string | null;
}

/** What a job row should hold when it is saved. */
export function tidyJobForSave<T extends JobLike>(job: T): T {
  const unwrapped = unwrapJobTitle(job.title, job.company);
  const location = displayLocation(job.location ?? '');
  const placed = stripPlaceFromTitle(unwrapped.title, location);
  return {
    ...job,
    title: placed.title,
    company: unwrapped.company,
    ...(job.location !== undefined ? { location: placed.location } : {}),
  };
}

/** What an old or new row shows: the saved tidy-up plus the user's own company spelling. */
export function displayJob<T extends JobLike>(job: T, aliases?: Map<string, string>): T {
  const tidy = tidyJobForSave(job);
  return { ...tidy, company: displayCompany(tidy.company, aliases) };
}
