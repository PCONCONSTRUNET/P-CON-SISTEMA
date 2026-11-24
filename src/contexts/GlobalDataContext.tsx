import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Types
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
    document?: string | null;
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
      email?: string;
      phone?: string | null;
      document?: string | null;
    };
    plan_name?: string;
  };
  clients?: {
    name: string;
    email?: string;
    phone?: string | null;
    document?: string | null;
  };
}

export interface Invoice {
  id: string;
  payment_id: string | null;
  client_id: string;
  number: string;
  amount: number;
  status: string;
  description?: string | null;
  issued_at: string;
  clients?: {
    name: string;
    email?: string;
    phone?: string | null;
    document?: string | null;
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

export interface AppSettings {
  id: string;
  pro_labore_mode: 'percent' | 'fixed';
  pro_labore_percent: number;
  pro_labore_fixed: number;
}

interface GlobalDataContextType {
  // Data
  clients: Client[];
  subscriptions: Subscription[];
  payments: Payment[];
  invoices: Invoice[];
  whatsappTemplates: WhatsAppTemplate[];
  whatsappSettings: WhatsAppSettings | null;
  appSettings: AppSettings | null;
  
  // Loading states
  loadingClients: boolean;
  loadingSubscriptions: boolean;
  loadingPayments: boolean;
  loadingInvoices: boolean;
  loadingTemplates: boolean;
  loadingAppSettings: boolean;
  
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
  
  // App Settings
  updateAppSettings: (updates: Partial<AppSettings>) => Promise<boolean>;
}

const GlobalDataContext = createContext<GlobalDataContextType | undefined>(undefined);

export const GlobalDataProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();

  // Raw state (sem joins pesados no banco)
  const [clients, setClients] = useState<Client[]>([]);
  const [rawSubscriptions, setRawSubscriptions] = useState<Subscription[]>([]);
  const [rawPayments, setRawPayments] = useState<Payment[]>([]);
  const [rawInvoices, setRawInvoices] = useState<Invoice[]>([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>([]);
  const [whatsappSettings, setWhatsappSettings] = useState<WhatsAppSettings | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingAppSettings, setLoadingAppSettings] = useState(false);

  const inFlightRef = useRef<Record<string, boolean>>({});

  // Lookup maps em memória (evita JOINs triplos no PostgreSQL)
  const clientsById = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const subscriptions = useMemo<Subscription[]>(() => {
    return rawSubscriptions.map((sub) => {
      const client = clientsById.get(sub.client_id);
      return {
        ...sub,
        clients: client
          ? {
              name: client.name,
              email: client.email,
              phone: client.phone || undefined,
              document: client.document,
            }
          : sub.clients,
        clientName: client?.name || sub.clients?.name || 'N/A',
      };
    });
  }, [rawSubscriptions, clientsById]);

  const subscriptionsById = useMemo(() => {
    const map = new Map<string, Subscription>();
    for (const s of subscriptions) map.set(s.id, s);
    return map;
  }, [subscriptions]);

  const payments = useMemo<Payment[]>(() => {
    return rawPayments.map((payment) => {
      const directClient = payment.client_id ? clientsById.get(payment.client_id) : undefined;
      const sub = payment.subscription_id ? subscriptionsById.get(payment.subscription_id) : undefined;
      const subClient = sub ? clientsById.get(sub.client_id) : undefined;
      const resolvedName = sub?.clientName || subClient?.name || directClient?.name || 'N/A';

      return {
        ...payment,
        due_date: payment.due_date || null,
        clientName: resolvedName,
        clients: directClient
          ? {
              name: directClient.name,
              email: directClient.email,
              phone: directClient.phone,
              document: directClient.document,
            }
          : payment.clients,
        subscriptions: sub
          ? {
              plan_name: sub.plan_name,
              clients: subClient
                ? {
                    name: subClient.name,
                    email: subClient.email,
                    phone: subClient.phone,
                    document: subClient.document,
                  }
                : sub.clients
                ? {
                    name: sub.clients.name,
                    email: sub.clients.email,
                    phone: sub.clients.phone ?? null,
                    document: sub.clients.document ?? null,
                  }
                : undefined,
            }
          : payment.subscriptions,
      };
    });
  }, [rawPayments, clientsById, subscriptionsById]);

  const invoices = useMemo<Invoice[]>(() => {
    return rawInvoices.map((inv) => {
      const client = clientsById.get(inv.client_id);
      return {
        ...inv,
        clients: client
          ? {
              name: client.name,
              email: client.email,
              phone: client.phone,
              document: client.document,
            }
          : inv.clients,
      };
    });
  }, [rawInvoices, clientsById]);

  // Fetch functions (consultas planas sem JOINs pesados + dedup de chamadas em voo)
  const fetchClients = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current.clients) return;
    inFlightRef.current.clients = true;
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, phone, document, status, license_token, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClients((data || []) as Client[]);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      inFlightRef.current.clients = false;
      setLoadingClients(false);
    }
  }, [isAuthenticated]);

  const fetchSubscriptions = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current.subscriptions) return;
    inFlightRef.current.subscriptions = true;
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, client_id, plan_name, value, status, start_date, next_payment, created_at, updated_at, asaas_id')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRawSubscriptions((data || []) as Subscription[]);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      inFlightRef.current.subscriptions = false;
      setLoadingSubscriptions(false);
    }
  }, [isAuthenticated]);

  const fetchPayments = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current.payments) return;
    inFlightRef.current.payments = true;
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('id, subscription_id, client_id, amount, status, payment_method, transaction_id, paid_at, created_at, due_date, description, asaas_id')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRawPayments((data || []) as Payment[]);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      inFlightRef.current.payments = false;
      setLoadingPayments(false);
    }
  }, [isAuthenticated]);

  const fetchInvoices = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current.invoices) return;
    inFlightRef.current.invoices = true;
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, payment_id, client_id, number, amount, status, description, issued_at')
        .order('issued_at', { ascending: false });

      if (error) throw error;
      setRawInvoices((data || []) as Invoice[]);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      inFlightRef.current.invoices = false;
      setLoadingInvoices(false);
    }
  }, [isAuthenticated]);

  const fetchWhatsApp = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current.whatsapp) return;
    inFlightRef.current.whatsapp = true;
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        supabase
          .from('whatsapp_templates')
          .select('id, template_key, name, message_template, is_active, image_url, button_enabled, button_text, button_url, created_at, updated_at'),
        (supabase as any).from('whatsapp_settings').select('id, send_hour, send_minute, admin_phone').maybeSingle(),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      setWhatsappTemplates(templatesRes.data || []);
      setWhatsappSettings(settingsRes.data || null);
    } catch (error) {
      console.error('Error fetching WhatsApp data:', error);
    } finally {
      inFlightRef.current.whatsapp = false;
      setLoadingTemplates(false);
    }
  }, [isAuthenticated]);

  const fetchAppSettings = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current.appSettings) return;
    inFlightRef.current.appSettings = true;
    try {
      const { data, error } = await (supabase as any)
        .from('app_settings')
        .select('id, pro_labore_mode, pro_labore_percent, pro_labore_fixed')
        .maybeSingle();
      if (error) throw error;
      setAppSettings(data);
    } catch (error) {
      console.error('Error fetching app settings:', error);
    } finally {
      inFlightRef.current.appSettings = false;
      setLoadingAppSettings(false);
    }
  }, [isAuthenticated]);

  const refetchAll = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingClients(true);
    setLoadingSubscriptions(true);
    setLoadingPayments(true);
    setLoadingInvoices(true);
    setLoadingTemplates(true);
    setLoadingAppSettings(true);

    try {
      // Fase 1: dados essenciais para o Dashboard carregam em paralelo (1 round-trip)
      await Promise.all([
        fetchClients(),
        fetchSubscriptions(),
        fetchPayments(),
        fetchAppSettings(),
      ]);
      // Fase 2: dados secundários carregam em seguida sem travar a tela inicial
      await Promise.all([
        fetchInvoices(),
        fetchWhatsApp(),
      ]);
    } catch (e) {
      console.error('Error in batched refetchAll:', e);
    }
  }, [isAuthenticated, fetchClients, fetchSubscriptions, fetchPayments, fetchInvoices, fetchWhatsApp, fetchAppSettings]);

  // CRUD - Clients
  const addClient = async (client: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'status'>): Promise<Client | null> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...client, status: 'active' }])
        .select('id, name, email, phone, document, status, license_token, created_at, updated_at')
        .single();

      if (error) throw error;
      const created = data as Client;
      setClients((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      toast.success('Cliente adicionado com sucesso!');
      return created;
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
        .select('id, name, email, phone, document, status, license_token, created_at, updated_at')
        .single();

      if (error) throw error;
      const updated = data as Client;
      setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success('Cliente atualizado com sucesso!');
      return updated;
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
      setClients((prev) => prev.filter((c) => c.id !== id));
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
        .select('id, client_id, plan_name, value, status, start_date, next_payment, created_at, updated_at, asaas_id')
        .single();

      if (error) throw error;
      const created = data as Subscription;
      setRawSubscriptions((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      toast.success('Assinatura adicionada com sucesso!');
      return created;
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
        .select('id, client_id, plan_name, value, status, start_date, next_payment, created_at, updated_at, asaas_id, clients(name, email, phone)')
        .single();

      if (error) throw error;
      const updated = data as Subscription;
      setRawSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
      toast.success('Assinatura atualizada com sucesso!');
      return updated;
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
      setRawSubscriptions((prev) => prev.filter((s) => s.id !== id));
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
      setRawPayments((prev) => prev.filter((p) => p.id !== id));
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
        .select('id, payment_id, client_id, number, amount, status, description, issued_at')
        .single();

      if (error) throw error;
      const created = data as Invoice;
      setRawInvoices((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      toast.success('Nota fiscal emitida com sucesso!');
      return created;
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
      setRawInvoices((prev) => prev.filter((i) => i.id !== id));
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

  const updateAppSettings = async (updates: Partial<AppSettings>): Promise<boolean> => {
    try {
      let result;
      if (!appSettings?.id) {
        const { data, error } = await supabase
          .from('app_settings')
          .insert({
            pro_labore_mode: updates.pro_labore_mode ?? 'percent',
            pro_labore_percent: updates.pro_labore_percent ?? 30,
            pro_labore_fixed: updates.pro_labore_fixed ?? 0
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const safeUpdates = { ...updates };
        delete (safeUpdates as any).id;
        delete (safeUpdates as any).created_at;
        delete (safeUpdates as any).updated_at;

        const { data, error } = await supabase
          .from('app_settings')
          .update(safeUpdates)
          .eq('id', appSettings.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      setAppSettings(result);
      toast.success('Configurações atualizadas com sucesso!');
      return true;
    } catch (error: any) {
      console.error('Error updating app settings:', error);
      toast.error('Erro ao salvar configurações');
      return false;
    }
  };

  // Debounce timers for realtime events to prevent database overload
  const debounceTimers = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});

  const debouncedFetch = useCallback((key: string, fetchFn: () => Promise<void>) => {
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(() => {
      void fetchFn();
    }, 1200);
  }, []);

  // Initialize and set up a single multiplexed realtime channel ONLY when admin is authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      setClients([]);
      setRawSubscriptions([]);
      setRawPayments([]);
      setRawInvoices([]);
      setWhatsappTemplates([]);
      setWhatsappSettings(null);
      setAppSettings(null);
      setLoadingClients(false);
      setLoadingSubscriptions(false);
      setLoadingPayments(false);
      setLoadingInvoices(false);
      setLoadingTemplates(false);
      setLoadingAppSettings(false);
      return;
    }

    void refetchAll();

    const adminSyncChannel = supabase
      .channel('global-admin-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => debouncedFetch('clients', fetchClients))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => debouncedFetch('subscriptions', fetchSubscriptions))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => debouncedFetch('payments', fetchPayments))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => debouncedFetch('invoices', fetchInvoices))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_templates' }, () => debouncedFetch('whatsapp', fetchWhatsApp))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => debouncedFetch('appSettings', fetchAppSettings))
      .subscribe();

    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      supabase.removeChannel(adminSyncChannel);
    };
  }, [isAuthenticated, refetchAll, debouncedFetch, fetchClients, fetchSubscriptions, fetchPayments, fetchInvoices, fetchWhatsApp, fetchAppSettings]);

  return (
    <GlobalDataContext.Provider
      value={{
        clients,
        subscriptions,
        payments,
        invoices,
        whatsappTemplates,
        whatsappSettings,
        appSettings,
        loadingClients,
        loadingSubscriptions,
        loadingPayments,
        loadingInvoices,
        loadingTemplates,
        loadingAppSettings,
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
        updateAppSettings,
      }}
    >
      {children}
    </GlobalDataContext.Provider>
  );
};

export const useOptionalGlobalData = () => {
  return useContext(GlobalDataContext);
};

export const useGlobalData = () => {
  const context = useContext(GlobalDataContext);
  if (context === undefined) {
    throw new Error('useGlobalData must be used within a GlobalDataProvider');
  }
  return context;
};
