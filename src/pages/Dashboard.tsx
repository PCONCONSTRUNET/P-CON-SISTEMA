import { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  DollarSign, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  CreditCard,
  Package,
} from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, isPast, startOfDay, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';

const PRO_LABORE_KEY = 'pcon_pro_labore_config';
import DashboardLayout from '@/components/DashboardLayout';
import MetricCard from '@/components/MetricCard';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import DashboardCharts from '@/components/DashboardCharts';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useGlobalData } from '@/contexts/GlobalDataContext';
import { supabase } from '@/integrations/supabase/client';
import { formatBrazilDate } from '@/utils/dateUtils';
import { toast } from 'sonner';

const Dashboard = () => {
  const [isResetting, setIsResetting] = useState(false);
  const [proLaboreConfig, setProLaboreConfig] = useState<{ mode: 'percent' | 'fixed'; percent: number; fixed: number } | null>(null);
  const { 
    clients, 
    subscriptions, 
    payments, 
    loadingClients, 
    loadingSubscriptions, 
    loadingPayments,
    refetchAll 
  } = useGlobalData();

  // Load Pro Labore config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PRO_LABORE_KEY);
      if (saved) {
        setProLaboreConfig(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const handleResetAllData = async () => {
    setIsResetting(true);
    try {
      // Delete in order due to foreign key constraints
      const { error: paymentsError } = await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (paymentsError) throw paymentsError;

      const { error: invoicesError } = await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (invoicesError) throw invoicesError;

      const { error: notificationsError } = await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (notificationsError) throw notificationsError;

      const { error: subscriptionsError } = await supabase.from('subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (subscriptionsError) throw subscriptionsError;

      const { error: clientSessionsError } = await supabase.from('client_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (clientSessionsError) throw clientSessionsError;

      const { error: clientUsersError } = await supabase.from('client_users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (clientUsersError) throw clientUsersError;

      const { error: clientsError } = await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (clientsError) throw clientsError;

      // Refetch all data
      await refetchAll();

      toast.success('Todos os dados foram removidos com sucesso!');
    } catch (error) {
      console.error('Error resetting data:', error);
      toast.error('Erro ao resetar dados. Tente novamente.');
    } finally {
      setIsResetting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Calculate real metrics from database
  const metrics = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Clients
    const activeClients = clients.filter(c => c.status === 'active').length;
    const inactiveClients = clients.filter(c => c.status === 'inactive').length;
    const totalClients = clients.length;

    // Subscriptions - Active ones are "Renovadas"
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active').length;
    
    // Subscriptions vencidas - next_payment in the past AND status not cancelled
    const overdueSubscriptions = subscriptions.filter(s => {
      if (s.status === 'cancelled') return false;
      const nextPaymentDate = new Date(s.next_payment);
      return isPast(nextPaymentDate) && nextPaymentDate < today;
    }).length;

    // Payments
    const pendingPayments = payments.filter(p => p.status === 'pending').length;
    const failedPayments = payments.filter(p => p.status === 'failed' || p.status === 'overdue').length;
    
    // Overdue payments (pending but past due date based on created_at + 7 days or explicit check)
    const overduePayments = payments.filter(p => {
      if (p.status !== 'pending') return false;
      const createdDate = new Date(p.created_at);
      // Consider payment overdue if created more than 7 days ago and still pending
      const dueDate = new Date(createdDate);
      dueDate.setDate(dueDate.getDate() + 7);
      return isPast(dueDate);
    }).length;

    // Monthly revenue from paid payments in current month
    const monthlyRevenue = payments
      .filter(p => {
        if (p.status !== 'paid') return false;
        const paidDate = p.paid_at ? new Date(p.paid_at) : new Date(p.created_at);
        return isWithinInterval(paidDate, { start: monthStart, end: monthEnd });
      })
      .reduce((acc, p) => acc + Number(p.amount), 0);

    // Previous month revenue for MoM comparison
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));
    const prevMonthRevenue = payments
      .filter(p => {
        if (p.status !== 'paid') return false;
        const paidDate = p.paid_at ? new Date(p.paid_at) : new Date(p.created_at);
        return isWithinInterval(paidDate, { start: prevMonthStart, end: prevMonthEnd });
      })
      .reduce((acc, p) => acc + Number(p.amount), 0);

    const momGrowth = prevMonthRevenue > 0
      ? ((monthlyRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
      : null;

    // Split revenue by type
    const revenueSubscriptions = payments
      .filter(p => {
        if (p.status !== 'paid' || !p.subscription_id) return false;
        const paidDate = p.paid_at ? new Date(p.paid_at) : new Date(p.created_at);
        return isWithinInterval(paidDate, { start: monthStart, end: monthEnd });
      })
      .reduce((acc, p) => acc + Number(p.amount), 0);

    const revenueSinglePayments = payments
      .filter(p => {
        if (p.status !== 'paid' || p.subscription_id) return false;
        const paidDate = p.paid_at ? new Date(p.paid_at) : new Date(p.created_at);
        return isWithinInterval(paidDate, { start: monthStart, end: monthEnd });
      })
      .reduce((acc, p) => acc + Number(p.amount), 0);

    const totalLost = payments
      .filter(p => {
        if (p.status !== 'failed' && p.status !== 'overdue') return false;
        const subDate = p.due_date ? new Date(p.due_date) : new Date(p.created_at);
        return isWithinInterval(subDate, { start: monthStart, end: monthEnd });
      })
      .reduce((acc, p) => acc + Number(p.amount), 0);

    return {
      activeClients,
      inactiveClients,
      totalClients,
      activeSubscriptions,
      overdueSubscriptions,
      overduePayments,
      pendingPayments,
      failedPayments,
      monthlyRevenue,
      prevMonthRevenue,
      momGrowth,
      revenueSubscriptions,
      revenueSinglePayments,
      totalLost,
      // Combined vencidas = overdue subscriptions + overdue payments
      totalOverdue: overdueSubscriptions + overduePayments,
    };
  }, [clients, subscriptions, payments]);

  const recentSubscriptions = subscriptions.slice(0, 5);
  const recentPayments = payments.slice(0, 5);

  const subscriptionColumns = [
    {
      key: 'clientName',
      header: 'Cliente',
      render: (item: any) => (
        <div>
          <span className="font-medium text-foreground text-sm">{item.clientName}</span>
          <span className="block text-xs text-muted-foreground sm:hidden">{item.plan_name}</span>
        </div>
      ),
    },
    {
      key: 'planName',
      header: 'Plano',
      hideOnMobile: true,
      render: (item: any) => (
        <span className="text-muted-foreground">{item.plan_name}</span>
      ),
    },
    {
      key: 'value',
      header: 'Valor',
      render: (item: any) => (
        <span className="font-medium text-foreground text-sm">{formatCurrency(item.value)}</span>
      ),
    },
    {
      key: 'nextPayment',
      header: 'Próx. Cobrança',
      hideOnMobile: true,
      render: (item: any) => (
        <span className="text-muted-foreground">
          {formatBrazilDate(item.next_payment)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: any) => <StatusBadge status={item.status} />,
    },
  ];

  const paymentColumns = [
    {
      key: 'clientName',
      header: 'Cliente',
      render: (item: any) => (
        <span className="font-medium text-foreground text-sm">{item.clientName}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (item: any) => (
        <span className="font-medium text-foreground text-sm">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Método',
      hideOnMobile: true,
      render: (item: any) => (
        <span className="text-muted-foreground">{item.payment_method || '-'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Data',
      hideOnMobile: true,
      render: (item: any) => (
        <span className="text-muted-foreground">
          {formatBrazilDate(item.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: any) => <StatusBadge status={item.status} />,
    },
  ];

  const isLoading = loadingClients || loadingSubscriptions || loadingPayments;

  return (
    <DashboardLayout 
      title="Dashboard" 
      subtitle="Visão geral do sistema de assinaturas"
      headerAction={
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={isResetting}
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Resetar Dados</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="glass-card border-border/50">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">Resetar Todos os Dados?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá <strong>apagar permanentemente</strong> todos os clientes, assinaturas, pagamentos e notificações do sistema. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border/50">Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleResetAllData}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sim, apagar tudo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    >
      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 lg:mb-8">
        <MetricCard
          title="Prejuízo do Mês"
          value={isLoading ? '...' : formatCurrency(metrics.totalLost)}
          icon={TrendingDown}
          variant="danger"
        />
        {/* Revenue card with MoM growth */}
        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-primary/15">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            {!isLoading && metrics.momGrowth !== null && (
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.momGrowth >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
              }`}>
                {metrics.momGrowth >= 0
                  ? <ArrowUpRight className="w-3 h-3" />
                  : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(metrics.momGrowth).toFixed(1)}%
              </div>
            )}
          </div>
          <p className="text-xl sm:text-2xl font-bold font-heading text-foreground">
            {isLoading ? '...' : formatCurrency(metrics.monthlyRevenue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Receita do Mês</p>
          {!isLoading && metrics.momGrowth !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              vs {formatCurrency(metrics.prevMonthRevenue)} mês anterior
            </p>
          )}
        </div>
        <MetricCard
          title="Renovadas"
          value={isLoading ? '...' : metrics.activeSubscriptions}
          icon={CheckCircle}
          variant="success"
        />
        <MetricCard
          title="Falhas"
          value={isLoading ? '...' : metrics.failedPayments}
          icon={AlertTriangle}
          variant="danger"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 lg:mb-8">
        <MetricCard
          title="Total Clientes"
          value={isLoading ? '...' : metrics.totalClients}
          icon={Users}
        />
        <MetricCard
          title="Inativos"
          value={isLoading ? '...' : metrics.inactiveClients}
          icon={XCircle}
          variant="warning"
        />
        <MetricCard
          title="Vencidas"
          value={isLoading ? '...' : metrics.totalOverdue}
          icon={Calendar}
          variant="danger"
        />
        <MetricCard
          title="Pendentes"
          value={isLoading ? '...' : metrics.pendingPayments}
          icon={TrendingUp}
          variant="warning"
        />
      </div>

      {/* Financial Split Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-6 lg:mb-8">
        <MetricCard
          title="De Assinaturas"
          value={isLoading ? '...' : formatCurrency(metrics.revenueSubscriptions)}
          icon={CreditCard}
          variant="default"
        />
        <MetricCard
          title="Cobranças Únicas"
          value={isLoading ? '...' : formatCurrency(metrics.revenueSinglePayments)}
          icon={Package}
          variant="success"
        />
        {/* Pro Labore card */}
        {(() => {
          const plCfg = proLaboreConfig;
          const plValue = plCfg
            ? plCfg.mode === 'percent'
              ? (metrics.monthlyRevenue * plCfg.percent) / 100
              : plCfg.fixed
            : null;
          return (
            <div className="glass-card p-4 sm:p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-amber-500/15">
                  <Banknote className="w-5 h-5 text-amber-400" />
                </div>
                {plCfg?.mode === 'percent' && (
                  <div className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-400">
                    <Percent className="w-3 h-3" />
                    {plCfg.percent}%
                  </div>
                )}
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading text-foreground">
                {isLoading ? '...' : plValue !== null ? formatCurrency(plValue) : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Pro Labore do Mês</p>
              {!plCfg && !isLoading && (
                <p className="text-xs text-amber-400/80 mt-0.5">Configure em Financeiro</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Charts */}
      <DashboardCharts payments={payments} />

      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">
            Assinaturas Recentes
          </h2>
          <DataTable 
            data={recentSubscriptions} 
            columns={subscriptionColumns}
          />
        </div>
        
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">
            Últimos Pagamentos
          </h2>
          <DataTable 
            data={recentPayments} 
            columns={paymentColumns}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
