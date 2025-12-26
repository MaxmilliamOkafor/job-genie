import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_KEYWORDS_LENGTH = 3000;
const MAX_LOCATION_LENGTH = 500;

function validateString(value: any, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
}

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

// ATS Platform Configurations
const ATS_PLATFORMS = {
  greenhouse: {
    name: 'Greenhouse',
    sitePatterns: ['site:boards.greenhouse.io', 'site:*.greenhouse.io/jobs'],
    urlPattern: /greenhouse\.io/,
    jobIdPattern: /\/jobs\/\d+/,
  },
  workday: {
    name: 'Workday',
    sitePatterns: ['site:*.myworkdayjobs.com', 'site:*.wd5.myworkdayjobs.com'],
    urlPattern: /myworkdayjobs\.com/,
    jobIdPattern: /\/job\//,
  },
  workable: {
    name: 'Workable',
    sitePatterns: ['site:apply.workable.com', 'site:*.workable.com/j/'],
    urlPattern: /workable\.com/,
    jobIdPattern: /\/j\/[a-zA-Z0-9]+/,
  },
  successfactors: {
    name: 'SAP SuccessFactors',
    sitePatterns: ['site:*.successfactors.com', 'site:jobs.sap.com'],
    urlPattern: /successfactors\.com|jobs\.sap\.com/,
    jobIdPattern: /\/job\//,
  },
  icims: {
    name: 'iCIMS',
    sitePatterns: ['site:*.icims.com', 'site:careers-*.icims.com'],
    urlPattern: /icims\.com/,
    jobIdPattern: /\/jobs\/\d+/,
  },
  linkedin: {
    name: 'LinkedIn',
    sitePatterns: ['site:linkedin.com/jobs/view'],
    urlPattern: /linkedin\.com\/jobs\/view/,
    jobIdPattern: /\/view\/\d+/,
  },
  taleo: {
    name: 'Oracle Taleo',
    sitePatterns: ['site:*.taleo.net', 'site:*.oraclecloud.com/hcmUI/CandidateExperience'],
    urlPattern: /taleo\.net|oraclecloud\.com.*CandidateExperience/,
    jobIdPattern: /requisition|job/i,
  },
  bamboohr: {
    name: 'BambooHR',
    sitePatterns: ['site:*.bamboohr.com/careers', 'site:*.bamboohr.com/jobs'],
    urlPattern: /bamboohr\.com/,
    jobIdPattern: /\/jobs\/view/,
  },
  teamtailor: {
    name: 'Teamtailor',
    sitePatterns: ['site:*.teamtailor.com/jobs', 'site:career.*.com'],
    urlPattern: /teamtailor\.com/,
    jobIdPattern: /\/jobs\//,
  },
  bullhorn: {
    name: 'Bullhorn',
    sitePatterns: ['site:*.bullhornstaffing.com', 'site:jobs.*.bullhorn'],
    urlPattern: /bullhorn/i,
    jobIdPattern: /\/job\//,
  },
  lever: {
    name: 'Lever',
    sitePatterns: ['site:jobs.lever.co', 'site:*.lever.co'],
    urlPattern: /lever\.co/,
    jobIdPattern: /\/[a-f0-9-]+$/,
  },
  smartrecruiters: {
    name: 'SmartRecruiters',
    sitePatterns: ['site:jobs.smartrecruiters.com', 'site:*.smartrecruiters.com'],
    urlPattern: /smartrecruiters\.com/,
    jobIdPattern: /\/\d+/,
  },
  ashby: {
    name: 'Ashby',
    sitePatterns: ['site:jobs.ashbyhq.com'],
    urlPattern: /ashbyhq\.com/,
    jobIdPattern: /\/[a-f0-9-]+/,
  },
};

// Career page patterns for direct company sites
const CAREER_PAGE_PATTERNS = [
  'site:*/careers/*',
  'site:*/jobs/*',
  'site:*/employment/*',
  'site:*/opportunities/*',
  'site:*/openings/*',
  'site:*/join-us/*',
  'site:*/work-with-us/*',
  'site:*/join-our-team/*',
  'site:*/vacancies/*',
];

// Tier-1 companies for scoring boost
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'lyft', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'twitter', 'snap',
  'shopify', 'square', 'paypal', 'coinbase', 'robinhood', 'plaid', 'figma', 'notion',
  'slack', 'zoom', 'datadog', 'snowflake', 'databricks', 'mongodb', 'openai', 'anthropic',
  'crowdstrike', 'zillow', 'doordash', 'instacart', 'pinterest', 'reddit', 'discord',
  'spotify', 'nvidia', 'oracle', 'cisco', 'ibm', 'intel', 'amd', 'qualcomm', 'tesla',
];

