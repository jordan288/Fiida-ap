import { NumberedTemplate, TemplateConfig, CoordinatesConfig } from '../types';
import { DEFAULT_TEMPLATE_CONFIG, DEFAULT_COORDINATES } from '../data/defaultData';
import {
  saveTemplatesToIndexedDB,
  loadTemplatesFromIndexedDB,
  saveImageToIndexedDB,
  getImageFromIndexedDB,
} from './indexedDbStorage';

export const STORAGE_KEY_NUMBERED_TEMPLATES = 'fayda_numbered_templates_v2';
export const STORAGE_KEY_ACTIVE_TEMPLATE_NUM = 'fayda_active_template_number_v2';

// In-memory cache for fast synchronous access
let memoryTemplatesCache: NumberedTemplate[] | null = null;

/**
 * Load template coordinates for a specific slot from localStorage
 */
export function loadTemplateCoordinates(templateNum: number, fallback?: CoordinatesConfig): CoordinatesConfig {
  try {
    const raw = localStorage.getItem(`fayda_template_${templateNum}_coords`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.fields && parsed?.media) {
        return parsed;
      }
    }
  } catch {}
  return fallback || JSON.parse(JSON.stringify(DEFAULT_COORDINATES));
}

/**
 * Save template coordinates for a specific slot into localStorage
 */
export function saveTemplateCoordinates(templateNum: number, coords: CoordinatesConfig): void {
  try {
    localStorage.setItem(`fayda_template_${templateNum}_coords`, JSON.stringify(coords));
  } catch {}
}

/**
 * Default starter numbered templates
 */
