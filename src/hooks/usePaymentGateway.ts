import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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
  subscriptionLinkId?: string;
  paymentLinkId?: string;
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

interface StoredGatewaySnapshot {
  efiActive: boolean | null;
  mercadoPagoActive: boolean | null;
  mercadoPagoPublicKey: string | null;
  savedAt: number;
}

const GATEWAY_STORAGE_KEY = 'pcon_gw_status_v1';
const STORAGE_TTL_MS = 5 * 60 * 1000;

function readGatewaySnapshot(): StoredGatewaySnapshot | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(GATEWAY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGatewaySnapshot;
    if (!parsed || Date.now() - (parsed.savedAt || 0) > STORAGE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeGatewaySnapshot(snapshot: Omit<StoredGatewaySnapshot, 'savedAt'>) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      GATEWAY_STORAGE_KEY,
      JSON.stringify({ ...snapshot, savedAt: Date.now() }),
    );
  } catch {
    // ignore storage errors
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

async function fetchStatusViaRpc(): Promise<{
  efiActive: boolean;
  mercadoPagoActive: boolean;
  mercadoPagoPublicKey: string | null;
} | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_public_payment_gateway_status');
    if (error || !Array.isArray(data) || data.length === 0) return null;

    let efiActive = false;
    let mercadoPagoActive = false;
    let mercadoPagoPublicKey: string | null = null;

    for (const row of data as Array<{
      gateway_name?: string;
      is_active?: boolean;
      public_key?: string | null;
    }>) {
      if (row.gateway_name === 'efi') {
        efiActive = !!row.is_active;
      } else if (row.gateway_name === 'mercadopago') {
        mercadoPagoActive = !!row.is_active;
        mercadoPagoPublicKey = row.public_key || null;
      }
    }

    return { efiActive, mercadoPagoActive, mercadoPagoPublicKey };
  } catch {
    return null;
  }
}

