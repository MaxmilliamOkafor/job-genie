/**
 * Free, public-source recruiter-contact discovery.
 *
 * Every function here is pure so it can be unit tested without network access.
 * Rules enforced by this module:
 *   - no address is ever constructed or guessed; an address must appear on a
 *     page the posting itself pointed at;
 *   - an employer site is only ever reached through a URL the posting supplied
 *     (never company name + ".com");
 *   - a published address is only accepted when the surrounding page context
 *     establishes recruiting relevance;
 *   - support / accommodation / privacy / legal / press addresses are excluded;
 *   - fetching a page proves the page said something, never that a mailbox is
 *     active, so mailboxVerified stays false and timestamps are "source checked".
 */

export type ContactType =
  | 'job_poster'
  | 'published_recruiting'
  | 'recruiting_inbox'
  | 'possible_connection';

export interface DiscoveredContact {
  email: string | null;
  name: string | null;
  title: string | null;
  profileUrl: string | null;
  contactPageUrl: string | null;
  contactType: ContactType;
  sourceUrl: string;
  sourceContext: string;
  checkedAt: string;
  verificationStatus: 'source_checked' | 'unverified';
  mailboxVerified: false;
  requiresReview: boolean;
  discoveryMethod: string;
}

/* ------------------------------------------------------------------ *
 * Hosts and domains
 * ------------------------------------------------------------------ */

// Registrable-domain suffixes that carry a second label ("co.uk"), so that
// "careers.barclays.co.uk" and "barclays.co.uk" match, while "barclays.co.uk"
// and "notbarclays.co.uk" do not.
const MULTI_PART_SUFFIXES = [
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'plc.uk', 'ltd.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'org.nz', 'net.nz', 'govt.nz',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp',
  'com.br', 'com.mx', 'com.ar', 'com.sg', 'com.hk', 'com.tr', 'com.cn', 'com.tw',
  'co.in', 'net.in', 'org.in',
  'co.za', 'org.za',
  'com.ph', 'com.my', 'co.id', 'co.kr', 'co.il',
];

export function normaliseHost(host: string): string {
  return String(host || '').trim().toLowerCase().replace(/\.$/, '');
}

export function registrableDomain(hostOrUrl: string): string {
  let host = normaliseHost(hostOrUrl);
  if (host.includes('/')) {
    try {
      host = normaliseHost(new URL(host.includes('://') ? host : `https://${host}`).hostname);
    } catch {
      return '';
    }
  }
  if (!host || !host.includes('.')) return '';
  const parts = host.split('.').filter(Boolean);
  for (const suffix of MULTI_PART_SUFFIXES) {
    const s = suffix.split('.');
    if (parts.length > s.length && parts.slice(-s.length).join('.') === suffix) {
      return parts.slice(-(s.length + 1)).join('.');
    }
  }
  return parts.slice(-2).join('.');
}

export function sameRegistrableDomain(a: string, b: string): boolean {
  const da = registrableDomain(a);
  const db = registrableDomain(b);
  return !!da && da === db;
}

export function emailDomain(email: string): string {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : normaliseHost(String(email).slice(at + 1));
}

/** An email belongs to the employer only when its registrable domain matches
 *  one of the hosts the posting itself supplied. */
export function emailMatchesAllowedHosts(email: string, allowedHosts: string[]): boolean {
  const dom = emailDomain(email);
  if (!dom) return false;
  return allowedHosts.some((h) => sameRegistrableDomain(dom, h));
}

/* ------------------------------------------------------------------ *
 * Fetch safety (SSRF)
 * ------------------------------------------------------------------ */

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa', '.lan'];
const BLOCKED_HOSTS = ['localhost', 'metadata.google.internal', 'instance-data'];

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, Number(m[2]), Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('::ffff:')) return isPrivateIPv4(h.slice(7));
  return false;
}

export function isSafeFetchUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '80' && u.port !== '443') return false;
  const host = normaliseHost(u.hostname);
  if (!host || !host.includes('.') && !host.includes(':')) return false;
  if (BLOCKED_HOSTS.includes(host)) return false;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return false;
  if (isPrivateIPv4(host) || isPrivateIPv6(u.hostname)) return false;
  return true;
}

/** A redirect may only be followed to another safe URL. Cross-origin hops are
 *  allowed (ATS to employer site is normal) but re-validated every time. */
export function isSafeRedirect(from: string, to: string): boolean {
  let resolved: string;
  try {
    resolved = new URL(to, from).toString();
  } catch {
    return false;
  }
  return isSafeFetchUrl(resolved);
}

