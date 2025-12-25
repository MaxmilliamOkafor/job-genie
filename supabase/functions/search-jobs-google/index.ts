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

// All ATS platforms to search - Direct company URLs via LinkedIn/Indeed boolean
const ATS_SITES = [
  'boards.greenhouse.io',
  'apply.workable.com',
  'jobs.smartrecruiters.com',
  'myworkdayjobs.com',
  'icims.com',
  'taleo.net',
  'bamboohr.com',
  'teamtailor.com',
];

// Tier-1 companies
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'lyft', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'twitter', 'snap',
  'shopify', 'square', 'paypal', 'coinbase', 'robinhood', 'plaid', 'figma', 'notion',
  'slack', 'zoom', 'datadog', 'snowflake', 'databricks', 'mongodb', 'openai', 'anthropic',
  'crowdstrike', 'zillow', 'doordash', 'instacart', 'pinterest', 'reddit', 'discord',
];

// Helper function to verify JWT and extract user ID
async function verifyAndGetUserId(req: Request, supabase: any): Promise<string> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Unauthorized: Invalid or expired token');
  }
  
  return user.id;
}

// Extract platform from URL
function getPlatformFromUrl(url: string): string {
  if (url.includes('greenhouse.io')) return 'Greenhouse';
  if (url.includes('workable.com')) return 'Workable';
  if (url.includes('smartrecruiters.com')) return 'SmartRecruiters';
  if (url.includes('myworkdayjobs.com')) return 'Workday';
  if (url.includes('icims.com')) return 'iCIMS';
  if (url.includes('taleo.net')) return 'Taleo';
  if (url.includes('bamboohr.com')) return 'BambooHR';
  if (url.includes('teamtailor.com')) return 'Teamtailor';
  // Direct company career pages found via LinkedIn/Indeed
  if (url.includes('/careers/') || url.includes('/jobs/') || url.includes('/job/')) return 'Direct';
  return 'Other';
}

