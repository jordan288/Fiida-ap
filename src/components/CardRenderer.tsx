import React, { useEffect, useState, useRef, forwardRef } from 'react';
import QRCode from 'qrcode';
import { CoordinatesConfig, IdCardData, TemplateConfig } from '../types';
import { DEFAULT_TEMPLATE_CONFIG } from '../data/defaultData';
import { cleanFieldText } from '../utils/textCleaner';
import { formatCardDualDate } from '../utils/ethiopianCalendar';

// Generates crisp SVG 1D barcode pattern for FAN / ID strings
function renderBarcodeSvg(text: string, width: number = 380, height: number = 32, darkColor: string = '#0f172a') {
  const clean = text.replace(/[^0-9A-Za-z]/g, '') || '4195043670692582';
  const bars: { x: number; w: number }[] = [];
  let currentX = 2;

  // Start guard bars
  bars.push({ x: currentX, w: 2 }); currentX += 4;
  bars.push({ x: currentX, w: 1 }); currentX += 3;
  bars.push({ x: currentX, w: 3 }); currentX += 5;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const p1 = (code % 3) + 1.2;
    const p2 = ((code >> 1) % 3) + 1.2;
    const p3 = ((code >> 2) % 3) + 1.2;
    const space1 = ((code >> 3) % 2) + 2;
    const space2 = ((code >> 4) % 2) + 2;

    bars.push({ x: currentX, w: p1 }); currentX += p1 + space1;
    bars.push({ x: currentX, w: p2 }); currentX += p2 + space2;
    bars.push({ x: currentX, w: p3 }); currentX += p3 + 2.2;
  }

  // End guard bars
  bars.push({ x: currentX, w: 3 }); currentX += 5;
  bars.push({ x: currentX, w: 1 }); currentX += 3;
  bars.push({ x: currentX, w: 2 }); currentX += 4;

  const totalWidth = currentX;

  return (
    <svg 
      viewBox={`0 0 ${totalWidth} ${height}`} 
      className="w-full h-full block" 
      preserveAspectRatio="none"
    >
      {bars.map((bar, idx) => (
        <rect
          key={idx}
          x={bar.x}
          y={0}
          width={bar.w}
          height={height}
          fill={darkColor}
        />
      ))}
    </svg>
  );
}

interface CardRendererProps {
  side: 'front' | 'back';
  data: IdCardData;
  config: CoordinatesConfig;
  templateConfig?: TemplateConfig;
  scale?: number;
  highlightField?: string | null;
  onSelectField?: (fieldId: string) => void;
  onMoveField?: (fieldId: string, newX: number, newY: number) => void;
  interactive?: boolean;
  elementId?: string;
  isExporting?: boolean;
  showGrid?: boolean;
  showCoordinatesBadges?: boolean;
}

