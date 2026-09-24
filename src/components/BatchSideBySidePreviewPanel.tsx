import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  Columns, 
  Eye, 
  Sliders, 
  Move, 
  RotateCcw, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Grid, 
  Layers, 
  Crosshair, 
  ZoomIn, 
  ZoomOut, 
  Sparkles, 
  CreditCard, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  AlignHorizontalJustifyCenter, 
  Hash, 
  User, 
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Scissors
} from 'lucide-react';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig, NumberedTemplate, FieldCoordinate, MediaCoordinate } from '../types';
import { DEFAULT_COORDINATES, SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA } from '../data/defaultData';
import { saveTemplateCoordinates, loadTemplateCoordinates } from '../utils/templateStorage';
import { autoRemovePhotoBackground } from '../utils/imageProcessor';
import { CardRenderer } from './CardRenderer';

interface BatchSideBySidePreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTemplateNumber: number;
  onSelectTemplateNumber?: (num: number) => void;
  numberedTemplates?: NumberedTemplate[];
  templateConfig: TemplateConfig;
  config: CoordinatesConfig;
  onUpdateConfig: (newConfig: CoordinatesConfig) => void;
  queue: BatchQueueItem[];
  photoColorMode?: 'color' | 'grayscale';
  onOpenPositionEditorModal?: () => void;
  onApplyStudioPositionsToAllTemplates?: () => void;
  onUpdateQueueItemPhotos?: (itemId: string, photoUrl: string, secondaryPhotoUrl: string) => void;
}

