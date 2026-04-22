import { useState, useEffect } from 'react';
import { Search, Plus, Copy, Eye, Trash2, MoreHorizontal, Link2, ExternalLink, Clock, CheckCircle, XCircle, Loader2, Upload, X } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatBrazilDate } from '@/utils/dateUtils';

interface CheckoutLink {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  amount: number;
  status: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  expires_at: string | null;
  allow_pix: boolean;
  allow_card: boolean;
  max_installments: number;
  view_count: number;
  paid_at: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

const PaymentLinks = () => {
  const [links, setLinks] = useState<CheckoutLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<CheckoutLink | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    allow_pix: true,
    allow_card: false,
    max_installments: 1,
    expires_at: '',
    notes: '',
    image_file: null as File | null,
    image_preview: '',
  });

  const fetchLinks = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('checkout_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching checkout links:', error);
      toast.error('Erro ao carregar links');
    }
    setLinks(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLinks(); }, []);

  const resetForm = () => {
    setForm({
      title: '', description: '', amount: '', client_name: '',
      client_email: '', client_phone: '', allow_pix: true,
      allow_card: false, max_installments: 1, expires_at: '', notes: '',
      image_file: null, image_preview: '',
    });
  };

  const handleCreate = async () => {
    if (!form.title || !form.amount) {
      toast.error('Preencha o título e o valor');
      return;
    }

    setSaving(true);
    let uploadedImageUrl = null;

    if (form.image_file) {
      const ext = form.image_file.name.split('.').pop() || 'jpg';
      const fileName = `checkout-banners/banner-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(fileName, form.image_file, { cacheControl: '3600', upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(fileName);
        uploadedImageUrl = urlData.publicUrl;
      }
    }

    const { error } = await (supabase as any).from('checkout_links').insert({
      title: form.title,
      description: form.description || null,
      amount: parseFloat(form.amount),
      client_name: form.client_name || null,
      client_email: form.client_email || null,
      client_phone: form.client_phone || null,
      allow_pix: form.allow_pix,
      allow_card: form.allow_card,
      max_installments: form.max_installments,
      expires_at: form.expires_at || null,
      image_url: uploadedImageUrl,
      notes: form.notes || null,
    });

    if (error) {
      console.error('Error creating checkout link:', error);
      toast.error('Erro ao criar link');
    } else {
      toast.success('Link de pagamento criado!');
      setIsCreateOpen(false);
      resetForm();
      fetchLinks();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from('checkout_links').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir link');
    } else {
      toast.success('Link excluído');
      fetchLinks();
    }
  };

  const handleToggleStatus = async (link: CheckoutLink) => {
    const newStatus = link.status === 'active' ? 'inactive' : 'active';
    const { error } = await (supabase as any)
      .from('checkout_links')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', link.id);

    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      toast.success(newStatus === 'active' ? 'Link ativado' : 'Link desativado');
      fetchLinks();
    }
  };

  const getPublicUrl = (slug: string) => {
    const base = window.location.origin;
    return `${base}/pay/${slug}`;
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(getPublicUrl(slug));
    toast.success('Link copiado!');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const filtered = links.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    (l.client_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalActive = links.filter(l => l.status === 'active').length;
  const totalPaid = links.filter(l => l.status === 'paid').length;
  const totalRevenue = links.filter(l => l.status === 'paid').reduce((a, l) => a + Number(l.amount), 0);

  const columns = [
    {
      key: 'title',
      header: 'Produto / Serviço',
      render: (item: CheckoutLink) => (
        <div>
          <span className="font-medium text-foreground text-sm">{item.title}</span>
          {item.client_name && (
            <span className="block text-xs text-muted-foreground">{item.client_name}</span>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (item: CheckoutLink) => (
        <span className="font-semibold text-foreground text-sm">{formatCurrency(Number(item.amount))}</span>
      ),
    },
    {
      key: 'views',
      header: 'Views',
      hideOnMobile: true,
      render: (item: CheckoutLink) => (
        <span className="text-muted-foreground">{item.view_count}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      hideOnMobile: true,
      render: (item: CheckoutLink) => (
        <span className="text-muted-foreground">{formatBrazilDate(item.created_at)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: CheckoutLink) => <StatusBadge status={item.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (item: CheckoutLink) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-card border-border/50">
            <DropdownMenuItem onClick={() => copyLink(item.slug)}>
              <Copy className="w-4 h-4 mr-2" /> Copiar link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(getPublicUrl(item.slug), '_blank')}>
              <ExternalLink className="w-4 h-4 mr-2" /> Abrir link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setSelectedLink(item); setIsDetailsOpen(true); }}>
              <Eye className="w-4 h-4 mr-2" /> Detalhes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleToggleStatus(item)}>
              {item.status === 'active' ? (
                <><XCircle className="w-4 h-4 mr-2" /> Desativar</>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-2" /> Ativar</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
              <Trash2 className="w-4 h-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <DashboardLayout title="Links de Pagamento" subtitle="Crie links de checkout para enviar aos clientes">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar link..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>
        <Button className="h-10 sm:h-11 gap-2" onClick={() => { resetForm(); setIsCreateOpen(true); }}>
          <Plus className="w-4 h-4" /> Novo Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
              <Link2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{totalActive}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Ativos</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-success/10">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-success">{totalPaid}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Pagos</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-warning/10">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
            </div>
            <div>
              <p className="text-sm sm:text-xl font-bold text-warning">{formatCurrency(totalRevenue)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Recebido</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : (
        <DataTable data={filtered} columns={columns} />
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Novo Link de Pagamento</DialogTitle>
            <DialogDescription>Preencha os dados do produto/serviço para gerar o link.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Banner Upload */}
            <div className="space-y-2">
              <Label>Banner do Checkout (Opcional)</Label>
              {form.image_preview ? (
                <div className="relative rounded-lg overflow-hidden border border-border/50">
                  <img src={form.image_preview} alt="Preview" className="w-full h-auto max-h-[150px] object-contain bg-secondary/30" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => setForm({ ...form, image_file: null, image_preview: '' })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const preview = URL.createObjectURL(file);
                        setForm({ ...form, image_file: file, image_preview: preview });
                      }
                      e.target.value = '';
                    }}
                  />
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Clique para adicionar um banner</span>
                </label>
              )}
            </div>

            <div className="space-y-2">
              <Label>Título do Produto / Serviço *</Label>
              <Input
                placeholder="Ex: Site Landing Page"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descrição do produto ou serviço..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="bg-secondary/50 border-border/50 min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Cliente</Label>
                <Input
                  placeholder="Nome (opcional)"
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Email do Cliente</Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.client_email}
                  onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Telefone do Cliente</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/30">
              <Label className="cursor-pointer">Aceitar PIX</Label>
              <Switch checked={form.allow_pix} onCheckedChange={(v) => setForm({ ...form, allow_pix: v })} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/30">
              <Label className="cursor-pointer">Aceitar Cartão de Crédito</Label>
              <Switch checked={form.allow_card} onCheckedChange={(v) => setForm({ ...form, allow_card: v })} />
            </div>

            {form.allow_card && (
              <div className="space-y-2">
                <Label>Máximo de parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={form.max_installments}
                  onChange={(e) => setForm({ ...form, max_installments: parseInt(e.target.value) || 1 })}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Expira em (opcional)</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="space-y-2">
              <Label>Observações internas</Label>
              <Textarea
                placeholder="Notas internas (não visíveis para o cliente)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-secondary/50 border-border/50 min-h-[60px]"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1 border-border/50" onClick={() => setIsCreateOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : <><Link2 className="w-4 h-4 mr-2" /> Criar Link</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Detalhes do Link</DialogTitle>
            <DialogDescription>Informações do link de pagamento.</DialogDescription>
          </DialogHeader>

          {selectedLink && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Título</label>
                  <p className="text-sm font-medium text-foreground">{selectedLink.title}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valor</label>
                  <p className="text-sm font-medium text-foreground">{formatCurrency(Number(selectedLink.amount))}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <StatusBadge status={selectedLink.status} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Visualizações</label>
                  <p className="text-sm font-medium text-foreground">{selectedLink.view_count}</p>
                </div>
                {selectedLink.client_name && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                    <p className="text-sm font-medium text-foreground">{selectedLink.client_name}</p>
                  </div>
                )}
                {selectedLink.description && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                    <p className="text-sm text-foreground">{selectedLink.description}</p>
                  </div>
                )}
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Link público</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-secondary/50 px-2 py-1 rounded flex-1 break-all">{getPublicUrl(selectedLink.slug)}</code>
                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => copyLink(selectedLink.slug)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
                <Button className="flex-1" onClick={() => copyLink(selectedLink.slug)}>
                  <Copy className="w-4 h-4 mr-2" /> Copiar Link
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PaymentLinks;
