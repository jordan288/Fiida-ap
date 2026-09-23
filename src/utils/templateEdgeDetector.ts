import { CoordinatesConfig, FieldCoordinate, MediaCoordinate } from '../types';
import { DEFAULT_COORDINATES } from '../data/defaultData';
import { loadImage } from './imageProcessor';

export interface TemplateEdgeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AutoAlignResult {
  alignedConfig: CoordinatesConfig;
  detectedBounds: TemplateEdgeBounds;
  shift: { x: number; y: number };
  scale: { x: number; y: number };
  hasCustomTemplate: boolean;
  message: string;
}

/**
 * Basic image processing logic to detect the edges of an ID card template image.
 * Analyzes alpha transparency, background color variances, and luminance gradients
 * across horizontal and vertical projections to pinpoint the 4 card perimeter edges.
 */
export function detectEdgesFromCanvas(
  canvas: HTMLCanvasElement,
  targetWidth = 1012,
  targetHeight = 638
): TemplateEdgeBounds {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');

  if (!ctx || w < 20 || h < 20) {
    return { left: 0, top: 0, right: targetWidth, bottom: targetHeight, width: targetWidth, height: targetHeight };
  }

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Sample perimeter corner pixels to determine background characteristics
  let bgR = 255, bgG = 255, bgB = 255, bgA = 255;
  let bgCount = 0;
  let bgLumSum = 0;
  let transparentCorners = 0;

  const sampleCorner = (sx: number, sy: number) => {
    const idx = (sy * w + sx) * 4;
    const a = data[idx + 3];
    if (a < 30) {
      transparentCorners++;
      return;
    }
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    bgLumSum += 0.299 * r + 0.587 * g + 0.114 * b;
    bgCount++;
  };

  // Sample outer 4 corners (3x3 grid each)
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      sampleCorner(dx, dy);
      sampleCorner(w - 1 - dx, dy);
      sampleCorner(dx, h - 1 - dy);
      sampleCorner(w - 1 - dx, h - 1 - dy);
    }
  }

  const hasTransparentBackdrop = transparentCorners > 12;
  const bgAvgLum = bgCount > 0 ? bgLumSum / bgCount : 255;

  // Helper to check if a pixel is non-background (card foreground / template content)
  const isCardPixel = (x: number, y: number): boolean => {
    const idx = (y * w + x) * 4;
    const a = data[idx + 3];
    if (hasTransparentBackdrop) {
      return a > 50; // Non-transparent pixel
    }
    if (a < 30) return false;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Difference from background luminance
    return Math.abs(lum - bgAvgLum) > 22;
  };

  // 2. Scan from borders inward to detect card edges
  const minRequiredCardPixelsX = Math.max(3, Math.floor(h * 0.12));
  const minRequiredCardPixelsY = Math.max(3, Math.floor(w * 0.12));

  let detectedLeft = 0;
  let detectedRight = w - 1;
  let detectedTop = 0;
  let detectedBottom = h - 1;

  // Scan Left -> Right (up to 40% of width)
  const maxSearchX = Math.floor(w * 0.4);
  for (let x = 0; x < maxSearchX; x++) {
    let count = 0;
    // Step by 2 for performance
    for (let y = 0; y < h; y += 2) {
      if (isCardPixel(x, y)) count += 2;
    }
    if (count >= minRequiredCardPixelsX) {
      detectedLeft = x;
      break;
    }
  }

  // Scan Right -> Left (down to 60% of width)
  const minSearchX = Math.floor(w * 0.6);
  for (let x = w - 1; x >= minSearchX; x--) {
    let count = 0;
    for (let y = 0; y < h; y += 2) {
      if (isCardPixel(x, y)) count += 2;
    }
    if (count >= minRequiredCardPixelsX) {
      detectedRight = x;
      break;
    }
  }

  // Scan Top -> Bottom (up to 40% of height)
  const maxSearchY = Math.floor(h * 0.4);
  for (let y = 0; y < maxSearchY; y++) {
    let count = 0;
    for (let x = 0; x < w; x += 2) {
      if (isCardPixel(x, y)) count += 2;
    }
    if (count >= minRequiredCardPixelsY) {
      detectedTop = y;
      break;
    }
  }

  // Scan Bottom -> Top (down to 60% of height)
  const minSearchY = Math.floor(h * 0.6);
  for (let y = h - 1; y >= minSearchY; y--) {
    let count = 0;
    for (let x = 0; x < w; x += 2) {
      if (isCardPixel(x, y)) count += 2;
    }
    if (count >= minRequiredCardPixelsY) {
      detectedBottom = y;
      break;
    }
  }

  // Scale detected coordinates back to standard target card space (1012x638)
  const scaleX = targetWidth / w;
  const scaleY = targetHeight / h;

  let scaledLeft = Math.round(detectedLeft * scaleX);
  let scaledRight = Math.round((detectedRight + 1) * scaleX);
  let scaledTop = Math.round(detectedTop * scaleY);
  let scaledBottom = Math.round((detectedBottom + 1) * scaleY);

  // If detected edges are within tiny margins (< 10px), snap to canvas boundary
  if (scaledLeft < 10) scaledLeft = 0;
  if (scaledTop < 10) scaledTop = 0;
  if (targetWidth - scaledRight < 10) scaledRight = targetWidth;
  if (targetHeight - scaledBottom < 10) scaledBottom = targetHeight;

  const cardWidth = scaledRight - scaledLeft;
  const cardHeight = scaledBottom - scaledTop;

  // Sanity check: valid card size must span at least 50% of the canvas
  if (cardWidth < targetWidth * 0.5 || cardHeight < targetHeight * 0.5) {
    return {
      left: 0,
      top: 0,
      right: targetWidth,
      bottom: targetHeight,
      width: targetWidth,
      height: targetHeight,
    };
  }

  return {
    left: scaledLeft,
    top: scaledTop,
    right: scaledRight,
    bottom: scaledBottom,
    width: cardWidth,
    height: cardHeight,
  };
}

