// Tier 1 and Tier 2 Company Definitions for Job Prioritisation
// These companies are prioritised in the job feed display

export const TIER_1_COMPANIES = new Set([
  // FAANG + Major Tech
  'google', 'meta', 'amazon', 'microsoft', 'apple', 'netflix', 'nvidia', 'tesla',
  // Enterprise Software
  'salesforce', 'ibm', 'oracle', 'adobe', 'sap', 'vmware', 'servicenow', 'workday',
  // Fintech & Payments
  'stripe', 'paypal', 'visa', 'mastercard', 'block', 'square',
  // Quant & Trading Firms
  'citadel', 'jane street', 'janestreet', 'two sigma', 'twosigma', 'de shaw', 'deshaw',
  'renaissance technologies', 'rentec', 'millennium', 'virtu', 'hudson river trading',
  'jump trading', 'sig', 'susquehanna',
  // Finance & Consulting (Big 4)
  'jp morgan', 'jpmorgan', 'goldman sachs', 'morgan stanley', 'blackrock',
  'kpmg', 'deloitte', 'accenture', 'pwc', 'ey', 'mckinsey', 'bain', 'bcg',
]);

export const TIER_2_COMPANIES = new Set([
  // SaaS & Cloud
  'hubspot', 'intercom', 'zendesk', 'docusign', 'twilio', 'slack', 'atlassian',
  'gitlab', 'circleci', 'datadog', 'datadoghq', 'unity', 'udemy', 'dropbox',
  'snowflake', 'databricks', 'confluent', 'hashicorp', 'elastic', 'mongodb',
  // Social & Media
  'linkedin', 'tiktok', 'bytedance', 'snap', 'snapchat', 'pinterest', 'twitter', 'x',
  'spotify', 'discord', 'reddit', 'medium',
  // Hardware & Semiconductors
  'intel', 'broadcom', 'arm', 'tsmc', 'applied materials', 'cisco', 'amd', 'qualcomm',
  // E-commerce & Delivery
  'shopify', 'doordash', 'instacart', 'uber', 'lyft', 'airbnb', 'booking',
  // Finance
  'fidelity', 'capital one', 'capitalone', 'td securities', 'kkr', 'fenergo',
  'revolut', 'robinhood', 'coinbase', 'plaid', 'marqeta', 'chime',
  // Health & Enterprise
  'bloomberg', 'palantir', 'crowdstrike', 'palo alto networks', 'zscaler',
  'okta', 'splunk', 'dynatrace', 'new relic', 'sumo logic',
  // Gaming & Entertainment
  'roblox', 'epic games', 'activision', 'ea', 'electronic arts', 'zynga',
  // Other Major Tech
  'toast', 'toasttab', 'workhuman', 'draftkings', 'rivian', 'lucid',
  'wasabi', 'samsara', 'blockchain', 'similarweb', 'figma', 'notion',
  'canva', 'airtable', 'asana', 'monday', 'clickup', 'linear',
]);

// All tier companies combined for quick lookup
export const ALL_TIER_COMPANIES = new Set([
  ...TIER_1_COMPANIES,
  ...TIER_2_COMPANIES,
]);

