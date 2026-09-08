/**
 * Search vocabulary and filter state for the Jobs search.
 *
 * Everything here is deliberately explicit and auditable: no inferred
 * eligibility, no invented locations, no scoring dressed up as a guarantee.
 */

// ---------------------------------------------------------------- synonyms

/**
 * Bidirectional job-title synonym groups. A query matching any member expands
 * to the whole group so "SRE" also finds "Site Reliability Engineer".
 */
const SYNONYM_GROUPS: string[][] = [
  ['software engineer', 'software developer', 'programmer', 'swe', 'developer'],
  ['frontend engineer', 'front end developer', 'frontend developer', 'ui engineer', 'web developer'],
  ['backend engineer', 'back end developer', 'backend developer', 'server engineer'],
  ['full stack engineer', 'fullstack developer', 'full stack developer'],
  ['site reliability engineer', 'sre', 'platform engineer', 'infrastructure engineer', 'devops engineer'],
  ['data engineer', 'analytics engineer', 'etl developer', 'data platform engineer'],
  ['data scientist', 'machine learning engineer', 'ml engineer', 'applied scientist'],
  ['data analyst', 'business analyst', 'insights analyst', 'reporting analyst', 'bi analyst'],
  ['product manager', 'product owner', 'pm', 'technical product manager'],
  ['project manager', 'programme manager', 'program manager', 'delivery manager'],
  ['quality assurance engineer', 'qa engineer', 'test engineer', 'sdet', 'automation engineer'],
  ['security engineer', 'information security engineer', 'infosec engineer', 'appsec engineer', 'cyber security engineer'],
  ['cloud engineer', 'aws engineer', 'azure engineer', 'gcp engineer'],
  ['solutions architect', 'technical architect', 'enterprise architect'],
  ['support engineer', 'technical support engineer', 'customer support engineer', 'service desk'],
  ['account executive', 'sales executive', 'account manager', 'sales representative'],
  ['customer success manager', 'client success manager', 'account success manager'],
  ['recruiter', 'talent acquisition partner', 'talent partner', 'technical recruiter'],
  ['financial analyst', 'finance analyst', 'fp&a analyst'],
  ['accountant', 'financial accountant', 'management accountant'],
  ['risk analyst', 'risk and controls analyst', 'operational risk analyst'],
  ['compliance officer', 'compliance analyst', 'regulatory analyst'],
  ['marketing manager', 'growth marketing manager', 'demand generation manager'],
  ['content writer', 'copywriter', 'content designer', 'technical writer'],
  ['ux designer', 'product designer', 'user experience designer', 'ui designer'],
  ['operations manager', 'business operations manager', 'bizops manager'],
  ['administrator', 'administrative assistant', 'office administrator'],
  ['nurse', 'registered nurse', 'staff nurse'],
  ['teacher', 'tutor', 'lecturer', 'instructor'],
  ['mechanical engineer', 'design engineer', 'mechanical design engineer'],
  ['electrical engineer', 'electronics engineer', 'controls engineer'],
  ['civil engineer', 'structural engineer', 'site engineer'],
  ['supply chain analyst', 'logistics analyst', 'procurement analyst'],
];

const SYNONYM_INDEX = (() => {
  const index = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    for (const member of group) index.set(member, group);
  }
  return index;
})();

/**
 * Expand a free-text query into the terms the database should look for.
 * The original query always comes first so exact wording still ranks highest.
 */
export function expandQuery(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const terms = new Set<string>([trimmed]);

  const exact = SYNONYM_INDEX.get(trimmed);
  if (exact) for (const t of exact) terms.add(t);

  if (!exact) {
    // Partial match: "senior data engineer" should still reach the data-engineer group.
    for (const [member, group] of SYNONYM_INDEX) {
      if (member.length >= 4 && trimmed.includes(member)) {
        for (const t of group) terms.add(t);
      }
    }
  }
  return Array.from(terms).slice(0, 12);
}

