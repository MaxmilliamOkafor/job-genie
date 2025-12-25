import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top Greenhouse companies (most reliable)
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
  { name: 'Scale AI', token: 'scaleai' },
  { name: 'Rippling', token: 'rippling' },
  { name: 'Airtable', token: 'airtable' },
  { name: 'Webflow', token: 'webflow' },
  { name: 'Linear', token: 'linear' },
  { name: 'Vercel', token: 'vercel' },
  { name: 'Retool', token: 'retool' },
  { name: 'Mercury', token: 'mercury' },
  { name: 'Deel', token: 'deel' },
  { name: 'Instacart', token: 'instacart' },
  { name: 'DoorDash', token: 'doordash' },
  { name: 'Lyft', token: 'lyft' },
  { name: 'Pinterest', token: 'pinterest' },
  { name: 'Reddit', token: 'reddit' },
  { name: 'Affirm', token: 'affirm' },
  { name: 'Robinhood', token: 'robinhood' },
  { name: 'Chime', token: 'chime' },
  { name: 'Canva', token: 'canva' },
  { name: 'HashiCorp', token: 'hashicorp' },
  { name: 'GitLab', token: 'gitlab' },
  { name: 'MongoDB', token: 'mongodb' },
  { name: 'Snowflake', token: 'snowflake' },
  { name: 'Datadog', token: 'datadog' },
  { name: 'Twilio', token: 'twilio' },
  { name: 'Shopify', token: 'shopify' },
  { name: 'HubSpot', token: 'hubspot' },
  { name: 'Asana', token: 'asana' },
  { name: 'Grammarly', token: 'grammarly' },
];

// Workable companies
const WORKABLE_COMPANIES: { name: string; subdomain: string }[] = [
  { name: 'Revolut', subdomain: 'revolut' },
  { name: 'Monzo', subdomain: 'monzo' },
  { name: 'Wise', subdomain: 'transferwise' },
  { name: 'GoCardless', subdomain: 'gocardless' },
];

// Lever companies
const LEVER_COMPANIES: { name: string; token: string }[] = [
  { name: 'Netflix', token: 'netflix' },
  { name: 'Spotify', token: 'spotify' },
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

// Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Fetch jobs from Greenhouse
async function fetchGreenhouseJobs(company: { name: string; token: string }): Promise<JobListing[]> {
  try {
    const response = await fetchWithTimeout(
      `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`,
      { headers: { 'Accept': 'application/json' } },
      5000
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.jobs || []).map((job: any) => ({
      title: job.title || 'Unknown Position',
      company: company.name,
      location: job.location?.name || 'Remote',
      salary: null,
      description: job.content ? job.content.replace(/<[^>]*>/g, '').slice(0, 500) : '',
      requirements: extractRequirements(job.content || ''),
      platform: 'Greenhouse',
      url: job.absolute_url || `https://boards.greenhouse.io/${company.token}/jobs/${job.id}`,
      posted_date: job.updated_at || new Date().toISOString(),
      match_score: 0,
    }));
  } catch (error) {
    console.log(`Greenhouse ${company.name}: timeout or error`);
    return [];
  }
}

// Fetch jobs from Workable
async function fetchWorkableJobs(company: { name: string; subdomain: string }): Promise<JobListing[]> {
  try {
    const response = await fetchWithTimeout(
      `https://apply.workable.com/api/v3/accounts/${company.subdomain}/jobs`,
      { headers: { 'Accept': 'application/json' } },
      5000
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.results || []).map((job: any) => ({
      title: job.title || 'Unknown Position',
      company: company.name,
      location: job.location?.city || job.location?.country || 'Remote',
      salary: null,
      description: job.description || '',
      requirements: extractRequirements(job.description || ''),
      platform: 'Workable',
      url: `https://apply.workable.com/${company.subdomain}/j/${job.shortcode}/`,
      posted_date: job.published || new Date().toISOString(),
      match_score: 0,
    }));
  } catch (error) {
    console.log(`Workable ${company.name}: timeout or error`);
    return [];
  }
}

// Fetch jobs from Lever
async function fetchLeverJobs(company: { name: string; token: string }): Promise<JobListing[]> {
  try {
    const response = await fetchWithTimeout(
      `https://api.lever.co/v0/postings/${company.token}?mode=json`,
      { headers: { 'Accept': 'application/json' } },
      5000
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data || []).map((job: any) => ({
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
    }));
  } catch (error) {
    console.log(`Lever ${company.name}: timeout or error`);
    return [];
  }
}

function extractRequirements(content: string): string[] {
  const techKeywords = [
    'Python', 'Java', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Azure',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'GraphQL',
    'Machine Learning', 'TensorFlow', 'PyTorch', 'Go', 'Rust', 'C++', 'SQL'
  ];
  return techKeywords.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).slice(0, 6);
}

