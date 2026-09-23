import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  RefreshCw,
  Move,
  Sun,
  Contrast,
  Sliders,
  Camera,
  Crop as CropIcon,
  HelpCircle,
  Crosshair,
  Scan,
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers
} from 'lucide-react';
import { BoundingBox, detectPhotoRegion, cropPhotoFromCanvas, getDefaultPhotoBox } from '../utils/photoDetection';
import { detectPortraitByColorThresholding } from '../utils/portraitThresholdDetector';

interface PhotoCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceImageUrl: string; // The full page canvas or uploaded image
  currentPhotoUrl?: string;
  applicantName?: string;
  onApplyCrop: (croppedPhotoUrl: string, cropBox?: BoundingBox) => void;
}

export const PhotoCropModal: React.FC<PhotoCropModalProps> = ({
  isOpen,
  onClose,
  sourceImageUrl,
  applicantName = 'Applicant',
  onApplyCrop,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrastVal, setContrastVal] = useState<number>(100);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [lockAspect, setLockAspect] = useState<boolean>(true); // 3:4 portrait
  const [edgeSmoothing, setEdgeSmoothing] = useState<'crisp' | 'smooth' | 'ultra'>('smooth');
  const [activeRightTab, setActiveRightTab] = useState<'preview' | 'loupe'>('preview');

  // Source image natural dimensions
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });

  // Crop box in natural image coordinates
  const [cropBox, setCropBox] = useState<BoundingBox>({ x: 50, y: 150, width: 200, height: 266 });

  // Dragging / Resizing interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; box: BoundingBox }>({
    mouseX: 0,
    mouseY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');

  // Reset when modal opens with new source image
  useEffect(() => {
    if (isOpen && sourceImageUrl) {
      setImageLoaded(false);
      setRotation(0);
      setZoom(1);
      setBrightness(100);
      setContrastVal(100);

      const img = new Image();
      img.onload = () => {
        setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);

        // Run color thresholding portrait detector automatically on load
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            try {
              const thresholdResult = detectPortraitByColorThresholding(canvas);
              setCropBox(thresholdResult.boundingBox);
              updateLivePreview(img, thresholdResult.boundingBox);
            } catch {
              const detected = detectPhotoRegion(canvas);
              setCropBox(detected);
              updateLivePreview(img, detected);
            }
          }
        } catch {
          const fallback = getDefaultPhotoBox(img.naturalWidth, img.naturalHeight);
          setCropBox(fallback);
          updateLivePreview(img, fallback);
        }
      };
      img.src = sourceImageUrl;
    }
  }, [isOpen, sourceImageUrl]);

  // Update live preview when crop box, rotation, or lighting changes
  const updateLivePreview = useCallback((
    imgElement: HTMLImageElement | null,
    box: BoundingBox,
    rot: number = rotation,
    bright: number = brightness,
    cont: number = contrastVal
  ) => {
    if (!imgElement || !imgElement.complete || box.width <= 0 || box.height <= 0) return;

    try {
      const targetW = 360;
      const targetH = 480;
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Apply brightness & contrast filters
      if (bright !== 100 || cont !== 100) {
        ctx.filter = `brightness(${bright}%) contrast(${cont}%)`;
      }

      // Handle rotated source if necessary
      if (rot !== 0) {
        // Create an intermediate canvas with rotation applied
        const rotCanvas = document.createElement('canvas');
        if (rot === 90 || rot === 270) {
          rotCanvas.width = imgElement.naturalHeight;
          rotCanvas.height = imgElement.naturalWidth;
        } else {
          rotCanvas.width = imgElement.naturalWidth;
          rotCanvas.height = imgElement.naturalHeight;
        }
        const rotCtx = rotCanvas.getContext('2d');
        if (rotCtx) {
          rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
          rotCtx.rotate((rot * Math.PI) / 180);
          rotCtx.drawImage(imgElement, -imgElement.naturalWidth / 2, -imgElement.naturalHeight / 2);

          ctx.drawImage(rotCanvas, box.x, box.y, box.width, box.height, 0, 0, targetW, targetH);
        }
      } else {
        ctx.drawImage(imgElement, box.x, box.y, box.width, box.height, 0, 0, targetW, targetH);
      }

      setLivePreviewUrl(canvas.toDataURL('image/png'));
    } catch (e) {
      console.warn('Live preview update failed:', e);
    }
  }, [rotation, brightness, contrastVal]);

  // Trigger live preview update whenever crop box or lighting changes
  useEffect(() => {
    if (imageLoaded && imageRef.current) {
      updateLivePreview(imageRef.current, cropBox, rotation, brightness, contrastVal);
    }
  }, [cropBox, rotation, brightness, contrastVal, imageLoaded, updateLivePreview]);

  // Smart Auto-Detect Button Handler (Color Thresholding & Portrait Silhouette)
  const handleAutoDetect = () => {
    if (!imageRef.current) return;
    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      try {
        const thresholdResult = detectPortraitByColorThresholding(canvas);
        setCropBox(thresholdResult.boundingBox);
        updateLivePreview(img, thresholdResult.boundingBox);
      } catch {
        const detected = detectPhotoRegion(canvas);
        setCropBox(detected);
        updateLivePreview(img, detected);
      }
    }
  };

  // Preset Handlers
  const handlePresetTopLeft = () => {
    const pW = Math.round(imgNaturalSize.width * 0.22);
    const pH = Math.round(pW * 1.33);
    setCropBox({
      x: Math.round(imgNaturalSize.width * 0.065),
      y: Math.round(imgNaturalSize.height * 0.135),
      width: pW,
      height: pH,
    });
  };

  const handlePresetTopRight = () => {
    const pW = Math.round(imgNaturalSize.width * 0.22);
    const pH = Math.round(pW * 1.33);
    setCropBox({
      x: Math.round(imgNaturalSize.width * 0.71),
      y: Math.round(imgNaturalSize.height * 0.135),
      width: pW,
      height: pH,
    });
  };

  const handlePresetCenterCard = () => {
    const pW = Math.round(imgNaturalSize.width * 0.24);
    const pH = Math.round(pW * 1.33);
    setCropBox({
      x: Math.round(imgNaturalSize.width * 0.10),
      y: Math.round(imgNaturalSize.height * 0.52),
      width: pW,
      height: pH,
    });
  };

  // Zoom into the cutter and center it in the viewport
  const handleFocusCutter = () => {
    setZoom(2.2);
    setTimeout(() => {
      if (containerRef.current && imageRef.current) {
        const container = containerRef.current;
        const img = imageRef.current;
        const scaleX = img.clientWidth / imgNaturalSize.width;
        const scaleY = img.clientHeight / imgNaturalSize.height;
        const boxCenterX = (cropBox.x + cropBox.width / 2) * scaleX;
        const boxCenterY = (cropBox.y + cropBox.height / 2) * scaleY;
        container.scrollTo({
          left: Math.max(0, boxCenterX - container.clientWidth / 2),
          top: Math.max(0, boxCenterY - container.clientHeight / 2),
          behavior: 'smooth',
        });
      }
    }, 120);
  };

  // Smooth micro-nudge movement (in pixels)
  const handleNudgeCropBox = (dx: number, dy: number) => {
    setCropBox((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(imgNaturalSize.width - prev.width, prev.x + dx)),
      y: Math.max(0, Math.min(imgNaturalSize.height - prev.height, prev.y + dy)),
    }));
  };

  // Smooth box size adjustment
  const handleResizeCropBox = (delta: number) => {
    setCropBox((prev) => {
      const newW = Math.max(40, Math.min(imgNaturalSize.width - prev.x, prev.width + delta));
      const newH = lockAspect ? Math.round((newW * 4) / 3) : Math.max(50, prev.height + delta);
      if (prev.y + newH > imgNaturalSize.height) return prev;
      return { ...prev, width: newW, height: newH };
    });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Handle Dragging & Resizing the Crop Frame
  const handleMouseDown = (e: React.MouseEvent, handle: string | null = null) => {
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

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !imageRef.current) return;

    const img = imageRef.current;
    const rect = img.getBoundingClientRect();

    // Scaling factor between display pixels and natural image pixels
    const scaleX = imgNaturalSize.width / rect.width;
    const scaleY = imgNaturalSize.height / rect.height;

    const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleX;
    const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleY;

    const initial = dragStartRef.current.box;

    if (activeHandle === null) {
      // Moving the entire box
      const newX = Math.max(0, Math.min(imgNaturalSize.width - initial.width, initial.x + deltaX));
      const newY = Math.max(0, Math.min(imgNaturalSize.height - initial.height, initial.y + deltaY));
      setCropBox({
        ...initial,
        x: Math.round(newX),
        y: Math.round(newY),
      });
    } else {
      // Resizing with handles
      let newW = initial.width;
      let newH = initial.height;
      let newX = initial.x;
      let newY = initial.y;

      if (activeHandle.includes('e')) {
        newW = Math.max(60, Math.min(imgNaturalSize.width - initial.x, initial.width + deltaX));
        if (lockAspect) newH = Math.round(newW * 1.33);
      }
      if (activeHandle.includes('s')) {
        newH = Math.max(80, Math.min(imgNaturalSize.height - initial.y, initial.height + deltaY));
        if (lockAspect) newW = Math.round(newH / 1.33);
      }
      if (activeHandle.includes('w')) {
        const potentialW = initial.width - deltaX;
        if (potentialW > 60 && initial.x + deltaX >= 0) {
          newW = potentialW;
          newX = initial.x + deltaX;
          if (lockAspect) newH = Math.round(newW * 1.33);
        }
      }
      if (activeHandle.includes('n')) {
        const potentialH = initial.height - deltaY;
        if (potentialH > 80 && initial.y + deltaY >= 0) {
          newH = potentialH;
          newY = initial.y + deltaY;
          if (lockAspect) newW = Math.round(newH / 1.33);
        }
      }

      setCropBox({
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
    }
  }, [isDragging, activeHandle, imgNaturalSize, lockAspect]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setActiveHandle(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Apply final high-resolution crop
  const handleApply = () => {
    if (!imageRef.current) return;
    const img = imageRef.current;

    const targetWidth = 480;
    const targetHeight = 640;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (brightness !== 100 || contrastVal !== 100) {
      ctx.filter = `brightness(${brightness}%) contrast(${contrastVal}%)`;
    }

    if (rotation !== 0) {
      const rotCanvas = document.createElement('canvas');
      if (rotation === 90 || rotation === 270) {
        rotCanvas.width = img.naturalHeight;
        rotCanvas.height = img.naturalWidth;
      } else {
        rotCanvas.width = img.naturalWidth;
        rotCanvas.height = img.naturalHeight;
      }
      const rotCtx = rotCanvas.getContext('2d');
      if (rotCtx) {
        rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rotCtx.rotate((rotation * Math.PI) / 180);
        rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        ctx.drawImage(rotCanvas, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, targetWidth, targetHeight);
      }
    } else {
      ctx.drawImage(img, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, targetWidth, targetHeight);
    }

    const finalPhotoUrl = canvas.toDataURL('image/png');
    onApplyCrop(finalPhotoUrl, cropBox);
    onClose();
  };

  if (!isOpen) return null;

  // Calculate crop box position in percentage of the image container
  const boxPercent = {
    left: `${(cropBox.x / imgNaturalSize.width) * 100}%`,
    top: `${(cropBox.y / imgNaturalSize.height) * 100}%`,
    width: `${(cropBox.width / imgNaturalSize.width) * 100}%`,
    height: `${(cropBox.height / imgNaturalSize.height) * 100}%`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <CropIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white leading-tight">
                  Photo Cropper & Enhancer <span className="text-emerald-400 font-normal">/ የቁም ፎቶ ማስተካከያና መቁረጫ</span>
                </h3>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  3:4 Passport Ratio
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Precision biometric portrait crop for CR80 PVC • ለኢትዮጵያ ፋይዳ መታወቂያ ካርድ ጥራት ያለው ፎቶ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg hover:shadow-emerald-600/30 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply Photo / ቁረጥና አስገባ</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-950/60 border-b border-slate-800 text-xs">
          {/* Quick Presets & AI Detection */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAutoDetect}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/60 hover:bg-emerald-600 text-emerald-100 border border-emerald-500/40 rounded-xl font-bold transition-all shadow-xs cursor-pointer"
              title="Auto-Detect Face & Box / ፊትን በራስ-ሰር ለይ"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Auto-Detect / ፊትን ለይ</span>
            </button>

            <span className="text-slate-600">|</span>

            <span className="text-slate-400 font-medium text-[11px]">Presets / ቦታ:</span>
            <button
              type="button"
              onClick={handlePresetTopLeft}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              title="Top Left / የላይኛው ግራ"
            >
              Top-Left / ግራ
            </button>
            <button
              type="button"
              onClick={handlePresetTopRight}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              title="Top Right / የላይኛው ቀኝ"
            >
              Top-Right / ቀኝ
            </button>
            <button
              type="button"
              onClick={handlePresetCenterCard}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              title="Center Card / መሃል"
            >
              Center / መሃል
            </button>

            <button
              type="button"
              onClick={handleRotate}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              title="Rotate document 90 degrees clockwise / በ90° አሽከርክር"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate 90°</span>
            </button>
          </div>

          {/* View & Cutter Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Focus on Cutter Button */}
            <button
              type="button"
              onClick={handleFocusCutter}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60 rounded-xl font-bold transition-all cursor-pointer shadow-xs"
              title="Zoom in and center view directly onto the cutter / በመቁረጫው ላይ አተኩር"
            >
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span>Focus on Cutter / በመቁረጫው ላይ አተኩር</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                title="Zoom Out / አርቅ"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1 font-bold min-w-[36px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3.5, z + 0.25))}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                title="Zoom In / አቅርብ"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-1.5 py-0.5 hover:bg-slate-700 text-slate-300 rounded cursor-pointer text-[10px] font-bold"
                title="Fit Document / ሙሉ ሰነድ"
              >
                Fit / ሙሉ
              </button>
            </div>

            {/* Guides Toggle */}
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-500 rounded"
              />
              <span className="text-[11px]">Guides / መስመሮች</span>
            </label>

            {/* Aspect Lock */}
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lockAspect}
                onChange={(e) => setLockAspect(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-500 rounded"
              />
              <span className="text-[11px]">Lock 3:4 / 3:4 ቆልፍ</span>
            </label>
          </div>
        </div>

        {/* Main Body: Interactive Canvas + Live Portrait Preview */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[420px]">
          {/* Left / Center: Interactive Crop Canvas Area */}
          <div
            ref={containerRef}
            className="lg:col-span-8 bg-slate-950 p-6 flex items-center justify-center overflow-auto relative select-none"
            style={{ maxHeight: 'calc(95vh - 200px)' }}
          >
            <div
              className="relative transition-transform duration-100 ease-out inline-block"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
            >
              {/* Document Image Source */}
              <img
                ref={imageRef}
                src={sourceImageUrl}
                alt="Fayda Slip Document"
                className="max-w-[750px] max-h-[580px] w-auto h-auto rounded-lg shadow-2xl pointer-events-none block border border-slate-800"
                style={{
                  filter: `brightness(${brightness}%) contrast(${contrastVal}%)`,
                }}
              />

              {/* Shading / Dimming Overlay around the Crop Frame */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                <div
                  className="absolute border border-emerald-400/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]"
                  style={{
                    left: boxPercent.left,
                    top: boxPercent.top,
                    width: boxPercent.width,
                    height: boxPercent.height,
                  }}
                />
              </div>

              {/* Interactive Crop Box Overlay */}
              <div
                className="absolute cursor-move border-2 border-emerald-400 bg-transparent"
                style={{
                  left: boxPercent.left,
                  top: boxPercent.top,
                  width: boxPercent.width,
                  height: boxPercent.height,
                }}
                onMouseDown={(e) => handleMouseDown(e, null)}
              >
                {/* Rule of Thirds Grid */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between opacity-30">
                  <div className="w-full h-px bg-white border-b border-dashed border-white mt-[33.3%]" />
                  <div className="w-full h-px bg-white border-b border-dashed border-white mb-[33.3%]" />
                </div>
                <div className="absolute inset-0 pointer-events-none flex justify-between opacity-30">
                  <div className="h-full w-px bg-white border-r border-dashed border-white ml-[33.3%]" />
                  <div className="h-full w-px bg-white border-r border-dashed border-white mr-[33.3%]" />
                </div>

                {/* Face & Head Alignment Ellipse (Helps align chin, eyes, forehead) */}
                {showGuides && (
                  <div className="absolute inset-x-[15%] top-[12%] bottom-[25%] rounded-full border border-dashed border-amber-300/60 pointer-events-none flex items-center justify-center">
                    <span className="text-[9px] text-amber-200/70 font-semibold bg-slate-900/60 px-1 rounded -mt-2">
                      Head Area
                    </span>
                  </div>
                )}

                {/* Center Drag Handle Icon */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/80 text-white flex items-center justify-center shadow-md">
                    <Move className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Resize Handles (8 Points) */}
                {/* Top-Left */}
                <div
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-emerald-400 rounded-full cursor-nwse-resize border-2 border-slate-900 shadow-sm"
                  onMouseDown={(e) => handleMouseDown(e, 'nw')}
                />
                {/* Top-Right */}
                <div
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-400 rounded-full cursor-nesw-resize border-2 border-slate-900 shadow-sm"
                  onMouseDown={(e) => handleMouseDown(e, 'ne')}
                />
                {/* Bottom-Left */}
                <div
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-emerald-400 rounded-full cursor-nesw-resize border-2 border-slate-900 shadow-sm"
                  onMouseDown={(e) => handleMouseDown(e, 'sw')}
                />
                {/* Bottom-Right */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-400 rounded-full cursor-nwse-resize border-2 border-slate-900 shadow-sm"
                  onMouseDown={(e) => handleMouseDown(e, 'se')}
                />

                {/* Edge Handles */}
                <div
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-5 bg-emerald-400 rounded-sm cursor-ew-resize border border-slate-900"
                  onMouseDown={(e) => handleMouseDown(e, 'w')}
                />
                <div
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-5 bg-emerald-400 rounded-sm cursor-ew-resize border border-slate-900"
                  onMouseDown={(e) => handleMouseDown(e, 'e')}
                />
                <div
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-3 bg-emerald-400 rounded-sm cursor-ns-resize border border-slate-900"
                  onMouseDown={(e) => handleMouseDown(e, 'n')}
                />
                <div
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-3 bg-emerald-400 rounded-sm cursor-ns-resize border border-slate-900"
                  onMouseDown={(e) => handleMouseDown(e, 's')}
                />
              </div>
            </div>
          </div>

          {/* Right Sidebar: Real-Time Card Preview & Photo Enhancement */}
          <div className="lg:col-span-4 bg-slate-900 border-l border-slate-800 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              {/* Inspection Mode Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('preview')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeRightTab === 'preview'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview / የቀጥታ እይታ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab('loupe')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeRightTab === 'loupe'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Cutter Loupe (2.5×) / ማጉያ</span>
                </button>
              </div>

              {activeRightTab === 'preview' ? (
                /* ID Card Portrait Mockup Box */
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-3">
                  <div className="w-36 h-48 mx-auto rounded-xl overflow-hidden border-2 border-emerald-500/80 shadow-xl bg-slate-900 relative group">
                    {livePreviewUrl ? (
                      <img
                        src={livePreviewUrl}
                        alt="Cropped Portrait"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                        <Camera className="w-8 h-8 mb-1" />
                        <span className="text-[10px]">Positioning...</span>
                      </div>
                    )}

                    {/* Corner Watermark preview */}
                    <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-[8px] font-mono text-emerald-400 border border-emerald-500/30">
                      3:4 CR80 PVC
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-200 truncate">
                      {applicantName}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Cutter: {cropBox.width} × {cropBox.height} px (Ratio 3:4)
                    </p>
                  </div>
                </div>
              ) : (
                /* High-Magnification Cutter Blade Loupe (2.5x Zoom) */
                <div className="bg-slate-950 p-4 rounded-2xl border border-cyan-800/40 text-center space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-cyan-300 font-bold px-1">
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Cutter Blade & Cutting Edge</span>
                    </span>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-800">
                      2.5× Loupe
                    </span>
                  </div>

                  {/* Magnified Loupe Viewport */}
                  <div className="w-48 h-56 mx-auto rounded-xl overflow-hidden border-2 border-cyan-400 shadow-2xl bg-slate-900 relative">
                    {livePreviewUrl ? (
                      <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                        <img
                          src={livePreviewUrl}
                          alt="Cutter Loupe Magnification"
                          className="w-full h-full object-cover transform scale-150"
                        />
                        {/* Crosshair guidelines */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="w-full h-px bg-cyan-400/40" />
                          <div className="h-full w-px bg-cyan-400/40 absolute" />
                          <div className="w-10 h-10 rounded-full border border-cyan-400/60 absolute" />
                        </div>
                        {/* Blade Edge Guides */}
                        <div className="absolute inset-2 border-2 border-dashed border-emerald-400/80 rounded pointer-events-none" />
                        <span className="absolute top-1 left-2 text-[8px] bg-black/80 text-emerald-300 px-1 rounded font-mono">
                          ▲ Top Hair Margin
                        </span>
                        <span className="absolute bottom-1 right-2 text-[8px] bg-black/80 text-cyan-300 px-1 rounded font-mono">
                          ▼ Chin/Collar
                        </span>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                        <Scan className="w-8 h-8 mb-1" />
                        <span className="text-[10px]">Aligning Cutter...</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Inspect the cutting boundary in close-up. What is inside the dashed box will be cut cleanly into the ID template.
                  </p>
                </div>
              )}

              {/* Edge Smoothing Options */}
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Edge Smoothness / የጠርዝ ማለስለሻ</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEdgeSmoothing('crisp')}
                    className={`py-1 px-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer text-center ${
                      edgeSmoothing === 'crisp'
                        ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Crisp (0px)<br/><span className="text-[9px] font-normal">ጥርት ያለ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdgeSmoothing('smooth')}
                    className={`py-1 px-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer text-center ${
                      edgeSmoothing === 'smooth'
                        ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Smooth (1.5px)<br/><span className="text-[9px] font-normal">ለስላሳ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEdgeSmoothing('ultra')}
                    className={`py-1 px-1.5 rounded-xl text-[10px] font-bold border transition-all cursor-pointer text-center ${
                      edgeSmoothing === 'ultra'
                        ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Soft (2.5px)<br/><span className="text-[9px] font-normal">እጅግ የለሰለሰ</span>
                  </button>
                </div>
              </div>

              {/* Precision Micro-Nudge & Size Adjustment */}
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Micro-Nudge Cutter / ረቂቅ ማስተካከያ</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">1px step</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {/* Directional pad */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleNudgeCropBox(-2, 0)}
                      className="p-1 hover:bg-slate-800 text-slate-300 rounded cursor-pointer"
                      title="Nudge Left / ወደ ግራ"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleNudgeCropBox(0, -2)}
                        className="p-1 hover:bg-slate-800 text-slate-300 rounded cursor-pointer"
                        title="Nudge Up / ወደ ላይ"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNudgeCropBox(0, 2)}
                        className="p-1 hover:bg-slate-800 text-slate-300 rounded cursor-pointer"
                        title="Nudge Down / ወደ ታች"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNudgeCropBox(2, 0)}
                      className="p-1 hover:bg-slate-800 text-slate-300 rounded cursor-pointer"
                      title="Nudge Right / ወደ ቀኝ"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Size scale buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleResizeCropBox(-4)}
                      className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold border border-slate-700 cursor-pointer"
                      title="Shrink Cutter / ሳጥኑን አሳንስ"
                    >
                      - Size
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeCropBox(4)}
                      className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold border border-slate-700 cursor-pointer"
                      title="Expand Cutter / ሳጥኑን አተልቅ"
                    >
                      + Size
                    </button>
                  </div>
                </div>
              </div>

              {/* Lighting & Contrast Sliders */}
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 space-y-2.5">
                <h5 className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Scan Lighting / ብርሃንና ንፅፅር</span>
                  </span>
                  {(brightness !== 100 || contrastVal !== 100) && (
                    <button
                      type="button"
                      onClick={() => {
                        setBrightness(100);
                        setContrastVal(100);
                      }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
                    >
                      Reset / መልስ
                    </button>
                  )}
                </h5>

                {/* Brightness */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Brightness / ብሩህነት</span>
                    <span className="font-mono">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="150"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Contrast / ንፅፅር</span>
                    <span className="font-mono">{contrastVal}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="150"
                    value={contrastVal}
                    onChange={(e) => setContrastVal(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>

              {/* Useful Tips */}
              <div className="text-[11px] text-slate-400 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 space-y-1">
                <p className="font-bold text-slate-300 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 text-emerald-400" />
                  <span>Positioning Tips / ጠቃሚ መመሪያዎች:</span>
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-[10px] leading-relaxed text-slate-400">
                  <li>Ensure head and top hair are fully inside • ፀጉርና ግንባር በሙሉ በመቁረጫው ውስጥ ይሁን</li>
                  <li>Align eyes on the upper horizontal line • ዓይኖች የላይኛው መስመር ላይ ያርፉ</li>
                  <li>Keep chin and shoulders visible • አገጭና ትከሻ በግልጽ ይታይ</li>
                </ul>
              </div>
            </div>

            {/* Bottom Actions in Sidebar */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={handleApply}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save & Apply Cropped Photo / ቁረጥና ወደ ካርዱ አስገባ</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center"
              >
                Cancel / ሰርዝ
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
