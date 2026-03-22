import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface WhatsAppMessage {
  id: string;
  client_id: string | null;
  phone: string;
  message: string;
  message_type: string;
  btzap_message_id: string | null;
  remote_jid: string | null;
  status: string;
  status_updated_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  clients?: {
    name: string;
  } | null;
}

export const useWhatsAppMessages = (clientId?: string) => {
  return useQuery({
    queryKey: ["whatsapp-messages", clientId],
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_messages")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching WhatsApp messages:", error);
        throw error;
      }

      return data as WhatsAppMessage[];
    },
  });
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: "Pendente",
    sent: "Enviado",
    delivered: "Entregue",
    read: "Lido",
    played: "Reproduzido",
    failed: "Falhou",
  };
  return labels[status] || status;
};

export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500",
    sent: "bg-blue-500",
    delivered: "bg-green-500",
    read: "bg-emerald-600",
    played: "bg-emerald-700",
    failed: "bg-red-500",
  };
  return colors[status] || "bg-gray-500";
};
