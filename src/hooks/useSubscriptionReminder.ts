/**
 * useSubscriptionReminder
 *
 * Hook para disparar WhatsApp + Email de lembrete para uma assinatura
 * quando o admin edita manualmente a data de vencimento.
 *
 * Lógica de detecção:
 *  - D-5 (exatamente 5 dias) → template "subscription_reminder" (WhatsApp) + email
 *  - D-0 (vence hoje)        → template "due_today" (WhatsApp) [sem email pois template é D-5]
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { differenceInCalendarDays } from 'date-fns';

interface SubscriptionReminderParams {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  planName: string;
  amount: number;
  /** ISO string da data de vencimento (next_payment) */
  nextPayment: string;
}

/** Retorna quantos dias faltam para a data (no fuso BRT) */
const getDaysUntilInBRT = (nextPayment: string): number => {
  // Pegar data atual em BRT (UTC-3)
  const nowUTC = new Date();
  const brtOffset = -3 * 60; // minutos
  const nowBRT = new Date(nowUTC.getTime() + (brtOffset - nowUTC.getTimezoneOffset()) * 60000);
  const todayBRT = new Date(nowBRT.getFullYear(), nowBRT.getMonth(), nowBRT.getDate());

  const paymentDate = new Date(nextPayment);
  const dueBRT = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());

  return differenceInCalendarDays(dueBRT, todayBRT);
};

export const useSubscriptionReminder = () => {
  const [isSending, setIsSending] = useState(false);

  /**
   * Determina se deve enviar lembrete com base na data de vencimento
   * e, se sim, envia WhatsApp + Email.
   *
   * @returns objeto com { shouldSend, daysLeft, whatsappSent, emailSent }
   */
  const sendReminderIfNeeded = async (
    params: SubscriptionReminderParams
  ): Promise<{ shouldSend: boolean; daysLeft: number; whatsappSent: boolean; emailSent: boolean }> => {
    const daysLeft = getDaysUntilInBRT(params.nextPayment);
    const isD5 = daysLeft === 5;
    const isD0 = daysLeft === 0;

    if (!isD5 && !isD0) {
      return { shouldSend: false, daysLeft, whatsappSent: false, emailSent: false };
    }

    setIsSending(true);

    let whatsappSent = false;
    let emailSent = false;
    const templateKey = isD0 ? 'due_today' : 'subscription_reminder';
    const messageType = isD0 ? 'manual_d0_edit' : 'manual_d5_edit';

    // ── WhatsApp ──────────────────────────────────────────────
    if (params.clientPhone) {
      try {
        const formattedAmount = params.amount.toFixed(2).replace('.', ',');

        // Buscar template do banco
        const { data: templateData } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .eq('template_key', templateKey)
          .eq('is_active', true)
          .maybeSingle();

        let message: string;
        let sendImage = false;
        let imageUrl: string | undefined;
        let sendButton = false;
        let buttonText: string | undefined;
        let buttonUrl: string | undefined;

        if (templateData) {
          message = (templateData.message_template as string)
            .replace(/\{\{client_name\}\}/g, params.clientName)
            .replace(/\{\{amount\}\}/g, `R$ ${formattedAmount}`)
            .replace(/\{\{plan_name\}\}/g, params.planName);
          imageUrl = templateData.image_url || undefined;
          sendImage = !!templateData.image_url;
          sendButton = templateData.button_enabled as boolean;
          buttonText = templateData.button_text || undefined;
          buttonUrl = templateData.button_url || undefined;
        } else {
          // Fallback caso template não exista
          if (isD0) {
            message = `Olá ${params.clientName}! 💈\n\n⚠️ *Atenção: sua assinatura vence HOJE!*\n\nFatura do plano *${params.planName}* no valor de *R$ ${formattedAmount}*.\n\nAcesse a área do cliente para mais informações:\nhttps://www.assinaturaspcon.sbs/cliente`;
          } else {
            message = `Olá ${params.clientName}! 💈\n\nPassando para lembrar que a fatura da sua assinatura *${params.planName}* no valor de *R$ ${formattedAmount}* vence em *5 dias*.\n\nAcesse a área do cliente:\nhttps://www.assinaturaspcon.sbs/cliente`;
          }
        }

        let phone = params.clientPhone.replace(/\D/g, '');
        if (!phone.startsWith('55')) phone = '55' + phone;

        const { data: waResult } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            phone,
            message,
            clientId: params.clientId,
            type: messageType,
            sendImage,
            imageUrl,
            sendButton,
            buttonText,
            buttonUrl,
          },
        });

        whatsappSent = waResult?.success === true;
      } catch (err) {
        console.error('[useSubscriptionReminder] WhatsApp error:', err);
      }
    }

    // ── Email (apenas D-5, pois o template é específico para isso) ──
    if (isD5 && params.clientEmail) {
      try {
        const { data: emailResult } = await supabase.functions.invoke('email-billing-reminder', {
          body: { clientId: params.clientId },
        });
        emailSent = emailResult?.success === true;
      } catch (err) {
        console.error('[useSubscriptionReminder] Email error:', err);
      }
    }

    setIsSending(false);

    // Feedback para o admin
    if (isD5) {
      const msgs: string[] = [];
      if (whatsappSent) msgs.push('WhatsApp ✅');
      else if (params.clientPhone) msgs.push('WhatsApp ❌');
      if (emailSent) msgs.push('Email ✅');
      else if (params.clientEmail) msgs.push('Email ❌');
      if (msgs.length) {
        toast.info(`Lembrete D-5 enviado: ${msgs.join(' | ')}`, { duration: 5000 });
      }
    } else if (isD0) {
      if (whatsappSent) {
        toast.info('Lembrete D-0 enviado via WhatsApp ✅', { duration: 4000 });
      } else if (params.clientPhone) {
        toast.warning('Não foi possível enviar WhatsApp D-0', { duration: 4000 });
      }
    }

    return { shouldSend: true, daysLeft, whatsappSent, emailSent };
  };

  return { sendReminderIfNeeded, isSending };
};
