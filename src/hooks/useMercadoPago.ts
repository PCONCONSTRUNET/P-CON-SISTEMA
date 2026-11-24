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

interface CreateCardPreferenceParams {
  amount: number;
  title: string;
  description?: string;
  clientEmail: string;
  clientId?: string;
  clientName?: string;
  clientDocument?: string;
  externalReference?: string;
  subscriptionId?: string;
  subscriptionLinkId?: string;
  proposalId?: string;
  proposalPaymentType?: 'entry' | 'total';
  maxInstallments?: number;
  returnUrl?: string;
}

interface CreateCardPaymentParams {
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
  externalReference?: string;
  token: string;
  issuerId: string;
  installments: number;
  paymentMethodId: string;
  payerIdentificationType?: string;
  payerIdentificationNumber?: string;
}

interface PixPaymentResult {
  success: boolean;
  paymentId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expirationDate?: string;
  status?: string;
  error?: string;
}

interface PaymentStatusResult {
  success: boolean;
  status?: string;
  statusDetail?: string;
  paidAt?: string;
  nextPayment?: string | null;
  newLinkToken?: string | null;
  newLinkUrl?: string | null;
  error?: string;
}

interface CardPaymentResult {
  success: boolean;
  paymentId?: string;
  status?: string;
  statusDetail?: string;
  paidAt?: string;
  nextPayment?: string | null;
  newLinkToken?: string | null;
  newLinkUrl?: string | null;
  error?: string;
}

interface MercadoPagoGatewayStatus {
  isActive: boolean;
  configured: boolean;
  publicKey?: string | null;
}

const MP_GATEWAY_STATUS_EVENT = 'mercadopago-gateway-status-changed';

export function notifyMercadoPagoGatewayStatusChanged(status: MercadoPagoGatewayStatus) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<MercadoPagoGatewayStatus>(MP_GATEWAY_STATUS_EVENT, { detail: status }));
  }
}

export async function fetchMercadoPagoGatewayStatus(): Promise<MercadoPagoGatewayStatus | null> {
  const { data, error } = await supabase.functions.invoke('mercadopago', {
    body: { _action: 'get-status' },
  });

  if (!error && data?.success) {
    return {
      isActive: !!data.isActive,
      configured: !!data.configured,
      publicKey: data.publicKey || null,
    };
  }

  const { data: settingsData, error: settingsError } = await supabase.functions.invoke('mercadopago', {
    body: { _action: 'get-settings' },
  });

  if (!settingsError && settingsData?.success) {
    const s = settingsData.settings;
    if (!s) return { isActive: false, configured: false, publicKey: null };
    const configured = !!s.access_token;
    return {
      isActive: !!s.is_active && configured,
      configured,
      publicKey: s.public_key || null,
    };
  }

  return null;
}

async function extractInvokeError(error: any, fallback: string): Promise<{ message: string; gatewayDisabled?: boolean }> {
  let msg = fallback;
  let gatewayDisabled = false;
  try {
    const ctx = await error?.context?.json?.();
    msg = ctx?.error || error?.message || fallback;
    gatewayDisabled = !!ctx?.gatewayDisabled;
  } catch {
    msg = error?.message || fallback;
  }
  return { message: msg, gatewayDisabled };
}

