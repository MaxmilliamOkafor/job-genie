/**
 * Pure helpers for the Greenhouse / Lever / Ashby public board APIs.
 *
 * No AI, no key, no network. Everything here is a reading or normalising rule
 * so it can be tested directly.
 */

export type Board = 'greenhouse' | 'lever' | 'ashby';

export const BOARD_ENDPOINT: Record<Board, (token: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs?content=true`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
};

/** A posting URL, never a board home page. */
export const POSTING_PATH: Record<Board, RegExp> = {
  greenhouse: /^\/[A-Za-z0-9_-]+\/jobs\/\d+/i,
  lever: /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]{6,}/i,
  ashby: /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9-]{6,}/i,
};

const TRACKING = /^(?:gh_src|gh_jid|utm_[a-z]+|ref|source|lever-source(?:\[\])?|ashby_jid)$/i;

/** One spelling per posting, so the same job cannot arrive three times. */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return '';
  }
  if (!/^https?:$/.test(u.protocol)) return '';
  u.protocol = 'https:';
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING.test(k)) u.searchParams.delete(k);
  }
  u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

export function isPostingUrl(board: Board, url: string): boolean {
  try {
    return POSTING_PATH[board].test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** "embed" is a Greenhouse path segment, never a company. */
const NOT_A_TOKEN = new Set(['embed', 'jobs', 'job_app', 'www']);

export const TOKEN_FROM_URL: [RegExp, Board][] = [
  [/(?:job-)?boards\.greenhouse\.io\/embed\/job_app\?[^#]*\bfor=([A-Za-z0-9_-]+)/i, 'greenhouse'],
  [/(?:job-)?boards\.greenhouse\.io\/([A-Za-z0-9_-]+)(?:\/|$|\?)/i, 'greenhouse'],
  [/jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_-]+)(?:\/|$|\?)/i, 'lever'],
  [/jobs\.ashbyhq\.com\/([A-Za-z0-9_.-]+)(?:\/|$|\?)/i, 'ashby'],
];

export function companyFromUrl(raw: string): { board: Board; token: string } | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  for (const [re, board] of TOKEN_FROM_URL) {
    const m = s.match(re);
    if (m && m[1] && !NOT_A_TOKEN.has(m[1].toLowerCase())) {
      return { board, token: m[1] };
    }
  }
  return null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#160': ' ',
};

/**
 * Greenhouse sends escaped HTML. Tags are removed so a phrase split by a
 * `<strong>` mid-way is still searchable.
 */
export function stripHtml(raw: string, maxChars = 20000): string {
  let s = String(raw || '');
  // Unescape the outer layer first (content arrives escaped), then strip tags.
  s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    const key = name.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    const hex = key.match(/^#x([0-9a-f]+)$/);
    if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
    const dec = key.match(/^#(\d+)$/);
    if (dec) return String.fromCodePoint(parseInt(dec[1], 10));
    return whole;
  });
  s = s.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ');
  s = s.replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
  s = s.replace(/[ \t\u00a0]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s.slice(0, maxChars);
}

/** Lever gives epoch milliseconds, the others ISO strings. */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const n = Number(value);
    const ms = String(Math.trunc(n)).length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Lever returns a bare array; Greenhouse and Ashby wrap it. */
export function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  const p = payload as Record<string, unknown> | unknown[] | null;
  const arr = Array.isArray(p)
    ? p
    : Array.isArray((p as Record<string, unknown>)?.jobs)
      ? ((p as Record<string, unknown>).jobs as unknown[])
      : Array.isArray((p as Record<string, unknown>)?.results)
        ? ((p as Record<string, unknown>).results as unknown[])
        : [];
  return arr.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}

export interface NormalisedPosting {
  url: string;
  board: Board;
  company: string;
  title: string;
  location: string | null;
  department: string | null;
  remote: boolean;
  posted_at: string | null;
  body: string;
}

const str = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
};

/**
 * A record that cannot be made sense of is dropped, never invented: null means
 * "skipped", and the caller counts it.
 */
export function normalisePosting(
  raw: Record<string, unknown>,
  board: Board,
  companyToken: string,
): NormalisedPosting | null {
  const r = raw as Record<string, any>;
  const title = str(r.title) ?? str(r.text) ?? str(r.name);
  const rawUrl = str(r.absolute_url) ?? str(r.hostedUrl) ?? str(r.jobUrl) ?? str(r.applyUrl) ?? str(r.url);
  if (!title || !rawUrl || !/^https?:\/\//i.test(rawUrl)) return null;

  const url = canonicalUrl(rawUrl);
  if (!url || !isPostingUrl(board, url)) return null;

  const location =
    str(r.location?.name) ?? str(r.location) ?? str(r.categories?.location) ?? str(r.locationName) ??
    str(r.offices?.[0]?.name) ?? str(r.address?.postalAddress?.addressLocality);
  const department =
    str(r.department?.name) ?? str(r.department) ?? str(r.categories?.team) ?? str(r.departments?.[0]?.name) ??
    str(r.team);
  const remote =
    r.isRemote === true || r.remote === true || r.isListed === undefined && false ||
    /\bremote\b/i.test(String(location ?? '')) || /\bremote\b/i.test(String(str(r.workplaceType) ?? ''));
  const posted_at = toIsoDate(
    r.updated_at ?? r.createdAt ?? r.publishedAt ?? r.published_at ?? r.first_published ?? r.updatedAt ?? r.publishedDate,
  );
  const body = stripHtml(str(r.content) ?? str(r.descriptionPlain) ?? str(r.description) ?? str(r.descriptionHtml) ?? '');
  const company =
    str(r.company) ?? str(r.companyName) ?? str(r.organizationName) ?? companyToken;

  return { url, board, company, title, location, department, remote: !!remote, posted_at, body };
}

/** Fetch at most `limit` boards at a time; free endpoints stay free. */
export async function pooled<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

const CSV_COLUMNS = ['url', 'board', 'company', 'title', 'location', 'posted_at'] as const;

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  // Leading =, +, -, @ are formula triggers in spreadsheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Plain CSV a simple importer can read. The job description is never included. */
export function postingsToCsv(rows: Record<string, unknown>[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(','));
  return lines.join('\r\n');
}
