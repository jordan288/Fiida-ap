import { jsPDF } from 'jspdf';
import { toPng, toJpeg } from 'html-to-image';
import { CoordinatesConfig, IdCardData } from '../types';

export interface PdfExportOptions {
  format: 'a4_sheet' | 'cr80_dual' | 'front_only' | 'back_only';
  resolutionDpi: 300 | 600;
  includeCropMarks: boolean;
  includeMetadataHeader: boolean;
  bleedMm?: number;
}

export interface JpegExportOptions {
  layout: 'combined_sheet' | 'front_only' | 'back_only' | 'both_files';
  quality: number; // 0.85 to 1.0 (default 0.98)
  resolutionDpi: 300 | 600;
  includeCropMarks?: boolean;
  includeMetadataHeader?: boolean;
}

/**
 * Capture high-resolution raster image of a card side DOM element as PNG
 */
export async function captureCardImage(
  element: HTMLElement,
  dpi: 300 | 600 = 300
): Promise<string> {
  const pixelRatio = dpi === 600 ? 3 : 2; // High-DPI supersampling
  
  const dataUrl = await toPng(element, {
    quality: 1.0,
    pixelRatio: pixelRatio,
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: {
      transform: 'none',
      transformOrigin: 'top left',
      borderRadius: '0px', // Crisp outer bounds for print
    },
  });

  return dataUrl;
}

/**
 * Capture high-resolution JPEG of a card side DOM element
 */
export async function captureCardJpeg(
  element: HTMLElement,
  dpi: 300 | 600 = 300,
  quality: number = 0.98
): Promise<string> {
  const pixelRatio = dpi === 600 ? 3 : 2;
  
  const dataUrl = await toJpeg(element, {
    quality: quality,
    pixelRatio: pixelRatio,
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: {
      transform: 'none',
      transformOrigin: 'top left',
      borderRadius: '0px',
    },
  });

  return dataUrl;
}

/**
 * Generate and download Complete ID as High-Resolution JPEG Image(s)
 */
