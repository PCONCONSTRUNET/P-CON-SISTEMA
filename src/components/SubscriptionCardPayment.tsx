import { useEffect, useState } from 'react';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { CreditCard, ExternalLink, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { calculateCardPricing } from '@/utils/cardFees';
import mercadoPagoIcon from '@/assets/mercado-pago-icon.png';

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
  payerEmail,
  payerName,
  payerDocument,
  submitting,
  onSubmitBrick,
  onCheckoutProFallback,
}: SubscriptionCardPaymentProps) => {
  const [installments, setInstallments] = useState(1);
  const [sdkReady, setSdkReady] = useState(false);

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
  const pricing = calculateCardPricing(amount, installments);
  const installmentOptions = [1, 2, 3, 4].map((option) => ({
    value: option,
    pricing: calculateCardPricing(amount, option),
  }));
  const formKey = `${trimmedPublicKey}-${amount}-${installments}-${payerEmail || 'guest'}-${cleanDocument || 'no-doc'}`;

  return (
    <div className="relative isolate space-y-3 overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-3 shadow-lg backdrop-blur-sm">
      <div className="rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/40 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/15 shadow-inner">
              <CreditCard className="h-4 w-4 text-sky-300" />
              <img
                src={mercadoPagoIcon}
                alt="Mercado Pago"
                className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-[#0a1d3d] bg-white object-contain p-[1px]"
              />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                Cartão de Crédito
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              </p>
              <p className="text-[11px] text-muted-foreground">
                Até 4x via Mercado Pago • Aprovação imediata
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            Seguro
          </div>
        </div>
      </div>

      {/* Parcelamento */}
      <div className={submitting ? 'pointer-events-none opacity-70 space-y-3' : 'space-y-3'}>
        <div className="space-y-1.5 rounded-xl border border-border/40 bg-secondary/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">Parcelamento</p>
          <select
            value={installments}
            onChange={(event) => setInstallments(Number(event.target.value))}
            className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
          >
            {installmentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}x de {formatCurrency(option.pricing.installmentAmount)} (Total: {formatCurrency(option.pricing.totalCustomerAmount)})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground pt-1">
            <span>
              Valor base: <strong className="text-foreground">{formatCurrency(pricing.requestedAmount)}</strong>
            </span>
            <span>
              Total no cartão: <strong className="text-primary">{formatCurrency(pricing.totalCustomerAmount)}</strong>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Taxa do cartão: {formatPercent(pricing.baseFeeRate)}
            {pricing.installmentSurchargeRate > 0
              ? ` + parcelamento ${formatPercent(pricing.installmentSurchargeRate)}`
              : ''}
            .
          </p>
        </div>

        {/* Se Public Key configurada -> Brick transparente; senão -> Checkout Pro Mercado Pago */}
        {trimmedPublicKey && sdkReady ? (
          <div className="rounded-xl border border-border/40 bg-background/40 p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium text-foreground">Dados do cartão</p>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3 text-primary" />
                Criptografado
              </span>
            </div>
            <CardPayment
              key={formKey}
              initialization={{
                amount: pricing.totalCustomerAmount,
                payer: {
                  email: payerEmail || 'cliente@pconassinantes.site',
                  identification: cleanDocument
                    ? {
                        type: cleanDocument.length <= 11 ? 'CPF' : 'CNPJ',
                        number: cleanDocument,
                      }
                    : undefined,
                },
              } as Record<string, unknown>}
              customization={{
                paymentMethods: {
                  minInstallments: 1,
                  maxInstallments: 4,
                  types: {
                    included: ['credit_card'],
                  },
                },
                visual: {
                  style: {
                    theme: 'dark',
                  },
                },
              } as Record<string, unknown>}
              locale="pt-BR"
              onSubmit={async (formData) => {
                await onSubmitBrick({
                  ...(formData as CardPaymentFormData),
                  transaction_amount: pricing.totalCustomerAmount,
                  installments,
                });
              }}
              onError={(error) => {
                console.error('[SubscriptionCardPayment] Brick error:', error);
                toast.error('Não foi possível carregar o formulário do cartão.');
              }}
              onReady={() => {
                console.log('[SubscriptionCardPayment] Brick ready for', payerName);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Você será redirecionado ao ambiente seguro do Mercado Pago para finalizar o pagamento no cartão.
            </p>
            <Button
              type="button"
              onClick={() => onCheckoutProFallback?.(pricing.totalCustomerAmount, installments)}
              disabled={submitting || !onCheckoutProFallback}
              className="w-full h-11 font-semibold gap-2"
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
      </div>

      {submitting && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Processando pagamento no cartão...
        </div>
      )}
    </div>
  );
};

export default SubscriptionCardPayment;
