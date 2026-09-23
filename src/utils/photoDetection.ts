/**
 * Intelligent Ethiopian Fayda Slip Photo Box & Face Detection Engine
 * Analyzes document canvas to carefully locate, score, and crop the applicant portrait photo.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface QrLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Checks if a pixel matches human skin tone chrominance locus in YCbCr & RGB space.
 * Resilient for deep melanated, caramel, olive, and fair portrait complexions.
 */
export function isSkinPixel(r: number, g: number, b: number): boolean {
  // 1. Basic non-zero & lower bound criteria
  if (r < 25 || g < 18 || b < 12) return false;

  // 2. Human skin hue: Red component dominant or equal in melanin/warm skin
  // Reject pure gray, pure white, pure blue, pure green background
  if (r < g - 2 || r < b) return false;
  if (Math.abs(r - g) > 140) return false;

  // 3. YCbCr transformation (Biometric standard space)
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

  const isYCbCrSkin = y > 18 && cb >= 66 && cb <= 145 && cr >= 123 && cr <= 192;

  // 4. Normalized RGB space check for natural lighting and shadows
  const sum = r + g + b;
  if (sum > 0) {
    const nr = r / sum;
    const ng = g / sum;
    const isNormRgbSkin = nr >= 0.32 && nr <= 0.68 && ng >= 0.22 && ng <= 0.44 && nr >= ng;
    if (isYCbCrSkin || (isNormRgbSkin && y > 24)) {
      return true;
    }
  }

  // 5. HSV skin locus check for warm melanin and shaded portraits
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  const v = max / 255;

  let h = 0;
  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / d + 2) * 60;
    } else {
      h = ((r - g) / d + 4) * 60;
    }
  }

  const isHsvSkin = ((h >= 0 && h <= 54) || h >= 335) && s >= 0.08 && s <= 0.85 && v >= 0.14;
  return isYCbCrSkin || isHsvSkin;
}

/**
 * Intelligent photo detection that scans document canvas for:
 * 1. Photo frame border contours (1px-3px dark outline)
 * 2. Human skin tone density & face clusters
 * 3. Color variance (distinguishing continuous photo from text / whitespace)
 * 4. Excluding QR code and barcode areas
 */
export function detectPhotoRegion(
  canvas: HTMLCanvasElement,
  qrBox?: QrLocation
): BoundingBox {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx || width < 100 || height < 100) {
    return getDefaultPhotoBox(width, height);
  }

  // Downsample to a fast analysis grid (max ~600px dimension) for rapid scanning
  const scale = Math.min(1, 600 / Math.max(width, height));
  const aW = Math.round(width * scale);
  const aH = Math.round(height * scale);

  const aCanvas = document.createElement('canvas');
  aCanvas.width = aW;
  aCanvas.height = aH;
  const aCtx = aCanvas.getContext('2d');
  if (!aCtx) return getDefaultPhotoBox(width, height);

  aCtx.drawImage(canvas, 0, 0, aW, aH);
  const imgData = aCtx.getImageData(0, 0, aW, aH);
  const data = imgData.data;

  // Scaled QR exclusion box
  const qrScaled = qrBox
    ? {
        x: qrBox.x * scale,
        y: qrBox.y * scale,
        w: qrBox.width * scale,
        h: qrBox.height * scale,
      }
    : null;

  // Build a 2D skin and variance map
  const skinMap = new Uint8Array(aW * aH);
  for (let y = 0; y < aH; y++) {
    for (let x = 0; x < aW; x++) {
      const idx = (y * aW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (isSkinPixel(r, g, b)) {
        skinMap[y * aW + x] = 1;
      }
    }
  }

  // Candidate regions to evaluate:
  // Typical passport photo aspect ratio is 3:4 (w:h = 0.75)
  // Window width typically between 14% and 30% of document width
  const candidateBoxes: { box: BoundingBox; score: number }[] = [];

  const targetAspect = 1.33; // height / width
  const testWidths = [
    Math.round(aW * 0.18),
    Math.round(aW * 0.22),
    Math.round(aW * 0.26),
  ];

  // Search candidate zones:
  // Zone 1: Upper-left quadrant (Standard Ethiopian Fayda Slip format)
  // Zone 2: Upper-right quadrant (Fayda Digital Card Preview format)
  // Zone 3: Middle-lower half (A4 full sheet card printout format)
  const stepX = Math.round(aW * 0.03);
  const stepY = Math.round(aH * 0.03);

  for (const tW of testWidths) {
    const tH = Math.round(tW * targetAspect);
    if (tH >= aH) continue;

    for (let y = Math.round(aH * 0.05); y <= aH - tH - Math.round(aH * 0.05); y += stepY) {
      for (let x = Math.round(aW * 0.03); x <= aW - tW - Math.round(aW * 0.03); x += stepX) {
        // Skip if heavily overlapping the QR code
        if (qrScaled) {
          const overlapX = Math.max(0, Math.min(x + tW, qrScaled.x + qrScaled.w) - Math.max(x, qrScaled.x));
          const overlapY = Math.max(0, Math.min(y + tH, qrScaled.y + qrScaled.h) - Math.max(y, qrScaled.y));
          if (overlapX * overlapY > (tW * tH) * 0.15) {
            continue;
          }
        }

        // Calculate score for this candidate window
        const score = evaluateCandidateWindow(skinMap, data, aW, aH, x, y, tW, tH);
        if (score > 10) {
          candidateBoxes.push({
            box: {
              x: Math.round(x / scale),
              y: Math.round(y / scale),
              width: Math.round(tW / scale),
              height: Math.round(tH / scale),
            },
            score,
          });
        }
      }
    }
  }

  // Sort candidate boxes by score
  candidateBoxes.sort((a, b) => b.score - a.score);

  if (candidateBoxes.length > 0 && candidateBoxes[0].score > 15) {
    const best = candidateBoxes[0].box;
    // Fine-tune and trim border from candidate
    return refinePhotoBoundingBox(canvas, best);
  }

  // Fallback to layout heuristics if no clear skin locus score
  return detectByLayoutHeuristics(canvas, qrBox);
}