export function synonymsUsed(query: string): string[] {
  const expanded = expandQuery(query);
  return expanded.slice(1);
}

// ---------------------------------------------------------------- locations

/**
 * Nearby-area groups used for the "include nearby areas" option.
 *
 * These are curated commuting areas, not a geocoded radius: we have no
 * geocoding provider, so the option is labelled as approximate in the UI and
 * never presented as a distance in kilometres.
 */
const NEARBY_GROUPS: Record<string, string[]> = {
  dublin: ['dublin', 'leixlip', 'maynooth', 'swords', 'blanchardstown', 'sandyford', 'dun laoghaire', 'bray', 'citywest'],
  cork: ['cork', 'ringaskiddy', 'little island', 'carrigaline', 'ballincollig'],
  galway: ['galway', 'oranmore', 'tuam'],
  limerick: ['limerick', 'shannon', 'raheen'],
  belfast: ['belfast', 'lisburn', 'newtownabbey', 'bangor'],
  london: ['london', 'croydon', 'watford', 'slough', 'reading', 'staines', 'uxbridge', 'romford'],
  manchester: ['manchester', 'salford', 'stockport', 'bolton', 'warrington'],
  birmingham: ['birmingham', 'solihull', 'coventry', 'wolverhampton'],
  edinburgh: ['edinburgh', 'livingston', 'glasgow', 'dunfermline'],
  amsterdam: ['amsterdam', 'haarlem', 'utrecht', 'hoofddorp', 'almere', 'amstelveen'],
  berlin: ['berlin', 'potsdam'],
  munich: ['munich', 'münchen', 'garching', 'unterföhring'],
  paris: ['paris', 'la defense', 'la défense', 'boulogne', 'saint denis', 'issy'],
  madrid: ['madrid', 'alcobendas', 'las rozas'],
  barcelona: ['barcelona', 'sant cugat', 'hospitalet'],
  lisbon: ['lisbon', 'lisboa', 'oeiras', 'cascais'],
  warsaw: ['warsaw', 'warszawa'],
  zurich: ['zurich', 'zürich', 'zug', 'winterthur'],
  'new york': ['new york', 'nyc', 'brooklyn', 'jersey city', 'newark', 'manhattan'],
  'san francisco': ['san francisco', 'sf', 'oakland', 'south san francisco', 'palo alto', 'mountain view', 'san mateo', 'sunnyvale'],
  seattle: ['seattle', 'bellevue', 'redmond', 'kirkland'],
  austin: ['austin', 'round rock'],
  boston: ['boston', 'cambridge', 'somerville', 'waltham'],
  chicago: ['chicago', 'evanston', 'naperville'],
  toronto: ['toronto', 'mississauga', 'markham', 'north york'],
  singapore: ['singapore'],
  sydney: ['sydney', 'north sydney', 'parramatta'],
  bangalore: ['bangalore', 'bengaluru'],
};

/** The location terms to search for, honouring the nearby-areas option. */
export function locationTerms(location: string, includeNearby: boolean): string[] {
  const trimmed = location.trim().toLowerCase();
  if (!trimmed) return [];
  if (!includeNearby) return [trimmed];
  const group = NEARBY_GROUPS[trimmed];
  if (group) return group;
  const partial = Object.entries(NEARBY_GROUPS).find(([key]) => trimmed.includes(key));
  return partial ? partial[1] : [trimmed];
}

/** Whether nearby areas are actually known for this place. */
export function hasNearbyAreas(location: string): boolean {
  const trimmed = location.trim().toLowerCase();
  if (!trimmed) return false;
  return Boolean(NEARBY_GROUPS[trimmed]) || Object.keys(NEARBY_GROUPS).some((k) => trimmed.includes(k));
}

