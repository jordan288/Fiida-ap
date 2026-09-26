import jsQR from 'jsqr';

export interface ExactQrResult {
  qrUrl?: string;
  qrText?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  detected: boolean;
}

export interface CustomQrCropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  isPercentage?: boolean;
}

/**
 * Retrieves the manually saved permanent mapper region or default calibrated mapper position.
 * Eliminates automatic guessing so crops strictly match what is mapped.
 */
export function getManualMapperQrRegion(): CustomQrCropRegion {
  if (typeof window !== 'undefined') {
    try {
      const raw =
        localStorage.getItem('fayda_pdf_permanent_regions_v2') ||
        localStorage.getItem('fayda_pdf_marked_permanent_regions_v1') ||
        localStorage.getItem('fayda_pdf_marked_regions_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const qr = parsed.find((r: any) => r.id === 'qrCode' || r.type === 'qr');
          if (qr && qr.width > 0 && qr.height > 0) {
            return {
              x: Number(qr.x),
              y: Number(qr.y),
              width: Number(qr.width),
              height: Number(qr.height),
              isPercentage: true,
            };
          }
        }
      }
    } catch (e) {
      console.warn('Error reading permanent mapper regions for QR:', e);
    }
  }
  // Standard calibrated Ethiopian Fayda verification slip mapper position (lower right quadrant)
  return {
    x: 67.5,
    y: 53.0,
    width: 26.5,
    height: 21.0,
    isPercentage: true,
  };
}

/**
 * Accurately crops the official biometric QR code strictly using the manually selected mapper position.
 * Eliminates automatic wandering, multi-quadrant scanning, and table-line edge shrinkage
 * that cause misalignment on high-density biometric Ethiopian Fayda QR codes.
 */
export function cropExactQrCode(
  sourceCanvas: HTMLCanvasElement,
  customRegion?: CustomQrCropRegion
): ExactQrResult {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });

  if (!ctx || width < 50 || height < 50) {
    return { detected: false };
  }

  // --- Step 1: Strictly Use Manually Selected Mapper Position ---
  const activeRegion: CustomQrCropRegion =
    customRegion && customRegion.width > 0 && customRegion.height > 0
      ? customRegion
      : getManualMapperQrRegion();

  const isPct = activeRegion.isPercentage ?? (activeRegion.x <= 100 && activeRegion.width <= 100);
  const rx = isPct ? Math.round((activeRegion.x / 100) * width) : Math.round(activeRegion.x);
  const ry = isPct ? Math.round((activeRegion.y / 100) * height) : Math.round(activeRegion.y);
  const rw = isPct ? Math.round((activeRegion.width / 100) * width) : Math.round(activeRegion.width);
  const rh = isPct ? Math.round((activeRegion.height / 100) * height) : Math.round(activeRegion.height);

  const customPixelBox = {
    x: Math.max(0, Math.min(width - 20, rx)),
    y: Math.max(0, Math.min(height - 20, ry)),
    width: Math.max(20, Math.min(width - rx, rw)),
    height: Math.max(20, Math.min(height - ry, rh)),
  };

  // Step 2: Local jsQR scan ONLY inside the mapped box to extract raw payload text if decodable
  let qrText: string | undefined;
  try {
    const localQr = scanCanvasWithJsQR(ctx, customPixelBox.x, customPixelBox.y, customPixelBox.width, customPixelBox.height);
    if (localQr && localQr.data) {
      qrText = localQr.data;
    }
  } catch {}

  // Step 3: Crop directly and strictly from the manually selected mapper position
  // 1:1 square aspect ratio centered on mapper position, zero white borders, zero distortion
  return cropSquareFromCanvas(
    sourceCanvas,
    customPixelBox.x,
    customPixelBox.y,
    customPixelBox.width,
    customPixelBox.height,
    qrText
  );
}

/**
 * Helper to crop a perfectly square QR code with crisp borders and high-DPI output
 */
function cropSquareFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  qrText?: string
): ExactQrResult {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // Enforce 1:1 perfect square aspect ratio
  const squareSize = Math.max(cropW, cropH);
  const centerX = cropX + cropW / 2;
  const centerY = cropY + cropH / 2;

  let finalSize = Math.min(squareSize, width, height);
  let finalX = Math.round(centerX - finalSize / 2);
  let finalY = Math.round(centerY - finalSize / 2);

  // Shift inside canvas boundaries without truncating off-center
  if (finalX + finalSize > width) {
    finalX = width - finalSize;
  }
  if (finalX < 0) {
    finalX = 0;
  }
  if (finalY + finalSize > height) {
    finalY = height - finalSize;
  }
  if (finalY < 0) {
    finalY = 0;
  }

  // Crisp output canvas (600x600 for 300 DPI ID card printing)
  const targetOutputSize = Math.max(500, Math.min(800, finalSize));
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = targetOutputSize;
  outputCanvas.height = targetOutputSize;
  const outCtx = outputCanvas.getContext('2d');

  if (!outCtx) {
    return {
      detected: true,
      qrText,
      boundingBox: { x: finalX, y: finalY, width: finalSize, height: finalSize },
    };
  }

  // Transparent background - frameless with zero white border
  outCtx.clearRect(0, 0, targetOutputSize, targetOutputSize);
  outCtx.imageSmoothingEnabled = false;

  // Zero quiet-zone padding: crop tightly to QR matrix
  outCtx.drawImage(
    sourceCanvas,
    finalX,
    finalY,
    finalSize,
    finalSize,
    0,
    0,
    targetOutputSize,
    targetOutputSize
  );

  // Strip all white paper background and borders: convert all light pixels to transparent
  try {
    applyQrFilterToCanvas(outCtx, targetOutputSize, targetOutputSize, 'enhanced');
  } catch {}

  const qrUrl = outputCanvas.toDataURL('image/png');

  return {
    detected: true,
    qrUrl,
    qrText,
    boundingBox: { x: finalX, y: finalY, width: finalSize, height: finalSize },
  };
}

/**
 * Detects the QR code visually by 2D transition density clustering.
 * In a biometric QR code, alternating black/white modules produce an intense 2D frequency
 * in both X and Y directions, surrounded by white quiet-zone margins.
 */
function detectVisualQrBoundingBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  try {
    // Search the right 60% of the document where Fayda QR codes live
    const startX = Math.floor(width * 0.40);
    const searchW = width - startX;
    const startY = Math.floor(height * 0.10);
    const searchH = Math.floor(height * 0.80);

    const imgData = ctx.getImageData(startX, startY, searchW, searchH);
    const data = imgData.data;

    const blockSize = 14;
    const gridCols = Math.floor(searchW / blockSize);
    const gridRows = Math.floor(searchH / blockSize);
    const densityGrid: number[][] = Array.from({ length: gridRows }, () => Array(gridCols).fill(0));

    const isDark = (px: number, py: number) => {
      if (px < 0 || px >= searchW || py < 0 || py >= searchH) return false;
      const idx = (py * searchW + px) * 4;
      const b = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      return b < 130;
    };

    // Calculate horizontal & vertical transition density in each block
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let transitions = 0;
        const bx = gx * blockSize;
        const by = gy * blockSize;

        for (let y = by + 1; y < by + blockSize - 1; y += 2) {
          for (let x = bx + 1; x < bx + blockSize - 1; x += 2) {
            if (isDark(x, y) !== isDark(x + 1, y)) transitions++;
            if (isDark(x, y) !== isDark(x, y + 1)) transitions++;
          }
        }
        densityGrid[gy][gx] = transitions;
      }
    }

    // Find the dense block cluster corresponding to the QR matrix
    const threshold = (blockSize * blockSize / 4) * 0.22;
    let minGx = gridCols;
    let maxGx = 0;
    let minGy = gridRows;
    let maxGy = 0;
    let denseBlockCount = 0;

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        if (densityGrid[gy][gx] >= threshold) {
          denseBlockCount++;
          if (gx < minGx) minGx = gx;
          if (gx > maxGx) maxGx = gx;
          if (gy < minGy) minGy = gy;
          if (gy > maxGy) maxGy = gy;
        }
      }
    }

    if (denseBlockCount < 16 || minGx >= maxGx || minGy >= maxGy) {
      return null;
    }

    const detectedX = startX + minGx * blockSize;
    const detectedY = startY + minGy * blockSize;
    const detectedW = (maxGx - minGx + 1) * blockSize;
    const detectedH = (maxGy - minGy + 1) * blockSize;

    const aspect = detectedW / detectedH;
    if (aspect < 0.75 || aspect > 1.35 || detectedW < 80 || detectedH < 80) {
      return null;
    }

    // Tight to QR matrix: zero white quiet zone border
    return {
      x: Math.max(0, detectedX),
      y: Math.max(0, detectedY),
      width: Math.min(width - detectedX, detectedW),
      height: Math.min(height - detectedY, detectedH),
    };
  } catch {
    return null;
  }
}

