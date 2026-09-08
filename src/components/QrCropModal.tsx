import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Check,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Sparkles,
  RefreshCw,
  Move,
  Upload,
  Crop as CropIcon,
  ShieldCheck,
  Layers,
  SlidersHorizontal,
  Info,
  Crosshair,
  Scan,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Maximize2
} from 'lucide-react';
import jsQR from 'jsqr';
import { cropExactQrCode, getDefaultFaydaQrBox, detectAndCenterQrRegion } from '../utils/qrPrecisionCropper';

interface QrCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceImageUrl: string;
  currentQrUrl?: string;
  currentQrData?: string;
  initialCropBox?: { x: number; y: number; width: number; height: number };
  onApplyCrop: (croppedQrUrl: string, decodedPayload?: string) => void;
}

export const QrCropModal: React.FC<QrCropModalProps> = ({
  isOpen,
  onClose,
  sourceImageUrl,
  currentQrUrl,
  currentQrData,
  initialCropBox,
  onApplyCrop,
}) => {
  const [activeSourceUrl, setActiveSourceUrl] = useState<string>(sourceImageUrl);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [filterMode, setFilterMode] = useState<'original' | 'enhanced' | 'crispBw'>('enhanced');
  const [quietZonePercent, setQuietZonePercent] = useState<number>(4); // 0%, 3%, 4%, 6%
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [detectStatusMessage, setDetectStatusMessage] = useState<string>('');
  const [activeRightTab, setActiveRightTab] = useState<'output' | 'loupe'>('output');

  // Source natural dimensions
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });

  // Crop box in natural image coordinates (strictly square 1:1)
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 400,
    y: 200,
    width: 300,
    height: 300,
  });

  // Dragging / Resizing interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    box: { x: number; y: number; width: number; height: number };
  }>({
    mouseX: 0,
    mouseY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');
  const [liveDecodedPayload, setLiveDecodedPayload] = useState<string | null>(currentQrData || null);
  const [isScanningLive, setIsScanningLive] = useState<boolean>(false);

  // Sync active source URL when modal opens or prop changes
  useEffect(() => {
    if (isOpen) {
      const initialSource = sourceImageUrl || currentQrUrl || '';
      setActiveSourceUrl(initialSource);
    }
  }, [isOpen, sourceImageUrl, currentQrUrl]);

  // Scroll container to place the QR crop box directly in the center of the viewport
  const centerViewportOnBox = useCallback(
    (box: { x: number; y: number; width: number; height: number }, natW?: number, natH?: number) => {
      setTimeout(() => {
        if (!containerRef.current || !imageRef.current) return;
        const container = containerRef.current;
        const img = imageRef.current;
        const width = natW || imgNaturalSize.width || 1;
        const height = natH || imgNaturalSize.height || 1;

        const renderedW = img.offsetWidth || img.clientWidth;
        const renderedH = img.offsetHeight || img.clientHeight;

        if (renderedW > 0 && renderedH > 0) {
          const scaleX = renderedW / width;
          const scaleY = renderedH / height;

          const boxCenterX = (box.x + box.width / 2) * scaleX;
          const boxCenterY = (box.y + box.height / 2) * scaleY;

          const targetScrollLeft = boxCenterX - container.clientWidth / 2;
          const targetScrollTop = boxCenterY - container.clientHeight / 2;

          container.scrollTo({
            left: Math.max(0, targetScrollLeft),
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth',
          });
        }
      }, 90);
    },
    [imgNaturalSize]
  );

  // Load image and initialize detection
  useEffect(() => {
    if (isOpen && activeSourceUrl) {
      setImageLoaded(false);
      setRotation(0);
      setZoom(1);

      const img = new Image();
      img.onload = () => {
        setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);

        // 1. If pre-detected initialCropBox is provided from uploaded slip
        if (initialCropBox && initialCropBox.width > 20) {
          const sq = Math.max(initialCropBox.width, initialCropBox.height);
          const centeredBox = {
            x: Math.max(0, Math.min(img.naturalWidth - sq, initialCropBox.x)),
            y: Math.max(0, Math.min(img.naturalHeight - sq, initialCropBox.y)),
            width: sq,
            height: sq,
          };
          setCropBox(centeredBox);
          setDetectStatusMessage('Centered on pre-detected QR code area');
          setTimeout(() => setDetectStatusMessage(''), 3000);
          centerViewportOnBox(centeredBox, img.naturalWidth, img.naturalHeight);
          return;
        }

        // 2. Run automatic biometric QR detector and center
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const region = detectAndCenterQrRegion(canvas);
            setCropBox(region.box);
            if (region.qrText) {
              setLiveDecodedPayload(region.qrText);
            }
            setDetectStatusMessage(
              region.detected ? 'Authentic QR code detected & centered' : 'Fayda QR standard zone centered'
            );
            setTimeout(() => setDetectStatusMessage(''), 3000);
            centerViewportOnBox(region.box, img.naturalWidth, img.naturalHeight);
            return;
          }
        } catch (e) {
          console.warn('Initial QR detection error:', e);
        }

        // 3. Fallback to Fayda standard right-column box
        const defaultBox = getDefaultFaydaQrBox(img.naturalWidth, img.naturalHeight);
        setCropBox(defaultBox);
        centerViewportOnBox(defaultBox, img.naturalWidth, img.naturalHeight);
      };
      img.src = activeSourceUrl;
    }
  }, [isOpen, activeSourceUrl, initialCropBox, centerViewportOnBox]);

  // Re-run precision QR detector and center on demand
  const handleAutoDetectAndCenter = () => {
    if (!imageRef.current) return;
    const img = imageRef.current;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const region = detectAndCenterQrRegion(canvas);
        setCropBox(region.box);
        if (region.qrText) {
          setLiveDecodedPayload(region.qrText);
        }
        setDetectStatusMessage(
          region.detected
            ? `QR Code detected & centered (${region.box.width}×${region.box.height}px)`
            : 'Fayda biometric QR zone centered'
        );
        setTimeout(() => setDetectStatusMessage(''), 3000);
        centerViewportOnBox(region.box, img.naturalWidth, img.naturalHeight);
      }
    } catch (e) {
      console.warn('Auto-detect error:', e);
    }
  };

  // Update live preview and scan for decoded text
  const updateLivePreview = useCallback(
    (
      imgElement: HTMLImageElement | null,
      box: { x: number; y: number; width: number; height: number },
      rot: number,
      mode: 'original' | 'enhanced' | 'crispBw',
      qzPct: number
    ) => {
      if (!imgElement || !imgElement.complete || box.width <= 0 || box.height <= 0) return;

      try {
        const previewSize = 400;
        const canvas = document.createElement('canvas');
        canvas.width = previewSize;
        canvas.height = previewSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Pure white background for quiet zone
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, previewSize, previewSize);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const qzPx = Math.round(previewSize * (qzPct / 100));
        const drawSize = previewSize - qzPx * 2;

        // Render cropped portion (with rotation handling if needed)
        if (rot !== 0) {
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

            ctx.drawImage(rotCanvas, box.x, box.y, box.width, box.height, qzPx, qzPx, drawSize, drawSize);
          }
        } else {
          ctx.drawImage(imgElement, box.x, box.y, box.width, box.height, qzPx, qzPx, drawSize, drawSize);
        }

        // Apply print optimization filters
        if (mode === 'enhanced' || mode === 'crispBw') {
          const imgData = ctx.getImageData(0, 0, previewSize, previewSize);
          const d = imgData.data;

          if (mode === 'crispBw') {
            // Adaptive thresholding / crisp binarization for laser print
            for (let i = 0; i < d.length; i += 4) {
              const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
              const val = lum < 135 ? 0 : 255;
              d[i] = val;
              d[i + 1] = val;
              d[i + 2] = val;
            }
          } else {
            // High-contrast enhancement
            for (let i = 0; i < d.length; i += 4) {
              const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
              // Contrast stretch
              const contrastVal = lum < 120 ? Math.max(0, lum * 0.6) : Math.min(255, 120 + (lum - 120) * 1.4);
              d[i] = contrastVal;
              d[i + 1] = contrastVal;
              d[i + 2] = contrastVal;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const previewDataUrl = canvas.toDataURL('image/png');
        setLivePreviewUrl(previewDataUrl);

        // Attempt live jsQR decode on the cropped preview
        try {
          setIsScanningLive(true);
          const scanData = ctx.getImageData(0, 0, previewSize, previewSize);
          const code = jsQR(scanData.data, previewSize, previewSize, {
            inversionAttempts: 'attemptBoth',
          });
          if (code && code.data) {
            setLiveDecodedPayload(code.data);
          } else if (!liveDecodedPayload) {
            setLiveDecodedPayload(currentQrData || null);
          }
        } catch {
          // ignore scan error
        } finally {
          setIsScanningLive(false);
        }
      } catch (err) {
        console.warn('QR Live preview update failed:', err);
      }
    },
    [currentQrData, liveDecodedPayload]
  );

  // Trigger live preview update whenever crop box or settings change
  useEffect(() => {
    if (imageLoaded && imageRef.current) {
      updateLivePreview(imageRef.current, cropBox, rotation, filterMode, quietZonePercent);
    }
  }, [cropBox, rotation, filterMode, quietZonePercent, imageLoaded, updateLivePreview]);

  // Presets
  const handlePresetFaydaRight = () => {
    const size = Math.round(Math.min(imgNaturalSize.width * 0.38, imgNaturalSize.height * 0.42));
    const box = {
      x: Math.round(imgNaturalSize.width * 0.52),
      y: Math.round(imgNaturalSize.height * 0.22),
      width: size,
      height: size,
    };
    setCropBox(box);
    centerViewportOnBox(box);
  };

  const handlePresetTopRight = () => {
    const size = Math.round(Math.min(imgNaturalSize.width * 0.36, imgNaturalSize.height * 0.38));
    const box = {
      x: Math.round(imgNaturalSize.width * 0.54),
      y: Math.round(imgNaturalSize.height * 0.12),
      width: size,
      height: size,
    };
    setCropBox(box);
    centerViewportOnBox(box);
  };

  const handlePresetCenter = () => {
    const size = Math.round(Math.min(imgNaturalSize.width * 0.5, imgNaturalSize.height * 0.5));
    const box = {
      x: Math.round((imgNaturalSize.width - size) / 2),
      y: Math.round((imgNaturalSize.height - size) / 2),
      width: size,
      height: size,
    };
    setCropBox(box);
    centerViewportOnBox(box);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Zoom into QR cutter and center it for close-up inspection
  const handleFocusCutter = () => {
    setZoom(2.4);
    setTimeout(() => {
      centerViewportOnBox(cropBox, imgNaturalSize.width, imgNaturalSize.height);
    }, 50);
  };

  // Micro-nudge crop box by pixel delta
  const handleNudgeCropBox = (dx: number, dy: number) => {
    setCropBox((prev) => ({
      ...prev,
      x: Math.max(0, Math.min(imgNaturalSize.width - prev.width, prev.x + dx)),
      y: Math.max(0, Math.min(imgNaturalSize.height - prev.height, prev.y + dy)),
    }));
  };

  // Resize crop box maintaining 1:1 aspect ratio
  const handleResizeCropBox = (delta: number) => {
    setCropBox((prev) => {
      const newSize = Math.max(60, Math.min(imgNaturalSize.width - prev.x, imgNaturalSize.height - prev.y, prev.width + delta));
      return { ...prev, width: newSize, height: newSize };
    });
  };

  // Custom Slip / QR File Upload
  const handleCustomSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      if (b64) {
        setActiveSourceUrl(b64);
      }
    };
    reader.readAsDataURL(file);
  };

  // Dragging and Resizing Logic (Enforcing Strict 1:1 Aspect Ratio)
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

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !imageRef.current) return;

      const img = imageRef.current;
      const rect = img.getBoundingClientRect();

      const scaleX = imgNaturalSize.width / rect.width;
      const scaleY = imgNaturalSize.height / rect.height;

      const deltaX = (e.clientX - dragStartRef.current.mouseX) * scaleX;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) * scaleY;

      const initial = dragStartRef.current.box;

      if (activeHandle === null) {
        // Move crop box
        const newX = Math.max(0, Math.min(imgNaturalSize.width - initial.width, initial.x + deltaX));
        const newY = Math.max(0, Math.min(imgNaturalSize.height - initial.height, initial.y + deltaY));
        setCropBox({
          ...initial,
          x: Math.round(newX),
          y: Math.round(newY),
        });
      } else {
        // Resize box maintaining 1:1 square ratio
        let newSize = initial.width;
        let newX = initial.x;
        let newY = initial.y;

        if (activeHandle.includes('e') || activeHandle.includes('s')) {
          // Dragging South or East handles
          const delta = Math.max(deltaX, deltaY);
          newSize = Math.max(60, initial.width + delta);
          // Clamp to image bounds
          if (newX + newSize > imgNaturalSize.width) newSize = imgNaturalSize.width - newX;
          if (newY + newSize > imgNaturalSize.height) newSize = imgNaturalSize.height - newY;
        } else if (activeHandle.includes('w') || activeHandle.includes('n')) {
          // Dragging North or West handles
          const delta = Math.min(deltaX, deltaY);
          const potentialSize = initial.width - delta;
          if (potentialSize >= 60) {
            newSize = potentialSize;
            newX = initial.x + delta;
            newY = initial.y + delta;
            if (newX < 0) {
              newSize += newX;
              newX = 0;
            }
            if (newY < 0) {
              newSize += newY;
              newY = 0;
            }
          }
        }

        setCropBox({
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newSize),
          height: Math.round(newSize),
        });
      }
    },
    [isDragging, activeHandle, imgNaturalSize]
  );

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

  // Apply Final High-Resolution Crop (600x600 px at 300 DPI for CR80 PVC)
  const handleApply = () => {
    if (!imageRef.current) return;
    const img = imageRef.current;

    const targetOutputSize = 600;
    const canvas = document.createElement('canvas');
    canvas.width = targetOutputSize;
    canvas.height = targetOutputSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Pure white quiet zone
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetOutputSize, targetOutputSize);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const qzPx = Math.round(targetOutputSize * (quietZonePercent / 100));
    const drawSize = targetOutputSize - qzPx * 2;

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

        ctx.drawImage(rotCanvas, cropBox.x, cropBox.y, cropBox.width, cropBox.height, qzPx, qzPx, drawSize, drawSize);
      }
    } else {
      ctx.drawImage(img, cropBox.x, cropBox.y, cropBox.width, cropBox.height, qzPx, qzPx, drawSize, drawSize);
    }

    // Apply print optimization filters
    if (filterMode === 'enhanced' || filterMode === 'crispBw') {
      const imgData = ctx.getImageData(0, 0, targetOutputSize, targetOutputSize);
      const d = imgData.data;

      if (filterMode === 'crispBw') {
        for (let i = 0; i < d.length; i += 4) {
          const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
          const val = lum < 135 ? 0 : 255;
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
        }
      } else {
        for (let i = 0; i < d.length; i += 4) {
          const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
          const contrastVal = lum < 120 ? Math.max(0, lum * 0.6) : Math.min(255, 120 + (lum - 120) * 1.4);
          d[i] = contrastVal;
          d[i + 1] = contrastVal;
          d[i + 2] = contrastVal;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const finalQrUrl = canvas.toDataURL('image/png');
    onApplyCrop(finalQrUrl, liveDecodedPayload || undefined);
    onClose();
  };

  if (!isOpen) return null;

  const boxPercent = {
    left: `${(cropBox.x / imgNaturalSize.width) * 100}%`,
    top: `${(cropBox.y / imgNaturalSize.height) * 100}%`,
    width: `${(cropBox.width / imgNaturalSize.width) * 100}%`,
    height: `${(cropBox.height / imgNaturalSize.height) * 100}%`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
              <CropIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white leading-tight">
                  Crop & Align Authentic QR Code / ኦሪጅናል የQR ኮድ ቆራጭ
                </h3>
                <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  1:1 Square QR Matrix
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Frame the official biometric QR code from the document slip. Preserves authentic digital signature. / የሰነዱን ኦሪጅናል የQR ኮድ በትክክል ቆርጠው ወደ ካርዱ ያስገቡ።
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
              <span>Apply Cropped QR Code / ወደ ካርዱ አስገባ</span>
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

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-950/60 border-b border-slate-800 text-xs">
          {/* Quick Presets & AI Detection */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAutoDetectAndCenter}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-700/70 hover:bg-cyan-600 text-cyan-100 border border-cyan-500/50 rounded-xl font-bold transition-all shadow-xs cursor-pointer"
              title="Automatically scan slip image, detect authentic QR matrix, and center the crop frame"
            >
              <Crosshair className="w-3.5 h-3.5 text-cyan-300 animate-spin-slow" />
              <span>⚡ Auto-Detect & Center QR / በራሱ ፈልግ</span>
            </button>

            {detectStatusMessage && (
              <span className="text-[11px] font-semibold text-cyan-200 bg-cyan-950/80 px-2.5 py-1 rounded-lg border border-cyan-800 flex items-center gap-1.5">
                <Check className="w-3 h-3 text-cyan-400" />
                <span>{detectStatusMessage}</span>
              </span>
            )}

            <span className="text-slate-600">|</span>

            <span className="text-slate-400 font-medium text-[11px]">Presets / ቦታዎች:</span>
            <button
              type="button"
              onClick={handlePresetFaydaRight}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
            >
              Fayda Right / ቀኝ
            </button>
            <button
              type="button"
              onClick={handlePresetTopRight}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
            >
              Top-Right / ላይ ቀኝ
            </button>
            <button
              type="button"
              onClick={handlePresetCenter}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
            >
              Center / መሃል
            </button>

            <button
              type="button"
              onClick={handleRotate}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              title="Rotate document 90 degrees clockwise"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate 90° / አዙር</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              title="Upload another slip scan or image to crop from"
            >
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              <span>Choose Slip / ፋይል</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleCustomSlipUpload}
              className="hidden"
            />
          </div>

          {/* View & Guides & Focus Cutter */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Focus on Cutter Button */}
            <button
              type="button"
              onClick={handleFocusCutter}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/70 rounded-xl font-semibold transition-colors cursor-pointer shadow-xs"
              title="Zoom directly to cutter area (2.4×) / በመቁረጫው ሳጥን ላይ አቅርበህ አተኩር"
            >
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Focus on Cutter / በመቁረጫው ላይ አተኩር</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                title="Zoom Out / አርቅ"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono px-1 font-bold">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                title="Zoom In / አቅርብ"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer text-[10px] font-bold"
                title="Reset Zoom / ሙሉ እይታ"
              >
                Fit / ሙሉ
              </button>
            </div>

            {/* Guides Toggle */}
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
                className="w-3.5 h-3.5 accent-cyan-500 rounded"
              />
              <span className="text-[11px]">Finder Guides / መመሪያ መስመሮች</span>
            </label>
          </div>
        </div>

        {/* Main Body: Interactive Crop Canvas + Live QR Output & Diagnostics */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[420px]">
          {/* Left / Center: Interactive Canvas */}
          <div
            ref={containerRef}
            className="lg:col-span-8 bg-slate-950 p-6 flex items-center justify-center overflow-auto relative select-none"
            style={{ maxHeight: 'calc(95vh - 200px)' }}
          >
            {activeSourceUrl ? (
              <div
                className="relative inline-block shadow-2xl transition-transform duration-100 ease-out"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Source Image */}
                <img
                  ref={imageRef}
                  src={activeSourceUrl}
                  alt="Document Slip Source"
                  className="max-h-[68vh] w-auto max-w-full object-contain pointer-events-none rounded-md"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 0.2s ease',
                  }}
                  crossOrigin="anonymous"
                />

                {/* Dark Vignette Overlay outside Crop Box */}
                {imageLoaded && (
                  <>
                    <div
                      className="absolute inset-0 bg-slate-950/60 pointer-events-none"
                      style={{
                        clipPath: `polygon(
                          0% 0%, 0% 100%, 100% 100%, 100% 0%,
                          ${boxPercent.left} 0%,
                          ${boxPercent.left} ${boxPercent.top},
                          calc(${boxPercent.left} + ${boxPercent.width}) ${boxPercent.top},
                          calc(${boxPercent.left} + ${boxPercent.width}) calc(${boxPercent.top} + ${boxPercent.height}),
                          ${boxPercent.left} calc(${boxPercent.top} + ${boxPercent.height}),
                          ${boxPercent.left} 0%
                        )`,
                      }}
                    />

                    {/* Draggable & Resizable 1:1 Crop Frame */}
                    <div
                      className="absolute border-2 border-cyan-400 bg-cyan-400/10 cursor-move shadow-lg group"
                      style={{
                        left: boxPercent.left,
                        top: boxPercent.top,
                        width: boxPercent.width,
                        height: boxPercent.height,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, null)}
                    >
                      {/* Grid / Finder Corner Guides */}
                      {showGuides && (
                        <div className="absolute inset-0 pointer-events-none">
                          {/* 3x3 Grid */}
                          <div className="absolute left-1/3 inset-y-0 w-px bg-cyan-400/30" />
                          <div className="absolute left-2/3 inset-y-0 w-px bg-cyan-400/30" />
                          <div className="absolute top-1/3 inset-x-0 h-px bg-cyan-400/30" />
                          <div className="absolute top-2/3 inset-x-0 h-px bg-cyan-400/30" />

                          {/* QR Finder Markers Simulation (Top-Left, Top-Right, Bottom-Left) */}
                          <div className="absolute top-2 left-2 w-6 h-6 border-2 border-cyan-300 rounded-sm bg-cyan-400/20 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 bg-cyan-300 rounded-xs" />
                          </div>
                          <div className="absolute top-2 right-2 w-6 h-6 border-2 border-cyan-300 rounded-sm bg-cyan-400/20 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 bg-cyan-300 rounded-xs" />
                          </div>
                          <div className="absolute bottom-2 left-2 w-6 h-6 border-2 border-cyan-300 rounded-sm bg-cyan-400/20 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 bg-cyan-300 rounded-xs" />
                          </div>

                          {/* Center Focus Reticle */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full border border-cyan-400/60 flex items-center justify-center">
                              <div className="w-1 h-1 bg-cyan-400 rounded-full" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Resize Corner Handles (strictly 1:1) */}
                      <div
                        className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-xs cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                        onMouseDown={(e) => handleMouseDown(e, 'nw')}
                      />
                      <div
                        className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-xs cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                        onMouseDown={(e) => handleMouseDown(e, 'ne')}
                      />
                      <div
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-xs cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                        onMouseDown={(e) => handleMouseDown(e, 'sw')}
                      />
                      <div
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-xs cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                        onMouseDown={(e) => handleMouseDown(e, 'se')}
                      />

                      {/* Move Hint */}
                      <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-mono">
                        {cropBox.width}×{cropBox.height}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center p-8 border-2 border-dashed border-slate-700 rounded-2xl max-w-sm">
                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-300 mb-1">No Document Image Available</p>
                <p className="text-xs text-slate-500 mb-4">
                  Select a Fayda slip scan or document image to crop the authentic biometric QR code.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Choose Document Image
                </button>
              </div>
            )}
          </div>

          {/* Right Panel: Real-Time Output, Cutter Loupe & QR Diagnostics */}
          <div className="lg:col-span-4 bg-slate-900 p-4 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              {/* Inspection Mode Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('output')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeRightTab === 'output'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Output / የቀጥታ ውጤት</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab('loupe')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeRightTab === 'loupe'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Cutter Loupe (2.5×) / ማጉያ</span>
                </button>
              </div>

              {activeRightTab === 'output' ? (
                /* Output Preview Card */
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Cropped QR Output / የተቆረጠው ኮድ</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                      600 × 600 px (300 DPI)
                    </span>
                  </div>

                  <div className="w-48 h-48 mx-auto bg-white rounded-xl p-2 border-2 border-cyan-500/40 shadow-inner flex items-center justify-center relative overflow-hidden">
                    {livePreviewUrl ? (
                      <img
                        src={livePreviewUrl}
                        alt="Cropped QR Preview"
                        className="w-full h-full object-contain select-none"
                        style={{ imageRendering: 'crisp-edges' }}
                      />
                    ) : (
                      <div className="animate-pulse text-xs text-slate-400">Rendering preview...</div>
                    )}

                    {/* Corner Authentic Marker */}
                    <div className="absolute top-1 right-1 bg-emerald-600 text-white text-[8px] font-extrabold px-1 py-0.2 rounded-xs shadow-xs uppercase">
                      Authentic
                    </div>
                  </div>

                  {/* QR Verification Status */}
                  <div className="pt-1">
                    {liveDecodedPayload ? (
                      <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-2.5 text-left">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[11px] font-bold text-emerald-300">
                            Digital Signature Verified / ዲጂታል ፊርማ ተረጋግጧል
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-emerald-200/80 truncate" title={liveDecodedPayload}>
                          {liveDecodedPayload}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-2.5 text-left">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span className="text-[11px] font-bold text-cyan-300">
                            High-Density Matrix / ከፍተኛ ጥራት ኮድ
                          </span>
                        </div>
                        <p className="text-[10px] text-cyan-200/70">
                          Preserved 1:1 authentic document dots for laser printer reproduction. • ለህትመት ጥራት በኦሪጅናል ነጥቦች የተዘጋጀ።
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Cutter Blade & Edge Magnification Loupe */
                <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-800/40 text-center space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-emerald-300 font-bold px-1">
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Cutter Blade & Finder Corners</span>
                    </span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800">
                      2.5× Loupe
                    </span>
                  </div>

                  {/* Magnified Loupe Viewport */}
                  <div className="w-48 h-48 mx-auto rounded-xl overflow-hidden border-2 border-emerald-400 shadow-2xl bg-white relative">
                    {livePreviewUrl ? (
                      <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-white">
                        <img
                          src={livePreviewUrl}
                          alt="QR Cutter Magnification"
                          className="w-full h-full object-contain transform scale-150"
                          style={{ imageRendering: 'crisp-edges' }}
                        />
                        {/* Crosshair guidelines */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="w-full h-px bg-cyan-500/40" />
                          <div className="h-full w-px bg-cyan-500/40 absolute" />
                          <div className="w-12 h-12 rounded-full border border-cyan-500/60 absolute" />
                        </div>
                        {/* Cutting perimeter guide */}
                        <div className="absolute inset-2 border-2 border-dashed border-emerald-600 rounded pointer-events-none" />
                        <span className="absolute top-1 left-2 text-[8px] bg-black/80 text-emerald-300 px-1 rounded font-mono">
                          ▲ Top Corner
                        </span>
                        <span className="absolute bottom-1 right-2 text-[8px] bg-black/80 text-cyan-300 px-1 rounded font-mono">
                          ▼ Quiet Zone
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
                    Verify all 3 corner finder squares are safely inside the cutting edge with white quiet zone intact.
                  </p>
                </div>
              )}

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
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold border border-slate-700 cursor-pointer"
                      title="Shrink Cutter / ሳጥኑን አሳንስ"
                    >
                      - Size / አሳንስ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeCropBox(4)}
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold border border-slate-700 cursor-pointer"
                      title="Expand Cutter / ሳጥኑን አተልቅ"
                    >
                      + Size / አተልቅ
                    </button>
                  </div>
                </div>
              </div>

              {/* Print Optimization Filter */}
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Print Sharpness / የህትመት ጥራት</span>
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'original', label: 'Original Scan', am: 'ኦሪጅናል' },
                    { id: 'enhanced', label: 'Enhanced', am: 'ንፅፅር የጨመረ' },
                    { id: 'crispBw', label: 'Laser B&W', am: 'ጥቁርና ነጭ' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilterMode(f.id as any)}
                      className={`text-center p-2 rounded-xl border transition-all cursor-pointer ${
                        filterMode === f.id
                          ? 'bg-cyan-600 text-white border-cyan-400 shadow-xs'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850'
                      }`}
                    >
                      <p className="text-[10px] font-bold leading-tight">{f.label}</p>
                      <p className="text-[8px] opacity-75 mt-0.5 truncate">{f.am}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quiet Zone Margin */}
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Quiet Zone Margin / የነጭ ዙሪያ ህዳግ</span>
                  </span>
                  <span className="text-[10px] font-mono text-cyan-300">{quietZonePercent}% Padding</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 3, 4, 6].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setQuietZonePercent(pct)}
                      className={`py-1.5 px-2 text-center rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                        quietZonePercent === pct
                          ? 'bg-cyan-600 text-white border-cyan-400 shadow-xs'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850'
                      }`}
                    >
                      {pct === 0 ? '0% (Tight)' : `${pct}%`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                  <Info className="w-3 h-3 text-slate-500 shrink-0" />
                  <span>A 3%–4% white quiet zone ensures barcode scanners read instantly. • 3%–4% ህዳግ ስካነሮች በፍጥነት እንዲያነቡ ያደርጋል።</span>
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={handleApply}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg hover:shadow-emerald-600/30 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save & Set As Card Back QR / የQR ኮዱን ወደ ካርድ አስገባ</span>
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
