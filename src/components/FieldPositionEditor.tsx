import React from 'react';
import { 
  Move, 
  Sliders, 
  Type, 
  Palette, 
  RotateCcw, 
  Maximize2, 
  AlignHorizontalJustifyCenter,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Eye,
  Check
} from 'lucide-react';
import { CoordinatesConfig, FieldCoordinate, MediaCoordinate } from '../types';
import { DEFAULT_COORDINATES } from '../data/defaultData';

interface FieldPositionEditorProps {
  fieldId: string;
  config: CoordinatesConfig;
  setConfig: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  onClose?: () => void;
  onFocusCard?: () => void;
}

export const FieldPositionEditor: React.FC<FieldPositionEditorProps> = ({
  fieldId,
  config,
  setConfig,
  onClose,
  onFocusCard,
}) => {
  const isMedia = 
    fieldId === 'photoFront' || 
    fieldId === 'photoFrontSecondary' || 
    fieldId === 'frontBarcode' || 
    fieldId === 'qrCodeBack' || 
    fieldId === 'backFanCut' ||
    Boolean(config.media[fieldId]);
    
  const field: FieldCoordinate | undefined = config.fields[fieldId];
  const media: MediaCoordinate | undefined = config.media[fieldId] || DEFAULT_COORDINATES.media[fieldId] || (
    fieldId === 'frontBarcode'
      ? { id: 'frontBarcode', label: 'Front 1D Barcode (ባርኮድ)', side: 'front', x: 485, y: 520, width: 440, height: 40, borderRadius: 4 }
      : fieldId === 'backFanCut'
      ? { id: 'backFanCut', label: 'Back FAN Cutter Layer (የተቆረጠ ጎን ሌየር)', side: 'back', x: 45, y: 505, width: 440, height: 95, borderRadius: 8 }
      : fieldId === 'photoFrontSecondary'
      ? { id: 'photoFrontSecondary', label: 'Smaller Photo (Photo 2 • አነስተኛ ፎቶ)', side: 'front', x: 825, y: 435, width: 145, height: 175, borderRadius: 0 }
      : fieldId === 'qrCodeBack'
      ? { id: 'qrCodeBack', label: 'Digital Biometric QR Matrix', side: 'back', x: 465, y: 60, width: 470, height: 470, borderRadius: 8 }
      : undefined
  );

  if (!field && !media) return null;

  const currentX = isMedia ? (media?.x ?? 0) : field!.x;
  const currentY = isMedia ? (media?.y ?? 0) : field!.y;
  const currentFontSize = field?.fontSize || 20;
  const currentColor = field?.color || '#111827';
  const currentWidth = media?.width || (fieldId === 'frontBarcode' ? 440 : fieldId === 'backFanCut' ? 440 : fieldId === 'qrCodeBack' ? 470 : fieldId === 'photoFrontSecondary' ? 145 : field?.maxWidth || 300);
  const currentHeight = media?.height || (fieldId === 'frontBarcode' ? 40 : fieldId === 'backFanCut' ? 95 : fieldId === 'qrCodeBack' ? 470 : fieldId === 'photoFrontSecondary' ? 175 : 200);
  const currentRadius = media?.borderRadius !== undefined ? media.borderRadius : 0;
  const currentOpacity = media?.opacity !== undefined ? media.opacity : 1.0;
  const currentFit = media?.fit || 'fill';
  const currentScaleX = media?.scaleX ?? 1.0;
  const currentLetterSpacing = media?.letterSpacing ?? 0.08;

  const label = isMedia ? (media?.label || fieldId) : field!.label;
  const side = isMedia ? (media?.side || 'front') : field!.side;

  const updateProp = (prop: string, val: any) => {
    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...(prev.media[fieldId] || media || {
              id: fieldId,
              label: fieldId,
              side: 'front',
              x: 0,
              y: 0,
              width: currentWidth,
              height: currentHeight,
            }),
            [prop]: val,
          },
        },
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...prev.fields[fieldId],
            [prop]: val,
          },
        },
      }));
    }
  };

  const nudge = (dx: number, dy: number) => {
    const newX = Math.max(0, Math.min(config.canvasWidth - 10, currentX + dx));
    const newY = Math.max(0, Math.min(config.canvasHeight - 10, currentY + dy));
    updateProp('x', newX);
    updateProp('y', newY);
  };

  const centerHorizontally = () => {
    const itemWidth = isMedia ? media!.width : (field!.maxWidth || 250);
    const newX = Math.max(0, Math.round((config.canvasWidth - itemWidth) / 2));
    updateProp('x', newX);
  };

  const resetField = () => {
    if (isMedia && DEFAULT_COORDINATES.media[fieldId]) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: { ...DEFAULT_COORDINATES.media[fieldId] },
        },
      }));
    } else if (DEFAULT_COORDINATES.fields[fieldId]) {
      setConfig((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: { ...DEFAULT_COORDINATES.fields[fieldId] },
        },
      }));
    }
  };

  const colorPresets = [
    '#111827', // Slate 900
    '#1f2937', // Gray 800
    '#0f172a', // Slate 950
    '#065f46', // Emerald 800
    '#0e7490', // Cyan 700
    '#854d0e', // Yellow 800
    '#4b5563', // Gray 600
  ];

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-700/80 shadow-xl space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
            <Move className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                side === 'front' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {side}
              </span>
            </h4>
            <p className="text-[10px] text-slate-400 font-mono">
              Position: ({currentX}px, {currentY}px)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={resetField}
            title="Reset this field to default position"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-xs font-bold transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Coordinate Sliders & Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* X Position */}
        <div className="space-y-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">X Position (Horizontal)</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={config.canvasWidth}
                value={currentX ?? 0}
                onChange={(e) => updateProp('x', Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded text-emerald-400 font-mono font-bold text-right focus:outline-hidden focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 font-mono">px</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={config.canvasWidth}
            value={currentX ?? 0}
            onChange={(e) => updateProp('x', parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudge(-10, 0)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => nudge(-1, 0)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                -1
              </button>
            </div>
            <button
              type="button"
              onClick={centerHorizontally}
              title="Center Horizontally on Card"
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 rounded border border-emerald-800 transition-colors"
            >
              <AlignHorizontalJustifyCenter className="w-2.5 h-2.5" />
              Center
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudge(1, 0)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => nudge(10, 0)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                +10
              </button>
            </div>
          </div>
        </div>

        {/* Y Position */}
        <div className="space-y-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Y Position (Vertical)</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={config.canvasHeight}
                value={currentY ?? 0}
                onChange={(e) => updateProp('y', Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded text-cyan-400 font-mono font-bold text-right focus:outline-hidden focus:border-cyan-500"
              />
              <span className="text-[10px] text-slate-500 font-mono">px</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={config.canvasHeight}
            value={currentY ?? 0}
            onChange={(e) => updateProp('y', parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudge(0, -10)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => nudge(0, -1)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                -1
              </button>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Height: {config.canvasHeight}px</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudge(0, 1)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => nudge(0, 10)}
                className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
              >
                +10
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* D-Pad Quick Nudge Controller */}
      <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-300 block">Directional Nudge</span>
          <p className="text-[10px] text-slate-500">
            Click arrows to micro-adjust position on template
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* D-Pad Buttons */}
          <div className="grid grid-cols-3 gap-1 w-24">
            <div></div>
            <button
              type="button"
              onClick={() => nudge(0, -2)}
              className="p-1.5 bg-slate-800 hover:bg-emerald-600 rounded text-white flex items-center justify-center transition-colors shadow-xs"
              title="Nudge Up"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <div></div>

            <button
              type="button"
              onClick={() => nudge(-2, 0)}
              className="p-1.5 bg-slate-800 hover:bg-emerald-600 rounded text-white flex items-center justify-center transition-colors shadow-xs"
              title="Nudge Left"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <div className="w-full h-full flex items-center justify-center text-[9px] font-mono text-slate-500 bg-slate-900 rounded">
              2px
            </div>
            <button
              type="button"
              onClick={() => nudge(2, 0)}
              className="p-1.5 bg-slate-800 hover:bg-emerald-600 rounded text-white flex items-center justify-center transition-colors shadow-xs"
              title="Nudge Right"
            >
              <ArrowRight className="w-3 h-3" />
            </button>

            <div></div>
            <button
              type="button"
              onClick={() => nudge(0, 2)}
              className="p-1.5 bg-slate-800 hover:bg-emerald-600 rounded text-white flex items-center justify-center transition-colors shadow-xs"
              title="Nudge Down"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <div></div>
          </div>
        </div>
      </div>

      {/* Typography & Dimensions */}
      {!isMedia ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Font Size */}
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-amber-400" />
                Font Size
              </span>
              <span className="font-mono font-bold text-amber-400">{currentFontSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateProp('fontSize', Math.max(10, currentFontSize - 1))}
                className="w-7 h-6 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold"
              >
                -
              </button>
              <input
                type="range"
                min={10}
                max={44}
                value={currentFontSize ?? 20}
                onChange={(e) => updateProp('fontSize', parseInt(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <button
                type="button"
                onClick={() => updateProp('fontSize', Math.min(48, currentFontSize + 1))}
                className="w-7 h-6 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Color Picker */}
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-pink-400" />
                Text Color
              </span>
              <div className="flex items-center gap-1">
                <div
                  className="w-4 h-4 rounded-full border border-white/40"
                  style={{ backgroundColor: currentColor }}
                />
                <span className="font-mono text-[10px] text-slate-400">{currentColor}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {colorPresets.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateProp('color', c)}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    currentColor.toLowerCase() === c.toLowerCase()
                      ? 'scale-125 border-emerald-400 ring-2 ring-emerald-500/50'
                      : 'border-slate-700 hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={currentColor.startsWith('#') ? currentColor : '#111827'}
                onChange={(e) => updateProp('color', e.target.value)}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                title="Custom color"
              />
            </div>
          </div>

          {/* Orientation / Rotation selector */}
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5 col-span-1 sm:col-span-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Orientation / Angle</span>
              <span className="font-mono text-emerald-400 text-[11px] font-bold">
                {field?.rotation === -90 ? 'Vertical (-90° Left Margin)' : field?.rotation === 90 ? 'Vertical (+90°)' : 'Horizontal (0°)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => updateProp('rotation', 0)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !field?.rotation || field?.rotation === 0
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Horizontal (0°)
              </button>
              <button
                type="button"
                onClick={() => updateProp('rotation', -90)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  field?.rotation === -90
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Vertical (-90°)
              </button>
              <button
                type="button"
                onClick={() => updateProp('rotation', 90)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  field?.rotation === 90
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Vertical (+90°)
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Media Dimensions (Photo, Barcode, Fan Cut, or QR) */
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Width */}
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Width</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={10}
                  max={1000}
                  value={currentWidth ?? 100}
                  onChange={(e) => updateProp('width', Math.max(10, parseInt(e.target.value) || 10))}
                  className="w-16 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded text-emerald-400 font-mono font-bold text-right focus:outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 font-mono">px</span>
              </div>
            </div>
            <input
              type="range"
              min={10}
              max={950}
              value={currentWidth ?? 100}
              onChange={(e) => updateProp('width', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between pt-0.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateProp('width', Math.max(10, currentWidth - 10))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => updateProp('width', Math.max(10, currentWidth - 2))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  -2
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateProp('width', Math.min(1000, currentWidth + 2))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  +2
                </button>
                <button
                  type="button"
                  onClick={() => updateProp('width', Math.min(1000, currentWidth + 10))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  +10
                </button>
              </div>
            </div>
          </div>

          {/* Height */}
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Height</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={10}
                  max={800}
                  value={currentHeight ?? 100}
                  onChange={(e) => updateProp('height', Math.max(10, parseInt(e.target.value) || 10))}
                  className="w-16 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded text-emerald-400 font-mono font-bold text-right focus:outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 font-mono">px</span>
              </div>
            </div>
            <input
              type="range"
              min={10}
              max={650}
              value={currentHeight ?? 100}
              onChange={(e) => updateProp('height', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between pt-0.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateProp('height', Math.max(10, currentHeight - 10))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => updateProp('height', Math.max(10, currentHeight - 2))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  -2
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateProp('height', Math.min(800, currentHeight + 2))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  +2
                </button>
                <button
                  type="button"
                  onClick={() => updateProp('height', Math.min(800, currentHeight + 10))}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                >
                  +10
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Corner Radius</span>
              <span className="font-mono font-bold text-cyan-400">{currentRadius}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={currentRadius ?? 0}
              onChange={(e) => updateProp('borderRadius', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Opacity / Transparency</span>
              <span className="font-mono font-bold text-amber-400">{Math.round((currentOpacity ?? 1.0) * 100)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round((currentOpacity ?? 1.0) * 100)}
              onChange={(e) => updateProp('opacity', parseInt(e.target.value) / 100)}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Dedicated Stretch Presets & Scaling for Front Barcode */}
          {fieldId === 'frontBarcode' && (
            <div className="col-span-2 bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/70 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="text-base">↔</span> 1D Barcode Stretch & Width Presets
                </span>
                <span className="font-mono text-xs text-emerald-400 font-bold">Current: {currentWidth}px</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Contracted', w: 360 },
                  { label: 'Standard', w: 440 },
                  { label: 'Stretched', w: 520 },
                  { label: 'Wide Stretch', w: 600 },
                ].map((preset) => (
                  <button
                    key={preset.w}
                    type="button"
                    onClick={() => updateProp('width', preset.w)}
                    className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                      currentWidth === preset.w
                        ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-300'
                        : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {preset.label} ({preset.w})
                  </button>
                ))}
              </div>

              {/* Stretch Mode and Horizontal Multiplier */}
              <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-emerald-900/60">
                {/* Fit Mode Toggle */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-300 mb-1">Barcode Stretch Mode</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => updateProp('fit', 'fill')}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                        currentFit === 'fill'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Stretch barcode bars horizontally and vertically to fill the layer"
                    >
                      Stretch (Fill)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProp('fit', 'contain')}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                        currentFit === 'contain'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Preserve aspect ratio inside the box"
                    >
                      Keep Ratio
                    </button>
                  </div>
                </div>

                {/* ScaleX Horizontal Expansion Multiplier */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300 mb-1">
                    <span>Horizontal ScaleX</span>
                    <span className="font-mono text-emerald-400 font-bold">{Math.round(currentScaleX * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={75}
                    max={175}
                    value={Math.round(currentScaleX * 100)}
                    onChange={(e) => updateProp('scaleX', parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Dedicated Stretch Presets & Scaling for Back FAN Cut */}
          {fieldId === 'backFanCut' && (
            <div className="col-span-2 bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/70 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="text-base">↔</span> Back FAN Stretch & Width Presets
                </span>
                <span className="font-mono text-xs text-emerald-400 font-bold">Current: {currentWidth}px</span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Standard', w: 440 },
                  { label: 'Medium', w: 520 },
                  { label: 'Wide', w: 600 },
                  { label: 'Full Width', w: 700 },
                ].map((preset) => (
                  <button
                    key={preset.w}
                    type="button"
                    onClick={() => updateProp('width', preset.w)}
                    className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                      currentWidth === preset.w
                        ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-300'
                        : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {preset.label} ({preset.w})
                  </button>
                ))}
              </div>

              {/* Stretch Mode and Horizontal Multiplier */}
              <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-emerald-900/60">
                {/* Fit Mode Toggle */}
                <div>
                  <div className="text-[10px] font-semibold text-slate-300 mb-1">Image Stretch Mode</div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => updateProp('fit', 'fill')}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                        currentFit === 'fill'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Stretch image horizontally and vertically to fill the layer"
                    >
                      Stretch (Fill)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProp('fit', 'contain')}
                      className={`px-2 py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                        currentFit === 'contain'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                      title="Preserve aspect ratio inside the box"
                    >
                      Keep Ratio
                    </button>
                  </div>
                </div>

                {/* ScaleX Horizontal Expansion Multiplier */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300 mb-1">
                    <span>Horizontal ScaleX</span>
                    <span className="font-mono text-emerald-400 font-bold">{Math.round(currentScaleX * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={75}
                    max={175}
                    value={Math.round(currentScaleX * 100)}
                    onChange={(e) => updateProp('scaleX', parseInt(e.target.value) / 100)}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
