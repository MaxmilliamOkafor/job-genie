import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Tier-1 ATS platforms (high quality, direct apply)
const TIER1_SITES = [
  'site:boards.greenhouse.io',
  'site:jobs.lever.co',
  'site:jobs.ashbyhq.com',
  'site:apply.workable.com',
  'site:jobs.smartrecruiters.com',
  'site:myworkdayjobs.com',
];

// Tier-2 ATS platforms  
const TIER2_SITES = [
  'site:icims.com',
  'site:taleo.net',
  'site:sapsf.com',
  'site:bamboohr.com',
  'site:teamtailor.com',
];

// Tier-1 companies to prioritize
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'lyft', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'twitter', 'snap',
  'shopify', 'square', 'paypal', 'coinbase', 'robinhood', 'plaid', 'figma', 'notion',
  'slack', 'zoom', 'datadog', 'snowflake', 'databricks', 'mongodb', 'elastic',
  'cloudflare', 'twilio', 'okta', 'atlassian', 'splunk', 'servicenow', 'workday',
  'hubspot', 'zendesk', 'asana', 'airtable', 'canva', 'miro', 'loom', 'vercel',
  'openai', 'anthropic', 'stability', 'cohere', 'replicate', 'huggingface',
];

// Exclusion terms
const EXCLUSION_TERMS = ['-"intern"', '-"internship"', '-"graduate"', '-"unpaid"', '-"junior"', '-"entry level"'];

// Build Boolean query with tier-1 focus
function buildBooleanQuery(titles: string[], locations: string[], tier: 'tier1' | 'tier2' = 'tier1'): string {
  const sites = tier === 'tier1' ? TIER1_SITES : TIER2_SITES;
  const sitesGroup = `(${sites.join(' OR ')})`;
  const titlesGroup = `(${titles.slice(0, 3).map(t => `"${t}"`).join(' OR ')})`;
  const locationsGroup = locations.length > 0 ? `(${locations.map(l => `"${l}"`).join(' OR ')})` : '';
  
  let query = `${sitesGroup} ${titlesGroup}`;
  if (locationsGroup) query += ` ${locationsGroup}`;
  query += ` ${EXCLUSION_TERMS.join(' ')}`;
  
  return query;
}

// Extract platform from URL
function getPlatformFromUrl(url: string): string {
  if (url.includes('greenhouse.io')) return 'Greenhouse';
  if (url.includes('lever.co')) return 'Lever';
  if (url.includes('workable.com')) return 'Workable';
  if (url.includes('ashbyhq.com')) return 'Ashby';
  if (url.includes('smartrecruiters.com')) return 'SmartRecruiters';
  if (url.includes('myworkdayjobs.com')) return 'Workday';
  if (url.includes('icims.com')) return 'iCIMS';
  if (url.includes('taleo.net')) return 'Taleo';
  if (url.includes('sapsf.com')) return 'SAP SuccessFactors';
  if (url.includes('bamboohr.com')) return 'BambooHR';
  if (url.includes('teamtailor.com')) return 'Teamtailor';
  return 'Other';
}

// Extract company from URL
function extractCompanyFromUrl(url: string): string {
  try {
    const patterns = [
      /greenhouse\.io\/([^\/]+)/,
      /lever\.co\/([^\/]+)/,
      /workable\.com\/([^\/]+)/,
      /ashbyhq\.com\/([^\/]+)/,
      /smartrecruiters\.com\/([^\/]+)/,
      /([^\.]+)\.wd\d+\.myworkdayjobs/,
      /([^\.]+)\.teamtailor\.com/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1]
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
    }
  } catch (e) {
    console.error('Error extracting company:', e);
  }
  return 'Unknown Company';
}

// Validate direct job URL
function isValidJobUrl(url: string): boolean {
  if (!url) return false;
  if (url.match(/\/(careers|jobs)\/?$/)) return false;
  
  // Tier-1 platform patterns
  if (url.includes('greenhouse.io') && url.match(/\/jobs\/\d+/)) return true;
  if (url.includes('lever.co') && url.match(/\/[a-f0-9-]{36}/)) return true;
  if (url.includes('workable.com') && url.includes('/j/')) return true;
  if (url.includes('ashbyhq.com') && url.match(/\/[a-f0-9-]{36}/)) return true;
  if (url.includes('smartrecruiters.com') && url.match(/\/\d+/)) return true;
  if (url.includes('myworkdayjobs.com') && url.includes('/job/')) return true;
  if (url.includes('icims.com') && url.match(/\/jobs\/\d+/)) return true;
  if (url.includes('teamtailor.com') && url.includes('/jobs/')) return true;
  
  return false;
}

// Parse search result
function parseSearchResult(result: any): JobListing | null {
  try {
    const url = result.url || result.link || '';
    const title = result.title || '';
    const description = result.description || result.snippet || result.content || '';
    
    if (!isValidJobUrl(url)) {
      console.log(`Skipping invalid URL: ${url}`);
      return null;
    }
    
    const platform = getPlatformFromUrl(url);
    const company = extractCompanyFromUrl(url);
    
    let jobTitle = title
      .replace(/\s*[-|–|:]\s*.*$/, '')
      .replace(/Job Application for\s*/i, '')
      .replace(/at\s+\w+.*$/i, '')
      .replace(/\([^)]*\)/g, '')
      .trim();
    
    if (!jobTitle || jobTitle.length < 3) jobTitle = 'Unknown Position';
    
    return {
      title: jobTitle,
      company,
      location: extractLocation(description) || 'Remote',
      salary: extractSalary(description),
      description: description.slice(0, 500),
      requirements: extractRequirements(description),
      platform,
      url,
      posted_date: new Date().toISOString(),
      match_score: 0,
    };
  } catch (error) {
    console.error('Error parsing result:', error);
    return null;
  }
}

