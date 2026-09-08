import React, { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Crosshair,
  Sliders,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Save,
  Trash2,
  Layers,
  ArrowRight,
  Move,
  Scan,
  Camera,
  QrCode,
  Type,
  FileCheck,
  Check,
  ChevronDown,
  Info,
  ExternalLink,
  RotateCcw,
  Sparkle,
  Barcode,
  BookmarkCheck
} from 'lucide-react';
import { IdCardData, PdfMarkedRegion, PdfTextItemWithBox, PdfMarkedPreset, TemplateConfig, CoordinatesConfig } from '../types';
import { 
  DEFAULT_PDF_MARKED_REGIONS, 
  cropImageRegion, 
  cropAndDecodeQrRegion, 
  cropAndDecodeBarcodeRegion,
  extractTextFromRegion, 
  extractAllFromMarkedRegions,
  savePermanentRegions,
  loadPermanentRegions,
  clearPermanentRegions,
  getEffectiveRegions
} from '../utils/pdfRegionExtractor';
import { sanitizeEnglishName, sanitizeAmharicName } from '../utils/textCleaner';
import { CardRenderer } from './CardRenderer';

interface PdfPositionMarkerProps {
  pageCanvasUrl: string;
  textItems?: PdfTextItemWithBox[];
  canvasDimensions?: { width: number; height: number };
  initialData: IdCardData;
  config: CoordinatesConfig;
  templateConfig?: TemplateConfig;
  detectedPhotoBox?: { x: number; y: number; width: number; height: number };
  detectedQrBox?: { x: number; y: number; width: number; height: number };
  detectedBarcodeBox?: { x: number; y: number; width: number; height: number };
  onPerformAction: (extractedData: IdCardData) => void;
  onOpenStudio?: () => void;
}

const STORAGE_PRESETS_KEY = 'fayda_pdf_marked_presets_v1';

