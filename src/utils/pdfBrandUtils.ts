export interface TrimmedPdfImage {
  dataUrl: string;
  width: number;
  height: number;
}

const imageCache = new Map<string, TrimmedPdfImage>();

/**
 * Carrega uma imagem e remove bordas transparentes extras para manter
 * nitidez e proporção real ao inserir em PDFs do jsPDF.
 */
export const loadTrimmedPdfLogo = (url: string): Promise<TrimmedPdfImage> => {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return reject(new Error('Invalid image dimensions'));

        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = w;
        srcCanvas.height = h;
        const srcCtx = srcCanvas.getContext('2d');
        if (!srcCtx) return reject(new Error('No canvas context'));

        srcCtx.drawImage(img, 0, 0);
        const { data } = srcCtx.getImageData(0, 0, w, h);

        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const alpha = data[(y * w + x) * 4 + 3];
            if (alpha > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX < minX || maxY < minY) {
          const fallback = { dataUrl: srcCanvas.toDataURL('image/png'), width: w, height: h };
          imageCache.set(url, fallback);
          return resolve(fallback);
        }

        const trimW = maxX - minX + 1;
        const trimH = maxY - minY + 1;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = trimW;
        outCanvas.height = trimH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) return reject(new Error('No output canvas context'));

        outCtx.drawImage(srcCanvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
        const result = {
          dataUrl: outCanvas.toDataURL('image/png'),
          width: trimW,
          height: trimH,
        };
        imageCache.set(url, result);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
};

export const formatPhoneDisplay = (phone?: string | null): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
};
