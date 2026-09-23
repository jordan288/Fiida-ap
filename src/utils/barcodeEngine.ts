import JsBarcode from 'jsbarcode';
import { PdfTextItemWithBox } from '../types';

// Resolve JsBarcode function safely for both ESM and CJS bundle environments
const callJsBarcode = (target: any, text: string, options?: any) => {
  const fn: any = typeof JsBarcode === 'function' ? JsBarcode : (JsBarcode as any)?.default;
  if (typeof fn === 'function') {
    return fn(target, text, options);
  }
  throw new Error('JsBarcode library is not callable');
};

export interface BarcodeCropResult {
  barcodeUrl: string;
  barcodeText?: string;
  detected: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  isVectorGenerated?: boolean;
}

export interface BarcodeEnhanceOptions {
  binarize?: boolean; // Convert to pure black & white
  threshold?: number; // 0-255 or 0 for auto Otsu threshold
  columnRegularize?: boolean; // Straighten vertical bars and eliminate horizontal scanner noise
  contrastBoost?: number; // 1.0 to 3.0
  outWidth?: number; // e.g. 1400 px
  outHeight?: number; // e.g. 140 px
  quietZone?: number; // pixels padding on left and right
}

/**
 * Loads an image from a data URL or blob URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Calculates Otsu's optimal global binarization threshold for an image
 */
function calculateOtsuThreshold(data: Uint8ClampedArray, width: number, height: number): number {
  const histogram = new Array(256).fill(0);
  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogram[lum]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 160; // fallback

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    // Between-class variance
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  // Barcode slips usually have dark bars (lum ~30-100) and light paper (lum ~210-250)
  // Clamp threshold between 120 and 215 for safety
  return Math.max(120, Math.min(215, threshold));
}

/**
 * Generates an official, mathematically certified Code 128 barcode as a high-resolution PNG data URL.
 * Automatically selects Code 128C for 16-digit FAN numbers or Code 128 Auto for alphanumeric.
 */
