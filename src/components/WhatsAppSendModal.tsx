import { useState } from 'react';
import { Loader2, Send, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export interface WhatsAppSendParams {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  type: 'subscription' | 'payment' | 'overdue';
  amount: number;
  description?: string;
  dueDate?: string | null;
}

interface WhatsAppSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: WhatsAppSendParams | null;
  onSendViaApi: (params: WhatsAppSendParams) => Promise<boolean>;
  sendingId: string | null;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const buildManualMessage = (params: WhatsAppSendParams): string => {
  const { clientName, type, amount, description } = params;
  const formattedAmount = formatCurrency(amount);

  if (type === 'overdue') {
    return `Olá ${clientName}! 💈\n\n⚠️ A fatura referente a sua assinatura ativa de *${formattedAmount}*${description ? ` (*${description}*)` : ''} está vencida.\n\nRegularize o pagamento para manter sua assinatura em dia.\n\nAcesse a área do cliente: https://www.assinaturaspcon.sbs/cliente\n\nEntre em contato se precisar de ajuda.`;
  }

  return `Olá ${clientName}! 💈\n\nPassando para lembrar que a fatura referente a sua assinatura ativa${description ? ` do *${description}*` : ''} no valor de *${formattedAmount}* está pendente.\n\nAcesse a área do cliente: https://www.assinaturaspcon.sbs/cliente\n\nQualquer dúvida, estamos à disposição.`;
};

const WhatsAppSendModal = ({ open, onOpenChange, params, onSendViaApi, sendingId }: WhatsAppSendModalProps) => {
  const [sending, setSending] = useState(false);

  if (!params) return null;

  const isSending = sending || sendingId === params.clientId;

  const handleSendViaApi = async () => {
    setSending(true);
    try {
      await onSendViaApi(params);
    } finally {
      setSending(false);
      onOpenChange(false);
    }
  };

  const handleSendManual = () => {
    if (!params.clientPhone) return;

    let phone = params.clientPhone.replace(/\D/g, '');
    if (!phone.startsWith('55')) {
      phone = '55' + phone;
    }

    const message = buildManualMessage(params);
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="w-5 h-5 text-green-500" />
            Enviar Cobrança via WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escolha como deseja enviar a cobrança para <strong>{params.clientName}</strong> no valor de <strong>{formatCurrency(params.amount)}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <Button
            onClick={handleSendViaApi}
            disabled={isSending}
            className="w-full justify-start gap-3 h-auto py-4 px-4 bg-green-600 hover:bg-green-700 text-white"
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            ) : (
              <Send className="w-5 h-5 shrink-0" />
            )}
            <div className="text-left">
              <div className="font-semibold">Enviar via API</div>
              <div className="text-xs opacity-80 font-normal">Envia automaticamente com imagem e botão configurados</div>
            </div>
          </Button>

          <Button
            onClick={handleSendManual}
            disabled={isSending}
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-4 px-4 border-green-600/30 hover:bg-green-600/10"
          >
            <ExternalLink className="w-5 h-5 shrink-0 text-green-500" />
            <div className="text-left">
              <div className="font-semibold">Enviar manualmente</div>
              <div className="text-xs text-muted-foreground font-normal">Abre o WhatsApp com a mensagem pronta para enviar</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppSendModal;
