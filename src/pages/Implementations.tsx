import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Package, 
  Clock, 
  CheckCircle, 
  XCircle,
  Eye,
  Sparkles,
  TrendingUp,
  Timer
} from 'lucide-react';
import { useImplementations, Implementation, CreateImplementationData } from '@/hooks/useImplementations';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Implementations = () => {
  const {
    implementations,
    requests,
    loading,
    fetchImplementations,
    fetchRequests,
    createImplementation,
    updateImplementation,
    deleteImplementation,
    toggleStatus,
    updateRequestStatus,
    deleteRequest
  } = useImplementations();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingImpl, setEditingImpl] = useState<Implementation | null>(null);
  const [formData, setFormData] = useState<CreateImplementationData>({
    name: '',
    description: '',
    short_description: '',
    value: 0,
    status: 'active',
    availability: 'available',
    category: '',
    tags: []
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    fetchImplementations();
    fetchRequests();
  }, [fetchImplementations, fetchRequests]);

  const handleSubmit = async () => {
    if (!formData.name || formData.value <= 0) {
      return;
    }

    let success;
    if (editingImpl) {
      success = await updateImplementation(editingImpl.id, formData);
    } else {
      success = await createImplementation(formData);
    }

    if (success) {
      setIsDialogOpen(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      short_description: '',
      value: 0,
      status: 'active',
      availability: 'available',
      category: '',
      tags: []
    });
    setEditingImpl(null);
    setTagInput('');
  };

  const handleEdit = (impl: Implementation) => {
    setEditingImpl(impl);
    setFormData({
      name: impl.name,
      description: impl.description || '',
      short_description: impl.short_description || '',
      value: impl.value,
      status: impl.status,
      availability: impl.availability,
      category: impl.category || '',
      tags: impl.tags || []
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta implantação?')) {
      await deleteImplementation(id);
    }
  };

  const addTag = () => {
    if (tagInput && !formData.tags?.includes(tagInput)) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tag) || []
    }));
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
      pending: { variant: 'secondary', label: 'Pendente' },
      approved: { variant: 'default', label: 'Aprovado' },
      rejected: { variant: 'destructive', label: 'Rejeitado' },
      completed: { variant: 'outline', label: 'Concluído' }
    };
    const config = variants[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTagIcon = (tag: string) => {
    if (tag.toLowerCase() === 'novo') return <Sparkles className="w-3 h-3" />;
    if (tag.toLowerCase() === 'popular') return <TrendingUp className="w-3 h-3" />;
    if (tag.toLowerCase() === 'em breve') return <Timer className="w-3 h-3" />;
    return null;
  };

  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;

  return (
    <DashboardLayout title="Implantações Futuras" subtitle="Gerencie sistemas e módulos disponíveis para contratação">
      <div className="space-y-6">
        <div className="flex justify-end">
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nova Implantação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingImpl ? 'Editar Implantação' : 'Nova Implantação'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Sistema/Módulo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Módulo de Relatórios Avançados"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="value">Valor (R$) *</Label>
                    <Input
                      id="value"
                      type="number"
                      step="0.01"
                      value={formData.value}
                      onChange={(e) => setFormData(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ex: 199.90"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="short_description">Descrição Curta</Label>
                  <Input
                    id="short_description"
                    value={formData.short_description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                    placeholder="Resumo em uma frase"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição Completa</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descrição detalhada do sistema/módulo"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Input
                      id="category"
                      value={formData.category || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      placeholder="Ex: Financeiro, RH, Vendas"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Disponibilidade</Label>
                    <Select
                      value={formData.availability}
                      onValueChange={(value: 'available' | 'coming_soon') => 
                        setFormData(prev => ({ ...prev, availability: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Disponível para Contratação</SelectItem>
                        <SelectItem value="coming_soon">Em Breve</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="Ex: Novo, Popular"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    />
                    <Button type="button" onClick={addTag} variant="outline">
                      Adicionar
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags?.map(tag => (
                      <Badge 
                        key={tag} 
                        variant="secondary" 
                        className="cursor-pointer gap-1"
                        onClick={() => removeTag(tag)}
                      >
                        {getTagIcon(tag)}
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="status"
                      checked={formData.status === 'active'}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, status: checked ? 'active' : 'inactive' }))
                      }
                    />
                    <Label htmlFor="status">Ativo</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={!formData.name || formData.value <= 0}>
                  {editingImpl ? 'Salvar Alterações' : 'Criar Implantação'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="implementations">
          <TabsList>
            <TabsTrigger value="implementations" className="gap-2">
              <Package className="w-4 h-4" />
              Implantações
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2">
              <Clock className="w-4 h-4" />
              Solicitações
              {pendingRequestsCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {pendingRequestsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="implementations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lista de Implantações</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </div>
                ) : implementations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma implantação cadastrada
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Disponibilidade</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {implementations.map((impl) => (
                          <TableRow key={impl.id}>
                            <TableCell className="font-medium">{impl.name}</TableCell>
                            <TableCell>{impl.category || '-'}</TableCell>
                            <TableCell>
                              {new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(impl.value)}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={impl.status === 'active'}
                                onCheckedChange={() => toggleStatus(impl.id, impl.status)}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge variant={impl.availability === 'available' ? 'default' : 'secondary'}>
                                {impl.availability === 'available' ? 'Disponível' : 'Em Breve'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {impl.tags?.map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs gap-1">
                                    {getTagIcon(tag)}
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(impl)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(impl.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Solicitações de Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma solicitação recebida
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Implantação</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Observações</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requests.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{req.client?.name || 'Cliente'}</p>
                                <p className="text-sm text-muted-foreground">{req.client?.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>{req.implementation?.name || 'N/A'}</TableCell>
                            <TableCell>
                              {req.implementation ? new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(req.implementation.value) : '-'}
                            </TableCell>
                            <TableCell>
                              {format(new Date(req.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </TableCell>
                            <TableCell>{getStatusBadge(req.status)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {req.notes || '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {req.status === 'pending' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-green-600 hover:text-green-700"
                                      onClick={() => updateRequestStatus(req.id, 'approved')}
                                      title="Aprovar"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      onClick={() => updateRequestStatus(req.id, 'rejected')}
                                      title="Rejeitar"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {req.status === 'approved' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateRequestStatus(req.id, 'completed')}
                                  >
                                    Concluir
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteRequest(req.id)}
                                  title="Excluir solicitação"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Implementations;
