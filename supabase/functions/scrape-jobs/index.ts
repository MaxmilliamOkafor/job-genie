import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ATS Platform priority tiers
const PLATFORM_TIERS = {
  tier1: ['Workday', 'Greenhouse', 'Workable', 'SAP SuccessFactors', 'iCIMS', 'LinkedIn (Direct)'],
  tier2: ['Oracle Taleo', 'BambooHR', 'Bullhorn'],
  tier3: ['JazzHR', 'Jobvite', 'SmartRecruiters', 'Recruitee', 'Breezy HR'],
};

// Expanded Greenhouse companies - NO LIMIT
const GREENHOUSE_COMPANIES: { name: string; token: string }[] = [
  { name: 'Stripe', token: 'stripe' },
  { name: 'Airbnb', token: 'airbnb' },
  { name: 'Figma', token: 'figma' },
  { name: 'Notion', token: 'notion' },
  { name: 'Discord', token: 'discord' },
  { name: 'Coinbase', token: 'coinbase' },
  { name: 'Cloudflare', token: 'cloudflare' },
  { name: 'Databricks', token: 'databricks' },
  { name: 'Plaid', token: 'plaid' },
  { name: 'Ramp', token: 'ramp' },
  { name: 'Brex', token: 'brex' },
  { name: 'Gusto', token: 'gusto' },
  { name: 'Flexport', token: 'flexport' },
  { name: 'Nuro', token: 'nuro' },
  { name: 'Scale AI', token: 'scaleai' },
  { name: 'Anduril', token: 'andurilindustries' },
  { name: 'Rippling', token: 'rippling' },
  { name: 'Airtable', token: 'airtable' },
  { name: 'Webflow', token: 'webflow' },
  { name: 'Linear', token: 'linear' },
  { name: 'Vercel', token: 'vercel' },
  { name: 'Retool', token: 'retool' },
  { name: 'Mercury', token: 'mercury' },
  { name: 'Deel', token: 'deel' },
  { name: 'OpenSea', token: 'opensea' },
  { name: 'Instacart', token: 'instacart' },
  { name: 'DoorDash', token: 'doordash' },
  { name: 'Lyft', token: 'lyft' },
  { name: 'Pinterest', token: 'pinterest' },
  { name: 'Snap', token: 'snapchat' },
  { name: 'Dropbox', token: 'dropbox' },
  { name: 'Twitch', token: 'twitch' },
  { name: 'Reddit', token: 'reddit' },
  { name: 'Affirm', token: 'affirm' },
  { name: 'Robinhood', token: 'robinhood' },
  { name: 'Chime', token: 'chime' },
  { name: 'SoFi', token: 'sofi' },
  { name: 'Faire', token: 'faire' },
  { name: 'Canva', token: 'canva' },
  { name: 'HashiCorp', token: 'hashicorp' },
  { name: 'GitLab', token: 'gitlab' },
  { name: 'Elastic', token: 'elastic' },
  { name: 'MongoDB', token: 'mongodb' },
  { name: 'Snowflake', token: 'snowflake' },
  // Additional companies
  { name: 'Asana', token: 'asana' },
  { name: 'Atlassian', token: 'atlassian' },
  { name: 'Amplitude', token: 'amplitude' },
  { name: 'Auth0', token: 'auth0' },
  { name: 'Block', token: 'block' },
  { name: 'Carta', token: 'carta' },
  { name: 'Checkout.com', token: 'checkout' },
  { name: 'Circle', token: 'circle' },
  { name: 'ClickUp', token: 'clickup' },
  { name: 'ConvertKit', token: 'convertkit' },
  { name: 'CrowdStrike', token: 'crowdstrike' },
  { name: 'Datadog', token: 'datadog' },
  { name: 'DigitalOcean', token: 'digitalocean' },
  { name: 'DocuSign', token: 'docusign' },
  { name: 'Duolingo', token: 'duolingo' },
  { name: 'Etsy', token: 'etsy' },
  { name: 'Eventbrite', token: 'eventbrite' },
  { name: 'Expedia', token: 'expediagroup' },
  { name: 'Fastly', token: 'fastly' },
  { name: 'Grammarly', token: 'grammarly' },
  { name: 'HubSpot', token: 'hubspot' },
  { name: 'Intercom', token: 'intercom' },
  { name: 'Klaviyo', token: 'klaviyo' },
  { name: 'Loom', token: 'loom' },
  { name: 'Mailchimp', token: 'mailchimp' },
  { name: 'Miro', token: 'miro' },
  { name: 'MixPanel', token: 'mixpanel' },
  { name: 'monday.com', token: 'mondaycom' },
  { name: 'Navan', token: 'navan' },
  { name: 'Oscar Health', token: 'oscarhealth' },
  { name: 'Pagerduty', token: 'pagerduty' },
  { name: 'Palantir', token: 'palantir' },
  { name: 'Postman', token: 'postman' },
  { name: 'Qualtrics', token: 'qualtrics' },
  { name: 'Razorpay', token: 'razorpay' },
  { name: 'Relativity', token: 'relativityspace' },
  { name: 'Remitly', token: 'remitly' },
  { name: 'Samsara', token: 'samsara' },
  { name: 'Segment', token: 'segment' },
  { name: 'Sentry', token: 'sentry' },
  { name: 'Shopify', token: 'shopify' },
  { name: 'Snyk', token: 'snyk' },
  { name: 'SpaceX', token: 'spacex' },
  { name: 'Splunk', token: 'splunk' },
  { name: 'Squarespace', token: 'squarespace' },
  { name: 'Sumo Logic', token: 'sumologic' },
  { name: 'TaskRabbit', token: 'taskrabbit' },
  { name: 'Toast', token: 'toast' },
  { name: 'Twilio', token: 'twilio' },
  { name: 'UiPath', token: 'uipath' },
  { name: 'Unity', token: 'unity' },
  { name: 'Vanta', token: 'vanta' },
  { name: 'Verkada', token: 'verkada' },
  { name: 'Wayfair', token: 'wayfair' },
  { name: 'Wealthsimple', token: 'wealthsimple' },
  { name: 'Workiva', token: 'workiva' },
  { name: 'Zendesk', token: 'zendesk' },
  { name: 'Zillow', token: 'zillow' },
  { name: 'Zoom', token: 'zoom' },
  { name: 'Zscaler', token: 'zscaler' },
];

