/**
 * Lightweight native IndexedDB storage for Fayda ID Card Studio.
 * IndexedDB provides 50MB+ of durable browser storage, completely avoiding
 * the 5MB localStorage quota limit for template images and configurations.
 */

const DB_NAME = 'fayda_id_studio_db_v2';
const DB_VERSION = 2;
const STORE_TEMPLATES = 'numbered_templates';
const STORE_IMAGES = 'template_images';
const STORE_CUSTOM_FONTS = 'custom_fonts';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
          db.createObjectStore(STORE_TEMPLATES, { keyPath: 'number' });
        }
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES);
        }
        if (!db.objectStoreNames.contains(STORE_CUSTOM_FONTS)) {
          db.createObjectStore(STORE_CUSTOM_FONTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    } catch (err) {
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Save all numbered templates to IndexedDB
 */
export async function saveTemplatesToIndexedDB(templates: any[]): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TEMPLATES], 'readwrite');
      const store = tx.objectStore(STORE_TEMPLATES);

      // Clear and re-populate
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const t of templates) {
          store.put(t);
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => {
        console.warn('Failed to save templates to IndexedDB:', e);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB save templates failed:', err);
    return false;
  }
}

/**
 * Load all numbered templates from IndexedDB
 */
export async function loadTemplatesFromIndexedDB(): Promise<any[] | null> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TEMPLATES], 'readonly');
      const store = tx.objectStore(STORE_TEMPLATES);
      const req = store.getAll();

      req.onsuccess = () => {
        const result = req.result;
        if (Array.isArray(result) && result.length > 0) {
          resolve(result.sort((a, b) => a.number - b.number));
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB load templates failed:', err);
    return null;
  }
}

/**
 * Save a template image (front or back) to IndexedDB
 */
export async function saveImageToIndexedDB(key: string, dataUrl: string): Promise<boolean> {
  if (!dataUrl) return true;
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_IMAGES], 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      store.put(dataUrl, key);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

/**
 * Get a template image from IndexedDB
 */
export async function getImageFromIndexedDB(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_IMAGES], 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result || null);
      };

      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Save a custom imported font into IndexedDB
 */
export async function saveCustomFontToIndexedDB(font: any): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CUSTOM_FONTS], 'readwrite');
      const store = tx.objectStore(STORE_CUSTOM_FONTS);
      store.put(font);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('IndexedDB save font failed:', err);
    return false;
  }
}

/**
 * Load all custom imported fonts from IndexedDB
 */
export async function loadCustomFontsFromIndexedDB(): Promise<any[]> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CUSTOM_FONTS], 'readonly');
      const store = tx.objectStore(STORE_CUSTOM_FONTS);
      const req = store.getAll();

      req.onsuccess = () => {
        resolve(req.result || []);
      };

      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Delete a custom font from IndexedDB by id
 */
export async function deleteCustomFontFromIndexedDB(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CUSTOM_FONTS], 'readwrite');
      const store = tx.objectStore(STORE_CUSTOM_FONTS);
      store.delete(id);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