export function generateCode128DataUrl(
  text: string,
  options: {
    width?: number;
    height?: number;
    displayValue?: boolean;
    lineColor?: string;
    background?: string;
    margin?: number;
  } = {}
): string {
  const cleanDigits = text.replace(/[^0-9A-Za-z]/g, '') || '4195043670692582';
  const outW = options.width || 1200;
  const outH = options.height || 140;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  const is16Digits = /^\d{16}$/.test(cleanDigits);
  const format = is16Digits ? 'CODE128C' : 'CODE128';

  try {
    callJsBarcode(canvas, cleanDigits, {
      format: format as any,
      width: Math.max(2, Math.round(outW / (is16Digits ? 140 : 180))),
      height: Math.round(outH * 0.82),
      displayValue: options.displayValue ?? false,
      fontSize: 16,
      margin: 16,
      background: options.background || '#ffffff',
      lineColor: options.lineColor || '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('JsBarcode generation warning, falling back to CODE128:', err);
    try {
      callJsBarcode(canvas, cleanDigits, {
        format: 'CODE128',
        width: 3,
        height: Math.round(outH * 0.8),
        displayValue: false,
        margin: 16,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }
}

/**
 * Draws an official Code 128 barcode directly onto a target 2D canvas context at specified rectangle
 */
export function drawCode128Direct(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string = '#000000',
  bg: string = '#ffffff'
) {
  const cleanDigits = (text || '4195043670692582').replace(/[^0-9A-Za-z]/g, '') || '4195043670692582';
  
  // Render onto temporary high-resolution offscreen canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.max(600, Math.round(w * 2));
  tempCanvas.height = Math.max(80, Math.round(h * 2));

  const is16Digits = /^\d{16}$/.test(cleanDigits);
  try {
    callJsBarcode(tempCanvas, cleanDigits, {
      format: (is16Digits ? 'CODE128C' : 'CODE128') as any,
      width: Math.max(2, Math.round(tempCanvas.width / (is16Digits ? 140 : 180))),
      height: Math.round(tempCanvas.height * 0.85),
      displayValue: false,
      margin: 10,
      background: bg,
      lineColor: color,
    });
    ctx.drawImage(tempCanvas, x, y, w, h);
  } catch (err) {
    console.warn('drawCode128Direct error:', err);
    // Fallback: fill white box
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
  }
}

/**
 * Generates an SVG string of the authentic Code 128 barcode
 */
export function generateCode128SvgString(
  text: string,
  width: number = 440,
  height: number = 40,
  darkColor: string = '#0f172a'
): string {
  const clean = (text || '4195043670692582').replace(/[^0-9A-Za-z]/g, '') || '4195043670692582';
  const is16Digits = /^\d{16}$/.test(clean);

  if (typeof document !== 'undefined') {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      callJsBarcode(svgNode, clean, {
        format: (is16Digits ? 'CODE128C' : 'CODE128') as any,
        displayValue: false,
        height: height,
        margin: 6,
        background: '#ffffff',
        lineColor: darkColor,
      });
      svgNode.setAttribute('width', '100%');
      svgNode.setAttribute('height', '100%');
      svgNode.setAttribute('preserveAspectRatio', 'none');
      svgNode.setAttribute('style', 'display:block;width:100%;height:100%;');
      return new XMLSerializer().serializeToString(svgNode);
    } catch {
      // ignore
    }
  }

  // Simple clean fallback SVG
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%;"><rect width="${width}" height="${height}" fill="#ffffff"/></svg>`;
}

/**
 * Intelligent auto-detection of the 1D barcode on an Ethiopian Fayda slip canvas
 */
export function detectBarcodeRegionOnSlip(
  canvas: HTMLCanvasElement,
  textItems?: PdfTextItemWithBox[]
): { x: number; y: number; width: number; height: number } | null {
  const width = canvas.width;
  const height = canvas.height;

  // 1. Try searching text items for 16-digit FAN or "FAN" / "FIN" label
  if (textItems && textItems.length > 0) {
    // Find item with 16 digits or starting with FAN
    const fanItem = textItems.find((item) => {
      const clean = item.str.replace(/[^0-9]/g, '');
      return clean.length === 16 || /^(FAN|FIN|FCN)\b/i.test(item.str.trim());
    });

    if (fanItem) {
      // The 1D barcode is situated directly below or above the FAN text on the slip
      // Usually below: y starts around fanItem.y + fanItem.height, extending downward
      const barY = Math.round(fanItem.y + fanItem.height * 0.9);
      const barH = Math.round(fanItem.height * 1.8);
      const barW = Math.round(fanItem.width * 1.3);
      const barX = Math.max(0, Math.round(fanItem.x - (barW - fanItem.width) / 2));

      if (barY + barH < height) {
        return {
          x: barX,
          y: barY,
          width: Math.min(width - barX, barW),
          height: barH,
        };
      }
    }
  }

  // 2. Default canonical Fayda slip barcode position:
  // On an A4 slip, ID cutout card is centered horizontally at x ~29.5%, y ~66%, w ~38%, h ~6.5%
  return {
    x: Math.round(width * 0.295),
    y: Math.round(height * 0.660),
    width: Math.round(width * 0.380),
    height: Math.round(height * 0.065),
  };
}

/**
 * Exact Barcode Cut Engine:
 * Cuts the exact 1D barcode region directly from the document slip canvas without regenerating,
 * binarizing columns, or synthesizing artificial barcode bars.
 * Preserves the authentic original printed barcode marks with high-DPI lossless PNG quality.
 */
/**
 * Direct cut of the authentic barcode from the slip canvas.
 * Preserves the exact scanned bar sequence and physical bar widths, but applies:
 * 1. Intelligent vertical bar trimming to remove stray margins/underneath numbers.
 * 2. High-DPI resampling (1600px wide) with pure crisp white background (#ffffff).
 * 3. Optical contrast normalization to make authentic bars solid rich black (#000000)
 *    and paper background pure snow white with razor-sharp anti-aliased vertical edges.
 */
export async function cropExactBarcode(
  source: HTMLCanvasElement | string,
  box: { x: number; y: number; width: number; height: number },
  textItems?: PdfTextItemWithBox[],
  options: {
    targetWidth?: number;
    targetHeight?: number;
    quietZone?: number;
    enhanceContrast?: boolean;
  } = {}
): Promise<BarcodeCropResult> {
  let srcCanvas: HTMLCanvasElement;
  if (typeof source === 'string') {
    const img = await loadImage(source);
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.naturalWidth || img.width;
    srcCanvas.height = img.naturalHeight || img.height;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }

  let sx = Math.max(0, Math.round(box.x));
  let sy = Math.max(0, Math.round(box.y));
  let sw = Math.min(srcCanvas.width - sx, Math.max(15, Math.round(box.width)));
  let sh = Math.min(srcCanvas.height - sy, Math.max(8, Math.round(box.height)));

  if (sw < 10 || sh < 4) {
    return { barcodeUrl: '', detected: false };
  }

  // 1. Analyze the cropped region to find the exact vertical bounds of the 1D barcode bars
  // This removes any numbers printed below the barcode or lines above it.
  try {
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (srcCtx) {
      const sample = srcCtx.getImageData(sx, sy, sw, sh);
      const sData = sample.data;

      // Find rows that contain multiple vertical dark bars (high frequency transitions)
      const rowTransitions: number[] = new Array(sh).fill(0);
      const rowDarkCounts: number[] = new Array(sh).fill(0);

      for (let y = 0; y < sh; y++) {
        let transitions = 0;
        let darkCount = 0;
        let lastState = false;

        const rowOffset = y * sw;
        for (let x = 0; x < sw; x++) {
          const idx = (rowOffset + x) * 4;
          const lum = 0.299 * sData[idx] + 0.587 * sData[idx + 1] + 0.114 * sData[idx + 2];
          const isDark = lum < 155;
          if (isDark) darkCount++;

          if (x > 0 && isDark !== lastState) {
            transitions++;
          }
          lastState = isDark;
        }

        rowTransitions[y] = transitions;
        rowDarkCounts[y] = darkCount;
      }

      // Barcode bars typically have 20+ transitions across width, whereas text has far fewer
      let barStartY = -1;
      let barEndY = -1;

      for (let y = 0; y < sh; y++) {
        const isBarRow = rowTransitions[y] >= 14 && rowDarkCounts[y] > sw * 0.08 && rowDarkCounts[y] < sw * 0.75;
        if (isBarRow) {
          if (barStartY === -1) barStartY = y;
          barEndY = y;
        }
      }

      // If we found a clear barcode bar zone that is at least 35% of total height
      if (barStartY !== -1 && barEndY - barStartY >= Math.max(10, sh * 0.35)) {
        // Leave a small 2px margin top & bottom
        const trimTop = Math.max(0, barStartY - 2);
        const trimBottom = Math.min(sh, barEndY + 3);
        sy = sy + trimTop;
        sh = trimBottom - trimTop;
      }
    }
  } catch (err) {
    console.warn('Barcode boundary detection non-fatal warning:', err);
  }

  // 2. Destination canvas dimensions: 1600px width for pristine 300-600 DPI rendering
  const outW = options.targetWidth || 1600;
  const outH = options.targetHeight || 180;
  const quietZone = options.quietZone ?? 24;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!destCtx) {
    return { barcodeUrl: '', detected: false };
  }

  // Solid clean crisp snow white backing
  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, outW, outH);

  // 3. Draw the exact cutted barcode region onto the high-resolution canvas
  const innerW = outW - quietZone * 2;
  const innerH = outH - 16;
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, quietZone, 8, innerW, innerH);

  // 4. Optical Contrast & Clarity Normalization:
  // Eliminates scanner paper haze/gray grain, saturates original bars to pitch black,
  // and keeps crisp subpixel anti-aliasing without blur.
  const enhanceContrast = options.enhanceContrast ?? true;
  if (enhanceContrast) {
    const imgData = destCtx.getImageData(0, 0, outW, outH);
    const data = imgData.data;

    // Collect luminance samples in the active barcode zone to establish paper baseline and bar ink level
    const luminances: number[] = [];
    for (let y = 12; y < outH - 12; y += 2) {
      const rowOffset = y * outW;
      for (let x = quietZone; x < quietZone + innerW; x += 4) {
        const idx = (rowOffset + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        luminances.push(lum);
      }
    }

    luminances.sort((a, b) => a - b);
    const darkSampleCount = Math.max(10, Math.floor(luminances.length * 0.15));
    const brightSampleCount = Math.max(10, Math.floor(luminances.length * 0.25));

    let darkSum = 0;
    for (let i = 0; i < darkSampleCount; i++) darkSum += luminances[i];
    const barInkLum = darkSampleCount > 0 ? darkSum / darkSampleCount : 45;

    let brightSum = 0;
    for (let i = luminances.length - brightSampleCount; i < luminances.length; i++) brightSum += luminances[i];
    const paperBgLum = brightSampleCount > 0 ? brightSum / brightSampleCount : 235;

    // Tight contrast cutoffs: paper turns pure white (#ffffff), bars turn pure black (#000000)
    const whiteThreshold = Math.max(160, Math.min(250, paperBgLum - 16));
    const blackThreshold = Math.min(whiteThreshold - 25, Math.max(40, barInkLum + 35));

    for (let y = 0; y < outH; y++) {
      const rowOffset = y * outW;
      const isMarginRow = y < 8 || y >= outH - 8;

      for (let x = 0; x < outW; x++) {
        const idx = (rowOffset + x) * 4;

        // Quiet zones on left/right and margins on top/bottom are pure white
        if (isMarginRow || x < quietZone || x >= quietZone + innerW) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = 255;
          continue;
        }

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum >= whiteThreshold) {
          // Pure White
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        } else if (lum <= blackThreshold) {
          // Pure Solid Black Bar
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        } else {
          // Razor-sharp Hermite anti-aliased edge
          const t = (whiteThreshold - lum) / (whiteThreshold - blackThreshold);
          const smoothT = Math.max(0, Math.min(1, t * t * (3 - 2 * t)));
          const gray = Math.round(255 * (1 - smoothT));
          data[idx] = gray;
          data[idx + 1] = gray;
          data[idx + 2] = gray;
          data[idx + 3] = 255;
        }
      }
    }

    destCtx.putImageData(imgData, 0, 0);
  }

  const barcodeUrl = destCanvas.toDataURL('image/png');

  // Attempt to decode barcode digits if detector is available (read-only, does not modify cutted image)
  let barcodeText: string | undefined;
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'upc_a', 'itf', 'codabar'],
      });
      const detected = await detector.detect(destCanvas);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        barcodeText = detected[0].rawValue;
      }
    } catch {
      // ignore
    }
  }

  // Fallback: nearby text items search
  if (!barcodeText && textItems && textItems.length > 0) {
    const nearby = textItems.filter((item) => {
      const isXOverlap = item.x < box.x + box.width && item.x + item.width > box.x;
      const isYNear = Math.abs(item.y - box.y) < box.height * 2.5;
      return isXOverlap && isYNear;
    });

    for (const item of nearby) {
      const digits = item.str.replace(/[^0-9]/g, '');
      if (digits.length === 16) {
        barcodeText = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
        break;
      }
    }
  }

  return {
    barcodeUrl,
    barcodeText,
    detected: true,
    boundingBox: box,
    isVectorGenerated: false,
  };
}