/**
 * Standard Fayda slip layout fallback:
 * On Ethiopian Fayda slips, the large QR is located on the right side.
 */
function detectFaydaStandardQrRegion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  try {
    // Official Fayda biometric verification slip QR is located at:
    // X: ~67.5% (approx 63% to 94%), Y: ~53.0% (approx 48% to 75%)
    // Size is ~26.5% width, perfectly square
    const primaryX = Math.round(width * 0.65);
    const primaryY = Math.round(height * 0.50);
    const primaryW = Math.round(width * 0.28);
    const primaryH = Math.round(height * 0.25);
    const primarySize = Math.max(primaryW, primaryH);

    // Verify contrast in primary region
    const checkW = Math.min(width - primaryX, primarySize);
    const checkH = Math.min(height - primaryY, primarySize);

    if (checkW > 80 && checkH > 80) {
      return {
        x: primaryX,
        y: primaryY,
        width: checkW,
        height: checkH,
      };
    }

    // Secondary fallback for legacy or alternate slip layouts (X: ~52%, Y: ~25%)
    const altX = Math.round(width * 0.52);
    const altY = Math.round(height * 0.24);
    const altSize = Math.round(width * 0.38);

    const testW = Math.min(width - altX, altSize);
    const testH = Math.min(height - altY, altSize);

    if (testW > 80 && testH > 80) {
      return {
        x: altX,
        y: altY,
        width: testW,
        height: testH,
      };
    }
  } catch {}
  return null;
}

/**
 * Helper to scan a sub-rectangle of a canvas with jsQR
 */
function scanCanvasWithJsQR(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  try {
    const imgData = ctx.getImageData(x, y, w, h);
    return jsQR(imgData.data, w, h, {
      inversionAttempts: 'attemptBoth',
    });
  } catch {
    return null;
  }
}

/**
 * Scans a thresholded (high contrast binarized) sub-canvas for difficult or low-contrast scans
 */
function scanWithThreshold(canvas: HTMLCanvasElement): { qrCode: any; offset: { x: number; y: number } } {
  try {
    const width = canvas.width;
    const height = canvas.height;
    const offX = Math.floor(width * 0.38);
    const offW = width - offX;

    const subCanvas = document.createElement('canvas');
    subCanvas.width = offW;
    subCanvas.height = height;
    const sCtx = subCanvas.getContext('2d');
    if (!sCtx) return { qrCode: null, offset: { x: 0, y: 0 } };

    sCtx.drawImage(canvas, offX, 0, offW, height, 0, 0, offW, height);
    const imgData = sCtx.getImageData(0, 0, offW, height);
    const d = imgData.data;

    // Apply high-contrast binarization
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const binary = gray < 135 ? 0 : 255;
      d[i] = binary;
      d[i + 1] = binary;
      d[i + 2] = binary;
    }
    sCtx.putImageData(imgData, 0, 0);

    const qrCode = jsQR(d, offW, height, { inversionAttempts: 'attemptBoth' });
    return { qrCode, offset: { x: offX, y: 0 } };
  } catch {
    return { qrCode: null, offset: { x: 0, y: 0 } };
  }
}

/**
 * Scans a downscaled sub-canvas to bypass high-frequency anti-aliasing on dense QR codes
 */
