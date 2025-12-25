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

// Comprehensive ATS platforms for Boolean search
const ATS_SITES = [
  'site:myworkdayjobs.com',
  'site:boards.greenhouse.io',
  'site:workable.com',
  'site:sapsf.com',
  'site:icims.com',
  'site:jobs.lever.co',
  'site:oraclecloud.com',
  'site:taleo.net',
  'site:bamboohr.com',
  'site:teamtailor.com',
  'site:bullhornstaffing.com',
  'site:linkedin.com/jobs',
  'site:jobs.ashbyhq.com',
  'site:jobs.smartrecruiters.com',
];

// Default job titles if none specified
const DEFAULT_TITLES = ['Software Engineer', 'Data Scientist', 'Product Manager'];

// Default locations if none specified  
const DEFAULT_LOCATIONS = ['Remote', 'United States'];

// Employment types to include
const EMPLOYMENT_TYPES = ['full time', 'contract', 'hybrid'];

// Exclusion terms to filter out unwanted results
const EXCLUSION_TERMS = ['-"intern"', '-"internship"', '-"graduate"', '-"unpaid"', '-"entry level"'];

// Build a comprehensive Boolean query
function buildBooleanQuery(titles: string[], locations: string[]): string {
  // Sites group
  const sitesGroup = `(${ATS_SITES.join(' OR ')})`;
  
  // Titles group  
  const titlesGroup = `(${titles.map(t => `"${t}"`).join(' OR ')})`;
  
  // Locations group
  const locationsGroup = `(${locations.map(l => `"${l}"`).join(' OR ')})`;
  
  // Employment types group
  const employmentGroup = `(${EMPLOYMENT_TYPES.map(e => `"${e}"`).join(' OR ')})`;
  
  // URL filters
  const urlFilters = '(inurl:/careers OR inurl:/jobs)';
  
  // Exclusions
  const exclusions = EXCLUSION_TERMS.join(' ');
  
  // Combine all parts
  return `${sitesGroup} AND ${titlesGroup} AND ${locationsGroup} AND ${employmentGroup} AND ${urlFilters} ${exclusions}`;
}

// Extract platform from URL
function getPlatformFromUrl(url: string): string {
  if (url.includes('greenhouse.io')) return 'Greenhouse';
  if (url.includes('lever.co')) return 'Lever';
  if (url.includes('workable.com')) return 'Workable';
  if (url.includes('ashbyhq.com') || url.includes('ashby.com')) return 'Ashby';
  if (url.includes('smartrecruiters.com')) return 'SmartRecruiters';
  if (url.includes('myworkdayjobs.com')) return 'Workday';
  if (url.includes('icims.com')) return 'iCIMS';
  if (url.includes('taleo.net') || url.includes('oraclecloud.com')) return 'Taleo';
  if (url.includes('sapsf.com')) return 'SAP SuccessFactors';
  if (url.includes('bamboohr.com')) return 'BambooHR';
  if (url.includes('teamtailor.com')) return 'Teamtailor';
  if (url.includes('bullhornstaffing.com')) return 'Bullhorn';
  if (url.includes('linkedin.com')) return 'LinkedIn';
  return 'Other';
}