/** Collapse repeated place names, e.g. "Dublin, Dublin, Ireland". */
export function tidyLocation(location: string | null): string {
  if (!location) return 'Location not stated';
  const parts = location
    .split(/[,/•|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(', ') || 'Location not stated';
}

// ---------------------------------------------------------------- filters

export const WORKPLACE_OPTIONS = ['Remote', 'Hybrid', 'Onsite'] as const;

export const SENIORITY_OPTIONS = [
  { value: 'internship', label: 'Internship' },
  { value: 'entry', label: 'Entry / graduate' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead / manager' },
  { value: 'principal', label: 'Principal / staff' },
  { value: 'executive', label: 'Director and above' },
] as const;

export const EMPLOYMENT_OPTIONS = [
  { value: 'full', label: 'Full time' },
  { value: 'part', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'intern', label: 'Internship' },
] as const;

export const POSTED_OPTIONS = [
  { value: '24', label: 'Last 24 hours', hours: 24 },
  { value: '72', label: 'Last 3 days', hours: 72 },
  { value: '168', label: 'Last 7 days', hours: 168 },
  { value: '720', label: 'Last 30 days', hours: 720 },
  { value: 'any', label: 'Any date', hours: null },
] as const;

export type SortMode = 'newest' | 'relevance';

export interface JobSearchFilters {
  query: string;
  skills: string[];
  location: string;
  includeNearby: boolean;
  company: string;
  workplace: string[];
  seniority: string[];
  employment: string[];
  posted: string;
  includeUnverified: boolean;
  sort: SortMode;
}

export const DEFAULT_FILTERS: JobSearchFilters = {
  query: '',
  skills: [],
  location: '',
  includeNearby: true,
  company: '',
  workplace: [],
  seniority: [],
  employment: [],
  posted: '168',
  includeUnverified: true,
  sort: 'newest',
};

const STORAGE_KEY = 'jobgenie.jobSearch.filters.v1';

export function postedHours(posted: string): number | null {
  return POSTED_OPTIONS.find((o) => o.value === posted)?.hours ?? null;
}

/** True when the chosen window is a strict freshness filter. */
export function isStrictWindow(posted: string): boolean {
  return posted === '24' || posted === '72' || posted === '168';
}

export function activeFilterCount(f: JobSearchFilters): number {
  let n = 0;
  if (f.query.trim()) n++;
  if (f.skills.length) n++;
  if (f.location.trim()) n++;
  if (f.company.trim()) n++;
  if (f.workplace.length) n++;
  if (f.seniority.length) n++;
  if (f.employment.length) n++;
  if (f.posted !== DEFAULT_FILTERS.posted) n++;
  if (!f.includeUnverified) n++;
  return n;
}

function sanitise(raw: unknown): JobSearchFilters {
  const value = (raw ?? {}) as Partial<JobSearchFilters>;
  const strArray = (v: unknown, allowed?: readonly string[]) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && (!allowed || allowed.includes(x))).slice(0, 20)
      : [];
  return {
    query: typeof value.query === 'string' ? value.query.slice(0, 200) : '',
    skills: strArray(value.skills),
    location: typeof value.location === 'string' ? value.location.slice(0, 120) : '',
    includeNearby: value.includeNearby !== false,
    company: typeof value.company === 'string' ? value.company.slice(0, 120) : '',
    workplace: strArray(value.workplace, WORKPLACE_OPTIONS),
    seniority: strArray(value.seniority, SENIORITY_OPTIONS.map((o) => o.value)),
    employment: strArray(value.employment, EMPLOYMENT_OPTIONS.map((o) => o.value)),
    posted: POSTED_OPTIONS.some((o) => o.value === value.posted) ? (value.posted as string) : DEFAULT_FILTERS.posted,
    includeUnverified: value.includeUnverified !== false,
    sort: value.sort === 'relevance' ? 'relevance' : 'newest',
  };
}

/** Filters persist between visits so a search survives a reload. */
export function loadFilters(): JobSearchFilters {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    return sanitise(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

export function saveFilters(filters: JobSearchFilters): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // A full or blocked storage quota must never break searching.
  }
}

// ---------------------------------------------------------------- provenance

export const PROVIDER_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse (employer board)',
  lever: 'Lever (employer board)',
  ashby: 'Ashby (employer board)',
  smartrecruiters: 'SmartRecruiters (employer board)',
  workable: 'Workable (employer board)',
  recruitee: 'Recruitee (employer board)',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export const RISK_FLAG_LABELS: Record<string, string> = {
  asks_for_payment: 'Mentions a fee the applicant pays',
  off_platform_contact: 'Directs applicants to a messaging app',
  personal_email_contact: 'Gives a personal email address as contact',
  asks_for_bank_details: 'Mentions bank details during application',
  unrealistic_earnings: 'Advertises guaranteed or unlimited earnings',
  crypto_payment: 'Mentions payment in cryptocurrency',
  no_interview_promised: 'Promises hiring without an interview',
  very_short_description: 'Very little detail in the description',
};

export function riskLabel(flag: string): string {
  return RISK_FLAG_LABELS[flag] ?? flag;
}

export const LINK_STATUS_LABELS: Record<string, string> = {
  active: 'Link checked, vacancy open',
  unverified: 'Not yet confirmed',
  closed: 'Closed',
  removed: 'Removed',
  redirected: 'Link moved',
};

// ---------------------------------------------------------------- eligibility

export interface EligibilityNote {
  kind: 'requirement' | 'unknown';
  text: string;
}

const ELIGIBILITY_PATTERNS: Array<{ re: RegExp; text: string }> = [
  { re: /\b(must have|requires?)\s+(the\s+)?(legal\s+)?right to work\b/i, text: 'States you must already have the right to work' },
  { re: /\bno (visa )?sponsorship\b|\bsponsorship is not (available|provided|offered)\b|\bwe (do not|don.t) sponsor\b/i, text: 'Says visa sponsorship is not offered' },
  { re: /\b(visa )?sponsorship (is )?available\b|\bwe sponsor\b|\bwill sponsor\b/i, text: 'Mentions visa sponsorship may be available' },
  { re: /\b(security )?clearance\b/i, text: 'Mentions a security clearance requirement' },
  { re: /\bwork authori[sz]ation\b/i, text: 'Mentions work authorisation' },
  { re: /\b(driving licen[cs]e|driver.s licen[cs]e)\b/i, text: 'Mentions a driving licence' },
  { re: /\bmust be (based|located|resident) in\b/i, text: 'Requires you to be based in a specific place' },
  { re: /\bfluent in\s+([A-Z][a-z]+)/, text: 'Requires fluency in a specific language' },
  { re: /\b(degree|bachelor|master|phd)\b/i, text: 'Mentions a specific qualification' },
  { re: /\b(\d+)\+?\s*years? of (relevant )?experience\b/i, text: 'States a minimum years-of-experience bar' },
];

/**
 * Surface eligibility requirements the listing states, and say plainly when the
 * listing is silent. Nothing about the candidate's own status is inferred here.
 */
export function eligibilityNotes(description: string | null): EligibilityNote[] {
  if (!description || description.length < 40) {
    return [{ kind: 'unknown', text: 'This listing carries too little text to check eligibility requirements' }];
  }
  const notes: EligibilityNote[] = ELIGIBILITY_PATTERNS.filter((p) => p.re.test(description)).map((p) => ({
    kind: 'requirement' as const,
    text: p.text,
  }));
  const mentionsAuth = /\b(right to work|sponsorship|work authori[sz]ation|visa)\b/i.test(description);
  if (!mentionsAuth) {
    notes.push({
      kind: 'unknown',
      text: 'The listing says nothing about visa sponsorship or work authorisation - ask the employer',
    });
  }
  return notes;
}

/**
 * Keyword overlap between the listing and the candidate's confirmed skills.
 * Whole-term matching, so Java never matches JavaScript, and C++, C# and .NET
 * survive intact. This is overlap only - never an application outcome.
 */
export function skillOverlap(
  description: string | null,
  title: string,
  confirmedSkills: string[],
): { matched: string[]; missing: string[]; measurable: boolean } {
  const skills = confirmedSkills.map((s) => s.trim()).filter(Boolean);
  if (!skills.length || !description) return { matched: [], missing: [], measurable: false };
  const haystack = ` ${`${title} ${description}`.toLowerCase().replace(/\s+/g, ' ')} `;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of skills) {
    const needle = skill.toLowerCase();
    // Boundaries are non-word characters, but +, # and . belong to the term itself.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i');
    if (re.test(haystack)) matched.push(skill);
    else missing.push(skill);
  }
  return { matched, missing, measurable: true };
}

// ---------------------------------------------------------------- relevance

export interface RelevanceReason {
  label: string;
  detail: string;
}

/**
 * Plain-language reasons a vacancy is shown, each traceable to something the
 * candidate actually saved. No score, no probability, nothing inferred.
 */
export function relevanceReasons(
  job: { title: string; location: string | null; workplace_type: string | null; seniority: string | null; description: string | null },
  filters: JobSearchFilters,
  confirmedSkills: string[],
): RelevanceReason[] {
  const reasons: RelevanceReason[] = [];
  const title = job.title.toLowerCase();

  const target = filters.query.trim().toLowerCase();
  if (target && title.includes(target)) {
    reasons.push({ label: 'Job title', detail: `The title contains your target role "${filters.query.trim()}".` });
  } else if (target) {
    const syn = synonymsUsed(filters.query).find((s) => title.includes(s));
    if (syn) reasons.push({ label: 'Job title', detail: `The title matches "${syn}", a common wording for your target role.` });
  }

  const loc = (job.location ?? '').toLowerCase();
  const wanted = locationTerms(filters.location, filters.includeNearby).find((t) => loc.includes(t));
  if (wanted) {
    reasons.push({
      label: 'Location',
      detail: `Listed in ${tidyLocation(job.location)}, which matches your saved location.`,
    });
  }

  if (job.workplace_type && filters.workplace.includes(job.workplace_type)) {
    reasons.push({ label: 'Work arrangement', detail: `${job.workplace_type} matches your saved preference.` });
  }
  if (job.seniority && filters.seniority.includes(job.seniority)) {
    const label = SENIORITY_OPTIONS.find((o) => o.value === job.seniority)?.label ?? job.seniority;
    reasons.push({ label: 'Seniority', detail: `${label} matches your saved preference.` });
  }

  const overlap = skillOverlap(job.description, job.title, confirmedSkills);
  if (overlap.measurable && overlap.matched.length > 0) {
    reasons.push({
      label: 'Skills you confirmed',
      detail: `This listing names ${overlap.matched.slice(0, 6).join(', ')} from your profile.`,
    });
  }

  return reasons;
}

// ---------------------------------------------------------------- source mix

/** How much of a result set one employer accounts for. */
export function employerConcentration<T extends { company: string }>(
  jobs: T[],
): { company: string; count: number; share: number } | null {
  if (!jobs.length) return null;
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.company, (counts.get(j.company) ?? 0) + 1);
  let top = { company: '', count: 0 };
  for (const [company, count] of counts) if (count > top.count) top = { company, count };
  return { ...top, share: top.count / jobs.length };
}

/**
 * Round-robin the page by employer so a single high-volume career board does not
 * fill the top of the list. Nothing is removed; only the order changes.
 */
export function spreadByEmployer<T extends { company: string }>(jobs: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const job of jobs) {
    const key = job.company.toLowerCase();
    const bucket = buckets.get(key);
    if (bucket) bucket.push(job);
    else buckets.set(key, [job]);
  }
  const queues = Array.from(buckets.values());
  const out: T[] = [];
  let moved = true;
  while (moved) {
    moved = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        out.push(next);
        moved = true;
      }
    }
  }
  return out;
}