export async function generateAndDownloadIdJpeg(
  frontElement: HTMLElement,
  backElement: HTMLElement,
  idData: IdCardData,
  config: CoordinatesConfig,
  options: JpegExportOptions = {
    layout: 'combined_sheet',
    quality: 0.98,
    resolutionDpi: 300,
    includeCropMarks: true,
    includeMetadataHeader: true,
  },
  onProgress?: (status: string, percent: number) => void
): Promise<void> {
  const cleanName = (idData.fullNameEnglish || 'Applicant').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanFan = (idData.fan || 'CARD').replace(/\s+/g, '_');
  const baseFileName = `Ethiopian_ID_${cleanName}_${cleanFan}`;

  if (options.layout === 'front_only') {
    onProgress?.('Rendering Front Card at 300 DPI JPEG...', 40);
    const frontJpeg = await captureCardJpeg(frontElement, options.resolutionDpi, options.quality);
    downloadDataUrl(frontJpeg, `${baseFileName}_FRONT_300DPI.jpg`);
    onProgress?.('Front JPEG Downloaded!', 100);
    return;
  }

  if (options.layout === 'back_only') {
    onProgress?.('Rendering Back Card at 300 DPI JPEG...', 40);
    const backJpeg = await captureCardJpeg(backElement, options.resolutionDpi, options.quality);
    downloadDataUrl(backJpeg, `${baseFileName}_BACK_300DPI.jpg`);
    onProgress?.('Back JPEG Downloaded!', 100);
    return;
  }

  if (options.layout === 'both_files') {
    onProgress?.('Rendering Front & Back HD JPEGs...', 30);
    const frontJpeg = await captureCardJpeg(frontElement, options.resolutionDpi, options.quality);
    downloadDataUrl(frontJpeg, `${baseFileName}_FRONT_300DPI.jpg`);
    
    onProgress?.('Rendering Back Card...', 70);
    const backJpeg = await captureCardJpeg(backElement, options.resolutionDpi, options.quality);
    downloadDataUrl(backJpeg, `${baseFileName}_BACK_300DPI.jpg`);
    
    onProgress?.('Both JPEG files downloaded successfully!', 100);
    return;
  }

  // Default: Combined High-Res Print Sheet JPEG (A4 / Side-by-Side Canvas)
  onProgress?.('Rendering Front & Back 300 DPI Canvas...', 30);
  const frontJpeg = await captureCardJpeg(frontElement, options.resolutionDpi, options.quality);
  const backJpeg = await captureCardJpeg(backElement, options.resolutionDpi, options.quality);

  onProgress?.('Composing Combined High-Res ID Print Sheet...', 65);

  const canvas = document.createElement('canvas');
  const scale = options.resolutionDpi === 600 ? 3 : 2;
  const cardW = 1012 * (scale / 2);
  const cardH = 638 * (scale / 2);

  // Side-by-side with nice margin and header
  const margin = 80;
  const headerH = options.includeMetadataHeader !== false ? 160 : 60;
  const footerH = 100;
  canvas.width = cardW * 2 + margin * 3;
  canvas.height = cardH + headerH + footerH + margin * 2;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas 2D context');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header Banner
  if (options.includeMetadataHeader !== false) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, 100);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA — NATIONAL DIGITAL ID (FAYDA)', canvas.width / 2, 45);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Applicant: ${idData.fullNameEnglish} (${idData.fullNameAmharic}) | FAN: ${idData.fan} | 300 DPI CR80 Print Standard`, canvas.width / 2, 80);
  }

  // Load images onto canvas
  const imgFront = new Image();
  const imgBack = new Image();

  await Promise.all([
    new Promise<void>((resolve) => {
      imgFront.onload = () => resolve();
      imgFront.src = frontJpeg;
    }),
    new Promise<void>((resolve) => {
      imgBack.onload = () => resolve();
      imgBack.src = backJpeg;
    }),
  ]);

  const frontX = margin;
  const frontY = headerH + margin;
  const backX = margin * 2 + cardW;
  const backY = headerH + margin;

  // Draw Front & Back
  ctx.drawImage(imgFront, frontX, frontY, cardW, cardH);
  ctx.drawImage(imgBack, backX, backY, cardW, cardH);

  // Optional border & crop guides
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(frontX, frontY, cardW, cardH);
  ctx.strokeRect(backX, backY, cardW, cardH);

  // Labels
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FRONT SIDE (CR80 Standard 85.60 × 53.98 mm)', frontX, frontY - 14);
  ctx.fillText('BACK SIDE (CR80 Standard 85.60 × 53.98 mm)', backX, backY - 14);

  // Footer note
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Fayda ID System • Generated at 300 DPI • Standard PVC Ready • Serial: ${idData.serialNumber || 'FAYDA-CERT-2024'}`, canvas.width / 2, canvas.height - 35);

  onProgress?.('Saving JPEG File...', 90);
  const combinedDataUrl = canvas.toDataURL('image/jpeg', options.quality || 0.98);
  downloadDataUrl(combinedDataUrl, `${baseFileName}_Complete_ID_Sheet_300DPI.jpg`);
  onProgress?.('Complete ID JPEG Downloaded!', 100);
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


/**
 * Generate and download high-resolution PDF with the active coordinate configurations
 */
export async function generateAndDownloadIdPdf(
  frontElement: HTMLElement,
  backElement: HTMLElement,
  idData: IdCardData,
  config: CoordinatesConfig,
  options: PdfExportOptions = {
    format: 'a4_sheet',
    resolutionDpi: 300,
    includeCropMarks: true,
    includeMetadataHeader: true,
  },
  onProgress?: (status: string, percent: number) => void
): Promise<{ frontPngUrl: string; backPngUrl: string }> {
  onProgress?.('Rendering Front Card layers at 300 DPI...', 20);
  const frontPngUrl = await captureCardImage(frontElement, options.resolutionDpi);

  onProgress?.('Rendering Back Card & High-Density QR Matrix...', 50);
  const backPngUrl = await captureCardImage(backElement, options.resolutionDpi);

  onProgress?.('Composing High-Resolution Vector PDF Document...', 80);

  const cleanName = (idData.fullNameEnglish || 'Applicant').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanFan = (idData.fan || 'CARD').replace(/\s+/g, '_');
  const fileName = `Ethiopian_ID_${cleanName}_${cleanFan}`;

  const CR80_WIDTH_MM = 85.60;
  const CR80_HEIGHT_MM = 53.98;

  if (options.format === 'cr80_dual') {
    // Direct CR80 Dual-Page PDF (85.60mm x 53.98mm)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [CR80_WIDTH_MM, CR80_HEIGHT_MM],
      compress: true,
    });

    // Page 1: Front
    doc.addImage(frontPngUrl, 'PNG', 0, 0, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');

    // Page 2: Back
    doc.addPage([CR80_WIDTH_MM, CR80_HEIGHT_MM], 'landscape');
    doc.addImage(backPngUrl, 'PNG', 0, 0, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');

    doc.save(`${fileName}_CR80_Dual_Print.pdf`);
  } else if (options.format === 'front_only') {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [CR80_WIDTH_MM, CR80_HEIGHT_MM],
      compress: true,
    });
    doc.addImage(frontPngUrl, 'PNG', 0, 0, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');
    doc.save(`${fileName}_Front_Only.pdf`);
  } else if (options.format === 'back_only') {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [CR80_WIDTH_MM, CR80_HEIGHT_MM],
      compress: true,
    });
    doc.addImage(backPngUrl, 'PNG', 0, 0, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');
    doc.save(`${fileName}_Back_Only.pdf`);
  } else {
    // Default: Standard ISO A4 Printable Sheet (210 x 297 mm)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const PAGE_WIDTH_MM = 210;
    const centerXMm = (PAGE_WIDTH_MM - CR80_WIDTH_MM) / 2;

    if (options.includeMetadataHeader) {
      // Header Banner
      doc.setFillColor(15, 23, 42); // Slate-900
      doc.rect(0, 0, PAGE_WIDTH_MM, 22, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', PAGE_WIDTH_MM / 2, 10, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text('NATIONAL ID PROGRAM (FAYDA) — OFFICIAL DIGITAL ID CARD PRINT SHEET', PAGE_WIDTH_MM / 2, 16, { align: 'center' });

      // Verification Bar
      doc.setFillColor(241, 245, 249);
      doc.rect(14, 26, PAGE_WIDTH_MM - 28, 14, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.rect(14, 26, PAGE_WIDTH_MM - 28, 14, 'S');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Full Name: ${idData.fullNameEnglish} (${idData.fullNameAmharic})`, 18, 32);
      doc.text(`FAN: ${idData.fan}`, 18, 37);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`DOB: ${idData.dateOfBirth} | Issue: ${idData.dateOfIssue || 'N/A'} | Expiry: ${idData.dateOfExpiry}`, 115, 32);
      doc.text(`Region: ${idData.regionEnglish || idData.regionAmharic} | Sex: ${idData.sex} | Phone: ${idData.phoneNumber}`, 115, 37);
    }

    // Positions for Front and Back
    const frontYMm = options.includeMetadataHeader ? 48 : 30;
    const backYMm = frontYMm + CR80_HEIGHT_MM + 20;

    // --- FRONT SIDE ---
    if (options.includeCropMarks) {
      drawCropMarks(doc, centerXMm, frontYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, 'FRONT SIDE (CR80 85.6 × 53.98 mm)');
    }
    doc.addImage(frontPngUrl, 'PNG', centerXMm, frontYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');

    // --- BACK SIDE ---
    if (options.includeCropMarks) {
      drawCropMarks(doc, centerXMm, backYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, 'BACK SIDE (CR80 85.6 × 53.98 mm)');
    }
    doc.addImage(backPngUrl, 'PNG', centerXMm, backYMm, CR80_WIDTH_MM, CR80_HEIGHT_MM, undefined, 'FAST');

    // Footer & PVC Guidelines
    const footerY = backYMm + CR80_HEIGHT_MM + 18;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, footerY, PAGE_WIDTH_MM - 28, 34, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, footerY, PAGE_WIDTH_MM - 28, 34, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PRINTER CALIBRATION & THERMAL PVC CARD GUIDELINES:', 18, footerY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('1. Paper Size: Standard ISO A4 (210 × 297 mm). In print dialog, set Scale to exactly 100% / "Actual Size" (DO NOT scale to fit).', 18, footerY + 13);
    doc.text('2. For Direct PVC Card Printers (Zebra, Fargo, Evolis, Magicard): Use the "Direct CR80 Dual-Page" format for borderless badge printing.', 18, footerY + 18);
    doc.text('3. Lamination: For paper/teslin badge stock, cut along crop marks and laminate using standard 54 × 86 mm 5-mil or 7-mil pouches.', 18, footerY + 23);
    doc.text(`4. Calibrated Resolution: 300 DPI | Generated with Custom Coordinates Map (${config.canvasWidth}×${config.canvasHeight} px).`, 18, footerY + 28);

    doc.save(`${fileName}_A4_PrintSheet.pdf`);
  }

  onProgress?.('Done! Download started.', 100);
  return { frontPngUrl, backPngUrl };
}

/**
 * Draw professional cutting guides and corner crop marks for PVC badge trimming
 */
function drawCropMarks(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
) {
  const markLen = 4;
  const offset = 2;

  doc.setDrawColor(148, 163, 184); // Slate-400
  doc.setLineWidth(0.25);

  // Top-Left corner
  doc.line(x - offset - markLen, y, x - offset, y);
  doc.line(x, y - offset - markLen, x, y - offset);

  // Top-Right corner
  doc.line(x + w + offset, y, x + w + offset + markLen, y);
  doc.line(x + w, y - offset - markLen, x + w, y - offset);

  // Bottom-Left corner
  doc.line(x - offset - markLen, y + h, x - offset, y + h);
  doc.line(x, y + h + offset, x, y + h + offset + markLen);

  // Bottom-Right corner
  doc.line(x + w + offset, y + h, x + w + offset + markLen, y + h);
  doc.line(x + w, y + h + offset, x + w, y + h + offset + markLen);

  // Label above
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label, x, y - 3);
}
