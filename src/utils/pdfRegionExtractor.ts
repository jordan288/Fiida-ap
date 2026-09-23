import jsQR from 'jsqr';
import { IdCardData, PdfMarkedRegion, PdfTextItemWithBox } from '../types';
import { sanitizeEnglishName, sanitizeAmharicName, sanitizeIdCardData } from './textCleaner';
import { convertGcToEth, parseDualDate, calculateExpiryFromIssue, getTodayIssueDates, formatGcyyyyMmDd } from './ethiopianCalendar';
import { parseFaydaQrPayload } from './pdfExtractor';
import { autoRemovePhotoBackground } from './imageProcessor';
import { cropAndEnhanceBarcode, cropExactBarcode } from './barcodeEngine';
import { applyQrFilterToCanvas } from './qrPrecisionCropper';
import {
  cropAndUpscaleFanLayer,
  enhanceFanLayerBlackAndWhite,
  processFanBlackAndWhite,
  FanProcessingOptions,
} from './fanProcessor';

export {
  cropAndUpscaleFanLayer,
  enhanceFanLayerBlackAndWhite,
  processFanBlackAndWhite,
  type FanProcessingOptions,
};

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
    label: 'Portrait Photo (Photo 1)',
    labelAmh: 'ዋና ፎቶግራፍ (ፎቶ 1)',
    color: '#10b981', // Emerald
    type: 'image',
    x: 5.5,
    y: 15.5,
    width: 22.0,
    height: 23.0,
    layerGroup: 'photo',
    layerOrder: 1,
    autoRemoveBg: true,
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
    layerGroup: 'security',
    layerOrder: 7,
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
    layerGroup: 'text',
    layerOrder: 8,
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
    layerGroup: 'text',
    layerOrder: 9,
  },
  {
    id: 'fan',
    label: 'FAN (16 Digits Layer)',
    labelAmh: 'የፋይዳ ቁጥር ሌየር (16 ዲጂት)',
    color: '#a855f7', // Purple
    type: 'text',
    x: 29.5,
    y: 24.8,
    width: 42.0,
    height: 3.8,
    layerGroup: 'id_barcode',
    layerOrder: 5,
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
    layerGroup: 'id_barcode',
    layerOrder: 10,
  },
  {
    id: 'finCut',
    label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
    labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር (16 ዲጂት)',
    color: '#ec4899', // Pink
    type: 'image',
    x: 29.5,
    y: 24.0,
    width: 43.0,
    height: 4.5,
    layerGroup: 'id_barcode',
    layerOrder: 6,
    cutToLayerOnly: true,
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
    layerGroup: 'dates',
    layerOrder: 11,
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
    layerGroup: 'text',
    layerOrder: 12,
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
    layerGroup: 'text',
    layerOrder: 13,
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
    layerGroup: 'text',
    layerOrder: 14,
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
    layerGroup: 'text',
    layerOrder: 15,
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
    layerGroup: 'text',
    layerOrder: 16,
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
    layerGroup: 'text',
    layerOrder: 17,
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
    layerGroup: 'text',
    layerOrder: 18,
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
    layerGroup: 'text',
    layerOrder: 19,
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
    layerGroup: 'text',
    layerOrder: 20,
  },
  {
    id: 'dateOfIssue',
    label: 'Issued Date Layer',
    labelAmh: 'የተሰጠበት ቀን ሌየር',
    color: '#0284c7', // Sky
    type: 'text',
    x: 29.5,
    y: 57.0,
    width: 30.0,
    height: 3.6,
    layerGroup: 'dates',
    layerOrder: 3,
  },
  {
    id: 'dateOfExpiry',
    label: 'Date of Expiry Layer',
    labelAmh: 'የሚያበቃበት ቀን ሌየር',
    color: '#e11d48', // Red
    type: 'text',
    x: 29.5,
    y: 61.0,
    width: 30.0,
    height: 3.6,
    layerGroup: 'dates',
    layerOrder: 21,
  },
  {
    id: 'barcode',
    label: '1D Barcode Strip Layer',
    labelAmh: 'ባርኮድ ሌየር (1D Barcode)',
    color: '#8b5cf6', // Violet
    type: 'barcode',
    x: 29.5,
    y: 66.0,
    width: 38.0,
    height: 6.5,
    layerGroup: 'id_barcode',
    layerOrder: 4,
  },
];

