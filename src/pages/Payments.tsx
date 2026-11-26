import { useState, useEffect } from 'react';
import { Search, MoreHorizontal, CreditCard, CheckCircle, XCircle, Clock, Trash2, Download, Eye, FileText, Loader2, Check, MessageCircle, Pencil, Wallet } from 'lucide-react';
import WhatsAppSendModal, { WhatsAppSendParams } from '@/components/WhatsAppSendModal';
import DashboardLayout from '@/components/DashboardLayout';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useGlobalData, Payment } from '@/contexts/GlobalDataContext';
import {
  formatBrazilDate,
  formatBrazilDateTime,
  formatDateForInput,
  formatTimeForInput,
  inputDateToISO,
  localDateTimeToISO,
} from '@/utils/dateUtils';
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
  
  const { 
    payments, 
    loadingPayments: loading, 
    deletePayment, 
    markPaymentAsPaid, 
    registerPartialPayment,
    updatePayment,
    addInvoice, 
    invoices 
  } = useGlobalData();
  const { sendReminder, sendingReminderId } = useWhatsAppReminder();

  const [isPartialDialogOpen, setIsPartialDialogOpen] = useState(false);
  const [partialForm, setPartialForm] = useState({
    amount: '',
    paymentMethod: 'PIX',
    paidAt: formatDateForInput(new Date()),
    paidTime: formatTimeForInput(new Date()),
    description: '',
  });
  const [isSavingPartial, setIsSavingPartial] = useState(false);

  const handleOpenPartialDialog = (payment: Payment) => {
    const now = new Date();
    setSelectedPayment(payment);
    setPartialForm({
      amount: '',
      paymentMethod: 'PIX',
      paidAt: formatDateForInput(now),
      paidTime: formatTimeForInput(now),
      description: '',
    });
    setIsPartialDialogOpen(true);
  };

  const handleSavePartialPayment = async () => {
    if (!selectedPayment) return;
    const paidValue = parseFloat(partialForm.amount.replace(',', '.'));
    const openAmount = Number(selectedPayment.amount);

    if (!Number.isFinite(paidValue) || paidValue <= 0) {
      toast.error('Informe um valor pago maior que zero.');
      return;
    }
    if (paidValue > openAmount) {
      toast.error(`O valor parcial não pode ultrapassar o saldo em aberto (${formatCurrency(openAmount)}).`);
      return;
    }

    setIsSavingPartial(true);
    try {
      const ok = await registerPartialPayment({
        parentPaymentId: selectedPayment.id,
        paidAmount: paidValue,
        paymentMethod: partialForm.paymentMethod,
        description: partialForm.description.trim() || undefined,
        paidAt: partialForm.paidAt
          ? localDateTimeToISO(partialForm.paidAt, partialForm.paidTime)
          : new Date().toISOString(),
      });
      if (ok) {
        setIsPartialDialogOpen(false);
        setSelectedPayment(null);
      }
    } finally {
      setIsSavingPartial(false);
    }
  };

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editPaymentData, setEditPaymentData] = useState({
    amount: '',
    due_date: '',
    created_at: '',
    paid_at: '',
    description: '',
  });

  const handleOpenEditDialog = (payment: Payment) => {
    setSelectedPayment(payment);
    setEditPaymentData({
      amount: payment.amount.toString(),
      due_date: payment.due_date ? payment.due_date.split('T')[0] : '',
      created_at: payment.created_at ? payment.created_at.split('T')[0] : '',
      paid_at: payment.paid_at ? payment.paid_at.split('T')[0] : '',
      description: payment.description || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdatePayment = async () => {
    if (!selectedPayment) return;
    
    try {
      await updatePayment(selectedPayment.id, {
        amount: parseFloat(editPaymentData.amount),
        due_date: editPaymentData.due_date ? inputDateToISO(editPaymentData.due_date) : null,
        created_at: editPaymentData.created_at ? inputDateToISO(editPaymentData.created_at) : selectedPayment.created_at,
        paid_at: editPaymentData.paid_at ? inputDateToISO(editPaymentData.paid_at) : selectedPayment.paid_at,
        description: editPaymentData.description || null,
      });
      setIsEditDialogOpen(false);
      setSelectedPayment(null);
    } catch (error) {
      console.error('Error updating payment:', error);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const cleanDigits = term.replace(/\D/g, '');

    const clientName = (payment.subscriptions?.clients?.name || payment.clients?.name || payment.clientName || '').toLowerCase();
    const description = (payment.description || '').toLowerCase();
    const clientEmail = (payment.subscriptions?.clients?.email || payment.clients?.email || '').toLowerCase();
    const rawDoc = (payment.subscriptions?.clients?.document || payment.clients?.document || '');
    const cleanDoc = rawDoc.replace(/\D/g, '');
    const rawPhone = (payment.subscriptions?.clients?.phone || payment.clients?.phone || '');
    const cleanPhone = rawPhone.replace(/\D/g, '');

    return (
      clientName.includes(term) ||
      description.includes(term) ||
      clientEmail.includes(term) ||
      rawDoc.toLowerCase().includes(term) ||
      (cleanDigits.length >= 3 && cleanDoc.includes(cleanDigits)) ||
      rawPhone.toLowerCase().includes(term) ||
      (cleanDigits.length >= 3 && cleanPhone.includes(cleanDigits))
    );
  });

  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    setVisibleCount(10);
  }, [search]);

  const displayedPayments = filteredPayments.slice(0, visibleCount);

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
      render: (item: Payment) => {
        const parentPayment = item.parent_payment_id
          ? payments.find((p) => p.id === item.parent_payment_id)
          : undefined;
        const hasPartialBalance = !item.parent_payment_id && Number(item.paid_amount || 0) > 0;
        return (
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground text-sm">{getPaymentClientName(item)}</span>
              {item.parent_payment_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                  Parcial
                </span>
              )}
              {hasPartialBalance && item.status !== 'paid' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">
                  Parcial em aberto
                </span>
              )}
            </div>
            {item.description && !item.subscription_id && (
              <span className="block text-[11px] text-muted-foreground truncate max-w-[240px]">
                {item.description}
              </span>
            )}
            {parentPayment?.description && parentPayment.description !== item.description && (
              <span className="block text-[10px] text-muted-foreground/80 truncate max-w-[240px]">
                Ref: {parentPayment.description}
              </span>
            )}
            <span className="block text-xs text-muted-foreground sm:hidden">{item.payment_method}</span>
          </div>
        );
      },
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (item: Payment) => {
        const paidSoFar = Number(item.paid_amount || 0);
        const origTotal = Number(item.original_amount || 0);
        const hasPartialHistory = item.status !== 'paid' && paidSoFar > 0;
        const parentPayment = item.parent_payment_id
          ? payments.find((p) => p.id === item.parent_payment_id)
          : undefined;
        const parentOrig = parentPayment
          ? Number(parentPayment.original_amount || Number(parentPayment.amount) + Number(parentPayment.paid_amount || 0))
          : 0;
        const parentRemaining = parentPayment
          ? parentPayment.status === 'paid'
            ? 0
            : Number(parentPayment.amount)
          : 0;

        return (
          <div>
            <span className="font-semibold text-foreground text-sm">{formatCurrency(Number(item.amount))}</span>
            {hasPartialHistory && (
              <span className="block text-[11px] text-muted-foreground">
                de {formatCurrency(origTotal || Number(item.amount) + paidSoFar)} · pago {formatCurrency(paidSoFar)}
              </span>
            )}
            {item.parent_payment_id && parentPayment && (
              <span className="block text-[11px] text-muted-foreground">
                de {formatCurrency(parentOrig)} · {parentRemaining > 0.009 ? `restam ${formatCurrency(parentRemaining)}` : 'quitada'}
              </span>
            )}
          </div>
        );
      },
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
        <div>
          <span className="text-muted-foreground block">
            {formatBrazilDate(item.created_at, 'dd/MM/yyyy')}
          </span>
          <span className="text-[11px] text-muted-foreground/75 block">
            às {formatBrazilDate(item.created_at, 'HH:mm')}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Payment) => {
        let displayStatus = item.status;
        if (displayStatus === 'pending') {
          let dueDate;
          if (item.due_date) {
            dueDate = new Date(item.due_date);
          } else {
            const createdDate = new Date(item.created_at);
            dueDate = new Date(createdDate);
            dueDate.setDate(dueDate.getDate() + 7);
          }
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (dueDate < today) {
            displayStatus = 'overdue';
          }
        }
        return <StatusBadge status={displayStatus} />;
      },
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
            <DropdownMenuItem onClick={() => handleOpenEditDialog(item)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
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
            {item.status !== 'paid' && !item.subscription_id && (
              <DropdownMenuItem onClick={() => handleOpenPartialDialog(item)}>
                <Wallet className="w-4 h-4 mr-2 text-primary" />
                Registrar parcial
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
        <div className="space-y-4">
          <DataTable data={displayedPayments} columns={columns} />

          {visibleCount < filteredPayments.length && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 pt-2 pb-4">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Exibindo <span className="font-semibold text-foreground">{displayedPayments.length}</span> de <span className="font-semibold text-foreground">{filteredPayments.length}</span> pagamentos
              </p>
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-secondary/50 hover:bg-secondary/90 border-border/60 text-sm font-medium px-6 py-2 h-10 gap-2 shadow-sm"
                onClick={() => setVisibleCount((prev) => prev + 10)}
              >
                Ver mais pagamentos (+10)
              </Button>
            </div>
          )}
        </div>
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
          
          {selectedPayment && (() => {
            const parentPayment = selectedPayment.parent_payment_id
              ? payments.find((p) => p.id === selectedPayment.parent_payment_id)
              : undefined;
            const childPartials = payments.filter(
              (p) => p.parent_payment_id === selectedPayment.id && p.status === 'paid',
            );
            const hasPartialContext =
              !!selectedPayment.parent_payment_id ||
              Number(selectedPayment.paid_amount || 0) > 0 ||
              childPartials.length > 0;
            const summaryRef = parentPayment || selectedPayment;
            const summaryPaid = Number(
              summaryRef.paid_amount ||
                childPartials.reduce((acc, p) => acc + Number(p.amount), 0) ||
                (selectedPayment.parent_payment_id ? selectedPayment.amount : 0),
            );
            const summaryRemaining = summaryRef.status === 'paid' ? 0 : Number(summaryRef.amount);
            const summaryOrig = Number(
              summaryRef.original_amount ||
                (summaryRef.status === 'paid' && Number(summaryRef.paid_amount || 0) === 0
                  ? summaryRef.amount
                  : summaryRemaining + summaryPaid),
            );

            return (
            <div className="space-y-4 mt-4 max-h-[75vh] overflow-y-auto pr-1">
              {hasPartialContext && (
                <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/25 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge className="bg-primary/20 text-primary border border-primary/30 text-[11px]">
                      {selectedPayment.parent_payment_id
                        ? 'Pagamento Parcial'
                        : selectedPayment.status === 'paid'
                          ? 'Quitado com Pagamentos Parciais'
                          : 'Cobrança com Pagamento Parcial'}
                    </Badge>
                    {parentPayment?.description && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                        {parentPayment.description}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Total Original</span>
                      <span className="font-semibold text-foreground">{formatCurrency(summaryOrig)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Já Pago</span>
                      <span className="font-semibold text-success">{formatCurrency(summaryPaid)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Restante</span>
                      <span className={`font-semibold ${summaryRemaining > 0.009 ? 'text-warning' : 'text-success'}`}>
                        {summaryRemaining > 0.009 ? formatCurrency(summaryRemaining) : 'Quitado'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cliente</label>
                  <p className="text-sm font-medium text-foreground">{getPaymentClientName(selectedPayment)}</p>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {selectedPayment.parent_payment_id
                      ? 'Valor desta Parcela'
                      : selectedPayment.status !== 'paid' && Number(selectedPayment.paid_amount || 0) > 0
                        ? 'Restante em aberto'
                        : 'Valor'}
                  </label>
                  <p className="text-sm font-medium text-foreground">{formatCurrency(Number(selectedPayment.amount))}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Método</label>
                  <p className="text-sm font-medium text-foreground">{selectedPayment.payment_method || 'N/A'}</p>
                </div>
                
                <div className="space-y-1 flex flex-col items-start">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={selectedPayment.status} />
                    {(selectedPayment.parent_payment_id || Number(selectedPayment.paid_amount || 0) > 0) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
                        Parcial
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data de Criação</label>
                  <p className="text-sm font-medium text-foreground">{formatBrazilDateTime(selectedPayment.created_at)}</p>
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
                    <p className="text-sm font-medium text-foreground">{formatBrazilDateTime(selectedPayment.paid_at)}</p>
                  </div>
                )}
                
                {selectedPayment.description && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                    <p className="text-sm font-medium text-foreground">{selectedPayment.description}</p>
                  </div>
                )}

                {parentPayment?.description && parentPayment.description !== selectedPayment.description && (
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Cobrança Original</label>
                    <p className="text-sm font-medium text-foreground">{parentPayment.description}</p>
                  </div>
                )}

                {childPartials.length > 0 && (
                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Parcelas Pagas ({childPartials.length})
                    </label>
                    <div className="space-y-1.5">
                      {childPartials.map((cp) => (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-secondary/40 border border-border/40 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {cp.description || 'Pagamento parcial'}
                            </p>
                            <p className="text-muted-foreground">
                              {formatBrazilDateTime(cp.paid_at || cp.created_at)} · {cp.payment_method || 'PIX'}
                            </p>
                          </div>
                          <span className="font-semibold text-success shrink-0">
                            {formatCurrency(Number(cp.amount))}
                          </span>
                        </div>
                      ))}
                    </div>
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
                {selectedPayment.status !== 'paid' && !selectedPayment.subscription_id && (
                  <Button
                    variant="outline"
                    className="flex-1 border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => {
                      const target = selectedPayment;
                      setIsDetailsDialogOpen(false);
                      handleOpenPartialDialog(target);
                    }}
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    Parcial
                  </Button>
                )}
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
            );
          })()}
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

      {/* Edit Payment Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Editar Fatura</DialogTitle>
            <DialogDescription>
              Atualize os dados desta fatura/pagamento.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editPaymentData.amount}
                onChange={(e) => setEditPaymentData({ ...editPaymentData, amount: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Input
                type="date"
                value={editPaymentData.due_date}
                onChange={(e) => setEditPaymentData({ ...editPaymentData, due_date: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Data de Criação</Label>
              <Input
                type="date"
                value={editPaymentData.created_at}
                onChange={(e) => setEditPaymentData({ ...editPaymentData, created_at: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>

            <div className="space-y-2">
              <Label>Data de Pagamento (Pago em)</Label>
              <Input
                type="date"
                value={editPaymentData.paid_at}
                onChange={(e) => setEditPaymentData({ ...editPaymentData, paid_at: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                placeholder="Descrição opcional"
                value={editPaymentData.description}
                onChange={(e) => setEditPaymentData({ ...editPaymentData, description: e.target.value })}
                className="bg-secondary/50 border-border/50"
              />
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1 border-border/50"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedPayment(null);
                }}
              >
                Cancelar
              </Button>
              <Button 
                className="flex-1" 
                onClick={handleUpdatePayment}
              >
                Salvar Alterações
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Partial Payment Dialog */}
      <Dialog open={isPartialDialogOpen} onOpenChange={setIsPartialDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-[95vw] sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Registrar Pagamento Parcial</DialogTitle>
            <DialogDescription>
              Registre um valor avulso já pago pelo cliente. O restante continuará pendente na cobrança original.
            </DialogDescription>
          </DialogHeader>

          {selectedPayment && (() => {
            const openAmount = Number(selectedPayment.amount);
            const alreadyPaid = Number(selectedPayment.paid_amount || 0);
            const origAmount = Number(selectedPayment.original_amount || openAmount + alreadyPaid);
            const entered = parseFloat(partialForm.amount.replace(',', '.'));
            const validEntered = Number.isFinite(entered) && entered > 0 && entered <= openAmount;
            const willRemain = validEntered ? Math.max(0, openAmount - entered) : openAmount;

            return (
              <div className="space-y-4 mt-2">
                <div className="p-3.5 rounded-xl bg-secondary/40 border border-border/40 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="font-medium text-foreground">{getPaymentClientName(selectedPayment)}</span>
                  </div>
                  {selectedPayment.description && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground shrink-0">Cobrança</span>
                      <span className="font-medium text-foreground truncate">{selectedPayment.description}</span>
                    </div>
                  )}
                  {alreadyPaid > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor original</span>
                        <span className="text-foreground">{formatCurrency(origAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Já pago anteriormente</span>
                        <span className="text-success font-medium">{formatCurrency(alreadyPaid)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-1 border-t border-border/40">
                    <span className="text-muted-foreground font-medium">Saldo em aberto</span>
                    <span className="font-bold text-primary">{formatCurrency(openAmount)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Valor recebido agora (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={openAmount}
                    placeholder={`Ex: ${Math.min(700, openAmount).toFixed(2)}`}
                    value={partialForm.amount}
                    onChange={(e) => setPartialForm({ ...partialForm, amount: e.target.value })}
                    className="bg-secondary/50 border-border/50"
                  />
                  {validEntered && (
                    <p className="text-xs text-muted-foreground">
                      {willRemain > 0.009
                        ? `Pago agora: ${formatCurrency(entered)} · Restará em aberto: ${formatCurrency(willRemain)}`
                        : 'Este valor quita integralmente o saldo em aberto.'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Método</Label>
                    <Select
                      value={partialForm.paymentMethod}
                      onValueChange={(val) => setPartialForm({ ...partialForm, paymentMethod: val })}
                    >
                      <SelectTrigger className="bg-secondary/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass-card border-border/50">
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                        <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                        <SelectItem value="CARTAO">Cartão</SelectItem>
                        <SelectItem value="OUTRO">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={partialForm.paidAt}
                      onChange={(e) => setPartialForm({ ...partialForm, paidAt: e.target.value })}
                      className="bg-secondary/50 border-border/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={partialForm.paidTime}
                      onChange={(e) => setPartialForm({ ...partialForm, paidTime: e.target.value })}
                      className="bg-secondary/50 border-border/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Observação (opcional)</Label>
                  <Input
                    placeholder="Ex: Entrada combinada via PIX"
                    value={partialForm.description}
                    onChange={(e) => setPartialForm({ ...partialForm, description: e.target.value })}
                    className="bg-secondary/50 border-border/50"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-border/50"
                    onClick={() => {
                      setIsPartialDialogOpen(false);
                      setSelectedPayment(null);
                    }}
                    disabled={isSavingPartial}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={handleSavePartialPayment}
                    disabled={isSavingPartial || !validEntered}
                  >
                    {isSavingPartial ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Parcial'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Payments;