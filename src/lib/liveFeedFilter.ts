/**
 * Live feed results checked against what the user actually searched for.
 *
 * The database search matches words anywhere ("data" and "engineer" in a sales
 * description), so the keyword search (with its "Also searched" wordings) is
 * applied here as a phrase to the title and description, and the location to
 * the vacancy's own location. A remote vacancy elsewhere is kept only when the
 * remote filter allows it and its remote region includes the user's country.
 */
import { CITY_COUNTRY, countryOf } from './jobRecords';
import { employerReadableText } from '../../supabase/functions/_shared/employerText';

export interface FeedJob {
  title: string;
  description: string | null;
  location: string | null;
  workplace_type: string | null;
}

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "data engineer" as a phrase: whole words, any spacing or hyphen, plural allowed. */
export function phrasePattern(term: string): RegExp | null {
  const words = term.toLowerCase().trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return null;
  const body = words.map(escapeRegex).join('[\\s\\-]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:s|es)?(?![\\p{L}\\p{N}])`, 'iu');
}

/** Whether the title itself names the searched role (title matches are listed first). */
export function titleMatchesSearch(title: string, terms: string[]): boolean {
  return terms.map(phrasePattern).some((p) => Boolean(p && p.test(title)));
}

export function matchesKeywordSearch(job: Pick<FeedJob, 'title' | 'description'>, terms: string[]): boolean {
  const patterns = terms.map(phrasePattern).filter((p): p is RegExp => Boolean(p));
  if (!patterns.length) return true;
  const text = `${job.title}\n${employerReadableText(job.description ?? '')}`;
  return patterns.some((p) => p.test(text));
}

/** Regions that include each country, as employers write them. */
const EUROPE = ['europe', 'emea', 'eu', 'european union', 'eea'];
const REGIONS_FOR: Record<string, string[]> = {
  Ireland: ['ireland', 'uk & ireland', 'uk and ireland', 'uki', ...EUROPE],
  'United Kingdom': ['united kingdom', 'uk', 'gb', 'britain', 'uk & ireland', 'uk and ireland', 'uki', ...EUROPE],
  'United States': ['united states', 'usa', 'us', 'north america', 'americas', 'amer'],
  Canada: ['canada', 'north america', 'americas', 'amer'],
};
const WORLDWIDE = ['worldwide', 'anywhere', 'global', 'globally', 'international', 'any location', 'all locations'];

function regionsFor(country: string): string[] {
  const own = country.toLowerCase();
  return [own, ...(REGIONS_FOR[country] ?? (EUROPE_COUNTRIES.has(country) ? EUROPE : [])), ...WORLDWIDE];
}
const EUROPE_COUNTRIES = new Set([
  'Ireland', 'United Kingdom', 'Germany', 'France', 'Netherlands', 'Spain', 'Portugal', 'Poland', 'Switzerland',
  'Sweden', 'Denmark', 'Norway', 'Finland', 'Austria', 'Belgium', 'Italy', 'Hungary', 'Czechia',
]);

export function isRemote(job: Pick<FeedJob, 'location' | 'workplace_type'>): boolean {
  return job.workplace_type === 'Remote' || /\bremote\b/i.test(job.location ?? '');
}

/**
 * Whether a remote vacancy's stated region includes the country. A bare
 * "Remote" with no region does not: the region is unknown, so it is not shown.
 */
export function remoteRegionIncludes(location: string | null, country: string): boolean {
  if (!country) return false;
  const text = ` ${String(location ?? '').toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, ' ')} `;
  return regionsFor(country).some((r) => text.includes(` ${r.replace(/[^\p{L}\p{N}&]+/gu, ' ').trim()} `));
}

/** The user's country: the profile's, else the one the searched place is in. */
export function searchCountry(profileCountry: string | null | undefined, location: string): string {
  const own = countryOf(String(profileCountry ?? ''));
  if (own) return own;
  const place = location.trim().toLowerCase();
  return CITY_COUNTRY[place] ?? countryOf(place) ?? '';
}

export interface LiveFeedCheck {
  terms: string[];
  locationTerms: string[];
  /** Workplace filter as chosen: empty means any. */
  workplace: string[];
  country: string;
}

export function matchesLocation(job: FeedJob, check: LiveFeedCheck): boolean {
  if (!check.locationTerms.length) return true;
  const loc = String(job.location ?? '').toLowerCase();
  if (check.locationTerms.some((t) => t && loc.includes(t.toLowerCase()))) return true;
  const remoteAllowed = check.workplace.length === 0 || check.workplace.includes('Remote');
  return remoteAllowed && isRemote(job) && remoteRegionIncludes(job.location, check.country);
}

export function matchesLiveFeedSearch(job: FeedJob, check: LiveFeedCheck): boolean {
  return matchesKeywordSearch(job, check.terms) && matchesLocation(job, check);
}

/** Readable employer text for the detail panel. */
export const plainDescription = employerReadableText;
