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
  Layers,
  FlipHorizontal,
  Palette,
  Archive,
} from 'lucide-react';
import { AppSettings, NumberedTemplate } from '../types';
import {
  loadNumberedTemplates,
  getActiveTemplateNumber,
  setActiveTemplateNumber,
} from '../utils/templateStorage';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultExportFormat: 'pdf',
  pdfFormat: 'a4_sheet',
  jpegLayout: 'combined_sheet',
  jpegQuality: 0.98,
  resolutionDpi: 300,
  includeCropMarks: true,
  includeMetadataHeader: true,
  autoSavePreference: true,
  mirrorPrint: false,
  fileType: 'pdf',
  photoColorMode: 'color',
  activeTemplateNumber: 1,
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
    console.warn('Failed to save app settings to localStorage:', e);
  }
}

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  numberedTemplates?: NumberedTemplate[];
  activeTemplateNumber?: number;
  onSelectTemplateNumber?: (templateNum: number) => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  numberedTemplates: propTemplates,
  activeTemplateNumber: propActiveTemplateNum,
  onSelectTemplateNumber,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(() => {
    const saved = loadSavedAppSettings();
    return {
      ...saved,
      ...settings,
      activeTemplateNumber: propActiveTemplateNum || saved.activeTemplateNumber || getActiveTemplateNumber() || 1,
    };
  });

  const [selectedTemplateNum, setSelectedTemplateNum] = useState<number>(() => {
    return propActiveTemplateNum || localSettings.activeTemplateNumber || getActiveTemplateNumber() || 1;
  });

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Available templates list (Templates 1 to 6)
  const availableTemplates = propTemplates && propTemplates.length > 0
    ? propTemplates
    : loadNumberedTemplates();

  if (!isOpen) return null;

  const handleSave = () => {
    const updatedSettings: AppSettings = {
      ...localSettings,
      activeTemplateNumber: selectedTemplateNum,
    };

    saveAppSettingsToStorage(updatedSettings);
    setActiveTemplateNumber(selectedTemplateNum);

    if (onSelectTemplateNumber) {
      onSelectTemplateNumber(selectedTemplateNum);
    }

    onSaveSettings(updatedSettings);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 450);
  };

  const fileTypeOptions = [
    {
      id: 'pdf',
      label: 'PDF Document',
      desc: 'ISO A4 Sheet (5 cards/sheet) or CR80 dual-page',
      icon: FileText,
      badge: 'Recommended',
    },
    {
      id: 'png',
      label: 'High-Res PNG',
      desc: '300/600 DPI crisp raster for plastic thermal printers',
      icon: ImageIcon,
      badge: 'Lossless',
    },
    {
      id: 'jpeg',
      label: 'JPEG Photo Sheet',
      desc: 'Standard JPEG export with custom DPI & quality',
      icon: Sparkles,
      badge: 'Fast',
    },
    {
      id: 'zip',
      label: 'ZIP Archive',
      desc: 'Individual high-definition front & back card images',
      icon: Archive,
      badge: 'Batch',
    },
  ];

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
                  Global Configuration
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure default templates, file formats, and mirror/non-mirror layout options
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
        <div className="p-6 overflow-y-auto flex-1 space-y-7">
          
          {/* Section 1: Template Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                1. Active ID Card Template
              </label>
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Currently Active: Template #{selectedTemplateNum}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Select which security design or substrate blank to use for single and batch ID printing:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              {availableTemplates.map((tpl) => {
                const isSelected = selectedTemplateNum === tpl.number;
                return (
                  <button
                    key={tpl.number}
                    type="button"
                    onClick={() => setSelectedTemplateNum(tpl.number)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/30 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tpl.themeColor || '#059669' }}
                      />
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-gray-900">
                        Template #{tpl.number}
                      </div>
                      <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
                        {tpl.name || `Design Slot ${tpl.number}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Default File Type */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-600" />
              2. Default Export File Type
            </label>
            <p className="text-[11px] text-gray-500">
              Choose the primary file format used when clicking export or downloading compiled sheets:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {fileTypeOptions.map((opt) => {
                const isSelected = (localSettings.fileType || localSettings.defaultExportFormat) === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        fileType: opt.id as any,
                        defaultExportFormat: opt.id === 'jpeg' ? 'jpeg' : 'pdf',
                      }))
                    }
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/25 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                          {opt.label}
                          <span className="text-[9px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded">
                            {opt.badge}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Mirror vs Non-Mirror Options */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <FlipHorizontal className="w-4 h-4 text-emerald-600" />
              3. Print Layout (Mirror vs Non-Mirror)
            </label>
            <p className="text-[11px] text-gray-500">
              For PVC thermal pouch lamination, mirrored printing flips the card horizontally so the ink is protected behind the clear film layer:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A: Non-Mirror */}
              <button
                type="button"
                onClick={() => setLocalSettings((prev) => ({ ...prev, mirrorPrint: false }))}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  !localSettings.mirrorPrint
                    ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/25 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-xs">
                      📄
                    </div>
                    <span className="font-bold text-xs text-gray-900">Standard (Non-Mirror)</span>
                  </div>
                  {!localSettings.mirrorPrint && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="text-[10px] text-gray-500 leading-snug">
                  Direct print mode for standard inkjet paper, photo paper, or direct-to-card PVC printers.
                </p>
              </button>

              {/* Option B: Mirror */}
              <button
                type="button"
                onClick={() => setLocalSettings((prev) => ({ ...prev, mirrorPrint: true }))}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  localSettings.mirrorPrint
                    ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/25 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                      🪞
                    </div>
                    <span className="font-bold text-xs text-gray-900">Mirrored (PVC Print)</span>
                  </div>
                  {localSettings.mirrorPrint && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="text-[10px] text-gray-500 leading-snug">
                  Inverts the horizontal layout for reverse film printing, dragon sheet, and heat lamination.
                </p>
              </button>
            </div>
          </div>

          {/* Section 4: Photo Color Mode */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-emerald-600" />
              4. Photo Color Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocalSettings((prev) => ({ ...prev, photoColorMode: 'color' }))}
                className={`p-3 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                  localSettings.photoColorMode !== 'grayscale'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
              >
                🎨 Full Vibrant Color
                <span className="block text-[10px] font-normal opacity-85 mt-0.5">High fidelity RGB color</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSettings((prev) => ({ ...prev, photoColorMode: 'grayscale' }))}
                className={`p-3 rounded-xl border text-center text-xs font-bold transition-all cursor-pointer ${
                  localSettings.photoColorMode === 'grayscale'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
              >
                ⬛ B&W Laser / Grayscale
                <span className="block text-[10px] font-normal opacity-85 mt-0.5">High-contrast monochrome</span>
              </button>
            </div>
          </div>

          {/* Section 5: Resolution DPI Selection */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <span className="text-xs font-semibold text-gray-800 block">Output Print Density</span>
              <span className="text-[11px] text-gray-500">Raster supersampling resolution</span>
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

          {/* Section 6: Crop Marks / Header switches */}
          <div className="pt-2 border-t border-gray-100 space-y-2.5">
            <label className="flex items-center justify-between text-xs text-gray-800 font-semibold cursor-pointer">
              <span>Include Official Ethiopian Header Banner</span>
              <input
                type="checkbox"
                checked={Boolean(localSettings.includeMetadataHeader)}
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
                checked={Boolean(localSettings.includeCropMarks)}
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

          {savedSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-emerald-900 text-xs font-semibold animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Settings and Template preferences saved permanently!</span>
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
