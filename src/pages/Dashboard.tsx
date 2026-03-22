import { useState, useMemo } from 'react';
import { 
  Users, 
  DollarSign, 
  AlertTriangle,
  TrendingUp,
  Calendar,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, isPast, startOfDay } from 'date-fns';
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
  const { 
    clients, 
    subscriptions, 
    payments, 
    loadingClients, 
    loadingSubscriptions, 
    loadingPayments,
    refetchAll 
  } = useGlobalData();

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
          title="Clientes Ativos"
          value={isLoading ? '...' : metrics.activeClients}
          icon={Users}
          variant="success"
        />
        <MetricCard
          title="Receita do Mês"
          value={isLoading ? '...' : formatCurrency(metrics.monthlyRevenue)}
          icon={DollarSign}
        />
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
