import { useEffect, useState } from 'react';
import { CreditCard, Eye, Link2, Save, ShieldCheck } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PROPOSAL_WHATSAPP = '(11) 97836-3600';

const settingsCards = [
  {
    icon: Link2,
    title: 'Links públicos ativos',
    description: 'Cada proposta pode gerar um link único para compartilhamento sem login.',
  },
  {
    icon: Eye,
    title: 'Tracking de visualização',
    description: 'O módulo registra primeira visualização, última visita e contador de acessos.',
  },
  {
    icon: ShieldCheck,
    title: 'Aprovação online',
    description: 'A proposta pode ser aprovada ou recusada diretamente pela página pública.',
  },
  {
    icon: CreditCard,
    title: 'Pagamento integrado',
    description: 'As propostas já podem gerar cobrança por PIX com entrada ou valor total, usando a integração ativa do sistema.',
  },
];

const BudgetSettings = () => {
  const [notificationEmail, setNotificationEmail] = useState('contato@assinaturaspcon.sbs');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('email_settings')
        .select('id, setting_key, setting_value')
        .in('setting_key', ['proposal_notification_email']);

      if (error) return;

      const email = data?.find((item) => item.setting_key === 'proposal_notification_email')?.setting_value;

      if (email) setNotificationEmail(email);
    };

    void loadSettings();
  }, []);

  const saveSetting = async (settingKey: string, settingValue: string) => {
    const { data: existing, error: loadError } = await supabase
      .from('email_settings')
      .select('id')
      .eq('setting_key', settingKey)
      .maybeSingle();

    if (loadError) throw loadError;

    if (existing?.id) {
      const { error } = await supabase
        .from('email_settings')
        .update({ setting_value: settingValue, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('email_settings').insert({
      setting_key: settingKey,
      setting_value: settingValue,
    });

    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      await saveSetting('proposal_notification_email', notificationEmail.trim() || 'contato@assinaturaspcon.sbs');

      toast.success('Configurações de notificações salvas');
    } catch (error) {
      console.error('Error saving budget settings:', error);
      toast.error('Erro ao salvar as configurações');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Configurações de Orçamentos"
      subtitle="Gerencie notificações e recursos ativos das propostas comerciais"
    >
      <div className="space-y-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Notificações internas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proposal-notification-email">Email de destino</Label>
              <Input
                id="proposal-notification-email"
                type="email"
                value={notificationEmail}
                onChange={(event) => setNotificationEmail(event.target.value)}
                placeholder="contato@assinaturaspcon.sbs"
              />
              <p className="text-xs text-muted-foreground">
                Os alertas de visualização, aprovação e recusa dos orçamentos são enviados automaticamente pela integração de e-mail já conectada com a Resend.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposal-notification-phone">WhatsApp de destino</Label>
              <Input
                id="proposal-notification-phone"
                value={DEFAULT_PROPOSAL_WHATSAPP}
                readOnly
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Envio automático fixado no número conectado da API para garantir o recebimento dos alertas.
              </p>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar destinos'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
        {settingsCards.map((item) => (
          <Card key={item.title} className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <item.icon className="h-5 w-5" />
                </div>
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </CardContent>
          </Card>
        ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BudgetSettings;