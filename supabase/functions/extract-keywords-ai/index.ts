import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resume-Matcher style structured keyword extraction prompt
const EXTRACT_KEYWORDS_PROMPT = `You are an expert ATS (Applicant Tracking System) keyword extractor. Analyse the job description and extract structured keywords that are critical for CV matching.

CRITICAL LANGUAGE RULE - BRITISH ENGLISH ONLY:
ALL output MUST use British English spelling. This is NON-NEGOTIABLE.
Examples: "optimised" NOT "optimized", "organised" NOT "organized", "analysed" NOT "analyzed", "realised" NOT "realized", "specialised" NOT "specialized", "recognised" NOT "recognized", "utilised" NOT "utilized", "colour" NOT "color", "behaviour" NOT "behavior", "favour" NOT "favor", "centre" NOT "center".
Any American English spelling is an INSTANT FAILURE.

Extract keywords into these categories:
1. required_skills: Hard technical skills explicitly required (programming languages, frameworks, tools)
2. preferred_skills: Skills that are nice-to-have or preferred but not mandatory
3. experience_requirements: Specific experience requirements (years of experience, domains)
4. education_requirements: Education-related requirements (degrees, certifications)
5. key_responsibilities: Key job responsibilities and duties
6. soft_skills: Soft skills and interpersonal abilities mentioned
7. tools_and_platforms: Specific tools, platforms, and software mentioned
8. industry_keywords: Industry-specific terminology and buzzwords

For each category, extract the most important keywords as an array of strings.
Also provide a "priority_keywords" array with the TOP 15 most critical keywords for ATS matching (ranked by importance).

Return ONLY valid JSON with this exact structure:
{
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill1", "skill2"],
  "experience_requirements": ["5+ years Python", "3+ years cloud"],
  "education_requirements": ["Bachelor's CS", "AWS certification"],
  "key_responsibilities": ["Design systems", "Lead team"],
  "soft_skills": ["communication", "leadership"],
  "tools_and_platforms": ["AWS", "Docker", "Kubernetes"],
  "industry_keywords": ["fintech", "SaaS"],
  "priority_keywords": ["Python", "AWS", "Kubernetes", "Docker", "React", "SQL", "Machine Learning", "CI/CD", "Agile", "REST API", "TypeScript", "Node.js", "PostgreSQL", "Leadership", "Cloud"]
}`;

interface ExtractRequest {
  jobDescription: string;
  jobTitle?: string;
  company?: string;
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

/**
 * Returns the caller's OpenAI key, or a specific reason it is unavailable.
 * The four situations (empty column, RLS denial, zero rows, multiple rows) are
 * reported separately and the Postgres error is logged, never discarded.
 */
async function getUserOpenAIKey(
  supabase: any,
  userId: string,
): Promise<{ ok: true; key: string } | { ok: false; code: AiErrorCode; userMessage: string; detail: string }> {
  const lookup = await lookupAiKeyRow(supabase, userId, "openai_api_key");
  if (!lookup.ok) return lookup;

  const key = (lookup.row.openai_api_key as string | null) || "";
  if (!key.trim()) {
    console.error("[ai-key-lookup] openai_api_key column is empty", { userId });
    return {
      ok: false,
      code: "ai_key_missing",
      userMessage: "No OpenAI API key is saved on your profile. Add one in Profile settings.",
      detail: "openai_api_key column empty",
    };
  }

  return { ok: true, key };
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await verifyAuth(req);
    const { jobDescription, jobTitle, company } = await req.json() as ExtractRequest;

    if (!jobDescription || jobDescription.length < 50) {
      return new Response(JSON.stringify({ 
        error: "Job description is too short or missing" 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's OpenAI API key
    const openAIKey = await getUserOpenAIKey(supabase, userId);
    
    if (!openAIKey) {
      return new Response(JSON.stringify({ 
        error: "OpenAI API key not configured. Please add your API key in Profile settings." 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[User ${userId}] Extracting keywords from JD for ${jobTitle || 'Unknown'} at ${company || 'Unknown'}`);

    // PERFORMANCE BENCHMARKS
    const benchmarks: Record<string, number> = {
      jdLength: jobDescription.length,
      truncatedLength: Math.min(jobDescription.length, 10000),
      startTime: Date.now()
    };

    // STABILIZED: Extended JD length for better keyword extraction
    const truncatedJD = jobDescription.substring(0, 10000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXTRACT_KEYWORDS_PROMPT },
          { role: 'user', content: `Extract structured keywords from this job description:\n\nJob Title: ${jobTitle || 'Not specified'}\nCompany: ${company || 'Not specified'}\n\nJob Description:\n${truncatedJD}` }
        ],
        temperature: 0.2,
        max_tokens: 2000,        // STABILIZED: Increased for up to 50 keywords
        presence_penalty: 0.1,   // Reduce repetition
      }),
    });

    // BENCHMARK: API call time
    benchmarks.apiCallTime = Date.now() - benchmarks.startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      
      if (response.status === 401) {
        return new Response(JSON.stringify({ 
          error: "Invalid OpenAI API key. Please check your API key in Profile settings." 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ 
        error: "Failed to extract keywords. Please try again." 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ 
        error: "No response from AI model" 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse JSON response
    let keywords;
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      keywords = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return new Response(JSON.stringify({ 
        error: "Failed to parse keyword extraction response" 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build categorized output for the extension UI
    const allKeywords = [
      ...(keywords.priority_keywords || []),
      ...(keywords.required_skills || []),
      ...(keywords.preferred_skills || []),
      ...(keywords.tools_and_platforms || []),
      ...(keywords.soft_skills || []),
    ];

    // STABILIZED: Limit to 50 keywords total for comprehensive matching
    const uniqueKeywords = [...new Set(allKeywords.map(k => k.toLowerCase()))].slice(0, 50);
    const highPriority: string[] = (keywords.priority_keywords || []).slice(0, 15);
    const mediumPriority: string[] = [
      ...(keywords.required_skills || []),
      ...(keywords.tools_and_platforms || []),
    ].filter((k: string) => !highPriority.map((h: string) => h.toLowerCase()).includes(k.toLowerCase())).slice(0, 20);
    const lowPriority: string[] = [
      ...(keywords.preferred_skills || []),
      ...(keywords.soft_skills || []),
    ].filter((k: string) => 
      !highPriority.map((h: string) => h.toLowerCase()).includes(k.toLowerCase()) &&
      !mediumPriority.map((m: string) => m.toLowerCase()).includes(k.toLowerCase())
    ).slice(0, 15);

    const result = {
      structured: keywords,
      all: uniqueKeywords,
      highPriority,
      mediumPriority,
      lowPriority,
      total: uniqueKeywords.length,
    };

    // BENCHMARK: Total processing time
    benchmarks.totalTime = Date.now() - benchmarks.startTime;
    benchmarks.parseTime = benchmarks.totalTime - benchmarks.apiCallTime;
    benchmarks.keywordCount = result.total;

    console.log(`[User ${userId}] Extracted ${result.total} keywords (${highPriority.length} high, ${mediumPriority.length} med, ${lowPriority.length} low priority)`);
    console.log(`[BENCHMARK] JD: ${benchmarks.jdLength} chars (truncated: ${benchmarks.truncatedLength}), API: ${benchmarks.apiCallTime}ms, Parse: ${benchmarks.parseTime}ms, Total: ${benchmarks.totalTime}ms, Keywords: ${benchmarks.keywordCount}`);

    return new Response(JSON.stringify({
      ...result,
      benchmarks
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('extract-keywords-ai error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
