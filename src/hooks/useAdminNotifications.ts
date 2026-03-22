import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Função para tocar som de notificação
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Som agradável tipo "ding-dong"
    oscillator.frequency.setValueAtTime(830, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.15);
    
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.type = 'sine';
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (error) {
    console.log('Não foi possível tocar som de notificação:', error);
  }
};

// Solicitar permissão para notificações push web
const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log('Este navegador não suporta notificações web');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
};

// Função para exibir notificação push web
const showWebPushNotification = async (title: string, message: string, category: string) => {
  const hasPermission = await requestNotificationPermission();
  
  if (!hasPermission) return;
  
  const categoryIcons: Record<string, string> = {
    implementations: '🚀',
    referrals: '🎁',
    affiliates: '👥',
    payments: '💰'
  };
  
  const icon = categoryIcons[category] || '🔔';
  
  try {
    const notification = new Notification(`${icon} ${title}`, {
      body: message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `admin-notification-${Date.now()}`,
      requireInteraction: false,
      silent: false // permite que o sistema toque seu próprio som
    });
    
    // Fechar automaticamente após 5 segundos
    setTimeout(() => notification.close(), 5000);
    
    // Focar na janela quando clicar na notificação
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.log('Erro ao exibir notificação push:', error);
  }
};

export interface AdminNotification {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export const useAdminNotifications = () => {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      const typedData = (data || []) as AdminNotification[];
      setNotifications(typedData);
      setUnreadCount(typedData.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching admin notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) throw error;
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('Todas notificações marcadas como lidas');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Erro ao marcar notificações');
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setNotifications(prev => {
        const notification = prev.find(n => n.id === id);
        if (notification && !notification.is_read) {
          setUnreadCount(c => Math.max(0, c - 1));
        }
        return prev.filter(n => n.id !== id);
      });
      toast.success('Notificação removida');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Erro ao remover notificação');
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      
      setNotifications([]);
      setUnreadCount(0);
      toast.success('Todas notificações removidas');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Erro ao limpar notificações');
    }
  }, []);

  // Show toast for new notifications
  const showNewNotificationToast = useCallback((notification: AdminNotification) => {
    const categoryIcons: Record<string, string> = {
      implementations: '🚀',
      referrals: '🎁',
      affiliates: '👥',
      payments: '💰'
    };
    
    const icon = categoryIcons[notification.category] || '🔔';
    
    toast(notification.title, {
      description: notification.message,
      icon: icon,
      duration: 5000,
      action: {
        label: 'Ver',
        onClick: () => {
          markAsRead(notification.id);
        }
      }
    });
  }, [markAsRead]);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('admin-notifications-realtime')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'admin_notifications' 
        },
        (payload) => {
          const newNotification = payload.new as AdminNotification;
          setNotifications(prev => [newNotification, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Tocar som de notificação
          playNotificationSound();
          
          // Exibir notificação push web nativa
          showWebPushNotification(
            newNotification.title,
            newNotification.message,
            newNotification.category
          );
          
          showNewNotificationToast(newNotification);
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'DELETE', 
          schema: 'public', 
          table: 'admin_notifications' 
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setNotifications(prev => prev.filter(n => n.id !== deletedId));
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'admin_notifications' 
        },
        (payload) => {
          const updated = payload.new as AdminNotification;
          setNotifications(prev => 
            prev.map(n => n.id === updated.id ? updated : n)
          );
          // Recalculate unread count
          setNotifications(prev => {
            setUnreadCount(prev.filter(n => !n.is_read).length);
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, showNewNotificationToast]);

  return {
    notifications,
    loading,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  };
};
