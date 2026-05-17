/**
 * usePushNotifications.ts
 * Hook para integração com OneSignal no admin P-CON.
 *
 * Responsável por:
 * - Inicializar o SDK do OneSignal (uma única vez)
 * - Solicitar permissão e realizar opt-in
 * - Identificar o usuário como 'admin-user'
 * - Expor estado e ações para o componente de UI
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import OneSignal from 'react-onesignal';
import { toast } from 'sonner';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';
const ONESIGNAL_SAFARI_WEB_ID = import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID || '';

export type PushPermissionStatus = 'loading' | 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushNotificationState {
  isSupported: boolean;
  isInitialized: boolean;
  isSubscribed: boolean;
  permission: PushPermissionStatus;
  isLoading: boolean;
  userId: string | null;
}

export const usePushNotifications = () => {
  const initialized = useRef(false);

  const [state, setState] = useState<PushNotificationState>({
    isSupported: 'Notification' in window && 'serviceWorker' in navigator,
    isInitialized: false,
    isSubscribed: false,
    permission: 'loading',
    isLoading: false,
    userId: null,
  });

  // ─── Sincronizar estado com OneSignal ──────────────────────
  const syncState = useCallback(async () => {
    try {
      const permission = Notification.permission as NotificationPermission;
      const isSubscribed = await OneSignal.User.PushSubscription.optedIn;
      const userId = OneSignal.User.PushSubscription.id ?? null;

      setState(prev => ({
        ...prev,
        isSubscribed: !!isSubscribed,
        permission: permission as PushPermissionStatus,
        userId: userId,
      }));
    } catch {
      // SDK pode não estar pronto ainda — silencioso
    }
  }, []);

  // ─── Inicialização (uma única vez por sessão) ─────────────
  useEffect(() => {
    if (initialized.current || !ONESIGNAL_APP_ID) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState(prev => ({ ...prev, permission: 'unsupported', isSupported: false }));
      return;
    }

    initialized.current = true;

    const init = async () => {
      setState(prev => ({ ...prev, isLoading: true }));

      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
          allowLocalhostAsSecureOrigin: true,
          notifyButton: { enable: false }, // usamos nosso próprio UI
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  type: 'push',
                  autoPrompt: false,
                  text: {
                    actionMessage: 'Receba alertas de pagamentos, indicações e implantações em tempo real.',
                    acceptButton: 'Ativar',
                    cancelButton: 'Agora não',
                  },
                },
              ],
            },
          },
        });

        // Identificar como admin
        await OneSignal.login('admin-user');

        setState(prev => ({ ...prev, isInitialized: true, isLoading: false }));
        await syncState();

        // Listener de mudança de inscrição
        OneSignal.User.PushSubscription.addEventListener('change', () => {
          syncState();
        });
      } catch (error) {
        console.error('[OneSignal] Erro na inicialização:', error);
        setState(prev => ({ ...prev, isLoading: false, isInitialized: false }));
      }
    };

    init();
  }, [syncState]);

  // ─── Ativar Notificações ──────────────────────────────────
  const enablePushNotifications = useCallback(async () => {
    if (!state.isInitialized) {
      toast.error('OneSignal ainda não foi inicializado. Tente novamente.');
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Solicita permissão nativa do browser
      await OneSignal.Notifications.requestPermission();

      const permission = Notification.permission;

      if (permission === 'granted') {
        await OneSignal.User.PushSubscription.optIn();
        await syncState();

        toast.success('🔔 Notificações push ativadas!', {
          description: 'Você receberá alertas mesmo com o app em segundo plano.',
        });

        setState(prev => ({ ...prev, isLoading: false }));
        return true;
      } else {
        toast.error(
          permission === 'denied'
            ? 'Notificações bloqueadas no navegador. Clique no cadeado 🔒 para desbloquear.'
            : 'Permissão recusada.'
        );
        setState(prev => ({
          ...prev,
          isLoading: false,
          permission: permission as PushPermissionStatus,
        }));
        return false;
      }
    } catch (error) {
      console.error('[OneSignal] Erro ao ativar:', error);
      toast.error('Erro ao ativar notificações.');
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [state.isInitialized, syncState]);

  // ─── Desativar Notificações ───────────────────────────────
  const disablePushNotifications = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await OneSignal.User.PushSubscription.optOut();
      await syncState();
      toast.success('Notificações push desativadas.');
    } catch (error) {
      console.error('[OneSignal] Erro ao desativar:', error);
      toast.error('Erro ao desativar notificações.');
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [syncState]);

  // ─── Teste de notificação local ───────────────────────────
  const sendTestNotification = useCallback(async () => {
    if (Notification.permission !== 'granted') {
      toast.error('Ative as notificações primeiro.');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('🔔 P-CON Admin — Teste', {
        body: 'Notificações funcionando corretamente!',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'pcon-test-' + Date.now(),
        data: { url: '/notifications' },
      } as NotificationOptions);
      toast.success('Notificação de teste enviada!');
    } catch {
      // Fallback para Notification API
      try {
        new Notification('🔔 P-CON Admin — Teste', {
          body: 'Notificações funcionando corretamente!',
          icon: '/pwa-192x192.png',
        });
        toast.success('Notificação de teste enviada!');
      } catch (e) {
        toast.error('Erro ao enviar notificação de teste.');
      }
    }
  }, []);

  return {
    ...state,
    enablePushNotifications,
    disablePushNotifications,
    sendTestNotification,
  };
};
