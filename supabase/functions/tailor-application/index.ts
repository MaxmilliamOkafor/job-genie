import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation limits
const MAX_STRING_SHORT = 200;
const MAX_STRING_MEDIUM = 500;
const MAX_STRING_LONG = 50000;
const MAX_ARRAY_SIZE = 50;

function validateString(value: any, maxLength: number, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  return trimmed;
}

function validateStringArray(value: any, maxItems: number, maxStringLength: number, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length > maxItems) {
    throw new Error(`${fieldName} exceeds maximum of ${maxItems} items`);
  }
  return value.slice(0, maxItems).map((item, i) => 
    validateString(item, maxStringLength, `${fieldName}[${i}]`)
  );
}

interface TailorRequest {
  jobTitle: string;
  company: string;
  description: string;
  requirements: string[];
  location?: string;
  jobId?: string;
  userProfile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    linkedin: string;
    github: string;
    portfolio: string;
    coverLetter: string;
    workExperience: any[];
    education: any[];
    skills: any[];
    certifications: string[];
    achievements: any[];
    atsStrategy: string;
    city?: string;
    country?: string;
    address?: string;
    state?: string;
    zipCode?: string;
  };
  includeReferral?: boolean;
}

async function verifyAuth(req: Request): Promise<{ userId: string; supabase: any }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Unauthorized: Invalid or expired token');
  }
  
  return { userId: user.id, supabase };
}

async function getUserOpenAIKey(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('openai_api_key')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data.openai_api_key;
}

async function logApiUsage(supabase: any, userId: string, functionName: string, tokensUsed: number): Promise<void> {
  try {
    await supabase
      .from('api_usage')
      .insert({
        user_id: userId,
        function_name: functionName,
        tokens_used: tokensUsed,
      });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}

function validateRequest(data: any): TailorRequest {
  const jobTitle = validateString(data.jobTitle, MAX_STRING_SHORT, 'jobTitle');
  const company = validateString(data.company, MAX_STRING_SHORT, 'company');
  const description = validateString(data.description || '', MAX_STRING_LONG, 'description');
  const requirements = validateStringArray(data.requirements || [], MAX_ARRAY_SIZE, MAX_STRING_MEDIUM, 'requirements');
  const location = data.location ? validateString(data.location, MAX_STRING_SHORT, 'location') : undefined;
  const jobId = data.jobId ? validateString(data.jobId, MAX_STRING_SHORT, 'jobId') : undefined;
  
  const profile = data.userProfile || {};
  const userProfile = {
    firstName: validateString(profile.firstName || '', MAX_STRING_SHORT, 'firstName'),
    lastName: validateString(profile.lastName || '', MAX_STRING_SHORT, 'lastName'),
    email: validateString(profile.email || '', MAX_STRING_SHORT, 'email'),
    phone: validateString(profile.phone || '', MAX_STRING_SHORT, 'phone'),
    linkedin: validateString(profile.linkedin || '', MAX_STRING_MEDIUM, 'linkedin'),
    github: validateString(profile.github || '', MAX_STRING_MEDIUM, 'github'),
    portfolio: validateString(profile.portfolio || '', MAX_STRING_MEDIUM, 'portfolio'),
    coverLetter: validateString(profile.coverLetter || '', MAX_STRING_LONG, 'coverLetter'),
    workExperience: Array.isArray(profile.workExperience) ? profile.workExperience.slice(0, 20) : [],
    education: Array.isArray(profile.education) ? profile.education.slice(0, 10) : [],
    skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 100) : [],
    certifications: validateStringArray(profile.certifications || [], MAX_ARRAY_SIZE, MAX_STRING_MEDIUM, 'certifications'),
    achievements: Array.isArray(profile.achievements) ? profile.achievements.slice(0, 20) : [],
    atsStrategy: validateString(profile.atsStrategy || '', MAX_STRING_LONG, 'atsStrategy'),
    city: profile.city ? validateString(profile.city, MAX_STRING_SHORT, 'city') : undefined,
    country: profile.country ? validateString(profile.country, MAX_STRING_SHORT, 'country') : undefined,
    address: profile.address ? validateString(profile.address, MAX_STRING_MEDIUM, 'address') : undefined,
    state: profile.state ? validateString(profile.state, MAX_STRING_SHORT, 'state') : undefined,
    zipCode: profile.zipCode ? validateString(profile.zipCode, MAX_STRING_SHORT, 'zipCode') : undefined,
  };

  return {
    jobTitle,
    company,
    description,
    requirements,
    location,
    jobId,
    userProfile,
    includeReferral: !!data.includeReferral,
  };
}

