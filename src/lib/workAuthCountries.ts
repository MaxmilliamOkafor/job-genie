// Countries offered for work authorisation (ISO 3166-1 alpha-2): Ireland plus the EEA,
// with the full country names some ATS forms expect instead of bare codes.
export const WORK_AUTH_OPTIONS: { code: string; name: string }[] = [
  { code: 'IE', name: 'Ireland' }, { code: 'AT', name: 'Austria' }, { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' }, { code: 'HR', name: 'Croatia' }, { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' }, { code: 'DK', name: 'Denmark' }, { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' }, { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' }, { code: 'HU', name: 'Hungary' }, { code: 'IS', name: 'Iceland' },
  { code: 'IT', name: 'Italy' }, { code: 'LV', name: 'Latvia' }, { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' }, { code: 'LU', name: 'Luxembourg' }, { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' }, { code: 'NO', name: 'Norway' }, { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' }, { code: 'RO', name: 'Romania' }, { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' }, { code: 'ES', name: 'Spain' }, { code: 'SE', name: 'Sweden' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' }, { code: 'CH', name: 'Switzerland' },
];

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  WORK_AUTH_OPTIONS.map((c) => [c.code, c.name]),
);

/** "IE" -> "Ireland"; unknown codes are returned unchanged. */
export function workAuthCountryName(code: string): string {
  return NAME_BY_CODE[String(code || '').toUpperCase()] || String(code || '');
}

/** Full country names for a list of ISO codes, in the order given. */
export function workAuthCountryNames(codes: string[] | null | undefined): string[] {
  return (codes || []).map(workAuthCountryName).filter(Boolean);
}
