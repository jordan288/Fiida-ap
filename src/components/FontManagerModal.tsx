import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Type,
  Upload,
  Check,
  CheckCircle2,
  Trash2,
  Sparkles,
  RefreshCw,
  Sliders,
  FileText,
  HelpCircle,
  Download,
} from 'lucide-react';
import { CustomFontItem } from '../types';
import {
  BUILT_IN_FONTS,
  DEFAULT_CARD_FONT,
  getFontFamilyCss,
  importFontFromFile,
  initializeCustomFonts,
  deleteCustomFont,
  getActiveCardFont,
  setActiveCardFont,
} from '../utils/fontManager';

interface FontManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeFontFamily: string;
  onSelectFont: (fontName: string) => void;
}

export const FontManagerModal: React.FC<FontManagerModalProps> = ({
  isOpen,
  onClose,
  activeFontFamily,
  onSelectFont,
}) => {
  const [customFonts, setCustomFonts] = useState<CustomFontItem[]>([]);
  const [selectedFont, setSelectedFont] = useState<string>(activeFontFamily || DEFAULT_CARD_FONT);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [previewSampleText, setPreviewSampleText] = useState<string>('ABEBE BIKILA DEMISSIE');
  const [previewAmharicText, setPreviewAmharicText] = useState<string>('በቀለ ቶሎሳ ዱሬሶ');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadFonts();
      setSelectedFont(activeFontFamily || getActiveCardFont() || DEFAULT_CARD_FONT);
      setUploadError(null);
      setUploadSuccess(null);
    }
  }, [isOpen, activeFontFamily]);

  const loadFonts = async () => {
    const fonts = await initializeCustomFonts();
    setCustomFonts(fonts);
  };

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const result = await importFontFromFile(file, customNameInput.trim() || undefined);
    setIsUploading(false);

    if (result.success && result.font) {
      setUploadSuccess(`Font "${result.font.name}" imported and activated successfully!`);
      setSelectedFont(result.font.name);
      onSelectFont(result.font.name);
      setCustomNameInput('');
      await loadFonts();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      setUploadError(result.error || 'Failed to import font file.');
    }
  };

  const handleChooseFont = (fontName: string) => {
    setSelectedFont(fontName);
    setActiveCardFont(fontName);
    onSelectFont(fontName);
  };

  const handleDeleteFont = async (id: string, fontName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete imported font "${fontName}"?`)) {
      await deleteCustomFont(id);
      if (selectedFont === fontName) {
        handleChooseFont(DEFAULT_CARD_FONT);
      }
      await loadFonts();
    }
  };

  const currentPreviewFontCss = getFontFamilyCss(selectedFont);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg">
              <Type className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Card Typography & Font Importer
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  {selectedFont === DEFAULT_CARD_FONT ? 'Nokia Pure Default' : 'Custom Active'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Use official Nokia Pure Headline Bold or import your own .ttf / .otf font file
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
          {/* Active Font Status Banner */}
          <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                Aa
              </div>
              <div>
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  Active ID Card Typeface
                </div>
                <div className="text-base font-bold text-emerald-950 flex items-center gap-2">
                  <span>{selectedFont}</span>
                  {selectedFont === DEFAULT_CARD_FONT && (
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-md font-semibold">
                      Standard Fayda Typography
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-300">
              Live in Preview & 300 DPI Export
            </span>
          </div>

          {/* Live Typography Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span>Live Font Preview</span>
              <span className="text-[11px] text-slate-500 font-mono">Font: {selectedFont}</span>
            </div>

            <div
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-inner space-y-2.5 transition-all"
              style={{ fontFamily: currentPreviewFontCss }}
            >
              <div>
                <div className="text-[11px] text-amber-900 font-bold uppercase tracking-wider mb-0.5">
                  ሙሉ ስም (Amharic Name)
                </div>
                <div className="text-xl font-bold text-slate-900">
                  {previewAmharicText}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-amber-900 font-bold uppercase tracking-wider mb-0.5">
                  Full Name (English Name)
                </div>
                <div className="text-lg font-bold text-slate-800">
                  {previewSampleText}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500 block font-normal">የትውልድ ቀን | Date of Birth:</span>
                  <span className="font-bold text-slate-900">11/06/1982 (19/02/1990)</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-normal">ፋይዳ መለያ | FAN Number:</span>
                  <span className="font-bold text-slate-900">6294 8103 9472 1503</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Upload / Import Custom Font */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                <span>Import Your Font (.ttf, .otf, .woff, .woff2)</span>
              </label>
              <span className="text-[11px] text-slate-400">Stored locally in browser</span>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2">
                <X className="w-4 h-4 text-red-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Font Label (e.g. Nokia Pure Headline Bold)"
                value={customNameInput}
                onChange={(e) => setCustomNameInput(e.target.value)}
                className="flex-1 px-3.5 py-2.5 text-xs bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <input
                type="file"
                ref={fileInputRef}
                accept=".ttf,.otf,.woff,.woff2"
                onChange={handleFileChange}
                className="hidden"
                id="font-file-input"
              />
              <label
                htmlFor="font-file-input"
                className={`px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isUploading ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Importing Font...' : 'Select Font File'}</span>
              </label>
            </div>
            <p className="text-[11px] text-gray-500">
              💡 Have <strong>Nokia Pure Headline Bold.ttf</strong> or <strong>.otf</strong> on your computer? Upload it here to use the exact typeface on cards and exports!
            </p>
          </div>

          {/* Section 2: Choose from Recommended & Built-In Typography */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
              Recommended & System Fonts
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BUILT_IN_FONTS.map((font) => {
                const isSelected = selectedFont === font.name;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => handleChooseFont(font.name)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          {font.name}
                        </span>
                        {font.recommended && (
                          <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-2">
                        {font.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                      <span
                        className="text-xs font-bold text-slate-800 truncate"
                        style={{ fontFamily: getFontFamilyCss(font.name) }}
                      >
                        Sample: Bekele Tolosa
                      </span>
                      {isSelected && (
                        <span className="text-emerald-600 font-bold flex items-center gap-0.5 text-[10px]">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Imported Custom Fonts */}
          {customFonts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wider block">
                  Your Uploaded Font Files ({customFonts.length})
                </label>
              </div>

              <div className="space-y-2">
                {customFonts.map((cf) => {
                  const isSelected = selectedFont === cf.name;
                  return (
                    <div
                      key={cf.id}
                      onClick={() => handleChooseFont(cf.name)}
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                          {cf.format.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span style={{ fontFamily: getFontFamilyCss(cf.name) }}>
                              {cf.name}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-2">
                            <span>{cf.fileName}</span>
                            <span>•</span>
                            <span>{(cf.fileSize / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteFont(cf.id, cf.name, e)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete imported font"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleChooseFont(DEFAULT_CARD_FONT)}
            className="text-xs text-gray-600 hover:text-emerald-700 font-semibold cursor-pointer underline flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset to Nokia Pure Headline Bold</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Done & Apply Font</span>
          </button>
        </div>
      </div>
    </div>
  );
};