function calculateMatchScore(job: JobListing, keywords: string[]): number {
  let score = 50;
  const jobText = `${job.title} ${job.description} ${job.requirements.join(' ')}`.toLowerCase();
  
  for (const keyword of keywords) {
    if (keyword && jobText.includes(keyword.toLowerCase())) score += 5;
  }
  return Math.min(100, score);
}

function parseKeywords(keywordString: string): string[] {
  return (keywordString || '').replace(/["""]/g, '').split(',').map(k => k.trim()).filter(k => k.length > 0);
}

function isValidDirectJobUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('greenhouse.io') && url.includes('/jobs/')) return true;
  if (url.includes('workable.com') && url.includes('/j/')) return true;
  if (url.includes('lever.co')) return true;
  return false;
}

// Process companies in batches to avoid resource limits
async function processBatch<T, R>(items: T[], batchSize: number, processor: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
    
    // Small pause between batches
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords = '', user_id } = await req.json();
    
    const totalCompanies = GREENHOUSE_COMPANIES.length + WORKABLE_COMPANIES.length + LEVER_COMPANIES.length;
    console.log(`Starting job scrape - ${totalCompanies} companies`);
    
    const parsedKeywords = parseKeywords(keywords);
    const allJobs: JobListing[] = [];
    
    // Process in small batches (5 at a time) to avoid resource limits
    console.log('Fetching Greenhouse jobs...');
    const greenhouseResults = await processBatch(GREENHOUSE_COMPANIES, 5, fetchGreenhouseJobs);
    for (const jobs of greenhouseResults) allJobs.push(...jobs);
    console.log(`Greenhouse: ${allJobs.length} jobs`);
    
    console.log('Fetching Workable jobs...');
    const workableResults = await processBatch(WORKABLE_COMPANIES, 3, fetchWorkableJobs);
    for (const jobs of workableResults) allJobs.push(...jobs);
    console.log(`After Workable: ${allJobs.length} jobs`);
    
    console.log('Fetching Lever jobs...');
    const leverResults = await processBatch(LEVER_COMPANIES, 3, fetchLeverJobs);
    for (const jobs of leverResults) allJobs.push(...jobs);
    console.log(`Total fetched: ${allJobs.length} jobs`);
    
    // Filter valid URLs
    const validJobs = allJobs.filter(job => isValidDirectJobUrl(job.url));
    console.log(`Valid jobs: ${validJobs.length}`);
    
    // Calculate match scores
    for (const job of validJobs) {
      job.match_score = calculateMatchScore(job, parsedKeywords);
    }
    
    // Sort by match score
    validJobs.sort((a, b) => b.match_score - a.match_score);
    
    // Save to database
    let newJobsCount = 0;
    if (user_id && validJobs.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Get existing URLs
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('url')
        .eq('user_id', user_id);
      
      const existingUrls = new Set((existingJobs || []).map(j => j.url));
      const newJobs = validJobs.filter(j => !existingUrls.has(j.url));
      newJobsCount = newJobs.length;
      
      console.log(`New jobs: ${newJobsCount}`);
      
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
        
        // Insert in batches
        for (let i = 0; i < jobsToInsert.length; i += 100) {
          const batch = jobsToInsert.slice(i, i + 100);
          await supabase.from('jobs').insert(batch);
        }
      }
    }
    
    console.log(`Complete: ${validJobs.length} total, ${newJobsCount} new`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs: validJobs,
        totalFound: validJobs.length,
        newJobsInserted: newJobsCount,
        companiesScraped: totalCompanies,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
