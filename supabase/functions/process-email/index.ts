import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmailRequest {
  type: "send_application" | "send_referral" | "detect_responses";
  userId: string;
  applicationId?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  accessToken?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, userId, applicationId, recipient, subject, body, accessToken } = await req.json() as SendEmailRequest;

    console.log(`Processing email request: ${type} for user ${userId}`);

    if (type === "send_application" || type === "send_referral") {
      if (!recipient || !subject || !body || !accessToken) {
        throw new Error("Missing required fields for sending email");
      }

      // Send email via Gmail API
      const emailContent = [
        `To: ${recipient}`,
        `Subject: ${subject}`,
        `Content-Type: text/html; charset=utf-8`,
        "",
        body
      ].join("\r\n");

      const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const gmailResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedEmail }),
        }
      );

      if (!gmailResponse.ok) {
        const errorData = await gmailResponse.text();
        console.error("Gmail API error:", errorData);
        throw new Error(`Failed to send email: ${gmailResponse.status}`);
      }

      const gmailResult = await gmailResponse.json();
      console.log("Email sent successfully:", gmailResult.id);

      // Record the sent email
      await supabase.from("sent_emails").insert({
        user_id: userId,
        application_id: applicationId,
        email_type: type === "send_application" ? "application" : "referral",
        recipient,
        subject,
        body,
        delivered: true,
      });

      // Update application status if applicable
      if (applicationId) {
        await supabase
          .from("applications")
          .update({ email_sent: true, email_sent_at: new Date().toISOString() })
          .eq("id", applicationId);
      }

      return new Response(
        JSON.stringify({ success: true, messageId: gmailResult.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "detect_responses") {
      if (!accessToken) {
        throw new Error("Access token required for detecting responses");
      }

      // Fetch recent emails from Gmail
      const listResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=is:inbox newer_than:7d",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        throw new Error("Failed to fetch emails");
      }

      const listData = await listResponse.json();
      const messages = listData.messages || [];
      const detections: any[] = [];

      for (const msg of messages.slice(0, 20)) {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgResponse.ok) continue;

        const msgData = await msgResponse.json();
        const headers = msgData.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "";
        const from = headers.find((h: any) => h.name === "From")?.value || "";
        
        // Get body
        let body = "";
        if (msgData.payload?.body?.data) {
          body = atob(msgData.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        } else if (msgData.payload?.parts) {
          const textPart = msgData.payload.parts.find((p: any) => p.mimeType === "text/plain");
          if (textPart?.body?.data) {
            body = atob(textPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
        }

        // Detect email type using keywords
        const lowerSubject = subject.toLowerCase();
        const lowerBody = body.toLowerCase();
        
        let detectionType: string | null = null;
        
        if (lowerSubject.includes("interview") || lowerSubject.includes("schedule") || 
            lowerBody.includes("interview") && lowerBody.includes("schedule")) {
          detectionType = "interview";
        } else if (lowerSubject.includes("unfortunately") || lowerSubject.includes("not moving forward") ||
                   lowerBody.includes("unfortunately") || lowerBody.includes("not be moving forward")) {
          detectionType = "rejection";
        } else if (lowerSubject.includes("offer") || lowerSubject.includes("congratulations") ||
                   lowerBody.includes("pleased to offer") || lowerBody.includes("job offer")) {
          detectionType = "offer";
        }

        if (detectionType) {
          // Check if already detected
          const { data: existing } = await supabase
            .from("email_detections")
            .select("id")
            .eq("user_id", userId)
            .eq("email_subject", subject)
            .eq("email_from", from)
            .maybeSingle();

          if (!existing) {
            const { data: detection, error } = await supabase.from("email_detections").insert({
              user_id: userId,
              email_subject: subject,
              email_from: from,
              email_body: body.substring(0, 1000),
              detection_type: detectionType,
            }).select().single();

            if (!error && detection) {
              detections.push(detection);
            }
          }
        }
      }

      console.log(`Detected ${detections.length} new response emails`);

      return new Response(
        JSON.stringify({ success: true, detections }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown request type: ${type}`);

  } catch (error) {
    console.error("Error in process-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