// Extract company from URL
function extractCompanyFromUrl(url: string): string {
  try {
    const patterns = [
      // Greenhouse: boards.greenhouse.io/company
      /greenhouse\.io\/([^\/]+)/,
      // Lever: jobs.lever.co/company
      /lever\.co\/([^\/]+)/,
      // Workable: apply.workable.com/company
      /workable\.com\/([^\/]+)/,
      // Ashby: jobs.ashbyhq.com/company
      /ashbyhq\.com\/([^\/]+)/,
      // SmartRecruiters: jobs.smartrecruiters.com/Company
      /smartrecruiters\.com\/([^\/]+)/,
      // Workday: company.wd5.myworkdayjobs.com
      /([^\.]+)\.wd\d+\.myworkdayjobs/,
      // Teamtailor: company.teamtailor.com
      /([^\.]+)\.teamtailor\.com/,
      // Generic: company from subdomain or path
      /https?:\/\/([^\.\/]+)\./,
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

// Validate that URL is a direct job listing
function isValidJobUrl(url: string): boolean {
  // Skip generic career pages without specific job IDs
  if (url.match(/\/(careers|jobs)\/?$/)) return false;
  
  // Greenhouse direct job URLs
  if (url.includes('greenhouse.io') && url.match(/\/jobs\/\d+/)) return true;
  
  // Lever direct job URLs (has UUID)
  if (url.includes('lever.co') && url.match(/\/[a-f0-9-]{36}/)) return true;
  
  // Workable direct job URLs
  if (url.includes('workable.com') && url.includes('/j/')) return true;
  
  // Ashby direct job URLs
  if (url.includes('ashbyhq.com') && url.match(/\/[a-f0-9-]{36}/)) return true;
  
  // SmartRecruiters direct job URLs
  if (url.includes('smartrecruiters.com') && url.match(/\/\d+/)) return true;
  
  // Workday jobs
  if (url.includes('myworkdayjobs.com') && url.includes('/job/')) return true;
  
  // iCIMS jobs
  if (url.includes('icims.com') && url.match(/\/jobs\/\d+/)) return true;
  
  // LinkedIn jobs
  if (url.includes('linkedin.com/jobs/view/')) return true;
  
  // Teamtailor jobs
  if (url.includes('teamtailor.com') && url.includes('/jobs/')) return true;
  
  // Generic job path patterns
  if (url.match(/\/(job|position|opening|vacancy)\/[a-zA-Z0-9-]+/i)) return true;
  
  return false;
}

// Extract job info from search result
function parseSearchResult(result: any): JobListing | null {
  try {
    const url = result.url || result.link || '';
    const title = result.title || '';
    const description = result.description || result.snippet || result.content || '';
    
    // Skip if not a valid job URL
    if (!url || !isValidJobUrl(url)) {
      console.log(`Skipping invalid URL: ${url}`);
      return null;
    }
    
    const platform = getPlatformFromUrl(url);
    const company = extractCompanyFromUrl(url);
    
    // Clean up job title - remove company name and common suffixes
    let jobTitle = title
      .replace(/\s*[-|–|:]\s*.*$/, '') // Remove everything after dash/pipe/colon
      .replace(/Job Application for\s*/i, '')
      .replace(/at\s+\w+.*$/i, '')
      .replace(/\([^)]*\)/g, '') // Remove parenthetical content
      .trim();
    
    if (!jobTitle || jobTitle.length < 3) {
      jobTitle = 'Unknown Position';
    }
    
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
    console.error('Error parsing search result:', error);
    return null;
  }
}

// Extract location from description
function extractLocation(text: string): string | null {
  const locationPatterns = [
    /(?:location|based in|located in|office in)[:\s]+([^,\n.]+)/i,
    /(fully remote|100% remote|remote first|remote-first)/i,
    /(remote|hybrid|on-site|onsite)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:CA|NY|TX|WA|MA|CO|IL|GA|NC|VA|FL|AZ|OR|PA|OH|MI|NJ|MD|UK|Ireland|Germany|France))/,
    /(San Francisco|New York|Seattle|Austin|Boston|Denver|Chicago|Atlanta|Los Angeles|London|Dublin|Berlin|Paris|Amsterdam)/i,
    /(United States|United Kingdom|Ireland|Germany|France|Netherlands|EMEA|Europe)/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Extract salary from description
function extractSalary(text: string): string | null {
  const salaryPatterns = [
    /\$\s*(\d{2,3}(?:,\d{3})*(?:\s*-\s*\$?\s*\d{2,3}(?:,\d{3})*)?)\s*(?:\/?\s*(?:year|yr|annually|per year))?/i,
    /(\d{2,3}k\s*-\s*\d{2,3}k)/i,
    /(?:salary|compensation)[:\s]+([^\n.]+)/i,
  ];
  
  for (const pattern of salaryPatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Extract requirements from description
function extractRequirements(content: string): string[] {
  const techKeywords = [
    'Python', 'Java', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Azure',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'GraphQL',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Go', 'Rust', 'C++',
    'SQL', 'NoSQL', 'REST API', 'Microservices', 'CI/CD', 'Terraform', 'Linux',
    'Scala', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Next.js', 'Vue.js', 'Angular',
    'Spark', 'Hadoop', 'Airflow', 'dbt', 'Snowflake', 'BigQuery', 'Databricks'
  ];
  
  return techKeywords
    .filter(kw => content.toLowerCase().includes(kw.toLowerCase()))
    .slice(0, 8);
}

// Search using Firecrawl
async function searchWithFirecrawl(query: string, apiKey: string): Promise<any[]> {
  try {
    console.log(`Searching with query length: ${query.length} chars`);
    console.log(`Query preview: ${query.slice(0, 200)}...`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 50, // Increased limit for better results
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl search failed: ${response.status} - ${errorText}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Firecrawl returned ${data.data?.length || 0} results`);
    return data.data || data.results || [];
  } catch (error) {
    console.error('Firecrawl search error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords = '', location = '', user_id } = await req.json();
    
    console.log(`Google boolean job search - keywords: "${keywords}", location: "${location}"`);
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    
    // Parse keywords into job titles
    const titles = keywords
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0);
    
    // Use defaults if no titles provided
    const searchTitles = titles.length > 0 ? titles : DEFAULT_TITLES;
    
    // Parse locations
    const locations = location && location !== 'all'
      ? [location]
      : DEFAULT_LOCATIONS;
    
    // Build the comprehensive Boolean query
    const booleanQuery = buildBooleanQuery(searchTitles, locations);
    console.log(`Built Boolean query: ${booleanQuery.slice(0, 300)}...`);
    
    // Search with the full Boolean query
    const results = await searchWithFirecrawl(booleanQuery, FIRECRAWL_API_KEY);
    
    const allJobs: JobListing[] = [];
    const seenUrls = new Set<string>();
    
    for (const result of results) {
      const job = parseSearchResult(result);
      if (job && !seenUrls.has(job.url)) {
        seenUrls.add(job.url);
        allJobs.push(job);
      }
    }
    
    // If we didn't get many results with the full query, try simplified searches
    if (allJobs.length < 10) {
      console.log('Running additional targeted searches...');
      
      // Try individual platform searches with just titles
      const simplifiedQueries = [
        `site:boards.greenhouse.io (${searchTitles.map((t: string) => `"${t}"`).join(' OR ')}) remote ${EXCLUSION_TERMS.join(' ')}`,
        `site:jobs.lever.co (${searchTitles.map((t: string) => `"${t}"`).join(' OR ')}) remote ${EXCLUSION_TERMS.join(' ')}`,
        `site:myworkdayjobs.com (${searchTitles.map((t: string) => `"${t}"`).join(' OR ')}) ${EXCLUSION_TERMS.join(' ')}`,
      ];
      
      for (const query of simplifiedQueries) {
        const moreResults = await searchWithFirecrawl(query, FIRECRAWL_API_KEY);
        for (const result of moreResults) {
          const job = parseSearchResult(result);
          if (job && !seenUrls.has(job.url)) {
            seenUrls.add(job.url);
            allJobs.push(job);
          }
        }
        // Small delay between searches
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    console.log(`Found ${allJobs.length} unique jobs from Google boolean search`);
    
    // Calculate match scores based on keyword relevance
    for (const job of allJobs) {
      let score = 50;
      const jobText = `${job.title} ${job.description} ${job.company}`.toLowerCase();
      
      for (const title of searchTitles) {
        if (jobText.includes(title.toLowerCase())) {
          score += 15;
        }
      }
      
      // Bonus for location match
      for (const loc of locations) {
        if (jobText.includes(loc.toLowerCase())) {
          score += 10;
        }
      }
      
      // Bonus for salary info
      if (job.salary) score += 5;
      
      // Bonus for requirements match
      score += Math.min(15, job.requirements.length * 3);
      
      job.match_score = Math.min(100, score);
    }
    
    // Sort by match score
    allJobs.sort((a, b) => b.match_score - a.match_score);
    
    // Save to database if user_id provided
    if (user_id && allJobs.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const jobsToInsert = allJobs.map(job => ({
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
        console.error('Error inserting jobs:', error);
      } else {
        console.log(`Inserted ${allJobs.length} jobs for user ${user_id}`);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs: allJobs,
        totalFound: allJobs.length,
        query: booleanQuery.slice(0, 200) + '...',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in search-jobs-google:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
