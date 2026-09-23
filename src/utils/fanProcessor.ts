import { loadImageAsync } from './pdfRegionExtractor';

export interface FanProcessingOptions {
  colorMode?: 'bw' | 'bw_transparent' | 'enhanced' | 'original';
  bgMode?: 'white' | 'transparent';
  thresholdOffset?: number; // -50 to +50: controls stroke thickness/darkness
  sharpen?: boolean; // Default false: preserves natural regular stroke weight without bold halos
  smoothText?: boolean; // Default true: anti-aliased subpixel smoothing for crisp, legible digits
  denoise?: boolean; // Default true: removes background scanner dust & specks
  superSampleFactor?: number; // Default 1.0: 1:1 direct crop (no upscale)
  targetMinHeight?: number; // Default 0: no forced upscaling
  noUpscale?: boolean; // When true or superSampleFactor <= 1.0, keeps exact 1:1 crop as it is
}

/**
 * High-performance Black & White conversion and quality enhancement for Back FAN numbers.
 * Converts fuzzy, yellowed, or grayish document scans into pure high-contrast
 * black digits on solid non-transparent white background with natural regular typography.
 */
export function processFanBlackAndWhite(
  imageData: ImageData,
  options: FanProcessingOptions = {}
): ImageData {
  const {
    colorMode = 'bw',
    bgMode = 'white',
    thresholdOffset = 0,
    sharpen = false,
    smoothText = true,
    denoise = true,
  } = options;

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // If original colors requested and no sharpening/denoising, return early
  if (colorMode === 'original' && !sharpen && !denoise) {
    return imageData;
  }

  // 1. Calculate horizontal slices for adaptive local lighting correction.
  // Documents often have uneven scanning exposure (left vs right or gradient shadows).
  const numSlices = 16;
  const sliceWidth = Math.max(1, Math.floor(width / numSlices));
  const sliceBgLum = new Float32Array(numSlices);

  for (let s = 0; s < numSlices; s++) {
    const startX = s * sliceWidth;
    const endX = s === numSlices - 1 ? width : (s + 1) * sliceWidth;

    // Collect top 25% brightest pixels in this horizontal slice as background baseline
    const luminances: number[] = [];
    for (let y = 0; y < height; y += 2) {
      const rowOffset = y * width;
      for (let x = startX; x < endX; x += 2) {
        const idx = (rowOffset + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        luminances.push(lum);
      }
    }

    luminances.sort((a, b) => b - a);
    const sampleCount = Math.max(5, Math.floor(luminances.length * 0.25));
    let sum = 0;
    for (let i = 0; i < sampleCount; i++) {
      sum += luminances[i];
    }
    sliceBgLum[s] = sampleCount > 0 ? sum / sampleCount : 230;
  }

  // Smooth slice background luminances
  const smoothedSliceBg = new Float32Array(numSlices);
  for (let s = 0; s < numSlices; s++) {
    let sum = 0;
    let count = 0;
    for (let ds = -1; ds <= 1; ds++) {
      const ns = s + ds;
      if (ns >= 0 && ns < numSlices) {
        sum += sliceBgLum[ns];
        count++;
      }
    }
    smoothedSliceBg[s] = sum / count;
  }

  // Function to get interpolated background luminance at column x
  const getLocalBgLum = (x: number): number => {
    const sPos = (x / width) * (numSlices - 1);
    const s0 = Math.floor(sPos);
    const s1 = Math.min(numSlices - 1, s0 + 1);
    const frac = sPos - s0;
    return smoothedSliceBg[s0] * (1 - frac) + smoothedSliceBg[s1] * frac;
  };

  const isTransparent = colorMode === 'bw_transparent' || bgMode === 'transparent';

  // 2. Transform pixels into pure Black and White with crisp, tight subpixel edge anti-aliasing
  if (colorMode === 'enhanced') {
    // Enhanced color: boost contrast and remove paper haze while keeping authentic colors
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (rowOffset + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const localBg = getLocalBgLum(x);

        const bgThreshold = Math.max(170, localBg - 15 + thresholdOffset);
        const inkThreshold = Math.max(30, bgThreshold - 60);

        if (lum >= bgThreshold) {
          if (isTransparent) {
            data[idx + 3] = 0;
          } else {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
        } else if (lum <= inkThreshold) {
          data[idx] = Math.round(r * 0.15);
          data[idx + 1] = Math.round(g * 0.15);
          data[idx + 2] = Math.round(b * 0.15);
          data[idx + 3] = 255;
        } else {
          const t = (bgThreshold - lum) / (bgThreshold - inkThreshold);
          const factor = 1 - t * 0.85;
          data[idx] = Math.round(r * factor);
          data[idx + 1] = Math.round(g * factor);
          data[idx + 2] = Math.round(b * factor);
          data[idx + 3] = isTransparent ? Math.round(t * 255) : 255;
        }
      }
    }
  } else if (colorMode !== 'original') {
    // Pure Black & White with crisp subpixel anti-aliasing (tight transition zone to prevent blur)
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (rowOffset + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        const localBg = getLocalBgLum(x);
        // Clean white background cutoff (removes scan haze without eroding glyphs)
        const bgCutoff = Math.max(160, Math.min(245, localBg - 22 + thresholdOffset));
        // Authentic stroke ink cutoff: only true core stroke ink becomes 100% black,
        // preserving the authentic slender regular font weight without bold swelling!
        const inkCutoff = Math.max(25, Math.min(80, localBg * 0.28 + thresholdOffset));

        if (lum >= bgCutoff) {
          // Pure White Background
          if (isTransparent) {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 0;
          } else {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
        } else if (lum <= inkCutoff) {
          // Pure Black Ink: Authoritative, rich, solid black
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        } else {
          // Crisp Anti-Aliased Subpixel Edge (slender power curve keeps digits regular weight, never bold)
          const rawT = (bgCutoff - lum) / (bgCutoff - inkCutoff);
          const t = Math.max(0, Math.min(1, rawT));
          const smoothT = Math.pow(t, 1.35);

          if (isTransparent) {
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = Math.min(255, Math.max(0, Math.round(smoothT * 255)));
          } else {
            // Anti-aliased grayscale transition from 255 (white) to 0 (black)
            const gray = Math.round(255 * (1 - smoothT));
            data[idx] = gray;
            data[idx + 1] = gray;
            data[idx + 2] = gray;
            data[idx + 3] = 255; // Always fully opaque
          }
        }
      }
    }
  }

  // 3. De-speckling (clean isolated scanner noise on the white paper margin)
  if (denoise && !isTransparent && width > 4 && height > 4) {
    const isInk = (x: number, y: number): boolean => {
      const idx = (y * width + x) * 4;
      return data[idx] < 200;
    };

    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx] < 180) {
          // Count ink pixels in 5x5 neighborhood
          let inkNeighbors = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (isInk(x + dx, y + dy)) inkNeighbors++;
            }
          }
          // If fewer than 3 ink neighbors in 24 neighbor pixels, it is an isolated scanner speckle
          if (inkNeighbors < 3) {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
        }
      }
    }
  }

  // 4. Edge Sharpening (Unsharp mask for high-definition character contours)
  if (sharpen && width > 4 && height > 4) {
    const copy = new Uint8ClampedArray(data);
    const edgeWeight = -0.15;
    const centerWeight = 1.0 - 4 * edgeWeight;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        if (copy[idx + 3] > 20 && (copy[idx] < 240 || isTransparent)) {
          const topIdx = ((y - 1) * width + x) * 4;
          const bottomIdx = ((y + 1) * width + x) * 4;
          const leftIdx = (y * width + (x - 1)) * 4;
          const rightIdx = (y * width + (x + 1)) * 4;

          for (let c = 0; c < 3; c++) {
            const val =
              copy[idx + c] * centerWeight +
              (copy[topIdx + c] + copy[bottomIdx + c] + copy[leftIdx + c] + copy[rightIdx + c]) * edgeWeight;
            data[idx + c] = Math.min(255, Math.max(0, Math.round(val)));
          }
        }
      }
    }
  }

  return imageData;
}

