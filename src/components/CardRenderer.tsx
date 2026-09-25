import React, { useEffect, useState, useRef, forwardRef } from 'react';
import QRCode from 'qrcode';
import { CoordinatesConfig, IdCardData, TemplateConfig } from '../types';
import { DEFAULT_TEMPLATE_CONFIG } from '../data/defaultData';
import { cleanFieldText } from '../utils/textCleaner';
import { formatCardDualDate, format7DigitSerial, getTodayIssueDates, calculateExpiryFromIssue } from '../utils/ethiopianCalendar';
import { generateCode128SvgString } from '../utils/barcodeEngine';
import { makeQrTransparentAndBorderless } from '../utils/qrPrecisionCropper';
import { getFontFamilyCss } from '../utils/fontManager';

interface CardRendererProps {
  side: 'front' | 'back';
  data: IdCardData;
  config: CoordinatesConfig;
  templateConfig?: TemplateConfig;
  scale?: number;
  highlightField?: string | null;
  onSelectField?: (fieldId: string) => void;
  onMoveField?: (fieldId: string, newX: number, newY: number) => void;
  onResizeField?: (fieldId: string, newWidth: number, newHeight: number, newX?: number, newY?: number) => void;
  interactive?: boolean;
  elementId?: string;
  isExporting?: boolean;
  showGrid?: boolean;
  showCoordinatesBadges?: boolean;
  showCornerMarks?: boolean;
  photoColorMode?: 'color' | 'grayscale';
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
  onResizeField,
  interactive = false,
  elementId,
  isExporting = false,
  showGrid = false,
  showCoordinatesBadges = false,
  showCornerMarks,
  photoColorMode,
}, ref) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [cleanQrUrl, setCleanQrUrl] = useState<string>('');
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [resizingFieldId, setResizingFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const tConfig = templateConfig || DEFAULT_TEMPLATE_CONFIG;
  const cardFontFamilyCss = getFontFamilyCss(tConfig.cardFontFamily);
  const customBgUrl = side === 'front' ? tConfig.frontImageUrl : tConfig.backImageUrl;
  const hasCustomBg = Boolean(customBgUrl && customBgUrl.trim().length > 0);
  const isCornerMarksActive = !isExporting && (showCornerMarks !== undefined ? showCornerMarks : (tConfig.showCornerMarks ?? false));
  const isPhotoGrayscale = photoColorMode === 'grayscale' || data.photoColorMode === 'grayscale';

  useEffect(() => {
    let active = true;
    if (data.qrCodeImageUrl) {
      makeQrTransparentAndBorderless(data.qrCodeImageUrl)
        .then((cleaned) => {
          if (active) setCleanQrUrl(cleaned);
        })
        .catch(() => {
          if (active) setCleanQrUrl(data.qrCodeImageUrl || '');
        });
    } else {
      setCleanQrUrl('');
    }
    return () => {
      active = false;
    };
  }, [data.qrCodeImageUrl]);

  useEffect(() => {
    if (data.qrCodeImageUrl) {
      return;
    }

    const generateFallbackQr = async () => {
      try {
        const payload = data.qrData || `FAYDA:${data.fan}:${data.fullNameEnglish}:DOB=${data.dateOfBirth}`;
        const url = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: 600,
          color: {
            dark: '#000000',
            light: '#00000000',
          },
        });
        setQrDataUrl(url);
      } catch (err) {
        console.error('Error generating fallback QR code:', err);
      }
    };
    generateFallbackQr();
  }, [data.qrCodeImageUrl, data.qrData, data.fan, data.fullNameEnglish, data.dateOfBirth]);

  const { canvasWidth, canvasHeight, fields, media } = config;

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

  const handleResizePointerDown = (
    e: React.PointerEvent,
    fieldId: string,
    currentWidth: number,
    currentHeight: number,
    direction: 'horizontal' | 'vertical' | 'both',
    currentX: number,
    currentY: number
  ) => {
    if (!interactive || !onResizeField) return;

    e.preventDefault();
    e.stopPropagation();

    onSelectField?.(fieldId);
    setResizingFieldId(fieldId);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWidth = currentWidth;
    const startHeight = currentHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startClientX) / scale;
      const deltaY = (moveEvent.clientY - startClientY) / scale;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction === 'horizontal' || direction === 'both') {
        const maxW = canvasWidth - currentX;
        newWidth = Math.max(50, Math.min(maxW, Math.round(startWidth + deltaX)));
      }

      if (direction === 'vertical' || direction === 'both') {
        const maxH = canvasHeight - currentY;
        newHeight = Math.max(20, Math.min(maxH, Math.round(startHeight + deltaY)));
      }

      onResizeField(fieldId, newWidth, newHeight);
    };

    const handlePointerUp = () => {
      setResizingFieldId(null);
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
        {hasCustomBg ? (
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
        ) : !isExporting ? (
          <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center opacity-20 border-2 border-dashed border-emerald-800 m-2 rounded-xl">
            <span className="text-xs font-mono font-bold text-emerald-950 uppercase tracking-wider">
              [ Custom Template {side === 'front' ? 'Front' : 'Back'} Blank Canvas ]
            </span>
          </div>
        ) : null}

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
            <line x1={canvasWidth / 2} y1="0" x2={canvasWidth / 2} y2={canvasHeight} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,4" />
            <line x1="0" y1={canvasHeight / 2} x2={canvasWidth} y2={canvasHeight / 2} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,4" />
          </svg>
        )}

        {isCornerMarksActive && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible select-none"
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id="cornerChipShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#020617" floodOpacity="0.8" />
              </filter>
            </defs>

            <rect
              x="0.75"
              y="0.75"
              width={canvasWidth - 1.5}
              height={canvasHeight - 1.5}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              strokeOpacity="0.65"
            />

            <g id="corner-tl">
              <path d="M 0,38 L 0,0 L 38,0" fill="none" stroke="#020617" strokeWidth="4.5" strokeLinecap="square" />
              <path d="M 0,38 L 0,0 L 38,0" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="square" />
              <line x1="12" y1="0" x2="12" y2="7" stroke="#10b981" strokeWidth="1.5" />
              <line x1="24" y1="0" x2="24" y2="7" stroke="#10b981" strokeWidth="1.5" />
              <line x1="0" y1="12" x2="7" y2="12" stroke="#10b981" strokeWidth="1.5" />
              <line x1="0" y1="24" x2="7" y2="24" stroke="#10b981" strokeWidth="1.5" />
              <line x1="0" y1="0" x2="14" y2="14" stroke="#059669" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="4.5" fill="#10b981" stroke="#020617" strokeWidth="1.2" />
              <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
              <g transform="translate(10, 10)" filter="url(#cornerChipShadow)">
                <rect x="0" y="0" width="76" height="20" rx="4" fill="#090d16" fillOpacity="0.92" stroke="#10b981" strokeWidth="1" />
                <text x="38" y="14" fill="#34d399" fontSize="10.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  TL (0, 0)
                </text>
              </g>
            </g>

            <g id="corner-tr">
              <path d={`M ${canvasWidth - 38},0 L ${canvasWidth},0 L ${canvasWidth},38`} fill="none" stroke="#020617" strokeWidth="4.5" strokeLinecap="square" />
              <path d={`M ${canvasWidth - 38},0 L ${canvasWidth},0 L ${canvasWidth},38`} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="square" />
              <line x1={canvasWidth - 12} y1="0" x2={canvasWidth - 12} y2="7" stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth - 24} y1="0" x2={canvasWidth - 24} y2="7" stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth} y1="12" x2={canvasWidth - 7} y2="12" stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth} y1="24" x2={canvasWidth - 7} y2="24" stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth} y1="0" x2={canvasWidth - 14} y2="14" stroke="#059669" strokeWidth="1.5" />
              <circle cx={canvasWidth} cy="0" r="4.5" fill="#10b981" stroke="#020617" strokeWidth="1.2" />
              <circle cx={canvasWidth} cy="0" r="1.8" fill="#ffffff" />
              <g transform={`translate(${canvasWidth - 105}, 10)`} filter="url(#cornerChipShadow)">
                <rect x="0" y="0" width="95" height="20" rx="4" fill="#090d16" fillOpacity="0.92" stroke="#10b981" strokeWidth="1" />
                <text x="47.5" y="14" fill="#34d399" fontSize="10.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  TR ({canvasWidth}, 0)
                </text>
              </g>
            </g>

            <g id="corner-bl">
              <path d={`M 0,${canvasHeight - 38} L 0,${canvasHeight} L 38,${canvasHeight}`} fill="none" stroke="#020617" strokeWidth="4.5" strokeLinecap="square" />
              <path d={`M 0,${canvasHeight - 38} L 0,${canvasHeight} L 38,${canvasHeight}`} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="square" />
              <line x1="12" y1={canvasHeight} x2="12" y2={canvasHeight - 7} stroke="#10b981" strokeWidth="1.5" />
              <line x1="24" y1={canvasHeight} x2="24" y2={canvasHeight - 7} stroke="#10b981" strokeWidth="1.5" />
              <line x1="0" y1={canvasHeight - 12} x2="7" y2={canvasHeight - 12} stroke="#10b981" strokeWidth="1.5" />
              <line x1="0" y1={canvasHeight - 24} x2="7" y2={canvasHeight - 24} stroke="#10b981" strokeWidth="1.5" />
              <line x1="0" y1={canvasHeight} x2="14" y2={canvasHeight - 14} stroke="#059669" strokeWidth="1.5" />
              <circle cx="0" cy={canvasHeight} r="4.5" fill="#10b981" stroke="#020617" strokeWidth="1.2" />
              <circle cx="0" cy={canvasHeight} r="1.8" fill="#ffffff" />
              <g transform={`translate(10, ${canvasHeight - 30})`} filter="url(#cornerChipShadow)">
                <rect x="0" y="0" width="95" height="20" rx="4" fill="#090d16" fillOpacity="0.92" stroke="#10b981" strokeWidth="1" />
                <text x="47.5" y="14" fill="#34d399" fontSize="10.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  BL (0, ${canvasHeight})
                </text>
              </g>
            </g>

            <g id="corner-br">
              <path d={`M ${canvasWidth - 38},${canvasHeight} L ${canvasWidth},${canvasHeight} L ${canvasWidth},${canvasHeight - 38}`} fill="none" stroke="#020617" strokeWidth="4.5" strokeLinecap="square" />
              <path d={`M ${canvasWidth - 38},${canvasHeight} L ${canvasWidth},${canvasHeight} L ${canvasWidth},${canvasHeight - 38}`} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="square" />
              <line x1={canvasWidth - 12} y1={canvasHeight} x2={canvasWidth - 12} y2={canvasHeight - 7} stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth - 24} y1={canvasHeight} x2={canvasWidth - 24} y2={canvasHeight - 7} stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth} y1={canvasHeight - 12} x2={canvasWidth - 7} y2={canvasHeight - 12} stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth} y1={canvasHeight - 24} x2={canvasWidth - 7} y2={canvasHeight - 24} stroke="#10b981" strokeWidth="1.5" />
              <line x1={canvasWidth} y1={canvasHeight} x2={canvasWidth - 14} y2={canvasHeight - 14} stroke="#059669" strokeWidth="1.5" />
              <circle cx={canvasWidth} cy={canvasHeight} r="4.5" fill="#10b981" stroke="#020617" strokeWidth="1.2" />
              <circle cx={canvasWidth} cy={canvasHeight} r="1.8" fill="#ffffff" />
              <g transform={`translate(${canvasWidth - 120}, ${canvasHeight - 30})`} filter="url(#cornerChipShadow)">
                <rect x="0" y="0" width="110" height="20" rx="4" fill="#090d16" fillOpacity="0.92" stroke="#10b981" strokeWidth="1" />
                <text x="55" y="14" fill="#34d399" fontSize="10.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                  BR ({canvasWidth}, ${canvasHeight})
                </text>
              </g>
            </g>
          </svg>
        )}

        {side === 'front' ? (
          <div className="relative w-full h-full z-10" style={{ fontFamily: cardFontFamilyCss }}>
            <div 
              className={`absolute tracking-wider flex items-center gap-1.5 transition-all p-0 rounded-sm ${
                (fields.dateOfIssueGc?.rotation ?? fields.dateOfIssueFront?.rotation ?? -90) === -90
                  ? '-rotate-90 origin-top-left'
                  : (fields.dateOfIssueGc?.rotation ?? fields.dateOfIssueFront?.rotation ?? -90) === 90
                  ? 'rotate-90 origin-top-left'
                  : ''
              } ${
                highlightField === 'dateOfIssueGc' || highlightField === 'dateOfIssueFront' ? 'ring-3 ring-emerald-500 bg-emerald-100/90 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-emerald-400 hover:bg-emerald-50/60' : 'pointer-events-none'}`}
              style={{
                left: `${fields.dateOfIssueGc?.x ?? fields.dateOfIssueFront?.x ?? 52}px`,
                top: `${fields.dateOfIssueGc?.y ?? fields.dateOfIssueFront?.y ?? 350}px`,
                fontSize: `${fields.dateOfIssueGc?.fontSize ?? fields.dateOfIssueFront?.fontSize ?? 15}px`,
                color: fields.dateOfIssueGc?.color ?? fields.dateOfIssueFront?.color ?? '#4b5563',
                fontWeight: fields.dateOfIssueGc?.fontWeight ?? fields.dateOfIssueFront?.fontWeight ?? '600',
                lineHeight: 1,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e,
                  fields.dateOfIssueGc ? 'dateOfIssueGc' : 'dateOfIssueFront',
                  fields.dateOfIssueGc?.x ?? fields.dateOfIssueFront?.x ?? 52,
                  fields.dateOfIssueGc?.y ?? fields.dateOfIssueFront?.y ?? 350
                )
              }
              onMouseEnter={() => setHoveredFieldId('dateOfIssueGc')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <span className="font-semibold text-gray-700 text-[11px]" style={{ fontFamily: cardFontFamilyCss }}>G.C:</span>
              )}
              <span className="text-gray-950 font-bold" style={{ fontFamily: cardFontFamilyCss }}>
                {cleanFieldText('dateOfIssue', data.dateOfIssue || getTodayIssueDates().issueDateGc)}
              </span>

              {(showCoordinatesBadges || highlightField === 'dateOfIssueGc' || hoveredFieldId === 'dateOfIssueGc') && !isExporting && (
                <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1 py-0.2 rounded ml-1">
                  GC X:{fields.dateOfIssueGc?.x ?? fields.dateOfIssueFront?.x ?? 52} Y:{fields.dateOfIssueGc?.y ?? fields.dateOfIssueFront?.y ?? 350}
                </span>
              )}
            </div>

            <div 
              className={`absolute tracking-wider flex items-center gap-1.5 transition-all p-0 rounded-sm ${
                (fields.dateOfIssueEth?.rotation ?? -90) === -90
                  ? '-rotate-90 origin-top-left'
                  : (fields.dateOfIssueEth?.rotation ?? -90) === 90
                  ? 'rotate-90 origin-top-left'
                  : ''
              } ${
                highlightField === 'dateOfIssueEth' ? 'ring-3 ring-emerald-500 bg-emerald-100/90 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-emerald-400 hover:bg-emerald-50/60' : 'pointer-events-none'}`}
              style={{
                left: `${fields.dateOfIssueEth?.x ?? 52}px`,
                top: `${fields.dateOfIssueEth?.y ?? 220}px`,
                fontSize: `${fields.dateOfIssueEth?.fontSize ?? 15}px`,
                color: fields.dateOfIssueEth?.color ?? '#4b5563',
                fontWeight: fields.dateOfIssueEth?.fontWeight ?? '600',
                lineHeight: 1,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e,
                  'dateOfIssueEth',
                  fields.dateOfIssueEth?.x ?? 52,
                  fields.dateOfIssueEth?.y ?? 220
                )
              }
              onMouseEnter={() => setHoveredFieldId('dateOfIssueEth')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <span className="font-semibold text-gray-700 text-[11px]" style={{ fontFamily: cardFontFamilyCss }}>E.C:</span>
              )}
              <span className="text-gray-950 font-bold" style={{ fontFamily: cardFontFamilyCss }}>
                {cleanFieldText('dateOfIssueEth', data.dateOfIssueEth || getTodayIssueDates().issueDateEth)}
              </span>

              {(showCoordinatesBadges || highlightField === 'dateOfIssueEth' || hoveredFieldId === 'dateOfIssueEth') && !isExporting && (
                <span className="bg-slate-900/90 text-white text-[9px] font-mono px-1 py-0.2 rounded ml-1">
                  EC X:{fields.dateOfIssueEth?.x ?? 52} Y:{fields.dateOfIssueEth?.y ?? 220}
                </span>
              )}
            </div>

            <div
              className={`absolute overflow-hidden transition-all group bg-transparent ${
                highlightField === 'photoFront'
                  ? 'ring-4 ring-emerald-500 z-20 shadow-lg'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${media.photoFront.x}px`,
                top: `${media.photoFront.y}px`,
                width: `${media.photoFront.width}px`,
                height: `${media.photoFront.height}px`,
                borderRadius: `${media.photoFront.borderRadius || 14}px`,
                backgroundColor: 'transparent',
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
                  className={`w-full h-full object-cover pointer-events-none ${
                    isPhotoGrayscale ? 'grayscale contrast-115' : ''
                  }`}
                  style={{
                    imageRendering: '-webkit-optimize-contrast',
                  }}
                  crossOrigin={data.photoUrl.startsWith('data:') || data.photoUrl.startsWith('blob:') ? undefined : 'anonymous'}
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center text-gray-400">
                  <span className="text-3xl">👤</span>
                  <span className="text-xs font-semibold mt-1">Photo 1</span>
                </div>
              )}

              {(showCoordinatesBadges || highlightField === 'photoFront' || hoveredFieldId === 'photoFront') && !isExporting && (
                <div className="absolute top-1 left-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                  <span className="text-emerald-400">P1 X:{media.photoFront.x}</span>
                  <span className="text-cyan-400">Y:{media.photoFront.y}</span>
                </div>
              )}
            </div>

            {tConfig.showSecondaryPhoto !== false && (
              <div
                className={`absolute overflow-hidden transition-all group bg-transparent ${
                  tConfig.secondaryPhotoStyle === 'ghost'
                    ? 'opacity-85 grayscale contrast-125'
                    : tConfig.secondaryPhotoStyle === 'grayscale' || isPhotoGrayscale
                    ? 'grayscale contrast-120'
                    : ''
                } ${
                  highlightField === 'photoFrontSecondary' && !isExporting
                    ? 'ring-2 ring-emerald-500/70 z-20 shadow-md'
                    : ''
                } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
                style={{
                  left: `${media.photoFrontSecondary?.x ?? 825}px`,
                  top: `${media.photoFrontSecondary?.y ?? 435}px`,
                  width: `${media.photoFrontSecondary?.width ?? 145}px`,
                  height: `${media.photoFrontSecondary?.height ?? 175}px`,
                  borderRadius: `${media.photoFrontSecondary?.borderRadius ?? 0}px`,
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'transparent',
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
                {data.photoUrl || data.secondaryPhotoUrl ? (
                  <img
                    src={data.photoUrl || data.secondaryPhotoUrl}
                    alt="Applicant Second Security Portrait (Copy of Main Photo)"
                    className="w-full h-full object-cover pointer-events-none"
                    style={{ border: 'none', outline: 'none' }}
                    crossOrigin={(data.photoUrl || data.secondaryPhotoUrl)?.startsWith('data:') || (data.photoUrl || data.secondaryPhotoUrl)?.startsWith('blob:') ? undefined : 'anonymous'}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 text-center p-1">
                    <span className="text-2xl">👤</span>
                    <span className="text-[10px] font-semibold mt-0.5">2nd Photo</span>
                  </div>
                )}

                {(showCoordinatesBadges || highlightField === 'photoFrontSecondary' || hoveredFieldId === 'photoFrontSecondary') && !isExporting && (
                  <div className="absolute top-1 left-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                    <span className="text-emerald-400">P2 X:{media.photoFrontSecondary?.x ?? 825}</span>
                    <span className="text-cyan-400">Y:{media.photoFrontSecondary?.y ?? 435}</span>
                    <span className="text-amber-300">W:{media.photoFrontSecondary?.width ?? 145} H:{media.photoFrontSecondary?.height ?? 175}</span>
                  </div>
                )}
              </div>
            )}

            {tConfig.showEmblem && !hasCustomBg && (
              <div className="absolute right-12 top-36 pointer-events-none opacity-20 flex flex-col items-center">
                <svg width="220" height="220" viewBox="0 0 100 100" fill="none" stroke="#059669" strokeWidth="2">
                  <polygon points="50,5 64,38 98,38 70,59 81,92 50,72 19,92 30,59 2,38 36,38" />
                  <circle cx="50" cy="50" r="28" stroke="#d97706" strokeWidth="1.5" />
                </svg>
                <span className="text-emerald-900 font-bold text-4xl mt-[-40px] tracking-widest">ፋይዳ</span>
              </div>
            )}

            <div
              className={`absolute transition-all rounded-sm p-0 ${
                highlightField === 'fullNameAmharic'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.fullNameAmharic.x}px`,
                top: `${fields.fullNameAmharic.y}px`,
                maxWidth: `${fields.fullNameAmharic.maxWidth || 450}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'fullNameAmharic', fields.fullNameAmharic.x, fields.fullNameAmharic.y)
              }
              onMouseEnter={() => setHoveredFieldId('fullNameAmharic')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  ሙሉ ስም
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'fullNameAmharic' || hoveredFieldId === 'fullNameAmharic') && !isExporting && (
                <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.fullNameAmharic.x} Y:{fields.fullNameAmharic.y}
                </div>
              )}
              <div 
                className="font-bold leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.fullNameAmharic.fontSize}px`,
                  color: fields.fullNameAmharic.color || '#111827',
                }}
              >
                {cleanFieldText('fullNameAmharic', data.fullNameAmharic)}
              </div>
            </div>

            <div
              className={`absolute transition-all rounded-sm p-0 ${
                highlightField === 'fullNameEnglish'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.fullNameEnglish?.x ?? fields.fullNameAmharic.x}px`,
                top: `${fields.fullNameEnglish?.y ?? (fields.fullNameAmharic.y + 33)}px`,
                maxWidth: `${fields.fullNameEnglish?.maxWidth || 450}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'fullNameEnglish', fields.fullNameEnglish?.x ?? fields.fullNameAmharic.x, fields.fullNameEnglish?.y ?? (fields.fullNameAmharic.y + 33))
              }
              onMouseEnter={() => setHoveredFieldId('fullNameEnglish')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  Full Name
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'fullNameEnglish' || hoveredFieldId === 'fullNameEnglish') && !isExporting && (
                <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.fullNameEnglish?.x ?? fields.fullNameAmharic.x} Y:{fields.fullNameEnglish?.y ?? (fields.fullNameAmharic.y + 33)}
                </div>
              )}
              <div 
                className="font-semibold leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.fullNameEnglish?.fontSize ?? 22}px`,
                  color: fields.fullNameEnglish?.color || '#1f2937',
                }}
              >
                {cleanFieldText('fullNameEnglish', data.fullNameEnglish)}
              </div>
            </div>

            <div
              className={`absolute transition-all rounded-sm p-0 ${
                highlightField === 'dateOfBirth' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.dateOfBirth.x}px`,
                top: `${fields.dateOfBirth.y}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'dateOfBirth', fields.dateOfBirth.x, fields.dateOfBirth.y)
              }
              onMouseEnter={() => setHoveredFieldId('dateOfBirth')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  የትውልድ ቀን | Date of Birth
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'dateOfBirth' || hoveredFieldId === 'dateOfBirth') && !isExporting && (
                <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.dateOfBirth.x} Y:{fields.dateOfBirth.y}
                </div>
              )}
              <div 
                className="font-bold"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.dateOfBirth.fontSize}px`,
                  color: fields.dateOfBirth.color || '#111827',
                }}
              >
                {formatCardDualDate(
                  cleanFieldText('dateOfBirth', data.dateOfBirth),
                  cleanFieldText('dateOfBirthEth', data.dateOfBirthEth || ''),
                  'eth_with_gc',
                  { gcMonthName: false }
                )}
              </div>
            </div>

            <div
              className={`absolute transition-all rounded-sm p-0 ${
                highlightField === 'sex' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.sex.x}px`,
                top: `${fields.sex.y}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'sex', fields.sex.x, fields.sex.y)
              }
              onMouseEnter={() => setHoveredFieldId('sex')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  ፆታ | Sex
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'sex' || hoveredFieldId === 'sex') && !isExporting && (
                <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.sex.x} Y:{fields.sex.y}
                </div>
              )}
              <div 
                className="font-bold"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.sex.fontSize}px`,
                  color: fields.sex.color || '#111827',
                }}
              >
                {cleanFieldText('sex', data.sex) === 'Male' || data.sex === 'Male' || String(data.sex).toLowerCase() === 'm' || data.sex === 'ወንድ'
                  ? 'ወንድ / Male'
                  : cleanFieldText('sex', data.sex) === 'Female' || data.sex === 'Female' || String(data.sex).toLowerCase() === 'f' || data.sex === 'ሴት'
                  ? 'ሴት / Female'
                  : cleanFieldText('sex', data.sex)}
              </div>
            </div>

            <div
              className={`absolute transition-all rounded-sm p-0 ${
                highlightField === 'dateOfExpiry' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.dateOfExpiry.x}px`,
                top: `${fields.dateOfExpiry.y}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'dateOfExpiry', fields.dateOfExpiry.x, fields.dateOfExpiry.y)
              }
              onMouseEnter={() => setHoveredFieldId('dateOfExpiry')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  የሚያበቃበት ቀን | Date of Expiry
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'dateOfExpiry' || hoveredFieldId === 'dateOfExpiry') && !isExporting && (
                <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.dateOfExpiry.x} Y:{fields.dateOfExpiry.y}
                </div>
              )}
              <div 
                className="font-bold"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.dateOfExpiry.fontSize}px`,
                  color: fields.dateOfExpiry.color || '#111827',
                }}
              >
                {(() => {
                  const issueGc = cleanFieldText('dateOfIssue', data.dateOfIssue || getTodayIssueDates().issueDateGc);
                  const issueEth = cleanFieldText('dateOfIssueEth', data.dateOfIssueEth || getTodayIssueDates().issueDateEth);
                  const calculated = calculateExpiryFromIssue(issueGc, issueEth);
                  const expGc = calculated?.expiryGc || cleanFieldText('dateOfExpiry', data.dateOfExpiry);
                  const expEth = calculated?.expiryEth || cleanFieldText('dateOfExpiryEth', data.dateOfExpiryEth || '');
                  return formatCardDualDate(expGc, expEth, 'eth_with_gc', { gcMonthName: true });
                })()}
              </div>
            </div>

            {(tConfig.showFrontFan || tConfig.showFanContainerBox) && (
              <div
                className={`absolute flex items-center justify-center transition-all bg-transparent border-0 shadow-none ${
                  highlightField === 'fan'
                    ? 'ring-4 ring-emerald-500 border-emerald-600 z-20 shadow-lg'
                    : ''
                } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
                style={{
                  left: `${fields.fan.x - 70}px`,
                  top: `${fields.fan.y - 10}px`,
                  width: `${tConfig.showSecondaryPhoto ? 465 : 540}px`,
                  height: '60px',
                }}
                onPointerDown={(e) =>
                  handlePointerDown(e, 'fan', fields.fan.x, fields.fan.y)
                }
                onMouseEnter={() => setHoveredFieldId('fan')}
                onMouseLeave={() => setHoveredFieldId(null)}
              >
                {tConfig.showFrontFan && (
                  <div 
                    className="font-extrabold tracking-normal text-gray-950 w-full text-center select-all"
                    style={{
                      fontFamily: cardFontFamilyCss,
                      fontSize: `${fields.fan.fontSize}px`,
                      color: fields.fan.color || '#0f172a',
                      letterSpacing: '0px',
                    }}
                  >
                    {(cleanFieldText('fan', data.fan) || data.fan || '4195043670692582').replace(/\s+/g, '')}
                  </div>
                )}

                {(showCoordinatesBadges || highlightField === 'fan' || hoveredFieldId === 'fan') && !isExporting && (
                  <div className="absolute -top-3 right-2 bg-slate-900 text-white text-[9px] font-mono px-1.5 py-0.2 rounded shadow-md flex items-center gap-1 pointer-events-none">
                    <span>FAN X:{fields.fan.x}</span>
                    <span>Y:{fields.fan.y}</span>
                  </div>
                )}
              </div>
            )}

            {tConfig.showFrontBarcode !== false && (
              <div 
                className={`absolute flex items-center justify-center transition-all ${
                  highlightField === 'frontBarcode'
                    ? 'ring-4 ring-emerald-500 border-emerald-600 z-30 shadow-lg'
                    : ''
                } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
                style={{
                  left: `${media.frontBarcode?.x ?? 485}px`,
                  top: `${media.frontBarcode?.y ?? 520}px`,
                  width: `${media.frontBarcode?.width ?? 440}px`,
                  height: `${media.frontBarcode?.height ?? 40}px`,
                  zIndex: 25,
                }}
                onPointerDown={(e) => {
                  handlePointerDown(e, 'frontBarcode', media.frontBarcode?.x ?? 485, media.frontBarcode?.y ?? 520);
                }}
                onMouseEnter={() => setHoveredFieldId('frontBarcode')}
                onMouseLeave={() => setHoveredFieldId(null)}
              >
                <div
                  className="w-full h-full overflow-hidden flex items-center justify-center"
                  style={{
                    borderRadius: `${media.frontBarcode?.borderRadius ?? 4}px`,
                    opacity: media.frontBarcode?.opacity ?? 1.0,
                  }}
                >
                  {data.barcodeImageUrl ? (
                    <img
                      src={data.barcodeImageUrl}
                      alt="Exact Cutted Barcode"
                      className="w-full h-full pointer-events-none transition-transform"
                      style={{
                        objectFit: media.frontBarcode?.fit === 'contain' ? 'contain' : 'fill',
                        transform: media.frontBarcode?.scaleX ? `scaleX(${media.frontBarcode.scaleX})` : undefined,
                        transformOrigin: 'center center',
                        imageRendering: '-webkit-optimize-contrast',
                      }}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center bg-white overflow-hidden transition-transform"
                      style={{
                        transform: media.frontBarcode?.scaleX ? `scaleX(${media.frontBarcode.scaleX})` : undefined,
                        transformOrigin: 'center center',
                      }}
                      dangerouslySetInnerHTML={{
                        __html: generateCode128SvgString(
                          (cleanFieldText('fan', data.fan) || data.fan || '4195043670692582').replace(/\s+/g, ''),
                          media.frontBarcode?.width ?? 440,
                          media.frontBarcode?.height ?? 40,
                          fields.fan?.color || '#0f172a'
                        ),
                      }}
                    />
                  )}
                </div>

                {(showCoordinatesBadges || highlightField === 'frontBarcode' || hoveredFieldId === 'frontBarcode') && !isExporting && (
                  <div className="absolute -top-3.5 left-1 bg-slate-900/90 backdrop-blur-xs text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                    <span className="text-emerald-400">Barcode X:{media.frontBarcode?.x ?? 485}</span>
                    <span className="text-cyan-400">Y:{media.frontBarcode?.y ?? 520}</span>
                    <span className="text-amber-300">W:{media.frontBarcode?.width ?? 440} H:{media.frontBarcode?.height ?? 40}</span>
                  </div>
                )}

                {interactive && !isExporting && (highlightField === 'frontBarcode' || hoveredFieldId === 'frontBarcode') && (
                  <>
                    <div
                      className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-8 cursor-ew-resize flex items-center justify-center z-40 group"
                      title="Drag to Stretch / Contract Barcode Width (የባርኮድ የተዘረጋ ስፋት)"
                      onPointerDown={(e) =>
                        handleResizePointerDown(
                          e,
                          'frontBarcode',
                          media.frontBarcode?.width ?? 440,
                          media.frontBarcode?.height ?? 40,
                          'horizontal',
                          media.frontBarcode?.x ?? 485,
                          media.frontBarcode?.y ?? 520
                        )
                      }
                    >
                      <div className="w-2.5 h-6 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-110 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-transform">
                        <div className="w-0.5 h-2.5 bg-white rounded-full"></div>
                      </div>
                      <span className="absolute -top-7 right-0 bg-slate-900 text-emerald-300 text-[9px] font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        ↔ Stretch Barcode Width
                      </span>
                    </div>

                    <div
                      className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 h-5 w-8 cursor-ns-resize flex items-center justify-center z-40 group"
                      title="Drag to Resize Barcode Height"
                      onPointerDown={(e) =>
                        handleResizePointerDown(
                          e,
                          'frontBarcode',
                          media.frontBarcode?.width ?? 440,
                          media.frontBarcode?.height ?? 40,
                          'vertical',
                          media.frontBarcode?.x ?? 485,
                          media.frontBarcode?.y ?? 520
                        )
                      }
                    >
                      <div className="h-2.5 w-6 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-110 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-transform">
                        <div className="h-0.5 w-2.5 bg-white rounded-full"></div>
                      </div>
                      <span className="absolute -bottom-7 bg-slate-900 text-emerald-300 text-[9px] font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        ↕ Resize Barcode Height
                      </span>
                    </div>

                    <div
                      className="absolute -right-2 -bottom-2 w-5 h-5 cursor-nwse-resize bg-emerald-600 hover:bg-emerald-500 rounded-br-lg rounded-tl-sm border-2 border-white shadow-md flex items-center justify-center text-white text-[10px] font-bold z-50 transition-transform hover:scale-110"
                      title="Drag to Stretch Barcode Width & Height"
                      onPointerDown={(e) =>
                        handleResizePointerDown(
                          e,
                          'frontBarcode',
                          media.frontBarcode?.width ?? 440,
                          media.frontBarcode?.height ?? 40,
                          'both',
                          media.frontBarcode?.x ?? 485,
                          media.frontBarcode?.y ?? 520
                        )
                      }
                    >
                      ⤡
                    </div>

                    <div 
                      className="absolute -top-7.5 left-0 flex items-center gap-1.5 bg-slate-900/95 text-white px-2 py-0.5 rounded-md shadow-lg border border-slate-700/80 z-50 text-[10px] font-mono pointer-events-auto"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span className="text-emerald-400 font-bold">
                        Stretch: {media.frontBarcode?.width ?? 440}px
                      </span>
                      <button
                        type="button"
                        onClick={() => onResizeField?.('frontBarcode', Math.min(canvasWidth - (media.frontBarcode?.x ?? 485), (media.frontBarcode?.width ?? 440) + 20), media.frontBarcode?.height ?? 40)}
                        className="px-1.5 py-0.2 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-bold transition-colors cursor-pointer"
                        title="Stretch Barcode Width +20px"
                      >
                        +20px
                      </button>
                      <button
                        type="button"
                        onClick={() => onResizeField?.('frontBarcode', Math.max(100, (media.frontBarcode?.width ?? 440) - 20), media.frontBarcode?.height ?? 40)}
                        className="px-1.5 py-0.2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold transition-colors cursor-pointer"
                        title="Contract Barcode Width -20px"
                      >
                        -20px
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-full h-full z-10" style={{ fontFamily: cardFontFamilyCss }}>
            <div
              id="field-phoneNumber"
              className={`absolute transition-all rounded-sm p-0 ${
                highlightField === 'phoneNumber' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 ring-offset-1 z-20 shadow-md' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400 hover:ring-offset-1' : ''}`}
              style={{
                left: `${fields.phoneNumber?.x ?? 45}px`,
                top: `${fields.phoneNumber?.y ?? 105}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'phoneNumber', fields.phoneNumber?.x ?? 45, fields.phoneNumber?.y ?? 105)
              }
              onMouseEnter={() => setHoveredFieldId('phoneNumber')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  ስልክ | Phone Number
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'phoneNumber' || hoveredFieldId === 'phoneNumber') && !isExporting && (
                <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.phoneNumber?.x ?? 45} Y:{fields.phoneNumber?.y ?? 105}
                </div>
              )}
              <div 
                className="font-bold"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.phoneNumber?.fontSize ?? 24}px`,
                  color: fields.phoneNumber?.color || '#111827',
                }}
              >
                {cleanFieldText('phoneNumber', data.phoneNumber) || '0928574836'}
              </div>
            </div>

            {tConfig.showNationality && fields.nationality && (
              <div
                className={`absolute transition-all rounded-sm p-0 ${
                  highlightField === 'nationality' ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md' : ''
                } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
                style={{
                  left: `${fields.nationality.x}px`,
                  top: `${fields.nationality.y}px`,
                }}
                onPointerDown={(e) =>
                  handlePointerDown(e, 'nationality', fields.nationality.x, fields.nationality.y)
                }
                onMouseEnter={() => setHoveredFieldId('nationality')}
                onMouseLeave={() => setHoveredFieldId(null)}
              >
                {tConfig.showFieldLabels && (
                  <div className="absolute -top-4 left-0 text-[11px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                    ዜግነት | Nationality
                  </div>
                )}
                {(showCoordinatesBadges || highlightField === 'nationality' || hoveredFieldId === 'nationality') && !isExporting && (
                  <div className="absolute -top-3.5 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                    X:{fields.nationality.x} Y:{fields.nationality.y}
                  </div>
                )}
                <div 
                  className="font-bold"
                  style={{
                    fontFamily: cardFontFamilyCss,
                    fontSize: `${fields.nationality.fontSize}px`,
                    color: fields.nationality.color || '#111827',
                  }}
                >
                  {cleanFieldText('nationalityAmharic', data.nationalityAmharic) || 'ኢትዮጵያዊ'} | {cleanFieldText('nationalityEnglish', data.nationalityEnglish) || 'Ethiopian'}
                </div>
              </div>
            )}

            <div
              className={`absolute min-w-[200px] max-w-[440px] transition-all rounded-sm p-0 ${
                highlightField === 'regionAmharic'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.regionAmharic?.x ?? 45}px`,
                top: `${fields.regionAmharic?.y ?? 275}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'regionAmharic', fields.regionAmharic?.x ?? 45, fields.regionAmharic?.y ?? 275)
              }
              onMouseEnter={() => setHoveredFieldId('regionAmharic')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-3.5 left-0 text-[10px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  ክልል (Amharic)
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'regionAmharic' || hoveredFieldId === 'regionAmharic') && !isExporting && (
                <div className="absolute -top-3 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.regionAmharic?.x ?? 45} Y:{fields.regionAmharic?.y ?? 275}
                </div>
              )}
              <div 
                className="font-bold text-gray-950 leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.regionAmharic?.fontSize ?? 20}px`,
                  color: fields.regionAmharic?.color || '#111827',
                }}
              >
                {cleanFieldText('regionAmharic', data.regionAmharic) || 'ሲዳማ'}
              </div>
            </div>

            <div
              className={`absolute min-w-[200px] max-w-[440px] transition-all rounded-sm p-0 ${
                highlightField === 'regionEnglish'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.regionEnglish?.x ?? (fields.regionAmharic?.x ?? 45)}px`,
                top: `${fields.regionEnglish?.y ?? ((fields.regionAmharic?.y ?? 275) + 27)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e, 
                  'regionEnglish', 
                  fields.regionEnglish?.x ?? (fields.regionAmharic?.x ?? 45), 
                  fields.regionEnglish?.y ?? ((fields.regionAmharic?.y ?? 275) + 27)
                )
              }
              onMouseEnter={() => setHoveredFieldId('regionEnglish')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-3.5 left-0 text-[10px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  Region (English)
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'regionEnglish' || hoveredFieldId === 'regionEnglish') && !isExporting && (
                <div className="absolute -top-3 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.regionEnglish?.x ?? (fields.regionAmharic?.x ?? 45)} Y:{fields.regionEnglish?.y ?? ((fields.regionAmharic?.y ?? 275) + 27)}
                </div>
              )}
              <div 
                className="font-bold text-gray-900 leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.regionEnglish?.fontSize ?? fields.regionAmharic?.fontSize ?? 20}px`,
                  color: fields.regionEnglish?.color || fields.regionAmharic?.color || '#111827',
                }}
              >
                {cleanFieldText('regionEnglish', data.regionEnglish) || 'Sidama'}
              </div>
            </div>

            <div
              className={`absolute min-w-[200px] max-w-[440px] transition-all rounded-sm p-0 ${
                highlightField === 'zoneAmharic' || highlightField === 'zoneSubcity'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.zoneAmharic?.x ?? (fields.zoneSubcity?.x ?? 45)}px`,
                top: `${fields.zoneAmharic?.y ?? (fields.zoneSubcity?.y ?? 345)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e, 
                  'zoneAmharic', 
                  fields.zoneAmharic?.x ?? (fields.zoneSubcity?.x ?? 45), 
                  fields.zoneAmharic?.y ?? (fields.zoneSubcity?.y ?? 345)
                )
              }
              onMouseEnter={() => setHoveredFieldId('zoneAmharic')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-3.5 left-0 text-[10px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  ዞን / ክ/ከተማ (Amharic)
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'zoneAmharic' || hoveredFieldId === 'zoneAmharic') && !isExporting && (
                <div className="absolute -top-3 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.zoneAmharic?.x ?? (fields.zoneSubcity?.x ?? 45)} Y:{fields.zoneAmharic?.y ?? (fields.zoneSubcity?.y ?? 345)}
                </div>
              )}
              <div 
                className="font-bold text-gray-950 leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.zoneAmharic?.fontSize ?? fields.zoneSubcity?.fontSize ?? 20}px`,
                  color: fields.zoneAmharic?.color || fields.zoneSubcity?.color || '#1f2937',
                }}
              >
                {cleanFieldText('zoneAmharic', data.zoneAmharic) || 'አርበጎና'}
              </div>
            </div>

            <div
              className={`absolute min-w-[200px] max-w-[440px] transition-all rounded-sm p-0 ${
                highlightField === 'zoneEnglish'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.zoneEnglish?.x ?? (fields.zoneAmharic?.x ?? fields.zoneSubcity?.x ?? 45)}px`,
                top: `${fields.zoneEnglish?.y ?? ((fields.zoneAmharic?.y ?? fields.zoneSubcity?.y ?? 345) + 27)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e, 
                  'zoneEnglish', 
                  fields.zoneEnglish?.x ?? (fields.zoneAmharic?.x ?? fields.zoneSubcity?.x ?? 45), 
                  fields.zoneEnglish?.y ?? ((fields.zoneAmharic?.y ?? fields.zoneSubcity?.y ?? 345) + 27)
                )
              }
              onMouseEnter={() => setHoveredFieldId('zoneEnglish')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-3.5 left-0 text-[10px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  Zone / Subcity (English)
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'zoneEnglish' || hoveredFieldId === 'zoneEnglish') && !isExporting && (
                <div className="absolute -top-3 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.zoneEnglish?.x ?? (fields.zoneAmharic?.x ?? 45)} Y:{fields.zoneEnglish?.y ?? ((fields.zoneAmharic?.y ?? 345) + 27)}
                </div>
              )}
              <div 
                className="font-bold text-gray-900 leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.zoneEnglish?.fontSize ?? fields.zoneAmharic?.fontSize ?? fields.zoneSubcity?.fontSize ?? 20}px`,
                  color: fields.zoneEnglish?.color || fields.zoneSubcity?.color || '#1f2937',
                }}
              >
                {cleanFieldText('zoneEnglish', data.zoneEnglish) || 'Arbegona'}
              </div>
            </div>

            <div
              className={`absolute min-w-[200px] max-w-[440px] transition-all rounded-sm p-0 ${
                highlightField === 'woredaAmharic' || highlightField === 'woredaKebele'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.woredaAmharic?.x ?? (fields.woredaKebele?.x ?? 45)}px`,
                top: `${fields.woredaAmharic?.y ?? (fields.woredaKebele?.y ?? 415)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e, 
                  'woredaAmharic', 
                  fields.woredaAmharic?.x ?? (fields.woredaKebele?.x ?? 45), 
                  fields.woredaAmharic?.y ?? (fields.woredaKebele?.y ?? 415)
                )
              }
              onMouseEnter={() => setHoveredFieldId('woredaAmharic')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-3.5 left-0 text-[10px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  ወረዳ (Amharic)
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'woredaAmharic' || hoveredFieldId === 'woredaAmharic') && !isExporting && (
                <div className="absolute -top-3 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.woredaAmharic?.x ?? (fields.woredaKebele?.x ?? 45)} Y:{fields.woredaAmharic?.y ?? (fields.woredaKebele?.y ?? 415)}
                </div>
              )}
              <div 
                className="font-bold text-gray-950 leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.woredaAmharic?.fontSize ?? fields.woredaKebele?.fontSize ?? 20}px`,
                  color: fields.woredaAmharic?.color || fields.woredaKebele?.color || '#1f2937',
                }}
              >
                {cleanFieldText('woredaAmharic', data.woredaAmharic) || 'ወረዳ 01'}
              </div>
            </div>

            <div
              className={`absolute min-w-[200px] max-w-[440px] transition-all rounded-sm p-0 ${
                highlightField === 'woredaEnglish'
                  ? 'bg-emerald-100/90 ring-3 ring-emerald-500 z-20 shadow-md'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:bg-emerald-50/70 hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.woredaEnglish?.x ?? (fields.woredaAmharic?.x ?? fields.woredaKebele?.x ?? 45)}px`,
                top: `${fields.woredaEnglish?.y ?? ((fields.woredaAmharic?.y ?? fields.woredaKebele?.y ?? 415) + 27)}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e, 
                  'woredaEnglish', 
                  fields.woredaEnglish?.x ?? (fields.woredaAmharic?.x ?? fields.woredaKebele?.x ?? 45), 
                  fields.woredaEnglish?.y ?? ((fields.woredaAmharic?.y ?? fields.woredaKebele?.y ?? 415) + 27)
                )
              }
              onMouseEnter={() => setHoveredFieldId('woredaEnglish')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {tConfig.showFieldLabels && (
                <div className="absolute -top-3.5 left-0 text-[10px] font-bold text-yellow-900/85 leading-none pointer-events-none whitespace-nowrap" style={{ fontFamily: cardFontFamilyCss }}>
                  Woreda (English)
                </div>
              )}
              {(showCoordinatesBadges || highlightField === 'woredaEnglish' || hoveredFieldId === 'woredaEnglish') && !isExporting && (
                <div className="absolute -top-3 right-0 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.2 rounded pointer-events-none z-30">
                  X:{fields.woredaEnglish?.x ?? (fields.woredaAmharic?.x ?? 45)} Y:{fields.woredaEnglish?.y ?? ((fields.woredaAmharic?.y ?? 415) + 27)}
                </div>
              )}
              <div 
                className="font-bold text-gray-900 leading-tight"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.woredaEnglish?.fontSize ?? fields.woredaAmharic?.fontSize ?? fields.woredaKebele?.fontSize ?? 20}px`,
                  color: fields.woredaEnglish?.color || fields.woredaKebele?.color || '#1f2937',
                }}
              >
                {cleanFieldText('woredaEnglish', data.woredaEnglish) || cleanFieldText('woredaAmharic', data.woredaAmharic) || 'Woreda 01'}
              </div>
            </div>

            {/* RAW IMAGE CUTTER (No filters, no upscale, no text fallback) */}
            <div
              className={`absolute flex flex-col items-center justify-center transition-all ${
                highlightField === 'backFanCut' || highlightField === 'barcodeText'
                  ? 'ring-4 ring-emerald-500 border-emerald-600 z-30 shadow-lg'
                  : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${media.backFanCut?.x ?? 45}px`,
                top: `${media.backFanCut?.y ?? 505}px`,
                width: `${media.backFanCut?.width ?? 440}px`,
                height: `${media.backFanCut?.height ?? 95}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(
                  e,
                  'backFanCut',
                  media.backFanCut?.x ?? 45,
                  media.backFanCut?.y ?? 505
                )
              }
              onMouseEnter={() => setHoveredFieldId('backFanCut')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              <div
                className="w-full h-full overflow-hidden flex flex-col items-center justify-center bg-white"
                style={{
                  borderRadius: `${media.backFanCut?.borderRadius ?? 8}px`,
                  opacity: media.backFanCut?.opacity ?? 0.80,
                  backgroundColor: '#ffffff',
                }}
              >
                <div
                  className="w-full h-full flex flex-col items-center justify-center p-1 bg-white"
                  style={{
                    borderRadius: `${media.backFanCut?.borderRadius ?? 8}px`,
                    transform: media.backFanCut?.scaleX ? `scaleX(${media.backFanCut.scaleX})` : undefined,
                  }}
                >
                  {data.finLayerCropUrl || data.finImageUrl || data.finLayerImageUrl || (data.backFan && (data.backFan.startsWith('data:image') || data.backFan.startsWith('http') || data.backFan.startsWith('blob:')) ? data.backFan : null) ? (
                    <img
                      src={(data.finLayerCropUrl || data.finImageUrl || data.finLayerImageUrl || data.backFan) as string}
                      alt="Raw Back FAN Crop"
                      className="w-full h-full pointer-events-none select-none"
                      style={{ 
                        objectFit: 'contain',
                        mixBlendMode: 'multiply'
                      }}
                    />
                  ) : (
                    <div className="text-[10px] text-gray-400 font-mono">
                      Missing Crop Layer
                    </div>
                  )}
                </div>
              </div>

              {(showCoordinatesBadges || highlightField === 'backFanCut' || hoveredFieldId === 'backFanCut') && !isExporting && (
                <div className="absolute top-1 left-1 bg-slate-900/90 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                  <span className="text-emerald-400">Back FAN X:{media.backFanCut?.x ?? 45}</span>
                  <span className="text-cyan-400">Y:{media.backFanCut?.y ?? 505}</span>
                  <span className="text-amber-300">W:{media.backFanCut?.width ?? 440} H:{media.backFanCut?.height ?? 95}</span>
                </div>
              )}

              {interactive && !isExporting && (highlightField === 'backFanCut' || hoveredFieldId === 'backFanCut') && (
                <>
                  <div
                    className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-10 cursor-ew-resize flex items-center justify-center z-40 group"
                    title="Drag to Stretch Back FAN Width (የተዘረጋ ስፋት)"
                    onPointerDown={(e) =>
                      handleResizePointerDown(
                        e,
                        'backFanCut',
                        media.backFanCut?.width ?? 440,
                        media.backFanCut?.height ?? 95,
                        'horizontal',
                        media.backFanCut?.x ?? 45,
                        media.backFanCut?.y ?? 505
                      )
                    }
                  >
                    <div className="w-2.5 h-8 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-110 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-transform">
                      <div className="w-0.5 h-3 bg-white rounded-full"></div>
                    </div>
                    <span className="absolute -top-7 right-0 bg-slate-900 text-emerald-300 text-[9px] font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      ↔ Stretch Width
                    </span>
                  </div>

                  <div
                    className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 h-5 w-10 cursor-ns-resize flex items-center justify-center z-40 group"
                    title="Drag to Resize Back FAN Height"
                    onPointerDown={(e) =>
                      handleResizePointerDown(
                        e,
                        'backFanCut',
                        media.backFanCut?.width ?? 440,
                        media.backFanCut?.height ?? 95,
                        'vertical',
                        media.backFanCut?.x ?? 45,
                        media.backFanCut?.y ?? 505
                      )
                    }
                  >
                    <div className="h-2.5 w-8 bg-emerald-500 group-hover:bg-emerald-400 group-hover:scale-110 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-transform">
                      <div className="h-0.5 w-3 bg-white rounded-full"></div>
                    </div>
                    <span className="absolute -bottom-7 bg-slate-900 text-emerald-300 text-[9px] font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      ↕ Stretch Height
                    </span>
                  </div>

                  <div
                    className="absolute -right-2 -bottom-2 w-5 h-5 cursor-nwse-resize bg-emerald-600 hover:bg-emerald-500 rounded-br-lg rounded-tl-sm border-2 border-white shadow-md flex items-center justify-center text-white text-[10px] font-bold z-50 transition-transform hover:scale-110"
                    title="Drag to Stretch Width & Height"
                    onPointerDown={(e) =>
                      handleResizePointerDown(
                        e,
                        'backFanCut',
                        media.backFanCut?.width ?? 440,
                        media.backFanCut?.height ?? 95,
                        'both',
                        media.backFanCut?.x ?? 45,
                        media.backFanCut?.y ?? 505
                      )
                    }
                  >
                    ⤡
                  </div>

                  <div 
                    className="absolute -top-7.5 left-0 flex items-center gap-1.5 bg-slate-900/95 text-white px-2 py-0.5 rounded-md shadow-lg border border-slate-700/80 z-50 text-[10px] font-mono pointer-events-auto"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <span className="text-emerald-400 font-bold">
                      Stretch: {media.backFanCut?.width ?? 440}px
                    </span>
                    <button
                      type="button"
                      onClick={() => onResizeField?.('backFanCut', Math.min(canvasWidth - (media.backFanCut?.x ?? 45), (media.backFanCut?.width ?? 440) + 20), media.backFanCut?.height ?? 95)}
                      className="px-1.5 py-0.2 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-bold transition-colors cursor-pointer"
                      title="Stretch Width +20px"
                    >
                      +20
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeField?.('backFanCut', Math.min(canvasWidth - (media.backFanCut?.x ?? 45), (media.backFanCut?.width ?? 440) + 50), media.backFanCut?.height ?? 95)}
                      className="px-1.5 py-0.2 bg-pink-700 hover:bg-pink-600 text-white rounded font-bold transition-colors cursor-pointer"
                      title="Stretch Width +50px"
                    >
                      +50
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeField?.('backFanCut', Math.max(100, (media.backFanCut?.width ?? 440) - 20), media.backFanCut?.height ?? 95)}
                      className="px-1.5 py-0.2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold transition-colors cursor-pointer"
                      title="Shrink Width -20px"
                    >
                      -20
                    </button>
                    <button
                      type="button"
                      onClick={() => onResizeField?.('backFanCut', 520, media.backFanCut?.height ?? 95)}
                      className="px-1.5 py-0.2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded font-bold transition-colors cursor-pointer"
                      title="Set Wide (520px)"
                    >
                      520px
                    </button>
                  </div>
                </>
              )}
            </div>

            <div
              className={`absolute flex flex-col items-center justify-center transition-all ${
                highlightField === 'qrCodeBack' ? 'ring-4 ring-emerald-500 rounded-lg z-20 shadow-lg' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${media.qrCodeBack.x}px`,
                top: `${media.qrCodeBack.y}px`,
                width: `${media.qrCodeBack.width}px`,
                height: `${media.qrCodeBack.height}px`,
                borderRadius: `${media.qrCodeBack.borderRadius || 0}px`,
                border: 'none',
                background: 'transparent',
                opacity: (media.qrCodeBack.opacity !== undefined && media.qrCodeBack.opacity <= 0.8) ? media.qrCodeBack.opacity : 0.8,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'qrCodeBack', media.qrCodeBack.x, media.qrCodeBack.y)
              }
              onMouseEnter={() => setHoveredFieldId('qrCodeBack')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              {cleanQrUrl || data.qrCodeImageUrl || qrDataUrl ? (
                <img
                  src={cleanQrUrl || data.qrCodeImageUrl || qrDataUrl}
                  alt="Exact Cropped QR Code from PDF Slip"
                  className="w-full h-full object-contain pointer-events-none select-none"
                  style={{ 
                    imageRendering: 'crisp-edges',
                    mixBlendMode: 'multiply',
                  }}
                />
              ) : (
                <div
                  className="w-full h-full bg-white/40 flex flex-col items-center justify-center text-xs text-gray-400 p-2 text-center border border-dashed border-gray-300 rounded-lg"
                >
                  <span className="text-[10px] font-medium text-gray-500">Biometric QR Matrix</span>
                </div>
              )}

              {(showCoordinatesBadges || highlightField === 'qrCodeBack' || hoveredFieldId === 'qrCodeBack') && !isExporting && (
                <div className="absolute -top-3 right-2 bg-slate-900 text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow-md pointer-events-none flex items-center gap-1 z-30">
                  <span className="text-emerald-400">X:{media.qrCodeBack.x}</span>
                  <span className="text-cyan-400">Y:{media.qrCodeBack.y}</span>
                </div>
              )}
            </div>

            {tConfig.showFooterNotice && !hasCustomBg && (
              <div className="absolute left-10 right-10 bottom-3 flex items-center justify-between border-t border-emerald-900/10 pt-2 text-[10px] text-gray-700 leading-tight" style={{ fontFamily: cardFontFamilyCss }}>
                <div className="max-w-[680px]">
                  <p className="font-semibold text-gray-900" style={{ fontFamily: cardFontFamilyCss }}>
                    ይህ መታወቂያ የጠፋ ካገኙ በአቅራቢያዎ ላለ ፖሊስ ጣቢያ ወይም ለተቋሙ ያስረክቡ። ለተጨማሪ 9779 ላይ ይደውሉ ወይም id.et/cardprint ይጎብኙ።
                  </p>
                  <p className="text-gray-600" style={{ fontFamily: cardFontFamilyCss }}>
                    If lost and found, please return to nearby police station or to the institution. Call 9779 or visit id.et/cardprint for more.
                  </p>
                </div>
              </div>
            )}

            <div
              id="field-serialNumber"
              className={`absolute text-right transition-all ${
                highlightField === 'serialNumber' ? 'ring-2 ring-emerald-500 rounded z-20' : ''
              } ${interactive ? 'cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-emerald-400' : ''}`}
              style={{
                left: `${fields.serialNumber.x}px`,
                top: `${fields.serialNumber.y}px`,
              }}
              onPointerDown={(e) =>
                handlePointerDown(e, 'serialNumber', fields.serialNumber.x, fields.serialNumber.y)
              }
              onMouseEnter={() => setHoveredFieldId('serialNumber')}
              onMouseLeave={() => setHoveredFieldId(null)}
            >
              <span 
                className="font-bold tracking-wider select-none bg-white px-2 py-0.5 rounded shadow-xs inline-block whitespace-nowrap"
                style={{
                  fontFamily: cardFontFamilyCss,
                  fontSize: `${fields.serialNumber.fontSize}px`,
                  color: fields.serialNumber.color || '#111827',
                  backgroundColor: '#ffffff',
                }}
              >
                SN : {(format7DigitSerial(data.serialNumber) || String(data.serialNumber || '0000000')).replace(/[^\d]/g, '').padStart(7, '0').slice(-7)}
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