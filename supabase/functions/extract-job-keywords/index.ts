import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tech keywords to extract from job descriptions
const TECH_KEYWORDS = [
  // Programming languages
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'Scala', 'Kotlin', 'Swift', 'PHP', 'R',
  // Frontend
  'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'HTML', 'CSS', 'Tailwind', 'Redux', 'GraphQL',
  // Backend
  'Node.js', 'Django', 'Flask', 'FastAPI', 'Spring', 'Express', 'NestJS', 'Rails', '.NET',
  // Cloud & DevOps
  'AWS', 'GCP', 'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Jenkins', 'CI/CD', 'GitHub Actions', 'GitLab CI',
  // Databases
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Cassandra', 'Elasticsearch', 'Snowflake', 'BigQuery',
  // Data & ML
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Spark', 'Airflow', 'Kafka', 'Pandas', 'NumPy', 'Scikit-learn',
  'NLP', 'Computer Vision', 'LLM', 'GPT', 'RAG', 'Vector Database', 'Langchain',
  // Tools & Practices
  'Git', 'Agile', 'Scrum', 'REST API', 'Microservices', 'Linux', 'Bash', 'SQL', 'NoSQL', 'ETL',
  // Soft skills
  'Leadership', 'Communication', 'Problem-solving', 'Teamwork', 'Mentoring',
];

// Soft skills and other keywords
const SOFT_KEYWORDS = [
  'leadership', 'communication', 'problem-solving', 'teamwork', 'mentoring', 
  'stakeholder management', 'project management', 'analytical', 'strategic thinking',
  'collaboration', 'cross-functional', 'self-motivated', 'detail-oriented', 'fast-paced',
];

// Experience levels
const EXPERIENCE_PATTERNS = [
  /(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi,
  /(?:at least|minimum|min)\s*(\d+)\s*(?:years?|yrs?)/gi,
];

// Removed auth requirement - function is now public

// Extract keywords from job content
function extractKeywords(content: string): {
  matched: string[];
  all: string[];
  experience: string | null;
  hardSkills: string[];
  softSkills: string[];
} {
  const contentLower = content.toLowerCase();
  const matched: string[] = [];
  const hardSkills: string[] = [];
  const softSkills: string[] = [];
  
  // Extract tech keywords
  for (const keyword of TECH_KEYWORDS) {
    const keywordLower = keyword.toLowerCase();
    // Check for whole word match
    const regex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(content)) {
      matched.push(keyword);
      hardSkills.push(keyword);
    }
  }
  
  // Extract soft skills
  for (const skill of SOFT_KEYWORDS) {
    if (contentLower.includes(skill.toLowerCase())) {
      softSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
      if (!matched.includes(skill)) {
        matched.push(skill);
      }
    }
  }
  
  // Extract experience requirement
  let experience: string | null = null;
  for (const pattern of EXPERIENCE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      experience = match[0];
      break;
    }
  }
  
  return {
    matched: [...new Set(matched)],
    all: [...new Set(matched)],
    experience,
    hardSkills: [...new Set(hardSkills)],
    softSkills: [...new Set(softSkills)],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Function is public - no auth required
    const { jobUrl, description, jobId } = await req.json();
    
    if (!jobUrl && !description) {
      return new Response(
        JSON.stringify({ error: 'Either jobUrl or description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let content = description || '';
    
    // If we have a URL and Firecrawl, scrape the job page
    if (jobUrl) {
      const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
      
      if (FIRECRAWL_API_KEY) {
        try {
          console.log(`Scraping job URL: ${jobUrl}`);
          
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: jobUrl,
              formats: ['markdown'],
              onlyMainContent: true,
            }),
          });
          
          if (scrapeResponse.ok) {
            const scrapeData = await scrapeResponse.json();
            const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
            if (markdown.length > 100) {
              content = markdown;
              console.log(`Scraped ${content.length} chars from job page`);
            }
          }
        } catch (scrapeError) {
          console.error('Scrape error:', scrapeError);
          // Fall back to description if available
        }
      }
    }
    
    if (!content || content.length < 50) {
      return new Response(
        JSON.stringify({ 
          error: 'Unable to extract job content',
          matched: [],
          missing: [],
          hardSkills: [],
          softSkills: [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract keywords
    const extracted = extractKeywords(content);
    
    console.log(`Extracted ${extracted.matched.length} keywords from job content`);
    
    // Optionally update the job in database
    if (jobId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('jobs')
        .update({ 
          requirements: extracted.matched.slice(0, 20),
          description: content.slice(0, 2000),
        })
        .eq('id', jobId);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        keywords: extracted.matched,
        hardSkills: extracted.hardSkills,
        softSkills: extracted.softSkills,
        experience: extracted.experience,
        contentLength: content.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Extraction error:', error);
    const status = error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500;
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        keywords: [],
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
