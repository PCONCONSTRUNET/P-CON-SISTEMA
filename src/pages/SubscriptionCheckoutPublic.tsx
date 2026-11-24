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
  QrCode,
  ArrowRight,
  RefreshCw,
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
import {
  ensureSubscriptionPaymentLink,
  SubscriptionPaymentLinkRecord,
} from '@/utils/subscriptionLinks';
import pixIcon from '@/assets/pix-icon.svg';

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
          setClientDocument(sub.clients.document);
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
        setClientDocument(typedSub.clients.document);
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
    <div className="min-h-screen relative overflow-hidden">
      <BlueBackground />
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/30 bg-background/50 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src="/images/logo-pcon-white.png" alt="P-CON CONSTRUNET" className="h-14 sm:h-16 w-auto object-contain" />
            </div>
            <Badge
              className={`border ${
                isPaid
                  ? 'bg-success/20 text-success border-success/30'
                  : !isSubscriptionActive || isLinkCancelled
                  ? 'bg-destructive/20 text-destructive border-destructive/30'
                  : 'bg-orange-500/15 text-orange-500 border-orange-500/30'
              }`}
            >
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
        <main className="container mx-auto px-4 py-6 sm:py-10 flex flex-col items-center">
          <div className="w-full max-w-lg space-y-6">
            {/* Title Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card overflow-hidden rounded-2xl flex flex-col"
            >
              <div className="p-6 space-y-4 text-center sm:text-left">
                <span className="inline-flex mx-auto sm:mx-0 items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-500 shadow-[var(--shadow-glow)] backdrop-blur-md w-fit">
                  <ShieldCheck className="h-4 w-4" />
                  Pagamento seguro
                </span>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-heading font-bold leading-tight text-foreground">
                    Pagamento de Assinatura
                  </h1>
                  <p className="text-base sm:text-lg text-foreground/90 font-medium leading-relaxed mt-1">
                    {subData.plan_name}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Amount Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-primary/15 border-b border-border/40 p-5 sm:p-6 text-center sm:text-left">
                    <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-primary">Valor da Mensalidade</p>
                    <div className="mt-2 text-3xl sm:text-4xl font-heading font-bold">
                      {formatCurrency(chargeAmount)}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 space-y-4">
                    {subData.clients?.name && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Cliente</span>
                        <span className="font-semibold">{subData.clients.name}</span>
                      </div>
                    )}

                    {chargeDueDate && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4" /> Vencimento
                        </span>
                        <span className="font-semibold">
                          {new Date(chargeDueDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </span>
                      </div>
                    )}

                    {/* Pagamento Confirmado */}
                    {isPaid && (
                      <div className="space-y-4">
                        <div className="rounded-xl border-2 border-success/40 bg-success/10 p-5 text-center space-y-2">
                          <CheckCircle className="h-10 w-10 text-success mx-auto" />
                          <p className="text-lg font-semibold text-success">Pagamento confirmado!</p>
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
                      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
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
                      <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4 text-center space-y-2">
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

                    {/* Seletor PIX vs Cartão */}
                    {!isPaid &&
                      isSubscriptionActive &&
                      !isLinkCancelled &&
                      !pixPayment &&
                      !pendingCardPaymentId &&
                      !isGatewayDisabled && (
                        <div className="space-y-4 pt-2">
                          {/* Abas PIX / Cartão */}
                          {(canUsePix || canUseCard) && (
                            <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/30 p-1.5 border border-border/40">
                              <button
                                type="button"
                                disabled={!canUsePix}
                                onClick={() => setPaymentTab('pix')}
                                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-sm font-semibold transition-all ${
                                  paymentTab === 'pix'
                                    ? 'bg-primary text-primary-foreground shadow-md'
                                    : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                                }`}
                              >
                                <QrCode className="h-4 w-4" />
                                PIX
                              </button>
                              <button
                                type="button"
                                disabled={!canUseCard}
                                onClick={() => setPaymentTab('card')}
                                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-sm font-semibold transition-all ${
                                  paymentTab === 'card'
                                    ? 'bg-primary text-primary-foreground shadow-md'
                                    : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                                }`}
                              >
                                <CreditCard className="h-4 w-4" />
                                Cartão
                              </button>
                            </div>
                          )}

                          {/* Aba PIX */}
                          {paymentTab === 'pix' && canUsePix && (
                            <div className="space-y-4 pt-1">
                              <div className="space-y-2">
                                <label className="text-xs text-muted-foreground ml-1">CPF ou CNPJ (Obrigatório)</label>
                                <Input
                                  placeholder="000.000.000-00"
                                  value={clientDocument}
                                  onChange={(e) => setClientDocument(e.target.value)}
                                  className="bg-secondary/20 border-border/60 h-11"
                                />
                              </div>

                              {activeGateways.length > 1 && (
                                <div className="space-y-1.5">
                                  <p className="text-xs text-muted-foreground text-center">Escolha o gateway PIX:</p>
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
                                className="w-full h-12 sm:h-14 text-sm sm:text-base font-semibold bg-[#00B4D8] hover:bg-[#0096C7] text-white shadow-[0_0_20px_rgba(0,180,216,0.3)] border-0"
                              >
                                {creatingPix ? (
                                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                ) : (
                                  <img src={pixIcon} alt="PIX" className="h-5 w-5 mr-2 object-contain filter brightness-0 invert" />
                                )}
                                Pagar com PIX
                              </Button>
                            </div>
                          )}

                          {/* Aba Cartão (Mercado Pago) */}
                          {paymentTab === 'card' && canUseCard && (
                            <SubscriptionCardPayment
                              publicKey={mercadoPagoPublicKey}
                              amount={chargeAmount}
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
                      <div className="pt-4 border-t border-border/30 space-y-4">
                        <div className="text-center">
                          <p className="font-semibold text-foreground">Pagamento via PIX</p>
                          <p className="text-sm text-muted-foreground">
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
                            className="w-full text-xs text-muted-foreground"
                            onClick={() => {
                              setPixPayment(null);
                              setPaymentTab('card');
                            }}
                          >
                            Prefere pagar no Cartão de Crédito? Clique aqui
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SubscriptionCheckoutPublic;
