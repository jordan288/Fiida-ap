import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  Sliders, 
  Move, 
  RotateCcw, 
  Check, 
  X, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Grid, 
  Layers, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  AlignHorizontalJustifyCenter, 
  Maximize2, 
  Hash, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Type,
  Palette,
  Crosshair,
  CreditCard,
  Scissors
} from 'lucide-react';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig, NumberedTemplate, FieldCoordinate, MediaCoordinate } from '../types';
import { DEFAULT_COORDINATES, SAMPLE_ID_DATA } from '../data/defaultData';
import { autoRemovePhotoBackground } from '../utils/imageProcessor';
import { CardRenderer } from './CardRenderer';

interface BatchPositionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: BatchQueueItem[];
  setQueue: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
  initialItemId?: string | null;
  config: CoordinatesConfig;
  templateConfig: TemplateConfig;
  activeTemplateNumber?: number;
  onSelectTemplateNumber?: (num: number) => void;
  numberedTemplates?: NumberedTemplate[];
  onSaveBatchConfig: (
    newConfig: CoordinatesConfig, 
    scope: 'all' | 'item', 
    targetItemId?: string
  ) => void;
  onApplyStudioPositionsToAllTemplates?: () => void;
}

export const BatchPositionEditorModal: React.FC<BatchPositionEditorModalProps> = ({
  isOpen,
  onClose,
  queue,
  setQueue,
  initialItemId,
  config: propConfig,
  templateConfig,
  activeTemplateNumber = 1,
  onSelectTemplateNumber,
  numberedTemplates,
  onSaveBatchConfig,
  onApplyStudioPositionsToAllTemplates,
}) => {
  // Find initial item or default to first ready item
  const initialIndex = initialItemId 
    ? queue.findIndex((it) => it.id === initialItemId) 
    : 0;
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(initialIndex >= 0 ? initialIndex : 0);

  const currentItem: BatchQueueItem | undefined = queue[selectedItemIndex] || queue[0];

  // Working coordinates state (local copy for real-time live preview before saving)
  const [workingCoords, setWorkingCoords] = useState<CoordinatesConfig>(() => {
    if (currentItem?.customCoordinates) {
      return JSON.parse(JSON.stringify(currentItem.customCoordinates));
    }
    return JSON.parse(JSON.stringify(propConfig));
  });

  // Keep track of scope: 'all' applies to entire batch / template, 'item' applies only to currentItem
  const [applyScope, setApplyScope] = useState<'all' | 'item'>(() => {
    return currentItem?.customCoordinates ? 'item' : 'all';
  });

  const [selectedSide, setSelectedSide] = useState<'both' | 'front' | 'back'>('both');
  const [selectedFieldId, setSelectedFieldId] = useState<string>('fullNameAmharic');
  const [previewScale, setPreviewScale] = useState<number>(0.58);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showCoordinateBadges, setShowCoordinateBadges] = useState<boolean>(false);
  const [showCornerMarks, setShowCornerMarks] = useState<boolean>(false);
  const [photoColorMode, setPhotoColorMode] = useState<'color' | 'grayscale'>('color');
  const [nudgeStep, setNudgeStep] = useState<number>(5);
  const [filterCategory, setFilterCategory] = useState<'all' | 'front' | 'back' | 'media'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCuttingBothBg, setIsCuttingBothBg] = useState<boolean>(false);

  // When switching applicant, sync working coordinates
  useEffect(() => {
    if (currentItem) {
      if (currentItem.customCoordinates) {
        setWorkingCoords(JSON.parse(JSON.stringify(currentItem.customCoordinates)));
        setApplyScope('item');
      } else {
        setWorkingCoords(JSON.parse(JSON.stringify(propConfig)));
        setApplyScope('all');
      }
      if (currentItem.photoColorMode) {
        setPhotoColorMode(currentItem.photoColorMode);
      }
    }
  }, [selectedItemIndex, currentItem?.id]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMakeBothPhotosTransparent = async () => {
    if (!applicantData.photoUrl && !applicantData.secondaryPhotoUrl) {
      showToast('No photos available to process');
      return;
    }

    try {
      setIsCuttingBothBg(true);
      let cut1 = applicantData.photoUrl;
      if (applicantData.photoUrl) {
        cut1 = (await autoRemovePhotoBackground(applicantData.photoUrl)) || applicantData.photoUrl;
      }
      let cut2 = cut1;
      if (applicantData.secondaryPhotoUrl && applicantData.secondaryPhotoUrl !== applicantData.photoUrl) {
        cut2 = (await autoRemovePhotoBackground(applicantData.secondaryPhotoUrl)) || applicantData.secondaryPhotoUrl;
      } else {
        cut2 = cut1;
      }

      if (currentItem) {
        setQueue((prev) =>
          prev.map((it) => {
            if (it.id === currentItem.id) {
              return {
                ...it,
                extractedData: {
                  ...it.extractedData,
                  photoUrl: cut1,
                  secondaryPhotoUrl: cut2,
                },
                status: 'ready',
              };
            }
            return it;
          })
        );
      }

      showToast('⚡ Both Photo 1 & Photo 2 background set to 100% transparent!');
      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      } catch {}
    } catch (err) {
      console.error('Failed to make both photos transparent:', err);
      showToast('Error removing background');
    } finally {
      setIsCuttingBothBg(false);
    }
  };

  const isMedia = 
    selectedFieldId === 'photoFront' || 
    selectedFieldId === 'photoFrontSecondary' || 
    selectedFieldId === 'frontBarcode' || 
    selectedFieldId === 'qrCodeBack' || 
    selectedFieldId === 'backFanCut' ||
    Boolean(workingCoords.media[selectedFieldId]);

  const activeField: FieldCoordinate | undefined = workingCoords.fields[selectedFieldId];
  const activeMedia: MediaCoordinate | undefined = workingCoords.media[selectedFieldId] || DEFAULT_COORDINATES.media[selectedFieldId];

  const currentX = isMedia ? (activeMedia?.x ?? 0) : (activeField?.x ?? 0);
  const currentY = isMedia ? (activeMedia?.y ?? 0) : (activeField?.y ?? 0);
  const currentWidth = isMedia ? (activeMedia?.width ?? 200) : (activeField?.maxWidth ?? 300);
  const currentHeight = isMedia ? (activeMedia?.height ?? 100) : 50;

  // Move or adjust coordinate property
  const handleUpdateProp = (prop: string, val: any) => {
    if (isMedia) {
      setWorkingCoords((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [selectedFieldId]: {
            ...(prev.media[selectedFieldId] || activeMedia || {
              id: selectedFieldId,
              label: selectedFieldId,
              side: 'front',
              x: 0,
              y: 0,
              width: currentWidth,
              height: currentHeight,
            }),
            [prop]: val,
          },
        },
      }));
    } else {
      setWorkingCoords((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [selectedFieldId]: {
            ...prev.fields[selectedFieldId],
            [prop]: val,
          },
        },
      }));
    }
  };

  // Direct move
  const handleMoveField = (fieldId: string, newX: number, newY: number) => {
    const isTargetMedia = 
      fieldId === 'photoFront' || 
      fieldId === 'photoFrontSecondary' || 
      fieldId === 'frontBarcode' || 
      fieldId === 'qrCodeBack' || 
      fieldId === 'backFanCut' ||
      Boolean(workingCoords.media[fieldId]);

    const clampedX = Math.max(0, Math.min(workingCoords.canvasWidth - 10, Math.round(newX)));
    const clampedY = Math.max(0, Math.min(workingCoords.canvasHeight - 10, Math.round(newY)));

    if (isTargetMedia) {
      setWorkingCoords((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...(prev.media[fieldId] || DEFAULT_COORDINATES.media[fieldId] || {
              id: fieldId,
              label: fieldId,
              side: 'front',
              x: clampedX,
              y: clampedY,
              width: 200,
              height: 100,
            }),
            x: clampedX,
            y: clampedY,
          },
        },
      }));
    } else {
      setWorkingCoords((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...prev.fields[fieldId],
            x: clampedX,
            y: clampedY,
          },
        },
      }));
    }
  };

  // Resize field
  const handleResizeField = (fieldId: string, newW: number, newH: number) => {
    if (workingCoords.media[fieldId] || DEFAULT_COORDINATES.media[fieldId]) {
      setWorkingCoords((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...(prev.media[fieldId] || DEFAULT_COORDINATES.media[fieldId]),
            width: Math.max(20, Math.round(newW)),
            height: Math.max(20, Math.round(newH)),
            ...(fieldId === 'backFanCut' ? { fit: 'fill' } : {}),
          },
        },
      }));
    } else if (workingCoords.fields[fieldId]) {
      setWorkingCoords((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...prev.fields[fieldId],
            maxWidth: Math.max(50, Math.round(newW)),
          },
        },
      }));
    }
  };

  // Nudge directionally
  const nudge = (dx: number, dy: number) => {
    const nextX = Math.max(0, Math.min(workingCoords.canvasWidth - 10, currentX + dx));
    const nextY = Math.max(0, Math.min(workingCoords.canvasHeight - 10, currentY + dy));
    handleUpdateProp('x', nextX);
    handleUpdateProp('y', nextY);
  };

  // Center horizontally
  const centerHorizontally = () => {
    const itemWidth = isMedia ? currentWidth : (activeField?.maxWidth || 260);
    const newX = Math.max(0, Math.round((workingCoords.canvasWidth - itemWidth) / 2));
    handleUpdateProp('x', newX);
  };

  // Reset selected field
  const resetSelectedField = () => {
    if (isMedia && DEFAULT_COORDINATES.media[selectedFieldId]) {
      setWorkingCoords((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [selectedFieldId]: { ...DEFAULT_COORDINATES.media[selectedFieldId] },
        },
      }));
      showToast(`Reset ${activeMedia?.label || selectedFieldId} to defaults`);
    } else if (DEFAULT_COORDINATES.fields[selectedFieldId]) {
      setWorkingCoords((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [selectedFieldId]: { ...DEFAULT_COORDINATES.fields[selectedFieldId] },
        },
      }));
      showToast(`Reset ${activeField?.label || selectedFieldId} to defaults`);
    }
  };

  // Reset all fields to defaults
  const resetAllToDefaults = () => {
    if (window.confirm('Are you sure you want to reset all positions to standard Fayda defaults?')) {
      setWorkingCoords(JSON.parse(JSON.stringify(DEFAULT_COORDINATES)));
      showToast('All positions reset to standard Fayda specifications');
    }
  };

  // Save changes
  const handleSave = () => {
    onSaveBatchConfig(workingCoords, applyScope, currentItem?.id);
    try {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } catch {}
    showToast(
      applyScope === 'all'
        ? '✓ Positions successfully applied to ALL batch cards!'
        : `✓ Positions successfully saved for ${currentItem?.extractedData.fullNameEnglish}!`
    );
  };

  // Field definitions list with labels & groups
  const fieldList = [
    // Front Text Fields
    { id: 'fullNameAmharic', label: 'Amharic Name (ሙሉ ስም)', side: 'front', isMedia: false },
    { id: 'fullNameEnglish', label: 'English Full Name', side: 'front', isMedia: false },
    { id: 'dateOfBirth', label: 'Date of Birth (Dual Eth/GC)', side: 'front', isMedia: false },
    { id: 'sex', label: 'Sex / ፆታ', side: 'front', isMedia: false },
    { id: 'dateOfExpiry', label: 'Date of Expiry (Dual Eth/GC)', side: 'front', isMedia: false },
    { id: 'dateOfIssueEth', label: 'Issue Date E.C. (Left Margin)', side: 'front', isMedia: false },
    { id: 'dateOfIssueGc', label: 'Issue Date G.C. (Left Margin)', side: 'front', isMedia: false },
    { id: 'fan', label: 'FAN Card Number (Bottom Center)', side: 'front', isMedia: false },

    // Front Media
    { id: 'photoFront', label: 'Primary Photo (ፎቶግራፍ)', side: 'front', isMedia: true },
    { id: 'photoFrontSecondary', label: 'Smaller Photo 2 (አነስተኛ ፎቶ)', side: 'front', isMedia: true },
    { id: 'frontBarcode', label: 'Front 1D Barcode (ባርኮድ)', side: 'front', isMedia: true },

    // Back Text Fields
    { id: 'phoneNumber', label: 'Phone Number (ስልክ ቁጥር)', side: 'back', isMedia: false },
    { id: 'regionAmharic', label: 'Region (ክልል - Amharic)', side: 'back', isMedia: false },
    { id: 'regionEnglish', label: 'Region (English Layer)', side: 'back', isMedia: false },
    { id: 'zoneAmharic', label: 'Zone / ዞን (Amharic)', side: 'back', isMedia: false },
    { id: 'zoneEnglish', label: 'Zone (English Layer)', side: 'back', isMedia: false },
    { id: 'woredaAmharic', label: 'Woreda / ወረዳ (Amharic)', side: 'back', isMedia: false },
    { id: 'woredaEnglish', label: 'Woreda (English Layer)', side: 'back', isMedia: false },
    { id: 'serialNumber', label: 'Serial Number (SN • 7-Digit)', side: 'back', isMedia: false },
    { id: 'barcodeText', label: 'FIN Code (Bottom Left Box)', side: 'back', isMedia: false },

    // Back Media
    { id: 'backFanCut', label: 'Back FAN Cut Layer (የተቆረጠ ጎን ሌየር)', side: 'back', isMedia: true },
    { id: 'qrCodeBack', label: 'Biometric QR Matrix', side: 'back', isMedia: true },
  ];

  const filteredFields = fieldList.filter((f) => {
    if (filterCategory === 'front') return f.side === 'front';
    if (filterCategory === 'back') return f.side === 'back';
    if (filterCategory === 'media') return f.isMedia;
    return true;
  });

  const applicantData: IdCardData = currentItem?.extractedData || SAMPLE_ID_DATA;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/90 rounded-3xl w-full max-w-7xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-white animate-fadeIn">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-950/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Batch Field Position Editor
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Live Calibration
                </span>
                {currentItem?.customCoordinates && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Custom Card Positions Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Calibrate and adjust field coordinates directly for batch files, with real-time preview across queued applicants
              </p>
            </div>
          </div>

          {/* Applicant Cycler & Template Slot */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Applicant Selector */}
            {queue.length > 0 && (
              <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-2 py-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setSelectedItemIndex((prev) => (prev > 0 ? prev - 1 : queue.length - 1))}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 cursor-pointer"
                  title="Previous Applicant"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-2 text-center min-w-[170px]">
                  <p className="text-xs font-bold text-white truncate max-w-[180px]">
                    #{selectedItemIndex + 1} {currentItem?.extractedData.fullNameEnglish || currentItem?.fileName}
                  </p>
                  <p className="text-[9px] font-mono text-emerald-400">
                    FAN: {currentItem?.extractedData.fan || 'N/A'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItemIndex((prev) => (prev < queue.length - 1 ? prev + 1 : 0))}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 cursor-pointer"
                  title="Next Applicant"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Template Selector */}
            {numberedTemplates && numberedTemplates.length > 0 && onSelectTemplateNumber && (
              <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700 rounded-xl px-2 py-1">
                <span className="text-[10px] font-bold text-slate-400">Tpl:</span>
                <select
                  value={activeTemplateNumber}
                  onChange={(e) => onSelectTemplateNumber(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 text-xs font-bold rounded-lg px-2 py-0.5 text-white outline-none cursor-pointer"
                >
                  {numberedTemplates.map((t) => (
                    <option key={t.number} value={t.number}>
                      #{t.number} {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close Editor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body: Left Preview Pane & Right Control Pane */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* LEFT: Live Interactive Card Preview Canvas (7 or 8 columns on large screens) */}
          <div className="lg:col-span-7 xl:col-span-8 bg-slate-950 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 overflow-hidden relative">
            
            {/* Preview Toolbar */}
            <div className="p-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Side Switcher */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedSide('both')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedSide === 'both' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Side-by-Side (Both)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSide('front')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedSide === 'front' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSide('back')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedSide === 'back' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Back
                </button>
              </div>

              {/* View Overlay Toggles */}
              <div className="flex items-center gap-1.5">
                {/* Make Both Photos Transparent Button */}
                <button
                  type="button"
                  onClick={handleMakeBothPhotosTransparent}
                  disabled={isCuttingBothBg}
                  className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Make both Photo 1 and Photo 2 backgrounds transparent"
                >
                  {isCuttingBothBg ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      <span>Cutting Transparency...</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="w-3.5 h-3.5 text-amber-300" />
                      <span>⚡ Make Both Photos Transparent</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border ${
                    showGrid 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                  title="Toggle 50px Calibration Grid"
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCoordinateBadges(!showCoordinateBadges)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border ${
                    showCoordinateBadges 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                  title="Show (X,Y) badges on fields"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Coordinates</span>
                </button>

                {/* Zoom Controls */}
                <div className="flex items-center bg-slate-950 px-1.5 py-0.5 rounded-xl border border-slate-800 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => setPreviewScale((s) => Math.max(0.35, s - 0.08))}
                    className="p-1 hover:text-white"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-mono text-[11px] font-bold text-slate-300">
                    {Math.round(previewScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewScale((s) => Math.min(0.95, s + 0.08))}
                    className="p-1 hover:text-white"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Preview Canvas Area */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-start gap-6 select-none bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
              
              {/* Info banner about clicking elements */}
              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-full shadow-xs">
                  <Eye className="w-3 h-3 text-emerald-400" />
                  <span>Click any field or photo on the card to select & fine-tune its position</span>
                </span>
              </div>

              {/* Side-by-Side Dual Card Stage */}
              <div className={`w-full flex ${selectedSide === 'both' ? 'flex-col xl:flex-row items-center justify-center gap-6 xl:gap-8' : 'flex-col items-center gap-6'}`}>
                {/* Front Side Card */}
                {(selectedSide === 'both' || selectedSide === 'front') && (
                  <div className="space-y-1.5 flex flex-col items-center">
                    <div className="flex items-center justify-between w-full max-w-[600px] px-1 text-[11px] text-slate-400">
                      <span className="font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <span>Front Side (CR80)</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">1012 × 638 px</span>
                    </div>
                    <div className="shadow-2xl rounded-2xl ring-1 ring-slate-800 overflow-hidden bg-white">
                      <CardRenderer
                        side="front"
                        data={applicantData}
                        config={workingCoords}
                        templateConfig={templateConfig}
                        scale={previewScale}
                        highlightField={selectedFieldId}
                        onSelectField={(id) => setSelectedFieldId(id)}
                        onMoveField={handleMoveField}
                        onResizeField={handleResizeField}
                        interactive={true}
                        showGrid={showGrid}
                        showCoordinatesBadges={showCoordinateBadges}
                        showCornerMarks={showCornerMarks}
                        photoColorMode={photoColorMode}
                      />
                    </div>
                  </div>
                )}

                {/* Back Side Card */}
                {(selectedSide === 'both' || selectedSide === 'back') && (
                  <div className="space-y-1.5 flex flex-col items-center">
                    <div className="flex items-center justify-between w-full max-w-[600px] px-1 text-[11px] text-slate-400">
                      <span className="font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" />
                        <span>Back Side (CR80)</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">1012 × 638 px</span>
                    </div>
                    <div className="shadow-2xl rounded-2xl ring-1 ring-slate-800 overflow-hidden bg-white">
                      <CardRenderer
                        side="back"
                        data={applicantData}
                        config={workingCoords}
                        templateConfig={templateConfig}
                        scale={previewScale}
                        highlightField={selectedFieldId}
                        onSelectField={(id) => setSelectedFieldId(id)}
                        onMoveField={handleMoveField}
                        onResizeField={handleResizeField}
                        interactive={true}
                        showGrid={showGrid}
                        showCoordinatesBadges={showCoordinateBadges}
                        showCornerMarks={showCornerMarks}
                        photoColorMode={photoColorMode}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Field Selection & Fine-Tune Controls (5 or 4 columns on large screens) */}
          <div className="lg:col-span-5 xl:col-span-4 bg-slate-900 flex flex-col overflow-hidden">
            
            {/* Category Filter Pills */}
            <div className="p-3 border-b border-slate-800 bg-slate-950/60 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span>Select Field / Element</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {filteredFields.length} elements
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setFilterCategory('all')}
                  className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                    filterCategory === 'all' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('front')}
                  className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                    filterCategory === 'front' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('back')}
                  className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                    filterCategory === 'back' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCategory('media')}
                  className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                    filterCategory === 'media' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Photos/Cuts
                </button>
              </div>
            </div>

            {/* Scrollable Fields List */}
            <div className="p-3 overflow-y-auto max-h-[220px] divide-y divide-slate-800/80 border-b border-slate-800 bg-slate-950/30">
              <div className="grid grid-cols-1 gap-1">
                {filteredFields.map((f) => {
                  const isSelected = selectedFieldId === f.id;
                  const coord = f.isMedia ? workingCoords.media[f.id] : workingCoords.fields[f.id];
                  const x = coord?.x ?? 0;
                  const y = coord?.y ?? 0;

                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFieldId(f.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400' 
                          : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                          f.side === 'front' 
                            ? isSelected ? 'bg-emerald-800 text-emerald-200' : 'bg-emerald-500/20 text-emerald-300' 
                            : isSelected ? 'bg-cyan-800 text-cyan-200' : 'bg-cyan-500/20 text-cyan-300'
                        }`}>
                          {f.side}
                        </span>
                        <span className="truncate">{f.label}</span>
                      </div>
                      <span className={`text-[10px] font-mono shrink-0 ml-2 ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                        X:{x} Y:{y}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Field Fine-Tune Control Panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900">
              {/* Selected Field Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
                    <Move className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isMedia ? (activeMedia?.label || selectedFieldId) : (activeField?.label || selectedFieldId)}
                    </h4>
                    <p className="text-[10px] font-mono text-emerald-400">
                      Coordinates: X={currentX}px, Y={currentY}px
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetSelectedField}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Reset to default standard position"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Field</span>
                </button>
              </div>

              {/* D-Pad & Nudge Navigation Controls */}
              <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Directional Precision Nudge</span>
                  </span>

                  {/* Step Multiplier Pills */}
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    {[1, 5, 10, 25].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setNudgeStep(step)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-all ${
                          nudgeStep === step 
                            ? 'bg-emerald-600 text-white' 
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {step}px
                      </button>
                    ))}
                  </div>
                </div>

                {/* D-Pad Buttons */}
                <div className="flex items-center justify-center gap-1.5">
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => nudge(0, -nudgeStep)}
                      className="w-10 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center cursor-pointer shadow-xs active:scale-95 transition-all"
                      title={`Move Up ${nudgeStep}px`}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => nudge(-nudgeStep, 0)}
                        className="w-10 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center cursor-pointer shadow-xs active:scale-95 transition-all"
                        title={`Move Left ${nudgeStep}px`}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={centerHorizontally}
                        className="px-2.5 h-8 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer shadow-xs active:scale-95 transition-all"
                        title="Center Horizontally"
                      >
                        Center
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(nudgeStep, 0)}
                        className="w-10 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center cursor-pointer shadow-xs active:scale-95 transition-all"
                        title={`Move Right ${nudgeStep}px`}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => nudge(0, nudgeStep)}
                      className="w-10 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center justify-center cursor-pointer shadow-xs active:scale-95 transition-all"
                      title={`Move Down ${nudgeStep}px`}
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sliders & Numeric Inputs for X and Y */}
              <div className="grid grid-cols-2 gap-3">
                {/* X Position */}
                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">X Position</span>
                    <input
                      type="number"
                      value={currentX}
                      onChange={(e) => handleUpdateProp('x', parseInt(e.target.value, 10) || 0)}
                      className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded text-center text-emerald-400 outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1012"
                    value={currentX}
                    onChange={(e) => handleUpdateProp('x', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <button onClick={() => nudge(-1, 0)} className="hover:text-white cursor-pointer">-1</button>
                    <button onClick={() => nudge(-10, 0)} className="hover:text-white cursor-pointer">-10</button>
                    <button onClick={() => nudge(10, 0)} className="hover:text-white cursor-pointer">+10</button>
                    <button onClick={() => nudge(1, 0)} className="hover:text-white cursor-pointer">+1</button>
                  </div>
                </div>

                {/* Y Position */}
                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">Y Position</span>
                    <input
                      type="number"
                      value={currentY}
                      onChange={(e) => handleUpdateProp('y', parseInt(e.target.value, 10) || 0)}
                      className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded text-center text-emerald-400 outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="638"
                    value={currentY}
                    onChange={(e) => handleUpdateProp('y', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <button onClick={() => nudge(0, -1)} className="hover:text-white cursor-pointer">-1</button>
                    <button onClick={() => nudge(0, -10)} className="hover:text-white cursor-pointer">-10</button>
                    <button onClick={() => nudge(0, 10)} className="hover:text-white cursor-pointer">+10</button>
                    <button onClick={() => nudge(0, 1)} className="hover:text-white cursor-pointer">+1</button>
                  </div>
                </div>
              </div>

              {/* Text-Specific Controls: Font Size & Font Style */}
              {!isMedia && activeField && (
                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Type className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Font Size & Styling</span>
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {activeField.fontSize || 20} px
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateProp('fontSize', Math.max(10, (activeField.fontSize || 20) - 1))}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold"
                    >
                      -1
                    </button>
                    <input
                      type="range"
                      min="10"
                      max="48"
                      value={activeField.fontSize || 20}
                      onChange={(e) => handleUpdateProp('fontSize', parseInt(e.target.value, 10))}
                      className="flex-1 accent-emerald-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateProp('fontSize', Math.min(50, (activeField.fontSize || 20) + 1))}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold"
                    >
                      +1
                    </button>
                  </div>

                  {/* Alignment */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400">Text Align:</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      {(['left', 'center', 'right'] as const).map((al) => (
                        <button
                          key={al}
                          type="button"
                          onClick={() => handleUpdateProp('align', al)}
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded cursor-pointer ${
                            (activeField.align || 'left') === al
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {al}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Media-Specific Controls: Width & Height */}
              {isMedia && (
                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span className="flex items-center gap-1">
                      <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Element Dimensions</span>
                    </span>
                    <span className="font-mono text-emerald-400 text-xs">
                      {currentWidth} × {currentHeight} px
                    </span>
                  </div>

                  {/* Quick Stretch Pills for backFanCut */}
                  {selectedFieldId === 'backFanCut' && (
                    <div className="space-y-1.5 p-2 bg-emerald-950/40 rounded-xl border border-emerald-800/50">
                      <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">
                        Quick Cutout Width:
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {[440, 520, 600, 680].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => handleResizeField('backFanCut', w, currentHeight)}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                              currentWidth === w ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {w}px
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleResizeField('backFanCut', currentWidth + 20, currentHeight)}
                          className="px-2 py-0.5 text-[10px] font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded cursor-pointer"
                        >
                          +20
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResizeField('backFanCut', Math.max(50, currentWidth - 20), currentHeight)}
                          className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                        >
                          -20
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Width (W)</label>
                      <input
                        type="number"
                        value={currentWidth}
                        onChange={(e) => handleResizeField(selectedFieldId, parseInt(e.target.value, 10) || 50, currentHeight)}
                        className="w-full px-2 py-1 text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded text-center text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Height (H)</label>
                      <input
                        type="number"
                        value={currentHeight}
                        onChange={(e) => handleResizeField(selectedFieldId, currentWidth, parseInt(e.target.value, 10) || 50)}
                        className="w-full px-2 py-1 text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded text-center text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(selectedFieldId === 'photoFront' || selectedFieldId === 'photoFrontSecondary') && (
                <div className="p-3 bg-emerald-950/40 rounded-2xl border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-amber-300" />
                      <span>Background Transparency</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Both Photos</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Auto-crop background to clean transparent alpha on both photos.
                  </p>
                  <button
                    type="button"
                    onClick={handleMakeBothPhotosTransparent}
                    disabled={isCuttingBothBg}
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCuttingBothBg ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                        <span>Cutting Transparency...</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-3.5 h-3.5 text-amber-300" />
                        <span>⚡ Make Both Photos Transparent</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Action Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Scope Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300">Apply To:</span>
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setApplyScope('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  applyScope === 'all'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Batch Cards (Template #{activeTemplateNumber})
              </button>
              {currentItem && (
                <button
                  type="button"
                  onClick={() => setApplyScope('item')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    applyScope === 'item'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Override positions for this specific applicant card only"
                >
                  This Card Only ({currentItem.extractedData.fullNameEnglish.split(' ')[0]})
                </button>
              )}
            </div>

            {/* Sync Studio Positions Option */}
            {onApplyStudioPositionsToAllTemplates && (
              <button
                type="button"
                onClick={() => {
                  onApplyStudioPositionsToAllTemplates();
                  showToast('✓ Synchronized ID Card Studio positions to all templates!');
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                title="Sync positions from ID Card Studio"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sync Studio Positions</span>
              </button>
            )}
          </div>

          {/* Toast Notification if any */}
          {toastMessage && (
            <div className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/50 px-3 py-1 rounded-lg animate-fadeIn">
              {toastMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetAllToDefaults}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Reset All to Defaults
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/40 cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Save & Apply Positions</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
