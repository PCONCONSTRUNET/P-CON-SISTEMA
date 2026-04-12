import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, Search, Trash2, XCircle, ExternalLink } from "lucide-react";
import { formatBrazilDate } from "@/utils/dateUtils";
import AnimatedBackground from "@/components/AnimatedBackground";
import { useMercadoPago } from "@/hooks/useMercadoPago";

const DDAEmissions = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  
  const queryClient = useQueryClient();
  const { createTicketPayment, loading: isCreating } = useMercadoPago();

  const { data: clients } = useQuery({
    queryKey: ["clients-dda"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, document, email").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: ddaList, isLoading } = useQuery({
    queryKey: ["dda-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, clients(name, document)")
        .eq("payment_method", "BOLETO")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleCreateDDA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !amount || !dueDate || !description) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const client = clients?.find(c => c.id === selectedClient);
    if (!client) return;

    try {
      // Create ticket via Mercado Pago (this function will automatically save to DB too)
      const result = await createTicketPayment({
        amount: parseFloat(amount),
        description: description,
        clientId: client.id,
        clientName: client.name,
        clientEmail: client.email || "contato@pcon.com.br", // MP requires email
        clientDocument: client.document || undefined,
        // dueDate could be passed to MP if we update the hook/edge function to support expiration_date
      });

      if (result?.success) {
        setIsModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["dda-list"] });
        
        // Reset form
        setAmount("");
        setDueDate("");
        setDescription("");
        setSelectedClient("");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Tem certeza que deseja cancelar esta emissão DDA?")) return;
    try {
      const { error } = await supabase.from("payments").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      toast.success("Emissão cancelada!");
      queryClient.invalidateQueries({ queryKey: ["dda-list"] });
    } catch (e) {
      toast.error("Erro ao cancelar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que excluir este registro? Essa ação não pode ser desfeita.")) return;
    try {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
      toast.success("Registro excluído!");
      queryClient.invalidateQueries({ queryKey: ["dda-list"] });
    } catch (e) {
      toast.error("Erro ao excluir");
    }
  };

  return (
    <DashboardLayout>
      <AnimatedBackground />
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 relative z-10 max-w-7xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Emissão DDA</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Gerencie as cobranças via Boleto (DDA) direto para atrelar ao CPF/CNPJ do cliente.
            </p>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="btn-blue gap-2 shadow-lg hover:shadow-xl transition-all h-11 w-full sm:w-auto">
                <Plus className="w-5 h-5" />
                Emitir Nova Cobrança
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-heading text-foreground">Criar DDA</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateDDA} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="bg-secondary/50"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vencimento</Label>
                    <Input
                      type="date"
                      className="bg-secondary/50"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição / Referência</Label>
                  <Input
                    type="text"
                    className="bg-secondary/50"
                    placeholder="Ex: Mensalidade, Taxa extra..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={isCreating} className="w-full btn-blue h-12 mt-4">
                  {isCreating ? "Registrando Boleto..." : "Gerar e Registrar Cobrança"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-4 bg-secondary/30 p-2 rounded-xl">
            <Search className="w-5 h-5 text-muted-foreground ml-2" />
            <Input
              placeholder="Buscar por cliente ou documento..."
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 rounded-t-xl overflow-hidden">
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl font-medium">Data Emissão</th>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Descrição</th>
                  <th className="px-6 py-4 font-medium text-right">Valor</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                  <th className="px-6 py-4 rounded-tr-xl font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : ddaList?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma cobrança DDA encontrada.
                    </td>
                  </tr>
                ) : (
                  ddaList?.map((dda) => (
                    <tr key={dda.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">
                        {formatBrazilDate(dda.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-foreground">{dda.clients?.name}</p>
                        <p className="text-xs text-muted-foreground">{dda.clients?.document || "S/ Documento"}</p>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {dda.description}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-foreground">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dda.amount)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          dda.status === 'paid' ? 'bg-success/20 text-success' :
                          dda.status === 'cancelled' ? 'bg-destructive/20 text-destructive' :
                          'bg-warning/20 text-warning'
                        }`}>
                          {dda.status === 'paid' ? "Pago" : 
                           dda.status === 'cancelled' ? "Cancelado" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {dda.status === 'pending' && (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="text-warning hover:text-warning hover:bg-warning/10"
                              onClick={() => handleCancel(dda.id)}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(dda.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DDAEmissions;
