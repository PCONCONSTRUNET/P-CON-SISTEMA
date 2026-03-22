import jsPDF from 'jspdf';

// Convert SVG string to PNG data URL via canvas
const svgToPngDataUrl = (svgString: string, size: number = 128): Promise<string> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject('No canvas context');

    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject('Failed to load SVG');
    };
    img.src = url;
  });
};

const PIX_SVG_STRING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill="#1E4FA3" d="M306.4 356.5C311.8 351.1 321.1 351.1 326.5 356.5L403.5 433.5C417.7 447.7 436.6 455.5 456.6 455.5L471.7 455.5L374.6 552.6C344.3 582.1 295.1 582.1 264.8 552.6L167.3 455.2L176.6 455.2C196.6 455.2 215.5 447.4 229.7 433.2L306.4 356.5zM326.5 282.9C320.1 288.4 311.9 288.5 306.4 282.9L229.7 206.2C215.5 191.1 196.6 184.2 176.6 184.2L167.3 184.2L264.7 86.8C295.1 56.5 344.3 56.5 374.6 86.8L471.8 183.9L456.6 183.9C436.6 183.9 417.7 191.7 403.5 205.9L326.5 282.9zM176.6 206.7C190.4 206.7 203.1 212.3 213.7 222.1L290.4 298.8C297.6 305.1 307 309.6 316.5 309.6C325.9 309.6 335.3 305.1 342.5 298.8L419.5 221.8C429.3 212.1 442.8 206.5 456.6 206.5L494.3 206.5L552.6 264.8C582.9 295.1 582.9 344.3 552.6 374.6L494.3 432.9L456.6 432.9C442.8 432.9 429.3 427.3 419.5 417.5L342.5 340.5C328.6 326.6 304.3 326.6 290.4 340.6L213.7 417.2C203.1 427 190.4 432.6 176.6 432.6L144.8 432.6L86.8 374.6C56.5 344.3 56.5 295.1 86.8 264.8L144.8 206.7L176.6 206.7z"/></svg>';

interface InvoicePdfData {
  clientName: string;
  clientDocument: string | null;
  clientEmail: string;
  clientPhone: string | null;
  planName: string;
  value: number;
  dueDate: string;
  qrCodeBase64: string;
  pixCopyPaste: string;
  subscriptionId: string;
}

const drawCardIcon = (doc: jsPDF, type: 'arrow' | 'clock' | 'calendar' | 'dollar', cx: number, cy: number, r: number, color: [number, number, number]) => {
  // Circle outline
  doc.setDrawColor(...color);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, r, 'FD');

  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.4);

  if (type === 'arrow') {
    // Right arrow: horizontal line + chevron
    const lx = cx - r * 0.5;
    const rx = cx + r * 0.5;
    doc.line(lx, cy, rx, cy);
    doc.line(rx - r * 0.3, cy - r * 0.3, rx, cy);
    doc.line(rx - r * 0.3, cy + r * 0.3, rx, cy);
  } else if (type === 'clock') {
    // Clock: circle + two hands
    doc.circle(cx, cy, r * 0.6, 'S');
    doc.line(cx, cy, cx, cy - r * 0.4); // 12 o'clock hand
    doc.line(cx, cy, cx + r * 0.3, cy + r * 0.1); // minute hand
  } else if (type === 'calendar') {
    // Calendar: small rectangle + top tabs
    const bw = r * 0.9;
    const bh = r * 0.8;
    doc.rect(cx - bw / 2, cy - bh / 2 + r * 0.1, bw, bh, 'S');
    // Top line
    doc.line(cx - bw / 2, cy - bh / 2 + r * 0.1 + bh * 0.3, cx + bw / 2, cy - bh / 2 + r * 0.1 + bh * 0.3);
    // Two small tabs
    doc.line(cx - r * 0.25, cy - bh / 2 - r * 0.1, cx - r * 0.25, cy - bh / 2 + r * 0.2);
    doc.line(cx + r * 0.25, cy - bh / 2 - r * 0.1, cx + r * 0.25, cy - bh / 2 + r * 0.2);
  } else if (type === 'dollar') {
    // Dollar sign drawn manually
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r * 1.4);
    doc.setTextColor(...color);
    doc.text('R$', cx - r * 0.55, cy + r * 0.35);
  }
};

// Load image as base64 data URL
const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No canvas context');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject('Failed to load image');
    img.src = url;
  });
};

