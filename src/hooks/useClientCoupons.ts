import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ClientCoupon {
  id: string;
  client_id: string;
  initial_amount: number;
  current_balance: number;
  description: string | null;
  status: 'active' | 'used' | 'expired';
  origin: 'manual' | 'referral';
  referral_reward_id: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_phone?: string;
  lead_name?: string;
}

export interface CouponTransaction {
  id: string;
  coupon_id: string;
  amount: number;
  description: string;
  created_at: string;
}

export const useClientCoupons = (clientId?: string) => {
  const [coupons, setCoupons] = useState<ClientCoupon[]>([]);
  const [transactions, setTransactions] = useState<CouponTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoupons = async () => {
    try {
      let query = supabase
        .from('client_coupons' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch client names and phones
      const clientIds = [...new Set((data || []).map((c: any) => c.client_id))];
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name, phone')
          .in('id', clientIds);

        const clientMap = new Map((clients || []).map(c => [c.id, { name: c.name, phone: c.phone }]));

        // Fetch referral lead names for coupons with referral_reward_id
        const rewardIds = (data || [])
          .map((c: any) => c.referral_reward_id)
          .filter(Boolean);

        let leadMap = new Map();
        if (rewardIds.length > 0) {
          const { data: rewards } = await supabase
            .from('referral_rewards')
            .select('id, referral_lead_id')
            .in('id', rewardIds);

          const leadIds = (rewards || []).map((r: any) => r.referral_lead_id);
          if (leadIds.length > 0) {
            const { data: leads } = await supabase
              .from('referral_leads')
              .select('id, lead_name')
              .in('id', leadIds);

            const leadIdMap = new Map((rewards || []).map((r: any) => [r.id, r.referral_lead_id]));
            const leadNameMap = new Map((leads || []).map((l: any) => [l.id, l.lead_name]));

            rewardIds.forEach((rewardId: string) => {
              const leadId = leadIdMap.get(rewardId);
              if (leadId) {
                leadMap.set(rewardId, leadNameMap.get(leadId));
              }
            });
          }
        }
        
        const couponsWithNames = (data || []).map((coupon: any) => {
          const clientInfo = clientMap.get(coupon.client_id);
          return {
            ...coupon,
            status: coupon.status as 'active' | 'used' | 'expired',
            origin: coupon.origin || 'manual',
            client_name: clientInfo?.name || 'N/A',
            client_phone: clientInfo?.phone || null,
            lead_name: coupon.referral_reward_id ? leadMap.get(coupon.referral_reward_id) : null,
          };
        });
        
        setCoupons(couponsWithNames);
      } else {
        setCoupons([]);
      }
    } catch (error) {
      console.error('Error fetching coupons:', error);
      toast.error('Erro ao carregar cupons');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (couponId: string) => {
    try {
      const { data, error } = await supabase
        .from('coupon_transactions' as any)
        .select('*')
        .eq('coupon_id', couponId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions((data || []) as unknown as CouponTransaction[]);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Erro ao carregar transações');
    }
  };

  const addCoupon = async (coupon: {
    client_id: string;
    initial_amount: number;
    description?: string;
    origin?: 'manual' | 'referral';
    referral_reward_id?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('client_coupons' as any)
        .insert({
          client_id: coupon.client_id,
          initial_amount: coupon.initial_amount,
          current_balance: coupon.initial_amount,
          description: coupon.description || null,
          status: 'active',
          origin: coupon.origin || 'manual',
          referral_reward_id: coupon.referral_reward_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      await fetchCoupons();
      toast.success('Cupom criado com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding coupon:', error);
      toast.error('Erro ao criar cupom');
      return null;
    }
  };

  const registerExpense = async (couponId: string, amount: number, description: string) => {
    try {
      // Find the coupon
      const coupon = coupons.find(c => c.id === couponId);
      if (!coupon) {
        toast.error('Cupom não encontrado');
        return false;
      }

      if (amount > coupon.current_balance) {
        toast.error('Valor maior que o saldo disponível');
        return false;
      }

      // Insert transaction
      const { error: transError } = await supabase
        .from('coupon_transactions' as any)
        .insert({
          coupon_id: couponId,
          amount: amount,
          description: description,
        });

      if (transError) throw transError;

      // Update coupon balance
      const newBalance = coupon.current_balance - amount;
      const newStatus = newBalance <= 0 ? 'used' : 'active';

      const { error: updateError } = await supabase
        .from('client_coupons' as any)
        .update({
          current_balance: newBalance,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', couponId);

      if (updateError) throw updateError;

      await fetchCoupons();
      toast.success('Gasto registrado com sucesso!');
      return true;
    } catch (error) {
      console.error('Error registering expense:', error);
      toast.error('Erro ao registrar gasto');
      return false;
    }
  };

  const deleteCoupon = async (couponId: string) => {
    try {
      const { error } = await supabase
        .from('client_coupons' as any)
        .delete()
        .eq('id', couponId);

      if (error) throw error;
      setCoupons(prev => prev.filter(c => c.id !== couponId));
      toast.success('Cupom removido com sucesso!');
    } catch (error) {
      console.error('Error deleting coupon:', error);
      toast.error('Erro ao remover cupom');
    }
  };

  useEffect(() => {
    fetchCoupons();

    const channel = supabase
      .channel('client-coupons-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_coupons' }, () => {
        fetchCoupons();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  return {
    coupons,
    transactions,
    loading,
    addCoupon,
    registerExpense,
    deleteCoupon,
    fetchTransactions,
    refetch: fetchCoupons,
  };
};
