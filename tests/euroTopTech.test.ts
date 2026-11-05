import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  ETT_SYNC_CAP,
  cardOf,
  ettError,
  jobIdOf,
  jobsQuery,
  payLabel,
  rowOf,
  safeApplyUrl,
  syncQuery,
} from '../supabase/functions/_shared/euroTopTech';
import { filterPostings, needsRefresh, savedJobOf, searchFromPreferences, type EttRow } from '../src/lib/euroTopTech';

const ROW = {
  jobId: 2515915, 'Job Title': 'Technical Solutions Consultant, Meta Business Agent', Company: 'Meta',
  City: 'Dublin', Country: 'Ireland', Location: 'Dublin, Ireland', workplaceMode: 'onsite', Seniority: 'mid-level',
  'Posted Date': '2026-11-02T00:00:00.000Z', pay: { kind: 'estimate', totalCompEur: 154560, savingRate: 35824, approx: false },
  relocationSupport: null, visaSponsorship: 'offered', otherPlacesCount: 0,
  jobPage: 'https://www.eurotoptech.com/jobs/preview/technical-solutions-consultant-meta-2515915',
};

describe('Euro Top Tech: the board rows', () => {
  it('reads a row into what the page shows, with no apply link', () => {
    const c = cardOf(ROW);
    expect(c.jobId).toBe(2515915);
    expect(c.country).toBe('Ireland');
    expect(c.visa).toBe('offered');
    expect(JSON.stringify(c)).not.toContain('apply');
  });
  it('says an estimate is an estimate, never the posting\'s salary', () => {
    expect(payLabel(ROW)).toBe('Estimate: about €154,560 total');
    expect(payLabel({ pay: { kind: 'posted', min: 90000, max: 120000, currency: 'EUR' } })).toBe('Posted: EUR 90,000 to EUR 120,000');
    expect(payLabel({ pay: { kind: 'none' } })).toBe('');
  });
  it('keeps only a jobPage on eurotoptech.com and an https apply link', () => {
    expect(cardOf({ ...ROW, jobPage: 'https://evil.example/x' }).jobPage).toBeNull();
    expect(safeApplyUrl('https://job-boards.greenhouse.io/x/jobs/1')).toBe('https://job-boards.greenhouse.io/x/jobs/1');
    expect(safeApplyUrl('javascript:alert(1)')).toBeNull();
    expect(safeApplyUrl('http://plain.example')).toBeNull();
  });
  it('a jobId is a positive whole number', () => {
    expect(jobIdOf('123')).toBe(123);
    expect(jobIdOf('1;drop')).toBeNull();
    expect(jobIdOf(-4)).toBeNull();
  });
});

describe('Euro Top Tech: the requests', () => {
  it('builds the list query from checked values only', () => {
    const q = new URLSearchParams(jobsQuery({ q: 'platform engineer', workplace: ['remote_country', 'teleport'], country: ['Germany', 'Poland'], sort: 'pay_desc', page: 2 }));
    expect(q.get('q')).toBe('platform engineer');
    expect(q.get('workplace')).toBe('remote_country');
    expect(q.get('country')).toBe('Germany,Poland');
    expect(q.get('sort')).toBe('pay_desc');
    expect(q.get('page')).toBe('2');
    expect(q.get('group')).toBe('true');
  });
  it('a refresh asks for every posting, newest first, from the past 3 or 7 days', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(syncQuery(3, 1, now)).toBe('sort=newest&posted_since=2026-11-02&group=false&page=1');
    expect(syncQuery(7, 4, now)).toBe('sort=newest&posted_since=2026-10-29&group=false&page=4');
    expect(syncQuery(30, 1, now)).toContain('posted_since=2026-10-29');
    expect(ETT_SYNC_CAP).toBe(2500);
  });
  it('a kept row belongs to the signed-in member', () => {
    const r = rowOf(cardOf(ROW), 'user-1');
    expect(r.user_id).toBe('user-1');
    expect(r.job_id).toBe(2515915);
    expect(r.posted_date).toBe('2026-11-02T00:00:00.000Z');
  });
});

describe('Euro Top Tech: errors in plain words', () => {
  it('a limit says when to try again', () => {
    const e = ettError(429, 'feed-account-limit', '600');
    expect(e.message).toBe('Euro Top Tech limit reached, try again in 10 minutes.');
    expect(e.retryAfter).toBe(600);
  });
  it('a bad key or ended membership says where to fix it', () => {
    expect(ettError(401, 'invalid_key').message).toContain('eurotoptech.com/account');
    expect(ettError(403, 'membership_required').message).toContain('membership');
  });
  it('a gone posting and an outage are told apart', () => {
    expect(ettError(404, 'not_found').message).toContain('no longer');
    expect(ettError(503, 'unavailable').message).toContain('not available');
  });
});

