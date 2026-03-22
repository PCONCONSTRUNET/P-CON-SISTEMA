import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// UAZAPI base URL (token identifies the instance via header)
const UAZAPI_BASE_URL = "https://btzap.uazapi.com";

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiToken = Deno.env.get("BTZAP_API_KEY");

    if (!apiToken) {
      return new Response(
        JSON.stringify({ success: false, error: "UAZAPI não configurado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();
    const action = body.action || "status";

    // Get the webhook URL for this project
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/btzap-webhook`;

    // Headers for UAZAPI - trying different token header names
    const uazapiHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "token": apiToken,
      "admintoken": apiToken,
    };

    if (action === "configure_webhook") {
      // Configure webhook in UAZAPI using GET with query params (UAZAPI pattern)
      console.log(`Configuring webhook URL: ${webhookUrl}`);
      
      const webhookParams = new URLSearchParams({
        url: webhookUrl,
        enabled: "true",
        webhookByEvents: "false",
        webhookBase64: "false",
      });
      
      const response = await fetch(`${UAZAPI_BASE_URL}/webhook/set?${webhookParams.toString()}`, {
        method: "GET",
        headers: uazapiHeaders,
      });

      const result = await response.text();
      console.log("UAZAPI set_webhook response:", result);

      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { raw: result };
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "configure_webhook",
          webhook_url: webhookUrl,
          uazapi_response: parsedResult 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "get_qrcode") {
      // Get QR code for connection
      console.log("Getting QR code...");
      
      const response = await fetch(`${UAZAPI_BASE_URL}/instance/qrcode`, {
        method: "GET",
        headers: uazapiHeaders,
      });

      const result = await response.text();
      console.log("UAZAPI get_qrcode response:", result);

      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { raw: result };
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "get_qrcode",
          uazapi_response: parsedResult 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "reconnect") {
      // Reconnect instance
      console.log("Reconnecting instance...");
      
      const response = await fetch(`${UAZAPI_BASE_URL}/instance/reconnect`, {
        method: "POST",
        headers: uazapiHeaders,
      });

      const result = await response.text();
      console.log("UAZAPI reconnect response:", result);

      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { raw: result };
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "reconnect",
          uazapi_response: parsedResult 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "get_status") {
      // Get instance status
      console.log("Getting instance status...");
      
      const response = await fetch(`${UAZAPI_BASE_URL}/instance/status`, {
        method: "GET",
        headers: uazapiHeaders,
      });

      const result = await response.text();
      console.log("UAZAPI status response:", result);

      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { raw: result };
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "get_status",
          uazapi_response: parsedResult 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "test_send") {
      // Test sending a simple message
      const testPhone = body.phone;
      if (!testPhone) {
        return new Response(
          JSON.stringify({ success: false, error: "Phone number required for test" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      let formattedPhone = testPhone.replace(/\D/g, "");
      if (!formattedPhone.startsWith("55")) {
        formattedPhone = "55" + formattedPhone;
      }

      console.log(`Testing send to: ${formattedPhone}`);

      const response = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
        method: "POST",
        headers: uazapiHeaders,
        body: JSON.stringify({
          number: formattedPhone,
          text: "Teste de conexao UAZAPI - P-CON",
        }),
      });

      const result = await response.text();
      console.log("UAZAPI test send response:", result);

      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { raw: result };
      }

      return new Response(
        JSON.stringify({ 
          success: response.ok, 
          action: "test_send",
          phone: formattedPhone,
          uazapi_response: parsedResult 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "debug") {
      // Debug action to verify token is being read correctly
      const tokenPreview = apiToken ? `${apiToken.substring(0, 8)}...${apiToken.substring(apiToken.length - 4)}` : "NOT SET";
      return new Response(
        JSON.stringify({ 
          success: true,
          action: "debug",
          token_preview: tokenPreview,
          token_length: apiToken?.length || 0,
          base_url: UAZAPI_BASE_URL,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Default: return current configuration
    return new Response(
      JSON.stringify({ 
        success: true,
        action: "status",
        webhook_url: webhookUrl,
        available_actions: ["configure_webhook", "get_qrcode", "reconnect", "get_status", "test_send", "debug"]
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in btzap-setup:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
