import jsQR from 'jsqr';
import { IdCardData, PdfMarkedRegion, PdfTextItemWithBox } from '../types';
import { sanitizeEnglishName, sanitizeAmharicName, sanitizeIdCardData } from './textCleaner';
import { convertGcToEth } from './ethiopianCalendar';
import { parseFaydaQrPayload } from './pdfExtractor';

export function splitBilingualLocation(raw: string): { english: string; amharic: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { english: '', amharic: '' };

  if (/[\/\|\-]/.test(trimmed)) {
    const parts = trimmed.split(/[\/\|\-]/).map((s) => s.trim()).filter(Boolean);
    let eng = '';
    let amh = '';
    for (const part of parts) {
      if (/[\u1200-\u137F]/.test(part)) {
        amh = amh ? `${amh} ${part}` : part;
      } else if (/[A-Za-z]/.test(part)) {
        eng = eng ? `${eng} ${part}` : part;
      }
    }
    if (eng || amh) {
      return { english: eng, amharic: amh };
    }
  }

  const hasEthiopic = /[\u1200-\u137F]/.test(trimmed);
  const hasLatin = /[A-Za-z]/.test(trimmed);

  if (hasEthiopic && hasLatin) {
    const amhMatches = trimmed.match(/[\u1200-\u137F0-9\s]+/g);
    const engMatches = trimmed.match(/[A-Za-z0-9\s]+/g);
    return {
      english: engMatches ? engMatches.join(' ').trim() : '',
      amharic: amhMatches ? amhMatches.join(' ').trim() : '',
    };
  }

  if (hasEthiopic) {
    return { english: '', amharic: trimmed };
  }

  return { english: trimmed, amharic: '' };
}

