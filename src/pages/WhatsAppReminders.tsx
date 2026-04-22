import { useState, useEffect } from 'react';
import {
  Save,
  MessageSquare,
  Image,
  MousePointerClick,
  Loader2,
  Upload,
  Eye,
  EyeOff,
  Info,
  Check,
  X,
  Send,
  Phone,
  Clock,
} from 'lucide-react';
import { useGlobalData } from '@/contexts/GlobalDataContext';
import { ManualWhatsAppDialog } from '@/components/ManualWhatsAppDialog';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WhatsAppTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  message_template: string;
  image_url: string | null;
  button_enabled: boolean;
  button_text: string | null;
  button_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const placeholderInfo: Record<string, string[]> = {
  due_today: ['{{client_name}}', '{{plan_name}}', '{{amount}}', '{{due_date}}'],
  payment_confirmed: ['{{client_name}}', '{{plan_name}}', '{{amount}}', '{{due_date}}'],
  subscription_reminder: ['{{client_name}}', '{{plan_name}}', '{{amount}}', '{{due_date}}'],
  overdue_1_day: ['{{client_name}}', '{{plan_name}}', '{{amount}}', '{{due_date}}'],
};

export default function WhatsAppReminders() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, Partial<WhatsAppTemplate>>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<Record<string, { file: File; preview: string }>>({});
  const [isManualSendOpen, setIsManualSendOpen] = useState(false);
  const [selectedTemplateForManual, setSelectedTemplateForManual] = useState<WhatsAppTemplate | null>(null);

  const { whatsappSettings, updateWhatsAppSettings } = useGlobalData();
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [adminPhone, setAdminPhone] = useState('');
  const [savingAdminPhone, setSavingAdminPhone] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (whatsappSettings) {
      const h = whatsappSettings.send_hour.toString().padStart(2, '0');
      const m = whatsappSettings.send_minute.toString().padStart(2, '0');
      setScheduleTime(`${h}:${m}`);
      setAdminPhone(whatsappSettings.admin_phone || '');
    }
  }, [whatsappSettings]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTemplates((data as unknown as WhatsAppTemplate[]) || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const getEditedValue = (templateId: string, field: keyof WhatsAppTemplate) => {
    return editedTemplates[templateId]?.[field];
  };

  const setEditedValue = (templateId: string, field: keyof WhatsAppTemplate, value: any) => {
    setEditedTemplates(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        [field]: value,
      },
    }));
  };

  const getCurrentValue = (template: WhatsAppTemplate, field: keyof WhatsAppTemplate) => {
    const edited = getEditedValue(template.id, field);
    return edited !== undefined ? edited : template[field];
  };

  const hasChanges = (templateId: string) => {
    return editedTemplates[templateId] && Object.keys(editedTemplates[templateId]).length > 0;
  };

  const handleSave = async (template: WhatsAppTemplate) => {
    const changes = editedTemplates[template.id];
    if (!changes || Object.keys(changes).length === 0) {
      toast.info('Nenhuma alteração para salvar');
      return;
    }

    // Remove read-only fields before sending to Supabase
    const safeChanges: Partial<WhatsAppTemplate> = { ...changes };
    delete (safeChanges as any).id;
    delete (safeChanges as any).created_at;
    delete (safeChanges as any).updated_at;
    delete (safeChanges as any).template_key;

    setSaving(template.id);
    try {
      const { data: updatedData, error } = await supabase
        .from('whatsapp_templates')
        .update(safeChanges as any)
        .eq('id', template.id)
        .select()
        .single();

      if (error) throw error;

      // Update local state with confirmed data from DB
      setTemplates(prev =>
        prev.map(t =>
          t.id === template.id ? (updatedData as unknown as WhatsAppTemplate) ?? { ...t, ...safeChanges } as WhatsAppTemplate : t
        )
      );
      
      // Clear edited state
      setEditedTemplates(prev => {
        const next = { ...prev };
        delete next[template.id];
        return next;
      });

      toast.success(`Template "${template.name}" salvo com sucesso! As mensagens automáticas já usarão o novo texto.`);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Erro ao salvar template');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const [hourStr, minuteStr] = scheduleTime.split(':');
      await updateWhatsAppSettings({
        send_hour: parseInt(hourStr, 10),
        send_minute: parseInt(minuteStr, 10)
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveAdminPhone = async () => {
    setSavingAdminPhone(true);
    try {
      await updateWhatsAppSettings({ admin_phone: adminPhone || null } as any);
    } finally {
      setSavingAdminPhone(false);
    }
  };

  const handleImageSelect = (templateId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são permitidas');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 20MB');
      return;
    }

    const preview = URL.createObjectURL(file);
    setPendingImage(prev => ({ ...prev, [templateId]: { file, preview } }));
  };

  const handleImageCancel = (templateId: string) => {
    const pending = pendingImage[templateId];
    if (pending) URL.revokeObjectURL(pending.preview);
    setPendingImage(prev => {
      const next = { ...prev };
      delete next[templateId];
      return next;
    });
  };

  const handleImageConfirm = async (templateId: string) => {
    const pending = pendingImage[templateId];
    if (!pending) return;

    setUploadingImage(templateId);
    try {
      const ext = pending.file.name.split('.').pop() || 'jpg';
      const fileName = `whatsapp/template-${templateId}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(fileName, pending.file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(fileName);
      const imageUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('whatsapp_templates')
        .update({ image_url: imageUrl })
        .eq('id', templateId);

      if (updateError) throw updateError;

      setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, image_url: imageUrl } : t));
      toast.success('Imagem atualizada com sucesso!');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      toast.error('Erro ao fazer upload da imagem: ' + (error?.message || 'Erro Desconhecido'));
    } finally {
      setUploadingImage(null);
      handleImageCancel(templateId);
    }
  };

  const getPreviewMessage = (template: WhatsAppTemplate) => {
    let msg = getCurrentValue(template, 'message_template') as string;
    msg = msg
      .replace(/\{\{client_name\}\}/g, 'João Silva')
      .replace(/\{\{plan_name\}\}/g, 'Plano Premium')
      .replace(/\{\{amount\}\}/g, 'R$ 199,90')
      .replace(/\{\{due_date\}\}/g, '27/04/2026');
    return msg;
  };

  const templateIcons: Record<string, typeof MessageSquare> = {
    due_today: MessageSquare,
    payment_confirmed: MessageSquare,
    subscription_reminder: MessageSquare,
    overdue_1_day: MessageSquare,
  };

  const templateColors: Record<string, string> = {
    due_today: 'text-amber-500',
    payment_confirmed: 'text-emerald-500',
    subscription_reminder: 'text-blue-500',
    overdue_1_day: 'text-red-500',
  };

  if (loading) {
    return (
      <DashboardLayout title="Lembretes WhatsApp" subtitle="Configure as mensagens automáticas">
        <div className="glass-card p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Carregando templates...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Lembretes WhatsApp"
      subtitle="Configure as mensagens automáticas, imagens e botões"
    >
      {/* Info Banner */}
      <div className="glass-card p-4 mb-6 flex items-start gap-3 border-l-4 border-l-primary">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Variáveis disponíveis</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use as variáveis abaixo nas mensagens. Elas serão substituídas automaticamente:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="secondary" className="text-xs font-mono">{'{{client_name}}'} = Nome do cliente</Badge>
            <Badge variant="secondary" className="text-xs font-mono">{'{{plan_name}}'} = Nome do plano</Badge>
            <Badge variant="secondary" className="text-xs font-mono">{'{{amount}}'} = Valor formatado</Badge>
            <Badge variant="secondary" className="text-xs font-mono">{'{{due_date}}'} = Data de vencimento</Badge>
          </div>
        </div>
      </div>

      {/* Auto Schedule Banner */}
      <div className="glass-card p-4 sm:p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-border/50">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-primary/10 rounded-lg text-primary shrink-0">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Horário de Envio Automático</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Defina o horário em que os lembretes automáticos diários (D-0 e D-5) serão disparados.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Input 
            type="time" 
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="w-full sm:w-32 bg-secondary/50 border-border/50" 
          />
          <Button 
            onClick={handleSaveSchedule} 
            disabled={savingSchedule}
            className="shrink-0"
          >
            {savingSchedule ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Horário
          </Button>
        </div>
      </div>

      {/* Admin DDA Notification Banner */}
      <div className="glass-card p-4 sm:p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-border/50">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-amber-500/10 rounded-lg text-amber-500 shrink-0">
            <Phone className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm sm:text-base">Notificação DDA (Admin)</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Receba no seu WhatsApp um resumo de todas as faturas que vencem em 5 dias para gerar o DDA.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Input 
            type="tel"
            placeholder="(48) 99691-5303"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
            className="w-full sm:w-44 bg-secondary/50 border-border/50" 
          />
          <Button 
            onClick={handleSaveAdminPhone} 
            disabled={savingAdminPhone}
            className="shrink-0"
          >
            {savingAdminPhone ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <Tabs defaultValue={templates[0]?.template_key || 'due_today'} className="space-y-6">
        <TabsList className="w-full justify-start bg-secondary/50 flex-wrap h-auto p-1 gap-1">
          {templates.map((template) => (
            <TabsTrigger
              key={template.template_key}
              value={template.template_key}
              className="relative data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <span className="text-xs sm:text-sm">{template.name}</span>
              {hasChanges(template.id) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {templates.map((template) => (
          <TabsContent key={template.template_key} value={template.template_key} className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg bg-primary/10')}>
                  <MessageSquare className={cn('w-5 h-5', templateColors[template.template_key] || 'text-primary')} />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {template.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${template.id}`} className="text-sm text-muted-foreground">
                    Ativo
                  </Label>
                  <Switch
                    id={`active-${template.id}`}
                    checked={getCurrentValue(template, 'is_active') as boolean}
                    onCheckedChange={(val) => setEditedValue(template.id, 'is_active', val)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedTemplateForManual(template);
                    setIsManualSendOpen(true);
                  }}
                  className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
                >
                  <Send className="w-4 h-4" />
                  Enviar Manualmente
                </Button>
                <Button
                  onClick={() => handleSave(template)}
                  disabled={!hasChanges(template.id) || saving === template.id}
                  className="gap-2"
                >
                  {saving === template.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Left Column: Editor */}
              <div className="space-y-6">
                {/* Message Template */}
                <Card className="glass-card border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      Mensagem
                    </CardTitle>
                    <CardDescription>
                      Edite o texto da mensagem automática
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={getCurrentValue(template, 'message_template') as string}
                      onChange={(e) => setEditedValue(template.id, 'message_template', e.target.value)}
                      className="min-h-[200px] bg-secondary/30 border-border/50 font-mono text-sm"
                      placeholder="Digite a mensagem..."
                    />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(placeholderInfo[template.template_key] || []).map((ph) => (
                        <button
                          key={ph}
                          type="button"
                          className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
                          onClick={() => {
                            const current = getCurrentValue(template, 'message_template') as string;
                            setEditedValue(template.id, 'message_template', current + ph);
                          }}
                        >
                          + {ph}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Image Upload */}
                <Card className="glass-card border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Image className="w-4 h-4 text-primary" />
                      Imagem Promocional
                    </CardTitle>
                    <CardDescription>
                      Imagem enviada junto com a mensagem
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {template.image_url && (
                       <div className="relative rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={`${template.image_url}?v=${Date.now()}`}
                          alt="Imagem promocional"
                          className="w-full h-auto max-h-[200px] object-contain bg-secondary/30"
                        />
                      </div>
                    )}

                    {/* Pending image preview with confirm/cancel */}
                    {pendingImage[template.id] && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-primary">Nova imagem selecionada:</p>
                        <div className="relative rounded-lg overflow-hidden border-2 border-primary/50 bg-secondary/30">
                          <img
                            src={pendingImage[template.id].preview}
                            alt="Preview da nova imagem"
                            className="w-full h-auto max-h-[200px] object-contain"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleImageConfirm(template.id)}
                            disabled={uploadingImage === template.id}
                            className="flex-1"
                          >
                            {uploadingImage === template.id ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <Check className="w-4 h-4 mr-1" />
                            )}
                            {uploadingImage === template.id ? 'Enviando...' : 'Confirmar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleImageCancel(template.id)}
                            disabled={uploadingImage === template.id}
                            className="flex-1"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}

                    {!pendingImage[template.id] && (
                      <div className="flex items-center gap-3">
                        <label className="flex-1">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageSelect(template.id, file);
                              e.target.value = '';
                            }}
                          />
                          <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all">
                            <Upload className="w-5 h-5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Clique para selecionar uma imagem
                            </span>
                          </div>
                        </label>
                      </div>
                    )}

                    {template.image_url && (
                      <Input
                        value={template.image_url}
                        readOnly
                        className="text-xs font-mono bg-secondary/30 border-border/50"
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Button Config */}
                <Card className="glass-card border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MousePointerClick className="w-4 h-4 text-primary" />
                      Botão Interativo
                    </CardTitle>
                    <CardDescription>
                      Botão enviado após a mensagem com imagem
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`btn-${template.id}`} className="text-sm">
                        Enviar botão
                      </Label>
                      <Switch
                        id={`btn-${template.id}`}
                        checked={getCurrentValue(template, 'button_enabled') as boolean}
                        onCheckedChange={(val) => setEditedValue(template.id, 'button_enabled', val)}
                      />
                    </div>
                    {(getCurrentValue(template, 'button_enabled') as boolean) && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Texto do botão</Label>
                          <Input
                            value={(getCurrentValue(template, 'button_text') as string) || ''}
                            onChange={(e) => setEditedValue(template.id, 'button_text', e.target.value)}
                            className="bg-secondary/30 border-border/50"
                            placeholder="Acessar Área do Cliente"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">URL do botão</Label>
                          <Input
                            value={(getCurrentValue(template, 'button_url') as string) || ''}
                            onChange={(e) => setEditedValue(template.id, 'button_url', e.target.value)}
                            className="bg-secondary/30 border-border/50"
                            placeholder="https://www.pconassinantes.site/cliente"
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Preview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Pré-visualização
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    onClick={() => setPreviewKey(previewKey === template.template_key ? null : template.template_key)}
                  >
                    {previewKey === template.template_key ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {previewKey === template.template_key ? 'Ocultar' : 'Ver preview'}
                  </Button>
                </div>

                {/* WhatsApp-style Preview */}
                <div className="rounded-2xl overflow-hidden border border-border/30">
                  {/* WhatsApp Header */}
                  <div className="bg-emerald-700 px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">P-CON Assinaturas</p>
                      <p className="text-white/60 text-xs">online</p>
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className="bg-[#0b141a] p-4 space-y-2 min-h-[300px]">
                    {/* Main message bubble (with or without image) */}
                    <div className="max-w-[280px] ml-auto">
                      <div className="bg-[#005c4b] rounded-lg overflow-hidden">
                        {(template.image_url || 'https://bevahgtmcdicyhjnrylk.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg') && (
                          <img
                            src={`${template.image_url || 'https://bevahgtmcdicyhjnrylk.supabase.co/storage/v1/object/public/contracts/whatsapp/promo-pcon.jpg'}?v=${Date.now()}`}
                            alt="Preview"
                            className="w-full h-auto max-h-[150px] object-cover"
                          />
                        )}
                        <div className="p-2">
                          <p className="text-white text-xs whitespace-pre-wrap leading-relaxed">
                            {getPreviewMessage(template)}
                          </p>
                          <p className="text-white/40 text-[10px] text-right mt-1">09:00</p>
                        </div>
                      </div>
                    </div>

                    {/* Button bubble */}
                    {(getCurrentValue(template, 'button_enabled') as boolean) && (
                      <div className="max-w-[280px] ml-auto">
                        <div className="bg-[#005c4b] rounded-lg p-3">
                          <p className="text-white text-xs mb-2">📱 Acesse sua área do cliente:</p>
                          <div className="bg-[#004639] rounded-md px-3 py-2 text-center">
                            <p className="text-[#00a884] text-xs font-medium">
                              {(getCurrentValue(template, 'button_text') as string) || 'Acessar Área do Cliente'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <ManualWhatsAppDialog 
        isOpen={isManualSendOpen}
        onOpenChange={setIsManualSendOpen}
        template={selectedTemplateForManual}
      />
    </DashboardLayout>
  );
}

