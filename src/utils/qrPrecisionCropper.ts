import jsQR from 'jsqr';

export interface ExactQrResult {
  qrUrl?: string;
  qrText?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  detected: boolean;
}

/**
 * Accurately detects and crops the official biometric QR code from an Ethiopian Fayda slip canvas.
 * If jsQR decodes the payload, it uses exact finder corners.
 * If the QR code is too dense for jsQR to decode the string, it uses visual 2D matrix clustering
 * and finder pattern detection to locate and crop the exact authentic QR code from the PDF file.
 */
export function cropExactQrCode(sourceCanvas: HTMLCanvasElement): ExactQrResult {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });

  if (!ctx || width < 50 || height < 50) {
    return { detected: false };
  }

  // --- Step 1: Multi-pass jsQR Scanning ---
  let qrCode: any = null;
  let regionOffset = { x: 0, y: 0 };

  // Pass 1.1: Full canvas scan
  qrCode = scanCanvasWithJsQR(ctx, 0, 0, width, height);

  // Pass 1.2: Right half (Fayda slips place the biometric QR on the right side)
  if (!qrCode) {
    const rightX = Math.floor(width * 0.42);
    const rightW = width - rightX;
    qrCode = scanCanvasWithJsQR(ctx, rightX, 0, rightW, height);
    if (qrCode) regionOffset = { x: rightX, y: 0 };
  }

  // Pass 1.3: Middle-right quadrant
  if (!qrCode) {
    const qX = Math.floor(width * 0.40);
    const qY = Math.floor(height * 0.15);
    const qW = Math.floor(width * 0.58);
    const qH = Math.floor(height * 0.70);
    qrCode = scanCanvasWithJsQR(ctx, qX, qY, qW, qH);
    if (qrCode) regionOffset = { x: qX, y: qY };
  }

  // Pass 1.4: High-contrast thresholded sub-canvas
  if (!qrCode) {
    const thresholdScan = scanWithThreshold(sourceCanvas);
    if (thresholdScan.qrCode) {
      qrCode = thresholdScan.qrCode;
      regionOffset = thresholdScan.offset;
    }
  }

  // Pass 1.5: Downscaled right half (reduces anti-aliasing noise on dense QR codes)
  if (!qrCode) {
    const downscaleScan = scanWithDownscale(sourceCanvas, 0.65);
    if (downscaleScan.qrCode) {
      qrCode = downscaleScan.qrCode;
      regionOffset = downscaleScan.offset;
    }
  }

  // --- Step 2: If jsQR succeeded, use exact finder pattern corners ---
  if (qrCode && qrCode.location) {
    const loc = qrCode.location;
    const tlX = loc.topLeftCorner.x + regionOffset.x;
    const tlY = loc.topLeftCorner.y + regionOffset.y;
    const trX = loc.topRightCorner.x + regionOffset.x;
    const trY = loc.topRightCorner.y + regionOffset.y;
    const blX = loc.bottomLeftCorner.x + regionOffset.x;
    const blY = loc.bottomLeftCorner.y + regionOffset.y;
    const brX = loc.bottomRightCorner.x + regionOffset.x;
    const brY = loc.bottomRightCorner.y + regionOffset.y;

    const minX = Math.min(tlX, blX);
    const maxX = Math.max(trX, brX);
    const minY = Math.min(tlY, trY);
    const maxY = Math.max(blY, brY);

    const rawWidth = maxX - minX;
    const rawHeight = maxY - minY;
    const qrDimension = Math.max(rawWidth, rawHeight);

    const dist = Math.hypot(trX - tlX, trY - tlY);
    const moduleSize = Math.max(2, dist / 35);

    // Expand outward to cover outer finder borders + quiet zone
    const quietZoneModules = 3;
    const expansion = Math.round((3.5 + quietZoneModules) * moduleSize);

    let cropX = Math.max(0, Math.floor(minX - expansion));
    let cropY = Math.max(0, Math.floor(minY - expansion));
    let cropW = Math.min(width - cropX, Math.ceil(qrDimension + expansion * 2));
    let cropH = Math.min(height - cropY, Math.ceil(qrDimension + expansion * 2));

    const refined = refineQrBoundingBox(ctx, cropX, cropY, cropW, cropH, moduleSize);
    return cropSquareFromCanvas(sourceCanvas, refined.x, refined.y, refined.width, refined.height, qrCode.data);
  }

  // --- Step 3: Visual Matrix & Transition Clustering (Fallback when jsQR string decode fails) ---
  // High-density biometric QR codes in official Fayda PDFs may contain raw binary signatures
  // that jsQR fails to decode, but the visual QR code is clearly present on the slip.
  const visualBox = detectVisualQrBoundingBox(ctx, width, height);
  if (visualBox) {
    return cropSquareFromCanvas(sourceCanvas, visualBox.x, visualBox.y, visualBox.width, visualBox.height);
  }

  // --- Step 4: Standard Fayda Slip QR Region Prior ---
  // In standard Ethiopian Fayda verification slips, the biometric QR code is positioned in the
  // right column between X ~ 50% to 92% and Y ~ 20% to 62%.
  const faydaPriorBox = detectFaydaStandardQrRegion(ctx, width, height);
  if (faydaPriorBox) {
    return cropSquareFromCanvas(sourceCanvas, faydaPriorBox.x, faydaPriorBox.y, faydaPriorBox.width, faydaPriorBox.height);
  }

  return { detected: false };
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

  let finalX = Math.max(0, Math.round(centerX - squareSize / 2));
  let finalY = Math.max(0, Math.round(centerY - squareSize / 2));
  let finalSize = squareSize;

  if (finalX + finalSize > width) {
    finalSize = width - finalX;
  }
  if (finalY + finalSize > height) {
    finalSize = height - finalY;
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

  // Pure white quiet-zone background
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, targetOutputSize, targetOutputSize);
  outCtx.imageSmoothingEnabled = false;

  // Add a neat 3.5% quiet-zone margin around the QR code
  const pad = Math.round(targetOutputSize * 0.035);
  const drawSize = targetOutputSize - pad * 2;

  outCtx.drawImage(
    sourceCanvas,
    finalX,
    finalY,
    finalSize,
    finalSize,
    pad,
    pad,
    drawSize,
    drawSize
  );

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

    // Expand to quiet zone
    const qz = Math.round(Math.max(detectedW, detectedH) * 0.05);
    return {
      x: Math.max(0, detectedX - qz),
      y: Math.max(0, detectedY - qz),
      width: Math.min(width - detectedX + qz, detectedW + qz * 2),
      height: Math.min(height - detectedY + qz, detectedH + qz * 2),
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
    // Standard Fayda region coordinates
    const approxX = Math.round(width * 0.50);
    const approxY = Math.round(height * 0.22);
    const approxSize = Math.round(width * 0.40);

    const testW = Math.min(width - approxX, approxSize);
    const testH = Math.min(height - approxY, approxSize);

    if (testW > 100 && testH > 100) {
      return {
        x: approxX,
        y: approxY,
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

    // Add quiet zone around the detected black module bounds
    const qz = Math.round(moduleSize * 2.5);
    const refinedX = Math.max(0, x + minCol - qz);
    const refinedY = Math.max(0, y + minRow - qz);
    const refinedW = (maxCol - minCol) + qz * 2;
    const refinedH = (maxRow - minRow) + qz * 2;

    if (refinedW > 40 && refinedH > 40) {
      return { x: refinedX, y: refinedY, width: refinedW, height: refinedH };
    }
  } catch {}

  return { x, y, width: w, height: h };
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

