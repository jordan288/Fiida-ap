export interface ImageAdjustments {
  brightness: number; // -100 to 100 (0 = normal)
  contrast: number; // -100 to 100 (0 = normal)
  exposure: number; // -100 to 100 (0 = normal)
  saturation: number; // -100 to 100 (0 = normal)
  temperature: number; // -100 to 100 (0 = normal, negative = cool, positive = warm)
  sharpness: number; // 0 to 100 (0 = normal)
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  saturation: 0,
  temperature: 0,
  sharpness: 0,
};

export interface BgRemovalOptions {
  tolerance: number; // 1 to 100 (default 30)
  feather: number; // 0 to 10 px
  targetColor?: { r: number; g: number; b: number }; // If null, auto-detects from corners
  fillColor?: string; // 'transparent' | '#ffffff' | '#dbeafe' | '#f3f4f6'
  edgeSmoothing: boolean;
}

export const DEFAULT_BG_OPTIONS: BgRemovalOptions = {
  tolerance: 32,
  feather: 2,
  fillColor: 'transparent',
  edgeSmoothing: true,
};

/**
 * Load HTMLImageElement from data URL or image source
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image: ' + e));
    img.src = src;
  });
}

/**
 * Apply Light/Dark adjustments, exposure, contrast, temperature and sharpness to an image
 */