export const generateInvoicePDF = async (data: InvoicePdfData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const primaryColor: [number, number, number] = [30, 79, 163];
  const pixColor: [number, number, number] = [50, 188, 173];
  const textColor: [number, number, number] = [33, 33, 33];
  const grayColor: [number, number, number] = [120, 120, 120];
  const white: [number, number, number] = [255, 255, 255];

  // ===== HEADER BAND (blue) =====
  const headerH = 50;
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, headerH, 'F');

  // Company logo
  try {
    const logoBase64 = await loadImageAsBase64('/images/logo-pcon-pdf.png');
    doc.addImage(logoBase64, 'PNG', margin + 2, 8, 35, 35);
  } catch (e) {
    // Fallback text if logo fails
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('P-CON', margin + 2, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('CONSTRUNET', margin + 2, 28);
  }

  // Client info on the right side of header
  const infoX = 85;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...white);
  doc.text(data.clientName.toUpperCase(), infoX, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CPF/CNPJ: ${data.clientDocument || 'Não informado'}`, infoX, 23);

  const clientCode = data.subscriptionId.split('-')[0].toUpperCase();
  doc.text(`Código do cliente: ${clientCode}`, infoX, 29);

  if (data.clientEmail) {
    doc.text(`E-mail: ${data.clientEmail}`, infoX, 35);
  }
  if (data.clientPhone) {
    doc.text(`Telefone: ${data.clientPhone}`, infoX, 41);
  }

  y = headerH + 8;

  // ===== INFO CARDS ROW =====
  // Código de cobrança | Referência | Vencimento | Valor
  const formattedValue = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(data.value);

  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dueParts = data.dueDate.split('/');
  const monthRef = dueParts.length >= 2 ? months[parseInt(dueParts[1], 10) - 1] || '' : '';

  // Background box for info cards
  doc.setFillColor(240, 243, 248);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F');
  doc.setDrawColor(200, 210, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'S');

  const cardW = contentWidth / 4;
  const cardData: { label: string; value: string; iconType: 'arrow' | 'clock' | 'calendar' | 'dollar' }[] = [
    { label: 'Código de cobrança', value: clientCode, iconType: 'arrow' },
    { label: `Referência: ${monthRef}`, value: data.dueDate, iconType: 'clock' },
    { label: 'Vencimento', value: data.dueDate, iconType: 'calendar' },
    { label: 'Valor', value: formattedValue, iconType: 'dollar' },
  ];

  cardData.forEach((card, i) => {
    const cx = margin + cardW * i;

    // Vertical separator
    if (i > 0) {
      doc.setDrawColor(200, 210, 225);
      doc.setLineWidth(0.3);
      doc.line(cx, y + 4, cx, y + 24);
    }

    // Icon
    const iconCx = cx + 10;
    const iconCy = y + 14;
    drawCardIcon(doc, card.iconType, iconCx, iconCy, 4, primaryColor);

    // Label
    const textX = iconCx + 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...grayColor);
    doc.text(card.label, textX, y + 9);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...textColor);
    doc.text(card.value, textX, y + 16);
  });

  y += 36;

  // ===== PIX SECTION =====
  doc.setFillColor(235, 245, 255);
  doc.roundedRect(margin, y, contentWidth, 85, 2, 2, 'F');
  doc.setDrawColor(180, 200, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 85, 2, 2, 'S');

  // Pix icon + title
  try {
    const pixPng = await svgToPngDataUrl(PIX_SVG_STRING, 128);
    doc.addImage(pixPng, 'PNG', margin + 5, y + 3, 8, 8);
  } catch (e) {
    // fallback: no icon
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...primaryColor);
  doc.text('Pague com Pix', margin + 15, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...grayColor);
  doc.text('Leia o QR Code com seu celular.', margin + 5, y + 18);
  doc.text('A liquidação da fatura é instantânea!', margin + 5, y + 23);

  // Pix copia e cola label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...textColor);
  doc.text('Pix copia e cola', margin + 5, y + 33);

  // Pix code
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...grayColor);
  const maxPixWidth = contentWidth - 60;
  const pixLines = doc.splitTextToSize(data.pixCopyPaste, maxPixWidth);
  doc.text(pixLines, margin + 5, y + 40);

  // QR Code on the right
  if (data.qrCodeBase64) {
    try {
      const qrSrc = data.qrCodeBase64.startsWith('data:')
        ? data.qrCodeBase64
        : `data:image/png;base64,${data.qrCodeBase64}`;
      const qrSize = 45;
      const qrX = pageWidth - margin - qrSize - 5;
      const qrY = y + 10;
      doc.addImage(qrSrc, 'PNG', qrX, qrY, qrSize, qrSize);
    } catch (e) {
      console.error('Error adding QR code to PDF:', e);
    }
  }

  y += 93;

  // ===== PLAN INFO =====
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...primaryColor);
  doc.text('Plano:', margin + 5, y + 7);
  doc.setTextColor(...textColor);
  doc.text(data.planName, margin + 22, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('Total:', margin + 5, y + 14);
  doc.setFontSize(11);
  doc.setTextColor(...textColor);
  doc.text(formattedValue, margin + 22, y + 14);

  y += 26;

  // ===== FOOTER =====
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...grayColor);
  doc.text('P-CON CONSTRUNET - Sistema de Gestão de Assinaturas', pageWidth / 2, y, { align: 'center' });
  doc.text(
    `Fatura gerada em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    pageWidth / 2, y + 5, { align: 'center' }
  );
  doc.text('Pagamento via PIX integrado com Mercado Pago', pageWidth / 2, y + 10, { align: 'center' });

  // Save
  const fileName = `Fatura_${data.planName.replace(/\s+/g, '_')}_${data.dueDate.replace(/\//g, '-')}.pdf`;
  doc.save(fileName);
};