/**
 * High-performance image and canvas cache to avoid re-decoding massive slip scans repeatedly
 */
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const canvasCache = new Map<string, HTMLCanvasElement>();

export function loadImageAsync(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      imageCache.delete(src);
      reject(e);
    };
    img.src = src;
  });

  if (imageCache.size > 15) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
  imageCache.set(src, promise);
  return promise;
}

export async function getSourceCanvas(source: string | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (typeof source !== 'string') return source;
  const cached = canvasCache.get(source);
  if (cached) return cached;

  const img = await loadImageAsync(source);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.naturalWidth || img.width;
  srcCanvas.height = img.naturalHeight || img.height;
  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx) ctx.drawImage(img, 0, 0);

  if (canvasCache.size > 15) {
    const firstKey = canvasCache.keys().next().value;
    if (firstKey) canvasCache.delete(firstKey);
  }
  canvasCache.set(source, srcCanvas);
  return srcCanvas;
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
  const srcCanvas = await getSourceCanvas(source);

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

  // Return lossless PNG to prevent JPEG compression degradation
  return destCanvas.toDataURL('image/png');
}

/**
 * Crops an exact rectangular region from a canvas or image URL to an HTMLCanvasElement
 */
export async function cropImageRegionToCanvas(
  source: string | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  targetWidth?: number,
  targetHeight?: number
): Promise<HTMLCanvasElement> {
  const srcCanvas = await getSourceCanvas(source);

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

  if (destCtx) {
    destCtx.fillStyle = '#ffffff';
    destCtx.fillRect(0, 0, outW, outH);
    destCtx.imageSmoothingEnabled = true;
    destCtx.imageSmoothingQuality = 'high';
    destCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
  }

  return destCanvas;
}

/**
 * Crops a clean date layer directly from the PDF document scan canvas.
 * Seamlessly removes white/off-white background to produce a transparent PNG with crisp,
 * high-contrast original date text, trimmed to exact text bounds.
 */
export async function cropCleanDateLayer(
  source: string | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  targetWidth = 600,
  targetHeight = 75
): Promise<string | null> {
  let srcCanvas: HTMLCanvasElement;

  if (typeof source === 'string') {
    if (!source) return null;
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

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = outW;
  tempCanvas.height = outH;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return null;

  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';
  tempCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  // Read pixel data to remove background and make transparent
  const imgData = tempCtx.getImageData(0, 0, outW, outH);
  const data = imgData.data;

  let minX = outW;
  let minY = outH;
  let maxX = 0;
  let maxY = 0;
  let hasText = false;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Perceived brightness formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (brightness >= 240) {
      // Pure or near-pure white background -> 100% transparent
      data[i + 3] = 0;
    } else if (brightness > 195) {
      // Smooth anti-aliased edge feathering
      const factor = (240 - brightness) / 45;
      data[i + 3] = Math.round(a * factor);
    } else {
      // Dark text / numbers: boost contrast for sharp legibility on card
      data[i] = Math.max(0, Math.round(r * 0.85));
      data[i + 1] = Math.max(0, Math.round(g * 0.85));
      data[i + 2] = Math.max(0, Math.round(b * 0.85));
      data[i + 3] = 255;
    }

    if (data[i + 3] > 60) {
      const pxIndex = i / 4;
      const pxX = pxIndex % outW;
      const pxY = Math.floor(pxIndex / outW);
      if (pxX < minX) minX = pxX;
      if (pxX > maxX) maxX = pxX;
      if (pxY < minY) minY = pxY;
      if (pxY > maxY) maxY = pxY;
      hasText = true;
    }
  }

  tempCtx.putImageData(imgData, 0, 0);

  // If text was detected, trim transparent padding around the numbers
  if (hasText && maxX > minX && maxY > minY) {
    const pad = 4;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(outW - cropX, (maxX - minX + 1) + pad * 2);
    const cropH = Math.min(outH - cropY, (maxY - minY + 1) + pad * 2);

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = cropW;
    trimmedCanvas.height = cropH;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (trimmedCtx) {
      trimmedCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return trimmedCanvas.toDataURL('image/png');
    }
  }

  return tempCanvas.toDataURL('image/png');
}

/**
 * Converts any user-uploaded or pasted date image into a transparent, high-contrast layer
 */
