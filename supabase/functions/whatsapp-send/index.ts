import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMessageRequest {
  phone: string;
  message: string;
  clientId: string;
  type: string;
  sendImage?: boolean;
  imageUrl?: string;
  sendButton?: boolean;
  buttonText?: string;
  buttonUrl?: string;
}

 // Default promo image URL - hosted on Supabase Storage
 const DEFAULT_IMAGE_URL = "https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg";
 
// UAZAPI base URL (token identifies the instance via header)
const UAZAPI_BASE_URL = "https://btzap.uazapi.com";

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiToken = Deno.env.get("BTZAP_API_KEY");

    if (!apiToken) {
      console.error("UAZAPI token not configured");
      return new Response(
        JSON.stringify({ success: false, error: "UAZAPI não configurado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

     const { phone, message, clientId, type, sendImage = true, imageUrl, sendButton = true, buttonText, buttonUrl }: SendMessageRequest = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Telefone e mensagem são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Format phone number (remove non-digits and ensure country code)
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("55")) {
      formattedPhone = "55" + formattedPhone;
    }

     console.log(`Sending WhatsApp message to ${formattedPhone}, sendImage: ${sendImage}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let result;
    let messageId = null;
    let messageStatus = "failed";

    // UAZAPI auth header
    const uazapiAuthHeaders = {
      token: apiToken,
    };

     // If sendImage is true, send image first, then button
     if (sendImage && sendButton) {
       // Add cache-busting parameter to ensure fresh image
       const finalImageUrl = `${imageUrl || DEFAULT_IMAGE_URL}?v=${Date.now()}`;
       console.log(`Sending image + text + button sequence`);

       // Step 1: Send image with text as caption
       const mediaPayload = {
         number: formattedPhone,
         type: "image",
         file: finalImageUrl,
         text: message,
       };

       console.log("Media payload:", JSON.stringify(mediaPayload));

       const mediaResponse = await fetch(`${UAZAPI_BASE_URL}/send/media`, {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           ...uazapiAuthHeaders,
         },
         body: JSON.stringify(mediaPayload),
       });

       console.log(`UAZAPI media response status: ${mediaResponse.status}`);
       const mediaResponseText = await mediaResponse.text();
       console.log("UAZAPI media raw response:", mediaResponseText);

       try {
         result = JSON.parse(mediaResponseText);
       } catch {
         result = { raw: mediaResponseText };
       }

       let imageSent = false;
       if (mediaResponse.ok && (result?.key || result?.messageid || result?.chatid)) {
         messageId = result?.key?.id || result?.messageid || result?.messageId || null;
         imageSent = true;
         console.log("Image with caption sent successfully");

         // Step 2: Send button after image
          const finalButtonText = buttonText || "Acessar Área do Cliente";
          const finalButtonUrl = buttonUrl || "https://www.assinaturaspcon.sbs/cliente";
          const menuPayload = {
            number: formattedPhone,
            type: "button",
            text: "📱 Acesse sua área do cliente:",
            choices: [`${finalButtonText} | ${finalButtonUrl}`],
          };

         console.log("Menu payload:", JSON.stringify(menuPayload));

         const menuResponse = await fetch(`${UAZAPI_BASE_URL}/send/menu`, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             ...uazapiAuthHeaders,
           },
           body: JSON.stringify(menuPayload),
         });

         console.log(`UAZAPI menu response status: ${menuResponse.status}`);
         const menuResponseText = await menuResponse.text();
         console.log("UAZAPI menu raw response:", menuResponseText);

         try {
           const menuResult = JSON.parse(menuResponseText);
           if (menuResponse.ok && (menuResult?.key || menuResult?.messageid || menuResult?.chatid)) {
             console.log("Button sent successfully after image");
           } else {
             console.log("Button send failed, but image was sent");
           }
         } catch {
           console.log("Failed to parse menu response, but image was sent");
         }

         messageStatus = "sent";
       } else {
         console.log("Image send failed");
         messageStatus = "failed";
       }
     } else if (sendImage) {
       // Send media without button using UAZAPI /send/media endpoint
       const finalImageUrl = `${imageUrl || DEFAULT_IMAGE_URL}?v=${Date.now()}`;
       console.log(`Sending media via /send/media endpoint: ${finalImageUrl}`);

       const mediaPayload = {
         number: formattedPhone,
         type: "image",
         file: finalImageUrl,
         text: message,
       };

       console.log("Media payload:", JSON.stringify(mediaPayload));

       const mediaResponse = await fetch(`${UAZAPI_BASE_URL}/send/media`, {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           ...uazapiAuthHeaders,
         },
         body: JSON.stringify(mediaPayload),
       });
  
       console.log(`UAZAPI media response status: ${mediaResponse.status}`);
       const mediaResponseText = await mediaResponse.text();
       console.log("UAZAPI media raw response:", mediaResponseText);
  
       try {
         result = JSON.parse(mediaResponseText);
       } catch {
         result = { raw: mediaResponseText };
       }
  
       if (mediaResponse.ok && (result?.key || result?.messageid || result?.chatid)) {
         messageId = result?.key?.id || result?.messageid || result?.messageId || null;
         messageStatus = "sent";
         console.log("Media sent successfully via /send/media");
       } else {
         console.log("Media endpoint failed, sending text-only message as fallback");
         
         const textResponse = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             ...uazapiAuthHeaders,
           },
           body: JSON.stringify({
             number: formattedPhone,
             text: message,
           }),
         });
  
         const textResponseText = await textResponse.text();
         console.log("UAZAPI text fallback response:", textResponseText);
  
         try {
           result = JSON.parse(textResponseText);
         } catch {
           result = { raw: textResponseText };
         }
  
         messageId = result?.key?.id || result?.messageid || result?.messageId || null;
         messageStatus = textResponse.ok && (result?.chatid || result?.key) ? "sent" : "failed";
       }
     } else {
       // Send text-only message using UAZAPI /send/text endpoint
       const response = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           ...uazapiAuthHeaders,
         },
         body: JSON.stringify({
           number: formattedPhone,
           text: message,
         }),
       });
  
       console.log(`UAZAPI text response status: ${response.status}`);
  
       const responseText = await response.text();
       console.log("UAZAPI text raw response:", responseText);
  
       try {
         result = JSON.parse(responseText);
       } catch {
         console.error("Failed to parse UAZAPI response as JSON:", responseText);
         if (!response.ok) {
           return new Response(
             JSON.stringify({ success: false, error: "Erro ao enviar mensagem via UAZAPI" }),
             { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
           );
         }
         result = { raw: responseText };
       }
  
       messageId = result?.key?.id || result?.messageId || null;
       messageStatus = response.ok && (result?.status === "success" || result?.key) ? "sent" : "failed";
     }

    console.log("UAZAPI response:", result);

    // Save to whatsapp_messages table for tracking
    await supabase.from("whatsapp_messages").insert({
      client_id: clientId || null,
      phone: formattedPhone,
      message: message,
      message_type: type || "manual",
      btzap_message_id: messageId,
      remote_jid: result?.key?.remoteJid || null,
      status: messageStatus,
    });

    // Create notification record
    if (clientId) {
      await supabase.from("notifications").insert({
        client_id: clientId,
        type: type === "overdue" ? "payment_overdue" : "payment_reminder",
        message: `Lembrete manual enviado via WhatsApp`,
        status: "sent",
      });
    }

    return new Response(
      JSON.stringify({ success: messageStatus === "sent", data: result }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in whatsapp-send function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
