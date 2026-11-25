import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOptionalGlobalData } from '@/contexts/GlobalDataContext';
import { toast } from 'sonner';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  status: string;
  license_token?: string | null;
  created_at: string;
  updated_at: string;
}

export const useClients = () => {
  const globalData = useOptionalGlobalData();
  const [fallbackClients, setFallbackClients] = useState<Client[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(!globalData);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const fetchFallbackClients = async () => {
    setFallbackError(null);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone, document, status, license_token, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFallbackClients((data || []) as Client[]);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setFallbackError('Não foi possível conectar ao banco de dados.');
      toast.error('Erro ao carregar clientes');
    } finally {
      setFallbackLoading(false);
    }
  };

  useEffect(() => {
    if (globalData) return;

    void fetchFallbackClients();

    let debounceTimer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void fetchFallbackClients();
        }, 1000);
      })
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [Boolean(globalData)]);

  if (globalData) {
    return {
      clients: globalData.clients as Client[],
      loading: globalData.loadingClients,
      error: globalData.clientsError,
      addClient: globalData.addClient,
      updateClient: globalData.updateClient,
      deleteClient: globalData.deleteClient,
      refetch: globalData.refetchClients,
    };
  }

  const addClient = async (client: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'status'>) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...client, status: 'active' }])
        .select()
        .single();

      if (error) throw error;
      setFallbackClients((prev) => [data as Client, ...prev]);
      toast.success('Cliente cadastrado com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding client:', error);
      toast.error('Erro ao cadastrar cliente');
      return null;
    }
  };

  const updateClient = async (id: string, updates: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setFallbackClients((prev) => prev.map((c) => (c.id === id ? (data as Client) : c)));
      toast.success('Cliente atualizado com sucesso!');
      return data;
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Erro ao atualizar cliente');
      return null;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setFallbackClients((prev) => prev.filter((c) => c.id !== id));
      toast.success('Cliente removido com sucesso!');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Erro ao remover cliente');
    }
  };

  return {
    clients: fallbackClients,
    loading: fallbackLoading,
    error: fallbackError,
    addClient,
    updateClient,
    deleteClient,
    refetch: fetchFallbackClients,
  };
};
