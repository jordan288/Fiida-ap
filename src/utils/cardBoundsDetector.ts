/**
 * Utility: Color Detection ID Card Bounds Auto-Detector & Cropper
 * 
 * Uses basic color detection, perimeter paper background modeling,
 * Euclidean RGB color distance, chromatic variance, and projection histograms
 * to automatically find the ID card bounds within a scanned PDF page.
 */

export interface CardBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardBoundsDetectionOptions {
  /** Color Euclidean distance threshold to distinguish card content from paper background (default: 24) */
  colorThreshold?: number;
  /** Luminance difference threshold between background and card (default: 20) */
  luminanceThreshold?: number;
  /** Minimum density of card pixels required to count a row/column as part of the card (default: 0.04 = 4%) */
  densityThreshold?: number;
  /** Desired aspect ratio mode: 'cr80' (1.586 ID card), 'portrait' (0.63), 'free' (tightest box), or 'auto' */
  aspectRatioMode?: 'cr80' | 'portrait' | 'free' | 'auto';
  /** Optional padding in pixels to add around detected bounds (default: 0) */
  paddingPx?: number;
  /** Maximum analysis dimension to keep processing fast (default: 1000) */
  maxAnalysisDimension?: number;
  /** Expected search area hint (0-1 relative to page) */
  searchZone?: { minX?: number; maxX?: number; minY?: number; maxY?: number };
}

export interface CardBoundsDetectionResult {
  boundingBox: CardBoundingBox;
  confidence: number; // 0 - 100
  aspectRatio: number; // width / height
  paperColor: { r: number; g: number; b: number; luminance: number; isDarkBackground: boolean };
  cardAvgColor: { r: number; g: number; b: number };
  isLandscape: boolean;
  isCr80Compliant: boolean;
  method: 'color-detection' | 'density-projection' | 'fallback';
  summary: string;
}

/**
 * Samples the outer perimeter border strips of the scanned page
 * to determine the background paper / scanner bed baseline color.
 */
export function samplePageBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { r: number; g: number; b: number; luminance: number; isDarkBackground: boolean } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  // Margin strip thickness: 3% of width/height (at least 3px, max 30px)
  const marginX = Math.max(3, Math.min(30, Math.floor(width * 0.03)));
  const marginY = Math.max(3, Math.min(30, Math.floor(height * 0.03)));

  // Sample top strip
  for (let y = 0; y < marginY; y += 2) {
    for (let x = 0; x < width; x += 3) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 50) continue; // Skip transparent pixels
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }

  // Sample bottom strip
  for (let y = height - marginY; y < height; y += 2) {
    for (let x = 0; x < width; x += 3) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 50) continue;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }

  // Sample left strip
  for (let y = marginY; y < height - marginY; y += 3) {
    for (let x = 0; x < marginX; x += 2) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 50) continue;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }

  // Sample right strip
  for (let y = marginY; y < height - marginY; y += 3) {
    for (let x = width - marginX; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 50) continue;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }

  if (count === 0) {
    return { r: 250, g: 250, b: 250, luminance: 250, isDarkBackground: false };
  }

  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const isDarkBackground = luminance < 90;

  return { r, g, b, luminance, isDarkBackground };
}

/**
 * Calculates color Euclidean distance between two RGB colors
 */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Calculates HSL Saturation of an RGB color (0 to 1)
 */
function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const lum = (max + min) / 2;
  return lum > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/**
 * Automatically detects the ID card bounding box within a scanned PDF page
 * using basic color detection, paper background sampling, and projection profiles.
 */
