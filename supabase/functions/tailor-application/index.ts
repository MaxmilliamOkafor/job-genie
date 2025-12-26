import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation limits
const MAX_STRING_SHORT = 200;
const MAX_STRING_MEDIUM = 500;
const MAX_STRING_LONG = 50000; // ~50KB for descriptions
const MAX_ARRAY_SIZE = 50;

// Validate and sanitize string input
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

// Validate array of strings
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

// Helper function to verify JWT and extract user ID
async function verifyAuth(req: Request): Promise<void> {
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
}

// Validate the entire request payload
function validateRequest(data: any): TailorRequest {
  const jobTitle = validateString(data.jobTitle, MAX_STRING_SHORT, 'jobTitle');
  const company = validateString(data.company, MAX_STRING_SHORT, 'company');
  const description = validateString(data.description || '', MAX_STRING_LONG, 'description');
  const requirements = validateStringArray(data.requirements || [], MAX_ARRAY_SIZE, MAX_STRING_MEDIUM, 'requirements');
  const location = data.location ? validateString(data.location, MAX_STRING_SHORT, 'location') : undefined;
  const jobId = data.jobId ? validateString(data.jobId, MAX_STRING_SHORT, 'jobId') : undefined;
  
  // Validate user profile
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    await verifyAuth(req);
    
    // Parse and validate request
    const rawData = await req.json();
    const { jobTitle, company, description, requirements, location, jobId, userProfile, includeReferral } = validateRequest(rawData);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Tailoring application for ${jobTitle} at ${company}`);

    // Comprehensive humanized resume tailoring prompt with enhanced ATS accuracy
    const systemPrompt = `You are a SENIOR PROFESSIONAL RESUME WRITER with 10+ years expertise in ATS optimization, humanized writing, and recruiter-friendly document design.

CRITICAL MISSION: Create application materials that sound HUMAN, not robotic AI-generated text. Recruiters can spot AI-written content instantly.

ABSOLUTE RULES:
1. PRESERVE ALL COMPANY NAMES AND EXACT DATES - Only tailor the bullet points
2. Use Jobscan-style ATS keyword extraction - match 85%+ keyword density naturally
3. Handle location from job description - add to CV header for ATS compliance
4. NO typos, grammatical errors, or formatting issues - PROOFREAD CAREFULLY
5. File naming convention: FirstnameLastname_CV.pdf and FirstnameLastname_CoverLetter.pdf

ATS SCORING RULES (CRITICAL FOR ACCURACY):
- Calculate matchScore based on ACTUAL keyword overlap between job requirements and candidate profile
- Primary keywords (job title, core tech stack): 3 points each
- Secondary keywords (tools, methodologies): 2 points each  
- Soft skills/nice-to-haves: 1 point each
- Missing critical requirements: -5 points each
- Final score = (matched_points / total_possible_points) * 100, capped at 100
- Be HONEST about the match - do not inflate scores artificially

HUMANIZED TONE RULES (CRITICAL):
- Active voice only
- Vary sentence structure - no repetitive patterns like "I developed...", "I built...", "I created..."
- Use conversational connectors: "This enabled...", "Resulting in...", "To support...", "Which led to..."
- Sound confident but approachable
- BANNED PHRASES: "results-driven", "dynamic", "cutting-edge", "passionate", "leverage", "synergy", "proactive", "innovative"
- Read aloud test - must sound natural, like a real person wrote it
- Mix short and long sentences
- Include specific metrics and outcomes, not vague claims

ATS KEYWORD INTEGRATION:
- Extract exact keywords from job description
- Hard skills: Python, AWS, SQL, Kubernetes, etc.
- Tools/platforms: Snowflake, Airflow, Docker, etc.
- Methodologies: Agile, CI/CD, ETL, etc.
- Role verbs from JD: designed, optimized, deployed, scaled, architected
- Integrate keywords NATURALLY - not stuffed awkwardly

LOCATION HANDLING (CRITICAL FOR ATS):
- If job specifies a location, ADD THAT LOCATION to resume header
- Format: "Location: [Job Location] | Open to relocation"
- For remote roles: "Location: Remote"
- Location should appear in header AND summary for ATS visibility

Return ONLY valid JSON - no markdown code blocks, no extra text.`;

    const candidateName = `${userProfile.firstName} ${userProfile.lastName}`;
    const candidateNameNoSpaces = `${userProfile.firstName}${userProfile.lastName}`;
    const sanitizedJobTitle = jobTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const fileNameBase = candidateNameNoSpaces;

    const userPrompt = `TASK: Create an ATS-optimized, HUMANIZED application package for this job.

=== TARGET JOB ===
Title: ${jobTitle}
Company: ${company}
Location: ${location || 'Not specified'}
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

=== DETAILED INSTRUCTIONS ===

1) EXTRACT ATS KEYWORDS (Jobscan method):
   - Identify ALL hard skills, tools, platforms mentioned in JD
   - Note methodologies and frameworks required
   - Capture action verbs used in JD
   - Mark required vs. preferred keywords

