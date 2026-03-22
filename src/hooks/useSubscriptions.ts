import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Subscription {
  id: string;
  client_id: string;
  plan_name: string;
  value: number;
  status: string;
  start_date: string;
  next_payment: string;
  created_at: string;
  updated_at: string;
  asaas_id?: string;
  clientName?: string;
  clients?: {
    name: string;
  };
}

export const useSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map client names
      const subscriptionsWithClientName = (data || []).map(sub => ({
        ...sub,
        clientName: sub.clients?.name || 'N/A'
      }));
      
      setSubscriptions(subscriptionsWithClientName);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast.error('Erro ao carregar assinaturas');
    } finally {
      setLoading(false);
    }
  };

  const addSubscription = async (subscription: { client_id: string; plan_name: string; value: number; next_payment?: string; asaas_id?: string }) => {
    try {
      const nextPayment = subscription.next_payment || (() => {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date.toISOString();
      })();

      const { data, error } = await supabase
        .from('subscriptions')
        .insert([{
          client_id: subscription.client_id,
          plan_name: subscription.plan_name,
          value: subscription.value,
          status: 'active',
          next_payment: nextPayment,
          asaas_id: subscription.asaas_id || null
        }])
        .select('*, clients(name)')
        .single();

      if (error) throw error;
      setSubscriptions(prev => [data, ...prev]);
      toast.success('Assinatura criada com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding subscription:', error);
      toast.error('Erro ao criar assinatura');
      return null;
    }
  };

  const updateSubscription = async (id: string, updates: Partial<{ plan_name: string; value: number; status: string; next_payment: string }>) => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', id)
        .select('*, clients(name)')
        .single();

      if (error) throw error;
      setSubscriptions(prev => prev.map(s => s.id === id ? data : s));
      toast.success('Assinatura atualizada com sucesso!');
      return data;
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Erro ao atualizar assinatura');
      return null;
    }
  };

  const deleteSubscription = async (id: string) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      toast.success('Assinatura removida com sucesso!');
    } catch (error) {
      console.error('Error deleting subscription:', error);
      toast.error('Erro ao remover assinatura');
    }
  };

  useEffect(() => {
    fetchSubscriptions();

    const channel = supabase
      .channel('subscriptions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        fetchSubscriptions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { subscriptions, loading, addSubscription, updateSubscription, deleteSubscription, refetch: fetchSubscriptions };
};
