import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { CreditCard, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { calculateCardPricing } from '@/utils/cardFees';

const MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-ee8c080e-cad1-4b48-8965-6f2b0a1abcbd';

initMercadoPago(MERCADO_PAGO_PUBLIC_KEY);

export interface ProposalCardPaymentFormData {
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

interface ProposalCardPaymentProps {
  amount: number;
  payerEmail?: string | null;
  payerName: string;
  payerDocument?: string | null;
  installments: number;
  onInstallmentsChange: (value: number) => void;
  submitting: boolean;
  onSubmit: (data: ProposalCardPaymentFormData) => Promise<void>;
}

const normalizeDocument = (value?: string | null) => value?.replace(/\D/g, '') || '';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatPercent = (value: number) => `${(value * 100).toFixed(2).replace('.', ',')}%`;

const ProposalCardPayment = ({
  amount,
  payerEmail,
  payerName,
  payerDocument,
  installments,
  onInstallmentsChange,
  submitting,
  onSubmit,
}: ProposalCardPaymentProps) => {
  const cleanDocument = normalizeDocument(payerDocument);
  const pricing = calculateCardPricing(amount, installments);
  const installmentOptions = [1, 2, 3, 4].map((option) => ({
    value: option,
    pricing: calculateCardPricing(amount, option),
  }));
  const formKey = `${amount}-${installments}-${payerEmail || 'guest'}-${cleanDocument || 'no-doc'}`;

  return (
    <div className="relative isolate space-y-2 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-[var(--shadow-lg)] backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--primary)/0.14)_0%,transparent_32%,transparent_58%,hsl(var(--accent)/0.12)_100%)]" />
      <div className="pointer-events-none absolute inset-x-[-10%] top-0 h-24 bg-[linear-gradient(180deg,hsl(var(--foreground)/0.12)_0%,transparent_100%)] blur-2xl" />
      <div className="bg-gradient-to-r from-primary/20 via-accent/15 to-secondary/40 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/15 p-2">
                <CreditCard className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  Cartão de crédito ou débito
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </p>
                <p className="text-xs text-muted-foreground">
                  Escolha o parcelamento e preencha os dados.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
              <ShieldCheck className="h-3 w-3" />
              Ambiente protegido
            </div>
          </div>
        </div>

      <div className="relative z-10 space-y-2.5 p-3">
          <div className={submitting ? 'pointer-events-none opacity-70' : ''}>
            <div className="mb-2.5 space-y-1.5 rounded-xl bg-background/30 p-2.5">
              <p className="text-sm font-medium text-foreground">Parcelamento</p>
              <select
                value={installments}
                onChange={(event) => onInstallmentsChange(Number(event.target.value))}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
              >
                {installmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}x de {formatCurrency(option.pricing.installmentAmount)}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
                <span>
                  Você recebe <span className="font-medium text-foreground">{formatCurrency(pricing.requestedAmount)}</span>
                </span>
                <span>
                  Cliente paga <span className="font-medium text-foreground">{formatCurrency(pricing.totalCustomerAmount)}</span>
                </span>
                <span>
                  {pricing.installments}x de <span className="font-medium text-primary">{formatCurrency(pricing.installmentAmount)}</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Taxa base de {formatPercent(pricing.baseFeeRate)}
                {pricing.installmentSurchargeRate > 0
                  ? ` + taxa do parcelamento de ${formatPercent(pricing.installmentSurchargeRate)}`
                  : ''}
                .
              </p>
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-card/95 p-2.5 shadow-[var(--shadow-md)]">
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,hsl(var(--foreground)/0.05)_0%,transparent_28%,transparent_72%,hsl(var(--primary)/0.08)_100%)]" />
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 pb-0.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Dados do cartão</p>
                  <p className="text-[11px] text-muted-foreground">Pagamento seguro na própria proposta.</p>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3 text-primary" />
                  Pagamento seguro
                </div>
              </div>

              <CardPayment
                key={formKey}
                initialization={{
                  amount: pricing.totalCustomerAmount,
                  payer: {
                    email: payerEmail || undefined,
                    identification: cleanDocument
                      ? {
                          type: cleanDocument.length <= 11 ? 'CPF' : 'CNPJ',
                          number: cleanDocument,
                        }
                      : undefined,
                  },
                } as any}
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
                      customVariables: {
                        formBackgroundColor: 'hsl(var(--card))',
                        inputBackgroundColor: 'hsl(var(--background))',
                        textPrimaryColor: 'hsl(var(--foreground))',
                        textSecondaryColor: 'hsl(var(--muted-foreground))',
                        baseColor: 'hsl(var(--primary))',
                        baseColorFirstVariant: 'hsl(var(--accent))',
                        baseColorSecondVariant: 'hsl(var(--secondary))',
                        outlinePrimaryColor: 'hsl(var(--primary))',
                        outlineSecondaryColor: 'hsl(var(--border))',
                        buttonTextColor: 'hsl(var(--primary-foreground))',
                        inputBorderWidth: '1px',
                        inputFocusedBorderWidth: '1px',
                        inputVerticalPadding: '14px',
                        inputHorizontalPadding: '14px',
                        fontSizeMedium: '15px',
                        fontSizeLarge: '16px',
                        fontWeightNormal: '500',
                        fontWeightSemiBold: '600',
                        borderRadiusSmall: '12px',
                        borderRadiusMedium: '16px',
                        borderRadiusLarge: '20px',
                      },
                    },
                  },
                } as any}
                locale="pt-BR"
                onSubmit={async (formData) => {
                  await onSubmit({
                    ...(formData as ProposalCardPaymentFormData),
                    transaction_amount: pricing.totalCustomerAmount,
                    installments,
                  });
                }}
                onError={(error) => {
                  console.error('Erro no formulário de cartão do Mercado Pago:', error);
                  toast.error('Não foi possível carregar o formulário do cartão');
                }}
                onReady={() => {
                  console.log('Formulário de cartão pronto para', payerName);
                }}
              />
            </div>
          </div>
      </div>

      {submitting && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Processando pagamento no cartão...
        </div>
      )}
    </div>
  );
};

export default ProposalCardPayment;