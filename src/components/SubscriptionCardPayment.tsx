import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardPayment, initMercadoPago, useCardPaymentBrick } from '@mercadopago/sdk-react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { calculateCardPricing } from '@/utils/cardFees';

let initializedPublicKey: string | null = null;

export interface CardPaymentFormData {
  token: string;
  issuer_id: string;
  payment_method_id: string;
  transaction_amount: number;
  installments: number;
  payer?: {
    email?: string;
    identification?: {
      type?: string;
      number?: string;
    };
  };
}

interface SubscriptionCardPaymentProps {
  publicKey?: string | null;
  amount: number;
  installments: number;
  maxInstallments?: number;
  onInstallmentsChange: (installments: number) => void;
  payerEmail?: string | null;
  payerName: string;
  payerDocument?: string | null;
  submitting: boolean;
  onSubmitBrick: (data: CardPaymentFormData) => Promise<void>;
  onCheckoutProFallback?: (pricingTotal: number, installments: number) => Promise<void>;
}

const normalizeDocument = (value?: string | null) => value?.replace(/\D/g, '') || '';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatPercent = (value: number) => `${(value * 100).toFixed(2).replace('.', ',')}%`;

const SubscriptionCardPayment = ({
  publicKey,
  amount,
  installments,
  maxInstallments = 4,
  onInstallmentsChange,
  payerEmail,
  payerName,
  payerDocument,
  submitting,
  onSubmitBrick,
  onCheckoutProFallback,
}: SubscriptionCardPaymentProps) => {
  const safeMaxInstallments = Math.min(Math.max(Math.round(maxInstallments || 4), 1), 4);
  const [sdkReady, setSdkReady] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const { update: updateBrickValues } = useCardPaymentBrick();

  const trimmedPublicKey = (publicKey || '').trim();

  useEffect(() => {
    if (!trimmedPublicKey) {
      setSdkReady(false);
      return;
    }
    if (initializedPublicKey !== trimmedPublicKey) {
      initMercadoPago(trimmedPublicKey, { locale: 'pt-BR' });
      initializedPublicKey = trimmedPublicKey;
    }
    setSdkReady(true);
  }, [trimmedPublicKey]);

  const cleanDocument = normalizeDocument(payerDocument);
  const pricing = useMemo(() => calculateCardPricing(amount, installments), [amount, installments]);

  const installmentOptions = useMemo(
    () =>
      [1, 2, 3, 4]
        .filter((option) => option <= safeMaxInstallments)
        .map((option) => ({
          value: option,
          pricing: calculateCardPricing(amount, option),
        })),
    [amount, safeMaxInstallments],
  );

  // Refs para callbacks e valores dinâmicos evitarem desmontagem do Brick
  const latestSubmitRef = useRef(onSubmitBrick);
  latestSubmitRef.current = onSubmitBrick;

  const latestTotalRef = useRef(pricing.totalCustomerAmount);
  latestTotalRef.current = pricing.totalCustomerAmount;

  const latestInstallmentsRef = useRef(installments);
  latestInstallmentsRef.current = installments;

  // Inicializa o valor do Brick apenas com o valor inicial de mount;
  // mudanças de parcelamento atualizam via controller.update({ amount }) sem recarregar o iframe.
  const initialAmountRef = useRef(pricing.totalCustomerAmount);

  const initialization = useMemo(
    () => ({
      amount: initialAmountRef.current,
      payer: {
        email: payerEmail || 'cliente@pconassinantes.site',
        identification: cleanDocument
          ? {
              type: cleanDocument.length <= 11 ? 'CPF' : 'CNPJ',
              number: cleanDocument,
            }
          : undefined,
      },
    }),
    // Só reinicializa se chave/pagador base mudar (nunca por digitação ou troca de parcelas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimmedPublicKey, payerEmail],
  );

  useEffect(() => {
    if (brickReady) {
      updateBrickValues({ amount: pricing.totalCustomerAmount });
    }
  }, [brickReady, pricing.totalCustomerAmount, updateBrickValues]);

  const customization = useMemo(
    () => ({
      paymentMethods: {
        minInstallments: 1,
        maxInstallments: safeMaxInstallments,
        types: {
          included: ['credit_card' as const],
        },
      },
      visual: {
        hideFormTitle: true,
        texts: {
          formSubmit: 'Pagar com cartão',
        },
        style: {
          theme: 'dark' as const,
          customVariables: {
            formBackgroundColor: 'transparent',
            formPadding: '0px',
            inputBackgroundColor: '#0d1f3f',
            textPrimaryColor: '#f8fafc',
            textSecondaryColor: '#94a3b8',
            outlinePrimaryColor: 'rgba(255, 255, 255, 0.14)',
            outlineSecondaryColor: '#009EE3',
            baseColor: '#009EE3',
            baseColorFirstVariant: '#0284c7',
            baseColorSecondVariant: '#0369a1',
            buttonTextColor: '#ffffff',
            borderRadiusMedium: '12px',
            borderRadiusLarge: '12px',
            inputVerticalPadding: '12px',
            inputHorizontalPadding: '14px',
            inputBorderWidth: '1px',
            inputFocusedBorderWidth: '1.5px',
          },
        },
      },
    }),
    [],
  );

  const handleBrickSubmit = useCallback(async (formData: unknown) => {
    const typed = formData as CardPaymentFormData;
    await latestSubmitRef.current({
      ...typed,
      transaction_amount: latestTotalRef.current,
      installments: latestInstallmentsRef.current,
    });
  }, []);

  const handleBrickError = useCallback((error: unknown) => {
    console.error('[SubscriptionCardPayment] Brick error:', error);
    toast.error('Não foi possível carregar o formulário do cartão.');
  }, []);

  const handleBrickReady = useCallback(() => {
    setBrickReady(true);
    console.log('[SubscriptionCardPayment] Brick ready for', payerName);
  }, [payerName]);

  return (
    <div className={submitting ? 'pointer-events-none opacity-70 space-y-4' : 'space-y-4'}>
      {/* Parcelamento limpo em botões */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Parcelamento</p>
          <p className="text-[11px] text-muted-foreground">
            Base {formatCurrency(pricing.requestedAmount)} • Taxa {formatPercent(pricing.baseFeeRate)}
            {pricing.installmentSurchargeRate > 0
              ? ` + ${formatPercent(pricing.installmentSurchargeRate)}`
              : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {installmentOptions.map((option) => {
            const active = installments === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onInstallmentsChange(option.value)}
                className={`rounded-xl border px-3 py-2 text-left transition-all ${
                  active
                    ? 'border-[#009EE3]/80 bg-[#009EE3]/15 shadow-[0_0_16px_rgba(0,158,227,0.18)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                }`}
              >
                <p className={`text-xs font-bold ${active ? 'text-white' : 'text-foreground'}`}>
                  {option.value}x de {formatCurrency(option.pricing.installmentAmount)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Total {formatCurrency(option.pricing.totalCustomerAmount)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Formulário Mercado Pago sem caixas aninhadas */}
      {trimmedPublicKey && sdkReady ? (
        <div className="relative min-h-[340px]">
          {!brickReady && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-[#009EE3]" />
              Carregando formulário seguro do cartão...
            </div>
          )}
          <div className={brickReady ? 'opacity-100 transition-opacity duration-200' : 'opacity-0 h-0 overflow-hidden'}>
            <CardPayment
              key={trimmedPublicKey}
              initialization={initialization}
              customization={customization}
              locale="pt-BR"
              onSubmit={handleBrickSubmit}
              onError={handleBrickError}
              onReady={handleBrickReady}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 pt-1 text-center">
          <p className="text-xs text-muted-foreground">
            Você será redirecionado ao ambiente seguro do Mercado Pago para finalizar o pagamento no cartão.
          </p>
          <Button
            type="button"
            onClick={() => onCheckoutProFallback?.(pricing.totalCustomerAmount, installments)}
            disabled={submitting || !onCheckoutProFallback}
            className="w-full h-11 font-semibold gap-2 bg-[#009EE3] hover:bg-[#0284c7] text-white"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {submitting ? 'Redirecionando...' : `Pagar ${formatCurrency(pricing.totalCustomerAmount)} com Cartão`}
          </Button>
        </div>
      )}

      {submitting && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-[#009EE3]" />
          Processando pagamento no cartão...
        </div>
      )}
    </div>
  );
};

export default SubscriptionCardPayment;