// Expanded Workable companies
const WORKABLE_COMPANIES: { name: string; subdomain: string }[] = [
  { name: 'Revolut', subdomain: 'revolut' },
  { name: 'N26', subdomain: 'n26' },
  { name: 'Monzo', subdomain: 'monzo' },
  { name: 'Wise', subdomain: 'transferwise' },
  { name: 'Klarna', subdomain: 'klarna' },
  { name: 'Starling Bank', subdomain: 'starlingbank' },
  { name: 'OakNorth', subdomain: 'oaknorth' },
  { name: 'GoCardless', subdomain: 'gocardless' },
  { name: 'Curve', subdomain: 'curve' },
  { name: 'Thought Machine', subdomain: 'thoughtmachine' },
];

// Lever companies
const LEVER_COMPANIES: { name: string; token: string }[] = [
  { name: 'Netflix', token: 'netflix' },
  { name: 'Spotify', token: 'spotify' },
  { name: 'Twitch', token: 'twitch' },
  { name: 'Cruise', token: 'cruise' },
  { name: 'Waymo', token: 'waymo' },
  { name: 'Aurora', token: 'aurora' },
  { name: 'Zoox', token: 'zoox' },
  { name: 'Nuro', token: 'nuro' },
  { name: 'OpenAI', token: 'openai' },
  { name: 'Anthropic', token: 'anthropic' },
];

interface JobListing {
  title: string;
  company: string;
  location: string;
  salary: string | null;
  description: string;
  requirements: string[];
  platform: string;
  url: string;
  posted_date: string;
  match_score: number;
}