describe('Euro Top Tech: the key stays on the server', () => {
  const fn = readFileSync(new URL('../supabase/functions/eurotoptech-jobs/index.ts', import.meta.url), 'utf8');
  it('reads it from the secret and only sends it to Euro Top Tech', () => {
    expect(fn).toContain("Deno.env.get('EUROTOPTECH_API_KEY')");
    expect(fn).toMatch(/Authorization: 'Bearer ' \+ key/);
    // The key's value never goes into a response body.
    expect(fn).not.toMatch(/json\(\{[^}]*[{,]\s*key\s*[,}]/);
    expect(fn).not.toMatch(/json\(\{[^}]*:\s*key\b/);
    expect(fn).not.toMatch(/console\.(log|error|warn)\([^)]*key/);
  });
  it('refuses anyone not signed in, and a missing key says so', () => {
    expect(fn).toContain("if (authError || !auth?.user) return json({ error: 'unauthorized'");
    expect(fn).toContain("error: 'no_key'");
  });
  it('a refresh stops at the first page with nothing new, and at the account limit', () => {
    expect(fn).toContain('if (known.size && !news.length) break;');
    expect(fn).toMatch(/if \(!res\.ok\) \{ stopped = ettError/);
  });
  it('the table is private to its member and emptied after 7 days', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261105120000_eurotoptech_postings.sql', import.meta.url), 'utf8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)');
    expect(sql).toContain("interval '7 days'");
  });
});

const row = (o: Partial<EttRow>): EttRow => ({
  job_id: 1, title: 'Senior Solutions Consultant', company: 'Elite', location: 'Dublin, Ireland', country: 'Ireland',
  workplace: 'onsite', seniority: 'senior', posted_date: '2026-11-04T00:00:00Z', pay: '', relocation: null, visa: null,
  job_page: null, first_seen_at: '2026-11-05T09:00:00Z', ...o,
});

describe('Euro Top Tech: the page', () => {
  const rows = [
    row({ job_id: 1 }),
    row({ job_id: 2, title: 'Data Engineer', company: 'Stripe', location: 'Berlin, Germany', country: 'Germany', workplace: 'remote_country', seniority: 'mid-level', first_seen_at: '2026-11-03T09:00:00Z' }),
    row({ job_id: 3, title: 'Account Executive', company: 'Google', workplace: 'hybrid', seniority: 'mid-level' }),
  ];
  const none = { query: '', workplace: [], country: '', preferences: null, newSince: null };
  it('shows every kept posting with no filter', () => {
    expect(filterPostings(rows, none).length).toBe(3);
  });
  it('filters by words, workplace, country and new since your last visit', () => {
    expect(filterPostings(rows, { ...none, query: 'stripe' }).map((r) => r.job_id)).toEqual([2]);
    expect(filterPostings(rows, { ...none, workplace: ['remote_country', 'remote_anywhere'] }).map((r) => r.job_id)).toEqual([2]);
    expect(filterPostings(rows, { ...none, country: 'Ireland' }).map((r) => r.job_id)).toEqual([1, 3]);
    expect(filterPostings(rows, { ...none, newSince: Date.parse('2026-11-04T00:00:00Z') }).map((r) => r.job_id)).toEqual([1, 3]);
  });
  it('matches your saved roles, places and seniority when you ask', () => {
    const prefs = { roles: ['Solutions Consultant'], locations: ['Dublin, Ireland'], seniority: ['senior'], workplace: [] };
    expect(filterPostings(rows, { ...none, preferences: prefs }).map((r) => r.job_id)).toEqual([1]);
  });
  it('turns your preferences into a board search with the board\'s own names', () => {
    const s = searchFromPreferences({ roles: ['Solutions Consultant'], locations: ['Dublin, Ireland', 'Remote'], seniority: ['senior'], workplace: ['Hybrid'] },
      { countries: ['Ireland', 'Germany'], cities: ['Dublin'] });
    expect(s.q).toBe('Solutions Consultant');
    expect(s.country).toEqual(['Ireland']);
    expect(s.workplace.sort()).toEqual(['hybrid', 'remote_anywhere', 'remote_country']);
    expect(s.seniority).toEqual(['senior']);
  });
  it('refreshes when it never has, or every 30 minutes', () => {
    expect(needsRefresh(null, 1000, 1800000)).toBe(true);
    expect(needsRefresh(Date.now() - 60000, Date.now(), 1800000)).toBe(false);
    expect(needsRefresh(Date.now() - 1900000, Date.now(), 1800000)).toBe(true);
  });
  it('a job you apply to is kept in Saved jobs, named for its source', () => {
    const j = savedJobOf({ jobId: 1, title: 'X', company: 'Y', location: 'Dublin', workplace: 'remote_country', seniority: '', postedDate: null, pay: '', relocation: null, visa: null, otherPlaces: 0, jobPage: null }, 'https://a.example/1', 'u');
    expect(j.source_name).toBe('Euro Top Tech');
    expect(j.workplace_type).toBe('Remote');
    expect(j.user_id).toBe('u');
  });
});
