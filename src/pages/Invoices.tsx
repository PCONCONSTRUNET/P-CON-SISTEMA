import { useState, useMemo } from 'react';
import { Search, FileText, Download, Eye, Trash2, Plus, Calendar, User, DollarSign } from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import DashboardLayout from '@/components/DashboardLayout';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGlobalData } from '@/contexts/GlobalDataContext';
import { formatBrazilDate } from '@/utils/dateUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InvoiceWithClient {
  id: string;
  payment_id: string | null;
  client_id: string;
  number: string;
  amount: number;
  status: string;
  issued_at: string;
  description?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientDocument?: string;
  planName?: string;
}

const Invoices = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithClient | null>(null);
  const [newInvoice, setNewInvoice] = useState({ client_id: '', amount: '' });
  const [isCreating, setIsCreating] = useState(false);
  const { invoices, clients, loadingInvoices, loadingClients, refetchAll, deleteInvoice } = useGlobalData();

  const loading = loadingInvoices || loadingClients;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Enrich invoices with client data
  const enrichedInvoices = useMemo(() => {
    return invoices.map(inv => {
      const client = clients.find(c => c.id === inv.client_id);
      // Extract plan name from description if available
      const descriptionMatch = (inv as any).description?.match(/plano ativo:\s*(.+)$/i);
      const planName = descriptionMatch ? descriptionMatch[1] : null;
      return {
        ...inv,
        description: (inv as any).description || '',
        clientName: client?.name || 'Cliente não encontrado',
        clientEmail: client?.email || '',
        clientPhone: client?.phone || '',
        clientDocument: client?.document || '',
        planName: planName,
      };
    });
  }, [invoices, clients]);

  const filteredInvoices = enrichedInvoices.filter(invoice =>
    invoice.clientName.toLowerCase().includes(search.toLowerCase()) ||
    invoice.number.toLowerCase().includes(search.toLowerCase())
  );

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const thisMonthInvoices = invoices.filter(inv => {
      const issuedDate = parseISO(inv.issued_at);
      return isWithinInterval(issuedDate, { start: monthStart, end: monthEnd });
    });

    const totalIssued = invoices.reduce((acc, inv) => acc + Number(inv.amount), 0);
    const thisMonthTotal = thisMonthInvoices.reduce((acc, inv) => acc + Number(inv.amount), 0);

    return {
      total: invoices.length,
      totalIssued,
      thisMonthCount: thisMonthInvoices.length,
      thisMonthTotal,
    };
  }, [invoices]);

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
      if (error) throw error;
      toast.success('Nota fiscal removida com sucesso!');
      refetchAll();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Erro ao remover nota fiscal');
    }
  };

  const handleCreateInvoice = async () => {
    if (!newInvoice.client_id || !newInvoice.amount) {
      toast.error('Preencha todos os campos');
      return;
    }

    setIsCreating(true);
    try {
      const invoiceNumber = `NF-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from('invoices').insert({
        client_id: newInvoice.client_id,
        number: invoiceNumber,
        amount: parseFloat(newInvoice.amount),
        status: 'issued',
      });

      if (error) throw error;
      toast.success('Nota fiscal criada com sucesso!');
      setNewInvoice({ client_id: '', amount: '' });
      setIsDialogOpen(false);
      refetchAll();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Erro ao criar nota fiscal');
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewDetails = (invoice: InvoiceWithClient) => {
    setSelectedInvoice(invoice);
    setIsDetailsOpen(true);
  };

  const handleDownloadPDF = (invoice: InvoiceWithClient) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Colors
      const primaryColor: [number, number, number] = [30, 79, 163]; // Blue
      const darkColor: [number, number, number] = [33, 37, 41];
      const grayColor: [number, number, number] = [108, 117, 125];
      const lightGray: [number, number, number] = [248, 249, 250];
      
      // Header background
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      // Company name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('P-CON', 20, 25);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Sistema de Gestao de Assinaturas', 20, 35);
      
      // Invoice label
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTA FISCAL', pageWidth - 20, 30, { align: 'right' });
      
      // Invoice info box
      doc.setTextColor(...darkColor);
      doc.setFillColor(...lightGray);
      doc.roundedRect(20, 60, pageWidth - 40, 35, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...grayColor);
      doc.text('NUMERO', 30, 72);
      doc.text('DATA DE EMISSAO', 90, 72);
      doc.text('STATUS', 160, 72);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkColor);
      doc.text(invoice.number, 30, 85);
      doc.text(formatBrazilDate(invoice.issued_at), 90, 85);
      doc.text(invoice.status === 'issued' ? 'EMITIDA' : invoice.status.toUpperCase(), 160, 85);
      
      // Client section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('DADOS DO CLIENTE', 20, 115);
      
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(20, 118, pageWidth - 20, 118);
      
      doc.setTextColor(...darkColor);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Nome:', 20, 130);
      doc.setFont('helvetica', 'normal');
      doc.text(invoice.clientName || 'N/A', 50, 130);
      
      if (invoice.clientDocument) {
        doc.setFont('helvetica', 'bold');
        doc.text('CPF/CNPJ:', 20, 140);
        doc.setFont('helvetica', 'normal');
        doc.text(invoice.clientDocument, 50, 140);
      }
      
      if (invoice.clientEmail) {
        doc.setFont('helvetica', 'bold');
        doc.text('Email:', 20, 150);
        doc.setFont('helvetica', 'normal');
        doc.text(invoice.clientEmail, 50, 150);
      }
      
      if (invoice.clientPhone) {
        doc.setFont('helvetica', 'bold');
        doc.text('Telefone:', 110, 150);
        doc.setFont('helvetica', 'normal');
        doc.text(invoice.clientPhone, 140, 150);
      }
      
      // Services section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('DESCRICAO DOS SERVICOS', 20, 175);
      
      doc.setDrawColor(...primaryColor);
      doc.line(20, 178, pageWidth - 20, 178);
      
      // Table header
      doc.setFillColor(...lightGray);
      doc.rect(20, 185, pageWidth - 40, 12, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkColor);
      doc.text('DESCRICAO', 25, 193);
      doc.text('VALOR', pageWidth - 25, 193, { align: 'right' });
      
      // Table row - show plan name if available
      doc.setFont('helvetica', 'normal');
      const serviceDescription = invoice.planName 
        ? `Valor pago referente ao plano ativo: ${invoice.planName}`
        : (invoice.description || 'Servico conforme contrato');
      doc.text(serviceDescription, 25, 208);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(invoice.amount), pageWidth - 25, 208, { align: 'right' });
      
      // Table border
      doc.setDrawColor(...grayColor);
      doc.setLineWidth(0.2);
      doc.line(20, 215, pageWidth - 20, 215);
      
      // Total section
      doc.setFillColor(...primaryColor);
      doc.roundedRect(pageWidth - 100, 225, 80, 30, 3, 3, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('VALOR TOTAL', pageWidth - 60, 237, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(invoice.amount), pageWidth - 60, 250, { align: 'center' });
      
      // Footer
      doc.setTextColor(...grayColor);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const footerY = 270;
      doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);
      
      doc.text('Documento gerado automaticamente pelo sistema P-CON', pageWidth / 2, footerY, { align: 'center' });
      doc.text(`Emitido em: ${format(new Date(), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}`, pageWidth / 2, footerY + 7, { align: 'center' });
      doc.text('www.assinaturaspcon.sbs', pageWidth / 2, footerY + 14, { align: 'center' });
      
      // Save PDF
      doc.save(`${invoice.number}.pdf`);
      toast.success('PDF baixado com sucesso!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erro ao gerar PDF');
    }
  };

  return (
    <DashboardLayout 
      title="Notas Fiscais" 
      subtitle="Gerencie as notas fiscais emitidas"
    >
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Buscar nota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50 h-10 sm:h-11"
          />
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 sm:h-11 gap-2">
              <Plus className="w-4 h-4" />
              <span>Nova Nota</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50">
            <DialogHeader>
              <DialogTitle>Nova Nota Fiscal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={newInvoice.client_id} onValueChange={(v) => setNewInvoice(prev => ({ ...prev, client_id: v }))}>
                  <SelectTrigger className="bg-secondary/50 border-border/50">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newInvoice.amount}
                  onChange={(e) => setNewInvoice(prev => ({ ...prev, amount: e.target.value }))}
                  className="bg-secondary/50 border-border/50"
                />
              </div>
              <Button onClick={handleCreateInvoice} disabled={isCreating} className="w-full">
                {isCreating ? 'Criando...' : 'Criar Nota Fiscal'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="glass-card p-3 sm:p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Total Emitidas</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-success" />
          </div>
          <p className="text-sm sm:text-xl font-bold text-success">{formatCurrency(stats.totalIssued)}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Valor Total</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-primary">{stats.thisMonthCount}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Este Mês</p>
        </div>
        <div className="glass-card p-3 sm:p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <p className="text-sm sm:text-xl font-bold text-primary">{formatCurrency(stats.thisMonthTotal)}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Total Este Mês</p>
        </div>
      </div>

      {/* Invoice Cards */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredInvoices.map((invoice) => (
            <div key={invoice.id} className="glass-card glass-card-hover p-4 sm:p-5">
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
                <StatusBadge status={invoice.status} />
              </div>
              
              <h3 className="font-heading font-semibold text-foreground text-sm sm:text-base mb-1">
                {invoice.number}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 truncate flex items-center gap-1">
                <User className="w-3 h-3" />
                {invoice.clientName}
              </p>
              
              <div className="flex items-center justify-between text-xs sm:text-sm mb-3 sm:mb-4">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatBrazilDate(invoice.issued_at)}
                </span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(Number(invoice.amount))}
                </span>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-1 sm:gap-2 border-border/50 text-xs sm:text-sm h-8 sm:h-9"
                  onClick={() => handleViewDetails(invoice)}
                >
                  <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                  Ver
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 gap-1 sm:gap-2 border-border/50 text-xs sm:text-sm h-8 sm:h-9"
                  onClick={() => handleDownloadPDF(invoice)}
                >
                  <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                  PDF
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1 sm:gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 text-xs sm:text-sm h-8 sm:h-9"
                  onClick={() => handleDeleteInvoice(invoice.id)}
                >
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredInvoices.length === 0 && (
        <div className="glass-card p-8 sm:p-12 text-center">
          <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-2">
            Nenhuma nota encontrada
          </h3>
          <p className="text-sm text-muted-foreground">
            Tente ajustar os filtros ou termo de busca.
          </p>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="glass-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Detalhes da Nota Fiscal
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 pt-2">
              <div className="glass-card p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Número:</span>
                  <span className="font-semibold text-foreground">{selectedInvoice.number}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Cliente:</span>
                  <span className="font-medium text-foreground">{selectedInvoice.clientName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Valor:</span>
                  <span className="font-bold text-success text-lg">{formatCurrency(selectedInvoice.amount)}</span>
                </div>
                {(selectedInvoice.planName || selectedInvoice.description) && (
                  <div className="flex flex-col gap-1 pt-2 border-t border-border/30">
                    <span className="text-muted-foreground text-sm">Descrição:</span>
                    <span className="font-medium text-foreground text-sm">
                      {selectedInvoice.planName 
                        ? `Valor pago referente ao plano ativo: ${selectedInvoice.planName}`
                        : selectedInvoice.description}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Data de Emissão:</span>
                  <span className="font-medium text-foreground">{formatBrazilDate(selectedInvoice.issued_at)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Status:</span>
                  <StatusBadge status={selectedInvoice.status} />
                </div>
              </div>
              
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailsOpen(false)}
                  className="flex-1"
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    handleDownloadPDF(selectedInvoice);
                    setIsDetailsOpen(false);
                  }}
                  className="flex-1 gap-2"
                >
                  <Download className="w-4 h-4" />
                  Baixar PDF
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Invoices;
