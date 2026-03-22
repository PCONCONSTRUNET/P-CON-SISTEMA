import { useState } from 'react';
import { Search, MoreHorizontal, CreditCard, CheckCircle, XCircle, Clock, Trash2, Download, Eye, FileText, Loader2, Check, MessageCircle } from 'lucide-react';
import WhatsAppSendModal, { WhatsAppSendParams } from '@/components/WhatsAppSendModal';
import DashboardLayout from '@/components/DashboardLayout';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGlobalData, Payment } from '@/contexts/GlobalDataContext';
import { formatBrazilDate } from '@/utils/dateUtils';
import { toast } from 'sonner';
import { exportToCSV, formatCurrencyForExport, formatDateForExport } from '@/utils/exportUtils';
import { useWhatsAppReminder } from '@/hooks/useWhatsAppReminder';

const Payments = () => {
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappParams, setWhatsappParams] = useState<WhatsAppSendParams | null>(null);
  
  const { payments, loadingPayments: loading, deletePayment, markPaymentAsPaid, addInvoice, invoices } = useGlobalData();
  const { sendReminder, sendingReminderId } = useWhatsAppReminder();

  const filteredPayments = payments.filter(payment =>
    (payment.subscriptions?.clients?.name || payment.clients?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (payment.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const totalReceived = payments
    .filter(p => p.status === 'paid')
    .reduce((acc, p) => acc + Number(p.amount), 0);

  const totalPending = payments
    .filter(p => p.status === 'pending')
    .reduce((acc, p) => acc + Number(p.amount), 0);

  const handleDeletePayment = async (paymentId: string) => {
    await deletePayment(paymentId);
  };

  const handleMarkAsPaid = async (paymentId: string) => {
    await markPaymentAsPaid(paymentId);
  };

  const openDetailsDialog = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsDetailsDialogOpen(true);
  };

  const openInvoiceDialog = (payment: Payment) => {
    setSelectedPayment(payment);
    // Generate suggested invoice number based on existing invoices
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Find the highest invoice number for this year/month pattern
    const prefix = `NF-${year}${month}-`;
    const existingNumbers = invoices
      .filter(inv => inv.number.startsWith(prefix))
      .map(inv => {
        const numPart = inv.number.replace(prefix, '');
        return parseInt(numPart, 10) || 0;
      });
    
    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    const nextNumber = maxNumber + 1;
    
    setInvoiceNumber(`${prefix}${String(nextNumber).padStart(4, '0')}`);
    setIsInvoiceDialogOpen(true);
  };

  const handleCreateInvoice = async () => {
    if (!selectedPayment || !invoiceNumber) {
      toast.error('Preencha o número da nota fiscal');
      return;
    }

    // Check if invoice already exists for this payment
    const existingInvoice = invoices.find(inv => inv.payment_id === selectedPayment.id);
    if (existingInvoice) {
      toast.error('Já existe uma nota fiscal para este pagamento');
      return;
    }

    // Get client_id from payment
    const clientId = selectedPayment.client_id || 
      (selectedPayment.subscriptions && 'clients' in selectedPayment.subscriptions 
        ? null // We need to get client_id from somewhere else
        : null);

    if (!clientId) {
      toast.error('Cliente não encontrado para este pagamento');
      return;
    }

    setIsCreatingInvoice(true);
    try {
      const result = await addInvoice({
        payment_id: selectedPayment.id,
        client_id: clientId,
        number: invoiceNumber,
        amount: Number(selectedPayment.amount),
        status: 'issued',
      });

      if (result) {
        setIsInvoiceDialogOpen(false);
        setSelectedPayment(null);
        setInvoiceNumber('');
      }
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const getPaymentClientName = (payment: Payment): string => {
    return payment.subscriptions?.clients?.name || payment.clients?.name || 'N/A';
  };

  const hasInvoice = (paymentId: string): boolean => {
    return invoices.some(inv => inv.payment_id === paymentId);
  };

  const columns = [
    {
      key: 'client',
      header: 'Cliente',
      render: (item: Payment) => (
        <div>
          <span className="font-medium text-foreground text-sm">{getPaymentClientName(item)}</span>
          <span className="block text-xs text-muted-foreground sm:hidden">{item.payment_method}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (item: Payment) => (
        <span className="font-semibold text-foreground text-sm">{formatCurrency(Number(item.amount))}</span>
      ),
    },
    {
      key: 'method',
      header: 'Método',
      hideOnMobile: true,
      render: (item: Payment) => (
        <span className="text-muted-foreground">{item.payment_method || 'N/A'}</span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Vencimento',
      hideOnMobile: true,
      render: (item: Payment) => {
        const dueDate = item.due_date;
        if (!dueDate) return <span className="text-muted-foreground">-</span>;
        
        const isOverdue = new Date(dueDate) < new Date() && item.status !== 'paid';
        const isToday = new Date(dueDate).toDateString() === new Date().toDateString();
        
        return (
          <span className={
            isOverdue ? 'text-destructive font-medium' : 
            isToday ? 'text-warning font-medium' : 
            'text-muted-foreground'
          }>
            {formatBrazilDate(dueDate)}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Criação',
      hideOnMobile: true,
      render: (item: Payment) => (
        <span className="text-muted-foreground">
          {formatBrazilDate(item.created_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Payment) => <StatusBadge status={item.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (item: Payment) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-card border-border/50">
            <DropdownMenuItem onClick={() => openDetailsDialog(item)}>
              <Eye className="w-4 h-4 mr-2" />
              Ver detalhes
            </DropdownMenuItem>
            {item.status !== 'paid' && (
              <DropdownMenuItem 
                className="text-success"
                onClick={() => handleMarkAsPaid(item.id)}
              >
                <Check className="w-4 h-4 mr-2" />
                Marcar como pago
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              onClick={() => openInvoiceDialog(item)}
              disabled={hasInvoice(item.id)}
            >
              <FileText className="w-4 h-4 mr-2" />
              {hasInvoice(item.id) ? 'NF já emitida' : 'Emitir nota fiscal'}
            </DropdownMenuItem>
            {item.status !== 'paid' && (
              <DropdownMenuItem 
                onSelect={() => {
                  const p: WhatsAppSendParams = {
                    clientId: item.client_id || '',
                    clientName: getPaymentClientName(item),
                    clientPhone: item.clients?.phone || null,
                    type: item.status === 'overdue' ? 'overdue' : 'payment',
                    amount: Number(item.amount),
                    description: item.description || undefined,
                    dueDate: item.due_date,
                  };
                  setTimeout(() => {
                    setWhatsappParams(p);
                    setWhatsappModalOpen(true);
                  }, 100);
                }}
                disabled={sendingReminderId === item.client_id || !item.clients?.phone}
              >
                {sendingReminderId === item.client_id ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4 mr-2" />
                )}
                {!item.clients?.phone ? 'Sem telefone' : sendingReminderId === item.client_id ? 'Enviando...' : 'Enviar WhatsApp'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              className="text-destructive"
              onClick={() => handleDeletePayment(item.id)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <DashboardLayout 
      title="Pagamentos" 
      subtitle="Acompanhe todos os pagamentos e cobranças"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar pagamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="h-10 sm:h-11 gap-2 border-border/50 bg-secondary/50"
          onClick={() => {
            const exportData = payments.map(p => ({
              ...p,
              clientName: getPaymentClientName(p),
              formattedAmount: formatCurrencyForExport(Number(p.amount)),
              formattedDate: formatDateForExport(p.created_at),
            }));
            exportToCSV(exportData, 'pagamentos', [
              { key: 'clientName', label: 'Cliente' },
              { key: 'formattedAmount', label: 'Valor' },
              { key: 'payment_method', label: 'Método' },
              { key: 'status', label: 'Status' },
              { key: 'formattedDate', label: 'Data' },
            ]);
            toast.success('Exportação concluída!');
          }}
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-foreground">{payments.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-success/10">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
            </div>
            <div>
              <p className="text-sm sm:text-xl font-bold text-success">{formatCurrency(totalReceived)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Recebidos</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-warning/10">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
            </div>
            <div>
              <p className="text-sm sm:text-xl font-bold text-warning">{formatCurrency(totalPending)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Pendentes</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-destructive/10">
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold text-destructive">{payments.filter(p => p.status === 'failed').length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Falhas</p>
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
        <DataTable data={filteredPayments} columns={columns} />
      )}

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Detalhes do Pagamento</DialogTitle>
            <DialogDescription>
              Informações completas do pagamento.
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                  <p className="text-sm font-medium text-foreground">{getPaymentClientName(selectedPayment)}</p>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valor</label>
                  <p className="text-sm font-medium text-foreground">{formatCurrency(Number(selectedPayment.amount))}</p>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Método</label>
                  <p className="text-sm font-medium text-foreground">{selectedPayment.payment_method || 'N/A'}</p>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <StatusBadge status={selectedPayment.status} />
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data de Criação</label>
                  <p className="text-sm font-medium text-foreground">{formatBrazilDate(selectedPayment.created_at)}</p>
                </div>

                {selectedPayment.due_date && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Data de Vencimento</label>
                    <p className="text-sm font-medium text-foreground">{formatBrazilDate(selectedPayment.due_date)}</p>
                  </div>
                )}
                
                {selectedPayment.paid_at && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Data de Pagamento</label>
                    <p className="text-sm font-medium text-foreground">{formatBrazilDate(selectedPayment.paid_at)}</p>
                  </div>
                )}
                
                {selectedPayment.description && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                    <p className="text-sm font-medium text-foreground">{selectedPayment.description}</p>
                  </div>
                )}

                {selectedPayment.subscriptions?.plan_name && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Plano</label>
                    <p className="text-sm font-medium text-foreground">{selectedPayment.subscriptions.plan_name}</p>
                  </div>
                )}

                {selectedPayment.asaas_id && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">ID Asaas</label>
                    <p className="text-sm font-medium text-foreground font-mono text-xs">{selectedPayment.asaas_id}</p>
                  </div>
                )}

                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Nota Fiscal</label>
                  <p className="text-sm font-medium text-foreground">
                    {hasInvoice(selectedPayment.id) ? (
                      <span className="text-success">✓ Emitida</span>
                    ) : (
                      <span className="text-muted-foreground">Não emitida</span>
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 border-border/50"
                  onClick={() => setIsDetailsDialogOpen(false)}
                >
                  Fechar
                </Button>
                {selectedPayment.status !== 'paid' && (
                  <Button 
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground" 
                    onClick={async () => {
                      await handleMarkAsPaid(selectedPayment.id);
                      setIsDetailsDialogOpen(false);
                    }}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Marcar Pago
                  </Button>
                )}
                {!hasInvoice(selectedPayment.id) && (
                  <Button 
                    className="flex-1" 
                    onClick={() => {
                      setIsDetailsDialogOpen(false);
                      openInvoiceDialog(selectedPayment);
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Emitir NF
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Emitir Nota Fiscal</DialogTitle>
            <DialogDescription>
              Crie uma nota fiscal para este pagamento.
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-secondary/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Cliente:</span>
                  <span className="text-sm font-medium text-foreground">{getPaymentClientName(selectedPayment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Valor:</span>
                  <span className="text-sm font-medium text-foreground">{formatCurrency(Number(selectedPayment.amount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data:</span>
                  <span className="text-sm font-medium text-foreground">{formatBrazilDate(selectedPayment.created_at)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Número da Nota Fiscal *</label>
                <Input
                  placeholder="Ex: NF-202401-0001"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 border-border/50"
                  onClick={() => {
                    setIsInvoiceDialogOpen(false);
                    setSelectedPayment(null);
                    setInvoiceNumber('');
                  }}
                  disabled={isCreatingInvoice}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleCreateInvoice}
                  disabled={isCreatingInvoice || !invoiceNumber}
                >
                  {isCreatingInvoice ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Emitindo...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Emitir NF
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WhatsAppSendModal
        open={whatsappModalOpen}
        onOpenChange={setWhatsappModalOpen}
        params={whatsappParams}
        onSendViaApi={sendReminder}
        sendingId={sendingReminderId}
      />
    </DashboardLayout>
  );
};

export default Payments;