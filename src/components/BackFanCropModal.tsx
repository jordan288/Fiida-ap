import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  ZoomIn,
  ZoomOut,
  Sparkles,
  RefreshCw,
  Move,
  Scissors,
  BookmarkCheck,
  CheckCircle2,
  Maximize2,
  Layers,
  Eye,
  Sliders,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Focus
} from 'lucide-react';
import {
  cropHighQualityFanLayer,
  enhanceFanLayerClarity,
  generateVectorFanDataUrl,
  getEffectiveRegions,
  savePermanentRegions
} from '../utils/pdfRegionExtractor';
import { PdfMarkedRegion } from '../types';

interface BackFanCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceImageUrl: string;
  currentFinUrl?: string;
  fanNumber?: string;
  initialCropBox?: { x: number; y: number; width: number; height: number };
  onApplyCrop: (fanUrl: string, mode?: 'extracted' | 'vector') => void;
}

export const BackFanCropModal: React.FC<BackFanCropModalProps> = ({
  isOpen,
  onClose,
  sourceImageUrl,
  currentFinUrl,
  fanNumber,
  initialCropBox,
  onApplyCrop,
}) => {
  const [activeSourceUrl, setActiveSourceUrl] = useState<string>(sourceImageUrl);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [isSavedPermanent, setIsSavedPermanent] = useState<boolean>(false);

  // Natural image dimensions
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 1000, height: 1400 });

  // Crop Box in natural image pixels
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 295,
    y: 336,
    width: 430,
    height: 63,
  });

  // Dragging & Resizing State
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<{ x: number; y: number; width: number; height: number }>({ ...cropBox });

  // Preview state
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>(currentFinUrl || '');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Position the cutter over the Back FAN on the slip');

  // Upscale & Black and White Quality Engine
  const [colorMode, setColorMode] = useState<'bw' | 'bw_transparent' | 'enhanced' | 'original'>('enhanced');
  const [upscaleFactor, setUpscaleFactor] = useState<number>(1.0); // Fast 1.0x native standard resolution
  const [thresholdOffset, setThresholdOffset] = useState<number>(0);
  const [previewBg, setPreviewBg] = useState<'white' | 'checker' | 'card'>('white');
  const [outputDimensions, setOutputDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSourceUrl(sourceImageUrl);
      setIsSavedPermanent(false);

      if (initialCropBox && initialCropBox.width > 10 && initialCropBox.height > 5) {
        setCropBox(initialCropBox);
      } else {
        // Find saved or default finCut position
        const effective = getEffectiveRegions();
        const finReg = effective.find((r) => r.id === 'finCut' || r.id === 'backFanCut') || {
          x: 29.5,
          y: 24.0,
          width: 43.0,
          height: 4.5,
        };
        // Will be converted to pixels when natural size loads
        setCropBox({
          x: Math.round((finReg.x / 100) * imgNaturalSize.width),
          y: Math.round((finReg.y / 100) * imgNaturalSize.height),
          width: Math.round((finReg.width / 100) * imgNaturalSize.width),
          height: Math.round((finReg.height / 100) * imgNaturalSize.height),
        });
      }
    }
  }, [isOpen, sourceImageUrl, initialCropBox]);

  // Load natural image onto source canvas
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    setImgNaturalSize({ width: w, height: h });
    setImageLoaded(true);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      sourceCanvasRef.current = canvas;
    }

    // Set initial crop box based on calibrated Fayda slip position (FAN line at 24.0%)
    if (!initialCropBox || initialCropBox.width < 10) {
      const effective = getEffectiveRegions();
      const finReg = effective.find((r) => r.id === 'finCut' || r.id === 'backFanCut') || {
        x: 29.5,
        y: 24.0,
        width: 43.0,
        height: 4.5,
      };
      setCropBox({
        x: Math.round((finReg.x / 100) * w),
        y: Math.round((finReg.y / 100) * h),
        width: Math.round((finReg.width / 100) * w),
        height: Math.round((finReg.height / 100) * h),
      });
    }
  };

  // Recompute live preview whenever cropBox, upscaleFactor, or colorMode changes
  const updateCropPreview = useCallback(async () => {
    if (!sourceCanvasRef.current && !activeSourceUrl) return;

    setIsProcessing(true);
    try {
      const canvas = sourceCanvasRef.current;
      if (!canvas) {
        setIsProcessing(false);
        return;
      }

      const pctRegion = {
        x: (cropBox.x / imgNaturalSize.width) * 100,
        y: (cropBox.y / imgNaturalSize.height) * 100,
        width: (cropBox.width / imgNaturalSize.width) * 100,
        height: (cropBox.height / imgNaturalSize.height) * 100,
      };

      const cropUrl = await cropHighQualityFanLayer(canvas, pctRegion, {
        superSampleFactor: upscaleFactor,
        targetMinHeight: upscaleFactor > 1.0 ? 180 : 0,
        bgMode: colorMode === 'bw_transparent' ? 'transparent' : 'white',
        colorMode,
        thresholdOffset,
        sharpen: upscaleFactor > 1.0 || colorMode !== 'original',
        smoothText: true,
        denoise: true,
        noUpscale: upscaleFactor <= 1.0,
      });

      if (cropUrl) {
        setLivePreviewUrl(cropUrl);
        // Measure output image dimensions
        const testImg = new Image();
        testImg.onload = () => {
          setOutputDimensions({ width: testImg.naturalWidth, height: testImg.naturalHeight });
        };
        testImg.src = cropUrl;

        const modeLabel =
          colorMode === 'bw'
            ? '🖤 Crisp B&W'
            : colorMode === 'bw_transparent'
            ? '🏁 B&W Transparent'
            : colorMode === 'enhanced'
            ? '🌈 Enhanced'
            : 'Original (As Is)';
        const scaleLabel = upscaleFactor <= 1.0 ? '1x (As Is)' : `${upscaleFactor}x`;
        setStatusMessage(`FAN: ${cropBox.width}×${cropBox.height}px ➔ ${scaleLabel} (${modeLabel})`);
      }
    } catch (err) {
      console.warn('Live FAN crop update error:', err);
      setStatusMessage('Error rendering FAN preview');
    } finally {
      setIsProcessing(false);
    }
  }, [cropBox, imgNaturalSize, activeSourceUrl, upscaleFactor, colorMode, thresholdOffset]);

  useEffect(() => {
    if (imageLoaded) {
      const timer = setTimeout(updateCropPreview, 100);
      return () => clearTimeout(timer);
    }
  }, [imageLoaded, updateCropPreview]);

  // Pointer drag logic for moving & resizing crop box
  const handlePointerDown = (e: React.PointerEvent, resizeHandle?: string) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (resizeHandle) {
      setIsResizing(resizeHandle);
    } else {
      setIsDragging(true);
    }
    setDragStart({ x: e.clientX, y: e.clientY });
    setCropStart({ ...cropBox });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging && !isResizing) return;
    if (!containerRef.current || !imgRef.current) return;

    const displayedRect = imgRef.current.getBoundingClientRect();
    const scaleX = imgNaturalSize.width / displayedRect.width;
    const scaleY = imgNaturalSize.height / displayedRect.height;

    const dx = (e.clientX - dragStart.x) * scaleX;
    const dy = (e.clientY - dragStart.y) * scaleY;

    if (isDragging) {
      const newX = Math.max(0, Math.min(imgNaturalSize.width - cropStart.width, cropStart.x + dx));
      const newY = Math.max(0, Math.min(imgNaturalSize.height - cropStart.height, cropStart.y + dy));
      setCropBox((prev) => ({ ...prev, x: Math.round(newX), y: Math.round(newY) }));
    } else if (isResizing) {
      let { x, y, width, height } = cropStart;

      if (isResizing.includes('r')) {
        width = Math.max(40, Math.min(imgNaturalSize.width - x, width + dx));
      }
      if (isResizing.includes('l')) {
        const potentialW = width - dx;
        if (potentialW >= 40 && x + dx >= 0) {
          x += dx;
          width = potentialW;
        }
      }
      if (isResizing.includes('b')) {
        height = Math.max(15, Math.min(imgNaturalSize.height - y, height + dy));
      }
      if (isResizing.includes('t')) {
        const potentialH = height - dy;
        if (potentialH >= 15 && y + dy >= 0) {
          y += dy;
          height = potentialH;
        }
      }

      setCropBox({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      });
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setIsResizing(null);
  };

  // Nudge functions
  const nudge = (dx: number, dy: number) => {
    setCropBox((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(imgNaturalSize.width - prev.width, prev.x + dx)),
      y: Math.max(0, Math.min(imgNaturalSize.height - prev.height, prev.y + dy)),
    }));
  };

  const expandCrop = (dw: number, dh: number) => {
    setCropBox((prev) => ({
      ...prev,
      x: Math.max(0, prev.x - Math.round(dw / 2)),
      y: Math.max(0, prev.y - Math.round(dh / 2)),
      width: Math.min(imgNaturalSize.width, Math.max(40, prev.width + dw)),
      height: Math.min(imgNaturalSize.height, Math.max(15, prev.height + dh)),
    }));
  };

  // Auto-locate 16-Digit FAN on slip (canonical Fayda coordinates: 29.5% x, 24.0% y, 43.0% w, 4.5% h)
  const handleAutoLocateFan = () => {
    const w = imgNaturalSize.width;
    const h = imgNaturalSize.height;
    setCropBox({
      x: Math.round(w * 0.295),
      y: Math.round(h * 0.240),
      width: Math.round(w * 0.430),
      height: Math.round(h * 0.045),
    });
    setStatusMessage('Cutter aligned to standard 16-Digit FAN position (24.0%)');
  };

  // Focus viewport zoom on cutter
  const handleFocusOnCutter = () => {
    setZoom(1.4);
    if (containerRef.current) {
      const topOffset = (cropBox.y / imgNaturalSize.height) * containerRef.current.scrollHeight;
      containerRef.current.scrollTo({
        top: Math.max(0, topOffset - 180),
        behavior: 'smooth',
      });
    }
  };

  // Save current cutter position permanently for all future Fayda slips
  const handleSavePermanent = () => {
    const effective = getEffectiveRegions();
    const pctX = Number(((cropBox.x / imgNaturalSize.width) * 100).toFixed(1));
    const pctY = Number(((cropBox.y / imgNaturalSize.height) * 100).toFixed(1));
    const pctW = Number(((cropBox.width / imgNaturalSize.width) * 100).toFixed(1));
    const pctH = Number(((cropBox.height / imgNaturalSize.height) * 100).toFixed(1));

    let found = false;
    const updated = effective.map((r) => {
      if (r.id === 'finCut' || r.id === 'backFanCut') {
        found = true;
        return {
          ...r,
          x: pctX,
          y: pctY,
          width: pctW,
          height: pctH,
          label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
          labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር (16 ዲጂት)',
        };
      }
      return r;
    });

    if (!found) {
      const newReg: PdfMarkedRegion = {
        id: 'finCut',
        label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
        labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር (16 ዲጂት)',
        color: '#ec4899',
        type: 'image',
        x: pctX,
        y: pctY,
        width: pctW,
        height: pctH,
        layerGroup: 'id_barcode',
        layerOrder: 6,
        cutToLayerOnly: true,
      };
      updated.push(newReg);
    }

    savePermanentRegions(updated);
    setIsSavedPermanent(true);
    setStatusMessage('Permanent cutter position saved for all future slips!');
  };

  const handleApply = () => {
    if (!livePreviewUrl) return;
    onApplyCrop(livePreviewUrl, 'extracted');
    onClose();
  };

  if (!isOpen) return null;

  // Visual percentages of crop box on displayed image
  const cropLeftPct = (cropBox.x / imgNaturalSize.width) * 100;
  const cropTopPct = (cropBox.y / imgNaturalSize.height) * 100;
  const cropWidthPct = (cropBox.width / imgNaturalSize.width) * 100;
  const cropHeightPct = (cropBox.height / imgNaturalSize.height) * 100;

  return (
    <div
      id="back-fan-crop-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-600 text-white flex items-center justify-center shadow-md">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Back FAN Cutter Studio • የኋላ ፋን ቁጥር መቁረጫ
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-pink-100 text-pink-700 rounded-full border border-pink-200">
                  Direct Cut • Ultra HD
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Directly crops the authentic 16-digit FAN layer from the Fayda confirmation slip without distortion
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSavePermanent}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                isSavedPermanent
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
              title="Save current cutter box position permanently for all future slips"
            >
              {isSavedPermanent ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  <span>Permanent Position Saved!</span>
                </>
              ) : (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5 text-violet-600" />
                  <span>Make Permanent / ቋሚ አድርግ</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-200/80 rounded-xl text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Grid */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Canvas Viewport (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900 p-4 flex flex-col justify-between overflow-hidden relative select-none">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between z-10 mb-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-800 text-xs text-slate-200 shadow-lg">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoLocateFan}
                  className="flex items-center gap-1 px-2.5 py-1 bg-pink-600 hover:bg-pink-500 text-white rounded-lg font-bold text-[11px] shadow-xs cursor-pointer transition-all"
                  title="Auto-locate 16-Digit FAN on slip (24.0% row)"
                >
                  <Focus className="w-3 h-3" />
                  <span>🎯 Auto-Locate FAN</span>
                </button>

                <button
                  type="button"
                  onClick={handleFocusOnCutter}
                  className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold cursor-pointer"
                  title="Zoom and center on Back FAN cutter box"
                >
                  <span>Focus Cutter</span>
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                  className="p-1 hover:bg-slate-800 rounded text-slate-300 cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="font-mono text-[11px] px-1">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                  className="p-1 hover:bg-slate-800 rounded text-slate-300 cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="px-1.5 py-0.5 text-[10px] hover:bg-slate-800 rounded text-slate-400 cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Document Slip Container */}
            <div
              ref={containerRef}
              className="flex-1 overflow-auto rounded-2xl bg-slate-950 flex items-center justify-center p-4 border border-slate-800 relative cursor-crosshair min-h-[360px]"
            >
              {activeSourceUrl ? (
                <div
                  className="relative inline-block shadow-2xl transition-transform origin-center"
                  style={{ transform: `scale(${zoom})` }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <img
                    ref={imgRef}
                    src={activeSourceUrl}
                    alt="Document Scan"
                    className="max-h-[520px] object-contain rounded border border-slate-700 select-none pointer-events-none"
                    onLoad={handleImageLoad}
                  />

                  {/* Interactive Crop Boundary */}
                  {imageLoaded && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${cropLeftPct}%`,
                        top: `${cropTopPct}%`,
                        width: `${cropWidthPct}%`,
                        height: `${cropHeightPct}%`,
                        borderColor: '#ec4899',
                        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65), 0 0 15px rgba(236, 72, 153, 0.8)',
                      }}
                      className="border-2 cursor-move rounded-xs group flex items-center justify-center z-20 transition-shadow"
                      onPointerDown={(e) => handlePointerDown(e)}
                    >
                      {/* Badge */}
                      <div className="absolute -top-6 left-0 bg-pink-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1 whitespace-nowrap pointer-events-none">
                        <Scissors className="w-2.5 h-2.5" />
                        <span>Back FAN ({cropBox.width}×{cropBox.height}px)</span>
                      </div>

                      {/* 8 Resize Handles */}
                      {/* NW */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'nw')}
                        className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-pink-600 rounded-full cursor-nwse-resize shadow-md"
                      />
                      {/* NE */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'ne')}
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-pink-600 rounded-full cursor-nesw-resize shadow-md"
                      />
                      {/* SW */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'sw')}
                        className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-pink-600 rounded-full cursor-nesw-resize shadow-md"
                      />
                      {/* SE */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'se')}
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-pink-600 rounded-full cursor-nwse-resize shadow-md"
                      />
                      {/* W */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'l')}
                        className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-3.5 bg-white border-2 border-pink-600 rounded-xs cursor-ew-resize"
                      />
                      {/* E */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'r')}
                        className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-3.5 bg-white border-2 border-pink-600 rounded-xs cursor-ew-resize"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-500 py-12">
                  <Scissors className="w-12 h-12 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm">No document slip scan loaded</p>
                </div>
              )}
            </div>

            {/* Bottom Status & Micro-Nudge D-Pad */}
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span className="truncate max-w-[280px] font-mono text-[11px] text-slate-300">
                {statusMessage}
              </span>

              {/* Micro-Nudge Controls */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">Micro-Nudge:</span>
                <button
                  type="button"
                  onClick={() => nudge(0, -2)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                  title="Nudge Up (2px)"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => nudge(0, 2)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                  title="Nudge Down (2px)"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => nudge(-2, 0)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                  title="Nudge Left (2px)"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => nudge(2, 0)}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                  title="Nudge Right (2px)"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => expandCrop(10, 4)}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                  title="Expand box size"
                >
                  +Expand
                </button>
                <button
                  type="button"
                  onClick={() => expandCrop(-10, -4)}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                  title="Shrink box size"
                >
                  -Shrink
                </button>
              </div>
            </div>
          </div>

          {/* Right Control & Quality Inspection Panel (5 cols) */}
          <div className="lg:col-span-5 p-5 bg-slate-50 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              {/* Direct Cut Calibration & Position Tools */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <Scissors className="w-3.5 h-3.5 text-pink-600" />
                    <span>Direct Field Cut • ንጹህ የተቆረጠ ፋን</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Authentic Slip Pixels
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  The marked field is sliced directly from your confirmation slip, upscaled, and converted into crisp black and white.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAutoLocateFan}
                    className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>🎯 Reset to FAN Row (24.0%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePermanent}
                    className={`py-1.5 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSavedPermanent
                        ? 'bg-emerald-600 text-white'
                        : 'bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200'
                    }`}
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>{isSavedPermanent ? 'Saved!' : 'Save as Default'}</span>
                  </button>
                </div>
              </div>

              {/* Black & White Quality & Upscaling Engine */}
              <div className="bg-white p-3.5 rounded-2xl border border-pink-200/90 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-pink-900">
                    <Sparkles className="w-3.5 h-3.5 text-pink-600" />
                    <span>Black & White & Upscale Quality Engine</span>
                  </div>
                  <span className="text-[10px] font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">
                    {upscaleFactor}x HD • {colorMode === 'bw' ? 'B&W' : colorMode}
                  </span>
                </div>

                {/* Mode Selector */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Color & Background Mode:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setColorMode('bw')}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                        colorMode === 'bw'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Pure white background with deep jet-black ink - Recommended for Card Back"
                    >
                      <span>🖤</span>
                      <span className="truncate">Crisp B&W (White)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorMode('bw_transparent')}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                        colorMode === 'bw_transparent'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Jet-black digits with transparent background"
                    >
                      <span>🏁</span>
                      <span className="truncate">B&W (Transparent)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorMode('enhanced')}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                        colorMode === 'enhanced'
                          ? 'bg-pink-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Boosted contrast while keeping authentic document scan colors"
                    >
                      <span>🌈</span>
                      <span className="truncate">Enhanced Color</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setColorMode('original')}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                        colorMode === 'original'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Raw untouched scan pixels"
                    >
                      <span>📄</span>
                      <span className="truncate">Raw Scan</span>
                    </button>
                  </div>
                </div>

                {/* Upscale Factor */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">Upscale Super-Sampling:</span>
                    <span className="font-mono text-pink-700 font-bold">{upscaleFactor}x Factor</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { factor: 1.0, label: '1.0x', dpi: 'Standard' },
                      { factor: 2.0, label: '2.0x', dpi: 'Sharp HD' },
                      { factor: 2.5, label: '2.5x', dpi: 'Ultra HD' },
                      { factor: 3.0, label: '3.0x', dpi: 'Max Print' },
                    ].map((item) => (
                      <button
                        key={item.factor}
                        type="button"
                        onClick={() => setUpscaleFactor(item.factor)}
                        className={`py-1 px-1 rounded-lg text-center transition-all cursor-pointer ${
                          upscaleFactor === item.factor
                            ? 'bg-pink-600 text-white font-bold shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px]'
                        }`}
                      >
                        <div className="text-[10px] font-bold leading-tight">{item.label}</div>
                        <div className="text-[8px] opacity-80">{item.dpi}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ink Thickness / Density Threshold Slider */}
                {(colorMode === 'bw' || colorMode === 'bw_transparent' || colorMode === 'enhanced') && (
                  <div className="space-y-1 pt-1 border-t border-pink-100">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">Ink Density / Threshold:</span>
                      <span className="font-mono text-slate-600 text-[10px]">
                        {thresholdOffset > 0 ? `+${thresholdOffset} (Bolder)` : thresholdOffset < 0 ? `${thresholdOffset} (Thinner)` : 'Standard (0)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Thin</span>
                      <input
                        type="range"
                        min="-35"
                        max="35"
                        value={thresholdOffset}
                        onChange={(e) => setThresholdOffset(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                      />
                      <span className="text-[10px] text-slate-400">Bold</span>
                      {thresholdOffset !== 0 && (
                        <button
                          type="button"
                          onClick={() => setThresholdOffset(0)}
                          className="px-1.5 py-0.5 text-[9px] bg-slate-100 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Live Cut Preview Card */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Eye className="w-3.5 h-3.5 text-pink-600" />
                    <span>Live Upscaled FAN Preview</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewBg('white')}
                      className={`px-1.5 py-0.5 text-[9px] rounded font-bold cursor-pointer ${
                        previewBg === 'white' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      White
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewBg('checker')}
                      className={`px-1.5 py-0.5 text-[9px] rounded font-bold cursor-pointer ${
                        previewBg === 'checker' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Grid
                    </button>
                    <span className="text-[10px] font-mono text-slate-400 ml-1">
                      {outputDimensions.width > 0
                        ? `${outputDimensions.width}×${outputDimensions.height}px`
                        : `${cropBox.width}×${cropBox.height}px`}
                    </span>
                  </div>
                </div>

                {/* Preview Viewport */}
                <div
                  className={`p-4 rounded-xl border border-slate-200 flex items-center justify-center min-h-[90px] overflow-hidden ${
                    previewBg === 'checker'
                      ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:8px_8px] bg-slate-100'
                      : 'bg-white'
                  }`}
                >
                  {livePreviewUrl ? (
                    <img
                      src={livePreviewUrl}
                      alt="Back FAN Cut Preview"
                      className="max-w-full max-h-16 object-contain"
                      style={{ imageRendering: 'auto' }}
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Generating cut preview...</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                  <span className="font-mono">
                    Output: {outputDimensions.width || Math.round(cropBox.width * upscaleFactor)} × {outputDimensions.height || Math.round(cropBox.height * upscaleFactor)} px
                  </span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> {upscaleFactor}x Super-Sampled • Lossless PNG
                  </span>
                </div>
              </div>

              {/* Sharpness & Digit Verification */}
              <div className="p-3 bg-slate-100/80 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">16-Digit FAN Reference:</span>
                  <span className="font-mono font-bold text-pink-700">
                    {fanNumber || '4195 0436 7069 2582'}
                  </span>
                </div>
                <p className="text-[8px] text-slate-500 leading-snug">
                  The cut image will be placed directly onto the Back Card FAN layer with blend mode multiplication and natural aspect preservation.
                </p>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!livePreviewUrl || isProcessing}
                onClick={handleApply}
                className="flex-[2] py-2.5 px-5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-pink-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Apply to Back FAN</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
