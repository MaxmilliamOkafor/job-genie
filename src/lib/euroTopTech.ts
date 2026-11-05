/**
 * Euro Top Tech on the Live feed: the parts with no network or React, so
 * they can be tested. The listings come through the eurotoptech-jobs edge
 * function, which holds the API key; this file never sees it.
 */
import type { JobPreferences } from './jobPreferences';

export interface EttCard {
  jobId: number;
  title: string;
  company: string;
  location: string;
  workplace: string;
  seniority: string;
  postedDate: string | null;
  pay: string;
  relocation: string | null;
  visa: string | null;
  otherPlaces: number;
  jobPage: string | null;
}

export interface EttFacets {
  countries?: string[];
  cities?: string[];
}

export interface EttSearch {
  q: string;
  workplace: string[];
  country: string[];
  city: string[];
  seniority: string[];
  posted_since?: string;
  page: number;
}

const WORKPLACE: Record<string, string[]> = {
  remote: ['remote_country', 'remote_anywhere'],
  hybrid: ['hybrid'],
  onsite: ['onsite'],
};

// The site's seniority values, in the board's own labels.
const SENIORITY: Record<string, string[]> = {
  internship: ['intern'],
  entry: ['entry-level'],
  mid: ['mid-level'],
  senior: ['senior'],
  lead: ['senior', 'staff'],
  principal: ['staff', 'senior staff', 'principal'],
  executive: ['principal'],
};

const names = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? x : (x as { name?: string; value?: string })?.name ?? (x as { value?: string })?.value ?? ''))
    .filter((x): x is string => !!x);

/** The board's countries and cities, whatever shape /facets gives them in. */
export function facetLists(raw: unknown): EttFacets {
  const f = (raw ?? {}) as Record<string, unknown>;
  return { countries: names(f.countries ?? f.country), cities: names(f.cities ?? f.city) };
}

/**
 * Your saved job preferences as a board search: the role you are looking
 * at, your places matched to the board's own country and city names (a
 * place it does not list is left out rather than guessed), your workplace
 * and seniority in its labels.
 */
export function searchFromPreferences(prefs: JobPreferences, facets: EttFacets, role?: string): EttSearch {
  const countries = new Map((facets.countries ?? []).map((c) => [c.toLowerCase(), c]));
  const cities = new Map((facets.cities ?? []).map((c) => [c.toLowerCase(), c]));
  const country = new Set<string>();
  const city = new Set<string>();
  let remote = false;
  for (const raw of prefs.locations ?? []) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.some((p) => /^remote$/i.test(p))) remote = true;
    for (const p of parts) {
      const c = countries.get(p.toLowerCase());
      if (c) country.add(c);
      const t = cities.get(p.toLowerCase());
      if (t) city.add(t);
    }
  }
  const workplace = new Set<string>();
  for (const w of prefs.workplace ?? []) for (const m of WORKPLACE[w.toLowerCase()] ?? []) workplace.add(m);
  if (remote) WORKPLACE.remote.forEach((m) => workplace.add(m));
  const seniority = new Set<string>();
  for (const s of prefs.seniority ?? []) for (const m of SENIORITY[s] ?? []) seniority.add(m);
  return {
    q: (role ?? prefs.roles?.[0] ?? '').trim(),
    workplace: [...workplace],
    // A city narrows to located roles only, so a remote search keeps the country.
    country: [...country],
    city: remote ? [] : [...city],
    seniority: [...seniority],
    page: 1,
  };
}

/** Posted after your last visit: shown as New. */
export function isNew(card: EttCard, lastSeen: number | null): boolean {
  if (!lastSeen || !card.postedDate) return false;
  const t = Date.parse(card.postedDate);
  // The board dates a posting by its day, so the day of your last visit counts.
  return Number.isFinite(t) && t >= new Date(new Date(lastSeen).toISOString().slice(0, 10)).getTime();
}

/** The row a job you apply to is kept as in Saved jobs. */
export function savedJobOf(card: EttCard, url: string, userId: string) {
  const workplace = card.workplace === 'hybrid' ? 'Hybrid' : card.workplace === 'onsite' ? 'Onsite' : /remote/.test(card.workplace) ? 'Remote' : null;
  return {
    user_id: userId,
    title: card.title,
    company: card.company,
    location: card.location,
    url,
    platform: 'eurotoptech',
    source_name: 'Euro Top Tech',
    posted_date: card.postedDate,
    workplace_type: workplace,
  };
}