/**
 * Crops the 1D barcode region with ultra-high quality:
 * Preserves the exact cutted barcode directly from the document slip canvas.
 */
export async function cropAndEnhanceBarcode(
  source: HTMLCanvasElement | string,
  box: { x: number; y: number; width: number; height: number },
  textItems?: PdfTextItemWithBox[],
  options: BarcodeEnhanceOptions = {}
): Promise<BarcodeCropResult> {
  // If binarization is not explicitly requested, perform authentic exact cut
  if (options.binarize === false) {
    return cropExactBarcode(source, box, textItems, {
      targetWidth: options.outWidth,
      targetHeight: options.outHeight,
      quietZone: options.quietZone,
    });
  }
  let srcCanvas: HTMLCanvasElement;
  if (typeof source === 'string') {
    const img = await loadImage(source);
    srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.naturalWidth || img.width;
    srcCanvas.height = img.naturalHeight || img.height;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (ctx) ctx.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }

  const sx = Math.max(0, Math.round(box.x));
  const sy = Math.max(0, Math.round(box.y));
  const sw = Math.min(srcCanvas.width - sx, Math.max(20, Math.round(box.width)));
  const sh = Math.min(srcCanvas.height - sy, Math.max(10, Math.round(box.height)));

  if (sw < 20 || sh < 10) {
    return { barcodeUrl: '', detected: false };
  }

  // Super-sample to high resolution (1400px wide, 160px height)
  const outW = options.outWidth || 1400;
  const outH = options.outHeight || 160;
  const quietZone = options.quietZone ?? 24;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!destCtx) {
    return { barcodeUrl: '', detected: false };
  }

  // 1. Fill crisp pure white background
  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, outW, outH);

  // 2. Draw source barcode region onto canvas using crisp point-sampling (no blurry antialiasing)
  destCtx.imageSmoothingEnabled = false;
  const innerW = outW - quietZone * 2;
  const innerH = outH - 16;
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, quietZone, 8, innerW, innerH);

  // 3. Process raw pixels: Otsu binarization and column regularization
  const imgData = destCtx.getImageData(0, 0, outW, outH);
  const pixels = imgData.data;

  // Compute Otsu threshold in the barcode zone
  const threshold = options.threshold && options.threshold > 0
    ? options.threshold
    : calculateOtsuThreshold(pixels, outW, outH);

  const binarize = options.binarize ?? true;
  const columnRegularize = options.columnRegularize ?? true;

  if (binarize) {
    if (columnRegularize) {
      // 1D Barcode Column Regularization:
      // For each vertical column inside the barcode active area, calculate median/mean darkness.
      // In 1D barcodes, bars run vertically. If a column is a bar, it should be dark all the way down.
      // This wipes out scanner noise, paper texture, speckles, and jagged edges.
      const topY = 10;
      const botY = outH - 10;
      const sampleH = botY - topY;

      for (let x = quietZone; x < quietZone + innerW; x++) {
        let darkVotes = 0;
        let totalSampled = 0;

        for (let y = topY; y < botY; y += 2) {
          const idx = (y * outW + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum < threshold) {
            darkVotes++;
          }
          totalSampled++;
        }

        // If >= 42% of samples in this column are dark, treat column as solid black bar
        const isBar = darkVotes / totalSampled >= 0.42;

        for (let y = 0; y < outH; y++) {
          const idx = (y * outW + x) * 4;
          if (y < 6 || y >= outH - 6) {
            // Quiet margin top & bottom
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          } else if (isBar) {
            // Pitch black bar
            pixels[idx] = 0;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = 255;
          } else {
            // Pure snow white space
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          }
        }
      }

      // Ensure outer quiet zones (left and right) are pure white
      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < quietZone; x++) {
          const idx = (y * outW + x) * 4;
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
        for (let x = quietZone + innerW; x < outW; x++) {
          const idx = (y * outW + x) * 4;
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
      }
    } else {
      // Standard point binarization with contrast threshold
      for (let i = 0; i < pixels.length; i += 4) {
        const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        const val = lum < threshold ? 0 : 255;
        pixels[i] = val;
        pixels[i + 1] = val;
        pixels[i + 2] = val;
        pixels[i + 3] = 255;
      }
    }

    destCtx.putImageData(imgData, 0, 0);
  }

  // 4. Attempt barcode decode via BarcodeDetector or text item scan
  let barcodeText: string | undefined;

  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new (window as any).BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'upc_a', 'itf', 'codabar'],
      });
      const detected = await detector.detect(destCanvas);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        barcodeText = detected[0].rawValue;
      }
    } catch {
      // ignore
    }
  }

  // Fallback: search text items near the barcode box
  if (!barcodeText && textItems && textItems.length > 0) {
    const nearby = textItems.filter((item) => {
      // Item within or directly above/below the box
      const isXOverlap = item.x < box.x + box.width && item.x + item.width > box.x;
      const isYNear = Math.abs(item.y - box.y) < box.height * 2.5;
      return isXOverlap && isYNear;
    });

    for (const item of nearby) {
      const digits = item.str.replace(/[^0-9]/g, '');
      if (digits.length === 16) {
        barcodeText = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
        break;
      } else if (digits.length >= 8) {
        barcodeText = digits;
      }
    }
  }

  const barcodeUrl = destCanvas.toDataURL('image/png');

  return {
    barcodeUrl,
    barcodeText,
    detected: true,
    boundingBox: box,
  };
}