export const PdfPositionMarker: React.FC<PdfPositionMarkerProps> = ({
  pageCanvasUrl,
  textItems = [],
  canvasDimensions,
  initialData,
  config,
  templateConfig,
  detectedPhotoBox,
  detectedQrBox,
  detectedBarcodeBox,
  onPerformAction,
  onOpenStudio,
}) => {
  // Initialize regions with any permanently saved positions or auto-detected boxes
  const [regions, setRegions] = useState<PdfMarkedRegion[]>(() => {
    const saved = loadPermanentRegions();
    const base = saved && saved.length > 0 ? getEffectiveRegions() : DEFAULT_PDF_MARKED_REGIONS.map((r) => ({ ...r }));
    
    // If canvas dimensions and detected boxes are provided and no custom permanent layout saved yet, calibrate photo, QR & barcode
    if (canvasDimensions && canvasDimensions.width > 0 && canvasDimensions.height > 0) {
      if (detectedPhotoBox && !saved) {
        const photo = base.find((r) => r.id === 'photo');
        if (photo) {
          photo.x = Math.max(0, Math.min(90, (detectedPhotoBox.x / canvasDimensions.width) * 100));
          photo.y = Math.max(0, Math.min(90, (detectedPhotoBox.y / canvasDimensions.height) * 100));
          photo.width = Math.max(5, Math.min(50, (detectedPhotoBox.width / canvasDimensions.width) * 100));
          photo.height = Math.max(5, Math.min(50, (detectedPhotoBox.height / canvasDimensions.height) * 100));
        }
      }
      if (detectedQrBox && !saved) {
        const qr = base.find((r) => r.id === 'qrCode');
        if (qr) {
          qr.x = Math.max(0, Math.min(90, (detectedQrBox.x / canvasDimensions.width) * 100));
          qr.y = Math.max(0, Math.min(90, (detectedQrBox.y / canvasDimensions.height) * 100));
          qr.width = Math.max(5, Math.min(50, (detectedQrBox.width / canvasDimensions.width) * 100));
          qr.height = Math.max(5, Math.min(50, (detectedQrBox.height / canvasDimensions.height) * 100));
        }
      }
      if (detectedBarcodeBox && !saved) {
        const barcode = base.find((r) => r.id === 'barcode');
        if (barcode) {
          barcode.x = Math.max(0, Math.min(90, (detectedBarcodeBox.x / canvasDimensions.width) * 100));
          barcode.y = Math.max(0, Math.min(90, (detectedBarcodeBox.y / canvasDimensions.height) * 100));
          barcode.width = Math.max(10, Math.min(70, (detectedBarcodeBox.width / canvasDimensions.width) * 100));
          barcode.height = Math.max(3, Math.min(30, (detectedBarcodeBox.height / canvasDimensions.height) * 100));
        }
      }
    }
    return base;
  });

  const [selectedRegionId, setSelectedRegionId] = useState<string>('photo');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isPerforming, setIsPerforming] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string>('');
  const [permanentFeedback, setPermanentFeedback] = useState<string>('');
  const [isPermanentSaved, setIsPermanentSaved] = useState<boolean>(() => !!loadPermanentRegions());
  const [previewData, setPreviewData] = useState<IdCardData>(initialData);

  // Live previews of marked crops
  const [livePhotoPreview, setLivePhotoPreview] = useState<string>(initialData.photoUrl || '');
  const [liveQrPreview, setLiveQrPreview] = useState<string>(initialData.qrCodeImageUrl || '');
  const [liveBarcodePreview, setLiveBarcodePreview] = useState<string>(initialData.barcodeImageUrl || '');
  const [liveBarcodeData, setLiveBarcodeData] = useState<string>(initialData.barcodeData || '');
  const [liveExtractedTexts, setLiveExtractedTexts] = useState<Record<string, string>>({});

  // Presets state
  const [savedPresets, setSavedPresets] = useState<PdfMarkedPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRESETS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [showPresetModal, setShowPresetModal] = useState<boolean>(false);

  // Dragging and Resizing State
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<string | null>(null); // e.g. 'se', 'nw', 'e', etc.
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; startX: number; startY: number; startW: number; startH: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  const activeRegion = regions.find((r) => r.id === selectedRegionId) || regions[0];

  // Update live preview of fields whenever regions or source change
  const refreshLiveReadouts = useCallback(async () => {
    if (!pageCanvasUrl) return;

    // 1. Photo preview
    const photoReg = regions.find((r) => r.id === 'photo');
    if (photoReg) {
      cropImageRegion(pageCanvasUrl, photoReg, 200, 260)
        .then((url) => setLivePhotoPreview(url))
        .catch(() => {});
    }

    // 2. QR preview
    const qrReg = regions.find((r) => r.id === 'qrCode');
    if (qrReg) {
      cropAndDecodeQrRegion(pageCanvasUrl, qrReg)
        .then((res) => {
          if (res.qrUrl) setLiveQrPreview(res.qrUrl);
        })
        .catch(() => {});
    }

    // 3. Barcode preview
    const barcodeReg = regions.find((r) => r.id === 'barcode' || r.type === 'barcode');
    if (barcodeReg) {
      cropAndDecodeBarcodeRegion(pageCanvasUrl, barcodeReg, textItems)
        .then((res) => {
          if (res.barcodeUrl) setLiveBarcodePreview(res.barcodeUrl);
          if (res.barcodeText) setLiveBarcodeData(res.barcodeText);
        })
        .catch(() => {});
    }

    // 4. Text readouts
    const texts: Record<string, string> = {};
    for (const r of regions) {
      if (r.type === 'text') {
        const txt = extractTextFromRegion(r, textItems);
        texts[r.id] = txt;
      }
    }
    setLiveExtractedTexts(texts);
  }, [pageCanvasUrl, regions, textItems]);

  useEffect(() => {
    const timer = setTimeout(refreshLiveReadouts, 120);
    return () => clearTimeout(timer);
  }, [refreshLiveReadouts]);

  // Handle Box Dragging & Resizing via Mouse Events
  const handleMouseDownOnRegion = (e: React.MouseEvent, regId: string) => {
    e.stopPropagation();
    setSelectedRegionId(regId);
    const targetReg = regions.find((r) => r.id === regId);
    if (!targetReg) return;

    setIsDragging(true);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: targetReg.x,
      startY: targetReg.y,
      startW: targetReg.width,
      startH: targetReg.height,
    });
  };

  const handleMouseDownOnHandle = (e: React.MouseEvent, regId: string, handleDir: string) => {
    e.stopPropagation();
    setSelectedRegionId(regId);
    const targetReg = regions.find((r) => r.id === regId);
    if (!targetReg) return;

    setIsResizing(handleDir);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: targetReg.x,
      startY: targetReg.y,
      startW: targetReg.width,
      startH: targetReg.height,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging && !isResizing) return;
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaXPercent = ((e.clientX - dragStart.mouseX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragStart.mouseY) / rect.height) * 100;

      setRegions((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRegionId) return r;

          if (isDragging) {
            const newX = Math.max(0, Math.min(100 - r.width, dragStart.startX + deltaXPercent));
            const newY = Math.max(0, Math.min(100 - r.height, dragStart.startY + deltaYPercent));
            return {
              ...r,
              x: Number(newX.toFixed(2)),
              y: Number(newY.toFixed(2)),
            };
          }

          if (isResizing) {
            let newX = r.x;
            let newY = r.y;
            let newW = r.width;
            let newH = r.height;

            if (isResizing.includes('e')) {
              newW = Math.max(2, Math.min(100 - dragStart.startX, dragStart.startW + deltaXPercent));
            }
            if (isResizing.includes('w')) {
              const maxDelta = dragStart.startW - 2;
              const actualDelta = Math.min(maxDelta, deltaXPercent);
              newX = Math.max(0, dragStart.startX + actualDelta);
              newW = dragStart.startW - actualDelta;
            }
            if (isResizing.includes('s')) {
              newH = Math.max(1.5, Math.min(100 - dragStart.startY, dragStart.startH + deltaYPercent));
            }
            if (isResizing.includes('n')) {
              const maxDelta = dragStart.startH - 1.5;
              const actualDelta = Math.min(maxDelta, deltaYPercent);
              newY = Math.max(0, dragStart.startY + actualDelta);
              newH = dragStart.startH - actualDelta;
            }

            return {
              ...r,
              x: Number(newX.toFixed(2)),
              y: Number(newY.toFixed(2)),
              width: Number(newW.toFixed(2)),
              height: Number(newH.toFixed(2)),
            };
          }

          return r;
        })
      );
    },
    [isDragging, isResizing, dragStart, selectedRegionId]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
    // Automatically persist modified positions as permanent
    savePermanentRegions(regions);
    setIsPermanentSaved(true);
  }, [regions]);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Fine-tune step adjustment
  const handleNudge = (axis: 'x' | 'y' | 'w' | 'h', delta: number) => {
    setRegions((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== selectedRegionId) return r;
        let newX = r.x;
        let newY = r.y;
        let newW = r.width;
        let newH = r.height;

        if (axis === 'x') newX = Math.max(0, Math.min(100 - r.width, r.x + delta));
        if (axis === 'y') newY = Math.max(0, Math.min(100 - r.height, r.y + delta));
        if (axis === 'w') newW = Math.max(2, Math.min(100 - r.x, r.width + delta));
        if (axis === 'h') newH = Math.max(1.5, Math.min(100 - r.y, r.height + delta));

        return {
          ...r,
          x: Number(newX.toFixed(2)),
          y: Number(newY.toFixed(2)),
          width: Number(newW.toFixed(2)),
          height: Number(newH.toFixed(2)),
        };
      });
      savePermanentRegions(updated);
      setIsPermanentSaved(true);
      return updated;
    });
  };

  // Explicitly save current positions permanently
  const handleSaveAsPermanent = () => {
    savePermanentRegions(regions);
    setIsPermanentSaved(true);
    setPermanentFeedback('Positions saved permanently! ቋሚ ቅንብር ተቀምጧል');
    setTimeout(() => setPermanentFeedback(''), 3000);
  };

  // Reset to saved permanent layout
  const handleResetToSavedPermanent = () => {
    const saved = loadPermanentRegions();
    if (saved && saved.length > 0) {
      setRegions(getEffectiveRegions());
      setPermanentFeedback('Restored your saved permanent positions / ወደ ቋሚ ቅንብር ተመልሷል');
      setTimeout(() => setPermanentFeedback(''), 3000);
    }
  };

  // Reset to default standard layout
  const handleResetToDefault = () => {
    setRegions(DEFAULT_PDF_MARKED_REGIONS.map((r) => ({ ...r })));
    clearPermanentRegions();
    setIsPermanentSaved(false);
    setPermanentFeedback('Reset to standard factory default / ወደ ነባሪ ተመልሷል');
    setTimeout(() => setPermanentFeedback(''), 3000);
  };

  // Save layout as custom preset
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: PdfMarkedPreset = {
      id: `preset_${Date.now()}`,
      name: newPresetName.trim(),
      description: `Custom layout with ${regions.length} marked positions`,
      regions: regions.map((r) => ({ ...r })),
      createdAt: new Date().toLocaleDateString(),
    };
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
    setNewPresetName('');
    setShowPresetModal(false);
  };

  // Load a preset
  const handleLoadPreset = (preset: PdfMarkedPreset) => {
    setRegions(preset.regions.map((r) => ({ ...r })));
  };

  // Delete a preset
  const handleDeletePreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

  // ⚡ Perform Action: Extract everything from marked positions and apply to template
  const handleExecuteAction = async () => {
    setIsPerforming(true);
    setActionSuccessMessage('Extracting credentials, cropping portrait & QR, and applying directly to template...');

    try {
      const extractedResult = await extractAllFromMarkedRegions(
        pageCanvasUrl,
        textItems,
        regions,
        initialData
      );

      setPreviewData(extractedResult);
      onPerformAction(extractedResult);

      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {}

      setActionSuccessMessage('✨ Successfully extracted all fields from marked positions and applied to ID Card template!');
      setTimeout(() => setActionSuccessMessage(''), 4500);
    } catch (err: unknown) {
      console.error('Extraction action error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setActionSuccessMessage(`Action failed: ${errorMessage}`);
    } finally {
      setIsPerforming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Action Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Crosshair className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Visual PDF Position Marker & Template Mapper
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
              100% Local
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Put your PDF slip once, drag or resize the bounding boxes directly on the document, and click <strong>Perform Action</strong> to extract and apply all credentials into your ID card template with pixel perfection.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExecuteAction}
            disabled={isPerforming || !pageCanvasUrl}
            className="flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-extrabold rounded-2xl shadow-xl shadow-emerald-950/40 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {isPerforming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Extracting & Applying...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>PERFORM ACTION & APPLY TO TEMPLATE</span>
              </>
            )}
          </button>

          {onOpenStudio && (
            <button
              type="button"
              onClick={onOpenStudio}
              className="flex items-center gap-1.5 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-2xl border border-slate-700 transition-all cursor-pointer"
            >
              <span>Open Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMessage && (
        <div className="bg-emerald-900/40 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage('')}
            className="text-emerald-400 hover:text-white text-xs cursor-pointer ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Permanent Save Feedback Notification */}
      {permanentFeedback && (
        <div className="bg-violet-950/70 border border-violet-500/80 text-violet-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-violet-400 shrink-0" />
            <span>{permanentFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setPermanentFeedback('')}
            className="text-violet-300 hover:text-white text-xs cursor-pointer ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Control Bar: Permanent Position Save, Zoom, Presets, Reset */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Field Quick Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-2xl scrollbar-none">
          {regions.map((reg) => {
            const isSel = reg.id === selectedRegionId;
            return (
              <button
                key={reg.id}
                type="button"
                onClick={() => setSelectedRegionId(reg.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSel
                    ? 'bg-slate-900 text-white shadow-sm ring-2 ring-emerald-500'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
              >
                {reg.id === 'barcode' ? (
                  <Barcode className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: reg.color }}
                  />
                )}
                <span>{reg.label} {reg.labelAmh ? `/ ${reg.labelAmh}` : ''}</span>
              </button>
            );
          })}
        </div>

        {/* Viewport Zoom, Permanent Save & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Permanent Save Action */}
          <button
            type="button"
            onClick={handleSaveAsPermanent}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-xs transition-all cursor-pointer"
            title="Save current marked coordinates permanently for all future Fayda slips"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Make Positions Permanent / እንደ ቋሚ አስቀምጥ</span>
          </button>

          {isPermanentSaved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Permanent: Active</span>
            </span>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
              className="p-1 hover:bg-white rounded-lg text-slate-600 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold px-2 text-slate-700 min-w-[45px] text-center">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
              className="p-1 hover:bg-white rounded-lg text-slate-600 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              100%
            </button>
          </div>

          {/* Reset Options */}
          {isPermanentSaved && (
            <button
              type="button"
              onClick={handleResetToSavedPermanent}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-800 rounded-xl border border-violet-200 cursor-pointer transition-colors"
              title="Restore your saved permanent positions"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>To Permanent</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 cursor-pointer transition-colors"
            title="Reset positions to default Fayda slip standard"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Factory Reset</span>
          </button>

          {/* Presets dropdown */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200 cursor-pointer transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-emerald-600" />
              <span>Presets ({savedPresets.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace: Left PDF Canvas vs Right Live Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive PDF Canvas */}
        <div className="lg:col-span-8 bg-slate-800/95 rounded-3xl p-4 shadow-lg border border-slate-700 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700 text-white text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-200">
                Interactive PDF Page Canvas — Drag or resize boxes directly
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Active: <span style={{ color: activeRegion.color }} className="font-bold">{activeRegion.label}</span> (X:{activeRegion.x}%, Y:{activeRegion.y}%, W:{activeRegion.width}%, H:{activeRegion.height}%)
            </span>
          </div>

          {/* Scrollable Stage */}
          <div
            ref={containerRef}
            className="relative overflow-auto max-h-[750px] rounded-2xl bg-slate-950 flex items-center justify-center p-4 select-none scrollbar-thin scrollbar-thumb-slate-700"
          >
            {pageCanvasUrl ? (
              <div
                style={{
                  width: `${zoomLevel}%`,
                  transition: isDragging || isResizing ? 'none' : 'width 0.15s ease-out',
                }}
                className="relative inline-block shadow-2xl rounded-xl overflow-hidden leading-none"
              >
                <img
                  ref={imageRef}
                  src={pageCanvasUrl}
                  alt="Fayda Slip PDF Page"
                  className="w-full h-auto block select-none pointer-events-none"
                  draggable={false}
                />

                {/* SVG & HTML Region Overlays */}
                {regions.map((reg) => {
                  const isSel = reg.id === selectedRegionId;
                  return (
                    <div
                      key={reg.id}
                      onMouseDown={(e) => handleMouseDownOnRegion(e, reg.id)}
                      style={{
                        position: 'absolute',
                        left: `${reg.x}%`,
                        top: `${reg.y}%`,
                        width: `${reg.width}%`,
                        height: `${reg.height}%`,
                        borderColor: reg.color,
                        backgroundColor: `${reg.color}${isSel ? '28' : '15'}`,
                        borderWidth: isSel ? '2.5px' : '1.5px',
                        borderStyle: isSel ? 'solid' : 'dashed',
                        boxShadow: isSel ? `0 0 12px ${reg.color}60` : 'none',
                        zIndex: isSel ? 30 : 10,
                      }}
                      className="cursor-move rounded-sm transition-shadow group flex flex-col justify-start"
                    >
                      {/* Tag Label at top-left */}
                      <div
                        style={{ backgroundColor: reg.color }}
                        className="self-start text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br-md leading-none shadow-xs truncate max-w-full"
                      >
                        {reg.label} {reg.labelAmh ? `• ${reg.labelAmh}` : ''}
                      </div>

                      {/* Resize Handles for selected box */}
                      {isSel && (
                        <>
                          {/* NW */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'nw')}
                            style={{ borderColor: reg.color }}
                            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nwse-resize shadow-md"
                          />
                          {/* NE */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'ne')}
                            style={{ borderColor: reg.color }}
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nesw-resize shadow-md"
                          />
                          {/* SW */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'sw')}
                            style={{ borderColor: reg.color }}
                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nesw-resize shadow-md"
                          />
                          {/* SE */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'se')}
                            style={{ borderColor: reg.color }}
                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nwse-resize shadow-md"
                          />
                          {/* Top handle */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'n')}
                            style={{ borderColor: reg.color }}
                            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-white border-2 rounded-sm cursor-ns-resize"
                          />
                          {/* Bottom handle */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 's')}
                            style={{ borderColor: reg.color }}
                            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-white border-2 rounded-sm cursor-ns-resize"
                          />
                          {/* Left handle */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'w')}
                            style={{ borderColor: reg.color }}
                            className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border-2 rounded-sm cursor-ew-resize"
                          />
                          {/* Right handle */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'e')}
                            style={{ borderColor: reg.color }}
                            className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border-2 rounded-sm cursor-ew-resize"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-24 text-center text-slate-400 space-y-2">
                <FileCheck className="w-12 h-12 mx-auto text-slate-600" />
                <p className="text-sm font-semibold">No PDF page rendered yet</p>
                <p className="text-xs text-slate-500">Upload a Fayda slip in the Extractor tab first</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Inspector, Nudge Controls & Live Card Preview */}
        <div className="lg:col-span-4 space-y-5">
          {/* Active Field Inspector Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full shadow-xs"
                  style={{ backgroundColor: activeRegion.color }}
                />
                <div>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">
                    {activeRegion.label}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {activeRegion.labelAmh || activeRegion.id}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase">
                {activeRegion.type}
              </span>
            </div>

            {/* Coordinate Fine-Tune Controls */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* X Position */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span>X Position</span>
                  <span className="font-mono font-bold text-slate-800">{activeRegion.x}%</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleNudge('x', -0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudge('x', 0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    +0.5
                  </button>
                </div>
              </div>

              {/* Y Position */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span>Y Position</span>
                  <span className="font-mono font-bold text-slate-800">{activeRegion.y}%</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleNudge('y', -0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudge('y', 0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    +0.5
                  </button>
                </div>
              </div>

              {/* Width */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span>Width</span>
                  <span className="font-mono font-bold text-slate-800">{activeRegion.width}%</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleNudge('w', -0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudge('w', 0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    +0.5
                  </button>
                </div>
              </div>

              {/* Height */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span>Height</span>
                  <span className="font-mono font-bold text-slate-800">{activeRegion.height}%</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleNudge('h', -0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudge('h', 0.5)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded-lg border border-slate-300 cursor-pointer text-xs"
                  >
                    +0.5
                  </button>
                </div>
              </div>
            </div>

            {/* Live Readout / Crop Preview */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Live Marked Area Preview</span>
                <span className="text-emerald-600 font-normal lowercase">real-time</span>
              </div>

              {activeRegion.id === 'photo' && (
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  {livePhotoPreview ? (
                    <img
                      src={livePhotoPreview}
                      alt="Crop Preview"
                      className="w-16 h-20 object-cover rounded-xl border border-slate-300 shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-20 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                      <Camera className="w-6 h-6" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">Portrait Photo Crop</p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      High-resolution 480×640 portrait cropped directly from the marked coordinates.
                    </p>
                  </div>
                </div>
              )}

              {activeRegion.id === 'qrCode' && (
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  {liveQrPreview ? (
                    <img
                      src={liveQrPreview}
                      alt="QR Preview"
                      className="w-18 h-18 object-contain bg-white rounded-xl border border-slate-300 shadow-sm p-1"
                    />
                  ) : (
                    <div className="w-18 h-18 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                      <QrCode className="w-6 h-6" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">Biometric QR Matrix</p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      High-density QR matrix cropped and auto-decoded directly from coordinates.
                    </p>
                  </div>
                </div>
              )}

              {(activeRegion.id === 'barcode' || activeRegion.type === 'barcode') && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-violet-600" />
                      <span>1D Barcode Strip • ባርኮድ</span>
                    </p>
                    {liveBarcodeData && (
                      <span className="text-[10px] font-mono font-bold bg-violet-100 text-violet-800 px-2 py-0.5 rounded-md">
                        Decoded
                      </span>
                    )}
                  </div>

                  {liveBarcodePreview ? (
                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs flex items-center justify-center">
                      <img
                        src={liveBarcodePreview}
                        alt="1D Barcode Preview"
                        className="w-full max-h-16 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-14 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 gap-2">
                      <Barcode className="w-6 h-6" />
                      <span className="text-xs">No Barcode Loaded</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">
                      Decoded / Human-Readable Digits:
                    </p>
                    <p className="text-xs font-mono font-bold text-slate-900 bg-white p-2 rounded-xl border border-slate-200">
                      {liveBarcodeData || (
                        <span className="text-slate-400 font-normal italic">
                          Automatic detection from coordinates & text stream
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {activeRegion.type === 'text' && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Extracted Text Content:</span>
                  </div>
                  <p className="text-xs font-mono font-bold text-slate-900 bg-white p-2 rounded-xl border border-slate-200 break-words min-h-[36px]">
                    {liveExtractedTexts[activeRegion.id] || (
                      <span className="text-slate-400 font-normal italic">
                        No vector text in this region — auto-fallback used
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mini Live Card Template Preview */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Template Preview (Front Card)</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">CR80 ISO 300 DPI</span>
            </div>

            <div className="bg-slate-100 p-2 rounded-2xl border border-slate-200 flex items-center justify-center overflow-hidden">
              <div className="transform scale-[0.38] origin-center -my-24">
                <CardRenderer
                  side="front"
                  data={previewData}
                  config={config}
                  templateConfig={templateConfig}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={isPerforming}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Apply Current Marked Positions to Card</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Save className="w-4 h-4 text-emerald-600" />
                <span>PDF Position Layout Presets</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Save Current Layout */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Save Current Layout as Preset</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="e.g. Online Fayda Slip Layout"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {/* List of Saved Presets */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700">Saved Presets</label>
              {savedPresets.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No custom presets saved yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedPresets.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.createdAt || p.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleLoadPreset(p);
                            setShowPresetModal(false);
                          }}
                          className="px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-bold rounded-lg cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(p.id)}
                          className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
