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
  proposalPaymentType?: 'entry' | 'total';
}

interface PixPaymentResult {
  success: boolean;
  paymentId?: string;
  qrCode?: string;       // copyPaste (código copia e cola)
  qrCodeBase64?: string; // imagem base64 completa com prefixo data:image/png;base64,
  qrcodeUrl?: string;    // URL da imagem do QR code (fallback)
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
      console.log('Creating PIX payment via Mistic Pay:', params);

      // Usa supabase.functions.invoke para garantir autenticação correta
      const { data, error } = await supabase.functions.invoke('mistic-pay', {
        body: params,
        headers: { 'x-action': 'create-pix' },
      });

      if (error) {
        console.error('Error invoking mistic-pay function:', error);
        toast.error(error.message || 'Erro ao criar pagamento PIX');
        return null;
      }

      if (!data || data.error) {
        console.error('Mistic Pay function returned error:', data?.error);
        toast.error(data?.error || 'Erro ao criar pagamento PIX');
        return null;
      }

      console.log('PIX payment created:', {
        paymentId: data.paymentId,
        hasQrCode: !!data.qrCode,
        hasBase64: !!data.qrCodeBase64,
        hasUrl: !!data.qrcodeUrl,
      });

      toast.success('QR Code PIX gerado com sucesso!');
      return data as PixPaymentResult;
    } catch (error: any) {
      console.error('Error in createPixPayment:', error);
      toast.error('Erro ao criar pagamento PIX');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async (paymentId: string): Promise<PaymentStatusResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('mistic-pay', {
        body: { paymentId },
        headers: { 'x-action': 'check-status' },
      });

      if (error) {
        console.error('Error checking payment status:', error);
        return null;
      }

      if (!data || data.error) {
        console.error('Status check returned error:', data?.error);
        return null;
      }

      return data as PaymentStatusResult;
    } catch (error: any) {
      console.error('Error in checkPaymentStatus:', error);
      return null;
    }
  };

  return {
    loading,
    createPixPayment,
    checkPaymentStatus,
  };
}
