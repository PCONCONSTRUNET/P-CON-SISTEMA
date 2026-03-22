import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    console.log("BTZap Webhook received:", JSON.stringify(payload, null, 2));

    // BTZap pode enviar diferentes eventos de status
    // Estrutura comum: { event: "message_status", data: { id: "...", status: "delivered/read/failed" } }
    const event = payload.event || payload.type;
    const data = payload.data || payload.message || payload;

    // Extrair informações relevantes
    const messageId = data?.key?.id || data?.id || data?.messageId;
    const status = data?.status || data?.ack || event;
    const remoteJid = data?.key?.remoteJid || data?.remoteJid;

    console.log(`Processing webhook - Event: ${event}, MessageId: ${messageId}, Status: ${status}`);

    if (!messageId) {
      console.log("No message ID found in webhook payload");
      return new Response(
        JSON.stringify({ success: true, message: "No message ID to process" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mapear status do BTZap para nosso formato
    let mappedStatus = "sent";
    if (status === "DELIVERY_ACK" || status === "delivered" || status === 2 || status === "2") {
      mappedStatus = "delivered";
    } else if (status === "READ" || status === "read" || status === 3 || status === "3") {
      mappedStatus = "read";
    } else if (status === "PLAYED" || status === 4 || status === "4") {
      mappedStatus = "played";
    } else if (status === "FAILED" || status === "failed" || status === "error") {
      mappedStatus = "failed";
    } else if (status === "PENDING" || status === "pending" || status === 0 || status === "0") {
      mappedStatus = "pending";
    } else if (status === "SERVER_ACK" || status === 1 || status === "1") {
      mappedStatus = "sent";
    }

    // Atualizar status da mensagem no banco
    const { data: updateResult, error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        status: mappedStatus,
        status_updated_at: new Date().toISOString(),
      })
      .eq("btzap_message_id", messageId);

    if (updateError) {
      console.error("Error updating message status:", updateError);
    } else {
      console.log(`Message ${messageId} status updated to: ${mappedStatus}`);
    }

    return new Response(
      JSON.stringify({ success: true, status: mappedStatus }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error processing BTZap webhook:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
