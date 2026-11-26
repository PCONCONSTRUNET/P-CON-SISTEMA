import { useState, useMemo } from 'react';
import { Search, FileText, Download, Eye, Trash2, Plus, Calendar, User, DollarSign } from 'lucide-react';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import DashboardLayout from '@/components/DashboardLayout';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGlobalData } from '@/contexts/GlobalDataContext';
import { formatBrazilDate, formatBrazilDateTime } from '@/utils/dateUtils';
import { formatDocumentInput } from '@/utils/documentValidation';
import { formatPhoneDisplay, loadTrimmedPdfLogo } from '@/utils/pdfBrandUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ClientSearchSelect from '@/components/ClientSearchSelect';

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
  planName?: string | null;
  paymentMethod?: string | null;
  transactionId?: string | null;
  paidAt?: string | null;
  isPartial?: boolean;
  parentDescription?: string | null;
  originalTotal?: number | null;
  remainingTotal?: number | null;
}

const Invoices = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithClient | null>(null);
  const [newInvoice, setNewInvoice] = useState({ client_id: '', amount: '' });
  const [isCreating, setIsCreating] = useState(false);
  const { invoices, clients, payments, loadingInvoices, loadingClients, refetchAll, deleteInvoice } = useGlobalData();

  const loading = loadingInvoices || loadingClients;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Enrich invoices with client and payment data
  const enrichedInvoices = useMemo<InvoiceWithClient[]>(() => {
    return invoices.map(inv => {
      const client = clients.find(c => c.id === inv.client_id);
      const payment = inv.payment_id ? payments.find(p => p.id === inv.payment_id) : undefined;
      const parentPayment = payment?.parent_payment_id
        ? payments.find(p => p.id === payment.parent_payment_id)
        : undefined;
      // Extract plan name from description if available
      const descriptionMatch = (inv as any).description?.match(/plano ativo:\s*(.+)$/i);
      const planName = descriptionMatch ? descriptionMatch[1] : null;
      const origTotal = parentPayment
        ? Number(parentPayment.original_amount || Number(parentPayment.amount) + Number(parentPayment.paid_amount || 0))
        : null;
      const remTotal = parentPayment
        ? parentPayment.status === 'paid'
          ? 0
          : Number(parentPayment.amount)
        : null;

      return {
        ...inv,
        description: (inv as any).description || '',
        clientName: client?.name || 'Cliente não encontrado',
        clientEmail: client?.email || '',
        clientPhone: client?.phone || '',
        clientDocument: client?.document || '',
        planName: planName,
        paymentMethod: payment?.payment_method || null,
        transactionId: payment?.transaction_id || null,
        paidAt: payment?.paid_at || null,
        isPartial: !!payment?.parent_payment_id || inv.number.startsWith('PARC-'),
        parentDescription: parentPayment?.description || null,
        originalTotal: origTotal,
        remainingTotal: remTotal,
      };
    });
  }, [invoices, clients, payments]);

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

  const handleDownloadPDF = async (invoice: InvoiceWithClient) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      // Paleta oficial P-CON CONSTRUNET
      const navyColor: [number, number, number] = [18, 52, 118];
      const primaryColor: [number, number, number] = [30, 79, 163];
      const accentCyan: [number, number, number] = [0, 158, 227];
      const emeraldColor: [number, number, number] = [16, 150, 92];
      const darkColor: [number, number, number] = [28, 33, 42];
      const grayColor: [number, number, number] = [104, 114, 128];
      const cardBg: [number, number, number] = [244, 247, 252];
      const borderColor: [number, number, number] = [214, 223, 238];

      // Header Executivo
      const headerH = 42;
      doc.setFillColor(...navyColor);
      doc.rect(0, 0, pageWidth, headerH, 'F');
      doc.setFillColor(...accentCyan);
      doc.rect(0, headerH - 1.5, pageWidth, 1.5, 'F');

      // Logo original P-CON CONSTRUNET (com recorte automático de borda)
      try {
        const trimmedLogo = await loadTrimmedPdfLogo('/images/logo-pcon-white.png');
        const logoH = 17;
        const logoW = Math.min(logoH * (trimmedLogo.width / trimmedLogo.height), 58);
        doc.addImage(trimmedLogo.dataUrl, 'PNG', margin, (headerH - logoH - 1.5) / 2, logoW, logoH);
      } catch {
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('P-CON CONSTRUNET', margin, 22);
      }

      // Título à direita
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text(invoice.isPartial ? 'NOTA FISCAL PARCIAL' : 'NOTA FISCAL', pageWidth - margin, 19, {
        align: 'right',
      });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(210, 226, 255);
      doc.text('P-CON CONSTRUNET · Sistema de Gestão de Pagamentos', pageWidth - margin, 27, {
        align: 'right',
      });

      let y = headerH + 8;

      // Bloco de metadados da NF (3 colunas com divisórias)
      doc.setFillColor(...cardBg);
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.35);
      doc.roundedRect(margin, y, contentWidth, 24, 2.5, 2.5, 'FD');

      const colW = contentWidth / 3;
      doc.setDrawColor(218, 226, 238);
      doc.line(margin + colW, y + 4, margin + colW, y + 20);
      doc.line(margin + colW * 2, y + 4, margin + colW * 2, y + 20);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...grayColor);
      doc.text('NÚMERO DA NOTA', margin + 5, y + 7.5);
      doc.text('EMISSÃO (BRASÍLIA)', margin + colW + 5, y + 7.5);
      doc.text('SITUAÇÃO', margin + colW * 2 + 5, y + 7.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...darkColor);
      doc.text(invoice.number, margin + 5, y + 16);
      doc.text(formatBrazilDateTime(invoice.issued_at), margin + colW + 5, y + 16);

      doc.setTextColor(...emeraldColor);
      const statusLabel = invoice.status === 'issued' ? 'EMITIDA / QUITADA' : invoice.status.toUpperCase();
      doc.text(statusLabel, margin + colW * 2 + 5, y + 16);

      y += 31;

      // Blocos Emissor + Cliente lado a lado
      const halfW = (contentWidth - 6) / 2;
      const partyBoxH = 42;

      // Card Emissor
      doc.setFillColor(...cardBg);
      doc.setDrawColor(...borderColor);
      doc.roundedRect(margin, y, halfW, partyBoxH, 2.5, 2.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...primaryColor);
      doc.text('PRESTADOR / EMISSOR', margin + 5, y + 7);
      doc.line(margin + 5, y + 9.5, margin + halfW - 5, y + 9.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...darkColor);
      doc.text('P-CON CONSTRUNET', margin + 5, y + 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...grayColor);
      doc.text('Gestão de Assinaturas e Sistemas', margin + 5, y + 22);
      doc.text('Portal: www.pconassinantes.site', margin + 5, y + 28);
      if (invoice.isPartial) {
        doc.setTextColor(...primaryColor);
        doc.setFont('helvetica', 'bold');
        doc.text('Modalidade: Recebimento Parcial', margin + 5, y + 35);
      }

      // Card Cliente
      const clientX = margin + halfW + 6;
      doc.setFillColor(...cardBg);
      doc.setDrawColor(...borderColor);
      doc.roundedRect(clientX, y, halfW, partyBoxH, 2.5, 2.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...primaryColor);
      doc.text('TOMADOR / CLIENTE', clientX + 5, y + 7);
      doc.line(clientX + 5, y + 9.5, clientX + halfW - 5, y + 9.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...darkColor);
      const clientNameLines = doc.splitTextToSize(invoice.clientName || 'N/A', halfW - 10);
      doc.text(clientNameLines.slice(0, 2), clientX + 5, y + 15.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(...grayColor);
      const formattedDoc = invoice.clientDocument
        ? formatDocumentInput(invoice.clientDocument)
        : 'Não informado';
      const formattedPhone = formatPhoneDisplay(invoice.clientPhone);
      let cy = y + (clientNameLines.length > 1 ? 25 : 22);
      doc.text(`CPF/CNPJ: ${formattedDoc}`, clientX + 5, cy);
      cy += 5.5;
      if (invoice.clientEmail) {
        const emailLines = doc.splitTextToSize(`E-mail: ${invoice.clientEmail}`, halfW - 10);
        doc.text(emailLines[0], clientX + 5, cy);
        cy += 5.5;
      }
      if (formattedPhone) {
        doc.text(`Telefone: ${formattedPhone}`, clientX + 5, cy);
      }

      y += partyBoxH + 8;

      // Seção Descrição dos Serviços
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...primaryColor);
      doc.text('DESCRIÇÃO DOS SERVIÇOS', margin, y);
      y += 3;

      // Cabeçalho da tabela
      doc.setFillColor(232, 238, 248);
      doc.roundedRect(margin, y, contentWidth, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...darkColor);
      doc.text('DESCRIÇÃO', margin + 5, y + 6.5);
      doc.text('MEIO', margin + 124, y + 6.5);
      doc.text('VALOR', pageWidth - margin - 5, y + 6.5, { align: 'right' });

      y += 10;

      const baseDescription = invoice.planName
        ? `Valor pago referente ao plano ativo: ${invoice.planName}`
        : invoice.description || 'Serviço conforme contrato';

      const descLines = doc.splitTextToSize(baseDescription, 108);
      const subLines: string[] = [];
      if (invoice.isPartial && invoice.parentDescription && invoice.parentDescription !== baseDescription) {
        subLines.push(...doc.splitTextToSize(`Referência: ${invoice.parentDescription}`, 108));
      }
      if (invoice.isPartial && invoice.originalTotal) {
        const remLabel =
          invoice.remainingTotal && invoice.remainingTotal > 0.009
            ? `Restante em aberto: ${formatCurrency(invoice.remainingTotal)}`
            : 'Guia quitada';
        subLines.push(`Total da cobrança: ${formatCurrency(invoice.originalTotal)} · ${remLabel}`);
      }

      const rowH = Math.max(18, descLines.length * 5.2 + subLines.length * 4.6 + 8);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...borderColor);
      doc.roundedRect(margin, y, contentWidth, rowH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...darkColor);
      doc.text(descLines, margin + 5, y + 7);

      if (subLines.length > 0) {
        const subY = y + 7 + descLines.length * 5.2;
        doc.setFontSize(8);
        doc.setTextColor(...grayColor);
        doc.text(subLines, margin + 5, subY);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...grayColor);
      doc.text((invoice.paymentMethod || 'PIX').toUpperCase(), margin + 124, y + 7);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...darkColor);
      doc.text(formatCurrency(Number(invoice.amount)), pageWidth - margin - 5, y + 7, { align: 'right' });

      y += rowH + 9;

      // Bloco inferior: Dados da Transação à esquerda + Valor Total à direita
      const summaryH = 30;
      const leftBoxW = contentWidth - 76;

      doc.setFillColor(...cardBg);
      doc.setDrawColor(...borderColor);
      doc.roundedRect(margin, y, leftBoxW, summaryH, 2.5, 2.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...primaryColor);
      doc.text('AUTENTICAÇÃO E PAGAMENTO', margin + 5, y + 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...grayColor);
      const paidWhen = invoice.paidAt
        ? formatBrazilDateTime(invoice.paidAt)
        : formatBrazilDateTime(invoice.issued_at);
      doc.text(`Confirmado em: ${paidWhen}`, margin + 5, y + 14);
      doc.text(
        `Transação / Ref.: ${invoice.transactionId || invoice.payment_id || invoice.id}`,
        margin + 5,
        y + 20,
      );
      doc.text(`Código da NF: ${invoice.number}`, margin + 5, y + 26);

      // Card Valor Total
      const totalBoxX = margin + leftBoxW + 6;
      doc.setFillColor(...primaryColor);
      doc.roundedRect(totalBoxX, y, 70, summaryH, 2.5, 2.5, 'F');

      doc.setTextColor(215, 230, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('VALOR TOTAL DA NOTA', totalBoxX + 35, y + 9, { align: 'center' });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(17);
      doc.text(formatCurrency(Number(invoice.amount)), totalBoxX + 35, y + 21, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(215, 230, 255);
      doc.text(invoice.isPartial ? 'Parcela quitada' : 'Documento quitado', totalBoxX + 35, y + 27, {
        align: 'center',
      });

      // Rodapé
      const footerY = 272;
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.3);
      doc.line(margin, footerY - 6, pageWidth - margin, footerY - 6);

      doc.setTextColor(...grayColor);
      doc.setFontSize(8.2);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Documento eletrônico emitido automaticamente pelo sistema P-CON CONSTRUNET',
        pageWidth / 2,
        footerY,
        { align: 'center' },
      );
      doc.text(
        `PDF gerado em ${formatBrazilDateTime(new Date())} · www.pconassinantes.site`,
        pageWidth / 2,
        footerY + 6,
        { align: 'center' },
      );

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
                <Label>Cliente *</Label>
                <ClientSearchSelect
                  clients={clients}
                  value={newInvoice.client_id}
                  onChange={(v) => setNewInvoice(prev => ({ ...prev, client_id: v }))}
                  placeholder="Buscar por nome, CPF/CNPJ, email ou telefone..."
                />
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
                <div className="flex items-center gap-1.5">
                  {invoice.isPartial && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
                      Parcial
                    </span>
                  )}
                  <StatusBadge status={invoice.status} />
                </div>
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
                  {formatBrazilDateTime(invoice.issued_at)}
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
                  <span className="font-medium text-foreground">{formatBrazilDateTime(selectedInvoice.issued_at)}</span>
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

