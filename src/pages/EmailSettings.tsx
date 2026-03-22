import { useState, useEffect } from 'react';
import { Mail, Send, Loader2, Clock, CheckCircle2, AlertTriangle, Info, User, Search, Save, Power } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClientOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

const EmailSettings = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  // Manual send state
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [isSendingManual, setIsSendingManual] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Schedule settings
  const [reminderHour, setReminderHour] = useState('8');
  const [reminderMinute, setReminderMinute] = useState('0');
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, email, phone')
        .eq('status', 'active')
        .order('name');
      if (data) setClients(data);
    };

    const fetchSettings = async () => {
      const { data } = await supabase
        .from('email_settings')
        .select('setting_key, setting_value');
      if (data) {
        data.forEach((s: any) => {
          if (s.setting_key === 'reminder_hour') setReminderHour(s.setting_value);
          if (s.setting_key === 'reminder_minute') setReminderMinute(s.setting_value);
          if (s.setting_key === 'auto_send_enabled') setAutoSendEnabled(s.setting_value === 'true');
        });
        setSettingsLoaded(true);
      }
    };

    fetchClients();
    fetchSettings();
  }, []);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTestBillingEmail = async () => {
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('email-billing-reminder', {
        body: { forceRun: true },
      });
      if (error) { toast.error('Erro ao executar função de email'); return; }
      setLastResult(data);
      if (data?.success) {
        const r = data.results;
        r.emails_sent > 0
          ? toast.success(`${r.emails_sent} email(s) de cobrança enviado(s)!`)
          : toast.info('Nenhuma assinatura vencendo amanhã (D-1) encontrada.');
      } else {
        toast.error(data?.error || 'Erro ao processar emails');
      }
    } catch { toast.error('Erro ao testar envio de email'); }
    finally { setIsTesting(false); }
  };

  const handleManualSend = async () => {
    if (!selectedClient) { toast.error('Selecione um cliente'); return; }
    setIsSendingManual(true);
    setManualResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('email-billing-reminder', {
        body: { clientId: selectedClient.id },
      });
      if (error) { toast.error('Erro ao enviar email'); return; }
      setManualResult(data);
      if (data?.success) {
        toast.success(`Email enviado para ${data.results?.client_name || selectedClient.name}!`);
      } else {
        toast.error(data?.error || 'Erro ao enviar email');
      }
    } catch { toast.error('Erro ao enviar email manual'); }
    finally { setIsSendingManual(false); }
  };

  const handleSelectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setSearchTerm(client.name);
    setShowDropdown(false);
    setManualResult(null);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const updates = [
        { setting_key: 'reminder_hour', setting_value: reminderHour },
        { setting_key: 'reminder_minute', setting_value: reminderMinute },
        { setting_key: 'auto_send_enabled', setting_value: autoSendEnabled ? 'true' : 'false' },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('email_settings')
          .update({ setting_value: update.setting_value, updated_at: new Date().toISOString() })
          .eq('setting_key', update.setting_key);
        if (error) throw error;
      }

      toast.success('Configurações salvas com sucesso!');
    } catch {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i.toString());
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString());

  return (
    <DashboardLayout title="Email">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Mail className="w-7 h-7 text-primary" />
            Email
          </h1>
          <p className="text-muted-foreground mt-1">
            Configurações e envio de emails de cobrança
          </p>
        </div>

        {/* Domínio configurado */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Domínio de Envio
            </CardTitle>
            <CardDescription>Domínio verificado para envio de emails</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm px-3 py-1">cobranca@assinaturaspcon.sbs</Badge>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Verificado</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-3">DKIM, SPF e MX configurados via Resend + Vercel DNS.</p>
          </CardContent>
        </Card>

        {/* Envio Manual */}
        <Card className="glass-card border-border/50 overflow-visible relative z-20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Envio Manual
            </CardTitle>
            <CardDescription>Envie o email de cobrança para um cliente específico</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-visible">
            <div className="relative" style={{ zIndex: 60 }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                    if (!e.target.value) setSelectedClient(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="pl-10"
                />
              </div>

              {showDropdown && searchTerm.length >= 1 && !selectedClient && filteredClients.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredClients.slice(0, 8).map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectClient(client)}
                      className="w-full px-4 py-3 text-left hover:bg-secondary/50 transition-colors flex items-center gap-3 border-b border-border/30 last:border-0"
                    >
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && searchTerm.length >= 1 && !selectedClient && filteredClients.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg p-4">
                  <p className="text-sm text-muted-foreground text-center">Nenhum cliente encontrado</p>
                </div>
              )}
            </div>

            {selectedClient && (
              <div className="bg-secondary/30 rounded-lg p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{selectedClient.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedClient.email}</p>
                  </div>
                </div>
                <Button
                  onClick={handleManualSend}
                  disabled={isSendingManual}
                  size="sm"
                  className="gap-2 flex-shrink-0"
                >
                  {isSendingManual ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isSendingManual ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            )}

            {manualResult && (
              <div className={`rounded-lg p-4 ${manualResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
                <div className="flex items-center gap-2">
                  {manualResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                  )}
                  <p className="text-sm font-medium text-foreground">
                    {manualResult.success
                      ? `Email enviado com sucesso para ${manualResult.results?.client_email || selectedClient?.email}`
                      : manualResult.error || 'Erro ao enviar'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lembrete D-1 Automático */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Lembrete D-1 (Automático)
                </CardTitle>
                <CardDescription className="mt-1">
                  Email enviado automaticamente quando a assinatura é marcada como D-1 (faltando 1 dia para vencer)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{autoSendEnabled ? 'Ativo' : 'Desativado'}</span>
                <Switch
                  checked={autoSendEnabled}
                  onCheckedChange={setAutoSendEnabled}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Power className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Status</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${autoSendEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
                  <p className="text-foreground font-semibold">{autoSendEnabled ? 'Ativo' : 'Desativado'}</p>
                </div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Remetente</span>
                </div>
                <p className="text-foreground font-semibold text-sm">cobranca@assinaturaspcon.sbs</p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Gatilho</span>
                </div>
                <p className="text-foreground font-semibold text-sm">Assinatura marcada como D-1</p>
              </div>
            </div>

            {/* Configuração de horário */}
            <div className="bg-secondary/20 rounded-lg p-4 border border-border/30">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Horário de Envio
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                O sistema verifica automaticamente a cada minuto e dispara no horário configurado (BRT). Se a assinatura for marcada como D-1 após o horário, o envio acontece imediatamente.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Hora:</label>
                  <Select value={reminderHour} onValueChange={setReminderHour}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hours.map(h => (
                        <SelectItem key={h} value={h}>{h.padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-foreground font-bold text-lg">:</span>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Min:</label>
                  <Select value={reminderMinute} onValueChange={setReminderMinute}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map(m => (
                        <SelectItem key={m} value={m}>{m.padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-sm text-muted-foreground ml-1">(BRT)</span>
                <Button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  size="sm"
                  variant="secondary"
                  className="gap-2 ml-auto"
                >
                  {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </Button>
              </div>
            </div>

            <div className="border-t border-border/50 pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button onClick={handleTestBillingEmail} disabled={isTesting} className="gap-2">
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isTesting ? 'Processando...' : 'Executar Agora (Manual)'}
              </Button>
              <p className="text-xs text-muted-foreground">Dispara manualmente a verificação de assinaturas que vencem amanhã</p>
            </div>

            {lastResult?.success && (
              <div className="bg-secondary/20 rounded-lg p-4 mt-2">
                <p className="text-sm font-medium text-foreground mb-2">Resultado:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-muted-foreground">Enviados:</span>
                    <span className="font-semibold text-foreground">{lastResult.results.emails_sent}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-yellow-500" />
                    <span className="text-muted-foreground">Sem email:</span>
                    <span className="font-semibold text-foreground">{lastResult.results.skipped_no_email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-muted-foreground">Erros:</span>
                    <span className="font-semibold text-foreground">{lastResult.results.errors?.length || 0}</span>
                  </div>
                </div>
                {lastResult.results.errors?.length > 0 && (
                  <div className="mt-2 text-xs text-red-400">
                    {lastResult.results.errors.map((e: string, i: number) => (
                      <p key={i}>• {e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview do Template */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Preview do Template
            </CardTitle>
            <CardDescription>Pré-visualização do email de lembrete enviado aos clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg overflow-hidden border">
              <div style={{ background: 'linear-gradient(135deg, #0d1b3e 0%, #1E4FA3 100%)' }} className="p-6 text-center">
                <img
                  src="https://lcnaptefceboratxhzox.supabase.co/storage/v1/object/public/contracts/assets%2Flogo-pcon-white.png"
                  alt="P-CON"
                  className="h-10 mx-auto"
                />
              </div>
              <div className="p-6">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded mb-4">
                  <p className="text-sm text-blue-800 font-semibold">
                    📋 Sua assinatura vence amanhã — efetue o pagamento para manter tudo em dia
                  </p>
                </div>
                <p className="text-gray-800 mb-2">Olá <strong>Nome do Cliente</strong>,</p>
                <p className="text-gray-600 text-sm mb-4">
                  Passando para lembrar que a fatura referente à sua assinatura <strong>vence amanhã</strong>.
                </p>
                <div className="bg-gray-50 rounded-lg border p-4 mb-4">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-xs text-gray-500 uppercase">Plano</span>
                    <span className="text-sm font-semibold text-gray-800">Nome do Plano</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-xs text-gray-500 uppercase">Valor</span>
                    <span className="text-sm font-bold text-blue-700">R$ 99,90</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-xs text-gray-500 uppercase">Vencimento</span>
                    <span className="text-sm font-semibold text-yellow-600">14/03/2026</span>
                  </div>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-lg">
                    Acessar Área do Cliente
                  </span>
                </div>
              </div>
              <div style={{ background: '#0d1b3e' }} className="p-4 text-center">
                <p className="text-white text-sm font-semibold">P-CON CONSTRUNET</p>
                <p className="text-gray-400 text-xs">Criação de Sistemas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EmailSettings;
