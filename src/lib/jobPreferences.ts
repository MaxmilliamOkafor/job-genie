/**
 * Saved job-search targets.
 *
 * Stored on the candidate's profile under learned_preferences.job_search so the
 * search opens on what they actually asked for. Nothing here is inferred: an
 * empty set stays empty and the page asks the candidate to fill it in.
 */

import {
  DEFAULT_FILTERS,
  SENIORITY_OPTIONS,
  WORKPLACE_OPTIONS,
  type JobSearchFilters,
} from './jobSearch';

export interface JobPreferences {
  roles: string[];
  locations: string[];
  seniority: string[];
  workplace: string[];
}

export const EMPTY_PREFERENCES: JobPreferences = {
  roles: [],
  locations: [],
  seniority: [],
  workplace: [],
};

export function parsePreferences(raw: unknown): JobPreferences {
  const value = (raw ?? {}) as Partial<JobPreferences>;
  const list = (v: unknown, allowed?: readonly string[]) =>
    Array.isArray(v)
      ? Array.from(
          new Set(
            v
              .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
              .map((x) => x.trim()),
          ),
        )
          .filter((x) => !allowed || allowed.includes(x))
          .slice(0, 12)
      : [];
  return {
    roles: list(value.roles),
    locations: list(value.locations),
    seniority: list(value.seniority, SENIORITY_OPTIONS.map((o) => o.value)),
    workplace: list(value.workplace, WORKPLACE_OPTIONS),
  };
}

export function hasPreferences(prefs: JobPreferences): boolean {
  return (
    prefs.roles.length > 0 ||
    prefs.locations.length > 0 ||
    prefs.seniority.length > 0 ||
    prefs.workplace.length > 0
  );
}

/** Turn saved targets into a starting set of filters. */
export function filtersFromPreferences(
  prefs: JobPreferences,
  base: JobSearchFilters = DEFAULT_FILTERS,
  activeRole?: string,
  activeLocation?: string,
): JobSearchFilters {
  return {
    ...base,
    query: activeRole ?? prefs.roles[0] ?? '',
    location: activeLocation ?? prefs.locations[0] ?? '',
    seniority: [...prefs.seniority],
    workplace: [...prefs.workplace],
    skills: [],
    company: '',
  };
}
