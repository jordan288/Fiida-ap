import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  Sparkles,
  Upload,
  Download,
  Check,
  RotateCcw,
  Sliders,
  Crosshair,
  Layers,
  Eye,
  CheckCircle2,
  Image as ImageIcon,
  X,
  Palette,
  Shield,
  ShieldCheck,
  Plus,
  Trash2,
  Bookmark,
  Pipette,
} from 'lucide-react';
import {
  BgRemovalOptions,
  DEFAULT_BG_OPTIONS,
  removePhotoBackground,
  autoRemovePhotoBackground,
} from '../utils/imageProcessor';
import { SAMPLE_ID_DATA } from '../data/defaultData';

export interface PhotoOption {
  id?: string;
  name: string;
  photoUrl: string;
}

export interface PhotoBackgroundRemoverProps {
  initialPhotoUrl?: string;
  applicantName?: string;
  availablePhotos?: PhotoOption[];
  onApplyToCard?: (newPhotoUrl: string) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export interface SampleEliminationColor {
  id: string;
  name: string;
  hex: string;
  description: string;
}

// Preset backdrop colors commonly encountered in ID slips, passport photos & studio photography
export const SAMPLE_ELIMINATION_COLORS: SampleEliminationColor[] = [
  { id: 'white', name: 'Studio White', hex: '#FFFFFF', description: 'Pure white studio backdrop' },
  { id: 'off_white', name: 'Off-White / Pearl', hex: '#F8F9FA', description: 'Soft pearl white' },
  { id: 'cream', name: 'Warm Cream', hex: '#FAF5EF', description: 'Warm ivory studio wall' },
  { id: 'fayda_blue', name: 'Fayda Light Blue', hex: '#E0F2FE', description: 'Official Fayda slip light blue' },
  { id: 'sky_blue', name: 'Sky Blue', hex: '#BAE6FD', description: 'Passport sky blue' },
  { id: 'soft_blue', name: 'Studio Azure', hex: '#93C5FD', description: 'Vibrant studio blue' },
  { id: 'royal_blue', name: 'Royal Navy', hex: '#1E40AF', description: 'Deep dark blue studio backdrop' },
  { id: 'light_slate', name: 'Light Slate', hex: '#F1F5F9', description: 'Very light neutral gray' },
  { id: 'studio_gray', name: 'Studio Gray', hex: '#E2E8F0', description: 'Classic studio gray screen' },
  { id: 'neutral_gray', name: 'Neutral Gray', hex: '#CBD5E1', description: 'Medium studio gray' },
  { id: 'slate_gray', name: 'Slate Gray', hex: '#94A3B8', description: 'Deeper slate backdrop' },
  { id: 'ivory_beige', name: 'Ivory / Beige', hex: '#F5F5DC', description: 'Light beige studio wall' },
  { id: 'tan', name: 'Khaki / Tan', hex: '#E7E5E4', description: 'Warm tan/khaki backdrop' },
  { id: 'cyan', name: 'Passport Cyan', hex: '#06B6D4', description: 'Vivid cyan backdrop' },
  { id: 'crimson', name: 'Studio Red', hex: '#991B1B', description: 'Deep red studio backdrop' },
  { id: 'chroma_green', name: 'Chroma Green', hex: '#22C55E', description: 'Green screen backdrop' },
];

const PRESET_OUTPUT_COLORS = [
  { id: 'transparent', label: 'Transparent Alpha', value: 'transparent', icon: '🏁' },
  { id: 'white', label: 'Studio White (#FFF)', value: '#ffffff', icon: '⚪' },
  { id: 'blue', label: 'ID Sky Blue', value: '#dbeafe', icon: '🔵' },
  { id: 'gray', label: 'Neutral Gray', value: '#f3f4f6', icon: '🔘' },
];

const STORAGE_KEY_SAVED_COLORS = 'fayda_saved_elimination_colors_v1';
const DEFAULT_SAVED_COLORS = ['#FFFFFF', '#E0F2FE', '#F8F9FA', '#BAE6FD', '#E2E8F0'];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const PhotoBackgroundRemover: React.FC<PhotoBackgroundRemoverProps> = ({
  initialPhotoUrl,
  applicantName = 'Applicant',
  availablePhotos = [],
  onApplyToCard,
  onClose,
  isModal = false,
}) => {
  // Original source
  const [currentOriginal, setCurrentOriginal] = useState<string>(
    initialPhotoUrl || SAMPLE_ID_DATA.photoUrl
  );

  // Result cutout
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isApplied, setIsApplied] = useState<boolean>(false);