/**
 * Auto-Aligns ID Card fields using template edge detection.
 * Detects the bounding box of the ID card template, computes centering offsets,
 * and resets all text and media fields to default centered coordinates.
 */
export async function autoAlignFieldsToTemplate(
  templateImageUrl?: string,
  targetWidth = 1012,
  targetHeight = 638
): Promise<AutoAlignResult> {
  let bounds: TemplateEdgeBounds = {
    left: 0,
    top: 0,
    right: targetWidth,
    bottom: targetHeight,
    width: targetWidth,
    height: targetHeight,
  };

  let hasCustomTemplate = false;

  if (templateImageUrl && templateImageUrl.trim().length > 0) {
    try {
      const img = await loadImage(templateImageUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || targetWidth;
      canvas.height = img.naturalHeight || img.height || targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        bounds = detectEdgesFromCanvas(canvas, targetWidth, targetHeight);
        hasCustomTemplate = true;
      }
    } catch (err) {
      console.warn('Failed to load template image for edge detection, falling back to standard bounds:', err);
    }
  }

  // Calculate card center in target space
  const detectedCenterX = (bounds.left + bounds.right) / 2;
  const detectedCenterY = (bounds.top + bounds.bottom) / 2;

  const standardCenterX = targetWidth / 2;   // 506
  const standardCenterY = targetHeight / 2;  // 319

  const shiftX = Math.round(detectedCenterX - standardCenterX);
  const shiftY = Math.round(detectedCenterY - standardCenterY);

  const scaleX = bounds.width / targetWidth;
  const scaleY = bounds.height / targetHeight;

  // Build aligned coordinates config from DEFAULT_COORDINATES
  const alignedConfig: CoordinatesConfig = JSON.parse(JSON.stringify(DEFAULT_COORDINATES));

  // Reset fields to default centered coordinates adjusted for detected template edges
  Object.keys(alignedConfig.fields).forEach((key) => {
    const defaultField = DEFAULT_COORDINATES.fields[key];
    if (!defaultField) return;

    let newX: number;
    let newY: number;

    // If template has slight scaling or offset, center relative to template bounds
    if (Math.abs(scaleX - 1) > 0.03 || Math.abs(scaleY - 1) > 0.03) {
      const relX = defaultField.x - standardCenterX;
      const relY = defaultField.y - standardCenterY;
      newX = Math.round(detectedCenterX + relX * scaleX);
      newY = Math.round(detectedCenterY + relY * scaleY);
    } else {
      newX = defaultField.x + shiftX;
      newY = defaultField.y + shiftY;
    }

    // Keep within visible card bounds
    alignedConfig.fields[key] = {
      ...defaultField,
      x: Math.max(10, Math.min(targetWidth - 40, newX)),
      y: Math.max(10, Math.min(targetHeight - 20, newY)),
    };
  });

  // Reset media elements to default centered coordinates adjusted for template edges
  Object.keys(alignedConfig.media).forEach((key) => {
    const defaultMedia = DEFAULT_COORDINATES.media[key];
    if (!defaultMedia) return;

    let newX: number;
    let newY: number;
    let newW = defaultMedia.width;
    let newH = defaultMedia.height;

    if (Math.abs(scaleX - 1) > 0.03 || Math.abs(scaleY - 1) > 0.03) {
      const relX = defaultMedia.x - standardCenterX;
      const relY = defaultMedia.y - standardCenterY;
      newX = Math.round(detectedCenterX + relX * scaleX);
      newY = Math.round(detectedCenterY + relY * scaleY);
      newW = Math.round(defaultMedia.width * scaleX);
      newH = Math.round(defaultMedia.height * scaleY);
    } else {
      newX = defaultMedia.x + shiftX;
      newY = defaultMedia.y + shiftY;
    }

    alignedConfig.media[key] = {
      ...defaultMedia,
      x: Math.max(10, Math.min(targetWidth - 40, newX)),
      y: Math.max(10, Math.min(targetHeight - 20, newY)),
      width: newW,
      height: newH,
    };
  });

  const message = hasCustomTemplate
    ? `Template edges detected [X: ${bounds.left}–${bounds.right}px, Y: ${bounds.top}–${bounds.bottom}px]. Fields auto-aligned to center!`
    : `Card template verified at standard [${targetWidth} × ${targetHeight}px]. Fields reset to default centered coordinates!`;

  return {
    alignedConfig,
    detectedBounds: bounds,
    shift: { x: shiftX, y: shiftY },
    scale: { x: scaleX, y: scaleY },
    hasCustomTemplate,
    message,
  };
}
