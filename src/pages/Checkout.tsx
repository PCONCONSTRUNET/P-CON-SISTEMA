import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useMercadoPago } from '@/hooks/useMercadoPago';
import { useContracts, Contract } from '@/hooks/useContracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatBrazilDate } from '@/utils/dateUtils';
import { 
  Loader2, 
  LogOut, 
  CreditCard, 
  QrCode, 
  Calendar, 
  DollarSign,
  CheckCircle,
  AlertCircle,
  Copy,
  Shield,
  ArrowRight,
  X,
  Clock,
  Receipt,
  FileText,
  Download,
  MapPin,
  FileCheck,
  Rocket,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import logo from '@/assets/logo-pcon-pwa-large.png';
import pixIcon from '@/assets/pix-icon.svg';
import mercadoPagoIcon from '@/assets/mercado-pago-icon.png';
import BlueBackground from '@/components/BlueBackground';

import { generateInvoicePDF } from '@/utils/invoicePdfGenerator';
import { formatBrazilDate as formatDateBR } from '@/utils/dateUtils';

interface Subscription {
  id: string;
  plan_name: string;
  value: number;
  status: string;
  next_payment: string;
  start_date: string;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  description: string | null;
  asaas_id: string | null;
  transaction_id: string | null;
  subscription_id: string | null;
  subscriptions?: {
    plan_name: string;
  } | null;
}

const Checkout = () => {
  const { client, isAuthenticated, isLoading: authLoading, logout } = useClientAuth();
  const navigate = useNavigate();
  const { createPixPayment, checkPaymentStatus, loading: mpLoading } = useMercadoPago();
  const { contracts, loading: contractsLoading } = useContracts(client?.id);
  
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingCharges, setPendingCharges] = useState<Payment[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [selectedCharge, setSelectedCharge] = useState<Payment | null>(null);
  const [selectedPaidPayment, setSelectedPaidPayment] = useState<Payment | null>(null);
  const [isPaidDetailsOpen, setIsPaidDetailsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD' | null>(null);
  const [pixData, setPixData] = useState<{ qrCode: string; copyPaste: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'select' | 'processing' | 'pix' | 'success' | 'error'>('select');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);
  const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null);
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);
  const [invoiceModalSub, setInvoiceModalSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/cliente');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (client?.id) {
      fetchSubscriptions();
      fetchPayments();
      fetchPendingCharges();
    }
  }, [client?.id]);

  const fetchSubscriptions = async () => {
    if (!client?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching subscriptions:', error);
      }
      
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPayments = async () => {
    if (!client?.id) return;
    
    try {
      // Busca todos os pagamentos do cliente (com e sem assinatura)
      const { data, error } = await supabase
        .from('payments')
        .select('*, subscriptions(plan_name)')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching payments:', error);
      }
      
      setPayments(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchPendingCharges = async () => {
    if (!client?.id) return;
    
    try {
      // Busca cobranças únicas pendentes (sem subscription_id)
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', client.id)
        .is('subscription_id', null)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pending charges:', error);
      }
      
      setPendingCharges(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/cliente');
  };

  const openPaymentModal = (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setSelectedCharge(null);
    setIsPaymentDialogOpen(true);
    setPaymentStep('select');
    setPixData(null);
  };

  const openChargePaymentModal = (charge: Payment) => {
    setSelectedCharge(charge);
    setSelectedSubscription(null);
    setIsPaymentDialogOpen(true);
    setPaymentStep('select');
    setPixData(null);
  };

  const openPaidPaymentDetails = (payment: Payment) => {
    setSelectedPaidPayment(payment);
    setIsPaidDetailsOpen(true);
  };

  const handlePayment = async (method: 'PIX') => {
    if (!client) return;
    
    // Determina se é assinatura ou cobrança única
    const isSubscription = !!selectedSubscription;
    const paymentValue = isSubscription ? Number(selectedSubscription!.value) : Number(selectedCharge!.amount);
    const paymentDescription = isSubscription 
      ? `Pagamento - ${selectedSubscription!.plan_name}` 
      : selectedCharge!.description || 'Cobrança única';
    const externalRef = isSubscription ? selectedSubscription!.id : selectedCharge!.id;
    
    setPaymentMethod(method);
    setPaymentStep('processing');
    setIsProcessing(true);
    setPixData(null);

    try {
      // Criar pagamento PIX via Mercado Pago
      const pixResult = await createPixPayment({
        amount: paymentValue,
        description: paymentDescription,
        clientId: client.id,
        clientEmail: client.email,
        clientName: client.name,
        clientDocument: client.document || undefined,
        subscriptionId: isSubscription ? selectedSubscription!.id : undefined,
      });

      if (pixResult?.success && pixResult.qrCode) {
        setPixData({
          qrCode: pixResult.qrCodeBase64 || '',
          copyPaste: pixResult.qrCode,
        });
        setPaymentStep('pix');
      } else {
        throw new Error('Erro ao gerar QR Code PIX');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      setPaymentStep('error');
      toast.error(error.message || 'Erro ao processar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyPixCode = () => {
    if (pixData?.copyPaste) {
      navigator.clipboard.writeText(pixData.copyPaste);
      toast.success('Código PIX copiado!');
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      active: { 
        label: 'Ativa', 
        className: 'bg-success/20 text-success border-success/30',
        icon: <CheckCircle className="h-3 w-3" />
      },
      pending: { 
        label: 'Pendente', 
        className: 'bg-warning/20 text-warning border-warning/30',
        icon: <AlertCircle className="h-3 w-3" />
      },
      cancelled: { 
        label: 'Cancelada', 
        className: 'bg-destructive/20 text-destructive border-destructive/30',
        icon: <AlertCircle className="h-3 w-3" />
      },
    };
    return configs[status] || { label: status, className: 'bg-muted text-muted-foreground', icon: null };
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <BlueBackground />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative z-10 flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full spinner-blue" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <BlueBackground />
      
      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-20 glass-card border-b border-border/20 sticky top-0"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <img src={logo} alt="Logo P-CON" className="w-auto h-16 sm:h-20 max-w-[14rem] sm:max-w-[18rem] drop-shadow-[0_12px_36px_hsl(var(--primary)/0.35)]" />
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ scale: 1.05 }} 
              whileTap={{ scale: 0.95 }}
              className="relative"
            >
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              <Button 
                size="sm" 
                onClick={() => navigate('/cliente/implantacoes')}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/30 font-semibold"
              >
                <Rocket className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Implantações</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </motion.div>
            <span className="text-sm text-muted-foreground hidden sm:block">
              {client?.name?.split(' ')[0]}
            </span>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-4 py-10 sm:py-16 max-w-5xl">
        <div className="space-y-8">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-center"
          >
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mb-2">
              Meus Pagamentos
            </h1>
            <p className="text-gray-neutral text-sm">
              Gerencie e realize pagamentos com segurança
            </p>
          </motion.div>


          {/* Pending Single Charges */}
          {pendingCharges.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="h-5 w-5 text-warning" />
                <h2 className="text-lg font-heading font-semibold text-foreground">
                  Cobranças Pendentes
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pendingCharges.map((charge, index) => (
                  <motion.div
                    key={charge.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + index * 0.05, duration: 0.5 }}
                    className="glass-card p-5 flex flex-col border-l-4 border-warning"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-heading font-semibold text-foreground truncate">
                          {charge.description || 'Cobrança única'}
                        </h3>
                        <p className="text-gray-neutral text-xs mt-0.5">Aguardando pagamento</p>
                      </div>
                      <Badge className="bg-warning/20 text-warning border-warning/30 flex items-center gap-1 px-2 py-0.5 border rounded-full text-[10px] flex-shrink-0">
                        <Clock className="h-3 w-3" />
                        Pendente
                      </Badge>
                    </div>

                    <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(30, 79, 163, 0.2)' }}>
                          <DollarSign className="h-4 w-4" style={{ color: '#1E4FA3' }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-neutral">Valor</p>
                          <p className="text-lg font-semibold text-foreground">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(charge.amount))}
                          </p>
                        </div>
                      </div>
                    </div>

                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        size="default"
                        className="w-full h-10 btn-blue text-sm"
                        onClick={() => openChargePaymentModal(charge)}
                        disabled={isProcessing || mpLoading}
                      >
                        <span className="flex items-center justify-center gap-2">
                          Pagar Agora
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </Button>
                    </motion.div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Subscriptions Section */}
          {subscriptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-heading font-semibold text-foreground">
                  Detalhes da fatura
                </h2>
              </div>
              <div className="space-y-4">
                {subscriptions.map((subscription, index) => {
                  const isExpanded = expandedSubscription === subscription.id;
                  const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(subscription.value));
                  
                  return (
                    <motion.div
                      key={subscription.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + index * 0.06, duration: 0.4 }}
                      className="glass-card rounded-2xl overflow-hidden"
                    >
                      {/* Header bar */}
                      <div className="bg-primary px-4 py-3 flex items-center justify-between">
                        <h3 className="text-sm font-heading font-semibold text-primary-foreground">
                          Detalhes da fatura - {subscription.plan_name}
                        </h3>
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        {/* Info row: Vencimento | Valor | Status */}
                        <div className="rounded-xl border border-border/30 bg-secondary/20 p-3 mb-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-[10px] text-gray-neutral mb-0.5">Vencimento</p>
                              <p className="text-sm font-bold text-foreground">
                                {formatBrazilDate(subscription.next_payment)}
                              </p>
                            </div>
                            <div className="w-px h-8 bg-border/30" />
                            <div className="flex-1 text-center">
                              <p className="text-[10px] text-gray-neutral mb-0.5">Valor</p>
                              <p className="text-sm font-bold text-foreground">
                                {formattedValue}
                              </p>
                            </div>
                            <div className="w-px h-8 bg-border/30" />
                            <div className="flex-1 text-right">
                              <p className="text-[10px] text-gray-neutral mb-0.5">Status</p>
                              <Badge 
                                className={`${getStatusConfig(subscription.status).className} inline-flex items-center gap-0.5 px-2 py-0.5 border rounded-full text-[10px]`}
                              >
                                {getStatusConfig(subscription.status).icon}
                                {getStatusConfig(subscription.status).label}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Expandable section */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-2 pb-3 space-y-3">
                                <h4 className="text-sm font-heading font-semibold text-foreground">Lançamentos</h4>
                                <div className="flex items-center justify-between py-1.5 border-b border-border/20">
                                  <span className="text-xs text-gray-neutral">Valor original</span>
                                  <span className="text-xs text-foreground">{formattedValue}</span>
                                </div>
                                <div className="flex items-center justify-between py-1.5">
                                  <span className="text-sm font-bold text-foreground">Total</span>
                                  <span className="text-sm font-bold text-foreground">{formattedValue}</span>
                                </div>

                                {/* Ver fatura (gera PDF direto) */}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!client || generatingInvoice === subscription.id) return;
                                    setGeneratingInvoice(subscription.id);
                                    toast.info('Gerando fatura em PDF...');
                                    try {
                                      const pixResult = await createPixPayment({
                                        amount: Number(subscription.value),
                                        description: `Pagamento - ${subscription.plan_name}`,
                                        clientId: client.id,
                                        clientEmail: client.email,
                                        clientName: client.name,
                                        clientDocument: client.document || undefined,
                                        subscriptionId: subscription.id,
                                      });
                                      if (pixResult?.success && pixResult.qrCode) {
                                        generateInvoicePDF({
                                          clientName: client.name,
                                          clientDocument: client.document,
                                          clientEmail: client.email,
                                          clientPhone: client.phone,
                                          planName: subscription.plan_name,
                                          value: Number(subscription.value),
                                          dueDate: formatBrazilDate(subscription.next_payment),
                                          qrCodeBase64: pixResult.qrCodeBase64 || '',
                                          pixCopyPaste: pixResult.qrCode,
                                          subscriptionId: subscription.id,
                                        });
                                        toast.success('Fatura PDF gerada com sucesso!');
                                      } else {
                                        toast.error('Erro ao gerar QR Code para a fatura');
                                      }
                                    } catch (err) {
                                      console.error('Error generating invoice PDF:', err);
                                      toast.error('Erro ao gerar fatura PDF');
                                    } finally {
                                      setGeneratingInvoice(null);
                                    }
                                  }}
                                  disabled={generatingInvoice === subscription.id}
                                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/30 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                >
                                  {generatingInvoice === subscription.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                  {generatingInvoice === subscription.id ? 'Gerando...' : 'Ver fatura'}
                                </button>

                                {/* Pagar com Pix */}
                                <motion.button
                                  whileHover={{ scale: 1.02, y: -2 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => openPaymentModal(subscription)}
                                  disabled={isProcessing || mpLoading}
                                  className="w-full py-3 px-5 rounded-xl flex items-center justify-center gap-2.5 font-bold text-sm text-white border-none cursor-pointer btn-pix disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <img src={pixIcon} alt="Pix" className="w-5 h-5" />
                                  Pagar com Pix
                                </motion.button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Toggle button */}
                        <button
                          onClick={() => setExpandedSubscription(isExpanded ? null : subscription.id)}
                          className="w-full mt-1 py-2 rounded-lg border border-border/30 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors flex items-center justify-center gap-1"
                        >
                          {isExpanded ? (
                            <>Ver menos <ChevronUp className="h-3.5 w-3.5" /></>
                          ) : (
                            <>Ver mais <ChevronDown className="h-3.5 w-3.5" /></>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Contracts Section - Seu Plano */}
          {contracts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <FileCheck className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-heading font-semibold text-foreground">
                  Meus Contratos
                </h2>
              </div>
              <div className="space-y-4">
                {contracts.map((contract, index) => (
                  <motion.div
                    key={contract.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.05, duration: 0.5 }}
                    className="glass-card p-5 sm:p-6"
                  >
                    {/* Contract Header with Status Badge */}
                    <div className="flex items-start justify-between mb-4">
                      <Badge className={`px-3 py-1 border rounded-full text-xs font-medium ${
                        contract.status === 'active' 
                          ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                          : 'bg-primary/20 text-primary border-primary/30'
                      }`}>
                        {contract.status === 'active' ? 'Ativo' : contract.status}
                      </Badge>
                    </div>

                    {/* Contract Title */}
                    <h3 className="text-xl font-heading font-bold text-foreground mb-4">
                      {contract.title}
                    </h3>

                    {/* Contract Info */}
                    <div className="space-y-3 mb-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(30, 79, 163, 0.2)' }}>
                          <FileText className="h-4 w-4" style={{ color: '#1E4FA3' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-neutral">Contrato</p>
                          <p className="text-sm font-medium text-foreground">
                            {contract.id.split('-')[0].toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(42, 63, 134, 0.2)' }}>
                          <Calendar className="h-4 w-4" style={{ color: '#2A3F86' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-neutral">Data do Contrato</p>
                          <p className="text-sm font-medium text-foreground">
                            {formatBrazilDate(contract.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-border/30 mb-4" />

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      {contract.content && (
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                          <Button
                            size="default"
                            variant="outline"
                            className="w-full h-10 text-sm"
                            onClick={() => {
                              setSelectedContract(contract);
                              setIsContractDialogOpen(true);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Ver Contrato
                          </Button>
                        </motion.div>
                      )}
                      {contract.file_path && (
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                          <Button
                            size="default"
                            className="w-full h-10 btn-blue text-sm"
                            onClick={() => window.open(contract.file_path!, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Baixar PDF
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Empty State */}
          {subscriptions.length === 0 && pendingCharges.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="glass-card p-10 text-center"
            >
              <AlertCircle className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-heading font-semibold mb-2">Nenhum pagamento pendente</h3>
              <p className="text-gray-neutral text-sm">
                Você não possui pagamentos ou assinaturas pendentes no momento.
              </p>
            </motion.div>
          )}
        </div>

        {/* Payment History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-10"
        >
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-heading font-semibold text-foreground">
              Histórico de Pagamentos
            </h2>
          </div>

          {payments.length > 0 ? (
            <div className="glass-card overflow-hidden">
              <div className="divide-y divide-border/30">
                {payments.map((payment, index) => {
                  const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
                    paid: { 
                      label: 'Pago', 
                      className: 'bg-success/20 text-success',
                      icon: <CheckCircle className="h-3 w-3" />
                    },
                    pending: { 
                      label: 'Pendente', 
                      className: 'bg-warning/20 text-warning',
                      icon: <Clock className="h-3 w-3" />
                    },
                    cancelled: { 
                      label: 'Cancelado', 
                      className: 'bg-destructive/20 text-destructive',
                      icon: <X className="h-3 w-3" />
                    },
                    failed: { 
                      label: 'Falhou', 
                      className: 'bg-destructive/20 text-destructive',
                      icon: <AlertCircle className="h-3 w-3" />
                    },
                  };
                  const config = statusConfig[payment.status] || statusConfig.pending;

                  const isPaid = payment.status === 'paid';

                  return (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className={`p-4 flex items-center justify-between gap-4 hover:bg-secondary/20 transition-colors ${isPaid ? 'cursor-pointer' : ''}`}
                      onClick={() => isPaid && openPaidPaymentDetails(payment)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-secondary/50 flex-shrink-0">
                          {payment.payment_method === 'pix' ? (
                            <QrCode className="h-5 w-5 text-primary" />
                          ) : payment.payment_method === 'boleto' ? (
                            <FileText className="h-5 w-5 text-primary" />
                          ) : (
                            <CreditCard className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {payment.subscriptions?.plan_name || payment.description || 'Cobrança única'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBrazilDate(payment.created_at, "dd/MM/yyyy 'às' HH:mm")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(payment.amount))}
                        </span>
                        <span className={`${config.className} flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium`}>
                          {config.icon}
                          {config.label}
                        </span>
                        {isPaid && (
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="glass-card p-8 text-center">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento registrado ainda.
              </p>
            </div>
          )}
        </motion.div>


        {/* Footer with Payment Methods */}
        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-12 pb-8"
        >
          <div className="flex flex-col items-center gap-4">
            <p className="text-xs text-gray-neutral">Pagamentos processados por</p>
            <div className="flex items-center gap-2">
              <img src={mercadoPagoIcon} alt="Mercado Pago" className="h-8 w-8" />
              <span className="text-lg font-bold text-primary">Mercado Pago</span>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/30 border border-border/30">
                <img src={pixIcon} alt="PIX" className="h-5 w-5" />
                <span className="text-sm text-muted-foreground">PIX</span>
              </div>
            </div>
          </div>
        </motion.footer>
      </main>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentDialogOpen && (
          <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
            <DialogContent className="glass-card border-border/30 max-w-[320px] p-0 overflow-hidden rounded-2xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="p-5 sm:p-6"
              >

                {/* Select Payment Method */}
                {paymentStep === 'select' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="text-center">
                      <h2 className="text-xl font-heading font-semibold text-foreground mb-2">
                        {selectedSubscription ? selectedSubscription.plan_name : (selectedCharge?.description || 'Cobrança única')}
                      </h2>
                      <p className="text-2xl font-bold text-foreground mb-1">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          selectedSubscription ? Number(selectedSubscription.value) : Number(selectedCharge?.amount || 0)
                        )}
                      </p>
                      <p className="text-gray-neutral text-sm">
                        Selecione a forma de pagamento
                      </p>
                    </div>

                    <div className="space-y-3">
                      <motion.button
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handlePayment('PIX')}
                        className="w-full py-3 px-5 rounded-xl flex items-center justify-center gap-2.5 font-bold text-base text-white border-none cursor-pointer btn-pix"
                      >
                        <img src={pixIcon} alt="Pix" className="w-6 h-6" />
                        Pagar com Pix
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* Processing */}
                {paymentStep === 'processing' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-10 flex flex-col items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-full spinner-blue" />
                    <p className="text-foreground font-medium">Processando pagamento...</p>
                    <p className="text-gray-neutral text-sm">Aguarde um momento</p>
                  </motion.div>
                )}

                {/* PIX QR Code */}
                {paymentStep === 'pix' && pixData && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Logo maior + título */}
                    <div className="flex flex-col items-center gap-2">
                      <img
                        src="/images/logo-pcon-white.png"
                        alt="P-CON CONSTRUNET"
                        className="h-14 object-contain"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <img src={pixIcon} alt="PIX" className="h-5 w-5" />
                        <h2 className="text-lg font-heading font-semibold text-foreground">
                          Pague com PIX
                        </h2>
                      </div>
                    </div>

                    {/* Valor em destaque */}
                    {selectedCharge && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Valor a pagar</p>
                        <p className="text-2xl font-bold text-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedCharge.amount)}
                        </p>
                      </div>
                    )}

                    {/* QR Code com fundo branco para escaneabilidade */}
                    <div className="flex justify-center">
                      <div className="bg-white p-2.5 rounded-xl">
                        <img 
                          src={`data:image/png;base64,${pixData.qrCode}`} 
                          alt="QR Code PIX" 
                          className="w-36 h-36"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-gray-neutral text-center">Ou copie o código:</p>
                      <div className="flex gap-2">
                        <code className="flex-1 p-3 bg-secondary/40 rounded-lg text-xs break-all max-h-16 overflow-y-auto border border-border/30 text-muted-foreground">
                          {pixData.copyPaste}
                        </code>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button 
                            size="icon" 
                            className="btn-blue h-12 w-12"
                            onClick={copyPixCode}
                          >
                            <Copy className="h-5 w-5" />
                          </Button>
                        </motion.div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: '#1E4FA3' }} />
                      <p className="text-xs text-foreground/80">
                        A confirmação será automática após o pagamento.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Seção de boleto removida - sistema agora usa apenas PIX via Mercado Pago */}

                {/* Success */}
                {paymentStep === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-8 flex flex-col items-center gap-4 text-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                      <CheckCircle className="h-8 w-8 text-success" />
                    </div>
                    <h3 className="text-lg font-heading font-semibold text-foreground">
                      Redirecionado com sucesso!
                    </h3>
                    <p className="text-gray-neutral text-sm">
                      Complete o pagamento na nova janela.
                    </p>
                  </motion.div>
                )}

                {/* Error */}
                {paymentStep === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-8 flex flex-col items-center gap-4 text-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-heading font-semibold text-foreground">
                      Erro no pagamento
                    </h3>
                    <p className="text-gray-neutral text-sm">
                      Tente novamente ou escolha outro método.
                    </p>
                    <Button 
                      className="mt-2 btn-outline-blue"
                      onClick={() => setPaymentStep('select')}
                    >
                      Tentar novamente
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Paid Payment Details Modal */}
      <AnimatePresence>
        {isPaidDetailsOpen && selectedPaidPayment && (
          <Dialog open={isPaidDetailsOpen} onOpenChange={setIsPaidDetailsOpen}>
            <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden border-0">
              {/* Header */}
              <div className="bg-[#1E4FA3] text-white p-4 flex items-center justify-between">
                <h2 className="text-lg font-heading font-semibold">
                  Detalhes da fatura - {formatBrazilDate(selectedPaidPayment.created_at, "MMM/yy")}
                </h2>
                <button 
                  onClick={() => setIsPaidDetailsOpen(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Invoice Info Card */}
                <div className="bg-secondary/30 rounded-xl p-4 border border-border/30">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Vencimento</p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatBrazilDate(selectedPaidPayment.created_at, "dd/MM/yy")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Valor</p>
                      <p className="text-sm font-semibold text-foreground">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedPaidPayment.amount))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <Badge className="bg-success/20 text-success border-0 px-2 py-0.5 text-xs">
                        Paga
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Success Icon */}
                <div className="flex flex-col items-center py-4">
                  <div className="w-24 h-24 rounded-full border-4 border-success flex items-center justify-center mb-4">
                    <CheckCircle className="h-12 w-12 text-success" />
                  </div>
                  <h3 className="text-lg font-heading font-semibold text-foreground">
                    Pagamento realizado com sucesso!
                  </h3>
                </div>

                {/* Payment Details Card */}
                <div className="bg-success/10 rounded-xl p-4 border border-success/20">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Data do pagamento</span>
                      <span className="text-sm text-muted-foreground">
                        {selectedPaidPayment.paid_at 
                          ? formatBrazilDate(selectedPaidPayment.paid_at, "dd/MM/yy")
                          : formatBrazilDate(selectedPaidPayment.created_at, "dd/MM/yy")
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Valor pago</span>
                      <span className="text-sm text-muted-foreground">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(selectedPaidPayment.amount))}
                      </span>
                    </div>
                    {selectedPaidPayment.payment_method && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Método</span>
                        <span className="text-sm text-muted-foreground capitalize">
                          {selectedPaidPayment.payment_method === 'pix' ? 'PIX' : 
                           selectedPaidPayment.payment_method === 'boleto' ? 'Boleto' : 
                           selectedPaidPayment.payment_method === 'credit_card' ? 'Cartão de Crédito' : 
                           selectedPaidPayment.payment_method}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Contract Content Dialog */}
        {selectedContract && (
          <Dialog open={isContractDialogOpen} onOpenChange={setIsContractDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/30 pb-4 mb-4">
                <div>
                  <h3 className="text-xl font-heading font-bold text-foreground">
                    {selectedContract.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Contrato #{selectedContract.id.split('-')[0].toUpperCase()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsContractDialogOpen(false)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="overflow-y-auto max-h-[60vh] pr-2">
                <div className="prose prose-sm max-w-none text-foreground">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-secondary/20 p-4 rounded-xl border border-border/30">
                    {selectedContract.content}
                  </pre>
                </div>
              </div>

              {selectedContract.file_path && (
                <div className="pt-4 border-t border-border/30 mt-4">
                  <Button
                    className="w-full btn-blue"
                    onClick={() => window.open(selectedContract.file_path!, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Documento
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Checkout;