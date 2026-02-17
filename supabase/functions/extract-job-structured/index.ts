import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  "Software Development",
  "Engineering",
  "Information Technology",
  "Product Management",
  "Project and Program Management",
  "Design",
  "Data and Analytics",
  "Sales",
  "Marketing",
  "Customer Service",
  "Business Operations",
  "Finance and Accounting",
  "Human Resources",
  "Legal and Compliance",
  "Healthcare",
  "Other",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_ids, user_id, batch_size } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch jobs that haven't been AI-extracted yet
    const limit = batch_size || 20;
    let query = supabase
      .from("jobs")
      .select("id, title, company, location, salary, description, url, platform")
      .eq("user_id", user_id)
      .eq("ai_extracted", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (job_ids?.length) {
      query = supabase
        .from("jobs")
        .select("id, title, company, location, salary, description, url, platform")
        .eq("user_id", user_id)
        .in("id", job_ids)
        .limit(limit);
    }

    const { data: jobs, error: fetchError } = await query;
    if (fetchError) throw fetchError;
    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No jobs to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${jobs.length} jobs for structured extraction`);
    let processed = 0;
    let failed = 0;

    // Process in mini-batches of 5 to avoid rate limits
    for (let i = 0; i < jobs.length; i += 5) {
      const batch = jobs.slice(i, i + 5);

      const promises = batch.map(async (job) => {
        try {
          // Truncate description to prevent token overflow
          const desc = (job.description || "").slice(0, 6000);
          const jobData = JSON.stringify({
            title: job.title,
            company: job.company,
            location: job.location,
            salary: job.salary,
            description: desc,
            url: job.url,
            platform: job.platform,
          });

          const response = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "system",
                    content: `You are a job data extraction AI. Extract structured fields from job posting data. Use UK English spelling. Be concise and accurate. If information is not available, use null.`,
                  },
                  {
                    role: "user",
                    content: `Extract structured data from this job posting:\n\n${jobData}`,
                  },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "extract_job_data",
                      description: "Extract structured job posting data",
                      parameters: {
                        type: "object",
                        properties: {
                          category: {
                            type: "string",
                            enum: [...CATEGORIES],
                            description: "High-level function of the role",
                          },
                          employment_type: {
                            type: "string",
                            enum: ["Full Time", "Part Time", "Contract", "Internship", "Temporary"],
                            description: "Employment commitment type",
                          },
                          workplace_type: {
                            type: "string",
                            enum: ["Remote", "Onsite", "Hybrid"],
                            description: "Remote/Onsite/Hybrid",
                          },
                          skills: {
                            type: "array",
                            items: { type: "string" },
                            description: "Top 10 normalised tools/skills mentioned",
                          },
                          experience_min_years: {
                            type: "number",
                            description: "Minimum years of experience if stated, null otherwise",
                          },
                          salary_min: {
                            type: "number",
                            description: "Low end of salary range if stated",
                          },
                          salary_max: {
                            type: "number",
                            description: "High end of salary range if stated",
                          },
                          salary_currency: {
                            type: "string",
                            description: "ISO 4217 code e.g. USD, GBP, EUR",
                          },
                          salary_frequency: {
                            type: "string",
                            enum: ["Yearly", "Monthly", "Weekly", "Daily", "Hourly"],
                            description: "Pay period",
                          },
                          requirements_summary: {
                            type: "string",
                            description: "≤200 char summary of key requirements",
                          },
                          source_name: {
                            type: "string",
                            description: "ATS/board name e.g. Greenhouse, Workday, LinkedIn",
                          },
                          employer_type: {
                            type: "string",
                            enum: ["Internal", "External"],
                            description: "Internal recruiter vs agency",
                          },
                        },
                        required: ["category", "employment_type", "workplace_type", "skills"],
                        additionalProperties: false,
                      },
                    },
                  },
                ],
                tool_choice: { type: "function", function: { name: "extract_job_data" } },
                temperature: 0,
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text();
            console.error(`AI error for job ${job.id}:`, response.status, errText);
            return null;
          }

          const aiData = await response.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall) {
            console.error(`No tool call for job ${job.id}`);
            return null;
          }

          const extracted = JSON.parse(toolCall.function.arguments);

          // Update the job with extracted data
          const updateData: Record<string, any> = {
            ai_extracted: true,
            category: extracted.category || null,
            employment_type: extracted.employment_type || "Full Time",
            workplace_type: extracted.workplace_type || "Onsite",
            skills: extracted.skills || [],
            requirements_summary: extracted.requirements_summary || null,
            source_name: extracted.source_name || job.platform || null,
            employer_type: extracted.employer_type || null,
          };

          if (extracted.experience_min_years != null) {
            updateData.experience_min_years = extracted.experience_min_years;
          }
          if (extracted.salary_min != null) {
            updateData.salary_min = extracted.salary_min;
          }
          if (extracted.salary_max != null) {
            updateData.salary_max = extracted.salary_max;
          }
          if (extracted.salary_currency) {
            updateData.salary_currency = extracted.salary_currency;
          }
          if (extracted.salary_frequency) {
            updateData.salary_frequency = extracted.salary_frequency;
          }

          const { error: updateError } = await supabase
            .from("jobs")
            .update(updateData)
            .eq("id", job.id)
            .eq("user_id", user_id);

          if (updateError) {
            console.error(`Update error for job ${job.id}:`, updateError);
            return null;
          }

          return job.id;
        } catch (e) {
          console.error(`Error processing job ${job.id}:`, e);
          return null;
        }
      });

      const results = await Promise.all(promises);
      processed += results.filter(Boolean).length;
      failed += results.filter((r) => r === null).length;

      // Small delay between batches to avoid rate limiting
      if (i + 5 < jobs.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log(`Extraction complete: ${processed} processed, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        total: jobs.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-job-structured error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
