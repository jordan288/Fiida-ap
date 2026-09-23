import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Sun,
  Moon,
  Contrast,
  Sliders,
  RotateCcw,
  Scissors,
  Check,
  Download,
  Eye,
  Layers,
  Wand2,
  Droplet,
  Zap,
  CheckCircle2,
  Palette,
  UserCheck,
  ShieldCheck,
  Eraser,
  Paintbrush,
  Undo2,
  MousePointer,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ImageAdjustments,
  DEFAULT_ADJUSTMENTS,
  BgRemovalOptions,
  DEFAULT_BG_OPTIONS,
  applyPhotoAdjustments,
  removePhotoBackground,
  loadImage,
} from '../utils/imageProcessor';

interface PhotoAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalPhotoUrl: string;
  onApplyPhoto: (newPhotoUrl: string, target?: 'primary' | 'secondary' | 'both') => void;
  applicantName?: string;
  initialTab?: 'adjust' | 'background' | 'presets';
  photoColorMode?: 'color' | 'grayscale';
  onToggleColorMode?: () => void;
}

export const PhotoAdjustModal: React.FC<PhotoAdjustModalProps> = ({
  isOpen,
  onClose,
  originalPhotoUrl,
  onApplyPhoto,
  applicantName = 'Applicant',
  initialTab = 'background',
  photoColorMode = 'color',
  onToggleColorMode,
}) => {
  // Active photo source (can be modified by background removal or initial)
  const [basePhotoSrc, setBasePhotoSrc] = useState<string>(originalPhotoUrl);
  const [processedPhotoUrl, setProcessedPhotoUrl] = useState<string>(originalPhotoUrl);

  // Sliders state
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);

  // Background removal state
  const [bgOptions, setBgOptions] = useState<BgRemovalOptions>(DEFAULT_BG_OPTIONS);
  const [isRemovingBg, setIsRemovingBg] = useState<boolean>(false);
  const [bgRemovedApplied, setBgRemovedApplied] = useState<boolean>(false);
  const [customBgColor, setCustomBgColor] = useState<string>('transparent');

  // Manual touch-up brush state
  const [brushMode, setBrushMode] = useState<'none' | 'erase' | 'restore'>('none');
  const [brushSize, setBrushSize] = useState<number>(18);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);

  // Preview / Comparison state
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'adjust' | 'background' | 'presets'>('background');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  // Load and cache original image for restore brush
  useEffect(() => {
    if (originalPhotoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        originalImgRef.current = img;
      };
      img.src = originalPhotoUrl;
    }
  }, [originalPhotoUrl]);

  // Synchronize when modal opens with new photo
  useEffect(() => {
    if (isOpen) {
      setBasePhotoSrc(originalPhotoUrl);
      setProcessedPhotoUrl(originalPhotoUrl);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setBgOptions(DEFAULT_BG_OPTIONS);
      setBgRemovedApplied(false);
      setApplySuccess(false);
      setBrushMode('none');
      setUndoStack([]);
      setActiveTab(initialTab || 'background');
    }
  }, [isOpen, originalPhotoUrl, initialTab]);

  // Sync offscreen touchup canvas with basePhotoSrc
  useEffect(() => {
    if (!basePhotoSrc || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = basePhotoSrc;
  }, [basePhotoSrc]);

  // Apply touch-up brush at coordinates
  const applyBrushAt = (clientX: number, clientY: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (clientX - rect.left) * scaleX;
    const cy = (clientY - rect.top) * scaleY;
    const r = brushSize * ((scaleX + scaleY) / 2);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    if (brushMode === 'erase') {
      ctx.clearRect(cx - r - 2, cy - r - 2, (r + 2) * 2, (r + 2) * 2);
    } else if (brushMode === 'restore' && originalImgRef.current) {
      ctx.drawImage(originalImgRef.current, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
  };

  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (brushMode === 'none') return;
    setIsDrawing(true);
    setUndoStack((prev) => [...prev.slice(-10), basePhotoSrc]);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    applyBrushAt(clientX, clientY);
  };

  const handleMoveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || brushMode === 'none') return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    applyBrushAt(clientX, clientY);
  };

  const handleEndDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (previewCanvasRef.current) {
      const updatedUrl = previewCanvasRef.current.toDataURL('image/png');
      setBasePhotoSrc(updatedUrl);
      setBgRemovedApplied(true);
    }
  };

  const handleUndoBrush = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setBasePhotoSrc(last);
  };

  // Re-run adjustments whenever sliders or basePhotoSrc changes
  useEffect(() => {
    let isMounted = true;
    const processImage = async () => {
      if (!basePhotoSrc) return;
      setIsProcessing(true);
      try {
        const result = await applyPhotoAdjustments(basePhotoSrc, adjustments);
        if (isMounted) {
          setProcessedPhotoUrl(result);
        }
      } catch (err) {
        console.error('Adjustment error:', err);
      } finally {
        if (isMounted) setIsProcessing(false);
      }
    };

    const timer = setTimeout(processImage, 60);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [basePhotoSrc, adjustments]);

  if (!isOpen) return null;

  const handleSliderChange = (key: keyof ImageAdjustments, value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetAdjustments = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
  };

  const handleApplyPreset = (preset: Partial<ImageAdjustments>) => {
    setAdjustments({
      ...DEFAULT_ADJUSTMENTS,
      ...preset,
    });
  };

  const handleRunBackgroundRemoval = async (targetFill: string = customBgColor) => {
    setIsRemovingBg(true);
    try {
      const options: BgRemovalOptions = {
        tolerance: bgOptions.tolerance ?? 30,
        feather: bgOptions.feather ?? 2,
        fillColor: targetFill,
        edgeSmoothing: true,
      };
      const cutout = await removePhotoBackground(originalPhotoUrl, options);
      setBasePhotoSrc(cutout);
      setBgRemovedApplied(true);
      setCustomBgColor(targetFill);
    } catch (err) {
      console.error('BG removal failed:', err);
      alert('Could not remove background. Please try adjusting tolerance.');
    } finally {
      setIsRemovingBg(false);
    }
  };

  const handleResetToOriginal = () => {
    setBasePhotoSrc(originalPhotoUrl);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setBgRemovedApplied(false);
    setCustomBgColor('transparent');
  };

  const handleApplyToCard = (target: 'primary' | 'secondary' | 'both') => {
    onApplyPhoto(processedPhotoUrl, target);
    setApplySuccess(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  const handleDownloadProcessed = () => {
    const a = document.createElement('a');
    a.href = processedPhotoUrl;
    const cleanName = applicantName.replace(/\s+/g, '_');
    a.download = `Ethiopian_ID_Photo_Enhanced_${cleanName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Photo Studio & Lighting Laboratory
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  Live 300 DPI Enhancer
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Remove backgrounds, adjust lighting, brightness, darkness, and exposure with real-time sliders
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Column: Photo Preview Canvas with Checkerboard/Split */}
            <div className="md:col-span-5 flex flex-col items-center justify-between bg-slate-950 rounded-2xl p-4 border border-slate-800 text-white relative">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  {showOriginal ? 'Original Raw Photo' : 'Enhanced Live Output'}
                </span>
                
                {/* Hold to compare button */}
                <button
                  type="button"
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onTouchStart={() => setShowOriginal(true)}
                  onTouchEnd={() => setShowOriginal(false)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer select-none flex items-center gap-1 ${
                    showOriginal
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Hold button to view original input"
                >
                  <Eye className="w-3 h-3" />
                  Hold to Compare
                </button>
              </div>



              {/* Central Photo Display with Transparency Checkerboard */}
              <div className="relative my-auto py-2 flex flex-col items-center justify-center w-full">
                <div
                  className="w-48 h-60 sm:w-56 sm:h-70 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 relative flex items-center justify-center select-none"
                  style={{
                    backgroundImage:
                      customBgColor === 'transparent'
                        ? 'radial-gradient(#334155 1px, transparent 1px), radial-gradient(#334155 1px, #0f172a 1px)'
                        : undefined,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 8px 8px',
                    backgroundColor: customBgColor === 'transparent' ? '#0f172a' : customBgColor,
                  }}
                >
                  {/* Interactive Canvas for Manual Touch-Up */}
                  {brushMode !== 'none' && !showOriginal ? (
                    <canvas
                      ref={previewCanvasRef}
                      onMouseDown={handleStartDraw}
                      onMouseMove={handleMoveDraw}
                      onMouseUp={handleEndDraw}
                      onMouseLeave={handleEndDraw}
                      onTouchStart={handleStartDraw}
                      onTouchMove={handleMoveDraw}
                      onTouchEnd={handleEndDraw}
                      className={`w-full h-full object-cover touch-none ${
                        brushMode === 'erase' ? 'cursor-crosshair' : 'cursor-cell'
                      }`}
                    />
                  ) : (
                    <img
                      src={showOriginal ? originalPhotoUrl : processedPhotoUrl}
                      alt="Applicant Portrait"
                      className="w-full h-full object-cover transition-opacity duration-150"
                    />
                  )}

                  {isProcessing && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-2xs flex items-center justify-center pointer-events-none">
                      <span className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                    </div>
                  )}

                  {bgRemovedApplied && !showOriginal && (
                    <div className="absolute top-2 left-2 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 pointer-events-none">
                      <Scissors className="w-3 h-3" />
                      Cutout Active
                    </div>
                  )}

                  {brushMode !== 'none' && !showOriginal && (
                    <div
                      className={`absolute bottom-2 inset-x-2 text-center text-[10px] font-bold px-2 py-1 rounded-md shadow-md backdrop-blur-xs pointer-events-none flex items-center justify-center gap-1 ${
                        brushMode === 'erase'
                          ? 'bg-rose-950/90 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {brushMode === 'erase' ? (
                        <>
                          <Eraser className="w-3 h-3" />
                          Erasing: Drag on canvas
                        </>
                      ) : (
                        <>
                          <Paintbrush className="w-3 h-3" />
                          Restoring: Drag on canvas
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Touch-up Toolbar below preview when background tab active */}
                {activeTab === 'background' && (
                  <div className="w-full mt-3 px-1 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setBrushMode('none')}
                        className={`p-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          brushMode === 'none'
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="View / Navigate"
                      >
                        <MousePointer className="w-3 h-3" />
                        <span className="hidden sm:inline">Inspect</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBrushMode('erase')}
                        className={`p-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          brushMode === 'erase'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-rose-400 hover:bg-slate-800'
                        }`}
                        title="Erase background remnants"
                      >
                        <Eraser className="w-3 h-3" />
                        <span>Eraser</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBrushMode('restore')}
                        className={`p-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          brushMode === 'restore'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-emerald-400 hover:bg-slate-800'
                        }`}
                        title="Restore clipped hair or clothing"
                      >
                        <Paintbrush className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {brushMode !== 'none' && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-300">
                          <span className="text-slate-400">Size:</span>
                          <input
                            type="range"
                            min="6"
                            max="36"
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-12 h-1 bg-slate-700 accent-emerald-500 rounded-sm cursor-pointer"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleUndoBrush}
                        disabled={undoStack.length === 0}
                        className={`p-1.5 rounded-lg text-[10px] transition-all flex items-center gap-0.5 ${
                          undoStack.length > 0
                            ? 'text-slate-200 hover:bg-slate-800 cursor-pointer'
                            : 'text-slate-600 cursor-not-allowed opacity-50'
                        }`}
                        title="Undo brush stroke"
                      >
                        <Undo2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action bar below preview */}
              <div className="w-full flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleResetToOriginal}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Revert all edits back to the initial raw uploaded photo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to Original
                </button>

                <button
                  type="button"
                  onClick={handleDownloadProcessed}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  Save Photo
                </button>
              </div>
            </div>

            {/* Right Column: Adjustment Tabs & Sliders */}
            <div className="md:col-span-7 space-y-4">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('adjust')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'adjust'
                      ? 'bg-white text-emerald-900 shadow-xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Light & Darkness</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('background')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'background'
                      ? 'bg-white text-emerald-900 shadow-xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Remove Background</span>
                  {bgRemovedApplied && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('presets')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'presets'
                      ? 'bg-white text-emerald-900 shadow-xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Presets</span>
                </button>


              </div>

              {/* TAB 1: LIGHT & DARK SLIDERS */}
              {activeTab === 'adjust' && (
                <div className="space-y-4 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      Fine-Tune Lighting & Color
                    </span>
                    <button
                      type="button"
                      onClick={handleResetAdjustments}
                      className="text-[11px] text-gray-500 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Sliders
                    </button>
                  </div>

                  {/* 1. Brightness Slider */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-gray-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                      <span className="flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                        Brightness (Lightness)
                      </span>
                      <span className="font-mono text-emerald-700 font-bold">
                        {adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={adjustments.brightness ?? 0}
                      onChange={(e) => handleSliderChange('brightness', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Darker (-100)</span>
                      <span>0 (Neutral)</span>
                      <span>Brighter (+100)</span>
                    </div>
                  </div>

                  {/* 2. Exposure / Shadows Slider (Darkness) */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-gray-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                      <span className="flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 text-indigo-500" />
                        Exposure & Shadow Depth
                      </span>
                      <span className="font-mono text-emerald-700 font-bold">
                        {adjustments.exposure > 0 ? `+${adjustments.exposure}` : adjustments.exposure}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={adjustments.exposure ?? 0}
                      onChange={(e) => handleSliderChange('exposure', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Deep Shadow (-100)</span>
                      <span>0 (Normal)</span>
                      <span>High Exposure (+100)</span>
                    </div>
                  </div>

                  {/* 3. Contrast Slider */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-gray-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                      <span className="flex items-center gap-1.5">
                        <Contrast className="w-3.5 h-3.5 text-gray-700" />
                        Contrast
                      </span>
                      <span className="font-mono text-emerald-700 font-bold">
                        {adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={adjustments.contrast ?? 0}
                      onChange={(e) => handleSliderChange('contrast', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Soft Flat (-100)</span>
                      <span>0 (Normal)</span>
                      <span>Sharp Vivid (+100)</span>
                    </div>
                  </div>

                  {/* 4. Saturation & Warmth in 2 Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Saturation */}
                    <div className="space-y-1.5 bg-white p-3 rounded-xl border border-gray-200/90 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                        <span className="flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-pink-500" />
                          Saturation
                        </span>
                        <span className="font-mono text-emerald-700 font-bold text-[11px]">
                          {adjustments.saturation > 0 ? `+${adjustments.saturation}` : adjustments.saturation}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={adjustments.saturation ?? 0}
                        onChange={(e) => handleSliderChange('saturation', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                      />
                    </div>

                    {/* Warmth / Temp */}
                    <div className="space-y-1.5 bg-white p-3 rounded-xl border border-gray-200/90 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                        <span className="flex items-center gap-1.5">
                          <Droplet className="w-3.5 h-3.5 text-orange-500" />
                          Warmth / Temp
                        </span>
                        <span className="font-mono text-emerald-700 font-bold text-[11px]">
                          {adjustments.temperature > 0 ? `+${adjustments.temperature}` : adjustments.temperature}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={adjustments.temperature ?? 0}
                        onChange={(e) => handleSliderChange('temperature', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                    </div>
                  </div>

                  {/* 5. Sharpness & Clarity */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-gray-200/90 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        Facial Detail & Edge Sharpness
                      </span>
                      <span className="font-mono text-emerald-700 font-bold">
                        {adjustments.sharpness}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={adjustments.sharpness ?? 0}
                      onChange={(e) => handleSliderChange('sharpness', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: BACKGROUND REMOVAL */}
              {activeTab === 'background' && (
                <div className="space-y-4 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/80">
                  {/* Photo Background Remover Header */}
                  <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Scissors className="w-4 h-4 text-emerald-600" />
                        Normal Photo Background Remover
                      </span>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Cleanly removes photo background to transparent alpha without cutting into clothes or hair.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      Normal Remover
                    </span>
                  </div>

                  {/* Cutout Action Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleRunBackgroundRemoval('transparent')}
                      disabled={isRemovingBg}
                      className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                          Transparent Cutout
                        </span>
                        {bgRemovedApplied && customBgColor === 'transparent' && (
                          <Check className="w-4 h-4 text-emerald-700" />
                        )}
                      </div>
                      <p className="text-[11px] text-emerald-700/80">
                        Removes backdrop to transparent alpha.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunBackgroundRemoval('#ffffff')}
                      disabled={isRemovingBg}
                      className="p-3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Studio White (#FFFFFF)
                        </span>
                        {bgRemovedApplied && customBgColor === '#ffffff' && (
                          <Check className="w-4 h-4 text-emerald-700" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Official pure passport white standard.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunBackgroundRemoval('#dbeafe')}
                      disabled={isRemovingBg}
                      className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-950 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-blue-600" />
                          ID Studio Light Blue
                        </span>
                        {bgRemovedApplied && customBgColor === '#dbeafe' && (
                          <Check className="w-4 h-4 text-emerald-700" />
                        )}
                      </div>
                      <p className="text-[11px] text-blue-700/80">
                        Official ID studio sky blue tint.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunBackgroundRemoval('#f3f4f6')}
                      disabled={isRemovingBg}
                      className="p-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-800 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-gray-600" />
                          Neutral Light Gray
                        </span>
                        {bgRemovedApplied && customBgColor === '#f3f4f6' && (
                          <Check className="w-4 h-4 text-emerald-700" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600">
                        Soft light neutral gray for clean card blending.
                      </p>
                    </button>
                  </div>

                  {/* Background Remover Tuning */}
                  <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-3">
                    {/* Cutout Color Sensitivity Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-gray-600">
                        <span>Cutout Sensitivity (Tolerance)</span>
                        <span className="font-mono text-emerald-700 font-bold">{bgOptions.tolerance ?? 30}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="70"
                        value={bgOptions.tolerance ?? 30}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setBgOptions((prev) => ({ ...prev, tolerance: val }));
                        }}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                      <div className="flex justify-between text-[10px] text-gray-500 font-mono pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setBgOptions((prev) => ({ ...prev, tolerance: 15 }));
                            if (bgRemovedApplied) {
                              handleRunBackgroundRemoval(customBgColor);
                            }
                          }}
                          className={`hover:text-emerald-700 cursor-pointer underline decoration-dotted ${bgOptions.tolerance === 15 ? 'text-emerald-700 font-bold' : ''}`}
                        >
                          Conservative (15%)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBgOptions((prev) => ({ ...prev, tolerance: 30 }));
                            if (bgRemovedApplied) {
                              handleRunBackgroundRemoval(customBgColor);
                            }
                          }}
                          className={`hover:text-emerald-700 cursor-pointer underline decoration-dotted ${bgOptions.tolerance === 30 ? 'text-emerald-700 font-bold' : ''}`}
                        >
                          Standard (30%)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBgOptions((prev) => ({ ...prev, tolerance: 50 }));
                            if (bgRemovedApplied) {
                              handleRunBackgroundRemoval(customBgColor);
                            }
                          }}
                          className={`hover:text-emerald-700 cursor-pointer underline decoration-dotted ${bgOptions.tolerance === 50 ? 'text-emerald-700 font-bold' : ''}`}
                        >
                          Deep Cut (50%)
                        </button>
                      </div>
                    </div>

                    {/* Edge Feathering Slider */}
                    <div className="space-y-1 pt-1 border-t border-gray-100">
                      <div className="flex justify-between text-[11px] text-gray-600">
                        <span>Edge Feathering</span>
                        <span className="font-mono text-emerald-700 font-bold">{bgOptions.feather ?? 2}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.5"
                        value={bgOptions.feather ?? 2}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setBgOptions((prev) => ({ ...prev, feather: val }));
                        }}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                    </div>

                    {/* Re-apply button */}
                    <button
                      type="button"
                      onClick={() => handleRunBackgroundRemoval(customBgColor)}
                      disabled={isRemovingBg}
                      className="w-full mt-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      {isRemovingBg ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Removing Background...
                        </>
                      ) : (
                        <>
                          <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                          Apply Background Removal
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: ONE-CLICK PRESETS */}
              {activeTab === 'presets' && (
                <div className="space-y-3 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/80">
                  <div>
                    <span className="text-xs font-bold text-gray-800 uppercase tracking-wider block mb-1">
                      Quick Enhancement Presets
                    </span>
                    <p className="text-[11px] text-gray-500 leading-snug">
                      Instant lighting fixes designed specifically for Ethiopian biometric identification cards.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleApplyPreset({
                          brightness: 12,
                          contrast: 15,
                          exposure: 8,
                          saturation: 5,
                          sharpness: 25,
                        })
                      }
                      className="p-3 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-gray-900">Official ID Balanced</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Crisp facial contrast, optimized brightness & sharpness for PVC print.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleApplyPreset({
                          brightness: 28,
                          exposure: 22,
                          contrast: 12,
                          saturation: 0,
                          sharpness: 20,
                        })
                      }
                      className="p-3 bg-white hover:bg-amber-50 border border-gray-200 hover:border-amber-300 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Sun className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-gray-900">Brighten Dark Photo</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Lifts underexposed shadows and illuminates facial complexion.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleApplyPreset({
                          brightness: -10,
                          exposure: -12,
                          contrast: 22,
                          saturation: -5,
                          sharpness: 30,
                        })
                      }
                      className="p-3 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Moon className="w-4 h-4 text-indigo-500" />
                        <span className="text-xs font-bold text-gray-900">Tame Glare & Highlights</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Reduces harsh flash washouts and deepens rich portrait details.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleApplyPreset({
                          brightness: 8,
                          contrast: 28,
                          exposure: 4,
                          saturation: 18,
                          sharpness: 35,
                        })
                      }
                      className="p-3 bg-white hover:bg-cyan-50 border border-gray-200 hover:border-cyan-300 rounded-2xl text-left transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-4 h-4 text-cyan-600" />
                        <span className="text-xs font-bold text-gray-900">High Definition Vivid</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Vibrant coloration with maximum clarity and edge unsharp masking.
                      </p>
                    </button>
                  </div>
                </div>
              )}


            </div>
          </div>

          {applySuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-emerald-900 text-xs font-semibold animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Adjusted photo successfully applied to Card!</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer: Apply Targets */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleApplyToCard('primary')}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4 text-emerald-600" />
              Apply to Photo 1 Only
            </button>

            <button
              type="button"
              onClick={() => handleApplyToCard('secondary')}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-white hover:bg-cyan-50 text-cyan-900 border border-cyan-300 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Apply adjusted photo to the bottom right secondary portrait"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
              Apply to Photo 2 Only
            </button>

            <button
              type="button"
              onClick={() => handleApplyToCard('both')}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md ring-2 ring-emerald-400/40 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Layers className="w-4 h-4 text-amber-300" />
              <span>⚡ Apply to Both Photos (Transparent)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
