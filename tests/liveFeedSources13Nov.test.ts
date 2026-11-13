import { describe, expect, it } from 'bun:test';
import { matchesKeywordSearch, matchesLiveFeedSearch, resultPlaceLabel } from '../src/lib/liveFeedFilter';
import { DEFAULT_FILTERS, expandQuery, type JobSearchFilters } from '../src/lib/jobSearch';
import { planSearch, weekNoteFor, wideningsFor } from '../src/lib/feedSearch';
import { isNewSince } from '../src/lib/lastVisit';
import { profileSkillNames } from '../src/lib/profileMatch';
import { storedPlace } from '../supabase/functions/_shared/jobPlace';
import { employerPlainText, decodeEntities } from '../supabase/functions/_shared/employerText';
import {
  CONCURRENCY,
  fetchSmartRecruiters,
  leaseDecision,
  mapGreenhouse,
  runPool,
  leaseFree,
  type SourceRow,
} from '../supabase/functions/ingest-jobs/feed';

// Fixtures only: no network, no saved account data.

const dublin = (over: Partial<JobSearchFilters> = {}): JobSearchFilters => ({
  ...DEFAULT_FILTERS,
  query: 'data engineer',
  location: 'Dublin',
  ...over,
});
const job = (title: string, location: string, workplace_type: string | null = null, description = '') => ({
  title,
  description,
  location,
  workplace_type,
});

describe('Live feed places', () => {
  const { check } = planSearch(dublin(), 'Ireland');

  it('a Dublin search returns a posting located "Ireland" and one "Remote - EMEA", labelled remote', () => {
    const ireland = job('Data Engineer', 'Ireland');
    const emea = job('Data Engineer', 'Remote - EMEA', 'Remote');
    expect(matchesLiveFeedSearch(ireland, check!)).toBe(true);
    expect(matchesLiveFeedSearch(emea, check!)).toBe(true);
    expect(resultPlaceLabel(ireland, check)).toBe('Ireland');
    expect(resultPlaceLabel(emea, check)).toBe('Remote, EMEA');
    expect(resultPlaceLabel(job('Data Engineer', 'Co. Dublin'), check)).toBe('Dublin');
  });

  it('also finds "IE", "Co. Dublin" and "Remote, EMEA" but not Cork', () => {
    expect(matchesLiveFeedSearch(job('Data Engineer', 'Dublin, IE'), check!)).toBe(true);
    expect(matchesLiveFeedSearch(job('Data Engineer', 'IE'), check!)).toBe(true);
    expect(matchesLiveFeedSearch(job('Data Engineer', 'Remote, EMEA', 'Remote'), check!)).toBe(true);
    expect(matchesLiveFeedSearch(job('Data Engineer', 'Cork, Ireland'), check!)).toBe(false);
  });

  it('never returns "Dublin, Ohio" unless the search is in the United States', () => {
    const ohio = job('Data Engineer', 'Dublin, Ohio');
    expect(matchesLiveFeedSearch(ohio, check!)).toBe(false);
    expect(matchesLiveFeedSearch(job('Data Engineer', 'Dublin, OH'), check!)).toBe(false);
    const us = planSearch(dublin({ location: 'Dublin, Ohio', includeNearby: false }), 'Ireland').check!;
    expect(us.country).toBe('United States');
    expect(matchesLiveFeedSearch(ohio, us)).toBe(true);
  });

  it('stores a country code, city and remote region at import', () => {
    expect(storedPlace('Co. Dublin')).toEqual({ country_code: 'IE', city: 'Dublin', remote_region: null });
    expect(storedPlace('Remote - Ireland', 'Remote')).toEqual({ country_code: 'IE', city: null, remote_region: 'Ireland' });
    expect(storedPlace('Remote, EMEA', 'Remote')).toEqual({ country_code: null, city: null, remote_region: 'EMEA' });
    expect(storedPlace('Dublin, Ohio')).toEqual({ country_code: 'US', city: 'Dublin', remote_region: null });
  });

  it('sends the country and the regions that cover it to the database', () => {
    const plan = planSearch(dublin(), 'Ireland');
    expect(plan.args.p_country_code).toBe('IE');
    expect(plan.args.p_location_terms).toContain('ireland');
    expect(plan.remoteArgs?.p_remote_regions).toEqual(expect.arrayContaining(['Ireland', 'EMEA', 'EU', 'Europe', 'Worldwide']));
    expect(plan.remoteArgs?.p_remote_regions).not.toContain('North America');
  });
});

describe('Live feed keywords', () => {
  const terms = expandQuery('data engineer');

  it('a sales posting mentioning "data" and "engineering" does not match "data engineer"', () => {
    expect(matchesKeywordSearch({ title: 'Account Executive', description: 'Sell to data teams and engineering leaders.' }, terms)).toBe(false);
    // Even the phrase in the description is not enough when the title is unrelated.
    expect(matchesKeywordSearch({ title: 'Account Executive', description: 'You will sell to data engineers.' }, terms)).toBe(false);
  });

  it('matches the title first, and the description only when the title has a related word', () => {
    expect(matchesKeywordSearch({ title: 'Senior Data Engineers', description: '' }, terms)).toBe(true);
    expect(matchesKeywordSearch({ title: 'Analytics Engineer', description: '' }, terms)).toBe(true);
    expect(matchesKeywordSearch({ title: 'Engineer II', description: 'Join as a data engineer.' }, terms)).toBe(true);
  });
});