  // Tuning options
  const [tolerance, setTolerance] = useState<number>(30);
  const [feather, setFeather] = useState<number>(2);
  const [selectedOutputBg, setSelectedOutputBg] = useState<string>('transparent');
  const [customOutputHex, setCustomOutputHex] = useState<string>('#ffffff');
  const [samplePoint, setSamplePoint] = useState<{ x: number; y: number } | null>(null);
  const [isEyedropperActive, setIsEyedropperActive] = useState<boolean>(false);
  const [sampledColorHex, setSampledColorHex] = useState<string | null>(null);

  // Clothing protection state (solves: "remove only the background some times the persones clothe matches the background")
  const [protectClothes, setProtectClothes] = useState<boolean>(true);
  const [clotheShieldStrength, setClotheShieldStrength] = useState<number>(75);

  // Multi-color elimination targets state (solves: "add many sample colores to eliminate and save the colores on that section")
  const [selectedEliminationHexes, setSelectedEliminationHexes] = useState<string[]>([]);
  const [savedEliminationColors, setSavedEliminationColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SAVED_COLORS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_SAVED_COLORS;
  });

  const [customAddColorHex, setCustomAddColorHex] = useState<string>('#FFFFFF');
  const [colorAddFeedback, setColorAddFeedback] = useState<string>('');

  // View state
  const [viewMode, setViewMode] = useState<'side-by-side' | 'cutout-only' | 'original-only'>('side-by-side');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);

  // Persist saved colors to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED_COLORS, JSON.stringify(savedEliminationColors));
    } catch {
      // ignore
    }
  }, [savedEliminationColors]);

  // Update initial image if changed
  useEffect(() => {
    if (initialPhotoUrl) {
      setCurrentOriginal(initialPhotoUrl);
      setCutoutUrl(null);
      setIsApplied(false);
      setSamplePoint(null);
      setSampledColorHex(null);
    }
  }, [initialPhotoUrl]);

  // Execute Background Removal with clothing protection & target colors
  const runRemoval = async (overrides?: Partial<BgRemovalOptions> & {
    customEliminationHexes?: string[];
  }) => {
    if (!currentOriginal) return;
    setIsProcessing(true);
    setIsApplied(false);

    try {
      const activeOutputColor = selectedOutputBg === 'custom' ? customOutputHex : selectedOutputBg;
      const hexesToUse = overrides?.customEliminationHexes ?? selectedEliminationHexes;

      const targetColors: Array<{ r: number; g: number; b: number }> = [];
      for (const hex of hexesToUse) {
        const rgb = hexToRgb(hex);
        if (rgb) targetColors.push(rgb);
      }

      const opts: BgRemovalOptions = {
        tolerance: overrides?.tolerance ?? tolerance,
        feather: overrides?.feather ?? feather,
        fillColor: overrides?.fillColor ?? activeOutputColor,
        samplePoint: overrides?.samplePoint ?? (hexesToUse.length === 0 ? (samplePoint ?? undefined) : undefined),
        targetColors: targetColors.length > 0 ? targetColors : undefined,
        protectClothes: overrides?.protectClothes ?? protectClothes,
        clotheShieldStrength: overrides?.clotheShieldStrength ?? clotheShieldStrength,
        edgeSmoothing: true,
      };

      const result = await removePhotoBackground(currentOriginal, opts);
      setCutoutUrl(result);
    } catch (err) {
      console.error('Background removal failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Run automatically on first render if no cutout yet
  useEffect(() => {
    if (!cutoutUrl && currentOriginal) {
      runRemoval();
    }
  }, [currentOriginal]);

  // Toggle or select a color for elimination
  const handleToggleEliminationColor = (hex: string) => {
    const norm = hex.toUpperCase();
    const isSelected = selectedEliminationHexes.includes(norm);
    const updated = isSelected
      ? selectedEliminationHexes.filter((h) => h !== norm)
      : [...selectedEliminationHexes, norm];

    setSelectedEliminationHexes(updated);
    setSamplePoint(null); // Explicit color overrides sample point
    runRemoval({ customEliminationHexes: updated });
  };

  // Select a single color exclusively for elimination
  const handleSelectExclusiveColor = (hex: string) => {
    const norm = hex.toUpperCase();
    setSelectedEliminationHexes([norm]);
    setSamplePoint(null);
    runRemoval({ customEliminationHexes: [norm] });
  };

  // Save a color to user's saved colors section
  const handleSaveColor = (hex: string) => {
    const norm = hex.toUpperCase();
    if (!savedEliminationColors.includes(norm)) {
      const updated = [norm, ...savedEliminationColors];
      setSavedEliminationColors(updated);
      setColorAddFeedback(`Saved ${norm}!`);
      setTimeout(() => setColorAddFeedback(''), 2500);
    } else {
      setColorAddFeedback(`${norm} is already in your saved list.`);
      setTimeout(() => setColorAddFeedback(''), 2500);
    }
  };

  // Remove a color from saved colors
  const handleDeleteSavedColor = (hex: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const norm = hex.toUpperCase();
    const updated = savedEliminationColors.filter((h) => h !== norm);
    setSavedEliminationColors(updated);
    if (selectedEliminationHexes.includes(norm)) {
      const updatedSelected = selectedEliminationHexes.filter((h) => h !== norm);
      setSelectedEliminationHexes(updatedSelected);
      runRemoval({ customEliminationHexes: updatedSelected });
    }
  };

  // Reset saved colors to defaults
  const handleResetSavedColors = () => {
    setSavedEliminationColors(DEFAULT_SAVED_COLORS);
    setColorAddFeedback('Reset to default backdrop colors');
    setTimeout(() => setColorAddFeedback(''), 2500);
  };

  // Eyedropper click on image
  const handleOriginalImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isEyedropperActive || !originalImageRef.current) return;

    const img = originalImageRef.current;
    const rect = img.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const naturalX = Math.round((clientX / rect.width) * img.naturalWidth);
    const naturalY = Math.round((clientY / rect.height) * img.naturalHeight);

    // Read pixel color from canvas
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pixel = ctx.getImageData(naturalX, naturalY, 1, 1).data;
        const sampledHex = rgbToHex(pixel[0], pixel[1], pixel[2]).toUpperCase();
        setSampledColorHex(sampledHex);
        setCustomAddColorHex(sampledHex);

        const pt = { x: naturalX, y: naturalY };
        setSamplePoint(pt);
        setIsEyedropperActive(false);

        // Add this sampled color to selected elimination colors
        setSelectedEliminationHexes([sampledHex]);
        runRemoval({
          samplePoint: pt,
          customEliminationHexes: [sampledHex],
        });
      }
    } catch {
      const pt = { x: naturalX, y: naturalY };
      setSamplePoint(pt);
      setIsEyedropperActive(false);
      runRemoval({ samplePoint: pt });
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCurrentOriginal(result);
        setCutoutUrl(null);
        setIsApplied(false);
        setSamplePoint(null);
        setSampledColorHex(null);
        setTimeout(() => {
          autoRemovePhotoBackground(result, {
            protectClothes,
            clotheShieldStrength,
          }).then((cut) => setCutoutUrl(cut));
        }, 100);
      }
    };
    reader.readAsDataURL(file);
  };

  // Download Transparent PNG
  const handleDownloadCutout = () => {
    if (!cutoutUrl) return;
    const link = document.createElement('a');
    link.href = cutoutUrl;
    link.download = `${applicantName.replace(/\s+/g, '_')}_cutout_transparent.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Apply to Card
  const handleApply = () => {
    if (!cutoutUrl || !onApplyToCard) return;
    onApplyToCard(cutoutUrl);
    setIsApplied(true);
    setTimeout(() => setIsApplied(false), 3000);
  };

  // Reset all parameters
  const handleReset = () => {
    setTolerance(30);
    setFeather(2);
    setSelectedOutputBg('transparent');
    setSamplePoint(null);
    setSampledColorHex(null);
    setIsEyedropperActive(false);
    setSelectedEliminationHexes([]);
    setProtectClothes(true);
    setClotheShieldStrength(75);
    runRemoval({
      tolerance: 30,
      feather: 2,
      fillColor: 'transparent',
      samplePoint: undefined,
      customEliminationHexes: [],
      protectClothes: true,
      clotheShieldStrength: 75,
    });
  };

  return (
    <div
      className={
        isModal
          ? 'fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto'
          : 'w-full'
      }
    >
      <div
        className={`bg-slate-900 text-white rounded-3xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col ${
          isModal ? 'max-w-6xl w-full max-h-[94vh]' : 'w-full'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Normal Photo Background Remover
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  100% Transparent Cutout
                </span>
                {protectClothes && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    <ShieldCheck className="w-3 h-3" /> Clothes Shield Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Eliminates studio backdrops, protects matching clothing fibers, and saves custom color profiles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Photo Selection Bar (if batch items available) */}
        {availablePhotos.length > 0 && (
          <div className="px-6 py-2.5 bg-slate-950/50 border-b border-slate-800 flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
              Applicant Photos:
            </span>
            <div className="flex items-center gap-2">
              {availablePhotos.map((p, idx) => (
                <button
                  key={p.id || idx}
                  type="button"
                  onClick={() => {
                    setCurrentOriginal(p.photoUrl);
                    setCutoutUrl(null);
                    setSamplePoint(null);
                    setSampledColorHex(null);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    currentOriginal === p.photoUrl
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <img
                    src={p.photoUrl}
                    alt={p.name}
                    className="w-5 h-5 rounded-md object-cover border border-white/20"
                  />
                  <span className="truncate max-w-[100px]">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Workspace Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left / Center Column: Previews & Visualizer (6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            {/* View Mode Bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('side-by-side')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === 'side-by-side'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Side by Side
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cutout-only')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === 'cutout-only'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cutout Only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('original-only')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    viewMode === 'original-only'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Original Only
                </button>
              </div>

              {/* Upload New Photo Button */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>

            {/* Canvas Preview Box */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 min-h-[360px] flex items-center justify-center relative overflow-hidden">
              {viewMode === 'side-by-side' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full h-full">
                  {/* Original Image Box */}
                  <div className="flex flex-col items-center justify-center gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 relative">
                    <div className="w-full flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Original Photo
                      </span>
                      {sampledColorHex && (
                        <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block border border-white/40"
                            style={{ backgroundColor: sampledColorHex }}
                          />
                          {sampledColorHex}
                        </span>
                      )}
                    </div>

                    <div className="relative group max-h-[280px] flex items-center justify-center">
                      <img
                        ref={originalImageRef}
                        src={currentOriginal}
                        alt="Original Portrait"
                        onClick={handleOriginalImageClick}
                        className={`max-h-[260px] w-auto rounded-lg object-contain border border-slate-700 shadow-md ${
                          isEyedropperActive ? 'cursor-crosshair ring-2 ring-emerald-400' : ''
                        }`}
                      />
                      {isEyedropperActive && (
                        <div className="absolute top-2 left-2 bg-slate-900/90 text-emerald-300 text-[10px] font-bold px-2 py-1 rounded-md border border-emerald-500/50 shadow-lg pointer-events-none">
                          Click backdrop pixel to sample color
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cutout Result Box with Checkerboard Transparency */}
                  <div className="flex flex-col items-center justify-center gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                    <div className="w-full flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cutout Result
                      </span>
                      {selectedOutputBg === 'transparent' && (
                        <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          Alpha: 100%
                        </span>
                      )}
                    </div>

                    <div
                      className="relative group max-h-[280px] w-full flex items-center justify-center rounded-lg overflow-hidden border border-slate-700 p-1"
                      style={{
                        backgroundColor:
                          selectedOutputBg === 'transparent'
                            ? undefined
                            : selectedOutputBg === 'custom'
                            ? customOutputHex
                            : selectedOutputBg,
                        backgroundImage:
                          selectedOutputBg === 'transparent'
                            ? `linear-gradient(45deg, #1e293b 25%, transparent 25%),
                               linear-gradient(-45deg, #1e293b 25%, transparent 25%),
                               linear-gradient(45deg, transparent 75%, #1e293b 75%),
                               linear-gradient(-45deg, transparent 75%, #1e293b 75%)`
                            : undefined,
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                      }}
                    >
                      {isProcessing ? (
                        <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-emerald-400">
                          <Sparkles className="w-6 h-6 animate-spin" />
                          <span className="text-xs font-semibold">Eliminating background...</span>
                        </div>
                      ) : cutoutUrl ? (
                        <img
                          src={cutoutUrl}
                          alt="Cutout Transparent"
                          className="max-h-[260px] w-auto rounded-lg object-contain"
                        />
                      ) : (
                        <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-slate-500">
                          <Scissors className="w-6 h-6" />
                          <span className="text-xs">Click "Eliminate Background"</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : viewMode === 'cutout-only' ? (
                /* Cutout Only */
                <div
                  className="w-full h-[320px] flex items-center justify-center rounded-xl p-2"
                  style={{
                    backgroundColor:
                      selectedOutputBg === 'transparent'
                        ? undefined
                        : selectedOutputBg === 'custom'
                        ? customOutputHex
                        : selectedOutputBg,
                    backgroundImage:
                      selectedOutputBg === 'transparent'
                        ? `linear-gradient(45deg, #1e293b 25%, transparent 25%),
                           linear-gradient(-45deg, #1e293b 25%, transparent 25%),
                           linear-gradient(45deg, transparent 75%, #1e293b 75%),
                           linear-gradient(-45deg, transparent 75%, #1e293b 75%)`
                        : undefined,
                    backgroundSize: '16px 16px',
                  }}
                >
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-2 text-emerald-400">
                      <Sparkles className="w-8 h-8 animate-spin" />
                      <span className="text-xs">Eliminating background...</span>
                    </div>
                  ) : cutoutUrl ? (
                    <img
                      src={cutoutUrl}
                      alt="Cutout Large"
                      className="max-h-[300px] w-auto object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-500">No cutout yet</span>
                  )}
                </div>
              ) : (
                /* Original Only */
                <div className="w-full h-[320px] flex items-center justify-center">
                  <img
                    ref={originalImageRef}
                    src={currentOriginal}
                    alt="Original Photo Large"
                    onClick={handleOriginalImageClick}
                    className={`max-h-[300px] w-auto rounded-lg object-contain border border-slate-700 ${
                      isEyedropperActive ? 'cursor-crosshair ring-2 ring-emerald-400' : ''
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Hint & Eyedropper Controls Bar */}
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEyedropperActive(!isEyedropperActive)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isEyedropperActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  <Pipette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEyedropperActive ? 'Click Image to Pick...' : 'Eyedropper'}</span>
                </button>

                {sampledColorHex && (
                  <button
                    type="button"
                    onClick={() => handleSaveColor(sampledColorHex)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer"
                    title="Save this sampled color to your elimination library"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Save {sampledColorHex}</span>
                  </button>
                )}
              </div>

              <span className="text-[11px] text-slate-400">
                {selectedEliminationHexes.length > 0 ? (
                  <span className="text-emerald-400 font-medium">
                    Targeting: {selectedEliminationHexes.join(', ')}
                  </span>
                ) : (
                  <span>Auto-detecting perimeter backdrop</span>
                )}
              </span>
            </div>
          </div>

          {/* Right Column: Colors, Clothing Protection & Sliders (6 cols) */}
          <div className="lg:col-span-6 flex flex-col gap-4 overflow-y-auto pr-1">
            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => runRemoval()}
              disabled={isProcessing}
              className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 hover:brightness-105 active:scale-[0.99] shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>{cutoutUrl ? 'Re-run Background Removal' : '1-Click Eliminate Background'}</span>
            </button>

            {/* SECTION 1: CLOTHING & TORSO PROTECTION */}
            {/* Solves: "remove only the background some times the persones clothe matches the background" */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      Clothing & Torso Shield (የልብስ ጥበቃ)
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Protects white/matching clothes when shirt matches backdrop
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={protectClothes}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setProtectClothes(val);
                      runRemoval({ protectClothes: val });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {protectClothes && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 text-[11px]">
                      Clothes Protection Strength:
                    </span>
                    <span className="font-mono text-blue-400 font-bold text-xs">
                      {clotheShieldStrength}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={clotheShieldStrength}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setClotheShieldStrength(val);
                      runRemoval({ clotheShieldStrength: val });
                    }}
                    className="w-full accent-blue-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Balanced</span>
                    <span>High Shield (White Shirts Safe)</span>
                    <span>Strict (100%)</span>
                  </div>
                  <p className="text-[10px] text-blue-300/80 bg-blue-950/40 p-2 rounded-xl border border-blue-900/50">
                    ✓ <strong>Bottom border locked:</strong> The bottom edge is shielded so flood fill will never start inside the person's shirt or suit. Collar & shoulder seams are reinforced.
                  </p>
                </div>
              )}
            </div>

            {/* SECTION 2: SAVED ELIMINATION COLORS */}
            {/* Solves: "add many sample colores to eliminate and save the colores on that section" */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Bookmark className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-200">
                    Saved Elimination Colors ({savedEliminationColors.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {colorAddFeedback && (
                    <span className="text-[10px] text-emerald-400 font-medium animate-fade-in">
                      {colorAddFeedback}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleResetSavedColors}
                    className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>

              {/* Saved Colors Chips */}
              <div className="flex flex-wrap gap-2">
                {savedEliminationColors.map((hex) => {
                  const isSelected = selectedEliminationHexes.includes(hex.toUpperCase());
                  return (
                    <div
                      key={hex}
                      onClick={() => handleToggleEliminationColor(hex)}
                      className={`group flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/80 shadow-xs'
                          : 'bg-slate-900 hover:bg-slate-800/90 text-slate-300 border-slate-700'
                      }`}
                      title={`Click to toggle eliminating ${hex}`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0 shadow-2xs"
                        style={{ backgroundColor: hex }}
                      />
                      <span>{hex}</span>
                      {isSelected && <Check className="w-3 h-3 text-emerald-400 ml-0.5" />}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSavedColor(hex, e)}
                        className="opacity-40 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded-md hover:bg-slate-800 transition-all cursor-pointer ml-1"
                        title="Delete from saved"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Color to Saved Section */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-slate-400">Add New Color:</span>
                <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-xl border border-slate-700">
                  <input
                    type="color"
                    value={customAddColorHex}
                    onChange={(e) => setCustomAddColorHex(e.target.value.toUpperCase())}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    title="Choose color picker"
                  />
                  <input
                    type="text"
                    value={customAddColorHex}
                    onChange={(e) => setCustomAddColorHex(e.target.value.toUpperCase())}
                    placeholder="#FFFFFF"
                    className="w-20 bg-transparent text-xs font-mono text-white outline-hidden uppercase"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveColor(customAddColorHex)}
                  className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Save Color</span>
                </button>
              </div>
            </div>

            {/* SECTION 3: MANY SAMPLE BACKDROP COLORS PALETTE */}
            {/* Solves: "add many sample colores to eliminate" */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    Sample Backdrop Palette to Eliminate
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Click any sample color to eliminate that background tone
                  </span>
                </div>

                {selectedEliminationHexes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEliminationHexes([]);
                      runRemoval({ customEliminationHexes: [] });
                    }}
                    className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    Clear All ({selectedEliminationHexes.length})
                  </button>
                )}
              </div>

              {/* Grid of sample colors */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[190px] overflow-y-auto pr-1">
                {SAMPLE_ELIMINATION_COLORS.map((sc) => {
                  const isSelected = selectedEliminationHexes.includes(sc.hex.toUpperCase());
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => handleToggleEliminationColor(sc.hex)}
                      className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/80 shadow-xs'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                      title={sc.description}
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span
                          className="w-4 h-4 rounded-full border border-white/30 shrink-0 shadow-xs"
                          style={{ backgroundColor: sc.hex }}
                        />
                        <div className="truncate">
                          <span className="text-[11px] font-semibold block leading-tight truncate">
                            {sc.name}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 block leading-tight">
                            {sc.hex}
                          </span>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 4: TUNING SLIDERS (Tolerance & Edge Feathering) */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  Cutout Precision & Edge Softness
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                  title="Reset sliders"
                >
                  <RotateCcw className="w-3 h-3" /> Reset All
                </button>
              </div>

              {/* Color Tolerance Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Color Sensitivity (Tolerance)</span>
                  <span className="font-mono text-emerald-400 font-bold">{tolerance}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="2"
                  value={tolerance}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setTolerance(val);
                    if (cutoutUrl) runRemoval({ tolerance: val });
                  }}
                  className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Subtle (Keep More)</span>
                  <span>Default (30%)</span>
                  <span>Aggressive (Remove More)</span>
                </div>
              </div>

              {/* Edge Feathering Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Edge Feathering / Softness</span>
                  <span className="font-mono text-emerald-400 font-bold">{feather} px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={feather}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setFeather(val);
                    if (cutoutUrl) runRemoval({ feather: val });
                  }}
                  className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Crisp (0px)</span>
                  <span>Smooth Natural (2px)</span>
                  <span>Soft (6px)</span>
                </div>
              </div>
            </div>

            {/* SECTION 5: OUTPUT BACKDROP (Replacement or Transparent) */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                <span>Output Replacement Backdrop</span>
                <span className="text-[10px] font-normal text-slate-400">Default is 100% Transparent</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {PRESET_OUTPUT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedOutputBg(c.value);
                      if (cutoutUrl) runRemoval({ fillColor: c.value });
                    }}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      selectedOutputBg === c.value
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-xs'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{c.icon}</span>
                      <span className="text-xs font-semibold">{c.label}</span>
                    </div>
                    {selectedOutputBg === c.value && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Bar (Download & Apply) */}
            <div className="space-y-2 pt-1">
              {onApplyToCard && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!cutoutUrl}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    cutoutUrl
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  {isApplied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>Applied to ID Card Successfully!</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Apply Cutout to ID Card</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadCutout}
                disabled={!cutoutUrl}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                  cutoutUrl
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-600 shadow-xs'
                    : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Download Transparent PNG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
