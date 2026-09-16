/**
 * Excluded keywords: requirements the candidate has told us never to tailor into
 * a CV or cover letter, on any device.
 *
 * The stored list is the extension's data too. It is therefore kept byte-for-byte
 * as written: never deduplicated, never rewritten, never reordered, and entries
 * with an unfamiliar `id` are preserved untouched.
 */

export interface ExcludedKeyword {
  /** Canonical requirement key. */
  id: string;
  /** What the user typed or clicked. */
  term: string;
  /** Synonym group this exclusion reaches. */
  covers: string[];
  note?: string;
  /** ISO 8601 timestamp. */
  at: string;
}

export function canonicalKey(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/** Parses whatever is stored, discarding nothing that has an id and a term. */
export function parseExcludedKeywords(value: unknown): ExcludedKeyword[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      id: String(e.id ?? canonicalKey(String(e.term ?? ''))),
      term: String(e.term ?? ''),
      covers: Array.isArray(e.covers) ? e.covers.map(String) : [],
      note: typeof e.note === 'string' ? e.note : undefined,
      at: typeof e.at === 'string' ? e.at : new Date(0).toISOString(),
    }))
    .filter((e) => e.term.trim().length > 0);
}

export function newExclusion(term: string, covers: string[] = [], note?: string): ExcludedKeyword {
  const t = term.trim();
  return {
    id: canonicalKey(t),
    term: t,
    covers: covers.map((c) => c.trim()).filter(Boolean),
    ...(note && note.trim() ? { note: note.trim() } : {}),
    at: new Date().toISOString(),
  };
}

/** True when this requirement is covered by an exclusion (term or synonym group). */
export function isExcluded(term: string, exclusions: ExcludedKeyword[]): boolean {
  const key = canonicalKey(term);
  return exclusions.some(
    (e) => canonicalKey(e.term) === key || e.id === key || e.covers.some((c) => canonicalKey(c) === key),
  );
}

/** Removes excluded requirements before coverage is measured or additions proposed. */
export function applyExclusions(terms: string[], exclusions: ExcludedKeyword[]): string[] {
  if (exclusions.length === 0) return terms;
  return terms.filter((t) => !isExcluded(t, exclusions));
}

/** Removes one entry by identity, leaving the order of everything else alone. */
export function removeExclusion(list: ExcludedKeyword[], entry: ExcludedKeyword): ExcludedKeyword[] {
  const index = list.findIndex((e) => e.id === entry.id && e.term === entry.term && e.at === entry.at);
  if (index === -1) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}
