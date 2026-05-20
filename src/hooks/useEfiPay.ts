import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CreatePixPaymentParams {
  amount: number;
  description: string;
  clientId?: string;
  clientEmail: string;
  clientName: string;
  clientPhone?: string;
  clientDocument?: string;
  subscriptionId?: string;
  proposalId?: string;
  checkoutLinkId?: string;
  proposalPaymentType?: 'entry' | 'total';
}

interface PixPaymentResult {
  success: boolean;
  paymentId?: string;
  qrCode?: string;        // código copia e cola PIX
  qrCodeBase64?: string;  // imagem base64 (pode já ter prefixo data:image/png;base64,)
  qrcodeUrl?: string;     // URL da imagem QR (fallback)
  expirationDate?: string;
  status?: string;        // para compatibilidade com card
  ticketUrl?: string;     // alias de qrcodeUrl
  error?: string;
}

interface PaymentStatusResult {
  success: boolean;
  status?: string;
  efiStatus?: string;
  paidAt?: string;
  error?: string;
}

export function useEfiPay() {
  const [loading, setLoading] = useState(false);

  const createPixPayment = async (params: CreatePixPaymentParams): Promise<PixPaymentResult | null> => {
    setLoading(true);
    try {
      console.log('[useEfiPay] createPixPayment called with:', params);

      const { data, error } = await supabase.functions.invoke('efi-pay', {
        body: { ...params, _action: 'create-pix' },
      });

      if (error) {
        console.error('[useEfiPay] Function invoke error:', error);
        let msg = 'Erro ao criar pagamento PIX';
        try {
          const ctx = await (error as any).context?.json?.();
          msg = ctx?.error || error.message || msg;
        } catch (_) {
          msg = error.message || msg;
        }
        toast.error(msg);
        return null;
      }

      if (!data || data.error) {
        console.error('[useEfiPay] Data error:', data?.error);
        toast.error(data?.error || 'Erro ao criar pagamento PIX');
        return null;
      }

      // Normaliza o QR Code base64 — garante prefixo data:image/png;base64,
      let qrCodeBase64 = data.qrCodeBase64 || '';
      if (qrCodeBase64 && !qrCodeBase64.startsWith('data:')) {
        qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
      }

      console.log('[useEfiPay] PIX created:', {
        paymentId: data.paymentId,
        hasQrCode: !!data.qrCode,
        hasBase64: !!qrCodeBase64,
      });

      toast.success('QR Code PIX gerado com sucesso!');
      return {
        ...data,
        qrCodeBase64,
      } as PixPaymentResult;
    } catch (err: any) {
      console.error('[useEfiPay] Unexpected error:', err);
      toast.error('Erro ao criar pagamento PIX');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async (paymentId: string): Promise<PaymentStatusResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('efi-pay', {
        body: { _action: 'check-status', paymentId },
      });

      if (error || !data || data.error) {
        console.error('[useEfiPay] checkPaymentStatus error:', error || data?.error);
        return null;
      }

      return data as PaymentStatusResult;
    } catch (err: any) {
      console.error('[useEfiPay] checkPaymentStatus unexpected error:', err);
      return null;
    }
  };

  const createCardPayment = async (_params: any): Promise<PixPaymentResult | null> => {
    // EFI Bank suporta apenas PIX. Pagamentos com cartão não estão disponíveis neste gateway.
    toast.error('Pagamento com cartão não está disponível via EFI Bank. Use PIX.');
    return null;
  };

  return { loading, createPixPayment, createCardPayment, checkPaymentStatus };
}
