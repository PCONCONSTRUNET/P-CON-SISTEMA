import { useState } from 'react';
import { Flag, Plus, Trash2, Pencil, Check, X, DollarSign, RefreshCw, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useClientFlags, FLAG_COLOR_MAP, FlagColor, ClientFlag, CreateClientFlag } from '@/hooks/useClientFlags';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientFlagsTabProps {
  clientId: string;
}

const FLAG_COLORS: FlagColor[] = ['blue', 'green', 'yellow', 'red', 'purple', 'orange', 'pink', 'gray'];

const emptyForm = () => ({
  title: '',
  description: '',
  amount: null as number | null,
  color: 'blue' as FlagColor,
  is_recurring: false,
});

const ClientFlagsTab = ({ clientId }: ClientFlagsTabProps) => {
  const { flags, loading, addFlag, updateFlag, deleteFlag } = useClientFlags(clientId);

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
    setForm(emptyForm());
    setIsCreating(true);
  };

  const startEdit = (flag: ClientFlag) => {
    setIsCreating(false);
    setEditingId(flag.id);
    setForm({
      title: flag.title,
      description: flag.description || '',
      amount: flag.amount,
      color: flag.color,
      is_recurring: flag.is_recurring,
    });
  };

  const handleSaveNew = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const result = await addFlag({ ...form, client_id: clientId });
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

  const totalDeductions = flags
    .filter(f => f.amount !== null && f.amount > 0)
    .reduce((acc, f) => acc + (f.amount || 0), 0);

  return (
    <Card className="glass-card border-border/50">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Flag className="w-5 h-5 text-primary" />
          Marcações ({flags.length})
        </CardTitle>
        {!isCreating && !editingId && (
          <Button size="sm" className="gap-2" onClick={startCreate}>
            <Plus className="w-4 h-4" />
            Nova Marcação
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        {flags.length > 0 && totalDeductions > 0 && (
          <div className="flex items-center justify-between p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-medium text-orange-400">Total de deduções mensais</span>
            </div>
            <span className="text-sm font-bold text-orange-400">
              R$ {totalDeductions.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Create Form */}
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

        {/* Flags List */}
        {loading ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Carregando marcações...</div>
        ) : flags.length === 0 && !isCreating ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Flag className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Nenhuma marcação cadastrada</p>
            <p className="text-xs text-muted-foreground/60">
              Use marcações para registrar deduções de API, descontos ou observações financeiras deste cliente.
            </p>
            <Button size="sm" variant="outline" className="gap-2 border-border/50" onClick={startCreate}>
              <Plus className="w-4 h-4" />
              Criar primeira marcação
            </Button>
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
                  onDelete={deleteFlag}
                />
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ── Flag Card ────────────────────────────────────────────── */
interface FlagCardProps {
  flag: ClientFlag;
  onEdit: (flag: ClientFlag) => void;
  onDelete: (id: string) => Promise<boolean>;
}

const FlagCard = ({ flag, onEdit, onDelete }: FlagCardProps) => {
  const colors = FLAG_COLOR_MAP[flag.color] || FLAG_COLOR_MAP.blue;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${colors.bg} ${colors.border} group transition-all hover:shadow-md`}>
      {/* Colored dot */}
      <div className={`mt-1.5 w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-inset ${colors.border}`}
        style={{ backgroundColor: 'transparent' }}
      >
        <div className={`w-full h-full rounded-full ${colors.bg.replace('/20', '/80')}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${colors.text}`}>{flag.title}</span>
          {flag.is_recurring && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 border-border/40">
              <RefreshCw className="w-2.5 h-2.5" />
              Recorrente
            </Badge>
          )}
        </div>

        {flag.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{flag.description}</p>
        )}

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {flag.amount !== null && flag.amount > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold text-orange-400">
              <DollarSign className="w-3 h-3" />
              R$ {flag.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} deduzido
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/50">
            {format(new Date(flag.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:text-primary"
          onClick={() => onEdit(flag)}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:text-destructive"
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
    <div className="p-4 border border-primary/30 bg-primary/5 rounded-xl space-y-4">
      <p className="text-sm font-semibold text-primary">{title}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Title */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Título *</label>
          <Input
            placeholder="Ex: Desconto API WhatsApp, Taxa de Suporte..."
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="bg-secondary/50 border-border/50 h-9 text-sm"
          />
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
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

        {/* Recurring toggle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Recorrente (mensal)</label>
          <div className="flex items-center gap-3 h-9">
            <Switch
              checked={form.is_recurring}
              onCheckedChange={v => setForm(f => ({ ...f, is_recurring: v }))}
            />
            <span className="text-xs text-muted-foreground">
              {form.is_recurring ? 'Sim, é mensal' : 'Não recorrente'}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
          <Textarea
            placeholder="Detalhes sobre esta marcação..."
            value={form.description || ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="bg-secondary/50 border-border/50 text-sm min-h-[64px] resize-none"
          />
        </div>

        {/* Color picker */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Cor de identificação</label>
          <div className="flex gap-2.5 flex-wrap">
            {FLAG_COLORS.map(color => {
              const c = FLAG_COLOR_MAP[color];
              return (
                <button
                  key={color}
                  type="button"
                  title={c.label}
                  onClick={() => setForm(f => ({ ...f, color }))}
                  className={`relative w-7 h-7 rounded-full transition-all ${c.bg} border-2 ${
                    form.color === color
                      ? `${c.border} scale-125 shadow-lg`
                      : 'border-transparent opacity-60 hover:opacity-100 hover:scale-110'
                  }`}
                >
                  {form.color === color && (
                    <Check className={`w-3.5 h-3.5 absolute inset-0 m-auto ${c.text}`} />
                  )}
                </button>
              );
            })}
          </div>
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
          {saving ? 'Salvando...' : 'Salvar Marcação'}
        </Button>
      </div>
    </div>
  );
};

export default ClientFlagsTab;