describe('Whole boards and overlapping runs', () => {
  const source: SourceRow = { id: 's1', provider: 'greenhouse', company_name: 'Example', board_token: 'example' };

  it('a 300-posting Greenhouse board stores all 300', () => {
    const data = {
      jobs: Array.from({ length: 300 }, (_, i) => ({
        id: i + 1,
        title: `Role ${i + 1}`,
        location: { name: 'Dublin, Ireland' },
        absolute_url: `https://boards.greenhouse.io/example/jobs/${i + 1}`,
        content: '&lt;p&gt;We&amp;#8217;re hiring&lt;/p&gt;',
        first_published: '2026-11-10T09:00:00Z',
      })),
    };
    const { jobs, truncated } = mapGreenhouse(source, data);
    expect(jobs.length).toBe(300);
    expect(truncated).toBe(false);
    expect(new Set(jobs.map((j) => j.external_id)).size).toBe(300);
    expect(jobs[0].description).toBe('We’re hiring');
    expect(jobs[0].country_code).toBe('IE');
  });

  it('follows SmartRecruiters offsets, stopping at 1,000 per source', async () => {
    const pages: number[] = [];
    const getJson = async (url: string) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      pages.push(offset);
      return { totalFound: 2500, content: Array.from({ length: 100 }, (_, i) => ({ id: `${offset + i}`, name: 'Role' })) };
    };
    const { jobs, truncated } = await fetchSmartRecruiters({ ...source, provider: 'smartrecruiters' }, getJson);
    expect(jobs.length).toBe(1000);
    expect(truncated).toBe(true);
    expect(pages[pages.length - 1]).toBe(900);
  });

  it('scheduled runs never overlap: only one run takes a free lease, and a forced run waits', async () => {
    const now = new Date('2026-11-13T22:00:00Z');
    const store: { lease_until: string | null; status: string } = { lease_until: null, status: 'idle' };
    // Compare-and-set, as the conditional update does in the database.
    const take = async () => {
      await Promise.resolve();
      if (!leaseFree(store, now)) return false;
      store.lease_until = new Date(now.getTime() + 5 * 60_000).toISOString();
      return true;
    };
    const [a, b] = await Promise.all([take(), take()]);
    expect([a, b].filter(Boolean).length).toBe(1);
    expect(leaseDecision(store, now, false)).toBe('busy');
    expect(leaseDecision(store, now, true)).toBe('busy');
    expect(leaseDecision({ lease_until: null, status: 'paused' }, now, false)).toBe('paused');
    expect(leaseDecision({ lease_until: null, status: 'paused' }, now, true)).toBe('run');
    expect(leaseDecision({ lease_until: '2026-11-13T21:00:00Z', status: 'running' }, now, false)).toBe('run');
  });

  it('fetches six sources at a time and stops starting new ones when the budget is spent', async () => {
    let inFlight = 0;
    let peak = 0;
    let done = 0;
    const { started } = await runPool(
      Array.from({ length: 20 }, (_, i) => i),
      CONCURRENCY,
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
        done++;
      },
      () => done < 12,
    );
    expect(peak).toBe(6);
    expect(started).toBeGreaterThanOrEqual(12);
    expect(started).toBeLessThan(20);
  });
});

describe('No dead ends', () => {
  it('an empty result offers widenings and changes no filter', () => {
    const filters = Object.freeze(dublin({ posted: '24' })) as JobSearchFilters;
    const before = JSON.stringify(filters);
    const offers = wideningsFor(filters, 'Ireland');
    expect(JSON.stringify(filters)).toBe(before);
    expect(offers.map((o) => o.kind)).toEqual(['longer', 'remote', 'country']);
    expect(offers[0].filters.posted).toBe('168');
    expect(offers[0].label(14)).toBe('14 in the last 7 days');
    expect(offers[1].label(6)).toBe('6 remote in Europe');
    expect(offers[1].filters.workplace).toEqual(['Remote']);
    expect(offers[2].label(22)).toBe('22 data roles in Ireland');
    expect(offers[2].filters.location).toBe('Ireland');
  });

  it('a 24-hour list with fewer than 5 results asks how many arrived in 7 days', () => {
    expect(weekNoteFor(dublin({ posted: '24' }), 3)?.posted).toBe('168');
    expect(weekNoteFor(dublin({ posted: '24' }), 5)).toBeNull();
    expect(weekNoteFor(dublin({ posted: '168' }), 0)).toBeNull();
  });
});

describe('New since your last visit, apostrophes and skills', () => {
  it('marks postings first seen after the previous visit, and nothing on a first visit', () => {
    expect(isNewSince('2026-11-13T10:00:00Z', '2026-11-12T10:00:00Z')).toBe(true);
    expect(isNewSince('2026-11-11T10:00:00Z', '2026-11-12T10:00:00Z')).toBe(false);
    expect(isNewSince('2026-11-13T10:00:00Z', null)).toBe(false);
  });

  it('"We’re looking" keeps its apostrophe, numeric and named', () => {
    expect(employerPlainText('We&#8217;re looking')).toBe('We’re looking');
    expect(employerPlainText('We&#x2019;re looking')).toBe('We’re looking');
    expect(decodeEntities('&rsquo;&lsquo;&ldquo;&rdquo;&quot;&#39;')).toBe('’‘“”"\'');
  });

  it('the skills line counts grouped skills', () => {
    const grouped = [
      'Technical: Python, Java, SQL, Kafka, Spark',
      'Cloud & DevOps: AWS, Azure, , Docker, Kubernetes',
      { name: 'python' },
    ];
    expect(profileSkillNames(grouped)).toEqual(['Python', 'Java', 'SQL', 'Kafka', 'Spark', 'AWS', 'Azure', 'Docker', 'Kubernetes']);
  });
});