export function resolveUrl(base: string, href: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Candidate employer URLs (never constructed from a name)
 * ------------------------------------------------------------------ */

export interface PostingInput {
  jobUrl?: string | null;
  employerUrls?: string[] | null;
  jobDescriptionHtml?: string | null;
  jobDescription?: string | null;
}

const ATS_HOSTS = [
  'greenhouse.io', 'lever.co', 'workable.com', 'ashbyhq.com', 'smartrecruiters.com',
  'myworkdayjobs.com', 'workday.com', 'icims.com', 'taleo.net', 'successfactors.com',
  'jobvite.com', 'bamboohr.com', 'breezy.hr', 'teamtailor.com', 'recruitee.com',
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'totaljobs.com',
  'reed.co.uk', 'cv-library.co.uk', 'jobserve.com', 'monster.com', 'adzuna.co.uk',
  'personio.de', 'pinpointhq.com', 'jazzhr.com', 'applytojob.com', 'eightfold.ai',
];

export function isAtsHost(hostOrUrl: string): boolean {
  const dom = registrableDomain(hostOrUrl);
  return ATS_HOSTS.some((h) => dom === registrableDomain(h));
}

function urlsInText(text: string): string[] {
  const out: string[] = [];
  const re = /https?:\/\/[^\s"'<>)\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || '')) !== null) out.push(m[0].replace(/[.,;:]+$/, ''));
  return out;
}

/**
 * Candidate start URLs, in priority order. Only URLs the posting supplied are
 * returned; a company name or ATS slug is never turned into a domain.
 */
export function candidateStartUrls(posting: PostingInput): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw?: string | null) => {
    if (!raw) return;
    const trimmed = String(raw).trim();
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
    if (!isSafeFetchUrl(withScheme)) return;
    const key = withScheme.replace(/\/+$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(withScheme);
  };

  push(posting.jobUrl);
  for (const u of posting.employerUrls || []) push(u);
  for (const u of urlsInText(`${posting.jobDescriptionHtml || ''} ${posting.jobDescription || ''}`)) {
    if (!isAtsHost(u)) push(u);
  }
  return out;
}

const CAREERS_HINT = /(career|careers|jobs|join-?us|join_us|work-?with-?us|working-?here|recruit|recruiting|recruitment|talent|hiring|vacanc|opportunit|contact|about\/contact|get-in-touch)/i;

/** Links worth following from an already-fetched page: same employer domain,
 *  and the path or link text points at careers, recruiting or contact. */
export function careersLinkCandidates(html: string, baseUrl: string, limit = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || '')) !== null && out.length < limit) {
    const href = m[1];
    const text = stripTags(m[2]);
    const abs = resolveUrl(baseUrl, href);
    if (!abs || !isSafeFetchUrl(abs)) continue;
    if (!sameRegistrableDomain(abs, baseUrl)) continue;
    if (!CAREERS_HINT.test(new URL(abs).pathname) && !CAREERS_HINT.test(text)) continue;
    const key = abs.replace(/\/+$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs);
  }
  return out;
}

/** Employer homepage/careers URLs published inside a posting page (JSON-LD
 *  hiringOrganization, og:url, apply links). Nothing is invented. */
export function employerUrlsFromPostingHtml(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const push = (raw?: string | null) => {
    if (!raw) return;
    const abs = resolveUrl(pageUrl, String(raw));
    if (!abs || !isSafeFetchUrl(abs)) return;
    if (isAtsHost(abs)) return;
    out.push(abs);
  };

  for (const block of jsonLdBlocks(html)) {
    const org = block.hiringOrganization;
    if (org && typeof org === 'object') {
      push((org as Record<string, unknown>).url as string);
      const same = (org as Record<string, unknown>).sameAs;
      if (typeof same === 'string') push(same);
      if (Array.isArray(same)) same.forEach((s) => typeof s === 'string' && push(s));
    }
    const applyThrough = block.applicationContact as Record<string, unknown> | undefined;
    if (applyThrough && typeof applyThrough.url === 'string') push(applyThrough.url);
  }
  return dedupe(out);
}

/* ------------------------------------------------------------------ *
 * HTML reading
 * ------------------------------------------------------------------ */

export function stripTags(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node as Record<string, unknown>);
    for (const v of Object.values(node as Record<string, unknown>)) {
      if (v && typeof v === 'object') walk(v);
    }
  };
  while ((m = re.exec(html || '')) !== null) {
    try {
      walk(JSON.parse(m[1]));
    } catch { /* a malformed block is skipped, not fatal */ }
  }
  return out;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface RawEmailHit {
  email: string;
  context: string;
  method: 'mailto' | 'page_text' | 'json_ld';
}