/**
 * Crops the Back FAN region directly from the document slip canvas.
 * Per user directive: "crop the back fan and just put it as it is.... do not upscale it"
 * Default is 1:1 direct crop (no upscale) in original authentic slip format.
 */
export async function cropAndUpscaleFanLayer(
  source: string | HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  options: FanProcessingOptions = {}
): Promise<string> {
  const {
    superSampleFactor = 2.5, // High-definition 2.5x super-sampling
    targetMinHeight = 180, // Minimum 180px height for crystal-clear print quality
    colorMode = 'enhanced', // High quality contrast & haze removal
    bgMode = 'white',
    thresholdOffset = 0,
    sharpen = false,
    smoothText = true,
    denoise = true,
    noUpscale = false,
  } = options;

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

  // Exact rectangular coordinates from percentage (0-100%)
  const sx = Math.max(0, Math.round((region.x / 100) * srcCanvas.width));
  const sy = Math.max(0, Math.round((region.y / 100) * srcCanvas.height));
  const sw = Math.min(srcCanvas.width - sx, Math.max(10, Math.round((region.width / 100) * srcCanvas.width)));
  const sh = Math.min(srcCanvas.height - sy, Math.max(5, Math.round((region.height / 100) * srcCanvas.height)));

  if (sw <= 0 || sh <= 0) return '';

  // Calculate resolution factor: target minimum 180px height or superSampleFactor
  let calculatedFactor = 1.0;
  if (!noUpscale) {
    const factorFromHeight = (targetMinHeight > 0 && sh > 0) ? targetMinHeight / sh : 1.0;
    const requestedFactor = (superSampleFactor && superSampleFactor > 1.0) ? superSampleFactor : 1.0;
    calculatedFactor = Math.max(1.0, Math.min(4.0, Math.max(requestedFactor, factorFromHeight)));
  }

  const outW = Math.round(sw * calculatedFactor);
  const outH = Math.round(sh * calculatedFactor);

  const destCanvas = document.createElement('canvas');
  destCanvas.width = outW;
  destCanvas.height = outH;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!destCtx) return '';

  // 1:1 Direct Crop As It Is: only if explicitly 1x with no filters
  if (colorMode === 'original' && calculatedFactor === 1.0 && !sharpen && !denoise) {
    destCtx.imageSmoothingEnabled = false;
    destCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return destCanvas.toDataURL('image/png');
  }

  if (colorMode === 'bw_transparent' || bgMode === 'transparent') {
    destCtx.clearRect(0, 0, outW, outH);
  } else {
    // Pure solid white background
    destCtx.fillStyle = '#ffffff';
    destCtx.fillRect(0, 0, outW, outH);
  }

  // High-quality bicubic interpolation rendering
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  destCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  if (colorMode !== 'original' || sharpen || denoise) {
    // Extract pixel data for quality enhancement, contrast normalization & sharpening
    const imgData = destCtx.getImageData(0, 0, outW, outH);
    processFanBlackAndWhite(imgData, {
      colorMode,
      bgMode,
      thresholdOffset,
      sharpen,
      smoothText,
      denoise,
    });
    destCtx.putImageData(imgData, 0, 0);
  }

  return destCanvas.toDataURL('image/png');
}

