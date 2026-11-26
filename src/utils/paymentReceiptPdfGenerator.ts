import jsPDF from 'jspdf';
import { formatBrazilDateTime } from '@/utils/dateUtils';
import { formatDocumentInput } from '@/utils/documentValidation';
import { loadTrimmedPdfLogo } from '@/utils/pdfBrandUtils';

export interface PaymentReceiptPdfData {
  title: string;
  description?: string | null;
  amount: number;
  status: string;
  paymentMethod?: string | null;
  paidAt?: string | null;
  createdAt: string;
  checkoutUrl: string;
  token: string;
  linkId: string;
  paymentId?: string | null;
  transactionId?: string | null;
  invoiceNumber?: string | null;
  gatewayName?: string;
  gatewayStatus?: string | null;
  gatewayStatusDetail?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  recipientName?: string;
  recipientSite?: string;
}

const formatCurrencyBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const translateGatewayStatus = (status?: string | null, detail?: string | null): string => {
  const s = (status || '').toLowerCase();
  const base =
    s === 'approved' || s === 'paid'
      ? 'Aprovado / Liquidado'
      : s === 'pending'
        ? 'Aguardando Pagamento'
        : s === 'cancelled' || s === 'rejected'
          ? 'Cancelado / Recusado'
          : status || 'Confirmado no sistema';
  if (!detail) return base;
  return `${base} (${detail})`;
};

export const generatePaymentReceiptPDF = async (data: PaymentReceiptPdfData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const primaryColor: [number, number, number] = [30, 79, 163];
  const emeraldColor: [number, number, number] = [16, 150, 92];
  const textColor: [number, number, number] = [28, 32, 38];
  const mutedColor: [number, number, number] = [105, 115, 130];
  const cardBg: [number, number, number] = [243, 246, 251];
  const borderColor: [number, number, number] = [212, 221, 236];

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 42, 'F');

  try {
    const trimmedLogo = await loadTrimmedPdfLogo('/images/logo-pcon-white.png');
    const logoH = 16;
    const logoW = Math.min(logoH * (trimmedLogo.width / trimmedLogo.height), 56);
    doc.addImage(trimmedLogo.dataUrl, 'PNG', margin, (42 - logoH) / 2, logoW, logoH);
  } catch {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('P-CON CONSTRUNET', margin + 2, 22);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('COMPROVANTE DE PAGAMENTO', pageWidth - margin, 17, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 232, 255);
  doc.text(
    `Emitido em ${formatBrazilDateTime(new Date())}`,
    pageWidth - margin,
    24,
    { align: 'right' },
  );
  doc.text(
    `Link: /pagar/${data.token}`,
    pageWidth - margin,
    30,
    { align: 'right' },
  );

  y = 50;

  // Valor e status em destaque
  doc.setFillColor(238, 250, 244);
  doc.setDrawColor(168, 228, 198);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 26, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...emeraldColor);
  doc.text(
    data.status === 'paid' ? 'PAGAMENTO CONFIRMADO' : `STATUS: ${data.status.toUpperCase()}`,
    margin + 6,
    y + 8,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...textColor);
  doc.text(formatCurrencyBRL(data.amount), margin + 6, y + 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  const methodLabel = data.paymentMethod ? `Meio: ${data.paymentMethod.toUpperCase()}` : 'Meio: PIX / Cartão';
  const paidWhenLabel = data.paidAt
    ? `Pago em: ${formatBrazilDateTime(data.paidAt)}`
    : `Criado em: ${formatBrazilDateTime(data.createdAt)}`;
  doc.text(methodLabel, pageWidth - margin - 6, y + 11, { align: 'right' });
  doc.text(paidWhenLabel, pageWidth - margin - 6, y + 18, { align: 'right' });

  y += 34;

  const drawSection = (sectionTitle: string, rows: [string, string][]) => {
    const cleanRows = rows.filter(([, v]) => v && v.trim() !== '');
    const rowLineHeights = cleanRows.map(([, val]) => {
      const lines = doc.splitTextToSize(val, contentWidth - 68);
      return Math.max(1, lines.length) * 4.8 + 2.5;
    });
    const boxHeight = 11 + rowLineHeights.reduce((a, b) => a + b, 0) + 3;

    doc.setFillColor(...cardBg);
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...primaryColor);
    doc.text(sectionTitle, margin + 5, y + 7);

    doc.setDrawColor(220, 227, 238);
    doc.line(margin + 5, y + 9.5, pageWidth - margin - 5, y + 9.5);

    let ry = y + 15;
    cleanRows.forEach(([label, value], idx) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...mutedColor);
      doc.text(label, margin + 5, ry);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(...textColor);
      const valLines = doc.splitTextToSize(value, contentWidth - 68);
      doc.text(valLines, margin + 62, ry);
      ry += rowLineHeights[idx];
    });

    y += boxHeight + 6;
  };

  drawSection('DADOS DA COBRANÇA', [
    ['Título / Serviço', data.title],
    ['Descrição', data.description || 'Cobrança via link de pagamento'],
    ['URL do Checkout', data.checkoutUrl],
    ['Criado em', formatBrazilDateTime(data.createdAt)],
    ['Confirmado em', data.paidAt ? formatBrazilDateTime(data.paidAt) : '-'],
  ]);

  drawSection('PAGADOR (REMETENTE)', [
    ['Nome Completo', data.payerName || 'Não informado'],
    ['CPF / CNPJ', data.payerDocument ? formatDocumentInput(data.payerDocument) : 'Não informado'],
    ['E-mail', data.payerEmail || '-'],
    ['Telefone / WhatsApp', data.payerPhone || '-'],
  ]);

  drawSection('DESTINATÁRIO (RECEBEDOR)', [
    ['Empresa / Favorecido', data.recipientName || 'P-CON CONSTRUNET'],
    ['Portal / Sistema', data.recipientSite || 'www.pconassinantes.site'],
    ['Processador / Gateway', data.gatewayName || 'Mercado Pago'],
  ]);

  drawSection('DADOS DE AUTENTICAÇÃO E GATEWAY', [
    ['ID Transação (MP/Gateway)', data.transactionId || 'Não informado'],
    ['Status no Gateway', translateGatewayStatus(data.gatewayStatus || data.status, data.gatewayStatusDetail)],
    ['ID do Pagamento (Sistema)', data.paymentId || '-'],
    ['ID do Link', data.linkId],
    ['Nota / Fatura Vinculada', data.invoiceNumber || '-'],
  ]);

  // Footer
  doc.setDrawColor(215, 222, 232);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 2, pageWidth - margin, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...mutedColor);
  doc.text(
    'P-CON CONSTRUNET · Comprovante eletrônico gerado pelo painel administrativo',
    pageWidth / 2,
    y + 8,
    { align: 'center' },
  );
  doc.text(
    `Autenticação: ${data.transactionId || data.paymentId || data.linkId}`,
    pageWidth / 2,
    y + 13,
    { align: 'center' },
  );

  const safeTitle = (data.title || 'comprovante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const idPart = data.transactionId || data.token;
  doc.save(`Comprovante_${safeTitle}_${idPart}.pdf`);
};
