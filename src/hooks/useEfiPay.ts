import { useState, useEffect, useCallback } from 'react';
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
  subscriptionLinkId?: string;
  proposalId?: string;
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
  nextPayment?: string | null;
  newLinkToken?: string | null;
  newLinkUrl?: string | null;
  error?: string;
}

interface GatewayStatusResult {
  isActive: boolean;
  configured: boolean;
}

const GATEWAY_STATUS_EVENT = 'efi-gateway-status-changed';

export function notifyEfiGatewayStatusChanged(status: GatewayStatusResult) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<GatewayStatusResult>(GATEWAY_STATUS_EVENT, { detail: status }));
  }
}

export async function fetchEfiGatewayStatus(): Promise<GatewayStatusResult | null> {
  const { data, error } = await supabase.functions.invoke('efi-pay', {
    body: { _action: 'get-status' },
  });

  if (!error && data?.success) {
    return {
      isActive: !!data.isActive,
      configured: !!data.configured,
    };
  }

  // Fallback caso a Edge Function deployada ainda não possua a action get-status
  const { data: settingsData, error: settingsError } = await supabase.functions.invoke('efi-pay', {
    body: { _action: 'get-settings' },
  });

  if (!settingsError && settingsData?.success) {
    const s = settingsData.settings;
    if (!s) return { isActive: false, configured: false };
    const configured = !!(s.client_id && s.client_secret && s.pix_key && s.certificate_pem);
    return {
      isActive: !!s.is_active && configured,
      configured,
    };
  }

  return null;
}

export function useEfiPay(options: { checkStatusOnMount?: boolean } = {}) {
  const { checkStatusOnMount = true } = options;
  const [loading, setLoading] = useState(false);
  const [gatewayActive, setGatewayActive] = useState<boolean | null>(null);
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const [gatewayStatusLoading, setGatewayStatusLoading] = useState(checkStatusOnMount);

  const refreshGatewayStatus = useCallback(async (): Promise<boolean | null> => {
    setGatewayStatusLoading(true);
    try {
      const status = await fetchEfiGatewayStatus();
      if (status) {
        setGatewayActive(status.isActive);
        setGatewayConfigured(status.configured);
        return status.isActive;
      }
      return null;
    } catch (err) {
      console.error('[useEfiPay] Error checking gateway status:', err);
      return null;
    } finally {
      setGatewayStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkStatusOnMount) {
      void refreshGatewayStatus();
    }

    const handleStatusChanged = (event: Event) => {
      const detail = (event as CustomEvent<GatewayStatusResult>).detail;
      if (detail) {
        setGatewayActive(detail.isActive);
        setGatewayConfigured(detail.configured);
        setGatewayStatusLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(GATEWAY_STATUS_EVENT, handleStatusChanged);
      return () => window.removeEventListener(GATEWAY_STATUS_EVENT, handleStatusChanged);
    }
  }, [checkStatusOnMount, refreshGatewayStatus]);

  const createPixPayment = async (params: CreatePixPaymentParams): Promise<PixPaymentResult | null> => {
    setLoading(true);
    try {
      const currentActive = await refreshGatewayStatus();
      if (currentActive === false) {
        toast.error('Gateway de pagamento EFI Bank está desativado no momento.');
        return null;
      }

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
          if (ctx?.gatewayDisabled) {
            setGatewayActive(false);
          }
        } catch (_) {
          msg = error.message || msg;
        }
        toast.error(msg);
        return null;
      }

      if (!data || data.error) {
        console.error('[useEfiPay] Data error:', data?.error);
        if (data?.gatewayDisabled) {
          setGatewayActive(false);
        }
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

  return {
    loading,
    gatewayActive,
    gatewayConfigured,
    gatewayStatusLoading,
    refreshGatewayStatus,
    createPixPayment,
    createCardPayment,
    checkPaymentStatus,
  };
}
