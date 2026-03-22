import { useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, DollarSign, Repeat, Zap, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { useExpenses, type ExpenseInput } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORIES = [
  'Aluguel', 'Energia', 'Internet', 'Telefone', 'Software', 'Marketing',
  'Salários', 'Impostos', 'Material', 'Transporte', 'Alimentação', 'Outros',
];

const Expenses = () => {
  const { expenses, loading, addExpense, updateExpense, deleteExpense, markAsPaid } = useExpenses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState('all');
  const [form, setForm] = useState<ExpenseInput>({
    description: '',
    amount: 0,
    category: 'Outros',
    expense_type: 'fixed',
    due_date: '',
    recurrence: 'monthly',
    notes: '',
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const resetForm = () => {
    setForm({ description: '', amount: 0, category: 'Outros', expense_type: 'fixed', due_date: '', recurrence: 'monthly', notes: '' });
    setEditingId(null);
  };

  const openNew = (type: 'fixed' | 'single') => {
    resetForm();
    setForm(prev => ({ ...prev, expense_type: type }));
    setDialogOpen(true);
  };

  const openEdit = (expense: any) => {
    setEditingId(expense.id);
    setForm({
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      expense_type: expense.expense_type,
      due_date: expense.due_date ? expense.due_date.split('T')[0] : '',
      recurrence: expense.recurrence || 'monthly',
      notes: expense.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.description || form.amount <= 0) return;
    const payload = {
      ...form,
      due_date: form.due_date ? `${form.due_date}T12:00:00.000Z` : undefined,
      recurrence: form.expense_type === 'fixed' ? form.recurrence : null,
    };

    let success;
    if (editingId) {
      success = await updateExpense(editingId, payload);
    } else {
      success = await addExpense(payload);
    }
    if (success) {
      setDialogOpen(false);
      resetForm();
    }
  };

  const filtered = tab === 'all' ? expenses
    : tab === 'fixed' ? expenses.filter(e => e.expense_type === 'fixed')
    : expenses.filter(e => e.expense_type === 'single');

  const totalFixed = expenses.filter(e => e.expense_type === 'fixed' && e.status !== 'cancelled').reduce((s, e) => s + Number(e.amount), 0);
  const totalSingle = expenses.filter(e => e.expense_type === 'single' && e.status !== 'cancelled').reduce((s, e) => s + Number(e.amount), 0);
  const totalPending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const totalPaid = expenses.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.amount), 0);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success/20 text-success border-success/30">Pago</Badge>;
      case 'pending': return <Badge className="bg-warning/20 text-warning border-warning/30">Pendente</Badge>;
      case 'cancelled': return <Badge className="bg-muted/20 text-muted-foreground border-muted/30">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const recurrenceLabel = (r: string | null) => {
    switch (r) {
      case 'monthly': return 'Mensal';
      case 'weekly': return 'Semanal';
      case 'yearly': return 'Anual';
      default: return r;
    }
  };

  return (
    <DashboardLayout title="Gastos" subtitle="Gerencie seus gastos fixos e únicos">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-primary/15"><Repeat className="w-4 h-4 text-primary" /></div>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalFixed)}</p>
          <p className="text-xs text-muted-foreground">Gastos Fixos</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-cyan-500/15"><Zap className="w-4 h-4 text-cyan-500" /></div>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalSingle)}</p>
          <p className="text-xs text-muted-foreground">Gastos Únicos</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-warning/15"><DollarSign className="w-4 h-4 text-warning" /></div>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-muted-foreground">Pendente</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-success/15"><CheckCircle className="w-4 h-4 text-success" /></div>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-muted-foreground">Pago</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={() => openNew('fixed')} className="gap-2">
          <Plus className="w-4 h-4" /> Gasto Fixo
        </Button>
        <Button onClick={() => openNew('single')} variant="outline" className="gap-2 glass-card border-border/50">
          <Plus className="w-4 h-4" /> Gasto Único
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="glass-card border border-border/50 p-1 mb-4">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Todos</TabsTrigger>
          <TabsTrigger value="fixed" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Fixos</TabsTrigger>
          <TabsTrigger value="single" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Únicos</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum gasto encontrado</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(expense => (
                <div key={expense.id} className="glass-card glass-card-hover p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {expense.expense_type === 'fixed' ? (
                        <Repeat className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <Zap className="w-4 h-4 text-cyan-500 shrink-0" />
                      )}
                      <span className="font-semibold text-foreground truncate">{expense.description}</span>
                      {statusBadge(expense.status)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="bg-secondary/50 px-2 py-0.5 rounded">{expense.category}</span>
                      {expense.expense_type === 'fixed' && expense.recurrence && (
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">{recurrenceLabel(expense.recurrence)}</span>
                      )}
                      {expense.due_date && (
                        <span>Vence: {format(new Date(expense.due_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                      )}
                      {expense.paid_at && (
                        <span className="text-success">Pago em: {format(new Date(expense.paid_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                      )}
                    </div>
                    {expense.notes && <p className="text-xs text-muted-foreground mt-1">{expense.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-bold text-foreground">{formatCurrency(Number(expense.amount))}</span>
                    <div className="flex gap-1">
                      {expense.status === 'pending' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:bg-success/10" onClick={() => markAsPaid(expense.id)} title="Marcar como pago">
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-secondary/50" onClick={() => openEdit(expense)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => deleteExpense(expense.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingId ? 'Editar Gasto' : form.expense_type === 'fixed' ? 'Novo Gasto Fixo' : 'Novo Gasto Único'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Aluguel do escritório" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} placeholder="0,00" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.due_date || ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              {form.expense_type === 'fixed' && (
                <div>
                  <Label>Recorrência</Label>
                  <Select value={form.recurrence || 'monthly'} onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas adicionais..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}>{editingId ? 'Salvar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Expenses;
