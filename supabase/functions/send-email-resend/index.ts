import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  type: "application" | "referral" | "follow_up" | "test";
  userId: string;
  applicationId?: string;
  recipient: string;
  subject: string;
  body: string;
  fromName?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, userId, applicationId, recipient, subject, body, fromName } = await req.json() as SendEmailRequest;

    // Normalize email to lowercase to avoid case-sensitivity issues
    const normalizedRecipient = recipient.toLowerCase();

    console.log(`Sending ${type} email to ${normalizedRecipient} for user ${userId}`);

    if (!normalizedRecipient || !subject || !body) {
      throw new Error("Missing required fields: recipient, subject, body");
    }

    // Get user profile for sender name
    let senderName = fromName || "Job Application";
    if (!fromName) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", userId)
        .single();

      if (profile?.first_name) {
        senderName = `${profile.first_name} ${profile.last_name || ""}`.trim();
      }
    }

    // Send email via Resend API
    // Note: In production, you'll need to verify your domain at resend.com/domains
    // For testing, you can only send to your own verified email
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${senderName} <onboarding@resend.dev>`, // Use your verified domain in production
        to: [normalizedRecipient],
        subject: subject,
        html: body,
      }),
    });

    const emailResponse = await resendResponse.json();
    console.log("Email sent successfully:", emailResponse);

    if (!resendResponse.ok) {
      throw new Error(emailResponse.message || "Failed to send email");
    }

    // Record the sent email in database
    if (type !== "test") {
      const { error: dbError } = await supabase.from("sent_emails").insert({
        user_id: userId,
        application_id: applicationId || null,
        email_type: type === "application" ? "application" : type === "referral" ? "referral" : "follow_up",
        recipient: normalizedRecipient,
        subject,
        body,
        delivered: true,
        sent_at: new Date().toISOString(),
      });

      if (dbError) {
        console.error("Error recording sent email:", dbError);
      }

      // Update application status if applicable
      if (applicationId) {
        await supabase
          .from("applications")
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq("id", applicationId);
      }
    }

    return new Response(
      JSON.stringify({ success: true, messageId: emailResponse.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-email-resend:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
