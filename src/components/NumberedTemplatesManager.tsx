import React, { useState, useRef } from 'react';
import {
  LayoutTemplate,
  Plus,
  Check,
  Trash2,
  Edit2,
  Save,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Layers,
  AlertCircle,
  Eye,
  Sliders,
  CheckCircle2,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { NumberedTemplate, TemplateConfig, CoordinatesConfig } from '../types';
import {
  saveTemplateByNumber,
  deleteTemplateByNumber,
  getNextAvailableTemplateNumber,
  compressTemplateImage,
  getDefaultNumberedTemplates,
} from '../utils/templateStorage';

interface NumberedTemplatesManagerProps {
  currentConfig: TemplateConfig;
  setTemplateConfig: React.Dispatch<React.SetStateAction<TemplateConfig>>;
  currentCoordinates?: CoordinatesConfig;
  setCoordinates?: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  activeTemplateNumber: number;
  onSelectTemplateNumber: (num: number) => void;
  numberedTemplates: NumberedTemplate[];
  onUpdateNumberedTemplates: (templates: NumberedTemplate[]) => void;
  onClose?: () => void;
}

export const NumberedTemplatesManager: React.FC<NumberedTemplatesManagerProps> = ({
  currentConfig,
  setTemplateConfig,
  currentCoordinates,
  setCoordinates,
  activeTemplateNumber,
  onSelectTemplateNumber,
  numberedTemplates,
  onUpdateNumberedTemplates,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'add_edit'>('list');
  const [editingTemplateNumber, setEditingTemplateNumber] = useState<number | null>(null);

  // Form State
  const [formNumber, setFormNumber] = useState<number>(() =>
    getNextAvailableTemplateNumber(numberedTemplates)
  );
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formThemeColor, setFormThemeColor] = useState('#059669');
  const [formFrontImage, setFormFrontImage] = useState<string>('');
  const [formBackImage, setFormBackImage] = useState<string>('');
  const [formFrontFileName, setFormFrontFileName] = useState<string>('');
  const [formBackFileName, setFormBackFileName] = useState<string>('');

  // Layer switches for new template
  const [formPureMode, setFormPureMode] = useState<boolean>(true);
  const [formShowLabels, setFormShowLabels] = useState<boolean>(false);
  const [formShowGuilloche, setFormShowGuilloche] = useState<boolean>(false);
  const [formShowCornerMarks, setFormShowCornerMarks] = useState<boolean>(true);
  const [formShowHeader, setFormShowHeader] = useState<boolean>(false);
  const [formShowFlag, setFormShowFlag] = useState<boolean>(false);
  const [formShowEmblem, setFormShowEmblem] = useState<boolean>(false);
  const [formSecondaryPhoto, setFormSecondaryPhoto] = useState<'ghost' | 'grayscale' | 'color' | 'goldBorder'>('ghost');

  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // Start adding a new template
  const handleOpenAddForm = () => {
    const nextNum = getNextAvailableTemplateNumber(numberedTemplates);
    setEditingTemplateNumber(null);
    setFormNumber(nextNum);
    setFormName(`Template #${nextNum}`);
    setFormDescription('Custom ID card background blank');
    setFormThemeColor('#059669');
    setFormFrontImage('');
    setFormBackImage('');
    setFormFrontFileName('');
    setFormBackFileName('');
    setFormPureMode(true);
    setFormShowLabels(false);
    setFormShowGuilloche(false);
    setFormShowCornerMarks(true);
    setFormShowHeader(false);
    setFormShowFlag(false);
    setFormShowEmblem(false);
    setFormSecondaryPhoto('ghost');
    setViewMode('add_edit');
  };

  // Start editing an existing template
  const handleOpenEditForm = (t: NumberedTemplate) => {
    setEditingTemplateNumber(t.number);
    setFormNumber(t.number);
    setFormName(t.name);
    setFormDescription(t.description || '');
    setFormThemeColor(t.themeColor || '#059669');
    setFormFrontImage(t.frontImageUrl || t.config.frontImageUrl || '');
    setFormBackImage(t.backImageUrl || t.config.backImageUrl || '');
    setFormFrontFileName(t.frontFileName || t.config.frontFileName || '');
    setFormBackFileName(t.backFileName || t.config.backFileName || '');
    setFormPureMode(!t.config.showHeader && !t.config.showFieldLabels);
    setFormShowLabels(Boolean(t.config.showFieldLabels));
    setFormShowGuilloche(Boolean(t.config.showBuiltinGuilloche));
    setFormShowCornerMarks(Boolean(t.config.showCornerMarks ?? false));
    setFormShowHeader(Boolean(t.config.showHeader));
    setFormShowFlag(Boolean(t.config.showFlag));
    setFormShowEmblem(Boolean(t.config.showEmblem));
    setFormSecondaryPhoto(t.config.secondaryPhotoStyle || 'ghost');
    setViewMode('add_edit');
  };

  // Upload and compress image file for smooth storage
  const handleFileUpload = async (file: File, side: 'front' | 'back') => {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    setIsProcessingImage(true);
    try {
      const compressedDataUrl = await compressTemplateImage(file, 1012, 638);
      if (side === 'front') {
        setFormFrontImage(compressedDataUrl);
        setFormFrontFileName(file.name);
      } else {
        setFormBackImage(compressedDataUrl);
        setFormBackFileName(file.name);
      }
    } catch (err) {
      console.error('Failed to process template image:', err);
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Save the template by number
  const handleSaveTemplate = () => {
    if (!formNumber || formNumber < 1) {
      alert('Please enter a valid positive template number (e.g. 1, 2, 3...).');
      return;
    }

    const templateConfigToSave: TemplateConfig = {
      ...currentConfig,
      sourceType: 'custom',
      frontImageUrl: formFrontImage,
      backImageUrl: formBackImage,
      frontFileName: formFrontFileName,
      backFileName: formBackFileName,
      showBuiltinGuilloche: false,
      showFieldLabels: formShowLabels,
      showCornerMarks: formShowCornerMarks,
      showHeader: false,
      showFlag: false,
      showEmblem: false,
      secondaryPhotoStyle: formSecondaryPhoto,
      showSecondaryPhoto: true,
      showFrontBarcode: true,
      showFrontFan: true,
      showFanContainerBox: !formPureMode,
      showBarcodeBox: !formPureMode,
      showFooterNotice: false,
    };

    const existingItem = editingTemplateNumber ? numberedTemplates.find((t) => t.number === editingTemplateNumber) : undefined;
    const newTemplateItem: NumberedTemplate = {
      number: formNumber,
      id: `template_slot_${formNumber}`,
      name: formName.trim() || `Template #${formNumber}`,
      description: formDescription.trim() || 'Custom card blank template',
      themeColor: formThemeColor,
      badge: `Template #${formNumber}`,
      frontImageUrl: formFrontImage,
      backImageUrl: formBackImage,
      frontFileName: formFrontFileName,
      backFileName: formBackFileName,
      config: templateConfigToSave,
      coordinates: existingItem?.coordinates || (currentCoordinates ? JSON.parse(JSON.stringify(currentCoordinates)) : undefined),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = saveTemplateByNumber(newTemplateItem);
    onUpdateNumberedTemplates(updatedList);

    // Automatically set as active template
    onSelectTemplateNumber(formNumber);
    setTemplateConfig(templateConfigToSave);
    if (newTemplateItem.coordinates && setCoordinates) {
      setCoordinates(newTemplateItem.coordinates);
    }

    try {
      confetti({ particleCount: 50, spread: 60 });
    } catch (e) {}

    setViewMode('list');
  };

  // Delete a template
  const handleDeleteTemplate = (num: number, name: string) => {
    if (numberedTemplates.length <= 1) {
      alert('You must have at least one template saved.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Template #${num} (${name})?`)) {
      return;
    }

    const { templates, newActiveNumber } = deleteTemplateByNumber(num);
    onUpdateNumberedTemplates(templates);
    if (activeTemplateNumber === num) {
      onSelectTemplateNumber(newActiveNumber);
    }
  };

  // Save current active studio settings & field positions directly into a specific numbered slot
  const handleSaveCurrentToSlot = (slotNumber: number) => {
    const existing = numberedTemplates.find((t) => t.number === slotNumber);
    const updatedItem: NumberedTemplate = {
      number: slotNumber,
      id: existing?.id || `template_slot_${slotNumber}`,
      name: existing?.name || `Template #${slotNumber}`,
      description: existing?.description || 'Saved with current studio configuration & positions',
      themeColor: existing?.themeColor || '#059669',
      badge: `Template #${slotNumber}`,
      frontImageUrl: currentConfig.frontImageUrl || existing?.frontImageUrl || '',
      backImageUrl: currentConfig.backImageUrl || existing?.backImageUrl || '',
      frontFileName: currentConfig.frontFileName || existing?.frontFileName || '',
      backFileName: currentConfig.backFileName || existing?.backFileName || '',
      config: { ...currentConfig },
      coordinates: currentCoordinates ? JSON.parse(JSON.stringify(currentCoordinates)) : existing?.coordinates,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = saveTemplateByNumber(updatedItem);
    onUpdateNumberedTemplates(updatedList);
    onSelectTemplateNumber(slotNumber);
    if (updatedItem.coordinates && setCoordinates) {
      setCoordinates(updatedItem.coordinates);
    }

    try {
      confetti({ particleCount: 40, spread: 55 });
    } catch (e) {}
  };

  const isSlotExisting =
    viewMode === 'add_edit' &&
    editingTemplateNumber !== formNumber &&
    numberedTemplates.some((t) => t.number === formNumber);

  return (
    <div className="space-y-6">
      {/* Permanent Settings Banner */}
      <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <strong className="text-emerald-200">Permanent Template & Settings System</strong>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30 font-bold">
                Active: Template #{activeTemplateNumber}
              </span>
            </div>
            <p className="text-emerald-300/80 text-[11px] mt-0.5">
              Choose your template and settings once — they are saved and remain active for all single card prints, batch processing, and future sessions until you change them.
            </p>
          </div>
        </div>

        {viewMode === 'list' && (
          <button
            type="button"
            onClick={handleOpenAddForm}
            className="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Template by Number</span>
          </button>
        )}
      </div>

      {/* ================= VIEW 1: NUMBERED TEMPLATES LIST ================= */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-emerald-400" />
                <span>Saved Templates by Number ({numberedTemplates.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Click any template number to activate it
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextNum = getNextAvailableTemplateNumber(numberedTemplates);
                handleSaveCurrentToSlot(nextNum);
              }}
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title="Duplicate current active card studio settings into a brand new numbered template slot"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Current Setup as Template #{getNextAvailableTemplateNumber(numberedTemplates)}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {numberedTemplates.map((t) => {
              const isActive = t.number === activeTemplateNumber;
              const hasCustomImages = Boolean(t.frontImageUrl || t.backImageUrl || t.config.frontImageUrl || t.config.backImageUrl);

              return (
                <div
                  key={t.number}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-950/30 ring-2 ring-emerald-500/50 shadow-lg'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-950/80'
                  }`}
                >
                  {/* Top Bar: Number Badge, Active Status & Action Buttons */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-mono font-extrabold px-2.5 py-1 rounded-lg text-white shadow-xs flex items-center gap-1"
                          style={{ backgroundColor: t.themeColor || '#059669' }}
                        >
                          <span>#{t.number}</span>
                        </span>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                          {t.badge || `Template #${t.number}`}
                        </span>
                      </div>

                      {isActive ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Active (In Use)</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTemplateNumber(t.number);
                            setTemplateConfig(t.config);
                            if (t.coordinates && setCoordinates) {
                              setCoordinates(t.coordinates);
                            }
                            try {
                              confetti({ particleCount: 30, spread: 50 });
                            } catch (e) {}
                          }}
                          className="text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-emerald-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Activate</span>
                        </button>
                      )}
                    </div>

                    <h4 className="font-bold text-sm text-white mb-1 flex items-center gap-1.5">
                      <span>{t.name}</span>
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
                      {t.description || 'Pre-configured card template for Ethiopian Fayda ID.'}
                    </p>

                    {/* Previews & Configuration Attributes */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] mb-3">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Front Background</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {t.frontImageUrl || t.config.frontImageUrl ? (
                            <div className="flex items-center gap-1 text-emerald-400 font-medium">
                              <ImageIcon className="w-3 h-3" />
                              <span className="truncate max-w-[100px] font-mono">Custom Blank</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono">Standard Blank</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[10px]">Back Background</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {t.backImageUrl || t.config.backImageUrl ? (
                            <div className="flex items-center gap-1 text-emerald-400 font-medium">
                              <ImageIcon className="w-3 h-3" />
                              <span className="truncate max-w-[100px] font-mono">Custom Blank</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono">Standard Blank</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Layer Toggles Summary */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 mb-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 font-medium">
                        Positions: {t.coordinates ? 'Saved with Template' : 'Standard Default'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Labels: {t.config.showFieldLabels ? 'Printed' : 'Hidden (Pure)'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Guilloche: {t.config.showBuiltinGuilloche ? 'ON' : 'OFF'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Corners: {t.config.showCornerMarks ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(t)}
                        className="text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                        title="Edit template name, blanks, or layer toggles"
                      >
                        <Edit2 className="w-3 h-3 text-cyan-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveCurrentToSlot(t.number)}
                        className="text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                        title="Overwrite this template slot with current studio settings & field positions"
                      >
                        <Save className="w-3 h-3 text-amber-400" />
                        <span>Save Settings & Positions</span>
                      </button>
                    </div>

                    {numberedTemplates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(t.number, t.name)}
                        className="text-[11px] text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                        title={`Delete Template #${t.number}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: ADD / EDIT NUMBERED TEMPLATE ================= */}
      {viewMode === 'add_edit' && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-emerald-400" />
                <span>
                  {editingTemplateNumber !== null
                    ? `Edit Template #${editingTemplateNumber}`
                    : `Add New Template by Number`}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assign a slot number, upload front/back blank images, and customize layer switches.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              Cancel & Return
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Slot Number */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Template Number (Slot #)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={formNumber}
                  onChange={(e) => setFormNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-24 px-3 py-2 text-sm font-mono font-bold bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setFormNumber(getNextAvailableTemplateNumber(numberedTemplates))}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/80 px-2.5 py-2 rounded-xl border border-emerald-800/60 transition-colors cursor-pointer"
                >
                  Auto-Next (#)
                </button>
              </div>
              {isSlotExisting && (
                <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>Slot #{formNumber} exists. Saving will overwrite it.</span>
                </p>
              )}
            </div>

            {/* Template Name */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Template Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Laser Security Blank #5"
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-emerald-500 outline-none font-medium"
              />
            </div>

            {/* Accent Color */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Badge Theme Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formThemeColor}
                  onChange={(e) => setFormThemeColor(e.target.value)}
                  className="w-10 h-9 rounded-lg border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={formThemeColor}
                  onChange={(e) => setFormThemeColor(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-xl text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Description / Notes (Optional)
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="e.g. Pre-printed plastic PVC from regional printing office"
              className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Dual Upload: Front & Back Template Images */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            {/* --- FRONT SIDE TEMPLATE --- */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-white">Front Blank Image</span>
                </div>
                {formFrontImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormFrontImage('');
                      setFormFrontFileName('');
                    }}
                    className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {formFrontImage ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-700 aspect-[1012/638] bg-slate-950 flex items-center justify-center">
                  <img
                    src={formFrontImage}
                    alt="Front Template Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                    {formFrontFileName || 'Front Blank'}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => frontInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500 aspect-[1012/638] flex flex-col items-center justify-center p-4 cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-950/80"
                >
                  <Upload className="w-6 h-6 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-200">Upload Front Blank</span>
                  <span className="text-[10px] text-slate-500 mt-1">PNG, JPG, WEBP (1012×638 px)</span>
                </div>
              )}

              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'front');
                }}
              />
            </div>

            {/* --- BACK SIDE TEMPLATE --- */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span className="text-xs font-bold text-white">Back Blank Image</span>
                </div>
                {formBackImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormBackImage('');
                      setFormBackFileName('');
                    }}
                    className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {formBackImage ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-700 aspect-[1012/638] bg-slate-950 flex items-center justify-center">
                  <img
                    src={formBackImage}
                    alt="Back Template Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                    {formBackFileName || 'Back Blank'}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => backInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-700 hover:border-cyan-500 aspect-[1012/638] flex flex-col items-center justify-center p-4 cursor-pointer transition-all bg-slate-950/40 hover:bg-slate-950/80"
                >
                  <Upload className="w-6 h-6 text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-200">Upload Back Blank</span>
                  <span className="text-[10px] text-slate-500 mt-1">PNG, JPG, WEBP (1012×638 px)</span>
                </div>
              )}

              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'back');
                }}
              />
            </div>

          </div>

          {/* Layer Controls for this Numbered Template */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Layer & Pre-Printed Blank Switches for Template #{formNumber}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-white block">Corner Crop Marks</span>
                  <span className="text-[10px] text-slate-400">Mark 4 corners for position calibration</span>
                </div>
                <input
                  type="checkbox"
                  checked={formShowCornerMarks}
                  onChange={(e) => setFormShowCornerMarks(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-white block">Field Label Titles</span>
                  <span className="text-[10px] text-slate-400">Print &quot;Name&quot;, &quot;DOB&quot;, etc. labels</span>
                </div>
                <input
                  type="checkbox"
                  checked={formShowLabels}
                  onChange={(e) => setFormShowLabels(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </label>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-bold text-white block">Secondary Photo</span>
                <select
                  value={formSecondaryPhoto}
                  onChange={(e) => setFormSecondaryPhoto(e.target.value as any)}
                  className="w-full mt-1 px-2 py-1 text-xs bg-slate-900 text-white rounded border border-slate-700"
                >
                  <option value="ghost">Ghost (Semi-transparent)</option>
                  <option value="grayscale">Grayscale</option>
                  <option value="color">Full Color</option>
                  <option value="goldBorder">Gold Border</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="text-xs font-semibold text-slate-400 hover:text-white px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isProcessingImage}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Save Template #{formNumber} & Set as Active</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
