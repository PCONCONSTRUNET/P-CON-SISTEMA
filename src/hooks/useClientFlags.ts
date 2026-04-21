import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type FlagColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange' | 'pink' | 'gray';

export interface ClientFlag {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  amount: number | null;
  color: FlagColor;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClientFlag {
  client_id: string;
  title: string;
  description?: string | null;
  amount?: number | null;
  color?: FlagColor;
  is_recurring?: boolean;
}

export const FLAG_COLOR_MAP: Record<FlagColor, { bg: string; text: string; border: string; label: string }> = {
  blue:   { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/40',   label: 'Azul' },
  green:  { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/40',  label: 'Verde' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', label: 'Amarelo' },
  red:    { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/40',    label: 'Vermelho' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40', label: 'Roxo' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40', label: 'Laranja' },
  pink:   { bg: 'bg-pink-500/20',   text: 'text-pink-400',   border: 'border-pink-500/40',   label: 'Rosa' },
  gray:   { bg: 'bg-gray-500/20',   text: 'text-gray-400',   border: 'border-gray-500/40',   label: 'Cinza' },
};

export const useClientFlags = (clientId?: string) => {
  const [flags, setFlags] = useState<ClientFlag[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFlags = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_flags' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFlags((data as ClientFlag[]) || []);
    } catch (error) {
      console.error('Error fetching client flags:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const addFlag = async (flag: CreateClientFlag): Promise<ClientFlag | null> => {
    try {
      const { data, error } = await supabase
        .from('client_flags' as any)
        .insert([{
          client_id: flag.client_id,
          title: flag.title,
          description: flag.description || null,
          amount: flag.amount || null,
          color: flag.color || 'blue',
          is_recurring: flag.is_recurring ?? false,
        }])
        .select()
        .single();

      if (error) throw error;
      const newFlag = data as ClientFlag;
      setFlags(prev => [newFlag, ...prev]);
      toast.success('Marcação criada com sucesso!');
      return newFlag;
    } catch (error) {
      console.error('Error adding flag:', error);
      toast.error('Erro ao criar marcação');
      return null;
    }
  };

  const updateFlag = async (id: string, updates: Partial<Omit<ClientFlag, 'id' | 'client_id' | 'created_at' | 'updated_at'>>): Promise<ClientFlag | null> => {
    try {
      const { data, error } = await supabase
        .from('client_flags' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const updated = data as ClientFlag;
      setFlags(prev => prev.map(f => f.id === id ? updated : f));
      toast.success('Marcação atualizada!');
      return updated;
    } catch (error) {
      console.error('Error updating flag:', error);
      toast.error('Erro ao atualizar marcação');
      return null;
    }
  };

  const deleteFlag = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('client_flags' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setFlags(prev => prev.filter(f => f.id !== id));
      toast.success('Marcação removida!');
      return true;
    } catch (error) {
      console.error('Error deleting flag:', error);
      toast.error('Erro ao remover marcação');
      return false;
    }
  };

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  return { flags, loading, addFlag, updateFlag, deleteFlag, refetch: fetchFlags };
};

// Hook to get flag count for multiple clients
export const useAllClientFlags = () => {
  const [flagCounts, setFlagCounts] = useState<Record<string, number>>({});
  const [allFlags, setAllFlags] = useState<ClientFlag[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const { data, error } = await supabase
          .from('client_flags' as any)
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        const flags = (data as ClientFlag[]) || [];
        setAllFlags(flags);

        const counts: Record<string, number> = {};
        flags.forEach(f => {
          counts[f.client_id] = (counts[f.client_id] || 0) + 1;
        });
        setFlagCounts(counts);
      } catch (error) {
        console.error('Error fetching all flags:', error);
      }
    };

    fetchAll();
  }, []);

  return { flagCounts, allFlags };
};
