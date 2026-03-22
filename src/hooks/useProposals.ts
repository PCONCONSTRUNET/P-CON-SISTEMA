import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'rejected'
  | 'entry_paid'
  | 'paid'
  | 'expired';

export interface Proposal {
  id: string;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  client_phone: string | null;
  project_title: string;
  project_description: string | null;
  scope_items: string[];
  delivery_deadline: string | null;
  total_amount: number;
  monthly_amount: number | null;
  entry_amount: number | null;
  allow_partial_payment: boolean;
  discount_amount: number;
  valid_until: string;
  start_deadline: string | null;
  notes: string | null;
  terms_and_conditions: string | null;
  status: ProposalStatus;
  public_slug: string;
  public_link_enabled: boolean;
  allow_online_approval: boolean;
  allow_payment: boolean;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  approved_at: string | null;
  rejected_at: string | null;
  entry_paid_at: string | null;
  paid_at: string | null;
  view_notification_sent_at?: string | null;
  approved_notification_sent_at?: string | null;
  rejected_notification_sent_at?: string | null;
}

export interface ProposalInput {
  client_name: string;
  client_company?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  project_title: string;
  project_description?: string | null;
  scope_items: string[];
  delivery_deadline?: string | null;
  total_amount: number;
  monthly_amount?: number | null;
  entry_amount?: number | null;
  allow_partial_payment: boolean;
  discount_amount: number;
  valid_until: string;
  start_deadline?: string | null;
  notes?: string | null;
  terms_and_conditions?: string | null;
  status: ProposalStatus;
  public_link_enabled: boolean;
  allow_online_approval: boolean;
  allow_payment: boolean;
  sent_at?: string | null;
}

const FINAL_STATUSES: ProposalStatus[] = ['approved', 'rejected', 'entry_paid', 'paid', 'expired'];

const isExpired = (proposal: Pick<Proposal, 'valid_until' | 'status'>) => {
  if (FINAL_STATUSES.includes(proposal.status)) return proposal.status === 'expired';
  return new Date(proposal.valid_until).getTime() < Date.now();
};

export const getEffectiveProposalStatus = (proposal: Pick<Proposal, 'valid_until' | 'status'>): ProposalStatus => {
  if (isExpired(proposal)) return 'expired';
  return proposal.status;
};

export const useProposals = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const normalizeProposals = useCallback((items: Proposal[]) => {
    return items.map((item) => ({
      ...item,
      status: getEffectiveProposalStatus(item),
    }));
  }, []);

  const syncExpiredProposals = useCallback(async (items: Proposal[]) => {
    const expiredIds = items
      .filter((item) => item.status !== 'expired' && !FINAL_STATUSES.includes(item.status) && new Date(item.valid_until).getTime() < Date.now())
      .map((item) => item.id);

    if (!expiredIds.length) return;

    await (supabase as any)
      .from('proposals')
      .update({ status: 'expired' })
      .in('id', expiredIds);
  }, []);

  const fetchProposals = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const normalized = normalizeProposals((data || []) as Proposal[]);
      setProposals(normalized);
      void syncExpiredProposals(normalized);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      toast.error('Erro ao carregar orçamentos');
    } finally {
      setLoading(false);
    }
  }, [normalizeProposals, syncExpiredProposals]);

  const getProposalById = useCallback(async (id: string) => {
    const { data, error } = await (supabase as any)
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { ...(data as Proposal), status: getEffectiveProposalStatus(data as Proposal) } as Proposal;
  }, []);

  const getProposalBySlug = useCallback(async (slug: string) => {
    const { data, error } = await (supabase as any)
      .from('proposals')
      .select('*')
      .eq('public_slug', slug)
      .eq('public_link_enabled', true)
      .single();

    if (error) throw error;
    return { ...(data as Proposal), status: getEffectiveProposalStatus(data as Proposal) } as Proposal;
  }, []);

  const createProposal = useCallback(async (payload: ProposalInput) => {
    const { data, error } = await (supabase as any)
      .from('proposals')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    const proposal = { ...(data as Proposal), status: getEffectiveProposalStatus(data as Proposal) } as Proposal;
    setProposals((prev) => [proposal, ...prev]);
    return proposal;
  }, []);

  const updateProposal = useCallback(async (id: string, payload: Partial<ProposalInput>) => {
    const { data, error } = await (supabase as any)
      .from('proposals')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    const proposal = { ...(data as Proposal), status: getEffectiveProposalStatus(data as Proposal) } as Proposal;
    setProposals((prev) => prev.map((item) => (item.id === id ? proposal : item)));
    return proposal;
  }, []);

  const deleteProposal = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('proposals')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setProposals((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const duplicateProposal = useCallback(async (proposal: Proposal) => {
    const duplicatedPayload: ProposalInput = {
      client_name: `${proposal.client_name}`,
      client_company: proposal.client_company,
      client_email: proposal.client_email,
      client_phone: proposal.client_phone,
      project_title: `${proposal.project_title} (Cópia)`,
      project_description: proposal.project_description,
      scope_items: proposal.scope_items || [],
      delivery_deadline: proposal.delivery_deadline,
      total_amount: Number(proposal.total_amount || 0),
      monthly_amount: proposal.monthly_amount,
      entry_amount: proposal.entry_amount,
      allow_partial_payment: proposal.allow_partial_payment,
      discount_amount: Number(proposal.discount_amount || 0),
      valid_until: proposal.valid_until,
      start_deadline: proposal.start_deadline,
      notes: proposal.notes,
      terms_and_conditions: proposal.terms_and_conditions,
      status: 'draft',
      public_link_enabled: false,
      allow_online_approval: proposal.allow_online_approval,
      allow_payment: proposal.allow_payment,
      sent_at: null,
    };

    return createProposal(duplicatedPayload);
  }, [createProposal]);

  useEffect(() => {
    fetchProposals();

    const channel = supabase
      .channel('proposals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, () => {
        fetchProposals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProposals]);

  const metrics = useMemo(() => {
    const totalValue = proposals.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const approvedValue = proposals
      .filter((item) => item.status === 'approved' || item.status === 'paid' || item.status === 'entry_paid')
      .reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

    return {
      total: proposals.length,
      viewed: proposals.filter((item) => item.status === 'viewed').length,
      approved: proposals.filter((item) => item.status === 'approved' || item.status === 'paid' || item.status === 'entry_paid').length,
      totalValue,
      approvedValue,
    };
  }, [proposals]);

  return {
    proposals,
    loading,
    metrics,
    refetch: fetchProposals,
    getProposalById,
    getProposalBySlug,
    createProposal,
    updateProposal,
    deleteProposal,
    duplicateProposal,
  };
};