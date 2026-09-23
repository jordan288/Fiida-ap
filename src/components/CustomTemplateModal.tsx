import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Layers, 
  Trash2, 
  Eye, 
  Sparkles, 
  Check, 
  X, 
  Sliders, 
  Download, 
  FileCheck, 
  ExternalLink,
  ShieldAlert,
  Palette,
  LayoutTemplate,
  Crosshair,
  Scan,
  Hash
} from 'lucide-react';
import { TemplateConfig, TemplatePreset, NumberedTemplate, CoordinatesConfig } from '../types';
import { PRESET_TEMPLATES, DEFAULT_TEMPLATE_CONFIG } from '../data/defaultData';
import { NumberedTemplatesManager } from './NumberedTemplatesManager';
import { 
  loadNumberedTemplates, 
  saveNumberedTemplates, 
  getActiveTemplateNumber, 
  setActiveTemplateNumber 
} from '../utils/templateStorage';

interface CustomTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateConfig: TemplateConfig;
  setTemplateConfig: React.Dispatch<React.SetStateAction<TemplateConfig>>;
  config?: CoordinatesConfig;
  setConfig?: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  activeTemplateNumber?: number;
  onSelectTemplateNumber?: (num: number) => void;
  numberedTemplates?: NumberedTemplate[];
  onUpdateNumberedTemplates?: (templates: NumberedTemplate[]) => void;
}

