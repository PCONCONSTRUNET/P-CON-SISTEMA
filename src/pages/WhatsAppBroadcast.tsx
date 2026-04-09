import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  ListPlus, 
  MessageSquare, 
  Clock, 
  Play, 
  Square, 
  Search, 
  Sparkles,
  Phone,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  History,
  Info,
  Upload,
  FileText,
  FileSearch,
  Check,
  ChevronRight,
  Eye,
  FileJson,
  FileSpreadsheet
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Contact {
  id: string;
  phone: string;
  name: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
}

interface Campaign {
  id: string;
  name: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
}

interface LogEntry {
  id: string;
  contact_name: string;
  phone: string;
  status: string;
  error_message: string;
  created_at: string;
}

const WhatsAppBroadcast = () => {
  // Config States
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inputText, setInputText] = useState('');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sendImage, setSendImage] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'document'>('image');
  const [fileName, setFileName] = useState('');
  const [interval, setInterval] = useState([10, 20]);
  const [defaultDdd, setDefaultDdd] = useState('11');
  
  // App States
  const [isSending, setIsSending] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [stats, setStats] = useState({ sent: 0, failed: 0, total: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [activeTab, setActiveTab] = useState('disparar');

  // History States
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<LogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const stopRef = useRef(false);

  // 1. Fetch & Persist Settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_broadcast_settings')
          .select('*')
          .single();
        
        if (data) {
          setMessage(data.last_message || 'Olá {nome}, tudo bem?');
          setImageUrl(data.last_image_url || '');
          setSendImage(data.send_image || false);
          setInterval([data.min_interval || 10, data.max_interval || 20]);
          // Note: we don't strictly need to find the media type from URL, but could add it to settings table
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchSettings();
  }, []);

  // Auto-save logic (Debounced)
  useEffect(() => {
    if (isLoadingSettings) return;

    const timer = setTimeout(async () => {
      const { error } = await supabase
        .from('whatsapp_broadcast_settings')
        .update({
          last_message: message,
          last_image_url: imageUrl,
          send_image: sendImage,
          min_interval: interval[0],
          max_interval: interval[1],
          updated_at: new Date().toISOString()
        })
        .match({ id: (await supabase.from('whatsapp_broadcast_settings').select('id').single()).data?.id });

      if (error) console.error('Error saving settings:', error);
    }, 2000);

    return () => clearTimeout(timer);
  }, [message, imageUrl, sendImage, interval]);

  // 2. Fetch History
  const fetchCampaigns = async () => {
    setIsLoadingHistory(true);
    const { data, error } = await supabase
      .from('whatsapp_broadcast_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setCampaigns(data);
    setIsLoadingHistory(false);
  };

  const viewCampaignLogs = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    const { data, error } = await supabase
      .from('whatsapp_broadcast_logs')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });
    
    if (data) setCampaignLogs(data);
  };

  // 3. File Uploders
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileNameRaw = `${Math.random()}-${Date.now()}.${fileExt}`;
      const filePath = `whatsapp/broadcast/${fileNameRaw}`;

      const { data, error } = await supabase.storage
        .from('contracts')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(filePath);

      setImageUrl(publicUrl);
      setFileName(file.name);
      setSendImage(true);
      
      // Auto-detect media type
      if (['jpg', 'jpeg', 'png', 'webp'].includes(fileExt?.toLowerCase() || '')) {
        setMediaType('image');
      } else {
        setMediaType('document');
      }

      toast.success('Arquivo enviado com sucesso!');
    } catch (err: any) {
      toast.error('Erro no upload: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleContactFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputText(content);
      toast.info('Arquivo de contatos carregado. Clique em Análisar para processar.');
    };
    reader.readAsText(file);
  };

  // 4. Contact Logic
  const detectContacts = () => {
    if (!inputText.trim()) return;

    const lines = inputText.split(/\r?\n/);
    const newContacts: Contact[] = [];
    
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      const words = cleanLine.split(/[\s\t,;]+/);
      let phone = '';
      let nameParts: string[] = [];
      
      words.forEach(word => {
        const onlyDigits = word.replace(/\D/g, '');
        if (onlyDigits.length >= 8 && onlyDigits.length <= 13 && !phone) {
          phone = onlyDigits;
        } else {
          nameParts.push(word);
        }
      });

      if (phone) {
        if (!phone.startsWith('55') && phone.length <= 11) phone = '55' + phone;

        const detectedName = nameParts.join(' ').replace(/[0-9()-]/g, '').trim();
        newContacts.push({
          id: Math.random().toString(36).substring(7),
          phone,
          name: detectedName || 'Cliente',
          status: 'pending'
        });
      }
    });

    if (newContacts.length > 0) {
      setContacts(prev => [...prev, ...newContacts]);
      setInputText('');
      toast.success(`${newContacts.length} contatos adicionados!`);
    }
  };

  // 5. Execution Engine
  const startBroadcast = async () => {
    if (contacts.length === 0) return;
    setIsSending(true);
    stopRef.current = false;
    
    // Create Campaign Header
    const campaignName = `Disparo ${format(new Date(), 'dd/MM HH:mm')}`;
    const { data: campaignData } = await supabase
      .from('whatsapp_broadcast_campaigns')
      .insert({
        name: campaignName,
        total_contacts: contacts.length,
        status: 'sending'
      })
      .select()
      .single();

    const campaignId = campaignData?.id;
    let localSent = 0;
    let localFailed = 0;

    for (let i = 0; i < contacts.length; i++) {
      if (stopRef.current) break;
      if (contacts[i].status !== 'pending') continue;

      setCurrentIndex(i);
      setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'sending' } : c));

      try {
        const personalizedMessage = message.replace(/{nome}/g, contacts[i].name);
        
        const { data, error } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            phone: contacts[i].phone,
            message: personalizedMessage,
            clientId: null,
            type: 'broadcast',
            sendImage,
            imageUrl: imageUrl || undefined,
            mediaType,
            fileName: fileName || undefined
          }
        });

        const isSuccess = !error && data?.success;
        
        // Log individual result
        if (campaignId) {
          await supabase.from('whatsapp_broadcast_logs').insert({
            campaign_id: campaignId,
            contact_name: contacts[i].name,
            phone: contacts[i].phone,
            status: isSuccess ? 'success' : 'failed',
            error_message: !isSuccess ? (error?.message || data?.error || 'Erro desconhecido') : null
          });
        }

        if (!isSuccess) throw new Error(error?.message || data?.error || 'Erro na API');

        setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'sent' } : c));
        localSent++;
        setStats(prev => ({ ...prev, sent: localSent }));
      } catch (err: any) {
        setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'failed', error: err.message } : c));
        localFailed++;
        setStats(prev => ({ ...prev, failed: localFailed }));
      }

      // Update Campaign Summary
      if (campaignId && i % 5 === 0) {
        await supabase.from('whatsapp_broadcast_campaigns').update({
          sent_count: localSent,
          failed_count: localFailed
        }).eq('id', campaignId);
      }

      if (i < contacts.length - 1 && !stopRef.current) {
        const waitTime = Math.floor(Math.random() * (interval[1] - interval[0] + 1) + interval[0]) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Final Campaign Update
    if (campaignId) {
      await supabase.from('whatsapp_broadcast_campaigns').update({
        sent_count: localSent,
        failed_count: localFailed,
        status: stopRef.current ? 'stopped' : 'completed'
      }).eq('id', campaignId);
    }

    setIsSending(false);
    setCurrentIndex(-1);
    toast.success('Disparo finalizado!');
  };

  return (
    <DashboardLayout title="WhatsApp Broadcast" subtitle="Central Corporativa de Disparos">
      <Tabs defaultValue="disparar" className="space-y-6" onValueChange={(val) => {
        setActiveTab(val);
        if (val === 'historico') fetchCampaigns();
      }}>
        <TabsList className="bg-secondary/50 p-1">
          <TabsTrigger value="disparar" className="gap-2">
            <Send className="w-4 h-4" />
            Novo Disparo
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="w-4 h-4" />
            Histórico de Envios
          </TabsTrigger>
        </TabsList>

        {/* --- ABA ENVIAR --- */}
        <TabsContent value="disparar" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Lado Esquerdo: Config */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Importador */}
              <Card className="glass-card shadow-xl border-primary/20 bg-primary/5">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                        <ListPlus className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle>Audiência</CardTitle>
                        <CardDescription>Importe seus contatos para o lote</CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative group overflow-hidden h-20 border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl flex flex-col items-center justify-center gap-1 bg-background/50">
                       <input 
                         type="file" 
                         accept=".txt,.csv" 
                         onChange={handleContactFile} 
                         disabled={isSending}
                         className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                       />
                       <Upload className="w-5 h-5 text-muted-foreground" />
                       <span className="text-xs font-medium">Subir CSV ou TXT</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Textarea 
                      placeholder="Ou cole o conteúdo aqui (IA Smart Detector identificará os nomes e números)"
                      className="min-h-[100px] bg-secondary/30 font-mono text-sm"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                    />
                    <Button onClick={detectContacts} className="w-full gap-2" variant="secondary">
                       <Search className="w-4 h-4" /> Analisar e Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Mensagem */}
              <Card className="glass-card">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center gap-3 border-b border-border/50 pb-4">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">Configurar Campanha</CardTitle>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Texto Principal</Label>
                      <Textarea 
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className="min-h-[160px] bg-secondary/10 focus:bg-secondary/20"
                        placeholder="Olá {nome}..."
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-secondary/10 border border-border/50 space-y-4">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Upload className="w-4 h-4 text-primary" />
                            <Label>Anexar Arquivo (Foto ou PDF)</Label>
                          </div>
                          <Switch checked={sendImage} onCheckedChange={setSendImage} />
                       </div>

                       {sendImage && (
                         <div className="space-y-3">
                            <div className="relative">
                               <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                               <Button variant="outline" className="w-full gap-2 bg-background" disabled={isUploading}>
                                  {isUploading ? <Loader2 className="animate-spin w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                                  {fileName ? fileName : 'Escolher arquivo do computador'}
                               </Button>
                            </div>
                            {imageUrl && (
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate bg-background/50 p-2 rounded border border-border/50">
                                 <CheckCircle2 className="w-3 h-3 text-green-500" />
                                 {imageUrl}
                              </div>
                            )}
                         </div>
                       )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Intervalo */}
              <Card className="glass-card">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">Configurações de Fluxo</CardTitle>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span>Espaçamento humano: <strong>{interval[0]}s a {interval[1]}s</strong></span>
                    </div>
                    <Slider defaultValue={interval} max={60} min={5} step={1} onValueChange={setInterval} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Lado Direito: Live Controller */}
            <div className="lg:col-span-5 space-y-6">
               <Card className="glass-card border-2 border-primary/20 shadow-2xl relative overflow-hidden">
                  {isSending && <div className="absolute top-0 left-0 h-1 bg-primary animate-progress-indefinite w-full" />}
                  <CardContent className="p-6 space-y-6">
                     <div className="flex justify-between items-center">
                        <Badge className="bg-primary/20 text-primary hover:bg-primary/30 py-1 px-3">
                           {isSending ? 'EM EXECUÇÃO' : 'MODO PRONTO'}
                        </Badge>
                        <div className="flex gap-2">
                           {isSending ? (
                              <Button variant="destructive" size="sm" onClick={() => stopRef.current = true} className="gap-2">
                                <Square className="w-3 h-3 fill-current" /> Parar
                              </Button>
                           ) : (
                              <Button size="sm" onClick={startBroadcast} disabled={contacts.length === 0} className="gap-2 shadow-lg shadow-primary/30">
                                <Play className="w-3 h-3 fill-current" /> Iniciar
                              </Button>
                           )}
                           <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setContacts([]); setStats({sent:0, failed:0, total:0}); }} disabled={isSending}>
                              <Trash2 className="w-3 h-3" />
                           </Button>
                        </div>
                     </div>

                     <div className="grid grid-cols-3 gap-2">
                        <div className="bg-background/80 p-3 rounded-xl border border-border/50 text-center">
                           <p className="text-[10px] text-muted-foreground uppercase">Fila</p>
                           <p className="text-xl font-bold">{contacts.length}</p>
                        </div>
                        <div className="bg-green-500/5 p-3 rounded-xl border border-green-500/20 text-center">
                           <p className="text-[10px] text-green-500 uppercase font-bold">Enviados</p>
                           <p className="text-xl font-bold text-green-500">{stats.sent}</p>
                        </div>
                        <div className="bg-red-500/5 p-3 rounded-xl border border-red-500/20 text-center">
                           <p className="text-[10px] text-red-500 uppercase font-bold">Erros</p>
                           <p className="text-xl font-bold text-red-500">{stats.failed}</p>
                        </div>
                     </div>

                     <div className="space-y-2">
                        <Progress value={(stats.sent + stats.failed) / (contacts.length || 1) * 100} className="h-2" />
                        <p className="text-right text-[10px] font-mono opacity-60">
                           Processando: {stats.sent + stats.failed}/{contacts.length}
                        </p>
                     </div>
                  </CardContent>
               </Card>

               {/* Console em Tempo Real */}
               <Card className="glass-card h-[400px] flex flex-col">
                  <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center justify-between">
                     <CardTitle className="text-xs uppercase tracking-tighter">Log de Transmissão</CardTitle>
                     <Loader2 className={cn("w-3 h-3", isSending ? "animate-spin text-primary" : "hidden")} />
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto font-mono text-[11px] bg-background/20">
                     {contacts.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center opacity-30 text-center p-8">
                          <FileSearch className="w-10 h-10 mb-2" />
                          <p>Carregue contatos para ver a atividade</p>
                       </div>
                     ) : (
                       <div className="divide-y divide-border/30">
                          {contacts.map((c, idx) => (
                             <div key={idx} className={cn(
                               "px-4 py-2.5 flex items-center justify-between group",
                               currentIndex === idx ? "bg-primary/5 border-l-2 border-primary" : ""
                             )}>
                                <div className="flex items-center gap-3">
                                   <span className="text-white/20 w-4">{idx + 1}.</span>
                                   <div className="flex flex-col">
                                      <span className="font-semibold">{c.name}</span>
                                      <span className="text-[9px] opacity-40">{c.phone}</span>
                                   </div>
                                </div>
                                <div className="flex items-center gap-2">
                                   {c.status === 'pending' && <Clock className="w-3 h-3 opacity-20" />}
                                   {c.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                                   {c.status === 'sent' && <Check className="w-3 h-3 text-green-500" />}
                                   {c.status === 'failed' && (
                                      <div className="flex items-center gap-1">
                                         <XCircle className="w-3 h-3 text-red-500" />
                                         <span className="text-[8px] text-red-400 hidden group-hover:block">{c.error}</span>
                                      </div>
                                   )}
                                </div>
                             </div>
                          ))}
                       </div>
                     )}
                  </CardContent>
               </Card>
            </div>
          </div>
        </TabsContent>

        {/* --- ABA HISTÓRICO --- */}
        <TabsContent value="historico">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-4">
                 <h3 className="text-sm font-bold opacity-60 flex items-center gap-2">
                    <History className="w-4 h-4" /> ÚLTIMOS DISPAROS
                 </h3>
                 <div className="space-y-3">
                    {campaigns.length === 0 && !isLoadingHistory ? (
                       <Card className="p-8 text-center opacity-50">
                          <p>Nenhuma campanha registrada.</p>
                       </Card>
                    ) : (
                      campaigns.map((camp) => (
                        <Card 
                          key={camp.id} 
                          className={cn(
                            "glass-card cursor-pointer transition-all hover:border-primary/50",
                            selectedCampaign?.id === camp.id ? "border-primary bg-primary/5 shadow-lg" : ""
                          )}
                          onClick={() => viewCampaignLogs(camp)}
                        >
                          <CardContent className="p-4 flex items-center justify-between">
                             <div className="space-y-1">
                                <p className="font-bold text-sm">{camp.name}</p>
                                <p className="text-[10px] text-muted-foreground">{format(new Date(camp.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
                             </div>
                             <div className="text-right">
                                <div className="flex items-center gap-2 mb-1">
                                   <Badge variant="outline" className="text-[9px] h-5">{camp.total_contacts} contatos</Badge>
                                   {camp.failed_count > 0 && <Badge variant="destructive" className="text-[9px] h-5">{camp.failed_count} falhas</Badge>}
                                </div>
                                <ChevronRight className="w-4 h-4 ml-auto opacity-30" />
                             </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                 </div>
              </div>

              <div className="lg:col-span-7">
                 <AnimatePresence mode="wait">
                    {!selectedCampaign ? (
                       <motion.div 
                         initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                         className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl opacity-40 p-20 text-center"
                       >
                          <Eye className="w-12 h-12 mb-4" />
                          <p className="text-lg font-medium">Selecione um disparo ao lado</p>
                          <p className="text-sm">Para visualizar o log detalhado de cada recebimento</p>
                       </motion.div>
                    ) : (
                       <motion.div 
                          key={selectedCampaign.id}
                          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                          className="space-y-4"
                       >
                           <Card className="glass-card">
                              <CardHeader className="bg-primary/5 border-b border-border/50">
                                 <div className="flex justify-between items-center">
                                    <div>
                                       <CardTitle className="text-lg">{selectedCampaign.name}</CardTitle>
                                       <CardDescription>Resumo detalhado dos envios</CardDescription>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                       <div className="bg-green-500/10 p-2 rounded-lg border border-green-500/20">
                                          <p className="text-[9px] text-green-500 font-bold uppercase">Entregues</p>
                                          <p className="text-lg font-bold text-green-500">{selectedCampaign.sent_count}</p>
                                       </div>
                                       <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                                          <p className="text-[9px] text-red-500 font-bold uppercase">Falhas</p>
                                          <p className="text-lg font-bold text-red-500">{selectedCampaign.failed_count}</p>
                                       </div>
                                    </div>
                                 </div>
                              </CardHeader>
                              <CardContent className="p-0">
                                 <div className="divide-y divide-border/50">
                                    {campaignLogs.map((log) => (
                                       <div key={log.id} className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                                          <div className="flex items-center gap-4">
                                             <div className={cn(
                                                "w-10 h-10 rounded-full flex items-center justify-center",
                                                log.status === 'success' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                             )}>
                                                {log.status === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                                             </div>
                                             <div>
                                                <p className="font-bold text-sm">{log.contact_name}</p>
                                                <p className="text-xs text-muted-foreground">{log.phone}</p>
                                             </div>
                                          </div>
                                          {log.status === 'failed' && (
                                             <div className="text-xs text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/20 flex items-center gap-2">
                                                <AlertCircle className="w-3 h-3" />
                                                {log.error_message}
                                             </div>
                                          )}
                                       </div>
                                    ))}
                                 </div>
                              </CardContent>
                           </Card>
                       </motion.div>
                    )}
                 </AnimatePresence>
              </div>
           </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default WhatsAppBroadcast;
