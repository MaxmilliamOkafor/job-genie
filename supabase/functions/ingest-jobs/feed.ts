/**
 * The job import's pure parts: provider mapping, the run budget, the
 * concurrency pool and the lease rule. No network or database here, so tests
 * exercise exactly what the deployed import runs.
 *
 * Whole boards are kept: Greenhouse, Lever, Ashby, Workable and Recruitee send
 * every posting in one response and every one is stored. SmartRecruiters pages
 * by offset and is followed to at most SMARTRECRUITERS_MAX postings.
 */
import { employerPlainText } from '../_shared/employerText.ts';
import { storedPlace } from '../_shared/jobPlace.ts';

/** Sources started per run, how many at once, and when to stop starting more. */
export const SOURCES_PER_RUN = 60;
export const CONCURRENCY = 6;
export const RUN_BUDGET_MS = 100_000;
/** Postings processed per run before no further source is started (CPU safety). */
export const POSTINGS_BUDGET = 6_000;
export const SMARTRECRUITERS_PAGE = 100;
export const SMARTRECRUITERS_MAX = 1_000;
export const DESCRIPTION_CAP = 4_000;
export const LEASE_MINUTES = 5;
export const FAILURE_BREAKER = 6;

export interface SourceRow {
  id: string;
  provider: string;
  company_name: string;
  board_token: string;
}

export interface PoolJob {
  provider: string;
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  department: string | null;
  url: string;
  description: string | null;
  salary: string | null;
  posted_at: string;
  posted_at_known: boolean;
  updated_at: string;
  last_seen_in_feed_at: string;
  employer_direct: boolean;
  risk_flags: string[];
  source_id: string;
  country_code: string | null;
  city: string | null;
  remote_region: string | null;
}

/** A provider result plus whether we saw the employer's whole board. */
export interface FeedResult {
  jobs: PoolJob[];
  truncated: boolean;
}

export type GetJson = (url: string) => Promise<any>;

// Entities are decoded before tags are removed, and curly apostrophes are kept,
// so "We’re looking" is never stored as "We re looking".
export function clean(html: unknown, max = DESCRIPTION_CAP): string | null {
  return employerPlainText(html, max);
}

export function workplaceFrom(location: string | null, extra?: string | null): string | null {
  const blob = `${location ?? ''} ${extra ?? ''}`.toLowerCase();
  if (blob.includes('remote')) return 'Remote';
  if (blob.includes('hybrid')) return 'Hybrid';
  return location ? 'Onsite' : null;
}

/**
 * A posting date we were actually given, or an honest "unknown".
 * We never pass the import time off as the employer's posting date.
 */
export function postedFrom(...candidates: unknown[]): { posted_at: string; posted_at_known: boolean } {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const date = typeof candidate === 'number' ? new Date(candidate) : new Date(String(candidate));
    const time = date.getTime();
    if (!Number.isNaN(time) && time > 0 && time < Date.now() + 7 * 86_400_000) {
      return { posted_at: date.toISOString(), posted_at_known: true };
    }
  }
  return { posted_at: new Date().toISOString(), posted_at_known: false };
}

// Concrete, checkable indicators only - never a general "this looks dodgy" verdict.
const RISK_PATTERNS: Array<{ flag: string; re: RegExp }> = [
  { flag: 'asks_for_payment', re: /\b(registration fee|application fee|upfront (?:fee|payment)|pay for (?:training|equipment)|training fee)\b/i },
  { flag: 'off_platform_contact', re: /\b(whatsapp|telegram|signal app)\b/i },
  { flag: 'personal_email_contact', re: /\b[\w.+-]+@(?:gmail|yahoo|hotmail|outlook|aol)\.[a-z.]{2,6}\b/i },
  { flag: 'asks_for_bank_details', re: /\b(bank (?:account )?details|routing number|iban)\b.{0,60}\b(?:apply|application|onboard)/i },
  { flag: 'unrealistic_earnings', re: /\b(unlimited earning|earn \$?\d{3,}\s*(?:per day|a day|daily)|guaranteed income)\b/i },
  { flag: 'crypto_payment', re: /\b(paid in (?:crypto|bitcoin|usdt)|crypto wallet)\b/i },
  { flag: 'no_interview_promised', re: /\b(no interview (?:required|needed)|hired on the spot|immediate hire, no interview)\b/i },
];

export function riskFlags(job: { title: string; description: string | null; salary: string | null }): string[] {
  const blob = `${job.title} ${job.description ?? ''} ${job.salary ?? ''}`;
  const flags = RISK_PATTERNS.filter((p) => p.re.test(blob)).map((p) => p.flag);
  if (!job.description || job.description.length < 120) flags.push('very_short_description');
  return flags;
}

type BaseJob = Omit<
  PoolJob,
  'posted_at' | 'posted_at_known' | 'updated_at' | 'last_seen_in_feed_at' | 'risk_flags' | 'employer_direct' |
  'country_code' | 'city' | 'remote_region'
>;

