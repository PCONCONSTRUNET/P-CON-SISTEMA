import { useState } from 'react';
import { Flag, Plus, Trash2, Pencil, Check, X, DollarSign, RefreshCw, Tag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useClientFlags, FLAG_COLOR_MAP, FlagColor, ClientFlag, CreateClientFlag } from '@/hooks/useClientFlags';
import { Client } from '@/hooks/useClients';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientFlagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
}

const FLAG_COLORS: FlagColor[] = ['blue', 'green', 'yellow', 'red', 'purple', 'orange', 'pink', 'gray'];

const emptyForm = (): CreateClientFlag & { client_id: string } => ({
  client_id: '',
  title: '',
  description: '',
  amount: null,
  color: 'blue' as FlagColor,
  is_recurring: false,
});

export const ClientFlagsDialog = ({ open, onOpenChange, client }: ClientFlagsDialogProps) => {
  const { flags, loading, addFlag, updateFlag, deleteFlag } = useClientFlags(client?.id);

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm(emptyForm());
    setIsCreating(false);
    setEditingId(null);
  };

  const startCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm(), client_id: client?.id || '' });
    setIsCreating(true);
  };

  const startEdit = (flag: ClientFlag) => {
    setIsCreating(false);
    setEditingId(flag.id);
    setForm({
      client_id: flag.client_id,
      title: flag.title,
      description: flag.description || '',
      amount: flag.amount,
      color: flag.color,
      is_recurring: flag.is_recurring,
    });
  };

  const handleSaveNew = async () => {
    if (!form.title.trim() || !client) return;
    setSaving(true);
    const result = await addFlag({ ...form, client_id: client.id });
    setSaving(false);
    if (result) resetForm();
  };

  const handleSaveEdit = async () => {
    if (!editingId || !form.title.trim()) return;
    setSaving(true);
    const result = await updateFlag(editingId, {
      title: form.title,
      description: form.description || null,
      amount: form.amount,
      color: form.color,
      is_recurring: form.is_recurring,
    });
    setSaving(false);
    if (result) resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteFlag(id);
  };

  const totalDeductions = flags
    .filter(f => f.amount !== null && f.amount > 0)
    .reduce((acc, f) => acc + (f.amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-lg mx-auto max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            Marcações do Cliente
          </DialogTitle>
          <DialogDescription>
            Gerencie marcações e observações financeiras para <strong>{client?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">

          {/* Summary card */}
          {flags.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{flags.length} marcação{flags.length !== 1 ? 'ões' : ''}</span>
              </div>
              {totalDeductions > 0 && (
                <div className="flex items-center gap-1 text-sm font-semibold text-orange-400">
                  <DollarSign className="w-4 h-4" />
                  <span>
                    Deduções: R$ {totalDeductions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Inline Create Form */}
          {isCreating && (
            <FlagForm
              form={form}
              setForm={setForm}
              onSave={handleSaveNew}
              onCancel={resetForm}
              saving={saving}
              title="Nova Marcação"
            />
          )}

          {/* Existing Flags */}
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : flags.length === 0 && !isCreating ? (
            <div className="py-10 text-center space-y-2">
              <Flag className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhuma marcação ainda.</p>
              <p className="text-xs text-muted-foreground/60">Clique em "Nova Marcação" para adicionar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flags.map(flag => (
                editingId === flag.id ? (
                  <FlagForm
                    key={flag.id}
                    form={form}
                    setForm={setForm}
                    onSave={handleSaveEdit}
                    onCancel={resetForm}
                    saving={saving}
                    title="Editar Marcação"
                  />
                ) : (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                  />
                )
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-2 border-t border-border/30 mt-2">
          {!isCreating && !editingId && (
            <Button size="sm" className="gap-2" onClick={startCreate}>
              <Plus className="w-4 h-4" />
              Nova Marcação
            </Button>
          )}
          <Button variant="outline" size="sm" className="ml-auto border-border/50" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Flag Card ────────────────────────────────────────────── */
interface FlagCardProps {
  flag: ClientFlag;
  onEdit: (flag: ClientFlag) => void;
  onDelete: (id: string) => void;
}

const FlagCard = ({ flag, onEdit, onDelete }: FlagCardProps) => {
  const colors = FLAG_COLOR_MAP[flag.color] || FLAG_COLOR_MAP.blue;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${colors.bg} ${colors.border} group transition-all`}>
      {/* Color dot */}
      <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.bg.replace('/20', '')} ${colors.text}`}
        style={{ backgroundColor: 'currentColor' }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${colors.text}`}>{flag.title}</span>
          {flag.is_recurring && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 border-border/40">
              <RefreshCw className="w-2.5 h-2.5" />
              Recorrente
            </Badge>
          )}
          {flag.amount !== null && flag.amount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 text-orange-400 border-orange-400/30">
              <DollarSign className="w-2.5 h-2.5" />
              R$ {flag.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Badge>
          )}
        </div>
        {flag.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{flag.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground/50 mt-1">
          {format(new Date(flag.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:text-primary"
          onClick={() => onEdit(flag)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:text-destructive"
          onClick={() => onDelete(flag.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};

/* ── Flag Form ────────────────────────────────────────────── */
interface FlagFormProps {
  form: ReturnType<typeof emptyForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}

const FlagForm = ({ form, setForm, onSave, onCancel, saving, title }: FlagFormProps) => {
  return (
    <div className="p-4 border border-primary/30 bg-primary/5 rounded-xl space-y-3">
      <p className="text-sm font-semibold text-primary">{title}</p>

      {/* Title */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Título *</label>
        <Input
          placeholder="Ex: Desconto API WhatsApp"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          className="bg-secondary/50 border-border/50 h-9 text-sm"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
        <Textarea
          placeholder="Detalhes da marcação..."
          value={form.description || ''}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="bg-secondary/50 border-border/50 text-sm min-h-[60px] resize-none"
        />
      </div>

      {/* Amount + Recurring */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Valor deduzido (R$)</label>
          <div className="relative">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={form.amount ?? ''}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value ? parseFloat(e.target.value) : null }))}
              className="bg-secondary/50 border-border/50 h-9 text-sm pl-8"
            />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-1 pt-1">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Recorrente</label>
          <Switch
            checked={form.is_recurring}
            onCheckedChange={v => setForm(f => ({ ...f, is_recurring: v }))}
          />
        </div>
      </div>

      {/* Color Picker */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Cor da marcação</label>
        <div className="flex gap-2 flex-wrap">
          {FLAG_COLORS.map(color => {
            const c = FLAG_COLOR_MAP[color];
            return (
              <button
                key={color}
                type="button"
                title={c.label}
                onClick={() => setForm(f => ({ ...f, color }))}
                className={`w-6 h-6 rounded-full border-2 transition-all ${c.bg} ${
                  form.color === color
                    ? `${c.border} scale-125`
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                {form.color === color && (
                  <Check className={`w-3 h-3 mx-auto ${c.text}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1 border-border/50" onClick={onCancel} disabled={saving}>
          <X className="w-4 h-4 mr-1" /> Cancelar
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={onSave}
          disabled={saving || !form.title.trim()}
        >
          <Check className="w-4 h-4 mr-1" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
};

export default ClientFlagsDialog;