export const CustomTemplateModal: React.FC<CustomTemplateModalProps> = ({
  isOpen,
  onClose,
  templateConfig,
  setTemplateConfig,
  config,
  setConfig,
  activeTemplateNumber: propActiveNum,
  onSelectTemplateNumber: propOnSelectNum,
  numberedTemplates: propNumberedTemplates,
  onUpdateNumberedTemplates: propOnUpdateTemplates,
}) => {
  const [activeTab, setActiveTab] = useState<'numbered' | 'upload' | 'layers'>('numbered');
  const [frontDragActive, setFrontDragActive] = useState(false);
  const [backDragActive, setBackDragActive] = useState(false);
  const [urlInputFront, setUrlInputFront] = useState('');
  const [urlInputBack, setUrlInputBack] = useState('');

  // Fallback state if props aren't provided
  const [internalNumberedTemplates, setInternalNumberedTemplates] = useState<NumberedTemplate[]>(() =>
    loadNumberedTemplates()
  );
  const [internalActiveNum, setInternalActiveNum] = useState<number>(() =>
    getActiveTemplateNumber()
  );

  const activeNum = propActiveNum ?? internalActiveNum;
  const templatesList = propNumberedTemplates ?? internalNumberedTemplates;

  const handleSelectTemplateNumber = (num: number) => {
    if (propOnSelectNum) {
      propOnSelectNum(num);
    } else {
      setActiveTemplateNumber(num);
      setInternalActiveNum(num);
      const target = templatesList.find((t) => t.number === num);
      if (target) {
        setTemplateConfig(target.config);
        if (target.coordinates && setConfig) {
          setConfig(target.coordinates);
        }
      }
    }
  };

  const handleUpdateTemplates = (updated: NumberedTemplate[]) => {
    if (propOnUpdateTemplates) {
      propOnUpdateTemplates(updated);
    } else {
      saveNumberedTemplates(updated);
      setInternalNumberedTemplates(updated);
    }
  };

  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Strips all synthetic graphic layers and built-in labels so only the custom template and fields are used
  const applyPureTemplateCorrectionMode = () => {
    setTemplateConfig((prev) => ({
      ...prev,
      sourceType: 'custom',
      showBuiltinGuilloche: false,
      showHeader: false,
      showFlag: false,
      showEmblem: false,
      showFooterNotice: false,
      showFieldLabels: false,
      showFanContainerBox: false,
      showBarcodeBox: false,
      showCornerMarks: false,
      showNationality: false,
    }));
  };

  const handleFileUpload = (file: File, side: 'front' | 'back') => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WEBP, or SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setTemplateConfig((prev) => ({
        ...prev,
        sourceType: 'custom',
        [side === 'front' ? 'frontImageUrl' : 'backImageUrl']: dataUrl,
        [side === 'front' ? 'frontFileName' : 'backFileName']: file.name,
        // When adding templates, just take the template as the canvas!
        showBuiltinGuilloche: false,
        showHeader: false,
        showFlag: false,
        showEmblem: false,
        showFooterNotice: false,
        showFieldLabels: false,
        showFanContainerBox: false,
        showBarcodeBox: false,
        showCornerMarks: false,
        showNationality: false,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleApplyPreset = (preset: TemplatePreset) => {
    setTemplateConfig((prev) => ({
      ...prev,
      ...preset.config,
      presetId: preset.id,
      sourceType: preset.config.sourceType || 'preset',
    }));
  };

  const handleClearCustomTemplate = (side: 'front' | 'back') => {
    setTemplateConfig((prev) => ({
      ...prev,
      [side === 'front' ? 'frontImageUrl' : 'backImageUrl']: '',
      [side === 'front' ? 'frontFileName' : 'backFileName']: '',
      sourceType: (side === 'front' ? prev.backImageUrl : prev.frontImageUrl) ? 'custom' : 'builtIn',
    }));
  };

  const handleResetToDefault = () => {
    setTemplateConfig(DEFAULT_TEMPLATE_CONFIG);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Insert & Manage Custom Templates
                <span className="text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Front & Back
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload your own empty card background templates or pick from pre-configured security blanks.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800 bg-slate-900/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab('numbered')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'numbered'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Hash className="w-3.5 h-3.5 text-emerald-400" />
            <span>Numbered Templates ({templatesList.length})</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-mono font-bold">
              Active #{activeNum}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'upload'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Blank Images</span>
            {(templateConfig.frontImageUrl || templateConfig.backImageUrl) && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('layers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'layers'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Layer & Label Controls</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
          
          {/* ================= TAB: NUMBERED TEMPLATES (SAVED BY NUMBER) ================= */}
          {activeTab === 'numbered' && (
            <NumberedTemplatesManager
              currentConfig={templateConfig}
              setTemplateConfig={setTemplateConfig}
              currentCoordinates={config}
              setCoordinates={setConfig}
              activeTemplateNumber={activeNum}
              onSelectTemplateNumber={handleSelectTemplateNumber}
              numberedTemplates={templatesList}
              onUpdateNumberedTemplates={handleUpdateTemplates}
              onClose={onClose}
            />
          )}

          {/* ================= TAB 1: UPLOAD TEMPLATES ================= */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              {/* Position Correction Mode Notice & Action Banner */}
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <Scan className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-emerald-200">Position Correction & Just Template Mode</strong>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-1.5 py-0.2 rounded border border-emerald-500/30">
                        Corners (0,0) - (1012,638)
                      </span>
                    </div>
                    <p className="text-emerald-300/80 text-[11px] mt-0.5">
                      When adding templates, all synthetic built-in layers and headers are automatically cleared so <strong>only your template</strong> is used, and the 4 template corners are marked for exact position correction.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyPureTemplateCorrectionMode}
                  className="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer text-xs"
                  title="Strip all built-in background graphics, headers, and labels to use just the template"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Take Just Template</span>
                </button>
              </div>

              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-300">
                <FileCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Template Tip:</strong> Upload high-resolution empty background templates (ideal ratio 1012×638 px / CR80 standard 85.6mm×53.98mm). The 4-corner calibration markers will outline your template corners accurately.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* --- FRONT SIDE TEMPLATE UPLOAD --- */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <h3 className="font-bold text-sm text-white">Front Side Template</h3>
                      </div>
                      {templateConfig.frontImageUrl && (
                        <button
                          onClick={() => handleClearCustomTemplate('front')}
                          className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Preview Box or Drag Zone */}
                    {templateConfig.frontImageUrl ? (
                      <div className="relative aspect-[1012/638] rounded-xl overflow-hidden border border-emerald-500/40 bg-slate-900 group shadow-md">
                        <img
                          src={templateConfig.frontImageUrl}
                          alt="Front Template Preview"
                          className="w-full h-full object-cover"
                        />
                        {/* 4 Corner Markers on Preview Thumbnail */}
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400 shadow-sm" />
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400 shadow-sm" />
                          <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400 shadow-sm" />
                          <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400 shadow-sm" />
                          <span className="absolute top-1.5 left-4 bg-slate-950/80 text-[8px] font-mono text-emerald-300 px-1 rounded">
                            (0,0)
                          </span>
                          <span className="absolute top-1.5 right-4 bg-slate-950/80 text-[8px] font-mono text-emerald-300 px-1 rounded">
                            (1012,0)
                          </span>
                          <span className="absolute bottom-1.5 left-4 bg-slate-950/80 text-[8px] font-mono text-emerald-300 px-1 rounded">
                            (0,638)
                          </span>
                          <span className="absolute bottom-1.5 right-4 bg-slate-950/80 text-[8px] font-mono text-emerald-300 px-1 rounded">
                            (1012,638)
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity">
                          <button
                            onClick={() => frontFileInputRef.current?.click()}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Replace
                          </button>
                          <button
                            onClick={() => handleClearCustomTemplate('front')}
                            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-xs text-[10px] font-mono text-emerald-300 px-2 py-0.5 rounded">
                          {templateConfig.frontFileName || 'Custom Front Active'}
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setFrontDragActive(true);
                        }}
                        onDragLeave={() => setFrontDragActive(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setFrontDragActive(false);
                          if (e.dataTransfer.files?.[0]) {
                            handleFileUpload(e.dataTransfer.files[0], 'front');
                          }
                        }}
                        onClick={() => frontFileInputRef.current?.click()}
                        className={`aspect-[1012/638] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
                          frontDragActive
                            ? 'border-emerald-400 bg-emerald-500/10'
                            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/80'
                        }`}
                      >
                        <input
                          ref={frontFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleFileUpload(e.target.files[0], 'front');
                            }
                          }}
                        />
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center mb-2">
                          <Upload className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-200">
                          Drop Front Template Here
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          PNG, JPG, WEBP, or SVG (1012×638 px)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* URL Input Fallback */}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">
                      Or Paste Image URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://.../front_template.png"
                        value={urlInputFront || ''}
                        onChange={(e) => setUrlInputFront(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={() => {
                          if (urlInputFront.trim()) {
                            setTemplateConfig((prev) => ({
                              ...prev,
                              sourceType: 'custom',
                              frontImageUrl: urlInputFront.trim(),
                              frontFileName: 'Web URL Template',
                              showBuiltinGuilloche: false,
                              showHeader: false,
                              showFlag: false,
                              showEmblem: false,
                              showFooterNotice: false,
                              showFieldLabels: false,
                              showFanContainerBox: false,
                              showBarcodeBox: false,
                              showCornerMarks: true,
                            }));
                            setUrlInputFront('');
                          }
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 px-3 py-1 rounded-lg cursor-pointer transition-colors"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>

                {/* --- BACK SIDE TEMPLATE UPLOAD --- */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                        <h3 className="font-bold text-sm text-white">Back Side Template</h3>
                      </div>
                      {templateConfig.backImageUrl && (
                        <button
                          onClick={() => handleClearCustomTemplate('back')}
                          className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Preview Box or Drag Zone */}
                    {templateConfig.backImageUrl ? (
                      <div className="relative aspect-[1012/638] rounded-xl overflow-hidden border border-cyan-500/40 bg-slate-900 group shadow-md">
                        <img
                          src={templateConfig.backImageUrl}
                          alt="Back Template Preview"
                          className="w-full h-full object-cover"
                        />
                        {/* 4 Corner Markers on Preview Thumbnail */}
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400 shadow-sm" />
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400 shadow-sm" />
                          <div className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400 shadow-sm" />
                          <div className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400 shadow-sm" />
                          <span className="absolute top-1.5 left-4 bg-slate-950/80 text-[8px] font-mono text-cyan-300 px-1 rounded">
                            (0,0)
                          </span>
                          <span className="absolute top-1.5 right-4 bg-slate-950/80 text-[8px] font-mono text-cyan-300 px-1 rounded">
                            (1012,0)
                          </span>
                          <span className="absolute bottom-1.5 left-4 bg-slate-950/80 text-[8px] font-mono text-cyan-300 px-1 rounded">
                            (0,638)
                          </span>
                          <span className="absolute bottom-1.5 right-4 bg-slate-950/80 text-[8px] font-mono text-cyan-300 px-1 rounded">
                            (1012,638)
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity">
                          <button
                            onClick={() => backFileInputRef.current?.click()}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Replace
                          </button>
                          <button
                            onClick={() => handleClearCustomTemplate('back')}
                            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-xs text-[10px] font-mono text-cyan-300 px-2 py-0.5 rounded">
                          {templateConfig.backFileName || 'Custom Back Active'}
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setBackDragActive(true);
                        }}
                        onDragLeave={() => setBackDragActive(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setBackDragActive(false);
                          if (e.dataTransfer.files?.[0]) {
                            handleFileUpload(e.dataTransfer.files[0], 'back');
                          }
                        }}
                        onClick={() => backFileInputRef.current?.click()}
                        className={`aspect-[1012/638] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all ${
                          backDragActive
                            ? 'border-cyan-400 bg-cyan-500/10'
                            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/80'
                        }`}
                      >
                        <input
                          ref={backFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleFileUpload(e.target.files[0], 'back');
                            }
                          }}
                        />
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center mb-2">
                          <Upload className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-200">
                          Drop Back Template Here
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          PNG, JPG, WEBP, or SVG (1012×638 px)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* URL Input Fallback */}
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">
                      Or Paste Image URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://.../back_template.png"
                        value={urlInputBack || ''}
                        onChange={(e) => setUrlInputBack(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={() => {
                          if (urlInputBack.trim()) {
                            setTemplateConfig((prev) => ({
                              ...prev,
                              sourceType: 'custom',
                              backImageUrl: urlInputBack.trim(),
                              backFileName: 'Web URL Template',
                              showBuiltinGuilloche: false,
                              showHeader: false,
                              showFlag: false,
                              showEmblem: false,
                              showFooterNotice: false,
                              showFieldLabels: false,
                              showFanContainerBox: false,
                              showBarcodeBox: false,
                              showCornerMarks: true,
                            }));
                            setUrlInputBack('');
                          }
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 px-3 py-1 rounded-lg cursor-pointer transition-colors"
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Template Scaling & Background Fit */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Template Fit Mode:
                    </label>
                    <div className="flex items-center gap-1.5">
                      {(['cover', 'fill', 'contain'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setTemplateConfig((prev) => ({ ...prev, fitMode: mode }))}
                          className={`text-xs px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                            templateConfig.fitMode === mode
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {mode.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Template Opacity: {Math.round((templateConfig.opacity ?? 1.0) * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={templateConfig.opacity ?? 1.0}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          opacity: parseFloat(e.target.value),
                        }))
                      }
                      className="w-36 accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTemplateConfig((prev) => ({
                        ...prev,
                        showBuiltinGuilloche: !prev.showBuiltinGuilloche,
                      }));
                    }}
                    className={`text-xs px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      templateConfig.showBuiltinGuilloche
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{templateConfig.showBuiltinGuilloche ? 'Guilloche Overlay ON' : 'Guilloche Overlay OFF'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: LAYER & LABEL CONTROLS ================= */}
          {activeTab === 'layers' && (
            <div className="space-y-6">
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                <h3 className="font-bold text-sm text-white mb-1 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Pre-Printed Template Layer Toggles
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  If your custom blank already has certain elements printed on it (such as the header, Ethiopian flag, or field label titles), turn off the corresponding layers below to prevent double-printing.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* Toggle Corner Calibration Marks */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-emerald-500/40 hover:border-emerald-500/60 cursor-pointer transition-all sm:col-span-2">
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Mark Template Corners (የማዕዘን ምልክቶች)</span>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                          Position Correction
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Overlay 4-corner L-registration marks &amp; coordinates at (0,0), (1012,0), (0,638), (1012,638) for exact alignment.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showCornerMarks)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showCornerMarks: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Field Labels */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Show Field Labels</div>
                      <div className="text-[10px] text-slate-400">e.g. &quot;ሙሉ ስም | Full Name&quot;, &quot;ፆታ | Sex&quot;</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFieldLabels)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFieldLabels: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Cut / Show Front Barcode */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span>Show Front Barcode</span>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono">FAN Barcode</span>
                      </div>
                      <div className="text-[10px] text-slate-400">1D Barcode on front FAN area (uncheck to cut barcode)</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFrontBarcode !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFrontBarcode: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Cut / Show Front FAN Number */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Show Front FAN Number</div>
                      <div className="text-[10px] text-slate-400">16-digit Fayda FAN text (uncheck to cut FAN)</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFrontFan !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFrontFan: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Secondary Photo on Bottom Right */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all sm:col-span-2">
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span>Show 2nd Photo on Front (Bottom Right)</span>
                        <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-mono">Dual Photo</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Security hologram portrait on the bottom right side</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showSecondaryPhoto !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showSecondaryPhoto: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Secondary Photo Style Selector */}
                  {templateConfig.showSecondaryPhoto !== false && (
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 sm:col-span-2 space-y-2">
                      <div className="text-xs font-bold text-slate-200">2nd Photo Security Style:</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'ghost', label: 'Ghost Watermark', desc: 'Engraved / Translucent' },
                          { id: 'grayscale', label: 'Grayscale Laser', desc: 'B&W Contrast' },
                          { id: 'goldBorder', label: 'Gold Hologram', desc: 'Amber Border' },
                          { id: 'color', label: 'Full Color', desc: 'Natural Color' },
                        ].map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() =>
                              setTemplateConfig((prev) => ({
                                ...prev,
                                secondaryPhotoStyle: style.id as any,
                              }))
                            }
                            className={`p-2 rounded-lg text-left text-xs font-bold transition-all border cursor-pointer ${
                              (templateConfig.secondaryPhotoStyle || 'ghost') === style.id
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div>{style.label}</div>
                            <div className="text-[9px] opacity-75 font-normal">{style.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Toggle FAN Container Box */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Show FAN Container Box</div>
                      <div className="text-[10px] text-slate-400">White background pill for FAN number</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFanContainerBox)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFanContainerBox: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Barcode Box */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Show FIN Code Container</div>
                      <div className="text-[10px] text-slate-400">White container box for barcode/FIN code</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showBarcodeBox)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showBarcodeBox: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Footer Notice */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Show Police Return Notice</div>
                      <div className="text-[10px] text-slate-400">Bottom 9779 emergency return text</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFooterNotice)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFooterNotice: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Guilloche Pattern */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Show Built-in Guilloche Pattern</div>
                      <div className="text-[10px] text-slate-400">Micro-pattern security curves & waves</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showBuiltinGuilloche)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showBuiltinGuilloche: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Nationality Layer */}
                  <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all">
                    <div>
                      <div className="font-bold text-xs text-white">Nationality Layer (ዜግነት)</div>
                      <div className="text-[10px] text-slate-400">
                        Show &quot;ኢትዮጵያዊ | Ethiopian&quot; on back (Removed by default / standard Fayda omits it)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showNationality)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showNationality: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleResetToDefault}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Reset All to Standard Default
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Done & Apply Template
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