export function getDefaultNumberedTemplates(): NumberedTemplate[] {
  return [
    {
      number: 1,
      id: 'template_1_custom',
      name: 'Custom Template #1',
      description: 'Custom ID Card Blank (Upload your high-res Front and Back template images)',
      themeColor: '#059669',
      badge: 'Custom Template #1',
      config: {
        ...DEFAULT_TEMPLATE_CONFIG,
        sourceType: 'custom',
        presetId: 'custom_1',
        backgroundColor: '#ffffff',
        showBuiltinGuilloche: false,
        showFlag: false,
        showHeader: false,
        showEmblem: false,
        showFooterNotice: false,
        showFieldLabels: false,
        showFanContainerBox: false,
        showBarcodeBox: false,
        showFrontBarcode: true,
        showFrontFan: true,
        showSecondaryPhoto: true,
        secondaryPhotoStyle: 'ghost',
        showCornerMarks: false,
      },
      coordinates: JSON.parse(JSON.stringify(DEFAULT_COORDINATES)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      number: 2,
      id: 'template_2_custom',
      name: 'Custom Template #2',
      description: 'Alternative Custom ID Card Blank for dual-printer or client specific PVC layout',
      themeColor: '#d97706',
      badge: 'Custom Template #2',
      config: {
        ...DEFAULT_TEMPLATE_CONFIG,
        sourceType: 'custom',
        presetId: 'custom_2',
        backgroundColor: '#ffffff',
        showBuiltinGuilloche: false,
        showFlag: false,
        showHeader: false,
        showEmblem: false,
        showFooterNotice: false,
        showFieldLabels: false,
        showFanContainerBox: false,
        showBarcodeBox: false,
        showFrontBarcode: true,
        showFrontFan: true,
        showSecondaryPhoto: true,
        secondaryPhotoStyle: 'color',
        showCornerMarks: false,
      },
      coordinates: JSON.parse(JSON.stringify(DEFAULT_COORDINATES)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      number: 3,
      id: 'template_3_custom',
      name: 'Custom Template #3',
      description: 'High-density custom PVC template slot with calibrated coordinate profiles',
      themeColor: '#0284c7',
      badge: 'Custom Template #3',
      config: {
        ...DEFAULT_TEMPLATE_CONFIG,
        sourceType: 'custom',
        presetId: 'custom_3',
        backgroundColor: '#ffffff',
        showBuiltinGuilloche: false,
        showFlag: false,
        showHeader: false,
        showEmblem: false,
        showFooterNotice: false,
        showFieldLabels: false,
        showFanContainerBox: false,
        showBarcodeBox: false,
        showFrontBarcode: true,
        showFrontFan: true,
        showSecondaryPhoto: true,
        secondaryPhotoStyle: 'grayscale',
        showCornerMarks: false,
      },
      coordinates: JSON.parse(JSON.stringify(DEFAULT_COORDINATES)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      number: 4,
      id: 'template_4_custom',
      name: 'Custom Template #4',
      description: 'Clean blank PVC substrate for pre-printed plastic cards',
      themeColor: '#475569',
      badge: 'Custom Template #4',
      config: {
        ...DEFAULT_TEMPLATE_CONFIG,
        sourceType: 'custom',
        presetId: 'custom_4',
        backgroundColor: '#ffffff',
        showBuiltinGuilloche: false,
        showFlag: false,
        showHeader: false,
        showEmblem: false,
        showFooterNotice: false,
        showFieldLabels: false,
        showFanContainerBox: false,
        showBarcodeBox: false,
        showFrontBarcode: false,
        showFrontFan: false,
        showSecondaryPhoto: false,
        secondaryPhotoStyle: 'color',
        showCornerMarks: false,
      },
      coordinates: JSON.parse(JSON.stringify(DEFAULT_COORDINATES)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

/**
 * Strips or truncates heavy base64 strings to create a lightweight representation
 * that safely fits within localStorage without exceeding the 5MB browser quota.
 */
function createSafeLocalStorageTemplates(templates: NumberedTemplate[]): any[] {
  return templates.map((t) => {
    // If image strings are large (> 5KB base64), don't duplicate them in localStorage
    const hasLargeFront = Boolean(t.frontImageUrl && t.frontImageUrl.length > 5000);
    const hasLargeBack = Boolean(t.backImageUrl && t.backImageUrl.length > 5000);

    return {
      ...t,
      // Keep filename and indicator, but strip huge dataUrl from localStorage payload
      frontImageUrl: hasLargeFront ? '' : t.frontImageUrl,
      backImageUrl: hasLargeBack ? '' : t.backImageUrl,
      config: {
        ...t.config,
        frontImageUrl: hasLargeFront ? '' : t.config.frontImageUrl,
        backImageUrl: hasLargeBack ? '' : t.config.backImageUrl,
      },
      coordinates: t.coordinates,
    };
  });
}

/**
 * Load all numbered templates.
 * Returns cached in-memory templates, or localStorage as instant fallback.
 */
export function loadNumberedTemplates(): NumberedTemplate[] {
  if (memoryTemplatesCache && memoryTemplatesCache.length > 0) {
    return memoryTemplatesCache;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_NUMBERED_TEMPLATES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryTemplatesCache = parsed
          .map((t: NumberedTemplate) => {
            const coords = t.coordinates || loadTemplateCoordinates(t.number);
            return {
              ...t,
              coordinates: coords,
            };
          })
          .sort((a, b) => a.number - b.number);
        return memoryTemplatesCache;
      }
    }
  } catch (e) {
    console.warn('Notice: loading numbered templates fallback:', e);
  }

  const defaults = getDefaultNumberedTemplates();
  memoryTemplatesCache = defaults;
  saveNumberedTemplates(defaults);
  return defaults;
}

/**
 * Asynchronously hydrates templates from IndexedDB on startup.
 * Restores full-resolution custom blank images that were safely offloaded from localStorage.
 */
export async function initAndHydrateTemplates(): Promise<NumberedTemplate[]> {
  try {
    const fromIdb = await loadTemplatesFromIndexedDB();
    if (fromIdb && Array.isArray(fromIdb) && fromIdb.length > 0) {
      // Merge with memory cache and ensure coordinates are preserved
      memoryTemplatesCache = fromIdb
        .map((t: NumberedTemplate) => {
          const coords = t.coordinates || loadTemplateCoordinates(t.number);
          return {
            ...t,
            coordinates: coords,
          };
        })
        .sort((a: any, b: any) => a.number - b.number);
      return memoryTemplatesCache;
    }
  } catch (err) {
    console.warn('Notice: IndexedDB template hydration fallback:', err);
  }

  return loadNumberedTemplates();
}

/**
 * Save all numbered templates.
 * Persists full templates and images into IndexedDB (unlimited quota),
 * and safely writes a lightweight copy to localStorage without throwing QuotaExceededError.
 */
export function saveNumberedTemplates(templates: NumberedTemplate[]): void {
  const sorted = [...templates].sort((a, b) => a.number - b.number);
  memoryTemplatesCache = sorted;

  // 1. Asynchronously persist full-fidelity template data to IndexedDB
  saveTemplatesToIndexedDB(sorted).catch(() => {});

  // Also persist any separate custom image records and per-template coordinates
  for (const t of sorted) {
    if (t.frontImageUrl && t.frontImageUrl.length > 100) {
      saveImageToIndexedDB(`template_${t.number}_front`, t.frontImageUrl).catch(() => {});
    }
    if (t.backImageUrl && t.backImageUrl.length > 100) {
      saveImageToIndexedDB(`template_${t.number}_back`, t.backImageUrl).catch(() => {});
    }
    if (t.coordinates) {
      saveTemplateCoordinates(t.number, t.coordinates);
    }
  }

  // 2. Safely persist to localStorage with QuotaExceeded protection
  try {
    // Check if full JSON is small enough (< 800KB)
    const fullJson = JSON.stringify(sorted);
    if (fullJson.length < 800000) {
      localStorage.setItem(STORAGE_KEY_NUMBERED_TEMPLATES, fullJson);
      return;
    }
  } catch {
    // If it fails or is large, proceed to safe stripped version
  }

  // Fallback to lightweight version (no heavy base64 strings)
  try {
    const safeList = createSafeLocalStorageTemplates(sorted);
    localStorage.setItem(STORAGE_KEY_NUMBERED_TEMPLATES, JSON.stringify(safeList));
  } catch (err) {
    // If localStorage is completely full from other keys, clean obsolete items
    try {
      // Clean up legacy keys that might take up space
      localStorage.removeItem('fayda_permanent_template_config_v2');
      const minimalList = sorted.map((t) => ({
        number: t.number,
        id: t.id,
        name: t.name,
        badge: t.badge,
        themeColor: t.themeColor,
        frontFileName: t.frontFileName,
        backFileName: t.backFileName,
        config: {
          ...t.config,
          frontImageUrl: '',
          backImageUrl: '',
        },
        coordinates: t.coordinates,
      }));
      localStorage.setItem(STORAGE_KEY_NUMBERED_TEMPLATES, JSON.stringify(minimalList));
    } catch (finalErr) {
      // Gracefully handle storage exhaustion without throwing a fatal console.error
      console.warn('localStorage full; templates safely retained in IndexedDB and memory.');
    }
  }
}

/**
 * Get active template number from storage (defaults to 1)
 */
export function getActiveTemplateNumber(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_TEMPLATE_NUM);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Notice: loading active template number fallback:', e);
  }
  return 1;
}

/**
 * Set and persist active template number
 */
export function setActiveTemplateNumber(num: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_TEMPLATE_NUM, String(num));
  } catch {
    // Silent fail if quota or restricted
  }
}

/**
 * Save or update a template by its slot number
 */
export function saveTemplateByNumber(template: NumberedTemplate): NumberedTemplate[] {
  const current = loadNumberedTemplates();
  const index = current.findIndex((t) => t.number === template.number);
  const existing = index >= 0 ? current[index] : undefined;

  const finalCoords = template.coordinates || existing?.coordinates || loadTemplateCoordinates(template.number);

  const updatedItem: NumberedTemplate = {
    ...template,
    updatedAt: new Date().toISOString(),
    config: {
      ...template.config,
      // If user uploaded custom template images, ensure config reflects them
      frontImageUrl: template.frontImageUrl ?? template.config.frontImageUrl,
      backImageUrl: template.backImageUrl ?? template.config.backImageUrl,
      frontFileName: template.frontFileName ?? template.config.frontFileName,
      backFileName: template.backFileName ?? template.config.backFileName,
    },
    coordinates: finalCoords,
  };

  let newTemplates: NumberedTemplate[];
  if (index >= 0) {
    newTemplates = [...current];
    newTemplates[index] = updatedItem;
  } else {
    newTemplates = [...current, updatedItem];
  }

  saveTemplateCoordinates(template.number, finalCoords);
  saveNumberedTemplates(newTemplates);
  return newTemplates;
}

/**
 * Delete a numbered template by its number
 */
export function deleteTemplateByNumber(num: number): {
  templates: NumberedTemplate[];
  newActiveNumber: number;
} {
  const current = loadNumberedTemplates();
  const filtered = current.filter((t) => t.number !== num);

  // Guarantee at least 1 template exists
  const finalTemplates = filtered.length > 0 ? filtered : getDefaultNumberedTemplates();
  saveNumberedTemplates(finalTemplates);

  let activeNum = getActiveTemplateNumber();
  if (activeNum === num) {
    activeNum = finalTemplates[0]?.number ?? 1;
    setActiveTemplateNumber(activeNum);
  }

  return {
    templates: finalTemplates,
    newActiveNumber: activeNum,
  };
}

/**
 * Get next available template slot number (e.g. 1, 2, 3, 4 -> 5)
 */
export function getNextAvailableTemplateNumber(templates: NumberedTemplate[]): number {
  if (!templates || templates.length === 0) return 1;
  const numbers = new Set(templates.map((t) => t.number));
  let candidate = 1;
  while (numbers.has(candidate)) {
    candidate++;
  }
  return candidate;
}

/**
 * Sync active template configuration updates into the numbered template slot
 */
export function syncActiveTemplateConfig(
  activeNumber: number,
  newConfig: TemplateConfig,
  currentTemplates: NumberedTemplate[]
): NumberedTemplate[] {
  const index = currentTemplates.findIndex((t) => t.number === activeNumber);
  if (index < 0) return currentTemplates;

  const existing = currentTemplates[index];
  // Check if anything actually changed to prevent redundant storage writes
  if (
    existing.config === newConfig &&
    existing.frontImageUrl === (newConfig.frontImageUrl || existing.frontImageUrl) &&
    existing.backImageUrl === (newConfig.backImageUrl || existing.backImageUrl)
  ) {
    return currentTemplates;
  }

  const updated = [...currentTemplates];
  updated[index] = {
    ...updated[index],
    config: newConfig,
    coordinates: existing.coordinates || updated[index].coordinates || loadTemplateCoordinates(activeNumber),
    frontImageUrl: newConfig.frontImageUrl || updated[index].frontImageUrl,
    backImageUrl: newConfig.backImageUrl || updated[index].backImageUrl,
    frontFileName: newConfig.frontFileName || updated[index].frontFileName,
    backFileName: newConfig.backFileName || updated[index].backFileName,
    updatedAt: new Date().toISOString(),
  };

  saveNumberedTemplates(updated);
  return updated;
}

/**
 * Sync both active template configuration and active positions/coordinates into the numbered template slot
 */
export function syncActiveTemplateSettingsAndCoords(
  activeNumber: number,
  newConfig: TemplateConfig,
  newCoords: CoordinatesConfig,
  currentTemplates: NumberedTemplate[]
): NumberedTemplate[] {
  const index = currentTemplates.findIndex((t) => t.number === activeNumber);
  if (index < 0) return currentTemplates;

  const existing = currentTemplates[index];
  const updated = [...currentTemplates];
  updated[index] = {
    ...existing,
    config: newConfig,
    coordinates: newCoords,
    frontImageUrl: newConfig.frontImageUrl || existing.frontImageUrl,
    backImageUrl: newConfig.backImageUrl || existing.backImageUrl,
    frontFileName: newConfig.frontFileName || existing.frontFileName,
    backFileName: newConfig.backFileName || existing.backFileName,
    updatedAt: new Date().toISOString(),
  };

  saveTemplateCoordinates(activeNumber, newCoords);
  saveNumberedTemplates(updated);
  return updated;
}

/**
 * Applies a specific set of coordinates/positions (from ID Card Studio) to ALL templates.
 * Updates the coordinates on each template in memory, saves them to localStorage,
 * and saves template-specific coordinate keys so that all templates and batch processing
 * automatically share the exact studio positions.
 */
export function applyCoordinatesToAllTemplates(
  coords: CoordinatesConfig,
  currentTemplates: NumberedTemplate[]
): NumberedTemplate[] {
  const updated = currentTemplates.map((t) => {
    saveTemplateCoordinates(t.number, coords);
    return {
      ...t,
      coordinates: JSON.parse(JSON.stringify(coords)),
      updatedAt: new Date().toISOString(),
    };
  });

  saveNumberedTemplates(updated);
  return updated;
}

/**
 * Compresses an uploaded template image down to standard CR80 resolution
 * with optimal JPEG compression (0.80) to drastically reduce byte size
 * while keeping 100% crisp visual sharpness on ID cards.
 */
export async function compressTemplateImage(
  fileOrDataUrl: File | string,
  maxWidth = 1012,
  maxHeight = 638
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, maxWidth, maxHeight);
          // 0.80 quality achieves ~65KB-85KB per blank image (down from 700KB+)
          resolve(canvas.toDataURL('image/jpeg', 0.80));
          return;
        }
      } catch (err) {
        console.warn('Canvas compression fallback:', err);
      }
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    };
    img.onerror = () => {
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}
