import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ReferralSettings {
  id: string;
  is_active: boolean;
  reward_value: number; // R$100 for affiliates (cash)
  client_reward_value: number; // R$150 for clients with active subscription (coupon)
  client_reward_description: string;
  validity_days: number;
  created_at: string;
  updated_at: string;
}

export interface ReferralLink {
  id: string;
  client_id: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client?: {
    name: string;
    email: string;
  };
}

export interface ReferralClick {
  id: string;
  referral_link_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  referer: string | null;
  created_at: string;
}

export interface ReferralLead {
  id: string;
  referral_link_id: string;
  lead_name: string;
  lead_email: string | null;
  lead_phone: string | null;
  source: string;
  is_converted: boolean;
  converted_at: string | null;
  expires_at: string;
  created_at: string;
  referral_link?: ReferralLink;
}

export interface ReferralReward {
  id: string;
  referral_link_id: string;
  referral_lead_id: string;
  amount: number;
  reward_type: 'cash' | 'coupon'; // cash = R$100, coupon = R$150 discount
  description: string | null;
  status: 'pending' | 'approved' | 'paid';
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  referral_link?: ReferralLink;
  referral_lead?: ReferralLead;
}

export interface ReferralStats {
  totalClicks: number;
  totalLeads: number;
  totalConversions: number;
  totalPending: number;
  totalApproved: number;
  totalPaid: number;
  totalToPay: number;
}