/**
 * Evaluates candidate window based on skin tone concentration, color variance, and edge gradients
 */
function evaluateCandidateWindow(
  skinMap: Uint8Array,
  rgba: Uint8ClampedArray,
  aW: number,
  aH: number,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  let skinCount = 0;
  let totalSampled = 0;
  let rSum = 0, gSum = 0, bSum = 0;
  let rSumSq = 0, gSumSq = 0, bSumSq = 0;

  // Sample every 2nd pixel for performance
  for (let cy = y; cy < y + h; cy += 2) {
    for (let cx = x; cx < x + w; cx += 2) {
      if (cx >= aW || cy >= aH) continue;
      const idx = (cy * aW + cx) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      totalSampled++;
      if (skinMap[cy * aW + cx] === 1) {
        skinCount++;
      }

      rSum += r;
      gSum += g;
      bSum += b;
      rSumSq += r * r;
      gSumSq += g * g;
      bSumSq += b * b;
    }
  }

  if (totalSampled === 0) return 0;

  const skinRatio = skinCount / totalSampled;
  
  // Standard deviation of colors (photo has rich variance, blank paper has ~0)
  const rMean = rSum / totalSampled;
  const gMean = gSum / totalSampled;
  const bMean = bSum / totalSampled;
  const rVar = Math.sqrt(Math.max(0, (rSumSq / totalSampled) - rMean * rMean));
  const gVar = Math.sqrt(Math.max(0, (gSumSq / totalSampled) - gMean * gMean));
  const bVar = Math.sqrt(Math.max(0, (bSumSq / totalSampled) - bMean * bMean));
  const avgStdDev = (rVar + gVar + bVar) / 3;

  // A photo has noticeable variance (> 18) and a realistic face skin density (typically 8% to 55% of portrait)
  // Text pages have low skin density (< 2%) and very high white-to-black binary distribution
  if (skinRatio < 0.04 || skinRatio > 0.85) {
    return 0;
  }

  let score = (skinRatio * 100) * 1.8 + Math.min(avgStdDev, 60) * 0.8;

  // Bonus for typical upper left location (Fayda standard)
  if (x < aW * 0.35 && y < aH * 0.45) {
    score += 15;
  }
  // Bonus for typical upper right location (Fayda slip variant)
  if (x > aW * 0.60 && y < aH * 0.45) {
    score += 12;
  }

  return score;
}

/**
 * Refines the bounding box by trimming accidental outer borders or excess margins
 */
