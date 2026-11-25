import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  useOptionalGlobalData,
  type Expense,
  type ExpenseInput,
} from '@/contexts/GlobalDataContext';
import { toast } from 'sonner';

export type { Expense, ExpenseInput };

export const useExpenses = () => {
  const globalData = useOptionalGlobalData();
  const [fallbackExpenses, setFallbackExpenses] = useState<Expense[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(!globalData);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const ensureLoaded = globalData?.ensureExpensesLoaded;
  useEffect(() => {
    if (ensureLoaded) {
      void ensureLoaded();
    }
  }, [ensureLoaded]);

  const fetchFallbackExpenses = useCallback(async () => {
    setFallbackLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (mountedRef.current) {
        setFallbackExpenses((data as unknown as Expense[]) || []);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      // Evita toast fantasma caso o usuário já tenha navegado para outra aba
      if (mountedRef.current) {
        toast.error('Erro ao carregar gastos');
      }
    } finally {
      if (mountedRef.current) {
        setFallbackLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (globalData) return;
    void fetchFallbackExpenses();
  }, [Boolean(globalData), fetchFallbackExpenses]);

  if (globalData) {
    return {
      expenses: globalData.expenses,
      loading: globalData.loadingExpenses,
      addExpense: globalData.addExpense,
      updateExpense: globalData.updateExpense,
      deleteExpense: globalData.deleteExpense,
      markAsPaid: globalData.markExpenseAsPaid,
      fetchExpenses: globalData.fetchExpenses,
    };
  }

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
    void fetchFallbackExpenses();
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
    void fetchFallbackExpenses();
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
    void fetchFallbackExpenses();
    return true;
  };

  const markAsPaid = async (id: string) => {
    return updateExpense(id, { status: 'paid', paid_at: new Date().toISOString() });
  };

  return {
    expenses: fallbackExpenses,
    loading: fallbackLoading,
    addExpense,
    updateExpense,
    deleteExpense,
    markAsPaid,
    fetchExpenses: fetchFallbackExpenses,
  };
};