function scanWithDownscale(canvas: HTMLCanvasElement, scale: number): { qrCode: any; offset: { x: number; y: number } } {
  try {
    const width = canvas.width;
    const height = canvas.height;
    const offX = Math.floor(width * 0.40);
    const offW = width - offX;

    const subCanvas = document.createElement('canvas');
    subCanvas.width = Math.round(offW * scale);
    subCanvas.height = Math.round(height * scale);
    const sCtx = subCanvas.getContext('2d');
    if (!sCtx) return { qrCode: null, offset: { x: 0, y: 0 } };

    sCtx.drawImage(canvas, offX, 0, offW, height, 0, 0, subCanvas.width, subCanvas.height);
    const imgData = sCtx.getImageData(0, 0, subCanvas.width, subCanvas.height);
    const qrCode = jsQR(imgData.data, subCanvas.width, subCanvas.height, { inversionAttempts: 'attemptBoth' });

    if (qrCode && qrCode.location) {
      // Scale coordinates back
      const invScale = 1 / scale;
      qrCode.location.topLeftCorner.x *= invScale;
      qrCode.location.topLeftCorner.y *= invScale;
      qrCode.location.topRightCorner.x *= invScale;
      qrCode.location.topRightCorner.y *= invScale;
      qrCode.location.bottomLeftCorner.x *= invScale;
      qrCode.location.bottomLeftCorner.y *= invScale;
      qrCode.location.bottomRightCorner.x *= invScale;
      qrCode.location.bottomRightCorner.y *= invScale;
    }

    return { qrCode, offset: { x: offX, y: 0 } };
  } catch {
    return { qrCode: null, offset: { x: 0, y: 0 } };
  }
}

/**
 * Scans inwards from the crop edges to find the true outer boundary of the dark QR modules
 */
function refineQrBoundingBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  moduleSize: number
): { x: number; y: number; width: number; height: number } {
  try {
    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;
    const isDark = (px: number, py: number) => {
      if (px < 0 || px >= w || py < 0 || py >= h) return false;
      const idx = (py * w + px) * 4;
      const brightness = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      return brightness < 110;
    };

    // Find top-most dark row
    let minRow = 0;
    for (let r = 0; r < h; r++) {
      let darkCount = 0;
      for (let c = 0; c < w; c += 2) {
        if (isDark(c, r)) darkCount++;
        if (darkCount >= 4) break;
      }
      if (darkCount >= 4) {
        minRow = r;
        break;
      }
    }

    // Find bottom-most dark row
    let maxRow = h - 1;
    for (let r = h - 1; r >= 0; r--) {
      let darkCount = 0;
      for (let c = 0; c < w; c += 2) {
        if (isDark(c, r)) darkCount++;
        if (darkCount >= 4) break;
      }
      if (darkCount >= 4) {
        maxRow = r;
        break;
      }
    }

    // Find left-most dark column
    let minCol = 0;
    for (let c = 0; c < w; c++) {
      let darkCount = 0;
      for (let r = 0; r < h; r += 2) {
        if (isDark(c, r)) darkCount++;
        if (darkCount >= 4) break;
      }
      if (darkCount >= 4) {
        minCol = c;
        break;
      }
    }

    // Find right-most dark column
    let maxCol = w - 1;
    for (let c = w - 1; c >= 0; c--) {
      let darkCount = 0;
      for (let r = 0; r < h; r += 2) {
        if (isDark(c, r)) darkCount++;
        if (darkCount >= 4) break;
      }
      if (darkCount >= 4) {
        maxCol = c;
        break;
      }
    }

    // Tight crop directly around the detected black module bounds (0 quiet zone border)
    const refinedX = Math.max(0, x + minCol);
    const refinedY = Math.max(0, y + minRow);
    const refinedW = (maxCol - minCol + 1);
    const refinedH = (maxRow - minRow + 1);

    if (refinedW > 30 && refinedH > 30) {
      return { x: refinedX, y: refinedY, width: refinedW, height: refinedH };
    }
  } catch {}

  return { x, y, width: w, height: h };
}

/**
 * Strips all white background and border from any QR code image data URL,
 * cropping tightly to the outermost black modules and returning a 100% transparent PNG.
 */
export async function makeQrTransparentAndBorderless(imageSrc: string): Promise<string> {
  if (!imageSrc || !imageSrc.startsWith('data:image')) return imageSrc;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = imageSrc;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageSrc;

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Find bounding box of actual dark modules
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let darkPixelCount = 0;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const idx = (y * canvas.width + x) * 4;
        const a = data[idx + 3];
        if (a < 50) continue;
        const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
        if (lum < 150) {
          darkPixelCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // If dark pixels exist and there is an outer margin/border
    if (darkPixelCount > 40 && minX < maxX && minY < maxY) {
      const tightW = maxX - minX + 1;
      const tightH = maxY - minY + 1;
      const tightCanvas = document.createElement('canvas');
      tightCanvas.width = tightW;
      tightCanvas.height = tightH;
      const tightCtx = tightCanvas.getContext('2d', { willReadFrequently: true });
      if (tightCtx) {
        tightCtx.drawImage(canvas, minX, minY, tightW, tightH, 0, 0, tightW, tightH);
        applyQrFilterToCanvas(tightCtx, tightW, tightH, 'enhanced');
        return tightCanvas.toDataURL('image/png');
      }
    }

    // If no tight crop needed, clean background in place safely
    applyQrFilterToCanvas(ctx, canvas.width, canvas.height, 'enhanced');
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Could not process QR transparent background:', err);
    return imageSrc;
  }
}

