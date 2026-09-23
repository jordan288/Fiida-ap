import { CustomFontItem } from '../types';
import {
  saveCustomFontToIndexedDB,
  loadCustomFontsFromIndexedDB,
  deleteCustomFontFromIndexedDB,
} from './indexedDbStorage';

export const DEFAULT_CARD_FONT = 'Nokia Pure Headline Bold';
export const FONT_STORAGE_ACTIVE_KEY = 'fayda_active_card_font';

export interface BuiltInFontOption {
  id: string;
  name: string;
  family: string;
  description: string;
  category: 'primary' | 'system' | 'mono';
  recommended?: boolean;
}

export const BUILT_IN_FONTS: BuiltInFontOption[] = [
  {
    id: 'nokia-pure-headline-bold',
    name: 'Nokia Pure Headline Bold',
    family: 'Nokia Pure Headline Bold',
    description: 'Official bold humanist Fayda ID card typography with optimal contrast and geometry',
    category: 'primary',
    recommended: true,
  },
  {
    id: 'nokia-pure-headline',
    name: 'Nokia Pure Headline Regular',
    family: 'Nokia Pure Headline',
    description: 'Standard weight humanist headline typography for sub-labels and secondary notes',
    category: 'primary',
  },
  {
    id: 'noto-sans-ethiopic',
    name: 'Noto Sans Ethiopic & Latin',
    family: 'Noto Sans Ethiopic',
    description: 'Complete Ethiopic Ge\'ez Unicode font with crisp Latin support',
    category: 'system',
  },
  {
    id: 'monospace-ocr',
    name: 'OCR-B / Monospace',
    family: 'OCR-B',
    description: 'Fixed-width machine-readable font for FAN, FIN code, and serial numbers',
    category: 'mono',
  },
];

/**
 * Returns a robust CSS font-family string with comprehensive fallbacks
 */