export async function applyPhotoAdjustments(
  imageSrc: string,
  adjustments: ImageAdjustments
): Promise<string> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2d context');

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Pre-calculate factors
  const brightnessFactor = (adjustments.brightness / 100) * 128;
  const exposureFactor = Math.pow(2, adjustments.exposure / 50);
  const contrastFactor = adjustments.contrast >= 0
    ? (100 + adjustments.contrast) / 100
    : (100 + adjustments.contrast) / 100;
  const saturationFactor = (100 + adjustments.saturation) / 100;
  const tempFactor = adjustments.temperature / 100; // -1 to 1

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Exposure
    if (adjustments.exposure !== 0) {
      r *= exposureFactor;
      g *= exposureFactor;
      b *= exposureFactor;
    }

    // 2. Brightness
    if (adjustments.brightness !== 0) {
      r += brightnessFactor;
      g += brightnessFactor;
      b += brightnessFactor;
    }

    // 3. Contrast (around midpoint 128)
    if (adjustments.contrast !== 0) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    // 4. Color Temperature (warm: +R -B; cool: -R +B)
    if (adjustments.temperature !== 0) {
      r += tempFactor * 25;
      b -= tempFactor * 25;
    }

    // 5. Saturation
    if (adjustments.saturation !== 0) {
      const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;
    }

    // Clamp values
    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imgData, 0, 0);

  // 6. Optional Sharpness filter using 3x3 unsharp convolution kernel
  if (adjustments.sharpness > 0) {
    const sharpnessAmount = (adjustments.sharpness / 100) * 1.5;
    const sharpenedData = ctx.createImageData(canvas.width, canvas.height);
    const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const dstData = sharpenedData.data;
    const w = canvas.width;
    const h = canvas.height;

    // Kernel:
    // [  0, -a/4,  0 ]
    // [ -a/4, 1+a, -a/4 ]
    // [  0, -a/4,  0 ]
    const a = sharpnessAmount;
    const edgeWeight = -a / 4;
    const centerWeight = 1 + a;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const topIdx = ((y - 1) * w + x) * 4;
        const bottomIdx = ((y + 1) * w + x) * 4;
        const leftIdx = (y * w + (x - 1)) * 4;
        const rightIdx = (y * w + (x + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          const val =
            srcData[idx + c] * centerWeight +
            (srcData[topIdx + c] + srcData[bottomIdx + c] + srcData[leftIdx + c] + srcData[rightIdx + c]) * edgeWeight;
          dstData[idx + c] = Math.min(255, Math.max(0, val));
        }
        dstData[idx + 3] = srcData[idx + 3];
      }
    }
    ctx.putImageData(sharpenedData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Remove photo background with intelligent flood fill & color tolerance
 */
export async function removePhotoBackground(
  imageSrc: string,
  options: BgRemovalOptions = DEFAULT_BG_OPTIONS
): Promise<string> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Determine background target colors (sample 4 corners + top middle)
  let targetR = 255;
  let targetG = 255;
  let targetB = 255;

  if (options.targetColor) {
    targetR = options.targetColor.r;
    targetG = options.targetColor.g;
    targetB = options.targetColor.b;
  } else {
    // Sample corners to find dominant background tone
    const samples = [
      0, // top-left
      (width - 1) * 4, // top-right
      Math.floor(width / 2) * 4, // top-center
      ((height - 1) * width) * 4, // bottom-left
      ((height - 1) * width + width - 1) * 4, // bottom-right
    ];

    let sumR = 0, sumG = 0, sumB = 0;
    for (const idx of samples) {
      sumR += data[idx];
      sumG += data[idx + 1];
      sumB += data[idx + 2];
    }
    targetR = Math.round(sumR / samples.length);
    targetG = Math.round(sumG / samples.length);
    targetB = Math.round(sumB / samples.length);
  }

  // 2. Flood Fill / Border-connected pixel mask to prevent removing light areas inside applicant shirt/face
  const mask = new Uint8Array(width * height); // 1 = background, 0 = foreground
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const maxDist = (options.tolerance / 100) * 160;

  function colorDiff(idx: number): number {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    // Weighted Euclidean distance
    const rmean = (r + targetR) / 2;
    const dr = r - targetR;
    const dg = g - targetG;
    const db = b - targetB;
    return Math.sqrt((((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8));
  }

  // Seed with border pixels
  for (let x = 0; x < width; x++) {
    // top row
    const topIdx = x;
    if (colorDiff(topIdx * 4) <= maxDist) {
      queue.push(topIdx);
      visited[topIdx] = 1;
      mask[topIdx] = 1;
    }
    // bottom row
    const btmIdx = (height - 1) * width + x;
    if (colorDiff(btmIdx * 4) <= maxDist) {
      queue.push(btmIdx);
      visited[btmIdx] = 1;
      mask[btmIdx] = 1;
    }
  }

  for (let y = 0; y < height; y++) {
    // left column
    const leftIdx = y * width;
    if (!visited[leftIdx] && colorDiff(leftIdx * 4) <= maxDist) {
      queue.push(leftIdx);
      visited[leftIdx] = 1;
      mask[leftIdx] = 1;
    }
    // right column
    const rightIdx = y * width + (width - 1);
    if (!visited[rightIdx] && colorDiff(rightIdx * 4) <= maxDist) {
      queue.push(rightIdx);
      visited[rightIdx] = 1;
      mask[rightIdx] = 1;
    }
  }

  // BFS flood-fill
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const cx = current % width;
    const cy = Math.floor(current / width);

    const neighbors = [
      cy > 0 ? current - width : -1,
      cy < height - 1 ? current + width : -1,
      cx > 0 ? current - 1 : -1,
      cx < width - 1 ? current + 1 : -1,
    ];

    for (const n of neighbors) {
      if (n !== -1 && !visited[n]) {
        visited[n] = 1;
        const diff = colorDiff(n * 4);
        if (diff <= maxDist) {
          mask[n] = 1;
          queue.push(n);
        }
      }
    }
  }

  // 3. Parse target fill color
  let fillR = 0, fillG = 0, fillB = 0, fillA = 0;
  if (options.fillColor && options.fillColor !== 'transparent') {
    if (options.fillColor.startsWith('#')) {
      const hex = options.fillColor.slice(1);
      fillR = parseInt(hex.slice(0, 2), 16) || 255;
      fillG = parseInt(hex.slice(2, 4), 16) || 255;
      fillB = parseInt(hex.slice(4, 6), 16) || 255;
      fillA = 255;
    } else {
      fillR = 255; fillG = 255; fillB = 255; fillA = 255;
    }
  }

  // 4. Apply mask to image data
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 1) {
      const p = i * 4;
      if (fillA === 0) {
        data[p + 3] = 0; // Transparent
      } else {
        data[p] = fillR;
        data[p + 1] = fillG;
        data[p + 2] = fillB;
        data[p + 3] = fillA;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