// Fetch ALL jobs from Greenhouse - NO LIMIT on jobs per company
async function fetchGreenhouseJobs(company: { name: string; token: string }): Promise<JobListing[]> {
  try {
    const response = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.log(`Greenhouse ${company.name}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    // NO LIMIT - fetch ALL jobs
    const jobs: JobListing[] = (data.jobs || []).map((job: any) => {
      const directUrl = job.absolute_url || `https://boards.greenhouse.io/${company.token}/jobs/${job.id}`;
      
      return {
        title: job.title || 'Unknown Position',
        company: company.name,
        location: job.location?.name || 'Remote',
        salary: null,
        description: job.content ? job.content.replace(/<[^>]*>/g, '').slice(0, 500) : '',
        requirements: extractRequirements(job.content || ''),
        platform: 'Greenhouse',
        url: directUrl,
        posted_date: job.updated_at || new Date().toISOString(),
        match_score: 0,
      };
    });
    
    console.log(`Greenhouse ${company.name}: fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error(`Greenhouse ${company.name} error:`, error);
    return [];
  }
}

// Fetch ALL jobs from Workable - NO LIMIT
async function fetchWorkableJobs(company: { name: string; subdomain: string }): Promise<JobListing[]> {
  try {
    const response = await fetch(
      `https://apply.workable.com/api/v3/accounts/${company.subdomain}/jobs`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.log(`Workable ${company.name}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    // NO LIMIT - fetch ALL jobs
    const jobs: JobListing[] = (data.results || []).map((job: any) => {
      const directUrl = `https://apply.workable.com/${company.subdomain}/j/${job.shortcode}/`;
      
      return {
        title: job.title || 'Unknown Position',
        company: company.name,
        location: job.location?.city || job.location?.country || 'Remote',
        salary: null,
        description: job.description || '',
        requirements: extractRequirements(job.description || ''),
        platform: 'Workable',
        url: directUrl,
        posted_date: job.published || new Date().toISOString(),
        match_score: 0,
      };
    });
    
    console.log(`Workable ${company.name}: fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error(`Workable ${company.name} error:`, error);
    return [];
  }
}

// Fetch ALL jobs from Lever - NO LIMIT
async function fetchLeverJobs(company: { name: string; token: string }): Promise<JobListing[]> {
  try {
    const response = await fetch(
      `https://api.lever.co/v0/postings/${company.token}?mode=json`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.log(`Lever ${company.name}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    // NO LIMIT - fetch ALL jobs
    const jobs: JobListing[] = (data || []).map((job: any) => {
      return {
        title: job.text || 'Unknown Position',
        company: company.name,
        location: job.categories?.location || 'Remote',
        salary: null,
        description: job.descriptionPlain?.slice(0, 500) || '',
        requirements: extractRequirements(job.descriptionPlain || ''),
        platform: 'Lever',
        url: job.hostedUrl || job.applyUrl || '',
        posted_date: new Date(job.createdAt || Date.now()).toISOString(),
        match_score: 0,
      };
    });
    
    console.log(`Lever ${company.name}: fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error(`Lever ${company.name} error:`, error);
    return [];
  }
}

// Extract requirements from job description
function extractRequirements(content: string): string[] {
  const techKeywords = [
    'Python', 'Java', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Azure',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'GraphQL',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Go', 'Rust', 'C++',
    'SQL', 'NoSQL', 'REST API', 'Microservices', 'CI/CD', 'Terraform', 'Linux'
  ];
  
  const found = techKeywords.filter(kw => 
    content.toLowerCase().includes(kw.toLowerCase())
  );
  
  return found.slice(0, 8);
}

// Calculate match score
function calculateMatchScore(job: JobListing, keywords: string[]): number {
  let score = 50;
  const jobText = `${job.title} ${job.description} ${job.requirements.join(' ')}`.toLowerCase();
  
  for (const keyword of keywords) {
    if (keyword && jobText.includes(keyword.toLowerCase())) {
      score += 5;
    }
  }
  
  if (PLATFORM_TIERS.tier1.includes(job.platform)) {
    score += 10;
  } else if (PLATFORM_TIERS.tier2.includes(job.platform)) {
    score += 5;
  }
  
  return Math.min(100, score);
}

// Parse comma-separated keywords
function parseKeywords(keywordString: string): string[] {
  return (keywordString || '')
    .replace(/["""]/g, '')
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0)
    .filter((k, i, arr) => arr.indexOf(k) === i);
}

// Validate that a job URL is a direct job link
function isValidDirectJobUrl(url: string): boolean {
  if (!url) return false;
  
  if (url.includes('greenhouse.io') && url.includes('/jobs/')) return true;
  if (url.includes('workable.com') && url.includes('/j/')) return true;
  if (url.includes('lever.co')) return true;
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords = '', user_id } = await req.json();
    
    console.log(`=== UNLIMITED SCRAPING STARTED ===`);
    console.log(`Keywords: ${keywords}`);
    console.log(`Total companies: Greenhouse(${GREENHOUSE_COMPANIES.length}) + Workable(${WORKABLE_COMPANIES.length}) + Lever(${LEVER_COMPANIES.length})`);
    
    const parsedKeywords = parseKeywords(keywords);
    let allJobs: JobListing[] = [];
    
    // Fetch from ALL companies in parallel - NO LIMITS
    const greenhousePromises = GREENHOUSE_COMPANIES.map(c => fetchGreenhouseJobs(c));
    const workablePromises = WORKABLE_COMPANIES.map(c => fetchWorkableJobs(c));
    const leverPromises = LEVER_COMPANIES.map(c => fetchLeverJobs(c));
    
    const [greenhouseResults, workableResults, leverResults] = await Promise.all([
      Promise.allSettled(greenhousePromises),
      Promise.allSettled(workablePromises),
      Promise.allSettled(leverPromises),
    ]);
    
    // Collect ALL jobs
    for (const result of greenhouseResults) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      }
    }
    for (const result of workableResults) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      }
    }
    for (const result of leverResults) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      }
    }
    
    console.log(`Total fetched: ${allJobs.length} jobs from all APIs`);
    
    // Filter for valid URLs
    const validJobs = allJobs.filter(job => isValidDirectJobUrl(job.url));
    console.log(`Valid direct-apply jobs: ${validJobs.length}`);
    
    // Calculate match scores
    for (const job of validJobs) {
      job.match_score = calculateMatchScore(job, parsedKeywords);
    }
    
    // Sort by match score
    validJobs.sort((a, b) => b.match_score - a.match_score);
    
    // Save ALL jobs to database
    let newJobsCount = 0;
    if (user_id && validJobs.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Get existing URLs to dedupe
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('url')
        .eq('user_id', user_id);
      
      const existingUrls = new Set((existingJobs || []).map(j => j.url));
      const newJobs = validJobs.filter(j => !existingUrls.has(j.url));
      newJobsCount = newJobs.length;
      
      console.log(`New jobs to insert: ${newJobsCount} (${existingUrls.size} already exist)`);
      
      if (newJobs.length > 0) {
        const jobsToInsert = newJobs.map(job => ({
          user_id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary,
          description: job.description,
          requirements: job.requirements,
          platform: job.platform,
          url: job.url,
          posted_date: job.posted_date,
          match_score: job.match_score,
          status: 'pending',
        }));
        
        // Insert in batches of 500
        for (let i = 0; i < jobsToInsert.length; i += 500) {
          const batch = jobsToInsert.slice(i, i + 500);
          const { error } = await supabase.from('jobs').insert(batch);
          
          if (error) {
            console.error(`Batch ${i / 500 + 1} insert error:`, error);
          } else {
            console.log(`Inserted batch ${i / 500 + 1}: ${batch.length} jobs`);
          }
        }
      }
    }
    
    console.log(`=== SCRAPING COMPLETE: ${validJobs.length} total, ${newJobsCount} new ===`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs: validJobs,
        totalFound: validJobs.length,
        newJobsInserted: newJobsCount,
        companiesScraped: GREENHOUSE_COMPANIES.length + WORKABLE_COMPANIES.length + LEVER_COMPANIES.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scrape-jobs:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
