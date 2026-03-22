import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types
export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  client_id: string;
  plan_name: string;
  value: number;
  status: string;
  start_date: string;
  next_payment: string;
  created_at: string;
  updated_at: string;
  asaas_id: string | null;
  clients?: {
    name: string;
    email?: string;
    phone?: string;
  };
  clientName?: string;
}

export interface Payment {
  id: string;
  subscription_id: string | null;
  client_id: string | null;
  amount: number;
  status: string;
  payment_method: string | null;
  transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  due_date: string | null;
  description: string | null;
  asaas_id: string | null;
  clientName?: string;
  subscriptions?: {
    clients?: {
      name: string;
    };
    plan_name?: string;
  };
  clients?: {
    name: string;
    email?: string;
    phone?: string | null;
  };
}

export interface Invoice {
  id: string;
  payment_id: string | null;
  client_id: string;
  number: string;
  amount: number;
  status: string;
  issued_at: string;
  clients?: {
    name: string;
  };
}

interface GlobalDataContextType {
  // Data
  clients: Client[];
  subscriptions: Subscription[];
  payments: Payment[];
  invoices: Invoice[];
  
  // Loading states
  loadingClients: boolean;
  loadingSubscriptions: boolean;
  loadingPayments: boolean;
  loadingInvoices: boolean;
  
  // Refetch functions
  refetchClients: () => Promise<void>;
  refetchSubscriptions: () => Promise<void>;
  refetchPayments: () => Promise<void>;
  refetchInvoices: () => Promise<void>;
  refetchAll: () => Promise<void>;
  
  // CRUD operations - Clients
  addClient: (client: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'status'>) => Promise<Client | null>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<Client | null>;
  deleteClient: (id: string) => Promise<boolean>;
  
  // CRUD operations - Subscriptions
  addSubscription: (subscription: Omit<Subscription, 'id' | 'created_at' | 'updated_at' | 'start_date' | 'asaas_id'> & { asaas_id?: string | null }) => Promise<Subscription | null>;
  updateSubscription: (id: string, updates: Partial<Subscription>) => Promise<Subscription | null>;
  deleteSubscription: (id: string) => Promise<boolean>;
  
  // CRUD operations - Payments
  markPaymentAsPaid: (id: string) => Promise<boolean>;
  deletePayment: (id: string) => Promise<boolean>;
  
  // CRUD operations - Invoices
  addInvoice: (invoice: Omit<Invoice, 'id' | 'issued_at'>) => Promise<Invoice | null>;
  deleteInvoice: (id: string) => Promise<boolean>;
}

const GlobalDataContext = createContext<GlobalDataContextType | undefined>(undefined);

