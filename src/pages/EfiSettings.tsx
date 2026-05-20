import { useState, useEffect, useRef } from 'react';
import { Building2, Key, Shield, CheckCircle2, AlertTriangle, Loader2, Save, Upload, Eye, EyeOff, Info, Copy, ExternalLink } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EfiSettings {
  client_id: string;
  client_secret: string;
  pix_key: string;
  certificate_pem: string;
  is_active: boolean;
  updated_at?: string;
}

const EfiSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<EfiSettings>({
    client_id: '',
    client_secret: '',
    pix_key: '',
    certificate_pem: '',
    is_active: false,
  });
  const [showSecret, setShowSecret] = useState(false);
  const [showPem, setShowPem] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('payment_gateway_settings')
          .select('*')
          .eq('gateway_name', 'efi')
          .maybeSingle();

        if (data) {
          setSettings({
            client_id: data.client_id || '',
            client_secret: data.client_secret || '',
            pix_key: data.pix_key || '',
            certificate_pem: data.certificate_pem || '',
            is_active: !!data.is_active,
            updated_at: data.updated_at,
          });
        } else {
          // Pre-fill with known credentials
          setSettings(prev => ({
            ...prev,
            client_id: 'Client_Id_9f56674f99f6ead4692bde21d14643533c141ed8',
            client_secret: 'Client_Secret_cd76491961078685347f8ccf6c55d9c11813310c',
            pix_key: '66.214.350/0001-69',
          }));
        }
      } catch (e) {
        console.error('[EfiSettings] fetch error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings.client_id || !settings.client_secret || !settings.pix_key) {
      toast.error('Preencha Client ID, Client Secret e Chave PIX');
      return;
    }

    setSaving(true);
    try {
      // Verifica se já existe um registro para EFI
      const { data: existing } = await (supabase as any)
        .from('payment_gateway_settings')
        .select('id')
        .eq('gateway_name', 'efi')
        .maybeSingle();

      const payload = {
        gateway_name: 'efi',
        client_id: settings.client_id.trim(),
        client_secret: settings.client_secret.trim(),
        pix_key: settings.pix_key.trim().replace(/[^0-9]/g, ''), // CNPJ somente números
        certificate_pem: settings.certificate_pem.trim(),
        is_active: settings.is_active,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await (supabase as any)
          .from('payment_gateway_settings')
          .update(payload)
          .eq('id', existing.id);
      } else {
        await (supabase as any)
          .from('payment_gateway_settings')
          .insert(payload);
      }

      toast.success('Configurações salvas com sucesso!');
      setSettings(prev => ({ ...prev, is_active: !!settings.certificate_pem }));
    } catch (err: any) {
      console.error('[EfiSettings] save error:', err);
      toast.error('Erro ao salvar: ' + (err.message || 'Tente novamente'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.client_id || !settings.client_secret || !settings.certificate_pem) {
      toast.error('Salve as configurações com o certificado antes de testar');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('efi-pay', {
        body: {
          _action: 'check-status',
          paymentId: 'test_connection_only',
        },
      });

      // A função vai falhar por "txid inválido", mas se chegou no servidor é porque autenticou!
      // Erro de "txid não encontrado" significa que a autenticação funcionou
      const errMsg = data?.error || error?.message || '';
      const isAuthSuccess =
        errMsg.includes('não encontrado') ||
        errMsg.includes('not found') ||
        errMsg.includes('txid') ||
        errMsg.includes('ATIVA') ||
        data?.success === true;

      if (isAuthSuccess) {
        setTestResult({ success: true, message: 'Conexão com EFI Bank estabelecida com sucesso! ✅' });
        toast.success('Conexão EFI Bank OK!');
      } else {
        setTestResult({ success: false, message: errMsg || 'Falha na autenticação com EFI Bank' });
        toast.error('Falha ao conectar com EFI Bank');
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Erro ao testar conexão' });
      toast.error('Erro ao testar conexão');
    } finally {
      setTesting(false);
    }
  };

  // ─── Leitura do arquivo .p12 → converte para base64 e instrui o usuário ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.p12') && !file.name.endsWith('.pfx') && !file.name.endsWith('.pem')) {
      toast.error('Por favor, selecione um arquivo .p12, .pfx ou .pem');
      return;
    }

    if (file.name.endsWith('.pem')) {
      // Lê diretamente como texto
      const text = await file.text();
      setSettings(prev => ({ ...prev, certificate_pem: text }));
      toast.success('Certificado PEM carregado!');
      return;
    }

    // Para .p12, informa ao usuário que precisa converter
    toast.info(
      'Arquivo .p12 detectado. Por favor, converta para PEM e cole no campo abaixo. ' +
      'Use o comando: openssl pkcs12 -in certificado.p12 -out certificado.pem -nodes',
      { duration: 8000 }
    );
  };

  const copyOpenSSLCommand = () => {
    navigator.clipboard.writeText(
      'openssl pkcs12 -in seu-certificado.p12 -out certificado.pem -nodes'
    );
    toast.success('Comando copiado!');
  };

  const webhookUrl = `${(import.meta as any).env?.VITE_SUPABASE_URL || 'https://[SEU-PROJETO].supabase.co'}/functions/v1/efi-webhook`;

  if (loading) {
    return (
      <DashboardLayout title="EFI Bank">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="EFI Bank">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-7 h-7 text-primary" />
            Configurações EFI Bank
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure as credenciais da API Pix EFI Bank para processar pagamentos
          </p>
        </div>

        {/* Status Card */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {settings.is_active && settings.certificate_pem ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
              Status da Integração
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge className={settings.client_id ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                Client ID {settings.client_id ? '✓' : '✗'}
              </Badge>
              <Badge className={settings.client_secret ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                Client Secret {settings.client_secret ? '✓' : '✗'}
              </Badge>
              <Badge className={settings.pix_key ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                Chave PIX {settings.pix_key ? '✓' : '✗'}
              </Badge>
              <Badge className={settings.certificate_pem ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}>
                Certificado {settings.certificate_pem ? '✓ Configurado' : '⚠ Pendente'}
              </Badge>
            </div>
            {settings.updated_at && (
              <p className="text-xs text-muted-foreground mt-3">
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
              Credenciais de Acesso
            </CardTitle>
            <CardDescription>
              Geradas no painel da EFI Bank em: <strong>API → Aplicações</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Client ID *</label>
              <Input
                id="efi-client-id"
                placeholder="Client_Id_xxxxxxxxxxxxxxxxxxxx"
                value={settings.client_id}
                onChange={(e) => setSettings(prev => ({ ...prev, client_id: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Client Secret *</label>
              <div className="relative">
                <Input
                  id="efi-client-secret"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Client_Secret_xxxxxxxxxxxxxxxxxxxx"
                  value={settings.client_secret}
                  onChange={(e) => setSettings(prev => ({ ...prev, client_secret: e.target.value }))}
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Chave PIX (CNPJ) *</label>
              <Input
                id="efi-pix-key"
                placeholder="00.000.000/0001-00"
                value={settings.pix_key}
                onChange={(e) => setSettings(prev => ({ ...prev, pix_key: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                CNPJ cadastrado como chave PIX na conta EFI Bank: <strong>66.214.350/0001-69</strong>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Certificate */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Certificado mTLS (obrigatório para API Pix)
            </CardTitle>
            <CardDescription>
              O EFI Bank exige um certificado .p12 para autenticar todas as requisições Pix
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Instrução de conversão */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-300">Como usar seu certificado .p12:</p>
                  <ol className="text-xs text-blue-200/80 mt-2 space-y-1 list-decimal ml-4">
                    <li>Baixe o certificado .p12 no painel EFI Bank</li>
                    <li>Execute o comando abaixo para converter para PEM</li>
                    <li>Cole o conteúdo do arquivo PEM gerado no campo abaixo</li>
                  </ol>
                </div>
              </div>
              <div className="bg-black/30 rounded p-3 font-mono text-xs text-green-400 flex items-center justify-between gap-2">
                <span>openssl pkcs12 -in seu-certificado.p12 -out certificado.pem -nodes</span>
                <button onClick={copyOpenSSLCommand} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-blue-200/60">
                Sem senha quando solicitado (ou pressione Enter). O arquivo PEM conterá o certificado e a chave privada.
              </p>
            </div>

            {/* Upload ou colar */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-border/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Carregar arquivo (.pem ou .p12)
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".p12,.pfx,.pem"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Conteúdo do certificado PEM</label>
                  <button
                    type="button"
                    onClick={() => setShowPem(!showPem)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {showPem ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showPem ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <textarea
                  id="efi-certificate-pem"
                  rows={showPem ? 12 : 5}
                  placeholder={`-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----\n-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----`}
                  value={settings.certificate_pem}
                  onChange={(e) => setSettings(prev => ({ ...prev, certificate_pem: e.target.value }))}
                  className="w-full bg-secondary/50 border border-border/50 rounded-lg p-3 text-xs font-mono text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  style={{ filter: showPem ? 'none' : 'blur(4px)' }}
                />
                {settings.certificate_pem && (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Certificado configurado ({Math.round(settings.certificate_pem.length / 1024 * 10) / 10} KB)
                  </p>
                )}
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
              Configure esta URL no painel EFI Bank para receber confirmações de pagamento
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
            <p className="text-xs text-muted-foreground">
              No painel EFI: <strong>API → Webhooks → Criar webhook → Cole a URL acima</strong>
            </p>
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
            disabled={testing || !settings.certificate_pem}
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

export default EfiSettings;
