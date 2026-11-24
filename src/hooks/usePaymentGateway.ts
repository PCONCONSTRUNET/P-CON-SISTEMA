import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useEfiPay, fetchEfiGatewayStatus } from '@/hooks/useEfiPay';
import { useMercadoPago, fetchMercadoPagoGatewayStatus } from '@/hooks/useMercadoPago';

export type PaymentGatewayId = 'efi' | 'mercadopago';

export const GATEWAY_LABELS: Record<PaymentGatewayId, string> = {
  efi: 'EFI Bank',
  mercadopago: 'Mercado Pago',
};

export interface UnifiedPixParams {
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

export interface UnifiedPixResult {
  success: boolean;
  paymentId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  qrcodeUrl?: string;
  ticketUrl?: string;
  expirationDate?: string;
  status?: string;
  gatewayUsed: PaymentGatewayId;
}

export function usePaymentGateway() {
  const efi = useEfiPay({ checkStatusOnMount: false });
  const mp = useMercadoPago({ checkStatusOnMount: false });

  const [efiActive, setEfiActive] = useState<boolean | null>(null);
  const [mercadoPagoActive, setMercadoPagoActive] = useState<boolean | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [lastGatewayUsed, setLastGatewayUsed] = useState<PaymentGatewayId>('efi');

  const refreshStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const [efiStatus, mpStatus] = await Promise.all([
        fetchEfiGatewayStatus().catch(() => null),
        fetchMercadoPagoGatewayStatus().catch(() => null),
      ]);

      const nextEfi = efiStatus ? efiStatus.isActive : null;
      const nextMp = mpStatus ? mpStatus.isActive : null;

      setEfiActive(nextEfi);
      setMercadoPagoActive(nextMp);

      return { efiActive: nextEfi, mercadoPagoActive: nextMp };
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatuses();

    const onEfiChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive: boolean }>).detail;
      if (detail !== undefined) setEfiActive(detail.isActive);
    };
    const onMpChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive: boolean }>).detail;
      if (detail !== undefined) setMercadoPagoActive(detail.isActive);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('efi-gateway-status-changed', onEfiChanged);
      window.addEventListener('mercadopago-gateway-status-changed', onMpChanged);
      return () => {
        window.removeEventListener('efi-gateway-status-changed', onEfiChanged);
        window.removeEventListener('mercadopago-gateway-status-changed', onMpChanged);
      };
    }
  }, [refreshStatuses]);

  const activeGateways = useMemo<PaymentGatewayId[]>(() => {
    const list: PaymentGatewayId[] = [];
    if (efiActive === true) list.push('efi');
    if (mercadoPagoActive === true) list.push('mercadopago');
    return list;
  }, [efiActive, mercadoPagoActive]);

  const hasAnyActiveGateway = useMemo<boolean | null>(() => {
    if (efiActive === null && mercadoPagoActive === null) return null;
    if (activeGateways.length > 0) return true;
    if (efiActive === false && mercadoPagoActive === false) return false;
    // Se um respondeu false e o outro falhou/ainda null, segue verificando no backend
    return statusLoading ? null : false;
  }, [efiActive, mercadoPagoActive, activeGateways, statusLoading]);

  const defaultGateway = useMemo<PaymentGatewayId | null>(() => {
    if (activeGateways.length > 0) return activeGateways[0];
    return null;
  }, [activeGateways]);

  const isGatewayDisabled = !statusLoading && hasAnyActiveGateway === false;

  const createPixPayment = async (
    params: UnifiedPixParams,
    preferredGateway?: PaymentGatewayId,
  ): Promise<UnifiedPixResult | null> => {
    const latest = await refreshStatuses();
    const available: PaymentGatewayId[] = [];
    if (latest.efiActive === true) available.push('efi');
    if (latest.mercadoPagoActive === true) available.push('mercadopago');

    if (available.length === 0 && latest.efiActive === false && latest.mercadoPagoActive === false) {
      toast.error('Nenhum gateway de pagamento está ativo no momento. Ative EFI Bank ou Mercado Pago nas configurações.');
      return null;
    }

    let chosen: PaymentGatewayId;
    if (preferredGateway && available.includes(preferredGateway)) {
      chosen = preferredGateway;
    } else if (available.length > 0) {
      chosen = available[0];
    } else {
      chosen = preferredGateway || 'efi';
    }

    setLastGatewayUsed(chosen);

    if (chosen === 'mercadopago') {
      const res = await mp.createPixPayment(params);
      if (!res) return null;
      return { ...res, gatewayUsed: 'mercadopago' };
    }

    const res = await efi.createPixPayment(params);
    if (!res) return null;
    return { ...res, gatewayUsed: 'efi' };
  };

  const checkPaymentStatus = async (paymentId: string, gateway?: PaymentGatewayId) => {
    const target = gateway || lastGatewayUsed;
    if (target === 'mercadopago') {
      return mp.checkPaymentStatus(paymentId);
    }
    return efi.checkPaymentStatus(paymentId);
  };

  return {
    loading: efi.loading || mp.loading,
    statusLoading,
    efiActive,
    mercadoPagoActive,
    activeGateways,
    hasAnyActiveGateway,
    defaultGateway,
    isGatewayDisabled,
    refreshStatuses,
    createPixPayment,
    checkPaymentStatus,
    lastGatewayUsed,
  };
}
