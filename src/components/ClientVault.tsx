import React, { useState, useMemo, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  Image as ImageIcon,
  File,
  Download,
  ExternalLink,
  Lock,
  Key,
  Copy,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Eye,
  EyeOff,
  Maximize2,
  UploadCloud,
  Check,
  MoreVertical,
  Paperclip,
  FolderArchive,
  ArrowRight,
  ChevronsUpDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useClientVault, VaultItem, ClientItemType } from '@/hooks/useClientVault';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ClientVaultProps {
  clientId: string;
}

export default function ClientVault({ clientId }: ClientVaultProps) {
  const {
    vaultItems,
    loading,
    addNote,
    uploadFile,
    addCredential,
    updateItem,
    deleteItem,
    renameFolder,
    deleteFolder,
  } = useClientVault(clientId);

  // Estados de busca e filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  // Estados dos modais
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRenameFolderModalOpen, setIsRenameFolderModalOpen] = useState(false);

  // Visualização de imagem em tela cheia (Lightbox)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Estados de formulário
  const [targetFolderForNewItem, setTargetFolderForNewItem] = useState('Geral');
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderOldName, setRenamingFolderOldName] = useState('');
  const [renamingFolderNewName, setRenamingFolderNewName] = useState('');

  // Formulário Nova Nota
  const [noteForm, setNoteForm] = useState({
    title: '',
    folder: 'Geral',
    content: '',
  });

  // Formulário Upload Arquivo / Foto
  const [fileForm, setFileForm] = useState<{
    file: File | null;
    title: string;
    folder: string;
    notes: string;
    previewUrl: string | null;
  }>({
    file: null,
    title: '',
    folder: 'Geral',
    notes: '',
    previewUrl: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Formulário Nova Credencial
  const [credentialForm, setCredentialForm] = useState({
    title: '',
    folder: 'Acessos & Senhas',
    username: '',
    password: '',
    url: '',
    notes: '',
  });

  // Formulário Edição
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pastas conhecidas (incluindo padrões e as criadas pelo usuário)
  const [customFolders, setCustomFolders] = useState<string[]>([]);

  // Lista unificada de pastas
  const allFolderNames = useMemo(() => {
    const set = new Set<string>();
    // Pastas dos itens existentes
    vaultItems.forEach((item) => {
      if (item.folder) set.add(item.folder);
    });
    // Pastas personalizadas criadas nesta sessão
    customFolders.forEach((f) => set.add(f));
    // Se estiver vazio, adiciona pelo menos Geral
    if (set.size === 0) {
      set.add('Geral');
    }
    return Array.from(set).sort((a, b) => {
      if (a === 'Geral') return -1;
      if (b === 'Geral') return 1;
      return a.localeCompare(b);
    });
  }, [vaultItems, customFolders]);

  // Itens agrupados por pasta respeitando busca
  const { groupedItems, totalFilteredCount } = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    const filtered = vaultItems.filter((item) => {
      // Filtro de pasta selecionada no topo
      if (selectedFolderFilter !== 'all' && item.folder.toLowerCase() !== selectedFolderFilter.toLowerCase()) {
        return false;
      }
      if (!term) return true;

      const titleMatch = item.title.toLowerCase().includes(term);
      const contentMatch = item.content ? item.content.toLowerCase().includes(term) : false;
      const fileMatch = item.file_name ? item.file_name.toLowerCase().includes(term) : false;
      const usernameMatch = item.username ? item.username.toLowerCase().includes(term) : false;
      const folderMatch = item.folder.toLowerCase().includes(term);

      return titleMatch || contentMatch || fileMatch || usernameMatch || folderMatch;
    });

    const groups: Record<string, VaultItem[]> = {};

    // Inicializa pastas
    const foldersToInclude =
      selectedFolderFilter === 'all'
        ? allFolderNames
        : allFolderNames.filter((f) => f.toLowerCase() === selectedFolderFilter.toLowerCase());

    foldersToInclude.forEach((f) => {
      groups[f] = [];
    });

    // Agrupa itens
    filtered.forEach((item) => {
      const f = item.folder || 'Geral';
      if (!groups[f]) groups[f] = [];
      groups[f].push(item);
    });

    return { groupedItems: groups, totalFilteredCount: filtered.length };
  }, [vaultItems, allFolderNames, searchTerm, selectedFolderFilter]);

  // Controla se a pasta está aberta (padrão aberta)
  const isFolderOpen = (folderName: string) => {
    if (openFolders[folderName] === undefined) {
      return true; // Aberta por padrão
    }
    return openFolders[folderName];
  };

  const toggleFolder = (folderName: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderName]: !isFolderOpen(folderName),
    }));
  };

  const expandAll = () => {
    const updated: Record<string, boolean> = {};
    allFolderNames.forEach((f) => (updated[f] = true));
    setOpenFolders(updated);
  };

  const collapseAll = () => {
    const updated: Record<string, boolean> = {};
    allFolderNames.forEach((f) => (updated[f] = false));
    setOpenFolders(updated);
  };

  // Funções de Clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Abre modal de criação direcionado a uma pasta específica
  const handleOpenAddNote = (folder = 'Geral') => {
    setNoteForm({ title: '', folder, content: '' });
    setIsNoteModalOpen(true);
  };

  const handleOpenFileUpload = (folder = 'Geral') => {
    setFileForm({ file: null, title: '', folder, notes: '', previewUrl: null });
    setIsFileModalOpen(true);
  };

  const handleOpenAddCredential = (folder = 'Acessos & Senhas') => {
    setCredentialForm({
      title: '',
      folder,
      username: '',
      password: '',
      url: '',
      notes: '',
    });
    setIsCredentialModalOpen(true);
  };

  // Salvar Nova Pasta
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      toast.error('Informe o nome da pasta');
      return;
    }
    if (!customFolders.includes(trimmed)) {
      setCustomFolders((prev) => [...prev, trimmed]);
    }
    setOpenFolders((prev) => ({ ...prev, [trimmed]: true }));
    toast.success(`Pasta "${trimmed}" criada!`);
    setNewFolderName('');
    setIsFolderModalOpen(false);
  };

  // Salvar Renomear Pasta
  const handleSaveRenameFolder = async () => {
    const trimmedNew = renamingFolderNewName.trim();
    if (!trimmedNew) {
      toast.error('Informe o novo nome da pasta');
      return;
    }
    setIsSubmitting(true);
    await renameFolder(renamingFolderOldName, trimmedNew);
    setCustomFolders((prev) =>
      prev.map((f) => (f.toLowerCase() === renamingFolderOldName.toLowerCase() ? trimmedNew : f))
    );
    setOpenFolders((prev) => ({ ...prev, [trimmedNew]: true }));
    setIsSubmitting(false);
    setIsRenameFolderModalOpen(false);
  };

  // Excluir Pasta
  const handleDeleteFolderPrompt = async (folderName: string) => {
    const itemsCount = vaultItems.filter((i) => i.folder.toLowerCase() === folderName.toLowerCase()).length;
    if (itemsCount === 0) {
      setCustomFolders((prev) => prev.filter((f) => f.toLowerCase() !== folderName.toLowerCase()));
      toast.success(`Pasta "${folderName}" removida!`);
      return;
    }

    if (
      confirm(
        `A pasta "${folderName}" possui ${itemsCount} item(ns).\n\nDeseja remover a pasta e mover os itens para a pasta "Geral"?\n(Clique em Cancelar se desejar excluir tudo permanentemente)`
      )
    ) {
      await deleteFolder(folderName, true);
    } else {
      if (confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE todos os ${itemsCount} itens desta pasta?`)) {
        await deleteFolder(folderName, false);
      }
    }
  };

  // Salvar Nova Nota
  const handleSaveNote = async () => {
    if (!noteForm.title.trim()) {
      toast.error('Preencha o título da anotação');
      return;
    }
    setIsSubmitting(true);
    const result = await addNote({
      title: noteForm.title,
      folder: noteForm.folder || 'Geral',
      content: noteForm.content,
    });
    setIsSubmitting(false);

    if (result) {
      setIsNoteModalOpen(false);
      setOpenFolders((prev) => ({ ...prev, [result.folder]: true }));
    }
  };

  // Arquivo selecionado no input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    let previewUrl: string | null = null;
    if (selected.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(selected);
    }

    // Pré-preenche título com o nome limpo do arquivo sem extensão
    const baseName = selected.name.replace(/\.[^/.]+$/, '');

    setFileForm((prev) => ({
      ...prev,
      file: selected,
      title: prev.title || baseName,
      previewUrl,
    }));
  };

  // Salvar Upload de Arquivo / Foto
  const handleSaveFileUpload = async () => {
    if (!fileForm.file) {
      toast.error('Selecione um arquivo ou foto');
      return;
    }
    if (!fileForm.title.trim()) {
      toast.error('Informe um nome para o arquivo');
      return;
    }

    setIsSubmitting(true);
    const result = await uploadFile({
      file: fileForm.file,
      folder: fileForm.folder || (fileForm.file.type.startsWith('image/') ? 'Fotos' : 'Documentos'),
      title: fileForm.title,
      notes: fileForm.notes,
    });
    setIsSubmitting(false);

    if (result) {
      setIsFileModalOpen(false);
      setOpenFolders((prev) => ({ ...prev, [result.folder]: true }));
    }
  };

  // Salvar Nova Credencial (sem senha obrigatória)
  const handleSaveCredential = async () => {
    if (!credentialForm.title.trim()) {
      toast.error('Preencha o título do acesso');
      return;
    }

    setIsSubmitting(true);
    const result = await addCredential({
      title: credentialForm.title,
      folder: credentialForm.folder || 'Acessos & Senhas',
      username: credentialForm.username,
      password: credentialForm.password,
      url: credentialForm.url,
      notes: credentialForm.notes,
    });
    setIsSubmitting(false);

    if (result) {
      setIsCredentialModalOpen(false);
      setOpenFolders((prev) => ({ ...prev, [result.folder]: true }));
    }
  };

  // Abrir Modal de Edição
  const handleOpenEdit = (item: VaultItem) => {
    setEditingItem({ ...item });
    setIsEditModalOpen(true);
  };

  // Salvar Edição
  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.title.trim()) {
      toast.error('Informe o título');
      return;
    }

    setIsSubmitting(true);
    const result = await updateItem(editingItem.id, {
      title: editingItem.title,
      folder: editingItem.folder,
      content: editingItem.content,
      username: editingItem.username,
      password: editingItem.password,
      url: editingItem.url || editingItem.file_url,
    });
    setIsSubmitting(false);

    if (result) {
      setIsEditModalOpen(false);
      setEditingItem(null);
    }
  };

  // Excluir Item
  const handleDeleteItem = async (item: VaultItem) => {
    if (confirm(`Tem certeza que deseja excluir "${item.title}"?`)) {
      await deleteItem(item.id, item.file_url);
    }
  };

  // Formatação amigável de tamanho de arquivo
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="p-10 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
          <FolderArchive className="w-8 h-8 animate-pulse text-primary" />
          <p className="text-sm">Carregando pastas e arquivos do cliente...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de Ações e Cabeçalho Superior */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl font-heading flex items-center gap-2">
                <FolderArchive className="w-5 h-5 text-primary" />
                Pastas, Arquivos & Bloco de Notas
              </CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Organize anotações, fotos, documentos e acessos em pastas personalizadas
              </p>
            </div>

            {/* Botões de Ação Principal */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsFolderModalOpen(true)}
                className="gap-1.5 border-border/60 text-xs sm:text-sm hover:bg-secondary/60"
              >
                <FolderPlus className="w-4 h-4 text-primary" />
                <span>Nova Pasta</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenAddNote('Geral')}
                className="gap-1.5 border-border/60 text-xs sm:text-sm hover:bg-secondary/60"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Nova Nota</span>
              </Button>

              <Button
                size="sm"
                onClick={() => handleOpenFileUpload('Geral')}
                className="gap-1.5 text-xs sm:text-sm bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Enviar Arquivo / Foto</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-card border-border/60">
                  <DropdownMenuItem onClick={() => handleOpenAddCredential('Acessos & Senhas')} className="gap-2 text-xs">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Novo Acesso / Credencial</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={expandAll} className="gap-2 text-xs">
                    <ChevronDown className="w-4 h-4" />
                    <span>Expandir todas as pastas</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={collapseAll} className="gap-2 text-xs">
                    <ChevronRight className="w-4 h-4" />
                    <span>Recolher todas as pastas</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Campo de Busca & Atalhos de Pastas */}
          <div className="mt-4 pt-3 border-t border-border/40 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por título, texto da anotação, nome de arquivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9 bg-secondary/30 border-border/50 text-xs sm:text-sm h-9"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Pílulas de filtro rápido por pasta */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedFolderFilter('all')}
                className={cn(
                  'px-3 py-1 rounded-full whitespace-nowrap transition-colors border font-medium flex items-center gap-1.5',
                  selectedFolderFilter === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary/40 text-muted-foreground border-border/50 hover:bg-secondary/80 hover:text-foreground'
                )}
              >
                <span>Todas as Pastas</span>
                <span className="text-[10px] opacity-80 px-1.5 py-0.2 rounded-full bg-black/20">
                  {vaultItems.length}
                </span>
              </button>

              {allFolderNames.map((folderName) => {
                const count = vaultItems.filter((i) => i.folder.toLowerCase() === folderName.toLowerCase()).length;
                const isSelected = selectedFolderFilter.toLowerCase() === folderName.toLowerCase();
                return (
                  <button
                    key={folderName}
                    type="button"
                    onClick={() => setSelectedFolderFilter(isSelected ? 'all' : folderName)}
                    className={cn(
                      'px-3 py-1 rounded-full whitespace-nowrap transition-colors border font-medium flex items-center gap-1.5',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/40 text-muted-foreground border-border/50 hover:bg-secondary/80 hover:text-foreground'
                    )}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>{folderName}</span>
                    <span className="text-[10px] opacity-80 px-1.5 py-0.2 rounded-full bg-black/20">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Lista de Pastas e Itens */}
      {allFolderNames.length === 0 || (totalFilteredCount === 0 && searchTerm) ? (
        <Card className="glass-card border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderArchive className="w-12 h-12 mx-auto mb-3 opacity-40 text-primary" />
            <p className="font-medium text-foreground">
              {searchTerm ? `Nenhum resultado para "${searchTerm}"` : 'Nenhuma anotação ou arquivo salvo'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Crie pastas, salve notas rápidas do cliente, envie fotos de obras/projetos ou anexe documentos em PDF.
            </p>
            <div className="flex justify-center gap-2 mt-4">
              <Button size="sm" onClick={() => handleOpenAddNote('Geral')} className="gap-1.5">
                <FileText className="w-4 h-4" />
                Criar Anotação
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleOpenFileUpload('Geral')} className="gap-1.5">
                <UploadCloud className="w-4 h-4" />
                Enviar Arquivo / Foto
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedItems).map(([folderName, items]) => {
            const open = isFolderOpen(folderName);

            return (
              <div
                key={folderName}
                className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden transition-all shadow-sm"
              >
                {/* Cabeçalho da Pasta (Clicável para expandir/recolher) */}
                <div
                  className={cn(
                    'flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors',
                    open ? 'bg-secondary/40 border-b border-border/40' : 'hover:bg-secondary/30'
                  )}
                  onClick={() => toggleFolder(folderName)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-transform"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-primary" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    {open ? (
                      <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                    ) : (
                      <Folder className="w-5 h-5 text-primary/80 shrink-0" />
                    )}

                    <span className="font-medium text-sm sm:text-base text-foreground truncate">
                      {folderName}
                    </span>

                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground font-medium"
                    >
                      {items.length} {items.length === 1 ? 'item' : 'itens'}
                    </Badge>
                  </div>

                  {/* Ações da Pasta */}
                  <div
                    className="flex items-center gap-1 shrink-0 ml-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Adicionar</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-card border-border/60">
                        <DropdownMenuItem
                          onClick={() => handleOpenAddNote(folderName)}
                          className="gap-2 text-xs"
                        >
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <span>Nova Nota nesta pasta</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenFileUpload(folderName)}
                          className="gap-2 text-xs"
                        >
                          <UploadCloud className="w-4 h-4 text-primary" />
                          <span>Enviar Foto / Arquivo aqui</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenAddCredential(folderName)}
                          className="gap-2 text-xs"
                        >
                          <Key className="w-4 h-4 text-amber-400" />
                          <span>Novo Acesso / Credencial</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-card border-border/60">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenamingFolderOldName(folderName);
                            setRenamingFolderNewName(folderName);
                            setIsRenameFolderModalOpen(true);
                          }}
                          className="gap-2 text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Renomear pasta</span>
                        </DropdownMenuItem>
                        {folderName !== 'Geral' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteFolderPrompt(folderName)}
                              className="gap-2 text-xs text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir pasta</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Conteúdo Aberto da Pasta */}
                {open && (
                  <div className="p-3 sm:p-4 bg-background/30">
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground border border-dashed border-border/40 rounded-lg">
                        <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30 text-muted-foreground" />
                        <p className="text-xs sm:text-sm">Esta pasta está vazia.</p>
                        <div className="flex justify-center gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAddNote(folderName)}
                            className="h-7 text-xs gap-1"
                          >
                            <FileText className="w-3 h-3 text-emerald-400" />
                            + Nota
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenFileUpload(folderName)}
                            className="h-7 text-xs gap-1"
                          >
                            <UploadCloud className="w-3 h-3 text-primary" />
                            + Arquivo / Foto
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="group relative rounded-lg border border-border/40 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/30 transition-all p-3.5 flex flex-col justify-between"
                          >
                            {/* Topo do Card com Tipo e Ações */}
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {item.item_type === 'note' && (
                                    <span className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 shrink-0">
                                      <FileText className="w-4 h-4" />
                                    </span>
                                  )}
                                  {item.item_type === 'image' && (
                                    <span className="p-1.5 rounded-md bg-sky-500/10 text-sky-400 shrink-0">
                                      <ImageIcon className="w-4 h-4" />
                                    </span>
                                  )}
                                  {item.item_type === 'file' && (
                                    <span className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 shrink-0">
                                      <File className="w-4 h-4" />
                                    </span>
                                  )}
                                  {item.item_type === 'credential' && (
                                    <span className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 shrink-0">
                                      <Key className="w-4 h-4" />
                                    </span>
                                  )}

                                  <div className="min-w-0">
                                    <h4 className="font-medium text-sm text-foreground truncate" title={item.title}>
                                      {item.title}
                                    </h4>
                                    <span className="text-[10px] text-muted-foreground block">
                                      {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                      {item.file_size ? ` • ${formatFileSize(item.file_size)}` : ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleOpenEdit(item)}
                                    title="Editar"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                                    onClick={() => handleDeleteItem(item)}
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {/* Corpo conforme o Tipo de Item */}
                              {/* 1. NOTA / TEXTO */}
                              {item.item_type === 'note' && (
                                <div className="mt-2.5">
                                  <div className="p-2.5 rounded-md bg-black/20 border border-border/30 text-xs text-foreground/90 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                                    {item.content || <span className="text-muted-foreground italic">Nota sem conteúdo</span>}
                                  </div>
                                </div>
                              )}

                              {/* 2. FOTO / IMAGEM */}
                              {item.item_type === 'image' && item.file_url && (
                                <div className="mt-2.5 space-y-2">
                                  <div
                                    className="relative rounded-md overflow-hidden bg-black/30 aspect-video max-h-40 border border-border/30 cursor-pointer group/img"
                                    onClick={() => setLightboxImage({ url: item.file_url!, title: item.title })}
                                  >
                                    <img
                                      src={item.file_url}
                                      alt={item.title}
                                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                                      loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                      <span className="p-1.5 rounded-full bg-black/60 text-white text-xs flex items-center gap-1">
                                        <Maximize2 className="w-3.5 h-3.5" /> Ampliar
                                      </span>
                                    </div>
                                  </div>
                                  {item.content && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
                                  )}
                                </div>
                              )}

                              {/* 3. ARQUIVO / DOCUMENTO */}
                              {item.item_type === 'file' && (
                                <div className="mt-2.5 space-y-2">
                                  <div className="p-2.5 rounded-md bg-black/20 border border-border/30 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Paperclip className="w-4 h-4 text-primary shrink-0" />
                                      <span className="text-xs text-foreground truncate">
                                        {item.file_name || item.title}
                                      </span>
                                    </div>
                                    {item.file_size && (
                                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                        {formatFileSize(item.file_size)}
                                      </span>
                                    )}
                                  </div>
                                  {item.content && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
                                  )}
                                </div>
                              )}

                              {/* 4. CREDENCIAL / ACESSO */}
                              {item.item_type === 'credential' && (
                                <div className="mt-2.5 space-y-1.5 text-xs">
                                  {item.username && (
                                    <div className="flex items-center justify-between gap-2 bg-black/20 px-2 py-1.5 rounded border border-border/30">
                                      <span className="text-muted-foreground truncate">{item.username}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 shrink-0"
                                        onClick={() => copyToClipboard(item.username!, 'Usuário')}
                                        title="Copiar usuário"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}

                                  {item.password ? (
                                    <div className="flex items-center justify-between gap-2 bg-black/20 px-2 py-1.5 rounded border border-border/30 font-mono">
                                      <span className="text-foreground truncate">
                                        {visiblePasswords.has(item.id) ? item.password : '••••••••'}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5"
                                          onClick={() => togglePasswordVisibility(item.id)}
                                          title={visiblePasswords.has(item.id) ? 'Ocultar senha' : 'Ver senha'}
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
                                          className="h-5 w-5"
                                          onClick={() => copyToClipboard(item.password!, 'Senha')}
                                          title="Copiar senha"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-muted-foreground italic px-1">
                                      Sem senha cadastrada
                                    </div>
                                  )}

                                  {item.url && (
                                    <div className="flex items-center gap-1 pt-1">
                                      <ExternalLink className="w-3 h-3 text-primary shrink-0" />
                                      <a
                                        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline truncate"
                                      >
                                        {item.url}
                                      </a>
                                    </div>
                                  )}

                                  {item.content && (
                                    <p className="text-xs text-muted-foreground pt-1 border-t border-border/20 line-clamp-2">
                                      {item.content}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Rodapé com Botões de Ação Específicos */}
                            <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-end gap-1.5">
                              {/* Botão Copiar Texto se for Nota */}
                              {item.item_type === 'note' && item.content && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => copyToClipboard(item.content!, 'Anotação')}
                                  className="h-7 text-xs gap-1 px-2.5"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>Copiar Texto</span>
                                </Button>
                              )}

                              {/* Ações de Download / Abrir para Foto e Arquivo */}
                              {(item.item_type === 'image' || item.item_type === 'file') && item.file_url && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(item.file_url!, 'Link do arquivo')}
                                    className="h-7 text-xs gap-1 px-2"
                                    title="Copiar Link"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span className="hidden sm:inline">Link</span>
                                  </Button>

                                  <a
                                    href={item.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>{item.item_type === 'image' ? 'Ver / Baixar' : 'Abrir'}</span>
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAIS                                                    */}
      {/* ========================================================= */}

      {/* 1. MODAL NOVA NOTA (BLOCO DE NOTAS) */}
      <Dialog open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              Nova Anotação (Bloco de Notas)
            </DialogTitle>
            <DialogDescription>
              Salve lembretes, briefings, instruções ou anotações rápidas deste cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Título da Anotação *</label>
              <Input
                placeholder="Ex: Anotações da Reunião de Alinhamento"
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Salvar na Pasta</label>
              <div className="flex gap-2">
                <select
                  value={noteForm.folder}
                  onChange={(e) => setNoteForm({ ...noteForm, folder: e.target.value })}
                  className="w-full bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {allFolderNames.map((f) => (
                    <option key={f} value={f} className="bg-popover text-popover-foreground">
                      📁 {f}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFolderModalOpen(true)}
                  className="shrink-0 text-xs"
                >
                  + Nova Pasta
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Conteúdo / Texto da Nota</label>
              <Textarea
                placeholder="Digite suas anotações aqui... (suporta várias linhas, dados, informações importantes)"
                value={noteForm.content}
                onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm font-mono leading-relaxed"
                rows={7}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsNoteModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={handleSaveNote}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Anotação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. MODAL ENVIAR ARQUIVO / FOTO */}
      <Dialog open={isFileModalOpen} onOpenChange={setIsFileModalOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-primary" />
              Enviar Arquivo ou Foto
            </DialogTitle>
            <DialogDescription>
              Faça upload de fotos da obra, plantas, documentos, PDFs ou planilhas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Área de Seleção de Arquivo */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
            />

            {!fileForm.file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-secondary/30 rounded-xl p-8 text-center cursor-pointer transition-all"
              >
                <UploadCloud className="w-10 h-10 text-primary mx-auto mb-2 opacity-80" />
                <p className="text-sm font-medium text-foreground">Clique para escolher foto ou arquivo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Suporta Fotos (JPG, PNG, WEBP), PDFs, Documentos, Planilhas até 50MB
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-secondary/30 border border-border/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {fileForm.previewUrl ? (
                    <img
                      src={fileForm.previewUrl}
                      alt="Prévia"
                      className="w-12 h-12 rounded object-cover border border-border/50 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <File className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{fileForm.file.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{formatFileSize(fileForm.file.size)}</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFileForm((prev) => ({ ...prev, file: null, previewUrl: null }));
                  }}
                  className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
                >
                  Trocar
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Nome / Título do Arquivo *</label>
              <Input
                placeholder="Ex: Foto Fachada da Obra ou Contrato Assinado"
                value={fileForm.title}
                onChange={(e) => setFileForm({ ...fileForm, title: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Salvar na Pasta</label>
              <div className="flex gap-2">
                <select
                  value={fileForm.folder}
                  onChange={(e) => setFileForm({ ...fileForm, folder: e.target.value })}
                  className="w-full bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {allFolderNames.map((f) => (
                    <option key={f} value={f} className="bg-popover text-popover-foreground">
                      📁 {f}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFolderModalOpen(true)}
                  className="shrink-0 text-xs"
                >
                  + Nova Pasta
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Observação / Descrição (Opcional)</label>
              <Textarea
                placeholder="Detalhes sobre este arquivo..."
                value={fileForm.notes}
                onChange={(e) => setFileForm({ ...fileForm, notes: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsFileModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                onClick={handleSaveFileUpload}
                disabled={isSubmitting || !fileForm.file}
              >
                {isSubmitting ? 'Enviando...' : 'Salvar e Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. MODAL NOVA CREDENCIAL / ACESSO (SENHA OPCIONAL) */}
      <Dialog open={isCredentialModalOpen} onOpenChange={setIsCredentialModalOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              Novo Acesso / Credencial
            </DialogTitle>
            <DialogDescription>
              Salve dados de login, acessos a portais ou links importantes (senha não obrigatória).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Título do Acesso *</label>
              <Input
                placeholder="Ex: Acesso Painel de Controle ou Sistema ERP"
                value={credentialForm.title}
                onChange={(e) => setCredentialForm({ ...credentialForm, title: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Pasta</label>
              <select
                value={credentialForm.folder}
                onChange={(e) => setCredentialForm({ ...credentialForm, folder: e.target.value })}
                className="w-full bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {allFolderNames.map((f) => (
                  <option key={f} value={f} className="bg-popover text-popover-foreground">
                    📁 {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Usuário / Email (Opcional)</label>
              <Input
                placeholder="usuario@email.com"
                value={credentialForm.username}
                onChange={(e) => setCredentialForm({ ...credentialForm, username: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Senha (Opcional - pode deixar em branco)</label>
              <Input
                type="text"
                placeholder="•••••••• (deixe vazio se não tiver senha)"
                value={credentialForm.password}
                onChange={(e) => setCredentialForm({ ...credentialForm, password: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Link / URL de Acesso (Opcional)</label>
              <Input
                placeholder="https://exemplo.com.br/login"
                value={credentialForm.url}
                onChange={(e) => setCredentialForm({ ...credentialForm, url: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Observações Adicionais</label>
              <Textarea
                placeholder="Instruções de acesso..."
                value={credentialForm.notes}
                onChange={(e) => setCredentialForm({ ...credentialForm, notes: e.target.value })}
                className="bg-secondary/40 border-border/50 text-sm"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsCredentialModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveCredential}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Salvando...' : 'Salvar Acesso'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. MODAL NOVA PASTA */}
      <Dialog open={isFolderModalOpen} onOpenChange={setIsFolderModalOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" />
              Criar Nova Pasta
            </DialogTitle>
            <DialogDescription>
              Crie uma pasta para organizar os dados do cliente (ex: Fotos da Obra, Reuniões, Documentos).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Nome da Pasta *</label>
              <Input
                placeholder="Ex: Fotos do Projeto ou Reuniões 2026"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                className="bg-secondary/40 border-border/50 text-sm"
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsFolderModalOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleCreateFolder}>
                Criar Pasta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 5. MODAL RENOMEAR PASTA */}
      <Dialog open={isRenameFolderModalOpen} onOpenChange={setIsRenameFolderModalOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" />
              Renomear Pasta
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Novo Nome para "{renamingFolderOldName}"</label>
              <Input
                value={renamingFolderNewName}
                onChange={(e) => setRenamingFolderNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRenameFolder();
                }}
                className="bg-secondary/40 border-border/50 text-sm"
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsRenameFolderModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSaveRenameFolder} disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Renomear'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. MODAL EDITAR ITEM */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" />
              Editar Item
            </DialogTitle>
          </DialogHeader>

          {editingItem && (
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Título / Nome *</label>
                <Input
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="bg-secondary/40 border-border/50 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Mover para Pasta</label>
                <select
                  value={editingItem.folder}
                  onChange={(e) => setEditingItem({ ...editingItem, folder: e.target.value })}
                  className="w-full bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {allFolderNames.map((f) => (
                    <option key={f} value={f} className="bg-popover text-popover-foreground">
                      📁 {f}
                    </option>
                  ))}
                </select>
              </div>

              {editingItem.item_type === 'note' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Conteúdo da Anotação</label>
                  <Textarea
                    value={editingItem.content || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                    className="bg-secondary/40 border-border/50 text-sm font-mono leading-relaxed"
                    rows={8}
                  />
                </div>
              )}

              {editingItem.item_type === 'credential' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Usuário / Email</label>
                    <Input
                      value={editingItem.username || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, username: e.target.value })}
                      className="bg-secondary/40 border-border/50 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Senha</label>
                    <Input
                      value={editingItem.password || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, password: e.target.value })}
                      className="bg-secondary/40 border-border/50 text-sm font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">URL</label>
                    <Input
                      value={editingItem.url || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })}
                      className="bg-secondary/40 border-border/50 text-sm"
                    />
                  </div>
                </>
              )}

              {(editingItem.item_type === 'image' || editingItem.item_type === 'file') && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Descrição / Observações</label>
                  <Textarea
                    value={editingItem.content || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                    className="bg-secondary/40 border-border/50 text-sm"
                    rows={3}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSaveEdit} disabled={isSubmitting}>
                  {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 7. LIGHTBOX (VISUALIZAÇÃO DE FOTO EM TELA CHEIA) */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in-0 duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <a
              href={lightboxImage.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Baixar imagem"
            >
              <Download className="w-5 h-5" />
            </a>
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="max-w-[90vw] max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.title}
              className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl border border-white/10"
            />
            <p className="text-white/90 text-sm font-medium mt-3 text-center">{lightboxImage.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
