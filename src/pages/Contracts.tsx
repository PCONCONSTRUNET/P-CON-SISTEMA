import { useState, useRef } from 'react';
import { Search, Plus, FileSignature, ExternalLink, Trash2, Loader2, Download, Eye } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface Contract {
  id: string;
  client_id: string;
  title: string;
  content: string | null;
  file_path: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  client?: {
    name: string;
    email: string;
  };
}

const Contracts = () => {
  const [search, setSearch] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [newContract, setNewContract] = useState({ title: '', content: '', clientId: '' });
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { clients } = useClients();

  const fetchContracts = async () => {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          client:clients(name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const uploadFile = async (file: File, clientId: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Erro ao fazer upload do arquivo');
      return null;
    }
  };

  const handleAddContract = async () => {
    if (!newContract.title || !newContract.clientId) {
      toast.error('Preencha o título e selecione um cliente');
      return;
    }

    setIsCreating(true);
    try {
      let filePath: string | null = null;

      if (contractFile) {
        filePath = await uploadFile(contractFile, newContract.clientId);
      }

      const { error } = await supabase
        .from('contracts')
        .insert([{
          client_id: newContract.clientId,
          title: newContract.title,
          content: newContract.content || null,
          file_path: filePath,
          status: 'active'
        }]);

      if (error) throw error;
      
      toast.success('Contrato cadastrado com sucesso!');
      setNewContract({ title: '', content: '', clientId: '' });
      setContractFile(null);
      setIsDialogOpen(false);
      fetchContracts();
    } catch (error) {
      console.error('Error adding contract:', error);
      toast.error('Erro ao cadastrar contrato');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteContract = async (contract: Contract) => {
    try {
      if (contract.file_path) {
        const urlParts = contract.file_path.split('/contracts/');
        if (urlParts[1]) {
          await supabase.storage.from('contracts').remove([urlParts[1]]);
        }
      }

      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', contract.id);

      if (error) throw error;
      
      toast.success('Contrato removido com sucesso!');
      fetchContracts();
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast.error('Erro ao remover contrato');
    }
  };

  const filteredContracts = contracts.filter(contract =>
    contract.title.toLowerCase().includes(search.toLowerCase()) ||
    contract.client?.name.toLowerCase().includes(search.toLowerCase()) ||
    contract.client?.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout 
      title="Contratos" 
      subtitle="Gerencie os contratos dos clientes"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar contrato ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-10 sm:h-11 gap-2">
              <Plus className="w-4 h-4" />
              <span>Novo Contrato</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Novo Contrato</DialogTitle>
              <DialogDescription>
                Adicione um novo contrato para um cliente
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente *</label>
                <Select 
                  value={newContract.clientId} 
                  onValueChange={(value) => setNewContract({ ...newContract, clientId: value })}
                >
                  <SelectTrigger className="bg-secondary/50 border-border/50">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Título do Contrato *</label>
                <Input
                  placeholder="Ex: Contrato de Prestação de Serviços"
                  value={newContract.title}
                  onChange={(e) => setNewContract({ ...newContract, title: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Documento Assinado (PDF)</label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    ref={fileInputRef}
                    onChange={(e) => setContractFile(e.target.files?.[0] || null)}
                    className="bg-secondary/50 border-border/50"
                  />
                  {contractFile && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        setContractFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
                {contractFile && (
                  <p className="text-xs text-muted-foreground">
                    Arquivo: {contractFile.name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Texto do Contrato</label>
                <Textarea
                  placeholder="Digite o conteúdo do contrato aqui..."
                  value={newContract.content}
                  onChange={(e) => setNewContract({ ...newContract, content: e.target.value })}
                  className="bg-secondary/50 border-border/50 min-h-[150px]"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 border-border/50"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setNewContract({ title: '', content: '', clientId: '' });
                    setContractFile(null);
                  }}
                  disabled={isCreating}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleAddContract}
                  disabled={isCreating}
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <Card className="glass-card border-border/50">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-foreground">{contracts.length}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-success">
              {contracts.filter(c => c.file_path).length}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">Com Documento</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 col-span-2 sm:col-span-1">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-primary">
              {new Set(contracts.map(c => c.client_id)).size}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">Clientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Contracts List */}
      {loading ? (
        <div className="glass-card p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <FileSignature className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Nenhum contrato encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContracts.map((contract) => (
            <div 
              key={contract.id} 
              className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileSignature className="w-5 h-5 text-primary flex-shrink-0" />
                  <p className="font-medium text-foreground truncate">{contract.title}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Cliente: {contract.client?.name || 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Criado em {format(new Date(contract.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {contract.content && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setSelectedContract(contract);
                      setIsViewDialogOpen(true);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                    Ver Texto
                  </Button>
                )}
                {contract.file_path && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => window.open(contract.file_path!, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Documento
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDeleteContract(contract)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Contract Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-2xl mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{selectedContract?.title}</DialogTitle>
            <DialogDescription>
              Cliente: {selectedContract?.client?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 p-4 bg-secondary/30 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
              {selectedContract?.content}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Contracts;
