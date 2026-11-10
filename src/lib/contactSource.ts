/**
 * Where a recruiter contact came from, as written by the extension
 * (contactRelevance) or the website (discovery_method). Every value is
 * accepted and kept as written; only the known ones get a label.
 */
export function contactSourceLabel(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!v) return null;
  if (v === 'leadocean') return 'Found through LeadOcean';
  if (v === 'flow-linkedin') return 'Found through Flow (LinkedIn)';
  if (v.startsWith('apollo')) return 'Found through Apollo';
  return null;
}
