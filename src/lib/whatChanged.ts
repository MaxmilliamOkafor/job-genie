/** The "What changed" lines from a tailoring reply: plain strings only, at most five. */
export function whatChangedLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/<[^>]*>/g, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}