export const CardRenderer = forwardRef<HTMLDivElement, CardRendererProps>(({
  side,
  data,
  config,
  templateConfig = DEFAULT_TEMPLATE_CONFIG,
  scale = 1,
  highlightField,
  onSelectField,
  onMoveField,
  interactive = false,
  elementId,
  isExporting = false,
  showGrid = false,
  showCoordinatesBadges = false,
}, ref) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const tConfig = templateConfig || DEFAULT_TEMPLATE_CONFIG;
  const customBgUrl = side === 'front' ? tConfig.frontImageUrl : tConfig.backImageUrl;
  const hasCustomBg = Boolean(customBgUrl && customBgUrl.trim().length > 0);

  useEffect(() => {
    const generateQr = async () => {
      try {
        const payload = data.qrData || `FAYDA:${data.fan}:${data.fullNameEnglish}:DOB=${data.dateOfBirth}`;
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 600,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrDataUrl(url);
      } catch (err) {
        console.error('Error generating QR code:', err);
      }
    };
    generateQr();
  }, [data.qrData, data.fan, data.fullNameEnglish, data.dateOfBirth]);

  const { canvasWidth, canvasHeight, fields, media } = config;

  // Setup Dragging Listeners
  const handlePointerDown = (
    e: React.PointerEvent,
    fieldId: string,
    currentX: number,
    currentY: number
  ) => {
    if (!interactive || !onMoveField) {
      if (interactive && onSelectField) {
        onSelectField(fieldId);
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    onSelectField?.(fieldId);
    setDraggingFieldId(fieldId);

    const cardRect = cardContainerRef.current?.getBoundingClientRect();
    if (!cardRect) return;

    // Calculate initial offset inside the element
    const pointerCardX = (e.clientX - cardRect.left) / scale;
    const pointerCardY = (e.clientY - cardRect.top) / scale;

    setDragOffset({
      x: pointerCardX - currentX,
      y: pointerCardY - currentY,
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!cardContainerRef.current) return;
      const currentRect = cardContainerRef.current.getBoundingClientRect();
      const currentPointerX = (moveEvent.clientX - currentRect.left) / scale;
      const currentPointerY = (moveEvent.clientY - currentRect.top) / scale;

      const rawNewX = Math.round(currentPointerX - (pointerCardX - currentX));
      const rawNewY = Math.round(currentPointerY - (pointerCardY - currentY));

      const clampedX = Math.max(0, Math.min(canvasWidth - 20, rawNewX));
      const clampedY = Math.max(0, Math.min(canvasHeight - 20, rawNewY));

      onMoveField(fieldId, clampedX, clampedY);
    };

    const handlePointerUp = () => {
      setDraggingFieldId(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const bgColor = tConfig.backgroundColor || '#f6fbf9';

  return (
    <div
      ref={ref}
      id={elementId}
      className={`relative select-none overflow-hidden transition-all ${
        isExporting ? '' : 'rounded-2xl shadow-2xl'
      }`}
      style={{
        width: `${canvasWidth * scale}px`,
        height: `${canvasHeight * scale}px`,
        aspectRatio: `${canvasWidth} / ${canvasHeight}`,
        backgroundColor: bgColor,
      }}
    >
      {/* Base Card Surface scaled container */}
      <div
        ref={cardContainerRef}
        className="absolute inset-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          backgroundColor: bgColor,
        }}
      >
        {/* Custom Template Uploaded Image Layer */}
        {hasCustomBg && (
          <div 
            className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
            style={{ opacity: tConfig.opacity ?? 1.0 }}
          >
            <img
              src={customBgUrl}
              alt={`Custom ${side} template background`}
              className="w-full h-full"
              style={{
                objectFit: tConfig.fitMode || 'cover',
                width: '100%',
                height: '100%',
              }}
              crossOrigin="anonymous"
            />
          </div>
        )}

        {/* Intricate Micro-pattern Guilloche Security Background (When enabled) */}
        {tConfig.showBuiltinGuilloche && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-45"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id={`guilloche-${side}`} width="60" height="60" patternUnits="userSpaceOnUse">
                <path
                  d="M0,30 Q15,0 30,30 T60,30 M0,15 Q15,45 30,15 T60,15 M0,45 Q15,15 30,45 T60,45"
                  fill="none"
                  stroke={tConfig.presetId === 'golden_hologram' ? '#b45309' : tConfig.presetId === 'cyber_blue' ? '#0369a1' : '#059669'}
                  strokeWidth="0.65"
                  strokeOpacity="0.35"
                />
                <path
                  d="M30,0 Q0,15 30,30 T30,60 M15,0 Q45,15 15,30 T15,60 M45,0 Q15,15 45,30 T45,60"
                  fill="none"
                  stroke={tConfig.presetId === 'golden_hologram' ? '#d97706' : tConfig.presetId === 'cyber_blue' ? '#0284c7' : '#d97706'}
                  strokeWidth="0.5"
                  strokeOpacity="0.3"
                />
              </pattern>
              <linearGradient id={`rainbowFade-${side}`} x1="0%" y1="0%" x2="100%" y2="100%">
                {tConfig.presetId === 'golden_hologram' ? (
                  <>
                    <stop offset="0%" stopColor="#fef08a" stopOpacity="0.75" />
                    <stop offset="40%" stopColor="#fef3c7" stopOpacity="0.65" />
                    <stop offset="80%" stopColor="#fed7aa" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#fde047" stopOpacity="0.8" />
                  </>
                ) : tConfig.presetId === 'cyber_blue' ? (
                  <>
                    <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#f0f9ff" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.75" />
                  </>
                ) : (
                  <>
                    <stop offset="0%" stopColor="#d1fae5" stopOpacity="0.75" />
                    <stop offset="35%" stopColor="#fef3c7" stopOpacity="0.65" />
                    <stop offset="70%" stopColor="#fee2e2" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#ecfdf5" stopOpacity="0.85" />
                  </>
                )}
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill={`url(#rainbowFade-${side})`} />
            <rect width="100%" height="100%" fill={`url(#guilloche-${side})`} />
            
            {/* Security wavy waves */}
            <path
              d="M 0,200 C 300,100 600,450 1012,300 L 1012,638 L 0,638 Z"
              fill={tConfig.presetId === 'golden_hologram' ? '#d97706' : tConfig.presetId === 'cyber_blue' ? '#0284c7' : '#059669'}
              fillOpacity="0.05"
            />
            <path
              d="M 0,380 C 400,280 700,550 1012,480 L 1012,638 L 0,638 Z"
              fill={tConfig.presetId === 'golden_hologram' ? '#b45309' : tConfig.presetId === 'cyber_blue' ? '#0369a1' : '#d97706'}
              fillOpacity="0.06"
            />
          </svg>
        )}

        {/* Security & Calibration Coordinate Grid Overlay */}
        {showGrid && !isExporting && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-35" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#059669" strokeWidth="0.5" strokeDasharray="1,3" />
              </pattern>
              <pattern id="mainGrid" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect width="100" height="100" fill="url(#smallGrid)" />
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#059669" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mainGrid)" />
            {/* Center Crosshairs */}
            <line x1={canvasWidth / 2} y1="0" x2={canvasWidth / 2} y2={canvasHeight} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,4" />
            <line x1="0" y1={canvasHeight / 2} x2={canvasWidth} y2={canvasHeight / 2} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,4" />
          </svg>
        )}

        {side === 'front' ? (
          /* ================= FRONT SIDE ================= */
          <div className="relative w-full h-full font-sans z-10">
            {/* Top Header Layer (Toggleable) */}
            {tConfig.showHeader && (
              <div className="absolute top-5 left-10 right-10 flex items-center justify-between pointer-events-none">
                {/* Ethiopian Flag */}
                {tConfig.showFlag && (
                  <div className="w-24 h-15 rounded shadow-sm border border-black/10 overflow-hidden flex flex-col relative">
                    <div className="h-1/3 bg-[#009639]" />
                    <div className="h-1/3 bg-[#FEDD00] relative flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[#002B7F] flex items-center justify-center -my-3">
                        <span className="text-[#FEDD00] text-[10px] leading-none font-bold">★</span>
                      </div>
                    </div>
                    <div className="h-1/3 bg-[#EF3340]" />
                  </div>
                )}

                {/* Title Center */}
                <div className="text-center flex-1 mx-4">
                  <h1 className="text-[23px] font-bold text-emerald-950 tracking-tight leading-tight">
                    የኢትዮጵያ ዲጂታል መታወቂያ ካርድ
                  </h1>
                  <h2 className="text-[19px] font-semibold text-gray-800 tracking-normal">
                    Ethiopian Digital ID Card
                  </h2>
                </div>

                {/* National ID Logo */}
                <div className="flex items-center gap-2">
                  <div className="w-13 h-13 rounded-full bg-cyan-900 border-2 border-cyan-700 flex items-center justify-center shadow-inner text-white font-bold text-xs p-1 text-center">
                    <span className="text-[10px] leading-tight font-bold">National ID</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-bold text-cyan-950 leading-tight">ብሔራዊ መታወቂያ</p>
                    <p className="text-[10px] font-semibold text-gray-700 leading-tight">National ID</p>
                  </div>
                </div>
              </div>
            )}

            {/* Issue Date (Flexible: Vertical Left Margin or Horizontal) */}
            <div 
              className={`absolute tracking-wider flex items-center gap-2 transition-all p-1.5 rounded-lg ${
                fields.dateOfIssueFront?.rotation === -90
                  ? '-rotate-90 origin-left'
                  : fields.dateOfIssueFront?.rotation === 90
                  ? 'rotate-90 origin-left'
                  : ''
              } ${
                highlightField === 'dateOfIssueFront' ? 'ring-3 ring-emerald-500 bg-emerald-100/90 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-emerald-400 hover:bg-emerald-50/60' : 'pointer-events-none'}`}
              style={{
                left: `${fields.dateOfIssueFront?.x ?? 52}px`,
                top: `${fields.dateOfIssueFront?.y ?? 330}px`,
                fontSize: `${fields.dateOfIssueFront?.fontSize ?? 15}px`,
                color: fields.dateOfIssueFront?.color ?? '#4b5563',
                fontWeight: fields.dateOfIssueFront?.fontWeight ?? '600',
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e,
                  'dateOfIssueFront',
                  fields.dateOfIssueFront?.x ?? 52,
                  fields.dateOfIssueFront?.y ?? 330
                )
              }
              onMouseEnter={() => setHoveredFieldId('dateOfIssueFront')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <span className="font-semibold text-gray-700">የተሰጠበት ቀን / Date of Issue:</span>
              )}
              <span className="text-gray-950 font-bold font-mono">
                {formatCardDualDate(cleanFieldText('dateOfIssue', data.dateOfIssue || '24/07/2024'), cleanFieldText('dateOfIssueEth', data.dateOfIssueEth || ''))}
              </span>

              {(showCoordinatesBadges || highlightField === 'dateOfIssueFront' || hoveredFieldId === 'dateOfIssueFront') && !isExporting && (
                <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-1.5">
                  X:{fields.dateOfIssueFront?.x ?? 52} Y:{fields.dateOfIssueFront?.y ?? 330}
                </span>
              )}
            </div>

            {/* Primary Applicant Photo Container (Left) */}
            <div
              className={`absolute border-2 overflow-hidden transition-all shadow-md group ${
                highlightField === 'photoFront'
                  ? 'ring-4 ring-emerald-500 border-emerald-600 z-20'
                  : 'border-emerald-800/30'
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${media.photoFront.x}px`,
                top: `${media.photoFront.y}px`,
                width: `${media.photoFront.width}px`,
                height: `${media.photoFront.height}px`,
                borderRadius: `${media.photoFront.borderRadius || 14}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'photoFront', media.photoFront.x, media.photoFront.y)
              }
              onMouseEnter={() => setHoveredFieldId('photoFront')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {data.photoUrl ? (
                <img
                  src={data.photoUrl}
                  alt="Applicant Primary Portrait"
                  className="w-full h-full object-cover pointer-events-none"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center text-gray-400">
                  <span className="text-3xl">👤</span>
                  <span className="text-xs font-semibold mt-1">Photo 1</span>
                </div>
              )}

              {/* Coordinate Chip Overlay */}
              {(showCoordinatesBadges || highlightField === 'photoFront' || hoveredFieldId === 'photoFront') && !isExporting && (
                <div className="absolute top-1 left-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                  <span className="text-emerald-400">P1 X:{media.photoFront.x}</span>
                  <span className="text-cyan-400">Y:{media.photoFront.y}</span>
                </div>
              )}
            </div>

            {/* Second Photo Container (Bottom Right Security Portrait) */}
            {tConfig.showSecondaryPhoto !== false && (
              <div
                className={`absolute overflow-hidden transition-all group ${
                  tConfig.secondaryPhotoStyle === 'ghost'
                    ? 'opacity-85 grayscale contrast-125 mix-blend-multiply border border-emerald-700/50 bg-emerald-50/30 shadow-xs'
                    : tConfig.secondaryPhotoStyle === 'grayscale'
                    ? 'grayscale contrast-120 border-2 border-slate-500 bg-white/50 shadow-xs'
                    : tConfig.secondaryPhotoStyle === 'goldBorder'
                    ? 'border-2 border-amber-500 ring-1 ring-amber-300 shadow-md'
                    : 'border-2 border-slate-300 shadow-xs'
                } ${
                  highlightField === 'photoFrontSecondary'
                    ? 'ring-4 ring-emerald-500 border-emerald-600 z-20 shadow-lg'
                    : ''
                } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
                style={{
                  left: `${media.photoFrontSecondary?.x ?? 825}px`,
                  top: `${media.photoFrontSecondary?.y ?? 435}px`,
                  width: `${media.photoFrontSecondary?.width ?? 145}px`,
                  height: `${media.photoFrontSecondary?.height ?? 175}px`,
                  borderRadius: `${media.photoFrontSecondary?.borderRadius ?? 12}px`,
                  opacity: media.photoFrontSecondary?.opacity ?? (tConfig.secondaryPhotoStyle === 'ghost' ? 0.85 : 1.0),
                }}
                onPointerDown={(e) =>
                  handlePointerDown(
                    e,
                    'photoFrontSecondary',
                    media.photoFrontSecondary?.x ?? 825,
                    media.photoFrontSecondary?.y ?? 435
                  )
                }
                onMouseEnter={() => setHoveredFieldId('photoFrontSecondary')}
                onMouseLeave={() => setHoveredFieldId(null)}
              >
                {data.secondaryPhotoUrl || data.photoUrl ? (
                  <img
                    src={data.secondaryPhotoUrl || data.photoUrl}
                    alt="Applicant Second Security Portrait"
                    className="w-full h-full object-cover pointer-events-none"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 text-center p-1">
                    <span className="text-2xl">👤</span>
                    <span className="text-[10px] font-semibold mt-0.5">2nd Photo</span>
                  </div>
                )}

                {/* Coordinate Chip Overlay */}
                {(showCoordinatesBadges || highlightField === 'photoFrontSecondary' || hoveredFieldId === 'photoFrontSecondary') && !isExporting && (
                  <div className="absolute top-1 left-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                    <span className="text-emerald-400">P2 X:{media.photoFrontSecondary?.x ?? 825}</span>
                    <span className="text-cyan-400">Y:{media.photoFrontSecondary?.y ?? 435}</span>
                  </div>
                )}
              </div>
            )}

            {/* Watermark Emblem on Right Side (Toggleable) */}
            {tConfig.showEmblem && (
              <div className="absolute right-12 top-36 pointer-events-none opacity-20 flex flex-col items-center">
                <svg width="220" height="220" viewBox="0 0 100 100" fill="none" stroke="#059669" strokeWidth="2">
                  <polygon points="50,5 64,38 98,38 70,59 81,92 50,72 19,92 30,59 2,38 36,38" />
                  <circle cx="50" cy="50" r="28" stroke="#d97706" strokeWidth="1.5" />
                </svg>
                <span className="text-emerald-900 font-bold text-4xl mt-[-40px] tracking-widest">ፋይዳ</span>
              </div>
            )}

            {/* --- Front Fields Positioned Dynamically --- */}

            {/* Full Name Amharic & English */}
            <div
              className={`absolute transition-all rounded-lg p-1.5 ${
                highlightField === 'fullNameAmharic' || highlightField === 'fullNameEnglish'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.fullNameAmharic.x}px`,
                top: `${fields.fullNameAmharic.y - (tConfig.showFieldLabels ? 35 : 0)}px`,
                maxWidth: `${fields.fullNameAmharic.maxWidth || 450}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'fullNameAmharic', fields.fullNameAmharic.x, fields.fullNameAmharic.y)
              }
              onMouseEnter={() => setHoveredFieldId('fullNameAmharic')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="text-[12px] font-bold text-yellow-900/85 leading-none mb-1 flex items-center justify-between">
                  <span>ሙሉ ስም | Full Name</span>
                  {(showCoordinatesBadges || highlightField === 'fullNameAmharic' || hoveredFieldId === 'fullNameAmharic') && !isExporting && (
                    <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                      X:{fields.fullNameAmharic.x} Y:{fields.fullNameAmharic.y}
                    </span>
                  )}
                </div>
              )}
              <div 
                className="font-bold leading-tight"
                style={{
                  fontSize: `${fields.fullNameAmharic.fontSize}px`,
                  color: fields.fullNameAmharic.color || '#111827',
                }}
              >
                {cleanFieldText('fullNameAmharic', data.fullNameAmharic)}
              </div>
              <div 
                className="font-semibold leading-tight mt-0.5"
                style={{
                  fontSize: `${fields.fullNameEnglish.fontSize}px`,
                  color: fields.fullNameEnglish.color || '#1f2937',
                }}
              >
                {cleanFieldText('fullNameEnglish', data.fullNameEnglish)}
              </div>
            </div>

            {/* Date of Birth */}
            <div
              className={`absolute transition-all rounded-lg p-1.5 ${
                highlightField === 'dateOfBirth' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.dateOfBirth.x}px`,
                top: `${fields.dateOfBirth.y - (tConfig.showFieldLabels ? 20 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'dateOfBirth', fields.dateOfBirth.x, fields.dateOfBirth.y)
              }
              onMouseEnter={() => setHoveredFieldId('dateOfBirth')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="text-[12px] font-bold text-yellow-900/85 leading-none mb-1 flex items-center justify-between">
                  <span>የትውልድ ቀን | Date of Birth</span>
                  {(showCoordinatesBadges || highlightField === 'dateOfBirth' || hoveredFieldId === 'dateOfBirth') && !isExporting && (
                    <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                      X:{fields.dateOfBirth.x} Y:{fields.dateOfBirth.y}
                    </span>
                  )}
                </div>
              )}
              <div 
                className="font-bold font-mono"
                style={{
                  fontSize: `${fields.dateOfBirth.fontSize}px`,
                  color: fields.dateOfBirth.color || '#111827',
                }}
              >
                {formatCardDualDate(cleanFieldText('dateOfBirth', data.dateOfBirth), cleanFieldText('dateOfBirthEth', data.dateOfBirthEth || ''))}
              </div>
            </div>

            {/* Sex */}
            <div
              className={`absolute transition-all rounded-lg p-1.5 ${
                highlightField === 'sex' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.sex.x}px`,
                top: `${fields.sex.y - (tConfig.showFieldLabels ? 20 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'sex', fields.sex.x, fields.sex.y)
              }
              onMouseEnter={() => setHoveredFieldId('sex')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="text-[12px] font-bold text-yellow-900/85 leading-none mb-1 flex items-center justify-between">
                  <span>ፆታ | Sex</span>
                  {(showCoordinatesBadges || highlightField === 'sex' || hoveredFieldId === 'sex') && !isExporting && (
                    <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                      X:{fields.sex.x} Y:{fields.sex.y}
                    </span>
                  )}
                </div>
              )}
              <div 
                className="font-bold"
                style={{
                  fontSize: `${fields.sex.fontSize}px`,
                  color: fields.sex.color || '#111827',
                }}
              >
                {cleanFieldText('sex', data.sex) === 'Male' || data.sex === 'Male'
                  ? 'ወንድ / M'
                  : cleanFieldText('sex', data.sex) === 'Female' || data.sex === 'Female'
                  ? 'ሴት / F'
                  : cleanFieldText('sex', data.sex)}
              </div>
            </div>

            {/* Date of Expiry */}
            <div
              className={`absolute transition-all rounded-lg p-1.5 ${
                highlightField === 'dateOfExpiry' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.dateOfExpiry.x}px`,
                top: `${fields.dateOfExpiry.y - (tConfig.showFieldLabels ? 20 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'dateOfExpiry', fields.dateOfExpiry.x, fields.dateOfExpiry.y)
              }
              onMouseEnter={() => setHoveredFieldId('dateOfExpiry')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="text-[12px] font-bold text-yellow-900/85 leading-none mb-1 flex items-center justify-between">
                  <span>የሚያበቃበት ቀን | Date of Expiry</span>
                  {(showCoordinatesBadges || highlightField === 'dateOfExpiry' || hoveredFieldId === 'dateOfExpiry') && !isExporting && (
                    <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                      X:{fields.dateOfExpiry.x} Y:{fields.dateOfExpiry.y}
                    </span>
                  )}
                </div>
              )}
              <div 
                className="font-bold font-mono"
                style={{
                  fontSize: `${fields.dateOfExpiry.fontSize}px`,
                  color: fields.dateOfExpiry.color || '#111827',
                }}
              >
                {cleanFieldText('dateOfExpiry', data.dateOfExpiry)}
              </div>
            </div>

            {/* Top / Bottom FAN & Barcode Section (Cut/Toggleable) */}
            {(tConfig.showFrontBarcode || tConfig.showFrontFan || tConfig.showFanContainerBox) && (
              <div
                className={`absolute flex flex-col items-center justify-center transition-all ${
                  tConfig.showFanContainerBox 
                    ? 'bg-white/95 backdrop-blur-xs border border-gray-300/90 rounded-2xl px-5 py-2.5 shadow-sm' 
                    : 'p-1'
                } ${
                  highlightField === 'fan' || highlightField === 'frontBarcode'
                    ? 'ring-4 ring-emerald-500 border-emerald-600 z-20 shadow-lg'
                    : ''
                } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
                style={{
                  left: `${fields.fan.x - 70}px`,
                  top: `${fields.fan.y - (tConfig.showFrontBarcode ? (tConfig.showFanContainerBox ? 52 : 35) : (tConfig.showFanContainerBox ? 28 : 10))}px`,
                  width: tConfig.showFanContainerBox ? (tConfig.showSecondaryPhoto ? '465px' : '540px') : 'auto',
                }}
                onPointerDown={(e) =>
                  handlePointerDown(e, 'fan', fields.fan.x, fields.fan.y)
                }
                onMouseEnter={() => setHoveredFieldId('fan')}
                onMouseLeave={() => setHoveredFieldId(null)}
              >
                {/* FAN Label and Digits on TOP of barcode */}
                {tConfig.showFrontFan && (
                  <div className="w-full flex items-center justify-between gap-3 mb-1">
                    {tConfig.showFanContainerBox && tConfig.showFieldLabels && (
                      <div className="text-left mr-2">
                        <div className="text-[11px] font-bold text-gray-500 leading-none">ካርድ ቁጥር</div>
                        <div className="text-[12px] font-extrabold text-gray-900 leading-none mt-0.5">FAN</div>
                      </div>
                    )}
                    <div 
                      className="font-mono font-extrabold tracking-[0.22em] text-gray-950 flex-1 text-center"
                      style={{
                        fontSize: `${fields.fan.fontSize}px`,
                        color: fields.fan.color || '#0f172a',
                      }}
                    >
                      {cleanFieldText('fan', data.fan) || '4195 0436 7069 2582'}
                    </div>
                  </div>
                )}

                {/* 1D Barcode BELOW the FAN digits */}
                {tConfig.showFrontBarcode && (
                  <div className="w-full h-8 px-2 flex items-center justify-center">
                    {renderBarcodeSvg(cleanFieldText('fan', data.fan) || '4195043670692582', 400, 32, fields.fan.color || '#0f172a')}
                  </div>
                )}

                {(showCoordinatesBadges || highlightField === 'fan' || hoveredFieldId === 'fan') && !isExporting && (
                  <div className="absolute -top-3 right-2 bg-slate-900 text-white text-[9px] font-mono px-1.5 py-0.2 rounded shadow-md flex items-center gap-1">
                    <span>FAN X:{fields.fan.x}</span>
                    <span>Y:{fields.fan.y}</span>
                    {tConfig.showFrontBarcode && <span className="text-emerald-400 font-bold">[Barcode ON]</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ================= BACK SIDE ================= */
          <div className="relative w-full h-full font-sans z-10">
            {/* Top Left: Phone Number */}
            <div
              className={`absolute transition-all rounded-lg p-1.5 ${
                highlightField === 'phoneNumber' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.phoneNumber.x}px`,
                top: `${fields.phoneNumber.y - (tConfig.showFieldLabels ? 20 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'phoneNumber', fields.phoneNumber.x, fields.phoneNumber.y)
              }
              onMouseEnter={() => setHoveredFieldId('phoneNumber')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="text-[12px] font-bold text-yellow-900/85 leading-none mb-1 flex items-center justify-between">
                  <span>ስልክ | Phone Number</span>
                  {(showCoordinatesBadges || highlightField === 'phoneNumber' || hoveredFieldId === 'phoneNumber') && !isExporting && (
                    <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                      X:{fields.phoneNumber.x} Y:{fields.phoneNumber.y}
                    </span>
                  )}
                </div>
              )}
              <div 
                className="font-bold font-mono"
                style={{
                  fontSize: `${fields.phoneNumber.fontSize}px`,
                  color: fields.phoneNumber.color || '#111827',
                }}
              >
                {cleanFieldText('phoneNumber', data.phoneNumber) || '0928574836'}
              </div>
            </div>

            {/* Middle Left: Nationality */}
            <div
              className={`absolute transition-all rounded-lg p-1.5 ${
                highlightField === 'nationality' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.nationality.x}px`,
                top: `${fields.nationality.y - (tConfig.showFieldLabels ? 25 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'nationality', fields.nationality.x, fields.nationality.y)
              }
              onMouseEnter={() => setHoveredFieldId('nationality')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <>
                  <div className="text-[12px] font-bold text-yellow-900/85 leading-none flex items-center justify-between">
                    <span>ዜግነት | Nationality</span>
                    {(showCoordinatesBadges || highlightField === 'nationality' || hoveredFieldId === 'nationality') && !isExporting && (
                      <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                        X:{fields.nationality.x} Y:{fields.nationality.y}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-yellow-800/70 mb-1">
                    (በተገለጸው መሰረት | Self Declared)
                  </div>
                </>
              )}
              <div 
                className="font-bold"
                style={{
                  fontSize: `${fields.nationality.fontSize}px`,
                  color: fields.nationality.color || '#111827',
                }}
              >
                {cleanFieldText('nationalityAmharic', data.nationalityAmharic) || 'ኢትዮጵያዊ'} | {cleanFieldText('nationalityEnglish', data.nationalityEnglish) || 'Ethiopian'}
              </div>
            </div>

            {/* Address Block */}
            <div
              className={`absolute w-[420px] transition-all rounded-lg p-1.5 ${
                highlightField === 'regionAmharic' || highlightField === 'zoneSubcity' || highlightField === 'woredaKebele'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.regionAmharic.x}px`,
                top: `${fields.regionAmharic.y - (tConfig.showFieldLabels ? 20 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'regionAmharic', fields.regionAmharic.x, fields.regionAmharic.y)
              }
              onMouseEnter={() => setHoveredFieldId('regionAmharic')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="text-[12px] font-bold text-yellow-900/85 leading-none mb-1.5 flex items-center justify-between">
                  <span>አድራሻ | Address</span>
                  {(showCoordinatesBadges || highlightField === 'regionAmharic' || hoveredFieldId === 'regionAmharic') && !isExporting && (
                    <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded ml-2">
                      X:{fields.regionAmharic.x} Y:{fields.regionAmharic.y}
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-1 text-gray-900">
                <div 
                  className="font-semibold"
                  style={{
                    fontSize: `${fields.regionAmharic.fontSize}px`,
                    color: fields.regionAmharic.color || '#111827',
                  }}
                >
                  {tConfig.showFieldLabels && <span className="text-gray-500 text-[14px]">ክልል: </span>}
                  <span className="font-bold text-gray-950">
                    {cleanFieldText('regionAmharic', data.regionAmharic)}
                    {data.regionEnglish ? ` / ${cleanFieldText('regionEnglish', data.regionEnglish)}` : ''}
                  </span>
                </div>
                <div 
                  className="font-semibold"
                  style={{
                    fontSize: `${fields.zoneSubcity.fontSize}px`,
                    color: fields.zoneSubcity.color || '#1f2937',
                  }}
                >
                  {tConfig.showFieldLabels && <span className="text-gray-500 text-[14px]">ዞን / ክ/ከተማ: </span>}
                  <span className="font-bold text-gray-950">
                    {cleanFieldText('zoneAmharic', data.zoneAmharic)}
                    {data.zoneEnglish ? ` / ${cleanFieldText('zoneEnglish', data.zoneEnglish)}` : ''}
                  </span>
                </div>
                <div 
                  className="font-semibold"
                  style={{
                    fontSize: `${fields.woredaKebele.fontSize}px`,
                    color: fields.woredaKebele.color || '#1f2937',
                  }}
                >
                  {tConfig.showFieldLabels && <span className="text-gray-500 text-[14px]">ወረዳ / ቀበሌ: </span>}
                  <span className="font-bold text-gray-950">
                    {cleanFieldText('woredaAmharic', data.woredaAmharic) || 'ወረዳ 01'}
                    {data.kebele ? ` (ቀበሌ ${cleanFieldText('kebele', data.kebele)})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Left Box for FCN / FIN Code */}
            <div
              className={`absolute flex flex-col items-center justify-center transition-all ${
                tConfig.showBarcodeBox 
                  ? 'w-[290px] h-[65px] bg-white border border-gray-300 rounded-lg shadow-2xs' 
                  : 'p-1'
              } ${
                highlightField === 'barcodeText' ? 'ring-4 ring-emerald-500 border-emerald-600 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.barcodeText.x - (tConfig.showBarcodeBox ? 20 : 0)}px`,
                top: `${fields.barcodeText.y - (tConfig.showBarcodeBox ? 30 : 0)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'barcodeText', fields.barcodeText.x, fields.barcodeText.y)
              }
              onMouseEnter={() => setHoveredFieldId('barcodeText')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showBarcodeBox && (
                <div className="font-mono text-[11px] text-gray-500 font-semibold tracking-wider">
                  {data.fcn || `FCN-${data.fan.replace(/\s+/g, '')}`}
                </div>
              )}
              <div 
                className="font-mono font-bold tracking-widest mt-0.5"
                style={{
                  fontSize: `${fields.barcodeText.fontSize}px`,
                  color: fields.barcodeText.color || '#1e293b',
                }}
              >
                ★ {data.fan.slice(0, 9)} ★
              </div>
              {(showCoordinatesBadges || highlightField === 'barcodeText' || hoveredFieldId === 'barcodeText') && !isExporting && (
                <div className="absolute -top-3 right-1 bg-slate-900 text-white text-[9px] font-mono px-1.5 py-0.2 rounded shadow-md">
                  X:{fields.barcodeText.x} Y:{fields.barcodeText.y}
                </div>
              )}
            </div>

            {/* Right Side: Large High-Density Digital QR Code */}
            <div
              className={`absolute bg-white p-3 rounded-2xl border border-gray-300 shadow-md flex flex-col items-center justify-center transition-all ${
                highlightField === 'qrCodeBack' ? 'ring-4 ring-emerald-500 border-emerald-600 z-20 shadow-lg' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${media.qrCodeBack.x}px`,
                top: `${media.qrCodeBack.y}px`,
                width: `${media.qrCodeBack.width}px`,
                height: `${media.qrCodeBack.height}px`,
                borderRadius: `${media.qrCodeBack.borderRadius || 12}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'qrCodeBack', media.qrCodeBack.x, media.qrCodeBack.y)
              }
              onMouseEnter={() => setHoveredFieldId('qrCodeBack')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Fayda Digital QR Code"
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center text-xs text-gray-400">
                  Generating QR...
                </div>
              )}

              {(showCoordinatesBadges || highlightField === 'qrCodeBack' || hoveredFieldId === 'qrCodeBack') && !isExporting && (
                <div className="absolute -top-3 right-2 bg-slate-900 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                  <span className="text-emerald-400">X:{media.qrCodeBack.x}</span>
                  <span className="text-cyan-400">Y:{media.qrCodeBack.y}</span>
                </div>
              )}
            </div>

            {/* Bottom Footer Notice (Toggleable) */}
            {tConfig.showFooterNotice && (
              <div className="absolute left-10 right-10 bottom-3 flex items-center justify-between border-t border-emerald-900/10 pt-2 text-[10px] text-gray-700 leading-tight">
                <div className="max-w-[680px]">
                  <p className="font-semibold text-gray-900">
                    ይህ መታወቂያ የጠፋ ካገኙ በአቅራቢያዎ ላለ ፖሊስ ጣቢያ ወይም ለተቋሙ ያስረክቡ። ለተጨማሪ 9779 ላይ ይደውሉ ወይም id.et/cardprint ይጎብኙ።
                  </p>
                  <p className="text-gray-600">
                    If lost and found, please return to nearby police station or to the institution. Call 9779 or visit id.et/cardprint for more.
                  </p>
                </div>
              </div>
            )}

            {/* Serial Number */}
            <div
              className={`absolute right-10 bottom-3 bg-white/95 px-3 py-1 rounded-md border border-gray-300 text-right transition-all ${
                highlightField === 'serialNumber' ? 'ring-2 ring-emerald-500 z-20' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: fields.serialNumber.x !== 820 ? `${fields.serialNumber.x}px` : undefined,
                top: fields.serialNumber.y !== 608 ? `${fields.serialNumber.y}px` : undefined,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'serialNumber', fields.serialNumber.x, fields.serialNumber.y)
              }
              onMouseEnter={() => setHoveredFieldId('serialNumber')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              <span 
                className="font-bold font-mono"
                style={{
                  fontSize: `${fields.serialNumber.fontSize}px`,
                  color: fields.serialNumber.color || '#111827',
                }}
              >
                SN : {data.serialNumber || '984729184'}
              </span>
              {(showCoordinatesBadges || highlightField === 'serialNumber' || hoveredFieldId === 'serialNumber') && !isExporting && (
                <span className="block text-[8px] font-mono text-gray-500">
                  X:{fields.serialNumber.x} Y:{fields.serialNumber.y}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

CardRenderer.displayName = 'CardRenderer';