export const BatchSideBySidePreviewPanel: React.FC<BatchSideBySidePreviewPanelProps> = ({
  isOpen,
  onClose,
  activeTemplateNumber = 1,
  onSelectTemplateNumber,
  numberedTemplates = [],
  templateConfig,
  config: initialConfig,
  onUpdateConfig,
  queue = [],
  photoColorMode = 'color',
  onOpenPositionEditorModal,
  onApplyStudioPositionsToAllTemplates,
  onUpdateQueueItemPhotos,
}) => {
  // Active template metadata
  const currentTemplate = numberedTemplates.find((t) => t.number === activeTemplateNumber);
  const effectiveTemplateConfig = currentTemplate?.config || templateConfig;
  const templateName = currentTemplate?.name || `Custom Template #${activeTemplateNumber}`;

  // Working coordinates for real-time live manipulation
  const [workingCoords, setWorkingCoords] = useState<CoordinatesConfig>(() => {
    const tplCoords = currentTemplate?.coordinates || loadTemplateCoordinates(activeTemplateNumber) || initialConfig;
    return JSON.parse(JSON.stringify(tplCoords || DEFAULT_COORDINATES));
  });

  // Sync workingCoords when initialConfig or activeTemplateNumber changes externally
  useEffect(() => {
    const tplCoords = currentTemplate?.coordinates || loadTemplateCoordinates(activeTemplateNumber) || initialConfig;
    if (tplCoords) {
      setWorkingCoords(JSON.parse(JSON.stringify(tplCoords)));
    }
  }, [initialConfig, activeTemplateNumber, currentTemplate?.coordinates]);

  // Selected applicant source for live preview
  const [sampleApplicantSource, setSampleApplicantSource] = useState<'male' | 'female' | 'queue'>('queue');
  const [selectedQueueItemIndex, setSelectedQueueItemIndex] = useState<number>(0);

  // Field selection & fine tuning
  const [selectedFieldId, setSelectedFieldId] = useState<string>('fullNameAmharic');
  const [selectedFieldSide, setSelectedFieldSide] = useState<'all' | 'front' | 'back' | 'media'>('all');
  const [nudgeStep, setNudgeStep] = useState<number>(5);
  const [isToolsExpanded, setIsToolsExpanded] = useState<boolean>(true);

  // Visual helper toggles
  const [previewScale, setPreviewScale] = useState<number>(0.54);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showCoordinateBadges, setShowCoordinateBadges] = useState<boolean>(false);
  const [showCornerMarks, setShowCornerMarks] = useState<boolean>(false);
  const [localColorMode, setLocalColorMode] = useState<'color' | 'grayscale'>(photoColorMode);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCuttingBothBg, setIsCuttingBothBg] = useState<boolean>(false);
  const [overridePhotos, setOverridePhotos] = useState<{ [key: string]: { photoUrl: string; secondaryPhotoUrl: string } }>({});

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Determine current active applicant data to preview
  let activeApplicantData: IdCardData = SAMPLE_ID_DATA;
  if (sampleApplicantSource === 'female') {
    activeApplicantData = SAMPLE_FEMALE_DATA;
  } else if (sampleApplicantSource === 'queue' && queue.length > 0) {
    const item = queue[selectedQueueItemIndex] || queue[0];
    activeApplicantData = item.extractedData || SAMPLE_ID_DATA;
  }

  // Active key for overriding photos locally
  const currentApplicantKey =
    sampleApplicantSource === 'queue'
      ? queue[selectedQueueItemIndex]?.id || 'queue-0'
      : sampleApplicantSource;

  if (overridePhotos[currentApplicantKey]) {
    activeApplicantData = {
      ...activeApplicantData,
      photoUrl: overridePhotos[currentApplicantKey].photoUrl,
      secondaryPhotoUrl: overridePhotos[currentApplicantKey].secondaryPhotoUrl,
    };
  }

  // Handle Make Both Photos Transparent
  const handleMakeBothPhotosTransparent = async () => {
    if (!activeApplicantData.photoUrl && !activeApplicantData.secondaryPhotoUrl) {
      showToast('No photos available to process');
      return;
    }

    try {
      setIsCuttingBothBg(true);
      let cut1 = activeApplicantData.photoUrl;
      if (activeApplicantData.photoUrl) {
        cut1 = (await autoRemovePhotoBackground(activeApplicantData.photoUrl)) || activeApplicantData.photoUrl;
      }
      let cut2 = cut1;
      if (activeApplicantData.secondaryPhotoUrl && activeApplicantData.secondaryPhotoUrl !== activeApplicantData.photoUrl) {
        cut2 = (await autoRemovePhotoBackground(activeApplicantData.secondaryPhotoUrl)) || activeApplicantData.secondaryPhotoUrl;
      } else {
        cut2 = cut1;
      }

      setOverridePhotos((prev) => ({
        ...prev,
        [currentApplicantKey]: { photoUrl: cut1, secondaryPhotoUrl: cut2 },
      }));

      // Update queue item if from batch queue
      if (sampleApplicantSource === 'queue' && queue.length > 0) {
        const item = queue[selectedQueueItemIndex] || queue[0];
        if (item && onUpdateQueueItemPhotos) {
          onUpdateQueueItemPhotos(item.id, cut1, cut2);
        }
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

  // Field definitions
  const fieldList = [
    // Front Text Fields
    { id: 'fullNameAmharic', label: 'Amharic Full Name (ሙሉ ስም)', side: 'front', isMedia: false },
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
    if (selectedFieldSide === 'front') return f.side === 'front';
    if (selectedFieldSide === 'back') return f.side === 'back';
    if (selectedFieldSide === 'media') return f.isMedia;
    return true;
  });

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

  // Update a single property and propagate real-time
  const handleUpdateProp = (prop: string, val: any) => {
    let newCoords: CoordinatesConfig;
    if (isMedia) {
      newCoords = {
        ...workingCoords,
        media: {
          ...workingCoords.media,
          [selectedFieldId]: {
            ...(workingCoords.media[selectedFieldId] || activeMedia || {
              id: selectedFieldId,
              label: selectedFieldId,
              side: 'front',
              x: 0,
              y: 0,
              width: currentWidth,
              height: 100,
            }),
            [prop]: val,
          },
        },
      };
    } else {
      newCoords = {
        ...workingCoords,
        fields: {
          ...workingCoords.fields,
          [selectedFieldId]: {
            ...workingCoords.fields[selectedFieldId],
            [prop]: val,
          },
        },
      };
    }
    setWorkingCoords(newCoords);
    onUpdateConfig(newCoords);
    saveTemplateCoordinates(activeTemplateNumber, newCoords);
  };

  // Direct move handler
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

    let newCoords: CoordinatesConfig;
    if (isTargetMedia) {
      newCoords = {
        ...workingCoords,
        media: {
          ...workingCoords.media,
          [fieldId]: {
            ...(workingCoords.media[fieldId] || DEFAULT_COORDINATES.media[fieldId] || {
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
      };
    } else {
      newCoords = {
        ...workingCoords,
        fields: {
          ...workingCoords.fields,
          [fieldId]: {
            ...workingCoords.fields[fieldId],
            x: clampedX,
            y: clampedY,
          },
        },
      };
    }
    setWorkingCoords(newCoords);
    onUpdateConfig(newCoords);
    saveTemplateCoordinates(activeTemplateNumber, newCoords);
  };

  // Resize handler
  const handleResizeField = (fieldId: string, newW: number, newH: number) => {
    let newCoords: CoordinatesConfig;
    if (workingCoords.media[fieldId] || DEFAULT_COORDINATES.media[fieldId]) {
      newCoords = {
        ...workingCoords,
        media: {
          ...workingCoords.media,
          [fieldId]: {
            ...(workingCoords.media[fieldId] || DEFAULT_COORDINATES.media[fieldId]),
            width: Math.max(20, Math.round(newW)),
            height: Math.max(20, Math.round(newH)),
          },
        },
      };
    } else if (workingCoords.fields[fieldId]) {
      newCoords = {
        ...workingCoords,
        fields: {
          ...workingCoords.fields,
          [fieldId]: {
            ...workingCoords.fields[fieldId],
            maxWidth: Math.max(50, Math.round(newW)),
          },
        },
      };
    } else {
      return;
    }
    setWorkingCoords(newCoords);
    onUpdateConfig(newCoords);
    saveTemplateCoordinates(activeTemplateNumber, newCoords);
  };

  // Directional Nudge
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
    showToast(`Centered ${selectedFieldId} horizontally`);
  };

  // Reset selected field to default
  const resetSelectedField = () => {
    let newCoords: CoordinatesConfig;
    if (isMedia && DEFAULT_COORDINATES.media[selectedFieldId]) {
      newCoords = {
        ...workingCoords,
        media: {
          ...workingCoords.media,
          [selectedFieldId]: { ...DEFAULT_COORDINATES.media[selectedFieldId] },
        },
      };
      showToast(`Reset ${selectedFieldId} to default`);
    } else if (DEFAULT_COORDINATES.fields[selectedFieldId]) {
      newCoords = {
        ...workingCoords,
        fields: {
          ...workingCoords.fields,
          [selectedFieldId]: { ...DEFAULT_COORDINATES.fields[selectedFieldId] },
        },
      };
      showToast(`Reset ${selectedFieldId} to default`);
    } else {
      return;
    }
    setWorkingCoords(newCoords);
    onUpdateConfig(newCoords);
    saveTemplateCoordinates(activeTemplateNumber, newCoords);
  };

  // Reset all to default coordinates
  const resetAllToDefaults = () => {
    if (window.confirm(`Reset all coordinates for Template #${activeTemplateNumber} to standard Fayda layout?`)) {
      const standard = JSON.parse(JSON.stringify(DEFAULT_COORDINATES));
      setWorkingCoords(standard);
      onUpdateConfig(standard);
      saveTemplateCoordinates(activeTemplateNumber, standard);
      showToast(`Template #${activeTemplateNumber} reset to default layout`);
    }
  };

  // Explicit Save Confirmation
  const handleExplicitSave = () => {
    onUpdateConfig(workingCoords);
    saveTemplateCoordinates(activeTemplateNumber, workingCoords);
    try {
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.5 } });
    } catch {}
    showToast(`✓ Positions saved for Template #${activeTemplateNumber}!`);
  };

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-xl overflow-hidden mb-6 text-white transition-all animate-fadeIn">
      {/* Panel Header */}
      <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-950/40">
            <Columns className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Side-by-Side Template Preview</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <Hash className="w-2.5 h-2.5" />
                <span>Template #{activeTemplateNumber}</span>
              </span>
              <span className="hidden sm:inline-block text-[11px] text-slate-400 font-normal">
                ({templateName})
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Live dual-sided comparison of Front & Back as you adjust coordinates in real-time
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Numbered Template Quick Switcher */}
          {numberedTemplates && numberedTemplates.length > 0 && onSelectTemplateNumber && (
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1">
                <Hash className="w-3 h-3 text-slate-500" />
                <span className="hidden md:inline">Slot:</span>
              </span>
              <div className="flex items-center gap-1">
                {numberedTemplates.slice(0, 8).map((t) => {
                  const isAct = t.number === activeTemplateNumber;
                  return (
                    <button
                      key={t.number}
                      type="button"
                      onClick={() => onSelectTemplateNumber(t.number)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        isAct
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      }`}
                      title={`${t.name} (Template #${t.number})`}
                    >
                      #{t.number}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Toast Message */}
          {toastMessage && (
            <div className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold animate-fadeIn">
              {toastMessage}
            </div>
          )}

          {/* Make Both Photos Transparent Button */}
          <button
            type="button"
            onClick={handleMakeBothPhotosTransparent}
            disabled={isCuttingBothBg}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Remove background from both Photo 1 and Photo 2 and make them transparent"
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

          {/* Toggle fine tuning tools drawer */}
          <button
            type="button"
            onClick={() => setIsToolsExpanded(!isToolsExpanded)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              isToolsExpanded
                ? 'bg-slate-800 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-300 hover:text-white border-slate-700'
            }`}
            title="Toggle fine-tuning coordinates controls"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Coordinates Tools</span>
            {isToolsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Full Calibrator Modal Trigger */}
          {onOpenPositionEditorModal && (
            <button
              type="button"
              onClick={onOpenPositionEditorModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Open full-screen interactive calibrator modal"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Advanced Editor</span>
            </button>
          )}

          {/* Close Panel */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Close side-by-side preview panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Secondary Bar: Applicant Switcher & Visual Helpers */}
      <div className="px-5 py-2.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Applicant Data Source */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span>Test Data:</span>
          </span>

          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setSampleApplicantSource('queue')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                sampleApplicantSource === 'queue'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Batch Queue ({queue.length})
            </button>
            <button
              type="button"
              onClick={() => setSampleApplicantSource('male')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                sampleApplicantSource === 'male'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Demo Male
            </button>
            <button
              type="button"
              onClick={() => setSampleApplicantSource('female')}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                sampleApplicantSource === 'female'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Demo Female
            </button>
          </div>

          {/* Queue Item Switcher if Queue is selected */}
          {sampleApplicantSource === 'queue' && queue.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedQueueItemIndex((prev) => (prev > 0 ? prev - 1 : queue.length - 1))}
                className="text-slate-400 hover:text-white p-0.5"
                title="Previous queued applicant"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] text-emerald-400 truncate max-w-[140px] text-center px-1 font-semibold">
                #{selectedQueueItemIndex + 1} {queue[selectedQueueItemIndex]?.extractedData.fullNameEnglish?.split(' ')[0] || 'Applicant'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedQueueItemIndex((prev) => (prev < queue.length - 1 ? prev + 1 : 0))}
                className="text-slate-400 hover:text-white p-0.5"
                title="Next queued applicant"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Zoom Scale & Helper Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom buttons */}
          <div className="flex items-center bg-slate-900 px-1.5 py-0.5 rounded-lg border border-slate-800 text-slate-400">
            <button
              type="button"
              onClick={() => setPreviewScale((s) => Math.max(0.35, +(s - 0.05).toFixed(2)))}
              className="p-1 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="px-1.5 font-mono text-[11px] font-bold text-slate-300">
              {Math.round(previewScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setPreviewScale((s) => Math.min(0.85, +(s + 0.05).toFixed(2)))}
              className="p-1 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* Grid Toggle */}
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showGrid
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Alignment Grid (20px intervals)"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          {/* Coordinate Badges Toggle */}
          <button
            type="button"
            onClick={() => setShowCoordinateBadges(!showCoordinateBadges)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showCoordinateBadges
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle (X, Y) Coordinate Badges on elements"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>

          {/* Corner Marks Toggle */}
          <button
            type="button"
            onClick={() => setShowCornerMarks(!showCornerMarks)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              showCornerMarks
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Corner Registration Crosshairs"
          >
            <span className="font-mono text-xs font-bold leading-none">+</span>
          </button>

          {/* Photo Color Mode Toggle */}
          <button
            type="button"
            onClick={() => setLocalColorMode((m) => (m === 'color' ? 'grayscale' : 'color'))}
            className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
              localColorMode === 'grayscale'
                ? 'bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
            }`}
            title="Toggle Photo color mode for preview"
          >
            {localColorMode === 'grayscale' ? 'B&W Photo' : 'Color Photo'}
          </button>
        </div>
      </div>

      {/* Main Content Area: Side-by-Side Cards Comparison */}
      <div className="p-4 sm:p-6 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] overflow-x-auto flex flex-col items-center">
        
        <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-8 min-w-min">
          {/* FRONT CARD CONTAINER */}
          <div className="flex flex-col items-center space-y-2">
            <div className="flex items-center justify-between w-full px-1 text-xs gap-2">
              <span className="font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                <span>Front Side (CR80)</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMakeBothPhotosTransparent}
                  disabled={isCuttingBothBg}
                  className="flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="Make both Photo 1 and Photo 2 transparent"
                >
                  {isCuttingBothBg ? (
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-300" />
                  ) : (
                    <Scissors className="w-3 h-3 text-amber-300" />
                  )}
                  <span>⚡ Both Photos Transparent</span>
                </button>
                <span className="font-mono text-[10px] text-slate-500">
                  1012 × 638 px • Template #{activeTemplateNumber}
                </span>
              </div>
            </div>

            <div className="shadow-2xl rounded-2xl ring-1 ring-slate-700/80 overflow-hidden bg-white">
              <CardRenderer
                side="front"
                data={activeApplicantData}
                config={workingCoords}
                templateConfig={effectiveTemplateConfig}
                scale={previewScale}
                highlightField={selectedFieldId}
                onSelectField={(id) => setSelectedFieldId(id)}
                onMoveField={handleMoveField}
                onResizeField={handleResizeField}
                interactive={true}
                showGrid={showGrid}
                showCoordinatesBadges={showCoordinateBadges}
                showCornerMarks={showCornerMarks}
                photoColorMode={localColorMode}
              />
            </div>
          </div>

          {/* BACK CARD CONTAINER */}
          <div className="flex flex-col items-center space-y-2">
            <div className="flex items-center justify-between w-full px-1 text-xs">
              <span className="font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                <span>Back Side (CR80)</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                1012 × 638 px • Template #{activeTemplateNumber}
              </span>
            </div>

            <div className="shadow-2xl rounded-2xl ring-1 ring-slate-700/80 overflow-hidden bg-white">
              <CardRenderer
                side="back"
                data={activeApplicantData}
                config={workingCoords}
                templateConfig={effectiveTemplateConfig}
                scale={previewScale}
                highlightField={selectedFieldId}
                onSelectField={(id) => setSelectedFieldId(id)}
                onMoveField={handleMoveField}
                onResizeField={handleResizeField}
                interactive={true}
                showGrid={showGrid}
                showCoordinatesBadges={showCoordinateBadges}
                showCornerMarks={showCornerMarks}
                photoColorMode={localColorMode}
              />
            </div>
          </div>
        </div>

        {/* Interaction Hint */}
        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-full shadow-xs">
            <Eye className="w-3 h-3 text-emerald-400" />
            <span>Click & drag any field directly on either card, or use the precision tools below</span>
          </span>
        </div>
      </div>

      {/* Real-time Fine Tuning Drawer (collapsible) */}
      {isToolsExpanded && (
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Element Selector Column (5 cols) */}
            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select Active Element</span>
                </span>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  {(['all', 'front', 'back', 'media'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedFieldSide(cat)}
                      className={`px-2 py-0.5 rounded capitalize transition-all cursor-pointer ${
                        selectedFieldSide === cat
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Elements Dropdown & Pill List */}
              <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
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
                      className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400' 
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
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

            {/* Precision Nudge & Sliders (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900/90 rounded-2xl border border-slate-800 p-4 space-y-4">
              
              {/* Header of Active Element */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Move className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {isMedia ? (activeMedia?.label || selectedFieldId) : (activeField?.label || selectedFieldId)}
                    </h4>
                    <p className="text-[10px] font-mono text-emerald-400">
                      Coordinates: X={currentX}px, Y={currentY}px • Width={currentWidth}px
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={centerHorizontally}
                    className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                    title="Center field horizontally on card"
                  >
                    <AlignHorizontalJustifyCenter className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Center</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetSelectedField}
                    className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                    title="Reset to default standard position"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Controls Layout: D-Pad Nudge & Slider Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                
                {/* Left: Directional Nudge D-Pad */}
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="flex items-center justify-between w-full px-2 text-[11px] text-slate-400 font-semibold">
                    <span>Precision Nudge</span>
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                      {[1, 5, 10, 25].map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setNudgeStep(step)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                            nudgeStep === step ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {step}px
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* D-Pad Buttons */}
                  <div className="grid grid-cols-3 gap-1.5 w-36 h-28 p-1.5 bg-slate-950 rounded-2xl border border-slate-800">
                    <div></div>
                    <button
                      type="button"
                      onClick={() => nudge(0, -nudgeStep)}
                      className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95 shadow-xs"
                      title={`Nudge Up (-${nudgeStep}px)`}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <div></div>

                    <button
                      type="button"
                      onClick={() => nudge(-nudgeStep, 0)}
                      className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95 shadow-xs"
                      title={`Nudge Left (-${nudgeStep}px)`}
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center justify-center text-[10px] font-mono text-slate-500 font-bold">
                      {nudgeStep}px
                    </div>
                    <button
                      type="button"
                      onClick={() => nudge(nudgeStep, 0)}
                      className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95 shadow-xs"
                      title={`Nudge Right (+${nudgeStep}px)`}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <div></div>
                    <button
                      type="button"
                      onClick={() => nudge(0, nudgeStep)}
                      className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95 shadow-xs"
                      title={`Nudge Down (+${nudgeStep}px)`}
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <div></div>
                  </div>
                </div>

                {/* Right: Numeric Inputs & Sliders */}
                <div className="space-y-3">
                  {/* X Coordinate Slider & Input */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span className="font-semibold">Horizontal Position (X)</span>
                      <span className="font-mono text-emerald-400">{currentX} px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max={workingCoords.canvasWidth - 20}
                        value={currentX}
                        onChange={(e) => handleUpdateProp('x', Number(e.target.value))}
                        className="flex-1 accent-emerald-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="0"
                        max={workingCoords.canvasWidth}
                        value={currentX}
                        onChange={(e) => handleUpdateProp('x', Number(e.target.value))}
                        className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  {/* Y Coordinate Slider & Input */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span className="font-semibold">Vertical Position (Y)</span>
                      <span className="font-mono text-emerald-400">{currentY} px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max={workingCoords.canvasHeight - 20}
                        value={currentY}
                        onChange={(e) => handleUpdateProp('y', Number(e.target.value))}
                        className="flex-1 accent-emerald-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="0"
                        max={workingCoords.canvasHeight}
                        value={currentY}
                        onChange={(e) => handleUpdateProp('y', Number(e.target.value))}
                        className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  {(selectedFieldId === 'photoFront' || selectedFieldId === 'photoFrontSecondary') && (
                    <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                          <Scissors className="w-3 h-3" />
                          <span>Photo Background Transparency</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Auto-crop background to clean transparent alpha on both photos
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleMakeBothPhotosTransparent}
                        disabled={isCuttingBothBg}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 whitespace-nowrap"
                      >
                        {isCuttingBothBg ? 'Processing...' : '⚡ Make Both Photos Transparent'}
                      </button>
                    </div>
                  )}

                  {/* Action Buttons: Save to Template & Reset */}
                  <div className="flex items-center justify-between pt-1 gap-2">
                    <button
                      type="button"
                      onClick={resetAllToDefaults}
                      className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      Reset All to Default
                    </button>

                    <button
                      type="button"
                      onClick={handleExplicitSave}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-950/40 transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save to Template #{activeTemplateNumber}</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
