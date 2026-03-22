import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SendReminderParams {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  type: 'subscription' | 'payment' | 'overdue';
  amount: number;
  description?: string;
  dueDate?: string | null;
}

// Resolve the correct template key based on type and due date
const resolveTemplateKey = (type: string, dueDate?: string | null): string => {
  if (type === 'overdue') return 'subscription_reminder'; // fallback

  // If we have a due date, check if it's today or tomorrow to pick the right template
  if (dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    // Compare only dates (ignore time)
    const todayStr = now.toISOString().slice(0, 10);
    const dueStr = due.toISOString().slice(0, 10);

    if (dueStr === todayStr) {
      return 'due_today';
    }
  }

  // For payment type, default to due_today
  if (type === 'payment') return 'due_today';

  // For subscription type without a due date or future date, use D-1
  return 'subscription_reminder';
};

// Fallback messages if no template found
const fallbackMessages: Record<string, (name: string, amount: string, desc?: string) => string> = {
  subscription: (name, amount, desc) =>
    `Ola ${name}! 💈\n\nPassando para lembrar que a fatura referente a sua assinatura ativa${desc ? ` do *${desc}*` : ''} no valor de *R$ ${amount}* vence amanha.\n\nAcesse a area do cliente: https://www.assinaturaspcon.sbs/cliente\n\nQualquer duvida, estamos a disposicao.`,
  payment: (name, amount, desc) =>
    `Ola ${name}! 💈\n\nA fatura referente a sua assinatura ativa no valor de *R$ ${amount}*${desc ? ` (*${desc}*)` : ''} esta pendente e vence amanha.\n\nAcesse a area do cliente: https://www.assinaturaspcon.sbs/cliente\n\nQualquer duvida, estamos a disposicao.`,
  overdue: (name, amount, desc) =>
    `Ola ${name}! 💈\n\n⚠️ A fatura referente a sua assinatura ativa de *R$ ${amount}*${desc ? ` (*${desc}*)` : ''} esta vencida.\n\nRegularize o pagamento para manter sua assinatura em dia.\n\nAcesse a area do cliente: https://www.assinaturaspcon.sbs/cliente\n\nEntre em contato se precisar de ajuda.`,
};

const replacePlaceholders = (template: string, clientName: string, formattedAmount: string, planName?: string) => {
  return template
    .replace(/\{\{client_name\}\}/g, clientName)
    .replace(/\{\{amount\}\}/g, `R$ ${formattedAmount}`)
    .replace(/\{\{plan_name\}\}/g, planName || 'Assinatura');
};

export const useWhatsAppReminder = () => {
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());

  const sendReminder = async (params: SendReminderParams): Promise<boolean> => {
    const { clientId, clientName, clientPhone, type, amount, description, dueDate } = params;

    if (!clientPhone) {
      toast.error('Cliente não possui telefone cadastrado');
      return false;
    }

    // Prevent duplicate requests for same client
    if (pendingRequests.has(clientId)) {
      console.warn(`Already sending reminder for client ${clientId}, ignoring duplicate request`);
      return false;
    }

    setSendingReminderId(clientId);
    setPendingRequests(prev => new Set(prev).add(clientId));

    try {
      const formattedAmount = amount.toFixed(2).replace('.', ',');

      // Resolve template key based on type and due date
      const templateKey = resolveTemplateKey(type, dueDate);
      const { data: templateData } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('template_key', templateKey)
        .eq('is_active', true)
        .maybeSingle();

      let message: string;
      let sendImage = true;
      let imageUrl: string | undefined;
      let sendButton = true;
      let buttonText: string | undefined;
      let buttonUrl: string | undefined;

      if (templateData) {
        // Use template from database
        message = replacePlaceholders(templateData.message_template, clientName, formattedAmount, description);
        imageUrl = templateData.image_url || undefined;
        sendImage = !!templateData.image_url;
        sendButton = templateData.button_enabled;
        buttonText = templateData.button_text || undefined;
        buttonUrl = templateData.button_url || undefined;
        console.log(`Using template "${templateData.name}" for type "${type}"`);
      } else {
        // Use fallback hardcoded message
        const fallback = fallbackMessages[type];
        message = fallback ? fallback(clientName, formattedAmount, description) : '';
        console.log(`No template found for key "${templateKey}", using fallback`);
      }

      // Format phone number
      let formattedPhone = clientPhone.replace(/\D/g, '');
      if (!formattedPhone.startsWith('55')) {
        formattedPhone = '55' + formattedPhone;
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: formattedPhone,
          message,
          clientId,
          type,
          sendImage,
          imageUrl,
          sendButton,
          buttonText,
          buttonUrl,
        },
      });

      if (error) {
        console.error('Error sending WhatsApp:', error);
        toast.error('Erro ao enviar mensagem de WhatsApp');
        return false;
      }

      if (data?.success) {
        toast.success('Mensagem enviada com sucesso!');
        return true;
      } else {
        toast.error(data?.error || 'Erro ao enviar mensagem');
        return false;
      }
    } catch (error) {
      console.error('Error sending WhatsApp reminder:', error);
      toast.error('Erro ao enviar lembrete');
      return false;
    } finally {
      setSendingReminderId(null);
      setPendingRequests(prev => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  };

  return {
    sendReminder,
    sendingReminderId,
    isSending: sendingReminderId !== null,
  };
};