// Smart location logic - prioritize job listing location for ATS compliance
function getSmartLocation(jdLocation: string | undefined, jdDescription: string, profileCity?: string, profileCountry?: string): string {
  // Priority 1: If job listing has a specific location, use it directly for ATS matching
  // Examples: "Cardiff, London or Remote (UK)", "New York, NY", "Remote (US)"
  if (jdLocation && jdLocation.trim().length > 0) {
    const cleanLocation = jdLocation.trim();
    // If the job location contains remote, just use it as-is
    if (/remote|hybrid/i.test(cleanLocation)) {
      return cleanLocation;
    }
    // For specific locations, append "| Open to relocation" for flexibility
    return `${cleanLocation} | Open to relocation`;
  }
  
  const jdText = jdDescription.toLowerCase();
  
  // Priority 2: Extract location from job description if not in location field
  // US locations
  if (/\b(united states|usa|u\.s\.|us only|us-based|new york|san francisco|seattle|austin|boston|chicago|los angeles|denver)\b/i.test(jdText)) {
    return "Remote (Open to US relocation)";
  }
  
  // UK locations
  if (/\b(united kingdom|uk|london|manchester|birmingham|edinburgh|glasgow|bristol|cambridge|oxford|cardiff)\b/i.test(jdText)) {
    // Use profile location + UK relocation willingness
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Open to UK relocation`;
    }
    return "Dublin, Ireland | Open to UK relocation";
  }
  
  // Ireland/Dublin
  if (/\b(ireland|dublin|cork|galway|limerick)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry}`;
    }
    return "Dublin, Ireland";
  }
  
  // Europe/EU
  if (/\b(europe|eu|european union|germany|france|netherlands|spain|italy|switzerland|austria|belgium|portugal|sweden|norway|denmark|finland)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} (EU)`;
    }
    return "Dublin, Ireland (EU)";
  }
  
  // Canada
  if (/\b(canada|canadian|toronto|vancouver|montreal|ottawa|calgary)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Open to Canada relocation`;
    }
    return "Dublin, Ireland | Open to Canada relocation";
  }
  
  // Remote worldwide
  if (/\b(remote|worldwide|global|anywhere|distributed|work from home|wfh)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Remote`;
    }
    return "Remote | Open to relocation worldwide";
  }
  
  // APAC
  if (/\b(asia|apac|singapore|hong kong|tokyo|japan|australia|sydney|melbourne)\b/i.test(jdText)) {
    if (profileCity && profileCountry) {
      return `${profileCity}, ${profileCountry} | Open to APAC relocation`;
    }
    return "Remote | Open to APAC relocation";
  }
  
  // Priority 3: Fallback to profile location with "Open to relocation"
  if (profileCity && profileCountry) {
    return `${profileCity}, ${profileCountry} | Open to relocation`;
  }
  
  return "Remote | Open to relocation";
}

// Jobscan-style keyword extraction
function extractJobscanKeywords(description: string, requirements: string[]): { 
  hardSkills: string[], 
  softSkills: string[], 
  tools: string[], 
  titles: string[],
  allKeywords: string[]
} {
  const text = `${description} ${requirements.join(' ')}`.toLowerCase();
  
  // Hard skills (tech stack)
  const hardSkillPatterns = [
    'python', 'javascript', 'typescript', 'java', 'c\\+\\+', 'c#', 'go', 'golang', 'rust', 'ruby', 'php', 'scala', 'kotlin', 'swift',
    'react', 'angular', 'vue', 'node\\.?js', 'next\\.?js', 'express', 'django', 'flask', 'fastapi', 'spring', 'rails',
    'sql', 'nosql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb',
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins', 'circleci', 'github actions',
    'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'spark', 'hadoop', 'kafka', 'airflow', 'dbt',
    'rest api', 'graphql', 'grpc', 'microservices', 'serverless', 'ci/cd', 'devops', 'mlops',
    'machine learning', 'deep learning', 'nlp', 'computer vision', 'data science', 'data engineering', 'etl',
    'snowflake', 'databricks', 'looker', 'tableau', 'power bi', 'metabase', 'git', 'linux', 'unix', 'bash'
  ];
  
  // Soft skills
  const softSkillPatterns = [
    'communication', 'leadership', 'problem-solving', 'problem solving', 'teamwork', 'collaboration', 
    'critical thinking', 'adaptability', 'time management', 'attention to detail', 'analytical',
    'project management', 'stakeholder management', 'mentoring', 'coaching', 'cross-functional'
  ];
  
  // Tools/platforms
  const toolPatterns = [
    'jira', 'confluence', 'slack', 'notion', 'asana', 'trello', 'monday', 'figma', 'sketch', 
    'postman', 'swagger', 'openapi', 'datadog', 'splunk', 'grafana', 'prometheus', 'new relic',
    'sentry', 'pagerduty', 'cloudwatch', 'segment', 'amplitude', 'mixpanel'
  ];
  
  // Job titles
  const titlePatterns = [
    'software engineer', 'senior software engineer', 'staff engineer', 'principal engineer',
    'data scientist', 'data engineer', 'ml engineer', 'machine learning engineer', 
    'ai engineer', 'ai research', 'solution architect', 'cloud architect', 'devops engineer',
    'frontend', 'backend', 'full stack', 'fullstack', 'platform engineer', 'sre', 'site reliability'
  ];
  
  const extractMatches = (patterns: string[]): string[] => {
    const matches: string[] = [];
    for (const pattern of patterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      if (regex.test(text)) {
        // Capitalize properly
        const cleaned = pattern.replace(/\\\./g, '.').replace(/\\+/g, '+');
        if (!matches.some(m => m.toLowerCase() === cleaned.toLowerCase())) {
          matches.push(cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
        }
      }
    }
    return matches;
  };
  
  const hardSkills = extractMatches(hardSkillPatterns).slice(0, 18);
  const softSkills = extractMatches(softSkillPatterns).slice(0, 3);
  const tools = extractMatches(toolPatterns).slice(0, 4);
  const titles = extractMatches(titlePatterns).slice(0, 4);
  
  const allKeywords = [...hardSkills, ...titles, ...softSkills].slice(0, 25);
  
  return { hardSkills, softSkills, tools, titles, allKeywords };
}

// Calculate accurate match score
function calculateMatchScore(
  jdKeywords: string[], 
  profileSkills: any[], 
  profileExperience: any[]
): { score: number, matched: string[], missing: string[] } {
  const profileSkillsLower = profileSkills.map(s => 
    (typeof s === 'string' ? s : s.name || '').toLowerCase()
  );
  
  // Also extract skills from work experience
  const experienceText = profileExperience.map(exp => 
    `${exp.title || ''} ${exp.description || ''} ${(exp.bullets || []).join(' ')}`
  ).join(' ').toLowerCase();
  
  const matched: string[] = [];
  const missing: string[] = [];
  
  for (const keyword of jdKeywords) {
    const keywordLower = keyword.toLowerCase();
    const isMatched = profileSkillsLower.some(s => s.includes(keywordLower) || keywordLower.includes(s)) ||
                      experienceText.includes(keywordLower);
    
    if (isMatched) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }
  
  // Calculate score: 3 points for primary skills (first 15), 2 for secondary, 1 for soft skills
  let totalPoints = 0;
  let earnedPoints = 0;
  
  jdKeywords.forEach((kw, i) => {
    const points = i < 15 ? 3 : (i < 20 ? 2 : 1);
    totalPoints += points;
    if (matched.includes(kw)) {
      earnedPoints += points;
    }
  });
  
  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 50;
  
  return { score: Math.min(100, Math.max(0, score)), matched, missing };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await verifyAuth(req);
    
    const rawData = await req.json();
    const { jobTitle, company, description, requirements, location, jobId, userProfile, includeReferral } = validateRequest(rawData);
    
    // Get user's OpenAI API key from their profile
    const userOpenAIKey = await getUserOpenAIKey(supabase, userId);
    
    if (!userOpenAIKey) {
      return new Response(JSON.stringify({ 
        error: "OpenAI API key not configured. Please add your API key in Profile settings." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[User ${userId}] Tailoring application for ${jobTitle} at ${company}`);

    // Smart location logic
    const smartLocation = getSmartLocation(location, description, userProfile.city, userProfile.country);
    console.log(`Smart location determined: ${smartLocation}`);
    
    // Jobscan keyword extraction
    const jdKeywords = extractJobscanKeywords(description, requirements);
    console.log(`Extracted ${jdKeywords.allKeywords.length} keywords from JD`);
    
    // Calculate accurate match score
    const matchResult = calculateMatchScore(
      jdKeywords.allKeywords, 
      userProfile.skills, 
      userProfile.workExperience
    );
    console.log(`Match score calculated: ${matchResult.score}%, matched: ${matchResult.matched.length}, missing: ${matchResult.missing.length}`);

    const candidateName = `${userProfile.firstName} ${userProfile.lastName}`;
    const candidateNameNoSpaces = `${userProfile.firstName}${userProfile.lastName}`;

    const systemPrompt = `You are a SENIOR PROFESSIONAL RESUME WRITER with 10+ years expertise in ATS optimization, humanized writing, and recruiter-friendly document design.

CRITICAL MISSION: Create application materials that sound HUMAN, not robotic AI-generated text. Recruiters can spot AI-written content instantly.

ABSOLUTE RULES:
1. PRESERVE ALL COMPANY NAMES AND EXACT DATES - Only tailor the bullet points
2. Use Jobscan-style ATS keyword extraction - match 85%+ keyword density naturally
3. Location in CV header MUST be: "${smartLocation}"
4. NO typos, grammatical errors, or formatting issues - PROOFREAD CAREFULLY
5. File naming: ${candidateNameNoSpaces}_CV.pdf and ${candidateNameNoSpaces}_CoverLetter.pdf

HUMANIZED TONE RULES (CRITICAL):
- Active voice only
- Vary sentence structure - no repetitive patterns like "I developed...", "I built...", "I created..."
- Use conversational connectors: "This enabled...", "Resulting in...", "To support...", "Which led to..."
- Sound confident but approachable
- BANNED PHRASES: "results-driven", "dynamic", "cutting-edge", "passionate", "leverage", "synergy", "proactive", "innovative"
- Read aloud test - must sound natural, like a real person wrote it
- Mix short and long sentences
- Include specific metrics and outcomes, not vague claims

JD KEYWORDS TO INTEGRATE (extracted via Jobscan method):
Hard Skills: ${jdKeywords.hardSkills.join(', ')}
Tools: ${jdKeywords.tools.join(', ')}
Titles: ${jdKeywords.titles.join(', ')}
Soft Skills: ${jdKeywords.softSkills.join(', ')}

CANDIDATE'S MATCHED KEYWORDS: ${matchResult.matched.join(', ')}
MISSING KEYWORDS TO ADD IF POSSIBLE: ${matchResult.missing.join(', ')}

Return ONLY valid JSON - no markdown code blocks, no extra text.`;

    const userPrompt = `TASK: Create an ATS-optimized, HUMANIZED application package.

=== TARGET JOB ===
Title: ${jobTitle}
Company: ${company}
Location: ${location || 'Not specified'} → SMART LOCATION FOR CV: ${smartLocation}
Job ID: ${jobId || 'N/A'}
Description: ${description}
Key Requirements: ${requirements.join(", ")}

=== CANDIDATE PROFILE ===
Name: ${candidateName}
Email: ${userProfile.email}
Phone: ${userProfile.phone}
LinkedIn: ${userProfile.linkedin}
GitHub: ${userProfile.github}
Portfolio: ${userProfile.portfolio}
Current Location: ${userProfile.city || ''}, ${userProfile.state || ''} ${userProfile.country || ''}

WORK EXPERIENCE (PRESERVE COMPANY NAMES AND DATES EXACTLY - ONLY REWRITE BULLETS):
${JSON.stringify(userProfile.workExperience, null, 2)}

EDUCATION:
${JSON.stringify(userProfile.education, null, 2)}

SKILLS:
${userProfile.skills?.map((s: any) => typeof s === 'string' ? s : `${s.name} (${s.years || s.level || 'proficient'})`).join(", ") || 'Not specified'}

CERTIFICATIONS:
${userProfile.certifications?.join(", ") || 'None listed'}

ACHIEVEMENTS:
${JSON.stringify(userProfile.achievements, null, 2)}

=== INSTRUCTIONS ===

1) CREATE RESUME with these exact sections:
   - Header: ${candidateName} | ${smartLocation} | ${userProfile.email} | ${userProfile.phone}
   - Links: LinkedIn, GitHub, Portfolio
   - Summary: 4-6 lines with ${jdKeywords.hardSkills.slice(0, 5).join(', ')} keywords
   - Work Experience: Keep company/dates, rewrite bullets with JD keywords + metrics
   - Education
   - Skills: Prioritize JD keywords
   - Certifications

2) CREATE COVER LETTER:
   ${candidateName}
   ${userProfile.email} | ${userProfile.phone}
   
   Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
   
   Re: Application for ${jobTitle}${jobId ? ` (Job ID: ${jobId})` : ''}
   
   Dear Hiring Committee,
   
   [4 paragraphs: Hook showing genuine interest, Proof with specific metrics and achievements, Skills alignment with job requirements, Close with availability and enthusiasm]
   
   Sincerely,
   ${candidateName}

${includeReferral ? `
3) CREATE REFERRAL EMAIL:
   Subject: Referral Request - ${jobTitle} at ${company}
   Body: Professional request mentioning specific role
