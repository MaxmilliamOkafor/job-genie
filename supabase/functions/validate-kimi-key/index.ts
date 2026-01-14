import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKey } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ valid: false, error: "No API key provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test Kimi K2 API key by fetching available models
    // Note: The correct endpoint is api.moonshot.ai (not .cn)
    const response = await fetch("https://api.moonshot.ai/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const models = data?.data || [];
      const hasK2Model = models.some((m: any) => 
        m.id?.includes('moonshot-v1') || m.id?.includes('kimi')
      );
      
      return new Response(
        JSON.stringify({ 
          valid: true, 
          message: "Kimi K2 API key is valid!",
          hasK2Model,
          availableModels: models.map((m: any) => m.id).slice(0, 5)
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response.status === 401) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid API key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errorText = await response.text();
    console.error("Kimi API error:", response.status, errorText);
    
    return new Response(
      JSON.stringify({ valid: false, error: `API error: ${response.status}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Kimi key validation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Validation failed";
    return new Response(
      JSON.stringify({ valid: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
