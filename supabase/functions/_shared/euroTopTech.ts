/**
 * Euro Top Tech member API: the pure parts, shared by the edge function and
 * its tests. Nothing here holds or sees the API key.
 *
 * The member API serves the board to the member's own tools, with the same
 * daily limits as the site. Listings are shown to the signed-in member only,
 * never republished, and an apply link is fetched one posting at a time,
 * when the member asks for it, because each one counts against the limit.
 */

export const ETT_BASE = 'https://www.eurotoptech.com/api/v1';

export const ETT_WORKPLACES = ['onsite', 'hybrid', 'remote_country', 'remote_anywhere'] as const;
export const ETT_CATEGORIES = ['engineering', 'data', 'product', 'design', 'marketing', 'sales', 'operations', 'other'] as const;
export const ETT_SORTS = ['newest', 'pay_desc', 'pay_asc'] as const;

export interface EttListParams {
  q?: string;
  workplace?: string[];
  country?: string[];
  city?: string[];
  company?: string[];
  seniority?: string[];
  category?: string[];
  min_comp?: number;
  posted_since?: string;
  sort?: string;
  page?: number;
}

const clean = (v: unknown, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const list = (v: unknown, allowed?: readonly string[]) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((x) => clean(x, 80))
    .filter((x) => x && (!allowed || allowed.includes(x)))
    .slice(0, 12);

/** The /jobs query string from what the page asked for, values checked. */
export function jobsQuery(p: EttListParams): string {
  const q = new URLSearchParams();
  const text = clean(p.q, 200);
  if (text) q.set('q', text);
  const add = (name: string, values: string[]) => { if (values.length) q.set(name, values.join(',')); };
  add('workplace', list(p.workplace, ETT_WORKPLACES));
  add('country', list(p.country));
  add('city', list(p.city));
  add('company', list(p.company));
  add('seniority', list(p.seniority));
  add('category', list(p.category, ETT_CATEGORIES));
  const min = Math.floor(Number(p.min_comp));
  if (Number.isFinite(min) && min > 0) q.set('min_comp', String(Math.min(min, 10_000_000)));
  const since = clean(p.posted_since, 40);
  if (since && !Number.isNaN(Date.parse(since))) q.set('posted_since', new Date(since).toISOString().slice(0, 10));
  const sort = clean(p.sort, 20);
  if ((ETT_SORTS as readonly string[]).includes(sort)) q.set('sort', sort);
  const page = Math.floor(Number(p.page));
  q.set('page', String(Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1));
  q.set('group', 'true');
  return q.toString();
}

/** A jobId is a positive whole number, or nothing is asked for. */
export function jobIdOf(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1e12 ? n : null;
}

export interface EttError { status: number; error: string; message: string; retryAfter?: number }

/** What the member reads when the API says no. */
export function ettError(status: number, code: string, retryAfter?: string | null): EttError {
  const secs = Number(retryAfter);
  if (status === 429) {
    const wait = Number.isFinite(secs) && secs > 0 ? Math.ceil(secs / 60) : null;
    return { status, error: 'limit', retryAfter: Number.isFinite(secs) ? secs : undefined,
      message: 'Euro Top Tech limit reached' + (wait ? ', try again in ' + wait + ' minute' + (wait === 1 ? '' : 's') : ', try again later') + '.' };
  }
  if (status === 401 || status === 403) {
    return { status, error: code || 'unauthorized', message: 'Your Euro Top Tech key or membership needs attention (eurotoptech.com/account).' };
  }
  if (status === 404) return { status, error: 'not_found', message: 'That posting is no longer on the Euro Top Tech board.' };
  if (status === 400) return { status, error: 'invalid_param', message: 'Euro Top Tech did not accept one of the filters.' };
  return { status, error: code || 'unavailable', message: 'Euro Top Tech is not available right now.' };
}

/** The pay as the board gives it. An estimate is said to be one, never shown as the posting's salary. */
export function payLabel(row: Record<string, unknown>): string {
  const pay = (row?.pay ?? {}) as Record<string, unknown>;
  const eur = (n: unknown) => (typeof n === 'number' && n > 0 ? '€' + Math.round(n).toLocaleString('en-GB') : '');
  if (pay.kind === 'posted') {
    const min = pay.min ?? pay.low ?? pay.from, max = pay.max ?? pay.high ?? pay.to;
    const cur = String(pay.currency || '');
    const fmt = (n: unknown) => (typeof n === 'number' ? (cur ? cur + ' ' : '') + Math.round(n).toLocaleString('en-GB') : '');
    const range = [fmt(min), fmt(max)].filter(Boolean).join(' to ');
    return range ? 'Posted: ' + range : 'Posted pay';
  }
  if (pay.kind === 'estimate') return eur(pay.totalCompEur) ? 'Estimate: about ' + eur(pay.totalCompEur) + ' total' + (pay.approx ? ' (country level)' : '') : '';
  if (pay.kind === 'band') return 'Company pay band';
  return '';
}

/** The fields the page shows, from one board row. No apply link: the board's rows carry none. */
export function cardOf(row: Record<string, unknown>) {
  const r = row || {};
  return {
    jobId: jobIdOf(r.jobId),
    title: clean(r['Job Title'], 200),
    company: clean(r.Company, 120),
    location: clean(r.Location, 160),
    country: clean(r.Country, 80),
    workplace: clean(r.workplaceMode, 30),
    seniority: clean(r.Seniority, 40),
    postedDate: clean(r['Posted Date'] ?? r.postedDate, 40) || null,
    pay: payLabel(r),
    relocation: r.relocationSupport === 'offered' ? 'offered' : r.relocationSupport === 'not_offered' ? 'not offered' : null,
    visa: r.visaSponsorship === 'offered' ? 'offered' : r.visaSponsorship === 'not_offered' ? 'not offered' : null,
    otherPlaces: Number(r.otherPlacesCount) || 0,
    jobPage: typeof r.jobPage === 'string' && /^https:\/\/www\.eurotoptech\.com\//.test(r.jobPage) ? r.jobPage : null,
  };
}

/** The most postings one daily refresh keeps, and the windows it offers. */
export const ETT_SYNC_CAP = 2500;
export const ETT_SYNC_DAYS = [3, 7] as const;

/** The /jobs query for one page of a refresh: every posting, newest first, from the window. */
export function syncQuery(days: number, page: number, now = Date.now()): string {
  const d = (ETT_SYNC_DAYS as readonly number[]).includes(days) ? days : 7;
  const since = new Date(now - d * 86400000).toISOString().slice(0, 10);
  const q = new URLSearchParams({ sort: 'newest', posted_since: since, group: 'false', page: String(Math.max(1, Math.floor(page) || 1)) });
  return q.toString();
}

/** A stored row for one card, owned by the signed-in member. */
export function rowOf(card: ReturnType<typeof cardOf>, userId: string) {
  return {
    user_id: userId, job_id: card.jobId, title: card.title, company: card.company, location: card.location,
    country: card.country, workplace: card.workplace, seniority: card.seniority,
    posted_date: card.postedDate && !Number.isNaN(Date.parse(card.postedDate)) ? new Date(card.postedDate).toISOString() : null,
    pay: card.pay, relocation: card.relocation, visa: card.visa, job_page: card.jobPage,
  };
}

/** Only an https link is ever handed to the page as an apply link. */
export function safeApplyUrl(v: unknown): string | null {
  try {
    const u = new URL(String(v || ''));
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
