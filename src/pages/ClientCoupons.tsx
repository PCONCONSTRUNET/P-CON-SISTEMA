import { useState, useEffect } from 'react';
import { Gift, Plus, Trash2, Receipt, Search, Download, Eye, Send, Link2, UserPlus } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useClientCoupons, ClientCoupon } from '@/hooks/useClientCoupons';
import { useClients } from '@/hooks/useClients';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportToCSV } from '@/utils/exportUtils';

interface ReferralReward {
  id: string;
  amount: number;
  status: string;
  lead_name: string;
  created_at: string;
}

const ClientCoupons = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isLinkReferralDialogOpen, setIsLinkReferralDialogOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<ClientCoupon | null>(null);
  const [availableRewards, setAvailableRewards] = useState<ReferralReward[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState('');

  const { coupons, transactions, loading, addCoupon, registerExpense, deleteCoupon, fetchTransactions } = useClientCoupons();
  const { clients } = useClients();

  const [newCoupon, setNewCoupon] = useState({
    client_id: '',
    initial_amount: '',
    description: '',
    origin: 'manual' as 'manual' | 'referral',
  });

  const [newExpense, setNewExpense] = useState({
    amount: '',
    description: '',
  });

  const filteredCoupons = coupons.filter(coupon =>
    coupon.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    coupon.description?.toLowerCase().includes(search.toLowerCase()) ||
    coupon.lead_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Fetch available referral rewards for a client
  const fetchAvailableRewards = async (clientId: string) => {
    try {
      // Get client's referral link
      const { data: linkData } = await supabase
        .from('referral_links')
        .select('id')
        .eq('client_id', clientId)
        .single();

      if (!linkData) {
        setAvailableRewards([]);
        return;
      }

      // Get rewards that are paid and type coupon, not yet linked to a coupon
      const { data: rewards } = await supabase
        .from('referral_rewards')
        .select('id, amount, status, created_at, referral_lead_id')
        .eq('referral_link_id', linkData.id)
        .eq('reward_type', 'coupon')
        .eq('status', 'paid');

      if (!rewards || rewards.length === 0) {
        setAvailableRewards([]);
        return;
      }

      // Get lead names
      const leadIds = rewards.map(r => r.referral_lead_id);
      const { data: leads } = await supabase
        .from('referral_leads')
        .select('id, lead_name')
        .in('id', leadIds);

      const leadMap = new Map((leads || []).map(l => [l.id, l.lead_name]));

      // Check which rewards are already linked
      const { data: existingCoupons } = await supabase
        .from('client_coupons' as any)
        .select('referral_reward_id')
        .not('referral_reward_id', 'is', null);

      const linkedRewardIds = new Set((existingCoupons || []).map((c: any) => c.referral_reward_id));

      const availableRewardsList = rewards
        .filter(r => !linkedRewardIds.has(r.id))
        .map(r => ({
          id: r.id,
          amount: r.amount,
          status: r.status,
          lead_name: leadMap.get(r.referral_lead_id) || 'N/A',
          created_at: r.created_at,
        }));

      setAvailableRewards(availableRewardsList);
    } catch (error) {
      console.error('Error fetching rewards:', error);
      setAvailableRewards([]);
    }
  };

  // When client changes, fetch available rewards
  useEffect(() => {
    if (newCoupon.client_id && newCoupon.origin === 'referral') {
      fetchAvailableRewards(newCoupon.client_id);
    }
  }, [newCoupon.client_id, newCoupon.origin]);

  const handleAddCoupon = async () => {
    if (!newCoupon.client_id || !newCoupon.initial_amount) {
      toast.error('Selecione um cliente e informe o valor');
      return;
    }

    await addCoupon({
      client_id: newCoupon.client_id,
      initial_amount: parseFloat(newCoupon.initial_amount),
      description: newCoupon.description || undefined,
      origin: newCoupon.origin,
      referral_reward_id: selectedRewardId || undefined,
    });

    setNewCoupon({ client_id: '', initial_amount: '', description: '', origin: 'manual' });
    setSelectedRewardId('');
    setIsDialogOpen(false);
  };

  const openExpenseDialog = (coupon: ClientCoupon) => {
    setSelectedCoupon(coupon);
    setNewExpense({ amount: '', description: '' });
    setIsExpenseDialogOpen(true);
  };

  const openHistoryDialog = async (coupon: ClientCoupon) => {
    setSelectedCoupon(coupon);
    await fetchTransactions(coupon.id);
    setIsHistoryDialogOpen(true);
  };

  const handleRegisterExpense = async () => {
    if (!selectedCoupon || !newExpense.amount || !newExpense.description) {
      toast.error('Preencha todos os campos');
      return;
    }

    const success = await registerExpense(
      selectedCoupon.id,
      parseFloat(newExpense.amount),
      newExpense.description
    );

    if (success) {
      setIsExpenseDialogOpen(false);
      setNewExpense({ amount: '', description: '' });
      setSelectedCoupon(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatBrazilDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getCouponStatus = (coupon: ClientCoupon) => {
    if (coupon.status === 'used' || coupon.current_balance <= 0) return 'cancelled';
    if (coupon.status === 'expired') return 'expired';
    return 'active';
  };

  const sendCouponReceipt = (coupon: ClientCoupon) => {
    if (!coupon.client_phone) {
      toast.error('Cliente não possui telefone cadastrado');
      return;
    }

    const formattedPhone = coupon.client_phone.replace(/\D/g, '');
    const formattedValue = formatCurrency(coupon.initial_amount);
    const formattedDate = format(new Date(coupon.created_at), "dd/MM/yyyy", { locale: ptBR });
    
    // Link público do comprovante
    const receiptLink = `https://www.assinaturaspcon.sbs/${coupon.id}`;
    
    let message = `🎉 *COMPROVANTE DE CUPOM DE DESCONTO* 🎉\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📋 *P-CON Construct*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `Olá *${coupon.client_name}*!\n\n`;
    message += `Confirmamos que você recebeu um cupom de desconto:\n\n`;
    message += `💰 *Valor:* ${formattedValue}\n`;
    message += `📅 *Data:* ${formattedDate}\n`;
    
    if (coupon.origin === 'referral' && coupon.lead_name) {
      message += `🤝 *Origem:* Indicação de *${coupon.lead_name}*\n`;
    }
    
    if (coupon.description) {
      message += `📝 *Descrição:* ${coupon.description}\n`;
    }
    
    message += `\n💳 *Saldo Atual:* ${formatCurrency(coupon.current_balance)}\n`;
    message += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📎 *Ver Comprovante Online:*\n${receiptLink}\n\n`;
    message += `Este cupom pode ser utilizado em projetos e serviços futuros.\n\n`;
    message += `Qualquer dúvida, estamos à disposição! 🙌`;

    const whatsappUrl = `https://wa.me/55${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    toast.success('Comprovante enviado via WhatsApp!');
  };

  const columns = [
    {
      key: 'client',
      header: 'Cliente',
      render: (item: ClientCoupon) => (
        <div>
          <p className="font-medium text-foreground">{item.client_name}</p>
          {item.lead_name && (
            <p className="text-xs text-primary flex items-center gap-1">
              <UserPlus className="w-3 h-3" />
              Indicou: {item.lead_name}
            </p>
          )}
          {item.description && (
            <p className="text-xs text-muted-foreground">{item.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      hideOnMobile: true,
      render: (item: ClientCoupon) => (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary w-fit">
            <Gift className="w-3 h-3" />
            Cupom
          </span>
          {item.origin === 'referral' && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success w-fit">
              <Link2 className="w-3 h-3" />
              Indicação
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Valor',
      render: (item: ClientCoupon) => (
        <div>
          <p className="font-medium text-foreground">{formatCurrency(item.initial_amount)}</p>
          <p className="text-xs text-muted-foreground">
            Saldo: {formatCurrency(item.current_balance)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: ClientCoupon) => <StatusBadge status={getCouponStatus(item)} />,
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      hideOnMobile: true,
      render: (item: ClientCoupon) => (
        <span className="text-muted-foreground text-sm">
          {formatBrazilDate(item.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (item: ClientCoupon) => (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => openExpenseDialog(item)}
            disabled={item.current_balance <= 0}
          >
            <Receipt className="w-3 h-3" />
            <span className="hidden sm:inline">Gasto</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-card border-border/50">
              <DropdownMenuItem onClick={() => sendCouponReceipt(item)}>
                <Send className="w-4 h-4 mr-2" />
                Enviar Comprovante
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openHistoryDialog(item)}>
                <Eye className="w-4 h-4 mr-2" />
                Ver Histórico
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => deleteCoupon(item.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Cupons de Desconto"
      subtitle="Gerencie os cupons de desconto dos clientes"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, descrição ou indicado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>

        <div className="flex gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-10 sm:h-11 gap-2 border-border/50 bg-secondary/50"
            onClick={() => {
              exportToCSV(coupons, 'cupons', [
                { key: 'client_name', label: 'Cliente' },
                { key: 'initial_amount', label: 'Valor Inicial' },
                { key: 'current_balance', label: 'Saldo Atual' },
                { key: 'origin', label: 'Origem' },
                { key: 'lead_name', label: 'Lead Indicado' },
                { key: 'description', label: 'Descrição' },
                { key: 'status', label: 'Status' },
                { key: 'created_at', label: 'Criado em' },
              ]);
              toast.success('Exportação concluída!');
            }}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-10 sm:h-11 gap-2 flex-1 sm:flex-none">
                <Plus className="w-4 h-4" />
                <span>Novo Cupom</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl flex items-center gap-2">
                  <Gift className="w-5 h-5 text-primary" />
                  Novo Cupom de Desconto
                </DialogTitle>
                <DialogDescription>
                  Crie um novo cupom de desconto para um cliente.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Origem do Cupom</label>
                  <Select
                    value={newCoupon.origin}
                    onValueChange={(value: 'manual' | 'referral') => {
                      setNewCoupon({ ...newCoupon, origin: value });
                      setSelectedRewardId('');
                    }}
                  >
                    <SelectTrigger className="bg-secondary/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="referral">Indicação (vincular)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Cliente *</label>
                  <Select
                    value={newCoupon.client_id}
                    onValueChange={(value) => setNewCoupon({ ...newCoupon, client_id: value })}
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

                {newCoupon.origin === 'referral' && newCoupon.client_id && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Indicação Associada</label>
                    {availableRewards.length > 0 ? (
                      <Select
                        value={selectedRewardId}
                        onValueChange={(value) => {
                          setSelectedRewardId(value);
                          const reward = availableRewards.find(r => r.id === value);
                          if (reward) {
                            setNewCoupon({
                              ...newCoupon,
                              initial_amount: reward.amount.toString(),
                              description: `Cupom de indicação - ${reward.lead_name}`,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="bg-secondary/50 border-border/50">
                          <SelectValue placeholder="Selecione uma indicação" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRewards.map((reward) => (
                            <SelectItem key={reward.id} value={reward.id}>
                              {reward.lead_name} - {formatCurrency(reward.amount)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground p-2 bg-secondary/30 rounded">
                        Nenhuma indicação disponível para vincular
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor (R$) *</label>
                  <Input
                    type="number"
                    placeholder="150.00"
                    value={newCoupon.initial_amount}
                    onChange={(e) => setNewCoupon({ ...newCoupon, initial_amount: e.target.value })}
                    className="bg-secondary/50 border-border/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input
                    placeholder="Cupom de desconto para projetos futuros"
                    value={newCoupon.description}
                    onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                    className="bg-secondary/50 border-border/50"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1 border-border/50"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={handleAddCoupon}>
                    Criar Cupom
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-foreground">{coupons.length}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-success">
            {coupons.filter(c => c.status === 'active' && c.current_balance > 0).length}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Ativos</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-primary">
            {coupons.filter(c => c.origin === 'referral').length}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Indicações</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold text-primary">
            {formatCurrency(coupons.reduce((sum, c) => sum + c.current_balance, 0))}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Saldo Total</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : (
        <DataTable data={filteredCoupons} columns={columns} />
      )}

      {/* Register Expense Dialog */}
      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Registrar Gasto
            </DialogTitle>
            <DialogDescription>
              Registre um gasto para o cupom de {selectedCoupon?.client_name}
            </DialogDescription>
          </DialogHeader>

          {selectedCoupon && (
            <div className="mt-2 p-3 rounded-lg bg-secondary/50">
              <p className="text-sm text-muted-foreground">Saldo disponível:</p>
              <p className="text-xl font-bold text-primary">
                {formatCurrency(selectedCoupon.current_balance)}
              </p>
            </div>
          )}

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor do Gasto (R$) *</label>
              <Input
                type="number"
                placeholder="50.00"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                className="bg-secondary/50 border-border/50"
                max={selectedCoupon?.current_balance}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição *</label>
              <Input
                placeholder="Ex: Implementação de funcionalidade X"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1 border-border/50"
                onClick={() => setIsExpenseDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleRegisterExpense}>
                Registrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Histórico de Uso
            </DialogTitle>
            <DialogDescription>
              Histórico de gastos do cupom de {selectedCoupon?.client_name}
            </DialogDescription>
          </DialogHeader>

          {selectedCoupon && (
            <div className="mt-2 p-3 rounded-lg bg-secondary/50 grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Valor Inicial:</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(selectedCoupon.initial_amount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saldo Atual:</p>
                <p className="text-lg font-bold text-primary">
                  {formatCurrency(selectedCoupon.current_balance)}
                </p>
              </div>
              {selectedCoupon.origin === 'referral' && selectedCoupon.lead_name && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Origem:</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-success" />
                    Indicação de {selectedCoupon.lead_name}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum gasto registrado
              </p>
            ) : (
              transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="p-3 rounded-lg bg-background/50 border border-border/30 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-sm">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBrazilDate(transaction.created_at)}
                    </p>
                  </div>
                  <p className="text-destructive font-semibold">
                    -{formatCurrency(transaction.amount)}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button
              variant="outline"
              className="border-border/50"
              onClick={() => setIsHistoryDialogOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ClientCoupons;
