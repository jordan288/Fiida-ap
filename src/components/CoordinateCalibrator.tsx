import React, { useState, useRef } from 'react';
import { Sliders, Copy, Check, Crosshair, RefreshCw, Eye, Move, QrCode, Lock, Unlock, RotateCcw, Sparkles, Upload, Wand2, X, AlertCircle, AlignCenter } from 'lucide-react';
import { CoordinatesConfig, IdCardData, TemplateConfig } from '../types';
import { CardRenderer } from './CardRenderer';
import { DEFAULT_COORDINATES } from '../data/defaultData';
import { smartDetectFromSource, SmartDetectResult } from '../utils/smartCoordinateDetector';
import { getEffectiveRegions } from '../utils/pdfRegionExtractor';
import { autoAlignFieldsToTemplate, AutoAlignResult } from '../utils/templateEdgeDetector';

interface CoordinateCalibratorProps {
  idData: IdCardData;
  config: CoordinatesConfig;
  setConfig: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  templateConfig?: TemplateConfig;
}

export const CoordinateCalibrator: React.FC<CoordinateCalibratorProps> = ({
  idData,
  config,
  setConfig,
  templateConfig,
}) => {
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [selectedFieldId, setSelectedFieldId] = useState<string>('fullNameAmharic');
  const [copied, setCopied] = useState(false);
  const [lockQrAspect, setLockQrAspect] = useState<boolean>(true);

  // Smart Detect State
  const [isSmartDetectOpen, setIsSmartDetectOpen] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [smartDetectResult, setSmartDetectResult] = useState<SmartDetectResult | null>(null);
  const [previousConfig, setPreviousConfig] = useState<CoordinatesConfig | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [appliedToast, setAppliedToast] = useState<boolean>(false);
  const [toastInfo, setToastInfo] = useState<{ title: string; subtitle: string } | null>(null);
  const [isAutoAligning, setIsAutoAligning] = useState<boolean>(false);
  const [autoAlignResult, setAutoAlignResult] = useState<AutoAlignResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAutoAlign = async () => {
    setIsAutoAligning(true);
    try {
      // Pick template image for active side, or fallback to opposite side or document scan
      const activeTemplateUrl = activeSide === 'front'
        ? (templateConfig?.frontImageUrl || idData.documentScanUrl)
        : (templateConfig?.backImageUrl || templateConfig?.frontImageUrl || idData.documentScanUrl);

      // Save previous config for easy reverting
      setPreviousConfig(JSON.parse(JSON.stringify(config)));

      const result = await autoAlignFieldsToTemplate(
        activeTemplateUrl,
        config.canvasWidth || 1012,
        config.canvasHeight || 638
      );

      setConfig(result.alignedConfig);
      setAutoAlignResult(result);
      setToastInfo({
        title: 'Auto-Align Complete!',
        subtitle: result.message,
      });
      setAppliedToast(true);
      setTimeout(() => setAppliedToast(false), 4500);
    } catch (err: any) {
      console.error('Auto-Align failed:', err);
      // Fallback: reset coordinates to default centered values
      setPreviousConfig(JSON.parse(JSON.stringify(config)));
      setConfig(DEFAULT_COORDINATES);
      setToastInfo({
        title: 'Fields Reset to Center',
        subtitle: 'Reset ID card fields to standard centered coordinates.',
      });
      setAppliedToast(true);
      setTimeout(() => setAppliedToast(false), 3500);
    } finally {
      setIsAutoAligning(false);
    }
  };

  const handleRunSmartDetect = async (source: File | string) => {
    setIsDetecting(true);
    setDetectError(null);
    try {
      const result = await smartDetectFromSource(source, config);
      setSmartDetectResult(result);
    } catch (err: any) {
      console.error('Smart Detect failed:', err);
      setDetectError(err?.message || 'Failed to detect coordinates from slip image');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleApplySmartCoordinates = () => {
    if (!smartDetectResult) return;
    setPreviousConfig(JSON.parse(JSON.stringify(config)));
    setConfig(smartDetectResult.detectedConfig);
    setToastInfo({
      title: 'Smart Detect Applied!',
      subtitle: `${smartDetectResult.detectedCount} field bounding boxes and positions calibrated to slip geometry.`,
    });
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 3500);
    setIsSmartDetectOpen(false);
  };

  const handleRevertSmartCoordinates = () => {
    if (previousConfig) {
      setConfig(previousConfig);
      setPreviousConfig(null);
    }
  };

  const handleSyncFromSlipExtractor = () => {
    const effectiveRegions = getEffectiveRegions();
    const markedPhoto = effectiveRegions.find((r) => r.id === 'photo');
    const markedQr = effectiveRegions.find((r) => r.id === 'qrCode');

    setPreviousConfig(JSON.parse(JSON.stringify(config)));

    setConfig((prev) => {
      const updated = { ...prev };
      // 1. Synchronize Photo position and dimensions:
      if (markedPhoto) {
        // Standard CR80 front portrait coordinates
        const wRatio = Math.max(0.1, markedPhoto.width / 20.0);
        const hRatio = Math.max(0.1, markedPhoto.height / 20.0);
        const newW = Math.round(Math.min(360, Math.max(240, 290 * wRatio)));
        const newH = Math.round(Math.min(480, Math.max(320, 390 * hRatio)));

        updated.media.photoFront = {
          ...prev.media.photoFront,
          x: 54,
          y: 168,
          width: newW,
          height: newH,
          borderRadius: 14,
        };

        if (prev.media.photoFrontSecondary) {
          updated.media.photoFrontSecondary = {
            ...prev.media.photoFrontSecondary,
            x: 818,
            y: 412,
            width: Math.round(newW * 0.48),
            height: Math.round(newH * 0.48),
            borderRadius: 8,
          };
        }
      }

      // 2. Synchronize QR Code if calibrated:
      if (markedQr && prev.media.qrCodeBack) {
        const qrSize = Math.round(Math.min(520, Math.max(380, (markedQr.width / 24.0) * 470)));
        updated.media.qrCodeBack = {
          ...prev.media.qrCodeBack,
          width: qrSize,
          height: qrSize,
        };
      }

      return updated;
    });

    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 3500);
  };

  // QR Code Specific Helpers for independent scale fine-tuning
  const qrMedia = config.media.qrCodeBack || DEFAULT_COORDINATES.media.qrCodeBack;
  const qrWidth = qrMedia.width ?? 470;
  const qrHeight = qrMedia.height ?? 470;
  const qrUniformSize = Math.round((qrWidth + qrHeight) / 2);
  const qrScalePercent = Math.round((qrUniformSize / 470) * 100);

  const handleUpdateQrSize = (newSize: number) => {
    setConfig((prev) => {
      const currentQr = prev.media.qrCodeBack || DEFAULT_COORDINATES.media.qrCodeBack;
      return {
        ...prev,
        media: {
          ...prev.media,
          qrCodeBack: {
            ...currentQr,
            width: newSize,
            height: lockQrAspect ? newSize : currentQr.height,
          },
        },
      };
    });
  };

  const handleUpdateQrHeight = (newHeight: number) => {
    setConfig((prev) => {
      const currentQr = prev.media.qrCodeBack || DEFAULT_COORDINATES.media.qrCodeBack;
      return {
        ...prev,
        media: {
          ...prev.media,
          qrCodeBack: {
            ...currentQr,
            height: newHeight,
          },
        },
      };
    });
  };

  const handleStepQrSize = (delta: number) => {
    const next = Math.max(160, Math.min(650, qrUniformSize + delta));
    handleUpdateQrSize(next);
  };

  const handleResetQrSize = () => {
    handleUpdateQrSize(470);
    if (!lockQrAspect) {
      handleUpdateQrHeight(470);
    }
  };

  const isMedia = 
    selectedFieldId === 'photoFront' || 
    selectedFieldId === 'photoFrontSecondary' || 
    selectedFieldId === 'frontBarcode' || 
    selectedFieldId === 'qrCodeBack' || 
    selectedFieldId === 'backFanCut' || 
    Boolean(config.media[selectedFieldId]);

  const currentField = config.fields[selectedFieldId];
  const currentMedia = config.media[selectedFieldId];

  const handleUpdateField = (key: string, value: any) => {
    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [selectedFieldId]: {
            ...prev.media[selectedFieldId],
            [key]: value,
            ...(selectedFieldId === 'backFanCut' && (key === 'width' || key === 'height') ? { fit: 'fill' } : {}),
          },
        },
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [selectedFieldId]: {
            ...prev.fields[selectedFieldId],
            [key]: value,
          },
        },
      }));
    }
  };

  const handleMoveField = (fieldId: string, newX: number, newY: number) => {
    const isTargetMedia = 
      fieldId === 'photoFront' || 
      fieldId === 'photoFrontSecondary' || 
      fieldId === 'frontBarcode' || 
      fieldId === 'qrCodeBack' || 
      fieldId === 'backFanCut' || 
      Boolean(config.media[fieldId]);

    if (isTargetMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...prev.media[fieldId],
            x: newX,
            y: newY,
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
            x: newX,
            y: newY,
          },
        },
      }));
    }
  };

  const handleResizeField = (fieldId: string, newWidth: number, newHeight: number) => {
    const isTargetMedia = 
      fieldId === 'photoFront' || 
      fieldId === 'photoFrontSecondary' || 
      fieldId === 'frontBarcode' || 
      fieldId === 'qrCodeBack' || 
      fieldId === 'backFanCut' || 
      Boolean(config.media[fieldId]);

    if (isTargetMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...prev.media[fieldId],
            width: newWidth,
            height: newHeight,
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
            maxWidth: newWidth,
          },
        },
      }));
    }
  };

  const handleResetCoordinates = () => {
    setConfig(DEFAULT_COORDINATES);
  };

  const generateCoordinatesJson = () => {
    return JSON.stringify(config, null, 2);
  };

  const handleCopyCoordinates = () => {
    navigator.clipboard.writeText(generateCoordinatesJson());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const frontFieldList = [
    { id: 'photoFront', name: 'Primary Portrait Photo (Frameless)' },
    { id: 'photoFrontSecondary', name: '2nd Security Photo (Frameless)' },
    { id: 'fullNameAmharic', name: 'Full Name (Amharic)' },
    { id: 'fullNameEnglish', name: 'Full Name (English)' },
    { id: 'dateOfBirth', name: 'Date of Birth (E.C. | G.C.)' },
    { id: 'sex', name: 'Sex / ፆታ (Full Male / Female)' },
    { id: 'dateOfIssueGc', name: 'Date of Issue (G.C. Calendar Layer)' },
    { id: 'dateOfIssueEth', name: 'Date of Issue (E.C. Calendar Layer)' },
    { id: 'dateOfExpiry', name: 'Date of Expiry (E.C. | G.C.)' },
    { id: 'frontBarcode', name: 'Front 1D Barcode Strip' },
    { id: 'fan', name: 'FAN (16 Digits Number)' },
  ];

  const backFieldList = [
    { id: 'qrCodeBack', name: 'High-Density Biometric QR Code' },
    { id: 'backFanCut', name: 'Back FAN Cutter (Cut-to-Layer Crop)' },
    { id: 'barcodeText', name: 'Back FAN / FCN Code Box' },
    { id: 'phoneNumber', name: 'Phone Number' },
    { id: 'nationality', name: 'Nationality' },
    { id: 'regionAmharic', name: 'Region / ክልል (Step 1: Top Amharic / Under English)' },
    { id: 'zoneSubcity', name: 'Zone / Subcity (Step 2: Top Amharic / Under English)' },
    { id: 'woredaKebele', name: 'Woreda (Step 3: Top Amharic / Under English)' },
    { id: 'serialNumber', name: 'Serial Number (SN)' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-emerald-600" />
            Pixel-Perfect Coordinate Calibrator & Visual Inspector
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Click any field directly on the card to inspect and tune its exact X/Y pixels, size, and export into Coordinates Config JSON.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {previousConfig && (
            <button
              onClick={handleRevertSmartCoordinates}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs"
              title="Revert coordinates to previous layout"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Revert
            </button>
          )}
          <button
            type="button"
            onClick={handleAutoAlign}
            disabled={isAutoAligning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 text-indigo-900 border border-indigo-200/90 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title="Detect ID card template edges using basic image processing and reset fields to default centered coordinates"
          >
            {isAutoAligning ? (
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
            ) : (
              <AlignCenter className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span>{isAutoAligning ? 'Detecting Edges...' : 'Auto-Align'}</span>
          </button>
          <button
            onClick={() => {
              setIsSmartDetectOpen(true);
              // If documentScanUrl is already available, automatically run initial scan
              if (idData.documentScanUrl && !smartDetectResult && !isDetecting) {
                handleRunSmartDetect(idData.documentScanUrl);
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            title="Automatically detect ID fields and estimate bounding boxes using image processing"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Smart Detect</span>
          </button>
          <button
            type="button"
            onClick={handleSyncFromSlipExtractor}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Take and sync photo and slip positions from PDF Slip Extractor"
          >
            <Crosshair className="w-3.5 h-3.5 text-blue-600" />
            <span>Sync Slip Positions</span>
          </button>
          <button
            onClick={handleResetCoordinates}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleCopyCoordinates}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Coordinates JSON!' : 'Copy Coordinates (JSON)'}
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Visual Card Stage */}
        <div className="lg:col-span-8 bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center">
          {/* Stage Controls: Side Selector & Stage Auto-Align Bar */}
          <div className="flex flex-wrap items-center justify-between w-full max-w-[800px] mb-6 gap-2.5">
            <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => {
                  setActiveSide('front');
                  setSelectedFieldId('fullNameAmharic');
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeSide === 'front'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Front Side Template
              </button>
              <button
                onClick={() => {
                  setActiveSide('back');
                  setSelectedFieldId('qrCodeBack');
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeSide === 'back'
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Back Side Template
              </button>
            </div>

            <div className="flex items-center gap-2">
              {autoAlignResult && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-1 rounded-lg">
                  Edges: [{autoAlignResult.detectedBounds.left},{autoAlignResult.detectedBounds.top} – {autoAlignResult.detectedBounds.right},{autoAlignResult.detectedBounds.bottom}]
                </span>
              )}
              <button
                type="button"
                onClick={handleAutoAlign}
                disabled={isAutoAligning}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-indigo-100 border border-slate-700/80 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                title="Detect template perimeter edges and center all card fields"
              >
                {isAutoAligning ? (
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                ) : (
                  <AlignCenter className="w-3.5 h-3.5 text-indigo-400" />
                )}
                <span>Auto-Align to Template</span>
              </button>
            </div>
          </div>

          <div className="py-2">
            <CardRenderer
              side={activeSide}
              data={idData}
              config={config}
              templateConfig={templateConfig}
              scale={0.75}
              highlightField={selectedFieldId}
              onSelectField={(id) => setSelectedFieldId(id)}
              onMoveField={handleMoveField}
              onResizeField={handleResizeField}
              interactive={true}
            />
          </div>

          <p className="text-xs text-slate-400 mt-4 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            Selected: <strong className="text-white font-mono">{selectedFieldId}</strong> — Click any area on the card to switch target
          </p>
        </div>

        {/* Fine Tuning Panel */}
        <div className="lg:col-span-4 space-y-5">
          {/* Field Selection List */}
          <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              {activeSide === 'front' ? 'Front Side Elements' : 'Back Side Elements'}
            </h3>

            <div className="space-y-1.5">
              {(activeSide === 'front' ? frontFieldList : backFieldList).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedFieldId(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                    selectedFieldId === item.id
                      ? 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-600 font-bold'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span>{item.name}</span>
                  <span className="font-mono text-[11px] text-gray-400">{item.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dedicated QR Code Size & Scale Controller */}
          <div className="bg-gradient-to-br from-white to-emerald-50/40 border border-emerald-200/90 rounded-3xl p-5 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shadow-2xs">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    QR Code Size & Scale
                  </h3>
                  <p className="text-[11px] text-gray-500">Fine-tune scale independently of card fields</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-lg shadow-2xs">
                  {qrWidth} × {qrHeight} px
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 px-1.5 py-0.5 rounded-md">
                  {qrScalePercent}%
                </span>
              </div>
            </div>

            {/* Scale Slider */}
            <div className="space-y-1.5 bg-white p-3 rounded-2xl border border-gray-100 shadow-2xs">
              <div className="flex justify-between text-xs font-semibold text-gray-700">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-emerald-600" />
                  <span>QR Code Scale (1:1 Size)</span>
                </span>
                <span className="font-mono text-emerald-700 font-bold">{qrUniformSize} px</span>
              </div>
              <input
                type="range"
                min="180"
                max="620"
                step="1"
                value={qrUniformSize}
                onChange={(e) => handleUpdateQrSize(parseInt(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                <span>180px (38%)</span>
                <span>470px (100% Standard)</span>
                <span>620px (132%)</span>
              </div>
            </div>

            {/* Stepper Buttons & Reset */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 flex-1">
                {[-5, -1, 1, 5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => handleStepQrSize(delta)}
                    className="flex-1 py-1 text-[11px] font-mono font-bold bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    title={`Nudge QR size by ${delta > 0 ? `+${delta}` : delta} pixels`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleResetQrSize}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Reset QR Code size to standard 470px"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset (470px)</span>
              </button>
            </div>

            {/* Quick Scale Presets */}
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Standard Size Presets
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: '380px', size: 380, pct: '81%' },
                  { label: '430px', size: 430, pct: '91%' },
                  { label: '470px', size: 470, pct: '100%' },
                  { label: '500px', size: 500, pct: '106%' },
                  { label: '530px', size: 530, pct: '113%' },
                ].map((p) => (
                  <button
                    key={p.size}
                    type="button"
                    onClick={() => handleUpdateQrSize(p.size)}
                    className={`py-1 text-center rounded-lg border transition-all cursor-pointer ${
                      qrUniformSize === p.size
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-50 hover:border-emerald-200 text-[10px]'
                    }`}
                  >
                    <div className="font-bold text-[10px] leading-tight">{p.label}</div>
                    <div className={`text-[8px] leading-tight ${qrUniformSize === p.size ? 'text-emerald-100' : 'text-gray-400'}`}>
                      {p.pct}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer controls: switch/select and aspect ratio toggle */}
            <div className="flex items-center justify-between pt-1 border-t border-emerald-100/80 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveSide('back');
                  setSelectedFieldId('qrCodeBack');
                }}
                className={`text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  activeSide === 'back' && selectedFieldId === 'qrCodeBack'
                    ? 'text-emerald-800 font-bold'
                    : 'text-emerald-600 hover:text-emerald-800 hover:underline'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                <span>
                  {activeSide === 'back' && selectedFieldId === 'qrCodeBack'
                    ? 'Selected on Back Stage'
                    : 'Select & Calibrate QR (Back)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setLockQrAspect(!lockQrAspect)}
                className="text-[10px] font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"
                title={lockQrAspect ? "Aspect Ratio Locked (1:1 Square)" : "Aspect Ratio Unlocked"}
              >
                {lockQrAspect ? <Lock className="w-2.5 h-2.5 text-emerald-600" /> : <Unlock className="w-2.5 h-2.5 text-amber-600" />}
                <span>{lockQrAspect ? '1:1 Locked' : 'Unlocked'}</span>
              </button>
            </div>
          </div>

          {/* Coordinate Sliders */}
          <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-600" />
              Adjust Position & Sizing
            </h3>

            {isMedia && currentMedia ? (
              <div className="space-y-4">
                {/* X Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>X Position (Horizontal)</span>
                    <span className="font-mono text-emerald-700">{currentMedia.x} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={currentMedia.x ?? 0}
                    onChange={(e) => handleUpdateField('x', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Y Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Y Position (Vertical)</span>
                    <span className="font-mono text-emerald-700">{currentMedia.y} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="600"
                    value={currentMedia.y ?? 0}
                    onChange={(e) => handleUpdateField('y', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Sizing: Custom QR Code Size Slider for qrCodeBack, or Width/Height for others */}
                {selectedFieldId === 'qrCodeBack' ? (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-bold text-gray-900">QR Code Size / Scale</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                          {qrWidth} × {qrHeight} px ({qrScalePercent}%)
                        </span>
                        <button
                          type="button"
                          onClick={() => setLockQrAspect(!lockQrAspect)}
                          className={`p-1 rounded-md text-xs transition-colors cursor-pointer ${
                            lockQrAspect
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                          title={lockQrAspect ? "Aspect Ratio Locked 1:1" : "Aspect Ratio Unlocked"}
                        >
                          {lockQrAspect ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-medium text-gray-600 mb-1">
                        <span>{lockQrAspect ? 'QR Code Size (1:1 Proportional)' : 'QR Width'}</span>
                        <span className="font-mono text-emerald-700 font-bold">{qrUniformSize} px</span>
                      </div>
                      <input
                        type="range"
                        min="180"
                        max="620"
                        step="1"
                        value={qrUniformSize}
                        onChange={(e) => handleUpdateQrSize(parseInt(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>

                    {/* Stepper Buttons */}
                    <div className="flex items-center gap-1">
                      {[-5, -1, 1, 5].map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          onClick={() => handleStepQrSize(delta)}
                          className="flex-1 py-1 text-[11px] font-mono font-bold bg-white hover:bg-emerald-100 text-gray-700 hover:text-emerald-800 border border-gray-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                        >
                          {delta > 0 ? `+${delta}px` : `${delta}px`}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleResetQrSize}
                        className="px-2 py-1 text-[11px] font-semibold bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        title="Reset QR Code size to 470px"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {/* Presets */}
                    <div className="pt-1">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Size Presets
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { label: '380px', size: 380, desc: '81%' },
                          { label: '430px', size: 430, desc: '91%' },
                          { label: '470px', size: 470, desc: '100%' },
                          { label: '500px', size: 500, desc: '106%' },
                          { label: '530px', size: 530, desc: '113%' },
                        ].map((preset) => (
                          <button
                            key={preset.size}
                            type="button"
                            onClick={() => handleUpdateQrSize(preset.size)}
                            className={`py-1 px-0.5 text-center rounded-lg border transition-all cursor-pointer ${
                              qrUniformSize === preset.size
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-emerald-50 text-[10px]'
                            }`}
                          >
                            <div className="font-bold text-[10px] leading-tight">{preset.label}</div>
                            <div className={`text-[8px] leading-tight opacity-80 ${qrUniformSize === preset.size ? 'text-emerald-100' : 'text-gray-400'}`}>
                              {preset.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* If unlocked: independent height slider */}
                    {!lockQrAspect && (
                      <div className="pt-2 border-t border-emerald-200/60">
                        <div className="flex justify-between text-[11px] font-medium text-gray-600 mb-1">
                          <span>Independent QR Height</span>
                          <span className="font-mono text-emerald-700 font-bold">{qrHeight} px</span>
                        </div>
                        <input
                          type="range"
                          min="180"
                          max="620"
                          step="1"
                          value={qrHeight}
                          onChange={(e) => handleUpdateQrHeight(parseInt(e.target.value))}
                          className="w-full accent-emerald-600"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Width / Stretch */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span>{selectedFieldId === 'backFanCut' ? 'Width / Stretch (የተዘረጋ ስፋት)' : 'Width'}</span>
                        <span className="font-mono text-emerald-700 font-bold">{currentMedia.width} px</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max={selectedFieldId === 'backFanCut' ? 850 : 650}
                        value={currentMedia.width ?? 100}
                        onChange={(e) => handleUpdateField('width', parseInt(e.target.value))}
                        className="w-full accent-emerald-600"
                      />

                      {/* Back FAN Stretch Presets */}
                      {selectedFieldId === 'backFanCut' && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {[440, 520, 600, 700].map((presetW) => (
                            <button
                              key={presetW}
                              type="button"
                              onClick={() => handleUpdateField('width', presetW)}
                              className={`flex-1 py-1 text-[10px] font-bold rounded-md border transition-colors cursor-pointer ${
                                (currentMedia.width ?? 440) === presetW
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {presetW}px
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Height */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                        <span>Height</span>
                        <span className="font-mono text-emerald-700">{currentMedia.height} px</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="650"
                        value={currentMedia.height ?? 100}
                        onChange={(e) => handleUpdateField('height', parseInt(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                  </>
                )}

                {/* Border Radius */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Corner Radius</span>
                    <span className="font-mono text-emerald-700">{currentMedia.borderRadius ?? 8} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={currentMedia.borderRadius ?? 8}
                    onChange={(e) => handleUpdateField('borderRadius', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Opacity (if applicable) */}
                {selectedFieldId === 'photoFrontSecondary' && (
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                      <span>Layer Opacity</span>
                      <span className="font-mono text-emerald-700">{Math.round((currentMedia.opacity ?? 0.85) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={Math.round((currentMedia.opacity ?? 0.85) * 100)}
                      onChange={(e) => handleUpdateField('opacity', parseInt(e.target.value) / 100)}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                )}
              </div>
            ) : currentField ? (
              <div className="space-y-4">
                {/* X Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>X Position (Horizontal)</span>
                    <span className="font-mono text-emerald-700">{currentField.x} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={currentField.x ?? 0}
                    onChange={(e) => handleUpdateField('x', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Y Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Y Position (Vertical)</span>
                    <span className="font-mono text-emerald-700">{currentField.y} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="640"
                    value={currentField.y ?? 0}
                    onChange={(e) => handleUpdateField('y', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Font Size */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Font Size</span>
                    <span className="font-mono text-emerald-700">{currentField.fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="48"
                    value={currentField.fontSize ?? 14}
                    onChange={(e) => handleUpdateField('fontSize', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Rotation (useful for vertical issue dates) */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Layer Rotation</span>
                    <span className="font-mono text-emerald-700">{currentField.rotation ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="45"
                    value={currentField.rotation ?? 0}
                    onChange={(e) => handleUpdateField('rotation', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Select a field above to calibrate.</p>
            )}
          </div>
        </div>
      </div>

      {/* Applied Toast Notification */}
      {appliedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500/40 animate-fade-in">
          <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-bold">{toastInfo?.title || 'Coordinates Updated!'}</p>
            <p className="text-[11px] text-emerald-200">{toastInfo?.subtitle || 'ID card coordinates calibrated.'}</p>
          </div>
        </div>
      )}

      {/* Smart Detect Modal */}
      {isSmartDetectOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Smart Detect ID Field Coordinates</h3>
                  <p className="text-xs text-gray-500">
                    Image processing automatically identifies anchors & bounding boxes from your slip
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSmartDetectOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Slip Source Options */}
              <div className="flex flex-wrap items-center gap-3">
                {idData.documentScanUrl && (
                  <button
                    onClick={() => handleRunSmartDetect(idData.documentScanUrl!)}
                    disabled={isDetecting}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 border border-emerald-200 rounded-2xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Wand2 className="w-4 h-4 text-emerald-600" />
                    <span>Scan Current Slip ({idData.fullNameEnglish || 'Active'})</span>
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDetecting}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-2xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4 text-gray-500" />
                  <span>Upload Slip Image or PDF...</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleRunSmartDetect(file);
                  }}
                />
              </div>

              {/* Detection Loading State */}
              {isDetecting && (
                <div className="py-12 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-dashed border-emerald-300">
                  <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-gray-800">Analyzing slip image geometry...</p>
                  <p className="text-[11px] text-gray-500">Detecting QR code anchor, portrait boundaries & barcode line</p>
                </div>
              )}

              {/* Error Message */}
              {detectError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-800 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Detection Notice</strong>
                    <span>{detectError}</span>
                  </div>
                </div>
              )}

              {/* Detection Results */}
              {smartDetectResult && !isDetecting && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200 p-3.5 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-950">
                        {smartDetectResult.detectedCount} Elements Successfully Calibrated
                      </span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700 bg-white px-2.5 py-1 rounded-xl border border-emerald-200">
                      {smartDetectResult.confidenceScore}% Optical Match
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      Detected Field Adjustments
                    </h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {smartDetectResult.details.map((detail) => (
                        <div
                          key={detail.fieldId}
                          className="bg-gray-50 border border-gray-200/80 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{detail.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                                detail.side === 'front' ? 'bg-emerald-100 text-emerald-800' : 'bg-cyan-100 text-cyan-800'
                              }`}>
                                {detail.side}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">{detail.description}</p>
                          </div>

                          <div className="text-right font-mono text-[11px]">
                            <div className="text-emerald-700 font-bold">
                              X:{detail.detected.x} Y:{detail.detected.y}
                              {detail.detected.width && ` (${detail.detected.width}×${detail.detected.height})`}
                            </div>
                            <div className="text-gray-400 text-[10px] line-through">
                              prev: {detail.before.x}, {detail.before.y}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
              <button
                onClick={() => setIsSmartDetectOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>

              {smartDetectResult && !isDetecting && (
                <button
                  onClick={handleApplySmartCoordinates}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply Estimated Coordinates</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
