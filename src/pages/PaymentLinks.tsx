import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
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
import { formatDocumentInput } from '@/utils/documentValidation';
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
  const { links, loading, error, createLink, updateLink, deleteLink, refetch } =
    usePaymentLinks();

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
  const [allowPix, setAllowPix] = useState(true);
  const [allowCard, setAllowCard] = useState(true);
  const [maxInstallments, setMaxInstallments] = useState('4');

  // Confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<PaymentLinkRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setEditingLink(null);
    setCreatedLink(null);
    setTitle('');
    setDescription('');
    setAmountInput('');
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
    const numericAmount = parseAmountInput(amountInput);

    if (trimmedTitle.length < 2) {
      toast.error('Informe um título para a cobrança (ex: Gestão de Redes Sociais).');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    if (!allowPix && !allowCard) {
      toast.error('Ative pelo menos uma forma de pagamento (PIX ou Cartão).');
      return;
    }

    setSaving(true);
    try {
      const installmentsNum = Math.min(Math.max(Number(maxInstallments || 4), 1), 4);

      if (editingLink) {
        const updated = await updateLink(editingLink.id, {
          title: trimmedTitle,
          description: description.trim() || null,
          amount: numericAmount,
          allow_pix: allowPix,
          allow_card: allowCard,
          max_installments: installmentsNum,
        });

        if (updated) {
          toast.success('Link de pagamento atualizado!');
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
      render: (item: PaymentLinkRecord) => (
        <div className="whitespace-nowrap">
          <div className="font-bold text-foreground">{formatCurrency(item.amount)}</div>
          {item.allow_card && (
            <div className="text-[11px] text-muted-foreground">
              até {item.max_installments || 4}x no cartão
            </div>
          )}
        </div>
      ),
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
        item.payer_name || item.payer_document ? (
          <div className="space-y-0.5 text-xs">
            <div className="font-medium text-foreground">{item.payer_name || '-'}</div>
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

          {item.status !== 'paid' && (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Editar link"
                onClick={() => openEditModal(item)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-4 h-4" />
              </Button>

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
            </>
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
          <DataTable data={filteredLinks} columns={columns} />
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
        <DialogContent className="sm:max-w-md bg-[#0b1930] border-white/15 text-white p-5">
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

              <div className="space-y-4 py-2">
                <div className="rounded-xl bg-white/[0.05] border border-white/10 p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{createdLink.title}</span>
                    <span className="font-bold text-emerald-400">
                      {formatCurrency(createdLink.amount)}
                    </span>
                  </div>
                  {createdLink.description && (
                    <p className="text-xs text-white/65">{createdLink.description}</p>
                  )}
                  <div className="flex gap-1.5 pt-1">
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

                <div className="space-y-1.5">
                  <Label className="text-xs text-white/70">URL do Checkout</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={buildStandalonePaymentUrl(createdLink.token)}
                      className="bg-white/[0.06] border-white/15 font-mono text-xs text-sky-300"
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

              <DialogFooter className="flex-col sm:flex-row gap-2">
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
                  Enviar no WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetForm}
                  className="text-white/70 hover:text-white"
                >
                  Criar outro
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleSubmitForm} className="space-y-3">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-lg">
                  {editingLink ? 'Editar Link de Pagamento' : 'Novo Link de Pagamento'}
                </DialogTitle>
                <DialogDescription className="text-xs text-white/70">
                  Informe título, descrição, valor e libere PIX e/ou Cartão.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2 space-y-1">
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

                  <div className="space-y-1">
                    <Label htmlFor="link-amount" className="text-xs">
                      Valor (R$) *
                    </Label>
                    <Input
                      id="link-amount"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="150,00"
                      inputMode="decimal"
                      required
                      className="h-9 bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 text-sm font-semibold"
                    />
                  </div>
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
                    className="min-h-[56px] bg-white/[0.06] border-white/15 text-white placeholder:text-white/35 resize-none text-sm"
                  />
                </div>

                {/* Opções de PIX e Cartão */}
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

                <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-400/20 px-2.5 py-1.5 text-[11px] text-sky-200/90">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>
                    O cliente informa <strong>Nome e CPF/CNPJ</strong> antes de pagar.
                  </span>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-1">
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
