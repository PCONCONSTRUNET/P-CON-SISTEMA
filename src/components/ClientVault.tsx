import { useState } from 'react';
import { Lock, Plus, Eye, EyeOff, Edit2, Trash2, Copy, ExternalLink, Key, User, Globe, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useClientVault, VaultItem } from '@/hooks/useClientVault';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface ClientVaultProps {
  clientId: string;
}

export default function ClientVault({ clientId }: ClientVaultProps) {
  const { vaultItems, loading, addVaultItem, updateVaultItem, deleteVaultItem } = useClientVault(clientId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newItem, setNewItem] = useState({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
  });

  const handleAdd = async () => {
    if (!newItem.title) {
      toast.error('Por favor, preencha o título');
      return;
    }

    setIsSubmitting(true);
    const result = await addVaultItem(newItem);
    setIsSubmitting(false);

    if (result) {
      setNewItem({ title: '', username: '', password: '', url: '', notes: '' });
      setIsDialogOpen(false);
    }
  };

  const handleEdit = async () => {
    if (!editingItem || !editingItem.title) {
      toast.error('Por favor, preencha o título');
      return;
    }

    setIsSubmitting(true);
    const result = await updateVaultItem(editingItem.id, {
      title: editingItem.title,
      username: editingItem.username || undefined,
      password: editingItem.password || undefined,
      url: editingItem.url || undefined,
      notes: editingItem.notes || undefined,
    });
    setIsSubmitting(false);

    if (result) {
      setEditingItem(null);
      setIsEditDialogOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta credencial?')) {
      await deleteVaultItem(id);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const openEdit = (item: VaultItem) => {
    setEditingItem({ ...item });
    setIsEditDialogOpen(true);
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="p-6 text-center text-muted-foreground">
          Carregando cofre...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-border/50">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          Cofre de Dados ({vaultItems.length})
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Credencial
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl flex items-center gap-2">
                <Key className="w-5 h-5" />
                Nova Credencial
              </DialogTitle>
              <DialogDescription>
                Salve informações confidenciais de forma segura
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título *</label>
                <Input
                  placeholder="Ex: Acesso ao Painel Admin"
                  value={newItem.title}
                  onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuário / Email</label>
                <Input
                  placeholder="usuario@email.com"
                  value={newItem.username}
                  onChange={(e) => setNewItem({ ...newItem, username: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Senha</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={newItem.password}
                  onChange={(e) => setNewItem({ ...newItem, password: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">URL</label>
                <Input
                  placeholder="https://exemplo.com/admin"
                  value={newItem.url}
                  onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  placeholder="Anotações adicionais..."
                  value={newItem.notes}
                  onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 border-border/50"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleAdd}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="p-4">
        {vaultItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Lock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma credencial salva</p>
            <p className="text-sm">Clique em "Nova Credencial" para adicionar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vaultItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                      <Key className="w-4 h-4 text-primary flex-shrink-0" />
                      {item.title}
                    </h4>
                    
                    {item.username && (
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground truncate">{item.username}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(item.username!, 'Usuário')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {item.password && (
                      <div className="flex items-center gap-2 mt-1 text-sm">
                        <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground font-mono">
                          {visiblePasswords.has(item.id) ? item.password : '••••••••'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => togglePasswordVisibility(item.id)}
                        >
                          {visiblePasswords.has(item.id) ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(item.password!, 'Senha')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {item.url && (
                      <div className="flex items-center gap-2 mt-1 text-sm">
                        <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate"
                        >
                          {item.url}
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => window.open(item.url!, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {item.notes && (
                      <div className="flex items-start gap-2 mt-2 text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <p className="text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-2">
                      Criado em {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(item)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Editar Credencial
            </DialogTitle>
          </DialogHeader>
          
          {editingItem && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título *</label>
                <Input
                  placeholder="Ex: Acesso ao Painel Admin"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuário / Email</label>
                <Input
                  placeholder="usuario@email.com"
                  value={editingItem.username || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, username: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Senha</label>
                <Input
                  type="text"
                  placeholder="••••••••"
                  value={editingItem.password || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, password: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">URL</label>
                <Input
                  placeholder="https://exemplo.com/admin"
                  value={editingItem.url || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea
                  placeholder="Anotações adicionais..."
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 border-border/50"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleEdit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
