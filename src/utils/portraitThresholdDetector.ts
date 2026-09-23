/**
 * Automated Image Processing Utility: Color Thresholding ID Portrait Auto-Cropper
 * Uses basic color thresholding, paper background luminance modeling, and projection histograms
 * to detect, isolate, and auto-crop the ID portrait area from document slips.
 * Standardizes aspect ratio (3:4 ID biometric) and produces clean, consistent input
 * for the background removal engine.
 */

import { isSkinPixel, BoundingBox } from './photoDetection';
import { autoRemovePhotoBackground } from './imageProcessor';

export interface ThresholdCropOptions {
  /** Luminance threshold above which pixels are considered document paper (0-255, default 228) */
  paperLuminanceThreshold?: number;
  /** Color saturation threshold for detecting chromatic content (0-1, default 0.08) */
  saturationThreshold?: number;
  /** Minimum color Euclidean distance from sampled paper background (default 26) */
  colorDistanceThreshold?: number;
  /** Target aspect ratio (height / width), default 1.3333 (standard 3:4 passport portrait) */
  targetAspect?: number;
  /** Output width in pixels (default 960 for Ultra-HD) */
  targetWidth?: number;
  /** Output height in pixels (default 1280 for Ultra-HD) */
  targetHeight?: number;
  /** Optional rough search zone hint */
  searchZone?: BoundingBox;
  /** Whether to automatically run the transparent background removal engine (default true) */
  applyBackgroundRemoval?: boolean;
  /** Whether to automatically run the intelligent photo detail enhancer & upscaler (default true) */
  autoEnhance?: boolean;
}

export interface ThresholdDetectionResult {
  boundingBox: BoundingBox;
  confidence: number;
  aspectRatio: number;
  method: 'color-threshold' | 'contour-boundary' | 'heuristic-fallback';
  paperLuminance: number;
  contrastRatio: number;
}

export interface AutoCropPortraitResult {
  /** Cleanly cropped ID portrait without outer slip paper/margins (JPEG) */
  rawCroppedUrl: string;
  /** Transparent PNG with background cleanly cut out by the background removal engine */
  transparentPhotoUrl?: string;
  /** Precise bounding box detected on the source canvas/slip */
  boundingBox: BoundingBox;
  /** Detection confidence score (0 - 100) */
  confidence: number;
  /** Detection method utilized */
  method: 'color-threshold' | 'contour-boundary' | 'heuristic-fallback';
}

/**
 * Samples perimeter regions of the document to establish the baseline paper background color.
 */
function samplePaperBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { r: number; g: number; b: number; luminance: number } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  // Sample top margin strip (y from 1% to 4%)
  const topYEnd = Math.max(2, Math.floor(height * 0.04));
  for (let y = Math.floor(height * 0.01); y < topYEnd; y += 2) {
    for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.95); x += 4) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Exclude dark text or colored banners
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 190) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }
  }

  // Sample left margin strip (x from 1% to 4%)
  const leftXEnd = Math.max(2, Math.floor(width * 0.04));
  for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.5); y += 4) {
    for (let x = Math.floor(width * 0.01); x < leftXEnd; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 190) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }
  }

  if (count > 0) {
    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return { r, g, b, luminance };
  }

  // Default white paper
  return { r: 250, g: 250, b: 250, luminance: 250 };
}

/**
 * Basic Color Thresholding Engine:
 * Locates the exact ID portrait bounding box by classifying pixels against document paper
 * threshold, analyzing chromatic variance, and using projection histograms.
 */
