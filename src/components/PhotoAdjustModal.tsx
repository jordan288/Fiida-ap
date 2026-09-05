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
  Palette
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
  onApplyPhoto: (newPhotoUrl: string, target: 'primary' | 'secondary' | 'both') => void;
  applicantName?: string;
}

export const PhotoAdjustModal: React.FC<PhotoAdjustModalProps> = ({
  isOpen,
  onClose,
  originalPhotoUrl,
  onApplyPhoto,
  applicantName = 'Applicant',
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

  // Preview / Comparison state
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'adjust' | 'background' | 'presets'>('adjust');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  // Synchronize when modal opens with new photo
  useEffect(() => {
    if (isOpen) {
      setBasePhotoSrc(originalPhotoUrl);
      setProcessedPhotoUrl(originalPhotoUrl);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setBgOptions(DEFAULT_BG_OPTIONS);
      setBgRemovedApplied(false);
      setApplySuccess(false);
    }
  }, [isOpen, originalPhotoUrl]);

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
        ...bgOptions,
        fillColor: targetFill,
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
              <div className="relative my-auto py-3 flex items-center justify-center">
                <div
                  className="w-48 h-60 sm:w-56 sm:h-70 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700 relative flex items-center justify-center"
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
                  <img
                    src={showOriginal ? originalPhotoUrl : processedPhotoUrl}
                    alt="Applicant Portrait"
                    className="w-full h-full object-cover transition-opacity duration-150"
                  />

                  {isProcessing && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-2xs flex items-center justify-center">
                      <span className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                    </div>
                  )}

                  {bgRemovedApplied && !showOriginal && (
                    <div className="absolute top-2 left-2 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Scissors className="w-3 h-3" />
                      Cutout Active
                    </div>
                  )}
                </div>
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
                      value={adjustments.brightness}
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
                      value={adjustments.exposure}
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
                      value={adjustments.contrast}
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
                        value={adjustments.saturation}
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
                        value={adjustments.temperature}
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
                      value={adjustments.sharpness}
                      onChange={(e) => handleSliderChange('sharpness', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: BACKGROUND REMOVAL */}
              {activeTab === 'background' && (
                <div className="space-y-4 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/80">
                  <div>
                    <span className="text-xs font-bold text-gray-800 uppercase tracking-wider block mb-1">
                      Smart Background Cutout
                    </span>
                    <p className="text-[11px] text-gray-500 leading-snug">
                      Isolates the applicant and replaces background with pure studio white or transparent canvas.
                    </p>
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
                        Removes solid/photo backdrop to transparent alpha.
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
                        Clean pure passport white standard background.
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
                        Official Ethiopian biometric studio sky blue tint.
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
                        Soft light neutral gray for seamless card blending.
                      </p>
                    </button>
                  </div>

                  {/* Cutout Precision Calibration Slider */}
                  <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-800">
                      <span>Cutout Color Tolerance (Sensitivity)</span>
                      <span className="font-mono text-emerald-700 font-bold">{bgOptions.tolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      value={bgOptions.tolerance}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setBgOptions((prev) => ({ ...prev, tolerance: val }));
                      }}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Strict (5%)</span>
                      <span>Balanced (32%)</span>
                      <span>Aggressive (80%)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRunBackgroundRemoval(customBgColor)}
                      disabled={isRemovingBg}
                      className="w-full mt-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isRemovingBg ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Extracting Subject...
                        </>
                      ) : (
                        <>
                          <Scissors className="w-3 h-3 text-emerald-400" />
                          Re-Apply Cutout with New Tolerance
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
              className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Apply to Photo 1 (Primary)
            </button>

            <button
              type="button"
              onClick={() => handleApplyToCard('secondary')}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
              title="Apply adjusted photo to the bottom right secondary portrait"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apply to Photo 2 (Security)
            </button>

            <button
              type="button"
              onClick={() => handleApplyToCard('both')}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Apply to Both Photos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
