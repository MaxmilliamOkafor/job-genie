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

// Job board APIs and scraping endpoints (placeholder)
const JOB_SOURCES = [
  { name: 'Greenhouse', baseUrl: 'https://boards-api.greenhouse.io/v1/boards' },
  { name: 'Workable', baseUrl: 'https://apply.workable.com/api/v3/accounts' },
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

// Calculate match score based on keywords and profile
function calculateMatchScore(job: JobListing, keywords: string[], userSkills: string[]): number {
  let score = 50;
  const jobText = `${job.title} ${job.description} ${job.requirements.join(' ')}`.toLowerCase();
  
  // Keyword matches
  for (const keyword of keywords) {
    if (jobText.includes(keyword.toLowerCase())) {
      score += 5;
    }
  }
  
  // Skill matches
  for (const skill of userSkills) {
    if (jobText.includes(skill.toLowerCase())) {
      score += 3;
    }
  }
  
  // Platform tier bonus
  if (PLATFORM_TIERS.tier1.includes(job.platform)) {
    score += 10;
  } else if (PLATFORM_TIERS.tier2.includes(job.platform)) {
    score += 5;
  }
  
  return Math.min(100, score);
}

// Parse comma-separated keywords
function parseKeywords(keywordString: string): string[] {
  const normalized = (keywordString || '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = normalized
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  // De-dupe while keeping order
  return parts.filter((k, idx) => parts.indexOf(k) === idx);
}

// Generate job listings (NOTE: still synthetic data, but links are valid/reachable)
function generateJobs(keywords: string[], count: number, offset: number): JobListing[] {
  const jobs: JobListing[] = [];

  const titles = [
    'Senior Software Engineer', 'Staff Engineer', 'Principal Engineer',
    'Engineering Manager', 'Tech Lead', 'Full Stack Developer',
    'Backend Engineer', 'Frontend Engineer', 'Platform Engineer',
    'ML Engineer', 'Data Engineer', 'DevOps Engineer', 'SRE',
    'Solutions Architect', 'Cloud Architect', 'AI/ML Specialist',
    'Data Scientist', 'Data Analyst', 'Business Analyst',
    'Product Manager', 'Technical Product Manager', 'UX Designer',
    'Customer Success Manager', 'Solutions Engineer', 'Support Engineer',
    'Project Manager', 'Technical Program Manager', 'Scrum Master'
  ];

  const companies = [
    'Google', 'Microsoft', 'Amazon', 'Apple', 'Netflix', 'Spotify',
    'Stripe', 'Airbnb', 'Uber', 'Databricks', 'Snowflake', 'Cloudflare',
    'Twilio', 'Figma', 'Notion', 'Vercel', 'OpenAI',
    'Meta', 'Tesla', 'Palantir', 'Robinhood', 'Ramp'
  ];

  const companyCareers: Record<string, string> = {
    Google: 'https://careers.google.com/jobs/results/',
    Microsoft: 'https://jobs.careers.microsoft.com/global/en/search',
    Amazon: 'https://www.amazon.jobs/en/search',
    Apple: 'https://jobs.apple.com/en-us/search',
    Netflix: 'https://jobs.netflix.com/search',
    Spotify: 'https://www.lifeatspotify.com/jobs',
    Stripe: 'https://stripe.com/jobs/search',
    Airbnb: 'https://careers.airbnb.com/positions/',
    Uber: 'https://www.uber.com/us/en/careers/list/',
    Databricks: 'https://www.databricks.com/company/careers/open-positions',
    Snowflake: 'https://careers.snowflake.com/us/en/search-results',
    Cloudflare: 'https://www.cloudflare.com/careers/jobs/',
    Twilio: 'https://www.twilio.com/company/jobs',
    Figma: 'https://www.figma.com/careers/',
    Notion: 'https://www.notion.so/careers',
    Vercel: 'https://vercel.com/careers',
    OpenAI: 'https://openai.com/careers/search/',
    Meta: 'https://www.metacareers.com/jobs/',
    Tesla: 'https://www.tesla.com/careers/search',
    Palantir: 'https://www.palantir.com/careers/',
    Robinhood: 'https://careers.robinhood.com/',
    Ramp: 'https://ramp.com/careers',
  };

  const locations = [
    'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
    'London, UK', 'Dublin, Ireland', 'Berlin, Germany', 'Amsterdam, NL',
    'Toronto, Canada', 'Remote', 'Hybrid'
  ];

  const requirements = [
    'Python', 'Java', 'TypeScript', 'React', 'Node.js', 'AWS', 'GCP',
    'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka',
    'Machine Learning', 'Deep Learning', 'NLP', 'System Design',
    'Distributed Systems', 'Microservices', 'CI/CD', 'Terraform'
  ];

  for (let i = 0; i < count; i++) {
    const title = titles[Math.floor(Math.random() * titles.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const location = locations[Math.floor(Math.random() * locations.length)];
    const salary = `$${150 + Math.floor(Math.random() * 150)}k - $${200 + Math.floor(Math.random() * 200)}k`;

    // Prioritize tier 1 platforms
    const platformIndex = Math.random();
    let platform: string;
    if (platformIndex < 0.6) {
      platform = PLATFORM_TIERS.tier1[Math.floor(Math.random() * PLATFORM_TIERS.tier1.length)];
    } else if (platformIndex < 0.85) {
      platform = PLATFORM_TIERS.tier2[Math.floor(Math.random() * PLATFORM_TIERS.tier2.length)];
    } else {
      platform = PLATFORM_TIERS.tier3[Math.floor(Math.random() * PLATFORM_TIERS.tier3.length)];
    }

    const hoursAgo = Math.floor(Math.random() * 72); // Last 3 days
    const postedDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    const jobRequirements = Array.from(
      { length: 4 + Math.floor(Math.random() * 4) },
      () => requirements[Math.floor(Math.random() * requirements.length)]
    ).filter((v, idx, a) => a.indexOf(v) === idx);

    const base = companyCareers[company] ?? `https://www.google.com/search?q=${encodeURIComponent(`${company} ${title} careers`)}`;

    const job: JobListing = {
      title,
      company,
      location,
      salary,
      description: `We're looking for a ${title} to join our team at ${company}.`,
      requirements: jobRequirements,
      platform,
      url: base,
      posted_date: postedDate,
      match_score: 0,
    };

    job.match_score = calculateMatchScore(job, keywords, []);
    jobs.push(job);
  }

  // Sort by platform tier, then match score
  return jobs.sort((a, b) => {
    const tierA = PLATFORM_TIERS.tier1.includes(a.platform) ? 0 : PLATFORM_TIERS.tier2.includes(a.platform) ? 1 : 2;
    const tierB = PLATFORM_TIERS.tier1.includes(b.platform) ? 0 : PLATFORM_TIERS.tier2.includes(b.platform) ? 1 : 2;

    if (tierA !== tierB) return tierA - tierB;
    return b.match_score - a.match_score;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords = '', offset = 0, limit = 50, user_id } = await req.json();
    
    console.log(`Scraping jobs with keywords: ${keywords}, offset: ${offset}, limit: ${limit}`);
    
    const parsedKeywords = parseKeywords(keywords);
    
    // Generate jobs (in production, this would scrape real job boards)
    const jobs = generateJobs(parsedKeywords, limit, offset);
    
    // If user_id provided, save to database
    if (user_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const jobsToInsert = jobs.map(job => ({
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
        console.log(`Inserted ${jobs.length} jobs for user ${user_id}`);
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        jobs,
        hasMore: true,
        nextOffset: offset + limit,
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
