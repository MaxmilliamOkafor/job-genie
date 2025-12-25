import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Target countries and locations
const TARGET_LOCATIONS = [
  "Dublin", "Ireland", "United Kingdom", "United States", "United Arab Emirates",
  "Dubai", "Switzerland", "Germany", "Sweden", "Spain", "Netherlands", "France",
  "Belgium", "Austria", "Czech Republic", "Portugal", "Italy", "Greece", "Turkey",
  "Singapore", "Japan", "Australia", "Canada", "Mexico", "South Africa", "Qatar",
  "Norway", "New Zealand", "Denmark", "Luxembourg", "Malta", "Cyprus", "Morocco",
  "Thailand", "Serbia", "Tanzania", "Remote", "EMEA", "Europe"
];

// Tier-1 companies with Greenhouse boards
const GREENHOUSE_COMPANIES = [
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
  { name: 'Datadog', token: 'datadog' },
  { name: 'Intercom', token: 'intercom' },
  { name: 'Slack', token: 'slack' },
  { name: 'Asana', token: 'asana' },
  { name: 'HubSpot', token: 'hubspotjobs' },
  { name: 'Twilio', token: 'twilio' },
  { name: 'Amplitude', token: 'amplitude' },
  { name: 'Segment', token: 'segment' },
  { name: 'Mixpanel', token: 'mixpanel' },
  { name: 'Checkout.com', token: 'checkoutcom' },
  { name: 'Revolut', token: 'revolut' },
  { name: 'N26', token: 'n26' },
  { name: 'Wise', token: 'transferwise' },
  { name: 'Klarna', token: 'klarna' },
  { name: 'Adyen', token: 'adyen' },
];

// SmartRecruiters companies
const SMARTRECRUITERS_COMPANIES = [
  { name: 'Visa', token: 'visa' },
  { name: 'IKEA', token: 'ikea' },
  { name: 'Spotify', token: 'spotify' },
  { name: 'Uber', token: 'uber' },
];

interface LiveJob {
  id: string;
  title: string;
  company: string;
  location: string;
  updated_at: string;
  absolute_url: string;
  description_snippet: string;
  source: string;
  locations_detected: string[];
  keywords_matched: string[];
  score: number;
  salary: string | null;
  requirements: string[];
}

// Fetch from Greenhouse API
async function fetchGreenhouseJobs(company: { name: string; token: string }): Promise<LiveJob[]> {
  try {
    const response = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    
    const jobs: LiveJob[] = (data.jobs || []).map((job: any) => {
      const updatedAt = new Date(job.updated_at || job.created_at).getTime();
      const locationName = job.location?.name || 'Remote';
      const content = (job.content || '').replace(/<[^>]*>/g, '');
      
      return {
        id: `gh_${company.token}_${job.id}`,
        title: job.title || 'Unknown Position',
        company: company.name,
        location: locationName,
        updated_at: job.updated_at || new Date().toISOString(),
        absolute_url: job.absolute_url || `https://boards.greenhouse.io/${company.token}/jobs/${job.id}`,
        description_snippet: content.slice(0, 300),
        source: 'greenhouse',
        locations_detected: extractLocations(locationName + ' ' + content),
        keywords_matched: [],
        score: 0,
        salary: extractSalary(content),
        requirements: extractRequirements(content),
      };
    });
    
    return jobs;
  } catch (error) {
    console.error(`Greenhouse ${company.name} error:`, error);
    return [];
  }
}

// Fetch from SmartRecruiters API
async function fetchSmartRecruitersJobs(company: { name: string; token: string }): Promise<LiveJob[]> {
  try {
    const response = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${company.token}/postings?limit=100`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    
    const jobs: LiveJob[] = (data.content || []).map((job: any) => {
      const locationName = job.location?.city || job.location?.country || 'Remote';
      
      return {
        id: `sr_${company.token}_${job.id}`,
        title: job.name || 'Unknown Position',
        company: company.name,
        location: locationName,
        updated_at: job.releasedDate || new Date().toISOString(),
        absolute_url: job.applyUrl || `https://careers.smartrecruiters.com/${company.token}/${job.id}`,
        description_snippet: (job.jobAd?.sections?.jobDescription?.text || '').slice(0, 300),
        source: 'smartrecruiters',
        locations_detected: extractLocations(locationName),
        keywords_matched: [],
        score: 0,
        salary: null,
        requirements: [],
      };
    });
    
    return jobs;
  } catch (error) {
    console.error(`SmartRecruiters ${company.name} error:`, error);
    return [];
  }
}

// Extract locations from text
function extractLocations(text: string): string[] {
  const lowerText = text.toLowerCase();
  return TARGET_LOCATIONS.filter(loc => lowerText.includes(loc.toLowerCase()));
}

