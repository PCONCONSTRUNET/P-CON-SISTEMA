import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Payment {
  id: string;
  subscription_id: string | null;
  client_id: string | null;
  amount: number;
  status: string;
  payment_method: string | null;
  transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  description: string | null;
  clientName?: string;
  subscriptions?: {
    clients?: {
      name: string;
    };
    plan_name?: string;
  };
  clients?: {
    name: string;
  };
}

export const usePayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*, subscriptions(clients(name), plan_name), clients(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map client names - either from subscription or direct client relationship
      const paymentsWithClientName = (data || []).map(payment => ({
        ...payment,
        clientName: payment.subscriptions?.clients?.name || payment.clients?.name || 'N/A'
      }));
      
      setPayments(paymentsWithClientName);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  };

  const deletePayment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setPayments(prev => prev.filter(p => p.id !== id));
      toast.success('Pagamento removido com sucesso!');
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Erro ao remover pagamento');
    }
  };

  useEffect(() => {
    fetchPayments();

    const channel = supabase
      .channel('payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchPayments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { payments, loading, deletePayment, refetch: fetchPayments };
};
