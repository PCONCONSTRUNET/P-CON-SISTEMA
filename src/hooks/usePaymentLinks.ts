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
  original_amount?: number | null;
  balance_payment_id?: string | null;
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
  client_id?: string | null;
  original_amount?: number | null;
}

export interface ConfigurePaymentLinkBillingInput {
  linkId: string;
  title?: string;
  description?: string | null;
  amount?: number;
  allow_pix?: boolean;
  allow_card?: boolean;
  max_installments?: number;
  client_id?: string | null;
  clear_client?: boolean;
  original_amount?: number | null;
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

let cachedLinks: PaymentLinkRecord[] | null = null;

export function usePaymentLinks() {
  const [links, setLinks] = useState<PaymentLinkRecord[]>(() => cachedLinks || []);
  const [loading, setLoading] = useState(() => cachedLinks === null);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setError(null);
    if (cachedLinks === null) {
      setLoading(true);
    }
    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('payment_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      const list = (data || []) as PaymentLinkRecord[];
      cachedLinks = list;
      setLinks(list);
    } catch (err: any) {
      console.error('Error fetching payment links:', err);
      const msg = String(err?.message || '');
      const missingTable =
        err?.code === 'PGRST205' ||
        (msg.includes('payment_links') && msg.toLowerCase().includes('schema cache'));
      setError(
        missingTable
          ? 'A tabela payment_links ainda não foi criada no Supabase. Execute a migration SQL para ativar.'
          : 'Banco de dados temporariamente indisponível ou lento. Exibindo últimos dados em cache e tentando reconectar.',
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
        }, 1500);
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
      let created = data as PaymentLinkRecord;

      if (input.client_id || (input.original_amount && input.original_amount > input.amount)) {
        const { data: rpcRes, error: rpcErr } = await (supabase as any).rpc(
          'configure_payment_link_billing',
          {
            p_link_id: created.id,
            p_client_id: input.client_id || null,
            p_clear_client: false,
            p_original_amount:
              input.original_amount && input.original_amount > input.amount
                ? Number(input.original_amount)
                : null,
          },
        );
        if (!rpcErr && rpcRes?.link) {
          created = rpcRes.link as PaymentLinkRecord;
        }
      }

      setLinks((prev) => {
        const next = [created, ...prev.filter((l) => l.id !== created.id)];
        cachedLinks = next;
        return next;
      });
      return created;
    } catch (err: any) {
      console.error('Error creating payment link:', err);
      toast.error(err?.message || 'Erro ao criar link de pagamento');
      return null;
    }
  };

  const configureLinkBilling = async (
    input: ConfigurePaymentLinkBillingInput,
  ): Promise<PaymentLinkRecord | null> => {
    try {
      const { data: rpcRes, error: rpcError } = await (supabase as any).rpc(
        'configure_payment_link_billing',
        {
          p_link_id: input.linkId,
          p_title: input.title ?? null,
          p_description: input.description === undefined ? null : input.description || '',
          p_amount: input.amount ?? null,
          p_allow_pix: input.allow_pix ?? null,
          p_allow_card: input.allow_card ?? null,
          p_max_installments: input.max_installments ?? null,
          p_client_id: input.client_id ?? null,
          p_clear_client: !!input.clear_client,
          p_original_amount: input.original_amount ?? null,
        },
      );

      if (rpcError) throw rpcError;
      const updated = (rpcRes?.link || null) as PaymentLinkRecord | null;
      if (updated) {
        setLinks((prev) => {
          const next = prev.map((l) => (l.id === updated.id ? updated : l));
          cachedLinks = next;
          return next;
        });
      } else {
        await fetchLinks();
      }
      return updated;
    } catch (err: any) {
      console.error('Error configuring payment link billing:', err);
      toast.error(err?.message || 'Erro ao atualizar configurações do link');
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
      setLinks((prev) => {
        const next = prev.map((l) => (l.id === id ? updated : l));
        cachedLinks = next;
        return next;
      });
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
      setLinks((prev) => {
        const next = prev.filter((l) => l.id !== id);
        cachedLinks = next;
        return next;
      });
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
    configureLinkBilling,
    deleteLink,
    refetch: fetchLinks,
  };
}