export async function makeTransparentDateCut(imageSrc: string): Promise<string> {
  const img = await loadImageAsync(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return imageSrc;

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  let hasText = false;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness >= 240) {
      data[i + 3] = 0;
    } else if (brightness > 195) {
      const factor = (240 - brightness) / 45;
      data[i + 3] = Math.round(a * factor);
    } else {
      data[i] = Math.max(0, Math.round(r * 0.85));
      data[i + 1] = Math.max(0, Math.round(g * 0.85));
      data[i + 2] = Math.max(0, Math.round(b * 0.85));
      data[i + 3] = 255;
    }

    if (data[i + 3] > 60) {
      const pxIndex = i / 4;
      const pxX = pxIndex % canvas.width;
      const pxY = Math.floor(pxIndex / canvas.width);
      if (pxX < minX) minX = pxX;
      if (pxX > maxX) maxX = pxX;
      if (pxY < minY) minY = pxY;
      if (pxY > maxY) maxY = pxY;
      hasText = true;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  if (hasText && maxX > minX && maxY > minY) {
    const pad = 4;
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(canvas.width - cropX, (maxX - minX + 1) + pad * 2);
    const cropH = Math.min(canvas.height - cropY, (maxY - minY + 1) + pad * 2);

    const trimmed = document.createElement('canvas');
    trimmed.width = cropW;
    trimmed.height = cropH;
    const trimmedCtx = trimmed.getContext('2d');
    if (trimmedCtx) {
      trimmedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return trimmed.toDataURL('image/png');
    }
  }

  return canvas.toDataURL('image/png');
}

export interface CropHighQualityFinOptions {
  enhanceContrast?: boolean; // Default true: deepens text density & eliminates scan haze
  bgMode?: 'white' | 'transparent' | 'original'; // Default 'white' (not transparent)
  colorMode?: 'bw' | 'bw_transparent' | 'enhanced' | 'original'; // Default 'bw' (pure black & white)
  thresholdOffset?: number; // -50 to +50: controls black ink thickness/threshold
  sharpen?: boolean; // Default false: keeps text smooth without pixel staircase artifacts
  smoothText?: boolean; // Default true: subpixel anti-aliasing for smooth rounded digits
  denoise?: boolean; // Default true: clean scanner dust and paper specks
  superSampleFactor?: number; // Default 1.0: no upscale
  targetMinHeight?: number; // Default 0: no minimum height
  noUpscale?: boolean; // When true, forces 1:1 direct crop with no upscale
  textItems?: PdfTextItemWithBox[];
}

/**
 * Direct Back FAN / FIN cut layer crop engine.
 * Per user directive: "crop the back fan and just put it as it is....  do not upscale it"
 * Directly crops the marked rectangular field from the slip canvas at 1:1 scale with zero upscaling and authentic pixels.
 */
export async function cropHighQualityFanLayer(
  source: string | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  options: CropHighQualityFinOptions = {}
): Promise<string> {
  const {
    superSampleFactor = 2.5, // 2.5x super-sampling for crystal clear 300+ DPI quality
    targetMinHeight = 180, // Minimum 180px height for ultra-crisp display & printing
    bgMode = 'white', // Solid white background
    colorMode = 'enhanced', // High quality contrast & haze removal
    thresholdOffset = 0,
    sharpen = true, // Edge sharpening for crisp character contours
    smoothText = true, // Subpixel anti-aliasing
    denoise = true, // Denoise background specks
    noUpscale = false,
  } = options;

  return cropAndUpscaleFanLayer(source, region, {
    superSampleFactor,
    targetMinHeight,
    bgMode: bgMode === 'transparent' ? 'transparent' : 'white',
    colorMode: colorMode || 'enhanced',
    thresholdOffset,
    sharpen,
    smoothText,
    denoise,
    noUpscale,
  });
}

/**
 * Enhances clarity, contrast, and edge smoothness of any existing Back FAN cut layer image
 * with small upscale and smooth Black & White processing on solid white background.
 */
export async function enhanceFanLayerClarity(
  imageSrc: string,
  options: {
    bgMode?: 'white' | 'transparent';
    colorMode?: 'bw' | 'bw_transparent' | 'enhanced' | 'original';
    sharpen?: boolean;
    smoothText?: boolean;
    denoise?: boolean;
    thresholdOffset?: number;
    superSampleFactor?: number;
  } = {}
): Promise<string> {
  const {
    bgMode = 'white',
    colorMode = 'bw',
    sharpen = false,
    smoothText = true,
    denoise = true,
    thresholdOffset = 0,
    superSampleFactor = 1.8, // Small upscale (1.8x)
  } = options;

  return enhanceFanLayerBlackAndWhite(imageSrc, {
    bgMode,
    colorMode: colorMode || (bgMode === 'transparent' ? 'bw_transparent' : 'bw'),
    sharpen,
    smoothText,
    denoise,
    thresholdOffset,
    superSampleFactor,
  });
}

/**
 * Generates a clean, crisp, vector-grade Back FAN layer
 * with authentic Ethiopian National ID OCR typography on a solid non-transparent white background.
 */
export function generateVectorFanDataUrl(
  fanDigits: string,
  options: {
    width?: number;
    height?: number;
    color?: string;
    bgMode?: 'transparent' | 'white';
    letterSpacing?: string;
  } = {}
): string {
  const {
    width = 1760,
    height = 380,
    color = '#000000',
    bgMode = 'white', // Default solid white, not transparent
    letterSpacing = '0.22em'
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (bgMode === 'transparent') {
    ctx.clearRect(0, 0, width, height);
  } else {
    // Pure solid white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  // Format the 16 digits into standard 4-4-4-4 grouping with wide spaces
  const clean = fanDigits.replace(/\D/g, '');
  let formatted = fanDigits.trim();
  if (clean.length === 16) {
    formatted = `${clean.slice(0, 4)}   ${clean.slice(4, 8)}   ${clean.slice(8, 12)}   ${clean.slice(12, 16)}`;
  }

  ctx.fillStyle = color;
  ctx.font = `400 ${Math.round(height * 0.28)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) {
    // @ts-ignore
    ctx.letterSpacing = letterSpacing;
  }

  ctx.fillText(formatted, width / 2, height / 2);
  return canvas.toDataURL('image/png');
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

  // Transparent background - zero white border
  destCtx.clearRect(0, 0, outSize, outSize);
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outSize, outSize);

  // Decode QR matrix before transparent pass
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

  // Strip white paper background and thick borders
  try {
    applyQrFilterToCanvas(destCtx, outSize, outSize, 'enhanced');
  } catch {}

  const qrUrl = destCanvas.toDataURL('image/png');
  return { qrUrl, qrText };
}

/**
 * Crops a 1D barcode strip region from the PDF page canvas with ultra-high quality:
 * Super-sampled to 1400px wide, Otsu adaptive binarization, vertical bar regularization,
 * and quiet-zone margins.
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

  const box = { x: sx, y: sy, width: sw, height: sh };
  const res = await cropExactBarcode(srcCanvas, box, textItems);

  return {
    barcodeUrl: res.barcodeUrl,
    barcodeText: res.barcodeText,
  };
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
      const dual = parseDualDate(rawJoined);
      if (dual.gc) return dual.gc;
      const match = rawJoined.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})\b/);
      if (match) return formatGcyyyyMmDd(match[1]) || match[1].replace(/[\-\.]/g, '/');
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
      if (match) return formatGcyyyyMmDd(match[1]) || match[1].replace(/[\-\.]/g, '/');
      return formatGcyyyyMmDd(rawJoined) || rawJoined;
    }
    default:
      return rawJoined;
  }
}

/**
 * Reads and parses the FAN / FIN digits and text directly from the cutted FAN / FIN region of the slip.
 * Uses:
 * 1. Overlapping and adjacent PDF vector text items (with margin tolerance)
 * 2. 16-digit regex pattern matching (e.g. 4195 0436 7069 2582)
 * 3. 1D barcode decoding if barcodes are present in the region
 * 4. Fallback search across nearby slip items
 */
export async function readCuttedFanFromRegion(
  pageCanvasUrl: string,
  region: PdfMarkedRegion,
  textItems?: PdfTextItemWithBox[]
): Promise<{ fan?: string; fcn?: string; rawText?: string; source?: 'cutLayer' | 'barcode' | 'slipText' }> {
  let fan: string | undefined;
  let fcn: string | undefined;
  let rawText = '';

  // 1. Text items in expanded region (+2.5% X, +3% Y margin for marker inaccuracy tolerance)
  if (textItems && textItems.length > 0) {
    const marginX = 2.5;
    const marginY = 3.0;
    const expandedRegion: PdfMarkedRegion = {
      ...region,
      x: Math.max(0, region.x - marginX),
      y: Math.max(0, region.y - marginY),
      width: Math.min(100 - (region.x - marginX), region.width + marginX * 2),
      height: Math.min(100 - (region.y - marginY), region.height + marginY * 2),
    };

    rawText = extractTextFromRegion(expandedRegion, textItems) || extractTextFromRegion(region, textItems);

    if (rawText) {
      // Check 16-digit space-separated or hyphen-separated FAN
      const fanMatch = rawText.match(/\b(\d{4})[ \-_](\d{4})[ \-_](\d{4})[ \-_](\d{4})\b/) ||
                       rawText.match(/(?:FAN|FIN|UIN|Fayda|ፋይዳ)[\s:|\-/]*(\d{16})\b/i) ||
                       rawText.match(/\b(\d{16})\b/);
      if (fanMatch) {
        if (fanMatch[1] && fanMatch[2] && fanMatch[3] && fanMatch[4]) {
          fan = `${fanMatch[1]} ${fanMatch[2]} ${fanMatch[3]} ${fanMatch[4]}`;
        } else if (fanMatch[1] && fanMatch[1].length === 16) {
          const d = fanMatch[1];
          fan = `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
        } else if (fanMatch[0]) {
          const d = fanMatch[0].replace(/[^0-9]/g, '');
          if (d.length === 16) {
            fan = `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
          }
        }
      }

      // Check all digits in the region if exactly 16 digits
      if (!fan) {
        const onlyDigits = rawText.replace(/[^0-9]/g, '');
        if (onlyDigits.length === 16) {
          fan = `${onlyDigits.slice(0, 4)} ${onlyDigits.slice(4, 8)} ${onlyDigits.slice(8, 12)} ${onlyDigits.slice(12, 16)}`;
        }
      }

      // Check FCN / Card Number pattern
      const fcnMatch = rawText.match(/\b([A-Z0-9]{3,4}[\-_][A-Z0-9]{4,5}[\-_][A-Z0-9]{4,5})\b/i) ||
                       rawText.match(/\b([0-9]{4}-[0-9]{4}-[0-9]{4})\b/);
      if (fcnMatch) {
        fcn = fcnMatch[1];
      }
    }
  }

  // 2. Try BarcodeDetector on the cropped cutted region canvas (if barcode is inside the cut)
  if (!fan && typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const croppedCanvas = await cropImageRegionToCanvas(pageCanvasUrl, region);
      const detector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'upc_a', 'pdf417'],
      });
      const barcodes = await detector.detect(croppedCanvas);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        const val = String(barcodes[0].rawValue).trim();
        const d = val.replace(/[^0-9]/g, '');
        if (d.length === 16) {
          fan = `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
        } else if (d.length > 0) {
          fan = val;
        }
      }
    } catch {}
  }

  return { fan, fcn, rawText, source: fan ? 'cutLayer' : undefined };
}