export const DEFAULT_PDF_MARKED_REGIONS: PdfMarkedRegion[] = [
  {
    id: 'photo',
    label: 'Portrait Photo',
    labelAmh: 'ፎቶግራፍ',
    color: '#10b981', // Emerald
    type: 'image',
    x: 5.5,
    y: 15.5,
    width: 22.0,
    height: 23.0,
  },
  {
    id: 'qrCode',
    label: 'Biometric QR Code',
    labelAmh: 'ኪውአር ኮድ',
    color: '#06b6d4', // Cyan
    type: 'qr',
    x: 67.5,
    y: 53.0,
    width: 26.5,
    height: 21.0,
  },
  {
    id: 'fullNameAmharic',
    label: 'Full Name (Amharic)',
    labelAmh: 'ሙሉ ስም (አማርኛ)',
    color: '#f59e0b', // Amber
    type: 'text',
    x: 29.5,
    y: 15.5,
    width: 44.0,
    height: 4.4,
  },
  {
    id: 'fullNameEnglish',
    label: 'Full Name (English)',
    labelAmh: 'ሙሉ ስም (እንግሊዝኛ)',
    color: '#3b82f6', // Blue
    type: 'text',
    x: 29.5,
    y: 20.2,
    width: 44.0,
    height: 4.4,
  },
  {
    id: 'fan',
    label: 'FAN (16 Digits)',
    labelAmh: 'የፋይዳ ቁጥር (16 ዲጂት)',
    color: '#a855f7', // Purple
    type: 'text',
    x: 29.5,
    y: 24.8,
    width: 42.0,
    height: 3.8,
  },
  {
    id: 'fcn',
    label: 'FCN / Card Number',
    labelAmh: 'የካርድ ቁጥር',
    color: '#6366f1', // Indigo
    type: 'text',
    x: 29.5,
    y: 29.0,
    width: 36.0,
    height: 3.6,
  },
  {
    id: 'dateOfBirth',
    label: 'Date of Birth (DOB)',
    labelAmh: 'የትውልድ ቀን',
    color: '#f43f5e', // Rose
    type: 'text',
    x: 29.5,
    y: 33.0,
    width: 30.0,
    height: 3.6,
  },
  {
    id: 'sex',
    label: 'Sex / Gender',
    labelAmh: 'ፆታ',
    color: '#14b8a6', // Teal
    type: 'text',
    x: 29.5,
    y: 37.0,
    width: 22.0,
    height: 3.6,
  },
  {
    id: 'phoneNumber',
    label: 'Phone Number',
    labelAmh: 'ስልክ ቁጥር',
    color: '#84cc16', // Lime
    type: 'text',
    x: 29.5,
    y: 41.0,
    width: 32.0,
    height: 3.6,
  },
  {
    id: 'regionAmharic',
    label: 'Region (Amharic) / ክልል',
    labelAmh: 'ክልል (አማርኛ)',
    color: '#ea580c', // Orange
    type: 'text',
    x: 29.5,
    y: 45.0,
    width: 20.0,
    height: 3.6,
  },
  {
    id: 'regionEnglish',
    label: 'Region (English) / ክልል በእንግሊዝኛ',
    labelAmh: 'ክልል (እንግሊዝኛ)',
    color: '#fb923c', // Light orange
    type: 'text',
    x: 50.5,
    y: 45.0,
    width: 22.0,
    height: 3.6,
  },
  {
    id: 'zoneAmharic',
    label: 'Zone (Amharic) / ዞን',
    labelAmh: 'ዞን / ክፍለ ከተማ (አማርኛ)',
    color: '#d97706', // Amber dark
    type: 'text',
    x: 29.5,
    y: 49.0,
    width: 20.0,
    height: 3.6,
  },
  {
    id: 'zoneEnglish',
    label: 'Zone (English) / ዞን በእንግሊዝኛ',
    labelAmh: 'ዞን (እንግሊዝኛ)',
    color: '#f59e0b', // Amber
    type: 'text',
    x: 50.5,
    y: 49.0,
    width: 22.0,
    height: 3.6,
  },
  {
    id: 'woredaAmharic',
    label: 'Woreda (Amharic) / ወረዳ',
    labelAmh: 'ወረዳ (አማርኛ)',
    color: '#16a34a', // Green
    type: 'text',
    x: 29.5,
    y: 53.0,
    width: 18.0,
    height: 3.6,
  },
  {
    id: 'woredaEnglish',
    label: 'Woreda (English) / ወረዳ በእንግሊዝኛ',
    labelAmh: 'ወረዳ (እንግሊዝኛ)',
    color: '#4ade80', // Light green
    type: 'text',
    x: 48.5,
    y: 53.0,
    width: 18.0,
    height: 3.6,
  },
  {
    id: 'kebele',
    label: 'Kebele / ቀበሌ',
    labelAmh: 'ቀበሌ',
    color: '#0d9488', // Teal dark
    type: 'text',
    x: 67.5,
    y: 53.0,
    width: 12.0,
    height: 3.6,
  },
  {
    id: 'dateOfIssue',
    label: 'Date of Issue',
    labelAmh: 'የተሰጠበት ቀን',
    color: '#0284c7', // Sky
    type: 'text',
    x: 29.5,
    y: 57.0,
    width: 30.0,
    height: 3.6,
  },
  {
    id: 'dateOfExpiry',
    label: 'Date of Expiry',
    labelAmh: 'የሚያበቃበት ቀን',
    color: '#e11d48', // Red
    type: 'text',
    x: 29.5,
    y: 61.0,
    width: 30.0,
    height: 3.6,
  },
  {
    id: 'barcode',
    label: '1D Barcode Strip',
    labelAmh: 'ባርኮድ (1D Barcode)',
    color: '#8b5cf6', // Violet
    type: 'barcode',
    x: 29.5,
    y: 66.0,
    width: 38.0,
    height: 6.5,
  },
];

/**
 * Loads an image from a data URL or blob URL into an HTMLImageElement
 */