async function verifyAndGetUserId(req: Request, supabase: any): Promise<string> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) throw new Error('Missing authorization header');
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) throw new Error('Unauthorized: Invalid or expired token');
  return user.id;
}

function getPlatformFromUrl(url: string): string {
  for (const [key, platform] of Object.entries(ATS_PLATFORMS)) {
    if (platform.urlPattern.test(url)) return platform.name;
  }
  if (url.match(/\/(?:careers|jobs|employment|opportunities)\//)) return 'Direct';
  return 'Other';
}

function extractCompanyFromUrl(url: string): string {
  try {
    const patterns = [
      /boards\.greenhouse\.io\/([^\/]+)/,
      /([^\.]+)\.workable\.com/,
      /([^\.]+)\.wd\d+\.myworkdayjobs/,
      /([^\.]+)\.teamtailor\.com/,
      /jobs\.lever\.co\/([^\/]+)/,
      /([^\.]+)\.bamboohr\.com/,
      /jobs\.smartrecruiters\.com\/([^\/]+)/,
      /jobs\.ashbyhq\.com\/([^\/]+)/,
      /https?:\/\/(?:careers|jobs)\.([^\.\/]+)\./,
      /https?:\/\/([^\.]+)\.com\/(?:careers|jobs)/,
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

function isValidJobUrl(url: string): boolean {
  if (!url) return false;
  
  // Check if it matches any ATS pattern
  for (const platform of Object.values(ATS_PLATFORMS)) {
    if (platform.urlPattern.test(url) && platform.jobIdPattern.test(url)) {
      return true;
    }
  }
  
  // Check for direct career pages with job identifiers
  if (url.match(/\/(?:careers|jobs|employment|opportunities|openings)\/[a-zA-Z0-9-]+/)) {
    return true;
  }
  
  return false;
}

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
    /(fully remote|100% remote|remote first|remote-first)/i,
    /(remote|hybrid|on-site|onsite)/i,
    /(San Francisco|New York|Seattle|Austin|Boston|Denver|Chicago|Los Angeles|Atlanta)/i,
    /(London|Dublin|Berlin|Amsterdam|Paris|Munich|Zurich|Stockholm|Madrid|Barcelona)/i,
    /(Singapore|Tokyo|Sydney|Melbourne|Toronto|Vancouver|Montreal)/i,
    /(United States|United Kingdom|Ireland|Germany|Europe|EMEA|APAC)/i,
    /(UAE|Dubai|Abu Dhabi|Qatar|Saudi Arabia)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractSalary(text: string): string | null {
  const patterns = [
    /\$\s*(\d{2,3}(?:,\d{3})*(?:\s*[-–]\s*\$?\s*\d{2,3}(?:,\d{3})*)?)/i,
    /(£\s*\d{2,3}(?:,\d{3})*(?:\s*[-–]\s*£?\s*\d{2,3}(?:,\d{3})*)?)/i,
    /(€\s*\d{2,3}(?:,\d{3})*(?:\s*[-–]\s*€?\s*\d{2,3}(?:,\d{3})*)?)/i,
    /(\d{2,3}k\s*[-–]\s*\d{2,3}k)/i,
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
    'Kafka', 'Redis', 'Elasticsearch', 'Go', 'Rust', 'C++', 'Scala', 'Ruby', 'PHP',
  ];
  
  return techKeywords
    .filter(kw => content.toLowerCase().includes(kw.toLowerCase()))
    .slice(0, 8);
}

// Build boolean search queries for all ATS platforms
function buildBooleanQueries(keywords: string[], locations: string[]): string[] {
  const queries: string[] = [];
  
  // Create location OR string
  const locationOr = locations.length > 0 
    ? locations.map(l => `"${l}"`).join(' OR ')
    : '"Remote"';
  
  // Batch keywords (3 at a time for better results)
  const keywordBatches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 3) {
    keywordBatches.push(keywords.slice(i, i + 3));
  }
  
  // Exclusions for cleaner results
  const exclusions = '-intern -internship -graduate -student -trainee -apprentice';
  
  for (const batch of keywordBatches.slice(0, 8)) { // Limit batches
    const keywordOr = batch.map(k => `"${k}"`).join(' OR ');
    
    // ATS platform queries
    for (const [key, platform] of Object.entries(ATS_PLATFORMS)) {
      const sitePattern = platform.sitePatterns[0];
      queries.push(`(${keywordOr}) (${locationOr}) ${sitePattern} ${exclusions}`);
    }
    
    // Career page pattern queries
    const careerSites = CAREER_PAGE_PATTERNS.slice(0, 4).join(' OR ');
    queries.push(`(${keywordOr}) (${locationOr}) (${careerSites}) ${exclusions}`);
  }
  
  // Also add broader queries with multiple ATS sites
  for (const batch of keywordBatches.slice(0, 3)) {
    const keywordOr = batch.map(k => `"${k}"`).join(' OR ');
    const topAtsSites = [
      'site:boards.greenhouse.io',
      'site:*.myworkdayjobs.com',
      'site:apply.workable.com',
      'site:jobs.lever.co',
      'site:jobs.smartrecruiters.com',
    ].join(' OR ');
    
    queries.push(`(${keywordOr}) (${locationOr}) (${topAtsSites}) ${exclusions}`);
  }
  
  return queries;
}

async function searchWithFirecrawl(query: string, apiKey: string, limit = 80): Promise<any[]> {
  try {
    console.log(`Searching: ${query.slice(0, 100)}...`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });
    
    if (!response.ok) {
      console.error(`Firecrawl error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

function getDedupeKey(job: JobListing): string {
  const normalizedTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
  const normalizedCompany = job.company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return `${normalizedTitle}-${normalizedCompany}`;
}

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
    
    const user_id = await verifyAndGetUserId(req, supabase);
    
    const rawData = await req.json();
    const keywordsRaw = validateString(rawData.keywords || '', MAX_KEYWORDS_LENGTH);
    const locationRaw = validateString(rawData.location || '', MAX_LOCATION_LENGTH);
    
    console.log(`Boolean job search for user ${user_id}`);
    console.log(`Keywords: ${keywordsRaw.slice(0, 100)}...`);
    console.log(`Locations: ${locationRaw.slice(0, 100)}...`);
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    
    // Parse keywords and locations
    const keywords = keywordsRaw
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, 30);
    
    const locations = locationRaw
      .split(',')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.toLowerCase() !== 'all')
      .slice(0, 15);
    
    const searchKeywords = keywords.length > 0 
      ? keywords 
      : ['Software Engineer', 'Data Scientist', 'Product Manager'];
    
    const searchLocations = locations.length > 0 
      ? locations 
      : ['Remote', 'United States', 'United Kingdom', 'Ireland'];
    
    // Build boolean search queries
    const searchQueries = buildBooleanQueries(searchKeywords, searchLocations);
    console.log(`Generated ${searchQueries.length} boolean search queries`);
    
    const allJobs: JobListing[] = [];
    const seenUrls = new Set<string>();
    const dedupeKeys = new Set<string>();
    
    // Run searches in parallel batches of 4
    const batchSize = 4;
    for (let i = 0; i < searchQueries.length; i += batchSize) {
      const batch = searchQueries.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (query) => {
        const results = await searchWithFirecrawl(query, FIRECRAWL_API_KEY, 60);
        return { results, keyword: searchKeywords[0] };
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
      
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${allJobs.length} unique jobs found`);
    }
    
    console.log(`Total: ${allJobs.length} unique jobs across all ATS platforms`);
    
    // Calculate match scores
    for (const job of allJobs) {
      let score = 50;
      const jobText = `${job.title} ${job.description} ${job.company} ${job.location}`.toLowerCase();
      
      // Keyword match bonus
      for (const keyword of searchKeywords) {
        if (jobText.includes(keyword.toLowerCase())) {
          score += 8;
        }
      }
      
      // Location match bonus
      for (const loc of searchLocations) {
        if (jobText.includes(loc.toLowerCase())) {
          score += 5;
          break;
        }
      }
      
      // Tier-1 company bonus
      if (isTier1Company(job.company)) score += 15;
      
      // Known ATS platform bonus (more reliable)
      if (!['Other', 'Direct'].includes(job.platform)) score += 5;
      
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
    
    // Return platform breakdown
    const platformBreakdown: Record<string, number> = {};
    for (const job of allJobs) {
      platformBreakdown[job.platform] = (platformBreakdown[job.platform] || 0) + 1;
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs: allJobs,
        totalFound: allJobs.length,
        platforms: platformBreakdown,
        queriesRun: searchQueries.length,
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