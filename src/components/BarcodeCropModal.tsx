import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  ZoomIn,
  ZoomOut,
  Sparkles,
  RefreshCw,
  Move,
  Upload,
  Crop as CropIcon,
  Barcode,
  SlidersHorizontal,
  Info,
  Sliders,
  CheckCheck,
  FileCheck,
  Zap,
  Maximize2,
  Layers,
  Eye
} from 'lucide-react';
import {
  cropExactBarcode,
  cropAndEnhanceBarcode,
  generateCode128DataUrl,
  BarcodeCropResult,
  BarcodeEnhanceOptions
} from '../utils/barcodeEngine';

interface BarcodeCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceImageUrl: string;
  currentBarcodeUrl?: string;
  currentBarcodeData?: string;
  fanNumber?: string;
  initialCropBox?: { x: number; y: number; width: number; height: number };
  onApplyCrop: (barcodeUrl: string, barcodeData?: string, mode?: 'extracted' | 'vector') => void;
}

export const BarcodeCropModal: React.FC<BarcodeCropModalProps> = ({
  isOpen,
  onClose,
  sourceImageUrl,
  currentBarcodeUrl,
  currentBarcodeData,
  fanNumber,
  initialCropBox,
  onApplyCrop,
}) => {
  const [activeSourceUrl, setActiveSourceUrl] = useState<string>(sourceImageUrl);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [filterMode, setFilterMode] = useState<'binarized' | 'enhanced' | 'vector' | 'original'>('original');
  const [columnRegularize, setColumnRegularize] = useState<boolean>(true);
  const [threshold, setThreshold] = useState<number>(0); // 0 = Auto Otsu
  const [quietZone, setQuietZone] = useState<number>(24);
  const [activeTab, setActiveTab] = useState<'editor' | 'vector'>('editor');

  // Dimensions & Coordinates
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 200,
    y: 700,
    width: 400,
    height: 70,
  });

  // Dragging & Resizing
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<{ x: number; y: number; width: number; height: number }>({ ...cropBox });

  // Preview state
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>(currentBarcodeUrl || '');
  const [decodedData, setDecodedData] = useState<string>(currentBarcodeData || fanNumber || '');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Adjust box or select enhancement filters');

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSourceUrl(sourceImageUrl);
      if (initialCropBox && initialCropBox.width > 10 && initialCropBox.height > 5) {
        setCropBox(initialCropBox);
      }
      setDecodedData(currentBarcodeData || fanNumber || '');
    }
  }, [isOpen, sourceImageUrl, initialCropBox, currentBarcodeData, fanNumber]);

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

    // If initial crop box was not provided or was outside bounds, default to canonical Fayda barcode area
    if (!initialCropBox || initialCropBox.width < 10) {
      setCropBox({
        x: Math.round(w * 0.28),
        y: Math.round(h * 0.65),
        width: Math.round(w * 0.42),
        height: Math.round(h * 0.07),
      });
    }
  };

  // Recompute live barcode preview whenever cropBox, filters, or threshold change
  const updateBarcodePreview = useCallback(async () => {
    if (!sourceCanvasRef.current && !activeSourceUrl) return;

    setIsProcessing(true);
    try {
      if (filterMode === 'vector') {
        const cleanDigits = (decodedData || fanNumber || '4195043670692582').replace(/[^0-9A-Za-z]/g, '');
        const vectorUrl = generateCode128DataUrl(cleanDigits, {
          width: 1400,
          height: 160,
          displayValue: false,
          margin: quietZone,
        });
        setLivePreviewUrl(vectorUrl);
        setStatusMessage('Mathematical Code 128 Vector Barcode generated from 16-digit FAN');
        setIsProcessing(false);
        return;
      }

      const canvas = sourceCanvasRef.current;
      if (!canvas) {
        setIsProcessing(false);
        return;
      }

      if (filterMode === 'original') {
        const res = await cropExactBarcode(canvas, cropBox, undefined, { quietZone });
        if (res.barcodeUrl) {
          setLivePreviewUrl(res.barcodeUrl);
          if (res.barcodeText) {
            setDecodedData(res.barcodeText);
            setStatusMessage(`Exact cut from slip: ${res.barcodeText}`);
          } else {
            setStatusMessage('Exact authentic cut directly from document slip (No regeneration)');
          }
        }
        setIsProcessing(false);
        return;
      }

      const options: BarcodeEnhanceOptions = {
        binarize: filterMode === 'binarized',
        columnRegularize: filterMode === 'binarized' ? columnRegularize : false,
        threshold: threshold,
        quietZone: quietZone,
        outWidth: 1400,
        outHeight: 160,
      };

      const res = await cropAndEnhanceBarcode(canvas, cropBox, undefined, options);
      if (res.barcodeUrl) {
        setLivePreviewUrl(res.barcodeUrl);
        if (res.barcodeText) {
          setDecodedData(res.barcodeText);
          setStatusMessage(`Decoded successfully: ${res.barcodeText}`);
        } else {
          setStatusMessage('Ultra-High Clarity 1400px Barcode generated & binarized');
        }
      }
    } catch (err) {
      console.warn('Live barcode update error:', err);
      setStatusMessage('Error updating preview');
    } finally {
      setIsProcessing(false);
    }
  }, [filterMode, columnRegularize, threshold, quietZone, cropBox, decodedData, fanNumber, activeSourceUrl]);

  useEffect(() => {
    if (imageLoaded) {
      const timer = setTimeout(updateBarcodePreview, 120);
      return () => clearTimeout(timer);
    }
  }, [imageLoaded, updateBarcodePreview]);

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
        height = Math.max(20, Math.min(imgNaturalSize.height - y, height + dy));
      }
      if (isResizing.includes('t')) {
        const potentialH = height - dy;
        if (potentialH >= 20 && y + dy >= 0) {
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
      height: Math.min(imgNaturalSize.height, Math.max(20, prev.height + dh)),
    }));
  };

  const handleApply = () => {
    if (!livePreviewUrl) return;
    const mode = filterMode === 'vector' ? 'vector' : 'extracted';
    onApplyCrop(livePreviewUrl, decodedData, mode);
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
      id="barcode-crop-modal"
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
            <div className="w-10 h-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-md">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                1D Barcode Quality Studio • የባርኮድ ጥራት ማስተካከያ
                <span className="text-[10px] font-mono font-bold bg-violet-100 text-violet-800 px-2 py-0.5 rounded-md">
                  1400px Super-Sampled
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Eliminate blur, paper gray haze, and jagged scanner lines with smart binarization and Code 128 vector rendering.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Document Viewport with Interactive Crop Box */}
          <div className="flex-1 bg-slate-900 p-4 flex flex-col min-h-[340px] md:min-h-0 relative overflow-hidden select-none">
            <div className="flex items-center justify-between text-xs text-slate-300 pb-2 z-10">
              <span className="flex items-center gap-1.5 font-medium">
                <CropIcon className="w-3.5 h-3.5 text-violet-400" />
                Drag box over the 1D Barcode strip on the slip
              </span>
              <div className="flex items-center gap-1 bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700 text-[11px] font-mono">
                <span>{cropBox.width} × {cropBox.height} px</span>
              </div>
            </div>

            {/* Document Canvas Container */}
            <div
              ref={containerRef}
              className="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden bg-slate-950/60 rounded-2xl border border-slate-800"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {activeSourceUrl ? (
                <div
                  className="relative inline-block transition-transform"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <img
                    ref={imgRef}
                    src={activeSourceUrl}
                    alt="Slip Scan"
                    className="max-h-[52vh] max-w-full object-contain pointer-events-none rounded shadow-md"
                    onLoad={handleImageLoad}
                    crossOrigin="anonymous"
                  />

                  {/* Crop Overlay */}
                  {imageLoaded && (
                    <div
                      className="absolute border-2 border-violet-400 bg-violet-500/20 shadow-[0_0_0_9999px_rgba(15,23,42,0.65)] cursor-move transition-shadow"
                      style={{
                        left: `${cropLeftPct}%`,
                        top: `${cropTopPct}%`,
                        width: `${cropWidthPct}%`,
                        height: `${cropHeightPct}%`,
                      }}
                      onPointerDown={(e) => handlePointerDown(e)}
                    >
                      {/* Grid Guide */}
                      <div className="w-full h-full flex flex-col justify-between p-0 pointer-events-none">
                        <div className="w-full h-1/2 border-b border-dashed border-violet-300/40" />
                        <div className="w-full h-1/2" />
                      </div>

                      {/* Resize Handles */}
                      <div
                        className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-violet-600 rounded-xs cursor-nwse-resize"
                        onPointerDown={(e) => handlePointerDown(e, 'tl')}
                      />
                      <div
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-violet-600 rounded-xs cursor-nesw-resize"
                        onPointerDown={(e) => handlePointerDown(e, 'tr')}
                      />
                      <div
                        className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-violet-600 rounded-xs cursor-nesw-resize"
                        onPointerDown={(e) => handlePointerDown(e, 'bl')}
                      />
                      <div
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-violet-600 rounded-xs cursor-nwse-resize"
                        onPointerDown={(e) => handlePointerDown(e, 'br')}
                      />
                      {/* Edge middle handles */}
                      <div
                        className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-5 bg-white border-2 border-violet-600 rounded-xs cursor-ew-resize"
                        onPointerDown={(e) => handlePointerDown(e, 'l')}
                      />
                      <div
                        className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-5 bg-white border-2 border-violet-600 rounded-xs cursor-ew-resize"
                        onPointerDown={(e) => handlePointerDown(e, 'r')}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400 text-xs flex flex-col items-center gap-2">
                  <Barcode className="w-8 h-8 opacity-40" />
                  <span>No slip scan loaded</span>
                </div>
              )}
            </div>

            {/* Viewport Control Bar */}
            <div className="pt-2 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] px-1.5">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Nudges */}
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-slate-400">Nudge:</span>
                <button
                  type="button"
                  onClick={() => nudge(0, -4)}
                  className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => nudge(0, 4)}
                  className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => nudge(-6, 0)}
                  className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => nudge(6, 0)}
                  className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* Right: Output Quality, Live Preview, and Enhancement Controls */}
          <div className="w-full md:w-96 bg-white p-5 border-l border-slate-200 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Quality Output Preview</span>
                  {isProcessing && (
                    <span className="text-[10px] text-violet-600 animate-pulse font-normal flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Processing...
                    </span>
                  )}
                </h4>

                {/* High-Resolution Live Preview Box */}
                <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 shadow-inner flex flex-col items-center justify-center min-h-[100px] relative">
                  {livePreviewUrl ? (
                    <div className="w-full bg-white p-2 rounded-xl shadow-xs flex items-center justify-center">
                      <img
                        src={livePreviewUrl}
                        alt="High Quality Barcode Preview"
                        className="w-full max-h-20 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs flex flex-col items-center gap-1.5 py-4">
                      <Barcode className="w-6 h-6" />
                      <span>Loading barcode...</span>
                    </div>
                  )}

                  {/* Status caption */}
                  <div className="mt-2 text-[10px] text-slate-400 text-center truncate w-full">
                    {statusMessage}
                  </div>
                </div>
              </div>

              {/* Decoded Digits Badge */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">16-Digit FAN / Barcode Number:</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Scannable
                  </span>
                </div>
                <div className="font-mono text-sm font-bold text-slate-900 tracking-wider bg-white p-2 rounded-xl border border-slate-200 text-center">
                  {decodedData || fanNumber || '4195 0436 7069 2582'}
                </div>
              </div>

              {/* Filter Mode Selector */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800">Clarity & Rendering Mode:</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterMode('original')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      filterMode === 'original'
                        ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-400/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                      <CropIcon className="w-3.5 h-3.5 text-violet-600" />
                      <span>Exact Cut</span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                      Authentic slip cut (No regeneration).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterMode('binarized')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      filterMode === 'binarized'
                        ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-400/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-violet-600" />
                      <span>Binarized</span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                      Laser-sharp black bars, pure white.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterMode('vector')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      filterMode === 'vector'
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Vector</span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                      Code 128 mathematical vector.
                    </p>
                  </button>
                </div>
              </div>

              {/* Fine-Tuning Controls for Extracted Binarized Mode */}
              {filterMode === 'binarized' && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      <span>Vertical Bar Regularization:</span>
                    </label>
                    <input
                      type="checkbox"
                      checked={columnRegularize}
                      onChange={(e) => setColumnRegularize(e.target.checked)}
                      className="w-4 h-4 text-violet-600 rounded cursor-pointer accent-violet-600"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Projects columns to eliminate dust, paper fiber grain, and horizontal scanner blur.
                  </p>

                  <div className="space-y-1 pt-1 border-t border-slate-200">
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>Binarization Threshold:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {threshold === 0 ? 'Auto (Otsu)' : threshold}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={250}
                      step={5}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-violet-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>Auto Detect</span>
                      <span>Darker Bars</span>
                      <span>Lighter Bars</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-200 flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!livePreviewUrl}
                className="flex-1 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Apply Crisp Barcode</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
