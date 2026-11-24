import { useState, useEffect, useRef } from 'react';
import { Wallet, Key, Shield, CheckCircle2, AlertTriangle, Loader2, Save, Eye, EyeOff, Copy, ExternalLink, Power, PowerOff } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { notifyMercadoPagoGatewayStatusChanged } from '@/hooks/useMercadoPago';
import { toast } from 'sonner';

interface MercadoPagoFormSettings {
  public_key: string;
  access_token: string;
  webhook_token: string;
  is_active: boolean;
  updated_at?: string;
}

const MercadoPagoSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<MercadoPagoFormSettings>({
    public_key: '',
    access_token: '',
    webhook_token: '',
    is_active: false,
  });
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const loadedRef = useRef(false);

  const isConfigured = !!settings.access_token.trim();

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke('mercadopago', {
          body: { _action: 'get-settings' },
        });

        if (data?.success && data?.settings) {
          setSettings({
            public_key: data.settings.public_key || '',
            access_token: data.settings.access_token || '',
            webhook_token: data.settings.webhook_token || '',
            is_active: !!data.settings.is_active,
            updated_at: data.settings.updated_at,
          });
        }
      } catch (e) {
        console.error('[MercadoPagoSettings] fetch error:', e);
      } finally {
        setLoading(false);
      }
    };

    void fetchSettings();
  }, []);

  const handleToggleActive = async (nextActive: boolean) => {
    if (nextActive && !isConfigured) {
      toast.error('Informe e salve o Access Token antes de ativar o gateway Mercado Pago.');
      return;
    }

    setToggling(true);
    try {
      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: {
          _action: 'save-settings',
          public_key: settings.public_key.trim(),
          access_token: settings.access_token.trim(),
          webhook_token: settings.webhook_token.trim(),
          is_active: nextActive,
        },
      });

      if (error) {
        let errMsg = error.message || 'Erro ao alterar status do gateway';
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          try {
            const body = await ctx.json();
            errMsg = body?.error || errMsg;
          } catch {
            /* ignore parse error */
          }
        }
        throw new Error(errMsg);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro desconhecido ao atualizar status');
      }

      const appliedActive = data.is_active !== undefined ? !!data.is_active : nextActive;
      const updatedAt = data.updated_at || new Date().toISOString();

      setSettings(prev => ({
        ...prev,
        is_active: appliedActive,
        updated_at: updatedAt,
      }));
      notifyMercadoPagoGatewayStatusChanged({
        isActive: appliedActive && isConfigured,
        configured: isConfigured,
        publicKey: settings.public_key.trim() || null,
      });

      toast.success(
        appliedActive
          ? 'Gateway Mercado Pago ativado! Pagamentos liberados no sistema.'
          : 'Gateway Mercado Pago desativado! Cobranças por este gateway foram bloqueadas.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tente novamente';
      console.error('[MercadoPagoSettings] toggle error:', err);
      toast.error('Erro ao alterar gateway: ' + msg);
    } finally {
      setToggling(false);
    }
  };

  const handleSave = async () => {
    if (!settings.access_token.trim()) {
      toast.error('Preencha o Access Token do Mercado Pago');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: {
          _action: 'save-settings',
          public_key: settings.public_key.trim(),
          access_token: settings.access_token.trim(),
          webhook_token: settings.webhook_token.trim(),
          is_active: settings.is_active,
        },
      });

      if (error) throw error;
      if (data?.success) {
        const appliedActive = data.is_active !== undefined ? !!data.is_active : settings.is_active;
        toast.success('Configurações do Mercado Pago salvas com sucesso!');
        setSettings(prev => ({
          ...prev,
          is_active: appliedActive,
          updated_at: data.updated_at || new Date().toISOString(),
        }));
        notifyMercadoPagoGatewayStatusChanged({
          isActive: appliedActive && isConfigured,
          configured: isConfigured,
        });
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tente novamente';
      console.error('[MercadoPagoSettings] save error:', err);
      toast.error('Erro ao salvar: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.access_token.trim()) {
      toast.error('Salve as configurações com o Access Token antes de testar');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('mercadopago', {
        body: { _action: 'test-connection' },
      });

      let errMsg = (data as { error?: string } | null)?.error || '';
      if (!errMsg && error) {
        errMsg = error.message || '';
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          try {
            const body = await ctx.json();
            errMsg = body?.error || body?.message || errMsg;
          } catch {
            /* ignore parse errors */
          }
        }
      }

      if (data?.success) {
        setTestResult({
          success: true,
          message: data.message || 'Conexão com Mercado Pago estabelecida com sucesso!',
        });
        toast.success('Conexão Mercado Pago OK!');
      } else {
        setTestResult({
          success: false,
          message: errMsg || 'Falha na autenticação com Mercado Pago',
        });
        toast.error('Falha ao conectar com Mercado Pago');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao testar conexão';
      setTestResult({ success: false, message: msg });
      toast.error('Erro ao testar conexão');
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://[SEU-PROJETO].supabase.co'}/functions/v1/mercadopago-webhook`;

  if (loading) {
    return (
      <DashboardLayout title="Mercado Pago">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Mercado Pago">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-7 h-7 text-primary" />
            Configurações Mercado Pago
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure as credenciais do Mercado Pago para processar pagamentos via PIX e Checkout
          </p>
        </div>

        {/* Status Card */}
        <Card className="glass-card border-border/50">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                {settings.is_active && isConfigured ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : !settings.is_active ? (
                  <PowerOff className="w-5 h-5 text-red-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                )}
                Status da Integração
              </CardTitle>
              <CardDescription>
                {settings.is_active
                  ? 'Gateway ativo: cobranças via Mercado Pago estão liberadas no sistema.'
                  : 'Gateway desativado: cobranças via Mercado Pago estão bloqueadas.'}
              </CardDescription>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-2.5 self-start sm:self-auto">
              <div className="flex items-center gap-2">
                {settings.is_active ? (
                  <Power className="w-4 h-4 text-green-400" />
                ) : (
                  <PowerOff className="w-4 h-4 text-red-400" />
                )}
                <span className="text-sm font-medium">
                  {settings.is_active ? 'Gateway Ativo' : 'Gateway Desativado'}
                </span>
              </div>
              {toggling ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <Switch
                  id="mercadopago-gateway-toggle"
                  checked={settings.is_active}
                  onCheckedChange={handleToggleActive}
                  disabled={toggling || saving}
                  aria-label="Ativar ou desativar gateway Mercado Pago"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className={settings.is_active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                Gateway {settings.is_active ? 'Ativo' : 'Desativado'}
              </Badge>
              <Badge className={settings.access_token ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                Access Token {settings.access_token ? '✓' : '✗'}
              </Badge>
              <Badge className={settings.public_key ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-secondary/60 text-muted-foreground border-border/40'}>
                Public Key {settings.public_key ? '✓' : 'Opcional'}
              </Badge>
              <Badge className={settings.webhook_token ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-secondary/60 text-muted-foreground border-border/40'}>
                Webhook Secret {settings.webhook_token ? '✓' : 'Opcional'}
              </Badge>
            </div>

            {!settings.is_active && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                <PowerOff className="w-4 h-4 flex-shrink-0" />
                <span>
                  Enquanto desativado, o Mercado Pago não processará novos pagamentos. Ative-o quando quiser utilizá-lo como gateway ativo.
                </span>
              </div>
            )}

            {settings.updated_at && (
              <p className="text-xs text-muted-foreground">
                Última atualização: {new Date(settings.updated_at).toLocaleString('pt-BR')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Credentials */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Credenciais de Produção
            </CardTitle>
            <CardDescription>
              Obtidas no painel Mercado Pago Developers em: <strong>Suas integrações → Credenciais de produção</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Access Token *</label>
              <div className="relative">
                <Input
                  id="mp-access-token"
                  type={showAccessToken ? 'text' : 'password'}
                  placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxx"
                  value={settings.access_token}
                  onChange={(e) => setSettings(prev => ({ ...prev, access_token: e.target.value }))}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAccessToken(!showAccessToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Public Key (Opcional)</label>
              <Input
                id="mp-public-key"
                placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={settings.public_key}
                onChange={(e) => setSettings(prev => ({ ...prev, public_key: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Assinatura Secreta do Webhook (Opcional)</label>
              <div className="relative">
                <Input
                  id="mp-webhook-token"
                  type={showWebhookToken ? 'text' : 'password'}
                  placeholder="Chave secreta configurada no painel de Webhooks"
                  value={settings.webhook_token}
                  onChange={(e) => setSettings(prev => ({ ...prev, webhook_token: e.target.value }))}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookToken(!showWebhookToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showWebhookToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-primary" />
              URL do Webhook
            </CardTitle>
            <CardDescription>
              Cadastre esta URL no painel do Mercado Pago (em <strong>Webhooks → Configurar notificações</strong>) marcando o evento <strong>Pagamentos</strong> para confirmação automática.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-secondary/30 rounded-lg p-4 flex items-center justify-between gap-3">
              <code className="text-xs text-primary/80 break-all font-mono">
                {webhookUrl}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada!'); }}
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Test result */}
        {testResult && (
          <Card className={`border ${testResult.success ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
            <CardContent className="p-4 flex items-center gap-3">
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <p className="text-sm">{testResult.message}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <Button onClick={handleSave} disabled={saving} className="gap-2 flex-1 sm:flex-none">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !settings.access_token}
            className="gap-2 border-border/50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {testing ? 'Testando...' : 'Testar Conexão'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MercadoPagoSettings;
