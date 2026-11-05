import { isGoLanguageMention } from './documentChecks.ts';
const REGIONS = new Set(`Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Ontario|Prince Edward Island|Quebec|Saskatchewan|Northwest Territories|Nunavut|Yukon|EMEA|APAC|LATAM|Europe|Asia|Africa|North America|South America|Middle East|Caribbean`.toLowerCase().split('|'));
const STATES = new Set('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|United Kingdom|United States|UK|USA|US|EU|European Union|Scotland|England|Wales|Northern Ireland'.toLowerCase().split("|"));
export function excludedKeyword(term: string): boolean {
  const key = term.toLowerCase().trim();
  if (/\b(?:consultants|managers|engineers|analysts|developers|stakeholders|clients|partners|users|customers|vendors|employees|teams)$/.test(key)) return true;
  if (/\b(?:provinces?|states?|regions?|countries|territories|time zones?)$/.test(key)) return true;
  if (/^(?:utc|gmt|[ecmp][ds]t|bst|ist|cet|cest|aest|aedt)(?:\s*[+-]\s*\d+)?$/.test(key)) return true;
  if (/^go[- ](?:live|to)(?:\b|[- ])/.test(key)) return true;
  if (REGIONS.has(key) || STATES.has(key)) return true;
  const countries = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (countries.of(code)?.toLowerCase() === key && key !== code.toLowerCase()) return true;
  }
  return false;
}
export function filterJobKeywords(terms: string[], posting: string): string[] {
  return terms.filter((term) => !excludedKeyword(term) && (term.toLowerCase() !== 'go' || isGoLanguageMention(posting)));
}