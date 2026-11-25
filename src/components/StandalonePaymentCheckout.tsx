import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  QrCode,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import BlueBackground from '@/components/BlueBackground';
import PixQRCode from '@/components/PixQRCode';
import SubscriptionCardPayment from '@/components/SubscriptionCardPayment';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePaymentGateway } from '@/hooks/usePaymentGateway';
import { PaymentLinkRecord } from '@/hooks/usePaymentLinks';
import {
  cleanDocumentDigits,
  formatDocumentInput,
  isValidCpfOrCnpj,
} from '@/utils/documentValidation';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StandalonePaymentCheckoutProps {
  initialLink: PaymentLinkRecord;
}

interface ResolvedPayer {
  clientId: string;
  name: string;
  document: string;
  email: string;
}

interface GeneratedPixState {
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expirationDate?: string;
  paymentId: string;
  gateway?: 'mercadopago' | 'efi';
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
};

export default function StandalonePaymentCheckout({ initialLink }: StandalonePaymentCheckoutProps) {
  const [searchParams] = useSearchParams();
  const [link, setLink] = useState<PaymentLinkRecord>(initialLink);

  // Etapa 1: Identificação obrigatória (Nome + CPF/CNPJ)
  const [step, setStep] = useState<'identify' | 'payment'>('identify');
  const [payerNameInput, setPayerNameInput] = useState(initialLink.payer_name || '');
  const [payerDocInput, setPayerDocInput] = useState(
    initialLink.payer_document ? formatDocumentInput(initialLink.payer_document) : '',
  );
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [preparingPayer, setPreparingPayer] = useState(false);

  const [resolvedPayer, setResolvedPayer] = useState<ResolvedPayer | null>(() => {
    if (
      initialLink.client_id &&
      initialLink.payer_name &&
      initialLink.payer_document &&
      isValidCpfOrCnpj(initialLink.payer_document)
    ) {
      const digits = cleanDocumentDigits(initialLink.payer_document);
      return {
        clientId: initialLink.client_id,
        name: initialLink.payer_name,
        document: formatDocumentInput(initialLink.payer_document),
        email: initialLink.payer_email || `${digits}@cliente.pconassinantes.site`,
      };
    }
    return null;
  });

  // Etapa 2: Métodos de pagamento
  const {
    createPixPayment,
    createCardPayment,
    createCardPreference,
    checkPaymentStatus,
    mercadoPagoActive,
    mercadoPagoPublicKey,
    statusLoading,
    isGatewayDisabled,
  } = usePaymentGateway({ forceRefreshOnMount: true });

  const pixAllowedByLink = link.allow_pix !== false;
  const cardAllowedByLink = link.allow_card !== false;
  const maxInstallments = Math.min(Math.max(Number(link.max_installments || 4), 1), 4);

  const canUsePix = pixAllowedByLink && !isGatewayDisabled;
  const canUseCard = cardAllowedByLink && mercadoPagoActive && !!mercadoPagoPublicKey;

  const [paymentTab, setPaymentTab] = useState<'pix' | 'card'>(() =>
    link.allow_pix !== false ? 'pix' : 'card',
  );
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixData, setPixData] = useState<GeneratedPixState | null>(null);
  const [pixError, setPixError] = useState<string | null>(null);

  const [installments, setInstallments] = useState(1);
  const [submittingCard, setSubmittingCard] = useState(false);
  const completedRef = useRef(false);

  // Mantém estado sincronizado em tempo real caso webhook confirme o pagamento
  useEffect(() => {
    setLink(initialLink);
  }, [initialLink]);

  useEffect(() => {
    const channel = supabase
      .channel(`standalone-link-${link.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_links',
          filter: `id=eq.${link.id}`,
        },
        (payload) => {
          if (payload.new) {
            setLink(payload.new as PaymentLinkRecord);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [link.id]);

  // Ajusta aba inicial automaticamente se um método não estiver disponível
  useEffect(() => {
    if (statusLoading) return;
    if (paymentTab === 'pix' && !canUsePix && canUseCard) {
      setPaymentTab('card');
    } else if (paymentTab === 'card' && !canUseCard && canUsePix) {
      setPaymentTab('pix');
    }
  }, [statusLoading, paymentTab, canUsePix, canUseCard]);

  const markLinkCompleted = useCallback(
    async (transactionId?: string | null, paymentMethod: string = 'PIX') => {
      if (completedRef.current) return;
      completedRef.current = true;
      const nowIso = new Date().toISOString();

      try {
        const { error: rpcError } = await (supabase as any).rpc('complete_payment_link', {
          p_token: link.token,
          p_payment_id: null,
          p_transaction_id: transactionId ? String(transactionId) : null,
          p_payment_method: paymentMethod,
          p_paid_at: nowIso,
        });

        if (rpcError) {
          throw rpcError;
        }
      } catch {
        // Fallback direto caso RPC ainda não exista
        await (supabase as any)
          .from('payment_links')
          .update({
            status: 'paid',
            payment_method: paymentMethod,
            paid_at: nowIso,
          })
          .eq('id', link.id);
      }

      setLink((prev) => ({
        ...prev,
        status: 'paid',
        payment_method: paymentMethod,
        paid_at: prev.paid_at || nowIso,
      }));
    },
    [link.id, link.token],
  );

  // Retorno do Mercado Pago Checkout Pro
  useEffect(() => {
    const mpPaymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    const mpStatus = searchParams.get('collection_status') || searchParams.get('status');
    if (!mpPaymentId || link.status === 'paid') return;

    let cancelled = false;
    (async () => {
      if (mpStatus === 'approved') {
        await markLinkCompleted(mpPaymentId, 'Cartão');
        if (!cancelled) {
          toast.success('Pagamento com cartão confirmado!');
        }
        return;
      }

      const checked = await checkPaymentStatus(mpPaymentId, 'mercadopago');
      if (!cancelled && checked && (checked.status === 'approved' || checked.status === 'paid')) {
        await markLinkCompleted(mpPaymentId, 'Cartão');
        toast.success('Pagamento confirmado!');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, link.status, checkPaymentStatus, markLinkCompleted]);

  const generatePixForPayer = useCallback(
    async (payer: ResolvedPayer) => {
      if (!canUsePix) return;
      setGeneratingPix(true);
      setPixError(null);

      try {
        const result = await createPixPayment({
          amount: Number(link.amount),
          description: link.title,
          clientId: payer.clientId,
          clientName: payer.name,
          clientDocument: cleanDocumentDigits(payer.document),
          clientEmail: payer.email,
          paymentLinkId: link.id,
        });

        if (!result || !result.qrCode) {
          setPixError('Não foi possível gerar o QR Code PIX no momento.');
          return;
        }

        setPixData({
          qrCode: result.qrCode,
          qrCodeBase64: result.qrCodeBase64,
          ticketUrl: result.ticketUrl,
          expirationDate: result.expirationDate,
          paymentId: String(result.paymentId),
          gateway: result.gateway,
        });
      } catch (err: any) {
        console.error('Erro ao gerar PIX do link:', err);
        setPixError(err?.message || 'Erro ao gerar código PIX.');
      } finally {
        setGeneratingPix(false);
      }
    },
    [canUsePix, createPixPayment, link.amount, link.id, link.title],
  );

  // Gera o PIX automaticamente quando entra na etapa de pagamento na aba PIX
  useEffect(() => {
    if (
      step === 'payment' &&
      paymentTab === 'pix' &&
      canUsePix &&
      resolvedPayer &&
      !pixData &&
      !generatingPix &&
      !pixError &&
      link.status === 'pending'
    ) {
      void generatePixForPayer(resolvedPayer);
    }
  }, [
    step,
    paymentTab,
    canUsePix,
    resolvedPayer,
    pixData,
    generatingPix,
    pixError,
    link.status,
    generatePixForPayer,
  ]);

  const handleIdentifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIdentifyError(null);

    const trimmedName = payerNameInput.trim().replace(/\s+/g, ' ');
    const cleanDoc = cleanDocumentDigits(payerDocInput);
    const formattedDoc = formatDocumentInput(payerDocInput);

    if (trimmedName.length < 3) {
      setIdentifyError('Informe seu nome completo para continuar.');
      return;
    }

    if (!isValidCpfOrCnpj(cleanDoc)) {
      setIdentifyError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }

    setPreparingPayer(true);
    try {
      let payer: ResolvedPayer | null = null;

      try {
        const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
          'prepare_payment_link_payer',
          {
            p_token: link.token,
            p_name: trimmedName,
            p_document: formattedDoc,
          },
        );

        if (rpcError) throw rpcError;

        if (rpcData?.client_id) {
          payer = {
            clientId: rpcData.client_id,
            name: rpcData.client_name || trimmedName,
            document: rpcData.client_document || formattedDoc,
            email: rpcData.client_email || `${cleanDoc}@cliente.pconassinantes.site`,
          };
        }
      } catch (rpcErr: any) {
        const msg = String(rpcErr?.message || '');
        const code = String(rpcErr?.code || '');
        const isMissingRpc = code === 'PGRST202' || msg.includes('prepare_payment_link_payer');
        if (!isMissingRpc) {
          throw rpcErr;
        }

        // Fallback caso a RPC ainda não esteja publicada
        const { data: allClients } = await supabase
          .from('clients')
          .select('id, name, email, document')
          .limit(500);

        const existingClient = (allClients || []).find(
          (c) => cleanDocumentDigits(c.document) === cleanDoc,
        );

        const fallbackEmail =
          existingClient?.email || `${cleanDoc}@cliente.pconassinantes.site`;
        let clientId = existingClient?.id;

        if (!clientId) {
          const { data: insertedClient, error: insertClientError } = await supabase
            .from('clients')
            .insert({
              name: trimmedName,
              email: fallbackEmail,
              document: formattedDoc,
              status: 'active',
            })
            .select('id')
            .single();
          if (insertClientError) throw insertClientError;
          clientId = insertedClient.id;
        }

        await (supabase as any)
          .from('payment_links')
          .update({
            client_id: clientId,
            payer_name: trimmedName,
            payer_document: formattedDoc,
            payer_email: fallbackEmail,
          })
          .eq('id', link.id);

        payer = {
          clientId,
          name: trimmedName,
          document: formattedDoc,
          email: fallbackEmail,
        };
      }

      if (!payer) {
        throw new Error('Não foi possível registrar seus dados de identificação.');
      }

      // Se o documento/nome mudou em relação a um QR anterior, limpa PIX em cache
      if (
        resolvedPayer &&
        (resolvedPayer.clientId !== payer.clientId ||
          resolvedPayer.document !== payer.document)
      ) {
        setPixData(null);
      }

      setPixError(null);
      setResolvedPayer(payer);
      setLink((prev) => ({
        ...prev,
        client_id: payer!.clientId,
        payer_name: payer!.name,
        payer_document: payer!.document,
        payer_email: payer!.email,
      }));

      // Escolhe a aba inicial permitida
      if (canUsePix) {
        setPaymentTab('pix');
      } else if (canUseCard) {
        setPaymentTab('card');
      }

      setStep('payment');
    } catch (err: any) {
      console.error('Erro ao preparar pagador:', err);
      setIdentifyError(err?.message || 'Erro ao validar seus dados. Tente novamente.');
    } finally {
      setPreparingPayer(false);
    }
  };

  const handleSubmitCardBrick = async (brickData: {
    token: string;
    paymentMethodId: string;
    issuerId?: string;
    installments: number;
    payerEmail: string;
    identificationType: string;
    identificationNumber: string;
    chargedAmount: number;
  }) => {
    if (!resolvedPayer) return;
    setSubmittingCard(true);

    try {
      const response = await createCardPayment({
        token: brickData.token,
        paymentMethodId: brickData.paymentMethodId,
        issuerId: brickData.issuerId,
        installments: brickData.installments,
        amount: Number(link.amount),
        chargedAmount: brickData.chargedAmount,
        description: link.title,
        clientId: resolvedPayer.clientId,
        payerEmail: brickData.payerEmail || resolvedPayer.email,
        payerName: resolvedPayer.name,
        payerDocument:
          cleanDocumentDigits(brickData.identificationNumber) ||
          cleanDocumentDigits(resolvedPayer.document),
        identificationType: brickData.identificationType,
        paymentLinkId: link.id,
      });

      if (!response) {
        return;
      }

      if (response.status === 'approved' || response.status === 'paid') {
        await markLinkCompleted(response.paymentId, 'Cartão');
        toast.success('Pagamento aprovado com sucesso!');
      } else if (response.status === 'in_process' || response.status === 'pending') {
        toast.info('Pagamento em análise pela operadora do cartão.');
      } else {
        toast.error(response.statusDetail || 'Pagamento não autorizado. Verifique os dados do cartão.');
      }
    } finally {
      setSubmittingCard(false);
    }
  };

  const handleCheckoutProFallback = async () => {
    if (!resolvedPayer) return;
    setSubmittingCard(true);
    try {
      const pref = await createCardPreference({
        amount: Number(link.amount),
        description: link.title,
        clientId: resolvedPayer.clientId,
        clientName: resolvedPayer.name,
        clientEmail: resolvedPayer.email,
        maxInstallments,
        backUrl: window.location.href.split('?')[0],
        paymentLinkId: link.id,
      });

      if (pref?.initPoint) {
        window.location.href = pref.initPoint;
      }
    } finally {
      setSubmittingCard(false);
    }
  };

  const isCompactCardView = step === 'payment' && paymentTab === 'card' && link.status === 'pending';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#061224] text-white flex flex-col">
      <BlueBackground />

      {/* Header compacto P-CON */}
      <header className="relative z-10 border-b border-white/10 bg-[#07152b]/75 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between">
          <img
            src="/images/logo-pcon-white.png"
            alt="P-CON"
            className="h-6 sm:h-7 w-auto object-contain"
          />
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-emerald-300/90">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Ambiente Seguro</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-2.5 sm:p-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <Card className="relative overflow-hidden bg-[#0c1d38]/90 backdrop-blur-xl border-white/15 text-white shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-[#32BCAD] via-[#1E4FA3] to-[#009EE3]" />

            <div className="p-4 sm:p-5 space-y-3.5">
              {/* Estado: Cancelado */}
              {link.status === 'cancelled' && (
                <div className="text-center py-6 space-y-4">
                  <div className="mx-auto w-14 h-14 rounded-full bg-red-500/15 border border-red-400/30 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <div className="space-y-1.5">
                    <Badge variant="outline" className="border-red-400/40 text-red-300">
                      Link Cancelado
                    </Badge>
                    <h1 className="text-xl font-bold text-white">{link.title}</h1>
                    <p className="text-sm text-white/65">
                      Esta cobrança foi cancelada ou desativada pelo emissor. Solicite um novo link caso necessário.
                    </p>
                  </div>
                </div>
              )}

              {/* Estado: Pago */}
              {link.status === 'paid' && (
                <div className="text-center py-4 space-y-5">
                  <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                  </div>

                  <div className="space-y-1.5">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/20">
                      Pagamento Confirmado
                    </Badge>
                    <h1 className="text-2xl font-bold text-white">{link.title}</h1>
                    {link.description && (
                      <p className="text-sm text-white/70">{link.description}</p>
                    )}
                  </div>

                  <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-left space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Valor pago</span>
                      <span className="font-bold text-emerald-400 text-base">
                        {formatCurrency(link.amount)}
                      </span>
                    </div>
                    {(link.payer_name || resolvedPayer?.name) && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white/60">Pagador</span>
                        <span className="font-medium text-white text-right">
                          {link.payer_name || resolvedPayer?.name}
                        </span>
                      </div>
                    )}
                    {(link.payer_document || resolvedPayer?.document) && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white/60">CPF/CNPJ</span>
                        <span className="font-mono text-white/90">
                          {formatDocumentInput(link.payer_document || resolvedPayer?.document || '')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Forma</span>
                      <span className="text-white/90">{link.payment_method || 'PIX'}</span>
                    </div>
                    {link.paid_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Data</span>
                        <span className="text-white/90">{formatDateTime(link.paid_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Estado: Pendente */}
              {link.status === 'pending' && (
                <>
                  {/* Resumo padrão (oculto no modo compacto Cartão) */}
                  {!isCompactCardView ? (
                    step === 'identify' ? (
                      <div className="space-y-2 pb-3 border-b border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <Badge className="bg-sky-500/15 text-sky-300 border border-sky-400/30 hover:bg-sky-500/15 text-[11px]">
                            Cobrança P-CON
                          </Badge>
                          <span className="text-[11px] text-white/50">Passo 1 de 2</span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl font-bold text-white leading-snug">
                              {link.title}
                            </h1>
                            {link.description && (
                              <p className="mt-0.5 text-xs text-white/65 line-clamp-2 whitespace-pre-line">
                                {link.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block text-[10px] uppercase tracking-wider text-white/50">
                              Valor
                            </span>
                            <span className="text-lg sm:text-xl font-bold text-emerald-300">
                              {formatCurrency(link.amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Cabeçalho unificado ultra-compacto no Passo 2 (Título + Valor + Pagador) */
                      resolvedPayer && (
                        <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h1 className="text-sm sm:text-base font-bold text-white leading-tight truncate">
                                {link.title}
                              </h1>
                              {link.description && (
                                <p className="text-[11px] text-white/60 line-clamp-1">
                                  {link.description}
                                </p>
                              )}
                            </div>
                            <span className="text-base sm:text-lg font-bold text-emerald-300 shrink-0 leading-tight">
                              {formatCurrency(link.amount)}
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-white/70 truncate">
                              {resolvedPayer.name} ·{' '}
                              <span className="font-mono text-white/55">
                                {resolvedPayer.document}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setStep('identify')}
                              className="text-sky-300 hover:text-sky-200 font-medium shrink-0"
                            >
                              Alterar
                            </button>
                          </div>
                        </div>
                      )
                    )
                  ) : (
                    /* Barra ultra-compacta no modo Cartão */
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                      <div>
                        <p className="text-xs text-white/60 truncate max-w-[230px]">
                          {link.title}
                        </p>
                        <p className="text-sm font-semibold text-white">
                          Valor no cartão ({installments}x) · base {formatCurrency(link.amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {canUsePix && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPaymentTab('pix')}
                            className="h-7 text-xs border-[#32BCAD]/40 bg-[#32BCAD]/10 text-[#6ce6d8] hover:bg-[#32BCAD]/20"
                          >
                            <QrCode className="w-3 h-3 mr-1" />
                            Trocar p/ PIX
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setStep('identify')}
                          className="h-7 text-xs text-white/65 hover:text-white hover:bg-white/10 px-2"
                        >
                          <ArrowLeft className="w-3 h-3 mr-1" />
                          Dados
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ETAPA 1: Identificação obrigatória (Nome + CPF/CNPJ) */}
                  {step === 'identify' && (
                    <form onSubmit={handleIdentifySubmit} className="space-y-3">
                      <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-400/20 px-3 py-2 text-xs text-sky-200/90">
                        <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>
                          Informe <strong>Nome completo</strong> e <strong>CPF ou CNPJ</strong> para continuar.
                        </span>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="payer-name" className="text-white/90 text-xs sm:text-sm">
                          Nome completo *
                        </Label>
                        <Input
                          id="payer-name"
                          value={payerNameInput}
                          onChange={(e) => setPayerNameInput(e.target.value)}
                          placeholder="Ex: Maria da Silva"
                          autoComplete="name"
                          required
                          className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 h-10"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="payer-doc" className="text-white/90 text-xs sm:text-sm">
                          CPF ou CNPJ *
                        </Label>
                        <Input
                          id="payer-doc"
                          value={payerDocInput}
                          onChange={(e) => setPayerDocInput(formatDocumentInput(e.target.value))}
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                          required
                          className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 h-10 font-mono"
                        />
                      </div>

                      {identifyError && (
                        <div className="flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-400/30 px-3 py-2 text-xs text-red-200">
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                          <span>{identifyError}</span>
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={preparingPayer}
                        className="w-full h-10 bg-[#1E4FA3] hover:bg-[#1a448e] text-white font-semibold"
                      >
                        {preparingPayer ? (
                          <>
                            <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                            Validando dados...
                          </>
                        ) : (
                          <>
                            Continuar para pagamento
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </form>
                  )}

                  {/* ETAPA 2: Pagamento */}
                  {step === 'payment' && resolvedPayer && (
                    <div className="space-y-3">
                      {/* Abas de seleção (só aparecem se PIX e Cartão estiverem ambos liberados no link e ativos) */}
                      {canUsePix && canUseCard && !isCompactCardView && (
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.05] border border-white/10">
                          <button
                            type="button"
                            onClick={() => setPaymentTab('pix')}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                              paymentTab === 'pix'
                                ? 'bg-[#32BCAD] text-[#052320] shadow'
                                : 'text-white/75 hover:text-white'
                            }`}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            PIX
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentTab('card')}
                            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                              paymentTab === 'card'
                                ? 'bg-[#009EE3] text-white shadow'
                                : 'text-white/75 hover:text-white'
                            }`}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Cartão
                          </button>
                        </div>
                      )}

                      {/* Aviso caso nenhum método configurado esteja disponível no gateway */}
                      {!statusLoading && !canUsePix && !canUseCard && (
                        <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 p-3.5 text-center space-y-1.5 text-xs text-amber-200">
                          <AlertCircle className="w-5 h-5 mx-auto text-amber-400" />
                          <p className="font-medium">
                            Nenhum meio de pagamento ativo está disponível para este link no momento.
                          </p>
                          <p className="text-amber-200/75">
                            Entre em contato com o suporte para concluir seu pagamento.
                          </p>
                        </div>
                      )}

                      {statusLoading && (
                        <div className="py-6 flex flex-col items-center justify-center gap-2 text-white/70 text-xs">
                          <LoaderCircle className="w-5 h-5 animate-spin text-sky-400" />
                          <span>Carregando opções de pagamento...</span>
                        </div>
                      )}

                      {/* Conteúdo PIX */}
                      {!statusLoading && paymentTab === 'pix' && canUsePix && (
                        <div>
                          {generatingPix && !pixData && (
                            <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-white/75">
                              <LoaderCircle className="w-7 h-7 animate-spin text-[#32BCAD]" />
                              <p className="text-xs sm:text-sm">Gerando código PIX...</p>
                            </div>
                          )}

                          {pixError && !pixData && !generatingPix && (
                            <div className="rounded-xl bg-red-500/15 border border-red-400/30 p-3.5 text-center space-y-2.5">
                              <p className="text-xs sm:text-sm text-red-200">{pixError}</p>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void generatePixForPayer(resolvedPayer)}
                                className="bg-[#32BCAD] hover:bg-[#2aa89a] text-[#052320] font-semibold"
                              >
                                Tentar gerar PIX novamente
                              </Button>
                            </div>
                          )}

                          {pixData && (
                            <PixQRCode
                              compact
                              qrCode={pixData.qrCode}
                              qrCodeBase64={pixData.qrCodeBase64}
                              ticketUrl={pixData.ticketUrl}
                              expirationDate={pixData.expirationDate}
                              paymentId={pixData.paymentId}
                              amount={Number(link.amount)}
                              onCheckStatus={() =>
                                checkPaymentStatus(pixData.paymentId, pixData.gateway)
                              }
                              onPaymentConfirmed={() =>
                                void markLinkCompleted(pixData.paymentId, 'PIX')
                              }
                            />
                          )}
                        </div>
                      )}

                      {/* Conteúdo Cartão */}
                      {!statusLoading && paymentTab === 'card' && canUseCard && mercadoPagoPublicKey && (
                        <SubscriptionCardPayment
                          publicKey={mercadoPagoPublicKey}
                          amount={Number(link.amount)}
                          installments={installments}
                          maxInstallments={maxInstallments}
                          onInstallmentsChange={setInstallments}
                          payerEmail={resolvedPayer.email}
                          payerName={resolvedPayer.name}
                          payerDocument={cleanDocumentDigits(resolvedPayer.document)}
                          submitting={submittingCard}
                          onSubmitBrick={handleSubmitCardBrick}
                          onCheckoutProFallback={handleCheckoutProFallback}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
