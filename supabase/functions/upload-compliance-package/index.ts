import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface UploadRequest {
  destination_id: string;
  project_id: string;
  file_name: string;
  file_base64: string;
  file_size_bytes: number;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: UploadRequest = await req.json();

    // Get destination config
    const { data: destination, error: destError } = await supabase
      .from("export_destinations")
      .select("*")
      .eq("id", body.destination_id)
      .single();

    if (destError || !destination) {
      return new Response(JSON.stringify({ error: "Destination not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create upload log entry
    const { data: logEntry, error: logError } = await supabase
      .from("export_upload_log")
      .insert({
        destination_id: body.destination_id,
        project_id: body.project_id,
        uploaded_by: user.id,
        file_name: body.file_name,
        file_size_bytes: body.file_size_bytes,
        status: "uploading",
      })
      .select()
      .single();

    if (logError) {
      console.error("Failed to create upload log:", logError);
    }

    // Convert base64 to binary
    const binaryStr = atob(body.file_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    let uploadResult: { success: boolean; message: string; response_data?: Record<string, unknown> };

    const config = destination.config as Record<string, string>;

    switch (destination.platform) {
      case "sharepoint":
        uploadResult = await uploadToSharePoint(config, bytes, body.file_name);
        break;
      case "google_drive":
        uploadResult = await uploadToGoogleDrive(config, bytes, body.file_name);
        break;
      case "webhook":
        uploadResult = await uploadToWebhook(config, bytes, body.file_name);
        break;
      default:
        uploadResult = { success: false, message: `Unsupported platform: ${destination.platform}` };
    }

    // Update upload log
    if (logEntry) {
      await supabase
        .from("export_upload_log")
        .update({
          status: uploadResult.success ? "success" : "failed",
          error_message: uploadResult.success ? null : uploadResult.message,
          response_data: uploadResult.response_data || null,
        })
        .eq("id", logEntry.id);
    }

    // Update destination last upload info
    await supabase
      .from("export_destinations")
      .update({
        last_upload_at: new Date().toISOString(),
        last_upload_status: uploadResult.success ? "success" : "failed",
      })
      .eq("id", body.destination_id);

    return new Response(
      JSON.stringify(uploadResult),
      {
        status: uploadResult.success ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Upload error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ---- Platform-specific upload handlers ----

async function uploadToSharePoint(
  config: Record<string, string>,
  fileBytes: Uint8Array,
  fileName: string
): Promise<{ success: boolean; message: string; response_data?: Record<string, unknown> }> {
  const { tenant_id, client_id, client_secret, site_id, drive_id, folder_path } = config;

  if (!tenant_id || !client_id || !client_secret) {
    return { success: false, message: "SharePoint credentials not configured (tenant_id, client_id, client_secret required)" };
  }

  try {
    // Get access token via client credentials flow
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id,
        client_secret,
        scope: "https://graph.microsoft.com/.default",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return { success: false, message: `SharePoint auth failed: ${tokenData.error_description || tokenData.error}` };
    }

    const accessToken = tokenData.access_token;
    const targetPath = folder_path ? `${folder_path.replace(/\/$/, '')}/${fileName}` : fileName;

    // Upload via Microsoft Graph API
    let uploadUrl: string;
    if (site_id && drive_id) {
      uploadUrl = `https://graph.microsoft.com/v1.0/sites/${site_id}/drives/${drive_id}/root:/${targetPath}:/content`;
    } else if (site_id) {
      uploadUrl = `https://graph.microsoft.com/v1.0/sites/${site_id}/drive/root:/${targetPath}:/content`;
    } else {
      return { success: false, message: "SharePoint site_id is required" };
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/zip",
      },
      body: fileBytes,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      return { success: false, message: `SharePoint upload failed [${uploadRes.status}]: ${JSON.stringify(uploadData)}` };
    }

    return {
      success: true,
      message: `Uploaded to SharePoint: ${uploadData.webUrl || targetPath}`,
      response_data: { webUrl: uploadData.webUrl, id: uploadData.id, name: uploadData.name },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown SharePoint error";
    return { success: false, message: msg };
  }
}

async function uploadToGoogleDrive(
  config: Record<string, string>,
  fileBytes: Uint8Array,
  fileName: string
): Promise<{ success: boolean; message: string; response_data?: Record<string, unknown> }> {
  const { access_token, refresh_token, client_id, client_secret, folder_id } = config;

  let currentToken = access_token;

  // If we have a refresh token, try to refresh first
  if (refresh_token && client_id && client_secret) {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          client_id,
          client_secret,
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenRes.ok && tokenData.access_token) {
        currentToken = tokenData.access_token;
      }
    } catch {
      // Fall back to existing access_token
    }
  }

  if (!currentToken) {
    return { success: false, message: "Google Drive access token not configured" };
  }

  try {
    // Multipart upload to Google Drive
    const metadata: Record<string, unknown> = {
      name: fileName,
      mimeType: "application/zip",
    };
    if (folder_id) {
      metadata.parents = [folder_id];
    }

    const boundary = "compliance_package_boundary";
    const metadataJson = JSON.stringify(metadata);

    // Build multipart body manually
    const encoder = new TextEncoder();
    const parts = [
      encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n`
      ),
      encoder.encode(`--${boundary}\r\nContent-Type: application/zip\r\n\r\n`),
      fileBytes,
      encoder.encode(`\r\n--${boundary}--`),
    ];

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const bodyBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      bodyBytes.set(part, offset);
      offset += part.length;
    }

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: bodyBytes,
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      return { success: false, message: `Google Drive upload failed [${uploadRes.status}]: ${JSON.stringify(uploadData)}` };
    }

    return {
      success: true,
      message: `Uploaded to Google Drive: ${uploadData.name}`,
      response_data: { fileId: uploadData.id, name: uploadData.name, webViewLink: uploadData.webViewLink },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown Google Drive error";
    return { success: false, message: msg };
  }
}

async function uploadToWebhook(
  config: Record<string, string>,
  fileBytes: Uint8Array,
  fileName: string
): Promise<{ success: boolean; message: string; response_data?: Record<string, unknown> }> {
  const { url, auth_header, auth_value, method } = config;

  if (!url) {
    return { success: false, message: "Webhook URL not configured" };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    };

    if (auth_header && auth_value) {
      headers[auth_header] = auth_value;
    }

    const res = await fetch(url, {
      method: method || "POST",
      headers,
      body: fileBytes,
    });

    const responseText = await res.text();
    let responseData: Record<string, unknown> = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText.substring(0, 500) };
    }

    if (!res.ok) {
      return { success: false, message: `Webhook returned ${res.status}: ${responseText.substring(0, 200)}`, response_data: responseData };
    }

    return {
      success: true,
      message: `Successfully uploaded to webhook (${res.status})`,
      response_data: responseData,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown webhook error";
    return { success: false, message: msg };
  }
}