function extractLocation(text: string): string | null {
  const patterns = [
    /(fully remote|100% remote|remote first)/i,
    /(remote|hybrid|on-site)/i,
    /(San Francisco|New York|Seattle|Austin|Boston|Denver|Chicago|London|Dublin|Berlin|Amsterdam)/i,
    /(United States|United Kingdom|Ireland|Germany|Europe|EMEA)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractSalary(text: string): string | null {
  const patterns = [
    /\$\s*(\d{2,3}(?:,\d{3})*(?:\s*-\s*\$?\s*\d{2,3}(?:,\d{3})*)?)/i,
    /(\d{2,3}k\s*-\s*\d{2,3}k)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractRequirements(content: string): string[] {
  const techKeywords = [
    'Python', 'Java', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Azure',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Machine Learning', 'TensorFlow', 'PyTorch',
    'SQL', 'GraphQL', 'REST API', 'Microservices', 'CI/CD', 'Terraform', 'Spark', 'Snowflake',
  ];
  
  return techKeywords
    .filter(kw => content.toLowerCase().includes(kw.toLowerCase()))
    .slice(0, 8);
}

// Search using Firecrawl
async function searchWithFirecrawl(query: string, apiKey: string): Promise<any[]> {
  try {
    console.log(`Searching: ${query.slice(0, 150)}...`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit: 50 }),
    });
    
    if (!response.ok) {
      console.error(`Firecrawl error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Got ${data.data?.length || 0} results`);
    return data.data || [];
  } catch (error) {
    console.error('Firecrawl error:', error);
    return [];
  }
}

// Create deduplication key
function getDedupeKey(job: JobListing): string {
  const normalizedTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCompany = job.company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${normalizedTitle}-${normalizedCompany}`;
}

// Check if company is tier-1
function isTier1Company(company: string): boolean {
  const normalized = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TIER1_COMPANIES.some(t1 => normalized.includes(t1) || t1.includes(normalized));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords = '', location = '', dateFilter = 'all', user_id } = await req.json();
    
    console.log(`Job search - keywords: "${keywords}", location: "${location}", date: "${dateFilter}"`);
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    
    // Parse keywords
    const titles = keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    const searchTitles = titles.length > 0 ? titles : ['Data Scientist', 'Software Engineer'];
    const locations = location && location !== 'all' ? [location] : ['Remote'];
    
    // Build tier-1 query first
    const tier1Query = buildBooleanQuery(searchTitles, locations, 'tier1');
    console.log(`Tier-1 query: ${tier1Query.slice(0, 200)}...`);
    
    const allJobs: JobListing[] = [];
    const seenUrls = new Set<string>();
    const dedupeKeys = new Set<string>();
    
    // Search tier-1 platforms
    const tier1Results = await searchWithFirecrawl(tier1Query, FIRECRAWL_API_KEY);
    
    for (const result of tier1Results) {
      const job = parseSearchResult(result);
      if (job && !seenUrls.has(job.url)) {
        const dedupeKey = getDedupeKey(job);
        if (!dedupeKeys.has(dedupeKey)) {
          seenUrls.add(job.url);
          dedupeKeys.add(dedupeKey);
          allJobs.push(job);
        }
      }
    }
    
    // If we need more, search tier-2
    if (allJobs.length < 20) {
      console.log('Searching tier-2 platforms...');
      const tier2Query = buildBooleanQuery(searchTitles, locations, 'tier2');
      const tier2Results = await searchWithFirecrawl(tier2Query, FIRECRAWL_API_KEY);
      
      for (const result of tier2Results) {
        const job = parseSearchResult(result);
        if (job && !seenUrls.has(job.url)) {
          const dedupeKey = getDedupeKey(job);
          if (!dedupeKeys.has(dedupeKey)) {
            seenUrls.add(job.url);
            dedupeKeys.add(dedupeKey);
            allJobs.push(job);
          }
        }
      }
    }
    
    console.log(`Found ${allJobs.length} unique jobs (deduplicated)`);
    
    // Calculate match scores
    for (const job of allJobs) {
      let score = 50;
      const jobText = `${job.title} ${job.description} ${job.company}`.toLowerCase();
      
      // Title match bonus
      for (const title of searchTitles) {
        if (jobText.includes(title.toLowerCase())) score += 15;
      }
      
      // Location match bonus
      for (const loc of locations) {
        if (jobText.includes(loc.toLowerCase())) score += 10;
      }
      
      // Tier-1 company bonus
      if (isTier1Company(job.company)) score += 15;
      
      // Salary info bonus
      if (job.salary) score += 5;
      
      // Requirements bonus
      score += Math.min(10, job.requirements.length * 2);
      
      job.match_score = Math.min(100, score);
    }
    
    // Sort by match score (tier-1 companies will naturally rank higher)
    allJobs.sort((a, b) => b.match_score - a.match_score);
    
    // Save to database
    if (user_id && allJobs.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Get existing job URLs for this user to avoid duplicates
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('url')
        .eq('user_id', user_id);
      
      const existingUrls = new Set((existingJobs || []).map(j => j.url));
      
      const newJobs = allJobs.filter(j => !existingUrls.has(j.url));
      
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
        
        const { error } = await supabase.from('jobs').insert(jobsToInsert);
        
        if (error) {
          console.error('Insert error:', error);
        } else {
          console.log(`Inserted ${newJobs.length} new jobs`);
        }
      } else {
        console.log('No new jobs to insert (all duplicates)');
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs: allJobs,
        totalFound: allJobs.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
