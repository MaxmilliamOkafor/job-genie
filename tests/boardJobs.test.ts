import { describe, expect, it } from 'bun:test';
import {
  canonicalUrl,
  companyFromUrl,
  isPostingUrl,
  normalisePosting,
  pooled,
  postingsToCsv,
  rowsFromPayload,
  stripHtml,
  toIsoDate,
} from '../supabase/functions/_shared/boardJobs';

describe('canonicalUrl', () => {
  it('reduces tracking variants of one job to one spelling', () => {
    const a = canonicalUrl('http://boards.greenhouse.io/acme/jobs/123?gh_src=abc&utm_source=li#apply');
    const b = canonicalUrl('https://boards.greenhouse.io/acme/jobs/123/');
    expect(a).toBe(b);
    expect(a).toBe('https://boards.greenhouse.io/acme/jobs/123');
  });

  it('keeps meaningful query parameters', () => {
    expect(canonicalUrl('https://jobs.lever.co/acme/abc123?team=eng')).toContain('team=eng');
  });

  it('refuses a non-http scheme', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBe('');
    expect(canonicalUrl('not a url')).toBe('');
  });
});

describe('isPostingUrl', () => {
  it('keeps a job and drops a board home page', () => {
    expect(isPostingUrl('lever', 'https://jobs.lever.co/acme/abc123def')).toBe(true);
    expect(isPostingUrl('lever', 'https://jobs.lever.co/acme')).toBe(false);
    expect(isPostingUrl('greenhouse', 'https://boards.greenhouse.io/acme/jobs/44')).toBe(true);
    expect(isPostingUrl('greenhouse', 'https://boards.greenhouse.io/acme')).toBe(false);
    expect(isPostingUrl('ashby', 'https://jobs.ashbyhq.com/acme.io/8f2a1b3c')).toBe(true);
    expect(isPostingUrl('ashby', 'https://jobs.ashbyhq.com/acme.io')).toBe(false);
  });
});

describe('companyFromUrl', () => {
  it('reads the token from each board', () => {
    expect(companyFromUrl('https://boards.greenhouse.io/acme/jobs/1')).toEqual({ board: 'greenhouse', token: 'acme' });
    expect(companyFromUrl('https://job-boards.greenhouse.io/acme/jobs/1')).toEqual({ board: 'greenhouse', token: 'acme' });
    expect(companyFromUrl('https://jobs.lever.co/mercury/abc-123')).toEqual({ board: 'lever', token: 'mercury' });
    expect(companyFromUrl('https://jobs.eu.lever.co/mercury/abc-123')).toEqual({ board: 'lever', token: 'mercury' });
    expect(companyFromUrl('https://jobs.ashbyhq.com/openai/xyz')).toEqual({ board: 'ashby', token: 'openai' });
  });

  it('reads the company out of a Greenhouse embed link, never "embed"', () => {
    expect(companyFromUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=9')).toEqual({
      board: 'greenhouse',
      token: 'acme',
    });
  });

  it('returns nothing for an unrelated URL', () => {
    expect(companyFromUrl('https://example.com/careers')).toBeNull();
    expect(companyFromUrl('')).toBeNull();
  });
});

describe('stripHtml', () => {
  it('finds a phrase split by a tag', () => {
    const body = stripHtml('&lt;p&gt;We offer &lt;strong&gt;visa&lt;/strong&gt; sponsorship&lt;/p&gt;');
    expect(body.toLowerCase()).toContain('visa sponsorship');
  });

  it('caps the stored body', () => {
    expect(stripHtml('a'.repeat(30000)).length).toBe(20000);
  });
});

describe('toIsoDate', () => {
  it('handles Lever epoch milliseconds and ISO strings alike', () => {
    expect(toIsoDate(1695000000000)).toBe(new Date(1695000000000).toISOString());
    expect(toIsoDate('2026-09-01T10:00:00Z')).toBe('2026-09-01T10:00:00.000Z');
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('not a date')).toBeNull();
  });
});

describe('rowsFromPayload', () => {
  it('reads a bare array, a jobs wrapper and a results wrapper', () => {
    expect(rowsFromPayload([{ a: 1 }]).length).toBe(1);
    expect(rowsFromPayload({ jobs: [{ a: 1 }, { b: 2 }] }).length).toBe(2);
    expect(rowsFromPayload({ results: [{ a: 1 }] }).length).toBe(1);
    expect(rowsFromPayload({ nothing: true }).length).toBe(0);
  });
});

describe('normalisePosting', () => {
  it('reads a Greenhouse record', () => {
    const p = normalisePosting(
      {
        title: 'Backend Engineer',
        absolute_url: 'https://boards.greenhouse.io/acme/jobs/4001?gh_src=x',
        updated_at: '2026-09-20T09:00:00Z',
        offices: [{ name: 'London' }],
        departments: [{ name: 'Engineering' }],
        content: '&lt;p&gt;Build &lt;b&gt;things&lt;/b&gt;&lt;/p&gt;',
      },
      'greenhouse',
      'acme',
    )!;
    expect(p.url).toBe('https://boards.greenhouse.io/acme/jobs/4001');
    expect(p.location).toBe('London');
    expect(p.department).toBe('Engineering');
    expect(p.body).toContain('Build things');
    expect(p.remote).toBe(false);
  });

  it('reads a Lever record, epoch date and remote from the location', () => {
    const p = normalisePosting(
      {
        text: 'SDR',
        hostedUrl: 'https://jobs.lever.co/mercury/abc-123-def',
        createdAt: 1695000000000,
        categories: { location: 'Remote - US', team: 'Sales' },
        descriptionPlain: 'Sell things',
      },
      'lever',
      'mercury',
    )!;
    expect(p.title).toBe('SDR');
    expect(p.remote).toBe(true);
    expect(p.department).toBe('Sales');
    expect(p.posted_at).toBe(new Date(1695000000000).toISOString());
  });

  it('drops a record with no title, no URL, a bad scheme or a board home page', () => {
    expect(normalisePosting({ absolute_url: 'https://boards.greenhouse.io/a/jobs/1' }, 'greenhouse', 'a')).toBeNull();
    expect(normalisePosting({ title: 'X' }, 'greenhouse', 'a')).toBeNull();
    expect(normalisePosting({ title: 'X', url: 'ftp://x/y' }, 'greenhouse', 'a')).toBeNull();
    expect(normalisePosting({ title: 'X', url: 'https://jobs.lever.co/acme' }, 'lever', 'acme')).toBeNull();
  });

  it('falls back to the company token rather than inventing a name', () => {
    const p = normalisePosting(
      { title: 'X', jobUrl: 'https://jobs.ashbyhq.com/acme/abcdef12' },
      'ashby',
      'acme',
    )!;
    expect(p.company).toBe('acme');
  });
});

describe('pooled', () => {
  it('never runs more than the limit at once and keeps order', async () => {
    let live = 0;
    let peak = 0;
    const out = await pooled([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });
});

describe('postingsToCsv', () => {
  it('puts url first, omits the description and escapes commas', () => {
    const csv = postingsToCsv([
      {
        url: 'https://jobs.lever.co/acme/abc123',
        board: 'lever',
        company: 'Acme, Inc',
        title: 'SDR',
        location: 'London',
        posted_at: '2026-09-20T09:00:00Z',
        body: 'should not appear',
      },
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('url,board,company,title,location,posted_at');
    expect(row.startsWith('https://jobs.lever.co/acme/abc123,lever,"Acme, Inc"')).toBe(true);
    expect(csv).not.toContain('should not appear');
  });
});
