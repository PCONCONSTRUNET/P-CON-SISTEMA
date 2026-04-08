import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Check, 
  ChevronsUpDown, 
  Send, 
  Loader2, 
  MessageSquare,
  AlertCircle 
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useClients";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ManualWhatsAppDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    template_key: string;
    name: string;
    message_template: string;
    image_url: string | null;
    button_enabled: boolean;
    button_text: string | null;
    button_url: string | null;
  } | null;
}

export function ManualWhatsAppDialog({ 
  isOpen, 
  onOpenChange, 
  template 
}: ManualWhatsAppDialogProps) {
  const { clients, loading: loadingClients } = useClients();
  const { subscriptions, loading: loadingSubs } = useSubscriptions();
  
  const [openSelector, setOpenSelector] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  
  const selectedClient = clients.find(c => c.id === selectedClientId);
  const activeSub = subscriptions.find(s => s.client_id === selectedClientId && s.status === 'active');

  const getFormattedMessage = () => {
    if (!template || !selectedClient) return "";
    
    let msg = template.message_template;
    const amount = activeSub ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activeSub.value) : "R$ 0,00";
    const planName = activeSub?.plan_name || "Plano";

    return msg
      .replace(/\{\{client_name\}\}/g, selectedClient.name)
      .replace(/\{\{plan_name\}\}/g, planName)
      .replace(/\{\{amount\}\}/g, amount);
  };

  const handleSend = async () => {
    if (!selectedClient || !template) return;
    
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: selectedClient.phone,
          message: getFormattedMessage(),
          clientId: selectedClient.id,
          type: template.template_key,
          imageUrl: template.image_url,
          sendButton: template.button_enabled,
          buttonText: template.button_text,
          buttonUrl: template.button_url
        }
      });

      if (error) throw error;
      
      toast.success(`Mensagem enviada com sucesso para ${selectedClient.name}!`);
      onOpenChange(false);
      setSelectedClientId("");
    } catch (error) {
      console.error("Error sending manual WhatsApp:", error);
      toast.error("Erro ao enviar mensagem. Verifique a conexão.");
    } finally {
      setIsSending(false);
    }
  };

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedClientId("");
    }
  }, [isOpen]);

  if (!template) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] glass-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Envio Manual: {template.name}
          </DialogTitle>
          <DialogDescription>
            Selecione o cliente para enviar este lembrete personalizado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Client Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Selecionar Cliente</label>
            <Popover open={openSelector} onOpenChange={setOpenSelector}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openSelector}
                  className="w-full justify-between bg-secondary/30 border-border/50 text-left h-auto py-2 px-3"
                  disabled={loadingClients}
                >
                  <span className="truncate">
                    {selectedClientId
                      ? clients.find((c) => c.id === selectedClientId)?.name
                      : "Escolha um cliente..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 glass-card">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {clients.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setSelectedClientId(c.id);
                            setOpenSelector(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedClientId === c.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Client & Sub Info */}
          {selectedClient && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-foreground">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.phone || "Sem telefone"}</p>
                </div>
                {activeSub ? (
                   <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 border-none">
                    Assinatura Ativa
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/20">
                    Sem Assinatura Ativa
                  </Badge>
                )}
              </div>
              
              {activeSub && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-primary/10">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Plano</p>
                    <p className="text-sm">{activeSub.plan_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Valor</p>
                    <p className="text-sm">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activeSub.value)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {selectedClient && activeSub && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Prévia da Mensagem
              </label>
              <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 text-sm whitespace-pre-wrap leading-relaxed italic text-muted-foreground">
                "{getFormattedMessage()}"
              </div>
            </div>
          )}

          {selectedClient && !activeSub && !loadingSubs && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-sm border border-amber-500/20">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Este cliente não possui uma assinatura ativa. O lembrete pode não ser preenchido corretamente.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedClient || isSending}
            className="gap-2"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar Agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
