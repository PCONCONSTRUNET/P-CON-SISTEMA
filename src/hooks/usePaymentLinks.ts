import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PaymentLinkRecord {
  id: string;
  token: string;
  title: string;
  description: string | null;
  amount: number;
  allow_pix: boolean;
  allow_card: boolean;
  max_installments: number;
  status: 'pending' | 'paid' | 'cancelled' | string;
  client_id: string | null;
  payer_name: string | null;
  payer_document: string | null;
  payer_email: string | null;
  payer_phone: string | null;
  payment_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentLinkInput {
  title: string;
  description?: string;
  amount: number;
  allow_pix: boolean;
  allow_card: boolean;
  max_installments?: number;
}

export function buildStandalonePaymentUrl(token: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.pconassinantes.site');
  return `${base}/pagar/${token}`;
}

export function buildClientSideFallbackToken(title: string): string {
  const slug = (title || 'cobranca')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 26)
    .replace(/-+$/, '') || 'cobranca';
  const rand = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `${slug}-${rand}`;
}

export function usePaymentLinks() {
  const [links, setLinks] = useState<PaymentLinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('payment_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setLinks((data || []) as PaymentLinkRecord[]);
    } catch (err: any) {
      console.error('Error fetching payment links:', err);
      const missingTable =
        err?.code === 'PGRST205' || String(err?.message || '').includes('payment_links');
      setError(
        missingTable
          ? 'A tabela payment_links ainda não foi criada no Supabase. Execute a migration SQL para ativar.'
          : 'Não foi possível carregar os links de pagamento.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLinks();

    let debounceTimer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel('payment-links-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_links' }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void fetchLinks();
        }, 800);
      })
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchLinks]);

  const createLink = async (input: CreatePaymentLinkInput): Promise<PaymentLinkRecord | null> => {
    try {
      const token = buildClientSideFallbackToken(input.title);
      const { data, error: insertError } = await (supabase as any)
        .from('payment_links')
        .insert({
          token,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          amount: Number(input.amount),
          allow_pix: input.allow_pix,
          allow_card: input.allow_card,
          max_installments: Math.min(Math.max(input.max_installments || 4, 1), 4),
          status: 'pending',
        })
        .select('*')
        .single();

      if (insertError) throw insertError;
      const created = data as PaymentLinkRecord;
      setLinks((prev) => [created, ...prev.filter((l) => l.id !== created.id)]);
      return created;
    } catch (err: any) {
      console.error('Error creating payment link:', err);
      toast.error(err?.message || 'Erro ao criar link de pagamento');
      return null;
    }
  };

  const updateLink = async (
    id: string,
    updates: Partial<
      Pick<
        PaymentLinkRecord,
        'title' | 'description' | 'amount' | 'allow_pix' | 'allow_card' | 'max_installments' | 'status'
      >
    >,
  ): Promise<PaymentLinkRecord | null> => {
    try {
      const { data, error: updateError } = await (supabase as any)
        .from('payment_links')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (updateError) throw updateError;
      const updated = data as PaymentLinkRecord;
      setLinks((prev) => prev.map((l) => (l.id === id ? updated : l)));
      return updated;
    } catch (err: any) {
      console.error('Error updating payment link:', err);
      toast.error(err?.message || 'Erro ao atualizar link de pagamento');
      return null;
    }
  };

  const deleteLink = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await (supabase as any)
        .from('payment_links')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast.success('Link de pagamento removido!');
      return true;
    } catch (err: any) {
      console.error('Error deleting payment link:', err);
      toast.error('Erro ao remover link de pagamento');
      return false;
    }
  };

  return {
    links,
    loading,
    error,
    createLink,
    updateLink,
    deleteLink,
    refetch: fetchLinks,
  };
}