export function usePaymentGateway(options: { forceRefreshOnMount?: boolean } = {}) {
  const { forceRefreshOnMount = false } = options;
  const efi = useEfiPay({ checkStatusOnMount: false });
  const mp = useMercadoPago({ checkStatusOnMount: false });

  const initialSnapshot = useMemo(() => readGatewaySnapshot(), []);

  const [efiActive, setEfiActive] = useState<boolean | null>(initialSnapshot?.efiActive ?? null);
  const [mercadoPagoActive, setMercadoPagoActive] = useState<boolean | null>(
    initialSnapshot?.mercadoPagoActive ?? null,
  );
  const [mercadoPagoPublicKey, setMercadoPagoPublicKey] = useState<string | null>(
    initialSnapshot?.mercadoPagoPublicKey ?? null,
  );
  const [statusLoading, setStatusLoading] = useState<boolean>(
    initialSnapshot === null ||
      (initialSnapshot.efiActive === null && initialSnapshot.mercadoPagoActive === null),
  );
  const [lastGatewayUsed, setLastGatewayUsed] = useState<PaymentGatewayId>('efi');

  const refreshStatuses = useCallback(async (force = false) => {
    const snap = !force ? readGatewaySnapshot() : null;
    if (snap === null) {
      setStatusLoading((prev) => prev || (efiActive === null && mercadoPagoActive === null));
    }

    try {
      // 1. Caminho ultrarrápido via RPC no PostgreSQL (~50ms, sem cold-start de Edge Functions)
      const rpcRes = await withTimeout(fetchStatusViaRpc(), 3500, null);
      if (rpcRes) {
        setEfiActive(rpcRes.efiActive);
        setMercadoPagoActive(rpcRes.mercadoPagoActive);
        setMercadoPagoPublicKey(rpcRes.mercadoPagoPublicKey);
        writeGatewaySnapshot(rpcRes);
        return {
          efiActive: rpcRes.efiActive,
          mercadoPagoActive: rpcRes.mercadoPagoActive,
        };
      }

      // 2. Fallback independente: cada gateway atualiza a UI assim que responder
      //    (se um demorar ou não estiver deployado, NÃO bloqueia o outro!)
      let nextEfi: boolean | null = null;
      let nextMp: boolean | null = null;
      let nextMpKey: string | null = null;

      const efiPromise = withTimeout(fetchEfiGatewayStatus(force), 4500, null).then((res) => {
        if (res) {
          nextEfi = res.isActive;
          setEfiActive(res.isActive);
        }
        return res;
      });

      const mpPromise = withTimeout(fetchMercadoPagoGatewayStatus(force), 4500, null).then((res) => {
        if (res) {
          nextMp = res.isActive;
          nextMpKey = res.publicKey || null;
          setMercadoPagoActive(res.isActive);
          setMercadoPagoPublicKey(nextMpKey);
        } else {
          // Se Mercado Pago falhar/timeout (ex.: ainda não deployado), marca false em vez de prender a UI
          nextMp = false;
          setMercadoPagoActive((prev) => (prev === null ? false : prev));
        }
        return res;
      });

      await Promise.all([efiPromise, mpPromise]);

      const finalEfi = nextEfi ?? efiActive;
      const finalMp = nextMp ?? mercadoPagoActive;
      const finalMpKey = nextMpKey ?? mercadoPagoPublicKey;

      if (nextEfi !== null || nextMp !== null) {
        writeGatewaySnapshot({
          efiActive: finalEfi,
          mercadoPagoActive: finalMp,
          mercadoPagoPublicKey: finalMpKey,
        });
      }

      return { efiActive: finalEfi, mercadoPagoActive: finalMp };
    } finally {
      setStatusLoading(false);
    }
  }, [efiActive, mercadoPagoActive, mercadoPagoPublicKey]);

  useEffect(() => {
    const snap = readGatewaySnapshot();
    const snapAgeMs = snap ? Date.now() - (snap.savedAt || 0) : Infinity;
    if (forceRefreshOnMount || !snap || snapAgeMs > 120_000) {
      void refreshStatuses(true);
    }

    const onEfiChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive: boolean }>).detail;
      if (detail !== undefined) {
        setEfiActive(detail.isActive);
        const cur = readGatewaySnapshot();
        writeGatewaySnapshot({
          efiActive: detail.isActive,
          mercadoPagoActive: cur?.mercadoPagoActive ?? null,
          mercadoPagoPublicKey: cur?.mercadoPagoPublicKey ?? null,
        });
      }
    };
    const onMpChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive: boolean; publicKey?: string | null }>).detail;
      if (detail !== undefined) {
        setMercadoPagoActive(detail.isActive);
        if (detail.publicKey !== undefined) {
          setMercadoPagoPublicKey(detail.publicKey || null);
        }
        const cur = readGatewaySnapshot();
        writeGatewaySnapshot({
          efiActive: cur?.efiActive ?? null,
          mercadoPagoActive: detail.isActive,
          mercadoPagoPublicKey:
            detail.publicKey !== undefined ? detail.publicKey || null : cur?.mercadoPagoPublicKey ?? null,
        });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('efi-gateway-status-changed', onEfiChanged);
      window.addEventListener('mercadopago-gateway-status-changed', onMpChanged);
      return () => {
        window.removeEventListener('efi-gateway-status-changed', onEfiChanged);
        window.removeEventListener('mercadopago-gateway-status-changed', onMpChanged);
      };
    }
  }, []);

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
    const latest = await refreshStatuses(true);
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
    mercadoPagoPublicKey,
    activeGateways,
    hasAnyActiveGateway,
    defaultGateway,
    isGatewayDisabled,
    refreshStatuses,
    createPixPayment,
    createCardPayment: mp.createCardPayment,
    createCardPreference: mp.createPreference,
    checkPaymentStatus,
    lastGatewayUsed,
  };
}