export function detectPortraitByColorThresholding(
  canvas: HTMLCanvasElement,
  options: ThresholdCropOptions = {}
): ThresholdDetectionResult {
  const origW = canvas.width;
  const origH = canvas.height;
  const targetAspect = options.targetAspect || 1.3333; // 4:3 (Height / Width)

  if (origW < 80 || origH < 80) {
    const fallbackBox = {
      x: Math.round(origW * 0.06),
      y: Math.round(origH * 0.14),
      width: Math.round(origW * 0.22),
      height: Math.round(origW * 0.22 * targetAspect),
    };
    return {
      boundingBox: fallbackBox,
      confidence: 40,
      aspectRatio: targetAspect,
      method: 'heuristic-fallback',
      paperLuminance: 250,
      contrastRatio: 1.0,
    };
  }

  // 1. Create a fast analysis canvas (scaled down to max ~700px dimension for rapid execution)
  const scale = Math.min(1, 700 / Math.max(origW, origH));
  const aW = Math.round(origW * scale);
  const aH = Math.round(origH * scale);

  const aCanvas = document.createElement('canvas');
  aCanvas.width = aW;
  aCanvas.height = aH;
  const aCtx = aCanvas.getContext('2d', { willReadFrequently: true });

  if (!aCtx) {
    const fallbackBox = {
      x: Math.round(origW * 0.065),
      y: Math.round(origH * 0.135),
      width: Math.round(origW * 0.22),
      height: Math.round(origW * 0.22 * targetAspect),
    };
    return {
      boundingBox: fallbackBox,
      confidence: 45,
      aspectRatio: targetAspect,
      method: 'heuristic-fallback',
      paperLuminance: 250,
      contrastRatio: 1.0,
    };
  }

  aCtx.drawImage(canvas, 0, 0, aW, aH);
  const imgData = aCtx.getImageData(0, 0, aW, aH);
  const data = imgData.data;

  // 2. Establish paper background baseline
  const paper = samplePaperBackground(data, aW, aH);
  const lumThreshold = options.paperLuminanceThreshold ?? Math.min(235, Math.max(185, paper.luminance - 20));
  const satThreshold = options.saturationThreshold ?? 0.08;
  const distThreshold = options.colorDistanceThreshold ?? 26;

  // 3. Define candidate search window on the slip:
  // On Ethiopian Fayda slips & ID records, portrait is located in the upper half of the document.
  let startX = Math.round(aW * 0.02);
  let endX = Math.round(aW * 0.52);
  let startY = Math.round(aH * 0.06);
  let endY = Math.round(aH * 0.56);

  if (options.searchZone) {
    // If a search zone hint is provided, expand with 15% margin
    const sz = options.searchZone;
    const marginX = Math.round(sz.width * scale * 0.15);
    const marginY = Math.round(sz.height * scale * 0.15);
    startX = Math.max(0, Math.round(sz.x * scale) - marginX);
    endX = Math.min(aW, Math.round((sz.x + sz.width) * scale) + marginX);
    startY = Math.max(0, Math.round(sz.y * scale) - marginY);
    endY = Math.min(aH, Math.round((sz.y + sz.height) * scale) + marginY);
  }

  const zoneW = endX - startX;
  const zoneH = endY - startY;
  if (zoneW < 30 || zoneH < 40) {
    startX = Math.round(aW * 0.02);
    endX = Math.round(aW * 0.52);
    startY = Math.round(aH * 0.06);
    endY = Math.round(aH * 0.56);
  }

  // 4. Binary Color Thresholding Mask
  // A pixel is marked as 1 (photo content) if it significantly deviates from the paper background
  // via luminance drop, color distance, skin locus, or saturation.
  const mask = new Uint8Array(aW * aH);
  let skinPixelCount = 0;
  let nonPaperPixelCount = 0;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * aW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

      // Color distance from paper
      const dr = r - paper.r;
      const dg = g - paper.g;
      const db = b - paper.b;
      const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

      const isSkin = isSkinPixel(r, g, b);
      if (isSkin) skinPixelCount++;

      // Basic color thresholding rule:
      const isNotPaper =
        lum < lumThreshold ||
        (sat > satThreshold && colorDist > 18) ||
        colorDist > distThreshold ||
        isSkin;

      if (isNotPaper) {
        mask[y * aW + x] = 1;
        nonPaperPixelCount++;
      }
    }
  }

  // 5. 1D Horizontal & Vertical Projection Histograms
  // rowDensity[y] counts foreground pixels on row y
  // colDensity[x] counts foreground pixels on column x
  const rowDensity = new Int32Array(aH);
  const colDensity = new Int32Array(aW);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (mask[y * aW + x] === 1) {
        rowDensity[y]++;
        colDensity[x]++;
      }
    }
  }

  // 6. Find dense contiguous spans in X and Y
  // Minimum width: ~12% of document width, Maximum width: ~38%
  const minPhotoW = Math.max(25, Math.round(aW * 0.12));
  const maxPhotoW = Math.round(aW * 0.38);
  const minPhotoH = Math.max(35, Math.round(minPhotoW * 1.1));
  const maxPhotoH = Math.round(maxPhotoW * 1.6);

  // Column threshold: at least 15% of candidate column is occupied by photo
  const colThreshold = Math.max(6, Math.round((endY - startY) * 0.14));
  let bestXSpan = { start: startX, end: startX + minPhotoW, density: 0 };
  let currentXStart = -1;
  let currentXDensity = 0;

  for (let x = startX; x < endX; x++) {
    if (colDensity[x] >= colThreshold) {
      if (currentXStart === -1) {
        currentXStart = x;
        currentXDensity = 0;
      }
      currentXDensity += colDensity[x];
    } else {
      if (currentXStart !== -1) {
        const spanW = x - currentXStart;
        if (spanW >= minPhotoW && spanW <= maxPhotoW) {
          if (currentXDensity > bestXSpan.density) {
            bestXSpan = { start: currentXStart, end: x, density: currentXDensity };
          }
        }
        currentXStart = -1;
      }
    }
  }
  if (currentXStart !== -1) {
    const spanW = endX - currentXStart;
    if (spanW >= minPhotoW && spanW <= maxPhotoW && currentXDensity > bestXSpan.density) {
      bestXSpan = { start: currentXStart, end: endX, density: currentXDensity };
    }
  }

  // Row threshold within the detected X span
  // Recompute row density strictly within bestXSpan
  const refinedRowDensity = new Int32Array(aH);
  for (let y = startY; y < endY; y++) {
    for (let x = bestXSpan.start; x < bestXSpan.end; x++) {
      if (mask[y * aW + x] === 1) {
        refinedRowDensity[y]++;
      }
    }
  }

  const selectedW = bestXSpan.end - bestXSpan.start;
  const rowThreshold = Math.max(5, Math.round(selectedW * 0.20));
  let bestYSpan = { start: startY, end: startY + Math.round(selectedW * targetAspect), density: 0 };
  let currentYStart = -1;
  let currentYDensity = 0;

  for (let y = startY; y < endY; y++) {
    if (refinedRowDensity[y] >= rowThreshold) {
      if (currentYStart === -1) {
        currentYStart = y;
        currentYDensity = 0;
      }
      currentYDensity += refinedRowDensity[y];
    } else {
      if (currentYStart !== -1) {
        const spanH = y - currentYStart;
        if (spanH >= minPhotoH && spanH <= maxPhotoH) {
          if (currentYDensity > bestYSpan.density) {
            bestYSpan = { start: currentYStart, end: y, density: currentYDensity };
          }
        }
        currentYStart = -1;
      }
    }
  }
  if (currentYStart !== -1) {
    const spanH = endY - currentYStart;
    if (spanH >= minPhotoH && spanH <= maxPhotoH && currentYDensity > bestYSpan.density) {
      bestYSpan = { start: currentYStart, end: endY, density: currentYDensity };
    }
  }

  // 7. Refine bounds and enforce 3:4 ID Biometric Aspect Ratio
  let detX = bestXSpan.start;
  let detW = bestXSpan.end - bestXSpan.start;
  let detY = bestYSpan.start;
  let detH = bestYSpan.end - bestYSpan.start;

  // Fallback if projection didn't find clear bounds
  if (detW < minPhotoW || detH < minPhotoH) {
    detW = Math.round(aW * 0.22);
    detH = Math.round(detW * targetAspect);
    detX = Math.round(aW * 0.055);
    detY = Math.round(aH * 0.145);
  }

  // Standardize aspect ratio to 3:4 (targetAspect = 1.333)
  const currentRatio = detH / detW;
  if (Math.abs(currentRatio - targetAspect) > 0.05) {
    // If too wide, adjust height while keeping vertical position centered
    if (currentRatio < targetAspect) {
      const idealH = Math.round(detW * targetAspect);
      const diffH = idealH - detH;
      detY = Math.max(0, detY - Math.round(diffH * 0.3));
      detH = idealH;
    } else {
      // If too tall, expand width symmetrically
      const idealW = Math.round(detH / targetAspect);
      const diffW = idealW - detW;
      detX = Math.max(0, detX - Math.round(diffW * 0.5));
      detW = idealW;
    }
  }

  // Boundary clamp on analysis canvas
  detX = Math.max(0, Math.min(aW - detW, detX));
  detY = Math.max(0, Math.min(aH - detH, detY));

  // 8. Map coordinates back to full original canvas resolution
  const finalX = Math.round(detX / scale);
  const finalY = Math.round(detY / scale);
  const finalW = Math.round(detW / scale);
  const finalH = Math.round(detH / scale);

  const confidence = Math.min(
    98,
    Math.round(
      50 +
        (skinPixelCount > 30 ? 25 : 0) +
        (bestXSpan.density > 0 && bestYSpan.density > 0 ? 20 : 0)
    )
  );

  return {
    boundingBox: {
      x: finalX,
      y: finalY,
      width: Math.min(origW - finalX, finalW),
      height: Math.min(origH - finalY, finalH),
    },
    confidence,
    aspectRatio: finalH / finalW,
    method: 'color-threshold',
    paperLuminance: Math.round(paper.luminance),
    contrastRatio: Number((paper.luminance / Math.max(1, lumThreshold)).toFixed(2)),
  };
}

