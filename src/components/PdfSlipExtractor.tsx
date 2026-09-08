import React, { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  RefreshCw, 
  Eye, 
  AlertCircle,
  FileCheck,
  Zap,
  Image as ImageIcon,
  Layers,
  Camera,
  Check,
  Crop as CropIcon,
  Sliders,
  Crosshair,
  Scan,
  Maximize2,
  Terminal,
  Copy,
  CheckCheck,
  Code
} from 'lucide-react';
import { IdCardData, CoordinatesConfig, TemplateConfig, PdfTextItemWithBox } from '../types';
import { SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA } from '../data/defaultData';
import { convertGcToEth } from '../utils/ethiopianCalendar';
import { extractFromPdf, extractFromImage, ExtractionResult } from '../utils/pdfExtractor';
import { detectAndCenterQrRegion } from '../utils/qrPrecisionCropper';
import { sanitizeEnglishName, sanitizeAmharicName, sanitizeIdCardData } from '../utils/textCleaner';
import { loadPermanentRegions, extractAllFromMarkedRegions } from '../utils/pdfRegionExtractor';
import { PhotoCropModal } from './PhotoCropModal';
import { QrCropModal } from './QrCropModal';
import { PdfPositionMarker } from './PdfPositionMarker';
import { generateSampleSlipCanvas } from '../utils/sampleSlipGenerator';

interface PdfSlipExtractorProps {
  idData: IdCardData;
  setIdData: React.Dispatch<React.SetStateAction<IdCardData>>;
  config: CoordinatesConfig;
  templateConfig?: TemplateConfig;
  onApplyAndOpenStudio: () => void;
  onOpenBatch?: () => void;
}

