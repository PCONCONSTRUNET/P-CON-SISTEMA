import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  MessageCircle,
  CheckCircle,
  AlertCircle,
  Clock,
  X,
  Trash,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatBrazilDate } from '@/utils/dateUtils';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface WhatsAppMessage {
  id: string;
  phone: string;
  message: string;
  message_type: string;
  status: string;
  created_at: string;
  status_updated_at: string | null;
  error_message: string | null;
  btzap_message_id: string | null;
  client_id: string | null;
  remote_jid?: string | null;
  updated_at?: string;
}

const statusConfig: Record<string, { icon: typeof CheckCircle; label: string; color: string; bgColor: string }> = {
  sent: {
    icon: Clock,
    label: 'Enviado',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
  },
  delivered: {
    icon: CheckCircle,
    label: 'Entregue',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
  },
  read: {
    icon: CheckCircle,
    label: 'Lido',
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
  },
  failed: {
    icon: AlertCircle,
    label: 'Falha',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 border-destructive/30',
  },
};

const messageTypeConfig: Record<string, { label: string; color: string }> = {
  'subscription_date_change': {
    label: 'Lembrete de Vencimento',
    color: 'bg-amber-500/20 text-amber-700',
  },
  'payment_confirmed': {
    label: 'Confirmação de Pagamento',
    color: 'bg-emerald-500/20 text-emerald-700',
  },
  'payment_confirmed_auto': {
    label: 'Confirmação Automática',
    color: 'bg-emerald-500/20 text-emerald-700',
  },
  'overdue_reminder': {
    label: 'Aviso de Atraso',
    color: 'bg-red-500/20 text-red-700',
  },
  'manual': {
    label: 'Manual',
    color: 'bg-gray-500/20 text-gray-700',
  },
};

export default function WhatsAppMessages() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  useEffect(() => {
    fetchMessages();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('whatsapp_messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => [payload.new as WhatsAppMessage, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === (payload.new as WhatsAppMessage).id
                  ? (payload.new as WhatsAppMessage)
                  : msg
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch =
      msg.phone.includes(search) ||
      msg.message.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter.length === 0 || statusFilter.includes(msg.status);
    const matchesType =
      typeFilter.length === 0 || typeFilter.includes(msg.message_type);

    return matchesSearch && matchesStatus && matchesType;
  });

  const stats = {
    total: messages.length,
    sent: messages.filter((m) => m.status === 'sent').length,
    delivered: messages.filter((m) => m.status === 'delivered').length,
    read: messages.filter((m) => m.status === 'read').length,
    failed: messages.filter((m) => m.status === 'failed').length,
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilter((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const clearFilters = () => {
    setStatusFilter([]);
    setTypeFilter([]);
  };

  const clearAllMessages = async () => {
    try {
      const { error } = await supabase
        .from('whatsapp_messages')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      setMessages([]);
      toast.success('Histórico de mensagens limpo com sucesso!');
    } catch (error) {
      console.error('Error clearing messages:', error);
      toast.error('Erro ao limpar mensagens.');
    }
  };

  return (
    <DashboardLayout
      title="Mensagens WhatsApp"
      subtitle="Histórico de mensagens automáticas enviadas"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone ou mensagem..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>

        <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-11 gap-2 border-border/50 bg-secondary/50"
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filtros</span>
              {(statusFilter.length > 0 || typeFilter.length > 0) && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                  {statusFilter.length + typeFilter.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              Filtrar por
              {(statusFilter.length > 0 || typeFilter.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={clearFilters}
                >
                  <X className="w-3 h-3 mr-1" />
                  Limpar
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Status
            </DropdownMenuLabel>
            {Object.entries(statusConfig).map(([key, config]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={statusFilter.includes(key)}
                onCheckedChange={() => toggleStatusFilter(key)}
              >
                <config.icon className={cn('w-4 h-4 mr-2', config.color)} />
                {config.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Tipo
            </DropdownMenuLabel>
            {Object.entries(messageTypeConfig).map(([key]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={typeFilter.includes(key)}
                onCheckedChange={() => toggleTypeFilter(key)}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                {messageTypeConfig[key].label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

          {messages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 sm:h-11 gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  <Trash className="w-4 h-4" />
                  <span className="hidden sm:inline">Limpar</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar histórico de mensagens?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá apagar permanentemente todas as {messages.length} mensagens do histórico. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearAllMessages}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Limpar tudo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-foreground">
            {stats.total}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-blue-500">
            {stats.sent}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Enviado</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-emerald-500">
            {stats.delivered}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Entregue</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-primary">
            {stats.read}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Lido</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-destructive">
            {stats.failed}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Falha</p>
        </div>
      </div>

      {/* Messages List */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Carregando mensagens...</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filteredMessages.map((message) => {
            const statusCfg = statusConfig[message.status] || statusConfig.sent;
            const typeCfg =
              messageTypeConfig[message.message_type] ||
              messageTypeConfig.manual;
            const StatusIcon = statusCfg.icon;

            return (
              <div
                key={message.id}
                className="glass-card p-3 sm:p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg flex-shrink-0 bg-primary/10">
                      <StatusIcon className={cn('w-4 h-4', statusCfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm sm:text-base text-foreground break-all">
                        {message.phone}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {formatBrazilDate(
                          message.created_at,
                          'dd/MM/yyyy HH:mm:ss'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={typeCfg.color} variant="secondary">
                      {typeCfg.label}
                    </Badge>
                    <Badge variant="outline" className={statusCfg.bgColor}>
                      {statusCfg.label}
                    </Badge>
                  </div>
                </div>

                {/* Message Content */}
                <div className="ml-11 sm:ml-14">
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                    {message.message}
                  </p>
                </div>

                {/* Error Message (if failed) */}
                {message.status === 'failed' && message.error_message && (
                  <div className="ml-11 sm:ml-14 p-2 sm:p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-xs text-destructive font-medium">
                      Erro:
                    </p>
                    <p className="text-xs text-destructive/80">
                      {message.error_message}
                    </p>
                  </div>
                )}

                {/* Footer Info */}
                <div className="ml-11 sm:ml-14 flex flex-wrap items-center gap-3 text-[10px] sm:text-xs text-muted-foreground">
                  {message.status_updated_at && (
                    <span>
                      Status atualizado:{' '}
                      {formatBrazilDate(
                        message.status_updated_at,
                        'dd/MM/yyyy HH:mm'
                      )}
                    </span>
                  )}
                  {message.btzap_message_id && (
                    <span className="font-mono bg-secondary/50 px-2 py-1 rounded">
                      ID: {message.btzap_message_id.slice(0, 12)}...
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filteredMessages.length === 0 && (
        <div className="glass-card p-8 sm:p-12 text-center">
          <MessageCircle className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-2">
            {messages.length === 0
              ? 'Nenhuma mensagem'
              : 'Nenhum resultado encontrado'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {messages.length === 0
              ? 'As mensagens WhatsApp enviadas aparecerão aqui.'
              : 'Tente ajustar os filtros ou termo de busca.'}
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
