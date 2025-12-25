import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  };
  includeReferral?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobTitle, company, description, requirements, location, jobId, userProfile, includeReferral } = await req.json() as TailorRequest;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Tailoring application for ${jobTitle} at ${company}`);

    // Comprehensive ATS optimization system prompt based on user's detailed instructions
    const systemPrompt = `You are a professional resume and cover-letter tailor with 10+ years expertise in ATS optimization, humanized writing, and recruiter-friendly document design.

Your job is to take the user's base CV + target job description and output ready-to-use content that perfectly matches the role while sounding authentically human - NOT robotic AI-generated text.

CRITICAL RULES:
1. PRESERVE ALL COMPANY NAMES AND EXACT DATES - Only tailor the bullet points
2. Use Jobscan-style ATS keyword extraction - match 85%+ keyword density naturally
3. Handle location from job description - add to CV header for ATS compliance
4. Start bullets with strong action verbs from job description
5. Quantify impact with numbers, percentages, dollar amounts
6. Write in active voice only - vary sentence structure
7. Sound confident but approachable - NO robotic phrases like "results-driven", "dynamic", "cutting-edge"
8. Use conversational connectors: "This enabled...", "Resulting in...", "To support..."

HUMANIZED TONE RULES:
- Active voice only
- Vary sentence structure (no repetitive "I developed...")
- Sound confident but approachable
- NO overused phrases: "results-driven", "dynamic", "cutting-edge", "passionate", "leverage"
- Read aloud test - must sound natural

Return ONLY valid JSON, no markdown or code blocks.`;

    const userPrompt = `TASK: Create an ATS-optimized, humanized application package for this job.

=== TARGET JOB ===
Title: ${jobTitle}
Company: ${company}
Location: ${location || 'Not specified'}
Job ID: ${jobId || 'N/A'}
Description: ${description}
Key Requirements: ${requirements.join(", ")}

=== CANDIDATE PROFILE ===
Name: ${userProfile.firstName} ${userProfile.lastName}
Email: ${userProfile.email}
Phone: ${userProfile.phone}
LinkedIn: ${userProfile.linkedin}
GitHub: ${userProfile.github}
Portfolio: ${userProfile.portfolio}
Current Location: ${userProfile.city || ''}, ${userProfile.country || ''}

WORK EXPERIENCE (PRESERVE COMPANY NAMES AND DATES EXACTLY):
${JSON.stringify(userProfile.workExperience, null, 2)}

EDUCATION:
${JSON.stringify(userProfile.education, null, 2)}

SKILLS:
${userProfile.skills.map((s: any) => `${s.name} (${s.years || s.level || 'proficient'})`).join(", ")}

CERTIFICATIONS:
${userProfile.certifications?.join(", ") || 'None listed'}

ACHIEVEMENTS:
${JSON.stringify(userProfile.achievements, null, 2)}

=== INSTRUCTIONS ===

1) EXTRACT ATS KEYWORDS from job description:
   - Hard skills (Python, AWS, SQL, etc.)
   - Tools/platforms (Snowflake, Airflow, Docker, etc.)
   - Methodologies (Agile, CI/CD, ETL, etc.)
   - Action verbs from JD (designed, optimized, deployed, scaled)

2) LOCATION HANDLING:
   - Extract location from job description
   - Add to CV header: "Location: [Job City/Country] | Open to relocation" OR "Remote - [Candidate Location]"
   - Location should appear 2-3x (header + summary)

3) TAILOR WORK EXPERIENCE:
   - KEEP company names and dates EXACTLY as provided
   - Rewrite 3-5 bullets per role with JD keywords naturally integrated
   - Start each bullet with strong action verb
   - Include 1-2 target keywords naturally per bullet
   - Quantify: numbers, %, $ saved, time reduced

4) REWRITE SUMMARY:
   - 4-6 lines max
   - Lead with: "Senior [Job Title] with [X] years experience in [3 key JD keywords]"
   - Include 4-6 high-priority keywords
   - End with location availability

5) CREATE COVER LETTER:
   - Address to "Hiring Team at ${company}"
   - Reference Job ID if available: ${jobId || 'N/A'}
   - Paragraph 1: Hook - why this role at this company
   - Paragraph 2: Proof - specific achievement matching JD need
   - Paragraph 3: Skills match - list 5 key JD skills from experience
   - Paragraph 4: Close - enthusiasm + availability
   - SIGN with candidate name

${includeReferral ? `
6) CREATE REFERRAL EMAIL:
   - Subject line for referral request
   - Professional but warm tone
   - Mention specific role and why interested
   - Ask if they can refer or connect you with hiring team
` : ''}

=== REQUIRED JSON OUTPUT ===
{
  "tailoredResume": "[Full resume in clean markdown - COMPANY NAMES/DATES PRESERVED, bullets tailored with JD keywords, location added to header]",
  "tailoredCoverLetter": "[Full cover letter addressing ${company} for ${jobTitle}${jobId ? `, Job ID: ${jobId}` : ''}]",
  "matchScore": [number 0-100 based on keyword match and experience alignment],
  "keywordsMatched": ["list", "of", "matched", "JD", "keywords"],
  "keywordsMissing": ["keywords", "from", "JD", "not", "in", "profile"],
  "locationAdded": "[Location added to resume header]",
  "suggestedImprovements": ["actionable", "suggestions", "for", "candidate"]${includeReferral ? `,
  "referralEmail": "[Subject line + full email body for referral request]"` : ''}
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
      // Remove markdown code blocks if present
      let cleanContent = content;
      if (content.includes('```json')) {
        cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (content.includes('```')) {
        cleanContent = content.replace(/```\s*/g, '');
      }
      
      // Try to extract JSON from the response
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleanContent);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content:", content?.substring(0, 500));
      
      // Fallback with basic structure
      result = {
        tailoredResume: content || "Unable to generate tailored resume. Please try again.",
        tailoredCoverLetter: userProfile.coverLetter || "Unable to generate cover letter. Please try again.",
        matchScore: 70,
        keywordsMatched: requirements.slice(0, 5),
        keywordsMissing: [],
        locationAdded: location || "Not specified",
        suggestedImprovements: ["Please retry for better results"]
      };
    }

    console.log(`Successfully tailored application. Match score: ${result.matchScore}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in tailor-application:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