// Domain mapping for company detection from URLs
export const COMPANY_DOMAINS: Record<string, string> = {
  'google.com': 'Google',
  'meta.com': 'Meta',
  'metacareers.com': 'Meta',
  'amazon.com': 'Amazon',
  'amazon.jobs': 'Amazon',
  'microsoft.com': 'Microsoft',
  'apple.com': 'Apple',
  'netflix.com': 'Netflix',
  'nvidia.com': 'Nvidia',
  'tesla.com': 'Tesla',
  'salesforce.com': 'Salesforce',
  'ibm.com': 'IBM',
  'oracle.com': 'Oracle',
  'adobe.com': 'Adobe',
  'sap.com': 'SAP',
  'vmware.com': 'VMware',
  'servicenow.com': 'ServiceNow',
  'workday.com': 'Workday',
  'stripe.com': 'Stripe',
  'paypal.com': 'PayPal',
  'visa.com': 'Visa',
  'mastercard.com': 'Mastercard',
  'citadel.com': 'Citadel',
  'janestreet.com': 'Jane Street',
  'twosigma.com': 'Two Sigma',
  'deshaw.com': 'DE Shaw',
  'jpmorgan.com': 'JP Morgan',
  'goldmansachs.com': 'Goldman Sachs',
  'morganstanley.com': 'Morgan Stanley',
  'blackrock.com': 'BlackRock',
  'kpmg.com': 'KPMG',
  'deloitte.com': 'Deloitte',
  'accenture.com': 'Accenture',
  'pwc.com': 'PwC',
  'ey.com': 'EY',
  'mckinsey.com': 'McKinsey',
  'hubspot.com': 'HubSpot',
  'intercom.com': 'Intercom',
  'zendesk.com': 'Zendesk',
  'docusign.com': 'DocuSign',
  'twilio.com': 'Twilio',
  'slack.com': 'Slack',
  'atlassian.com': 'Atlassian',
  'gitlab.com': 'GitLab',
  'datadog.com': 'Datadog',
  'datadoghq.com': 'Datadog',
  'linkedin.com': 'LinkedIn',
  'tiktok.com': 'TikTok',
  'snap.com': 'Snapchat',
  'spotify.com': 'Spotify',
  'discord.com': 'Discord',
  'intel.com': 'Intel',
  'broadcom.com': 'Broadcom',
  'arm.com': 'Arm',
  'cisco.com': 'Cisco',
  'amd.com': 'AMD',
  'qualcomm.com': 'Qualcomm',
  'shopify.com': 'Shopify',
  'doordash.com': 'DoorDash',
  'instacart.com': 'Instacart',
  'uber.com': 'Uber',
  'lyft.com': 'Lyft',
  'airbnb.com': 'Airbnb',
  'fidelity.com': 'Fidelity',
  'capitalone.com': 'Capital One',
  'bloomberg.com': 'Bloomberg',
  'palantir.com': 'Palantir',
  'crowdstrike.com': 'CrowdStrike',
  'snowflake.com': 'Snowflake',
  'databricks.com': 'Databricks',
  'mongodb.com': 'MongoDB',
  'coinbase.com': 'Coinbase',
  'robinhood.com': 'Robinhood',
  'figma.com': 'Figma',
  'notion.so': 'Notion',
  'canva.com': 'Canva',
  'airtable.com': 'Airtable',
  'asana.com': 'Asana',
};

/**
 * Get the tier level of a company
 * @returns 1 for Tier 1, 2 for Tier 2, 0 for non-tier
 */
export function getCompanyTier(companyName: string): 0 | 1 | 2 {
  const normalised = companyName.toLowerCase().trim();
  
  // Check exact match first
  if (TIER_1_COMPANIES.has(normalised)) return 1;
  if (TIER_2_COMPANIES.has(normalised)) return 2;
  
  // Check if any tier company name is contained in the company name
  for (const tier1 of TIER_1_COMPANIES) {
    if (normalised.includes(tier1) || tier1.includes(normalised)) return 1;
  }
  
  for (const tier2 of TIER_2_COMPANIES) {
    if (normalised.includes(tier2) || tier2.includes(normalised)) return 2;
  }
  
  return 0;
}

/**
 * Get company name from domain
 */
export function getCompanyFromDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return COMPANY_DOMAINS[hostname] || null;
  } catch {
    return null;
  }
}

/**
 * Prioritise and sort jobs with tier companies at the top
 * Avoids showing same company jobs back-to-back
 */
export function prioritiseJobsByTier<T extends { company: string }>(jobs: T[]): T[] {
  // Separate jobs by tier
  const tier1Jobs: T[] = [];
  const tier2Jobs: T[] = [];
  const otherJobs: T[] = [];
  
  for (const job of jobs) {
    const tier = getCompanyTier(job.company);
    if (tier === 1) tier1Jobs.push(job);
    else if (tier === 2) tier2Jobs.push(job);
    else otherJobs.push(job);
  }
  
  // Shuffle within each tier to avoid same-company clustering
  const shuffleWithSpacing = (arr: T[]): T[] => {
    if (arr.length <= 1) return arr;
    
    // Group by company
    const byCompany = new Map<string, T[]>();
    for (const job of arr) {
      const key = job.company.toLowerCase();
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(job);
    }
    
    // Interleave companies
    const result: T[] = [];
    const companies = Array.from(byCompany.values());
    let maxLen = Math.max(...companies.map(c => c.length));
    
    for (let i = 0; i < maxLen; i++) {
      for (const companyJobs of companies) {
        if (i < companyJobs.length) {
          result.push(companyJobs[i]);
        }
      }
    }
    
    return result;
  };
  
  return [
    ...shuffleWithSpacing(tier1Jobs),
    ...shuffleWithSpacing(tier2Jobs),
    ...shuffleWithSpacing(otherJobs),
  ];
}