` : ''}

=== REQUIRED JSON OUTPUT (NO MARKDOWN) ===
{
  "tailoredResume": "[COMPLETE RESUME TEXT - clean formatted text, no markdown]",
  "tailoredCoverLetter": "[COMPLETE COVER LETTER TEXT]",
  "matchScore": ${matchResult.score},
  "keywordsMatched": ${JSON.stringify(matchResult.matched)},
  "keywordsMissing": ${JSON.stringify(matchResult.missing)},
  "keywordAnalysis": {
    "hardSkills": ${JSON.stringify(jdKeywords.hardSkills)},
    "softSkills": ${JSON.stringify(jdKeywords.softSkills)},
    "tools": ${JSON.stringify(jdKeywords.tools)},
    "titles": ${JSON.stringify(jdKeywords.titles)}
  },
  "smartLocation": "${smartLocation}",
  "resumeStructured": {
    "personalInfo": {
      "name": "${candidateName}",
      "email": "${userProfile.email}",
      "phone": "${userProfile.phone}",
      "location": "${smartLocation}",
      "linkedin": "${userProfile.linkedin}",
      "github": "${userProfile.github}",
      "portfolio": "${userProfile.portfolio}"
    },
    "summary": "[4-6 line professional summary]",
    "experience": [
      {
        "company": "[Company Name]",
        "title": "[Job Title]",
        "dates": "[Start - End]",
        "bullets": ["bullet1 with metrics", "bullet2", "bullet3"]
      }
    ],
    "education": [
      {
        "degree": "[Degree Name]",
        "school": "[School Name]",
        "dates": "[Dates]",
        "gpa": "[GPA if applicable]"
      }
    ],
    "skills": {
      "primary": ${JSON.stringify(jdKeywords.hardSkills.slice(0, 10))},
      "secondary": ${JSON.stringify(jdKeywords.tools)}
    },
    "certifications": ${JSON.stringify(userProfile.certifications || [])}
  },
  "coverLetterStructured": {
    "recipientCompany": "${company}",
    "jobTitle": "${jobTitle}",
    "jobId": "${jobId || ''}",
    "paragraphs": ["para1", "para2", "para3", "para4"]
  },
  "suggestedImprovements": ["actionable suggestions"],
  "atsCompliance": {
    "formatValid": true,
    "keywordDensity": "${Math.round((matchResult.matched.length / jdKeywords.allKeywords.length) * 100)}%",
    "locationIncluded": true
  },
  "candidateName": "${candidateNameNoSpaces}",
  "cvFileName": "${candidateNameNoSpaces}_CV.pdf",
  "coverLetterFileName": "${candidateNameNoSpaces}_CoverLetter.pdf"${includeReferral ? `,
  "referralEmail": "[Subject + email body]"` : ''}
}`;

    // Retry logic with exponential backoff for rate limits
    const maxRetries = 3;
    let lastError: Error | null = null;
    let response: Response | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.log(`Rate limit hit, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userOpenAIKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            max_tokens: 4000,
            temperature: 0.7,
          }),
        });
        
        if (response.ok) {
          break; // Success, exit retry loop
        }
        
        if (response.status === 429) {
          // Rate limit - will retry
          const errorText = await response.text();
          console.warn(`OpenAI rate limit (attempt ${attempt + 1}):`, errorText);
          lastError = new Error("Rate limit exceeded");
          
          // Check for Retry-After header
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter && attempt < maxRetries - 1) {
            const waitTime = parseInt(retryAfter, 10) * 1000 || 2000;
            console.log(`Retry-After header suggests waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          continue;
        }
        
        // Non-retryable errors
        const errorText = await response.text();
        console.error("OpenAI API error:", response.status, errorText);
        
        if (response.status === 401) {
          return new Response(JSON.stringify({ error: "Invalid OpenAI API key. Please check your API key in Profile settings." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402 || response.status === 403) {
          return new Response(JSON.stringify({ error: "OpenAI API billing issue. Please check your OpenAI account." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        throw new Error(`OpenAI API error: ${response.status}`);
      } catch (fetchError) {
        console.error(`Fetch error (attempt ${attempt + 1}):`, fetchError);
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        if (attempt === maxRetries - 1) {
          throw lastError;
        }
      }
    }
    
    // If all retries exhausted due to rate limit, try Lovable AI fallback
    if (!response || !response.ok) {
      console.log("OpenAI failed, attempting Lovable AI fallback...");
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      
      if (LOVABLE_API_KEY) {
        try {
          const lovableResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
            }),
          });
          
          if (lovableResponse.ok) {
            console.log("Lovable AI fallback succeeded!");
            response = lovableResponse;
          } else {
            console.error("Lovable AI fallback failed:", lovableResponse.status);
          }
        } catch (lovableErr) {
          console.error("Lovable AI fallback error:", lovableErr);
        }
      }
      
      // If still no valid response
      if (!response || !response.ok) {
        return new Response(JSON.stringify({ 
          error: "AI service temporarily unavailable. Your OpenAI quota may be exceeded. Please try again later.",
          retryable: true
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const tokensUsed = data.usage?.total_tokens || 0;
    
    // Log API usage
    await logApiUsage(supabase, userId, 'tailor-application', tokensUsed);
    
    console.log(`AI response received (${tokensUsed} tokens), parsing...`);
    
    let result;
    try {
      let cleanContent = content;
      if (content.includes('```json')) {
        cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (content.includes('```')) {
        cleanContent = content.replace(/```\s*/g, '');
      }
      
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleanContent);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content:", content?.substring(0, 1000));
      
      // Fallback with pre-calculated values
      result = {
        tailoredResume: content || "Unable to generate tailored resume. Please try again.",
        tailoredCoverLetter: userProfile.coverLetter || "Unable to generate cover letter. Please try again.",
        matchScore: matchResult.score,
        keywordsMatched: matchResult.matched,
        keywordsMissing: matchResult.missing,
        smartLocation: smartLocation,
        suggestedImprovements: ["Please retry for better results"],
        candidateName: candidateNameNoSpaces,
        cvFileName: `${candidateNameNoSpaces}_CV.pdf`,
        coverLetterFileName: `${candidateNameNoSpaces}_CoverLetter.pdf`
      };
    }

    // Ensure all required fields with our pre-calculated values
    result.candidateName = result.candidateName || candidateNameNoSpaces;
    result.cvFileName = result.cvFileName || `${candidateNameNoSpaces}_CV.pdf`;
    result.coverLetterFileName = result.coverLetterFileName || `${candidateNameNoSpaces}_CoverLetter.pdf`;
    result.company = company;
    result.jobTitle = jobTitle;
    result.jobId = jobId;
    result.smartLocation = smartLocation;
    
    // Use our accurate match score
    result.matchScore = matchResult.score;
    result.keywordsMatched = result.keywordsMatched || matchResult.matched;
    result.keywordsMissing = result.keywordsMissing || matchResult.missing;
    result.keywordAnalysis = result.keywordAnalysis || {
      hardSkills: jdKeywords.hardSkills,
      softSkills: jdKeywords.softSkills,
      tools: jdKeywords.tools,
      titles: jdKeywords.titles
    };
    
    // Validate resume and cover letter
    if (!result.tailoredResume || result.tailoredResume.length < 100) {
      console.error('Resume content missing or too short');
      result.resumeGenerationStatus = 'failed';
    } else {
      result.resumeGenerationStatus = 'success';
    }
    
    if (!result.tailoredCoverLetter || result.tailoredCoverLetter.length < 100) {
      console.error('Cover letter content missing or too short');
      result.coverLetterGenerationStatus = 'failed';
    } else {
      result.coverLetterGenerationStatus = 'success';
    }

    console.log(`Successfully tailored application. Match score: ${result.matchScore}, Resume: ${result.resumeGenerationStatus}, Cover Letter: ${result.coverLetterGenerationStatus}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Tailor application error:", error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage === 'Unauthorized: Invalid or expired token') {
      return new Response(JSON.stringify({ error: "Please log in to continue" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
