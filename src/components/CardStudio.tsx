import React, { useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  CreditCard, 
  RotateCw, 
  Download, 
  Printer, 
  Sparkles, 
  User, 
  Upload, 
  Layers, 
  Check, 
  ZoomIn, 
  ZoomOut,
  FileDown,
  Sliders,
  Move,
  Grid,
  Tag,
  Crosshair,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AlignHorizontalJustifyCenter,
  Type,
  Palette,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Image as ImageIcon
} from 'lucide-react';
import { IdCardData, CoordinatesConfig, TemplateConfig, AppSettings, BatchQueueItem } from '../types';
import { CardRenderer } from './CardRenderer';
import { ExportPdfModal } from './ExportPdfModal';
import { FieldPositionEditor } from './FieldPositionEditor';
import { CustomTemplateModal } from './CustomTemplateModal';
import { PhotoAdjustModal } from './PhotoAdjustModal';
import { AppSettingsModal, loadSavedAppSettings, saveAppSettingsToStorage } from './AppSettingsModal';
import { SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA, DEFAULT_COORDINATES, PRESET_TEMPLATES } from '../data/defaultData';
import { generateAndDownloadIdPdf, generateAndDownloadIdJpeg } from '../utils/pdfGenerator';
import { sanitizeIdCardData, cleanFieldText } from '../utils/textCleaner';
import { convertGcToEth, convertEthToGc, formatCardDualDate } from '../utils/ethiopianCalendar';

interface CardStudioProps {
  idData: IdCardData;
  setIdData: React.Dispatch<React.SetStateAction<IdCardData>>;
  config: CoordinatesConfig;
  setConfig: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  templateConfig: TemplateConfig;
  setTemplateConfig: React.Dispatch<React.SetStateAction<TemplateConfig>>;
  onOpenExtractor?: () => void;
  onOpenCalibrator?: () => void;
  queue?: BatchQueueItem[];
  activeQueueIndex?: number;
  onSelectQueueIndex?: (index: number) => void;
  onOpenBatch?: () => void;
}