export const GlobalDataProvider = ({ children }: { children: ReactNode }) => {
  // State
  const [clients, setClients] = useState<Client[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  // Fetch functions
  const fetchClients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, clients(name, email, phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const subscriptionsWithClientName = (data || []).map(sub => ({
        ...sub,
        clientName: sub.clients?.name || 'N/A'
      }));
      
      setSubscriptions(subscriptionsWithClientName);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoadingSubscriptions(false);
    }
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*, subscriptions(clients(name), plan_name), clients(name, email, phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const paymentsWithClientName = (data || []).map(payment => ({
        ...payment,
        due_date: (payment as any).due_date || null,
        clientName: payment.subscriptions?.clients?.name || payment.clients?.name || 'N/A'
      })) as Payment[];
      
      setPayments(paymentsWithClientName);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, clients(name)')
        .order('issued_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      fetchClients(),
      fetchSubscriptions(),
      fetchPayments(),
      fetchInvoices()
    ]);
  }, [fetchClients, fetchSubscriptions, fetchPayments, fetchInvoices]);

  // CRUD - Clients
  const addClient = async (client: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'status'>): Promise<Client | null> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...client, status: 'active' }])
        .select()
        .single();

      if (error) throw error;
      toast.success('Cliente adicionado com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding client:', error);
      toast.error('Erro ao adicionar cliente');
      return null;
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>): Promise<Client | null> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      toast.success('Cliente atualizado com sucesso!');
      return data;
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Erro ao atualizar cliente');
      return null;
    }
  };

  const deleteClient = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Cliente removido com sucesso!');
      return true;
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Erro ao remover cliente');
      return false;
    }
  };

  // CRUD - Subscriptions
  const addSubscription = async (subscription: Omit<Subscription, 'id' | 'created_at' | 'updated_at' | 'start_date'>): Promise<Subscription | null> => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .insert([subscription])
        .select('*, clients(name)')
        .single();

      if (error) throw error;
      toast.success('Assinatura adicionada com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding subscription:', error);
      toast.error('Erro ao adicionar assinatura');
      return null;
    }
  };

  const updateSubscription = async (id: string, updates: Partial<Subscription>): Promise<Subscription | null> => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', id)
        .select('*, clients(name)')
        .single();

      if (error) throw error;
      toast.success('Assinatura atualizada com sucesso!');
      return data;
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Erro ao atualizar assinatura');
      return null;
    }
  };

  const deleteSubscription = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Assinatura removida com sucesso!');
      return true;
    } catch (error) {
      console.error('Error deleting subscription:', error);
      toast.error('Erro ao remover assinatura');
      return false;
    }
  };

  // CRUD - Payments
  const markPaymentAsPaid = async (id: string): Promise<boolean> => {
    try {
      // First get the payment details with client info and subscription
      const { data: paymentData, error: fetchError } = await supabase
        .from('payments')
        .select('*, clients(id, name, phone), subscriptions(plan_name)')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Update payment status
      const { error } = await supabase
        .from('payments')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;

      // Create invoice with plan description
      const planName = paymentData?.subscriptions?.plan_name || 'Pagamento Avulso';
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      const invoiceNumber = `NF-${year}${month}-${id.slice(-4).toUpperCase()}`;
      const invoiceDescription = `Valor pago referente ao plano ativo: ${planName}`;

      const { error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          payment_id: id,
          client_id: paymentData?.client_id,
          number: invoiceNumber,
          amount: paymentData?.amount,
          status: 'issued',
          description: invoiceDescription,
        });

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
      }

      // Send WhatsApp confirmation if client has phone
      const client = paymentData?.clients;
      if (client?.phone) {
        const formattedAmount = paymentData?.amount 
          ? paymentData.amount.toFixed(2).replace(".", ",")
          : '0,00';
        
        try {
          // Fetch payment_confirmed template from DB
          const { data: templateData } = await supabase
            .from('whatsapp_templates')
            .select('*')
            .eq('template_key', 'payment_confirmed')
            .eq('is_active', true)
            .maybeSingle();

          let message: string;
          let sendImage = true;
          let imageUrl: string | undefined;
          let sendButton = true;
          let buttonText: string | undefined;
          let buttonUrl: string | undefined;

          if (templateData) {
            message = templateData.message_template
              .replace(/\{\{client_name\}\}/g, client.name)
              .replace(/\{\{amount\}\}/g, `R$ ${formattedAmount}`)
              .replace(/\{\{plan_name\}\}/g, planName);
            imageUrl = templateData.image_url || undefined;
            sendImage = !!templateData.image_url;
            sendButton = templateData.button_enabled;
            buttonText = templateData.button_text || undefined;
            buttonUrl = templateData.button_url || undefined;
          } else {
            message = `Ola ${client.name}! 💈\n\n` +
              `✅ *Pagamento confirmado!*\n\n` +
              `Recebemos seu pagamento de *R$ ${formattedAmount}* com sucesso.\n\n` +
              `Obrigado por manter sua assinatura em dia!\n\n` +
              `Qualquer duvida, estamos a disposicao.`;
          }

          await supabase.functions.invoke('whatsapp-send', {
            body: {
              phone: client.phone,
              message,
              clientId: client.id,
              type: 'payment_confirmed_manual',
              sendImage,
              imageUrl,
              sendButton,
              buttonText,
              buttonUrl,
            }
          });
        } catch (whatsappError) {
          console.error('Error sending WhatsApp:', whatsappError);
        }
      }

      toast.success('Pagamento marcado como pago!');
      await Promise.all([fetchPayments(), fetchInvoices()]);
      return true;
    } catch (error) {
      console.error('Error marking payment as paid:', error);
      toast.error('Erro ao marcar pagamento como pago');
      return false;
    }
  };

  const deletePayment = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Pagamento removido com sucesso!');
      return true;
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Erro ao remover pagamento');
      return false;
    }
  };

  // CRUD - Invoices
  const addInvoice = async (invoice: Omit<Invoice, 'id' | 'issued_at'>): Promise<Invoice | null> => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .insert([invoice])
        .select('*, clients(name)')
        .single();

      if (error) throw error;
      toast.success('Nota fiscal emitida com sucesso!');
      return data;
    } catch (error) {
      console.error('Error adding invoice:', error);
      toast.error('Erro ao emitir nota fiscal');
      return null;
    }
  };

  const deleteInvoice = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Nota fiscal removida com sucesso!');
      return true;
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Erro ao remover nota fiscal');
      return false;
    }
  };

  // Initialize and set up realtime subscriptions
  useEffect(() => {
    // Initial fetch
    refetchAll();

    // Set up realtime subscriptions for all tables
    const clientsChannel = supabase
      .channel('global-clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        fetchClients();
      })
      .subscribe();

    const subscriptionsChannel = supabase
      .channel('global-subscriptions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        fetchSubscriptions();
      })
      .subscribe();

    const paymentsChannel = supabase
      .channel('global-payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchPayments();
      })
      .subscribe();

    const invoicesChannel = supabase
      .channel('global-invoices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        fetchInvoices();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(subscriptionsChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(invoicesChannel);
    };
  }, [refetchAll, fetchClients, fetchSubscriptions, fetchPayments, fetchInvoices]);

  return (
    <GlobalDataContext.Provider
      value={{
        clients,
        subscriptions,
        payments,
        invoices,
        loadingClients,
        loadingSubscriptions,
        loadingPayments,
        loadingInvoices,
        refetchClients: fetchClients,
        refetchSubscriptions: fetchSubscriptions,
        refetchPayments: fetchPayments,
        refetchInvoices: fetchInvoices,
        refetchAll,
        addClient,
        updateClient,
        deleteClient,
        addSubscription,
        updateSubscription,
        deleteSubscription,
        markPaymentAsPaid,
        deletePayment,
        addInvoice,
        deleteInvoice,
      }}
    >
      {children}
    </GlobalDataContext.Provider>
  );
};

export const useGlobalData = () => {
  const context = useContext(GlobalDataContext);
  if (context === undefined) {
    throw new Error('useGlobalData must be used within a GlobalDataProvider');
  }
  return context;
};
