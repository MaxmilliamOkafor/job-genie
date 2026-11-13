/**
 * Live feed results checked against what the user actually searched for.
 *
 * Keywords: the role phrase (and its "Also searched" wordings) must name the
 * vacancy's title, or appear as a phrase in the description of a vacancy whose
 * title shares a word with the role ("Engineer II" for "data engineer"). A
 * sales role that merely mentions "data" and "engineering" never matches.
 *
 * Places: a Dublin search matches the Dublin area, postings in Ireland with no
 * city, and remote postings whose region covers Ireland; "Dublin, Ohio" only
 * when the search itself is in the United States.
 */
import { CITY_COUNTRY, countryOf } from './jobRecords';
import { employerReadableText } from '../../supabase/functions/_shared/employerText';
import {
  parsePlace,
  placeLabel,
  placesOf,
  regionCovers,
  type Place,
} from '../../supabase/functions/_shared/jobPlace';

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

const NOT_RELATED = new Set([
  'and', 'the', 'for', 'with', 'of', 'senior', 'junior', 'lead', 'head', 'principal', 'staff', 'manager',
]);

/** Words of the role and its wordings that make a title "related" ("engineer", "data"). */
export function relatedWords(terms: string[]): string[] {
  const words = new Set<string>();
  for (const term of terms) {
    for (const w of term.toLowerCase().split(/[^\p{L}\p{N}+#&]+/u)) {
      if (w.length >= 3 && !NOT_RELATED.has(w)) words.add(w);
    }
  }
  return [...words];
}

export function matchesKeywordSearch(job: Pick<FeedJob, 'title' | 'description'>, terms: string[]): boolean {
  const patterns = terms.map(phrasePattern).filter((p): p is RegExp => Boolean(p));
  if (!patterns.length) return true;
  if (patterns.some((p) => p.test(job.title))) return true;
  const related = relatedWords(terms).map(phrasePattern).filter((p): p is RegExp => Boolean(p));
  if (!related.some((p) => p.test(job.title))) return false;
  const text = employerReadableText(job.description ?? '');
  return patterns.some((p) => p.test(text));
}

export function isRemote(job: Pick<FeedJob, 'location' | 'workplace_type'>): boolean {
  return job.workplace_type === 'Remote' || /\bremote\b/i.test(job.location ?? '');
}

/**
 * Whether a remote vacancy's stated region includes the country. A bare
 * "Remote" with no region does not: the region is unknown, so it is not shown.
 */
export function remoteRegionIncludes(location: string | null, country: string): boolean {
  if (!country) return false;
  return placesOf(location, 'Remote').some((p) => regionCovers(p.region, country));
}

/** The country being searched: the searched place's own, else the profile's. */
export function searchCountry(profileCountry: string | null | undefined, location: string): string {
  const place = location.trim();
  if (place) {
    const parsed = parsePlace(place);
    if (parsed.country) return parsed.country;
    const known = CITY_COUNTRY[place.toLowerCase()] ?? countryOf(place);
    if (known) return known;
  }
  return countryOf(String(profileCountry ?? '')) ?? '';
}

export interface LiveFeedCheck {
  terms: string[];
  locationTerms: string[];
  /** Workplace filter as chosen: empty means any. */
  workplace: string[];
  country: string;
  /** Only remote work whose region covers this country (the "remote in Europe" widening). */
  remoteFrom?: string;
}

const norm = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The place of a vacancy that satisfies the search, or null when none does. */
export function matchedPlace(job: FeedJob, check: LiveFeedCheck): Place | null {
  const places = placesOf(job.location, job.workplace_type);
  if (check.remoteFrom) {
    return places.find((p) => p.remote && regionCovers(p.region, check.remoteFrom!)) ?? null;
  }
  if (!check.locationTerms.length) return places[0] ?? { country: null, city: null, remote: false, region: null };

  const searched = parsePlace(check.locationTerms[0]);
  const countryOnly = !searched.city && Boolean(searched.country);
  const cities = new Set(
    check.locationTerms.map((t) => norm(parsePlace(t).city ?? t)).filter(Boolean),
  );
  const remoteAllowed = check.workplace.length === 0 || check.workplace.includes('Remote');

  for (const place of places) {
    if (place.remote) {
      if (remoteAllowed && regionCovers(place.region, check.country)) return place;
      continue;
    }
    const sameCountry = !place.country || !check.country || place.country === check.country;
    if (countryOnly) {
      if (place.country && place.country === check.country) return place;
      continue;
    }
    if (place.city && cities.has(norm(place.city)) && sameCountry) return place;
    if (!place.city && place.country && place.country === check.country) return place;
  }
  // A place we cannot read is kept only when its text names the searched place.
  if (!check.country && !places.some((p) => p.country)) {
    const loc = String(job.location ?? '').toLowerCase();
    const hit = check.locationTerms.some((t) => t && loc.includes(t.toLowerCase()));
    if (hit) return places[0] ?? null;
  }
  return null;
}

export function matchesLocation(job: FeedJob, check: LiveFeedCheck): boolean {
  if (!check.locationTerms.length && !check.remoteFrom) return true;
  return matchedPlace(job, check) !== null;
}

export function matchesLiveFeedSearch(job: FeedJob, check: LiveFeedCheck): boolean {
  return matchesKeywordSearch(job, check.terms) && matchesLocation(job, check);
}

/** How a result's place reads for this search: "Dublin", "Ireland" or "Remote, EMEA". */
export function resultPlaceLabel(job: FeedJob, check: LiveFeedCheck | null): string | null {
  if (!check || (!check.locationTerms.length && !check.remoteFrom)) return null;
  const place = matchedPlace(job, check);
  return place ? placeLabel(place) || null : null;
}

/** Readable employer text for the detail panel. */
export const plainDescription = employerReadableText;
