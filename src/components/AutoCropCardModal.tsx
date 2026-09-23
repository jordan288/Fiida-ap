import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  Crop as CropIcon,
  Sparkles,
  RefreshCw,
  Maximize2,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  Info,
  Layers,
  ShieldCheck,
  Square,
  ArrowRight
} from 'lucide-react';
import {
  CardBoundingBox,
  CardBoundsDetectionResult,
  detectCardBoundsOnCanvas,
  cropCardFromSource
} from '../utils/cardBoundsDetector';

interface AutoCropCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceImageUrl: string;
  onApplyCrop: (croppedDataUrl: string, bounds: CardBoundingBox) => void;
}

export const AutoCropCardModal: React.FC<AutoCropCardModalProps> = ({
  isOpen,
  onClose,
  sourceImageUrl,
  onApplyCrop,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Natural dimensions of the source image
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 1000, height: 1400 });

  // Current crop box in natural image coordinates
  const [cropBox, setCropBox] = useState<CardBoundingBox>({ x: 50, y: 100, width: 900, height: 567 });

  // Detection result metadata
  const [detectionResult, setDetectionResult] = useState<CardBoundsDetectionResult | null>(null);

  // Settings & adjustments
  const [colorThreshold, setColorThreshold] = useState<number>(24);
  const [paddingPx, setPaddingPx] = useState<number>(4);
  const [aspectMode, setAspectMode] = useState<'cr80' | 'portrait' | 'free'>('cr80');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Live cropped preview
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');

  // Mouse interaction state for dragging / resizing crop box
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; box: CardBoundingBox }>({
    mouseX: 0,
    mouseY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Update live preview of cropped area
  const updateCropPreview = useCallback(async (sourceUrl: string, box: CardBoundingBox) => {
    try {
      const res = await cropCardFromSource(sourceUrl, box);
      setPreviewDataUrl(res.dataUrl);
    } catch (err) {
      console.warn('Card preview crop error:', err);
    }
  }, []);

  // Run color detection to find card bounds
  const runDetection = useCallback(async (
    imgElement: HTMLImageElement,
    thresh: number,
    pad: number,
    mode: 'cr80' | 'portrait' | 'free'
  ) => {
    setIsDetecting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgElement.naturalWidth;
      canvas.height = imgElement.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(imgElement, 0, 0);
      const result = detectCardBoundsOnCanvas(canvas, {
        colorThreshold: thresh,
        paddingPx: pad,
        aspectRatioMode: mode,
      });

      setDetectionResult(result);
      setCropBox(result.boundingBox);
      updateCropPreview(imgElement.src, result.boundingBox);
    } catch (e) {
      console.warn('Auto-detect card bounds error:', e);
    } finally {
      setIsDetecting(false);
    }
  }, [updateCropPreview]);

  // Initialize when modal opens
  useEffect(() => {
    if (isOpen && sourceImageUrl) {
      setImageLoaded(false);
      setZoomLevel(1);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);
        runDetection(img, colorThreshold, paddingPx, aspectMode);
      };
      img.src = sourceImageUrl;
    }
  }, [isOpen, sourceImageUrl, runDetection, colorThreshold, paddingPx, aspectMode]);

  // Handle re-detect button click
  const handleReDetect = () => {
    if (imageRef.current && imageLoaded) {
      runDetection(imageRef.current, colorThreshold, paddingPx, aspectMode);
    }
  };

  // Convert natural coordinates to viewport percentage
  const boxLeftPct = naturalSize.width ? (cropBox.x / naturalSize.width) * 100 : 0;
  const boxTopPct = naturalSize.height ? (cropBox.y / naturalSize.height) * 100 : 0;
  const boxWidthPct = naturalSize.width ? (cropBox.width / naturalSize.width) * 100 : 0;
  const boxHeightPct = naturalSize.height ? (cropBox.height / naturalSize.height) * 100 : 0;

  // Handle drag / resize pointer events
  const handlePointerDown = (e: React.PointerEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setActiveHandle(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      box: { ...cropBox },
    };
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !containerRef.current || naturalSize.width === 0) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const scaleX = naturalSize.width / containerRect.width;
      const scaleY = naturalSize.height / containerRect.height;

      const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleX;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleY;
      const startBox = dragStartRef.current.box;

      const newBox = { ...startBox };
      const CR80_RATIO = 1.58577;

      if (activeHandle === 'move') {
        newBox.x = Math.max(0, Math.min(naturalSize.width - newBox.width, startBox.x + deltaX));
        newBox.y = Math.max(0, Math.min(naturalSize.height - newBox.height, startBox.y + deltaY));
      } else if (activeHandle === 'se') {
        newBox.width = Math.max(80, Math.min(naturalSize.width - startBox.x, startBox.width + deltaX));
        if (aspectMode === 'cr80') {
          newBox.height = Math.round(newBox.width / CR80_RATIO);
        } else if (aspectMode === 'portrait') {
          newBox.height = Math.round(newBox.width * CR80_RATIO);
        } else {
          newBox.height = Math.max(60, Math.min(naturalSize.height - startBox.y, startBox.height + deltaY));
        }
      } else if (activeHandle === 'sw') {
        const potentialW = Math.max(80, startBox.width - deltaX);
        const maxW = startBox.x + startBox.width;
        newBox.width = Math.min(maxW, potentialW);
        newBox.x = startBox.x + (startBox.width - newBox.width);
        if (aspectMode === 'cr80') {
          newBox.height = Math.round(newBox.width / CR80_RATIO);
        } else if (aspectMode === 'portrait') {
          newBox.height = Math.round(newBox.width * CR80_RATIO);
        } else {
          newBox.height = Math.max(60, Math.min(naturalSize.height - startBox.y, startBox.height + deltaY));
        }
      } else if (activeHandle === 'ne') {
        newBox.width = Math.max(80, Math.min(naturalSize.width - startBox.x, startBox.width + deltaX));
        if (aspectMode === 'cr80') {
          newBox.height = Math.round(newBox.width / CR80_RATIO);
          newBox.y = Math.max(0, startBox.y + startBox.height - newBox.height);
        } else if (aspectMode === 'portrait') {
          newBox.height = Math.round(newBox.width * CR80_RATIO);
          newBox.y = Math.max(0, startBox.y + startBox.height - newBox.height);
        } else {
          const potentialH = Math.max(60, startBox.height - deltaY);
          newBox.height = Math.min(startBox.y + startBox.height, potentialH);
          newBox.y = startBox.y + (startBox.height - newBox.height);
        }
      } else if (activeHandle === 'nw') {
        const potentialW = Math.max(80, startBox.width - deltaX);
        newBox.width = Math.min(startBox.x + startBox.width, potentialW);
        newBox.x = startBox.x + (startBox.width - newBox.width);
        if (aspectMode === 'cr80') {
          newBox.height = Math.round(newBox.width / CR80_RATIO);
          newBox.y = Math.max(0, startBox.y + startBox.height - newBox.height);
        } else if (aspectMode === 'portrait') {
          newBox.height = Math.round(newBox.width * CR80_RATIO);
          newBox.y = Math.max(0, startBox.y + startBox.height - newBox.height);
        } else {
          const potentialH = Math.max(60, startBox.height - deltaY);
          newBox.height = Math.min(startBox.y + startBox.height, potentialH);
          newBox.y = startBox.y + (startBox.height - newBox.height);
        }
      }

      setCropBox(newBox);
    };

    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setActiveHandle(null);
        if (imageRef.current) {
          updateCropPreview(imageRef.current.src, cropBox);
        }
      }
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, activeHandle, naturalSize, aspectMode, cropBox, updateCropPreview]);

  // Apply crop handler
  const handleConfirmCrop = async () => {
    setIsApplying(true);
    try {
      const cropped = await cropCardFromSource(sourceImageUrl, cropBox);
      onApplyCrop(cropped.dataUrl, cropBox);
      onClose();
    } catch (err) {
      console.error('Failed to crop card:', err);
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <CropIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Auto-Crop ID Card Bounds
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  Basic Color Detection
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Locates the ID card perimeter by modeling paper background luminance and chromatic variance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Left Viewport & Right Controls */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
          
          {/* Main Viewport: Scanned PDF Page with Interactive Crop Reticle */}
          <div className="lg:col-span-8 bg-slate-950 p-4 flex flex-col relative overflow-hidden select-none border-b lg:border-b-0 lg:border-r border-slate-800">
            {/* Top Viewport Toolbar */}
            <div className="flex items-center justify-between mb-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono text-[11px]">
                  Scanned Page: <span className="text-slate-200 font-bold">{naturalSize.width} × {naturalSize.height}px</span>
                </span>
                {detectionResult && (
                  <span className="bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    ✓ {detectionResult.confidence}% Confidence
                  </span>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.15))}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono px-1.5 text-slate-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(1.8, prev + 0.15))}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white ml-0.5"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Canvas/Image Area with Overlaid Draggable Crop Reticle */}
            <div className="flex-1 flex items-center justify-center overflow-auto p-2 bg-slate-900/50 rounded-2xl border border-slate-800/80 relative">
              <div
                ref={containerRef}
                className="relative inline-block shadow-2xl transition-transform duration-75 origin-center"
                style={{
                  transform: `scale(${zoomLevel})`,
                  maxHeight: '100%',
                  maxWidth: '100%',
                }}
              >
                <img
                  ref={imageRef}
                  src={sourceImageUrl}
                  alt="Scanned PDF Page"
                  className="block max-h-[56vh] object-contain rounded-lg border border-slate-800 pointer-events-none"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                    setImageLoaded(true);
                  }}
                />

                {/* Shading overlay outside the crop box */}
                {imageLoaded && (
                  <>
                    {/* Top Mask */}
                    <div
                      className="absolute bg-slate-950/65 pointer-events-none"
                      style={{ top: 0, left: 0, right: 0, height: `${boxTopPct}%` }}
                    />
                    {/* Bottom Mask */}
                    <div
                      className="absolute bg-slate-950/65 pointer-events-none"
                      style={{ top: `${boxTopPct + boxHeightPct}%`, left: 0, right: 0, bottom: 0 }}
                    />
                    {/* Left Mask */}
                    <div
                      className="absolute bg-slate-950/65 pointer-events-none"
                      style={{
                        top: `${boxTopPct}%`,
                        left: 0,
                        width: `${boxLeftPct}%`,
                        height: `${boxHeightPct}%`,
                      }}
                    />
                    {/* Right Mask */}
                    <div
                      className="absolute bg-slate-950/65 pointer-events-none"
                      style={{
                        top: `${boxTopPct}%`,
                        left: `${boxLeftPct + boxWidthPct}%`,
                        right: 0,
                        height: `${boxHeightPct}%`,
                      }}
                    />

                    {/* Interactive ID Card Crop Bounding Box */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'move')}
                      className="absolute cursor-move border-2 border-emerald-400 rounded-sm shadow-[0_0_20px_rgba(16,185,129,0.45)] group/box"
                      style={{
                        top: `${boxTopPct}%`,
                        left: `${boxLeftPct}%`,
                        width: `${boxWidthPct}%`,
                        height: `${boxHeightPct}%`,
                      }}
                    >
                      {/* Corner Target L-Brackets */}
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-emerald-300 pointer-events-none" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-emerald-300 pointer-events-none" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-emerald-300 pointer-events-none" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-emerald-300 pointer-events-none" />

                      {/* Rule of Thirds Grid Lines */}
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-25">
                        <div className="border-r border-b border-emerald-300" />
                        <div className="border-r border-b border-emerald-300" />
                        <div className="border-b border-emerald-300" />
                        <div className="border-r border-b border-emerald-300" />
                        <div className="border-r border-b border-emerald-300" />
                        <div className="border-b border-emerald-300" />
                        <div className="border-r border-emerald-300" />
                        <div className="border-r border-emerald-300" />
                        <div />
                      </div>

                      {/* Center Crosshair */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <div className="w-8 h-px bg-emerald-300" />
                        <div className="h-8 w-px bg-emerald-300 absolute" />
                      </div>

                      {/* Corner Resize Handles */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'nw')}
                        className="absolute -top-2 -left-2 w-4 h-4 bg-emerald-400 border border-white rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'ne')}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-400 border border-white rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'sw')}
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-emerald-400 border border-white rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'se')}
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-emerald-400 border border-white rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                      />

                      {/* Dimension Badge Floating at Top-Left */}
                      <div className="absolute -top-7 left-0 bg-emerald-600/90 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow pointer-events-none flex items-center gap-1 backdrop-blur-xs">
                        <ShieldCheck className="w-3 h-3" />
                        <span>ID Card Bounds: {Math.round(cropBox.width)} × {Math.round(cropBox.height)}px</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bottom Status bar */}
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Drag inside the box to reposition • Drag corners to adjust</span>
              <span className="font-mono text-emerald-400">
                Crop: {Math.round(cropBox.width)} × {Math.round(cropBox.height)} px ({ (cropBox.width / cropBox.height).toFixed(2) }:1)
              </span>
            </div>
          </div>

          {/* Right Column: Settings, Color Detection Stats & Live Preview */}
          <div className="lg:col-span-4 bg-slate-900 p-5 flex flex-col justify-between overflow-y-auto space-y-4">
            
            <div className="space-y-4">
              
              {/* Aspect Ratio Preset Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>Card Aspect Ratio Preset</span>
                  <span className="text-[10px] text-emerald-400 font-mono">CR80 (85.6 × 54mm)</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setAspectMode('cr80');
                      const CR80 = 1.58577;
                      const newH = Math.round(cropBox.width / CR80);
                      const adjBox = { ...cropBox, height: newH };
                      setCropBox(adjBox);
                      if (imageRef.current) updateCropPreview(imageRef.current.src, adjBox);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      aspectMode === 'cr80'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    CR80 (1.59:1)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAspectMode('portrait');
                      const CR80 = 1.58577;
                      const newH = Math.round(cropBox.width * CR80);
                      const adjBox = { ...cropBox, height: newH };
                      setCropBox(adjBox);
                      if (imageRef.current) updateCropPreview(imageRef.current.src, adjBox);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      aspectMode === 'portrait'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Portrait (1:1.59)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectMode('free')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                      aspectMode === 'free'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Freeform
                  </button>
                </div>
              </div>

              {/* Basic Color Detection Sensitivity Controls */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/90 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/70 pb-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Color Detection Settings</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleReDetect}
                    disabled={isDetecting}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                    <span>Re-Detect</span>
                  </button>
                </div>

                {/* Color Distance Threshold Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Color Distance Threshold (ΔE):</span>
                    <span className="font-mono text-emerald-400 font-bold">{colorThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="2"
                    value={colorThreshold}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setColorThreshold(val);
                      if (imageRef.current) {
                        runDetection(imageRef.current, val, paddingPx, aspectMode);
                      }
                    }}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>10 (Sensitive)</span>
                    <span>24 (Standard)</span>
                    <span>60 (Strict)</span>
                  </div>
                </div>

                {/* Margin Padding Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Edge Padding:</span>
                    <span className="font-mono text-emerald-400 font-bold">{paddingPx} px</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="40"
                    step="2"
                    value={paddingPx}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPaddingPx(val);
                      if (imageRef.current) {
                        runDetection(imageRef.current, colorThreshold, val, aspectMode);
                      }
                    }}
                    className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Tight (-10)</span>
                    <span>Exact (0)</span>
                    <span>Generous (+40)</span>
                  </div>
                </div>

                {/* Sampled Background Color Swatch */}
                {detectionResult && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Sampled Paper Background:</span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-3.5 h-3.5 rounded border border-white/20 shadow-xs"
                        style={{
                          backgroundColor: `rgb(${detectionResult.paperColor.r}, ${detectionResult.paperColor.g}, ${detectionResult.paperColor.b})`,
                        }}
                      />
                      <span className="font-mono text-slate-300 text-[10px]">
                        {detectionResult.paperColor.isDarkBackground ? 'Dark Scanner Bed' : 'Paper White'} ({detectionResult.paperColor.r},{detectionResult.paperColor.g},{detectionResult.paperColor.b})
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Cropped Output Live Card Preview */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>Cropped Card Live Output</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Lossless Preview</span>
                </label>
                <div className="bg-slate-950 p-2 rounded-2xl border border-slate-800/90 flex flex-col items-center justify-center min-h-[140px] relative overflow-hidden">
                  {previewDataUrl ? (
                    <div className="relative group w-full flex items-center justify-center">
                      <img
                        src={previewDataUrl}
                        alt="Cropped Card Result"
                        className="max-h-36 max-w-full object-contain rounded-lg border border-emerald-500/40 shadow-lg bg-white"
                      />
                      <div className="absolute bottom-1 right-1 bg-slate-950/85 text-emerald-400 text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-800 pointer-events-none">
                        {Math.round(cropBox.width)} × {Math.round(cropBox.height)} px
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating card preview...</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleConfirmCrop}
                disabled={isApplying || !previewDataUrl}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {isApplying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Auto-Cropping ID Card...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Apply Auto-Crop (Crop to Card)</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-80" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
