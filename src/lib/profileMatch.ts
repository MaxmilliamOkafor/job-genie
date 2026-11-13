/**
 * How well a saved job fits the saved profile, counted from the profile itself.
 *
 * The terms a job asks for are the known skill terms (and the user's own skill
 * names) that its description names. A term counts as covered when the profile
 * shows it anywhere: a skill, a role bullet, a role's skills, or a project.
 * A job with no description, or naming fewer than three skill terms, is
 * "Not scored" (null), never 0%.
 */
import { SKILL_VOCABULARY } from './profileValidation';
import { buildTermPattern, termAppearsIn } from './keywordCoverage';

/** Too ambiguous to read from prose ("go to market", "R&D", "a spring launch"). */
const AMBIGUOUS = new Set(['c', 'r', 'go', 'rest', 'express', 'spring', 'shell', 'ai', 'ml', 'git', 'sre', 'iam', 'sso', 'statistics', 'forecasting', 'caching', 'scalability', 'helpdesk']);

const tidy = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** "Technical: Python, Java, SQL" is three skills, not one. */
function splitGrouped(entry: string): string[] {
  const text = tidy(entry);
  if (!text) return [];
  const labelled = /^([^:,]{2,40}):\s*(.+)$/.exec(text);
  const body = labelled ? labelled[2] : text;
  return body
    .split(/\s*[,;|]\s*/)
    .map((s) => s.replace(/[.\s]+$/, '').trim())
    .filter(Boolean);
}

/**
 * Every saved skill name, whatever shape it was stored in: plain text,
 * { name }, { items: [...] } groups, or "Group: a, b, c" lines. Case-insensitive
 * duplicates are counted once.
 */
export function profileSkillNames(skills: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  const visit = (entry: unknown) => {
    if (typeof entry === 'string') return splitGrouped(entry).forEach(add);
    if (!entry || typeof entry !== 'object') return;
    const e = entry as { name?: unknown; items?: unknown; skills?: unknown };
    if (typeof e.name === 'string') splitGrouped(e.name).forEach(add);
    if (Array.isArray(e.items)) e.items.forEach(visit);
    if (Array.isArray(e.skills)) e.skills.forEach(visit);
  };
  if (Array.isArray(skills)) skills.forEach(visit);
  else visit(skills);
  return out;
}

const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(lines) : typeof v === 'string' ? [v] : v && typeof v === 'object' && typeof (v as any).text === 'string' ? [(v as any).text] : [];

export interface ProfileForMatch {
  skills?: unknown;
  professional_experience?: any[] | null;
  relevant_projects?: any[] | null;
}

/** Everything the profile says it has done, as one block of text. */
export function profileEvidenceText(profile: ProfileForMatch): string {
  const parts: string[] = [...profileSkillNames(profile.skills)];
  for (const exp of profile.professional_experience ?? []) {
    parts.push(tidy(exp?.title), ...lines(exp?.bullets), tidy(exp?.description), ...profileSkillNames(exp?.skills));
  }
  for (const p of profile.relevant_projects ?? []) {
    parts.push(tidy(p?.name), tidy(p?.role), tidy(p?.description), tidy(p?.techStack), ...lines(p?.bullets), ...profileSkillNames(p?.skills));
  }
  return parts.filter(Boolean).join('\n');
}

export interface MatchResult {
  /** Whole percent, or null when the job has no description to score. */
  percent: number | null;
  matched: string[];
  missing: string[];
}

/** A job must name at least this many skill terms before a percentage means anything. */
export const MIN_TERMS_TO_SCORE = 3;

interface CompiledTerm {
  term: string;
  pattern: RegExp;
}

/** Built once per profile; scoring many jobs then only tests the job text. */
export function matcherFor(profile: ProfileForMatch) {
  const evidence = profileEvidenceText(profile);
  const vocabulary = new Map<string, string>();
  for (const term of [...profileSkillNames(profile.skills), ...SKILL_VOCABULARY]) {
    const key = term.toLowerCase().trim();
    if (!key || key.length < 2 || AMBIGUOUS.has(key) || vocabulary.has(key)) continue;
    vocabulary.set(key, term);
  }
  const compiled: CompiledTerm[] = [];
  for (const term of vocabulary.values()) {
    const pattern = buildTermPattern(term);
    if (pattern) compiled.push({ term, pattern });
  }
  const held = new Set(compiled.filter((c) => termAppearsIn(evidence, c.term)).map((c) => c.term));

  return (job: { title?: string | null; description?: string | null }): MatchResult => {
    const description = tidy(job.description);
    if (!description) return { percent: null, matched: [], missing: [] };
    const text = `${tidy(job.title)}\n${description}`;
    const asked = compiled.filter((c) => c.pattern.test(text)).map((c) => c.term);
    // One or two named skills make every percentage 0, 50 or 100: too little to score.
    if (asked.length < MIN_TERMS_TO_SCORE) return { percent: null, matched: [], missing: [] };
    const matched = asked.filter((t) => held.has(t));
    const missing = asked.filter((t) => !held.has(t));
    return { percent: Math.round((matched.length / asked.length) * 100), matched, missing };
  };
}

export function scoreJob(profile: ProfileForMatch, job: { title?: string | null; description?: string | null }): MatchResult {
  return matcherFor(profile)(job);
}

export function matchLabel(result: MatchResult): string {
  return result.percent === null ? 'Not scored' : `${result.percent}%`;
}

/** A job whose place names one of the user's preferred locations. */
export function inPreferredLocation(location: string | null | undefined, preferred: string[]): boolean {
  const loc = tidy(location).toLowerCase();
  if (!loc) return false;
  return preferred.some((p) => {
    const want = tidy(p).toLowerCase();
    return want.length > 1 && loc.includes(want);
  });
}

/** Bonus a preferred location adds when ranking; a scored job always ranks above an unscored one. */
export const PREFERRED_LOCATION_BONUS = 15;

export interface RankedMatch<T> {
  job: T;
  match: MatchResult;
  preferredLocation: boolean;
}

/**
 * Top matches: scored jobs by score plus a bonus for the user's preferred
 * locations, then unscored jobs (preferred places first). Newest wins ties.
 */
export function rankTopMatches<T extends { title?: string | null; description?: string | null; location?: string | null; created_at?: string | null }>(
  jobs: T[],
  profile: ProfileForMatch,
  preferredLocations: string[],
  limit = 10,
): RankedMatch<T>[] {
  const score = matcherFor(profile);
  const ranked = jobs.map((job) => ({
    job,
    match: score(job),
    preferredLocation: inPreferredLocation(job.location, preferredLocations),
  }));
  const value = (r: RankedMatch<T>) =>
    r.match.percent === null ? -1000 + (r.preferredLocation ? 1 : 0) : r.match.percent + (r.preferredLocation ? PREFERRED_LOCATION_BONUS : 0);
  return ranked
    .sort((a, b) => value(b) - value(a) || (Date.parse(b.job.created_at ?? '') || 0) - (Date.parse(a.job.created_at ?? '') || 0))
    .slice(0, limit);
}
