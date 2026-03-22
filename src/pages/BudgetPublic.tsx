import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, Clock3, CreditCard, Download, Eye, FileText, Loader2, ShieldCheck, WalletCards, XCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import BlueBackground from '@/components/BlueBackground';
import ProposalCardPayment, { ProposalCardPaymentFormData } from '@/components/ProposalCardPayment';
import PixQRCode from '@/components/PixQRCode';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Proposal, ProposalStatus } from '@/hooks/useProposals';
import { useMercadoPago } from '@/hooks/useMercadoPago';
import { supabase } from '@/integrations/supabase/client';
import brandImage from '@/assets/pcon-construnet-brand.png';
import pixIcon from '@/assets/pix-icon.svg';
import { generateProposalPDF } from '@/utils/proposalPdfGenerator';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDate = (value: string) => format(new Date(value), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

const statusMap: Record<ProposalStatus, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground border-border' },
  sent: { label: 'Enviado', className: 'bg-primary/15 text-primary border-primary/30' },
  viewed: { label: 'Visualizado', className: 'bg-accent/20 text-accent-foreground border-accent/40' },
  approved: { label: 'Aprovado', className: 'bg-success/20 text-success border-success/30' },
  rejected: { label: 'Recusado', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  entry_paid: { label: 'Entrada paga', className: 'bg-warning/20 text-warning border-warning/30' },
  paid: { label: 'Pago', className: 'bg-success/30 text-success border-success/40' },
  expired: { label: 'Vencido', className: 'bg-warning/15 text-warning border-warning/40' },
};

const normalizeStatus = (proposal: Proposal): Proposal => {
  const expired = ['approved', 'rejected', 'entry_paid', 'paid', 'expired'].includes(proposal.status)
    ? proposal.status === 'expired'
    : new Date(proposal.valid_until).getTime() < Date.now();

  return {
    ...proposal,
    status: expired ? 'expired' : proposal.status,
  };
};

const BudgetPublic = () => {
  const { slug } = useParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState<'entry' | 'total' | 'entry-card' | 'total-card' | null>(null);
  const [selectedChargeType, setSelectedChargeType] = useState<'entry' | 'total'>('total');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [selectedInstallments, setSelectedInstallments] = useState(1);
  const [pixPayment, setPixPayment] = useState<{
    type: 'entry' | 'total';
    paymentId: string;
    qrCode: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expirationDate?: string;
    amount: number;
  } | null>(null);
  const [cardPaymentStatus, setCardPaymentStatus] = useState<{
    type: 'entry' | 'total';
    status: string;
  } | null>(null);
  const hasTrackedView = useRef(false);
  const notificationRetryRef = useRef<Record<string, boolean>>({});
  const { createPixPayment, createCardPayment, checkPaymentStatus } = useMercadoPago();

  useEffect(() => {
    if (!proposal) return;

    if (!proposal.entry_amount && selectedChargeType === 'entry') {
      setSelectedChargeType('total');
    }
  }, [proposal, selectedChargeType]);

  useEffect(() => {
    setPixPayment(null);
    setCardPaymentStatus(null);
  }, [paymentMethod, selectedChargeType]);

  const refreshProposal = useCallback(async (proposalId: string) => {
    const { data, error } = await (supabase as any)
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (error || !data) return;

    setProposal(normalizeStatus(data as Proposal));
  }, []);

  const notifyEvent = async (
    proposalId: string,
    eventType: 'viewed' | 'approved' | 'rejected',
    options?: { skipWhatsapp?: boolean },
  ) => {
    try {
      const { error, data } = await supabase.functions.invoke('proposal-status-notification', {
        body: { proposalId, eventType, skipWhatsapp: options?.skipWhatsapp ?? false },
      });

      if (error) {
        throw error;
      }

      if (data?.success === false) {
        throw new Error(data.error || 'Falha ao enviar notificação automática');
      }
    } catch (error) {
      console.error(`Error notifying proposal event ${eventType}:`, error);
    }
  };

  useEffect(() => {
    if (!proposal) return;

    const retryEvent = proposal.status === 'approved'
      ? (!proposal.approved_notification_sent_at ? 'approved' : null)
      : proposal.status === 'rejected'
        ? (!proposal.rejected_notification_sent_at ? 'rejected' : null)
        : null;

    if (!retryEvent) return;

    const retryKey = `${proposal.id}:${retryEvent}`;
    if (notificationRetryRef.current[retryKey]) return;

    notificationRetryRef.current[retryKey] = true;
    void notifyEvent(proposal.id, retryEvent, { skipWhatsapp: true });
  }, [proposal]);

  useEffect(() => {
    if (!slug || hasTrackedView.current) return;
    hasTrackedView.current = true;

    const loadProposal = async () => {
      try {
        const { data, error } = await (supabase as any).rpc('record_proposal_view', {
          p_public_slug: slug,
        });

        if (error) throw error;
        if (!data) throw new Error('Proposal not found');

        const normalized = normalizeStatus(data as Proposal);
        setProposal(normalized);
        void notifyEvent(normalized.id, 'viewed');
      } catch (error) {
        console.error('Error loading public proposal:', error);
        setProposal(null);
      } finally {
        setLoading(false);
      }
    };

    void loadProposal();
  }, [slug]);

  const canRespond = useMemo(() => {
    if (!proposal) return false;
    return proposal.allow_online_approval && !['approved', 'rejected', 'paid', 'entry_paid', 'expired'].includes(proposal.status);
  }, [proposal]);

  const handleResponse = async (action: 'approve' | 'reject') => {
    if (!slug || !proposal) return;

    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc('respond_to_proposal', {
        p_public_slug: slug,
        p_action: action,
      });

      if (error) throw error;
      if (!data) throw new Error('No proposal returned');

      const normalized = normalizeStatus(data as Proposal);
      setProposal(normalized);
      void notifyEvent(normalized.id, action === 'approve' ? 'approved' : 'rejected');
      toast.success(action === 'approve' ? 'Proposta aprovada com sucesso' : 'Proposta recusada');
    } catch (error) {
      console.error('Error responding to proposal:', error);
      toast.error('Não foi possível registrar sua resposta');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentPlaceholder = (type: 'entry' | 'total') => {
    if (!proposal) return;

    const amount = type === 'entry' ? Number(proposal.entry_amount || 0) : Number(proposal.total_amount || 0);

    if (!amount) {
      toast.error('Não há valor disponível para gerar o pagamento');
      return;
    }

    setCreatingPayment(type);

    void createPixPayment({
      amount,
      description: type === 'entry'
        ? `Entrada da proposta - ${proposal.project_title}`
        : `Pagamento total da proposta - ${proposal.project_title}`,
      clientEmail: proposal.client_email || 'contato@assinaturaspcon.sbs',
      clientName: proposal.client_name,
      clientPhone: proposal.client_phone || undefined,
      proposalId: proposal.id,
      proposalPaymentType: type,
    }).then((result) => {
      if (result?.success && result.paymentId && result.qrCode) {
        setPixPayment({
          type,
          paymentId: result.paymentId,
          qrCode: result.qrCode,
          qrCodeBase64: result.qrCodeBase64,
          ticketUrl: result.ticketUrl,
          expirationDate: result.expirationDate,
          amount,
        });
        toast.success(type === 'entry' ? 'PIX da entrada gerado com sucesso' : 'PIX do pagamento total gerado com sucesso');
      }
    }).finally(() => {
      setCreatingPayment(null);
    });
  };

  const handleCardPayment = async (type: 'entry' | 'total', formData: ProposalCardPaymentFormData) => {
    if (!proposal) return;

    const amount = type === 'entry' ? Number(proposal.entry_amount || 0) : Number(proposal.total_amount || 0);
    const transactionAmount = Number(formData.transaction_amount || amount);

    if (!amount) {
      toast.error('Não há valor disponível para gerar o pagamento');
      return;
    }

    setCreatingPayment(type === 'entry' ? 'entry-card' : 'total-card');

    const result = await createCardPayment({
      amount: transactionAmount,
      description: type === 'entry'
        ? `Entrada da proposta - ${proposal.project_title}`
        : `Pagamento total da proposta - ${proposal.project_title}`,
      clientEmail: proposal.client_email || 'contato@assinaturaspcon.sbs',
      clientName: proposal.client_name,
      clientPhone: proposal.client_phone || undefined,
      proposalId: proposal.id,
      proposalPaymentType: type,
      externalReference: `proposal:${proposal.id}:${type}`,
      token: formData.token,
      issuerId: formData.issuer_id,
      installments: formData.installments,
      paymentMethodId: formData.payment_method_id,
      payerIdentificationType: formData.payer?.identification?.type,
      payerIdentificationNumber: formData.payer?.identification?.number,
    });

    if (result?.success) {
      setPixPayment(null);
      setCardPaymentStatus({ type, status: result.status || 'pending' });

      if (result.status === 'approved') {
        toast.success('Pagamento no cartão aprovado com sucesso');
        await refreshProposal(proposal.id);
      } else {
        toast.success('Pagamento no cartão enviado para processamento');
      }
    }

    setCreatingPayment(null);
  };

  const canPayEntry = !!proposal?.allow_payment && !!proposal?.entry_amount && !['rejected', 'expired', 'entry_paid', 'paid'].includes(proposal?.status || 'draft');
  const canPayTotal = !!proposal?.allow_payment && !['rejected', 'expired', 'paid'].includes(proposal?.status || 'draft');

  const handleCheckPixStatus = async () => {
    if (!pixPayment) return null;

    const result = await checkPaymentStatus(pixPayment.paymentId);

    if (result?.status === 'approved' && proposal) {
      await refreshProposal(proposal.id);
    }

    return result;
  };

  const handlePaymentConfirmed = async () => {
    if (!proposal) return;
    await refreshProposal(proposal.id);
  };

  const selectedAmount = selectedChargeType === 'entry'
    ? Number(proposal?.entry_amount || 0)
    : Number(proposal?.total_amount || 0);

  const canPaySelected = selectedChargeType === 'entry' ? canPayEntry : canPayTotal;

  const handleSelectedPayment = () => {
    if (!canPaySelected) return;

    if (paymentMethod === 'pix') {
      void handlePaymentPlaceholder(selectedChargeType);
      return;
    }
  };

  const handleDownloadPdf = async () => {
    if (!proposal) return;

    setDownloadingPdf(true);
    try {
      await generateProposalPDF(proposal);
    } catch (error) {
      console.error('Error generating proposal PDF:', error);
      toast.error('Não foi possível gerar o PDF da proposta');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <BlueBackground />
        <div className="relative z-10 text-muted-foreground">Carregando proposta...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4">
        <BlueBackground />
        <Card className="glass-card relative z-10 max-w-lg w-full">
          <CardContent className="p-8 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-2xl font-heading font-bold">Proposta não encontrada</h1>
              <p className="text-muted-foreground mt-2">O link pode ter expirado ou não está mais disponível.</p>
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
        <header className="border-b border-border/30 bg-background/50 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src="/images/logo-pcon-white.png" alt="P-CON CONSTRUNET" className="h-14 sm:h-16 w-auto object-contain" />
            </div>
            <Badge className={`border ${statusMap[proposal.status].className}`}>{statusMap[proposal.status].label}</Badge>
          </div>
        </header>

        <main className="container mx-auto px-4 py-10 sm:py-16">
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] items-start">
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                <div className="space-y-4 max-w-3xl">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/20 px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] backdrop-blur-md">
                    <ShieldCheck className="h-4 w-4" />
                    Proposta comercial digital
                  </span>
                  <h1 className="text-4xl sm:text-5xl font-heading font-bold leading-tight">{proposal.project_title}</h1>
                  <p className="text-lg text-muted-foreground leading-relaxed">{proposal.project_description || 'Proposta comercial estruturada para apresentação profissional do projeto.'}</p>
                </div>

                <div className="flex justify-center lg:justify-end">
                  <div className="flex min-h-44 w-full max-w-[280px] items-center justify-center rounded-[2rem] border border-primary/20 bg-background/10 p-6 backdrop-blur-sm shadow-[var(--shadow-glow)]">
                    <img
                      src="/images/logo-pcon-white.png"
                      alt="P-CON CONSTRUNET"
                      className="max-h-20 w-full object-contain sm:max-h-24"
                    />
                  </div>
                </div>
              </div>

              <Card className="glass-card">
                <CardContent className="p-6 grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="text-lg font-semibold">{proposal.client_name}</p>
                    {proposal.client_company && <p className="text-sm text-muted-foreground mt-1">{proposal.client_company}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Validade</p>
                    <p className="text-lg font-semibold">{formatDate(proposal.valid_until)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Prazo</p>
                    <p className="text-lg font-semibold">{proposal.delivery_deadline || 'A combinar'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Prazo para início</p>
                    <p className="text-lg font-semibold">{proposal.start_deadline || 'Imediato após aprovação'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-heading font-semibold">Escopo do projeto</h2>
                  </div>
                  <div className="grid gap-3">
                    {proposal.scope_items?.map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded-2xl border border-border/60 bg-secondary/20 px-4 py-3">
                        {item}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {(proposal.notes || proposal.terms_and_conditions) && (
                <Card className="glass-card">
                  <CardContent className="p-6 space-y-5">
                    {proposal.notes && (
                      <div>
                        <h3 className="font-semibold mb-2">Observações</h3>
                        <p className="text-muted-foreground whitespace-pre-line">{proposal.notes}</p>
                      </div>
                    )}
                    {proposal.terms_and_conditions && (
                      <div>
                        <h3 className="font-semibold mb-2">Termos e condições</h3>
                        <p className="text-muted-foreground whitespace-pre-line">{proposal.terms_and_conditions}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="xl:sticky xl:top-8 space-y-6">
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-primary/15 border-b border-border/40 p-6">
                    <p className="text-sm uppercase tracking-[0.2em] text-primary">Investimento</p>
                    <div className="mt-3 text-4xl font-heading font-bold">{formatCurrency(proposal.total_amount)}</div>
                    {proposal.discount_amount > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">Desconto aplicado: {formatCurrency(proposal.discount_amount)}</p>
                    )}
                  </div>
                  <div className="p-6 space-y-4">
                    {proposal.entry_amount && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                        <span>Valor de entrada</span>
                        <span className="font-semibold">{formatCurrency(proposal.entry_amount)}</span>
                      </div>
                    )}
                    {proposal.monthly_amount && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                        <span>Mensalidade</span>
                        <span className="font-semibold">{formatCurrency(proposal.monthly_amount)}</span>
                      </div>
                    )}
                    {proposal.monthly_amount && (
                      <p className="text-xs text-muted-foreground rounded-xl border border-border/60 bg-secondary/10 px-4 py-3">
                        A mensalidade é apenas informativa nesta etapa e a cobrança será gerada no mês seguinte.
                      </p>
                    )}
                    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2"><Eye className="h-4 w-4" /> Visualizações</span>
                      <span className="font-medium text-foreground">{proposal.view_count}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Última visita</span>
                      <span className="font-medium text-foreground">{proposal.last_viewed_at ? formatDate(proposal.last_viewed_at) : 'Agora'}</span>
                    </div>

                    <div className="grid gap-3 pt-2">
                      <Button onClick={() => handleResponse('approve')} disabled={!canRespond || submitting} className="w-full">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Aprovar proposta
                      </Button>
                      <Button variant="outline" onClick={() => handleResponse('reject')} disabled={!canRespond || submitting} className="w-full">
                        <XCircle className="h-4 w-4 mr-2" />
                        Recusar proposta
                      </Button>
                      <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf} className="w-full">
                        {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        Baixar proposta em PDF
                      </Button>
                      <div className="rounded-2xl border border-border/60 bg-secondary/10 p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <WalletCards className="mt-0.5 h-5 w-5 text-primary" />
                          <div>
                            <p className="font-semibold text-foreground">Escolha como deseja pagar</p>
                            <p className="text-sm text-muted-foreground">Selecione o valor e depois escolha entre PIX ou cartão.</p>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-4">
                            <p className="text-sm font-medium text-foreground">Tipo de pagamento</p>
                            <RadioGroup value={selectedChargeType} onValueChange={(value) => setSelectedChargeType(value as 'entry' | 'total')} className="gap-3">
                              {proposal.entry_amount ? (
                                <Label htmlFor="charge-entry" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                                  <RadioGroupItem id="charge-entry" value="entry" />
                                  <div className="flex-1">
                                    <p className="font-medium text-foreground">Entrada</p>
                                    <p className="text-xs text-muted-foreground">{formatCurrency(Number(proposal.entry_amount || 0))}</p>
                                  </div>
                                </Label>
                              ) : null}
                              <Label htmlFor="charge-total" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                                <RadioGroupItem id="charge-total" value="total" />
                                <div className="flex-1">
                                  <p className="font-medium text-foreground">Valor total</p>
                                  <p className="text-xs text-muted-foreground">{formatCurrency(Number(proposal.total_amount || 0))}</p>
                                </div>
                              </Label>
                            </RadioGroup>
                          </div>

                          <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-4">
                            <p className="text-sm font-medium text-foreground">Método</p>
                            <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as 'pix' | 'card')} className="gap-3">
                              <Label htmlFor="method-pix" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                                <RadioGroupItem id="method-pix" value="pix" />
                                <div className="flex-1">
                                  <p className="flex items-center gap-2 font-medium text-foreground">
                                    <img src={pixIcon} alt="PIX" className="h-4 w-4 object-contain" />
                                    PIX
                                  </p>
                                  <p className="text-xs text-muted-foreground">Gera QR Code instantâneo</p>
                                </div>
                              </Label>
                              <Label htmlFor="method-card" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3">
                                <RadioGroupItem id="method-card" value="card" />
                                <div className="flex-1">
                                  <p className="font-medium text-foreground">Cartão de crédito</p>
                                  <p className="text-xs text-muted-foreground">Pagamento no formulário abaixo com até 4x</p>
                                </div>
                              </Label>
                            </RadioGroup>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
                          Valor selecionado: <span className="font-semibold text-foreground">{formatCurrency(selectedAmount)}</span>
                        </div>

                        {paymentMethod === 'pix' ? (
                          <Button variant="secondary" onClick={handleSelectedPayment} disabled={!canPaySelected || creatingPayment !== null} className="w-full">
                            {creatingPayment === selectedChargeType ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <img src={pixIcon} alt="PIX" className="h-4 w-4 mr-2 object-contain" />}
                            Gerar PIX do pagamento selecionado
                          </Button>
                        ) : (
                          <ProposalCardPayment
                            amount={selectedAmount}
                            payerEmail={proposal.client_email}
                            payerName={proposal.client_name}
                            payerDocument={undefined}
                            installments={selectedInstallments}
                            onInstallmentsChange={setSelectedInstallments}
                            submitting={creatingPayment === (selectedChargeType === 'entry' ? 'entry-card' : 'total-card')}
                            onSubmit={(formData) => handleCardPayment(selectedChargeType, formData)}
                          />
                        )}

                        {cardPaymentStatus && paymentMethod === 'card' && (
                          <div className="rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
                            Status do cartão para {cardPaymentStatus.type === 'entry' ? 'entrada' : 'valor total'}: <span className="font-semibold text-foreground">{cardPaymentStatus.status === 'approved' ? 'aprovado' : 'em processamento'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {pixPayment && (
                      <div className="rounded-2xl border border-border/60 bg-secondary/10 p-4">
                        <div className="mb-4">
                          <p className="text-sm font-medium text-foreground">
                            {pixPayment.type === 'entry' ? 'Pagamento da entrada' : 'Pagamento total'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Use o PIX abaixo para concluir o pagamento desta proposta.
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
                          onPaymentConfirmed={handlePaymentConfirmed}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default BudgetPublic;