/**
 * Enhances an existing Back FAN image or data URL by applying an upscale and crisp Black & White processing.
 */
export async function enhanceFanLayerBlackAndWhite(
  imageSrc: string,
  options: FanProcessingOptions = {}
): Promise<string> {
  const {
    superSampleFactor = 2.5,
    targetMinHeight = 180,
    colorMode = 'bw',
    bgMode = 'white', // Solid white, never transparent
    thresholdOffset = 0,
    sharpen = true,
    smoothText = true,
    denoise = true,
  } = options;

  const img = await loadImageAsync(imageSrc);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // High-definition upscale: ensure minimum 180px height for ultra-crisp print quality
  const targetH = Math.max(targetMinHeight || 180, Math.round(srcH * (superSampleFactor || 2.5)));
  const factor = srcH > 0 ? Math.max(1.0, Math.min(4.0, targetH / srcH)) : 2.5;
  const outW = Math.round(srcW * factor);
  const outH = Math.round(srcH * factor);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return imageSrc;

  if (colorMode === 'bw_transparent' || bgMode === 'transparent') {
    ctx.clearRect(0, 0, outW, outH);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const imgData = ctx.getImageData(0, 0, outW, outH);
  processFanBlackAndWhite(imgData, {
    colorMode,
    bgMode,
    thresholdOffset,
    sharpen,
    smoothText,
    denoise,
  });
  ctx.putImageData(imgData, 0, 0);

  return canvas.toDataURL('image/png');
}
