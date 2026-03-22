import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, CheckCircle, LoaderCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import pixIcon from '@/assets/pix-icon.svg';

interface PixQRCodeProps {
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expirationDate?: string;
  paymentId: string;
  amount?: number;
  onCheckStatus?: () => Promise<{ status?: string } | null>;
  onPaymentConfirmed?: () => void;
}

const PixQRCode = ({
  qrCode,
  qrCodeBase64,
  ticketUrl,
  expirationDate,
  paymentId,
  amount,
  onCheckStatus,
  onPaymentConfirmed,
}: PixQRCodeProps) => {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved' | 'expired'>('pending');
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(qrCode);
    setCopied(true);
    toast.success('Código PIX copiado!');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleCheckStatus = async () => {
    if (!onCheckStatus) return;
    
    setChecking(true);
    try {
      const result = await onCheckStatus();
      if (result?.status === 'approved') {
        setStatus('approved');
        toast.success('Pagamento confirmado!');
        onPaymentConfirmed?.();
      } else if (result?.status === 'pending') {
        toast.info('Pagamento ainda pendente');
      } else {
        toast.info(`Status: ${result?.status || 'Desconhecido'}`);
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (status !== 'pending' || !onCheckStatus) return;

    const interval = setInterval(async () => {
      const result = await onCheckStatus();
      if (result?.status === 'approved') {
        setStatus('approved');
        toast.success('Pagamento confirmado!');
        onPaymentConfirmed?.();
        clearInterval(interval);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [status, onCheckStatus, onPaymentConfirmed]);

  if (status === 'approved') {
    return (
      <div className="p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle className="w-10 h-10 text-green-400" />
        </motion.div>
        <h3 className="text-xl font-bold text-green-400 mb-2">
          Pagamento Confirmado!
        </h3>
        <p className="text-sm text-slate-400">
          Seu pagamento foi processado com sucesso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com logo maior */}
      <div className="flex flex-col items-center gap-2">
        <img
          src="/images/logo-pcon-white.png"
          alt="P-CON CONSTRUNET"
          className="h-14 object-contain"
        />
        <div className="flex items-center gap-2 mt-1">
          <img src={pixIcon} alt="PIX" className="h-5 w-5" />
          <h2 className="text-lg font-bold text-foreground">Pague com PIX</h2>
        </div>
      </div>

      {/* QR Code com fundo branco para escaneabilidade */}
      <div className="flex justify-center">
        {qrCodeBase64 ? (
          <div className="bg-white p-2.5 rounded-xl">
            <img
              src={`data:image/png;base64,${qrCodeBase64}`}
              alt="QR Code PIX"
              className="w-36 h-36"
            />
          </div>
        ) : (
          <div className="w-36 h-36 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-center">
            <img src={pixIcon} alt="PIX" className="w-12 h-12 opacity-30" />
          </div>
        )}
      </div>

      {/* Valor em destaque */}
      {amount != null && (
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Valor a pagar</p>
          <p className="text-2xl font-bold text-foreground">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)}
          </p>
        </div>
      )}

      {/* Instruções */}
      <p className="text-sm text-muted-foreground text-center">
        Escaneie o QR Code acima ou copie o código abaixo:
      </p>

      {/* Código PIX Copia e Cola */}
      <div className="relative">
        <div className="bg-secondary/20 rounded-xl p-3 pr-12 border border-border/20 overflow-hidden">
          <code className="text-xs text-foreground/80 break-all line-clamp-2">
            {qrCode}
          </code>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-primary/10"
          onClick={handleCopyCode}
        >
          {copied ? (
            <CheckCircle className="h-4 w-4 text-green-400" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Status */}
      <div className="flex items-center justify-center gap-2 text-sm py-2">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-2"
        >
          <LoaderCircle className="h-4 w-4 animate-spin text-amber-400" />
          <span className="text-muted-foreground">Aguardando pagamento...</span>
        </motion.div>
      </div>

      {/* Ações */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 border-primary/20 hover:bg-primary/10"
          onClick={handleCheckStatus}
          disabled={checking}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
          Verificar Status
        </Button>
        {ticketUrl && (
          <Button
            variant="outline"
            className="border-primary/20 hover:bg-primary/10"
            onClick={() => window.open(ticketUrl, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>

      {expirationDate && (
        <p className="text-xs text-muted-foreground text-center">
          O QR Code expira em{' '}
          {new Date(expirationDate).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
};

export default PixQRCode;