export function useReferrals() {
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [clicks, setClicks] = useState<ReferralClick[]>([]);
  const [leads, setLeads] = useState<ReferralLead[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [stats, setStats] = useState<ReferralStats>({
    totalClicks: 0,
    totalLeads: 0,
    totalConversions: 0,
    totalPending: 0,
    totalApproved: 0,
    totalPaid: 0,
    totalToPay: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('referral_settings')
      .select('*')
      .single();
    
    if (error) {
      console.error('Error fetching referral settings:', error);
      return null;
    }
    
    setSettings(data);
    return data;
  }, []);

  const fetchLinks = useCallback(async () => {
    const { data, error } = await supabase
      .from('referral_links')
      .select('*, clients(name, email)')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching referral links:', error);
      return [];
    }
    
    const formattedData = data?.map(link => ({
      ...link,
      client: link.clients as { name: string; email: string } | undefined,
    })) || [];
    
    setLinks(formattedData);
    return formattedData;
  }, []);

  const fetchClicks = useCallback(async () => {
    const { data, error } = await supabase
      .from('referral_clicks')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching referral clicks:', error);
      return [];
    }
    
    setClicks(data || []);
    return data || [];
  }, []);

  const fetchLeads = useCallback(async () => {
    const { data, error } = await supabase
      .from('referral_leads')
      .select('*, referral_links(*, clients(name, email))')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching referral leads:', error);
      return [];
    }
    
    const formattedData = data?.map(lead => ({
      ...lead,
      referral_link: lead.referral_links ? {
        ...lead.referral_links,
        client: (lead.referral_links as any).clients as { name: string; email: string } | undefined,
      } : undefined,
    })) || [];
    
    setLeads(formattedData);
    return formattedData;
  }, []);

  const fetchRewards = useCallback(async () => {
    const { data, error } = await supabase
      .from('referral_rewards')
      .select('*, referral_links(*, clients(name, email)), referral_leads(*)')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching referral rewards:', error);
      return [];
    }
    
    const formattedData = data?.map(reward => ({
      ...reward,
      status: reward.status as 'pending' | 'approved' | 'paid',
      reward_type: (reward.reward_type || 'cash') as 'cash' | 'coupon',
      referral_link: reward.referral_links ? {
        ...reward.referral_links,
        client: (reward.referral_links as any).clients as { name: string; email: string } | undefined,
      } : undefined,
      referral_lead: reward.referral_leads || undefined,
    })) || [];
    
    setRewards(formattedData);
    return formattedData;
  }, []);

  const calculateStats = useCallback((clicksData: ReferralClick[], leadsData: ReferralLead[], rewardsData: ReferralReward[], settingsData: ReferralSettings | null) => {
    const pending = rewardsData.filter(r => r.status === 'pending');
    const approved = rewardsData.filter(r => r.status === 'approved');
    const paid = rewardsData.filter(r => r.status === 'paid');
    
    const rewardValue = settingsData?.reward_value || 100;
    
    setStats({
      totalClicks: clicksData.length,
      totalLeads: leadsData.length,
      totalConversions: leadsData.filter(l => l.is_converted).length,
      totalPending: pending.length,
      totalApproved: approved.length,
      totalPaid: paid.length,
      totalToPay: (pending.length + approved.length) * rewardValue,
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, linksData, clicksData, leadsData, rewardsData] = await Promise.all([
        fetchSettings(),
        fetchLinks(),
        fetchClicks(),
        fetchLeads(),
        fetchRewards(),
      ]);
      
      calculateStats(clicksData, leadsData, rewardsData, settingsData);
    } finally {
      setLoading(false);
    }
  }, [fetchSettings, fetchLinks, fetchClicks, fetchLeads, fetchRewards, calculateStats]);

  useEffect(() => {
    fetchAll();
  }, []);

  const updateSettings = async (updates: Partial<ReferralSettings>) => {
    if (!settings?.id) return;
    
    const { error } = await supabase
      .from('referral_settings')
      .update(updates)
      .eq('id', settings.id);
    
    if (error) {
      console.error('Error updating settings:', error);
      toast.error('Erro ao atualizar configurações');
      return false;
    }
    
    await fetchSettings();
    toast.success('Configurações atualizadas!');
    return true;
  };

  const createLink = async (clientId: string) => {
    // Generate unique slug
    const slug = Math.random().toString(36).substring(2, 10);
    
    const { error } = await supabase
      .from('referral_links')
      .insert({ client_id: clientId, slug });
    
    if (error) {
      console.error('Error creating link:', error);
      toast.error('Erro ao criar link de indicação');
      return false;
    }
    
    await fetchLinks();
    toast.success('Link de indicação criado!');
    return true;
  };

  const createLinksForAllClients = async (clientIds: string[]) => {
    if (clientIds.length === 0) {
      toast.info('Todos os clientes já possuem links de indicação');
      return 0;
    }

    const linksToCreate = clientIds.map(clientId => ({
      client_id: clientId,
      slug: Math.random().toString(36).substring(2, 10),
    }));

    const { error } = await supabase
      .from('referral_links')
      .insert(linksToCreate);

    if (error) {
      console.error('Error creating links:', error);
      toast.error('Erro ao criar links de indicação');
      return 0;
    }

    await fetchLinks();
    toast.success(`${clientIds.length} links criados com sucesso!`);
    return clientIds.length;
  };

  const toggleLinkActive = async (linkId: string, isActive: boolean) => {
    const { error } = await supabase
      .from('referral_links')
      .update({ is_active: isActive })
      .eq('id', linkId);
    
    if (error) {
      console.error('Error toggling link:', error);
      toast.error('Erro ao atualizar link');
      return false;
    }
    
    await fetchLinks();
    toast.success(isActive ? 'Link ativado!' : 'Link desativado!');
    return true;
  };

  const updateRewardStatus = async (rewardId: string, status: 'pending' | 'approved' | 'paid') => {
    const updates: any = { status };
    
    if (status === 'approved') {
      updates.approved_at = new Date().toISOString();
    } else if (status === 'paid') {
      updates.paid_at = new Date().toISOString();
    }
    
    const { error } = await supabase
      .from('referral_rewards')
      .update(updates)
      .eq('id', rewardId);
    
    if (error) {
      console.error('Error updating reward:', error);
      toast.error('Erro ao atualizar recompensa');
      return false;
    }

    // If a coupon-type reward is marked as paid, ensure the client coupon is created
    // so the public receipt link (/:id) can resolve the coupon record.
    if (status === 'paid') {
      try {
        const { data: rewardData, error: rewardFetchError } = await supabase
          .from('referral_rewards')
          .select('id, amount, reward_type, description, referral_link_id, referral_links:referral_link_id (client_id)')
          .eq('id', rewardId)
          .maybeSingle();

        if (rewardFetchError) throw rewardFetchError;

        if (rewardData && (rewardData as any).reward_type === 'coupon') {
          const clientId = (rewardData as any).referral_links?.client_id;
          if (clientId) {
            const { data: existingCoupon, error: existingError } = await supabase
              .from('client_coupons' as any)
              .select('id')
              .eq('referral_reward_id', rewardId)
              .maybeSingle();

            if (existingError) throw existingError;

            if (!existingCoupon) {
              const amount = Number((rewardData as any).amount || 0);
              const description = (rewardData as any).description || 'Cupom de desconto para projetos futuros';

              const { error: createCouponError } = await supabase
                .from('client_coupons' as any)
                .insert({
                  client_id: clientId,
                  initial_amount: amount,
                  current_balance: amount,
                  description,
                  status: 'active',
                  origin: 'referral',
                  referral_reward_id: rewardId,
                });

              if (createCouponError) throw createCouponError;
            }
          }
        }
      } catch (e) {
        console.error('Error ensuring client coupon after paid reward:', e);
        // Don't block the status update UX, but inform the admin.
        toast.error('Recompensa marcada como paga, mas houve erro ao criar o cupom do cliente');
      }
    }
    
    await fetchRewards();
    toast.success('Recompensa atualizada!');
    return true;
  };

  const convertLead = async (leadId: string) => {
    // Get the lead info
    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      toast.error('Lead não encontrado');
      return false;
    }
    
    // Check if lead has expired
    if (new Date(lead.expires_at) < new Date()) {
      toast.error('Esta indicação expirou');
      return false;
    }
    
    // Check if already converted
    if (lead.is_converted) {
      toast.error('Este lead já foi convertido');
      return false;
    }
    
    // Update lead as converted
    const { error: leadError } = await supabase
      .from('referral_leads')
      .update({ 
        is_converted: true, 
        converted_at: new Date().toISOString() 
      })
      .eq('id', leadId);
    
    if (leadError) {
      console.error('Error converting lead:', leadError);
      toast.error('Erro ao converter lead');
      return false;
    }
    
    // Check if the referrer (client) has an active subscription
    const clientId = lead.referral_link?.client_id;
    let hasActiveSubscription = false;
    
    if (clientId) {
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('client_id', clientId)
        .eq('status', 'active');
      
      hasActiveSubscription = (subscriptions && subscriptions.length > 0);
    }
    
    // Determine reward type and value based on subscription status
    // Clients with active subscription get R$150 coupon
    // Others (affiliates or inactive clients) get R$100 cash
    const rewardType = hasActiveSubscription ? 'coupon' : 'cash';
    const rewardValue = hasActiveSubscription 
      ? (settings?.client_reward_value || 150) 
      : (settings?.reward_value || 100);
    const rewardDescription = hasActiveSubscription 
      ? (settings?.client_reward_description || 'Cupom de desconto para projetos futuros')
      : null;
    
    const { error: rewardError } = await supabase
      .from('referral_rewards')
      .insert({
        referral_link_id: lead.referral_link_id,
        referral_lead_id: leadId,
        amount: rewardValue,
        reward_type: rewardType,
        description: rewardDescription,
        status: 'pending',
      });
    
    if (rewardError) {
      console.error('Error creating reward:', rewardError);
      toast.error('Erro ao criar recompensa');
      return false;
    }
    
    await Promise.all([fetchLeads(), fetchRewards()]);
    const rewardMessage = hasActiveSubscription 
      ? `Projeto fechado! Cupom de ${formatCurrency(rewardValue)} criado.`
      : `Projeto fechado! Recompensa de ${formatCurrency(rewardValue)} criada.`;
    toast.success(rewardMessage);
    return true;
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const deleteLink = async (linkId: string) => {
    // First delete associated rewards
    const { error: rewardsError } = await supabase
      .from('referral_rewards')
      .delete()
      .eq('referral_link_id', linkId);
    
    if (rewardsError) {
      console.error('Error deleting rewards:', rewardsError);
    }

    // Delete associated leads
    const { error: leadsError } = await supabase
      .from('referral_leads')
      .delete()
      .eq('referral_link_id', linkId);
    
    if (leadsError) {
      console.error('Error deleting leads:', leadsError);
    }

    // Delete associated clicks
    const { error: clicksError } = await supabase
      .from('referral_clicks')
      .delete()
      .eq('referral_link_id', linkId);
    
    if (clicksError) {
      console.error('Error deleting clicks:', clicksError);
    }

    // Delete the link
    const { error } = await supabase
      .from('referral_links')
      .delete()
      .eq('id', linkId);
    
    if (error) {
      console.error('Error deleting link:', error);
      toast.error('Erro ao remover link');
      return false;
    }
    
    await fetchAll();
    toast.success('Link removido!');
    return true;
  };

  const deleteLead = async (leadId: string) => {
    // First delete associated reward if exists
    const { error: rewardError } = await supabase
      .from('referral_rewards')
      .delete()
      .eq('referral_lead_id', leadId);
    
    if (rewardError) {
      console.error('Error deleting reward:', rewardError);
    }

    // Delete the lead
    const { error } = await supabase
      .from('referral_leads')
      .delete()
      .eq('id', leadId);
    
    if (error) {
      console.error('Error deleting lead:', error);
      toast.error('Erro ao remover lead');
      return false;
    }
    
    await Promise.all([fetchLeads(), fetchRewards()]);
    toast.success('Lead removido!');
    return true;
  };

  const deleteReward = async (rewardId: string) => {
    const { error } = await supabase
      .from('referral_rewards')
      .delete()
      .eq('id', rewardId);
    
    if (error) {
      console.error('Error deleting reward:', error);
      toast.error('Erro ao remover recompensa');
      return false;
    }
    
    await fetchRewards();
    toast.success('Recompensa removida!');
    return true;
  };

  const createManualReward = async (
    clientId: string, 
    amount: number, 
    description?: string,
    rewardType: 'cash' | 'coupon' = 'cash'
  ) => {
    // First get or create the referral link for this client
    let linkId: string;
    
    const existingLink = links.find(l => l.client_id === clientId);
    
    if (existingLink) {
      linkId = existingLink.id;
    } else {
      // Create a new link for this client
      const slug = Math.random().toString(36).substring(2, 10);
      const { data: newLink, error: linkError } = await supabase
        .from('referral_links')
        .insert({ client_id: clientId, slug })
        .select()
        .single();
      
      if (linkError || !newLink) {
        console.error('Error creating link:', linkError);
        toast.error('Erro ao criar link de indicação');
        return false;
      }
      
      linkId = newLink.id;
    }
    
    // Create a manual lead (marked as external)
    const validityDays = settings?.validity_days || 60;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);
    
    const { data: newLead, error: leadError } = await supabase
      .from('referral_leads')
      .insert({
        referral_link_id: linkId,
        lead_name: description || 'Indicação externa',
        lead_email: null,
        lead_phone: null,
        source: 'manual',
        is_converted: true,
        converted_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();
    
    if (leadError || !newLead) {
      console.error('Error creating lead:', leadError);
      toast.error('Erro ao criar lead');
      return false;
    }
    
    // Create the reward with type
    const { error: rewardError } = await supabase
      .from('referral_rewards')
      .insert({
        referral_link_id: linkId,
        referral_lead_id: newLead.id,
        amount: amount,
        reward_type: rewardType,
        description: rewardType === 'coupon' ? 'Cupom de desconto para projetos futuros' : null,
        status: 'pending',
      });
    
    if (rewardError) {
      console.error('Error creating reward:', rewardError);
      toast.error('Erro ao criar recompensa');
      return false;
    }
    
    await fetchAll();
    const message = rewardType === 'coupon' 
      ? 'Cupom de desconto criado com sucesso!' 
      : 'Recompensa manual criada com sucesso!';
    toast.success(message);
    return true;
  };

  return {
    settings,
    links,
    clicks,
    leads,
    rewards,
    stats,
    loading,
    fetchAll,
    updateSettings,
    createLink,
    createLinksForAllClients,
    toggleLinkActive,
    updateRewardStatus,
    convertLead,
    deleteLink,
    deleteLead,
    deleteReward,
    createManualReward,
  };
}

