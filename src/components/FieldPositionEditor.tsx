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
    Boolean(config.media[fieldId]);
  const field: FieldCoordinate | undefined = config.fields[fieldId];
  const media: MediaCoordinate | undefined = config.media[fieldId];

  if (!field && !media) return null;

  const currentX = isMedia ? media!.x : field!.x;
  const currentY = isMedia ? media!.y : field!.y;
  const currentFontSize = field?.fontSize || 20;
  const currentColor = field?.color || '#111827';
  const currentWidth = media?.width || field?.maxWidth || 300;
  const currentHeight = media?.height || 200;
  const currentRadius = media?.borderRadius || 14;
  const currentOpacity = media?.opacity !== undefined ? media.opacity : 1.0;

  const label = isMedia ? media!.label : field!.label;
  const side = isMedia ? media!.side : field!.side;

  const updateProp = (prop: string, val: any) => {
    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...prev.media[fieldId],
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
                value={currentX}
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
            value={currentX}
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
                value={currentY}
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
            value={currentY}
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
                value={currentFontSize}
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
        /* Media Dimensions (Photo or QR) */
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Width</span>
              <span className="font-mono font-bold text-emerald-400">{currentWidth}px</span>
            </div>
            <input
              type="range"
              min={30}
              max={600}
              value={currentWidth}
              onChange={(e) => updateProp('width', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Height</span>
              <span className="font-mono font-bold text-emerald-400">{currentHeight}px</span>
            </div>
            <input
              type="range"
              min={30}
              max={600}
              value={currentHeight}
              onChange={(e) => updateProp('height', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
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
              value={currentRadius}
              onChange={(e) => updateProp('borderRadius', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Opacity / Transparency</span>
              <span className="font-mono font-bold text-amber-400">{Math.round(currentOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(currentOpacity * 100)}
              onChange={(e) => updateProp('opacity', parseInt(e.target.value) / 100)}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>
        </div>
      )}
    </div>
  );
};
