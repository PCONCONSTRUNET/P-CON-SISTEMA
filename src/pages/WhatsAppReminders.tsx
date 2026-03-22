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
} from 'lucide-react';
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
  due_today: ['{{client_name}}', '{{plan_name}}', '{{amount}}'],
  payment_confirmed: ['{{client_name}}', '{{plan_name}}', '{{amount}}'],
  subscription_reminder: ['{{client_name}}', '{{plan_name}}', '{{amount}}'],
};

export default function WhatsAppReminders() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, Partial<WhatsAppTemplate>>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<Record<string, { file: File; preview: string }>>({});

  useEffect(() => {
    fetchTemplates();
  }, []);

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

    setSaving(template.id);
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .update(changes as any)
        .eq('id', template.id);

      if (error) throw error;

      // Update local state
      setTemplates(prev =>
        prev.map(t =>
          t.id === template.id ? { ...t, ...changes } as WhatsAppTemplate : t
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
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Erro ao fazer upload da imagem');
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
      .replace(/\{\{amount\}\}/g, 'R$ 199,90');
    return msg;
  };

  const templateIcons: Record<string, typeof MessageSquare> = {
    due_today: MessageSquare,
    payment_confirmed: MessageSquare,
    subscription_reminder: MessageSquare,
  };

  const templateColors: Record<string, string> = {
    due_today: 'text-amber-500',
    payment_confirmed: 'text-emerald-500',
    subscription_reminder: 'text-blue-500',
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
          </div>
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
                            placeholder="https://www.assinaturaspcon.sbs/cliente"
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
                    {/* Image bubble */}
                    {template.image_url && (
                      <div className="max-w-[280px] ml-auto">
                        <div className="bg-[#005c4b] rounded-lg overflow-hidden">
                          <img
                            src={`${template.image_url}?v=${Date.now()}`}
                            alt="Preview"
                            className="w-full h-auto max-h-[150px] object-cover"
                          />
                          <div className="p-2">
                            <p className="text-white text-xs whitespace-pre-wrap leading-relaxed">
                              {getPreviewMessage(template)}
                            </p>
                            <p className="text-white/40 text-[10px] text-right mt-1">09:00</p>
                          </div>
                        </div>
                      </div>
                    )}

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
    </DashboardLayout>
  );
}