export function loadImageAsync(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Crops an exact rectangular region from a canvas or image URL
 */
export async function cropImageRegion(
  source: string | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  targetWidth?: number,
  targetHeight?: number
): Promise<string> {
  let srcCanvas: HTMLCanvasElement;

  if (typeof source === 'string') {
    const img = await loadImageAsync(source);
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.naturalWidth || img.width;
    srcCanvas.height = img.naturalHeight || img.height;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }

  const sx = Math.max(0, Math.round((region.x / 100) * srcCanvas.width));
  const sy = Math.max(0, Math.round((region.y / 100) * srcCanvas.height));
  const sw = Math.min(srcCanvas.width - sx, Math.max(10, Math.round((region.width / 100) * srcCanvas.width)));
  const sh = Math.min(srcCanvas.height - sy, Math.max(10, Math.round((region.height / 100) * srcCanvas.height)));

  const outW = targetWidth || sw;
  const outH = targetHeight || sh;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });

  if (!destCtx) return '';

  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, outW, outH);
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  return destCanvas.toDataURL('image/jpeg', 0.95);
}

/**
 * Crops and decodes a QR code from a marked region on the canvas
 */
export async function cropAndDecodeQrRegion(
  source: string | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number }
): Promise<{ qrUrl: string; qrText?: string }> {
  let srcCanvas: HTMLCanvasElement;

  if (typeof source === 'string') {
    const img = await loadImageAsync(source);
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.naturalWidth || img.width;
    srcCanvas.height = img.naturalHeight || img.height;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }

  const sx = Math.max(0, Math.round((region.x / 100) * srcCanvas.width));
  const sy = Math.max(0, Math.round((region.y / 100) * srcCanvas.height));
  const sw = Math.min(srcCanvas.width - sx, Math.max(10, Math.round((region.width / 100) * srcCanvas.width)));
  const sh = Math.min(srcCanvas.height - sy, Math.max(10, Math.round((region.height / 100) * srcCanvas.height)));

  // Output 600x600 square high resolution QR image
  const outSize = 600;
  const destCanvas = document.createElement('canvas');
  destCanvas.width = outSize;
  destCanvas.height = outSize;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });

  if (!destCtx) return { qrUrl: '' };

  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, outSize, outSize);

  // Add 4% quiet zone padding
  const pad = Math.round(outSize * 0.04);
  const drawSize = outSize - pad * 2;
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, pad, pad, drawSize, drawSize);

  // Decode QR matrix
  let qrText: string | undefined;
  try {
    const imgData = destCtx.getImageData(0, 0, outSize, outSize);
    const decoded = jsQR(imgData.data, outSize, outSize, { inversionAttempts: 'attemptBoth' });
    if (decoded && decoded.data) {
      qrText = decoded.data;
    }
  } catch (err) {
    console.warn('QR decode in region failed:', err);
  }

  const qrUrl = destCanvas.toDataURL('image/png');
  return { qrUrl, qrText };
}

/**
 * Crops a 1D barcode strip region from the PDF page canvas with high resolution
 * and attempts decoding via browser BarcodeDetector API or intersecting/adjacent text items.
 */
