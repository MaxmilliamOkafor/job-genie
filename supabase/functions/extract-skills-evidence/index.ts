/**
 * extract-skills-evidence
 *
 * Sends a job description to the model under the fixed specification in
 * prompt.ts and returns the reply unchanged. It decides nothing: validation runs
 * in the extension, against the posting that side holds.
 *
 * The posting travels as its own JSON user message and is never concatenated
 * into the instructions.
 *
 * On failure only the status is reported. The upstream body and the request
 * headers can both carry the credential, so neither is ever echoed. With the
 * secret unset the answer is 503 naming the missing credential, never an empty
 * skills list: an empty list reads as a posting with no skills in it.
 *
 * No score, match percentage or ATS verdict is added to the output.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { EXTRACTION_SPEC } from "./prompt.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json(
      {
        error: "Skill extraction is unavailable: the OPENAI_API_KEY function secret is not set.",
        reason: "missing_credential",
        credential: "OPENAI_API_KEY",
      },
      503,
    );
  }

  let jobDescription = "";
  try {
    const body = await req.json();
    jobDescription = typeof body?.jobDescription === "string" ? body.jobDescription : "";
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  if (jobDescription.trim().length < 40) {
    return json({ error: "jobDescription is required and must be a real posting" }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_SPEC },
          // The posting stays a separate message, as untrusted data.
          { role: "user", content: JSON.stringify({ untrusted_job_posting: jobDescription.slice(0, 20_000) }) },
        ],
      }),
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = (error as Error)?.name === "AbortError";
    return json(
      { error: aborted ? "Skill extraction timed out" : "Skill extraction could not reach the model" },
      aborted ? 504 : 502,
    );
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    // Status only. The upstream body and our request headers can carry the key.
    console.error(`[extract-skills-evidence] upstream status ${upstream.status}`);
    return json({ error: "Skill extraction failed upstream", status: upstream.status }, upstream.status === 429 ? 429 : 502);
  }

  let reply = "";
  try {
    const data = await upstream.json();
    reply = data?.choices?.[0]?.message?.content ?? "";
  } catch {
    return json({ error: "Skill extraction returned an unreadable reply" }, 502);
  }
  if (!reply.trim()) return json({ error: "Skill extraction returned nothing" }, 502);

  // The reply is returned unchanged: nothing here decides, scores or verdicts.
  return new Response(reply, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
