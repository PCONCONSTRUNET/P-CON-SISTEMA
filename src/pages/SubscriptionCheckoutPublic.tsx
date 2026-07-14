import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ShieldCheck, XCircle, Loader2, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BlueBackground from '@/components/BlueBackground';
import PixQRCode from '@/components/PixQRCode';
import { supabase } from '@/integrations/supabase/client';
import { useEfiPay } from '@/hooks/useEfiPay';
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
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPix, setCreatingPix] = useState(false);
  const hasLoaded = useRef(false);
  const { createPixPayment, checkPaymentStatus } = useEfiPay();
  const [clientDocument, setClientDocument] = useState('');

  const [pixPayment, setPixPayment] = useState<{
    paymentId: string;
    qrCode: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expirationDate?: string;
    amount: number;
  } | null>(null);

  const [isPaidLocally, setIsPaidLocally] = useState(false);

  useEffect(() => {
    if (!id || hasLoaded.current) return;
    hasLoaded.current = true;

    const loadSubscription = async () => {
      try {
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
           // Decode URI component just in case
           const decodedId = decodeURIComponent(id);
           query = query.ilike('clients.name', `${decodedId}%`).eq('status', 'active');
        }

        const { data, error } = await query.limit(1).maybeSingle();

        if (error || !data) throw new Error('Assinatura não encontrada');

        setSubData(data as any as SubscriptionData);
        if ((data.clients as any)?.document) {
          setClientDocument((data.clients as any).document);
        }
      } catch (err) {
        console.error('Error loading subscription:', err);
        setSubData(null);
      } finally {
        setLoading(false);
      }
    };

    void loadSubscription();
  }, [id]);

  const isActive = subData?.status === 'active';
  const isPaid = isPaidLocally; 

  const handlePixPayment = async () => {
    if (!subData || !isActive) return;

    if (!clientDocument || clientDocument.replace(/\D/g, '').length < 11) {
      toast.error('Informe um CPF ou CNPJ válido para gerar o PIX.');
      return;
    }

    setCreatingPix(true);
    try {
      const result = await createPixPayment({
        amount: Number(subData.value),
        description: `Pagamento - ${subData.plan_name}`,
        clientId: subData.clients.id,
        clientName: subData.clients.name,
        clientEmail: subData.clients.email,
        clientDocument: clientDocument,
        subscriptionId: subData.id,
      });

      if (result?.success && result.paymentId) {
        setPixPayment({
          paymentId: result.paymentId,
          qrCode: result.qrCode || '',
          qrCodeBase64: result.qrCodeBase64,
          ticketUrl: result.ticketUrl,
          expirationDate: result.expirationDate,
          amount: Number(subData.value)
        });
      } else {
        toast.error('Erro ao gerar PIX. Tente novamente.');
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
    const result = await checkPaymentStatus(pixPayment.paymentId);
    if (result?.success && result.status === 'paid') {
      setIsPaidLocally(true);
    }
    return result;
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
              <p className="text-muted-foreground mt-2">Esta assinatura não existe ou o link é inválido.</p>
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
            <Badge className={`border ${
              isPaid ? 'bg-success/20 text-success border-success/30' :
              !isActive ? 'bg-destructive/20 text-destructive border-destructive/30' :
              'bg-orange-500/15 text-orange-500 border-orange-500/30'
            }`}>
              {isPaid ? 'Pago' : !isActive ? 'Inativa' : 'Aguardando pagamento'}
            </Badge>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-6 sm:py-10 max-w-fit flex flex-col items-center">
          <div className="w-full max-w-lg sm:max-w-fit min-w-[320px] space-y-6">
            
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
                  <h1 className="text-3xl sm:text-4xl font-heading font-bold leading-tight text-foreground">Pagamento de Assinatura</h1>
                  <p className="text-base sm:text-lg text-foreground/90 font-medium leading-relaxed mt-2">{subData.plan_name}</p>
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
                    <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-primary">Valor do Plano</p>
                    <div className="mt-2 text-3xl sm:text-4xl font-heading font-bold">
                      {formatCurrency(subData.value)}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 space-y-4">
                    {subData.clients.name && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Cliente</span>
                        <span className="font-semibold">{subData.clients.name}</span>
                      </div>
                    )}

                    {!isPaid && isActive && !pixPayment && (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground ml-1">CPF ou CNPJ (Obrigatório)</label>
                        <Input
                          placeholder="000.000.000-00"
                          value={clientDocument}
                          onChange={(e) => setClientDocument(e.target.value)}
                          className="bg-secondary/20 border-border/60 h-11"
                        />
                      </div>
                    )}

                    {subData.next_payment && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4" /> Vencimento
                        </span>
                        <span className="font-semibold">
                          {new Date(subData.next_payment).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                        </span>
                      </div>
                    )}

                    {/* Status messages */}
                    {isPaid && (
                      <div className="rounded-xl border-2 border-success/40 bg-success/10 p-4 text-center space-y-2">
                        <CheckCircle className="h-8 w-8 text-success mx-auto" />
                        <p className="font-semibold text-success">Pagamento confirmado!</p>
                        <p className="text-sm text-muted-foreground">Sua assinatura foi renovada com sucesso.</p>
                      </div>
                    )}

                    {!isActive && !isPaid && (
                      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
                        <XCircle className="h-8 w-8 text-destructive mx-auto" />
                        <p className="font-semibold text-destructive">
                          Assinatura Inativa
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Esta assinatura não está mais ativa.
                        </p>
                      </div>
                    )}

                    {/* PIX Generation */}
                    {!isPaid && isActive && !pixPayment && (
                      <div className="pt-4 border-t border-border/30">
                        <Button
                          onClick={handlePixPayment}
                          disabled={creatingPix}
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

                    {/* PIX Code Component */}
                    {pixPayment && !isPaid && (
                      <div className="pt-4 border-t border-border/30">
                        <div className="mb-4 text-center">
                          <p className="font-semibold text-foreground">Pagamento via PIX</p>
                          <p className="text-sm text-muted-foreground">
                            Use o PIX abaixo para concluir o pagamento desta mensalidade.
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
                        />
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