export async function cropAndDecodeBarcodeRegion(
  source: HTMLCanvasElement | string,
  region: PdfMarkedRegion,
  textItems?: PdfTextItemWithBox[]
): Promise<{ barcodeUrl: string; barcodeText?: string }> {
  let srcCanvas: HTMLCanvasElement;
  if (typeof source === 'string') {
    const img = await loadImageAsync(source);
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.naturalWidth || img.width;
    srcCanvas.height = img.naturalHeight || img.height;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }

  const sx = Math.max(0, Math.round((region.x / 100) * srcCanvas.width));
  const sy = Math.max(0, Math.round((region.y / 100) * srcCanvas.height));
  const sw = Math.min(srcCanvas.width - sx, Math.max(10, Math.round((region.width / 100) * srcCanvas.width)));
  const sh = Math.min(srcCanvas.height - sy, Math.max(10, Math.round((region.height / 100) * srcCanvas.height)));

  // Output 640x120 high resolution wide barcode image
  const outW = 640;
  const outH = 120;
  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });

  if (!destCtx) return { barcodeUrl: '' };

  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, outW, outH);
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';

  // Add 12px horizontal, 8px vertical quiet zone border
  const padX = 12;
  const padY = 8;
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, padX, padY, outW - padX * 2, outH - padY * 2);

  // Attempt barcode decode
  let barcodeText: string | undefined;

  // 1. Try native BarcodeDetector if available in browser
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'upc_a', 'pdf417', 'codabar', 'itf'],
      });
      const barcodes = await detector.detect(destCanvas);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        barcodeText = barcodes[0].rawValue;
      }
    } catch {
      // ignore
    }
  }

  // 2. If barcode text not detected via BarcodeDetector, inspect text items intersecting or within/under the barcode box
  if (!barcodeText && textItems && textItems.length > 0) {
    // Expand region slightly downward to catch human-readable digits printed under barcode
    const expandedRegion: PdfMarkedRegion = {
      ...region,
      height: region.height * 1.5,
    };
    const extracted = extractTextFromRegion(expandedRegion, textItems);
    const digits = extracted.replace(/[^0-9]/g, '');
    if (digits.length === 16) {
      barcodeText = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
    } else if (digits.length >= 8) {
      barcodeText = digits;
    } else if (extracted.trim()) {
      barcodeText = extracted.trim();
    }
  }

  const barcodeUrl = destCanvas.toDataURL('image/png');
  return { barcodeUrl, barcodeText };
}

/**
 * Extracts and cleans text from items intersecting a marked region
 */
export function extractTextFromRegion(
  region: PdfMarkedRegion,
  textItems: PdfTextItemWithBox[] | undefined
): string {
  if (!textItems || textItems.length === 0) return '';

  // Find all text items whose box overlaps the marked region
  const intersecting = textItems.filter((item) => {
    const itemCenterX = item.pctX + item.pctWidth / 2;
    const itemCenterY = item.pctY + item.pctHeight / 2;

    const centerIn =
      itemCenterX >= region.x &&
      itemCenterX <= region.x + region.width &&
      itemCenterY >= region.y &&
      itemCenterY <= region.y + region.height;

    const overlapX =
      Math.max(item.pctX, region.x) < Math.min(item.pctX + item.pctWidth, region.x + region.width);
    const overlapY =
      Math.max(item.pctY, region.y) < Math.min(item.pctY + item.pctHeight, region.y + region.height);

    return centerIn || (overlapX && overlapY);
  });

  if (intersecting.length === 0) return '';

  // Sort by Y (top to bottom with tolerance of 1.5%), then X (left to right)
  const sorted = [...intersecting].sort((a, b) => {
    if (Math.abs(a.pctY - b.pctY) > 1.2) {
      return a.pctY - b.pctY;
    }
    return a.pctX - b.pctX;
  });

  const rawJoined = sorted.map((item) => item.str).join(' ').trim();

  // Field-specific cleaning
  switch (region.id) {
    case 'fullNameEnglish':
      return sanitizeEnglishName(rawJoined);
    case 'fullNameAmharic':
      return sanitizeAmharicName(rawJoined);
    case 'fan': {
      const digits = rawJoined.replace(/[^0-9]/g, '');
      if (digits.length === 16) {
        return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
      }
      if (digits.length > 0) return digits;
      return rawJoined.replace(/^(?:FAN|Fayda\s*ID|ID\s*Number)[\s:|\-/]+/i, '').trim();
    }
    case 'fcn': {
      const match = rawJoined.match(/\b([A-Z0-9]{3,4}[\-_][A-Z0-9]{4,5}[\-_][A-Z0-9]{4,5})\b/i) ||
                    rawJoined.match(/\b([0-9]{8,12})\b/);
      if (match) return match[1];
      return rawJoined.replace(/^(?:FCN|Card\s*No|Card\s*Number)[\s:|\-/]+/i, '').trim();
    }
    case 'dateOfBirth': {
      const match = rawJoined.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})\b/);
      if (match) return match[1].replace(/[\-\.]/g, '/');
      return rawJoined.replace(/^(?:DOB|Date\s*of\s*Birth|የትውልድ\s*ቀን)[\s:|\-/]+/i, '').trim();
    }
    case 'sex': {
      if (/\b(?:Female|ሴት)\b/i.test(rawJoined)) return 'Female';
      if (/\b(?:Male|ወንድ)\b/i.test(rawJoined)) return 'Male';
      return rawJoined;
    }
    case 'phoneNumber': {
      const digits = rawJoined.replace(/[^0-9+]/g, '');
      return digits.length >= 9 ? digits : rawJoined;
    }
    case 'regionAmharic':
    case 'zoneAmharic':
    case 'woredaAmharic':
    case 'kebele':
      return rawJoined.replace(/^(?:Region|Zone|Woreda|Kebele|Subcity|ክልል|ዞን|ወረዳ|ቀበሌ|ክፍለ\s*ከተማ)[\s:|\-/፡]*/i, '').trim();
    case 'dateOfIssue':
    case 'dateOfExpiry': {
      const match = rawJoined.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})\b/);
      if (match) return match[1].replace(/[\-\.]/g, '/');
      return rawJoined;
    }
    default:
      return rawJoined;
  }
}

