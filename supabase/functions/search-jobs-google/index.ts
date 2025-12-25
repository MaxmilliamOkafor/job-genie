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

// Boolean search templates for different ATS platforms
const BOOLEAN_SEARCH_TEMPLATES = [
  // Greenhouse jobs
  { platform: 'Greenhouse', query: 'site:greenhouse.io/jobs "{keyword}"' },
  { platform: 'Greenhouse', query: 'site:boards.greenhouse.io "{keyword}"' },
  // Lever jobs
  { platform: 'Lever', query: 'site:lever.co/jobs "{keyword}"' },
  { platform: 'Lever', query: 'site:jobs.lever.co "{keyword}"' },
  // Workable jobs
  { platform: 'Workable', query: 'site:apply.workable.com "{keyword}"' },
  // Ashby jobs
  { platform: 'Ashby', query: 'site:jobs.ashbyhq.com "{keyword}"' },
  // SmartRecruiters
  { platform: 'SmartRecruiters', query: 'site:jobs.smartrecruiters.com "{keyword}"' },
  // BambooHR
  { platform: 'BambooHR', query: 'site:bamboohr.com/careers "{keyword}"' },
];

// Extract job info from search result
function parseSearchResult(result: any, platform: string): JobListing | null {
  try {
    const url = result.url || result.link || '';
    const title = result.title || '';
    const description = result.description || result.snippet || '';
    
    // Skip if not a valid job URL
    if (!url || !isValidJobUrl(url)) return null;
    
    // Extract company from URL or title
    let company = 'Unknown Company';
    
    // Greenhouse: boards.greenhouse.io/company/jobs/id or greenhouse.io/company
    const greenhouseMatch = url.match(/greenhouse\.io\/([^\/]+)/);
    if (greenhouseMatch) {
      company = greenhouseMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    
    // Lever: jobs.lever.co/company/id
    const leverMatch = url.match(/lever\.co\/([^\/]+)/);
    if (leverMatch) {
      company = leverMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    
    // Workable: apply.workable.com/company/j/shortcode
    const workableMatch = url.match(/workable\.com\/([^\/]+)/);
    if (workableMatch) {
      company = workableMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    
    // Ashby: jobs.ashbyhq.com/company/id
    const ashbyMatch = url.match(/ashbyhq\.com\/([^\/]+)/);
    if (ashbyMatch) {
      company = ashbyMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
    
    // SmartRecruiters: jobs.smartrecruiters.com/Company/id
    const smartMatch = url.match(/smartrecruiters\.com\/([^\/]+)/);
    if (smartMatch) {
      company = smartMatch[1].replace(/([A-Z])/g, ' $1').trim();
    }
    
    // Clean up job title
    let jobTitle = title
      .replace(/\s*[-|–]\s*.*$/, '') // Remove company name after dash
      .replace(/Job Application for\s*/i, '')
      .replace(/at\s+\w+.*$/i, '') // Remove "at Company" suffix
      .trim();
    
    if (!jobTitle || jobTitle.length < 3) {
      jobTitle = 'Unknown Position';
    }
    
    return {
      title: jobTitle,
      company,
      location: extractLocation(description) || 'Remote',
      salary: null,
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

// Validate that URL is a direct job listing
function isValidJobUrl(url: string): boolean {
  // Greenhouse direct job URLs
  if (url.includes('greenhouse.io') && (url.includes('/jobs/') || url.match(/greenhouse\.io\/[^\/]+\/jobs/))) {
    return true;
  }
  // Lever direct job URLs
  if (url.includes('lever.co') && url.match(/lever\.co\/[^\/]+\/[a-f0-9-]+/)) {
    return true;
  }
  // Workable direct job URLs
  if (url.includes('workable.com') && url.includes('/j/')) {
    return true;
  }
  // Ashby direct job URLs
  if (url.includes('ashbyhq.com') && url.match(/ashbyhq\.com\/[^\/]+\/[a-f0-9-]+/)) {
    return true;
  }
  // SmartRecruiters direct job URLs
  if (url.includes('smartrecruiters.com') && url.match(/smartrecruiters\.com\/[^\/]+\/\d+/)) {
    return true;
  }
  return false;
}

// Extract location from description
function extractLocation(text: string): string | null {
  const locationPatterns = [
    /(?:location|based in|located in)[:\s]+([^,\n.]+)/i,
    /(remote|hybrid|on-site|onsite)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:CA|NY|TX|WA|MA|CO|IL|GA|NC|VA|FL|AZ|OR|PA|OH|MI|NJ|MD))/,
    /(San Francisco|New York|Seattle|Austin|Boston|Denver|Chicago|Atlanta|Los Angeles)/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Extract requirements from description
function extractRequirements(content: string): string[] {
  const techKeywords = [
    'Python', 'Java', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Azure',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'GraphQL',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Go', 'Rust', 'C++',
    'SQL', 'NoSQL', 'REST API', 'Microservices', 'CI/CD', 'Terraform', 'Linux'
  ];
  
  return techKeywords
    .filter(kw => content.toLowerCase().includes(kw.toLowerCase()))
    .slice(0, 6);
}

// Search using Firecrawl
async function searchWithFirecrawl(query: string, apiKey: string): Promise<any[]> {
  try {
    console.log(`Searching: ${query}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 20,
      }),
    });
    
    if (!response.ok) {
      console.error(`Firecrawl search failed: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
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
    
    console.log(`Google boolean job search with keywords: ${keywords}, location: ${location}`);
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }
    
    // Parse keywords
    const keywordList = keywords
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0)
      .slice(0, 5); // Limit to 5 keywords to avoid too many searches
    
    if (keywordList.length === 0) {
      keywordList.push('software engineer', 'data scientist', 'product manager');
    }
    
    const allJobs: JobListing[] = [];
    const seenUrls = new Set<string>();
    
    // Search for each keyword across platforms
    for (const keyword of keywordList) {
      for (const template of BOOLEAN_SEARCH_TEMPLATES) {
        // Build boolean query
        let query = template.query.replace('{keyword}', keyword);
        
        // Add location filter if provided
        if (location && location !== 'all') {
          query += ` "${location}"`;
        }
        
        // Add remote filter
        if (location === 'remote' || !location) {
          query += ' remote';
        }
        
        const results = await searchWithFirecrawl(query, FIRECRAWL_API_KEY);
        
        for (const result of results) {
          const job = parseSearchResult(result, template.platform);
          if (job && !seenUrls.has(job.url)) {
            seenUrls.add(job.url);
            allJobs.push(job);
          }
        }
        
        // Small delay between searches to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    console.log(`Found ${allJobs.length} unique jobs from Google boolean search`);
    
    // Calculate match scores
    for (const job of allJobs) {
      let score = 50;
      const jobText = `${job.title} ${job.description}`.toLowerCase();
      for (const keyword of keywordList) {
        if (jobText.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }
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
