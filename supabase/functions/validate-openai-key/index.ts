import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKey } = await req.json();

    if (!apiKey || typeof apiKey !== 'string') {
      return new Response(JSON.stringify({ 
        valid: false, 
        error: "API key is required" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test the API key by making a minimal request to OpenAI
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const data = await response.json();

      // Check if gpt-4o-mini is available
      const hasGpt4oMini = data.data?.some((model: any) => model.id === 'gpt-4o-mini');

      // Listing models only proves the key can read. Make one real request so the
      // test proves the key can actually generate.
      const genResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ok" }],
          max_tokens: 1,
        }),
      });

      if (genResponse.ok) {
        return new Response(JSON.stringify({
          valid: true,
          message: "API key works: gpt-4o-mini answered.",
          hasGpt4oMini,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const genBody = await genResponse.text();
      const snippet = genBody.slice(0, 200);
      console.error("OpenAI generation check failed:", genResponse.status, genBody);

      const rejected = (error: string) => new Response(JSON.stringify({
        valid: false,
        error,
      }), {
        status: 200, // Return 200 so frontend can handle the error gracefully
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      if (genResponse.status === 429 && /insufficient_quota/i.test(genBody)) {
        return rejected("This key is valid but its organisation or project has no quota. If your OpenAI billing page shows credit, this key was created in a different organisation or project, or a monthly usage limit is reached. Create a new key in the organisation that holds the credit and paste it here.");
      }

      if (genResponse.status === 403) {
        return rejected(`This key cannot use gpt-4o-mini (403). Its project may restrict models or permissions. Create a key with All permissions in the default project. ${snippet}`);
      }

      if (genResponse.status === 404 && /model_not_found/i.test(genBody)) {
        return rejected("This key's project has no access to gpt-4o-mini.");
      }

      return rejected(`OpenAI returned ${genResponse.status} when asked to generate: ${snippet}`);
    } else {
      const errorData = await response.text();
      console.error("OpenAI API validation failed:", response.status, errorData);
      
      let errorMessage = "Invalid API key";
      if (response.status === 401) {
        errorMessage = "Invalid API key. Please check and try again.";
      } else if (response.status === 429) {
        errorMessage = "Rate limit exceeded. The key is valid but hitting limits.";
      } else if (response.status === 403) {
        errorMessage = "Access denied. Check your OpenAI account permissions.";
      }
      
      return new Response(JSON.stringify({ 
        valid: false, 
        error: errorMessage 
      }), {
        status: 200, // Return 200 so frontend can handle the error gracefully
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Validation error:", error);
    return new Response(JSON.stringify({ 
      valid: false, 
      error: error instanceof Error ? error.message : "Validation failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
