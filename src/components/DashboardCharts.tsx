import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Payment {
  amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface DashboardChartsProps {
  payments: Payment[];
}

const COLORS = {
  paid: '#22c55e',
  pending: '#eab308',
  failed: '#ef4444',
  refunded: '#6b7280',
};

const DashboardCharts = ({ payments }: DashboardChartsProps) => {
  // Calculate monthly revenue for last 6 months
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      
      const monthPayments = payments.filter(p => {
        const paymentDate = new Date(p.paid_at || p.created_at);
        return isWithinInterval(paymentDate, { start: monthStart, end: monthEnd }) && p.status === 'paid';
      });
      
      const revenue = monthPayments.reduce((acc, p) => acc + Number(p.amount), 0);
      
      months.push({
        name: format(date, 'MMM', { locale: ptBR }),
        fullName: format(date, 'MMMM yyyy', { locale: ptBR }),
        revenue,
      });
    }
    return months;
  }, [payments]);

  // Calculate payment status distribution
  const statusData = useMemo(() => {
    const statusCounts: Record<string, { count: number; value: number }> = {
      paid: { count: 0, value: 0 },
      pending: { count: 0, value: 0 },
      failed: { count: 0, value: 0 },
      refunded: { count: 0, value: 0 },
    };

    payments.forEach(p => {
      const status = p.status in statusCounts ? p.status : 'pending';
      statusCounts[status].count++;
      statusCounts[status].value += Number(p.amount);
    });

    return [
      { name: 'Pagos', value: statusCounts.paid.count, amount: statusCounts.paid.value, color: COLORS.paid },
      { name: 'Pendentes', value: statusCounts.pending.count, amount: statusCounts.pending.value, color: COLORS.pending },
      { name: 'Falhos', value: statusCounts.failed.count, amount: statusCounts.failed.value, color: COLORS.failed },
      { name: 'Estornados', value: statusCounts.refunded.count, amount: statusCounts.refunded.value, color: COLORS.refunded },
    ].filter(item => item.value > 0);
  }, [payments]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card p-3 border border-border/50 shadow-lg">
          <p className="text-sm font-medium text-foreground capitalize">{payload[0].payload.fullName || label}</p>
          <p className="text-sm text-primary font-semibold">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card p-3 border border-border/50 shadow-lg">
          <p className="text-sm font-medium text-foreground">{payload[0].name}</p>
          <p className="text-sm text-muted-foreground">{payload[0].value} pagamentos</p>
          <p className="text-sm font-semibold" style={{ color: payload[0].payload.color }}>
            {formatCurrency(payload[0].payload.amount)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
      {/* Monthly Revenue Chart */}
      <div className="glass-card p-4 sm:p-6">
        <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-4">
          Receita Mensal
        </h3>
        <div className="h-[250px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis 
                tickFormatter={(value) => formatCurrency(value)}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="revenue" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payment Status Distribution */}
      <div className="glass-card p-4 sm:p-6">
        <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-4">
          Status dos Pagamentos
        </h3>
        <div className="h-[250px] sm:h-[280px]">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend 
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-xs sm:text-sm text-muted-foreground">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Nenhum pagamento registrado</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;
