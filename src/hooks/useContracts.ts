import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Contract {
  id: string;
  client_id: string;
  title: string;
  content: string | null;
  file_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const useContracts = (clientId?: string) => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContracts = async () => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File, clientId: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Erro ao fazer upload do arquivo');
      return null;
    }
  };

  const addContract = async (
    contract: { title: string; content?: string; file?: File }
  ) => {
    if (!clientId) return null;

    try {
      let filePath: string | null = null;

      if (contract.file) {
        filePath = await uploadFile(contract.file, clientId);
      }

      const { data, error } = await supabase
        .from('contracts')
        .insert([{
          client_id: clientId,
          title: contract.title,
          content: contract.content || null,
          file_path: filePath,
          status: 'active'
        }])
        .select()
        .single();

      if (error) throw error;
      setContracts(prev => [data, ...prev]);
      toast.success('Contrato cadastrado com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding contract:', error);
      toast.error('Erro ao cadastrar contrato');
      return null;
    }
  };

  const deleteContract = async (id: string) => {
    try {
      // First, get the contract to delete the file if exists
      const contract = contracts.find(c => c.id === id);
      
      if (contract?.file_path) {
        // Extract file path from URL
        const urlParts = contract.file_path.split('/contracts/');
        if (urlParts[1]) {
          await supabase.storage.from('contracts').remove([urlParts[1]]);
        }
      }

      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setContracts(prev => prev.filter(c => c.id !== id));
      toast.success('Contrato removido com sucesso!');
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast.error('Erro ao remover contrato');
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [clientId]);

  return { contracts, loading, addContract, deleteContract, refetch: fetchContracts };
};
