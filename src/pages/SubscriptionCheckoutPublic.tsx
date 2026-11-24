import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShieldCheck,
  XCircle,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  RefreshCw,
  Calendar,
  User,
  Lock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BlueBackground from '@/components/BlueBackground';
import PixQRCode from '@/components/PixQRCode';
import SubscriptionCardPayment, { CardPaymentFormData } from '@/components/SubscriptionCardPayment';
import { supabase } from '@/integrations/supabase/client';
import { usePaymentGateway, PaymentGatewayId, GATEWAY_LABELS } from '@/hooks/usePaymentGateway';
import { calculateCardPricing } from '@/utils/cardFees';
import {
  ensureSubscriptionPaymentLink,
  SubscriptionPaymentLinkRecord,
} from '@/utils/subscriptionLinks';
import pixIcon from '@/assets/pix-icon.svg';
import mercadoPagoIcon from '@/assets/mercado-pago-icon.png';

interface SubscriptionData {
  id: string;
  plan_name: string;
  value: number;
  status: string;
  next_payment: string;
  clients: {
    id: string;
    name: string;
    email: string;
    document: string | null;
    phone: string | null;
  };
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDocumentInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const SubscriptionCheckoutPublic = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [linkRecord, setLinkRecord] = useState<SubscriptionPaymentLinkRecord | null>(null);
  const [nextCycleLink, setNextCycleLink] = useState<SubscriptionPaymentLinkRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPix, setCreatingPix] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'pix' | 'card'>('pix');
  const [cardInstallments, setCardInstallments] = useState(1);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGatewayId | null>(null);
  const [clientDocument, setClientDocument] = useState('');
  const [pendingCardPaymentId, setPendingCardPaymentId] = useState<string | null>(null);
  const [checkingCardStatus, setCheckingCardStatus] = useState(false);
  const [isPaidLocally, setIsPaidLocally] = useState(false);
  const [paidMethodLabel, setPaidMethodLabel] = useState<string | null>(null);

  const {
    createPixPayment,
    createCardPayment,
    createCardPreference,
    checkPaymentStatus,
    activeGateways,
    defaultGateway,
    mercadoPagoActive,
    mercadoPagoPublicKey,
    statusLoading: gatewayStatusLoading,
    isGatewayDisabled,
  } = usePaymentGateway();

  const [pixPayment, setPixPayment] = useState<{
    paymentId: string;
    qrCode: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expirationDate?: string;
    amount: number;
    gatewayUsed?: PaymentGatewayId;
  } | null>(null);

  const loadCheckoutData = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setPixPayment(null);
    setPendingCardPaymentId(null);
    setIsPaidLocally(false);

    try {
      // 1. Tenta localizar pelo token único do link do ciclo
      const { data: linkMatch } = await supabase
        .from('subscription_payment_links')
        .select(`
          *,
          subscriptions!inner (
            id, plan_name, value, status, next_payment,
            clients!inner (id, name, email, document, phone)
          )
        `)
        .eq('token', id)
        .maybeSingle();

      if (linkMatch) {
        const sub = (linkMatch as unknown as { subscriptions: SubscriptionData }).subscriptions;
        const link = linkMatch as unknown as SubscriptionPaymentLinkRecord;
        setLinkRecord(link);
        setSubData(sub);
        setPaidMethodLabel(link.payment_method || null);
        if (sub?.clients?.document) {
          setClientDocument(formatDocumentInput(sub.clients.document));
        }

        // Se este link já foi pago, procura se há um link pendente para o próximo mês
        if (link.status === 'paid') {
          const { data: newerPending } = await supabase
            .from('subscription_payment_links')
            .select('*')
            .eq('subscription_id', sub.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          setNextCycleLink((newerPending as SubscriptionPaymentLinkRecord) || null);
        } else {
          setNextCycleLink(null);
        }
        return;
      }

      // 2. Fallback para links legados por UUID da assinatura ou primeiro nome
      let query = supabase
        .from('subscriptions')
        .select(`
          id, plan_name, value, status, next_payment,
          clients!inner (id, name, email, document, phone)
        `);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(id)) {
        query = query.eq('id', id);
      } else {
        const decodedId = decodeURIComponent(id);
        query = query.ilike('clients.name', `${decodedId}%`).eq('status', 'active');
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error || !data) throw new Error('Assinatura não encontrada');

      const typedSub = data as unknown as SubscriptionData;
      setSubData(typedSub);
      if (typedSub.clients?.document) {
        setClientDocument(formatDocumentInput(typedSub.clients.document));
      }

      const ensuredLink = await ensureSubscriptionPaymentLink({
        id: typedSub.id,
        client_id: typedSub.clients.id,
        value: typedSub.value,
        next_payment: typedSub.next_payment,
        status: typedSub.status,
      });
      setLinkRecord(ensuredLink);
      setNextCycleLink(null);
    } catch (err) {
      console.error('Error loading subscription checkout:', err);
      setSubData(null);
      setLinkRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCheckoutData();
  }, [loadCheckoutData]);

  // Verifica retorno do Checkout Pro (quando voltou redirecionado do Mercado Pago)
  useEffect(() => {
    const mpPaymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
    const mpStatus = searchParams.get('collection_status') || searchParams.get('status');
    if (!mpPaymentId || isPaidLocally || linkRecord?.status === 'paid') return;

    const verifyReturn = async () => {
      const res = await checkPaymentStatus(mpPaymentId, 'mercadopago');
      if (res?.success && (res.status === 'approved' || res.status === 'paid' || mpStatus === 'approved')) {
        setIsPaidLocally(true);
        setPaidMethodLabel('CREDIT_CARD');
        toast.success('Pagamento confirmado! Assinatura renovada para o próximo mês.');
        setTimeout(() => void loadCheckoutData(), 900);
      }
    };
    void verifyReturn();
  }, [searchParams, isPaidLocally, linkRecord?.status, checkPaymentStatus, loadCheckoutData]);

  // Se apenas Cartão estiver disponível ou se gateway mudar, garante aba válida
  const canUsePix = activeGateways.length > 0;
  const canUseCard = mercadoPagoActive === true;

  useEffect(() => {
    if (!canUsePix && canUseCard && paymentTab !== 'card') {
      setPaymentTab('card');
    } else if (canUsePix && !canUseCard && paymentTab !== 'pix') {
      setPaymentTab('pix');
    }
  }, [canUsePix, canUseCard, paymentTab]);

  const isSubscriptionActive = subData?.status === 'active';
  const isLinkCancelled = linkRecord?.status === 'cancelled';
  const isPaid = isPaidLocally || linkRecord?.status === 'paid';
  const chargeAmount = Number(linkRecord?.amount ?? subData?.value ?? 0);
  const chargeDueDate = linkRecord?.due_date || subData?.next_payment;
  const cardPricing = calculateCardPricing(chargeAmount, cardInstallments);
  const isCardCheckoutView =
    paymentTab === 'card' &&
    canUseCard &&
    !isPaid &&
    isSubscriptionActive &&
    !isLinkCancelled &&
    !pixPayment &&
    !pendingCardPaymentId &&
    !isGatewayDisabled;
  // Mercado Pago é o gateway preferido (PIX + cartão no mesmo lugar)
  const preferredDefaultGateway: PaymentGatewayId | null = activeGateways.includes('mercadopago')
    ? 'mercadopago'
    : defaultGateway;
  const activeGatewayChoice =
    selectedGateway && activeGateways.includes(selectedGateway) ? selectedGateway : preferredDefaultGateway;

  const handlePixPayment = async () => {
    if (!subData || !isSubscriptionActive || isLinkCancelled || isGatewayDisabled) return;

    if (!clientDocument || clientDocument.replace(/\D/g, '').length < 11) {
      toast.error('Informe um CPF ou CNPJ válido para gerar o PIX.');
      return;
    }

    setCreatingPix(true);
    try {
      const result = await createPixPayment(
        {
          amount: chargeAmount,
          description: `Pagamento - ${subData.plan_name}`,
          clientId: subData.clients.id,
          clientName: subData.clients.name,
          clientEmail: subData.clients.email || 'cliente@pconassinantes.site',
          clientDocument,
          subscriptionId: subData.id,
          subscriptionLinkId: linkRecord?.id,
        },
        activeGatewayChoice || undefined,
      );

      if (result?.success && result.paymentId) {
        setPixPayment({
          paymentId: result.paymentId,
          qrCode: result.qrCode || '',
          qrCodeBase64: result.qrCodeBase64,
          ticketUrl: result.ticketUrl,
          expirationDate: result.expirationDate,
          amount: chargeAmount,
          gatewayUsed: result.gatewayUsed,
        });
      }
    } catch (err) {
      console.error('Error generating PIX:', err);
      toast.error('Ocorreu um erro ao gerar o pagamento.');
    } finally {
      setCreatingPix(false);
    }
  };

  const handleCheckPixStatus = async () => {
    if (!pixPayment) return null;
    const result = await checkPaymentStatus(pixPayment.paymentId, pixPayment.gatewayUsed);
    if (result?.success && (result.status === 'paid' || result.status === 'approved')) {
      setIsPaidLocally(true);
      setPaidMethodLabel('PIX');
      setTimeout(() => void loadCheckoutData(), 900);
    }
    return result;
  };

  const handlePixConfirmed = () => {
    setIsPaidLocally(true);
    setPaidMethodLabel('PIX');
    setTimeout(() => void loadCheckoutData(), 900);
  };

  const handleCardBrickSubmit = async (formData: CardPaymentFormData) => {
    if (!subData || !isSubscriptionActive || isLinkCancelled) return;

    setSubmittingCard(true);
    try {
      const result = await createCardPayment({
        amount: formData.transaction_amount,
        description: `Pagamento - ${subData.plan_name}`,
        clientId: subData.clients.id,
        clientEmail: formData.payer?.email || subData.clients.email || 'cliente@pconassinantes.site',
        clientName: subData.clients.name,
        clientPhone: subData.clients.phone || undefined,
        clientDocument: formData.payer?.identification?.number || clientDocument || subData.clients.document || undefined,
        subscriptionId: subData.id,
        subscriptionLinkId: linkRecord?.id,
        externalReference: linkRecord?.id ? `sublink:${linkRecord.id}` : `sub:${subData.id}`,
        token: formData.token,
        issuerId: formData.issuer_id,
        installments: formData.installments,
        paymentMethodId: formData.payment_method_id,
        payerIdentificationType: formData.payer?.identification?.type,
        payerIdentificationNumber: formData.payer?.identification?.number,
      });

      if (!result) return;

      if (result.status === 'approved') {
        setIsPaidLocally(true);
        setPaidMethodLabel('CREDIT_CARD');
        toast.success('Pagamento aprovado no cartão! Assinatura renovada para o próximo mês.');
        setTimeout(() => void loadCheckoutData(), 900);
      } else if (result.status === 'in_process' || result.status === 'pending') {
        setPendingCardPaymentId(result.paymentId || null);
        toast.info('Pagamento em análise no Mercado Pago. Assim que aprovar, sua assinatura será renovada.');
      } else {
        toast.error('Pagamento não aprovado pela operadora. Verifique os dados ou tente via PIX.');
      }
    } finally {
      setSubmittingCard(false);
    }
  };

  const handleCheckoutProFallback = async (pricingTotal: number, installments: number) => {
    if (!subData) return;

    setSubmittingCard(true);
    try {
      const result = await createCardPreference({
        amount: pricingTotal,
        title: `Assinatura ${subData.plan_name}`,
        description: `Pagamento - ${subData.plan_name}`,
        clientEmail: subData.clients.email || 'cliente@pconassinantes.site',
        clientId: subData.clients.id,
        clientName: subData.clients.name,
        clientDocument: clientDocument || subData.clients.document || undefined,
        subscriptionId: subData.id,
        subscriptionLinkId: linkRecord?.id,
        externalReference: linkRecord?.id ? `sublink:${linkRecord.id}` : `sub:${subData.id}`,
        maxInstallments: installments,
        returnUrl: window.location.href,
      });

      if (result?.initPoint) {
        window.location.href = result.initPoint;
      }
    } finally {
      setSubmittingCard(false);
    }
  };

  const handleCheckPendingCard = async () => {
    if (!pendingCardPaymentId) return;
    setCheckingCardStatus(true);
    try {
      const res = await checkPaymentStatus(pendingCardPaymentId, 'mercadopago');
      if (res?.success && (res.status === 'approved' || res.status === 'paid')) {
        setIsPaidLocally(true);
        setPaidMethodLabel('CREDIT_CARD');
        setPendingCardPaymentId(null);
        toast.success('Pagamento no cartão aprovado! Assinatura renovada.');
        setTimeout(() => void loadCheckoutData(), 900);
      } else if (res?.status === 'rejected' || res?.status === 'cancelled') {
        setPendingCardPaymentId(null);
        toast.error('O pagamento no cartão foi recusado.');
      } else {
        toast.info('Pagamento ainda em análise. Aguarde alguns instantes.');
      }
    } finally {
      setCheckingCardStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <BlueBackground />
        <div className="relative z-10 text-muted-foreground flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full spinner-blue" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!subData) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4">
        <BlueBackground />
        <Card className="glass-card relative z-10 max-w-lg w-full">
          <CardContent className="p-8 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-2xl font-heading font-bold">Assinatura não encontrada</h1>
              <p className="text-muted-foreground mt-2">Este link de pagamento não existe ou é inválido.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden flex flex-col">
      <BlueBackground />
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Slim Header / Navbar */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06142e]/80 backdrop-blur-xl">
          <div className="container mx-auto max-w-lg px-4 py-2 flex items-center justify-between gap-3">
            <img
              src="/images/logo-pcon-white.png"
              alt="P-CON CONSTRUNET"
              className="h-7 sm:h-8 w-auto object-contain"
            />
            <Badge
              className={`border px-2.5 py-0.5 text-[11px] font-medium flex items-center gap-1.5 ${
                isPaid
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : !isSubscriptionActive || isLinkCancelled
                  ? 'bg-destructive/15 text-red-300 border-destructive/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isPaid
                    ? 'bg-emerald-400'
                    : !isSubscriptionActive || isLinkCancelled
                    ? 'bg-red-400'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              {isPaid
                ? 'Pago'
                : !isSubscriptionActive
                ? 'Inativa'
                : isLinkCancelled
                ? 'Cancelado'
                : 'Aguardando pagamento'}
            </Badge>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-5 sm:py-8 flex-1 flex flex-col items-center justify-start">
          <div className="w-full max-w-lg space-y-4">
            {/* Unified Premium Checkout Card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <Card className="glass-card overflow-hidden border-white/15 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.65)]">
                {/* Top vibrant accent bar */}
                <div className="h-1 w-full bg-gradient-to-r from-[#32BCAD] via-[#1E4FA3] to-[#009EE3]" />

                <CardContent className="p-0">
                  {isCardCheckoutView ? (
                    /* Modo Cartão: esconde detalhes de cima e deixa apenas Valor + botão rápido para voltar ao PIX */
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#0e2550]/80 to-[#091836]/80 px-4 py-3.5 sm:px-5">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.15em] text-sky-300/80 font-medium">
                          Valor no cartão ({cardInstallments}x)
                        </p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-white">
                            {formatCurrency(cardPricing.totalCustomerAmount)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            ({cardInstallments}x de {formatCurrency(cardPricing.installmentAmount)})
                          </span>
                        </div>
                      </div>

                      {canUsePix && (
                        <button
                          type="button"
                          onClick={() => setPaymentTab('pix')}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.12] transition-colors"
                        >
                          <img src={pixIcon} alt="PIX" className="h-3.5 w-3.5 object-contain" />
                          Trocar p/ PIX
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Hero / Plan & Amount Header */
                    <div className="relative overflow-hidden bg-gradient-to-br from-[#1E4FA3]/30 via-[#0e2550]/60 to-[#091836]/80 border-b border-white/10 p-5">
                      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#32BCAD]/15 blur-2xl" />
                      <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-[#009EE3]/15 blur-2xl" />

                      <div className="relative flex items-center justify-between gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Pagamento seguro
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-blue-100/80">
                          <Sparkles className="h-3 w-3 text-sky-300" />
                          Mensalidade
                        </span>
                      </div>

                      <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-sky-300/80 font-medium">
                            Assinatura
                          </p>
                          <h1 className="text-lg sm:text-xl font-heading font-bold text-white truncate">
                            {subData.plan_name}
                          </h1>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] text-blue-100/60">Valor a pagar</p>
                          <div className="flex items-baseline sm:justify-end gap-1">
                            <span className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-white">
                              {formatCurrency(chargeAmount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Body */}
                  <div className="p-4 sm:p-5 space-y-4">
                    {/* Compact Client & Due Date Row (oculto no modo Cartão) */}
                    {!isCardCheckoutView && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <User className="h-3 w-3 text-sky-400 shrink-0" />
                            Cliente
                          </p>
                          <p className="text-xs sm:text-sm font-semibold text-foreground truncate mt-0.5">
                            {subData.clients?.name || 'Cliente'}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 text-emerald-400 shrink-0" />
                            Vencimento
                          </p>
                          <p className="text-xs sm:text-sm font-semibold text-foreground mt-0.5">
                            {chargeDueDate
                              ? new Date(chargeDueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                              : '—'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Pagamento Confirmado */}
                    {isPaid && (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center space-y-2">
                          <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto" />
                          <p className="text-lg font-semibold text-emerald-300">Pagamento confirmado!</p>
                          <p className="text-sm text-muted-foreground">
                            Sua assinatura foi renovada automaticamente para o próximo mês
                            {paidMethodLabel ? ` (${paidMethodLabel === 'CREDIT_CARD' ? 'Cartão de Crédito' : paidMethodLabel})` : ''}.
                          </p>
                          {linkRecord?.paid_at && (
                            <p className="text-xs text-muted-foreground">
                              Confirmado em {new Date(linkRecord.paid_at).toLocaleString('pt-BR')}
                            </p>
                          )}
                        </div>

                        {nextCycleLink && (
                          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-3 text-center">
                            <p className="text-xs text-muted-foreground">
                              Próxima fatura disponível — vencimento em{' '}
                              <strong className="text-foreground">
                                {new Date(nextCycleLink.due_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                              </strong>
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/pagar-assinatura/${nextCycleLink.token}`)}
                              className="gap-2 border-primary/40 hover:bg-primary/20"
                            >
                              Acessar link do próximo mês
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {(!isSubscriptionActive || isLinkCancelled) && !isPaid && (
                      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
                        <XCircle className="h-8 w-8 text-destructive mx-auto" />
                        <p className="font-semibold text-destructive">
                          {isLinkCancelled ? 'Link de Pagamento Cancelado' : 'Assinatura Inativa'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Esta cobrança não está mais disponível para pagamento.
                        </p>
                      </div>
                    )}

                    {isGatewayDisabled && !isPaid && isSubscriptionActive && !isLinkCancelled && !pixPayment && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center space-y-2">
                        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
                        <p className="font-semibold text-amber-300">
                          Pagamentos online temporariamente desativados
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Os gateways de pagamento estão desativados no momento. Entre em contato com o suporte para mais informações.
                        </p>
                      </div>
                    )}

                    {/* Pagamento pendente em análise no cartão */}
                    {pendingCardPaymentId && !isPaid && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center space-y-3">
                        <Clock className="h-8 w-8 text-amber-400 mx-auto" />
                        <p className="font-semibold text-amber-300">Pagamento no cartão em análise</p>
                        <p className="text-xs text-muted-foreground">
                          Assim que o Mercado Pago confirmar a operação, este link será marcado como pago automaticamente.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCheckPendingCard}
                          disabled={checkingCardStatus}
                          className="gap-2"
                        >
                          <RefreshCw className={`h-4 w-4 ${checkingCardStatus ? 'animate-spin' : ''}`} />
                          {checkingCardStatus ? 'Verificando...' : 'Verificar aprovação'}
                        </Button>
                      </div>
                    )}

                    {/* Skeleton imediato enquanto verifica meios de pagamento na 1ª visita */}
                    {!isPaid &&
                      isSubscriptionActive &&
                      !isLinkCancelled &&
                      !pixPayment &&
                      !pendingCardPaymentId &&
                      !isGatewayDisabled &&
                      !canUsePix &&
                      !canUseCard &&
                      gatewayStatusLoading && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Carregando opções de pagamento...</span>
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="h-[62px] rounded-xl border border-white/10 bg-white/[0.04] animate-pulse" />
                            <div className="h-[62px] rounded-xl border border-white/10 bg-white/[0.04] animate-pulse" />
                          </div>
                          <div className="h-12 rounded-xl border border-white/10 bg-white/[0.05] animate-pulse" />
                        </div>
                      )}

                    {/* Seletor PIX vs Cartão com ícones do sistema */}
                    {!isPaid &&
                      isSubscriptionActive &&
                      !isLinkCancelled &&
                      !pixPayment &&
                      !pendingCardPaymentId &&
                      !isGatewayDisabled && (
                        <div className="space-y-4">
                          {!isCardCheckoutView && (canUsePix || canUseCard) && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Escolha como deseja pagar
                              </p>
                              <div className="grid grid-cols-2 gap-2.5">
                                <button
                                  type="button"
                                  disabled={!canUsePix}
                                  onClick={() => setPaymentTab('pix')}
                                  className={`group relative flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                                    paymentTab === 'pix'
                                      ? 'border-[#32BCAD]/70 bg-gradient-to-br from-[#32BCAD]/20 to-[#1E4FA3]/25 shadow-[0_0_24px_rgba(50,188,173,0.2)]'
                                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed'
                                  }`}
                                >
                                  <div
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                                      paymentTab === 'pix'
                                        ? 'border-[#32BCAD]/40 bg-[#32BCAD]/15'
                                        : 'border-white/10 bg-white/5'
                                    }`}
                                  >
                                    <img src={pixIcon} alt="PIX" className="h-5 w-5 object-contain" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white leading-tight">PIX</p>
                                    <p className="text-[11px] text-emerald-300/90 truncate">Na hora</p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  disabled={!canUseCard}
                                  onClick={() => setPaymentTab('card')}
                                  className={`group relative flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                                    paymentTab === 'card'
                                      ? 'border-[#009EE3]/70 bg-gradient-to-br from-[#009EE3]/20 to-[#1E4FA3]/30 shadow-[0_0_24px_rgba(0,158,227,0.22)]'
                                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-45 disabled:cursor-not-allowed'
                                  }`}
                                >
                                  <div
                                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                                      paymentTab === 'card'
                                        ? 'border-[#009EE3]/50 bg-[#009EE3]/20'
                                        : 'border-white/10 bg-white/5'
                                    }`}
                                  >
                                    <CreditCard className="h-4.5 w-4.5 text-sky-300" />
                                    <img
                                      src={mercadoPagoIcon}
                                      alt="Mercado Pago"
                                      className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-[#0a1d3d] bg-white object-contain p-[1px]"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white leading-tight">Cartão</p>
                                    <p className="text-[11px] text-sky-200/80 truncate">
                                      {canUseCard ? 'Até 4x' : 'Indisponível'}
                                    </p>
                                  </div>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Aba PIX */}
                          {paymentTab === 'pix' && canUsePix && (
                            <div className="space-y-3.5 pt-1">
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground ml-0.5">
                                  CPF ou CNPJ do pagador (Obrigatório)
                                </label>
                                <Input
                                  placeholder="000.000.000-00"
                                  value={clientDocument}
                                  onChange={(e) => setClientDocument(formatDocumentInput(e.target.value))}
                                  inputMode="numeric"
                                  className="bg-white/[0.04] border-white/15 h-11 text-sm tracking-wide focus:border-[#32BCAD]/70"
                                />
                              </div>

                              {activeGateways.length > 1 && (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] text-muted-foreground text-center">Gateway PIX:</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {activeGateways.map((gw) => (
                                      <button
                                        key={gw}
                                        type="button"
                                        onClick={() => setSelectedGateway(gw)}
                                        className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                                          activeGatewayChoice === gw
                                            ? 'border-primary bg-primary/20 text-foreground'
                                            : 'border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground'
                                        }`}
                                      >
                                        {GATEWAY_LABELS[gw]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <Button
                                onClick={handlePixPayment}
                                disabled={creatingPix || gatewayStatusLoading}
                                className="w-full h-12 text-sm sm:text-base font-bold text-white border-0 btn-pix rounded-xl shadow-[0_8px_28px_rgba(5,186,218,0.35)] gap-2.5"
                              >
                                {creatingPix ? (
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                  <img src={pixIcon} alt="PIX" className="h-5 w-5 object-contain brightness-0 invert" />
                                )}
                                {creatingPix ? 'Gerando QR Code PIX...' : 'Pagar com PIX'}
                              </Button>
                            </div>
                          )}

                          {/* Aba Cartão (Mercado Pago) */}
                          {paymentTab === 'card' && canUseCard && (
                            <SubscriptionCardPayment
                              publicKey={mercadoPagoPublicKey}
                              amount={chargeAmount}
                              installments={cardInstallments}
                              onInstallmentsChange={setCardInstallments}
                              payerEmail={subData.clients?.email}
                              payerName={subData.clients?.name || 'Cliente'}
                              payerDocument={clientDocument || subData.clients?.document}
                              submitting={submittingCard}
                              onSubmitBrick={handleCardBrickSubmit}
                              onCheckoutProFallback={handleCheckoutProFallback}
                            />
                          )}

                          {paymentTab === 'card' && !canUseCard && !gatewayStatusLoading && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs text-amber-200">
                              Pagamento com cartão via Mercado Pago está desativado no momento. Utilize o PIX.
                            </div>
                          )}
                        </div>
                      )}

                    {/* PIX QR Code */}
                    {pixPayment && !isPaid && (
                      <div className="pt-3 border-t border-white/10 space-y-4">
                        <div className="text-center">
                          <p className="font-semibold text-foreground">Pagamento via PIX</p>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            Use o QR Code ou código copia e cola abaixo. A confirmação é automática.
                          </p>
                        </div>
                        <PixQRCode
                          paymentId={pixPayment.paymentId}
                          qrCode={pixPayment.qrCode}
                          qrCodeBase64={pixPayment.qrCodeBase64}
                          ticketUrl={pixPayment.ticketUrl}
                          expirationDate={pixPayment.expirationDate}
                          amount={pixPayment.amount}
                          onCheckStatus={handleCheckPixStatus}
                          onPaymentConfirmed={handlePixConfirmed}
                        />
                        {canUseCard && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground hover:text-white gap-2"
                            onClick={() => {
                              setPixPayment(null);
                              setPaymentTab('card');
                            }}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Prefere pagar no Cartão de Crédito? Clique aqui
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Trust & Payment Methods Footer */}
            <div className="flex flex-col items-center gap-2.5 pt-1 pb-4">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3 text-emerald-400" />
                Ambiente criptografado • Pagamento processado com segurança
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-blue-100/85">
                  <img src={pixIcon} alt="PIX" className="h-4 w-4 object-contain" />
                  <span>PIX</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-blue-100/85">
                  <CreditCard className="h-4 w-4 text-sky-400" />
                  <span>Cartão de Crédito</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-blue-100/85">
                  <img src={mercadoPagoIcon} alt="Mercado Pago" className="h-4 w-4 rounded-full object-contain" />
                  <span>Mercado Pago</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SubscriptionCheckoutPublic;
