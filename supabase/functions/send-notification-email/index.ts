import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationEmailRequest {
  notification_id: string;
  to_email: string;
  to_name?: string;
  subject: string;
  notification_type: string;
  title: string;
  message: string;
  priority: string;
  action_url?: string;
  action_label?: string;
  project_name?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured — skipping email send");
      return new Response(
        JSON.stringify({ success: false, reason: "Email service not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);
    const body: NotificationEmailRequest = await req.json();

    const priorityColors: Record<string, string> = {
      urgent: "#ef4444",
      high: "#f97316",
      normal: "#6b7280",
      low: "#9ca3af",
    };

    const typeIcons: Record<string, string> = {
      deadline_reminder: "⏰",
      status_change: "🔄",
      escalation: "🚨",
      milestone_alert: "🎯",
      approval_needed: "✅",
    };

    const priorityColor = priorityColors[body.priority] || "#6b7280";
    const typeIcon = typeIcons[body.notification_type] || "📋";

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="background:#1a1a2e;padding:24px 32px;">
            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:600;">EndGard</h1>
          </div>
          <div style="padding:32px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
              <span style="font-size:24px;">${typeIcon}</span>
              <span style="display:inline-block;padding:2px 8px;border-radius:12px;background:${priorityColor}20;color:${priorityColor};font-size:12px;font-weight:600;text-transform:uppercase;">${body.priority}</span>
            </div>
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a2e;">${body.title}</h2>
            ${body.project_name ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Project: ${body.project_name}</p>` : ""}
            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${body.message}</p>
            ${body.action_url ? `
              <a href="${body.action_url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">
                ${body.action_label || "View Details"}
              </a>
            ` : ""}
          </div>
          <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              You received this because of your notification preferences in EndGard. 
              <a href="${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "") || ""}" style="color:#4f46e5;">Manage preferences</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResult = await resend.emails.send({
      from: "EndGard <notifications@endgard.com>",
      to: [body.to_email],
      subject: `${typeIcon} ${body.subject}`,
      html,
    });

    console.log("Notification email sent:", emailResult);

    // Update the notification record to mark email as sent
    if (body.notification_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("workflow_notifications")
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", body.notification_id);
    }

    return new Response(
      JSON.stringify({ success: true, email_id: emailResult?.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending notification email:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
