import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Implementation {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  value: number;
  status: 'active' | 'inactive';
  availability: 'available' | 'coming_soon';
  category: string | null;
  tags: string[];
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImplementationRequest {
  id: string;
  implementation_id: string;
  client_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  implementation?: Implementation;
  client?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CreateImplementationData {
  name: string;
  description?: string;
  short_description?: string;
  value: number;
  status?: 'active' | 'inactive';
  availability?: 'available' | 'coming_soon';
  category?: string;
  tags?: string[];
  image_url?: string;
}

// Type for raw database response
interface RawImplementation {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  value: number;
  status: string;
  availability: string;
  category: string | null;
  tags: string[] | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

interface RawImplementationRequest {
  id: string;
  implementation_id: string;
  client_id: string;
  status: string;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useImplementations = () => {
  const [implementations, setImplementations] = useState<Implementation[]>([]);
  const [requests, setRequests] = useState<ImplementationRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchImplementations = useCallback(async (onlyActive = false) => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('implementations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (onlyActive) {
        query = query.eq('status', 'active');
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const rawData = data as RawImplementation[];
      const typedData: Implementation[] = (rawData || []).map(item => ({
        ...item,
        status: item.status as 'active' | 'inactive',
        availability: item.availability as 'available' | 'coming_soon',
        tags: item.tags || []
      }));
      
      setImplementations(typedData);
    } catch (error) {
      console.error('Error fetching implementations:', error);
      toast.error('Erro ao carregar implantações');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRequests = useCallback(async (clientId?: string) => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('implementation_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const rawRequests = data as RawImplementationRequest[];

      // Fetch implementations and clients separately
      const requestsWithRelations = await Promise.all(
        (rawRequests || []).map(async (req) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: implData } = await (supabase as any)
            .from('implementations')
            .select('*')
            .eq('id', req.implementation_id)
            .single();

          const { data: clientData } = await supabase
            .from('clients')
            .select('id, name, email')
            .eq('id', req.client_id)
            .single();

          const rawImpl = implData as RawImplementation | null;

          return {
            ...req,
            status: req.status as 'pending' | 'approved' | 'rejected' | 'completed',
            implementation: rawImpl ? {
              ...rawImpl,
              status: rawImpl.status as 'active' | 'inactive',
              availability: rawImpl.availability as 'available' | 'coming_soon',
              tags: rawImpl.tags || []
            } : undefined,
            client: clientData || undefined
          } as ImplementationRequest;
        })
      );

      setRequests(requestsWithRelations);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast.error('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  }, []);

  const createImplementation = useCallback(async (data: CreateImplementationData) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('implementations')
        .insert({
          name: data.name,
          description: data.description || null,
          short_description: data.short_description || null,
          value: data.value,
          status: data.status || 'active',
          availability: data.availability || 'available',
          category: data.category || null,
          tags: data.tags || [],
          image_url: data.image_url || null
        });

      if (error) throw error;

      toast.success('Implantação criada com sucesso!');
      await fetchImplementations();
      return true;
    } catch (error) {
      console.error('Error creating implementation:', error);
      toast.error('Erro ao criar implantação');
      return false;
    }
  }, [fetchImplementations]);

  const updateImplementation = useCallback(async (id: string, data: Partial<CreateImplementationData>) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('implementations')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Implantação atualizada com sucesso!');
      await fetchImplementations();
      return true;
    } catch (error) {
      console.error('Error updating implementation:', error);
      toast.error('Erro ao atualizar implantação');
      return false;
    }
  }, [fetchImplementations]);

  const deleteImplementation = useCallback(async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('implementations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Implantação excluída com sucesso!');
      await fetchImplementations();
      return true;
    } catch (error) {
      console.error('Error deleting implementation:', error);
      toast.error('Erro ao excluir implantação');
      return false;
    }
  }, [fetchImplementations]);

  const toggleStatus = useCallback(async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    return updateImplementation(id, { status: newStatus as 'active' | 'inactive' });
  }, [updateImplementation]);

  const createRequest = useCallback(async (implementationId: string, clientId: string, notes?: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingRequest } = await (supabase as any)
        .from('implementation_requests')
        .select('id')
        .eq('implementation_id', implementationId)
        .eq('client_id', clientId)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (existingRequest) {
        toast.error('Você já solicitou esta implantação');
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('implementation_requests')
        .insert({
          implementation_id: implementationId,
          client_id: clientId,
          notes: notes || null,
          status: 'pending'
        });

      if (error) throw error;

      toast.success('Solicitação enviada com sucesso!');
      return true;
    } catch (error) {
      console.error('Error creating request:', error);
      toast.error('Erro ao enviar solicitação');
      return false;
    }
  }, []);

  const updateRequestStatus = useCallback(async (id: string, status: string, adminNotes?: string) => {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString()
      };

      if (adminNotes !== undefined) {
        updateData.admin_notes = adminNotes;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('implementation_requests')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast.success('Status atualizado com sucesso!');
      await fetchRequests();
      return true;
    } catch (error) {
      console.error('Error updating request:', error);
      toast.error('Erro ao atualizar status');
      return false;
    }
  }, [fetchRequests]);

  const deleteRequest = useCallback(async (id: string, clientId?: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('implementation_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Solicitação excluída com sucesso!');
      if (clientId) {
        await fetchRequests(clientId);
      } else {
        await fetchRequests();
      }
      return true;
    } catch (error) {
      console.error('Error deleting request:', error);
      toast.error('Erro ao excluir solicitação');
      return false;
    }
  }, [fetchRequests]);

  const getCategories = useCallback(() => {
    const categories = implementations
      .map(impl => impl.category)
      .filter((cat): cat is string => cat !== null);
    return [...new Set(categories)];
  }, [implementations]);

  return {
    implementations,
    requests,
    loading,
    fetchImplementations,
    fetchRequests,
    createImplementation,
    updateImplementation,
    deleteImplementation,
    toggleStatus,
    createRequest,
    updateRequestStatus,
    deleteRequest,
    getCategories
  };
};
