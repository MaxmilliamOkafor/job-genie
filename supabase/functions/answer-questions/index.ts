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
    country?: string;
    willingToRelocate?: boolean;
    visaRequired?: boolean;
    veteranStatus?: boolean;
    disability?: boolean;
    raceEthnicity?: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { questions, jobTitle, company, userProfile } = await req.json() as QuestionRequest;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Answering ${questions.length} questions for ${jobTitle} at ${company}`);

    const systemPrompt = `You are an expert job application assistant helping candidates answer application questions strategically.

Your goal is to help the candidate PASS knockout/screening questions while being truthful.

RULES:
1. For YES/NO questions about qualifications - answer YES if the candidate has ANY relevant experience
2. For years of experience - give the higher reasonable number based on their work history
3. For salary questions - provide a competitive but reasonable range
4. For availability - indicate immediate or 2 weeks notice typically
5. For willingness questions (relocate, travel, etc.) - default to YES unless specifically noted
6. For EEO/demographic questions - use "Prefer not to say" or "Decline to answer" if available
7. For open-ended questions - give concise, professional answers that highlight relevant experience
8. NEVER lie about critical qualifications that can be verified
9. Match answer format to question type (text, number, selection, etc.)

CRITICAL: Your answers should help the candidate pass initial screening while being defensible in an interview.`;

    const questionsContext = questions.map((q, i) => 
      `Q${i + 1}: "${q.label}" (Type: ${q.type}${q.options ? `, Options: ${q.options.join(', ')}` : ''}${q.required ? ', REQUIRED' : ''})`
    ).join('\n');

    const userPrompt = `CANDIDATE PROFILE:
Name: ${userProfile.firstName} ${userProfile.lastName}
Email: ${userProfile.email}
Phone: ${userProfile.phone}
Location: ${userProfile.city || 'Not specified'}, ${userProfile.country || 'Not specified'}
Willing to Relocate: ${userProfile.willingToRelocate !== false ? 'Yes' : 'No'}
Visa Required: ${userProfile.visaRequired ? 'Yes' : 'No'}
Veteran: ${userProfile.veteranStatus ? 'Yes' : 'No'}
Disability: ${userProfile.disability ? 'Yes' : 'No'}
Race/Ethnicity: ${userProfile.raceEthnicity || 'Prefer not to say'}

Skills: ${userProfile.skills?.map((s: any) => typeof s === 'string' ? s : s.name).join(', ') || 'Not specified'}

Work Experience:
${JSON.stringify(userProfile.workExperience || [], null, 2)}

Education:
${JSON.stringify(userProfile.education || [], null, 2)}

Certifications: ${userProfile.certifications?.join(', ') || 'None'}

JOB: ${jobTitle} at ${company}

QUESTIONS TO ANSWER:
${questionsContext}

For each question, provide the best answer. Return JSON array with objects containing:
- id: question ID
- answer: the answer (string, number, or array for multi-select)
- confidence: "high", "medium", or "low"
- reasoning: brief explanation (optional)

Example output:
{
  "answers": [
    { "id": "q1", "answer": "Yes", "confidence": "high" },
    { "id": "q2", "answer": 5, "confidence": "medium", "reasoning": "Based on combined experience" }
  ]
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
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
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
      result = { answers: [], error: "Failed to parse response" };
    }

    console.log(`Generated ${result.answers?.length || 0} answers`);

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