export function emailHitsFromHtml(html: string): RawEmailHit[] {
  const hits: RawEmailHit[] = [];

  const mailto = /<a\b[^>]*href=["']mailto:([^"'?]+)[^"']*["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const text = stripTags(html);
  while ((m = mailto.exec(html || '')) !== null) {
    const email = decodeURIComponent(m[1]).trim();
    if (!email.includes('@')) continue;
    // A mailto address usually never appears as page text, so the context is
    // read from the markup surrounding the link.
    const around = stripTags(
      (html || '').slice(Math.max(0, m.index - 400), m.index + m[0].length + 400),
    );
    hits.push({ email, context: contextAround(text, email) || around, method: 'mailto' });

  }

  let t: RegExpExecArray | null;
  const re = new RegExp(EMAIL_RE.source, 'g');
  while ((t = re.exec(text)) !== null) {
    hits.push({ email: t[0], context: contextAround(text, t[0]), method: 'page_text' });
  }
  return hits;
}

export function contextAround(text: string, needle: string, radius = 180): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i === -1) return '';
  return text.slice(Math.max(0, i - radius), Math.min(text.length, i + needle.length + radius)).trim();
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

const EXCLUDED_LOCAL_PARTS = [
  'support', 'help', 'helpdesk', 'service', 'services', 'customerservice', 'customercare',
  'accessibility', 'accommodation', 'accommodations', 'reasonableadjustments', 'adjustments',
  'privacy', 'dpo', 'dataprotection', 'gdpr', 'subjectaccess', 'legal', 'compliance',
  'press', 'media', 'pr', 'communications', 'marketing', 'sales', 'enquiries', 'enquiry',
  'security', 'abuse', 'postmaster', 'webmaster', 'hostmaster', 'billing', 'invoice',
  'invoices', 'accounts', 'finance', 'noreply', 'no-reply', 'donotreply', 'unsubscribe',
  'newsletter', 'events', 'investor', 'investors', 'ir', 'procurement', 'suppliers',
];

const RECRUITING_LOCAL_PARTS = [
  'recruit', 'recruiting', 'recruitment', 'recruiter', 'recruiters', 'talent',
  'talentacquisition', 'ta', 'hiring', 'jobs', 'job', 'careers', 'career', 'hr',
  'peopleteam', 'people', 'resume', 'resumes', 'cv', 'cvs', 'apply', 'applications',
  'application', 'candidates', 'candidate', 'graduates', 'graduate', 'campus',
  'earlycareers', 'internships', 'vacancies', 'employment', 'staffing', 'workforus',
];

const RECRUITING_CONTEXT = /(recruit|recruiter|recruitment|talent acquisition|talent team|hiring|hiring team|hiring manager|careers?|vacanc|apply|application|candidate|resum[eé]|\bcv\b|job (posting|opening|advert|ad)|our team|people team|human resources|\bhr\b|interview|questions about (this|the) role)/i;

const ACCOMMODATION_CONTEXT = /(accommodation|reasonable adjustment|accessibility|disabilit|assistive technolog)/i;
const PRIVACY_CONTEXT = /(privacy|data protection|gdpr|subject access|cookie)/i;
const SUPPORT_CONTEXT = /(customer support|technical support|product support|billing|refund|complaint)/i;

export function localPart(email: string): string {
  return String(email || '').split('@')[0].toLowerCase();
}

function normalisedLocal(email: string): string {
  return localPart(email).replace(/[^a-z]/g, '');
}

export function isExcludedAddress(email: string, context: string): boolean {
  const norm = normalisedLocal(email);
  if (EXCLUDED_LOCAL_PARTS.includes(norm)) return true;
  if (/^(info|contact|hello|hi|admin|office|general|mail)$/.test(norm)) {
    // Generic inbox: allowed only when the page is explicitly about recruiting.
    return !RECRUITING_CONTEXT.test(context);
  }
  if (ACCOMMODATION_CONTEXT.test(context) && !RECRUITING_CONTEXT.test(context)) return true;
  if (PRIVACY_CONTEXT.test(context) && !RECRUITING_CONTEXT.test(context)) return true;
  if (SUPPORT_CONTEXT.test(context)) return true;
  return false;
}

export function looksLikeInbox(email: string): boolean {
  const norm = normalisedLocal(email);
  if (RECRUITING_LOCAL_PARTS.includes(norm)) return true;
  return RECRUITING_LOCAL_PARTS.some((p) => p.length > 3 && norm.startsWith(p));
}

export function looksLikePerson(email: string): boolean {
  const lp = localPart(email);
  if (looksLikeInbox(email)) return false;
  return /^[a-z]+([._-][a-z]+)+$/.test(lp) || /^[a-z]{2,}[._-][a-z]$/.test(lp);
}