// Extract company from URL
function extractCompanyFromUrl(url: string): string {
  try {
    const patterns = [
      /greenhouse\.io\/([^\/]+)/,
      /workable\.com\/([^\/]+)/,
      /smartrecruiters\.com\/([^\/]+)/,
      /([^\.]+)\.wd\d+\.myworkdayjobs/,
      /([^\.]+)\.teamtailor\.com/,
      // Extract company from direct career pages
      /([^\.]+)\.com\/(?:careers|jobs)/,
      /https?:\/\/(?:careers|jobs)\.([^\.]+)\./,
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
  } catch (e) {}
  return 'Unknown Company';
}

// Validate direct job URL - accepts company career pages
function isValidJobUrl(url: string): boolean {
  if (!url) return false;
  // Reject LinkedIn and Indeed listing pages (we want direct company URLs)
  if (url.includes('linkedin.com/jobs/view')) return false;
  if (url.includes('indeed.com/viewjob')) return false;
  if (url.includes('indeed.com/rc/clk')) return false;
  if (url.match(/\/(careers|jobs)\/?$/)) return false;
  
  if (url.includes('greenhouse.io') && url.match(/\/jobs\/\d+/)) return true;
  if (url.includes('workable.com') && url.includes('/j/')) return true;
  if (url.includes('smartrecruiters.com') && url.match(/\/\d+/)) return true;
  if (url.includes('myworkdayjobs.com') && url.includes('/job/')) return true;
  if (url.includes('icims.com') && url.match(/\/jobs\/\d+/)) return true;
  if (url.includes('teamtailor.com') && url.includes('/jobs/')) return true;
  
  // Accept direct company career pages with job IDs or specific job paths
  if (url.match(/\/(?:careers|jobs|job|positions?)\/[a-zA-Z0-9-]+/)) return true;
  
  return false;
}

// Parse search result
function parseSearchResult(result: any, searchKeyword: string): JobListing | null {
  try {
    const url = result.url || result.link || '';
    const title = result.title || '';
    const description = result.description || result.snippet || result.content || '';
    
    if (!isValidJobUrl(url)) return null;
    
    const platform = getPlatformFromUrl(url);
    const company = extractCompanyFromUrl(url);
    
    let jobTitle = title
      .replace(/\s*[-|–|:]\s*.*$/, '')
      .replace(/Job Application for\s*/i, '')
      .replace(/at\s+\w+.*$/i, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/@\s*\w+/g, '')
      .trim();
    
    if (!jobTitle || jobTitle.length < 3) jobTitle = searchKeyword || 'Unknown Position';
    
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
    /(\$\d+K?\s*[-–]\s*\$?\d+K?)/i,
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

// Fast parallel search using Firecrawl
async function searchWithFirecrawl(query: string, apiKey: string, limit = 100): Promise<any[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Create deduplication key
function getDedupeKey(job: JobListing): string {
  const normalizedTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
  const normalizedCompany = job.company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verify JWT and get authenticated user ID
    const user_id = await verifyAndGetUserId(req, supabase);
    
    const { keywords = '', location = '' } = await req.json();
    
    console.log(`Fast job search - keywords: "${keywords.slice(0, 100)}...", location: "${location}" for user ${user_id}`);
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    
    // Parse all keywords
    const titles = keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    const searchTitles = titles.length > 0 ? titles : ['Data Scientist', 'Software Engineer'];
    const locationFilter = location && location !== 'all' ? location : 'Remote';
    
    console.log(`Searching ${searchTitles.length} keywords...`);
    
    const allJobs: JobListing[] = [];
    const seenUrls = new Set<string>();
    const dedupeKeys = new Set<string>();
    
    // Build search queries - batch keywords into groups of 3 for broader searches
    const searchQueries: { query: string; keyword: string }[] = [];
    
    // Create queries for each ATS platform with batched keywords
    const keywordBatches: string[][] = [];
    for (let i = 0; i < searchTitles.length; i += 3) {
      keywordBatches.push(searchTitles.slice(i, i + 3));
    }
    
    // Priority ATS platforms + LinkedIn/Indeed boolean for direct company URLs
    const prioritySites = ['boards.greenhouse.io', 'myworkdayjobs.com', 'apply.workable.com'];
    
    for (const batch of keywordBatches.slice(0, 10)) { // Limit to first 10 batches
      const keywordStr = batch.map(k => `"${k}"`).join(' OR ');
      
      for (const site of prioritySites) {
        searchQueries.push({
          query: `site:${site} (${keywordStr}) "${locationFilter}" -intern -internship`,
          keyword: batch[0],
        });
      }
      
      // LinkedIn boolean search - finds jobs but extracts company career URLs
      searchQueries.push({
        query: `site:linkedin.com/jobs (${keywordStr}) "${locationFilter}" "apply" -intern -internship`,
        keyword: batch[0],
      });
      
      // Indeed boolean search - finds jobs with direct company apply links
      searchQueries.push({
        query: `site:indeed.com (${keywordStr}) "${locationFilter}" "apply on company site" -intern -internship`,
        keyword: batch[0],
      });
    }
    
    // Also add broader searches without site restriction for top keywords
    for (const keyword of searchTitles.slice(0, 5)) {
      const sitesStr = ATS_SITES.slice(0, 6).map(s => `site:${s}`).join(' OR ');
      searchQueries.push({
        query: `(${sitesStr}) "${keyword}" "${locationFilter}" -intern -internship -graduate`,
        keyword,
      });
    }
    
    console.log(`Running ${searchQueries.length} parallel searches...`);
    
    // Run searches in parallel batches of 5 for speed
    const batchSize = 5;
    for (let i = 0; i < searchQueries.length; i += batchSize) {
      const batch = searchQueries.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async ({ query, keyword }) => {
        const results = await searchWithFirecrawl(query, FIRECRAWL_API_KEY, 50);
        return { results, keyword };
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const { results, keyword } of batchResults) {
        for (const result of results) {
          const job = parseSearchResult(result, keyword);
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
      
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: Found ${allJobs.length} unique jobs so far`);
    }
    
    console.log(`Total: ${allJobs.length} unique jobs found`);
    
    // Calculate match scores
    for (const job of allJobs) {
      let score = 50;
      const jobText = `${job.title} ${job.description} ${job.company}`.toLowerCase();
      
      // Title match bonus
      for (const title of searchTitles) {
        if (jobText.includes(title.toLowerCase())) {
          score += 10;
          break;
        }
      }
      
      // Location match bonus
      if (jobText.includes(locationFilter.toLowerCase())) score += 10;
      
      // Tier-1 company bonus
      if (isTier1Company(job.company)) score += 20;
      
      // Salary info bonus
      if (job.salary) score += 5;
      
      // Requirements bonus
      score += Math.min(10, job.requirements.length * 2);
      
      job.match_score = Math.min(100, score);
    }
    
    // Sort by match score
    allJobs.sort((a, b) => b.match_score - a.match_score);
    
    // Save to database
    if (allJobs.length > 0) {
      // Get existing URLs to avoid duplicates
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
        
        // Insert in batches of 100
        for (let i = 0; i < jobsToInsert.length; i += 100) {
          const insertBatch = jobsToInsert.slice(i, i + 100);
          await supabase.from('jobs').insert(insertBatch);
        }
        
        console.log(`Inserted ${newJobs.length} new jobs`);
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
    const status = error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500;
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
