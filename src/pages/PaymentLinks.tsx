import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Ban,
  Building2,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  PaymentLinkRecord,
  buildStandalonePaymentUrl,
  usePaymentLinks,
} from '@/hooks/usePaymentLinks';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import { useOptionalGlobalData } from '@/contexts/GlobalDataContext';
import { formatBrazilDateTime } from '@/utils/dateUtils';
import { formatDocumentInput } from '@/utils/documentValidation';
import { generatePaymentReceiptPDF } from '@/utils/paymentReceiptPdfGenerator';
import { toast } from 'sonner';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const parseAmountInput = (raw: string): number => {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return NaN;
  if (cleaned.includes(',')) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return Number(cleaned);
};

export default function PaymentLinks() {
  const { links, loading, error, createLink, updateLink, configureLinkBilling, deleteLink, refetch } =
    usePaymentLinks();
  const globalData = useOptionalGlobalData();
  const selectableClients = useMemo(
    () => (globalData?.clients || []).filter((c) => c.status !== 'inactive'),
    [globalData?.clients],
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal Criar / Editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<PaymentLinkRecord | null>(null);
  const [createdLink, setCreatedLink] = useState<PaymentLinkRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [originalAmountInput, setOriginalAmountInput] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [allowPix, setAllowPix] = useState(true);
  const [allowCard, setAllowCard] = useState(true);
  const [maxInstallments, setMaxInstallments] = useState('4');

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<PaymentLinkRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Modal de Detalhes / Comprovante
  const [detailsLink, setDetailsLink] = useState<PaymentLinkRecord | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  const [linkedPaymentData, setLinkedPaymentData] = useState<{
    id: string;
    amount: number;
    status: string;
    payment_method: string | null;
    transaction_id: string | null;
    asaas_id: string | null;
    paid_at: string | null;
    created_at: string;
    description: string | null;
  } | null>(null);
  const [linkedInvoiceNumber, setLinkedInvoiceNumber] = useState<string | null>(null);
  const [liveMpInfo, setLiveMpInfo] = useState<{
    status?: string | null;
    statusDetail?: string | null;
    paidAt?: string | null;
  } | null>(null);

  const openDetailsModal = async (item: PaymentLinkRecord) => {
    setDetailsLink(item);
    setLinkedPaymentData(null);
    setLinkedInvoiceNumber(null);
    setLiveMpInfo(null);
    setDetailsLoading(true);

    try {
      let paymentRow: any = null;
      if (item.payment_id) {
        const { data } = await supabase
          .from('payments')
          .select('id, amount, status, payment_method, transaction_id, asaas_id, paid_at, created_at, description')
          .eq('id', item.payment_id)
          .maybeSingle();
        paymentRow = data;
      }

      if (!paymentRow) {
        const { data } = await (supabase as any)
          .from('payments')
          .select('id, amount, status, payment_method, transaction_id, asaas_id, paid_at, created_at, description')
          .eq('payment_link_id', item.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        paymentRow = data;
      }

      if (paymentRow) {
        setLinkedPaymentData(paymentRow);

        const { data: invData } = await supabase
          .from('invoices')
          .select('number')
          .eq('payment_id', paymentRow.id)
          .order('issued_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (invData?.number) {
          setLinkedInvoiceNumber(invData.number);
        }

        // Consulta status detalhado no Mercado Pago quando transaction_id numérico
        if (paymentRow.transaction_id && /^\d+$/.test(String(paymentRow.transaction_id).trim())) {
          try {
            const { data: mpRes } = await supabase.functions.invoke('mercadopago', {
              body: {
                _action: 'check-status',
                paymentId: String(paymentRow.transaction_id).trim(),
              },
            });
            if (mpRes?.success) {
              setLiveMpInfo({
                status: mpRes.status || null,
                statusDetail: mpRes.statusDetail || null,
                paidAt: mpRes.paidAt || null,
              });
            }
          } catch {
            // Falha silenciosa: dados principais seguem disponíveis do banco
          }
        }
      }
    } catch (err) {
      console.error('Error loading payment link details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCopyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado!`);
    } catch {
      toast.info(`${label}: ${value}`);
    }
  };

  const detectGatewayLabel = (): string => {
    if (linkedPaymentData?.asaas_id) return 'Asaas / Gateway';
    const tx = linkedPaymentData?.transaction_id || '';
    if (/^\d+$/.test(tx)) return 'Mercado Pago';
    if (/^[a-f0-9]{20,}$/i.test(tx)) return 'EFI Bank';
    return 'Mercado Pago';
  };

  const handleDownloadReceipt = async () => {
    if (!detailsLink) return;
    setGeneratingReceipt(true);
    try {
      await generatePaymentReceiptPDF({
        title: detailsLink.title,
        description: detailsLink.description,
        amount: Number(linkedPaymentData?.amount ?? detailsLink.amount),
        status: linkedPaymentData?.status || detailsLink.status,
        paymentMethod: linkedPaymentData?.payment_method || detailsLink.payment_method,
        paidAt: liveMpInfo?.paidAt || linkedPaymentData?.paid_at || detailsLink.paid_at,
        createdAt: detailsLink.created_at,
        checkoutUrl: buildStandalonePaymentUrl(detailsLink.token),
        token: detailsLink.token,
        linkId: detailsLink.id,
        paymentId: linkedPaymentData?.id || detailsLink.payment_id,
        transactionId: linkedPaymentData?.transaction_id || null,
        invoiceNumber: linkedInvoiceNumber,
        gatewayName: detectGatewayLabel(),
        gatewayStatus: liveMpInfo?.status || linkedPaymentData?.status || detailsLink.status,
        gatewayStatusDetail: liveMpInfo?.statusDetail || null,
        payerName: detailsLink.payer_name,
        payerDocument: detailsLink.payer_document,
        payerEmail: detailsLink.payer_email,
        payerPhone: detailsLink.payer_phone,
        recipientName: 'P-CON CONSTRUNET',
        recipientSite: 'www.pconassinantes.site',
      });
      toast.success('Comprovante em PDF gerado com sucesso!');
    } catch (err) {
      console.error('Error generating receipt PDF:', err);
      toast.error('Erro ao gerar comprovante em PDF.');
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const resetForm = () => {
    setEditingLink(null);
    setCreatedLink(null);
    setTitle('');
    setDescription('');
    setAmountInput('');
    setOriginalAmountInput('');
    setSelectedClientId('');
    setAllowPix(true);
    setAllowCard(true);
    setMaxInstallments('4');
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (item: PaymentLinkRecord) => {
    setEditingLink(item);
    setCreatedLink(null);
    setTitle(item.title);
    setDescription(item.description || '');
    setAmountInput(Number(item.amount || 0).toFixed(2).replace('.', ','));
    setOriginalAmountInput(
      item.original_amount && Number(item.original_amount) > Number(item.amount || 0)
        ? Number(item.original_amount).toFixed(2).replace('.', ',')
        : '',
    );
    setSelectedClientId(item.client_id || '');
    setAllowPix(item.allow_pix !== false);
    setAllowCard(item.allow_card !== false);
    setMaxInstallments(String(Math.min(Math.max(item.max_installments || 4, 1), 4)));
    setModalOpen(true);
  };

  const handleCopyUrl = async (item: PaymentLinkRecord) => {
    const url = buildStandalonePaymentUrl(item.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(item.id);
      toast.success('Link de pagamento copiado!');
      setTimeout(() => setCopiedId((curr) => (curr === item.id ? null : curr)), 2200);
    } catch {
      toast.info(`Link: ${url}`);
    }
  };

  const handleShareWhatsApp = (item: PaymentLinkRecord) => {
    const url = buildStandalonePaymentUrl(item.token);
    const methods = [
      item.allow_pix ? 'PIX' : null,
      item.allow_card ? `Cartão em até ${item.max_installments || 4}x` : null,
    ]
      .filter(Boolean)
      .join(' ou ');

    const text = [
      `Olá! Segue o link de pagamento referente a *${item.title}*:`,
      item.description ? `_${item.description}_` : null,
      `Valor: *${formatCurrency(item.amount)}*`,
      methods ? `Formas disponíveis: ${methods}` : null,
      ``,
      `Acesse para preencher seu Nome/CPF e pagar: ${url}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    const numericAmount = editingLink?.status === 'paid'
      ? Number(editingLink.amount)
      : parseAmountInput(amountInput);
    const parsedOriginal = originalAmountInput.trim()
      ? parseAmountInput(originalAmountInput)
      : NaN;
    const hasOriginalPartial =
      Number.isFinite(parsedOriginal) && parsedOriginal > numericAmount + 0.009;

    if (trimmedTitle.length < 2) {
      toast.error('Informe um título para a cobrança (ex: Gestão de Redes Sociais).');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    if (originalAmountInput.trim() && (!Number.isFinite(parsedOriginal) || parsedOriginal < numericAmount - 0.009)) {
      toast.error('O valor total original deve ser igual ou maior que o valor do link.');
      return;
    }

    if (hasOriginalPartial && editingLink?.status === 'paid' && !selectedClientId) {
      toast.error('Vincule um cliente cadastrado para lançar o saldo restante na área do cliente.');
      return;
    }

    if (editingLink?.status !== 'paid' && !allowPix && !allowCard) {
      toast.error('Ative pelo menos uma forma de pagamento (PIX ou Cartão).');
      return;
    }

    setSaving(true);
    try {
      const installmentsNum = Math.min(Math.max(Number(maxInstallments || 4), 1), 4);

      if (editingLink) {
        const updated = await configureLinkBilling({
          linkId: editingLink.id,
          title: trimmedTitle,
          description: description.trim() || '',
          amount: editingLink.status === 'paid' ? undefined : numericAmount,
          allow_pix: allowPix,
          allow_card: allowCard,
          max_installments: installmentsNum,
          client_id: selectedClientId || null,
          clear_client: !selectedClientId,
          original_amount: hasOriginalPartial ? parsedOriginal : null,
        });

        if (updated) {
          toast.success(
            hasOriginalPartial && updated.status === 'paid'
              ? 'Link atualizado! Saldo restante lançado na área do cliente.'
              : 'Link de pagamento atualizado!',
          );
          void globalData?.refetchPayments?.();
          void globalData?.refetchInvoices?.();
          setModalOpen(false);
          resetForm();
        }
        return;
      }

      const created = await createLink({
        title: trimmedTitle,
        description: description.trim() || undefined,
        amount: numericAmount,
        allow_pix: allowPix,
        allow_card: allowCard,
        max_installments: installmentsNum,
        client_id: selectedClientId || null,
        original_amount: hasOriginalPartial ? parsedOriginal : null,
      });

      if (created) {
        setCreatedLink(created);
        const url = buildStandalonePaymentUrl(created.token);
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Link gerado e copiado para a área de transferência!');
        } catch {
          toast.success('Link de pagamento gerado com sucesso!');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCancel = async (item: PaymentLinkRecord) => {
    if (item.status === 'paid') return;
    const nextStatus = item.status === 'cancelled' ? 'pending' : 'cancelled';
    const updated = await updateLink(item.id, { status: nextStatus });
    if (updated) {
      toast.success(
        nextStatus === 'cancelled'
          ? 'Link cancelado com sucesso.'
          : 'Link reativado e pronto para receber!',
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const ok = await deleteLink(deleteTarget.id);
      if (ok) setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const total = links.length;
    const pending = links.filter((l) => l.status === 'pending').length;
    const paidLinks = links.filter((l) => l.status === 'paid');
    const paid = paidLinks.length;
    const totalReceived = paidLinks.reduce((acc, l) => acc + Number(l.amount || 0), 0);
    return { total, pending, paid, totalReceived };
  }, [links]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return links.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        item.title,
        item.description,
        item.token,
        item.payer_name,
        item.payer_document,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [links, search, statusFilter]);

  const columns = [
    {
      key: 'title',
      header: 'Cobrança',
      render: (item: PaymentLinkRecord) => (
        <div className="min-w-[190px] max-w-[300px] space-y-1">
          <div className="font-semibold text-foreground leading-snug">{item.title}</div>
          {item.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
          )}
          <div className="text-[11px] font-mono text-sky-400/90 truncate">
            /pagar/{item.token}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (item: PaymentLinkRecord) => {
        const orig = Number(item.original_amount || 0);
        const amt = Number(item.amount || 0);
        const hasRemaining = orig > amt + 0.009;
        return (
          <div className="whitespace-nowrap">
            <div className="font-bold text-foreground">{formatCurrency(amt)}</div>
            {hasRemaining ? (
              <div className="text-[11px] text-amber-300/90">
                de {formatCurrency(orig)} · restam {formatCurrency(orig - amt)}
              </div>
            ) : (
              item.allow_card && (
                <div className="text-[11px] text-muted-foreground">
                  até {item.max_installments || 4}x no cartão
                </div>
              )
            )}
          </div>
        );
      },
    },
    {
      key: 'methods',
      header: 'Formas',
      hideOnMobile: true,
      render: (item: PaymentLinkRecord) => (
        <div className="flex flex-wrap gap-1.5">
          {item.allow_pix && (
            <Badge className="bg-[#32BCAD]/15 text-[#5ce2d3] border border-[#32BCAD]/35 hover:bg-[#32BCAD]/20 gap-1">
              <QrCode className="w-3 h-3" />
              PIX
            </Badge>
          )}
          {item.allow_card && (
            <Badge className="bg-sky-500/15 text-sky-300 border border-sky-400/35 hover:bg-sky-500/20 gap-1">
              <CreditCard className="w-3 h-3" />
              Cartão
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'payer',
      header: 'Pagador (Nome / CPF)',
      hideOnMobile: true,
      render: (item: PaymentLinkRecord) =>
        item.payer_name || item.payer_document || item.client_id ? (
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground">{item.payer_name || '-'}</span>
              {item.client_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                  Vinculado
                </span>
              )}
            </div>
            {item.payer_document && (
              <div className="font-mono text-muted-foreground">
                {formatDocumentInput(item.payer_document)}
              </div>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <UserCheck className="w-3.5 h-3.5 opacity-60" />
            Preenchido no link
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: PaymentLinkRecord) => (
        <div className="space-y-1">
          <StatusBadge status={item.status} />
          {item.status === 'paid' && item.payment_method && (
            <div className="text-[11px] text-muted-foreground">{item.payment_method}</div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (item: PaymentLinkRecord) => (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Ver detalhes e comprovante"
            onClick={() => void openDetailsModal(item)}
            className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/15"
          >
            <Eye className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Copiar link"
            onClick={() => void handleCopyUrl(item)}
            className="h-8 w-8 text-sky-400 hover:text-sky-300 hover:bg-sky-500/15"
          >
            {copiedId === item.id ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Abrir página de pagamento"
            onClick={() =>
              window.open(buildStandalonePaymentUrl(item.token), '_blank', 'noopener,noreferrer')
            }
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Enviar via WhatsApp"
            onClick={() => handleShareWhatsApp(item)}
            className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15"
          >
            <MessageCircle className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            title={item.status === 'paid' ? 'Vincular cliente / definir valor original' : 'Editar link'}
            onClick={() => openEditModal(item)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-4 h-4" />
          </Button>

          {item.status !== 'paid' && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title={item.status === 'cancelled' ? 'Reativar link' : 'Cancelar link'}
              onClick={() => void handleToggleCancel(item)}
              className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15"
            >
              {item.status === 'cancelled' ? (
                <RotateCcw className="w-4 h-4" />
              ) : (
                <Ban className="w-4 h-4" />
              )}
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Excluir link"
            onClick={() => setDeleteTarget(item)}
            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/15"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Links de Pagamento"
      subtitle="Gere cobranças avulsas com título, descrição, valor e escolha PIX e/ou Cartão"
      headerAction={
        <Button
          onClick={openCreateModal}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Novo Link
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Total de Links</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Aguardando</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">{stats.pending}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Pagos</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{stats.paid}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground">Total Recebido</p>
            <p className="mt-1 text-2xl font-bold text-sky-400">
              {formatCurrency(stats.totalReceived)}
            </p>
          </div>
        </div>

        {/* Barra de busca e filtros */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, descrição, pagador ou CPF..."
              className="pl-9 bg-background/40 border-border/60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { value: 'all', label: 'Todos' },
                { value: 'pending', label: 'Aguardando' },
                { value: 'paid', label: 'Pagos' },
                { value: 'cancelled', label: 'Cancelados' },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={statusFilter === opt.value ? 'default' : 'outline'}
                onClick={() => setStatusFilter(opt.value)}
                className="h-8 text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Erro de migration ausente / falha de fetch */}
        {error && (
          <div className="glass-card p-4 border border-amber-500/35 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-sm text-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Listagem */}
        {loading ? (
          <div className="glass-card p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <LoaderCircle className="w-7 h-7 animate-spin text-primary" />
            <span className="text-sm">Carregando links de pagamento...</span>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="glass-card p-10 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Link2 className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-semibold text-foreground">
                {links.length === 0
                  ? 'Nenhum link de pagamento criado ainda'
                  : 'Nenhum link encontrado para esse filtro'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {links.length === 0
                  ? 'Crie um link avulso para qualquer venda (ex: Gestão de Redes Sociais), defina PIX e/ou Cartão e envie para o cliente informar Nome e CPF antes de pagar.'
                  : 'Tente limpar a busca ou selecionar outro status.'}
              </p>
            </div>
            {links.length === 0 && (
              <Button onClick={openCreateModal} className="gap-2">
                <Plus className="w-4 h-4" />
                Criar primeiro link
              </Button>
            )}
          </div>
        ) : (
          <DataTable data={filteredLinks} columns={columns} onRowClick={(item) => void openDetailsModal(item)} />
        )}
      </div>

      {/* Modal Criar / Editar Link */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md bg-[#0b1930] border-white/15 text-white p-5 overflow-x-hidden">
          {createdLink ? (
            <>
              <DialogHeader>
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/35 flex items-center justify-center mb-2">
                  <Sparkles className="w-6 h-6 text-emerald-400" />
                </div>
                <DialogTitle className="text-center text-xl">
                  Link de Pagamento Gerado!
                </DialogTitle>
                <DialogDescription className="text-center text-white/70">
                  Envie este link para o cliente. Antes de pagar, ele preencherá{' '}
                  <strong className="text-white">Nome completo e CPF/CNPJ</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 min-w-0">
                <div className="rounded-xl bg-white/[0.05] border border-white/10 p-4 space-y-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <span className="font-semibold text-white min-w-0 break-words">{createdLink.title}</span>
                    <span className="font-bold text-emerald-400 shrink-0 whitespace-nowrap">
                      {formatCurrency(createdLink.amount)}
                    </span>
                  </div>
                  {createdLink.description && (
                    <p className="text-xs text-white/65 break-words">{createdLink.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {createdLink.allow_pix && (
                      <Badge className="bg-[#32BCAD]/20 text-[#6ce6d8] border-[#32BCAD]/35">
                        PIX ativo
                      </Badge>
                    )}
                    {createdLink.allow_card && (
                      <Badge className="bg-sky-500/20 text-sky-300 border-sky-400/35">
                        Cartão até {createdLink.max_installments || 4}x
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs text-white/70">URL do Checkout</Label>
                  <div className="flex items-center gap-2 min-w-0">
                    <Input
                      readOnly
                      value={buildStandalonePaymentUrl(createdLink.token)}
                      className="min-w-0 flex-1 bg-white/[0.06] border-white/15 font-mono text-xs text-sky-300"
                    />
                    <Button
                      type="button"
                      onClick={() => void handleCopyUrl(createdLink)}
                      className="shrink-0 bg-primary hover:bg-primary/90 gap-1.5"
                    >
                      {copiedId === createdLink.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      Copiar
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2 sm:space-x-0 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetForm}
                  className="text-white/70 hover:text-white"
                >
                  Criar outro
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      buildStandalonePaymentUrl(createdLink.token),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                  className="border-white/20 bg-white/5 hover:bg-white/10 text-white gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  Visualizar
                </Button>
                <Button
                  type="button"
                  onClick={() => handleShareWhatsApp(createdLink)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleSubmitForm} className="space-y-3">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg">
                  {editingLink
                    ? editingLink.status === 'paid'
                      ? 'Editar Cobrança Paga & Vincular Cliente'
                      : 'Editar Link de Pagamento'
                    : 'Novo Link de Pagamento'}
                </DialogTitle>
                <DialogDescription className="text-xs text-white/70">
                  {editingLink?.status === 'paid'
                    ? 'Vincule o cliente cadastrado e informe o valor total original para lançar o saldo restante na área do cliente.'
                    : 'Informe título, valor, descrição e opcionalmente vincule um cliente cadastrado.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2.5">
                <div className="space-y-1">
                  <Label htmlFor="link-title" className="text-xs">
                    Título da cobrança *
                  </Label>
                  <Input
                    id="link-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Gestão de Redes Sociais"
                    required
                    className="h-9 bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="link-amount" className="text-xs">
                      {editingLink?.status === 'paid' ? 'Valor pago no link (R$)' : 'Valor do link (R$) *'}
                    </Label>
                    <Input
                      id="link-amount"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="150,00"
                      inputMode="decimal"
                      required
                      disabled={editingLink?.status === 'paid'}
                      className="h-9 bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 text-sm font-semibold disabled:opacity-70"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="link-original-amount" className="text-xs">
                      Valor total original (opcional)
                    </Label>
                    <Input
                      id="link-original-amount"
                      value={originalAmountInput}
                      onChange={(e) => setOriginalAmountInput(e.target.value)}
                      placeholder="Ex: 1750,00"
                      inputMode="decimal"
                      className="h-9 bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 text-sm"
                    />
                  </div>
                </div>

                {(() => {
                  const paidAmt = editingLink?.status === 'paid' ? Number(editingLink.amount) : parseAmountInput(amountInput);
                  const origAmt = originalAmountInput.trim() ? parseAmountInput(originalAmountInput) : NaN;
                  if (Number.isFinite(paidAmt) && Number.isFinite(origAmt) && origAmt > paidAmt + 0.009) {
                    return (
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-400/25 px-3 py-2 text-xs text-emerald-200 space-y-0.5">
                        <p className="font-medium">
                          {editingLink?.status === 'paid' ? 'Pago no link' : 'Entrada deste link'}:{' '}
                          <strong className="text-white">{formatCurrency(paidAmt)}</strong> · Restante em aberto:{' '}
                          <strong className="text-amber-300">{formatCurrency(origAmt - paidAmt)}</strong>
                        </p>
                        <p className="text-[11px] text-white/70">
                          {selectedClientId
                            ? 'O saldo restante aparecerá em aberto na Área do Cliente vinculada.'
                            : 'Selecione o cliente cadastrado abaixo para exibir o saldo na Área do Cliente.'}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="space-y-1">
                  <Label className="text-xs">
                    Vincular cliente cadastrado {originalAmountInput.trim() ? '*' : '(opcional)'}
                  </Label>
                  <ClientSearchSelect
                    clients={selectableClients}
                    value={selectedClientId}
                    onChange={setSelectedClientId}
                    placeholder="Selecionar cliente cadastrado..."
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="link-desc" className="text-xs">
                    Descrição (opcional)
                  </Label>
                  <Textarea
                    id="link-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detalhes do serviço ou produto..."
                    rows={2}
                    className="min-h-[54px] bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 resize-none text-sm"
                  />
                </div>

                {/* Opções de PIX e Cartão (editável antes de pagar) */}
                {editingLink?.status !== 'paid' && (
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-[#32BCAD]/15 border border-[#32BCAD]/30 flex items-center justify-center">
                          <QrCode className="w-3.5 h-3.5 text-[#5ce2d3]" />
                        </div>
                        <div>
                          <Label htmlFor="switch-pix" className="text-sm font-medium cursor-pointer">
                            Ativar PIX
                          </Label>
                          <p className="text-[11px] text-white/55 leading-tight">
                            QR Code e Copia e Cola instantâneo
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="switch-pix"
                        checked={allowPix}
                        onCheckedChange={setAllowPix}
                      />
                    </div>

                    <div className="h-px bg-white/10" />

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-sky-500/15 border border-sky-400/30 flex items-center justify-center">
                          <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                        </div>
                        <div>
                          <Label htmlFor="switch-card" className="text-sm font-medium cursor-pointer">
                            Ativar Cartão de Crédito
                          </Label>
                          <p className="text-[11px] text-white/55 leading-tight">
                            Pagamento parcelado via Mercado Pago
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="switch-card"
                        checked={allowCard}
                        onCheckedChange={setAllowCard}
                      />
                    </div>

                    {allowCard && (
                      <div className="pt-1 flex items-center justify-between gap-3">
                        <Label htmlFor="max-installments" className="text-xs text-white/75">
                          Parcelamento máximo
                        </Label>
                        <Select value={maxInstallments} onValueChange={setMaxInstallments}>
                          <SelectTrigger
                            id="max-installments"
                            className="w-28 h-8 bg-white/[0.06] border-white/15 text-xs text-white"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0e203d] border-white/15 text-white">
                            <SelectItem value="1">À vista (1x)</SelectItem>
                            <SelectItem value="2">Até 2x</SelectItem>
                            <SelectItem value="3">Até 3x</SelectItem>
                            <SelectItem value="4">Até 4x</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {editingLink?.status !== 'paid' && (
                  <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-400/20 px-2.5 py-1.5 text-[11px] text-sky-200/90">
                    <UserCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>
                      {selectedClientId
                        ? 'Dados do cliente já vinculados — ele ainda poderá conferir antes de pagar.'
                        : 'O cliente informa Nome e CPF/CNPJ antes de pagar.'}
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:space-x-0 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModalOpen(false)}
                  className="text-white/70 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingLink ? (
                    'Salvar Alterações'
                  ) : (
                    'Gerar Link de Pagamento'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhes e Comprovante do Link */}
      <Dialog
        open={!!detailsLink}
        onOpenChange={(open) => {
          if (!open) setDetailsLink(null);
        }}
      >
        <DialogContent className="sm:max-w-lg bg-[#0b1930] border-white/15 text-white p-5">
          {detailsLink && (() => {
            const gatewayLabel = detectGatewayLabel();
            const effectiveStatus = linkedPaymentData?.status || detailsLink.status;
            const effectivePaidAt = liveMpInfo?.paidAt || linkedPaymentData?.paid_at || detailsLink.paid_at;
            const effectiveMethod = linkedPaymentData?.payment_method || detailsLink.payment_method;
            const mpTxId = linkedPaymentData?.transaction_id || null;

            return (
              <>
                <DialogHeader>
                  <div className="flex items-start justify-between gap-3 pr-6">
                    <div className="min-w-0">
                      <DialogTitle className="text-lg font-heading text-white break-words">
                        {detailsLink.title}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-white/65 mt-0.5">
                        /pagar/{detailsLink.token}
                      </DialogDescription>
                    </div>
                    <StatusBadge status={effectiveStatus} />
                  </div>
                </DialogHeader>

                <div className="space-y-3 py-1">
                  {/* Resumo financeiro */}
                  <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-white/60">
                        {Number(detailsLink.original_amount || 0) > Number(detailsLink.amount)
                          ? 'Valor parcial pago no link'
                          : 'Valor da cobrança'}
                      </p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {formatCurrency(Number(linkedPaymentData?.amount ?? detailsLink.amount))}
                      </p>
                      {Number(detailsLink.original_amount || 0) > Number(detailsLink.amount) && (
                        <p className="text-xs text-amber-300 mt-0.5">
                          de {formatCurrency(Number(detailsLink.original_amount))} · Restam{' '}
                          {formatCurrency(Number(detailsLink.original_amount) - Number(detailsLink.amount))}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-0.5 text-xs">
                      <p className="text-white/75">
                        Forma: <span className="font-semibold text-white">{effectiveMethod || (detailsLink.allow_pix && detailsLink.allow_card ? 'PIX / Cartão' : detailsLink.allow_pix ? 'PIX' : 'Cartão')}</span>
                      </p>
                      <p className="text-white/60">
                        Criado em {formatBrazilDateTime(detailsLink.created_at)}
                      </p>
                      {effectivePaidAt && (
                        <p className="text-emerald-400 font-medium">
                          Pago em {formatBrazilDateTime(effectivePaidAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  {detailsLink.description && (
                    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-white/55 font-medium">
                        Descrição
                      </p>
                      <p className="text-xs text-white/85 whitespace-pre-wrap break-words">
                        {detailsLink.description}
                      </p>
                    </div>
                  )}

                  {/* Pagador e Destinatário */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-sky-300 font-semibold">
                        <UserCheck className="w-3.5 h-3.5" />
                        Pagador (Remetente)
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-white break-words">
                          {detailsLink.payer_name || 'Ainda não preenchido'}
                        </p>
                        <p className="font-mono text-white/75">
                          CPF/CNPJ: {detailsLink.payer_document ? formatDocumentInput(detailsLink.payer_document) : '-'}
                        </p>
                        {detailsLink.payer_email && (
                          <p className="text-white/70 break-all">{detailsLink.payer_email}</p>
                        )}
                        {detailsLink.payer_phone && (
                          <p className="text-white/70">{detailsLink.payer_phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                        <Building2 className="w-3.5 h-3.5" />
                        Destinatário (Recebedor)
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-white">P-CON CONSTRUNET</p>
                        <p className="text-white/75">Gateway: {gatewayLabel}</p>
                        <p className="text-white/65">www.pconassinantes.site</p>
                      </div>
                    </div>
                  </div>

                  {/* Dados do Mercado Pago / IDs */}
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/70 font-semibold">
                        <Receipt className="w-3.5 h-3.5 text-primary" />
                        Dados da Transação ({gatewayLabel})
                      </div>
                      {detailsLoading && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-white/60">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Consultando...
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/20 rounded-lg p-2 flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/55">ID Transação (MP / Gateway)</p>
                          <p className="font-mono text-sky-300 truncate">{mpTxId || 'Sem transação gerada'}</p>
                        </div>
                        {mpTxId && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-white/70 hover:text-white"
                            onClick={() => void handleCopyText(mpTxId, 'ID da transação')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="bg-black/20 rounded-lg p-2 min-w-0">
                        <p className="text-[10px] text-white/55">Status no Gateway</p>
                        <p className="font-medium text-white truncate">
                          {liveMpInfo?.status
                            ? `${liveMpInfo.status}${liveMpInfo.statusDetail ? ` (${liveMpInfo.statusDetail})` : ''}`
                            : effectiveStatus === 'paid'
                              ? 'Aprovado / Pago'
                              : effectiveStatus === 'cancelled'
                                ? 'Cancelado'
                                : 'Aguardando pagamento'}
                        </p>
                      </div>

                      <div className="bg-black/20 rounded-lg p-2 flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <p className="text-[10px] text-white/55">ID Pagamento (Sistema)</p>
                          <p className="font-mono text-white/80 truncate text-[11px]">
                            {linkedPaymentData?.id || detailsLink.payment_id || '-'}
                          </p>
                        </div>
                        {(linkedPaymentData?.id || detailsLink.payment_id) && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-white/70 hover:text-white"
                            onClick={() =>
                              void handleCopyText(
                                (linkedPaymentData?.id || detailsLink.payment_id)!,
                                'ID do pagamento',
                              )
                            }
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="bg-black/20 rounded-lg p-2 min-w-0">
                        <p className="text-[10px] text-white/55">Nota / Fatura Vinculada</p>
                        <p className="font-mono text-white/85 truncate text-[11px]">
                          {linkedInvoiceNumber || 'Não emitida'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2 sm:space-x-0 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDetailsLink(null)}
                    className="border-white/20 bg-white/5 hover:bg-white/10 text-white"
                  >
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const target = detailsLink;
                      setDetailsLink(null);
                      openEditModal(target);
                    }}
                    className="border-white/20 bg-white/5 hover:bg-white/10 text-white gap-1.5"
                  >
                    <Pencil className="w-4 h-4" />
                    Editar / Vincular
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCopyUrl(detailsLink)}
                    className="border-white/20 bg-white/5 hover:bg-white/10 text-white gap-1.5"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar Link
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleDownloadReceipt()}
                    disabled={generatingReceipt}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                  >
                    {generatingReceipt ? (
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Gerar Comprovante PDF
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md bg-[#0b1930] border-white/15 text-white">
          <DialogHeader>
            <DialogTitle>Excluir link de pagamento?</DialogTitle>
            <DialogDescription className="text-white/70">
              Tem certeza que deseja excluir{' '}
              <strong className="text-white">{deleteTarget?.title}</strong>? O endereço deixará de funcionar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="text-white/70 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir Link'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