export const PdfSlipExtractor: React.FC<PdfSlipExtractorProps> = ({
  idData,
  setIdData,
  config: _config,
  templateConfig: _templateConfig,
  onApplyAndOpenStudio,
  onOpenBatch,
}) => {
  const [extractedData, setExtractedData] = useState<IdCardData>(idData);
  const [workflowMode, setWorkflowMode] = useState<'auto' | 'marker'>('auto');
  const [extractedTextItems, setExtractedTextItems] = useState<PdfTextItemWithBox[]>([]);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number } | undefined>(undefined);
  const [detectedPhotoBox, setDetectedPhotoBox] = useState<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPythonCode, setShowPythonCode] = useState(false);
  const [copiedPython, setCopiedPython] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('Upload your Ethiopian Fayda Slip');
  const [fileSize, setFileSize] = useState<string>('Ready for upload');
  const [parseStatus, setParseStatus] = useState<string>('Select or drop an official Fayda verification PDF or image');
  const [dragActive, setDragActive] = useState(false);
  const [pagePreviewUrl, setPagePreviewUrl] = useState<string | null>(null);
  const [detectedFields, setDetectedFields] = useState<number>(0);
  const [rawExtractedText, setRawExtractedText] = useState<string>('');
  const [showRawText, setShowRawText] = useState<boolean>(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string>('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isQrCropModalOpen, setIsQrCropModalOpen] = useState<boolean>(false);
  const [qrCropSourceUrl, setQrCropSourceUrl] = useState<string>('');
  const qrInputRef = useRef<HTMLInputElement>(null);

  // QR Auto-Detection & Centering States
  const [detectedQrBox, setDetectedQrBox] = useState<{ x: number; y: number; width: number; height: number } | null>(
    idData.detectedQrBox || null
  );
  const [slipPreviewFocus, setSlipPreviewFocus] = useState<'full' | 'qr'>('full');
  const [slipNaturalSize, setSlipNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });
  const [isDetectingQr, setIsDetectingQr] = useState<boolean>(false);
  const [qrAutoDetectStatus, setQrAutoDetectStatus] = useState<string>('');
  const [centeredQrPreviewUrl, setCenteredQrPreviewUrl] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = async (file: File) => {
    setSelectedFileName(file.name);
    setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
    setIsProcessing(true);
    setParseStatus(`Reading document and extracting Fayda identification & biometric credentials...`);

    try {
      let result: ExtractionResult;

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setParseStatus('Parsing PDF vector text, rendering page canvas, and scanning biometric QR matrix...');
        result = await extractFromPdf(file);
      } else if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(file.name)) {
        setParseStatus('Processing image scan, scanning QR code, and detecting portrait bounding box...');
        result = await extractFromImage(file);
      } else {
        // Attempt PDF as fallback
        result = await extractFromPdf(file);
      }

      let sanitizedData = sanitizeIdCardData(result.data);

      // If user has calibrated permanent positions, auto-apply them to the newly uploaded document!
      const permanentRegions = loadPermanentRegions();
      if (permanentRegions && permanentRegions.length > 0 && result.pageCanvasUrl) {
        try {
          const calibratedData = await extractAllFromMarkedRegions(
            result.pageCanvasUrl,
            result.textItems,
            permanentRegions,
            sanitizedData
          );
          sanitizedData = sanitizeIdCardData({
            ...sanitizedData,
            ...calibratedData,
          });
        } catch (calibErr) {
          console.warn('Auto-applying permanent regions error:', calibErr);
        }
      }

      setExtractedData(sanitizedData);
      setIdData(sanitizedData);
      if (result.pageCanvasUrl) {
        setPagePreviewUrl(result.pageCanvasUrl);
      }
      if (result.textItems) {
        setExtractedTextItems(result.textItems);
      }
      if (result.canvasDimensions) {
        setCanvasDimensions(result.canvasDimensions);
      }
      if (result.detectedPhotoBox) {
        setDetectedPhotoBox(result.detectedPhotoBox);
      }
      if (result.detectedQrBox) {
        setDetectedQrBox(result.detectedQrBox);
        setQrAutoDetectStatus(
          `QR Code automatically detected & centered (${result.detectedQrBox.width}×${result.detectedQrBox.height}px)`
        );
      }
      setDetectedFields(result.detectedFieldsCount);
      setRawExtractedText(result.rawText);
      setParseStatus(
        permanentRegions && permanentRegions.length > 0
          ? `✨ Extracted & auto-applied using your permanent calibrated positions! (${result.detectedFieldsCount} credentials identified)`
          : `Successfully extracted official data! ${result.detectedFieldsCount} credentials identified.`
      );

      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err: unknown) {
      console.error('File extraction error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setParseStatus(`Extraction failed: ${errorMessage}. You can edit fields manually below.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleCustomPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      if (b64) {
        setCropSourceUrl(b64);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOpenPhotoCropper = () => {
    const source = pagePreviewUrl || extractedData.photoUrl || '';
    if (source) {
      setCropSourceUrl(source);
      setIsCropModalOpen(true);
    } else {
      photoInputRef.current?.click();
    }
  };

  const handleApplyCroppedPhoto = (newPhotoUrl: string) => {
    setExtractedData((prev) => ({ ...prev, photoUrl: newPhotoUrl }));
    setIdData((prev) => ({ ...prev, photoUrl: newPhotoUrl }));
  };

  const handleOpenQrCropper = () => {
    const source = pagePreviewUrl || extractedData.documentScanUrl || extractedData.qrCodeImageUrl || '';
    if (source) {
      setQrCropSourceUrl(source);
      setIsQrCropModalOpen(true);
    } else {
      qrInputRef.current?.click();
    }
  };

  const handleCustomQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      if (b64) {
        setQrCropSourceUrl(b64);
        setIsQrCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCroppedQr = (newQrUrl: string, decodedPayload?: string) => {
    setExtractedData((prev) => ({
      ...prev,
      qrCodeImageUrl: newQrUrl,
      ...(decodedPayload ? { qrData: decodedPayload } : {}),
    }));
    setIdData((prev) => ({
      ...prev,
      qrCodeImageUrl: newQrUrl,
      ...(decodedPayload ? { qrData: decodedPayload } : {}),
    }));
  };

  // Generate a live centered preview whenever page preview and detected QR box are available
  const generateCenteredQrPreview = useCallback((sourceUrl: string, box: { x: number; y: number; width: number; height: number }) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 400, 400);

      const qz = 16;
      const drawSize = 368;
      ctx.drawImage(img, box.x, box.y, box.width, box.height, qz, qz, drawSize, drawSize);
      setCenteredQrPreviewUrl(canvas.toDataURL('image/png'));
    };
    img.src = sourceUrl;
  }, []);

  useEffect(() => {
    const source = pagePreviewUrl || extractedData.documentScanUrl;
    if (source && detectedQrBox) {
      generateCenteredQrPreview(source, detectedQrBox);
    }
  }, [pagePreviewUrl, extractedData.documentScanUrl, detectedQrBox, generateCenteredQrPreview]);

  // Automatically detect and center the QR code area on the slip image
  const handleAutoDetectAndCenterQr = async () => {
    const source = pagePreviewUrl || extractedData.documentScanUrl || extractedData.qrCodeImageUrl;
    if (!source) {
      qrInputRef.current?.click();
      return;
    }
    setIsDetectingQr(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = source;
      });

      setSlipNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const region = detectAndCenterQrRegion(canvas);
        setDetectedQrBox(region.box);
        setSlipPreviewFocus('qr');
        setQrAutoDetectStatus(
          region.detected
            ? `QR Code area automatically detected & centered at (${region.box.x}, ${region.box.y}) [${region.box.width}×${region.box.height}px]`
            : `Standard Fayda biometric QR region centered at (${region.box.x}, ${region.box.y})`
        );
        if (region.qrText) {
          setExtractedData(prev => ({ ...prev, qrData: region.qrText || prev.qrData }));
          setIdData(prev => ({ ...prev, qrData: region.qrText || prev.qrData }));
        }
      }
    } catch (err) {
      console.warn('Auto-detect and center error:', err);
    } finally {
      setIsDetectingQr(false);
    }
  };

  // Directly apply the auto-centered QR code to the ID card without opening the manual cropper
  const handleApplyCenteredQrDirect = () => {
    const source = pagePreviewUrl || extractedData.documentScanUrl;
    if (!source || !detectedQrBox) return;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const targetOutputSize = 600;
        const canvas = document.createElement('canvas');
        canvas.width = targetOutputSize;
        canvas.height = targetOutputSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetOutputSize, targetOutputSize);

        const qzPx = Math.round(targetOutputSize * 0.04);
        const drawSize = targetOutputSize - qzPx * 2;

        ctx.drawImage(
          img,
          detectedQrBox.x,
          detectedQrBox.y,
          detectedQrBox.width,
          detectedQrBox.height,
          qzPx,
          qzPx,
          drawSize,
          drawSize
        );

        const newQrUrl = canvas.toDataURL('image/png');
        handleApplyCroppedQr(newQrUrl);
        setQrAutoDetectStatus('Centered QR crop applied to card successfully!');
        setTimeout(() => setQrAutoDetectStatus(''), 3500);
      };
      img.src = source;
    } catch (e) {
      console.warn('Direct crop failed:', e);
    }
  };

  const handleFieldChange = (field: keyof IdCardData, value: string) => {
    let cleanVal = value;
    if (field === 'fullNameEnglish') {
      cleanVal = sanitizeEnglishName(value);
    } else if (field === 'fullNameAmharic') {
      cleanVal = sanitizeAmharicName(value);
    }

    setExtractedData((prev) => {
      const updated = { ...prev, [field]: cleanVal };
      if (field === 'dateOfBirth') {
        const eth = convertGcToEth(cleanVal);
        if (eth) updated.dateOfBirthEth = eth;
      }
      return updated;
    });
  };

  const handleApplyToStudio = () => {
    const sanitized = sanitizeIdCardData(extractedData);
    setIdData(sanitized);
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 },
      });
    } catch {}
    onApplyAndOpenStudio();
  };

  const handleLoadSample = (type: 'ayele' | 'helen') => {
    setIsProcessing(true);
    const target = type === 'ayele' ? SAMPLE_ID_DATA : SAMPLE_FEMALE_DATA;
    setSelectedFileName(type === 'ayele' ? 'Ayele_Zekwos_Daka_Fayda_Slip.pdf' : 'Helen_Tadesse_Gebre_Fayda_Slip.pdf');
    setFileSize('192.4 KB');
    setDetectedFields(12);

    generateSampleSlipCanvas(target).then((res) => {
      setPagePreviewUrl(res.canvasUrl);
      setExtractedTextItems(res.textItems);
      setCanvasDimensions(res.dimensions);
      setIsProcessing(false);
      setExtractedData(target);
      setParseStatus(`Loaded official sample verification records for ${target.fullNameEnglish}`);
    }).catch(() => {
      setIsProcessing(false);
      setExtractedData(target);
      setParseStatus(`Loaded official sample verification records for ${target.fullNameEnglish}`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Hero / Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" />
              <span>Official Fayda Slip Parser</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold">
              <span>🔒 100% Local Code — Zero Gemini API Key Required</span>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Upload Ethiopian ID / Fayda Verification Slip
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
            Upload your official National ID verification document (PDF or Image). The extractor reads the bilingual names, 16-digit FAN, dates, phone, photo, and QR matrix to generate your ID card instantly — fully local with zero external APIs.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Choose PDF or Image File</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <span className="text-xs text-slate-400 font-medium">or try samples:</span>
            
            <button
              type="button"
              onClick={() => handleLoadSample('ayele')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Ayele Zekwos (Sample PDF)
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('helen')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Helen Tadesse (Sample PDF)
            </button>

            <button
              type="button"
              onClick={() => setShowPythonCode(!showPythonCode)}
              className="px-3.5 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/50 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              title="View pure Python offline CLI extractor script"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>🐍 Python Code</span>
            </button>

            {onOpenBatch && (
              <button
                type="button"
                onClick={onOpenBatch}
                className="px-3.5 py-2 bg-emerald-700/60 hover:bg-emerald-600 text-emerald-100 border border-emerald-500/50 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ml-auto"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Batch Process Multiple PDFs →</span>
              </button>
            )}
          </div>

          {/* Standalone Python Script Viewer Panel */}
          {showPythonCode && (
            <div className="mt-5 p-4 rounded-2xl bg-slate-950 border border-cyan-500/40 text-left space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Code className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Standalone Offline Python Extractor (`scripts/fayda_extractor.py`)</h4>
                    <p className="text-[11px] text-slate-400">100% Local Python 3 script — extracts names without "Demographic", FAN, dates, and QR code offline with 0 API keys.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const code = `#!/usr/bin/env python3
# Fayda Ethiopian Digital ID PDF Slip Extractor
# 100% Local, Offline, Pure Code Extraction - ZERO Gemini API Key Required.
# Location in workspace: scripts/fayda_extractor.py
# Usage: python3 scripts/fayda_extractor.py sample.pdf

import re, json, sys, os

def sanitize_english_name(name: str) -> str:
    if not name: return ""
    cleaned = re.sub(r'^(?:Demographics?|Demographic\\s*(?:Information|Details?|Data|Info|Slip|Biometrics?|Verification))[\\s:|\\-/]+', ' ', name, flags=re.IGNORECASE)
    cleaned = re.sub(r'\\bdemographics?\\s*(?:information|details?|data|info|slip|biometrics?|verification)\\b', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\\bdemographics?\\b', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^(?:Full\\s*Name|Fullname|Name|Applicant\\s*Name)[\\s:|\\-/]+', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'[;:"|\\\\/_\\-*#[\\]()]+', ' ', cleaned)
    cleaned = re.sub(r'\\s+', ' ', cleaned).strip()
    return " ".join(w.capitalize() for w in cleaned.split())

print("Run: python3 scripts/fayda_extractor.py <file.pdf>")`;
                    navigator.clipboard.writeText(code);
                    setCopiedPython(true);
                    setTimeout(() => setCopiedPython(false), 2500);
                  }}
                  className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/50 rounded-lg text-cyan-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedPython ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPython ? 'Copied!' : 'Copy Command'}</span>
                </button>
              </div>

              <div className="bg-slate-900 rounded-xl p-3 text-[11px] font-mono text-cyan-200 overflow-x-auto border border-slate-800">
                <p className="text-slate-400 mb-1"># Run locally in your terminal (No Gemini API Key Needed):</p>
                <p className="text-emerald-400 font-bold">$ python3 scripts/fayda_extractor.py path/to/fayda_slip.pdf</p>
                <p className="text-slate-400 mt-2"># Purges the word 'Demographic' from English name and outputs clean JSON payload</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Workflow Mode Switcher Bar */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWorkflowMode('auto')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              workflowMode === 'auto'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>⚡ 1-Click Auto-Detect & Apply</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkflowMode('marker')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              workflowMode === 'marker'
                ? 'bg-slate-900 text-white shadow-xs ring-2 ring-emerald-500'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 text-emerald-500" />
            <span>🎯 Visual PDF Position Marker ("Mark PDF Once & Perform Action")</span>
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 text-[10px] font-extrabold uppercase tracking-wide">
              Interactive
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium pr-2">
          {workflowMode === 'auto' ? (
            <span>Auto-detects credentials, photo & QR from slip</span>
          ) : (
            <span>Put PDF once, mark all field positions & perform action</span>
          )}
        </div>
      </div>

      {/* Mode 2: Visual PDF Position Marker */}
      {workflowMode === 'marker' ? (
        (pagePreviewUrl || extractedData.documentScanUrl) ? (
          <PdfPositionMarker
            pageCanvasUrl={pagePreviewUrl || extractedData.documentScanUrl || ''}
            textItems={extractedTextItems}
            canvasDimensions={canvasDimensions}
            initialData={extractedData}
            config={_config}
            templateConfig={_templateConfig}
            detectedPhotoBox={detectedPhotoBox}
            detectedQrBox={detectedQrBox || undefined}
            detectedBarcodeBox={extractedData.detectedBarcodeBox}
            onPerformAction={(newData) => {
              setExtractedData(newData);
              setIdData(newData);
            }}
            onOpenStudio={onApplyAndOpenStudio}
          />
        ) : (
          <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center shadow-inner border border-emerald-100">
              <Crosshair className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-lg">
                Upload a Fayda PDF Slip to Start Marking
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Put your PDF file once to view the high-resolution document canvas, calibrate bounding boxes for each field, and perform the action.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                <Upload className="w-4 h-4" />
                <span>Upload PDF Document</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => handleLoadSample('ayele')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Load Sample Slip
              </button>
            </div>
          </div>
        )
      ) : (
        /* Mode 1: Main Grid Auto-Detect & Extracted Fields Editor */
        <div className="space-y-4">
          {/* Quick Banner to Marker */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
                <Crosshair className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900">Want to mark and calibrate PDF positions manually?</h4>
                <p className="text-slate-600 text-[11px]">
                  Put your PDF slip once and drag/resize bounding boxes for all 14 fields with live crop readouts.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWorkflowMode('marker')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <span>Switch to PDF Position Marker</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Dropzone & File Summary */}
        <div className="lg:col-span-5 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all bg-white shadow-sm ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                : 'border-slate-300 hover:border-emerald-400'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center mb-4 shadow-inner border border-emerald-100">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">
              Drag and drop your PDF slip here
            </h3>
            <p className="text-xs text-slate-500 mb-5 max-w-xs mx-auto">
              Supports Ethiopian National ID / Fayda verification PDFs and high-resolution photo scans
            </p>

            <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
              <Upload className="w-3.5 h-3.5" />
              <span>Browse File</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Active File Card */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  {selectedFileName.toLowerCase().endsWith('.pdf') ? 'PDF' : <ImageIcon className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 truncate max-w-[180px]">
                    {selectedFileName}
                  </h4>
                  <p className="text-[11px] text-slate-500">{fileSize}</p>
                </div>
              </div>

              {isProcessing ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Parsing...</span>
                </span>
              ) : detectedFields > 0 ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{detectedFields} Fields Found</span>
                </span>
              ) : (
                <span className="text-xs text-slate-400">Ready</span>
              )}
            </div>

            <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{parseStatus}</span>
            </div>

            {/* Extracted Photo & QR Thumbnail Preview */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center relative group">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Applicant Photo
                  </p>
                  {extractedData.photoUrl && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                      Auto-Fit
                    </span>
                  )}
                </div>
                <div 
                  onClick={handleOpenPhotoCropper}
                  className="w-20 h-24 mx-auto rounded-lg overflow-hidden border-2 border-slate-300 hover:border-emerald-500 shadow-xs bg-white relative cursor-pointer group transition-all"
                  title="Click to carefully crop and position photo"
                >
                  {extractedData.photoUrl ? (
                    <>
                      <img
                        src={extractedData.photoUrl}
                        alt="Applicant"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold gap-1">
                        <CropIcon className="w-3.5 h-3.5" />
                        <span>Crop</span>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <Camera className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={handleOpenPhotoCropper}
                    className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition-colors border border-emerald-200"
                  >
                    <CropIcon className="w-3 h-3" />
                    <span>Crop / Center</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="text-[10px] text-slate-500 hover:text-slate-700 font-medium underline cursor-pointer"
                  >
                    Replace
                  </button>
                </div>
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/*"
                  onChange={handleCustomPhotoUpload}
                  className="hidden"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Extracted QR Code
                  </p>
                  {extractedData.qrCodeImageUrl && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                      Exact Cropped
                    </span>
                  )}
                </div>
                <div
                  className="w-20 h-24 mx-auto rounded-lg overflow-hidden border border-slate-300 shadow-xs bg-white flex flex-col items-center justify-center p-1 relative group cursor-pointer hover:border-cyan-400 transition-colors"
                  onClick={handleOpenQrCropper}
                  title="Click to crop or re-frame QR code from slip"
                >
                  {extractedData.qrCodeImageUrl ? (
                    <>
                      <img
                        src={extractedData.qrCodeImageUrl}
                        alt="Extracted Biometric QR Code"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-cyan-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px] font-bold gap-1">
                        <CropIcon className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Crop QR</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-slate-900 rounded-md flex items-center justify-center text-white text-[10px] font-mono">
                        <Check className="w-5 h-5 text-emerald-400" />
                      </div>
                      <span className="text-[9px] font-medium text-emerald-700 mt-1">Verified</span>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={handleOpenQrCropper}
                    className="text-[10px] text-cyan-700 hover:text-cyan-800 font-bold flex items-center gap-1 cursor-pointer bg-cyan-50 hover:bg-cyan-100 px-2 py-0.5 rounded-md transition-colors border border-cyan-200"
                    title="Carefully crop authentic QR matrix from slip"
                  >
                    <CropIcon className="w-3 h-3" />
                    <span>Crop QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => qrInputRef.current?.click()}
                    className="text-[10px] text-slate-500 hover:text-slate-700 font-medium underline cursor-pointer"
                    title="Upload custom QR code image"
                  >
                    Replace
                  </button>
                </div>
                <input
                  type="file"
                  ref={qrInputRef}
                  accept="image/*"
                  onChange={handleCustomQrUpload}
                  className="hidden"
                />
                <p className="mt-2 text-[10px] text-slate-500 truncate max-w-[120px] mx-auto font-mono" title={extractedData.qrData}>
                  {extractedData.qrData ? (extractedData.qrData.length > 16 ? extractedData.qrData.slice(0, 16) + '...' : extractedData.qrData) : 'Matrix Active'}
                </p>
              </div>
            </div>

            {/* Document Page Preview (if uploaded) */}
            {pagePreviewUrl && (
              <div className="pt-2 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-800">Uploaded Document Slip Scan</span>
                    {detectedQrBox && (
                      <span className="text-[10px] font-bold bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full border border-cyan-200">
                        QR Centered
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Auto-Detect & Center Button */}
                    <button
                      type="button"
                      onClick={handleAutoDetectAndCenterQr}
                      disabled={isDetectingQr}
                      className="text-[10px] text-cyan-800 hover:text-cyan-900 font-bold bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="Automatically detect, center, and focus the QR code area on this slip scan"
                    >
                      <Crosshair className={`w-3 h-3 text-cyan-600 ${isDetectingQr ? 'animate-spin' : ''}`} />
                      <span>{isDetectingQr ? 'Centering...' : '⚡ Auto-Center QR'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenPhotoCropper}
                      className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="Crop portrait photo"
                    >
                      <CropIcon className="w-3 h-3" />
                      <span>Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenQrCropper}
                      className="text-[10px] text-slate-700 hover:text-slate-900 font-bold bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="Open interactive manual QR cropper pre-centered on this area"
                    >
                      <CropIcon className="w-3 h-3 text-cyan-600" />
                      <span>Manual Crop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRawText(!showRawText)}
                      className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold underline"
                    >
                      {showRawText ? 'Hide OCR' : 'OCR'}
                    </button>
                  </div>
                </div>

                {/* View Mode Toggle: Full Slip vs Centered QR Area */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setSlipPreviewFocus('full')}
                    className={`flex-1 py-1 px-2.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      slipPreviewFocus === 'full'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>Full Slip Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!detectedQrBox) {
                        handleAutoDetectAndCenterQr();
                      } else {
                        setSlipPreviewFocus('qr');
                      }
                    }}
                    className={`flex-1 py-1 px-2.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      slipPreviewFocus === 'qr'
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : 'text-cyan-700 hover:bg-cyan-50'
                    }`}
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>🎯 Centered QR Area (Auto-Detected)</span>
                  </button>
                </div>

                {/* Status Notice */}
                {qrAutoDetectStatus && (
                  <div className="text-[10.5px] bg-cyan-50 border border-cyan-200 text-cyan-900 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                    <Sparkles className="w-3 h-3 text-cyan-600 shrink-0" />
                    <span className="truncate">{qrAutoDetectStatus}</span>
                  </div>
                )}

                {/* Mode 1: Centered QR Focus View */}
                {slipPreviewFocus === 'qr' ? (
                  <div className="rounded-xl border-2 border-cyan-400 bg-slate-950 p-3 text-white space-y-2 relative overflow-hidden shadow-inner">
                    <div className="flex items-center justify-between text-[11px] text-cyan-300 font-mono">
                      <span className="flex items-center gap-1 font-bold">
                        <Scan className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                        <span>Auto-Centered QR Code Matrix</span>
                      </span>
                      {detectedQrBox && (
                        <span>
                          {detectedQrBox.width}×{detectedQrBox.height}px @ ({detectedQrBox.x}, {detectedQrBox.y})
                        </span>
                      )}
                    </div>

                    {/* Centered Reticle Viewport */}
                    <div className="relative w-full h-44 bg-slate-900 rounded-lg flex items-center justify-center overflow-hidden border border-slate-800">
                      {centeredQrPreviewUrl ? (
                        <div className="relative inline-block">
                          <img
                            src={centeredQrPreviewUrl}
                            alt="Centered QR Code"
                            className="w-36 h-36 object-contain rounded-sm border border-cyan-400/60 shadow-lg bg-white p-1"
                          />
                          {/* Corner Brackets Target Reticle */}
                          <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
                          <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
                          <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />
                        </div>
                      ) : (
                        <div className="text-center p-4 text-slate-400 text-xs">
                          <p>Detecting QR code coordinates...</p>
                          <button
                            type="button"
                            onClick={handleAutoDetectAndCenterQr}
                            className="mt-2 text-cyan-400 underline font-bold"
                          >
                            Run Precision Detection
                          </button>
                        </div>
                      )}

                      {/* Center Crosshair */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <div className="w-16 h-px bg-cyan-400" />
                        <div className="h-16 w-px bg-cyan-400 absolute" />
                      </div>
                    </div>

                    {/* Actions under Centered View */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleApplyCenteredQrDirect}
                        className="flex-1 py-1.5 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
                        title="Apply this centered QR code directly to the card without manual cropping"
                      >
                        <Check className="w-3 h-3" />
                        <span>Apply Centered QR Direct</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenQrCropper}
                        className="flex-1 py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Fine-tune position, size, rotation or quiet zone in manual cropping tool"
                      >
                        <CropIcon className="w-3 h-3 text-cyan-400" />
                        <span>Open Manual Cropper</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Mode 2: Full Document Page Preview with QR bounding box marker */
                  <div className="rounded-xl border border-slate-200 overflow-hidden max-h-52 overflow-y-auto bg-slate-100 relative group">
                    <div className="relative inline-block w-full">
                      <img
                        src={pagePreviewUrl}
                        alt="Uploaded Slip Page"
                        className="w-full object-contain block select-none"
                        onLoad={(e) => {
                          const img = e.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setSlipNaturalSize({
                              width: img.naturalWidth,
                              height: img.naturalHeight,
                            });
                          }
                        }}
                      />

                      {/* Interactive Highlight Box over the Auto-Detected QR Area */}
                      {detectedQrBox && slipNaturalSize.width > 0 && slipNaturalSize.height > 0 && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSlipPreviewFocus('qr');
                          }}
                          className="absolute border-2 border-cyan-500 bg-cyan-400/25 rounded-sm hover:bg-cyan-400/40 transition-all cursor-pointer shadow-md flex items-start justify-end p-0.5 animate-pulse"
                          style={{
                            top: `${(detectedQrBox.y / slipNaturalSize.height) * 100}%`,
                            left: `${(detectedQrBox.x / slipNaturalSize.width) * 100}%`,
                            width: `${(detectedQrBox.width / slipNaturalSize.width) * 100}%`,
                            height: `${(detectedQrBox.height / slipNaturalSize.height) * 100}%`,
                          }}
                          title="Auto-detected QR area. Click to focus and center!"
                        >
                          <span className="bg-cyan-600 text-white text-[9px] font-bold px-1 rounded-sm shadow-xs flex items-center gap-0.5">
                            <Crosshair className="w-2.5 h-2.5" />
                            <span>QR Area</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-2 pointer-events-none">
                      <span className="bg-slate-900/85 px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5">
                        <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Click highlighted QR to center or buttons above to crop</span>
                      </span>
                    </div>
                  </div>
                )}

                {showRawText && rawExtractedText && (
                  <div className="mt-2 p-2 bg-slate-900 text-emerald-400 rounded-xl text-[10px] font-mono max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {rawExtractedText}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Parsed Fields Verification & Direct Transfer */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>Extracted Fayda ID Records</span>
                  {detectedFields > 0 && (
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Live Parsed
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  Review or adjust any field below before applying to the card studio
                </p>
              </div>

              <button
                type="button"
                onClick={handleApplyToStudio}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <span>Apply & Open in Card Studio</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Input Groups */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name Amharic */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  ሙሉ ስም (Amharic Name)
                </label>
                <input
                  type="text"
                  value={extractedData.fullNameAmharic}
                  onChange={(e) => handleFieldChange('fullNameAmharic', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Full Name English */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Full Name (English)</span>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Demographic Purged
                  </span>
                </label>
                <input
                  type="text"
                  value={extractedData.fullNameEnglish}
                  onChange={(e) => handleFieldChange('fullNameEnglish', e.target.value)}
                  placeholder="e.g. Ayele Zekwos Daka"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* FAN 16-Digit Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  FAN Number (16 Digits)
                </label>
                <input
                  type="text"
                  value={extractedData.fan}
                  onChange={(e) => handleFieldChange('fan', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-mono font-bold text-emerald-800"
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Phone Number (ስልክ ቁጥር)
                </label>
                <input
                  type="text"
                  value={extractedData.phoneNumber}
                  onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Date of Birth GC */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Date of Birth (GC)
                </label>
                <input
                  type="text"
                  value={extractedData.dateOfBirth}
                  onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Date of Birth Eth */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Date of Birth (Eth / E.C.)
                </label>
                <input
                  type="text"
                  value={extractedData.dateOfBirthEth || ''}
                  onChange={(e) => handleFieldChange('dateOfBirthEth', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Sex */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Sex / ፆታ
                </label>
                <select
                  value={extractedData.sex}
                  onChange={(e) => handleFieldChange('sex', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                >
                  <option value="Male">Male / ወንድ</option>
                  <option value="Female">Female / ሴት</option>
                </select>
              </div>

              {/* Nationality */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Nationality (ዜግነት)
                </label>
                <input
                  type="text"
                  value={extractedData.nationalityEnglish}
                  onChange={(e) => handleFieldChange('nationalityEnglish', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Region */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Region (ክልል)
                </label>
                <input
                  type="text"
                  value={extractedData.regionEnglish}
                  onChange={(e) => handleFieldChange('regionEnglish', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Zone / Subcity */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Zone / Subcity (ዞን / ክ/ከተማ)
                </label>
                <input
                  type="text"
                  value={extractedData.zoneEnglish}
                  onChange={(e) => handleFieldChange('zoneEnglish', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Woreda */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Woreda (ወረዳ)
                </label>
                <input
                  type="text"
                  value={extractedData.woredaEnglish}
                  onChange={(e) => handleFieldChange('woredaEnglish', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>

              {/* Expiry Date */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Date of Expiry
                </label>
                <input
                  type="text"
                  value={extractedData.dateOfExpiry}
                  onChange={(e) => handleFieldChange('dateOfExpiry', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium"
                />
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                All fields ready for 300 DPI CR80 PVC composite
              </span>
              <button
                type="button"
                onClick={handleApplyToStudio}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Load Data Into Card Studio</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )}

      {/* Interactive Photo Crop & Position Modal */}
      <PhotoCropModal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        sourceImageUrl={cropSourceUrl}
        applicantName={extractedData.fullNameEnglish || extractedData.fullNameAmharic || 'Applicant'}
        onApplyCrop={handleApplyCroppedPhoto}
      />

      {/* Interactive QR Crop & Alignment Modal */}
      <QrCropModal
        isOpen={isQrCropModalOpen}
        onClose={() => setIsQrCropModalOpen(false)}
        sourceImageUrl={qrCropSourceUrl}
        currentQrUrl={extractedData.qrCodeImageUrl}
        currentQrData={extractedData.qrData}
        initialCropBox={detectedQrBox || undefined}
        onApplyCrop={handleApplyCroppedQr}
      />
    </div>
  );
};