export function getFontFamilyCss(selectedFont?: string): string {
  const font = (selectedFont || DEFAULT_CARD_FONT).trim();
  if (font === 'OCR-B' || font === 'Monospace' || font.toLowerCase().includes('monospace')) {
    return '"OCR-B", "Consolas", "Courier New", monospace';
  }

  // If selecting Nokia Pure Headline Bold or custom, chain with Nokia variants and Ethiopic fallbacks
  return `"${font}", "Nokia Pure Headline Bold", "Nokia Pure Headline", "Nokia Pure", "Noto Sans Ethiopic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
}

/**
 * Returns a 2D Canvas context font string (e.g. `bold 24px "Nokia Pure Headline Bold", sans-serif`)
 */
export function getCanvasFontString(
  weight: string | number,
  sizePx: number,
  selectedFont?: string,
  fallbackType: 'sans' | 'mono' = 'sans'
): string {
  const font = (selectedFont || DEFAULT_CARD_FONT).trim();
  if (font === 'OCR-B' || font === 'Monospace' || font.toLowerCase().includes('monospace')) {
    return `${weight} ${sizePx}px "OCR-B", "Consolas", "Courier New", monospace`;
  }
  return `${weight} ${sizePx}px "${font}", "Nokia Pure Headline Bold", "Nokia Pure Headline", "Nokia Pure", "Noto Sans Ethiopic", ${fallbackType === 'mono' ? 'monospace' : 'sans-serif'}`;
}

/**
 * Register a font data URL with the browser FontFace API and inject @font-face style
 */
export async function registerCustomFont(fontName: string, dataUrl: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Inject @font-face CSS rule for DOM and SVG renderers
    let styleEl = document.getElementById('fayda-custom-fonts-style') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'fayda-custom-fonts-style';
      document.head.appendChild(styleEl);
    }

    const cssRule = `
@font-face {
  font-family: "${fontName}";
  src: url("${dataUrl}");
  font-weight: 400 900;
  font-style: normal;
  font-display: swap;
}
`;
    // Only append if not already declared
    if (!styleEl.textContent?.includes(`font-family: "${fontName}"`)) {
      styleEl.textContent += '\n' + cssRule;
    }

    // 2. Also register via browser FontFace API for offscreen Canvas drawing
    if ('FontFace' in window) {
      try {
        const response = await fetch(dataUrl);
        const buffer = await response.arrayBuffer();
        const fontFace = new FontFace(fontName, buffer, {
          weight: 'normal bold 500 600 700 800 900',
          style: 'normal',
        });
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (err) {
        console.warn(`FontFace API load warning for ${fontName}:`, err);
      }
    }

    return true;
  } catch (err) {
    console.error(`Failed to register custom font ${fontName}:`, err);
    return false;
  }
}

/**
 * Read an uploaded font file (.ttf, .otf, .woff, .woff2) and import it
 */
export async function importFontFromFile(
  file: File,
  customName?: string
): Promise<{ success: boolean; font?: CustomFontItem; error?: string }> {
  const allowedExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    return {
      success: false,
      error: `Unsupported font format "${ext}". Please upload a .ttf, .otf, .woff, or .woff2 file.`,
    };
  }

  let format: CustomFontItem['format'] = 'truetype';
  if (ext === '.otf') format = 'opentype';
  else if (ext === '.woff') format = 'woff';
  else if (ext === '.woff2') format = 'woff2';

  // Deriving font name: clean up file name or use custom provided name
  let fontName = customName?.trim();
  if (!fontName) {
    const rawName = file.name.substring(0, file.name.lastIndexOf('.'));
    // If file is named e.g. NokiaPureHeadlineBold or Nokia_Pure_Headline_Bold
    if (/nokia.*pure.*headline.*bold/i.test(rawName)) {
      fontName = 'Nokia Pure Headline Bold';
    } else if (/nokia.*pure.*headline/i.test(rawName)) {
      fontName = 'Nokia Pure Headline';
    } else {
      fontName = rawName
        .replace(/[-_]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
    }
  }

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const fontItem: CustomFontItem = {
      id: `font-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: fontName,
      fileName: file.name,
      fileSize: file.size,
      format,
      dataUrl,
      createdAt: new Date().toISOString(),
    };

    // Register with browser
    await registerCustomFont(fontItem.name, fontItem.dataUrl);

    // Save to IndexedDB
    await saveCustomFontToIndexedDB(fontItem);

    // Set as active font
    setActiveCardFont(fontItem.name);

    return { success: true, font: fontItem };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to parse font file.',
    };
  }
}

/**
 * Load and register all saved custom fonts from IndexedDB on startup
 */
export async function initializeCustomFonts(): Promise<CustomFontItem[]> {
  try {
    const fonts = await loadCustomFontsFromIndexedDB();
    for (const font of fonts) {
      if (font.name && font.dataUrl) {
        await registerCustomFont(font.name, font.dataUrl);
      }
    }
    return fonts;
  } catch (err) {
    console.warn('Error initializing saved custom fonts:', err);
    return [];
  }
}

/**
 * Remove an imported custom font
 */
export async function deleteCustomFont(id: string): Promise<boolean> {
  return deleteCustomFontFromIndexedDB(id);
}

/**
 * Get the currently active card font name from localStorage
 */
export function getActiveCardFont(): string {
  if (typeof window === 'undefined') return DEFAULT_CARD_FONT;
  try {
    return localStorage.getItem(FONT_STORAGE_ACTIVE_KEY) || DEFAULT_CARD_FONT;
  } catch {
    return DEFAULT_CARD_FONT;
  }
}

/**
 * Save active card font preference
 */
export function setActiveCardFont(fontName: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FONT_STORAGE_ACTIVE_KEY, fontName);
    // Broadcast event so UI updates immediately
    window.dispatchEvent(new CustomEvent('fayda-font-changed', { detail: { fontName } }));
  } catch {}
}
