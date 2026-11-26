import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  MessageCircle,
  QrCode,
  Sparkles,
} from 'lucide-react';
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
import {
  buildStandalonePaymentUrl,
  createPaymentLinkForOpenPayment,
  PaymentLinkRecord,
} from '@/hooks/usePaymentLinks';
import { toast } from 'sonner';

export interface OpenPaymentLinkTarget {
  paymentId: string;
  clientName: string;
  clientPhone?: string | null;
  defaultTitle: string;
  openAmount: number;
  originalAmount?: number | null;
  paidAmount?: number | null;
}

interface GenerateOpenPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: OpenPaymentLinkTarget | null;
  onCreated?: (link: PaymentLinkRecord) => void;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function GenerateOpenPaymentLinkDialog({
  open,
  onOpenChange,
  target,
  onCreated,
}: GenerateOpenPaymentLinkDialogProps) {
  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [allowPix, setAllowPix] = useState(true);
  const [allowCard, setAllowCard] = useState(true);
  const [maxInstallments, setMaxInstallments] = useState('4');
  const [saving, setSaving] = useState(false);
  const [createdLink, setCreatedLink] = useState<PaymentLinkRecord | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && target) {
      setCreatedLink(null);
      setCopied(false);
      setTitle(target.defaultTitle || 'Cobrança P-CON');
      setAmountInput(Number(target.openAmount || 0).toFixed(2).replace('.', ','));
      setAllowPix(true);
      setAllowCard(true);
      setMaxInstallments('4');
    }
  }, [open, target]);

  if (!target) return null;

  const parseAmount = (raw: string) => {
    const cleaned = raw.replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return NaN;
    if (cleaned.includes(',')) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    return Number(cleaned);
  };

  const handleGenerate = async () => {
    const numericAmount = parseAmount(amountInput);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Informe um valor maior que zero.');
      return;
    }
    if (numericAmount > target.openAmount + 0.01) {
      toast.error(`O valor não pode ultrapassar o saldo em aberto (${formatBRL(target.openAmount)}).`);
      return;
    }
    if (!allowPix && !allowCard) {
      toast.error('Ative pelo menos PIX ou Cartão.');
      return;
    }

    setSaving(true);
    try {
      const link = await createPaymentLinkForOpenPayment({
        paymentId: target.paymentId,
        amount: numericAmount,
        title: title.trim() || target.defaultTitle,
        allow_pix: allowPix,
        allow_card: allowCard,
        max_installments: Number(maxInstallments || 4),
      });

      if (link) {
        setCreatedLink(link);
        onCreated?.(link);
        const url = buildStandalonePaymentUrl(link.token);
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          toast.success('Link de pagamento gerado e copiado!');
        } catch {
          toast.success('Link de pagamento gerado com sucesso!');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    const url = buildStandalonePaymentUrl(createdLink.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(url);
    }
  };

  const handleWhatsApp = () => {
    if (!createdLink) return;
    const url = buildStandalonePaymentUrl(createdLink.token);
    const methods = [
      createdLink.allow_pix ? 'PIX' : null,
      createdLink.allow_card ? `Cartão em até ${createdLink.max_installments || 4}x` : null,
    ]
      .filter(Boolean)
      .join(' ou ');

    const text = [
      `Olá, ${target.clientName}! Segue o link de pagamento referente a *${createdLink.title}*:`,
      createdLink.description ? `_${createdLink.description}_` : null,
      `Valor: *${formatBRL(createdLink.amount)}*`,
      methods ? `Formas disponíveis: ${methods}` : null,
      '',
      `Acesse direto para pagar (sem precisar entrar no portal): ${url}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const digits = (target.clientPhone || '').replace(/\D/g, '');
    const waTarget = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
    const waUrl = waTarget
      ? `https://wa.me/${waTarget}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0b1930] border-white/15 text-white p-5">
        {createdLink ? (
          <>
            <DialogHeader>
              <div className="mx-auto w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-400/35 flex items-center justify-center mb-1.5">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
              <DialogTitle className="text-center text-lg">
                Link de Pagamento Pronto!
              </DialogTitle>
              <DialogDescription className="text-center text-xs text-white/70">
                Quando {target.clientName} pagar este link, o saldo em aberto será quitado ou abatido automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 min-w-0">
              <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm text-white break-words">{createdLink.title}</span>
                  <span className="font-bold text-emerald-400 shrink-0 whitespace-nowrap">
                    {formatBRL(createdLink.amount)}
                  </span>
                </div>
                {createdLink.description && (
                  <p className="text-xs text-white/65">{createdLink.description}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">URL Direta para o Cliente</Label>
                <div className="flex items-center gap-2 min-w-0">
                  <Input
                    readOnly
                    value={buildStandalonePaymentUrl(createdLink.token)}
                    className="min-w-0 flex-1 bg-white/[0.06] border-white/15 font-mono text-xs text-sky-300"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleCopy()}
                    className="shrink-0 bg-primary hover:bg-primary/90 gap-1.5"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    Copiar
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2 sm:space-x-0">
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
                onClick={handleWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar WhatsApp
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Link2 className="w-5 h-5 text-primary" />
                Gerar Link do Saldo em Aberto
              </DialogTitle>
              <DialogDescription className="text-xs text-white/70">
                Envie um link direto (PIX ou Cartão) para {target.clientName} pagar sem precisar fazer login na Área do Cliente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/60">Cliente</span>
                  <span className="font-medium text-white">{target.clientName}</span>
                </div>
                {Number(target.paidAmount || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Já pago anteriormente</span>
                    <span className="text-emerald-400 font-medium">{formatBRL(Number(target.paidAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/60">Saldo restante em aberto</span>
                  <span className="text-amber-300 font-bold">{formatBRL(target.openAmount)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Título da cobrança</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-9 bg-white/[0.06] border-white/15 text-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor do link (R$)</Label>
                  <Input
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    inputMode="decimal"
                    className="h-9 bg-white/[0.06] border-white/15 text-white text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[#5ce2d3]" />
                    <Label className="text-sm font-medium">Ativar PIX</Label>
                  </div>
                  <Switch checked={allowPix} onCheckedChange={setAllowPix} />
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-sky-400" />
                    <Label className="text-sm font-medium">Ativar Cartão (c/ taxas MP)</Label>
                  </div>
                  <Switch checked={allowCard} onCheckedChange={setAllowCard} />
                </div>
                {allowCard && (
                  <div className="pt-1 flex items-center justify-between gap-3">
                    <Label className="text-xs text-white/75">Parcelamento máximo</Label>
                    <Select value={maxInstallments} onValueChange={setMaxInstallments}>
                      <SelectTrigger className="w-28 h-8 bg-white/[0.06] border-white/15 text-xs text-white">
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
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="text-white/70 hover:text-white"
              >
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleGenerate()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Gerar Link Direto
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
