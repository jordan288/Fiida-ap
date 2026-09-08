import { IdCardData, PdfTextItemWithBox } from '../types';

/**
 * Generates a realistic high-resolution Ethiopian Fayda slip canvas image URL
 * and matching text item boxes for immediate testing in the Visual Position Marker.
 */
export async function generateSampleSlipCanvas(
  data: IdCardData
): Promise<{ canvasUrl: string; textItems: PdfTextItemWithBox[]; dimensions: { width: number; height: number } }> {
  const width = 1000;
  const height = 1400;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { canvasUrl: '', textItems: [], dimensions: { width, height } };
  }

  // 1. Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Border frame
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // 2. Top Header / Government Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(20, 20, width - 40, 100);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('የኢትዮጵያ ፌዴራላዊ ዲሞክራሲያዊ ሪፐብሊክ የብሔራዊ መታወቂያ ፕሮግራም', 50, 60);

  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Federal Democratic Republic of Ethiopia - National ID Program (Fayda Slip)', 50, 90);

  // 3. Draw Portrait Photo
  const photoX = Math.round(width * 0.055);
  const photoY = Math.round(height * 0.155);
  const photoW = Math.round(width * 0.22);
  const photoH = Math.round(height * 0.23);

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(photoX, photoY, photoW, photoH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(photoX, photoY, photoW, photoH);

  if (data.photoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = data.photoUrl;
      });
      ctx.drawImage(img, photoX, photoY, photoW, photoH);
    } catch {
      // Fallback silhouette
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(photoX + photoW / 2, photoY + photoH * 0.4, photoW * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Draw QR Code
  const qrX = Math.round(width * 0.675);
  const qrY = Math.round(height * 0.53);
  const qrW = Math.round(width * 0.265);
  const qrH = Math.round(height * 0.21);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX, qrY, qrW, qrH);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX, qrY, qrW, qrH);

  if (data.qrCodeImageUrl) {
    try {
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        qrImg.onload = resolve;
        qrImg.onerror = resolve;
        qrImg.src = data.qrCodeImageUrl!;
      });
      ctx.drawImage(qrImg, qrX, qrY, qrW, qrH);
    } catch {}
  } else {
    // Synthetic QR pattern
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(qrX + 10, qrY + 10, 40, 40);
    ctx.fillRect(qrX + qrW - 50, qrY + 10, 40, 40);
    ctx.fillRect(qrX + 10, qrY + qrH - 50, 40, 40);
    ctx.font = 'bold 11px monospace';
    ctx.fillText('FAYDA BIOMETRIC QR', qrX + 25, qrY + qrH / 2);
  }

  // 5. Draw Text Fields & Build textItems
  const textItems: PdfTextItemWithBox[] = [];

  const addText = (str: string, xPct: number, yPct: number, font: string, fill: string = '#0f172a') => {
    ctx.font = font;
    ctx.fillStyle = fill;
    const pxX = Math.round((xPct / 100) * width);
    const pxY = Math.round((yPct / 100) * height);
    ctx.fillText(str, pxX, pxY + 18);

    const metrics = ctx.measureText(str);
    const itemW = Math.max(20, metrics.width);
    const itemH = 20;

    textItems.push({
      str,
      x: pxX,
      y: pxY,
      width: itemW,
      height: itemH,
      pctX: (pxX / width) * 100,
      pctY: (pxY / height) * 100,
      pctWidth: (itemW / width) * 100,
      pctHeight: (itemH / height) * 100,
    });
  };

  // Amharic Name
  addText(data.fullNameAmharic, 29.5, 15.5, 'bold 20px "Noto Sans Ethiopic", system-ui, sans-serif');
  // English Name
  addText(data.fullNameEnglish, 29.5, 20.2, 'bold 19px system-ui, sans-serif');
  // FAN
  addText(data.fan, 29.5, 24.8, 'bold 18px monospace');
  // FCN
  addText(data.fcn || 'FCN-4195-0436-7069', 29.5, 29.0, '15px monospace');
  // DOB
  addText(`${data.dateOfBirth} (${data.dateOfBirthEth || ''} E.C.)`, 29.5, 33.0, '15px system-ui, sans-serif');
  // Sex
  addText(data.sex, 29.5, 37.0, '15px system-ui, sans-serif');
  // Phone
  addText(data.phoneNumber, 29.5, 41.0, '15px system-ui, sans-serif');
  // Region
  addText(data.regionAmharic, 29.5, 45.0, '15px system-ui, sans-serif');
  // Zone
  addText(data.zoneAmharic, 29.5, 49.0, '15px system-ui, sans-serif');
  // Woreda
  addText(data.woredaAmharic, 29.5, 53.0, '15px system-ui, sans-serif');
  // Issue
  addText(data.dateOfIssue, 29.5, 57.0, '15px system-ui, sans-serif');
  // Expiry
  addText(data.dateOfExpiry, 29.5, 61.0, '15px system-ui, sans-serif');

  const canvasUrl = canvas.toDataURL('image/jpeg', 0.92);
  return {
    canvasUrl,
    textItems,
    dimensions: { width, height },
  };
}
