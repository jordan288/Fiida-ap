import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { BatchExportOptions, BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig } from '../types';
import { captureCardImage } from './pdfGenerator';
import QRCode from 'qrcode';

/**
 * Render an offscreen canvas for an applicant's ID card side
 */
export async function renderOffscreenCard(
  side: 'front' | 'back',
  data: IdCardData,
  config: CoordinatesConfig,
  templateConfig: TemplateConfig
): Promise<string> {
  const canvas = document.createElement('canvas');
  const scale = 2; // 300 DPI supersampling
  const w = config.canvasWidth * scale;
  const h = config.canvasHeight * scale;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas 2D context');

  // Background
  ctx.fillStyle = templateConfig.backgroundColor || '#f6fbf9';
  ctx.fillRect(0, 0, w, h);

  // Background template image if any
  const customBgUrl = side === 'front' ? templateConfig.frontImageUrl : templateConfig.backImageUrl;
  if (customBgUrl) {
    try {
      const bgImg = await loadImage(customBgUrl);
      ctx.globalAlpha = templateConfig.opacity ?? 1.0;
      ctx.drawImage(bgImg, 0, 0, w, h);
      ctx.globalAlpha = 1.0;
    } catch (e) {
      console.warn('Failed to load custom background image:', e);
    }
  }

  // Draw Built-in Rainbow / Waves background if enabled
  if (templateConfig.showBuiltinGuilloche) {
    drawGuillochePattern(ctx, w, h, side, templateConfig.presetId);
  }

  if (side === 'front') {
    // Top Flag & Header
    if (templateConfig.showHeader) {
      if (templateConfig.showFlag) {
        drawFlag(ctx, 40 * scale, 20 * scale, 96 * scale, 60 * scale);
      }

      ctx.fillStyle = '#064e3b';
      ctx.font = `bold ${23 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('የኢትዮጵያ ዲጂታል መታወቂያ ካርድ', w / 2, 45 * scale);

      ctx.fillStyle = '#1f2937';
      ctx.font = `600 ${18 * scale}px sans-serif`;
      ctx.fillText('Ethiopian Digital ID Card', w / 2, 70 * scale);

      // National ID Badge
      ctx.fillStyle = '#083344';
      ctx.beginPath();
      ctx.arc(w - 70 * scale, 48 * scale, 26 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${9 * scale}px sans-serif`;
      ctx.fillText('National ID', w - 70 * scale, 51 * scale);
    }

    // Photo Primary
    const pX = config.media.photoFront.x * scale;
    const pY = config.media.photoFront.y * scale;
    const pW = config.media.photoFront.width * scale;
    const pH = config.media.photoFront.height * scale;
    const pRadius = (config.media.photoFront.borderRadius || 14) * scale;

    if (data.photoUrl) {
      try {
        const photoImg = await loadImage(data.photoUrl);
        ctx.save();
        roundedRectPath(ctx, pX, pY, pW, pH, pRadius);
        ctx.clip();
        ctx.drawImage(photoImg, pX, pY, pW, pH);
        ctx.restore();

        // Border
        ctx.strokeStyle = 'rgba(6, 78, 59, 0.4)';
        ctx.lineWidth = 2 * scale;
        roundedRectStroke(ctx, pX, pY, pW, pH, pRadius);
      } catch (e) {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(pX, pY, pW, pH);
      }
    }

    // Secondary Security Photo (Bottom Right)
    if (templateConfig.showSecondaryPhoto !== false && (data.secondaryPhotoUrl || data.photoUrl)) {
      const sX = (config.media.photoFrontSecondary?.x ?? 825) * scale;
      const sY = (config.media.photoFrontSecondary?.y ?? 435) * scale;
      const sW = (config.media.photoFrontSecondary?.width ?? 145) * scale;
      const sH = (config.media.photoFrontSecondary?.height ?? 175) * scale;
      const sRadius = 12 * scale;

      try {
        const secImg = await loadImage(data.secondaryPhotoUrl || data.photoUrl);
        ctx.save();
        ctx.globalAlpha = 0.85;
        roundedRectPath(ctx, sX, sY, sW, sH, sRadius);
        ctx.clip();
        ctx.filter = 'grayscale(100%) contrast(120%)';
        ctx.drawImage(secImg, sX, sY, sW, sH);
        ctx.filter = 'none';
        ctx.restore();

        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1.5 * scale;
        roundedRectStroke(ctx, sX, sY, sW, sH, sRadius);
      } catch (e) {}
    }

    // Full Name Amharic & English
    const nameX = config.fields.fullNameAmharic.x * scale;
    const nameY = config.fields.fullNameAmharic.y * scale;
    ctx.textAlign = 'left';
    ctx.fillStyle = config.fields.fullNameAmharic.color || '#111827';
    ctx.font = `bold ${config.fields.fullNameAmharic.fontSize * scale}px sans-serif`;
    ctx.fillText(data.fullNameAmharic, nameX, nameY);

    ctx.fillStyle = config.fields.fullNameEnglish.color || '#1f2937';
    ctx.font = `600 ${config.fields.fullNameEnglish.fontSize * scale}px sans-serif`;
    ctx.fillText(data.fullNameEnglish, nameX, nameY + 34 * scale);

    // DOB
    const dobX = config.fields.dateOfBirth.x * scale;
    const dobY = config.fields.dateOfBirth.y * scale;
    ctx.fillStyle = config.fields.dateOfBirth.color || '#111827';
    ctx.font = `bold ${config.fields.dateOfBirth.fontSize * scale}px monospace`;
    ctx.fillText(`${data.dateOfBirth} (${data.dateOfBirthEth || 'N/A'})`, dobX, dobY);

    // Sex
    const sexX = config.fields.sex.x * scale;
    const sexY = config.fields.sex.y * scale;
    ctx.fillStyle = config.fields.sex.color || '#111827';
    ctx.font = `bold ${config.fields.sex.fontSize * scale}px sans-serif`;
    const sexLabel = data.sex === 'Male' ? 'ወንድ / M' : 'ሴት / F';
    ctx.fillText(sexLabel, sexX, sexY);

    // Expiry
    const expX = config.fields.dateOfExpiry.x * scale;
    const expY = config.fields.dateOfExpiry.y * scale;
    ctx.fillStyle = config.fields.dateOfExpiry.color || '#111827';
    ctx.font = `bold ${config.fields.dateOfExpiry.fontSize * scale}px monospace`;
    ctx.fillText(data.dateOfExpiry, expX, expY);

    // FAN bottom box & digits
    if (templateConfig.showFrontFan || templateConfig.showFanContainerBox) {
      const fanX = (config.fields.fan.x - 70) * scale;
      const fanY = (config.fields.fan.y - 48) * scale;
      const fanW = 460 * scale;
      const fanH = 68 * scale;

      if (templateConfig.showFanContainerBox) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        roundedRectPath(ctx, fanX, fanY, fanW, fanH, 12 * scale);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5 * scale;
        roundedRectStroke(ctx, fanX, fanY, fanW, fanH, 12 * scale);
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${config.fields.fan.fontSize * scale}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(data.fan || '4195 0436 7069 2582', fanX + fanW / 2, fanY + 38 * scale);
    }
  } else {
    // BACK SIDE
    // Phone
    const phoneX = config.fields.phoneNumber.x * scale;
    const phoneY = config.fields.phoneNumber.y * scale;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${config.fields.phoneNumber.fontSize * scale}px monospace`;
    ctx.fillText(data.phoneNumber || '0928574836', phoneX, phoneY);

    // Nationality
    const natX = config.fields.nationality.x * scale;
    const natY = config.fields.nationality.y * scale;
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${config.fields.nationality.fontSize * scale}px sans-serif`;
    ctx.fillText(`${data.nationalityAmharic || 'ኢትዮጵያዊ'} | ${data.nationalityEnglish || 'Ethiopian'}`, natX, natY);

    // Address
    const addrX = config.fields.regionAmharic.x * scale;
    const addrY = config.fields.regionAmharic.y * scale;
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${config.fields.regionAmharic.fontSize * scale}px sans-serif`;
    ctx.fillText(`${data.regionAmharic} / ${data.regionEnglish}`, addrX, addrY);

    ctx.font = `bold ${config.fields.zoneSubcity.fontSize * scale}px sans-serif`;
    ctx.fillText(`${data.zoneAmharic} / ${data.zoneEnglish}`, addrX, addrY + 45 * scale);

    ctx.font = `bold ${config.fields.woredaKebele.fontSize * scale}px sans-serif`;
    ctx.fillText(`${data.woredaAmharic} (${data.kebele ? 'ቀበሌ ' + data.kebele : ''})`, addrX, addrY + 90 * scale);

    // QR Code
    const qrX = config.media.qrCodeBack.x * scale;
    const qrY = config.media.qrCodeBack.y * scale;
    const qrW = config.media.qrCodeBack.width * scale;
    const qrH = config.media.qrCodeBack.height * scale;

    try {
      const qrPayload = data.qrData || `FAYDA:${data.fan}:${data.fullNameEnglish}:DOB=${data.dateOfBirth}`;
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: qrW,
        color: { dark: '#000000', light: '#ffffff' },
      });
      const qrImg = await loadImage(qrDataUrl);
      ctx.drawImage(qrImg, qrX, qrY, qrW, qrH);
    } catch (e) {}

    // Serial
    const snX = config.fields.serialNumber.x * scale;
    const snY = config.fields.serialNumber.y * scale;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${config.fields.serialNumber.fontSize * scale}px monospace`;
    ctx.fillText(`SN : ${data.serialNumber || '9482019482'}`, snX + 120 * scale, snY);
  }

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * Batch Export all items in queue into a consolidated multi-page A4 PDF
 */
export async function exportBatchToA4Pdf(
  items: BatchQueueItem[],
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<void> {
  const activeItems = items.filter((it) => it.selected !== false && it.status !== 'error');
  if (activeItems.length === 0) throw new Error('No valid items selected for batch export');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const PAGE_WIDTH_MM = 210;
  const CR80_WIDTH_MM = 85.60;
  const CR80_HEIGHT_MM = 53.98;
  const centerXMm = (PAGE_WIDTH_MM - CR80_WIDTH_MM) / 2;

  for (let i = 0; i < activeItems.length; i++) {
    const item = activeItems[i];
    onProgress?.(i + 1, activeItems.length, `Generating card ${i + 1} of ${activeItems.length}: ${item.extractedData.fullNameEnglish}...`);

    if (i > 0) {
      doc.addPage('a4', 'portrait');
    }

    // Render Front & Back
    const frontPng = await renderOffscreenCard('front', item.extractedData, config, templateConfig);
    const backPng = await renderOffscreenCard('back', item.extractedData, config, templateConfig);

    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, PAGE_WIDTH_MM, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', PAGE_WIDTH_MM / 2, 10, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(`NATIONAL ID (FAYDA) — BATCH PRINT SHEET [CARD ${i + 1} OF ${activeItems.length}]`, PAGE_WIDTH_MM / 2, 16, { align: 'center' });

    // Applicant Metadata Strip
    doc.setFillColor(241, 245, 249);
    doc.rect(14, 26, PAGE_WIDTH_MM - 28, 14, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, 26, PAGE_WIDTH_MM - 28, 14, 'S');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Full Name: ${item.extractedData.fullNameEnglish} (${item.extractedData.fullNameAmharic})`, 18, 32);
    doc.text(`FAN: ${item.extractedData.fan}`, 18, 37);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`DOB: ${item.extractedData.dateOfBirth} | Region: ${item.extractedData.regionEnglish} | Sex: ${item.extractedData.sex}`, 115, 32);
    doc.text(`Phone: ${item.extractedData.phoneNumber} | Expiry: ${item.extractedData.dateOfExpiry}`, 115, 37);

    // Front Side
    const frontYMm = 48;
    drawBatchCropMarks(doc, centerXMm, frontYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, 'FRONT SIDE (CR80 85.60 × 53.98 mm)');
    doc.addImage(frontPng, 'PNG', centerXMm, frontYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');

    // Back Side
    const backYMm = frontYMm + CR80_HEIGHT_MM + 20;
    drawBatchCropMarks(doc, centerXMm, backYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, 'BACK SIDE (CR80 85.60 × 53.98 mm)');
    doc.addImage(backPng, 'PNG', centerXMm, backYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');

    // Footer PVC Guidelines
    const footerY = backYMm + CR80_HEIGHT_MM + 18;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, footerY, PAGE_WIDTH_MM - 28, 28, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, footerY, PAGE_WIDTH_MM - 28, 28, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('300 DPI HIGH-RESOLUTION PRINT CALIBRATION:', 18, footerY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('• Print at 100% (Actual Size). Cut along marked crosshairs for exact 85.60 × 53.98 mm ISO CR80 PVC format.', 18, footerY + 12);
    doc.text(`• Document File: ${item.fileName} • Generated: ${new Date().toLocaleDateString()}`, 18, footerY + 18);
  }

  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`Ethiopian_Fayda_Batch_${activeItems.length}_Cards_${dateStr}.pdf`);
  onProgress?.(activeItems.length, activeItems.length, 'Batch PDF export complete!');
}

/**
 * Batch Export all items into a ZIP Archive with HD images & individual sheets
 */
export async function exportBatchToZipArchive(
  items: BatchQueueItem[],
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  onProgress?: (current: number, total: number, status: string) => void
): Promise<void> {
  const activeItems = items.filter((it) => it.selected !== false && it.status !== 'error');
  if (activeItems.length === 0) throw new Error('No valid items selected for ZIP export');

  const zip = new JSZip();
  const frontFolder = zip.folder('01_Front_Cards_300DPI');
  const backFolder = zip.folder('02_Back_Cards_300DPI');
  const manifestData: any[] = [];

  for (let i = 0; i < activeItems.length; i++) {
    const item = activeItems[i];
    onProgress?.(i + 1, activeItems.length, `Rendering assets for ${item.extractedData.fullNameEnglish} (${i + 1}/${activeItems.length})...`);

    const frontPng = await renderOffscreenCard('front', item.extractedData, config, templateConfig);
    const backPng = await renderOffscreenCard('back', item.extractedData, config, templateConfig);

    const cleanName = item.extractedData.fullNameEnglish.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanFan = item.extractedData.fan.replace(/\s+/g, '_');
    const prefix = `${String(i + 1).padStart(2, '0')}_${cleanName}_${cleanFan}`;

    // Add Base64 to ZIP
    frontFolder?.file(`${prefix}_FRONT.png`, frontPng.split(',')[1], { base64: true });
    backFolder?.file(`${prefix}_BACK.png`, backPng.split(',')[1], { base64: true });

    manifestData.push({
      index: i + 1,
      sourceFile: item.fileName,
      fan: item.extractedData.fan,
      fullNameAmharic: item.extractedData.fullNameAmharic,
      fullNameEnglish: item.extractedData.fullNameEnglish,
      dob: item.extractedData.dateOfBirth,
      sex: item.extractedData.sex,
      region: item.extractedData.regionEnglish,
      phone: item.extractedData.phoneNumber,
      expiry: item.extractedData.dateOfExpiry,
    });
  }

  // Add Manifest JSON and README
  zip.file('batch_manifest.json', JSON.stringify(manifestData, null, 2));
  zip.file(
    'README.txt',
    `Ethiopian Digital ID Card Studio - Batch Export Package\n` +
    `Total Cards: ${activeItems.length}\n` +
    `Export Date: ${new Date().toLocaleString()}\n` +
    `Resolution: 300 DPI (CR80 Standard: 85.60 mm x 53.98 mm)\n\n` +
    `Folders:\n` +
    `- 01_Front_Cards_300DPI: High-resolution PNGs for front side\n` +
    `- 02_Back_Cards_300DPI: High-resolution PNGs with verified QR code matrices\n` +
    `- batch_manifest.json: Structured JSON data index\n`
  );

  onProgress?.(activeItems.length, activeItems.length, 'Compressing ZIP package...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  const dateStr = new Date().toISOString().split('T')[0];
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ethiopian_Fayda_Batch_Cards_${activeItems.length}_Export_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.(activeItems.length, activeItems.length, 'ZIP Package Downloaded!');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundedRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const stripeH = h / 3;
  ctx.fillStyle = '#009639';
  ctx.fillRect(x, y, w, stripeH);

  ctx.fillStyle = '#FEDD00';
  ctx.fillRect(x, y + stripeH, w, stripeH);

  ctx.fillStyle = '#002B7F';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + stripeH + stripeH / 2, stripeH * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#EF3340';
  ctx.fillRect(x, y + stripeH * 2, w, stripeH);
}

function drawGuillochePattern(ctx: CanvasRenderingContext2D, w: number, h: number, side: string, presetId?: string) {
  ctx.save();
  ctx.strokeStyle = presetId === 'golden_hologram' ? 'rgba(217, 119, 6, 0.15)' : 'rgba(5, 150, 105, 0.15)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 100 + i * 50);
    ctx.bezierCurveTo(w * 0.25, 50 + i * 80, w * 0.75, 200 + i * 40, w, 120 + i * 50);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBatchCropMarks(doc: jsPDF, x: number, y: number, w: number, h: number, label: string) {
  const markLen = 4;
  const offset = 2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);

  doc.line(x - offset - markLen, y, x - offset, y);
  doc.line(x, y - offset - markLen, x, y - offset);
  doc.line(x + w + offset, y, x + w + offset + markLen, y);
  doc.line(x + w, y - offset - markLen, x + w, y - offset);
  doc.line(x - offset - markLen, y + h, x - offset, y + h);
  doc.line(x, y + h + offset, x, y + h + offset + markLen);
  doc.line(x + w + offset, y + h, x + w + offset + markLen, y + h);
  doc.line(x + w, y + h + offset, x + w, y + h + offset + markLen);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label, x, y - 3);
}
