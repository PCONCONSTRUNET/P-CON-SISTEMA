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
  qrCode?: string;        // copyPaste (código copia e cola PIX)
  qrCodeBase64?: string;  // imagem base64 (já com prefixo data:image/png;base64,)
  qrcodeUrl?: string;     // URL da imagem QR code (fallback)
  expirationDate?: string;
  error?: string;
}

interface PaymentStatusResult {
  success: boolean;
  status?: string;
  misticStatus?: string;
  paidAt?: string;
  error?: string;
}

export function useMisticPay() {
  const [loading, setLoading] = useState(false);

  const createPixPayment = async (params: CreatePixPaymentParams): Promise<PixPaymentResult | null> => {
    setLoading(true);
    try {
      console.log('[useMisticPay] createPixPayment called with:', params);

      // Passa _action no body para evitar header customizado que causaria falha CORS
      const { data, error } = await supabase.functions.invoke('mistic-pay', {
        body: { ...params, _action: 'create-pix' },
      });

      if (error) {
        console.error('[useMisticPay] Function invoke error:', error);
        // Tenta extrair mensagem do contexto do erro
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
        console.error('[useMisticPay] Data error:', data?.error);
        toast.error(data?.error || 'Erro ao criar pagamento PIX');
        return null;
      }

      console.log('[useMisticPay] PIX created:', {
        paymentId: data.paymentId,
        hasQrCode: !!data.qrCode,
        hasBase64: !!data.qrCodeBase64,
        hasUrl: !!data.qrcodeUrl,
      });

      toast.success('QR Code PIX gerado com sucesso!');
      return data as PixPaymentResult;
    } catch (err: any) {
      console.error('[useMisticPay] Unexpected error:', err);
      toast.error('Erro ao criar pagamento PIX');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async (paymentId: string): Promise<PaymentStatusResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('mistic-pay', {
        body: { _action: 'check-status', paymentId },
      });

      if (error || !data || data.error) {
        console.error('[useMisticPay] checkPaymentStatus error:', error || data?.error);
        return null;
      }

      return data as PaymentStatusResult;
    } catch (err: any) {
      console.error('[useMisticPay] checkPaymentStatus unexpected error:', err);
      return null;
    }
  };

  return { loading, createPixPayment, checkPaymentStatus };
}
