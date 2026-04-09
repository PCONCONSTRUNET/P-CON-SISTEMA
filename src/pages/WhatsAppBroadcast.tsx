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
  Info
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
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Contact {
  id: string;
  phone: string;
  name: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
}

const WhatsAppBroadcast = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inputText, setInputText] = useState('');
  const [message, setMessage] = useState('Olá {nome}, tudo bem?\n\nPassando para informar que...');
  const [imageUrl, setImageUrl] = useState('');
  const [sendImage, setSendImage] = useState(false);
  const [interval, setInterval] = useState([10, 20]); // min, max seconds
  const [isSending, setIsSending] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [stats, setStats] = useState({ sent: 0, failed: 0, total: 0 });
  const [defaultDdd, setDefaultDdd] = useState('11');
  
  const stopRef = useRef(false);

  // Smart Detector "IA"
  const detectContacts = () => {
    if (!inputText.trim()) return;

    const lines = inputText.split('\n');
    const newContacts: Contact[] = [];
    
    lines.forEach(line => {
      // Basic cleaning
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Try to find numbers (matches sequences of 8-13 digits)
      const numberMatches = cleanLine.replace(/\D/g, '');
      
      let phone = '';
      let name = 'Cliente';

      // Logic to identify name vs number in dirty text
      // If the line has words and numbers, try to separate
      const words = cleanLine.split(/[\s\t,;]+/);
      const nameParts: string[] = [];
      
      words.forEach(word => {
        const onlyDigits = word.replace(/\D/g, '');
        if (onlyDigits.length >= 8 && onlyDigits.length <= 13 && !phone) {
          phone = onlyDigits;
        } else if (isNaN(Number(word.replace(/[()-]/g, ''))) || word.length < 5) {
          nameParts.push(word);
        }
      });

      if (phone) {
        // Format to Full International
        if (phone.length === 8 || phone.length === 9) phone = defaultDdd + phone;
        if (!phone.startsWith('55')) phone = '55' + phone;

        // Try to refine name from non-numeric parts
        const detectedName = nameParts.join(' ').replace(/[0-9()-]/g, '').trim();
        if (detectedName.length > 2) name = detectedName;

        newContacts.push({
          id: Math.random().toString(36).substring(7),
          phone,
          name,
          status: 'pending'
        });
      }
    });

    if (newContacts.length > 0) {
      setContacts(prev => [...prev, ...newContacts]);
      setInputText('');
      toast.success(`${newContacts.length} contatos detectados!`);
    } else {
      toast.error('Nenhum número válido encontrado no texto.');
    }
  };

  const clearContacts = () => {
    if (isSending) return;
    setContacts([]);
    setStats({ sent: 0, failed: 0, total: 0 });
    setCurrentIndex(-1);
  };

  // Broadcast Engine
  const startBroadcast = async () => {
    if (contacts.length === 0) return;
    setIsSending(true);
    setIsPaused(false);
    stopRef.current = false;
    
    const pendingContacts = contacts.filter(c => c.status === 'pending');
    setStats(prev => ({ ...prev, total: contacts.length }));

    for (let i = 0; i < contacts.length; i++) {
      if (stopRef.current) break;
      if (contacts[i].status !== 'pending') continue;

      setCurrentIndex(i);
      
      // Update status to sending
      setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'sending' } : c));

      try {
        const personalizedMessage = message.replace(/{nome}/g, contacts[i].name);
        
        const { data, error } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            phone: contacts[i].phone,
            message: personalizedMessage,
            clientId: null, // Mass broadcast doesn't strictly need a CRM clientId link
            type: 'broadcast',
            sendImage,
            imageUrl: imageUrl || undefined
          }
        });

        if (error || !data?.success) {
          throw new Error(error?.message || data?.error || 'Erro na API');
        }

        setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'sent' } : c));
        setStats(prev => ({ ...prev, sent: prev.sent + 1 }));
      } catch (err: any) {
        setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'failed', error: err.message } : c));
        setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }

      // Wait interval before next
      if (i < contacts.length - 1 && !stopRef.current) {
        const waitTime = Math.floor(Math.random() * (interval[1] - interval[0] + 1) + interval[0]) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    setIsSending(false);
    setCurrentIndex(-1);
    toast.success('Disparo finalizado!');
  };

  const stopBroadcast = () => {
    stopRef.current = true;
    setIsSending(false);
    toast.info('Disparo interrompido.');
  };

  const progress = contacts.length > 0 ? (stats.sent + stats.failed) / contacts.length * 100 : 0;

  return (
    <DashboardLayout title="WhatsApp Broadcast" subtitle="Envio de mensagens em massa com controle anti-bloqueio">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Lado Esquerdo: Configurações */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* 1. Importador Inteligente */}
          <Card className="glass-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Smart Detector</CardTitle>
                    <CardDescription>Cole sua lista suja aqui (Excel, Bloco, etc)</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="ddd" className="text-xs text-muted-foreground">DDD Padrão:</Label>
                  <Input 
                    id="ddd"
                    value={defaultDdd} 
                    onChange={e => setDefaultDdd(e.target.value)}
                    className="w-12 h-8 text-center px-1"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <Textarea 
                placeholder="Exemplo de texto sujo:&#10;João da silva (11) 99999-9999&#10;Maria Santos; 21988887777&#10;VENDEDOR Pedro: 31 9 7777-6666"
                className="min-h-[120px] bg-secondary/30 font-mono text-sm"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
              />
              <Button 
                onClick={detectContacts} 
                className="w-full gap-2 shadow-lg shadow-primary/20"
                disabled={!inputText.trim() || isSending}
              >
                <Search className="w-4 h-4" />
                Analisar e Adicionar Contatos
              </Button>
            </CardContent>
          </Card>

          {/* 2. Mensagem e Mídia */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Conteúdo da Campanha</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <Label>Texto da Mensagem</Label>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Variável: {'{nome}'}</span>
                </div>
                <Textarea 
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="min-h-[150px] bg-secondary/30"
                  placeholder="Olá {nome}..."
                />
              </div>

              <div className="pt-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <Label className="cursor-pointer" htmlFor="send-img">Anexar Imagem</Label>
                  </div>
                  <Switch 
                    id="send-img" 
                    checked={sendImage} 
                    onCheckedChange={setSendImage} 
                  />
                </div>
                
                <AnimatePresence>
                  {sendImage && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <Input 
                        placeholder="Link da imagem (https://...)"
                        value={imageUrl}
                        onChange={e => setImageUrl(e.target.value)}
                        className="bg-secondary/30"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          {/* 3. Configurações de Envio */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Intervalo entre Mensagens</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Mínimo: <strong>{interval[0]}s</strong></span>
                  <span>Máximo: <strong>{interval[1]}s</strong></span>
                </div>
                <Slider 
                  defaultValue={interval} 
                  max={60} 
                  min={2} 
                  step={1} 
                  onValueChange={setInterval}
                  className="py-4"
                />
                <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <Info className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-200/80 leading-relaxed">
                    <strong>Dica Anti-Spam:</strong> Mantenha intervalos acima de 10s para envios pequenos e acima de 30s para listas grandes. Isso evita que o WhatsApp detecte padrões automatizados.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lado Direito: Preview e Status */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Progress Dashboard */}
          <Card className="glass-card border-primary/20 bg-primary/5">
            <CardContent className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Status do Disparo
                </h3>
                <Badge variant={isSending ? 'default' : 'outline'} className={isSending ? 'animate-pulse' : ''}>
                  {isSending ? 'Processando' : 'Aguardando'}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-xl bg-background/50 border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="text-2xl font-bold">{contacts.length}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <p className="text-[10px] text-green-500 uppercase">Sucesso</p>
                  <p className="text-2xl font-bold text-green-500">{stats.sent}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] text-red-500 uppercase">Falhas</p>
                  <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Progresso Geral</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="flex gap-3">
                {!isSending ? (
                  <Button 
                    variant="default" 
                    className="flex-1 gap-2 h-12 text-lg" 
                    onClick={startBroadcast}
                    disabled={contacts.length === 0}
                  >
                    <Play className="w-5 h-5" />
                    Iniciar Campanha
                  </Button>
                ) : (
                  <Button 
                    variant="destructive" 
                    className="flex-1 gap-2 h-12 text-lg" 
                    onClick={stopBroadcast}
                  >
                    <Square className="w-5 h-5 fill-current" />
                    Parar Disparo
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-12 w-12"
                  onClick={clearContacts}
                  disabled={isSending}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Fila de Contatos */}
          <Card className="glass-card">
            <CardHeader className="p-4 border-b border-border/50">
              <CardTitle className="text-sm">Fila de Envio ({contacts.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[400px] overflow-y-auto">
              <div className="divide-y divide-border/50">
                {contacts.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground space-y-2">
                    <Phone className="w-8 h-8 mx-auto opacity-20" />
                    <p className="text-sm">Nenhum contato na lista</p>
                  </div>
                ) : (
                  contacts.map((contact, idx) => (
                    <div 
                      key={contact.id} 
                      className={cn(
                        "p-3 flex items-center justify-between transition-colors",
                        currentIndex === idx ? "bg-primary/10" : "",
                        contact.status === 'sent' ? "opacity-50" : ""
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                          contact.status === 'sent' ? "bg-green-500/20 text-green-500" : 
                          contact.status === 'failed' ? "bg-red-500/20 text-red-500" :
                          contact.status === 'sending' ? "bg-primary/20 text-primary animate-pulse" :
                          "bg-secondary text-muted-foreground"
                        )}>
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{contact.name}</p>
                          <p className="text-[10px] text-muted-foreground">+{contact.phone}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {contact.status === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                        {contact.status === 'sent' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {contact.status === 'failed' && (
                          <div className="flex items-center gap-1 group relative">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <AlertCircle className="w-3 h-3 text-red-400 cursor-help" />
                            <div className="absolute right-full mr-2 hidden group-hover:block bg-red-900/90 text-[10px] p-2 rounded w-32 z-50">
                              {contact.error}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Visualização da Mensagem */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground ml-1">PREVIEW DO WHATSAPP</Label>
            <div className="p-4 rounded-2xl bg-[#0b141a] border border-white/5 relative overflow-hidden">
               {/* Background pattern placeholder */}
               <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
               
               <div className="relative space-y-3">
                  {sendImage && imageUrl && (
                     <div className="bg-[#202c33] p-1 rounded-lg w-full max-w-[280px]">
                        <img src={imageUrl} alt="Preview" className="w-full h-auto rounded-md" />
                     </div>
                  )}
                  
                  <div className="bg-[#005c4b] text-white p-3 rounded-lg rounded-tl-none max-w-[85%] relative shadow-sm">
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">
                      {message.replace(/{nome}/g, contacts[0]?.name || 'Cliente')}
                    </p>
                    <span className="text-[9px] text-white/50 block text-right mt-1">21:38</span>
                    {/* Tail */}
                    <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-[#005c4b] border-l-[8px] border-l-transparent" />
                  </div>
               </div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppBroadcast;
