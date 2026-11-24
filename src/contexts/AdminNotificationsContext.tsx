import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

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

const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
};

const showWebPushNotification = async (title: string, message: string, category: string) => {
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const categoryIcons: Record<string, string> = {
    referrals: '🎁',
    affiliates: '👥',
    payments: '💰',
  };

  const icon = categoryIcons[category] || '🔔';

  try {
    const notification = new Notification(`${icon} ${title}`, {
      body: message,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `admin-notification-${Date.now()}`,
      requireInteraction: false,
      silent: false,
    });

    setTimeout(() => notification.close(), 5000);
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

interface AdminNotificationsContextType {
  notifications: AdminNotification[];
  loading: boolean;
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const AdminNotificationsContext = createContext<AdminNotificationsContextType | undefined>(undefined);

export const AdminNotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const inFlightRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading((prev) => prev || notifications.length === 0);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('admin_notifications')
        .select('id, type, category, title, message, metadata, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const typedData = (data || []) as AdminNotification[];
      setNotifications(typedData);
      setUnreadCount(typedData.filter((n) => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching admin notifications:', error);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [isAuthenticated, notifications.length]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) throw error;

      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(next.filter((n) => !n.is_read).length);
        return next;
      });
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

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
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

      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== id);
        setUnreadCount(next.filter((n) => !n.is_read).length);
        return next;
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
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;

      setNotifications([]);
      setUnreadCount(0);
      toast.success('Todas notificações removidas');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Erro ao limpar notificações');
    }
  }, []);

  const showNewNotificationToast = useCallback(
    (notification: AdminNotification) => {
      const categoryIcons: Record<string, string> = {
        referrals: '🎁',
        affiliates: '👥',
        payments: '💰',
      };

      const icon = categoryIcons[notification.category] || '🔔';

      toast(notification.title, {
        description: notification.message,
        icon,
        duration: 5000,
        action: {
          label: 'Ver',
          onClick: () => {
            void markAsRead(notification.id);
          },
        },
      });
    },
    [markAsRead],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    void fetchNotifications();

    const channel = supabase
      .channel('admin-notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const newNotification = payload.new as AdminNotification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === newNotification.id)) return prev;
            const next = [newNotification, ...prev].slice(0, 100);
            setUnreadCount(next.filter((n) => !n.is_read).length);
            return next;
          });

          playNotificationSound();
          void showWebPushNotification(
            newNotification.title,
            newNotification.message,
            newNotification.category,
          );
          showNewNotificationToast(newNotification);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setNotifications((prev) => {
            const next = prev.filter((n) => n.id !== deletedId);
            setUnreadCount(next.filter((n) => !n.is_read).length);
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'admin_notifications' },
        (payload) => {
          const updated = payload.new as AdminNotification;
          setNotifications((prev) => {
            const next = prev.map((n) => (n.id === updated.id ? updated : n));
            setUnreadCount(next.filter((n) => !n.is_read).length);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, showNewNotificationToast]);

  return (
    <AdminNotificationsContext.Provider
      value={{
        notifications,
        loading,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
      }}
    >
      {children}
    </AdminNotificationsContext.Provider>
  );
};

export const useAdminNotificationsContext = () => {
  const ctx = useContext(AdminNotificationsContext);
  if (!ctx) {
    throw new Error('useAdminNotifications must be used within an AdminNotificationsProvider');
  }
  return ctx;
};
