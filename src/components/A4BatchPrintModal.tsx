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
  Loader2
} from 'lucide-react';
import {
  A4BatchPrintConfig,
  A4BatchPrintLayout,
  BatchQueueItem,
  CoordinatesConfig,
  TemplateConfig
} from '../types';
import { exportBatchToA4Pdf, renderBatchA4SheetCanvas } from '../utils/batchExporter';

interface A4BatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BatchQueueItem[];
  config: CoordinatesConfig;
  templateConfig: TemplateConfig;
}

export const A4BatchPrintModal: React.FC<A4BatchPrintModalProps> = ({
  isOpen,
  onClose,
  items,
  config,
  templateConfig,
}) => {
  const activeItems = items.filter((it) => it.selected !== false && it.status === 'ready');
  const chunkSize = 5;
  const totalSheets = Math.ceil(activeItems.length / chunkSize) || 1;

  // Print Configuration State
  const [layout, setLayout] = useState<A4BatchPrintLayout>('5_per_page_paired');
  const [showCropMarks, setShowCropMarks] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [cardGapY, setCardGapY] = useState<number>(2.0); // mm between rows
  const [cardGapX, setCardGapX] = useState<number>(6.0); // mm between columns
  const [topMargin, setTopMargin] = useState<number>(9.5); // mm top margin

  // View state
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<'fit' | '75' | '100'>('fit');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const [allPrintSheets, setAllPrintSheets] = useState<string[]>([]);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; status: string } | null>(null);

  const printConfig: A4BatchPrintConfig = {
    layout,
    showCropMarks,
    showCutLines,
    showLabels,
    cardGapY,
    cardGapX,
    topMargin,
  };

  // Render current sheet preview whenever relevant settings change
  useEffect(() => {
    if (!isOpen || activeItems.length === 0) return;

    let isMounted = true;
    const renderPreview = async () => {
      setIsRenderingPreview(true);
      try {
        const startIdx = currentSheetIndex * chunkSize;
        const currentChunk = activeItems.slice(startIdx, startIdx + chunkSize);
        
        // Render 150 DPI preview canvas for fast, crisp on-screen inspection
        const canvas = await renderBatchA4SheetCanvas(
          currentChunk,
          config,
          templateConfig,
          printConfig,
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
    activeItems.length,
  ]);

  // Pre-render all sheets at high-res (200 DPI) for browser printing
  const preparePrintSheets = async (): Promise<string[]> => {
    setIsPreparingPrint(true);
    const sheetUrls: string[] = [];
    try {
      for (let s = 0; s < totalSheets; s++) {
        const startIdx = s * chunkSize;
        const chunk = activeItems.slice(startIdx, startIdx + chunkSize);
        const canvas = await renderBatchA4SheetCanvas(
          chunk,
          config,
          templateConfig,
          printConfig,
          s,
          totalSheets,
          200
        );
        sheetUrls.push(canvas.toDataURL('image/png', 0.95));
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

      // Small delay to ensure the DOM has painted the printable images
      setTimeout(() => {
        window.print();
      }, 350);
    } catch (e) {
      console.error('Print failed:', e);
    }
  };

  // Trigger A4 PDF Export via jsPDF
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
    } catch (e) {
      console.error('PDF Export failed:', e);
      alert('Failed to generate A4 PDF. Check console.');
    } finally {
      setIsExportingPdf(false);
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
                Exact ISO CR80 (85.60 × 53.98 mm) • 5 Rows × 2 Columns Paired (Front & Back) • 300 DPI Calibration
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

            {/* Quick Calibration Bar */}
            <div className="w-full max-w-xl mt-3 flex items-center justify-between text-[11px] text-slate-400 px-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Page size: A4 (210 × 297 mm)</span>
              </span>
              <span>1 Sheet = 5 Full IDs (10 Card Sides)</span>
              <span>Trim size: 85.60 × 53.98 mm</span>
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
                    checked={showCropMarks}
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
                    checked={showCutLines}
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
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Spacing Adjustments */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Card Spacing & Margins</span>
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Row Gap (mm)</label>
                    <select
                      value={cardGapY}
                      onChange={(e) => setCardGapY(parseFloat(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="1.0">1.0 mm (Tight)</option>
                      <option value="2.0">2.0 mm (Standard)</option>
                      <option value="3.0">3.0 mm (Spaced)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Column Gap (mm)</label>
                    <select
                      value={cardGapX}
                      onChange={(e) => setCardGapX(parseFloat(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                    >
                      <option value="4.0">4.0 mm</option>
                      <option value="6.0">6.0 mm (Standard)</option>
                      <option value="8.0">8.0 mm</option>
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
                disabled={isPreparingPrint || isExportingPdf}
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
                disabled={isExportingPdf || isPreparingPrint}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Generating A4 PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Download A4 PDF (5 IDs / Sheet)</span>
                  </>
                )}
              </button>
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