export function detectCardBoundsOnCanvas(
  sourceCanvas: HTMLCanvasElement,
  options: CardBoundsDetectionOptions = {}
): CardBoundsDetectionResult {
  const origW = sourceCanvas.width;
  const origH = sourceCanvas.height;

  const colorThresh = options.colorThreshold ?? 24;
  const lumThresh = options.luminanceThreshold ?? 20;
  const densityThresh = options.densityThreshold ?? 0.04;
  const maxDim = options.maxAnalysisDimension ?? 900;
  const paddingPx = options.paddingPx ?? 0;
  const aspectMode = options.aspectRatioMode ?? 'auto';

  // Fast-path for extremely small or invalid canvases
  if (origW < 100 || origH < 100) {
    const fallbackBox = { x: 0, y: 0, width: origW, height: origH };
    return {
      boundingBox: fallbackBox,
      confidence: 30,
      aspectRatio: origW / origH,
      paperColor: { r: 250, g: 250, b: 250, luminance: 250, isDarkBackground: false },
      cardAvgColor: { r: 220, g: 220, b: 220 },
      isLandscape: origW >= origH,
      isCr80Compliant: false,
      method: 'fallback',
      summary: 'Canvas too small for color detection. Using full canvas.',
    };
  }

  // 1. Create a scaled-down working canvas for rapid color analysis
  const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
  const aW = Math.round(origW * scale);
  const aH = Math.round(origH * scale);

  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = aW;
  analysisCanvas.height = aH;
  const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    const fallbackBox = { x: 0, y: 0, width: origW, height: origH };
    return {
      boundingBox: fallbackBox,
      confidence: 20,
      aspectRatio: origW / origH,
      paperColor: { r: 250, g: 250, b: 250, luminance: 250, isDarkBackground: false },
      cardAvgColor: { r: 220, g: 220, b: 220 },
      isLandscape: origW >= origH,
      isCr80Compliant: false,
      method: 'fallback',
      summary: 'Could not create canvas 2D context.',
    };
  }

  ctx.drawImage(sourceCanvas, 0, 0, aW, aH);
  const imgData = ctx.getImageData(0, 0, aW, aH);
  const data = imgData.data;

  // 2. Sample background paper color from outer edges
  const paper = samplePageBackground(data, aW, aH);
  const paperSat = getSaturation(paper.r, paper.g, paper.b);

  // 3. Classify pixels: determine if each pixel belongs to card content vs background paper
  // Binary map: 1 = card pixel, 0 = background paper pixel
  const binaryMap = new Uint8Array(aW * aH);

  let cardRSum = 0;
  let cardGSum = 0;
  let cardBSum = 0;
  let cardPixelCount = 0;

  for (let y = 0; y < aH; y++) {
    for (let x = 0; x < aW; x++) {
      const idx = (y * aW + x) * 4;
      const alpha = data[idx + 3];

      // Transparent pixel is treated as background
      if (alpha < 60) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const dist = colorDistance(r, g, b, paper.r, paper.g, paper.b);
      const lumDiff = Math.abs(lum - paper.luminance);
      const sat = getSaturation(r, g, b);
      const satDiff = Math.abs(sat - paperSat);

      // Basic color detection condition:
      // A pixel is "card content" if its color distance from paper exceeds the threshold,
      // or its luminance differs significantly from paper, or it has distinct chromatic saturation.
      const isContent =
        dist > colorThresh ||
        lumDiff > lumThresh ||
        (satDiff > 0.12 && dist > 14);

      if (isContent) {
        binaryMap[y * aW + x] = 1;
        cardRSum += r;
        cardGSum += g;
        cardBSum += b;
        cardPixelCount++;
      }
    }
  }

  const cardAvgColor = cardPixelCount > 0
    ? {
        r: Math.round(cardRSum / cardPixelCount),
        g: Math.round(cardGSum / cardPixelCount),
        b: Math.round(cardBSum / cardPixelCount),
      }
    : { r: 180, g: 180, b: 180 };

  // 4. Compute horizontal (Y-axis) and vertical (X-axis) density projections
  const rowDensities = new Float32Array(aH);
  const colDensities = new Float32Array(aW);

  for (let y = 0; y < aH; y++) {
    let rowCardCount = 0;
    const yOffset = y * aW;
    for (let x = 0; x < aW; x++) {
      if (binaryMap[yOffset + x] === 1) {
        rowCardCount++;
      }
    }
    rowDensities[y] = rowCardCount / aW;
  }

  for (let x = 0; x < aW; x++) {
    let colCardCount = 0;
    for (let y = 0; y < aH; y++) {
      if (binaryMap[y * aW + x] === 1) {
        colCardCount++;
      }
    }
    colDensities[x] = colCardCount / aH;
  }

  // 5. Inward scanning to locate card boundaries where content density rises above threshold
  // Scan from top
  let topA = 0;
  for (let y = 0; y < Math.floor(aH * 0.7); y++) {
    if (rowDensities[y] >= densityThresh) {
      // Check if subsequent 4 rows also hold content to filter single stray noise lines
      let consecutive = 0;
      for (let k = 0; k < 4 && y + k < aH; k++) {
        if (rowDensities[y + k] >= densityThresh * 0.7) consecutive++;
      }
      if (consecutive >= 3) {
        topA = Math.max(0, y - 1);
        break;
      }
    }
  }

  // Scan from bottom
  let bottomA = aH - 1;
  for (let y = aH - 1; y >= Math.floor(aH * 0.3); y--) {
    if (rowDensities[y] >= densityThresh) {
      let consecutive = 0;
      for (let k = 0; k < 4 && y - k >= 0; k++) {
        if (rowDensities[y - k] >= densityThresh * 0.7) consecutive++;
      }
      if (consecutive >= 3) {
        bottomA = Math.min(aH - 1, y + 1);
        break;
      }
    }
  }

  // Scan from left
  let leftA = 0;
  for (let x = 0; x < Math.floor(aW * 0.7); x++) {
    if (colDensities[x] >= densityThresh) {
      let consecutive = 0;
      for (let k = 0; k < 4 && x + k < aW; k++) {
        if (colDensities[x + k] >= densityThresh * 0.7) consecutive++;
      }
      if (consecutive >= 3) {
        leftA = Math.max(0, x - 1);
        break;
      }
    }
  }

  // Scan from right
  let rightA = aW - 1;
  for (let x = aW - 1; x >= Math.floor(aW * 0.3); x--) {
    if (colDensities[x] >= densityThresh) {
      let consecutive = 0;
      for (let k = 0; k < 4 && x - k >= 0; k++) {
        if (colDensities[x - k] >= densityThresh * 0.7) consecutive++;
      }
      if (consecutive >= 3) {
        rightA = Math.min(aW - 1, x + 1);
        break;
      }
    }
  }

  // Validate detected bounds
  let cardW_A = Math.max(20, rightA - leftA);
  let cardH_A = Math.max(20, bottomA - topA);

  // If detected area is practically empty (< 5% of page) or fills 99% with no margins,
  // apply sensible center fallback
  let method: 'color-detection' | 'density-projection' | 'fallback' = 'color-detection';
  let confidence = 85;

  if (cardW_A < aW * 0.15 || cardH_A < aH * 0.15) {
    method = 'fallback';
    confidence = 45;
    leftA = Math.round(aW * 0.05);
    rightA = Math.round(aW * 0.95);
    topA = Math.round(aH * 0.08);
    bottomA = Math.round(aH * 0.92);
    cardW_A = rightA - leftA;
    cardH_A = bottomA - topA;
  }

  // Convert analysis coordinates back to original canvas scale
  const invScale = 1.0 / scale;
  let rawX = Math.round(leftA * invScale);
  let rawY = Math.round(topA * invScale);
  let rawW = Math.round(cardW_A * invScale);
  let rawH = Math.round(cardH_A * invScale);

  // Add optional user padding
  if (paddingPx !== 0) {
    rawX = Math.max(0, rawX - paddingPx);
    rawY = Math.max(0, rawY - paddingPx);
    rawW = Math.min(origW - rawX, rawW + paddingPx * 2);
    rawH = Math.min(origH - rawY, rawH + paddingPx * 2);
  }

  // Ensure bounds stay strictly inside canvas
  rawX = Math.max(0, Math.min(origW - 20, rawX));
  rawY = Math.max(0, Math.min(origH - 20, rawY));
  rawW = Math.min(origW - rawX, Math.max(20, rawW));
  rawH = Math.min(origH - rawY, Math.max(20, rawH));

  const currentAspect = rawW / rawH;
  const isLandscape = currentAspect >= 1.0;

  // Standard CR80 ID-1 card aspect ratio: 85.6mm / 53.98mm = 1.58577
  const CR80_ASPECT = 1.58577;
  const isCr80 = isLandscape
    ? Math.abs(currentAspect - CR80_ASPECT) < 0.25
    : Math.abs(currentAspect - (1 / CR80_ASPECT)) < 0.25;

  let finalBox: CardBoundingBox = { x: rawX, y: rawY, width: rawW, height: rawH };

  // Snap to CR80 aspect ratio if requested
  if (aspectMode === 'cr80' || (aspectMode === 'auto' && isCr80)) {
    if (isLandscape) {
      const targetH = Math.round(rawW / CR80_ASPECT);
      if (targetH <= origH) {
        const diffH = targetH - rawH;
        finalBox.y = Math.max(0, Math.min(origH - targetH, Math.round(rawY - diffH / 2)));
        finalBox.height = targetH;
      }
    } else {
      const targetW = Math.round(rawH * (1 / CR80_ASPECT));
      if (targetW <= origW) {
        const diffW = targetW - rawW;
        finalBox.x = Math.max(0, Math.min(origW - targetW, Math.round(rawX - diffW / 2)));
        finalBox.width = targetW;
      }
    }
  } else if (aspectMode === 'portrait') {
    const targetW = Math.round(rawH * (1 / CR80_ASPECT));
    if (targetW <= origW) {
      finalBox.width = targetW;
    }
  }

  // Calculate final confidence score
  const coverageRatio = (finalBox.width * finalBox.height) / (origW * origH);
  if (coverageRatio >= 0.2 && coverageRatio <= 0.95 && isCr80) {
    confidence = Math.min(98, confidence + 12);
  }

  const summary = `Detected ID card bounds at (${finalBox.x}, ${finalBox.y}) [${finalBox.width}×${finalBox.height}px] • Aspect: ${(finalBox.width / finalBox.height).toFixed(2)} (${isCr80 ? 'CR80 standard' : 'Custom'})`;

  return {
    boundingBox: finalBox,
    confidence,
    aspectRatio: finalBox.width / finalBox.height,
    paperColor: paper,
    cardAvgColor,
    isLandscape,
    isCr80Compliant: isCr80,
    method,
    summary,
  };
}