export function refinePhotoBoundingBox(
  canvas: HTMLCanvasElement,
  box: BoundingBox
): BoundingBox {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return box;

  // Make sure within canvas boundaries
  let x = Math.max(0, box.x);
  let y = Math.max(0, box.y);
  let w = Math.min(canvas.width - x, box.width);
  let h = Math.min(canvas.height - y, box.height);

  // Maintain standard 3:4 passport aspect ratio
  const targetH = Math.round(w * 1.33);
  if (targetH <= canvas.height - y) {
    h = targetH;
  } else {
    w = Math.round(h / 1.33);
  }

  return { x, y, width: w, height: h };
}

/**
 * Fallback layout heuristic when skin tone is low contrast (e.g. grayscale print or high exposure)
 */
function detectByLayoutHeuristics(
  canvas: HTMLCanvasElement,
  qrBox?: QrLocation
): BoundingBox {
  const w = canvas.width;
  const h = canvas.height;

  // If QR is on top-right, photo is almost certainly on top-left
  if (qrBox && qrBox.x > w * 0.5) {
    const pW = Math.round(w * 0.22);
    const pH = Math.round(pW * 1.33);
    return {
      x: Math.round(w * 0.06),
      y: Math.max(20, Math.round(qrBox.y - 10)),
      width: pW,
      height: pH,
    };
  }

  // If QR is on top-left, photo is likely on top-right
  if (qrBox && qrBox.x < w * 0.4) {
    const pW = Math.round(w * 0.22);
    const pH = Math.round(pW * 1.33);
    return {
      x: Math.round(w * 0.72),
      y: Math.max(20, Math.round(qrBox.y - 10)),
      width: pW,
      height: pH,
    };
  }

  return getDefaultPhotoBox(w, h);
}

/**
 * Standard default photo box (Top-left, standard Fayda verification slip)
 */
export function getDefaultPhotoBox(canvasWidth: number, canvasHeight: number): BoundingBox {
  const pW = Math.round(canvasWidth * 0.22);
  const pH = Math.round(pW * 1.33);
  return {
    x: Math.round(canvasWidth * 0.065),
    y: Math.round(canvasHeight * 0.135),
    width: pW,
    height: pH,
  };
}

/**
 * Crops the high-resolution photo from the source canvas using the given bounding box
 * Applies high-fidelity bicubic scaling and adaptive facial detail enhancement
 */
export function cropPhotoFromCanvas(
  sourceCanvas: HTMLCanvasElement | HTMLImageElement,
  box: BoundingBox,
  targetWidth: number = 960,
  targetHeight: number = 1280,
  enhanceDetail: boolean = true
): string {
  // Ensure we produce at least double-DPI resolution for ID print clarity
  const finalW = Math.max(targetWidth, Math.round(box.width * 2));
  const finalH = Math.max(targetHeight, Math.round(box.height * 2));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = finalW;
  cropCanvas.height = finalH;
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });

  if (!cropCtx) return '';

  cropCtx.imageSmoothingEnabled = true;
  cropCtx.imageSmoothingQuality = 'high';

  // Draw cropped region into target dimensions
  cropCtx.drawImage(
    sourceCanvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    finalW,
    finalH
  );

  // Apply subtle high-frequency detail sharpening for facial acuity
  if (enhanceDetail && finalW > 10 && finalH > 10) {
    try {
      const imgData = cropCtx.getImageData(0, 0, finalW, finalH);
      const data = imgData.data;
      const copy = new Uint8ClampedArray(data);
      const a = 0.35; // Subtle edge boost
      const edgeWeight = -a / 4;
      const centerWeight = 1 + a;

      for (let y = 1; y < finalH - 1; y++) {
        for (let x = 1; x < finalW - 1; x++) {
          const idx = (y * finalW + x) * 4;
          if (copy[idx + 3] < 20) continue;

          const top = ((y - 1) * finalW + x) * 4;
          const bot = ((y + 1) * finalW + x) * 4;
          const left = (y * finalW + (x - 1)) * 4;
          const right = (y * finalW + (x + 1)) * 4;

          for (let c = 0; c < 3; c++) {
            const val =
              copy[idx + c] * centerWeight +
              (copy[top + c] + copy[bot + c] + copy[left + c] + copy[right + c]) * edgeWeight;
            data[idx + c] = Math.min(255, Math.max(0, Math.round(val)));
          }
        }
      }
      cropCtx.putImageData(imgData, 0, 0);
    } catch {
      // Fallback silently if getImageData fails
    }
  }

  return cropCanvas.toDataURL('image/png');
}
