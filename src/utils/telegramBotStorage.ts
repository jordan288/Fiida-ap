import { TelegramBotPermanentSettings, TelegramColorScheme, CoordinatesConfig, TemplateConfig } from '../types';

export const STORAGE_KEY_TELEGRAM_BOT_SETTINGS = 'fayda_telegram_bot_permanent_settings_v1';

export const TELEGRAM_COLOR_SCHEMES: TelegramColorScheme[] = [
  {
    id: 'classic_slate',
    name: 'Classic Slate',
    textColor: '#0f172a',
    bgColor: '#f8fafc',
    accentColor: '#3b82f6',
    badge: 'Standard Official',
  },
  {
    id: 'high_contrast_black',
    name: 'High-Contrast Solid Black',
    textColor: '#000000',
    bgColor: '#ffffff',
    accentColor: '#18181b',
    badge: 'Ultra Crisp / Inkjet',
  },
  {
    id: 'emerald_green',
    name: 'Ethiopian Emerald',
    textColor: '#064e3b',
    bgColor: '#f0fdf4',
    accentColor: '#059669',
    badge: 'Green Theme',
  },
  {
    id: 'royal_navy',
    name: 'Royal Navy',
    textColor: '#1e3a8a',
    bgColor: '#eff6ff',
    accentColor: '#2563eb',
    badge: 'Navy Accent',
  },
  {
    id: 'gold_luxury',
    name: 'Imperial Gold & Warm Bronze',
    textColor: '#78350f',
    bgColor: '#fffbeb',
    accentColor: '#d97706',
    badge: 'Prestige',
  },
  {
    id: 'crimson_ruby',
    name: 'Crimson Ruby',
    textColor: '#881337',
    bgColor: '#fff1f2',
    accentColor: '#e11d48',
    badge: 'Vibrant',
  },
];

export const DEFAULT_TELEGRAM_BOT_SETTINGS: TelegramBotPermanentSettings = {
  botToken: '',
  botUsername: 'FaydaIdCardBot',
  activeTemplateNumber: 1,
  photoColorMode: 'color', // 'color' (Colored) or 'grayscale' (B&W)
  colorSchemeId: 'classic_slate',
  colorSchemeName: 'Classic Slate',
  primaryTextColor: '#0f172a',
  cardBackgroundColor: '#f8fafc',
  exportFileType: 'a4_pdf_5_per_page',
  mirrorVerificationPreview: true,
  mirrorPrintExport: true,
  autoProcessOnUpload: true,
  enableLiveWebhook: false,
  webhookUrl: '',
  updatedAt: new Date().toISOString(),
};

/**
 * Loads permanent Telegram Bot settings from persistent localStorage
 */
export function loadTelegramBotSettings(): TelegramBotPermanentSettings {
  if (typeof window === 'undefined') return DEFAULT_TELEGRAM_BOT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_BOT_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TELEGRAM_BOT_SETTINGS,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to load permanent Telegram Bot settings:', e);
  }
  return DEFAULT_TELEGRAM_BOT_SETTINGS;
}

/**
 * Saves permanent Telegram Bot settings to persistent localStorage and syncs with backend
 */
export function saveTelegramBotSettings(settings: Partial<TelegramBotPermanentSettings>): TelegramBotPermanentSettings {
  const current = loadTelegramBotSettings();
  const updated: TelegramBotPermanentSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_TELEGRAM_BOT_SETTINGS, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save Telegram Bot settings to localStorage:', e);
    }
  }

  // Also silently notify backend server
  try {
    fetch('/api/telegram/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {
      // Ignore network errors in dev/offline
    });
  } catch {}

  return updated;
}

/**
 * Applies the permanent color scheme to a CoordinatesConfig
 */
export function applyTelegramColorSchemeToCoordinates(
  coords: CoordinatesConfig,
  colorScheme: TelegramColorScheme | { textColor: string }
): CoordinatesConfig {
  const cloned: CoordinatesConfig = JSON.parse(JSON.stringify(coords));
  const textColor = colorScheme.textColor;

  if (cloned.fields) {
    for (const key of Object.keys(cloned.fields)) {
      if (cloned.fields[key]) {
        cloned.fields[key].color = textColor;
      }
    }
  }

  return cloned;
}

/**
 * Applies permanent color scheme to TemplateConfig
 */
export function applyTelegramColorSchemeToTemplateConfig(
  templateConfig: TemplateConfig,
  colorScheme: TelegramColorScheme
): TemplateConfig {
  return {
    ...templateConfig,
    backgroundColor: colorScheme.bgColor || templateConfig.backgroundColor,
  };
}