// Hook for client-side referral data
export function useClientReferrals(clientId: string | undefined) {
  const [link, setLink] = useState<ReferralLink | null>(null);
  const [clicks, setClicks] = useState<ReferralClick[]>([]);
  const [leads, setLeads] = useState<ReferralLead[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // Fetch settings
      const { data: settingsData } = await supabase
        .from('referral_settings')
        .select('*')
        .single();
      
      setSettings(settingsData);
      
      // Fetch client's link
      const { data: linkData } = await supabase
        .from('referral_links')
        .select('*')
        .eq('client_id', clientId)
        .single();
      
      setLink(linkData);
      
      if (linkData) {
        // Fetch clicks for this link
        const { data: clicksData } = await supabase
          .from('referral_clicks')
          .select('*')
          .eq('referral_link_id', linkData.id)
          .order('created_at', { ascending: false });
        
        setClicks(clicksData || []);
        
        // Fetch leads for this link
        const { data: leadsData } = await supabase
          .from('referral_leads')
          .select('*')
          .eq('referral_link_id', linkData.id)
          .order('created_at', { ascending: false });
        
        setLeads(leadsData || []);
        
        // Fetch rewards for this link
        const { data: rewardsData } = await supabase
          .from('referral_rewards')
          .select('*, referral_leads(*)')
          .eq('referral_link_id', linkData.id)
          .order('created_at', { ascending: false });
        
        const formattedRewards = rewardsData?.map(r => ({
          ...r,
          status: r.status as 'pending' | 'approved' | 'paid',
          reward_type: (r.reward_type || 'cash') as 'cash' | 'coupon',
          referral_lead: r.referral_leads || undefined,
        })) || [];
        
        setRewards(formattedRewards);
      }
    } catch (error) {
      console.error('Error fetching client referral data:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = {
    totalClicks: clicks.length,
    totalLeads: leads.length,
    totalConversions: leads.filter(l => l.is_converted).length,
    pendingRewards: rewards.filter(r => r.status === 'pending').length,
    approvedRewards: rewards.filter(r => r.status === 'approved').length,
    paidRewards: rewards.filter(r => r.status === 'paid').length,
    totalEarned: rewards
      .filter(r => r.status === 'paid')
      .reduce((sum, r) => sum + Number(r.amount), 0),
  };

  return {
    link,
    clicks,
    leads,
    rewards,
    settings,
    stats,
    loading,
    refetch: fetchData,
  };
}
