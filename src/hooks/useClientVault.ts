import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VaultItem {
  id: string;
  client_id: string;
  title: string;
  username: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useClientVault(clientId: string | undefined) {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVaultItems = async () => {
    if (!clientId) {
      setVaultItems([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('client_vault' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVaultItems((data as unknown as VaultItem[]) || []);
    } catch (error) {
      console.error('Error fetching vault items:', error);
      toast.error('Erro ao carregar cofre');
    } finally {
      setLoading(false);
    }
  };

  const addVaultItem = async (item: {
    title: string;
    username?: string;
    password?: string;
    url?: string;
    notes?: string;
  }) => {
    if (!clientId) return null;

    try {
      const { data, error } = await supabase
        .from('client_vault' as any)
        .insert({
          client_id: clientId,
          title: item.title,
          username: item.username || null,
          password: item.password || null,
          url: item.url || null,
          notes: item.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      const newItem = data as unknown as VaultItem;
      setVaultItems(prev => [newItem, ...prev]);
      toast.success('Credencial salva com sucesso!');
      return newItem;
    } catch (error) {
      console.error('Error adding vault item:', error);
      toast.error('Erro ao salvar credencial');
      return null;
    }
  };

  const updateVaultItem = async (id: string, updates: {
    title?: string;
    username?: string;
    password?: string;
    url?: string;
    notes?: string;
  }) => {
    try {
      const { data, error } = await supabase
        .from('client_vault' as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const updatedItem = data as unknown as VaultItem;
      setVaultItems(prev => prev.map(item => item.id === id ? updatedItem : item));
      toast.success('Credencial atualizada!');
      return updatedItem;
    } catch (error) {
      console.error('Error updating vault item:', error);
      toast.error('Erro ao atualizar credencial');
      return null;
    }
  };

  const deleteVaultItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('client_vault' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setVaultItems(prev => prev.filter(item => item.id !== id));
      toast.success('Credencial removida!');
      return true;
    } catch (error) {
      console.error('Error deleting vault item:', error);
      toast.error('Erro ao remover credencial');
      return false;
    }
  };

  useEffect(() => {
    fetchVaultItems();
  }, [clientId]);

  return {
    vaultItems,
    loading,
    addVaultItem,
    updateVaultItem,
    deleteVaultItem,
    refetch: fetchVaultItems,
  };
}