export function useMercadoPago(options: { checkStatusOnMount?: boolean } = {}) {
  const { checkStatusOnMount = true } = options;
  const [loading, setLoading] = useState(false);
  const [gatewayActive, setGatewayActive] = useState<boolean | null>(null);
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const [gatewayStatusLoading, setGatewayStatusLoading] = useState(checkStatusOnMount);

  const refreshGatewayStatus = useCallback(async (): Promise<boolean | null> => {
    setGatewayStatusLoading(true);
    try {
      const status = await fetchMercadoPagoGatewayStatus();
      if (status) {
        setGatewayActive(status.isActive);
        setGatewayConfigured(status.configured);
        return status.isActive;
      }
      return null;
    } catch (err) {
      console.error('[useMercadoPago] Error checking gateway status:', err);
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
      const detail = (event as CustomEvent<MercadoPagoGatewayStatus>).detail;
      if (detail) {
        setGatewayActive(detail.isActive);
        setGatewayConfigured(detail.configured);
        setGatewayStatusLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(MP_GATEWAY_STATUS_EVENT, handleStatusChanged);
      return () => window.removeEventListener(MP_GATEWAY_STATUS_EVENT, handleStatusChanged);
    }
  }, [checkStatusOnMount, refreshGatewayStatus]);

  const createPixPayment = async (params: CreatePixPaymentParams): Promise<PixPaymentResult | null> => {
    setLoading(true);
    try {
      const currentActive = await refreshGatewayStatus();
      if (currentActive === false) {
        toast.error('Gateway Mercado Pago está desativado no momento.');
        return null;
      }

      console.log('Creating PIX payment via Mercado Pago:', params);

      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: { ...params, _action: 'create-pix' },
      });

      if (error) {
        const parsed = await extractInvokeError(error, 'Erro ao criar pagamento PIX');
        if (parsed.gatewayDisabled) setGatewayActive(false);
        toast.error(parsed.message);
        return null;
      }

      if (!data || data.error) {
        if (data?.gatewayDisabled) setGatewayActive(false);
        toast.error(data?.error || 'Erro ao criar pagamento PIX');
        return null;
      }

      let qrCodeBase64 = data.qrCodeBase64 || '';
      if (qrCodeBase64 && !qrCodeBase64.startsWith('data:')) {
        qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
      }

      toast.success('QR Code PIX gerado com sucesso!');
      return {
        ...data,
        paymentId: data.paymentId ? String(data.paymentId) : undefined,
        qrCodeBase64,
      } as PixPaymentResult;
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
      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: { _action: 'check-status', paymentId },
      });

      if (error || !data || data.error) {
        console.error('Error checking payment status:', error || data?.error);
        return null;
      }

      return data as PaymentStatusResult;
    } catch (error: any) {
      console.error('Error in checkPaymentStatus:', error);
      return null;
    }
  };

  const createPreference = async (params: CreateCardPreferenceParams) => {
    setLoading(true);
    try {
      const currentActive = await refreshGatewayStatus();
      if (currentActive === false) {
        toast.error('Gateway Mercado Pago está desativado no momento.');
        return null;
      }

      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: { ...params, _action: 'create-preference' },
      });

      if (error) {
        const parsed = await extractInvokeError(error, 'Erro ao criar preferência');
        if (parsed.gatewayDisabled) setGatewayActive(false);
        toast.error(parsed.message);
        return null;
      }

      if (!data || data.error) {
        if (data?.gatewayDisabled) setGatewayActive(false);
        toast.error(data?.error || 'Erro ao criar preferência');
        return null;
      }

      return data;
    } catch (error: any) {
      console.error('Error in createPreference:', error);
      toast.error('Erro ao criar preferência');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createCardPayment = async (params: CreateCardPaymentParams): Promise<CardPaymentResult | null> => {
    setLoading(true);
    try {
      const currentActive = await refreshGatewayStatus();
      if (currentActive === false) {
        toast.error('Gateway Mercado Pago está desativado no momento.');
        return null;
      }

      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: { ...params, _action: 'create-card-payment' },
      });

      if (error) {
        const parsed = await extractInvokeError(error, 'Erro ao processar pagamento no cartão');
        if (parsed.gatewayDisabled) setGatewayActive(false);
        toast.error(parsed.message);
        return null;
      }

      if (!data || data.error) {
        if (data?.gatewayDisabled) setGatewayActive(false);
        toast.error(data?.error || 'Erro ao processar pagamento no cartão');
        return null;
      }

      return data as CardPaymentResult;
    } catch (error: any) {
      console.error('Error in createCardPayment:', error);
      toast.error('Erro ao processar pagamento no cartão');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    gatewayActive,
    gatewayConfigured,
    gatewayStatusLoading,
    refreshGatewayStatus,
    createPixPayment,
    checkPaymentStatus,
    createPreference,
    createCardPayment,
  };
}