export interface ClassifyInput {
  email: string;
  context: string;
  sourceUrl: string;
  allowedHosts: string[];
  method: string;
  posterName?: string | null;
}

/** Returns null when the address must not be shown at all. */
export function classifyContact(input: ClassifyInput, checkedAt: string): DiscoveredContact | null {
  const email = String(input.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return null;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email)) return null;

  const context = String(input.context || '').replace(/\s+/g, ' ').trim();
  if (isExcludedAddress(email, context)) return null;

  const onEmployerDomain = emailMatchesAllowedHosts(email, input.allowedHosts);
  const pageIsRecruiting = RECRUITING_CONTEXT.test(context) || CAREERS_HINT.test(input.sourceUrl);
  const inbox = looksLikeInbox(email);

  // Recruiting relevance must be established by the page, not assumed.
  if (!inbox && !pageIsRecruiting) return null;
  if (!onEmployerDomain && !inbox && !pageIsRecruiting) return null;

  let contactType: ContactType;
  let requiresReview: boolean;
  if (inbox) {
    contactType = 'recruiting_inbox';
    requiresReview = !onEmployerDomain;
  } else if (looksLikePerson(email) && pageIsRecruiting && onEmployerDomain) {
    contactType = 'published_recruiting';
    requiresReview = false;
  } else {
    contactType = 'possible_connection';
    requiresReview = true;
  }

  return {
    email,
    name: contactType === 'published_recruiting' ? nameFromContext(context, email) : null,
    title: titleFromContext(context),
    profileUrl: null,
    contactPageUrl: null,
    contactType,
    sourceUrl: input.sourceUrl,
    sourceContext: context.slice(0, 400),
    checkedAt,
    verificationStatus: 'source_checked',
    mailboxVerified: false,
    requiresReview,
    discoveryMethod: input.method,
  };
}

function nameFromContext(context: string, email: string): string | null {
  const lp = localPart(email).split(/[._-]/).filter((p) => p.length > 1);
  if (lp.length < 2) return null;
  const guessed = lp.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  // Only reported when the page itself also prints the name.
  return context.toLowerCase().includes(guessed.toLowerCase()) ? guessed : null;
}

const TITLE_RE = /((?:senior |lead |principal |global |head of )?(?:talent acquisition (?:partner|manager|specialist|lead)|technical recruiter|recruitment (?:partner|consultant|manager|lead)|recruiter|people partner|hr (?:manager|business partner)|hiring manager))/i;

function titleFromContext(context: string): string | null {
  const m = context.match(TITLE_RE);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/** The named job poster the extension read from the posting. A profile URL is
 *  never treated as proof of an email address. */
export function posterContact(
  poster: { name?: string | null; title?: string | null; profileUrl?: string | null },
  sourceUrl: string,
  checkedAt: string,
): DiscoveredContact | null {
  const name = String(poster.name || '').trim();
  if (!name) return null;
  return {
    email: null,
    name,
    title: poster.title ? String(poster.title).trim() : null,
    profileUrl: poster.profileUrl || null,
    contactPageUrl: null,
    contactType: 'job_poster',
    sourceUrl,
    sourceContext: 'Named on the job posting',
    checkedAt,
    verificationStatus: 'source_checked',
    mailboxVerified: false,
    requiresReview: false,
    discoveryMethod: 'posting',
  };
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = x.replace(/\/+$/, '').toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const TYPE_RANK: Record<ContactType, number> = {
  job_poster: 0,
  published_recruiting: 1,
  recruiting_inbox: 2,
  possible_connection: 3,
};

export function contactKey(c: DiscoveredContact): string {
  return (c.email || c.profileUrl || c.name || '').toLowerCase();
}

export function mergeContacts(contacts: DiscoveredContact[]): DiscoveredContact[] {
  const byKey = new Map<string, DiscoveredContact>();
  for (const c of contacts) {
    const key = contactKey(c);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    // Keep the better-evidenced classification, and the richer fields.
    const winner = TYPE_RANK[c.contactType] < TYPE_RANK[existing.contactType] ? c : existing;
    const other = winner === c ? existing : c;
    byKey.set(key, {
      ...winner,
      name: winner.name || other.name,
      title: winner.title || other.title,
      profileUrl: winner.profileUrl || other.profileUrl,
      sourceContext: winner.sourceContext || other.sourceContext,
      requiresReview: winner.requiresReview && other.requiresReview,
    });
  }
  return [...byKey.values()].sort((a, b) => TYPE_RANK[a.contactType] - TYPE_RANK[b.contactType]);
}
