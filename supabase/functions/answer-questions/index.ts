import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { questions, jobTitle, company, jobDescription, userProfile } = await req.json() as QuestionRequest;
    
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

## ANSWER RULES BY QUESTION TYPE:

### 1. YES/NO ELIGIBILITY QUESTIONS
- Work Authorization: ALWAYS "Yes" (authorized to work in job location)
- Age 18+: ALWAYS "Yes"
- Background Check Consent: ALWAYS "Yes"
- Drug Screening: ALWAYS "Yes"
- Willing to Travel: ALWAYS "Yes" (unless 100% travel)
- Willing to Relocate: ALWAYS "Yes"
- Essential Functions: ALWAYS "Yes"
- Reasonable Accommodation: ALWAYS "Yes"
- Terms & Conditions: ALWAYS "Yes"
- Non-Compete/NDA: ALWAYS "Yes"
- Shift Flexibility: ALWAYS "Yes"
- Overtime: ALWAYS "Yes"
- On-Call: ALWAYS "Yes"

### 2. SPONSORSHIP QUESTIONS (CRITICAL)
- "Require sponsorship now or future": ALWAYS "No" (never needs sponsorship)
- "Authorized to work without sponsorship": ALWAYS "Yes"

### 3. EXPERIENCE YEARS QUESTIONS
- Extract skill from question and match to profile
- If skill found in profile: use profile years or calculated years
- If skill NOT found: use total experience years (${totalExperience}) or 8 years default
- For "total years experience": ${totalExperience} years
- Round UP for fractional years
- Never answer less than 3 years for any technical skill

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
- These should NEVER be knockout questions

### 8. PREVIOUS EMPLOYMENT
- "Worked at this company before": "No" (unless actually true)
- "Referred by employee": "No" (unless actually true)
- "Non-compete in effect": "No"

### 9. CRIMINAL/LEGAL
- Felony conviction: "No"
- Pending charges: "No"
- Only answer "Yes" if legally required

### 10. SKILLS & CERTIFICATIONS
- Required certification: "Yes" or "In progress" if not held
- Required skill: "Yes" with years based on profile
- Proficiency level: ALWAYS "Expert" or "Advanced"

### 11. OPEN-ENDED ANSWERS
- Achievement questions: Use strongest from profile achievements
- "Why this role": Connect profile experience to job requirements
- "Additional info": Summarize key qualifications
- Keep answers concise (2-3 sentences max)

## DROPDOWN/SELECT HANDLING
When options are provided, ALWAYS select the most qualifying option:
- If "Yes/No": Pick "Yes" for eligibility questions
- If "Experience levels": Pick highest applicable
- If "Availability": Pick "Immediately" or earliest option
- If "Willing to X": Pick affirmative option

## OUTPUT FORMAT
Return valid JSON with answers array. Each answer must include:
- id: question identifier
- answer: exact answer text/value to enter
- selectValue: lowercase version for dropdown matching (optional)
- confidence: "high", "medium", or "low"`;

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
      "confidence": "high"
    }
  ]
}

IMPORTANT: 
- Every question MUST have an answer
- For dropdown/select questions, include "selectValue" in lowercase
- Optimize ALL answers to pass ATS screening
- Never leave a required question unanswered`;

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
          confidence: a.confidence || 'medium'
        }));
      }
      
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, content);
      // Return empty answers with fallback
      result = { answers: [], error: "Failed to parse response", raw: content?.substring(0, 500) };
    }

    console.log(`Generated ${result.answers?.length || 0} answers successfully`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in answer-questions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
