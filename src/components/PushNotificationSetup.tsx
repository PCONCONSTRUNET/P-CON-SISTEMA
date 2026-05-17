/**
 * PushNotificationSetup.tsx
 * Painel de configuração de notificações push via OneSignal.
 */

import { Bell, BellOff, BellRing, Loader2, Smartphone, Shield, Zap, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';

export const PushNotificationSetup = () => {
  const {
    isSupported,
    isInitialized,
    isSubscribed,
    permission,
    isLoading,
    enablePushNotifications,
    disablePushNotifications,
    sendTestNotification,
  } = usePushNotifications();

  // ── Sem App ID configurado ───────────────────────────────
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
  const appIdMissing = !appId || appId === 'SEU_APP_ID_AQUI';
  if (appIdMissing) {
    return (
      <div className="glass-card p-4 sm:p-5 border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/15 flex-shrink-0">
            <Bell className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground mb-0.5">Notificações Push — OneSignal</p>
            <p className="text-xs text-muted-foreground mb-3">
              Configure o <code className="text-amber-400">VITE_ONESIGNAL_APP_ID</code> no arquivo <code className="text-amber-400">.env</code> para ativar.
            </p>
            <a
              href="https://app.onesignal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Criar app no OneSignal
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Navegador sem suporte ─────────────────────────────────
  if (!isSupported) {
    return (
      <div className="glass-card p-4 sm:p-5 border border-border/30">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-muted/30 flex-shrink-0">
            <BellOff className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">Notificações Push</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seu navegador não suporta notificações push. Use Chrome, Edge ou Firefox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Badge de status ───────────────────────────────────────
  const statusBadge = isLoading || !isInitialized
    ? { label: 'Inicializando...', cls: 'border-border/40 text-muted-foreground' }
    : isSubscribed
    ? { label: 'Ativo', cls: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' }
    : permission === 'denied'
    ? { label: 'Bloqueado', cls: 'border-destructive/40 text-destructive bg-destructive/10' }
    : { label: 'Inativo', cls: 'border-border/40 text-muted-foreground' };

  return (
    <div className={cn(
      'glass-card p-4 sm:p-5 border transition-all duration-300',
      isSubscribed
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : permission === 'denied'
        ? 'border-destructive/20'
        : 'border-border/30'
    )}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cn(
          'p-2.5 rounded-xl flex-shrink-0 transition-colors',
          isSubscribed ? 'bg-emerald-500/15' : 'bg-primary/10'
        )}>
          {isSubscribed
            ? <BellRing className="w-5 h-5 text-emerald-400" />
            : <Bell className="w-5 h-5 text-primary" />
          }
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="font-semibold text-sm text-foreground">Notificações Push</p>
            <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', statusBadge.cls)}>
              {statusBadge.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {isSubscribed
              ? 'Alertas ativos — mesmo com o app em segundo plano.'
              : 'Receba alertas de pagamentos, indicações e implantações.'}
          </p>
        </div>
      </div>

      {/* ── Feature cards (só exibe quando inativo) ──────── */}
      {!isSubscribed && permission !== 'denied' && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { icon: Zap,        label: 'Tempo real', desc: 'Alertas instantâneos' },
            { icon: Smartphone, label: 'Mobile',     desc: 'Android & iOS (PWA)' },
            { icon: Shield,     label: 'Seguro',     desc: 'Só para o admin'      },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-secondary/30 rounded-lg p-2 text-center">
              <Icon className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-[10px] font-medium text-foreground">{label}</p>
              <p className="text-[9px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Bloqueado: instruções ────────────────────────── */}
      {permission === 'denied' && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
          <p className="text-xs text-destructive font-medium mb-1">Notificações bloqueadas no navegador</p>
          <p className="text-[11px] text-muted-foreground">
            Clique no cadeado 🔒 na barra de endereço → <strong>Notificações</strong> → <strong>Permitir</strong> e recarregue a página.
          </p>
        </div>
      )}

      {/* ── Ações ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {!isSubscribed ? (
          <Button
            id="push-enable-btn"
            size="sm"
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={enablePushNotifications}
            disabled={isLoading || !isInitialized || permission === 'denied'}
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Bell className="w-4 h-4" />
            }
            {isLoading ? 'Ativando...' : !isInitialized ? 'Aguarde...' : 'Ativar Notificações'}
          </Button>
        ) : (
          <>
            <Button
              id="push-test-btn"
              size="sm"
              variant="outline"
              className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              onClick={sendTestNotification}
              disabled={isLoading}
            >
              <BellRing className="w-4 h-4" />
              Testar
            </Button>
            <Button
              id="push-disable-btn"
              size="sm"
              variant="ghost"
              className="gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={disablePushNotifications}
              disabled={isLoading}
            >
              {isLoading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <BellOff className="w-4 h-4" />
              }
              Desativar
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PushNotificationSetup;