/**
 * Loads an image/canvas source and extracts the detected card bounds into a high-quality cropped canvas.
 */
export async function cropCardFromSource(
  source: string | HTMLCanvasElement,
  bounds: CardBoundingBox,
  targetWidth?: number,
  targetHeight?: number
): Promise<{ croppedCanvas: HTMLCanvasElement; dataUrl: string }> {
  let srcCanvas: HTMLCanvasElement;

  if (source instanceof HTMLCanvasElement) {
    srcCanvas = source;
  } else {
    srcCanvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = reject;
      img.src = source;
    });
  }

  const sx = Math.max(0, Math.min(srcCanvas.width - 10, Math.round(bounds.x)));
  const sy = Math.max(0, Math.min(srcCanvas.height - 10, Math.round(bounds.y)));
  const sw = Math.min(srcCanvas.width - sx, Math.max(10, Math.round(bounds.width)));
  const sh = Math.min(srcCanvas.height - sy, Math.max(10, Math.round(bounds.height)));

  const outW = targetWidth || sw;
  const outH = targetHeight || sh;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });

  if (!destCtx) {
    throw new Error('Could not create destination canvas context for card auto-crop');
  }

  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, outW, outH);
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  // Export as lossless PNG or high-quality JPEG
  const dataUrl = destCanvas.toDataURL('image/jpeg', 0.95);
  return { croppedCanvas: destCanvas, dataUrl };
}
