import jsPDF from 'jspdf';
import type { Proposal } from '@/hooks/useProposals';
import brandImage from '@/assets/pcon-construnet-brand.png';

const formatCurrency = (value: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDate = (value: string | null) => {
  if (!value) return 'Não informado';

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
};

const loadImageAsBase64 = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas indisponível para carregar a imagem'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Falha ao carregar imagem da marca'));
    img.src = url;
  });

const ensureSpace = (doc: jsPDF, currentY: number, requiredHeight: number) => {
  const pageHeight = doc.internal.pageSize.getHeight();

  if (currentY + requiredHeight > pageHeight - 18) {
    doc.addPage();
    return 20;
  }

  return currentY;
};

const drawSectionTitle = (doc: jsPDF, title: string, y: number) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(11, 28, 58);
  doc.text(title, 16, y);

  doc.setDrawColor(30, 79, 163);
  doc.setLineWidth(0.6);
  doc.line(16, y + 2, 194, y + 2);

  return y + 10;
};

const drawWrappedText = (doc: jsPDF, label: string, value: string, y: number, maxWidth = 178) => {
  const safeValue = value.trim() || 'Não informado';
  const lines = doc.splitTextToSize(safeValue, maxWidth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 79, 163);
  doc.text(label, 16, y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(46, 55, 72);
  doc.text(lines, 16, y + 5);

  return y + 5 + lines.length * 5 + 3;
};

export const generateProposalPDF = async (proposal: Proposal) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const safeTitle = proposal.project_title.replace(/[^a-zA-Z0-9]+/g, '_');

  doc.setFillColor(11, 28, 58);
  doc.rect(0, 0, pageWidth, 48, 'F');

  try {
    const brandBase64 = await loadImageAsBase64(brandImage);

    doc.addImage(brandBase64, 'PNG', 16, 9, 64, 24);
  } catch (error) {
    console.error('Erro ao carregar imagens da proposta PDF:', error);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('P-CON CONSTRUNET', 16, 22);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('Proposta Comercial', 16, 40);

  let y = 60;

  doc.setFillColor(244, 247, 252);
  doc.roundedRect(16, y, 178, 28, 4, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(11, 28, 58);
  doc.text(proposal.project_title, 20, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 102, 120);
  doc.text(`Status: ${proposal.status}`, 20, y + 18);
  doc.text(`Validade: ${formatDate(proposal.valid_until)}`, 110, y + 18);

  y += 40;
  y = drawSectionTitle(doc, 'Dados do cliente', y);
  y = drawWrappedText(doc, 'Nome', proposal.client_name, y);
  y = drawWrappedText(doc, 'Empresa', proposal.client_company || '', y);
  y = drawWrappedText(doc, 'Email', proposal.client_email || '', y);
  y = drawWrappedText(doc, 'Telefone', proposal.client_phone || '', y);

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, 'Projeto', y);
  y = drawWrappedText(doc, 'Descrição geral', proposal.project_description || '', y);
  y = drawWrappedText(doc, 'Prazo de entrega', proposal.delivery_deadline || '', y);
  y = drawWrappedText(doc, 'Prazo para início', proposal.start_deadline || '', y);

  y = ensureSpace(doc, y, 50);
  y = drawSectionTitle(doc, 'Escopo', y);
  proposal.scope_items.forEach((item, index) => {
    y = ensureSpace(doc, y, 14);
    const lines = doc.splitTextToSize(item, 165);

    doc.setFillColor(240, 244, 250);
    doc.roundedRect(16, y - 2, 178, 8 + lines.length * 5, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 79, 163);
    doc.text(`${index + 1}.`, 20, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(46, 55, 72);
    doc.text(lines, 28, y + 4);
    y += 10 + lines.length * 5;
  });

  y = ensureSpace(doc, y, 45);
  y = drawSectionTitle(doc, 'Investimento', y);

  doc.setFillColor(235, 245, 255);
  doc.roundedRect(16, y - 2, 178, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 79, 163);
  doc.text('Valor total', 20, y + 7);
  doc.text('Entrada', 80, y + 7);
  doc.text('Mensalidade', 132, y + 7);

  doc.setFontSize(14);
  doc.setTextColor(11, 28, 58);
  doc.text(formatCurrency(proposal.total_amount), 20, y + 17);
  doc.text(formatCurrency(proposal.entry_amount), 80, y + 17);
  doc.text(formatCurrency(proposal.monthly_amount), 132, y + 17);

  if (proposal.discount_amount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 102, 120);
    doc.text(`Desconto aplicado: ${formatCurrency(proposal.discount_amount)}`, 20, y + 24);
  }

  y += 40;

  if (proposal.notes) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, 'Observações', y);
    y = drawWrappedText(doc, '', proposal.notes, y - 2);
  }

  if (proposal.terms_and_conditions) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, 'Termos e condições', y);
    y = drawWrappedText(doc, '', proposal.terms_and_conditions, y - 2);
  }

  y = ensureSpace(doc, y, 24);
  doc.setDrawColor(214, 222, 234);
  doc.line(16, y, 194, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 102, 120);
  doc.text('P-CON CONSTRUNET • Proposta gerada pelo sistema comercial', pageWidth / 2, y + 7, { align: 'center' });
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, y + 12, { align: 'center' });

  doc.save(`Proposta_${safeTitle || 'P-CON'}.pdf`);
};