/** Finish a provider row: honest dates, concrete risk flags and the normalised place. */
export function finish(base: BaseJob, dateCandidates: unknown[], updatedCandidate?: unknown): PoolJob {
  const { posted_at, posted_at_known } = postedFrom(...dateCandidates);
  const stamp = new Date().toISOString();
  const updated = postedFrom(updatedCandidate, posted_at).posted_at;
  return {
    ...base,
    posted_at,
    posted_at_known,
    updated_at: updated,
    last_seen_in_feed_at: stamp,
    // Every provider here is the employer's own applicant tracking system.
    employer_direct: true,
    risk_flags: riskFlags(base),
    ...storedPlace(base.location, base.workplace_type),
  };
}

// ---------------------------------------------------------------- providers

export function mapGreenhouse(s: SourceRow, data: any): FeedResult {
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  return {
    truncated: false,
    jobs: jobs.map((j) => {
      const location = j?.location?.name ?? null;
      return finish(
        {
          provider: 'greenhouse',
          external_id: `greenhouse:${s.board_token}:${j.id}`,
          title: String(j.title ?? 'Untitled role').slice(0, 300),
          company: s.company_name,
          location,
          workplace_type: workplaceFrom(location),
          employment_type: null,
          department: j?.departments?.[0]?.name ?? null,
          url: j.absolute_url ?? `https://boards.greenhouse.io/${s.board_token}/jobs/${j.id}`,
          description: clean(j.content),
          salary: null,
          source_id: s.id,
        },
        [j?.first_published, j?.updated_at],
        j?.updated_at,
      );
    }),
  };
}

export function mapLever(s: SourceRow, data: any): FeedResult {
  const jobs: any[] = Array.isArray(data) ? data : [];
  return {
    truncated: false,
    jobs: jobs.map((j) => {
      const location = j?.categories?.location ?? null;
      return finish(
        {
          provider: 'lever',
          external_id: `lever:${s.board_token}:${j.id}`,
          title: String(j.text ?? 'Untitled role').slice(0, 300),
          company: s.company_name,
          location,
          workplace_type: workplaceFrom(location, j?.workplaceType),
          employment_type: j?.categories?.commitment ?? null,
          department: j?.categories?.team ?? null,
          url: j.hostedUrl ?? j.applyUrl ?? `https://jobs.lever.co/${s.board_token}/${j.id}`,
          description: clean(j.descriptionPlain ?? j.description),
          salary: j?.salaryRange
            ? `${j.salaryRange.currency ?? ''} ${j.salaryRange.min ?? ''}-${j.salaryRange.max ?? ''}`.trim()
            : null,
          source_id: s.id,
        },
        [j?.createdAt],
      );
    }),
  };
}

export function mapAshby(s: SourceRow, data: any): FeedResult {
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  return {
    truncated: false,
    jobs: jobs.map((j) => {
      const location = j?.location ?? null;
      return finish(
        {
          provider: 'ashby',
          external_id: `ashby:${s.board_token}:${j.id}`,
          title: String(j.title ?? 'Untitled role').slice(0, 300),
          company: data?.name ?? s.company_name,
          location,
          workplace_type: j?.isRemote ? 'Remote' : workplaceFrom(location),
          employment_type: j?.employmentType ?? null,
          department: j?.department ?? j?.team ?? null,
          url: j.jobUrl ?? j.applyUrl ?? `https://jobs.ashbyhq.com/${s.board_token}/${j.id}`,
          description: clean(j.descriptionPlain ?? j.descriptionHtml),
          salary: j?.compensation?.compensationTierSummary ?? null,
          source_id: s.id,
        },
        [j?.publishedAt],
        j?.updatedAt,
      );
    }),
  };
}

function mapSmartRecruitersJob(s: SourceRow, j: any): PoolJob {
  const city = j?.location?.city ?? '';
  const country = j?.location?.country ? String(j.location.country).toUpperCase() : '';
  const location = [city, country].filter(Boolean).join(', ') || null;
  return finish(
    {
      provider: 'smartrecruiters',
      external_id: `smartrecruiters:${s.board_token}:${j.id}`,
      title: String(j.name ?? 'Untitled role').slice(0, 300),
      company: j?.company?.name ?? s.company_name,
      location,
      workplace_type: j?.location?.remote ? 'Remote' : workplaceFrom(location),
      employment_type: j?.typeOfEmployment?.label ?? null,
      department: j?.department?.label ?? j?.function?.label ?? null,
      url: j.ref
        ? `https://jobs.smartrecruiters.com/${s.board_token}/${j.id}`
        : `https://jobs.smartrecruiters.com/${s.board_token}`,
      description: null,
      salary: null,
      source_id: s.id,
    },
    [j?.releasedDate, j?.createdOn],
  );
}