/**
 * Extracts all data from the user-marked regions on the PDF slip
 */
export async function extractAllFromMarkedRegions(
  pageCanvasUrl: string,
  textItems: PdfTextItemWithBox[] | undefined,
  regions: PdfMarkedRegion[],
  currentData: IdCardData
): Promise<IdCardData> {
  const result: IdCardData = { ...currentData };

  // 1. Process Photo region
  const photoReg = regions.find((r) => r.id === 'photo');
  if (photoReg) {
    try {
      const croppedPhoto = await cropImageRegion(pageCanvasUrl, photoReg, 480, 640);
      if (croppedPhoto) {
        result.photoUrl = croppedPhoto;
      }
    } catch (err) {
      console.warn('Manual marked photo crop error:', err);
    }
  }

  // 2. Process QR Code region
  const qrReg = regions.find((r) => r.id === 'qrCode');
  let decodedQrPayload: string | undefined;
  if (qrReg) {
    try {
      const qrRes = await cropAndDecodeQrRegion(pageCanvasUrl, qrReg);
      if (qrRes.qrUrl) {
        result.qrCodeImageUrl = qrRes.qrUrl;
      }
      if (qrRes.qrText) {
        result.qrData = qrRes.qrText;
        decodedQrPayload = qrRes.qrText;
      }
    } catch (err) {
      console.warn('Manual marked QR crop error:', err);
    }
  }

  // 3. Process 1D Barcode region
  const barcodeReg = regions.find((r) => r.id === 'barcode' || r.type === 'barcode');
  if (barcodeReg) {
    try {
      const barcodeRes = await cropAndDecodeBarcodeRegion(pageCanvasUrl, barcodeReg, textItems);
      if (barcodeRes.barcodeUrl) {
        result.barcodeImageUrl = barcodeRes.barcodeUrl;
      }
      if (barcodeRes.barcodeText) {
        result.barcodeData = barcodeRes.barcodeText;
        const digits = barcodeRes.barcodeText.replace(/[^0-9]/g, '');
        if (!result.fan && digits.length === 16) {
          result.fan = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
        }
      }
      result.detectedBarcodeBox = {
        x: barcodeReg.x,
        y: barcodeReg.y,
        width: barcodeReg.width,
        height: barcodeReg.height,
      };
    } catch (err) {
      console.warn('Manual marked barcode crop error:', err);
    }
  }

  // 4. If QR was decoded, incorporate any structured payload data as baseline
  if (decodedQrPayload) {
    const qrData = parseFaydaQrPayload(decodedQrPayload);
    Object.assign(result, qrData);
  }

  // 5. Extract each marked text field
  for (const reg of regions) {
    if (reg.type === 'text') {
      const extractedText = extractTextFromRegion(reg, textItems);
      if (extractedText) {
        switch (reg.id) {
          case 'fullNameEnglish':
            result.fullNameEnglish = sanitizeEnglishName(extractedText);
            break;
          case 'fullNameAmharic':
            result.fullNameAmharic = sanitizeAmharicName(extractedText);
            break;
          case 'fan':
            result.fan = extractedText;
            break;
          case 'fcn':
            result.fcn = extractedText;
            break;
          case 'dateOfBirth': {
            result.dateOfBirth = extractedText;
            const eth = convertGcToEth(extractedText);
            if (eth) result.dateOfBirthEth = eth;
            break;
          }
          case 'sex':
            result.sex = extractedText as any;
            break;
          case 'phoneNumber':
            result.phoneNumber = extractedText;
            break;
          case 'regionAmharic': {
            const split = splitBilingualLocation(extractedText);
            result.regionAmharic = split.amharic || extractedText;
            if (split.english && !result.regionEnglish) result.regionEnglish = split.english;
            break;
          }
          case 'regionEnglish': {
            const split = splitBilingualLocation(extractedText);
            result.regionEnglish = split.english || extractedText;
            if (split.amharic && !result.regionAmharic) result.regionAmharic = split.amharic;
            break;
          }
          case 'zoneAmharic': {
            const split = splitBilingualLocation(extractedText);
            result.zoneAmharic = split.amharic || extractedText;
            if (split.english && !result.zoneEnglish) result.zoneEnglish = split.english;
            break;
          }
          case 'zoneEnglish': {
            const split = splitBilingualLocation(extractedText);
            result.zoneEnglish = split.english || extractedText;
            if (split.amharic && !result.zoneAmharic) result.zoneAmharic = split.amharic;
            break;
          }
          case 'woredaAmharic': {
            const split = splitBilingualLocation(extractedText);
            result.woredaAmharic = split.amharic || extractedText;
            if (split.english && !result.woredaEnglish) result.woredaEnglish = split.english;
            break;
          }
          case 'woredaEnglish': {
            const split = splitBilingualLocation(extractedText);
            result.woredaEnglish = split.english || extractedText;
            if (split.amharic && !result.woredaAmharic) result.woredaAmharic = split.amharic;
            break;
          }
          case 'kebele':
            result.kebele = extractedText;
            break;
          case 'dateOfIssue':
            result.dateOfIssue = extractedText;
            break;
          case 'dateOfExpiry':
            result.dateOfExpiry = extractedText;
            break;
        }
      }
    }
  }

  // Automatically persist marked region coordinates as permanent positions
  savePermanentRegions(regions);

  return sanitizeIdCardData(result);
}

export const STORAGE_PERMANENT_REGIONS_KEY = 'fayda_pdf_permanent_regions_v2';

export function savePermanentRegions(regions: PdfMarkedRegion[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PERMANENT_REGIONS_KEY, JSON.stringify(regions));
  } catch (e) {
    console.warn('Failed to save permanent regions to localStorage:', e);
  }
}

export function loadPermanentRegions(): PdfMarkedRegion[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PERMANENT_REGIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to load permanent regions from localStorage:', e);
  }
  return null;
}

export function clearPermanentRegions(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_PERMANENT_REGIONS_KEY);
  } catch (e) {
    console.warn('Failed to clear permanent regions:', e);
  }
}

export function getEffectiveRegions(): PdfMarkedRegion[] {
  const saved = loadPermanentRegions();
  if (saved && saved.length > 0) {
    const savedIds = new Set(saved.map((r) => r.id));
    const merged = [...saved];
    for (const def of DEFAULT_PDF_MARKED_REGIONS) {
      if (!savedIds.has(def.id)) {
        merged.push({ ...def });
      }
    }
    return merged;
  }
  return DEFAULT_PDF_MARKED_REGIONS.map((r) => ({ ...r }));
}

