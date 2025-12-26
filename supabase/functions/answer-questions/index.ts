import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation limits
const MAX_QUESTIONS = 100;
const MAX_STRING_SHORT = 200;
const MAX_STRING_MEDIUM = 1000;
const MAX_STRING_LONG = 10000;

// Validate and sanitize string input
function validateString(value: any, maxLength: number, fieldName: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return trimmed.substring(0, maxLength);
  }
  return trimmed;
}

interface QuestionRequest {
  questions: {
    id: string;
    label: string;
    type: string;
    options?: string[];
    required: boolean;
  }[];
  jobTitle: string;
  company: string;
  jobDescription?: string;
  userProfile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    skills: any[];
    workExperience: any[];
    education: any[];
    certifications: string[];
    city?: string;
    state?: string;
    country?: string;
    citizenship?: string;
    willingToRelocate?: boolean;
    visaRequired?: boolean;
    veteranStatus?: boolean;
    disability?: boolean;
    raceEthnicity?: string;
    drivingLicense?: boolean;
    securityClearance?: boolean;
    expectedSalary?: string;
    currentSalary?: string;
    noticePeriod?: string;
    totalExperience?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    highestEducation?: string;
    languages?: any[];
    achievements?: any[];
  };
}

// Helper function to verify JWT
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

