import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Filter,
  Download,
  FileSpreadsheet,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  CreditCard,
  Users,
  CalendarDays,
  Banknote,
  Percent,
  Hash,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  List,
  Search,
  Tag,
  Globe,
  Code2,
  Package,
  ChevronDown,
  Clock,
  CheckCircle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart,
} from 'recharts';
import {
  format, subMonths, startOfMonth, endOfMonth, isWithinInterval,
  startOfYear, endOfYear, eachMonthOfInterval, subYears, isSameMonth,
  startOfDay, endOfDay, eachDayOfInterval, eachHourOfInterval,
  startOfHour, endOfHour, subDays, subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DashboardLayout from '@/components/DashboardLayout';
import { useGlobalData } from '@/contexts/GlobalDataContext';
import { useExpenses } from '@/hooks/useExpenses';
import ExpensesChart from '@/components/ExpensesChart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { exportToCSV, formatCurrencyForExport, formatDateForExport } from '@/utils/exportUtils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { Label } from '@/components/ui/label';

const PRO_LABORE_KEY = 'pcon_pro_labore_config';

const CHART_COLORS = {
  primary: 'hsl(216, 68%, 45%)',
  primaryLight: 'hsl(216, 68%, 55%)',
  success: '#22c55e',
  successLight: '#4ade80',
  warning: '#eab308',
  warningLight: '#facc15',
  danger: '#ef4444',
  dangerLight: '#f87171',
  muted: '#6b7280',
  purple: '#a855f7',
  cyan: '#06b6d4',
};

const GRADIENT_ID = {
  revenue: 'revenueGradient',
  expense: 'expenseGradient',
  profit: 'profitGradient',
};

// ─── Transações Tab Component ─────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  paid:    { label: 'Pago',      className: 'bg-success/15 text-success border-success/30' },
  pending: { label: 'Pendente',  className: 'bg-warning/15 text-warning border-warning/30' },
  failed:  { label: 'Falhou',    className: 'bg-destructive/15 text-destructive border-destructive/30' },
  overdue: { label: 'Atrasado',  className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const TransacoesTab = ({
  payments,
  clients,
  formatCurrency,
  formatDateForExport: _fmt,
  periodLabel,
}: {
  payments: any[];
  clients: any[];
  formatCurrency: (v: number) => string;
  formatDateForExport: (d: string) => string;
  periodLabel: string;
}) => {
  const [filter, setFilter] = useState<'all' | 'subscription' | 'single'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');
  const [sortDesc, setSortDesc] = useState(true);

  const getClientName = (clientId: string | null) => {
    if (!clientId) return '—';
    return clients.find((c: any) => c.id === clientId)?.name || '—';
  };

  const getPaymentDate = (p: any) =>
    p.paid_at || p.due_date || p.created_at;

  const processed = useMemo(() => {
    let list = [...payments];

    if (filter === 'subscription') list = list.filter(p => p.subscription_id);
    if (filter === 'single')       list = list.filter(p => !p.subscription_id);
    if (statusFilter !== 'all')    list = list.filter(p => p.status === statusFilter || (statusFilter === 'failed' && p.status === 'overdue'));

    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(p =>
        getClientName(p.client_id).toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.payment_method || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const da = new Date(getPaymentDate(a)).getTime();
      const db = new Date(getPaymentDate(b)).getTime();
      return sortDesc ? db - da : da - db;
    });

    return list;
  }, [payments, filter, search, statusFilter, sortDesc, clients]);

  const totalRevenue  = processed.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const totalPending  = processed.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);
  const totalSubs     = processed.filter(p => p.status === 'paid' && p.subscription_id).length;
  const totalSingles  = processed.filter(p => p.status === 'paid' && !p.subscription_id).length;

  const formatDate = (d: string) => {
    try { return format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }); }
    catch { return '—'; }
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Receita (período)</p>
          <p className="text-xl font-bold text-success">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{processed.filter(p => p.status === 'paid').length} pagamentos</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Pendente</p>
          <p className="text-xl font-bold text-warning">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-muted-foreground mt-1">{processed.filter(p => p.status === 'pending').length} pendentes</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Assinaturas pagas</p>
          <p className="text-xl font-bold text-foreground">{totalSubs}</p>
          <p className="text-xs text-muted-foreground mt-1">renovações no período</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Cobranças Únicas pagas</p>
          <p className="text-xl font-bold text-foreground">{totalSingles}</p>
          <p className="text-xs text-muted-foreground mt-1">domínios, sistemas, etc.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, descrição..."
            className="pl-9 glass-card border-border/50"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1">
          {([
            { value: 'all',          label: 'Todos' },
            { value: 'subscription', label: 'Assinaturas' },
            { value: 'single',       label: 'Cobranças Únicas' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                filter === opt.value
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'glass-card border-border/50 text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[130px] glass-card border-border/50 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="failed">Falhou/Atrasado</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <button
          onClick={() => setSortDesc(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium glass-card border border-border/50 text-muted-foreground hover:text-foreground transition-all"
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', !sortDesc && 'rotate-180')} />
          {sortDesc ? 'Mais recentes' : 'Mais antigos'}
        </button>

        <span className="ml-auto text-xs text-muted-foreground">{processed.length} transação(ões)</span>
      </div>

      {/* List */}
      {processed.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <List className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma transação encontrada para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {processed.map((p: any) => {
            const isSubscription = !!p.subscription_id;
            const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.failed;
            const clientName = getClientName(p.client_id);
            const dateStr = formatDate(getPaymentDate(p));

            return (
              <div
                key={p.id}
                className="glass-card glass-card-hover p-4 flex flex-col sm:flex-row sm:items-center gap-3 group"
              >
                {/* Type icon */}
                <div className={cn(
                  'p-2 rounded-xl shrink-0',
                  isSubscription ? 'bg-primary/15' : 'bg-cyan-500/15'
                )}>
                  {isSubscription
                    ? <CreditCard className="w-4 h-4 text-primary" />
                    : <Package className="w-4 h-4 text-cyan-400" />
                  }
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="font-semibold text-foreground text-sm truncate">{clientName}</span>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full border font-medium',
                      isSubscription ? 'bg-primary/10 text-primary border-primary/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                    )}>
                      {isSubscription ? 'Assinatura' : 'Cobrança Única'}
                    </span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border', statusCfg.className)}>
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {p.description || (isSubscription ? 'Renovação de assinatura' : 'Cobrança avulsa')}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dateStr}
                    </span>
                    {p.payment_method && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {p.payment_method.toUpperCase() === 'PIX' ? 'PIX'
                          : p.payment_method.toUpperCase() === 'CREDIT_CARD' ? 'Cartão de Crédito'
                          : p.payment_method}
                      </span>
                    )}
                    {p.status === 'paid' && p.paid_at && (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle className="w-3 h-3" />
                        Pago em {formatDate(p.paid_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="shrink-0 text-right">
                  <p className={cn(
                    'text-lg font-bold font-heading',
                    p.status === 'paid' ? 'text-success' :
                    p.status === 'pending' ? 'text-warning' :
                    'text-destructive'
                  )}>
                    {formatCurrency(Number(p.amount))}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Financial = () => {

  const { clients, subscriptions, payments, invoices, loadingPayments } = useGlobalData();
  const { expenses } = useExpenses();
  const [period, setPeriod] = useState('month');
  const [tab, setTab] = useState('overview');
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});

  // ─── Pro Labore State ─────────────────────────────
  const [plMode, setPlMode] = useState<'percent' | 'fixed'>('percent');
  const [plPercent, setPlPercent] = useState(30);
  const [plFixed, setPlFixed] = useState(0);

  // Load Pro Labore config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PRO_LABORE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.mode) setPlMode(cfg.mode);
        if (cfg.percent !== undefined) setPlPercent(cfg.percent);
        if (cfg.fixed !== undefined) setPlFixed(cfg.fixed);
      }
    } catch {}
  }, []);

  const savePlConfig = () => {
    localStorage.setItem(PRO_LABORE_KEY, JSON.stringify({ mode: plMode, percent: plPercent, fixed: plFixed }));
    toast.success('Configuração de Pro Labore salva!');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatCurrencyShort = (value: number) => {
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
    return `R$ ${value.toFixed(0)}`;
  };

  // ─── Calculate date range based on selected period ───
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'custom':
        return { 
          start: customDateRange.from ? startOfDay(customDateRange.from) : startOfMonth(now), 
          end: customDateRange.to ? endOfDay(customDateRange.to) : endOfDay(now) 
        };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }, [period, customDateRange]);

  // ─── Filtered payments based on period ─────────────
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      // For pending payments without due_date, always include them
      if (p.status === 'pending' && !p.due_date) return true;
      
      // Check if ANY relevant date falls within range
      const paidAt = p.paid_at ? new Date(p.paid_at) : null;
      const dueDate = p.due_date ? new Date(p.due_date) : null;
      const createdAt = new Date(p.created_at);
      
      const paidInRange = paidAt ? isWithinInterval(paidAt, { start: dateRange.start, end: dateRange.end }) : false;
      const dueInRange = dueDate ? isWithinInterval(dueDate, { start: dateRange.start, end: dateRange.end }) : false;
      const createdInRange = isWithinInterval(createdAt, { start: dateRange.start, end: dateRange.end });
      
      return paidInRange || dueInRange || createdInRange;
    });
  }, [payments, dateRange]);

  // ─── Filtered expenses based on period ─────────────
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Show expense if ANY relevant date falls within range
      const createdAt = new Date(e.created_at);
      const dueDate = e.due_date ? new Date(e.due_date) : null;
      const paidAt = e.paid_at ? new Date(e.paid_at) : null;
      
      const createdInRange = isWithinInterval(createdAt, { start: dateRange.start, end: dateRange.end });
      const dueInRange = dueDate ? isWithinInterval(dueDate, { start: dateRange.start, end: dateRange.end }) : false;
      const paidInRange = paidAt ? isWithinInterval(paidAt, { start: dateRange.start, end: dateRange.end }) : false;
      
      return createdInRange || dueInRange || paidInRange;
    });
  }, [expenses, dateRange]);

   // ─── Helper to bucket payments by interval ─────────
   const bucketPayments = (bucketStart: Date, bucketEnd: Date) => {
     const paid = filteredPayments.filter(p => {
       if (p.status !== 'paid') return false;
       const d = new Date(p.paid_at || p.created_at);
       return isWithinInterval(d, { start: bucketStart, end: bucketEnd });
     });
     const pending = filteredPayments.filter(p => {
       if (p.status !== 'pending') return false;
       const d = new Date(p.due_date || p.created_at);
       return isWithinInterval(d, { start: bucketStart, end: bucketEnd });
     });
     const failed = filteredPayments.filter(p => {
       if (p.status !== 'failed' && p.status !== 'overdue') return false;
       const d = new Date(p.due_date || p.created_at);
       return isWithinInterval(d, { start: bucketStart, end: bucketEnd });
     });
     return {
       receita: paid.reduce((s, p) => s + Number(p.amount), 0),
       pendente: pending.reduce((s, p) => s + Number(p.amount), 0),
       prejuizo: failed.reduce((s, p) => s + Number(p.amount), 0),
       lucro: paid.reduce((s, p) => s + Number(p.amount), 0),
       paidCount: paid.length, pendingCount: pending.length, failedCount: failed.length,
     };
   };

   // ─── Helper to bucket expenses by interval ─────────
   const bucketExpenses = (bucketStart: Date, bucketEnd: Date) => {
     const expenses = filteredExpenses.filter(e => {
       if (e.status === 'cancelled') return false;
       const d = new Date(e.paid_at || e.due_date || e.created_at);
       return isWithinInterval(d, { start: bucketStart, end: bucketEnd });
     });
     return expenses.reduce((s, e) => s + Number(e.amount), 0);
   };

   // ─── Chart data: adapts granularity to period ──────
   const monthlyData = useMemo(() => {
     const { start, end } = dateRange;
     type ChartRow = { month: string; fullMonth: string; receita: number; pendente: number; prejuizo: number; lucro: number; gastos: number; paidCount: number; pendingCount: number; failedCount: number; };
     const result: ChartRow[] = [];
     const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

     if (period === 'today') {
       for (let h = 0; h < 24; h++) {
         const hStart = new Date(start); hStart.setHours(h, 0, 0, 0);
         const hEnd = new Date(start); hEnd.setHours(h, 59, 59, 999);
         result.push({
           month: `${String(h).padStart(2, '0')}h`,
           fullMonth: `${format(start, 'dd/MM/yyyy', { locale: ptBR })} às ${String(h).padStart(2, '0')}:00`,
           ...bucketPayments(hStart, hEnd),
           gastos: bucketExpenses(hStart, hEnd),
         });
       }
     } else {
       // Always group by day regardless of range
       const days = eachDayOfInterval({ start, end });
       days.forEach(day => {
         result.push({
           month: format(day, 'dd/MM', { locale: ptBR }),
           fullMonth: format(day, "EEEE, dd 'de' MMMM yyyy", { locale: ptBR }),
           ...bucketPayments(startOfDay(day), endOfDay(day)),
           gastos: bucketExpenses(startOfDay(day), endOfDay(day)),
         });
       });
     }
     return result;
   }, [filteredPayments, filteredExpenses, dateRange, period]);

  // ─── Summary KPIs (filtered by period) ──────────────
  const kpis = useMemo(() => {
    const paidFiltered = filteredPayments.filter(p => p.status === 'paid');
    const pendingFiltered = filteredPayments.filter(p => p.status === 'pending');
    const lostFiltered = filteredPayments.filter(p => p.status === 'failed' || p.status === 'overdue');

    const totalRevenue = paidFiltered.reduce((s, p) => s + Number(p.amount), 0);
    const totalPending = pendingFiltered.reduce((s, p) => s + Number(p.amount), 0);
    const totalLost = lostFiltered.reduce((s, p) => s + Number(p.amount), 0);

    const totalExpenses = filteredExpenses.filter(e => e.status !== 'cancelled').reduce((s, e) => s + Number(e.amount), 0);
    const totalExpensesPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);
    const totalExpensesPending = filteredExpenses.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
    const netProfit = totalRevenue - totalExpensesPaid;

    const activeSubsValue = subscriptions.filter(s => s.status === 'active').reduce((s, sub) => s + Number(sub.value), 0);
    const avgTicket = paidFiltered.length > 0 ? totalRevenue / paidFiltered.length : 0;

    const revenueSubscriptions = paidFiltered
      .filter(p => p.subscription_id)
      .reduce((s, p) => s + Number(p.amount), 0);
    const revenueSinglePayments = paidFiltered
      .filter(p => !p.subscription_id)
      .reduce((s, p) => s + Number(p.amount), 0);

    return {
      totalRevenue,
      totalPending,
      totalLost,
      totalExpenses,
      totalExpensesPaid,
      totalExpensesPending,
      netProfit,
      activeSubsValue,
      avgTicket,
      revenueSubscriptions,
      revenueSinglePayments,
      invoicesCount: invoices.length,
      paidCount: paidFiltered.length,
    };
  }, [filteredPayments, filteredExpenses, subscriptions, invoices]);

  // ─── Plan distribution ─────────────────────────────
  const planData = useMemo(() => {
    const planMap: Record<string, { count: number; value: number }> = {};
    subscriptions.filter(s => s.status === 'active').forEach(s => {
      if (!planMap[s.plan_name]) planMap[s.plan_name] = { count: 0, value: 0 };
      planMap[s.plan_name].count++;
      planMap[s.plan_name].value += Number(s.value);
    });
    const colors = [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.purple, CHART_COLORS.cyan, CHART_COLORS.danger];
    return Object.entries(planMap).map(([name, d], i) => ({
      name, count: d.count, value: d.value, color: colors[i % colors.length],
    }));
  }, [subscriptions]);

  // ─── Payment method distribution (filtered) ─────────
  const methodData = useMemo(() => {
    const methodMap: Record<string, { count: number; value: number }> = {};
    filteredPayments.filter(p => p.status === 'paid').forEach(p => {
      const rawMethod = (p.payment_method || 'Outros').toUpperCase();
      const method = rawMethod === 'PIX' ? 'PIX' : rawMethod === 'CREDIT_CARD' ? 'Cartão de Crédito' : rawMethod === 'CARTÃO DE CRÉDITO' ? 'Cartão de Crédito' : p.payment_method || 'Outros';
      if (!methodMap[method]) methodMap[method] = { count: 0, value: 0 };
      methodMap[method].count++;
      methodMap[method].value += Number(p.amount);
    });
    const colors = [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.purple];
    return Object.entries(methodMap).map(([name, d], i) => ({
      name, count: d.count, value: d.value, color: colors[i % colors.length],
    }));
  }, [filteredPayments]);

  // ─── Payment type distribution (filtered) ───────────
  const typeData = useMemo(() => {
    const subPayments = filteredPayments.filter(p => p.status === 'paid' && p.subscription_id);
    const singlePayments = filteredPayments.filter(p => p.status === 'paid' && !p.subscription_id);
    const result = [];
    if (subPayments.length > 0) {
      result.push({ name: 'Assinaturas', count: subPayments.length, value: subPayments.reduce((s, p) => s + Number(p.amount), 0), color: CHART_COLORS.primary });
    }
    if (singlePayments.length > 0) {
      result.push({ name: 'Cobranças Únicas', count: singlePayments.length, value: singlePayments.reduce((s, p) => s + Number(p.amount), 0), color: CHART_COLORS.cyan });
    }
    return result;
  }, [filteredPayments]);

  // ─── Monthly type breakdown (uses same chart data logic) ──
  const monthlyTypeData = useMemo(() => {
    return monthlyData.map(d => {
      const { start, end } = dateRange;
      // Re-filter from filteredPayments for this specific bucket label
      // We already have the granularity from monthlyData, just calculate type split
      return { ...d };
    });
  }, [monthlyData, dateRange]);

  // ─── Period label for UI ───────────────────────────
  const periodLabel = useMemo(() => {
    switch (period) {
      case 'today': return format(new Date(), "dd 'de' MMMM yyyy", { locale: ptBR });
      case 'week': return `${format(dateRange.start, 'dd/MM', { locale: ptBR })} - ${format(dateRange.end, 'dd/MM/yyyy', { locale: ptBR })}`;
      case 'month': return format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });
      case 'custom': 
        if (customDateRange.from && customDateRange.to) {
          return `${format(customDateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(customDateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`;
        }
        return 'Selecione as datas';
      default: return '';
    }
  }, [period, dateRange, customDateRange]);
  // ─── Export functions ────────────────────────────────
  const getClientName = useCallback((clientId: string | null) => {
    if (!clientId) return 'N/A';
    const client = clients.find(c => c.id === clientId);
    return client?.name || 'N/A';
  }, [clients]);

  const exportToSpreadsheet = useCallback(() => {
    if (filteredPayments.length === 0) {
      toast.error('Nenhum dado para exportar no período selecionado');
      return;
    }

    const headers = [
      { key: 'date', label: 'Data' },
      { key: 'client', label: 'Cliente' },
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor' },
      { key: 'status', label: 'Status' },
      { key: 'method', label: 'Método' },
      { key: 'type', label: 'Tipo' },
    ];

    const data = filteredPayments.map(p => ({
      date: formatDateForExport(p.paid_at || p.due_date || p.created_at),
      client: getClientName(p.client_id),
      description: p.description || '-',
      amount: formatCurrencyForExport(Number(p.amount)),
      status: p.status === 'paid' ? 'Pago' : p.status === 'pending' ? 'Pendente' : p.status === 'overdue' ? 'Atrasado' : 'Falha',
      method: p.payment_method || '-',
      type: p.subscription_id ? 'Assinatura' : 'Cobrança Única',
    }));

    exportToCSV(data, `relatorio-financeiro-${periodLabel.replace(/\s/g, '_')}`, headers);
    toast.success('Planilha exportada com sucesso!');
  }, [filteredPayments, periodLabel, getClientName]);

  const exportToPDF = useCallback(() => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('P-CON CONSTRUNET', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório Financeiro', pageWidth / 2, 28, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Período: ${periodLabel}`, pageWidth / 2, 35, { align: 'center' });
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth / 2, 41, { align: 'center' });

    // Separator
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(15, 45, pageWidth - 15, 45);

    // KPIs
    let y = 55;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo do Período', 15, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const kpiItems = [
      ['Receita no Período:', formatCurrencyForExport(kpis.totalRevenue)],
      ['Pendente no Período:', formatCurrencyForExport(kpis.totalPending)],
      ['Prejuízo no Período:', formatCurrencyForExport(kpis.totalLost)],
      ['MRR (Receita Recorrente):', formatCurrencyForExport(kpis.activeSubsValue)],
      ['Ticket Médio:', formatCurrencyForExport(kpis.avgTicket)],
      ['Pagamentos Recebidos:', String(kpis.paidCount)],
    ];
    kpiItems.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 15, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, 80, y);
      y += 7;
    });

    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, pageWidth - 15, y);
    y += 10;

    // Payments table
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalhamento de Transações', 15, y);
    y += 8;

    // Table header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(15, y - 4, pageWidth - 30, 7, 'F');
    doc.text('Data', 17, y);
    doc.text('Cliente', 42, y);
    doc.text('Descrição', 85, y);
    doc.text('Valor', 135, y);
    doc.text('Status', 162, y);
    doc.text('Tipo', 182, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    const sortedPayments = [...filteredPayments].sort((a, b) => {
      const dateA = new Date(a.paid_at || a.due_date || a.created_at).getTime();
      const dateB = new Date(b.paid_at || b.due_date || b.created_at).getTime();
      return dateB - dateA;
    });

    sortedPayments.forEach((p) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      const date = formatDateForExport(p.paid_at || p.due_date || p.created_at);
      const clientName = getClientName(p.client_id);
      const desc = (p.description || '-').substring(0, 25);
      const amount = formatCurrencyForExport(Number(p.amount));
      const status = p.status === 'paid' ? 'Pago' : p.status === 'pending' ? 'Pendente' : p.status === 'overdue' ? 'Atrasado' : 'Falha';
      const type = p.subscription_id ? 'Assinatura' : 'Única';

      // Alternate row background
      if (sortedPayments.indexOf(p) % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(15, y - 3.5, pageWidth - 30, 6, 'F');
      }

      doc.text(date, 17, y);
      doc.text(clientName.substring(0, 20), 42, y);
      doc.text(desc, 85, y);
      doc.text(amount, 135, y);
      
      // Color-coded status
      if (p.status === 'paid') doc.setTextColor(34, 197, 94);
      else if (p.status === 'pending') doc.setTextColor(234, 179, 8);
      else doc.setTextColor(239, 68, 68);
      doc.text(status, 162, y);
      doc.setTextColor(0, 0, 0);
      
      doc.text(type, 182, y);
      y += 6;
    });

    // Footer
    y += 5;
    doc.setDrawColor(59, 130, 246);
    doc.line(15, y, pageWidth - 15, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('Documento gerado automaticamente pelo sistema P-CON Assinaturas', pageWidth / 2, y, { align: 'center' });

    doc.save(`relatorio-financeiro-${periodLabel.replace(/[\s\/]/g, '_')}.pdf`);
    toast.success('PDF exportado com sucesso!');
  }, [filteredPayments, kpis, periodLabel, getClientName]);


  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-card p-3 border border-border/50 shadow-xl text-sm">
        <p className="font-medium text-foreground capitalize mb-1">{payload[0]?.payload?.fullMonth || label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="flex items-center gap-2" style={{ color: p.color }}>
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}: <span className="font-semibold">{formatCurrency(p.value)}</span>
          </p>
        ))}
      </div>
    );
  };

  const PieTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-card p-3 border border-border/50 shadow-xl text-sm">
        <p className="font-medium text-foreground">{payload[0].name}</p>
        <p className="text-muted-foreground">{payload[0].payload.count} assinaturas</p>
        <p className="font-semibold" style={{ color: payload[0].payload.color }}>
          {formatCurrency(payload[0].payload.value)}
        </p>
      </div>
    );
  };

  // ─── KPI Card Component ────────────────────────────
  const KPICard = ({ title, value, icon: Icon, trend, trendValue, color = 'primary' }: {
    title: string; value: string; icon: any; trend?: 'up' | 'down' | 'neutral'; trendValue?: string; color?: string;
  }) => (
    <div className="glass-card glass-card-hover p-5 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${
          color === 'success' ? 'bg-success/15' :
          color === 'warning' ? 'bg-warning/15' :
          color === 'danger' ? 'bg-destructive/15' :
          'bg-primary/15'
        }`}>
          <Icon className={`w-5 h-5 ${
            color === 'success' ? 'text-success' :
            color === 'warning' ? 'text-warning' :
            color === 'danger' ? 'text-destructive' :
            'text-primary'
          }`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-success/15 text-success' :
            trend === 'down' ? 'bg-destructive/15 text-destructive' :
            'bg-muted text-muted-foreground'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
            {trendValue}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold font-heading text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{title}</p>
    </div>
  );

  return (
    <DashboardLayout title="Financeiro" subtitle="Relatórios e análises financeiras detalhadas">
      {/* Period Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>Período:</span>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px] glass-card border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal glass-card border-border/50", !customDateRange.from && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {customDateRange.from ? format(customDateRange.from, 'dd/MM/yyyy') : 'De'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customDateRange.from}
                  onSelect={(date) => setCustomDateRange(prev => ({ ...prev, from: date || undefined }))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal glass-card border-border/50", !customDateRange.to && "text-muted-foreground")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {customDateRange.to ? format(customDateRange.to, 'dd/MM/yyyy') : 'Até'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={customDateRange.to}
                  onSelect={(date) => setCustomDateRange(prev => ({ ...prev, to: date || undefined }))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
        <span className="text-xs text-muted-foreground capitalize">{periodLabel}</span>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={exportToSpreadsheet} className="glass-card border-border/50 gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Planilha</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF} className="glass-card border-border/50 gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards - Row 1 (Revenue & Profit) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KPICard
          title="Receita no Período"
          value={formatCurrency(kpis.totalRevenue)}
          icon={DollarSign}
          color="success"
        />
        <KPICard
          title="Receita de Assinaturas"
          value={formatCurrency(kpis.revenueSubscriptions)}
          icon={CreditCard}
          color="primary"
        />
        <KPICard
          title="Cobranças Únicas"
          value={formatCurrency(kpis.revenueSinglePayments)}
          icon={Package}
          color="cyan"
        />
        <KPICard
          title="Lucro Real"
          value={formatCurrency(kpis.netProfit)}
          icon={TrendingUp}
          color={kpis.netProfit >= 0 ? 'success' : 'danger'}
          trend={kpis.netProfit >= 0 ? 'up' : 'down'}
          trendValue={kpis.totalRevenue > 0 ? `${((kpis.netProfit / kpis.totalRevenue) * 100).toFixed(0)}%` : '0%'}
        />
      </div>

      {/* KPI Cards - Row 2 (Metrics & Clients) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <KPICard
          title="Receita Recorrente (MRR)"
          value={formatCurrency(kpis.activeSubsValue)}
          icon={TrendingUp}
          color="primary"
        />
        <KPICard
          title="Ticket Médio"
          value={formatCurrency(kpis.avgTicket)}
          icon={CreditCard}
        />
        <KPICard
          title="Clientes Ativos"
          value={String(clients.filter(c => c.status === 'active').length)}
          icon={Users}
          color="success"
        />
        <KPICard
          title="Pendente no Período"
          value={formatCurrency(kpis.totalPending)}
          icon={Wallet}
          color="warning"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="glass-card border border-border/50 p-1 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="revenue" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Receitas
          </TabsTrigger>
          <TabsTrigger value="plans" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Planos
          </TabsTrigger>
          <TabsTrigger value="types" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Tipos
          </TabsTrigger>
          <TabsTrigger value="methods" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Métodos
          </TabsTrigger>
          <TabsTrigger value="transacoes" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5">
            <List className="w-4 h-4" />
            Transações
          </TabsTrigger>
          <TabsTrigger value="prolabore" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 gap-1.5">
            <Banknote className="w-4 h-4" />
            Pro Labore
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Revenue vs Losses area chart */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Receita vs Prejuízo</h3>
            <p className="text-sm text-muted-foreground mb-4">Evolução mensal de receita recebida e valores perdidos</p>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={GRADIENT_ID.revenue} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={GRADIENT_ID.expense} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.danger} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.danger} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatCurrencyShort} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="receita" name="Receita" stroke={CHART_COLORS.success} fill={`url(#${GRADIENT_ID.revenue})`} strokeWidth={2.5} dot={{ r: 4, fill: CHART_COLORS.success }} activeDot={{ r: 6 }} />
                  <Area type="monotone" dataKey="prejuizo" name="Prejuízo" stroke={CHART_COLORS.danger} fill={`url(#${GRADIENT_ID.expense})`} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS.danger }} />
                  <Line type="monotone" dataKey="pendente" name="Pendente" stroke={CHART_COLORS.warning} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: CHART_COLORS.warning }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly comparison bars */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Comparativo por Período</h3>
            <p className="text-sm text-muted-foreground mb-4">Receita, pendências, prejuízos e gastos detalhados</p>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_COLORS.success} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="barPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.warning} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_COLORS.warning} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="barLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.danger} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_COLORS.danger} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                    tickLine={false} 
                    axisLine={false} 
                    interval={monthlyData.length > 15 ? Math.floor(monthlyData.length / 10) : 0}
                    angle={monthlyData.length > 10 ? -45 : 0}
                    textAnchor={monthlyData.length > 10 ? 'end' : 'middle'}
                    height={monthlyData.length > 10 ? 60 : 30}
                  />
                  <YAxis tickFormatter={formatCurrencyShort} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend 
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey="receita" name="Receita" fill="url(#barRevenue)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="pendente" name="Pendente" fill="url(#barPending)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="prejuizo" name="Prejuízo" fill="url(#barLoss)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="gastos" name="Gastos" stroke={CHART_COLORS.purple} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.purple }} />
                  <Line type="monotone" dataKey="receita" name="Tendência" stroke={CHART_COLORS.successLight} strokeWidth={2} dot={false} strokeDasharray="4 4" legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Summary under chart */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Receita</p>
                <p className="text-sm font-bold text-success">{formatCurrency(kpis.totalRevenue)}</p>
                <p className="text-xs text-muted-foreground">{kpis.paidCount} pagamentos</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Pendente</p>
                <p className="text-sm font-bold text-warning">{formatCurrency(kpis.totalPending)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Prejuízo</p>
                <p className="text-sm font-bold text-destructive">{formatCurrency(kpis.totalLost)}</p>
              </div>
            </div>
          </div>

          {/* Expenses by Category Chart */}
          <ExpensesChart expenses={filteredExpenses} />
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-6">
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Curva de Receita</h3>
            <p className="text-sm text-muted-foreground mb-4">Evolução detalhada da receita ao longo do tempo</p>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatCurrencyShort} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="receita" name="Receita" stroke={CHART_COLORS.primary} fill="url(#revAreaGrad)" strokeWidth={3} dot={{ r: 5, fill: CHART_COLORS.primary, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Volume */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Volume de Transações</h3>
            <p className="text-sm text-muted-foreground mb-4">Quantidade de pagamentos por status mensal</p>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="paidCount" name="Pagos" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} maxBarSize={30} stackId="a" />
                  <Bar dataKey="pendingCount" name="Pendentes" fill={CHART_COLORS.warning} radius={[0, 0, 0, 0]} maxBarSize={30} stackId="a" />
                  <Bar dataKey="failedCount" name="Falhos" fill={CHART_COLORS.danger} radius={[4, 4, 0, 0]} maxBarSize={30} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-4 sm:p-6">
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Distribuição por Plano</h3>
              <p className="text-sm text-muted-foreground mb-4">Receita recorrente por plano ativo</p>
              <div className="h-[300px]">
                {planData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={planData} cx="50%" cy="45%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                        {planData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltipContent />} />
                      <Legend verticalAlign="bottom" height={36} formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem planos ativos</div>
                )}
              </div>
            </div>

            <div className="glass-card p-4 sm:p-6">
              <h3 className="font-heading text-lg font-semibold text-foreground mb-4">Detalhamento por Plano</h3>
              <div className="space-y-4">
                {planData.length > 0 ? planData.map((plan, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: plan.color }} />
                      <div>
                        <p className="font-medium text-foreground text-sm">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">{plan.count} assinatura{plan.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(plan.value)}<span className="text-xs text-muted-foreground">/mês</span></p>
                  </div>
                )) : (
                  <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Types Tab */}
        <TabsContent value="types" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-4 sm:p-6">
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Assinaturas vs Cobranças Únicas</h3>
              <p className="text-sm text-muted-foreground mb-4">Distribuição de receita por tipo de pagamento</p>
              <div className="h-[300px]">
                {typeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={typeData} cx="50%" cy="45%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value">
                        {typeData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltipContent />} />
                      <Legend verticalAlign="bottom" height={36} formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                )}
              </div>
            </div>

            <div className="glass-card p-4 sm:p-6">
              <h3 className="font-heading text-lg font-semibold text-foreground mb-4">Detalhamento por Tipo</h3>
              <div className="space-y-4">
                {typeData.length > 0 ? typeData.map((t, i) => {
                  const total = typeData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((t.value / total) * 100).toFixed(1) : '0';
                  return (
                    <div key={i} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                          <span className="font-medium text-foreground text-sm">{t.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: t.color }} />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{t.count} pagamento{t.count !== 1 ? 's' : ''}</span>
                        <span className="font-semibold text-foreground">{formatCurrency(t.value)}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
                )}
              </div>
            </div>
          </div>

          {/* Monthly breakdown by type */}
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Evolução Mensal por Tipo</h3>
            <p className="text-sm text-muted-foreground mb-4">Receita de assinaturas vs cobranças únicas ao longo do tempo</p>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTypeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={formatCurrencyShort} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="assinaturas" name="Assinaturas" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="unicas" name="Cobranças Únicas" fill={CHART_COLORS.cyan} radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* Methods Tab */}
        <TabsContent value="methods" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-4 sm:p-6">
              <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Métodos de Pagamento</h3>
              <p className="text-sm text-muted-foreground mb-4">Distribuição de pagamentos recebidos por método</p>
              <div className="h-[300px]">
                {methodData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={methodData} cx="50%" cy="45%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="value">
                        {methodData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltipContent />} />
                      <Legend verticalAlign="bottom" height={36} formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
                )}
              </div>
            </div>

            <div className="glass-card p-4 sm:p-6">
              <h3 className="font-heading text-lg font-semibold text-foreground mb-4">Detalhamento por Método</h3>
              <div className="space-y-4">
                {methodData.length > 0 ? methodData.map((m, i) => {
                  const total = methodData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((m.value / total) * 100).toFixed(1) : '0';
                  return (
                    <div key={i} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ background: m.color }} />
                          <span className="font-medium text-foreground text-sm">{m.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: m.color }} />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{m.count} pagamento{m.count !== 1 ? 's' : ''}</span>
                        <span className="font-semibold text-foreground">{formatCurrency(m.value)}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-muted-foreground text-sm text-center py-8">Sem dados</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── Transações Tab ─────────────────────────────────── */}
        <TabsContent value="transacoes">
          <TransacoesTab
            payments={filteredPayments}
            clients={clients}
            formatCurrency={formatCurrency}
            formatDateForExport={formatDateForExport}
            periodLabel={periodLabel}
          />
        </TabsContent>

        {/* ─── Pro Labore Tab ─────────────────────────────────── */}
        <TabsContent value="prolabore" className="space-y-6">
          {(() => {
            const now = new Date();
            // Current month revenue
            const currentMonthStart = startOfMonth(now);
            const currentMonthEnd = endOfMonth(now);
            const currentMonthRevenue = payments
              .filter(p => p.status === 'paid' && isWithinInterval(new Date(p.paid_at || p.created_at), { start: currentMonthStart, end: currentMonthEnd }))
              .reduce((s, p) => s + Number(p.amount), 0);
            const currentMonthExpenses = expenses
              .filter(e => e.status !== 'cancelled' && isWithinInterval(new Date(e.paid_at || e.due_date || e.created_at), { start: currentMonthStart, end: currentMonthEnd }))
              .reduce((s, e) => s + Number(e.amount), 0);
            const currentMonthProfit = currentMonthRevenue - currentMonthExpenses;

            // Calculated Pro Labore value
            const plValue = plMode === 'percent'
              ? (currentMonthRevenue * plPercent) / 100
              : plFixed;

            const marginAfter = currentMonthProfit - plValue;
            const healthPct = currentMonthProfit > 0 ? (plValue / currentMonthProfit) * 100 : 0;

            let healthStatus: 'safe' | 'warn' | 'danger' = 'safe';
            if (plValue > currentMonthProfit) healthStatus = 'danger';
            else if (healthPct >= 80) healthStatus = 'warn';

            // 6-month history
            const history = Array.from({ length: 6 }, (_, i) => {
              const monthDate = subMonths(now, 5 - i);
              const mStart = startOfMonth(monthDate);
              const mEnd = endOfMonth(monthDate);
              const rev = payments
                .filter(p => p.status === 'paid' && isWithinInterval(new Date(p.paid_at || p.created_at), { start: mStart, end: mEnd }))
                .reduce((s, p) => s + Number(p.amount), 0);
              const exp = expenses
                .filter(e => e.status !== 'cancelled' && isWithinInterval(new Date(e.paid_at || e.due_date || e.created_at), { start: mStart, end: mEnd }))
                .reduce((s, e) => s + Number(e.amount), 0);
              const profit = rev - exp;
              const pl = plMode === 'percent' ? (rev * plPercent) / 100 : plFixed;
              return {
                month: format(monthDate, 'MMM/yy', { locale: ptBR }),
                fullMonth: format(monthDate, "MMMM 'de' yyyy", { locale: ptBR }),
                receita: rev,
                lucro: profit,
                prolabore: pl,
                margem: Math.max(0, profit - pl),
              };
            });

            return (
              <>
                {/* Config Panel */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 rounded-xl bg-amber-500/15">
                      <Banknote className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-foreground">Calculadora de Pro Labore</h3>
                      <p className="text-sm text-muted-foreground">Configure quanto retirar todo mês</p>
                    </div>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setPlMode('percent')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border',
                        plMode === 'percent'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                          : 'glass-card border-border/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Percent className="w-4 h-4" />
                      Percentual da Receita
                    </button>
                    <button
                      onClick={() => setPlMode('fixed')}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border',
                        plMode === 'fixed'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                          : 'glass-card border-border/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Hash className="w-4 h-4" />
                      Valor Fixo Mensal
                    </button>
                  </div>

                  {/* Input */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {plMode === 'percent' ? (
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-2 block">
                          Percentual desejado (%)
                        </Label>
                        <div className="relative">
                          <Input
                            id="pl-percent"
                            type="number"
                            min={1}
                            max={100}
                            step={0.5}
                            value={plPercent}
                            onChange={e => setPlPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                            className="glass-card border-border/50 pr-10"
                          />
                          <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Recomendado: 10–30% para sócios de serviços
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-2 block">
                          Valor Fixo Mensal (R$)
                        </Label>
                        <div className="relative">
                          <Input
                            id="pl-fixed"
                            type="number"
                            min={0}
                            step={100}
                            value={plFixed || ''}
                            onChange={e => setPlFixed(parseFloat(e.target.value) || 0)}
                            placeholder="Ex: 3000"
                            className="glass-card border-border/50 pl-10"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-end">
                      <Button onClick={savePlConfig} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white w-full sm:w-auto">
                        <Save className="w-4 h-4" />
                        Salvar Configuração
                      </Button>
                    </div>
                  </div>

                  {/* Result Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Pro Labore Value */}
                    <div className={cn(
                      'p-4 rounded-2xl border-2 transition-all',
                      healthStatus === 'safe' ? 'bg-success/10 border-success/30' :
                      healthStatus === 'warn' ? 'bg-warning/10 border-warning/30' :
                      'bg-destructive/10 border-destructive/30'
                    )}>
                      <div className="flex items-center gap-2 mb-2">
                        {
                          healthStatus === 'safe' ? <CheckCircle2 className="w-5 h-5 text-success" /> :
                          healthStatus === 'warn' ? <AlertTriangle className="w-5 h-5 text-warning" /> :
                          <XCircle className="w-5 h-5 text-destructive" />
                        }
                        <span className={cn(
                          'text-xs font-semibold uppercase tracking-wide',
                          healthStatus === 'safe' ? 'text-success' :
                          healthStatus === 'warn' ? 'text-warning' : 'text-destructive'
                        )}>
                          {healthStatus === 'safe' ? 'Seguro' : healthStatus === 'warn' ? 'Atenção' : 'Risco'}
                        </span>
                      </div>
                      <p className="text-2xl font-bold font-heading text-foreground">{formatCurrency(plValue)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pro Labore — {format(now, "MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                      {plMode === 'percent' && (
                        <p className="text-xs font-medium mt-1" style={{ color: healthStatus === 'safe' ? '#22c55e' : healthStatus === 'warn' ? '#eab308' : '#ef4444' }}>
                          {plPercent}% de {formatCurrency(currentMonthRevenue)}
                        </p>
                      )}
                    </div>

                    {/* Lucro do Mês */}
                    <div className="glass-card p-4 rounded-2xl border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lucro Real do Mês</span>
                      </div>
                      <p className="text-2xl font-bold font-heading text-foreground">{formatCurrency(currentMonthProfit)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Receita − Gastos</p>
                      <div className="mt-2 w-full h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', healthStatus === 'safe' ? 'bg-success' : healthStatus === 'warn' ? 'bg-warning' : 'bg-destructive')}
                          style={{ width: `${Math.min(100, healthPct)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{healthPct.toFixed(0)}% do lucro comprometido</p>
                    </div>

                    {/* Margem Disponível */}
                    <div className="glass-card p-4 rounded-2xl border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="w-5 h-5 text-cyan-400" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Margem após Pro Labore</span>
                      </div>
                      <p className={cn('text-2xl font-bold font-heading', marginAfter >= 0 ? 'text-success' : 'text-destructive')}>
                        {formatCurrency(marginAfter)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Restante para o negócio</p>
                      {marginAfter < 0 && (
                        <p className="text-xs text-destructive mt-2 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Pro Labore excede o lucro!
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Health Message */}
                <div className={cn(
                  'flex items-start gap-3 p-4 rounded-2xl border text-sm',
                  healthStatus === 'safe' ? 'bg-success/10 border-success/30 text-success' :
                  healthStatus === 'warn' ? 'bg-warning/10 border-warning/30 text-warning' :
                  'bg-destructive/10 border-destructive/30 text-destructive'
                )}>
                  {
                    healthStatus === 'safe' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> :
                    healthStatus === 'warn' ? <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> :
                    <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="font-semibold">
                      {healthStatus === 'safe'
                        ? '✅ Retirada saudável — o negócio tem margem confortável.'
                        : healthStatus === 'warn'
                        ? '⚠️ Atenção — o Pro Labore compromete mais de 80% do lucro deste mês.'
                        : '🚨 Risco — o Pro Labore configurado supera o lucro real do mês!'}
                    </p>
                    <p className="opacity-80 mt-1">
                      {healthStatus === 'safe'
                        ? `Sua retirada representa ${healthPct.toFixed(0)}% do lucro. Sobram ${formatCurrency(marginAfter)} para reserva e reinvestimento.`
                        : healthStatus === 'warn'
                        ? `Considere reduzir o Pro Labore ou aumentar a receita para garantir saúde financeira.`
                        : `Reduzir a retirada é essencial. O lucro atual é de apenas ${formatCurrency(currentMonthProfit)}.`}
                    </p>
                  </div>
                </div>

                {/* 6-month History Chart */}
                <div className="glass-card p-4 sm:p-6">
                  <h3 className="font-heading text-lg font-semibold text-foreground mb-1">Histórico — Últimos 6 Meses</h3>
                  <p className="text-sm text-muted-foreground mb-4">Receita, lucro real e Pro Labore calculado mês a mês</p>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="plRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={formatCurrencyShort} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} iconType="circle" iconSize={8} />
                        <Area type="monotone" dataKey="receita" name="Receita" stroke="#22c55e" fill="url(#plRevGrad)" strokeWidth={2} dot={{ r: 3 }} />
                        <Bar dataKey="lucro" name="Lucro Real" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={24} opacity={0.8} />
                        <Line type="monotone" dataKey="prolabore" name="Pro Labore" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: '#f59e0b' }} />
                        <Line type="monotone" dataKey="margem" name="Margem Restante" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: '#06b6d4' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Month-by-month table */}
                <div className="glass-card p-4 sm:p-6">
                  <h3 className="font-heading text-lg font-semibold text-foreground mb-4">Detalhamento Mensal</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">Mês</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Receita</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Lucro Real</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Pro Labore</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Margem</th>
                          <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {history.map((row, i) => {
                          const rowHealth = row.prolabore > row.lucro ? 'danger' : row.lucro > 0 && (row.prolabore / row.lucro) >= 0.8 ? 'warn' : 'safe';
                          return (
                            <tr key={i} className={cn('hover:bg-secondary/20 transition-colors', i === 5 && 'bg-primary/5 font-medium')}>
                              <td className="py-3 px-3 text-foreground capitalize">
                                {row.fullMonth}
                                {i === 5 && <span className="ml-2 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">atual</span>}
                              </td>
                              <td className="py-3 px-3 text-right text-success font-medium">{formatCurrency(row.receita)}</td>
                              <td className="py-3 px-3 text-right">
                                <span className={row.lucro >= 0 ? 'text-foreground' : 'text-destructive'}>{formatCurrency(row.lucro)}</span>
                              </td>
                              <td className="py-3 px-3 text-right text-amber-400 font-medium">{formatCurrency(row.prolabore)}</td>
                              <td className="py-3 px-3 text-right">
                                <span className={row.margem >= 0 ? 'text-foreground' : 'text-destructive'}>{formatCurrency(row.margem)}</span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                {rowHealth === 'safe' ? (
                                  <span className="inline-flex items-center gap-1 text-xs bg-success/15 text-success px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> OK</span>
                                ) : rowHealth === 'warn' ? (
                                  <span className="inline-flex items-center gap-1 text-xs bg-warning/15 text-warning px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> Atenção</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs bg-destructive/15 text-destructive px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Risco</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 p-3 rounded-xl">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      O Pro Labore é a remuneração do sócio-administrador. Recomenda-se manter entre
                      <strong className="text-foreground"> 10% e 30%</strong> da receita bruta ou definir um valor fixo viável.
                      Sempre garanta que o negócio tenha capital de giro após a retirada.
                    </p>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default Financial;
