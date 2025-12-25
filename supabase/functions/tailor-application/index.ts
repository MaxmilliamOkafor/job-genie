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
  };
  includeReferral?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobTitle, company, description, requirements, userProfile, includeReferral } = await req.json() as TailorRequest;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Tailoring application for ${jobTitle} at ${company}`);

    const systemPrompt = `You are an expert ATS optimization specialist and resume writer. Your job is to create tailored resumes and cover letters that:
1. Pass Applicant Tracking Systems with 95%+ keyword match
2. Highlight the most relevant experience for each specific job
3. Use exact keywords from the job description
4. Quantify achievements wherever possible
5. Create compelling narratives that match the company culture

ATS Strategy from user: ${userProfile.atsStrategy}

IMPORTANT: Return JSON only, no markdown formatting.`;

    const userPrompt = `Create a fully ATS-optimized application package for this job:

JOB DETAILS:
Title: ${jobTitle}
Company: ${company}
Description: ${description}
Requirements: ${requirements.join(", ")}

CANDIDATE PROFILE:
Name: ${userProfile.firstName} ${userProfile.lastName}
Email: ${userProfile.email}
Phone: ${userProfile.phone}
LinkedIn: ${userProfile.linkedin}
GitHub: ${userProfile.github}
Portfolio: ${userProfile.portfolio}

WORK EXPERIENCE:
${JSON.stringify(userProfile.workExperience, null, 2)}

EDUCATION:
${JSON.stringify(userProfile.education, null, 2)}

SKILLS:
${userProfile.skills.map((s: any) => `${s.name} (${s.years} years)`).join(", ")}

CERTIFICATIONS:
${userProfile.certifications.join(", ")}

ACHIEVEMENTS:
${JSON.stringify(userProfile.achievements, null, 2)}

Return a JSON object with:
{
  "tailoredResume": "Full ATS-optimized resume in markdown format tailored specifically for this role, emphasizing matching skills and experience",
  "tailoredCoverLetter": "Personalized cover letter addressing the specific job requirements and company",
  "matchScore": number (0-100 based on how well the candidate matches),
  "keywordsMatched": ["array", "of", "matched", "keywords"],
  "suggestedImprovements": ["any", "suggestions", "for", "the", "candidate"]${includeReferral ? `,
  "referralEmail": "Professional email template to send to company employees requesting a referral, personalized for this role"` : ''}
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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log("AI response received, parsing...");
    
    // Parse JSON from response
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      result = {
        tailoredResume: content,
        tailoredCoverLetter: userProfile.coverLetter,
        matchScore: 75,
        keywordsMatched: requirements.slice(0, 5),
        suggestedImprovements: []
      };
    }

    console.log(`Successfully tailored application. Match score: ${result.matchScore}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in tailor-application:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
