import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ClientItemType = 'note' | 'image' | 'file' | 'credential';

export interface VaultItem {
  id: string;
  client_id: string;
  title: string;
  folder: string;
  item_type: ClientItemType;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  username: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const isImageUrl = (url: string) => /\.(jpg|jpeg|png|webp|gif|svg|avif)(\?.*)?$/i.test(url);
const isDocumentUrl = (url: string) => /\.(pdf|doc|docx|xls|xlsx|txt|csv|zip|rar)(\?.*)?$/i.test(url);

function parseVaultRow(row: any): VaultItem {
  let item_type: ClientItemType = 'note';
  let folder = row.username || 'Geral';
  let content = row.notes || null;
  let file_url = row.url || null;
  let file_name: string | null = null;
  let file_size: number | null = null;
  let username = row.username || null;
  let password = row.password || null;

  // Verifica se há payload JSON em notes
  if (row.notes && typeof row.notes === 'string' && row.notes.startsWith('{') && row.notes.endsWith('}')) {
    try {
      const parsed = JSON.parse(row.notes);
      if (parsed.__type) {
        item_type = parsed.__type;
        folder = parsed.folder || row.username || 'Geral';
        content = parsed.content ?? null;
        file_name = parsed.fileName || null;
        file_size = parsed.fileSize || null;
        username = parsed.username ?? (item_type === 'credential' ? row.username : null);
        password = parsed.password ?? (item_type === 'credential' ? row.password : null);

        return {
          id: row.id,
          client_id: row.client_id,
          title: row.title,
          folder: folder || 'Geral',
          item_type,
          content,
          file_url: row.url || null,
          file_name,
          file_size,
          username,
          password,
          url: row.url || null,
          notes: content,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
    } catch {
      // Ignora erro de JSON e segue para os fallbacks
    }
  }

  // Fallbacks para compatibilidade com registros existentes
  if (row.password === 'note') {
    item_type = 'note';
    folder = row.username || 'Geral';
    content = row.notes;
  } else if (row.password === 'image' || (row.url && isImageUrl(row.url))) {
    item_type = 'image';
    folder = row.username && !row.username.includes('@') ? row.username : 'Fotos';
    file_url = row.url;
  } else if (row.password === 'file' || (row.url && isDocumentUrl(row.url))) {
    item_type = 'file';
    folder = row.username && !row.username.includes('@') ? row.username : 'Documentos';
    file_url = row.url;
  } else if (row.password && row.password.length > 0) {
    item_type = 'credential';
    folder = row.username && !row.username.includes('@') && !row.username.includes('.') ? row.username : 'Acessos & Senhas';
  } else if (row.url && !row.password) {
    item_type = isImageUrl(row.url) ? 'image' : 'file';
    folder = row.username && !row.username.includes('@') ? row.username : 'Documentos';
  } else {
    item_type = 'note';
    folder = row.username || 'Geral';
  }

  return {
    id: row.id,
    client_id: row.client_id,
    title: row.title,
    folder: folder || 'Geral',
    item_type,
    content: content || null,
    file_url,
    file_name,
    file_size,
    username,
    password,
    url: row.url,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeVaultItem(item: {
  title: string;
  folder: string;
  item_type: ClientItemType;
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  username?: string | null;
  password?: string | null;
}) {
  const folder = (item.folder || 'Geral').trim();
  const metaNotes = JSON.stringify({
    __type: item.item_type,
    folder,
    content: item.content || '',
    fileName: item.file_name || null,
    fileSize: item.file_size || null,
    username: item.username || null,
    password: item.password || null,
  });

  return {
    title: item.title.trim(),
    username: folder,
    password: item.item_type === 'credential' ? (item.password || null) : item.item_type,
    url: item.file_url || null,
    notes: metaNotes,
  };
}

export function useClientVault(clientId: string | undefined) {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVaultItems = useCallback(async () => {
    if (!clientId) {
      setVaultItems([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('client_vault' as any)
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const parsed = ((data || []) as any[]).map(parseVaultRow);
      setVaultItems(parsed);
    } catch (error) {
      console.error('Error fetching vault items:', error);
      toast.error('Erro ao carregar arquivos e anotações do cliente');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Adicionar anotação (bloco de notas)
  const addNote = async ({
    title,
    folder,
    content,
  }: {
    title: string;
    folder: string;
    content: string;
  }) => {
    if (!clientId) return null;

    try {
      const payload = serializeVaultItem({
        title,
        folder: folder || 'Geral',
        item_type: 'note',
        content,
      });

      const { data, error } = await supabase
        .from('client_vault' as any)
        .insert({
          client_id: clientId,
          ...payload,
        })
        .select()
        .single();

      if (error) throw error;
      const parsed = parseVaultRow(data);
      setVaultItems((prev) => [parsed, ...prev]);
      toast.success('Anotação salva com sucesso!');
      return parsed;
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Erro ao salvar anotação');
      return null;
    }
  };

  // Upload de arquivo ou foto
  const uploadFile = async ({
    file,
    folder,
    title,
    notes,
  }: {
    file: File;
    folder: string;
    title?: string;
    notes?: string;
  }) => {
    if (!clientId) return null;

    try {
      const isImg = file.type.startsWith('image/');
      const fileExt = file.name.split('.').pop() || (isImg ? 'jpg' : 'bin');
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `vault/${clientId}/${Date.now()}_${cleanFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(storagePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('contracts').getPublicUrl(storagePath);

      const itemType: ClientItemType = isImg ? 'image' : 'file';
      const itemTitle = title?.trim() || file.name;
      const itemFolder = folder?.trim() || (isImg ? 'Fotos' : 'Documentos');

      const payload = serializeVaultItem({
        title: itemTitle,
        folder: itemFolder,
        item_type: itemType,
        content: notes || '',
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
      });

      const { data, error } = await supabase
        .from('client_vault' as any)
        .insert({
          client_id: clientId,
          ...payload,
        })
        .select()
        .single();

      if (error) throw error;
      const parsed = parseVaultRow(data);
      setVaultItems((prev) => [parsed, ...prev]);
      toast.success(isImg ? 'Foto enviada com sucesso!' : 'Arquivo salvo com sucesso!');
      return parsed;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Erro ao fazer upload do arquivo');
      return null;
    }
  };

  // Adicionar credencial / acesso (senha opcional)
  const addCredential = async ({
    title,
    folder,
    username,
    password,
    url,
    notes,
  }: {
    title: string;
    folder: string;
    username?: string;
    password?: string;
    url?: string;
    notes?: string;
  }) => {
    if (!clientId) return null;

    try {
      const payload = serializeVaultItem({
        title,
        folder: folder || 'Acessos & Senhas',
        item_type: 'credential',
        username: username || '',
        password: password || '',
        url: url || null,
        content: notes || '',
      });

      const { data, error } = await supabase
        .from('client_vault' as any)
        .insert({
          client_id: clientId,
          ...payload,
        })
        .select()
        .single();

      if (error) throw error;
      const parsed = parseVaultRow(data);
      setVaultItems((prev) => [parsed, ...prev]);
      toast.success('Acesso salvo com sucesso!');
      return parsed;
    } catch (error) {
      console.error('Error adding credential:', error);
      toast.error('Erro ao salvar acesso');
      return null;
    }
  };

  // Atualizar item genérico
  const updateItem = async (
    id: string,
    updates: {
      title?: string;
      folder?: string;
      content?: string | null;
      username?: string | null;
      password?: string | null;
      url?: string | null;
    }
  ) => {
    const existing = vaultItems.find((i) => i.id === id);
    if (!existing) return null;

    try {
      const updatedItemType = existing.item_type;
      const updatedFolder = (updates.folder !== undefined ? updates.folder : existing.folder) || 'Geral';
      const updatedTitle = (updates.title !== undefined ? updates.title : existing.title) || 'Sem título';
      const updatedContent = updates.content !== undefined ? updates.content : existing.content;
      const updatedUsername = updates.username !== undefined ? updates.username : existing.username;
      const updatedPassword = updates.password !== undefined ? updates.password : existing.password;
      const updatedUrl = updates.url !== undefined ? updates.url : (existing.file_url || existing.url);

      const payload = serializeVaultItem({
        title: updatedTitle,
        folder: updatedFolder,
        item_type: updatedItemType,
        content: updatedContent,
        file_url: updatedUrl,
        file_name: existing.file_name,
        file_size: existing.file_size,
        username: updatedUsername,
        password: updatedPassword,
      });

      const { data, error } = await supabase
        .from('client_vault' as any)
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const parsed = parseVaultRow(data);
      setVaultItems((prev) => prev.map((item) => (item.id === id ? parsed : item)));
      toast.success('Item atualizado com sucesso!');
      return parsed;
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Erro ao atualizar item');
      return null;
    }
  };

  // Excluir item
  const deleteItem = async (id: string, fileUrl?: string | null) => {
    try {
      const { error } = await supabase.from('client_vault' as any).delete().eq('id', id);
      if (error) throw error;

      // Se for arquivo do storage, limpa do bucket
      if (fileUrl && fileUrl.includes('/contracts/vault/')) {
        try {
          const parts = fileUrl.split('/contracts/');
          if (parts[1]) {
            await supabase.storage.from('contracts').remove([decodeURIComponent(parts[1])]);
          }
        } catch (cleanupErr) {
          console.warn('Erro ao remover arquivo do bucket:', cleanupErr);
        }
      }

      setVaultItems((prev) => prev.filter((item) => item.id !== id));
      toast.success('Item excluído com sucesso!');
      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Erro ao excluir item');
      return false;
    }
  };

  // Renomear pasta (atualiza todos os itens que pertencem a essa pasta)
  const renameFolder = async (oldName: string, newName: string) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedOld === trimmedNew) return false;

    const itemsInFolder = vaultItems.filter((i) => i.folder.toLowerCase() === trimmedOld.toLowerCase());
    if (itemsInFolder.length === 0) return true;

    try {
      for (const item of itemsInFolder) {
        await updateItem(item.id, { folder: trimmedNew });
      }
      toast.success(`Pasta renomeada para "${trimmedNew}"`);
      return true;
    } catch (error) {
      console.error('Error renaming folder:', error);
      toast.error('Erro ao renomear pasta');
      return false;
    }
  };

  // Excluir pasta inteira (exclui todos os itens ou move para 'Geral')
  const deleteFolder = async (folderName: string, moveItemsToGeneral = true) => {
    const trimmedFolder = folderName.trim();
    const itemsInFolder = vaultItems.filter((i) => i.folder.toLowerCase() === trimmedFolder.toLowerCase());

    try {
      if (moveItemsToGeneral) {
        for (const item of itemsInFolder) {
          await updateItem(item.id, { folder: 'Geral' });
        }
        toast.success(`Pasta removida e itens movidos para "Geral"!`);
      } else {
        for (const item of itemsInFolder) {
          await deleteItem(item.id, item.file_url);
        }
        toast.success(`Pasta e itens excluídos!`);
      }
      return true;
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast.error('Erro ao excluir pasta');
      return false;
    }
  };

  // Mantém retrocompatibilidade para addVaultItem, updateVaultItem, deleteVaultItem
  const addVaultItem = async (item: {
    title: string;
    username?: string;
    password?: string;
    url?: string;
    notes?: string;
  }) => {
    return addCredential({
      title: item.title,
      folder: 'Acessos & Senhas',
      username: item.username,
      password: item.password,
      url: item.url,
      notes: item.notes,
    });
  };

  const updateVaultItem = async (
    id: string,
    updates: {
      title?: string;
      username?: string;
      password?: string;
      url?: string;
      notes?: string;
    }
  ) => {
    return updateItem(id, {
      title: updates.title,
      username: updates.username,
      password: updates.password,
      url: updates.url,
      content: updates.notes,
    });
  };

  const deleteVaultItem = async (id: string) => {
    return deleteItem(id);
  };

  useEffect(() => {
    fetchVaultItems();
  }, [fetchVaultItems]);

  return {
    vaultItems,
    loading,
    addNote,
    uploadFile,
    addCredential,
    updateItem,
    deleteItem,
    renameFolder,
    deleteFolder,
    addVaultItem,
    updateVaultItem,
    deleteVaultItem,
    refetch: fetchVaultItems,
  };
}
