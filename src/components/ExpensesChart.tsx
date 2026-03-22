import { useMemo } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { Expense } from '@/hooks/useExpenses';

interface ExpensesChartProps {
  expenses: Expense[];
}

const COLORS = {
  'software': '#3b82f6',
  'marketing': '#f59e0b',
  'infraestrutura': '#10b981',
  'salarios': '#ef4444',
  'operacional': '#8b5cf6',
  'outros': '#6b7280',
};

const ExpensesChart = ({ expenses }: ExpensesChartProps) => {
  const categoryData = useMemo(() => {
    const grouped: Record<string, { count: number; total: number }> = {};

    expenses.forEach(exp => {
      const category = exp.category || 'outros';
      if (!grouped[category]) {
        grouped[category] = { count: 0, total: 0 };
      }
      grouped[category].count++;
      grouped[category].total += Number(exp.amount);
    });

    return Object.entries(grouped)
      .map(([name, { count, total }]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: count,
        amount: total,
        color: COLORS[name as keyof typeof COLORS] || COLORS.outros,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card p-3 border border-border/50 shadow-lg">
          <p className="text-sm font-medium text-foreground">{payload[0].name}</p>
          <p className="text-sm text-muted-foreground">{payload[0].value} item(ns)</p>
          <p className="text-sm font-semibold text-primary">
            {formatCurrency(payload[0].payload.amount)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (categoryData.length === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-4">
          Gastos por Categoria
        </h3>
        <div className="h-[280px] flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Nenhum gasto registrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6">
      <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-4">
        Gastos por Categoria
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="45%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => (
                <span className="text-xs sm:text-sm text-muted-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ExpensesChart;
