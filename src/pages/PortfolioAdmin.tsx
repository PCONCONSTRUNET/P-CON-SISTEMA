import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar, MobileHeader } from '@/components/Sidebar';
import { Plus, Pencil, Trash2, Loader2, Upload, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  project_url: string | null;
  image_url: string;
  order_index: number | null;
}

const PortfolioAdmin = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('portfolio_items')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching portfolio items:', error);
      toast.error('Erro ao carregar itens do portfólio');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (item?: PortfolioItem) => {
    if (item) {
      setEditingId(item.id);
      setTitle(item.title);
      setDescription(item.description || '');
      setProjectUrl(item.project_url || '');
      setCurrentImageUrl(item.image_url);
    } else {
      setEditingId(null);
      setTitle('');
      setDescription('');
      setProjectUrl('');
      setCurrentImageUrl('');
    }
    setImageFile(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setImageFile(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      toast.error('O título é obrigatório');
      return;
    }
    if (!editingId && !imageFile && !currentImageUrl) {
      toast.error('A imagem é obrigatória');
      return;
    }

    try {
      setSaving(true);
      let finalImageUrl = currentImageUrl;

      // Handle Image Upload
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('portfolio')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('portfolio')
          .getPublicUrl(filePath);

        finalImageUrl = publicUrlData.publicUrl;
      }

      const itemData = {
        title,
        description: description || null,
        project_url: projectUrl || null,
        image_url: finalImageUrl,
      };

      if (editingId) {
        const { error } = await supabase
          .from('portfolio_items')
          .update(itemData)
          .eq('id', editingId);
        
        if (error) throw error;
        toast.success('Projeto atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('portfolio_items')
          .insert([{ ...itemData, order_index: items.length }]);
          
        if (error) throw error;
        toast.success('Projeto adicionado com sucesso');
      }

      handleCloseForm();
      fetchItems();
    } catch (error) {
      console.error('Error saving portfolio item:', error);
      toast.error('Erro ao salvar o projeto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, imageUrl: string) => {
    if (!confirm('Tem certeza que deseja excluir este projeto?')) return;

    try {
      // Optional: Delete image from storage
      if (imageUrl.includes('supabase.co/storage/v1/object/public/portfolio/')) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from('portfolio').remove([fileName]);
        }
      }

      const { error } = await supabase
        .from('portfolio_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Projeto excluído com sucesso');
      fetchItems();
    } catch (error) {
      console.error('Error deleting portfolio item:', error);
      toast.error('Erro ao excluir projeto');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
      
      <main className="lg:pl-64 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Portfólio</h1>
              <p className="text-muted-foreground mt-1">Gerencie os projetos exibidos no portfólio público.</p>
            </div>
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Projeto
            </Button>
          </div>

          {/* Form Modal / Section */}
          {isFormOpen && (
            <div className="glass-card rounded-xl p-6 border border-border/50 animate-in fade-in slide-in-from-top-4">
              <h2 className="text-lg font-semibold mb-4 text-foreground">
                {editingId ? 'Editar Projeto' : 'Novo Projeto'}
              </h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Título</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 text-foreground"
                      placeholder="Nome do projeto"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Link do Projeto (Opcional)</label>
                    <input
                      type="url"
                      value={projectUrl}
                      onChange={(e) => setProjectUrl(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 text-foreground"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">Descrição (Opcional)</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3 rounded-md border border-input bg-background/50 text-foreground min-h-[100px]"
                      placeholder="Breve descrição sobre o projeto..."
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">Imagem do Projeto</label>
                    <div className="flex items-center gap-4">
                      {currentImageUrl && !imageFile && (
                        <img src={currentImageUrl} alt="Current" className="h-16 w-16 object-cover rounded-md border border-border" />
                      )}
                      <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors border border-input rounded-md hover:bg-secondary/50">
                        <Upload className="w-4 h-4" />
                        {imageFile ? imageFile.name : (currentImageUrl ? 'Trocar Imagem' : 'Fazer Upload da Imagem')}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setImageFile(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseForm} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Salvar
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* List Section */}
          <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            {loading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Nenhum projeto cadastrado no portfólio.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/30 border-b border-border/50">
                    <tr>
                      <th className="px-6 py-4 font-medium w-16"></th>
                      <th className="px-6 py-4 font-medium">Projeto</th>
                      <th className="px-6 py-4 font-medium">Link</th>
                      <th className="px-6 py-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 text-muted-foreground cursor-move">
                          <GripVertical className="w-4 h-4 opacity-50" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img src={item.image_url} alt={item.title} className="w-10 h-10 rounded-md object-cover border border-border" />
                            <div>
                              <div className="font-medium text-foreground">{item.title}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {item.description || '-'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.project_url ? (
                            <a href={item.project_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate inline-block max-w-[200px]">
                              {item.project_url}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenForm(item)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id, item.image_url)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PortfolioAdmin;
