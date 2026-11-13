/**
 * How a Live feed search is sent and checked, and what to offer when it finds
 * nothing. Pure, so the hook and the tests share one plan.
 *
 * The database narrows candidates (role phrases, the searched area, the
 * searched country, remote work in regions that cover it); liveFeedFilter then
 * makes the final call on every candidate.
 */
import {
  expandQuery,
  isStrictWindow,
  locationTerms,
  postedHours,
  type JobSearchFilters,
} from './jobSearch';
import { searchCountry, type LiveFeedCheck } from './liveFeedFilter';
import { COUNTRY_CODE, regionsCovering } from '../../supabase/functions/_shared/jobPlace';

export interface SearchArgs {
  p_terms: string[];
  p_skills: string[];
  p_location_terms: string[];
  p_company: string;
  p_workplace: string[];
  p_seniority: string[];
  p_employment: string[];
  p_max_age_hours: number | null;
  p_require_known_date: boolean;
  p_include_unverified: boolean;
  p_sort: string;
  p_country_code: string | null;
  p_remote_regions: string[];
}

export interface SearchPlan {
  args: SearchArgs;
  /** A second lookup for remote work open to the searched country, or null. */
  remoteArgs: SearchArgs | null;
  /** Checked here when a keyword or place is set; null pages straight from the database. */
  check: LiveFeedCheck | null;
  country: string;
}

export function planSearch(filters: JobSearchFilters, profileCountry?: string | null): SearchPlan {
  const location = filters.location.trim();
  const country = location || filters.query.trim() ? searchCountry(profileCountry, location) : '';
  const places = locationTerms(filters.location, filters.includeNearby);
  const countryWord = location && country ? country.toLowerCase() : '';
  const args: SearchArgs = {
    p_terms: expandQuery(filters.query),
    p_skills: filters.skills,
    // The country name is added so "Ireland" and "Remote - Ireland" are candidates for a Dublin search.
    p_location_terms: countryWord && !places.includes(countryWord) ? [...places, countryWord] : places,
    p_company: filters.company.trim(),
    p_workplace: filters.workplace,
    p_seniority: filters.seniority,
    p_employment: filters.employment,
    p_max_age_hours: postedHours(filters.posted),
    // Undated listings are excluded only from the strict freshness windows.
    p_require_known_date: isStrictWindow(filters.posted),
    p_include_unverified: filters.includeUnverified,
    p_sort: filters.sort,
    p_country_code: location && country ? COUNTRY_CODE[country] ?? null : null,
    p_remote_regions: [],
  };
  const remoteAllowed = filters.workplace.length === 0 || filters.workplace.includes('Remote');
  const remoteArgs = location && remoteAllowed && country
    ? { ...args, p_location_terms: [], p_country_code: null, p_workplace: ['Remote'], p_remote_regions: regionsCovering(country) }
    : null;
  const check: LiveFeedCheck | null = filters.query.trim() || location
    ? { terms: args.p_terms, locationTerms: places, workplace: filters.workplace, country }
    : null;
  return { args, remoteArgs, check, country };
}

// ---------------------------------------------------------------- widenings

export type WideningKind = 'longer' | 'remote' | 'country';

export interface Widening {
  kind: WideningKind;
  /** The filters the button would apply. Nothing changes until it is pressed. */
  filters: JobSearchFilters;
  label: (count: number, capped?: boolean) => string;
}

const LONGER: Record<string, { posted: string; words: string }> = {
  '24': { posted: '168', words: 'in the last 7 days' },
  '72': { posted: '168', words: 'in the last 7 days' },
  '168': { posted: '720', words: 'in the last 30 days' },
  '720': { posted: 'any', words: 'at any date' },
};

const n = (count: number, capped?: boolean) => `${count.toLocaleString()}${capped ? '+' : ''}`;

/**
 * Wider searches to offer when a search finds nothing (or very little). Each
 * is a fresh filter object; the current filters are never changed.
 */
export function wideningsFor(filters: JobSearchFilters, country: string): Widening[] {
  const out: Widening[] = [];
  const longer = LONGER[filters.posted];
  if (longer) {
    out.push({
      kind: 'longer',
      filters: { ...filters, posted: longer.posted },
      label: (c, capped) => `${n(c, capped)} ${longer.words}`,
    });
  }

  const location = filters.location.trim();
  if (location && country) {
    const inEurope = regionsCovering(country).includes('Europe');
    const where = inEurope ? 'Europe' : country;
    if (!(filters.workplace.length === 1 && filters.workplace[0] === 'Remote' && location === where)) {
      out.push({
        kind: 'remote',
        filters: { ...filters, location: where, includeNearby: false, workplace: ['Remote'] },
        label: (c, capped) => `${n(c, capped)} remote in ${where}`,
      });
    }
  }

  const word = filters.query.trim().split(/\s+/)[0] ?? '';
  if (country && word && location.toLowerCase() !== country.toLowerCase()) {
    out.push({
      kind: 'country',
      filters: { ...filters, query: word.toLowerCase(), location: country, includeNearby: false },
      label: (c, capped) => `${n(c, capped)} ${word.toLowerCase()} roles in ${country}`,
    });
  }
  return out;
}

/** The "how many arrived this week" note for a short 24-hour list. */
export function weekNoteFor(filters: JobSearchFilters, total: number): JobSearchFilters | null {
  return filters.posted === '24' && total < 5 ? { ...filters, posted: '168' } : null;
}
