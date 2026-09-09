/**
 * Keyword coverage, counted honestly.
 *
 * Coverage is matched unique terms divided by total unique terms, measured off
 * the final document text. It is NOT a pass probability, a perfect match or a
 * recruiter's approval, and nothing here should be labelled that way.
 *
 * Matching is on whole terms. Substring matching quietly inflates the number
 * and misstates skills: "java" would be satisfied by "javascript", "react" by
 * "reactive". C++, C#, .NET, CI/CD and Node.js survive intact.
 *
 * The tailoring function mirrors this logic server-side; the two must agree.
 */

export interface CoverageResult {
  matched: string[];
  missing: string[];
  /** Whole percent, or null when there was nothing to measure. */
  percent: number | null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTermPattern(term: string): RegExp | null {
  const t = term.trim();
  if (!t) return null;
  const core = escapeRegex(t)
    .replace(/\\?\s+/g, '[\\s\\-]+')
    .replace(/\//g, '[\\/\\-]');
  const startsAlnum = /^[A-Za-z0-9]/.test(t);
  const endsAlnum = /[A-Za-z0-9]$/.test(t);
  const prefix = startsAlnum ? '(?<![A-Za-z0-9+#])' : '';
  const suffix = endsAlnum ? '(?![A-Za-z0-9+#])' : '(?![A-Za-z0-9])';
  try {
    return new RegExp(prefix + core + suffix, 'i');
  } catch {
    return null;
  }
}

/**
 * A negated mention is not coverage: "I have not worked with Scala" contains the
 * term but disclaims the skill, so only non-negated mentions count. Mirrors the
 * server-side rule in supabase/functions/_shared/coverage.ts.
 */
const NEGATION = /\b(no|not|never|without|lacking|limited|minimal|zero|nor|neither)\b[^.!?;]{0,80}$/i;

export function termAppearsIn(text: string, term: string): boolean {
  const pattern = buildTermPattern(term);
  if (!pattern) return false;
  const global = new RegExp(pattern.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 120), m.index);
    const clause = before.split(/[.!?;\n]/).pop() ?? before;
    if (!NEGATION.test(clause)) return true;
    if (m.index === global.lastIndex) global.lastIndex++;
  }
  return false;
}


export function measureCoverage(text: string, terms: string[]): CoverageResult {
  const unique = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)));
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of unique) {
    if (termAppearsIn(text, term)) matched.push(term);
    else missing.push(term);
  }
  return {
    matched,
    missing,
    percent: unique.length === 0 ? null : Math.round((matched.length / unique.length) * 100),
  };
}

/** Plain wording for the UI. Never claims an outcome. */
export function coverageLabel(result: CoverageResult, total: number): string {
  if (result.percent === null || total === 0) return 'Keyword coverage not measured for this posting';
  return `${result.matched.length} of ${total} keywords (${result.percent}%)`;
}