// Extract salary from text
function extractSalary(text: string): string | null {
  const patterns = [
    /\$\s*(\d{2,3}(?:,\d{3})*(?:\s*[-–]\s*\$?\s*\d{2,3}(?:,\d{3})*)?)/i,
    /(\d{2,3}k\s*[-–]\s*\d{2,3}k)/i,
    /(€\s*\d+[\d,\.]*(?:\s*[-–]\s*€?\s*\d+[\d,\.]*)?)/i,
    /(£\s*\d+[\d,\.]*(?:\s*[-–]\s*£?\s*\d+[\d,\.]*)?)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Extract requirements from text
function extractRequirements(content: string): string[] {
  const techKeywords = [
    'Python', 'Java', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'AWS', 'GCP', 'Azure',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'GraphQL',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Go', 'Rust', 'C++',
    'SQL', 'NoSQL', 'REST API', 'Microservices', 'CI/CD', 'Terraform', 'Linux', 'Spark',
    'Snowflake', 'Airflow', 'dbt', 'Looker', 'Tableau', 'Power BI', 'Pandas', 'NumPy',
    'Scikit-learn', 'NLP', 'Computer Vision', 'LLM', 'RAG', 'Langchain', 'OpenAI',
  ];
  
  return techKeywords
    .filter(kw => content.toLowerCase().includes(kw.toLowerCase()))
    .slice(0, 8);
}

// Calculate job score
function calculateScore(
  job: LiveJob, 
  keywords: string[], 
  locations: string[],
  hoursAgo: number
): number {
  let score = 50;
  const jobText = `${job.title} ${job.description_snippet} ${job.company}`.toLowerCase();
  
  // Keyword matches
  const matchedKeywords: string[] = [];
  for (const kw of keywords) {
    if (kw && jobText.includes(kw.toLowerCase())) {
      matchedKeywords.push(kw);
      score += 5;
    }
  }
  job.keywords_matched = matchedKeywords;
  
  // Location matches
  const jobLocLower = job.location.toLowerCase();
  for (const loc of locations) {
    if (jobLocLower.includes(loc.toLowerCase())) {
      score += 10;
      break;
    }
  }
  
  // Remote bonus
  if (jobLocLower.includes('remote')) {
    score *= 1.5;
  }
  
  // Recency factor
  const jobAge = (Date.now() - new Date(job.updated_at).getTime()) / (1000 * 60 * 60);
  if (jobAge < 2) score *= 1.3;
  else if (jobAge < 24) score *= 1.1;
  else if (jobAge > 72) score *= 0.8;
  
  // Salary bonus
  if (job.salary) score += 5;
  
  // Requirements bonus
  score += Math.min(10, job.requirements.length * 2);
  
  return Math.min(100, Math.round(score * 10) / 10);
}

// Filter jobs
function filterJobs(
  jobs: LiveJob[],
  locationCsv: string,
  hoursCutoff: number,
  keywordsCsv: string
): LiveJob[] {
  const keywords = keywordsCsv.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
  const locations = locationCsv.split(',').map(l => l.trim().toLowerCase()).filter(l => l);
  const cutoffTime = Date.now() - (hoursCutoff * 60 * 60 * 1000);
  
  return jobs
    .filter(job => {
      // Time filter (if hoursCutoff > 0)
      if (hoursCutoff > 0) {
        const jobTime = new Date(job.updated_at).getTime();
        if (jobTime < cutoffTime) return false;
      }
      
      // Location filter (if locations specified)
      if (locations.length > 0) {
        const jobLoc = (job.location + ' ' + job.locations_detected.join(' ')).toLowerCase();
        const hasLocation = locations.some(loc => jobLoc.includes(loc));
        if (!hasLocation) return false;
      }
      
      return true;
    })
    .map(job => {
      job.score = calculateScore(job, keywords, locations, hoursCutoff);
      return job;
    })
    .sort((a, b) => b.score - a.score);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      keywords = '',
      locations = '',
      hours = 0,
      user_id,
      limit = 100,
    } = await req.json();
    
    console.log(`Live jobs fetch - keywords: "${keywords.slice(0, 50)}...", locations: "${locations}", hours: ${hours}`);
    
    // Parallel fetch from all platforms
    const greenhousePromises = GREENHOUSE_COMPANIES.map(c => fetchGreenhouseJobs(c));
    const smartrecruitersPromises = SMARTRECRUITERS_COMPANIES.map(c => fetchSmartRecruitersJobs(c));
    
    const [greenhouseResults, smartrecruitersResults] = await Promise.all([
      Promise.allSettled(greenhousePromises),
      Promise.allSettled(smartrecruitersPromises),
    ]);
    
    let allJobs: LiveJob[] = [];
    
    // Collect results
    for (const result of greenhouseResults) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      }
    }
    for (const result of smartrecruitersResults) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      }
    }
    
    console.log(`Fetched ${allJobs.length} total jobs from APIs`);
    
    // Deduplicate by URL
    const seenUrls = new Set<string>();
    allJobs = allJobs.filter(job => {
      if (seenUrls.has(job.absolute_url)) return false;
      seenUrls.add(job.absolute_url);
      return true;
    });
    
    // Filter and score
    const filteredJobs = filterJobs(allJobs, locations, hours, keywords);
    const topJobs = filteredJobs.slice(0, limit);
    
    console.log(`Filtered to ${topJobs.length} jobs (from ${filteredJobs.length} matching)`);
    
    // Save to database if user_id provided
    if (user_id && topJobs.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Get existing URLs
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('url')
        .eq('user_id', user_id);
      
      const existingUrls = new Set((existingJobs || []).map(j => j.url));
      const newJobs = topJobs.filter(j => !existingUrls.has(j.absolute_url));
      
      if (newJobs.length > 0) {
        const jobsToInsert = newJobs.map(job => ({
          user_id,
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary,
          description: job.description_snippet,
          requirements: job.requirements,
          platform: job.source.charAt(0).toUpperCase() + job.source.slice(1),
          url: job.absolute_url,
          posted_date: job.updated_at,
          match_score: Math.round(job.score),
          status: 'pending',
        }));
        
        // Insert in batches
        for (let i = 0; i < jobsToInsert.length; i += 50) {
          const batch = jobsToInsert.slice(i, i + 50);
          await supabase.from('jobs').insert(batch);
        }
        
        console.log(`Inserted ${newJobs.length} new jobs for user ${user_id}`);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs: topJobs,
        totalFetched: allJobs.length,
        totalFiltered: filteredJobs.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Live jobs error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
