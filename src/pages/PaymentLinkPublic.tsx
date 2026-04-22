import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ShieldCheck, XCircle, Clock, DollarSign, Copy, Loader2, CheckCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BlueBackground from '@/components/BlueBackground';
import PixQRCode from '@/components/PixQRCode';
import { supabase } from '@/integrations/supabase/client';
import { useMisticPay } from '@/hooks/useMisticPay';
import pixIcon from '@/assets/pix-icon.svg';

interface CheckoutLinkData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  amount: number;
  status: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  expires_at: string | null;
  allow_pix: boolean;
  allow_card: boolean;
  max_installments: number;
  view_count: number;
  paid_at: string | null;
  image_url: string | null;
  created_at: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const PaymentLinkPublic = () => {
  const { slug } = useParams();
  const [linkData, setLinkData] = useState<CheckoutLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPix, setCreatingPix] = useState(false);
  const hasTrackedView = useRef(false);
  const { createPixPayment, checkPaymentStatus } = useMisticPay();
  const [clientDocument, setClientDocument] = useState('');

  const [pixPayment, setPixPayment] = useState<{
    paymentId: string;
    qrCode: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expirationDate?: string;
    amount: number;
  } | null>(null);

  useEffect(() => {
    if (!slug || hasTrackedView.current) return;
    hasTrackedView.current = true;

    const loadLink = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('checkout_links')
          .select('*')
          .eq('slug', slug)
          .single();

        if (error || !data) throw new Error('Link not found');

        // Track view
        await (supabase as any)
          .from('checkout_links')
          .update({
            view_count: (data.view_count || 0) + 1,
            last_viewed_at: new Date().toISOString(),
            first_viewed_at: data.first_viewed_at || new Date().toISOString(),
          })
          .eq('id', data.id);

        setLinkData(data as CheckoutLinkData);
      } catch (err) {
        console.error('Error loading checkout link:', err);
        setLinkData(null);
      } finally {
        setLoading(false);
      }
    };

    void loadLink();
  }, [slug]);

  const isExpired = linkData?.expires_at && new Date(linkData.expires_at) < new Date();
  const isPaid = linkData?.status === 'paid';
  const isInactive = linkData?.status === 'inactive';
  const canPay = linkData && linkData.status === 'active' && !isExpired;

  const handlePixPayment = async () => {
    if (!linkData || !canPay) return;

    setCreatingPix(true);
    try {
      const result = await createPixPayment({
        amount: Number(linkData.amount),
        description: linkData.title,
        clientEmail: linkData.client_email || 'cliente@pconassinantes.site',
        clientName: linkData.client_name || 'Cliente',
        clientPhone: linkData.client_phone || undefined,
        clientDocument: clientDocument || undefined,
        checkoutLinkId: linkData.id,
      });

      if (result?.success && result.paymentId && result.qrCode) {
        setPixPayment({
          paymentId: result.paymentId,
          qrCode: result.qrCode,
          qrCodeBase64: result.qrCodeBase64,
          expirationDate: result.expirationDate,
          amount: Number(linkData.amount),
        });
        toast.success('QR Code PIX gerado com sucesso!');
      }
    } catch (err: any) {
      console.error('Error creating PIX:', err);
      toast.error('Erro ao gerar pagamento PIX');
    } finally {
      setCreatingPix(false);
    }
  };

  const handleCheckPixStatus = async () => {
    if (!pixPayment) return null;
    const result = await checkPaymentStatus(pixPayment.paymentId);

    if (result?.status === 'approved' && linkData) {
      // Mark link as paid
      await (supabase as any)
        .from('checkout_links')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', linkData.id);

      setLinkData({ ...linkData, status: 'paid', paid_at: new Date().toISOString() });
    }

    return result;
  };

  const handlePaymentConfirmed = async () => {
    if (!linkData) return;
    setLinkData({ ...linkData, status: 'paid', paid_at: new Date().toISOString() });
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

  if (!linkData) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4">
        <BlueBackground />
        <Card className="glass-card relative z-10 max-w-lg w-full">
          <CardContent className="p-8 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-2xl font-heading font-bold">Link não encontrado</h1>
              <p className="text-muted-foreground mt-2">Este link de pagamento não existe ou foi removido.</p>
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
              isExpired || isInactive ? 'bg-destructive/20 text-destructive border-destructive/30' :
              'bg-orange-500/15 text-orange-500 border-orange-500/30'
            }`}>
              {isPaid ? 'Pago' : isExpired ? 'Expirado' : isInactive ? 'Inativo' : 'Aguardando pagamento'}
            </Badge>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-6 sm:py-10 max-w-fit flex flex-col items-center">
          <div className="w-full max-w-lg sm:max-w-fit min-w-[320px] space-y-6">
            
            {/* Banner & Title Card */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card overflow-hidden rounded-2xl flex flex-col"
            >
              {/* Banner Image (Adaptable) */}
              <img 
                src={linkData.image_url || "/images/assistente.jpeg"} 
                alt="Banner Checkout" 
                className="w-full h-auto object-contain bg-black/20"
              />

              <div className="p-6 space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-500 shadow-[var(--shadow-glow)] backdrop-blur-md w-fit">
                  <ShieldCheck className="h-4 w-4" />
                  Pagamento seguro
                </span>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-heading font-bold leading-tight text-foreground">{linkData.title}</h1>
                  {linkData.description && (
                    <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mt-2">{linkData.description}</p>
                  )}
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
                  <div className="bg-primary/15 border-b border-border/40 p-5 sm:p-6">
                    <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-primary">Valor total</p>
                    <div className="mt-2 text-3xl sm:text-4xl font-heading font-bold">
                      {formatCurrency(Number(linkData.amount))}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6 space-y-4">
                    {linkData.client_name && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Cliente</span>
                        <span className="font-semibold">{linkData.client_name}</span>
                      </div>
                    )}

                    {!isPaid && !isExpired && !isInactive && !pixPayment && (
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

                    {linkData.expires_at && (
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4" /> Válido até
                        </span>
                        <span className="font-semibold">
                          {new Date(linkData.expires_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}

                    {/* Status messages */}
                    {isPaid && (
                      <div className="rounded-xl border-2 border-success/40 bg-success/10 p-4 text-center space-y-2">
                        <CheckCircle className="h-8 w-8 text-success mx-auto" />
                        <p className="font-semibold text-success">Pagamento confirmado!</p>
                        <p className="text-sm text-muted-foreground">Obrigado pelo pagamento.</p>
                      </div>
                    )}

                    {(isExpired || isInactive) && !isPaid && (
                      <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-4 text-center space-y-2">
                        <XCircle className="h-8 w-8 text-destructive mx-auto" />
                        <p className="font-semibold text-destructive">
                          {isExpired ? 'Link expirado' : 'Link desativado'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Este link de pagamento não está mais disponível.
                        </p>
                      </div>
                    )}

                    {/* Payment buttons */}
                    {canPay && !pixPayment && (
                      <div className="space-y-3 pt-2">
                        {linkData.allow_pix && (
                          <Button
                            className="w-full h-12 text-base font-bold gap-3"
                            onClick={() => {
                              if (!clientDocument) {
                                toast.error('CPF ou CNPJ é obrigatório para gerar o PIX');
                                return;
                              }
                              handlePixPayment();
                            }}
                            disabled={creatingPix}
                          >
                            {creatingPix ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <img src={pixIcon} alt="PIX" className="h-5 w-5 object-contain" />
                            )}
                            {creatingPix ? 'Gerando PIX...' : 'Pagar com PIX'}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* PIX QR Code */}
                    {pixPayment && !isPaid && (
                      <div className="rounded-2xl border border-border/60 bg-secondary/10 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Pagamento via PIX</p>
                          <p className="text-xs text-muted-foreground">
                            Escaneie o QR Code ou copie o código para pagar.
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
            </motion.div>

            {/* Security info */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-center text-xs text-muted-foreground space-y-1 pb-6"
            >
              <p className="flex items-center justify-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Pagamento processado com segurança
              </p>
              <p>P-CON CONSTRUNET • Todos os direitos reservados</p>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PaymentLinkPublic;