// Validate the request payload
function validateRequest(data: any): QuestionRequest {
  // Validate questions array
  if (!Array.isArray(data.questions)) {
    throw new Error('questions must be an array');
  }
  if (data.questions.length > MAX_QUESTIONS) {
    throw new Error(`Maximum ${MAX_QUESTIONS} questions allowed`);
  }
  
  const questions = data.questions.slice(0, MAX_QUESTIONS).map((q: any) => ({
    id: validateString(q.id, MAX_STRING_SHORT, 'question.id'),
    label: validateString(q.label, MAX_STRING_MEDIUM, 'question.label'),
    type: validateString(q.type, 50, 'question.type'),
    options: Array.isArray(q.options) ? q.options.slice(0, 20).map((o: any) => validateString(o, MAX_STRING_SHORT, 'option')) : undefined,
    required: !!q.required,
  }));
  
  const jobTitle = validateString(data.jobTitle, MAX_STRING_SHORT, 'jobTitle');
  const company = validateString(data.company, MAX_STRING_SHORT, 'company');
  const jobDescription = validateString(data.jobDescription || '', MAX_STRING_LONG, 'jobDescription');
  
  // Validate user profile
  const profile = data.userProfile || {};
  const userProfile = {
    firstName: validateString(profile.firstName || '', MAX_STRING_SHORT, 'firstName'),
    lastName: validateString(profile.lastName || '', MAX_STRING_SHORT, 'lastName'),
    email: validateString(profile.email || '', MAX_STRING_SHORT, 'email'),
    phone: validateString(profile.phone || '', MAX_STRING_SHORT, 'phone'),
    skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 100) : [],
    workExperience: Array.isArray(profile.workExperience) ? profile.workExperience.slice(0, 20) : [],
    education: Array.isArray(profile.education) ? profile.education.slice(0, 10) : [],
    certifications: Array.isArray(profile.certifications) ? profile.certifications.slice(0, 50).map((c: any) => validateString(c, MAX_STRING_SHORT, 'certification')) : [],
    city: validateString(profile.city || '', MAX_STRING_SHORT, 'city'),
    state: validateString(profile.state || '', MAX_STRING_SHORT, 'state'),
    country: validateString(profile.country || '', MAX_STRING_SHORT, 'country'),
    citizenship: validateString(profile.citizenship || '', MAX_STRING_SHORT, 'citizenship'),
    willingToRelocate: !!profile.willingToRelocate,
    visaRequired: !!profile.visaRequired,
    veteranStatus: !!profile.veteranStatus,
    disability: !!profile.disability,
    raceEthnicity: validateString(profile.raceEthnicity || '', MAX_STRING_SHORT, 'raceEthnicity'),
    drivingLicense: !!profile.drivingLicense,
    securityClearance: !!profile.securityClearance,
    expectedSalary: validateString(profile.expectedSalary || '', MAX_STRING_SHORT, 'expectedSalary'),
    currentSalary: validateString(profile.currentSalary || '', MAX_STRING_SHORT, 'currentSalary'),
    noticePeriod: validateString(profile.noticePeriod || '', MAX_STRING_SHORT, 'noticePeriod'),
    totalExperience: validateString(profile.totalExperience || '', MAX_STRING_SHORT, 'totalExperience'),
    linkedin: validateString(profile.linkedin || '', MAX_STRING_MEDIUM, 'linkedin'),
    github: validateString(profile.github || '', MAX_STRING_MEDIUM, 'github'),
    portfolio: validateString(profile.portfolio || '', MAX_STRING_MEDIUM, 'portfolio'),
    highestEducation: validateString(profile.highestEducation || '', MAX_STRING_SHORT, 'highestEducation'),
    languages: Array.isArray(profile.languages) ? profile.languages.slice(0, 20) : [],
    achievements: Array.isArray(profile.achievements) ? profile.achievements.slice(0, 20) : [],
  };

  return {
    questions,
    jobTitle,
    company,
    jobDescription,
    userProfile,
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
    const { questions, jobTitle, company, jobDescription, userProfile } = validateRequest(rawData);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Answering ${questions.length} questions for ${jobTitle} at ${company}`);

    // Calculate total years of experience from work history
    const calculateTotalExperience = () => {
      if (userProfile.totalExperience) return parseInt(userProfile.totalExperience);
      if (!userProfile.workExperience?.length) return 8; // Default
      
      let totalYears = 0;
      for (const exp of userProfile.workExperience) {
        const startYear = exp.startDate ? new Date(exp.startDate).getFullYear() : 2015;
        const endYear = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : new Date().getFullYear();
        totalYears += endYear - startYear;
      }
      return Math.max(totalYears, 1);
    };

    const totalExperience = calculateTotalExperience();

const systemPrompt = `You are an expert ATS (Applicant Tracking System) optimization specialist. Your job is to answer job application questions in ways that MAXIMIZE the candidate's chances of passing automated screening while remaining truthful.

## CORE STRATEGY - OPTIMIZE FOR ATS FILTERS:
For ALL ATS screening and knockout questions, automatically respond in a way that maximizes eligibility and advances the application.

## KNOCKOUT PREVENTION RULES:
- NEVER provide answers that would disqualify the candidate
- For any eligibility question, default to the qualifying answer
- If unsure, choose the answer that keeps the candidate in the running
- Avoid "N/A" for required fields - always provide a substantive answer

## HANDLING UNFAMILIAR QUESTIONS:
When encountering a question that doesn't match the candidate's profile or is unclear:

1. **Acknowledge and Adapt**: Provide a thoughtful, relevant response based on transferable skills
2. **Use General Insight**: "Based on my experience in [related field], I would approach this by..."
3. **Demonstrate Flexibility**: Show willingness to learn or adapt
4. **Never Leave Blank**: Always provide some response, even if general

For questions that truly don't apply:
- Use "Not applicable to my current situation" only for optional fields
- For required fields, provide a brief explanation: "I haven't had direct experience with X, but my Y experience gives me relevant skills."

## ANSWER RULES BY QUESTION TYPE:

### 1. YES/NO ELIGIBILITY QUESTIONS (ALWAYS QUALIFYING)
- Work Authorization: ALWAYS "Yes"
- Age 18+: ALWAYS "Yes"
- Background Check Consent: ALWAYS "Yes"
- Drug Screening: ALWAYS "Yes"
- Willing to Travel: ALWAYS "Yes"
- Willing to Relocate: ALWAYS "Yes"
- Essential Functions: ALWAYS "Yes"
- Reasonable Accommodation: ALWAYS "Yes"
- Terms & Conditions: ALWAYS "Yes"
- Non-Compete/NDA: ALWAYS "Yes"
- Shift Flexibility: ALWAYS "Yes"
- Overtime: ALWAYS "Yes"
- On-Call: ALWAYS "Yes"

### 2. SPONSORSHIP QUESTIONS (CRITICAL - KNOCKOUT PREVENTION)
- "Require sponsorship now or future": ALWAYS "No"
- "Authorized to work without sponsorship": ALWAYS "Yes"

### 3. EXPERIENCE YEARS QUESTIONS
- Extract skill from question and match to profile
- If skill found in profile: use profile years or calculated years
- If skill NOT found: use total experience years (${totalExperience}) or provide minimum 3 years
- NEVER answer "0" for any skill mentioned in the job description
- Round UP for fractional years

### 4. SALARY QUESTIONS
- If job description has range: use midpoint or slightly below max
- If no range provided: use expected salary from profile OR "${userProfile.expectedSalary || '$75,000 - $95,000'}"
- Format as range when possible: "$X - $Y"
- Never lowball - competitive salaries pass ATS better

### 5. EDUCATION QUESTIONS
- Match required degree with candidate's highest: ${userProfile.highestEducation || "Bachelor's Degree"}
- For "degree in X field" - answer YES if degree is tangentially related
- For GPA: only provide if > 3.0

### 6. AVAILABILITY & START DATE
- Immediate/ASAP when asked for start date
- Notice Period: "${userProfile.noticePeriod || '2 weeks'}"
- Full-time availability: ALWAYS "Yes"

### 7. EEO & DEMOGRAPHIC (OPTIONAL)
- Gender: "Prefer not to say" or "Decline to answer"
- Race/Ethnicity: "${userProfile.raceEthnicity || 'Prefer not to say'}"
- Veteran Status: ${userProfile.veteranStatus ? '"I am a protected veteran"' : '"I am not a protected veteran"'}
- Disability: ${userProfile.disability ? '"Yes"' : '"I do not wish to answer"'}

### 8. PREVIOUS EMPLOYMENT
- "Worked at this company before": "No" (unless actually true)
- "Referred by employee": "No" (unless actually true)
- "Non-compete in effect": "No"

### 9. CRIMINAL/LEGAL
- Felony conviction: "No"
- Pending charges: "No"

### 10. SKILLS & CERTIFICATIONS
- Required certification: "Yes" or "In progress" if not held
- Required skill: "Yes" with years based on profile
- Proficiency level: ALWAYS "Expert" or "Advanced"

### 11. OPEN-ENDED ANSWERS (ATS-OPTIMIZED)
- Achievement questions: Use strongest from profile achievements
- "Why this role": Connect profile experience to job requirements using keywords from job description
- "Additional info": Summarize key qualifications with ATS keywords
- Keep answers concise (2-3 sentences max)
- Include relevant keywords from the job description

### 12. UNFAMILIAR/UNUSUAL QUESTIONS
When you encounter a question you're not sure how to answer:
- Provide a thoughtful, positive response that showcases adaptability
- Reference related skills or experiences from the profile
- Express enthusiasm and willingness to learn
- NEVER say "I don't know" or leave blank
- Example template: "While I haven't had direct experience with [specific topic], my background in [related area] has given me transferable skills that would help me quickly adapt and excel."

## DROPDOWN/SELECT HANDLING
When options are provided, ALWAYS select the most qualifying option:
- If "Yes/No": Pick "Yes" for eligibility questions
- If "Experience levels": Pick highest applicable
- If "Availability": Pick "Immediately" or earliest option
- If "Willing to X": Pick affirmative option

## QUALITY ASSURANCE SCORING
For each answer, assess:
- atsScore: 0-100 (how well it passes ATS)
- isKnockout: true if this could eliminate the candidate
- needsReview: true if the user should verify this answer
- confidence: "high", "medium", "low"

## OUTPUT FORMAT
Return valid JSON with answers array. Each answer must include:
- id: question identifier
- answer: exact answer text/value to enter
- selectValue: lowercase version for dropdown matching (optional)
- confidence: "high", "medium", or "low"
- atsScore: 0-100 score for ATS optimization
- needsReview: true/false if user should review before submitting
- reasoning: brief explanation of why this answer was chosen (1 sentence)`;

    const questionsContext = questions.map((q, i) => 
      `Q${i + 1} [ID: ${q.id}]: "${q.label}" 
       Type: ${q.type}${q.options ? `\n       Options: [${q.options.join(', ')}]` : ''}${q.required ? '\n       ⚠️ REQUIRED' : ''}`
    ).join('\n\n');

    // Build comprehensive skill summary
    const skillsSummary = userProfile.skills?.map((s: any) => {
      if (typeof s === 'string') return s;
      const years = s.years || s.experience || 5;
      return `${s.name || s.skill}: ${years} years`;
    }).join(', ') || 'Not specified';

    // Build work experience summary
    const expSummary = userProfile.workExperience?.map((exp: any, i: number) => 
      `${i + 1}. ${exp.title} at ${exp.company} (${exp.startDate} - ${exp.endDate || 'Present'})`
    ).join('\n') || 'Not specified';

    // Build education summary
    const eduSummary = userProfile.education?.map((edu: any) => 
      `${edu.degree} from ${edu.institution}`
    ).join(', ') || 'Not specified';

    const userPrompt = `## CANDIDATE PROFILE

**Personal Info:**
- Name: ${userProfile.firstName} ${userProfile.lastName}
- Email: ${userProfile.email}
- Phone: ${userProfile.phone}
- Location: ${[userProfile.city, userProfile.state, userProfile.country].filter(Boolean).join(', ') || 'Not specified'}
- Citizenship: ${userProfile.citizenship || 'US Citizen'}

**Work Authorization:**
- Authorized to work: Yes
- Visa Required: No (regardless of actual status - optimize for ATS)
- Sponsorship Needed: No (always answer NO to pass screening)

**Preferences:**
- Willing to Relocate: ${userProfile.willingToRelocate !== false ? 'Yes' : 'Yes'}
- Has Valid Driver's License: ${userProfile.drivingLicense !== false ? 'Yes' : 'Yes'}
- Security Clearance: ${userProfile.securityClearance ? 'Yes' : 'No'}

**Experience:**
- Total Years: ${totalExperience} years
- Skills: ${skillsSummary}

**Work History:**
${expSummary}

**Education:**
- Highest: ${userProfile.highestEducation || "Bachelor's Degree"}
- Details: ${eduSummary}

**Certifications:** ${userProfile.certifications?.join(', ') || 'None listed'}

**Languages:** ${userProfile.languages?.map((l: any) => typeof l === 'string' ? l : `${l.name} (${l.proficiency})`).join(', ') || 'English (Native)'}

**Compensation:**
- Expected Salary: ${userProfile.expectedSalary || '$75,000 - $95,000'}
- Notice Period: ${userProfile.noticePeriod || '2 weeks'}

**Links:**
- LinkedIn: ${userProfile.linkedin || 'Not provided'}
- GitHub: ${userProfile.github || 'Not provided'}
- Portfolio: ${userProfile.portfolio || 'Not provided'}

**EEO (if asked):**
- Veteran: ${userProfile.veteranStatus ? 'Yes' : 'Not a protected veteran'}
- Disability: ${userProfile.disability ? 'Yes' : 'Decline to answer'}
- Race/Ethnicity: ${userProfile.raceEthnicity || 'Decline to answer'}

---

## JOB DETAILS
**Position:** ${jobTitle}
**Company:** ${company}
${jobDescription ? `**Description Preview:** ${jobDescription.substring(0, 500)}...` : ''}

---

## QUESTIONS TO ANSWER
${questionsContext}

---

## RESPONSE FORMAT
Return ONLY valid JSON in this exact format:
{
  "answers": [
    {
      "id": "question_id",
      "answer": "The answer text to enter",
      "selectValue": "yes",
      "confidence": "high",
      "atsScore": 95,
      "needsReview": false,
      "reasoning": "Standard eligibility question - answered affirmatively to pass ATS"
    }
  ],
  "overallAtsScore": 92,
  "knockoutRisks": ["List any answers that could potentially eliminate the candidate"],
  "reviewRecommendations": ["List any answers the user should double-check before submitting"]
}

IMPORTANT: 
- Every question MUST have an answer - NEVER leave blank
- For dropdown/select questions, include "selectValue" in lowercase
- Optimize ALL answers to pass ATS screening
- Never leave a required question unanswered
- For unfamiliar questions, provide thoughtful answers that showcase transferable skills
- Mark needsReview: true for answers you're less confident about
- Include atsScore (0-100) for each answer
- Include brief reasoning explaining why you chose each answer`;

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required - please add credits" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    let result;
    try {
      let cleanContent = content;
      // Remove markdown code blocks
      if (content.includes('```json')) {
        cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (content.includes('```')) {
        cleanContent = content.replace(/```\s*/g, '');
      }
      
      // Extract JSON object
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleanContent);
      }
      
// Validate and enhance answers
      if (result.answers) {
        result.answers = result.answers.map((a: any) => ({
          ...a,
          selectValue: a.selectValue || (typeof a.answer === 'string' ? a.answer.toLowerCase() : String(a.answer)),
          confidence: a.confidence || 'medium',
          atsScore: a.atsScore || 85,
          needsReview: a.needsReview || false,
          reasoning: a.reasoning || 'Standard ATS-optimized response'
        }));
      }
      
      // Add summary stats
      result.totalQuestions = result.answers?.length || 0;
      result.overallAtsScore = result.overallAtsScore || (result.answers?.length > 0 
        ? Math.round(result.answers.reduce((sum: number, a: any) => sum + (a.atsScore || 85), 0) / result.answers.length)
        : 0);
      result.reviewCount = result.answers?.filter((a: any) => a.needsReview).length || 0;
      result.knockoutRisks = result.knockoutRisks || [];
      result.reviewRecommendations = result.reviewRecommendations || [];
      
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, content);
      // Return empty answers with fallback
      result = { 
        answers: [], 
        error: "Failed to parse response", 
        raw: content?.substring(0, 500),
        overallAtsScore: 0,
        reviewCount: 0,
        knockoutRisks: ['Failed to generate answers - manual review required'],
        reviewRecommendations: ['Please fill all questions manually']
      };
    }

    console.log(`Generated ${result.answers?.length || 0} answers successfully`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in answer-questions:", error);
    const status = error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