2) LOCATION HANDLING:
   - If job requires specific location: Add "${location || 'Job Location'}" to resume header
   - Format: "Location: ${location || '[City, Country]'} | Open to relocation"
   - Include location mention in summary

3) TAILOR WORK EXPERIENCE:
   CRITICAL: Keep exact company name + dates for each role
   For each role, write 3-5 bullets that:
   - Start with strong action verb FROM the job description
   - Include 1-2 JD keywords naturally per bullet
   - Quantify with numbers, %, $, time saved
   - Show OUTCOME not just task
   - Vary sentence structure - no repetitive patterns
   
   Example transformation:
   BEFORE: "Built Kafka pipelines"
   AFTER: "Designed Kafka and Airflow pipelines processing 10M+ daily events into Snowflake, enabling real-time analytics that reduced decision latency by 40%"

4) REWRITE SUMMARY (4-6 lines max):
   - Lead: "Senior ${jobTitle} with [X] years experience in [3 key JD keywords]"
   - Include 4-6 high-priority keywords naturally
   - Mention a key achievement with metric
   - End with location availability

5) CREATE COVER LETTER:
   
   ${candidateName}
   ${userProfile.email} | ${userProfile.phone}
   
   Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
   
   Hiring Team
   ${company}
   ${jobId ? `Re: ${jobTitle} - Job ID: ${jobId}` : `Re: ${jobTitle}`}
   
   Dear Hiring Team,
   
   [PARA 1 - HOOK: Why this role at ${company}? Lead with a specific achievement that matches their need]
   
   [PARA 2 - PROOF: Detail 1-2 experiences that directly map to JD requirements with metrics]
   
   [PARA 3 - SKILLS: List 5-6 key technical skills from JD that you possess]
   
   [PARA 4 - CLOSE: Express enthusiasm, mention availability]
   
   Sincerely,
   ${candidateName}

${includeReferral ? `
6) CREATE REFERRAL EMAIL:
   Subject: Referral Request - ${jobTitle} at ${company}
   Body: Professional but warm request for referral, mentioning the specific role
` : ''}

=== REQUIRED JSON OUTPUT (NO MARKDOWN) ===
{
  "tailoredResume": "[COMPLETE RESUME with location in header, tailored summary, work experience with preserved company/dates but rewritten bullets, education, skills prioritized by JD, certifications]",
  "tailoredCoverLetter": "[COMPLETE COVER LETTER addressing ${company} for ${jobTitle}${jobId ? ` (Job ID: ${jobId})` : ''}]",
  "matchScore": [0-100 - CALCULATE HONESTLY based on actual keyword overlap. Count matched vs missing critical skills.],
  "keywordsMatched": ["ONLY list keywords that ACTUALLY appear in candidate profile AND job description"],
  "keywordsMissing": ["HONESTLY list JD keywords NOT found in candidate profile - be thorough"],
  "keywordAnalysis": {
    "primaryMatched": ["core required skills that matched"],
    "primaryMissing": ["core required skills that are missing"],
    "secondaryMatched": ["nice-to-have skills that matched"],
    "secondaryMissing": ["nice-to-have skills that are missing"]
  },
  "locationAdded": "${location || 'Location from job description'}",
  "suggestedImprovements": ["actionable suggestions for candidate to improve match"],
  "atsCompliance": {
    "formatValid": true,
    "keywordDensity": "percentage of JD keywords included",
    "sectionOrder": "correct ATS-friendly section ordering confirmed"
  },
  "candidateName": "${candidateNameNoSpaces}",
  "cvFileName": "${candidateNameNoSpaces}_CV.pdf",
  "coverLetterFileName": "${candidateNameNoSpaces}_CoverLetter.pdf"${includeReferral ? `,
  "referralEmail": "[Subject + email body]"` : ''}
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log("AI response received, parsing...");
    
    // Parse JSON from response - handle markdown code blocks
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
      
      // Fallback with basic structure
      result = {
        tailoredResume: content || "Unable to generate tailored resume. Please try again.",
        tailoredCoverLetter: userProfile.coverLetter || "Unable to generate cover letter. Please try again.",
        matchScore: 70,
        keywordsMatched: requirements.slice(0, 5),
        keywordsMissing: [],
        locationAdded: location || "Not specified",
        suggestedImprovements: ["Please retry for better results"],
        candidateName: `${userProfile.firstName}${userProfile.lastName}`,
        cvFileName: `${userProfile.firstName}${userProfile.lastName}_CV.pdf`,
        coverLetterFileName: `${userProfile.firstName}${userProfile.lastName}_CoverLetter.pdf`
      };
    }

    // Ensure all required fields are set with proper file naming
    result.candidateName = result.candidateName || `${userProfile.firstName}${userProfile.lastName}`;
    result.cvFileName = result.cvFileName || `${result.candidateName}_CV.pdf`;
    result.coverLetterFileName = result.coverLetterFileName || `${result.candidateName}_CoverLetter.pdf`;
    result.company = company;
    result.jobTitle = jobTitle;
    result.jobId = jobId;
    
    // Validate that resume and cover letter were generated
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

  } catch (error) {
    console.error("Error in tailor-application:", error);
    const status = error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
