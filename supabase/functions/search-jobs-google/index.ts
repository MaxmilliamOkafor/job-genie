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

// ATS Platform Configurations - UPDATED: Removed Ashby and Lever, renamed Direct
const ATS_PLATFORMS = {
  greenhouse: {
    name: 'Greenhouse',
    sitePatterns: ['site:greenhouse.io', 'site:boards.greenhouse.io'],
    urlPattern: /greenhouse\.io/,
    jobIdPattern: /\/jobs\/\d+/,
  },
  workday: {
    name: 'Workday',
    sitePatterns: ['site:myworkdayjobs.com', 'site:*.wd5.myworkdayjobs.com'],
    urlPattern: /myworkdayjobs\.com/,
    jobIdPattern: /\/job\//,
  },
  smartrecruiters: {
    name: 'SmartRecruiters',
    sitePatterns: ['site:jobs.smartrecruiters.com', 'site:smartrecruiters.com'],
    urlPattern: /smartrecruiters\.com/,
    jobIdPattern: /\/\d+/,
  },
  direct: {
    name: 'Direct Company Website (LinkedIn and Indeed)',
    sitePatterns: [
      'site:linkedin.com/jobs/view -"Easy Apply"',
      'site:indeed.com/viewjob -"easily apply"',
      'site:indeed.com/job -"easily apply"',
    ],
    urlPattern: /linkedin\.com\/jobs\/view|indeed\.com\/(viewjob|job)/,
    jobIdPattern: /\/(view|viewjob|job)\//,
  },
  bullhorn: {
    name: 'Bullhorn',
    sitePatterns: ['site:bullhornstaffing.com', 'site:*.bullhorn.com'],
    urlPattern: /bullhorn/i,
    jobIdPattern: /\/job\//,
  },
  teamtailor: {
    name: 'Teamtailor',
    sitePatterns: ['site:teamtailor.com/jobs', 'site:*.teamtailor.com'],
    urlPattern: /teamtailor\.com/,
    jobIdPattern: /\/jobs\//,
  },
  workable: {
    name: 'Workable',
    sitePatterns: ['site:jobs.workable.com', 'site:apply.workable.com'],
    urlPattern: /workable\.com/,
    jobIdPattern: /\/j\/[a-zA-Z0-9]+/,
  },
  icims: {
    name: 'ICIMS',
    sitePatterns: ['site:icims.com', 'site:careers-*.icims.com'],
    urlPattern: /icims\.com/,
    jobIdPattern: /\/jobs\/\d+/,
  },
  oraclecloud: {
    name: 'Oracle Cloud',
    sitePatterns: ['site:oraclecloud.com/hcmUI/CandidateExperience', 'site:*.fa.*.oraclecloud.com'],
    urlPattern: /oraclecloud\.com.*CandidateExperience/,
    jobIdPattern: /requisition|job/i,
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

// Time filter mappings for Google search
const TIME_FILTER_MAP: Record<string, string> = {
  '10min': 'qdr:n10',
  '30min': 'qdr:n30',
  '1h': 'qdr:h',
  '2h': 'qdr:h2',
  '6h': 'qdr:h6',
  'today': 'qdr:d',
  'week': 'qdr:w',
  'all': '',
};

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
  if (url.match(/\/(?:careers|jobs|employment|opportunities)\//)) return 'Career Page';
  return 'Other';
}

function extractCompanyFromUrl(url: string): string {
  try {
    const patterns = [
      /boards\.greenhouse\.io\/([^\/]+)/,
      /([^\.]+)\.workable\.com/,
      /([^\.]+)\.wd\d+\.myworkdayjobs/,
      /([^\.]+)\.teamtailor\.com/,
      /jobs\.smartrecruiters\.com\/([^\/]+)/,
      /linkedin\.com\/jobs\/view\/.*at-([^?\/]+)/,
      /indeed\.com\/.*company\/([^?\/]+)/,
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
    if (platform.urlPattern.test(url)) {
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
    
    // Skip Easy Apply jobs from LinkedIn/Indeed
    if (url.includes('linkedin.com') && title.toLowerCase().includes('easy apply')) return null;
    if (url.includes('indeed.com') && (title.toLowerCase().includes('easily apply') || description.toLowerCase().includes('easily apply'))) return null;
    
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

// Build comprehensive Boolean search queries for all ATS platforms
function buildBooleanQueries(
  keywords: string[], 
  locations: string[], 
  timeFilter: string,
  jobType: string,
  workType: string,
  experienceLevel: string
): string[] {
  const queries: string[] = [];
  
  // Build location OR string
  const locationOr = locations.length > 0 
    ? locations.map(l => `"${l}"`).join(' OR ')
    : '';
  
  // Build work type modifier
  const workTypeModifier = workType && workType !== 'all' 
    ? `"${workType}"` 
    : '';
  
  // Build job type modifier
  const jobTypeModifier = jobType && jobType !== 'all' 
    ? `"${jobType}"` 
    : '';
  
  // Build experience level modifier
  const experienceModifier = experienceLevel && experienceLevel !== 'all'
    ? `"${experienceLevel}"`
    : '';
  
  // Combine modifiers
  const modifiers = [workTypeModifier, jobTypeModifier, experienceModifier]
    .filter(Boolean)
    .join(' ');
  
  // Batch keywords (2-3 at a time for better precision)
  const keywordBatches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 2) {
    keywordBatches.push(keywords.slice(i, i + 2));
  }
  
  // Process each batch
  for (const batch of keywordBatches.slice(0, 15)) {
    const keywordOr = batch.map(k => `"${k}"`).join(' OR ');
    
    // Generate queries for each ATS platform
    for (const [key, platform] of Object.entries(ATS_PLATFORMS)) {
      for (const sitePattern of platform.sitePatterns) {
        let query = `(${keywordOr})`;
        if (locationOr) query += ` (${locationOr})`;
        if (modifiers) query += ` ${modifiers}`;
        query += ` ${sitePattern}`;
        queries.push(query);
      }
    }
    
    // Add career page queries
    const careerQuery = `(${keywordOr})${locationOr ? ` (${locationOr})` : ''} ${modifiers} (${CAREER_PAGE_PATTERNS.slice(0, 4).join(' OR ')})`;
    queries.push(careerQuery);
  }
  
  // Add combined ATS queries for broader coverage
  for (const batch of keywordBatches.slice(0, 5)) {
    const keywordOr = batch.map(k => `"${k}"`).join(' OR ');
    
    // Greenhouse + Workday + SmartRecruiters combo
    let comboQuery = `(${keywordOr})`;
    if (locationOr) comboQuery += ` (${locationOr})`;
    if (modifiers) comboQuery += ` ${modifiers}`;
    comboQuery += ` (site:greenhouse.io OR site:myworkdayjobs.com OR site:jobs.smartrecruiters.com OR site:jobs.workable.com)`;
    queries.push(comboQuery);
    
    // LinkedIn Direct + Indeed combo (excluding Easy Apply)
    let directQuery = `(${keywordOr})`;
    if (locationOr) directQuery += ` (${locationOr})`;
    if (modifiers) directQuery += ` ${modifiers}`;
    directQuery += ` (site:linkedin.com/jobs/view OR site:indeed.com/viewjob) -"easy apply" -"easily apply"`;
    queries.push(directQuery);
  }
  
  return queries;
}

async function searchWithFirecrawl(query: string, apiKey: string, limit = 100, timeFilter?: string): Promise<any[]> {
  try {
    console.log(`Searching: ${query.slice(0, 150)}...`);
    
    const searchBody: any = { 
      query, 
      limit,
    };
    
    // Add time-based search if specified
    if (timeFilter && TIME_FILTER_MAP[timeFilter]) {
      searchBody.tbs = TIME_FILTER_MAP[timeFilter];
    }
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
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
    const timeFilter = validateString(rawData.timeFilter || 'all', 20);
    const jobType = validateString(rawData.jobType || 'all', 50);
    const workType = validateString(rawData.workType || 'all', 50);
    const experienceLevel = validateString(rawData.experienceLevel || 'all', 50);
    
    console.log(`Boolean job search for user ${user_id}`);
    console.log(`Keywords: ${keywordsRaw.slice(0, 100)}...`);
    console.log(`Locations: ${locationRaw}`);
    console.log(`Filters - Time: ${timeFilter}, Job Type: ${jobType}, Work Type: ${workType}, Experience: ${experienceLevel}`);
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    
    // Parse keywords and locations
    const keywords = keywordsRaw
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, 50);
    
    const locations = locationRaw
      .split(',')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.toLowerCase() !== 'all')
      .slice(0, 20);
    
    const searchKeywords = keywords.length > 0 
      ? keywords 
      : ['Software Engineer', 'Data Scientist', 'Product Manager'];
    
    const searchLocations = locations.length > 0 
      ? locations 
      : [];
    
    // Build Boolean search queries with all filters
    const searchQueries = buildBooleanQueries(
      searchKeywords, 
      searchLocations, 
      timeFilter,
      jobType,
      workType,
      experienceLevel
    );
    console.log(`Generated ${searchQueries.length} Boolean search queries`);
    
    const allJobs: JobListing[] = [];
    const seenUrls = new Set<string>();
    const dedupeKeys = new Set<string>();
    
    // Run searches in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < searchQueries.length; i += batchSize) {
      const batch = searchQueries.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (query) => {
        const results = await searchWithFirecrawl(query, FIRECRAWL_API_KEY, 80, timeFilter);
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
      
      // Stop early if we have enough jobs
      if (allJobs.length >= 500) {
        console.log('Reached 500 jobs limit, stopping search');
        break;
      }
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
      
      // Work type match bonus
      if (workType && workType !== 'all' && jobText.includes(workType.toLowerCase())) {
        score += 10;
      }
      
      // Job type match bonus
      if (jobType && jobType !== 'all' && jobText.includes(jobType.toLowerCase())) {
        score += 10;
      }
      
      // Experience level match bonus
      if (experienceLevel && experienceLevel !== 'all' && jobText.includes(experienceLevel.toLowerCase())) {
        score += 10;
      }
      
      // Tier-1 company bonus
      if (isTier1Company(job.company)) score += 15;
      
      // Known ATS platform bonus (more reliable)
      if (!['Other', 'Career Page'].includes(job.platform)) score += 5;
      
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
