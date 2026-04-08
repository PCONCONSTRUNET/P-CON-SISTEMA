/**
 * useSubscriptionReminder
 *
 * Hook para disparar WhatsApp + Email de lembrete para uma assinatura
 * quando o admin edita manualmente a data de vencimento.
 *
 * Lógica de detecção (tudo em BRT via Intl.DateTimeFormat):
 *  - D-5 (faltam exatamente 5 dias) → WhatsApp template "subscription_reminder" + Email
 *  - D-0 (vence hoje)               → WhatsApp template "due_today" (sem email, pois template é D-5)
 *  - Qualquer outro prazo           → sem envio automático
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SubscriptionReminderParams {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null | undefined;
  clientEmail: string | null | undefined;
  planName: string;
  amount: number;
  /** ISO string da data de vencimento (next_payment) */
  nextPayment: string;
}

/**
 * Converte uma Date para "YYYY-MM-DD" no fuso America/Sao_Paulo (BRT).
 * Mesmo método usado pelas Edge Functions.
 */
const toYMDInBRT = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * Retorna quantos dias calendário faltam para nextPayment, calculando em BRT.
 * nextPayment pode ser "2026-04-05T12:00:00.000Z" ou qualquer ISO string.
 */
const getDaysUntilInBRT = (nextPayment: string): number => {
  const now = new Date();
  const todayBrt = toYMDInBRT(now);                       // ex: "2026-03-31"
  const dueBrt   = toYMDInBRT(new Date(nextPayment));     // ex: "2026-04-05"

  const todayMs = new Date(todayBrt + 'T00:00:00').getTime();
  const dueMs   = new Date(dueBrt   + 'T00:00:00').getTime();

  return Math.round((dueMs - todayMs) / 86400000);
};

export const useSubscriptionReminder = () => {
  const [isSending, setIsSending] = useState(false);

  /**
   * Verifica se a data de vencimento é D-5 ou D-0 e, se for, envia os lembretes.
   */
  const sendReminderIfNeeded = async (
    params: SubscriptionReminderParams
  ): Promise<{ shouldSend: boolean; daysLeft: number; whatsappSent: boolean; emailSent: boolean }> => {
    const daysLeft = getDaysUntilInBRT(params.nextPayment);

    console.log(
      `[useSubscriptionReminder] next_payment=${params.nextPayment} | daysLeft=${daysLeft} (BRT) | today=${toYMDInBRT(new Date())}`
    );

    const isD5 = daysLeft === 5;
    const isD0 = daysLeft === 0;

    if (!isD5 && !isD0) {
      console.log(`[useSubscriptionReminder] Não é D-5 nem D-0 (daysLeft=${daysLeft}), nada a enviar.`);
      return { shouldSend: false, daysLeft, whatsappSent: false, emailSent: false };
    }

    setIsSending(true);

    let whatsappSent = false;
    let emailSent    = false;
    const templateKey  = isD0 ? 'due_today' : 'subscription_reminder';
    const messageType  = isD0 ? 'manual_d0_edit' : 'manual_d5_edit';

    // ── WhatsApp ─────────────────────────────────────────────────────────────
    if (params.clientPhone) {
      try {
        const formattedAmount = Number(params.amount).toFixed(2).replace('.', ',');

        // Busca template do banco
        const { data: templateData } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .eq('template_key', templateKey)
          .eq('is_active', true)
          .maybeSingle();

        let message: string;
        let sendImage  = false;
        let imageUrl: string | undefined;
        let sendButton = false;
        let buttonText: string | undefined;
        let buttonUrl: string | undefined;

        if (templateData) {
          message = (templateData.message_template as string)
            .replace(/\{\{client_name\}\}/g, params.clientName)
            .replace(/\{\{amount\}\}/g, `R$ ${formattedAmount}`)
            .replace(/\{\{plan_name\}\}/g, params.planName);
          imageUrl   = templateData.image_url   || undefined;
          sendImage  = !!(templateData.image_url);
          sendButton = !!(templateData.button_enabled);
          buttonText = templateData.button_text  || undefined;
          buttonUrl  = templateData.button_url   || undefined;
        } else {
          // Fallback caso template não esteja cadastrado/ativo
          message = isD0
            ? `Olá ${params.clientName}! ⚠️\n\nSua assinatura *${params.planName}* no valor de *R$ ${formattedAmount}* vence *HOJE*.\n\nAcesse a área do cliente: https://www.pconassinantes.site/cliente`
            : `Olá ${params.clientName}! 💈\n\nSua assinatura *${params.planName}* no valor de *R$ ${formattedAmount}* vence em *5 dias*.\n\nAcesse a área do cliente: https://www.pconassinantes.site/cliente`;
        }

        let phone = String(params.clientPhone).replace(/\D/g, '');
        if (!phone.startsWith('55')) phone = '55' + phone;

        const { data: waResult, error: waError } = await supabase.functions.invoke('whatsapp-send', {
          body: { phone, message, clientId: params.clientId, type: messageType, sendImage, imageUrl, sendButton, buttonText, buttonUrl },
        });

        if (waError) console.error('[useSubscriptionReminder] WhatsApp invoke error:', waError);
        whatsappSent = waResult?.success === true;
        console.log(`[useSubscriptionReminder] WhatsApp sent=${whatsappSent}`, waResult);
      } catch (err) {
        console.error('[useSubscriptionReminder] WhatsApp exception:', err);
      }
    } else {
      console.log('[useSubscriptionReminder] Sem telefone — WhatsApp pulado.');
    }

    // ── Email (apenas D-5, template foi feito para isso) ─────────────────────
    if (isD5 && params.clientEmail) {
      try {
        const { data: emailResult, error: emailError } = await supabase.functions.invoke('email-billing-reminder', {
          body: { clientId: params.clientId },
        });

        if (emailError) console.error('[useSubscriptionReminder] Email invoke error:', emailError);
        emailSent = emailResult?.success === true;
        console.log(`[useSubscriptionReminder] Email sent=${emailSent}`, emailResult);
      } catch (err) {
        console.error('[useSubscriptionReminder] Email exception:', err);
      }
    } else if (isD5 && !params.clientEmail) {
      console.log('[useSubscriptionReminder] Sem email — Email pulado.');
    }

    setIsSending(false);

    // ── Toast de feedback para o admin ────────────────────────────────────────
    if (isD5) {
      const parts: string[] = [];
      if (params.clientPhone) parts.push(whatsappSent ? 'WhatsApp ✅' : 'WhatsApp ❌');
      if (params.clientEmail) parts.push(emailSent    ? 'Email ✅'    : 'Email ❌');
      if (parts.length > 0) {
        toast.info(`Lembrete D-5 disparado: ${parts.join(' | ')}`, { duration: 6000 });
      }
    } else if (isD0) {
      if (params.clientPhone) {
        toast.info(whatsappSent ? 'Lembrete D-0 enviado via WhatsApp ✅' : 'WhatsApp D-0 falhou ❌', { duration: 5000 });
      }
    }

    return { shouldSend: true, daysLeft, whatsappSent, emailSent };
  };

  return { sendReminderIfNeeded, isSending };
};

