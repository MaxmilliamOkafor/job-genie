/**
 * LeadOcean and Flow keys saved by the extension against the signed-in user.
 * The website only ever shows the last four characters; the full key is
 * reduced to that ending as soon as it is read and is never kept or shown.
 */
export const INTEGRATION_PROVIDERS = [
  { id: 'leadocean', label: 'LeadOcean' },
  { id: 'flow', label: 'Flow' },
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]['id'];

export const NOT_CONNECTED = "Not connected: add the key in the extension's Settings";

/** Last four characters of a saved key, or '' when there is no usable key. */
export function keyEnding(key: unknown): string {
  const k = typeof key === 'string' ? key.trim() : '';
  if (k.length < 20) return '';
  return k.slice(-4);
}

export function connectionLine(ending: string): string {
  return ending ? `Connected (ends in ${ending})` : NOT_CONNECTED;
}

/** Rows from the table, reduced to provider -> key ending. Unknown providers are ignored. */
export function keyEndings(rows: unknown): Partial<Record<IntegrationProvider, string>> {
  const out: Partial<Record<IntegrationProvider, string>> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const provider = (row as { provider?: unknown })?.provider;
    const match = INTEGRATION_PROVIDERS.find((p) => p.id === provider);
    if (!match) continue;
    const ending = keyEnding((row as { api_key?: unknown }).api_key);
    if (ending) out[match.id] = ending;
  }
  return out;
}
