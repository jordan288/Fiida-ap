import React, { useState } from 'react';
import {
  X,
  Settings,
  FileText,
  Image as ImageIcon,
  Check,
  Save,
  CheckCircle2,
  Sliders,
  Printer,
  Sparkles,
  Shield,
  Layers
} from 'lucide-react';
import { AppSettings } from '../types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultExportFormat: 'pdf',
  pdfFormat: 'a4_sheet',
  jpegLayout: 'combined_sheet',
  jpegQuality: 0.98,
  resolutionDpi: 300,
  includeCropMarks: true,
  includeMetadataHeader: true,
  autoSavePreference: true,
};

const STORAGE_KEY = 'fayda_app_settings';

export function loadSavedAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_APP_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load app settings from localStorage:', e);
  }
  return DEFAULT_APP_SETTINGS;
}

export function saveAppSettingsToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save app settings to localStorage:', e);
  }
}

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    saveAppSettingsToStorage(localSettings);
    onSaveSettings(localSettings);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                System Export & Output Settings
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  Permanent Preference
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Choose your default format (PDF vs JPEG) once for all future ID downloads
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Section 1: Default Export Format (PDF vs JPEG) */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              1. Default Export Format (Once for All Time)
            </label>
            <p className="text-[11px] text-gray-500">
              When you click &quot;Export ID&quot; or download cards, this format is automatically used.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option A: PDF */}
              <button
                type="button"
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    defaultExportFormat: 'pdf',
                  }))
                }
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  localSettings.defaultExportFormat === 'pdf'
                    ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/25 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">PDF Document</span>
                  </div>
                  {localSettings.defaultExportFormat === 'pdf' && (
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 leading-snug">
                  High-res print-ready PDF document (.pdf) formatted for ISO A4 or direct thermal CR80 PVC printers.
                </p>
                <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                  <Printer className="w-3 h-3" />
                  <span>Standard for Print Shops</span>
                </div>
              </button>

              {/* Option B: JPEG */}
              <button
                type="button"
                onClick={() =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    defaultExportFormat: 'jpeg',
                  }))
                }
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  localSettings.defaultExportFormat === 'jpeg'
                    ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/25 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold text-xs">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-gray-900">JPEG HD Image</span>
                  </div>
                  {localSettings.defaultExportFormat === 'jpeg' && (
                    <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 leading-snug">
                  Direct high-quality 300 DPI JPEG image file (.jpg) of the complete ID card with official verification header.
                </p>
                <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-cyan-800 bg-cyan-100/70 px-2 py-0.5 rounded-md">
                  <Sparkles className="w-3 h-3" />
                  <span>Universal Mobile & Photo Ready</span>
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: Format Sub-Configurations */}
          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-200/90 space-y-4">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              2. Layout & Quality Preferences
            </label>

            {/* If PDF is chosen */}
            {localSettings.defaultExportFormat === 'pdf' && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-800 block">Default PDF Layout</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalSettings((prev) => ({ ...prev, pdfFormat: 'a4_sheet' }))}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      localSettings.pdfFormat === 'a4_sheet'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    ISO A4 Print Sheet
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">Front & Back centered on A4</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocalSettings((prev) => ({ ...prev, pdfFormat: 'cr80_dual' }))}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      localSettings.pdfFormat === 'cr80_dual'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Direct CR80 Dual-Page
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">85.60 × 53.98 mm cards</span>
                  </button>
                </div>
              </div>
            )}

            {/* If JPEG is chosen */}
            {localSettings.defaultExportFormat === 'jpeg' && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-800 block">Default JPEG Layout</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalSettings((prev) => ({ ...prev, jpegLayout: 'combined_sheet' }))}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      localSettings.jpegLayout === 'combined_sheet'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Complete ID Sheet (Front + Back)
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">Side-by-side with header</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocalSettings((prev) => ({ ...prev, jpegLayout: 'both_files' }))}
                    className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      localSettings.jpegLayout === 'both_files'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Separate Front & Back JPEGs
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">Individual image files</span>
                  </button>
                </div>
              </div>
            )}

            {/* Resolution DPI Selection */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <div>
                <span className="text-xs font-semibold text-gray-800 block">Output Resolution</span>
                <span className="text-[11px] text-gray-500">Raster supersampling density</span>
              </div>
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setLocalSettings((prev) => ({ ...prev, resolutionDpi: 300 }))}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    localSettings.resolutionDpi === 300
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  300 DPI (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => setLocalSettings((prev) => ({ ...prev, resolutionDpi: 600 }))}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    localSettings.resolutionDpi === 600
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  600 DPI (Ultra)
                </button>
              </div>
            </div>

            {/* Crop Marks / Header switches */}
            <div className="pt-2 border-t border-gray-200 space-y-2">
              <label className="flex items-center justify-between text-xs text-gray-800 font-semibold cursor-pointer">
                <span>Include Official Ethiopian Header Banner</span>
                <input
                  type="checkbox"
                  checked={localSettings.includeMetadataHeader}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      includeMetadataHeader: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-gray-800 font-semibold cursor-pointer">
                <span>Include Precision Corner Crop Marks (Cutting Guides)</span>
                <input
                  type="checkbox"
                  checked={localSettings.includeCropMarks}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      includeCropMarks: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-emerald-600 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {savedSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-emerald-900 text-xs font-semibold animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Settings saved permanently to your browser storage!</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Preference Once for All Time
          </button>
        </div>
      </div>
    </div>
  );
};
