import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import brandImage from '@/assets/pcon-construnet-brand.png';

export interface PConProposalData {
  clientName: string;
  currentCatalogItems: { item: string; value: string }[];
  newProposalItems: { item: string; value: string }[];
  financialSummary: string[];
  includedItems: string[];
  courtesyItems: string[];
}

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

export const generatePConProposalPDF = async (data: PConProposalData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 20;

  // Header - Logo
  try {
    const brandBase64 = await loadImageAsBase64(brandImage);
    // Tentar centralizar a logo. Ajustar as proporções conforme necessário.
    const imgWidth = 64;
    const imgHeight = 24;
    doc.addImage(brandBase64, 'PNG', (pageWidth - imgWidth) / 2, currentY, imgWidth, imgHeight);
    currentY += imgHeight + 10;
  } catch (error) {
    console.error('Erro ao carregar logo:', error);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(11, 71, 157); // Azul P-CON
    doc.text('P-CON CONSTRUNET', pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;
  }

  // Título "PROPOSTA COMERCIAL"
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text('PROPOSTA COMERCIAL', pageWidth / 2, currentY, { align: 'center' });
  currentY += 15;

  // Cliente
  doc.setFontSize(12);
  doc.text(`Cliente: ${data.clientName}`, 16, currentY);
  currentY += 15;

  const primaryBlue: [number, number, number] = [11, 71, 157]; // #0b479d aproximado
  const textColor: [number, number, number] = [30, 30, 30];

  // Seção 1: Catálogo Atual
  if (data.currentCatalogItems.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text('Catálogo Atual', 16, currentY);
    currentY += 5;

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Valor']],
      body: data.currentCatalogItems.map((row) => [row.item, row.value]),
      theme: 'grid',
      headStyles: { fillColor: primaryBlue, textColor: 255, fontStyle: 'normal' },
      bodyStyles: { textColor: textColor },
      margin: { left: 16, right: 16 },
      styles: { fontSize: 11, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 60 },
      },
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Seção 2: Nova Proposta
  if (data.newProposalItems.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text('Nova Proposta – Segundo Catálogo', 16, currentY);
    currentY += 5;

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Valor']],
      body: data.newProposalItems.map((row) => [row.item, row.value]),
      theme: 'grid',
      headStyles: { fillColor: primaryBlue, textColor: 255, fontStyle: 'normal' },
      bodyStyles: { textColor: textColor },
      margin: { left: 16, right: 16 },
      styles: { fontSize: 11, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 60 },
      },
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Helper para listas com marcadores
  const renderListSection = (title: string, items: string[], isBullet = true) => {
    if (items.length === 0) return;
    
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(title, 16, currentY);
    currentY += 8;

    doc.setFontSize(11);
    items.forEach((item) => {
      const bullet = isBullet ? '• ' : '';
      const lines = doc.splitTextToSize(`${bullet}${item}`, 178);
      doc.text(lines, 16, currentY);
      currentY += (lines.length * 5) + 1;
    });
    currentY += 10;
  };

  // Seção 3: Resumo Financeiro
  renderListSection('Resumo Financeiro', data.financialSummary);

  // Seção 4: Incluso sem custo adicional
  renderListSection('Incluso sem custo adicional', data.includedItems);

  // Seção 5: Cortesia Exclusiva
  renderListSection('Cortesia Exclusiva', data.courtesyItems);

  // Rodapé
  const footerY = Math.max(currentY + 20, 270);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('P-CON CONSTRUNET', 16, footerY);
  doc.text('Soluções inteligentes para negócios digitais.', 16, footerY + 5);

  const safeTitle = data.clientName.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`Proposta_${safeTitle}.pdf`);
};
