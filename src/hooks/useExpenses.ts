import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_type: 'fixed' | 'single';
  due_date: string | null;
  paid_at: string | null;
  status: string;
  recurrence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  category: string;
  expense_type: 'fixed' | 'single';
  due_date?: string;
  status?: string;
  recurrence?: string;
  notes?: string;
}

export const useExpenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar gastos');
      console.error(error);
    } else {
      setExpenses((data as unknown as Expense[]) || []);
    }
    setLoading(false);
  };

  const addExpense = async (input: ExpenseInput) => {
    const { error } = await supabase
      .from('expenses')
      .insert([input as any]);

    if (error) {
      toast.error('Erro ao adicionar gasto');
      console.error(error);
      return false;
    }
    toast.success('Gasto adicionado!');
    fetchExpenses();
    return true;
  };

  const updateExpense = async (id: string, updates: Partial<ExpenseInput & { paid_at: string; status: string }>) => {
    const { error } = await supabase
      .from('expenses')
      .update(updates as any)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar gasto');
      console.error(error);
      return false;
    }
    toast.success('Gasto atualizado!');
    fetchExpenses();
    return true;
  };

  const deleteExpense = async (id: string) => {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir gasto');
      console.error(error);
      return false;
    }
    toast.success('Gasto excluído!');
    fetchExpenses();
    return true;
  };

  const markAsPaid = async (id: string) => {
    return updateExpense(id, { status: 'paid', paid_at: new Date().toISOString() });
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  return { expenses, loading, addExpense, updateExpense, deleteExpense, markAsPaid, fetchExpenses };
};