/**
 * Extracts all data from the user-marked regions on the PDF slip
 */
export async function extractAllFromMarkedRegions(
  pageCanvasUrl: string | HTMLCanvasElement,
  textItems: PdfTextItemWithBox[] | undefined,
  regions: PdfMarkedRegion[],
  currentData: IdCardData,
  options?: {
    skipBgRemovalIfAlreadyPresent?: boolean;
  }
): Promise<IdCardData> {
  const result: IdCardData = { ...currentData };

  // 1. Process Primary Photo region (Photo 1) with auto-background removal and Ultra-HD upscaling
  const photoReg = regions.find((r) => r.id === 'photo');
  if (photoReg) {
    try {
      const croppedPhoto = await cropImageRegion(pageCanvasUrl, photoReg, 1200, 1600);
      if (croppedPhoto) {
        // Auto remove background cleanly without delay-inducing upscaler
        try {
          const transparentPhoto = await autoRemovePhotoBackground(croppedPhoto);
          result.photoUrl = transparentPhoto || croppedPhoto;
          result.photoTransparentUrl = transparentPhoto || croppedPhoto;
        } catch {
          result.photoUrl = croppedPhoto;
        }

        try {
          const srcCanvas = await getSourceCanvas(pageCanvasUrl);
          if (srcCanvas && srcCanvas.width > 0) {
            result.detectedPhotoBox = {
              x: Math.round((photoReg.x / 100) * srcCanvas.width),
              y: Math.round((photoReg.y / 100) * srcCanvas.height),
              width: Math.round((photoReg.width / 100) * srcCanvas.width),
              height: Math.round((photoReg.height / 100) * srcCanvas.height),
            };
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Manual marked photo crop error:', err);
    }
  }

  // Ensure photoUrl is transparent if carried over from currentData
  if (!result.photoUrl && currentData.photoUrl) {
    try {
      const transparentPhoto = await autoRemovePhotoBackground(currentData.photoUrl);
      result.photoUrl = transparentPhoto || currentData.photoUrl;
    } catch {
      result.photoUrl = currentData.photoUrl;
    }
  }

  // 1b. The smaller security photo is an exact copy of the larger photo (no second layer)
  // Per user directive: "the larger photo is perfect and i want the smaller photo copy from the larger no second layer"
  result.secondaryPhotoUrl = result.photoUrl || currentData.photoUrl || currentData.secondaryPhotoUrl;

  // 1c. Process Cutted FAN / FIN Layer:
  // User directive: "crop the back fan and just put it as it is....  do not upscale it"
  // Directly crop authentic region from canvas at 1:1 scale without upscaling or altering
  const finCutReg = regions.find((r) => r.id === 'finCut' || r.id === 'backFanCut' || (r.cutToLayerOnly && (r.id === 'fcn' || r.id === 'fan')));
  if (finCutReg) {
    try {
      const croppedFin = await cropHighQualityFanLayer(pageCanvasUrl, finCutReg, {
        colorMode: 'enhanced',
        superSampleFactor: 2.5,
        targetMinHeight: 180,
        sharpen: true,
        smoothText: true,
        denoise: true,
      });
      if (croppedFin) {
        result.finLayerCropUrl = croppedFin;
        result.useFinLayerCrop = true;
      }
    } catch (err) {
      console.warn('Cutted FAN crop error:', err);
    }
  } else if (!result.finLayerCropUrl && textItems && textItems.length > 0) {
    // If no explicit finCut region is marked, but text items contain 16-digit FAN, auto-crop exact cut layer as it is
    const fanItem = textItems.find(
      (item) => /\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b/.test(item.str) || /\b\d{16}\b/.test(item.str) || /\b\d{4}-\d{4}-\d{4}\b/.test(item.str)
    );
    if (fanItem && pageCanvasUrl) {
      try {
        const fanX = typeof fanItem.pctX === 'number' && fanItem.pctX > 5 ? Math.max(0, fanItem.pctX - 1.2) : 29.5;
        const fanY = typeof fanItem.pctY === 'number' && fanItem.pctY > 10 ? Math.max(0, fanItem.pctY - 0.8) : 24.0;
        const fanW = typeof fanItem.pctWidth === 'number' && fanItem.pctWidth > 10 ? Math.min(100 - fanX, fanItem.pctWidth + 2.5) : 43.0;
        const fanH = typeof fanItem.pctHeight === 'number' && fanItem.pctHeight > 1 ? Math.min(100 - fanY, Math.max(fanItem.pctHeight * 1.5, 3.8)) : 4.5;

        const autoFanReg: PdfMarkedRegion = {
          id: 'finCut',
          label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
          labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር (16 ዲጂት)',
          color: '#ec4899',
          type: 'image',
          x: fanX,
          y: fanY,
          width: fanW,
          height: fanH,
          cutToLayerOnly: true,
        };
        const croppedFin = await cropHighQualityFanLayer(pageCanvasUrl, autoFanReg, {
          colorMode: 'enhanced',
          superSampleFactor: 2.5,
          targetMinHeight: 180,
          sharpen: true,
          smoothText: true,
          denoise: true,
        });
        if (croppedFin) {
          result.finLayerCropUrl = croppedFin;
          result.useFinLayerCrop = true;
        }
      } catch (e) {
        console.warn('Auto back fan crop error:', e);
      }
    }
  }

  // 1d. Process Date Layers:
  // User directive: "fix the birth date from the cutted to the readed part permanently"
  // User directive: "the expiry date is start from the issued date and expired in 8 years...... just fix that and remove the cutter part to reader......"
  // Birth date, issued date, and expiry date permanently use the text reader, never cutter image layers.
  result.useDobLayerCrop = false;
  result.useExpiryLayerCrop = false;
  result.useIssueLayerCrop = false;
  result.dobLayerCropUrl = undefined;
  result.expiryLayerCropUrl = undefined;
  result.issueLayerCropUrl = undefined;

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
            const dual = parseDualDate(extractedText);
            if (dual.gc || dual.eth) {
              result.dateOfBirth = dual.gc || dual.eth;
              result.dateOfBirthEth = dual.eth || convertGcToEth(result.dateOfBirth) || '';
            } else {
              result.dateOfBirth = formatGcyyyyMmDd(extractedText) || extractedText;
              const eth = convertGcToEth(extractedText);
              if (eth) result.dateOfBirthEth = eth;
            }
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
          case 'dateOfIssue': {
            const formatted = formatGcyyyyMmDd(extractedText) || extractedText;
            result.dateOfIssue = formatted;
            const eth = convertGcToEth(formatted);
            if (eth) result.dateOfIssueEth = eth;
            const exp = calculateExpiryFromIssue(formatted, eth || result.dateOfIssueEth);
            if (exp) {
              result.dateOfExpiry = exp.expiryGc;
              result.dateOfExpiryEth = exp.expiryEth;
            }
            break;
          }
          case 'dateOfExpiry': {
            const formatted = formatGcyyyyMmDd(extractedText) || extractedText;
            result.dateOfExpiry = formatted;
            const eth = convertGcToEth(formatted);
            if (eth) result.dateOfExpiryEth = eth;
            break;
          }
          case 'serialNumber': {
            const cleanSn = extractedText.replace(/^(?:SN|Serial\s*(?:Number|No)?|ተከታታይ\s*(?:ቁጥር)?)[\s:|\-\/]*/i, '').trim();
            if (cleanSn) result.serialNumber = cleanSn;
            break;
          }
        }
      }
    }
  }

  // Ensure read back FAN is populated and put on the back of the card for all PDFs
  if (!result.backFan) {
    if (result.fan) {
      result.backFan = result.fan;
      result.backFanReadSource = result.backFanReadSource || 'slipText';
    } else if (result.fcn) {
      result.backFan = result.fcn;
      result.backFanReadSource = 'slipText';
    }
  }

  // Back FAN: User directive: "for the back fan ..... just take the cutted part and do not read it just put the cutted part"
  if (result.finLayerCropUrl) {
    result.useFinLayerCrop = true;
  }

  // DOB: User directive: "fix the birth date from the cutted to the readed part permanently"
  result.useDobLayerCrop = false;

  // Issued Date & Expiry date: User directive: "make the issued date always updated do not put the button"
  // Issued date is always automatically updated to today's date, and expiry date starts from issued date and expires in 8 years
  const today = getTodayIssueDates();
  result.dateOfIssue = today.issueDateGc;
  result.dateOfIssueEth = today.issueDateEth;
  result.dateOfExpiry = today.expiryDateGc;
  result.dateOfExpiryEth = today.expiryDateEth;

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
    // Filter out any legacy secondaryPhoto region (smaller photo is copied directly from larger photo, no second layer)
    const filteredSaved = saved.filter((r) => r.id !== 'secondaryPhoto');
    const savedIds = new Set(filteredSaved.map((r) => r.id));
    const merged = filteredSaved.map((r) => {
      // Auto-migrate legacy finCut region if it was saved at the old FCN y:28.5% position
      if ((r.id === 'finCut' || r.id === 'backFanCut') && r.y >= 27.5 && r.y <= 29.5) {
        return {
          ...r,
          label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
          labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር (16 ዲጂት)',
          y: 24.0,
          width: 43.0,
          height: 4.5,
        };
      }
      return { ...r };
    });
    for (const def of DEFAULT_PDF_MARKED_REGIONS) {
      if (!savedIds.has(def.id) && def.id !== 'secondaryPhoto') {
        merged.push({ ...def });
      }
    }
    return merged;
  }
  return DEFAULT_PDF_MARKED_REGIONS.filter((r) => r.id !== 'secondaryPhoto').map((r) => ({ ...r }));
}

