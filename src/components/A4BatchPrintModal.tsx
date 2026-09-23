import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sliders,
  CheckCircle2,
  Eye,
  FileText,
  Scissors,
  Layers,
  Sparkles,
  Info,
  Loader2,
  Ruler,
  Image as ImageIcon,
  AlertCircle,
  Plus,
  Minus,
  RotateCcw,
} from 'lucide-react';
import {
  A4BatchPrintConfig,
  A4BatchPrintLayout,
  A4CardSizePreset,
  A4_CARD_SIZE_PRESETS,
  BatchQueueItem,
  CoordinatesConfig,
  TemplateConfig,
  NumberedTemplate
} from '../types';
import { exportBatchToA4Pdf, exportBatchToA4Png, renderBatchA4SheetCanvas } from '../utils/batchExporter';

interface A4BatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BatchQueueItem[];
  config: CoordinatesConfig;
  templateConfig: TemplateConfig;
  numberedTemplates?: NumberedTemplate[];
  activeTemplateNumber?: number;
  initialPhotoColorMode?: 'color' | 'grayscale';
  onApplyStudioPositionsToAllTemplates?: () => void;
  onOpenPositionEditor?: () => void;
  onMarkPrinted?: (itemIds: string[]) => void;
}

export const A4BatchPrintModal: React.FC<A4BatchPrintModalProps> = ({
  isOpen,
  onClose,
  items,
  config,
  templateConfig,
  numberedTemplates,
  activeTemplateNumber,
  initialPhotoColorMode = 'color',
  onApplyStudioPositionsToAllTemplates,
  onOpenPositionEditor,
  onMarkPrinted,
}) => {
  const activeItems = items.filter((it) => it.selected !== false && (it.status === 'ready' || it.status === 'printed'));

  // Print Configuration State
  const [layout, setLayout] = useState<A4BatchPrintLayout>('5_per_page_paired');
  const [showCropMarks, setShowCropMarks] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [mirrorPrint, setMirrorPrint] = useState(true);
  const [cardGapY, setCardGapY] = useState<number>(1.8); // mm between rows (balanced for enlarged cards)
  const [cardGapX, setCardGapX] = useState<number>(5.5); // mm between columns
  const [topMargin, setTopMargin] = useState<number>(8.0); // mm top margin (centered on A4 page)
  const [photoColorMode, setPhotoColorMode] = useState<'color' | 'grayscale'>(initialPhotoColorMode);
  const [useStudioPositionsAlways, setUseStudioPositionsAlways] = useState(true);
  const [syncToast, setSyncToast] = useState(false);

  // Dynamic layout chunking
  const chunkSize = layout === '1_per_page_detailed' ? 1 : 5;
  const totalSheets =
    layout === '5_per_page_duplex'
      ? Math.max(1, Math.ceil(activeItems.length / 5) * 2)
      : Math.max(1, Math.ceil(activeItems.length / chunkSize));

  // Card printed dimensions (mm) - calibrated with slight oversize compensation to prevent undersized card prints
  const [cardWidthMm, setCardWidthMm] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('fayda_a4_card_width') || '') : NaN;
    return !isNaN(saved) && saved >= 75 && saved <= 96 ? saved : 86.80;
  });
  const [cardHeightMm, setCardHeightMm] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('fayda_a4_card_height') || '') : NaN;
    return !isNaN(saved) && saved >= 45 && saved <= 65 ? saved : 54.75;
  });
  const [sizePreset, setSizePreset] = useState<A4CardSizePreset>(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('fayda_a4_card_size_preset') as A4CardSizePreset) : null;
    return saved && A4_CARD_SIZE_PRESETS[saved] ? saved : 'oversized';
  });

  const applySizePreset = (preset: A4CardSizePreset) => {
    setSizePreset(preset);
    const info = A4_CARD_SIZE_PRESETS[preset];
    if (info && preset !== 'custom') {
      setCardWidthMm(info.widthMm);
      setCardHeightMm(info.heightMm);
      try {
        localStorage.setItem('fayda_a4_card_width', info.widthMm.toString());
        localStorage.setItem('fayda_a4_card_height', info.heightMm.toString());
        localStorage.setItem('fayda_a4_card_size_preset', preset);
      } catch (e) {}
    }
  };

  const adjustWidthBy = (deltaMm: number) => {
    setSizePreset('custom');
    const newW = Number(Math.max(78, Math.min(96, cardWidthMm + deltaMm)).toFixed(2));
    const newH = Number(((newW / 1012) * 638).toFixed(2));
    setCardWidthMm(newW);
    setCardHeightMm(newH);
    try {
      localStorage.setItem('fayda_a4_card_width', newW.toString());
      localStorage.setItem('fayda_a4_card_height', newH.toString());
      localStorage.setItem('fayda_a4_card_size_preset', 'custom');
    } catch (e) {}
  };

  const handleManualWidth = (val: number) => {
    setCardWidthMm(val);
    const newH = Number(((val / 1012) * 638).toFixed(2));
    setCardHeightMm(newH);
    setSizePreset('custom');
    try {
      localStorage.setItem('fayda_a4_card_width', val.toString());
      localStorage.setItem('fayda_a4_card_height', newH.toString());
      localStorage.setItem('fayda_a4_card_size_preset', 'custom');
    } catch (e) {}
  };

  const handleManualHeight = (val: number) => {
    setCardHeightMm(val);
    setSizePreset('custom');
    try {
      localStorage.setItem('fayda_a4_card_height', val.toString());
      localStorage.setItem('fayda_a4_card_size_preset', 'custom');
    } catch (e) {}
  };

  // Synchronize initialPhotoColorMode when modal opens or prop changes
  useEffect(() => {
    if (initialPhotoColorMode) {
      setPhotoColorMode(initialPhotoColorMode);
    }
  }, [initialPhotoColorMode, isOpen]);

  // View state
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '75' | '100'>('fit');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const [allPrintSheets, setAllPrintSheets] = useState<string[]>([]);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; status: string } | null>(null);

  // Clamp currentSheetIndex if layout changes totalSheets
  useEffect(() => {
    if (currentSheetIndex >= totalSheets) {
      setCurrentSheetIndex(Math.max(0, totalSheets - 1));
    }
  }, [totalSheets, currentSheetIndex]);

  const printConfig: A4BatchPrintConfig = {
    layout,
    showCropMarks,
    showCutLines,
    showLabels,
    cardGapY,
    cardGapX,
    topMargin,
    mirrorPrint,
    photoColorMode,
    numberedTemplates,
    activeTemplateNumber,
    useStudioPositionsAlways,
    cardWidthMm,
    cardHeightMm,
  };

  // Render current sheet preview whenever relevant settings change
  useEffect(() => {
    if (!isOpen || activeItems.length === 0) return;

    let isMounted = true;
    const renderPreview = async () => {
      setIsRenderingPreview(true);
      try {
        let currentChunk: BatchQueueItem[] = [];
        let duplexSide: 'front' | 'back' | undefined;

        if (layout === '1_per_page_detailed') {
          currentChunk = activeItems.slice(currentSheetIndex, currentSheetIndex + 1);
        } else if (layout === '5_per_page_duplex') {
          const chunkIdx = Math.floor(currentSheetIndex / 2);
          duplexSide = currentSheetIndex % 2 === 0 ? 'front' : 'back';
          currentChunk = activeItems.slice(chunkIdx * 5, (chunkIdx + 1) * 5);
        } else {
          currentChunk = activeItems.slice(currentSheetIndex * 5, (currentSheetIndex + 1) * 5);
        }
        
        // Render 150 DPI preview canvas for fast, crisp on-screen inspection
        const canvas = await renderBatchA4SheetCanvas(
          currentChunk,
          config,
          templateConfig,
          { ...printConfig, duplexSide },
          currentSheetIndex,
          totalSheets,
          150
        );

        if (isMounted) {
          setPreviewDataUrl(canvas.toDataURL('image/png'));
        }
      } catch (err) {
        console.error('Failed to render A4 batch preview:', err);
      } finally {
        if (isMounted) {
          setIsRenderingPreview(false);
        }
      }
    };

    renderPreview();
    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    currentSheetIndex,
    layout,
    showCropMarks,
    showCutLines,
    showLabels,
    cardGapY,
    cardGapX,
    topMargin,
    mirrorPrint,
    photoColorMode,
    useStudioPositionsAlways,
    cardWidthMm,
    cardHeightMm,
    activeItems.length,
  ]);

  // Pre-render all sheets at high-res (300 DPI) for browser printing
  const preparePrintSheets = async (): Promise<string[]> => {
    setIsPreparingPrint(true);
    const sheetUrls: string[] = [];
    try {
      for (let s = 0; s < totalSheets; s++) {
        let currentChunk: BatchQueueItem[] = [];
        let duplexSide: 'front' | 'back' | undefined;

        if (layout === '1_per_page_detailed') {
          currentChunk = activeItems.slice(s, s + 1);
        } else if (layout === '5_per_page_duplex') {
          const chunkIdx = Math.floor(s / 2);
          duplexSide = s % 2 === 0 ? 'front' : 'back';
          currentChunk = activeItems.slice(chunkIdx * 5, (chunkIdx + 1) * 5);
        } else {
          currentChunk = activeItems.slice(s * 5, (s + 1) * 5);
        }

        const canvas = await renderBatchA4SheetCanvas(
          currentChunk,
          config,
          templateConfig,
          { ...printConfig, duplexSide },
          s,
          totalSheets,
          300
        );
        sheetUrls.push(canvas.toDataURL('image/png', 1.0));
      }
      setAllPrintSheets(sheetUrls);
      return sheetUrls;
    } catch (e) {
      console.error('Failed to prepare print sheets:', e);
      return [];
    } finally {
      setIsPreparingPrint(false);
    }
  };

  // Trigger Browser Print Dialog
  const handlePrintNow = async () => {
    if (activeItems.length === 0) return;
    try {
      const sheets = await preparePrintSheets();
      if (sheets.length === 0) return;

      onMarkPrinted?.(activeItems.map((it) => it.id));

      // Small delay to ensure the DOM has painted the printable images
      setTimeout(() => {
        window.print();
      }, 350);
    } catch (e) {
      console.error('Print failed:', e);
    }
  };

  // Trigger A4 PDF Export via jsPDF (Full Page 300 DPI PNG, solid white background)
  const handleExportPdf = async () => {
    if (activeItems.length === 0) return;
    try {
      setIsExportingPdf(true);
      await exportBatchToA4Pdf(
        activeItems,
        config,
        templateConfig,
        printConfig,
        (current, total, status) => {
          setExportProgress({ current, total, status });
        }
      );
      onMarkPrinted?.(activeItems.map((it) => it.id));
    } catch (e) {
      console.error('PDF Export failed:', e);
      alert('Failed to generate A4 PDF. Check console.');
    } finally {
      setIsExportingPdf(false);
      setExportProgress(null);
    }
  };

  // Trigger A4 PNG Export (Full Page 300 DPI, solid white background)
  const handleExportPng = async (singleSheet = false) => {
    if (activeItems.length === 0) return;
    try {
      setIsExportingPng(true);
      await exportBatchToA4Png(
        activeItems,
        config,
        templateConfig,
        printConfig,
        (current, total, status) => {
          setExportProgress({ current, total, status });
        },
        singleSheet ? currentSheetIndex : undefined
      );
      onMarkPrinted?.(activeItems.map((it) => it.id));
    } catch (e) {
      console.error('PNG Export failed:', e);
      alert('Failed to export A4 PNG. Check console.');
    } finally {
      setIsExportingPng(false);
      setExportProgress(null);
    }
  };

  if (!isOpen) return null;

  const currentChunkStart = currentSheetIndex * chunkSize + 1;
  const currentChunkEnd = Math.min((currentSheetIndex + 1) * chunkSize, activeItems.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md overflow-hidden">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  A4 Batch Print & PDF Studio (5 IDs per Sheet)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                  በ 1 ገፅ 5 መታወቂያ
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Calibrated Card Size: {cardWidthMm.toFixed(1)} × {cardHeightMm.toFixed(1)} mm (Anti-Undersize) • 5 Rows × 2 Columns Paired • 300 DPI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left / Center: Interactive A4 Sheet Canvas Preview */}
          <div className="flex-1 bg-slate-950/70 p-4 sm:p-6 flex flex-col items-center justify-between overflow-y-auto min-h-[380px]">
            {/* Sheet Pagination & Zoom Toolbar */}
            <div className="w-full max-w-md flex items-center justify-between mb-3 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 shadow-sm">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentSheetIndex === 0}
                  onClick={() => setCurrentSheetIndex((prev) => Math.max(0, prev - 1))}
                  className="p-1 rounded-md hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Previous Sheet"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-white px-2">
                  Sheet {currentSheetIndex + 1} of {totalSheets}
                </span>
                <button
                  type="button"
                  disabled={currentSheetIndex >= totalSheets - 1}
                  onClick={() => setCurrentSheetIndex((prev) => Math.min(totalSheets - 1, prev + 1))}
                  className="p-1 rounded-md hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Next Sheet"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-slate-500 text-[11px] ml-1">
                  (Cards {currentChunkStart}–{currentChunkEnd} of {activeItems.length})
                </span>
              </div>

              {/* Zoom Buttons */}
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setZoomLevel('fit')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    zoomLevel === 'fit' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel('75')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    zoomLevel === '75' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel('100')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                    zoomLevel === '100' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  100%
                </button>
              </div>
            </div>

            {/* A4 Sheet Presentation Wrapper */}
            <div className="relative flex-1 flex items-center justify-center w-full max-h-[68vh] overflow-auto p-2">
              {isRenderingPreview && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-xs rounded-xl text-emerald-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <span className="text-xs font-semibold text-slate-200">Rendering 5-Card A4 Sheet...</span>
                </div>
              )}

              {previewDataUrl ? (
                <div
                  className="bg-white rounded-md shadow-2xl border border-slate-400/40 transition-all duration-200 overflow-hidden"
                  style={{
                    width: zoomLevel === 'fit' ? 'auto' : zoomLevel === '75' ? '680px' : '900px',
                    maxHeight: zoomLevel === 'fit' ? '62vh' : 'none',
                    aspectRatio: '210 / 297',
                  }}
                >
                  <img
                    src={previewDataUrl}
                    alt={`A4 Print Sheet ${currentSheetIndex + 1}`}
                    className="w-full h-full object-contain pointer-events-none select-none"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 py-12">
                  <FileText className="w-12 h-12 mb-2 stroke-[1.2]" />
                  <p className="text-xs">Generating layout preview...</p>
                </div>
              )}
            </div>

            {/* Quick Calibration & Anti-Shrink Size Bar */}
            <div className="w-full max-w-xl mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 shadow-sm">
              <div className="flex items-center gap-2">
                <Ruler className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-semibold text-white">
                  Card Size: <span className="font-mono text-amber-300 font-bold">{cardWidthMm.toFixed(1)} × {cardHeightMm.toFixed(1)} mm</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {((cardWidthMm / 85.6) * 100).toFixed(0)}% CR80
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10.5px] text-amber-300/90 font-medium">Too small?</span>
                <button
                  type="button"
                  onClick={() => adjustWidthBy(1.0)}
                  className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                  title="Add +1.0mm size to cards on A4 sheet"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Add Small Size (+1mm)</span>
                </button>
                <button
                  type="button"
                  onClick={() => adjustWidthBy(2.0)}
                  className="px-2 py-0.5 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-500/40 text-[10px] font-bold transition-all cursor-pointer"
                  title="Add +2.0mm size to cards"
                >
                  +2mm
                </button>
                <button
                  type="button"
                  onClick={() => adjustWidthBy(-1.0)}
                  className="px-1.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-[10px] transition-all cursor-pointer"
                  title="Reduce -1.0mm"
                >
                  -1mm
                </button>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Configuration & Layout Adjustments */}
          <div className="w-full lg:w-96 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto space-y-5">
            <div className="space-y-5">
              {/* Layout Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span>A4 Print Layout Scheme</span>
                </label>
                <div className="space-y-2">
                  {/* Option 1: 5 IDs Paired (Default) */}
                  <div
                    onClick={() => setLayout('5_per_page_paired')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      layout === '5_per_page_paired'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>5 IDs / Sheet (Front & Back Paired)</span>
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      5 Rows × 2 Columns. Card 1 Front + Back side-by-side. 10 faces per sheet.
                    </p>
                  </div>

                  {/* Option 2: 5 IDs Duplex 2-Sided */}
                  <div
                    onClick={() => setLayout('5_per_page_duplex')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      layout === '5_per_page_duplex'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      <span>5 IDs / Sheet (2-Sided Duplex Flip)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Sheet 1: 5 Fronts, Sheet 2: 5 Backs aligned for long-edge duplex flipping.
                    </p>
                  </div>

                  {/* Option 3: 5 Fronts Only */}
                  <div
                    onClick={() => setLayout('5_per_page_front')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      layout === '5_per_page_front'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold text-xs">5 Fronts per Sheet (Fronts Only)</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Batch print only the front faces in a clean vertical column.
                    </p>
                  </div>

                  {/* Option 4: 1 ID Detailed Sheet */}
                  <div
                    onClick={() => setLayout('1_per_page_detailed')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      layout === '1_per_page_detailed'
                        ? 'bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold text-xs">1 ID per Sheet (Detailed Specs Banner)</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Individual full-page certificate with applicant info & PVC guidelines.
                    </p>
                  </div>
                </div>
              </div>

              {/* Toggles & Print Marks */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cut Guides & Trim Marks</span>
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 cursor-pointer hover:bg-slate-800">
                  <div className="text-xs">
                    <span className="font-semibold text-white block">Corner Crop Marks</span>
                    <span className="text-[10px] text-slate-400">Crosshair trim guides at card corners</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(showCropMarks)}
                    onChange={(e) => setShowCropMarks(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 cursor-pointer hover:bg-slate-800">
                  <div className="text-xs">
                    <span className="font-semibold text-white block">Dashed Cut Lines</span>
                    <span className="text-[10px] text-slate-400">Dividing guides between cards & columns</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(showCutLines)}
                    onChange={(e) => setShowCutLines(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 cursor-pointer hover:bg-slate-800">
                  <div className="text-xs">
                    <span className="font-semibold text-white block">Applicant Name & FAN Labels</span>
                    <span className="text-[10px] text-slate-400">Tiny metadata in margin to avoid mix-ups</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(showLabels)}
                    onChange={(e) => setShowLabels(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-blue-950/30 border border-blue-800/50 cursor-pointer hover:bg-blue-900/40">
                  <div className="text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <span>Mirror Print (Inkjet PVC / Transfer Sheet)</span>
                      <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold">PVC</span>
                    </span>
                    <span className="text-[10px] text-blue-200/70">Horizontally flips card output for transparent film transfer printing</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(mirrorPrint)}
                    onChange={(e) => setMirrorPrint(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Photo Color Mode Option */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Batch Photos Color Mode</span>
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    photoColorMode === 'grayscale' ? 'bg-slate-700 text-slate-200' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                  }`}>
                    {photoColorMode === 'grayscale' ? 'B&W (Grayscale)' : 'Full Color'}
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoColorMode('color')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      photoColorMode === 'color'
                        ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs ring-1 ring-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-cyan-400"></span>
                    <span>Full Color</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPhotoColorMode('grayscale')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      photoColorMode === 'grayscale'
                        ? 'bg-slate-800 border-emerald-500 text-white shadow-xs ring-1 ring-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-500"></span>
                    <span>B&W (Grayscale)</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  {photoColorMode === 'grayscale' 
                    ? 'All portraits in this print run will be converted to crisp high-contrast black & white.'
                    : 'Prints all portraits in original vivid colors (or individual card overrides).'}
                </p>
              </div>

              {/* Studio Coordinates & Positions Synchronization */}
              <div className="pt-2 border-t border-slate-800 space-y-2.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Studio Field Positions</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                    Auto-Applied
                  </span>
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/50 cursor-pointer hover:bg-emerald-900/40">
                  <div className="text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <span>Apply Studio Positions to All Templates & Batch</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">Auto</span>
                    </span>
                    <span className="text-[10px] text-emerald-200/70">Applies ID Card Studio field coordinates across all templates and batch cards</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(useStudioPositionsAlways)}
                    onChange={(e) => setUseStudioPositionsAlways(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 ml-2"
                  />
                </label>

                {onApplyStudioPositionsToAllTemplates && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyStudioPositionsToAllTemplates();
                      setSyncToast(true);
                      setTimeout(() => setSyncToast(false), 3000);
                    }}
                    className="w-full py-2 px-3 rounded-xl border border-emerald-600/50 bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{syncToast ? '✓ Positions Applied to All Templates!' : 'Sync Studio Positions to All Templates'}</span>
                  </button>
                )}

                {onOpenPositionEditor && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPositionEditor();
                    }}
                    className="w-full py-2 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                    title="Fine-tune and calibrate card field positions for the batch"
                  >
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Open Batch Position Editor</span>
                  </button>
                )}
              </div>

              {/* Printed ID Dimensions & Anti-Undersize Calibration */}
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5 text-amber-400" />
                    <span>Card Print Size (የመታወቂያ መጠን)</span>
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono">
                    {cardWidthMm.toFixed(1)} × {cardHeightMm.toFixed(1)} mm
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Compensates for printer scaling and punch cutting so printed IDs fit standard PVC pouches perfectly.
                </p>

                {/* 7 Quick Presets */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {(['small', 'standard', 'oversized', 'plus', 'large', 'max', 'xlarge'] as const).map((key) => {
                    const info = A4_CARD_SIZE_PRESETS[key];
                    const isSelected = sizePreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applySizePreset(key)}
                        className={`py-2 px-1.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950/60 border-amber-500 text-amber-200 shadow-xs ring-1 ring-amber-500/50'
                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                        title={info.description}
                      >
                        <div className="leading-tight truncate">{info.label}</div>
                        <div className="text-[9px] opacity-75 font-normal font-mono">{info.tag}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Helper Banner for "It's so small / Printer Shrink" */}
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <span className="font-bold text-amber-200 block">Are printed IDs coming out too small? (መታወቂያው አነሰ?)</span>
                      <span className="text-slate-300">
                        Desktop printers often reduce A4 pages by 3–6% when "Fit to printable area" is enabled. Click below to add size and make cards fit standard PVC pouches:
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(1.0)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                      title="Add +1.0mm width & proportional height to fix small print size"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Small Size (+1.0 mm)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(2.0)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-900/80 hover:bg-amber-800 text-amber-200 border border-amber-500/50 font-bold text-[10.5px] shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                      title="Add +2.0mm width & proportional height for medium printer shrinkage"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Add (+2.0 mm)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applySizePreset('large')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-[10.5px] cursor-pointer transition-colors"
                      title="Set to Large preset (88.6mm)"
                    >
                      Large (88.6mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => applySizePreset('xlarge')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-[10.5px] cursor-pointer transition-colors"
                      title="Set to XL preset (90.6mm)"
                    >
                      XL (90.6mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => applySizePreset('standard')}
                      className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 text-[10px] cursor-pointer transition-colors flex items-center gap-1"
                      title="Reset to 100% exact CR80 size (85.6mm)"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>CR80 (85.6mm)</span>
                    </button>
                  </div>
                </div>

                {/* Quick Nudge adjustments */}
                <div className="flex items-center justify-between gap-1.5 pt-0.5">
                  <span className="text-[11px] text-slate-400 font-medium">Quick Step Nudge:</span>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(-1.0)}
                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-slate-300 transition-colors cursor-pointer"
                      title="Shrink width and height proportionally by 1.0 mm"
                    >
                      -1.0mm
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(-0.5)}
                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-slate-300 transition-colors cursor-pointer"
                      title="Shrink width and height proportionally by 0.5 mm"
                    >
                      -0.5mm
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(0.5)}
                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 transition-colors cursor-pointer"
                      title="Enlarge width and height proportionally by 0.5 mm"
                    >
                      +0.5mm
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(1.0)}
                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 transition-colors cursor-pointer"
                      title="Enlarge width and height proportionally by 1.0 mm"
                    >
                      +1.0mm
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(1.5)}
                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 transition-colors cursor-pointer"
                      title="Enlarge width and height proportionally by 1.5 mm"
                    >
                      +1.5mm
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustWidthBy(2.0)}
                      className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 transition-colors cursor-pointer"
                      title="Enlarge width and height proportionally by 2.0 mm"
                    >
                      +2.0mm
                    </button>
                  </div>
                </div>

                {/* Precise Millimeter Inputs */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Card Width (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="75"
                      max="96"
                      value={cardWidthMm}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 86.8;
                        handleManualWidth(val);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Card Height (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="45"
                      max="65"
                      value={cardHeightMm}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 54.75;
                        handleManualHeight(val);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Spacing Adjustments */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Card Spacing & Margins</span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Row Gap (mm)</label>
                    <select
                      value={cardGapY}
                      onChange={(e) => setCardGapY(parseFloat(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="1.0">1.0 mm (Tight)</option>
                      <option value="1.5">1.5 mm</option>
                      <option value="1.8">1.8 mm (Optimal)</option>
                      <option value="2.0">2.0 mm (Standard)</option>
                      <option value="2.5">2.5 mm</option>
                      <option value="3.0">3.0 mm</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Col Gap (mm)</label>
                    <select
                      value={cardGapX}
                      onChange={(e) => setCardGapX(parseFloat(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="4.0">4.0 mm</option>
                      <option value="5.5">5.5 mm (Optimal)</option>
                      <option value="6.0">6.0 mm (Standard)</option>
                      <option value="8.0">8.0 mm</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Top Margin</label>
                    <select
                      value={topMargin}
                      onChange={(e) => setTopMargin(parseFloat(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="6.0">6.0 mm</option>
                      <option value="8.0">8.0 mm (Balanced)</option>
                      <option value="9.5">9.5 mm (Standard)</option>
                      <option value="12.0">12.0 mm</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Print & Download Action Buttons */}
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              {exportProgress && (
                <div className="bg-slate-800 p-2.5 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between text-slate-300 font-semibold text-[11px]">
                    <span>{exportProgress.status}</span>
                    <span>{exportProgress.current} / {exportProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-150"
                      style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handlePrintNow}
                disabled={isPreparingPrint || isExportingPdf || isExportingPng}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isPreparingPrint ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing Sheets for Printer...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Print 5 IDs per Sheet (Ctrl+P) / አትም</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf || isPreparingPrint || isExportingPng}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                title="Consolidated multi-page A4 PDF rendered with full-page 300 DPI lossless PNG and solid opaque white background"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Generating A4 PDF (Full Page PNG)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Download A4 PDF (Full-Page PNG • White Background)</span>
                  </>
                )}
              </button>

              {/* Direct A4 PNG Export (Full Page 300 DPI, Solid White Background) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleExportPng(true)}
                  disabled={isExportingPng || isExportingPdf || isPreparingPrint}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 hover:text-white rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Download current A4 sheet as 300 DPI PNG image with solid white background"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>Sheet {currentSheetIndex + 1} PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportPng(false)}
                  disabled={isExportingPng || isExportingPdf || isPreparingPrint}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 hover:text-white rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Download all A4 sheets as 300 DPI PNG images (solid white background)"
                >
                  {isExportingPng ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      <span>All Sheets PNG {totalSheets > 1 ? `(${totalSheets})` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden container dedicated to browser window.print() */}
      <div id="printable-a4-batch-sheet" className="hidden">
        {allPrintSheets.map((sheetSrc, idx) => (
          <div key={idx} className="print-page-sheet">
            <img
              src={sheetSrc}
              alt={`A4 Print Page ${idx + 1}`}
              style={{
                width: '210mm',
                height: '297mm',
                display: 'block',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