export const CardStudio: React.FC<CardStudioProps> = ({
  idData,
  setIdData,
  config,
  setConfig,
  templateConfig,
  setTemplateConfig,
  onOpenExtractor,
  onOpenCalibrator,
  queue = [],
  activeQueueIndex = 0,
  onSelectQueueIndex,
  onOpenBatch,
}) => {
  const [viewMode, setViewMode] = useState<'both' | 'flip' | 'front' | 'back'>('both');
  const [isFlipped, setIsFlipped] = useState(false);
  const [zoomScale, setZoomScale] = useState(0.72);
  const [isGeneratingQuickPdf, setIsGeneratingQuickPdf] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isPhotoAdjustModalOpen, setIsPhotoAdjustModalOpen] = useState(false);
  const [photoAdjustTarget, setPhotoAdjustTarget] = useState<'primary' | 'secondary'>('primary');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSavedAppSettings());
  const [quickStatus, setQuickStatus] = useState<string>('');

  // Interactive Positioning & Customization States
  const [isInteractiveDragMode, setIsInteractiveDragMode] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showCoordinateBadges, setShowCoordinateBadges] = useState<boolean>(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>('fullNameAmharic');
  const [expandedPositionField, setExpandedPositionField] = useState<string | null>(null);

  const frontExportRef = useRef<HTMLDivElement>(null);
  const backExportRef = useRef<HTMLDivElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setIdData((prev) => ({
            ...prev,
            photoUrl: event.target!.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSecondaryPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setIdData((prev) => ({
            ...prev,
            secondaryPhotoUrl: event.target!.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMoveField = (fieldId: string, newX: number, newY: number) => {
    const isMedia = 
      fieldId === 'photoFront' || 
      fieldId === 'photoFrontSecondary' || 
      fieldId === 'frontBarcode' || 
      fieldId === 'qrCodeBack' || 
      Boolean(config.media[fieldId]);
    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...prev.media[fieldId],
            x: newX,
            y: newY,
          },
        },
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...prev.fields[fieldId],
            x: newX,
            y: newY,
          },
        },
      }));
    }
  };

  const handleNudgeSelected = (dx: number, dy: number) => {
    if (!selectedFieldId) return;
    const isMedia = 
      selectedFieldId === 'photoFront' || 
      selectedFieldId === 'photoFrontSecondary' || 
      selectedFieldId === 'frontBarcode' || 
      selectedFieldId === 'qrCodeBack' || 
      Boolean(config.media[selectedFieldId]);
    if (isMedia && config.media[selectedFieldId]) {
      const item = config.media[selectedFieldId];
      handleMoveField(
        selectedFieldId,
        Math.max(0, Math.min(config.canvasWidth, item.x + dx)),
        Math.max(0, Math.min(config.canvasHeight, item.y + dy))
      );
    } else if (config.fields[selectedFieldId]) {
      const item = config.fields[selectedFieldId];
      handleMoveField(
        selectedFieldId,
        Math.max(0, Math.min(config.canvasWidth, item.x + dx)),
        Math.max(0, Math.min(config.canvasHeight, item.y + dy))
      );
    }
  };

  const handleCenterSelected = () => {
    if (!selectedFieldId) return;
    const isMedia = 
      selectedFieldId === 'photoFront' || 
      selectedFieldId === 'photoFrontSecondary' || 
      selectedFieldId === 'frontBarcode' || 
      selectedFieldId === 'qrCodeBack' || 
      Boolean(config.media[selectedFieldId]);
    const itemWidth = isMedia
      ? config.media[selectedFieldId]?.width || 200
      : config.fields[selectedFieldId]?.maxWidth || 250;
    const newX = Math.max(0, Math.round((config.canvasWidth - itemWidth) / 2));
    const currentY = isMedia
      ? config.media[selectedFieldId]?.y || 0
      : config.fields[selectedFieldId]?.y || 0;
    handleMoveField(selectedFieldId, newX, currentY);
  };

  const handleResetCoordinates = () => {
    if (window.confirm('Reset all field positions and dimensions to the standard Ethiopian ID template defaults?')) {
      setConfig(DEFAULT_COORDINATES);
    }
  };

  const handleQuickExport = async () => {
    if (!frontExportRef.current || !backExportRef.current) {
      setIsExportModalOpen(true);
      return;
    }

    setIsGeneratingQuickPdf(true);
    setQuickStatus(`Rendering 300 DPI ID Card in ${appSettings.defaultExportFormat.toUpperCase()} format...`);

    try {
      if (appSettings.defaultExportFormat === 'jpeg') {
        await generateAndDownloadIdJpeg(
          frontExportRef.current,
          backExportRef.current,
          idData,
          config,
          {
            layout: appSettings.jpegLayout || 'combined_sheet',
            quality: appSettings.jpegQuality || 0.98,
            resolutionDpi: appSettings.resolutionDpi || 300,
            includeCropMarks: appSettings.includeCropMarks !== false,
            includeMetadataHeader: appSettings.includeMetadataHeader !== false,
          },
          (status) => setQuickStatus(status)
        );
      } else {
        await generateAndDownloadIdPdf(
          frontExportRef.current,
          backExportRef.current,
          idData,
          config,
          {
            format: appSettings.pdfFormat || 'a4_sheet',
            resolutionDpi: appSettings.resolutionDpi || 300,
            includeCropMarks: appSettings.includeCropMarks !== false,
            includeMetadataHeader: appSettings.includeMetadataHeader !== false,
          },
          (status) => setQuickStatus(status)
        );
      }

      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch (e) {
        // Ignored
      }
    } catch (err) {
      console.error('Quick generation failed:', err);
      setIsExportModalOpen(true);
    } finally {
      setIsGeneratingQuickPdf(false);
      setQuickStatus('');
    }
  };

  const handleLoadSample = (sample: 'ayele' | 'helen') => {
    if (sample === 'ayele') {
      setIdData(SAMPLE_ID_DATA);
    } else {
      setIdData(SAMPLE_FEMALE_DATA);
    }
  };

  const handleCleanAllText = () => {
    setIdData((prev) => sanitizeIdCardData(prev));
  };

  const handleSetFanTop = () => {
    setConfig((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        fan: {
          ...prev.fields.fan,
          x: 520,
          y: 115,
        },
      },
      media: {
        ...prev.media,
        frontBarcode: {
          ...prev.media.frontBarcode,
          x: 520,
          y: 72,
        },
      },
    }));
  };

  const handleSetFanBottom = () => {
    setConfig((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        fan: {
          ...prev.fields.fan,
          x: 485,
          y: 565,
        },
      },
      media: {
        ...prev.media,
        frontBarcode: {
          ...prev.media.frontBarcode,
          x: 485,
          y: 520,
        },
      },
    }));
  };

  const toggleFieldPositionEditor = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    setExpandedPositionField((prev) => (prev === fieldId ? null : fieldId));
  };

  const isCurrentMedia = 
    selectedFieldId === 'photoFront' || 
    selectedFieldId === 'photoFrontSecondary' || 
    selectedFieldId === 'frontBarcode' || 
    selectedFieldId === 'qrCodeBack' || 
    Boolean(selectedFieldId && config.media[selectedFieldId]);
  const activeSelectedLabel = isCurrentMedia
    ? config.media[selectedFieldId!]?.label
    : config.fields[selectedFieldId!]?.label;
  const activeSelectedX = isCurrentMedia
    ? config.media[selectedFieldId!]?.x
    : config.fields[selectedFieldId!]?.x;
  const activeSelectedY = isCurrentMedia
    ? config.media[selectedFieldId!]?.y
    : config.fields[selectedFieldId!]?.y;

  return (
    <div className="space-y-6">
      {/* Hidden Full-Scale DOM nodes for quick high-res exports */}
      <div className="fixed -left-[9999px] -top-[9999px] pointer-events-none opacity-100">
        <div ref={frontExportRef} style={{ width: '1012px', height: '638px' }}>
          <CardRenderer
            side="front"
            data={idData}
            config={config}
            templateConfig={templateConfig}
            scale={1}
            isExporting={true}
          />
        </div>
        <div ref={backExportRef} style={{ width: '1012px', height: '638px' }}>
          <CardRenderer
            side="back"
            data={idData}
            config={config}
            templateConfig={templateConfig}
            scale={1}
            isExporting={true}
          />
        </div>
      </div>

      {/* Batch Processing Navigation Banner if queue exists */}
      {queue.length > 0 && onSelectQueueIndex && (
        <div className="bg-slate-900 text-white rounded-2xl p-3.5 px-4 sm:px-6 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">
                  Batch Queue ({activeQueueIndex + 1} of {queue.length})
                </span>
                <span className="bg-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.2 rounded-full">
                  {idData.fan}
                </span>
              </div>
              <p className="text-xs text-white font-bold truncate max-w-[280px] sm:max-w-md">
                {idData.fullNameEnglish} ({idData.fullNameAmharic})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={activeQueueIndex <= 0}
              onClick={() => onSelectQueueIndex(activeQueueIndex - 1)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous Card</span>
            </button>

            <button
              type="button"
              disabled={activeQueueIndex >= queue.length - 1}
              onClick={() => onSelectQueueIndex(activeQueueIndex + 1)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <span>Next Card</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {onOpenBatch && (
              <button
                type="button"
                onClick={onOpenBatch}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ml-1 flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Open Batch Queue ({queue.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Action & View Bar */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* View Modes */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'both'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setViewMode('flip')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'flip'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              3D Interactive Flip
            </button>
            <button
              onClick={() => setViewMode('front')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'front'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Front Only
            </button>
            <button
              onClick={() => setViewMode('back')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'back'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Back Only
            </button>
          </div>

          {/* Sample Presets & PDF Extractor Shortcut */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 border-l pl-3">
            {onOpenExtractor && (
              <button
                type="button"
                onClick={onOpenExtractor}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Upload Ethiopian ID / Fayda verification PDF or image to extract all fields"
              >
                <Upload className="w-3 h-3 text-emerald-400" />
                <span>Import PDF Slip</span>
              </button>
            )}
            <span className="font-medium ml-1">Presets:</span>
            <button
              onClick={() => handleLoadSample('ayele')}
              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md font-medium border border-emerald-200 transition-colors cursor-pointer"
            >
              Ayele Zekwos
            </button>
            <button
              onClick={() => handleLoadSample('helen')}
              className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-md font-medium border border-cyan-200 transition-colors cursor-pointer"
            >
              Helen Tadesse
            </button>
          </div>
        </div>

        {/* Zoom, Template Manager & Export Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Insert / Manage Template Button */}
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border ${
              templateConfig.sourceType === 'custom' || templateConfig.frontImageUrl || templateConfig.backImageUrl
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800'
            }`}
            title="Upload custom empty background template or manage security layers"
          >
            <LayoutTemplate className="w-4 h-4 text-emerald-400" />
            <span>
              {templateConfig.sourceType === 'custom' || templateConfig.frontImageUrl || templateConfig.backImageUrl
                ? 'Custom Template Active'
                : 'Insert My Template'}
            </span>
            {(templateConfig.frontImageUrl || templateConfig.backImageUrl) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setZoomScale((prev) => Math.max(0.45, prev - 0.08))}
              className="p-1 text-gray-600 hover:text-gray-900 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono font-medium text-gray-700">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((prev) => Math.min(1.0, prev + 0.08))}
              className="p-1 text-gray-600 hover:text-gray-900 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Persistent Export Settings */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="System Settings: Change default format (PDF/JPEG) once for all time"
          >
            <Sliders className="w-4 h-4 text-emerald-600" />
            <span>Settings</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
              {appSettings.defaultExportFormat}
            </span>
          </button>

          <button
            onClick={handleQuickExport}
            disabled={isGeneratingQuickPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-60"
            title={`Fast 300 DPI Export in your preferred format (${appSettings.defaultExportFormat.toUpperCase()})`}
          >
            {appSettings.defaultExportFormat === 'jpeg' ? (
              <ImageIcon className="w-4 h-4 text-emerald-700" />
            ) : (
              <Printer className="w-4 h-4 text-emerald-700" />
            )}
            {isGeneratingQuickPdf ? 'Rendering...' : `Quick ${appSettings.defaultExportFormat.toUpperCase()} Export`}
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>Export Studio (PDF / JPEG)</span>
          </button>
        </div>
      </div>

      {/* Main Stage Grid: Template Canvas + Editor */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visual Template Stage with Interactive Positioning Controls */}
        <div className="xl:col-span-8 space-y-3">
          {/* On-Template Position Customizer Toolbar */}
          <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" />
                Template Customizer:
              </span>

              {/* Drag Mode Toggle */}
              <button
                type="button"
                onClick={() => setIsInteractiveDragMode(!isInteractiveDragMode)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isInteractiveDragMode
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Click and drag any text or media on the card to reposition directly"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{isInteractiveDragMode ? 'Drag Mode ON' : 'Drag Mode OFF'}</span>
              </button>

              {/* Grid Toggle */}
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  showGrid
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Toggle calibration grid and crosshair center lines"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>

              {/* Coordinates Badges Toggle */}
              <button
                type="button"
                onClick={() => setShowCoordinateBadges(!showCoordinateBadges)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  showCoordinateBadges
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Display X/Y coordinate numbers on each field on the card"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Show X/Y Badges</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetCoordinates}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 transition-colors p-1"
                title="Reset all positions to standard defaults"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Coordinates</span>
              </button>

              {onOpenCalibrator && (
                <button
                  type="button"
                  onClick={onOpenCalibrator}
                  className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg border border-slate-700 transition-colors"
                >
                  <Sliders className="w-3 h-3 text-emerald-400" />
                  <span>Full Calibrator</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Element Nudge & Position Quick Controller */}
          {selectedFieldId && (
            <div className="bg-slate-950 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-inner flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <div>
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <span>Selected: {activeSelectedLabel || selectedFieldId}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                      X: {activeSelectedX}px | Y: {activeSelectedY}px
                    </span>
                  </div>
                </div>
              </div>

              {/* D-Pad Nudger Buttons */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(-1, 0)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Left 1px"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, -1)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Up 1px"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, 1)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Down 1px"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(1, 0)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Right 1px"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 5px Step Nudge */}
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(-5, 0)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Left 5px"
                  >
                    -5X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(5, 0)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Right 5px"
                  >
                    +5X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, -5)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Up 5px"
                  >
                    -5Y
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, 5)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Down 5px"
                  >
                    +5Y
                  </button>
                </div>

                {/* Center Horizontally */}
                <button
                  type="button"
                  onClick={handleCenterSelected}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 rounded-lg border border-emerald-800/80 transition-colors"
                  title="Center horizontally on template"
                >
                  <AlignHorizontalJustifyCenter className="w-3 h-3" />
                  <span>Center</span>
                </button>
              </div>
            </div>
          )}

          {/* Canvas Viewport Stage */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center min-h-[540px] overflow-hidden relative">
            {/* Card Dimensions Badge */}
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700 text-[11px] text-slate-300 font-mono z-20">
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              <span>CR80 ISO-7810 | {config.canvasWidth} × {config.canvasHeight} px (300 DPI)</span>
            </div>

            {/* Flip Toggle Button for Flip View */}
            {viewMode === 'flip' && (
              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-full text-xs shadow-lg transition-all cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Flip to {isFlipped ? 'Front' : 'Back'}
                </button>
              </div>
            )}

            {/* Render Mode Content */}
            {viewMode === 'both' && (
              <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full py-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Front Side (Click/Drag to Customize Position)
                  </span>
                  <CardRenderer
                    side="front"
                    data={idData}
                    config={config}
                    templateConfig={templateConfig}
                    scale={zoomScale}
                    highlightField={selectedFieldId}
                    onSelectField={(fId) => setSelectedFieldId(fId)}
                    onMoveField={handleMoveField}
                    interactive={isInteractiveDragMode}
                    showGrid={showGrid}
                    showCoordinatesBadges={showCoordinateBadges}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Back Side (Click/Drag to Customize Position)
                  </span>
                  <CardRenderer
                    side="back"
                    data={idData}
                    config={config}
                    templateConfig={templateConfig}
                    scale={zoomScale}
                    highlightField={selectedFieldId}
                    onSelectField={(fId) => setSelectedFieldId(fId)}
                    onMoveField={handleMoveField}
                    interactive={isInteractiveDragMode}
                    showGrid={showGrid}
                    showCoordinatesBadges={showCoordinateBadges}
                  />
                </div>
              </div>
            )}

            {viewMode === 'flip' && (
              <div className="py-6 perspective-[1200px]">
                <div
                  className="transition-transform duration-700 ease-out cursor-pointer"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  {!isFlipped ? (
                    <CardRenderer
                      side="front"
                      data={idData}
                      config={config}
                      templateConfig={templateConfig}
                      scale={zoomScale * 1.15}
                      highlightField={selectedFieldId}
                      onSelectField={(fId) => setSelectedFieldId(fId)}
                      onMoveField={handleMoveField}
                      interactive={isInteractiveDragMode}
                      showGrid={showGrid}
                      showCoordinatesBadges={showCoordinateBadges}
                    />
                  ) : (
                    <div style={{ transform: 'rotateY(180deg)' }}>
                      <CardRenderer
                        side="back"
                        data={idData}
                        config={config}
                        templateConfig={templateConfig}
                        scale={zoomScale * 1.15}
                        highlightField={selectedFieldId}
                        onSelectField={(fId) => setSelectedFieldId(fId)}
                        onMoveField={handleMoveField}
                        interactive={isInteractiveDragMode}
                        showGrid={showGrid}
                        showCoordinatesBadges={showCoordinateBadges}
                      />
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-slate-400 mt-4">
                  💡 Click card to flip between Front and Back
                </p>
              </div>
            )}

            {viewMode === 'front' && (
              <div className="py-4">
                <CardRenderer
                  side="front"
                  data={idData}
                  config={config}
                  templateConfig={templateConfig}
                  scale={zoomScale * 1.2}
                  highlightField={selectedFieldId}
                  onSelectField={(fId) => setSelectedFieldId(fId)}
                  onMoveField={handleMoveField}
                  interactive={isInteractiveDragMode}
                  showGrid={showGrid}
                  showCoordinatesBadges={showCoordinateBadges}
                />
              </div>
            )}

            {viewMode === 'back' && (
              <div className="py-4">
                <CardRenderer
                  side="back"
                  data={idData}
                  config={config}
                  templateConfig={templateConfig}
                  scale={zoomScale * 1.2}
                  highlightField={selectedFieldId}
                  onSelectField={(fId) => setSelectedFieldId(fId)}
                  onMoveField={handleMoveField}
                  interactive={isInteractiveDragMode}
                  showGrid={showGrid}
                  showCoordinatesBadges={showCoordinateBadges}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Real-Time Field Form with Integrated Position Editors */}
        <div className="xl:col-span-4 space-y-5">
          {/* Quick PDF Export Banner */}
          <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 shadow-lg border border-emerald-800/40 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                  Ready to Print
                </span>
                <span className="text-xs text-slate-400 font-mono">300 DPI CR80</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                <FileDown className="w-4 h-4 text-emerald-400" />
                Download Final Processed PDF ID Card
              </h3>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Generates high-resolution front and back ID cards rasterized with your exact customized coordinate configurations.
              </p>

              <button
                onClick={() => setIsExportModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Generate & Download High-Res PDF
              </button>
            </div>
          </div>

          {/* Custom Template & Blank Background Controls Card */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-emerald-600" />
                  My Template & Backgrounds
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Insert your custom card blanks or pick security presets
                </p>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                templateConfig.sourceType === 'custom'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {templateConfig.sourceType === 'custom' ? 'Custom Active' : 'Preset Mode'}
              </span>
            </div>

            {/* Quick Upload Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-emerald-200 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer transition-all text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setTemplateConfig((prev) => ({
                            ...prev,
                            sourceType: 'custom',
                            frontImageUrl: event.target!.result as string,
                            frontFileName: file.name,
                          }));
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <Upload className="w-4 h-4 text-emerald-600 mb-1" />
                <span className="text-xs font-bold text-emerald-950">
                  {templateConfig.frontImageUrl ? 'Replace Front' : 'Upload Front'}
                </span>
                <span className="text-[10px] text-emerald-700 font-mono">
                  {templateConfig.frontFileName || '1012×638 px'}
                </span>
              </label>

              <label className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-cyan-200 hover:border-cyan-500 bg-cyan-50/40 hover:bg-cyan-50 cursor-pointer transition-all text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setTemplateConfig((prev) => ({
                            ...prev,
                            sourceType: 'custom',
                            backImageUrl: event.target!.result as string,
                            backFileName: file.name,
                          }));
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <Upload className="w-4 h-4 text-cyan-600 mb-1" />
                <span className="text-xs font-bold text-cyan-950">
                  {templateConfig.backImageUrl ? 'Replace Back' : 'Upload Back'}
                </span>
                <span className="text-[10px] text-cyan-700 font-mono">
                  {templateConfig.backFileName || '1012×638 px'}
                </span>
              </label>
            </div>

            {/* Quick Preset Selector */}
            <div>
              <label className="text-[11px] font-bold text-gray-700 block mb-1.5">
                Quick Security Presets:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_TEMPLATES.map((p) => {
                  const isSelected = templateConfig.presetId === p.id && templateConfig.sourceType !== 'custom';
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          ...p.config,
                          presetId: p.id,
                          sourceType: p.config.sourceType || 'preset',
                        }))
                      }
                      className={`px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="truncate font-bold text-[11px]">{p.name}</div>
                      <div className="text-[9px] opacity-75 truncate">{p.badge}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Layer Toggles */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setTemplateConfig((prev) => ({
                    ...prev,
                    showBuiltinGuilloche: !prev.showBuiltinGuilloche,
                  }))
                }
                className={`flex-1 text-[11px] py-1.5 px-2 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                  templateConfig.showBuiltinGuilloche
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-gray-100 text-gray-500 border-gray-200'
                }`}
              >
                Guilloche {templateConfig.showBuiltinGuilloche ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() =>
                  setTemplateConfig((prev) => ({
                    ...prev,
                    showFieldLabels: !prev.showFieldLabels,
                  }))
                }
                className={`flex-1 text-[11px] py-1.5 px-2 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                  templateConfig.showFieldLabels
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-gray-100 text-gray-500 border-gray-200'
                }`}
              >
                Labels {templateConfig.showFieldLabels ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Open Full Template Customizer Modal */}
            <button
              onClick={() => setIsTemplateModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Full Template & Layer Manager</span>
            </button>
          </div>

          {/* Form Fields Card with Integrated Position Editors */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  Live Data & Position Editor
                </h3>
                <p className="text-[11px] text-gray-500">
                  Edit data & click the <span className="font-semibold text-emerald-700">☩ Position</span> button on any field to calibrate
                </p>
              </div>
              <button
                type="button"
                onClick={handleCleanAllText}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                title="Strips reference prefixes like 'Full Name:', 'FAN:', 'DOB:', etc."
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Clean All Labels</span>
              </button>
            </div>

            {/* Photo Customization: Dual Photos (Primary Photo & Second Photo on Bottom Right) */}
            <div className="mb-5 space-y-3">
              {/* 1. Primary Photo Container (Photo 1 - Left) */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-20 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 shrink-0">
                    <img
                      src={idData.photoUrl}
                      alt="Primary Portrait Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <span>Photo 1 (Left Portrait)</span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">Primary</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleFieldPositionEditor('photoFront')}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                          expandedPositionField === 'photoFront'
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-emerald-100/90 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        <Sliders className="w-3 h-3" />
                        <span>X:{config.media.photoFront.x} Y:{config.media.photoFront.y}</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Size: {config.media.photoFront.width} × {config.media.photoFront.height} px
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5 text-gray-500" />
                        Replace Photo 1
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setPhotoAdjustTarget('primary');
                          setIsPhotoAdjustModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Remove background, adjust brightness, contrast, lighting and color"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>☀️ Light & Remove BG</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Position Editor for Photo 1 */}
                {expandedPositionField === 'photoFront' && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <FieldPositionEditor
                      fieldId="photoFront"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => setExpandedPositionField(null)}
                    />
                  </div>
                )}
              </div>

              {/* 2. Second Photo Container (Photo 2 - Bottom Right Security Portrait) */}
              <div className="bg-gradient-to-r from-emerald-50/60 to-cyan-50/60 border border-emerald-200/80 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Photo 2 (Bottom Right Security Photo)
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateConfig.showSecondaryPhoto !== false}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showSecondaryPhoto: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                    <span>{templateConfig.showSecondaryPhoto !== false ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                {templateConfig.showSecondaryPhoto !== false && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-16 bg-gray-200 rounded-lg overflow-hidden border border-emerald-300 shrink-0 shadow-xs">
                        <img
                          src={idData.secondaryPhotoUrl || idData.photoUrl}
                          alt="Second Portrait Preview"
                          className={`w-full h-full object-cover ${
                            templateConfig.secondaryPhotoStyle === 'ghost'
                              ? 'grayscale contrast-125 opacity-85'
                              : templateConfig.secondaryPhotoStyle === 'grayscale'
                              ? 'grayscale contrast-120'
                              : ''
                          }`}
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-gray-700">
                            Security Style
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleFieldPositionEditor('photoFrontSecondary')}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                              expandedPositionField === 'photoFrontSecondary'
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-emerald-200/80 text-emerald-900 hover:bg-emerald-300'
                            }`}
                          >
                            <Sliders className="w-3 h-3" />
                            <span>X:{config.media.photoFrontSecondary?.x ?? 825} Y:{config.media.photoFrontSecondary?.y ?? 435}</span>
                          </button>
                        </div>

                        {/* Style Chips */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'ghost', label: 'Ghost Watermark' },
                            { id: 'grayscale', label: 'Grayscale Laser' },
                            { id: 'goldBorder', label: 'Gold Hologram' },
                            { id: 'color', label: 'Full Color' },
                          ].map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() =>
                                setTemplateConfig((prev) => ({
                                  ...prev,
                                  secondaryPhotoStyle: st.id as any,
                                }))
                              }
                              className={`text-[10px] font-bold py-1 px-1.5 rounded-lg border transition-all cursor-pointer truncate ${
                                (templateConfig.secondaryPhotoStyle || 'ghost') === st.id
                                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <label className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-[10px] font-semibold rounded-md shadow-2xs cursor-pointer transition-colors">
                            <Upload className="w-3 h-3 text-gray-500" />
                            Upload 2nd Photo
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSecondaryPhotoUpload}
                              className="hidden"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setPhotoAdjustTarget('secondary');
                              setIsPhotoAdjustModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-md shadow-2xs transition-all cursor-pointer"
                            title="Adjust lighting or remove background for Photo 2"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>☀️ Light / Cutout</span>
                          </button>

                          {idData.secondaryPhotoUrl && (
                            <button
                              type="button"
                              onClick={() => setIdData((prev) => ({ ...prev, secondaryPhotoUrl: undefined }))}
                              className="text-[10px] text-emerald-800 hover:underline font-medium cursor-pointer"
                            >
                              Sync with Photo 1
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inline Position Editor for Photo 2 */}
                    {expandedPositionField === 'photoFrontSecondary' && (
                      <div className="mt-2 pt-2 border-t border-emerald-200/80">
                        <FieldPositionEditor
                          fieldId="photoFrontSecondary"
                          config={config}
                          setConfig={setConfig}
                          onClose={() => setExpandedPositionField(null)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Front FAN & Barcode Cut Section */}
              <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      ✂️ Front Barcode & FAN Cut Controls
                    </span>
                  </div>
                  {/* Quick Cut All / Restore All */}
                  <button
                    type="button"
                    onClick={() => {
                      const allOff = !templateConfig.showFrontBarcode && !templateConfig.showFrontFan;
                      setTemplateConfig((prev) => ({
                        ...prev,
                        showFrontBarcode: allOff,
                        showFrontFan: allOff,
                        showFanContainerBox: allOff,
                      }));
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      !templateConfig.showFrontBarcode && !templateConfig.showFrontFan
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-xs'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {!templateConfig.showFrontBarcode && !templateConfig.showFrontFan ? '↺ Restore All' : '✂️ Cut Barcode & FAN'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Toggle Barcode on Front FAN */}
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
                    <span className="font-semibold text-slate-200 text-[11px]">Front 1D Barcode</span>
                    <input
                      type="checkbox"
                      checked={templateConfig.showFrontBarcode !== false}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFrontBarcode: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Front FAN Number */}
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
                    <span className="font-semibold text-slate-200 text-[11px]">Front FAN Digits</span>
                    <input
                      type="checkbox"
                      checked={templateConfig.showFrontFan !== false}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFrontFan: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle FAN Box Background */}
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer sm:col-span-2">
                    <span className="font-semibold text-slate-200 text-[11px]">FAN White Pill Container</span>
                    <input
                      type="checkbox"
                      checked={templateConfig.showFanContainerBox !== false}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFanContainerBox: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Form Fields List */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {/* 1. Amharic Name */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Full Name in Amharic (ሙሉ ስም)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('fullNameAmharic')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expandedPositionField === 'fullNameAmharic'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.fullNameAmharic.x} Y:{config.fields.fullNameAmharic.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.fullNameAmharic}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, fullNameAmharic: e.target.value }))
                  }
                  onFocus={() => setSelectedFieldId('fullNameAmharic')}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="አየለ ዘክዎስ ዳካ"
                />
                {expandedPositionField === 'fullNameAmharic' && (
                  <FieldPositionEditor
                    fieldId="fullNameAmharic"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>

              {/* 2. English Name */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Full Name in English
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('fullNameEnglish')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expandedPositionField === 'fullNameEnglish'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.fullNameEnglish.x} Y:{config.fields.fullNameEnglish.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.fullNameEnglish}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, fullNameEnglish: e.target.value }))
                  }
                  onFocus={() => setSelectedFieldId('fullNameEnglish')}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="Ayele Zekwos Daka"
                />
                {expandedPositionField === 'fullNameEnglish' && (
                  <FieldPositionEditor
                    fieldId="fullNameEnglish"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>

              {/* 3. FAN Number */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-700">
                      Fayda FAN (16 digits)
                    </label>
                    <div className="flex items-center gap-1 bg-gray-200/80 p-0.5 rounded-lg text-[9px] font-bold">
                      <button
                        type="button"
                        onClick={handleSetFanTop}
                        className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          config.fields.fan.y < 200
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="Position FAN and Barcode at the top header"
                      >
                        Top Header
                      </button>
                      <button
                        type="button"
                        onClick={handleSetFanBottom}
                        className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          config.fields.fan.y >= 200
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="Position FAN and Barcode at the bottom footer"
                      >
                        Bottom Footer
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('fan')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expandedPositionField === 'fan'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.fan.x} Y:{config.fields.fan.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.fan}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, fan: e.target.value }))
                  }
                  onFocus={() => setSelectedFieldId('fan')}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="4195 0436 7069 2582"
                />
                {expandedPositionField === 'fan' && (
                  <FieldPositionEditor
                    fieldId="fan"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>

              {/* 4. Date of Birth & Sex */}
              <div className="space-y-3">
                {/* Date of Birth (GC & Ethiopian) */}
                <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-800">Date of Birth (የትውልድ ቀን)</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded">GC & EC</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('dateOfBirth')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        expandedPositionField === 'dateOfBirth'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.dateOfBirth.x} Y:{config.fields.dateOfBirth.y}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Gregorian (G.C.)</label>
                      <input
                        type="text"
                        value={idData.dateOfBirth}
                        onChange={(e) => {
                          const val = e.target.value;
                          const eth = convertGcToEth(val);
                          setIdData((prev) => ({
                            ...prev,
                            dateOfBirth: val,
                            dateOfBirthEth: eth || prev.dateOfBirthEth,
                          }));
                        }}
                        onFocus={() => setSelectedFieldId('dateOfBirth')}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                        placeholder="14/05/1992"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Ethiopian (E.C. / ዓ.ም)</label>
                      <input
                        type="text"
                        value={idData.dateOfBirthEth || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const gc = convertEthToGc(val);
                          setIdData((prev) => ({
                            ...prev,
                            dateOfBirthEth: val,
                            dateOfBirth: gc || prev.dateOfBirth,
                          }));
                        }}
                        onFocus={() => setSelectedFieldId('dateOfBirth')}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                        placeholder="06/09/1984"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-500 bg-white/80 px-2 py-1 rounded-lg border border-gray-200/60 flex items-center justify-between">
                    <span>Card Format:</span>
                    <span className="font-mono font-bold text-gray-800 truncate">
                      {formatCardDualDate(idData.dateOfBirth, idData.dateOfBirthEth)}
                    </span>
                  </div>

                  {expandedPositionField === 'dateOfBirth' && (
                    <FieldPositionEditor
                      fieldId="dateOfBirth"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => setExpandedPositionField(null)}
                    />
                  )}
                </div>

                {/* Sex */}
                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Sex (ፆታ)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('sex')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        expandedPositionField === 'sex'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.sex.x} Y:{config.fields.sex.y}</span>
                    </button>
                  </div>
                  <select
                    value={idData.sex}
                    onChange={(e) =>
                      setIdData((prev) => ({
                        ...prev,
                        sex: e.target.value as IdCardData['sex'],
                      }))
                    }
                    onFocus={() => setSelectedFieldId('sex')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden font-semibold"
                  >
                    <option value="Male">Male / ወንድ</option>
                    <option value="Female">Female / ሴት</option>
                  </select>

                  {expandedPositionField === 'sex' && (
                    <FieldPositionEditor
                      fieldId="sex"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => setExpandedPositionField(null)}
                    />
                  )}
                </div>
              </div>

              {/* 5. Issue Date (የተሰጠበት ቀን - Both Ethiopian & GC) */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-800">Date of Issue (የተሰጠበት ቀን)</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded">GC & EC</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const dd = String(now.getDate()).padStart(2, '0');
                        const mm = String(now.getMonth() + 1).padStart(2, '0');
                        const yyyy = now.getFullYear();
                        const todayGc = `${dd}/${mm}/${yyyy}`;
                        const todayEth = convertGcToEth(todayGc) || '';
                        setIdData((prev) => ({
                          ...prev,
                          dateOfIssue: todayGc,
                          dateOfIssueEth: todayEth,
                        }));
                      }}
                      className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded hover:bg-amber-200 transition-colors cursor-pointer"
                      title="Set to today's date"
                    >
                      ⚡ Today
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('dateOfIssueFront')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        expandedPositionField === 'dateOfIssueFront'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.dateOfIssueFront?.x ?? 52} Y:{config.fields.dateOfIssueFront?.y ?? 330}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Gregorian (G.C.)</label>
                    <input
                      type="text"
                      value={idData.dateOfIssue}
                      onChange={(e) => {
                        const val = e.target.value;
                        const eth = convertGcToEth(val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfIssue: val,
                          dateOfIssueEth: eth || prev.dateOfIssueEth,
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfIssueFront')}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder="24/07/2024"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Ethiopian (E.C. / ዓ.ም)</label>
                    <input
                      type="text"
                      value={idData.dateOfIssueEth || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const gc = convertEthToGc(val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfIssueEth: val,
                          dateOfIssue: gc || prev.dateOfIssue,
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfIssueFront')}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder="17/11/2016"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-gray-500 bg-white/80 px-2 py-1 rounded-lg border border-gray-200/60 flex items-center justify-between">
                  <span>Card Display:</span>
                  <span className="font-mono font-bold text-gray-800 truncate">
                    {formatCardDualDate(idData.dateOfIssue, idData.dateOfIssueEth)}
                  </span>
                </div>

                {expandedPositionField === 'dateOfIssueFront' && (
                  <FieldPositionEditor
                    fieldId="dateOfIssueFront"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>

              {/* 6. Expiry Date (የሚያበቃበት ቀን) */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-800">Date of Expiry (የሚያበቃበት ቀን)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const parts = (idData.dateOfIssue || '24/07/2024').split(/[/.-]/);
                        if (parts.length === 3) {
                          const d = parseInt(parts[0], 10);
                          const m = parseInt(parts[1], 10);
                          const y = parseInt(parts[2], 10);
                          if (!isNaN(y)) {
                            const expD = String(Math.max(1, d - 1)).padStart(2, '0');
                            const expM = String(m).padStart(2, '0');
                            const expY = y + 10;
                            const expGc = `${expD}/${expM}/${expY}`;
                            const expEth = convertGcToEth(expGc) || '';
                            setIdData((prev) => ({
                              ...prev,
                              dateOfExpiry: expGc,
                              dateOfExpiryEth: expEth,
                            }));
                          }
                        }
                      }}
                      className="text-[9px] font-bold px-2 py-0.5 bg-cyan-100 text-cyan-900 rounded hover:bg-cyan-200 transition-colors cursor-pointer"
                      title="Set 10 years validity from Issue Date"
                    >
                      +10 Years
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('dateOfExpiry')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        expandedPositionField === 'dateOfExpiry'
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.dateOfExpiry.x} Y:{config.fields.dateOfExpiry.y}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Gregorian (G.C.)</label>
                    <input
                      type="text"
                      value={idData.dateOfExpiry}
                      onChange={(e) => {
                        const val = e.target.value;
                        const eth = convertGcToEth(val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfExpiry: val,
                          dateOfExpiryEth: eth || prev.dateOfExpiryEth,
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfExpiry')}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder="23/07/2034"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Ethiopian (E.C. / ዓ.ም)</label>
                    <input
                      type="text"
                      value={idData.dateOfExpiryEth || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const gc = convertEthToGc(val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfExpiryEth: val,
                          dateOfExpiry: gc || prev.dateOfExpiry,
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfExpiry')}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder="16/11/2026"
                    />
                  </div>
                </div>

                {expandedPositionField === 'dateOfExpiry' && (
                  <FieldPositionEditor
                    fieldId="dateOfExpiry"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>

              {/* 6. Phone Number (Back Side) */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Phone Number (ስልክ ቁጥር)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('phoneNumber')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expandedPositionField === 'phoneNumber'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.phoneNumber.x} Y:{config.fields.phoneNumber.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.phoneNumber}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, phoneNumber: e.target.value }))
                  }
                  onFocus={() => setSelectedFieldId('phoneNumber')}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="0928574836"
                />
                {expandedPositionField === 'phoneNumber' && (
                  <FieldPositionEditor
                    fieldId="phoneNumber"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>

              {/* 7. Region & Zone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Region (ክልል)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('regionAmharic')}
                      className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200"
                    >
                      ☩ Position
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idData.regionAmharic}
                    onChange={(e) =>
                      setIdData((prev) => ({ ...prev, regionAmharic: e.target.value }))
                    }
                    onFocus={() => setSelectedFieldId('regionAmharic')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden"
                    placeholder="ሲዳማ"
                  />
                </div>

                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Zone / Subcity (ዞን)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('zoneSubcity')}
                      className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200"
                    >
                      ☩ Position
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idData.zoneAmharic}
                    onChange={(e) =>
                      setIdData((prev) => ({ ...prev, zoneAmharic: e.target.value }))
                    }
                    onFocus={() => setSelectedFieldId('zoneSubcity')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden"
                    placeholder="አርበጎና"
                  />
                </div>
              </div>

              {/* Expanded Region/Zone Editor */}
              {expandedPositionField === 'regionAmharic' && (
                <FieldPositionEditor
                  fieldId="regionAmharic"
                  config={config}
                  setConfig={setConfig}
                  onClose={() => setExpandedPositionField(null)}
                />
              )}
              {expandedPositionField === 'zoneSubcity' && (
                <FieldPositionEditor
                  fieldId="zoneSubcity"
                  config={config}
                  setConfig={setConfig}
                  onClose={() => setExpandedPositionField(null)}
                />
              )}

              {/* 8. QR Code Media Position */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Digital QR Matrix (Back Side)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('qrCodeBack')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      expandedPositionField === 'qrCodeBack'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.media.qrCodeBack.x} Y:{config.media.qrCodeBack.y}</span>
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Size: {config.media.qrCodeBack.width} × {config.media.qrCodeBack.height} px
                </p>
                {expandedPositionField === 'qrCodeBack' && (
                  <FieldPositionEditor
                    fieldId="qrCodeBack"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => setExpandedPositionField(null)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Quick Shortcuts to PDF Slip Auto-Extractor & Calibrator */}
          <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white rounded-3xl p-5 shadow-lg border border-slate-800">
            <div className="relative z-10">
              <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Automated Fayda PDF Slip Extractor
              </h4>
              <p className="text-xs text-slate-300 mb-3.5 leading-relaxed">
                Have an official National ID / Fayda verification PDF or scan? Use the automated document extractor to load all applicant fields, portrait photo, and QR matrix in one step.
              </p>
              <div className="flex items-center gap-2">
                {onOpenExtractor && (
                  <button
                    type="button"
                    onClick={onOpenExtractor}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Open PDF Extractor
                  </button>
                )}
                {onOpenCalibrator && (
                  <button
                    type="button"
                    onClick={onOpenCalibrator}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
                  >
                    Open Coordinate Calibrator
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Template Upload & Management Modal */}
      <CustomTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templateConfig={templateConfig}
        setTemplateConfig={setTemplateConfig}
      />

      {/* Photo Studio: Lighting & Background Removal Modal */}
      <PhotoAdjustModal
        isOpen={isPhotoAdjustModalOpen}
        onClose={() => setIsPhotoAdjustModalOpen(false)}
        originalPhotoUrl={
          photoAdjustTarget === 'secondary'
            ? idData.secondaryPhotoUrl || idData.photoUrl
            : idData.photoUrl
        }
        applicantName={idData.fullNameEnglish}
        onApplyPhoto={(processedUrl, target) => {
          if (target === 'both') {
            setIdData((prev) => ({
              ...prev,
              photoUrl: processedUrl,
              secondaryPhotoUrl: processedUrl,
            }));
          } else if (target === 'secondary' || photoAdjustTarget === 'secondary') {
            setIdData((prev) => ({
              ...prev,
              secondaryPhotoUrl: processedUrl,
            }));
          } else {
            setIdData((prev) => ({
              ...prev,
              photoUrl: processedUrl,
            }));
          }
        }}
      />

      {/* Permanent App Settings Modal */}
      <AppSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={appSettings}
        onSaveSettings={(newSettings) => {
          setAppSettings(newSettings);
        }}
      />

      {/* High-Resolution PDF & JPEG Export Modal */}
      <ExportPdfModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        idData={idData}
        config={config}
        templateConfig={templateConfig}
        appSettings={appSettings}
        onUpdateAppSettings={(newSettings) => {
          setAppSettings(newSettings);
        }}
      />
    </div>
  );
};