export const lastSeenKey = (userId: string) => `ett_last_seen_${userId}`;
export const lastSyncKey = (userId: string, days: number) => `ett_last_sync_${days}_${userId}`;

/** A refresh is due when there has been none, or the last is older than the interval. */
export function needsRefresh(lastSync: number | null, now: number, everyMs: number): boolean {
  return !lastSync || now - lastSync >= everyMs;
}

/** One kept posting, as the ett_postings table holds it. */
export interface EttRow {
  job_id: number;
  title: string | null;
  company: string | null;
  location: string | null;
  country: string | null;
  workplace: string | null;
  seniority: string | null;
  posted_date: string | null;
  pay: string | null;
  relocation: string | null;
  visa: string | null;
  job_page: string | null;
  first_seen_at: string;
}

export interface EttFilter {
  query: string;
  workplace: string[];
  country: string;
  /** Your saved roles, places, workplace and seniority, or null for every posting. */
  preferences: JobPreferences | null;
  /** Only postings first kept after this time, or null. */
  newSince: number | null;
}

const SENIORITY_WORDS: Record<string, RegExp> = {
  internship: /intern/i, entry: /entry/i, mid: /mid/i, senior: /senior/i,
  lead: /senior|staff|lead|manager/i, principal: /staff|principal/i, executive: /principal|director|head|vp/i,
};

/** The kept postings that match, newest first. */
export function filterPostings(rows: EttRow[], f: EttFilter): EttRow[] {
  const q = f.query.trim().toLowerCase();
  const p = f.preferences;
  const roleWords = (p?.roles ?? []).map((r) => r.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const places = (p?.locations ?? []).flatMap((l) => l.split(',').map((x) => x.trim().toLowerCase())).filter(Boolean);
  const wantRemote = places.includes('remote') || (p?.workplace ?? []).some((w) => /remote/i.test(w));
  const prefModes = new Set((p?.workplace ?? []).flatMap((w) => WORKPLACE[w.toLowerCase()] ?? []));
  return rows.filter((r) => {
    const text = `${r.title ?? ''} ${r.company ?? ''}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (f.workplace.length && !f.workplace.includes(r.workplace ?? '')) return false;
    if (f.country && r.country !== f.country) return false;
    if (f.newSince && !(Date.parse(r.first_seen_at) > f.newSince)) return false;
    if (p) {
      const title = (r.title ?? '').toLowerCase();
      if (roleWords.length && !roleWords.some((ws) => ws.length && ws.every((w) => title.includes(w)))) return false;
      const where = `${r.location ?? ''} ${r.country ?? ''}`.toLowerCase();
      const remoteOk = wantRemote && /remote/.test(r.workplace ?? '');
      const placeList = places.filter((x) => x !== 'remote');
      if (placeList.length && !remoteOk && !placeList.some((x) => where.includes(x))) return false;
      if (prefModes.size && !prefModes.has(r.workplace ?? '')) return false;
      const sen = p.seniority ?? [];
      if (sen.length && r.seniority && !sen.some((s) => SENIORITY_WORDS[s]?.test(r.seniority ?? ''))) return false;
    }
    return true;
  });
}

type CsvRow = { title: string | null; company: string | null; location: string | null; country: string | null; workplace: string | null; seniority: string | null; posted_date: string; pay: string | null; visa: string | null; relocation: string | null; job_page: string | null };

/** CSV of postings, one row each, with the job link in its own column. */
export function postingsCsv(rows: CsvRow[]): string {
  const head = ['Title', 'Company', 'Location', 'Country', 'Workplace', 'Seniority', 'Posted', 'Pay', 'Visa', 'Relocation', 'Job URL'];
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [r.title, r.company, r.location, r.country, r.workplace, r.seniority, r.posted_date, r.pay, r.visa, r.relocation, r.job_page].map(cell).join(','));
  return '\uFEFF' + [head.join(','), ...lines].join('\r\n');
}