/** SmartRecruiters pages by offset: follow it to the end or SMARTRECRUITERS_MAX. */
export async function fetchSmartRecruiters(s: SourceRow, getJson: GetJson): Promise<FeedResult> {
  const jobs: PoolJob[] = [];
  let total = 0;
  for (let offset = 0; offset < SMARTRECRUITERS_MAX; offset += SMARTRECRUITERS_PAGE) {
    const data = await getJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s.board_token)}/postings?limit=${SMARTRECRUITERS_PAGE}&offset=${offset}`,
    );
    const page: any[] = Array.isArray(data?.content) ? data.content : [];
    total = typeof data?.totalFound === 'number' ? data.totalFound : Math.max(total, offset + page.length);
    for (const j of page) jobs.push(mapSmartRecruitersJob(s, j));
    if (!page.length || jobs.length >= total) break;
  }
  return { jobs, truncated: total > jobs.length };
}

export function mapWorkable(s: SourceRow, data: any): FeedResult {
  const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
  return {
    truncated: false,
    jobs: jobs.map((j) => {
      const location = [j?.city, j?.country].filter(Boolean).join(', ') || j?.location || null;
      return finish(
        {
          provider: 'workable',
          external_id: `workable:${s.board_token}:${j.shortcode ?? j.id}`,
          title: String(j.title ?? 'Untitled role').slice(0, 300),
          company: data?.name ?? s.company_name,
          location,
          workplace_type: j?.telecommuting ? 'Remote' : workplaceFrom(location),
          employment_type: j?.employment_type ?? null,
          department: j?.department ?? null,
          url: j.url ?? j.application_url ?? `https://apply.workable.com/${s.board_token}/`,
          description: clean(j.description),
          salary: null,
          source_id: s.id,
        },
        [j?.published_on, j?.created_at],
      );
    }),
  };
}

export function mapRecruitee(s: SourceRow, data: any): FeedResult {
  const jobs: any[] = Array.isArray(data?.offers) ? data.offers : [];
  return {
    truncated: false,
    jobs: jobs.map((j) => {
      const location = j?.location || [j?.city, j?.country].filter(Boolean).join(', ') || null;
      return finish(
        {
          provider: 'recruitee',
          external_id: `recruitee:${s.board_token}:${j.id}`,
          title: String(j.title ?? 'Untitled role').slice(0, 300),
          company: s.company_name,
          location,
          workplace_type: j?.remote ? 'Remote' : workplaceFrom(location),
          employment_type: j?.employment_type_code ?? null,
          department: j?.department ?? null,
          url: j.careers_url ?? j.url ?? `https://${s.board_token}.recruitee.com/`,
          description: clean(j.description),
          salary: null,
          source_id: s.id,
        },
        [j?.published_at, j?.created_at],
      );
    }),
  };
}

const enc = encodeURIComponent;
export const PROVIDERS: Record<string, (s: SourceRow, getJson: GetJson) => Promise<FeedResult>> = {
  greenhouse: async (s, g) => mapGreenhouse(s, await g(`https://boards-api.greenhouse.io/v1/boards/${enc(s.board_token)}/jobs?content=true`)),
  lever: async (s, g) => mapLever(s, await g(`https://api.lever.co/v0/postings/${enc(s.board_token)}?mode=json`)),
  ashby: async (s, g) => mapAshby(s, await g(`https://api.ashbyhq.com/posting-api/job-board/${enc(s.board_token)}?includeCompensation=true`)),
  smartrecruiters: fetchSmartRecruiters,
  workable: async (s, g) => mapWorkable(s, await g(`https://apply.workable.com/api/v1/widget/accounts/${enc(s.board_token)}?details=true`)),
  recruitee: async (s, g) => mapRecruitee(s, await g(`https://${enc(s.board_token)}.recruitee.com/api/offers/`)),
};

// ------------------------------------------------------------------- runner

/**
 * Run work over items, at most `limit` at once. `canStart` is asked before
 * each new item, so the run stops starting sources once its budget is spent
 * while work already in flight finishes.
 */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  canStart: () => boolean = () => true,
): Promise<{ results: PromiseSettledResult<R>[]; started: number }> {
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  let started = 0;
  const lane = async () => {
    while (next < items.length && canStart()) {
      const index = next++;
      started++;
      const [settled] = await Promise.allSettled([worker(items[index])]);
      results[index] = settled;
    }
  };
  await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return { results: results.filter(Boolean), started };
}

export interface LeaseState {
  status?: string | null;
  lease_until?: string | null;
}

/** Whether nobody holds the lease at this moment. */
export function leaseFree(state: LeaseState | null | undefined, now: Date): boolean {
  return !state?.lease_until || new Date(state.lease_until).getTime() <= now.getTime();
}

/**
 * What a run may do. A paused import runs only when forced ("Refresh now"),
 * and no run, forced or scheduled, starts while another holds the lease, so
 * runs never overlap. Taking the lease is a compare-and-set on lease_until.
 */
export function leaseDecision(state: LeaseState | null | undefined, now: Date, force: boolean): 'run' | 'paused' | 'busy' {
  if (!leaseFree(state, now)) return 'busy';
  if (state?.status === 'paused' && !force) return 'paused';
  return 'run';
}

/** The PostgREST filter that makes taking the lease atomic. */
export function leaseFreeFilter(now: Date): string {
  return `lease_until.is.null,lease_until.lte.${now.toISOString()}`;
}