/**
 * Auto-crops the ID portrait from a source canvas using color thresholding,
 * normalizes resolution to 480x640, and pipes the result into the background removal engine.
 */
export async function autoCropPortraitFromCanvas(
  canvas: HTMLCanvasElement,
  options: ThresholdCropOptions = {}
): Promise<AutoCropPortraitResult> {
  const targetW = options.targetWidth || 1200;
  const targetH = options.targetHeight || 1600;

  // 1. Detect ID portrait area via color thresholding
  const detection = detectPortraitByColorThresholding(canvas, options);
  const box = detection.boundingBox;

  // 2. High-resolution crop canvas with smooth scaling
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = targetW;
  cropCanvas.height = targetH;
  const cropCtx = cropCanvas.getContext('2d');

  if (!cropCtx) {
    throw new Error('Could not create offscreen canvas context for portrait auto-crop');
  }

  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = 'high';

  cropCtx.drawImage(
    canvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    targetW,
    targetH
  );

  let rawCroppedUrl = cropCanvas.toDataURL('image/png');

  // 3. Pipe consistent cropped portrait into the background removal engine
  let transparentPhotoUrl: string | undefined;
  if (options.applyBackgroundRemoval !== false) {
    try {
      const cutout = await autoRemovePhotoBackground(rawCroppedUrl);
      transparentPhotoUrl = cutout || rawCroppedUrl;
    } catch (err) {
      console.warn('Background removal following threshold auto-crop failed:', err);
      transparentPhotoUrl = rawCroppedUrl;
    }
  }

  // Return cropped portrait and transparent cutout cleanly without delay-inducing upscaler
  return {
    rawCroppedUrl,
    transparentPhotoUrl,
    boundingBox: box,
    confidence: detection.confidence,
    method: detection.method,
  };
}

/**
 * Loads an image from a URL or Data URL, renders onto an offscreen canvas,
 * and executes automated color thresholding ID portrait auto-crop.
 */
export async function autoCropPortraitFromImageOrUrl(
  source: string | HTMLCanvasElement,
  options: ThresholdCropOptions = {}
): Promise<AutoCropPortraitResult> {
  if (typeof source !== 'string') {
    return autoCropPortraitFromCanvas(source, options);
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error('Failed to load image source for portrait auto-crop: ' + String(e)));
    img.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context initialization failed for image auto-crop');
  }

  ctx.drawImage(img, 0, 0);
  return autoCropPortraitFromCanvas(canvas, options);
}