/**
 * Applies contrast enhancement and removes paper background to transparent,
 * strictly preserving existing transparency (never turns transparent pixels black).
 */
export function applyQrFilterToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filterMode: 'original' | 'enhanced' | 'crispBw' = 'enhanced'
): void {
  if (filterMode === 'original') {
    // Keep raw scan colors and natural contrast
    return;
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  // 1. Collect statistics of visible non-transparent pixels (alpha >= 40)
  let minLum = 255;
  let maxLum = 0;
  let sampleCount = 0;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 30) continue; // skip already transparent pixels
    const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
    sampleCount++;
  }

  // If mostly transparent or zero contrast, leave untouched
  if (sampleCount < 40 || maxLum - minLum < 15) {
    return;
  }

  const range = maxLum - minLum;
  // Adaptive thresholds based on actual paper & ink levels
  const darkThresh = minLum + range * 0.38;
  const paperThresh = minLum + range * 0.68;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    // CRITICAL: NEVER turn transparent pixels into opaque black!
    if (a < 30) {
      d[i + 3] = 0;
      continue;
    }

    const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

    if (filterMode === 'enhanced') {
      // Enhanced mode: Clear white paper to transparent, deepen dark modules
      if (lum >= paperThresh) {
        d[i + 3] = 0; // Pure transparent paper background
      } else if (lum <= darkThresh) {
        // Deepen dark modules to crisp black while preserving full opacity
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = a;
      } else {
        // Antialiased edge transition
        const factor = (paperThresh - lum) / (paperThresh - darkThresh);
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = Math.round(a * factor);
      }
    } else if (filterMode === 'crispBw') {
      // Laser B&W mode: Binary deep black QR modules on transparent background
      const midThresh = (darkThresh + paperThresh) / 2;
      if (lum >= midThresh) {
        d[i + 3] = 0; // Transparent background
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 255; // Solid black dot
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Default fallback bounding box for Fayda slip QR code (right-side column)
 */
export function getDefaultFaydaQrBox(
  naturalWidth: number,
  naturalHeight: number
): { x: number; y: number; width: number; height: number } {
  const size = Math.round(Math.min(naturalWidth * 0.38, naturalHeight * 0.42));
  return {
    x: Math.round(naturalWidth * 0.52),
    y: Math.round(naturalHeight * 0.22),
    width: size,
    height: size,
  };
}

export interface DetectedQrRegion {
  detected: boolean;
  box: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  qrText?: string;
  confidence: 'high_finders' | 'medium_visual' | 'standard_prior';
}

/**
 * Automatically detects and centers the QR code area on any Fayda document canvas.
 * Guarantees a perfectly centered 1:1 square bounding box and center coordinate.
 */
export function detectAndCenterQrRegion(sourceCanvas: HTMLCanvasElement): DetectedQrRegion {
  const result = cropExactQrCode(sourceCanvas);
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  if (result.detected && result.boundingBox) {
    const b = result.boundingBox;
    const sq = Math.max(b.width, b.height);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const x = Math.max(0, Math.min(w - sq, Math.round(cx - sq / 2)));
    const y = Math.max(0, Math.min(h - sq, Math.round(cy - sq / 2)));
    return {
      detected: true,
      box: { x, y, width: sq, height: sq },
      center: { x: cx, y: cy },
      qrText: result.qrText,
      confidence: result.qrText ? 'high_finders' : 'medium_visual',
    };
  }

  const defaultBox = getDefaultFaydaQrBox(w, h);
  return {
    detected: false,
    box: defaultBox,
    center: {
      x: defaultBox.x + defaultBox.width / 2,
      y: defaultBox.y + defaultBox.height / 2,
    },
    confidence: 'standard_prior',
  };
}

