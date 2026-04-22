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

export interface WhatsAppTemplate {
  id: string;
  template_key: string;
  name: string;
  message_template: string;
  is_active: boolean;
  image_url: string | null;
  button_enabled: boolean;
  button_text: string | null;
  button_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSettings {
  id: string;
  send_hour: number;
  send_minute: number;
  admin_phone?: string | null;
}

interface GlobalDataContextType {
  // Data
  clients: Client[];
  subscriptions: Subscription[];
  payments: Payment[];
  invoices: Invoice[];
  whatsappTemplates: WhatsAppTemplate[];
  whatsappSettings: WhatsAppSettings | null;
  
  // Loading states
  loadingClients: boolean;
  loadingSubscriptions: boolean;
  loadingPayments: boolean;
  loadingInvoices: boolean;
  loadingTemplates: boolean;
  
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
  updatePayment: (id: string, updates: Partial<Payment>) => Promise<Payment | null>;
  deletePayment: (id: string) => Promise<boolean>;
  
  // CRUD operations - Invoices
  addInvoice: (invoice: Omit<Invoice, 'id' | 'issued_at'>) => Promise<Invoice | null>;
  deleteInvoice: (id: string) => Promise<boolean>;

  // WhatsApp
  updateWhatsAppTemplate: (id: string, updates: Partial<WhatsAppTemplate>) => Promise<boolean>;
  updateWhatsAppSettings: (updates: Partial<WhatsAppSettings>) => Promise<boolean>;
}

const GlobalDataContext = createContext<GlobalDataContextType | undefined>(undefined);

export const GlobalDataProvider = ({ children }: { children: ReactNode }) => {
  // State
  const [clients, setClients] = useState<Client[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>([]);
  const [whatsappSettings, setWhatsappSettings] = useState<WhatsAppSettings | null>(null);
  
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

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
        .select('*, clients(name, email, phone)')
        .order('issued_at', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const fetchWhatsApp = useCallback(async () => {
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        supabase.from('whatsapp_templates').select('*'),
        supabase.from('whatsapp_settings').select('*').maybeSingle()
      ]);

      if (templatesRes.error) throw templatesRes.error;
      setWhatsappTemplates(templatesRes.data || []);
      setWhatsappSettings(settingsRes.data || null);
    } catch (error) {
      console.error('Error fetching WhatsApp data:', error);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      fetchClients(),
      fetchSubscriptions(),
      fetchPayments(),
      fetchInvoices(),
      fetchWhatsApp()
    ]);
  }, [fetchClients, fetchSubscriptions, fetchPayments, fetchInvoices, fetchWhatsApp]);

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
        .select('*, clients(name, email, phone)')
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
        .select('*, clients(name, email, phone)')
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
      const { data: paymentData, error: fetchError } = await supabase
        .from('payments')
        .select('*, clients(id, name, phone), subscriptions(plan_name)')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('payments')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;

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

      if (paymentData?.subscription_id) {
        try {
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('next_payment, value')
            .eq('id', paymentData.subscription_id)
            .single();

          if (subData?.next_payment) {
            const currentNext = new Date(subData.next_payment);
            const nextDay = currentNext.getDate();
            const nextMonth = currentNext.getMonth() + 1;
            const nextYear = currentNext.getFullYear();

            let newDate: Date;
            if (nextMonth > 11) {
              newDate = new Date(nextYear + 1, 0, 1);
            } else {
              newDate = new Date(nextYear, nextMonth, 1);
            }
            const lastDay = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
            newDate.setDate(Math.min(nextDay, lastDay));
            newDate.setHours(12, 0, 0, 0);

            await supabase
              .from('subscriptions')
              .update({ next_payment: newDate.toISOString() })
              .eq('id', paymentData.subscription_id);
          }
        } catch (cycleError) {
          console.error('Error advancing subscription cycle:', cycleError);
        }
      }

      const client = paymentData?.clients;
      if (client?.phone) {
        const formattedAmount = paymentData?.amount 
          ? paymentData.amount.toFixed(2).replace(".", ",")
          : '0,00';
        
        try {
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

      toast.success('Pagamento marcado como pago! Vencimento atualizado para o próximo mês.');
      await Promise.all([fetchPayments(), fetchInvoices(), fetchSubscriptions()]);

      return true;
    } catch (error) {
      console.error('Error marking payment as paid:', error);
      toast.error('Erro ao marcar pagamento como pago');
      return false;
    }
  };

  const updatePayment = async (id: string, updates: Partial<Payment>): Promise<Payment | null> => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      toast.success('Pagamento atualizado com sucesso!');
      await fetchPayments();
      return data;
    } catch (error) {
      console.error('Error updating payment:', error);
      toast.error('Erro ao atualizar pagamento');
      return null;
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
        .select('*, clients(name, email, phone)')
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

  // WhatsApp Settings/Templates
  const updateWhatsAppTemplate = async (id: string, updates: Partial<WhatsAppTemplate>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      toast.success('Template atualizado!');
      return true;
    } catch (error) {
      console.error('Error updating template:', error);
      return false;
    }
  };

  const updateWhatsAppSettings = async (updates: Partial<WhatsAppSettings>): Promise<boolean> => {
    try {
      let result;
      if (!whatsappSettings?.id) {
        // Se ainda não existia no estado, cria a linha pela primeira vez
        const { data, error } = await supabase
          .from('whatsapp_settings')
          .insert({
            send_hour: updates.send_hour ?? 9,
            send_minute: updates.send_minute ?? 0
          })
          .select()
          .single();
          
        if (error) throw error;
        result = data;
      } else {
        // Atualiza a linha existente
        const safeUpdates = { ...updates };
        delete (safeUpdates as any).id;
        delete (safeUpdates as any).created_at;
        delete (safeUpdates as any).updated_at;

        const { data, error } = await supabase
          .from('whatsapp_settings')
          .update(safeUpdates)
          .eq('id', whatsappSettings.id)
          .select()
          .single();
          
        if (error) throw error;
        result = data;
      }

      setWhatsappSettings(result);
      toast.success('Horário de envio salvo com sucesso!');
      return true;
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast.error('Erro ao salvar horário: ' + (error.message || 'Desconhecido'));
      return false;
    }
  };

  // Initialize and set up realtime subscriptions
  useEffect(() => {
    refetchAll();

    const clientsChannel = supabase.channel('global-clients-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => fetchClients()).subscribe();
    const subscriptionsChannel = supabase.channel('global-subscriptions-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => fetchSubscriptions()).subscribe();
    const paymentsChannel = supabase.channel('global-payments-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchPayments()).subscribe();
    const invoicesChannel = supabase.channel('global-invoices-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchInvoices()).subscribe();
    const whatsappChannel = supabase.channel('global-whatsapp-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_templates' }, () => fetchWhatsApp()).subscribe();

    return () => {
      supabase.removeChannel(clientsChannel);
      supabase.removeChannel(subscriptionsChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(invoicesChannel);
      supabase.removeChannel(whatsappChannel);
    };
  }, [refetchAll, fetchClients, fetchSubscriptions, fetchPayments, fetchInvoices, fetchWhatsApp]);

  return (
    <GlobalDataContext.Provider
      value={{
        clients,
        subscriptions,
        payments,
        invoices,
        whatsappTemplates,
        whatsappSettings,
        loadingClients,
        loadingSubscriptions,
        loadingPayments,
        loadingInvoices,
        loadingTemplates,
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
        updatePayment,
        deletePayment,
        addInvoice,
        deleteInvoice,
        updateWhatsAppTemplate,
        updateWhatsAppSettings,
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
