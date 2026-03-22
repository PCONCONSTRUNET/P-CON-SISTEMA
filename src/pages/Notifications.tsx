import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  Bell, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Trash2, 
  X,
  Rocket,
  Gift,
  
  CreditCard,
  CheckCheck,
  Trash,
  Eye
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminNotifications, AdminNotification } from '@/hooks/useAdminNotifications';
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
} from "@/components/ui/alert-dialog";

const categoryConfig: Record<string, { icon: typeof Rocket; label: string; bgClass: string; iconClass: string }> = {
  implementations: {
    icon: Rocket,
    label: 'Implantações',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
  },
  referrals: {
    icon: Gift,
    label: 'Indicações',
    bgClass: 'bg-amber-500/10',
    iconClass: 'text-amber-500',
  },
  payments: {
    icon: CreditCard,
    label: 'Pagamentos',
    bgClass: 'bg-emerald-500/10',
    iconClass: 'text-emerald-500',
  },
};

const typeConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  new_request: {
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
    label: 'Nova Solicitação',
  },
  new_lead: {
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
    label: 'Novo Lead',
  },
  payment_received: {
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    label: 'Pagamento',
  },
  payment_overdue: {
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
    label: 'Em Atraso',
  },
  payment_failed: {
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 border-destructive/30',
    label: 'Falha',
  },
};

const Notifications = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const { 
    notifications, 
    loading, 
    unreadCount,
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    clearAll 
  } = useAdminNotifications();

  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = 
      notification.title.toLowerCase().includes(search.toLowerCase()) ||
      notification.message.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory = categoryFilter.length === 0 || categoryFilter.includes(notification.category);
    const matchesUnread = !showUnreadOnly || !notification.is_read;
    
    return matchesSearch && matchesCategory && matchesUnread;
  });

  const toggleCategoryFilter = (category: string) => {
    setCategoryFilter(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const clearFilters = () => {
    setCategoryFilter([]);
    setShowUnreadOnly(false);
  };

  const handleNotificationClick = (notification: AdminNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    // Navigate based on category
    const metadata = notification.metadata as Record<string, unknown>;
    switch (notification.category) {
      case 'implementations':
        navigate('/implementations');
        break;
      case 'referrals':
        navigate('/referrals');
        break;
      case 'payments':
        if (metadata.payment_id) {
          navigate('/payments');
        }
        break;
    }
  };

  const stats = {
    total: notifications.length,
    unread: unreadCount,
    implementations: notifications.filter(n => n.category === 'implementations').length,
    referrals: notifications.filter(n => n.category === 'referrals').length,
    payments: notifications.filter(n => n.category === 'payments').length,
  };

  return (
    <DashboardLayout 
      title="Central de Notificações" 
      subtitle="Acompanhe todas as atividades do sistema"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar notificação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>
        
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 sm:h-11 gap-2 border-border/50 bg-secondary/50">
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filtros</span>
                {(categoryFilter.length > 0 || showUnreadOnly) && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                    {categoryFilter.length + (showUnreadOnly ? 1 : 0)}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center justify-between">
                Filtrar por
                {(categoryFilter.length > 0 || showUnreadOnly) && (
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
              <DropdownMenuCheckboxItem
                checked={showUnreadOnly}
                onCheckedChange={setShowUnreadOnly}
              >
                <Eye className="w-4 h-4 mr-2 text-primary" />
                Apenas não lidas
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Categorias</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={categoryFilter.includes('implementations')}
                onCheckedChange={() => toggleCategoryFilter('implementations')}
              >
                <Rocket className="w-4 h-4 mr-2 text-primary" />
                Implantações
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter.includes('referrals')}
                onCheckedChange={() => toggleCategoryFilter('referrals')}
              >
                <Gift className="w-4 h-4 mr-2 text-amber-500" />
                Indicações
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={categoryFilter.includes('payments')}
                onCheckedChange={() => toggleCategoryFilter('payments')}
              >
                <CreditCard className="w-4 h-4 mr-2 text-emerald-500" />
                Pagamentos
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-10 sm:h-11 gap-2 border-border/50 bg-secondary/50"
              onClick={markAllAsRead}
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Marcar lidas</span>
            </Button>
          )}

          {notifications.length > 0 && (
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
                  <AlertDialogTitle>Limpar todas as notificações?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Todas as {notifications.length} notificações serão removidas permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={clearAll}
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
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-destructive">{stats.unread}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Não lidas</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-primary">{stats.implementations}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Implant.</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-amber-500">{stats.referrals}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Indicações</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-emerald-500">{stats.payments}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Pagamentos</p>
        </div>
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Carregando notificações...</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filteredNotifications.map((notification) => {
            const catConfig = categoryConfig[notification.category] || categoryConfig.implementations;
            const tConfig = typeConfig[notification.type] || typeConfig.new_request;
            const Icon = catConfig.icon;
            
            return (
              <div 
                key={notification.id} 
                className={cn(
                  "glass-card glass-card-hover p-3 sm:p-4 flex items-start gap-3 sm:gap-4 cursor-pointer transition-all",
                  !notification.is_read && "border-l-4 border-l-primary bg-primary/5"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className={cn('p-2 sm:p-3 rounded-xl flex-shrink-0', catConfig.bgClass)}>
                  <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', catConfig.iconClass)} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className={cn(
                          "font-medium text-sm sm:text-base truncate",
                          !notification.is_read ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                    </div>
                    <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {formatBrazilDate(notification.created_at, "dd/MM HH:mm")}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge 
                        variant="outline" 
                        className={cn('text-[10px] sm:text-xs', catConfig.bgClass, catConfig.iconClass)}
                      >
                        {catConfig.label}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={cn('text-[10px] sm:text-xs border', tConfig.bgColor, tConfig.color)}
                      >
                        {tConfig.label}
                      </Badge>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filteredNotifications.length === 0 && (
        <div className="glass-card p-8 sm:p-12 text-center">
          <Bell className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-2">
            {notifications.length === 0 ? 'Nenhuma notificação' : 'Nenhum resultado encontrado'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {notifications.length === 0 
              ? 'As notificações aparecerão aqui quando houver novas atividades.'
              : 'Tente ajustar os filtros ou termo de busca.'}
          </p>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Notifications;
