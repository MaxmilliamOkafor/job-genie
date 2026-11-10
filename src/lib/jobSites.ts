/** Job sites whose posting links the queue accepts, matched on the hostname. */
export const SUPPORTED_JOB_SITE_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'myworkdayjobs.com',
  'ashbyhq.com',
  'smartrecruiters.com',
  'icims.com',
  'jobvite.com',
  'linkedin.com',
  'workable.com',
  // UKG / UltiPro
  'ultipro.com',
  'ukg.net',
  // Phenom (employer career sites built on Phenom)
  'phenompeople.com',
  // Eightfold
  'eightfold.ai',
  // ClearCompany
  'clearcompany.com',
  'hrmdirect.com',
];

export function isSupportedJobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SUPPORTED_JOB_SITE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`) || host.includes(d));
  } catch {
    return false;
  }
}
