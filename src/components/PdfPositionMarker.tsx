import React, { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Crosshair,
  Sliders,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Save,
  Trash2,
  Layers,
  ArrowRight,
  Move,
  Scan,
  Camera,
  QrCode,
  Type,
  FileCheck,
  Check,
  ChevronDown,
  Info,
  ExternalLink,
  RotateCcw,
  Sparkle,
  Barcode,
  BookmarkCheck,
  Scissors,
  Calendar,
  Wand2,
  Upload,
  FileCode
} from 'lucide-react';
import { IdCardData, PdfMarkedRegion, PdfTextItemWithBox, PdfMarkedPreset, TemplateConfig, CoordinatesConfig } from '../types';
import { 
  DEFAULT_PDF_MARKED_REGIONS, 
  cropImageRegion, 
  cropAndDecodeQrRegion, 
  cropAndDecodeBarcodeRegion,
  extractTextFromRegion, 
  extractAllFromMarkedRegions,
  savePermanentRegions,
  loadPermanentRegions,
  clearPermanentRegions,
  getEffectiveRegions,
  cropCleanDateLayer,
  cropHighQualityFanLayer
} from '../utils/pdfRegionExtractor';
import { sanitizeEnglishName, sanitizeAmharicName } from '../utils/textCleaner';
import { autoRemovePhotoBackground } from '../utils/imageProcessor';
import { convertGcToEth, calculateExpiryFromIssue } from '../utils/ethiopianCalendar';
import { CardRenderer } from './CardRenderer';
import { PhotoshopActionModal } from './PhotoshopActionModal';

interface PdfPositionMarkerProps {
  pageCanvasUrl: string;
  textItems?: PdfTextItemWithBox[];
  canvasDimensions?: { width: number; height: number };
  initialData: IdCardData;
  config: CoordinatesConfig;
  templateConfig?: TemplateConfig;
  detectedPhotoBox?: { x: number; y: number; width: number; height: number };
  detectedQrBox?: { x: number; y: number; width: number; height: number };
  detectedBarcodeBox?: { x: number; y: number; width: number; height: number };
  onPerformAction: (extractedData: IdCardData) => void;
  onOpenStudio?: () => void;
  onSaveAndApplyPositions?: (regions: PdfMarkedRegion[], updatedData: IdCardData) => void;
  onSaveToBatchConverter?: (regions: PdfMarkedRegion[], updatedData: IdCardData) => void;
  onOpenBatch?: () => void;
}

const STORAGE_PRESETS_KEY = 'fayda_pdf_marked_presets_v1';

export const PdfPositionMarker: React.FC<PdfPositionMarkerProps> = ({
  pageCanvasUrl,
  textItems = [],
  canvasDimensions,
  initialData,
  config,
  templateConfig,
  detectedPhotoBox,
  detectedQrBox,
  detectedBarcodeBox,
  onPerformAction,
  onOpenStudio,
  onSaveAndApplyPositions,
  onSaveToBatchConverter,
  onOpenBatch,
}) => {
  // Initialize regions with any permanently saved positions or auto-detected boxes
  const [regions, setRegions] = useState<PdfMarkedRegion[]>(() => {
    const saved = loadPermanentRegions();
    const base = saved && saved.length > 0 ? getEffectiveRegions() : DEFAULT_PDF_MARKED_REGIONS.map((r) => ({ ...r }));
    
    // If canvas dimensions and detected boxes are provided and no custom permanent layout saved yet, calibrate photo, QR & barcode
    if (canvasDimensions && canvasDimensions.width > 0 && canvasDimensions.height > 0) {
      if (detectedPhotoBox && !saved) {
        const photo = base.find((r) => r.id === 'photo');
        if (photo) {
          photo.x = Math.max(0, Math.min(90, (detectedPhotoBox.x / canvasDimensions.width) * 100));
          photo.y = Math.max(0, Math.min(90, (detectedPhotoBox.y / canvasDimensions.height) * 100));
          photo.width = Math.max(5, Math.min(50, (detectedPhotoBox.width / canvasDimensions.width) * 100));
          photo.height = Math.max(5, Math.min(50, (detectedPhotoBox.height / canvasDimensions.height) * 100));
        }
      }
      if (detectedQrBox && !saved) {
        const qr = base.find((r) => r.id === 'qrCode');
        if (qr) {
          qr.x = Math.max(0, Math.min(90, (detectedQrBox.x / canvasDimensions.width) * 100));
          qr.y = Math.max(0, Math.min(90, (detectedQrBox.y / canvasDimensions.height) * 100));
          qr.width = Math.max(5, Math.min(50, (detectedQrBox.width / canvasDimensions.width) * 100));
          qr.height = Math.max(5, Math.min(50, (detectedQrBox.height / canvasDimensions.height) * 100));
        }
      }
      if (detectedBarcodeBox && !saved) {
        const barcode = base.find((r) => r.id === 'barcode');
        if (barcode) {
          barcode.x = Math.max(0, Math.min(90, (detectedBarcodeBox.x / canvasDimensions.width) * 100));
          barcode.y = Math.max(0, Math.min(90, (detectedBarcodeBox.y / canvasDimensions.height) * 100));
          barcode.width = Math.max(10, Math.min(70, (detectedBarcodeBox.width / canvasDimensions.width) * 100));
          barcode.height = Math.max(3, Math.min(30, (detectedBarcodeBox.height / canvasDimensions.height) * 100));
        }
      }
    }
    return base;
  });

  const [selectedRegionId, setSelectedRegionId] = useState<string>('photo');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isPerforming, setIsPerforming] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string>('');
  const [permanentFeedback, setPermanentFeedback] = useState<string>('');
  const [isPermanentSaved, setIsPermanentSaved] = useState<boolean>(() => !!loadPermanentRegions());
  const [previewData, setPreviewData] = useState<IdCardData>(initialData);

  // Live previews of marked crops
  const [livePhotoPreview, setLivePhotoPreview] = useState<string>(initialData.photoUrl || '');
  const [liveSecondaryPhotoPreview, setLiveSecondaryPhotoPreview] = useState<string>(initialData.secondaryPhotoUrl || '');
  const [liveFinCutPreview, setLiveFinCutPreview] = useState<string>(initialData.finLayerCropUrl || '');
  const [liveDobCutPreview, setLiveDobCutPreview] = useState<string>(initialData.dobLayerCropUrl || '');
  const [liveExpiryCutPreview, setLiveExpiryCutPreview] = useState<string>(initialData.expiryLayerCropUrl || '');
  const [liveQrPreview, setLiveQrPreview] = useState<string>(initialData.qrCodeImageUrl || '');
  const [liveBarcodePreview, setLiveBarcodePreview] = useState<string>(initialData.barcodeImageUrl || '');
  const [liveBarcodeData, setLiveBarcodeData] = useState<string>(initialData.barcodeData || '');
  const [liveExtractedTexts, setLiveExtractedTexts] = useState<Record<string, string>>({});

  // Photoshop Action Modal & Layer grouping states
  const [showPhotoshopModal, setShowPhotoshopModal] = useState<boolean>(false);
  const [activeLayerTab, setActiveLayerTab] = useState<'all' | 'photo' | 'fin' | 'dates' | 'text'>('all');
  const [isRemovingBgNow, setIsRemovingBgNow] = useState<boolean>(false);

  // Presets state
  const [savedPresets, setSavedPresets] = useState<PdfMarkedPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRESETS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [showPresetModal, setShowPresetModal] = useState<boolean>(false);

  // Dragging and Resizing State
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<string | null>(null); // e.g. 'se', 'nw', 'e', etc.
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; startX: number; startY: number; startW: number; startH: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  const activeRegion = regions.find((r) => r.id === selectedRegionId) || regions[0];

  // Update live preview of fields whenever regions or source change
  const refreshLiveReadouts = useCallback(async () => {
    if (!pageCanvasUrl) return;

    // 1. Primary Photo preview (Photo 1)
    const photoReg = regions.find((r) => r.id === 'photo');
    if (photoReg) {
      cropImageRegion(pageCanvasUrl, photoReg, 240, 320)
        .then(async (url) => {
          if (url && photoReg.autoRemoveBg !== false) {
            try {
              const transparentUrl = await autoRemovePhotoBackground(url);
              setLivePhotoPreview(transparentUrl);
              setLiveSecondaryPhotoPreview(transparentUrl);
            } catch {
              setLivePhotoPreview(url);
              setLiveSecondaryPhotoPreview(url);
            }
          } else {
            setLivePhotoPreview(url);
            setLiveSecondaryPhotoPreview(url);
          }
        })
        .catch(() => {});
    }

    // 1b. Secondary Photo (direct copy from larger photo, no second layer)
    if (livePhotoPreview) {
      setLiveSecondaryPhotoPreview(livePhotoPreview);
    }

    // 1c. Back FAN Cut Layer preview (Direct authentic field cut from marked region - 1:1, as it is, no upscale)
    const finCutReg = regions.find((r) => r.id === 'finCut' || (r.cutToLayerOnly && (r.id === 'fcn' || r.id === 'fan')));
    if (finCutReg) {
      cropHighQualityFanLayer(pageCanvasUrl, finCutReg, {
        colorMode: 'enhanced',
        superSampleFactor: 2.0,
        targetMinHeight: 160,
        bgMode: 'white',
        sharpen: true,
        smoothText: true,
        denoise: true,
      })
        .then((url) => setLiveFinCutPreview(url))
        .catch(() => {});
    }

    // 1d. DOB Cut Layer preview (Direct cut layer from PDF)
    const dobReg = regions.find((r) => r.id === 'dateOfBirth' || r.id === 'dobCut');
    if (dobReg) {
      cropCleanDateLayer(pageCanvasUrl, dobReg, 500, 80)
        .then((url) => setLiveDobCutPreview(url))
        .catch(() => {});
    }

    // 1e. Expiry Cut Layer preview (Direct cut layer from PDF)
    const expReg = regions.find((r) => r.id === 'dateOfExpiry' || r.id === 'expiryCut');
    if (expReg) {
      cropCleanDateLayer(pageCanvasUrl, expReg, 500, 80)
        .then((url) => setLiveExpiryCutPreview(url))
        .catch(() => {});
    }

    // 2. QR preview
    const qrReg = regions.find((r) => r.id === 'qrCode');
    if (qrReg) {
      cropAndDecodeQrRegion(pageCanvasUrl, qrReg)
        .then((res) => {
          if (res.qrUrl) setLiveQrPreview(res.qrUrl);
        })
        .catch(() => {});
    }

    // 3. Barcode preview
    const barcodeReg = regions.find((r) => r.id === 'barcode' || r.type === 'barcode');
    if (barcodeReg) {
      cropAndDecodeBarcodeRegion(pageCanvasUrl, barcodeReg, textItems)
        .then((res) => {
          if (res.barcodeUrl) setLiveBarcodePreview(res.barcodeUrl);
          if (res.barcodeText) setLiveBarcodeData(res.barcodeText);
        })
        .catch(() => {});
    }

    // 4. Text readouts
    const texts: Record<string, string> = {};
    for (const r of regions) {
      if (r.type === 'text') {
        const txt = extractTextFromRegion(r, textItems);
        texts[r.id] = txt;
      }
    }
    setLiveExtractedTexts(texts);
  }, [pageCanvasUrl, regions, textItems]);

  useEffect(() => {
    const timer = setTimeout(refreshLiveReadouts, 120);
    return () => clearTimeout(timer);
  }, [refreshLiveReadouts]);

  // Handler for 1-click Auto Background Removal on current photo
  const handleTriggerBackgroundRemoval = async () => {
    if (!livePhotoPreview) return;
    setIsRemovingBgNow(true);
    try {
      const cutout = await autoRemovePhotoBackground(livePhotoPreview);
      setLivePhotoPreview(cutout);
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      setPermanentFeedback('✨ Background automatically removed from portrait!');
      setTimeout(() => setPermanentFeedback(''), 4000);
    } catch (err) {
      console.warn('Manual background removal failed:', err);
    } finally {
      setIsRemovingBgNow(false);
    }
  };

  // Handler for toggling Auto Remove Bg on region
  const handleToggleAutoRemoveBg = (regId: string) => {
    setRegions((prev) =>
      prev.map((r) =>
        r.id === regId ? { ...r, autoRemoveBg: r.autoRemoveBg === false ? true : false } : r
      )
    );
  };

  // Handler for toggling Cut to Layer Only on region
  const handleToggleCutToLayer = (regId: string) => {
    setRegions((prev) =>
      prev.map((r) =>
        r.id === regId ? { ...r, cutToLayerOnly: !r.cutToLayerOnly } : r
      )
    );
  };

  // Handler for applying regions imported from Photoshop Action
  const handleApplyPhotoshopRegions = (newRegions: PdfMarkedRegion[]) => {
    setRegions(newRegions);
    savePermanentRegions(newRegions);
    setIsPermanentSaved(true);
    confetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });
    setPermanentFeedback('Adobe Photoshop Action calibrated and saved permanently! PDF positions fixed.');
    setTimeout(() => setPermanentFeedback(''), 5000);
  };

  // Snap photo marker to the detected photo box on the slip
  const handleSnapToDetectedPhoto = useCallback(() => {
    if (!detectedPhotoBox || !canvasDimensions || canvasDimensions.width <= 0 || canvasDimensions.height <= 0) return;
    const newX = Number(Math.max(0, Math.min(90, (detectedPhotoBox.x / canvasDimensions.width) * 100)).toFixed(2));
    const newY = Number(Math.max(0, Math.min(90, (detectedPhotoBox.y / canvasDimensions.height) * 100)).toFixed(2));
    const newW = Number(Math.max(5, Math.min(50, (detectedPhotoBox.width / canvasDimensions.width) * 100)).toFixed(2));
    const newH = Number(Math.max(5, Math.min(50, (detectedPhotoBox.height / canvasDimensions.height) * 100)).toFixed(2));

    setRegions((prev) => {
      const updated = prev.map((r) => {
        if (r.id === 'photo') {
          return { ...r, x: newX, y: newY, width: newW, height: newH };
        }
        return r;
      });
      savePermanentRegions(updated);
      setIsPermanentSaved(true);
      return updated;
    });
    setSelectedRegionId('photo');
    setPermanentFeedback('Snapped photo marker to detected slip position! ፎቶ ቦታው ተስተካክሏል');
    setTimeout(() => setPermanentFeedback(''), 3500);
  }, [detectedPhotoBox, canvasDimensions]);

  // Handle Box Dragging & Resizing via Mouse Events
  const handleMouseDownOnRegion = (e: React.MouseEvent, regId: string) => {
    e.stopPropagation();
    setSelectedRegionId(regId);
    const targetReg = regions.find((r) => r.id === regId);
    if (!targetReg) return;

    setIsDragging(true);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: targetReg.x,
      startY: targetReg.y,
      startW: targetReg.width,
      startH: targetReg.height,
    });
  };

  const handleMouseDownOnHandle = (e: React.MouseEvent, regId: string, handleDir: string) => {
    e.stopPropagation();
    setSelectedRegionId(regId);
    const targetReg = regions.find((r) => r.id === regId);
    if (!targetReg) return;

    setIsResizing(handleDir);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: targetReg.x,
      startY: targetReg.y,
      startW: targetReg.width,
      startH: targetReg.height,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging && !isResizing) return;
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaXPercent = ((e.clientX - dragStart.mouseX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragStart.mouseY) / rect.height) * 100;

      setRegions((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRegionId) return r;

          if (isDragging) {
            const newX = Math.max(0, Math.min(100 - r.width, dragStart.startX + deltaXPercent));
            const newY = Math.max(0, Math.min(100 - r.height, dragStart.startY + deltaYPercent));
            return {
              ...r,
              x: Number(newX.toFixed(2)),
              y: Number(newY.toFixed(2)),
            };
          }

          if (isResizing) {
            let newX = r.x;
            let newY = r.y;
            let newW = r.width;
            let newH = r.height;

            if (isResizing.includes('e')) {
              newW = Math.max(0.2, Math.min(100 - dragStart.startX, dragStart.startW + deltaXPercent));
            }
            if (isResizing.includes('w')) {
              const maxDelta = dragStart.startW - 0.2;
              const actualDelta = Math.min(maxDelta, deltaXPercent);
              newX = Math.max(0, dragStart.startX + actualDelta);
              newW = dragStart.startW - actualDelta;
            }
            if (isResizing.includes('s')) {
              newH = Math.max(0.2, Math.min(100 - dragStart.startY, dragStart.startH + deltaYPercent));
            }
            if (isResizing.includes('n')) {
              const maxDelta = dragStart.startH - 0.2;
              const actualDelta = Math.min(maxDelta, deltaYPercent);
              newY = Math.max(0, dragStart.startY + actualDelta);
              newH = dragStart.startH - actualDelta;
            }

            return {
              ...r,
              x: Number(newX.toFixed(2)),
              y: Number(newY.toFixed(2)),
              width: Number(newW.toFixed(2)),
              height: Number(newH.toFixed(2)),
            };
          }

          return r;
        })
      );
    },
    [isDragging, isResizing, dragStart, selectedRegionId]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
    // Automatically persist modified positions as permanent
    savePermanentRegions(regions);
    setIsPermanentSaved(true);
  }, [regions]);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Fine-tune step adjustment (supports micro-nudge for smaller parts)
  const handleNudge = (axis: 'x' | 'y' | 'w' | 'h', delta: number) => {
    setRegions((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== selectedRegionId) return r;
        let newX = r.x;
        let newY = r.y;
        let newW = r.width;
        let newH = r.height;

        if (axis === 'x') newX = Math.max(0, Math.min(100 - r.width, r.x + delta));
        if (axis === 'y') newY = Math.max(0, Math.min(100 - r.height, r.y + delta));
        if (axis === 'w') newW = Math.max(0.2, Math.min(100 - r.x, r.width + delta));
        if (axis === 'h') newH = Math.max(0.2, Math.min(100 - r.y, r.height + delta));

        return {
          ...r,
          x: Number(newX.toFixed(2)),
          y: Number(newY.toFixed(2)),
          width: Number(newW.toFixed(2)),
          height: Number(newH.toFixed(2)),
        };
      });
      savePermanentRegions(updated);
      setIsPermanentSaved(true);
      return updated;
    });
  };

  // Direct precision numerical update
  const handleDirectValue = (axis: 'x' | 'y' | 'w' | 'h', val: number) => {
    if (isNaN(val)) return;
    setRegions((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== selectedRegionId) return r;
        let newX = r.x;
        let newY = r.y;
        let newW = r.width;
        let newH = r.height;

        if (axis === 'x') newX = Math.max(0, Math.min(100 - r.width, val));
        if (axis === 'y') newY = Math.max(0, Math.min(100 - r.height, val));
        if (axis === 'w') newW = Math.max(0.2, Math.min(100 - r.x, val));
        if (axis === 'h') newH = Math.max(0.2, Math.min(100 - r.y, val));

        return {
          ...r,
          x: Number(newX.toFixed(2)),
          y: Number(newY.toFixed(2)),
          width: Number(newW.toFixed(2)),
          height: Number(newH.toFixed(2)),
        };
      });
      savePermanentRegions(updated);
      setIsPermanentSaved(true);
      return updated;
    });
  };

  // Explicitly save current positions permanently
  const handleSaveAsPermanent = () => {
    savePermanentRegions(regions);
    setIsPermanentSaved(true);
    setPermanentFeedback('Positions saved permanently! ቋሚ ቅንብር ተቀምጧል');
    setTimeout(() => setPermanentFeedback(''), 3000);
  };

  // Reset to saved permanent layout
  const handleResetToSavedPermanent = () => {
    const saved = loadPermanentRegions();
    if (saved && saved.length > 0) {
      setRegions(getEffectiveRegions());
      setPermanentFeedback('Restored your saved permanent positions / ወደ ቋሚ ቅንብር ተመልሷል');
      setTimeout(() => setPermanentFeedback(''), 3000);
    }
  };

  // Reset to default standard layout
  const handleResetToDefault = () => {
    setRegions(DEFAULT_PDF_MARKED_REGIONS.map((r) => ({ ...r })));
    clearPermanentRegions();
    setIsPermanentSaved(false);
    setPermanentFeedback('Reset to standard factory default / ወደ ነባሪ ተመልሷል');
    setTimeout(() => setPermanentFeedback(''), 3000);
  };

  // Save layout as custom preset
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: PdfMarkedPreset = {
      id: `preset_${Date.now()}`,
      name: newPresetName.trim(),
      description: `Custom layout with ${regions.length} marked positions`,
      regions: regions.map((r) => ({ ...r })),
      createdAt: new Date().toLocaleDateString(),
    };
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
    setNewPresetName('');
    setShowPresetModal(false);
  };

  // Load a preset
  const handleLoadPreset = (preset: PdfMarkedPreset) => {
    setRegions(preset.regions.map((r) => ({ ...r })));
  };

  // Delete a preset
  const handleDeletePreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(updated));
    } catch {}
  };

  // ⚡ Save Positions from PDF Slip Mapper & Apply to Template
  const handleSaveAndApply = async () => {
    setIsPerforming(true);
    setActionSuccessMessage('Saving positions & applying calibration to template...');

    try {
      // 1. Explicitly persist the marked positions permanently into localStorage
      savePermanentRegions(regions);
      setIsPermanentSaved(true);
      setPermanentFeedback('Positions saved permanently! ቋሚ ቅንብር ተቀምጧል');

      let extractedResult = previewData || initialData;
      if (pageCanvasUrl) {
        extractedResult = await extractAllFromMarkedRegions(
          pageCanvasUrl,
          textItems,
          regions,
          initialData
        );
        setPreviewData(extractedResult);
      }

      // 2. Apply to card data
      onPerformAction(extractedResult);

      // 3. Notify parent (e.g. Batch Processor or Studio)
      if (onSaveAndApplyPositions) {
        onSaveAndApplyPositions(regions, extractedResult);
      }

      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {}

      setActionSuccessMessage('✨ Successfully saved positions from PDF Slip Mapper & applied to ID Card template!');
      setTimeout(() => setActionSuccessMessage(''), 4500);
      setTimeout(() => setPermanentFeedback(''), 3500);
    } catch (err: unknown) {
      console.error('Save & apply positions error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setActionSuccessMessage(`Action failed: ${errorMessage}`);
    } finally {
      setIsPerforming(false);
    }
  };

  // 🚀 Save Positions from PDF Slip Mapper directly to Batch Converter
  const handleSaveToBatchConverter = async () => {
    setIsPerforming(true);
    setActionSuccessMessage('Saving positions & syncing to Batch Converter...');

    try {
      // 1. Explicitly persist the marked positions permanently into localStorage
      savePermanentRegions(regions);
      setIsPermanentSaved(true);
      setPermanentFeedback('Positions saved permanently for Batch Converter! ቋሚ ቅንብር ለባች ተቀምጧል');

      let extractedResult = previewData || initialData;
      if (pageCanvasUrl) {
        extractedResult = await extractAllFromMarkedRegions(
          pageCanvasUrl,
          textItems,
          regions,
          initialData
        );
        setPreviewData(extractedResult);
      }

      // 2. Apply to card data
      onPerformAction(extractedResult);

      // 3. Notify Batch Converter parent
      if (onSaveToBatchConverter) {
        onSaveToBatchConverter(regions, extractedResult);
      } else if (onSaveAndApplyPositions) {
        onSaveAndApplyPositions(regions, extractedResult);
      }

      // 4. Open batch if callback exists
      if (onOpenBatch) {
        onOpenBatch();
      }

      try {
        confetti({
          particleCount: 110,
          spread: 85,
          origin: { y: 0.55 },
        });
      } catch {}

      setActionSuccessMessage('✨ Successfully saved positions to Batch Converter! All batch queue documents will extract with these calibrated positions.');
      setTimeout(() => setActionSuccessMessage(''), 5000);
      setTimeout(() => setPermanentFeedback(''), 4000);
    } catch (err: unknown) {
      console.error('Save to Batch Converter error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setActionSuccessMessage(`Action failed: ${errorMessage}`);
    } finally {
      setIsPerforming(false);
    }
  };

  // ⚡ Perform Action: Extract everything from marked positions and apply to template
  const handleExecuteAction = async () => {
    await handleSaveAndApply();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Action Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Crosshair className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Visual PDF Position Mapper & Template Mapper
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
              100% Local
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Put your PDF slip once, drag or resize the bounding boxes directly on the document, and click <strong>Save to Batch Converter</strong> or <strong>Save Positions & Apply</strong> to store positions permanently and update all batch cards with pixel perfection.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Main Save to Batch Converter Button */}
          <button
            type="button"
            onClick={handleSaveToBatchConverter}
            disabled={isPerforming}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs sm:text-sm font-extrabold rounded-2xl shadow-xl shadow-indigo-950/40 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 border border-indigo-400/30"
            title="Save marked coordinates permanently and send directly to Batch Converter"
          >
            {isPerforming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving to Batch...</span>
              </>
            ) : (
              <>
                <Layers className="w-4 h-4 text-cyan-200 shrink-0" />
                <span>SAVE TO BATCH CONVERTER / ወደ ባች ኮንቨርተር አስቀምጥ</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveAndApply}
            disabled={isPerforming}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-xs sm:text-sm font-bold rounded-2xl shadow-lg shadow-emerald-950/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
            title="Save marked coordinates permanently and apply immediately to ID Card template"
          >
            <Save className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>Save & Apply / አስቀምጥና ተግብር</span>
          </button>

          {(onOpenBatch || onOpenStudio) && (
            <button
              type="button"
              onClick={onOpenBatch || onOpenStudio}
              className="flex items-center gap-1.5 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-2xl border border-slate-700 transition-all cursor-pointer"
            >
              <span>{onOpenBatch ? 'Open Batch Queue' : 'Back / Open Studio'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMessage && (
        <div className="bg-emerald-900/40 border border-emerald-500/60 text-emerald-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage('')}
            className="text-emerald-400 hover:text-white text-xs cursor-pointer ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Permanent Save Feedback Notification */}
      {permanentFeedback && (
        <div className="bg-violet-950/70 border border-violet-500/80 text-violet-200 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-violet-400 shrink-0" />
            <span>{permanentFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setPermanentFeedback('')}
            className="text-violet-300 hover:text-white text-xs cursor-pointer ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Control Bar: Layer Group Tabs, Photoshop Action Import, Zoom, Permanent Save */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        {/* Layer Group Filter Tabs & Photoshop Action Import */}
        <div className="w-full flex items-center justify-between gap-2 pb-2 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveLayerTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeLayerTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Layers ({regions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveLayerTab('photo')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeLayerTab === 'photo'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <Camera className="w-3 h-3" />
              <span>Photo Layers (2 Photos)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLayerTab('fin')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeLayerTab === 'fin'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              <Scissors className="w-3 h-3" />
              <span>FIN & Barcodes</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLayerTab('dates')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeLayerTab === 'dates'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>Date Layers</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLayerTab('text')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeLayerTab === 'text'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Type className="w-3 h-3" />
              <span>Text & QR</span>
            </button>
          </div>

          {/* Import Photoshop Action (.atn) Button */}
          <button
            type="button"
            onClick={() => setShowPhotoshopModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl shadow-xs transition-all cursor-pointer"
            title="Import coordinates from Adobe Photoshop Actions (.atn) or JSON"
          >
            <Layers className="w-3.5 h-3.5 text-blue-200" />
            <span>Import Photoshop Action (.atn)</span>
          </button>
        </div>

        {/* Field Quick Selector Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-2xl scrollbar-none">
            {regions
              .filter((reg) => {
                if (activeLayerTab === 'photo') return reg.id === 'photo' || reg.id === 'secondaryPhoto';
                if (activeLayerTab === 'fin') return reg.id === 'finCut' || reg.id === 'barcode' || reg.id === 'fan' || reg.cutToLayerOnly;
                if (activeLayerTab === 'dates') return reg.id === 'dateOfIssue' || reg.id === 'dateOfExpiry' || reg.id === 'dateOfBirth';
                if (activeLayerTab === 'text') return reg.type === 'text' || reg.id === 'qrCode';
                return true;
              })
              .map((reg) => {
                const isSel = reg.id === selectedRegionId;
                return (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => setSelectedRegionId(reg.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      isSel
                        ? 'bg-slate-900 text-white shadow-sm ring-2 ring-emerald-500'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {reg.id === 'barcode' ? (
                      <Barcode className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    ) : reg.id === 'finCut' ? (
                      <Scissors className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : reg.id === 'dateOfIssue' ? (
                      <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: reg.color }}
                      />
                    )}
                    <span>{reg.label} {reg.labelAmh ? `/ ${reg.labelAmh}` : ''}</span>
                  </button>
                );
              })}
          </div>

          {/* Viewport Zoom, Permanent Save & Reset */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Save to Batch Converter Action */}
            <button
              type="button"
              onClick={handleSaveToBatchConverter}
              disabled={isPerforming}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 border border-indigo-400/30"
              title="Save marked coordinates and sync immediately with Batch Converter"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-200" />
              <span>Save to Batch Converter</span>
            </button>

            {/* Save & Apply Action */}
            <button
              type="button"
              onClick={handleSaveAndApply}
              disabled={isPerforming}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Save current marked coordinates permanently and apply to card template and batch"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Apply</span>
            </button>

            {/* Permanent Save Action */}
            <button
              type="button"
              onClick={handleSaveAsPermanent}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-xs transition-all cursor-pointer"
              title="Save current marked coordinates permanently for all future Fayda slips"
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Make Permanent / እንደ ቋሚ አስቀምጥ</span>
            </button>

          {isPermanentSaved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Permanent: Active</span>
            </span>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
              className="p-1 hover:bg-white rounded-lg text-slate-600 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold px-2 text-slate-700 min-w-[45px] text-center">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
              className="p-1 hover:bg-white rounded-lg text-slate-600 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              100%
            </button>
          </div>

          {/* Reset Options */}
          {isPermanentSaved && (
            <button
              type="button"
              onClick={handleResetToSavedPermanent}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-800 rounded-xl border border-violet-200 cursor-pointer transition-colors"
              title="Restore your saved permanent positions"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>To Permanent</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 cursor-pointer transition-colors"
            title="Reset positions to default Fayda slip standard"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Factory Reset</span>
          </button>

          {/* Presets dropdown */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setShowPresetModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200 cursor-pointer transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-emerald-600" />
              <span>Presets ({savedPresets.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Main Workspace: Left PDF Canvas vs Right Live Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive PDF Canvas */}
        <div className="lg:col-span-8 bg-slate-800/95 rounded-3xl p-4 shadow-lg border border-slate-700 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700 text-white text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-200">
                Interactive PDF Page Canvas — Drag or resize boxes directly
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Active: <span style={{ color: activeRegion.color }} className="font-bold">{activeRegion.label}</span> (X:{activeRegion.x}%, Y:{activeRegion.y}%, W:{activeRegion.width}%, H:{activeRegion.height}%)
            </span>
          </div>

          {/* Scrollable Stage */}
          <div
            ref={containerRef}
            className="relative overflow-auto max-h-[750px] rounded-2xl bg-slate-950 flex items-center justify-center p-4 select-none scrollbar-thin scrollbar-thumb-slate-700"
          >
            {pageCanvasUrl ? (
              <div
                style={{
                  width: `${zoomLevel}%`,
                  transition: isDragging || isResizing ? 'none' : 'width 0.15s ease-out',
                }}
                className="relative inline-block shadow-2xl rounded-xl overflow-hidden leading-none"
              >
                <img
                  ref={imageRef}
                  src={pageCanvasUrl}
                  alt="Fayda Slip PDF Page"
                  className="w-full h-auto block select-none pointer-events-none"
                  draggable={false}
                />

                {/* SVG & HTML Region Overlays */}
                {regions.map((reg) => {
                  const isSel = reg.id === selectedRegionId;
                  return (
                    <div
                      key={reg.id}
                      onMouseDown={(e) => handleMouseDownOnRegion(e, reg.id)}
                      style={{
                        position: 'absolute',
                        left: `${reg.x}%`,
                        top: `${reg.y}%`,
                        width: `${reg.width}%`,
                        height: `${reg.height}%`,
                        borderColor: reg.color,
                        backgroundColor: `${reg.color}${isSel ? '28' : '15'}`,
                        borderWidth: isSel ? '2.5px' : '1.5px',
                        borderStyle: isSel ? 'solid' : 'dashed',
                        boxShadow: isSel ? `0 0 12px ${reg.color}60` : 'none',
                        zIndex: isSel ? 30 : 10,
                      }}
                      className="cursor-move rounded-sm transition-shadow group flex flex-col justify-start"
                    >
                      {/* Tag Label: for small cutter boxes (< 5% height), position badge outside above the box so it never obscures the small area */}
                      <div
                        style={{ backgroundColor: reg.color }}
                        className={`${
                          reg.height < 5 
                            ? 'absolute -top-4.5 left-0 whitespace-nowrap z-20 shadow-sm' 
                            : 'self-start truncate max-w-full'
                        } text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br-md leading-none shadow-xs pointer-events-none select-none`}
                      >
                        {reg.label} {reg.labelAmh ? `• ${reg.labelAmh}` : ''}
                      </div>

                      {/* Resize Handles for selected box */}
                      {isSel && (
                        <>
                          {/* NW */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'nw')}
                            style={{ borderColor: reg.color }}
                            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nwse-resize shadow-md z-30"
                          />
                          {/* NE */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'ne')}
                            style={{ borderColor: reg.color }}
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nesw-resize shadow-md z-30"
                          />
                          {/* SW */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'sw')}
                            style={{ borderColor: reg.color }}
                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nesw-resize shadow-md z-30"
                          />
                          {/* SE */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'se')}
                            style={{ borderColor: reg.color }}
                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 rounded-full cursor-nwse-resize shadow-md z-30"
                          />
                          {/* Top handle (hidden if height < 2.5% so it doesn't cover tiny regions) */}
                          {reg.height >= 2.5 && (
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'n')}
                              style={{ borderColor: reg.color }}
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-white border-2 rounded-sm cursor-ns-resize z-20"
                            />
                          )}
                          {/* Bottom handle (hidden if height < 2.5%) */}
                          {reg.height >= 2.5 && (
                            <div
                              onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 's')}
                              style={{ borderColor: reg.color }}
                              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-white border-2 rounded-sm cursor-ns-resize z-20"
                            />
                          )}
                          {/* Left handle */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'w')}
                            style={{ borderColor: reg.color }}
                            className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border-2 rounded-sm cursor-ew-resize z-20"
                          />
                          {/* Right handle */}
                          <div
                            onMouseDown={(e) => handleMouseDownOnHandle(e, reg.id, 'e')}
                            style={{ borderColor: reg.color }}
                            className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border-2 rounded-sm cursor-ew-resize z-20"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-24 text-center text-slate-400 space-y-2">
                <FileCheck className="w-12 h-12 mx-auto text-slate-600" />
                <p className="text-sm font-semibold">No PDF page rendered yet</p>
                <p className="text-xs text-slate-500">Upload a Fayda slip in the Extractor tab first</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Inspector, Nudge Controls & Live Card Preview */}
        <div className="lg:col-span-4 space-y-5">
          {/* Active Field Inspector Card */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full shadow-xs"
                  style={{ backgroundColor: activeRegion.color }}
                />
                <div>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">
                    {activeRegion.label}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {activeRegion.labelAmh || activeRegion.id}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase">
                {activeRegion.type}
              </span>
            </div>

            {/* Coordinate Fine-Tune Controls (supports micro-measurements for smaller parts like back fan) */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              {/* X Position */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1.5">
                  <span className="font-semibold text-slate-700">X Position</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={activeRegion.x}
                      onChange={(e) => handleDirectValue('x', parseFloat(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-white font-mono font-bold text-slate-800 border border-slate-300 rounded text-right text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    title="Nudge Left 0.5%"
                    onClick={() => handleNudge('x', -0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    title="Micro Nudge Left 0.1%"
                    onClick={() => handleNudge('x', -0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    -0.1
                  </button>
                  <button
                    type="button"
                    title="Micro Nudge Right 0.1%"
                    onClick={() => handleNudge('x', 0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    +0.1
                  </button>
                  <button
                    type="button"
                    title="Nudge Right 0.5%"
                    onClick={() => handleNudge('x', 0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    +0.5
                  </button>
                </div>
              </div>

              {/* Y Position */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1.5">
                  <span className="font-semibold text-slate-700">Y Position</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={activeRegion.y}
                      onChange={(e) => handleDirectValue('y', parseFloat(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-white font-mono font-bold text-slate-800 border border-slate-300 rounded text-right text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    title="Nudge Up 0.5%"
                    onClick={() => handleNudge('y', -0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    title="Micro Nudge Up 0.1%"
                    onClick={() => handleNudge('y', -0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    -0.1
                  </button>
                  <button
                    type="button"
                    title="Micro Nudge Down 0.1%"
                    onClick={() => handleNudge('y', 0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    +0.1
                  </button>
                  <button
                    type="button"
                    title="Nudge Down 0.5%"
                    onClick={() => handleNudge('y', 0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    +0.5
                  </button>
                </div>
              </div>

              {/* Width (supports micro-small widths down to 0.2%) */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1.5">
                  <span className="font-semibold text-slate-700">Width (ስፋት)</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="100"
                      value={activeRegion.width}
                      onChange={(e) => handleDirectValue('w', parseFloat(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-white font-mono font-bold text-slate-800 border border-slate-300 rounded text-right text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    title="Shrink Width 0.5%"
                    onClick={() => handleNudge('w', -0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    title="Micro Shrink Width 0.1%"
                    onClick={() => handleNudge('w', -0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    -0.1
                  </button>
                  <button
                    type="button"
                    title="Micro Expand Width 0.1%"
                    onClick={() => handleNudge('w', 0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    +0.1
                  </button>
                  <button
                    type="button"
                    title="Expand Width 0.5%"
                    onClick={() => handleNudge('w', 0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    +0.5
                  </button>
                </div>
              </div>

              {/* Height (supports micro-small heights down to 0.2% for small back fan) */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1.5">
                  <span className="font-semibold text-slate-700">Height (ቁመት)</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="100"
                      value={activeRegion.height}
                      onChange={(e) => handleDirectValue('h', parseFloat(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-white font-mono font-bold text-slate-800 border border-slate-300 rounded text-right text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <button
                    type="button"
                    title="Shrink Height 0.5%"
                    onClick={() => handleNudge('h', -0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    -0.5
                  </button>
                  <button
                    type="button"
                    title="Micro Shrink Height 0.1%"
                    onClick={() => handleNudge('h', -0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    -0.1
                  </button>
                  <button
                    type="button"
                    title="Micro Expand Height 0.1%"
                    onClick={() => handleNudge('h', 0.1)}
                    className="py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono font-bold rounded border border-indigo-200 cursor-pointer text-[10px]"
                  >
                    +0.1
                  </button>
                  <button
                    type="button"
                    title="Expand Height 0.5%"
                    onClick={() => handleNudge('h', 0.5)}
                    className="py-1 bg-white hover:bg-slate-100 text-slate-700 font-mono font-bold rounded border border-slate-300 cursor-pointer text-[10px]"
                  >
                    +0.5
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Size Presets for Small Parts (Especially Back FAN / FIN) */}
            {(activeRegion.id === 'finCut' || activeRegion.cutToLayerOnly || activeRegion.id === 'fcn') && (
              <div className="p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                  <span>Small Part Cutter Presets (ለአነስተኛ የኋላ ፋን ፈጣን መጠን)</span>
                  <span className="text-[10px] text-indigo-600 font-normal">One-click size</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      handleDirectValue('w', 34.0);
                      handleDirectValue('h', 2.8);
                    }}
                    className="py-1 px-1.5 bg-white hover:bg-indigo-50 text-indigo-900 font-medium rounded border border-indigo-200 shadow-2xs text-center"
                  >
                    Narrow Fan (34×2.8%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDirectValue('w', 26.0);
                      handleDirectValue('h', 2.0);
                    }}
                    className="py-1 px-1.5 bg-white hover:bg-indigo-50 text-indigo-900 font-medium rounded border border-indigo-200 shadow-2xs text-center"
                  >
                    Small Fan (26×2.0%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDirectValue('w', 21.0);
                      handleDirectValue('h', 1.6);
                    }}
                    className="py-1 px-1.5 bg-white hover:bg-indigo-50 text-indigo-900 font-medium rounded border border-indigo-200 shadow-2xs text-center"
                  >
                    Micro Fan (21×1.6%)
                  </button>
                </div>
              </div>
            )}

            {/* Live Readout / Crop Preview & Layer Controls */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Layer Inspector & Live Preview</span>
                <span className="text-emerald-600 font-semibold lowercase">real-time</span>
              </div>

              {/* Photo 1 (Primary Portrait) Layer Controls */}
              {activeRegion.id === 'photo' && (
                <div className="space-y-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="relative w-18 h-22 rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-[linear-gradient(45deg,#f0f0f0_25%,transparent_25%),linear-gradient(-45deg,#f0f0f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f0f0f0_75%),linear-gradient(-45deg,transparent_75%,#f0f0f0_75%)] bg-[size:10px_10px] bg-[position:0_0,0_5px,5px_-5px,-5px_0px] flex items-center justify-center shrink-0">
                      {livePhotoPreview ? (
                        <img
                          src={livePhotoPreview}
                          alt="Primary Portrait"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">Photo Layer 1 (Primary)</span>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 rounded">Auto-Clean</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        High-resolution 480×640 applicant portrait cropped directly into its dedicated layer.
                      </p>
                    </div>
                  </div>

                  {/* Auto-Remove Photo Background Controls */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeRegion.autoRemoveBg !== false}
                          onChange={() => handleToggleAutoRemoveBg(activeRegion.id)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span>Auto-Remove Photo Background / ግልጽ ጀርባ</span>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={handleTriggerBackgroundRemoval}
                      disabled={isRemovingBgNow || !livePhotoPreview}
                      className="w-full py-1.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isRemovingBgNow ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Removing Background...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>✨ Clean Background Now (Auto)</span>
                        </>
                      )}
                    </button>

                    {/* Snap to Auto-Detected Photo Position */}
                    {detectedPhotoBox && canvasDimensions && canvasDimensions.width > 0 && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold flex items-center gap-1 text-emerald-800">
                            <Crosshair className="w-3.5 h-3.5 text-emerald-600" />
                            Detected on Slip:
                          </span>
                          <span className="text-[10px] font-mono text-emerald-700 font-semibold">
                            {detectedPhotoBox.width}×{detectedPhotoBox.height}px @ ({detectedPhotoBox.x}, {detectedPhotoBox.y})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSnapToDetectedPhoto}
                          className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                          title="Snap the photo crop marker directly to the detected photo box on the slip"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Snap Marker to Detected Photo Position</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Photo 2 (Secondary Portrait / Ghost Image) Layer Controls */}
              {activeRegion.id === 'secondaryPhoto' && (
                <div className="space-y-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-20 rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-[linear-gradient(45deg,#f0f0f0_25%,transparent_25%),linear-gradient(-45deg,#f0f0f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f0f0f0_75%),linear-gradient(-45deg,transparent_75%,#f0f0f0_75%)] bg-[size:10px_10px] bg-[position:0_0,0_5px,5px_-5px,-5px_0px] flex items-center justify-center shrink-0">
                      {liveSecondaryPhotoPreview ? (
                        <img
                          src={liveSecondaryPhotoPreview}
                          alt="Secondary Portrait"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">Photo Layer 2 (Ghost Security)</span>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-800 rounded">Ghost</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Secondary applicant photo placed on an independent security layer with transparency support.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeRegion.autoRemoveBg !== false}
                        onChange={() => handleToggleAutoRemoveBg(activeRegion.id)}
                        className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>Auto-Remove Background for Photo 2</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Back FAN Cut Layer Controls (Direct Cut, No OCR) */}
              {(activeRegion.id === 'finCut' || activeRegion.id === 'backFanCut' || activeRegion.cutToLayerOnly || activeRegion.id === 'fcn') && (
                <div className="space-y-3 bg-pink-50/70 p-3.5 rounded-2xl border border-pink-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Scissors className="w-4 h-4 text-pink-600" />
                      <span className="text-xs font-bold text-pink-900">Back FAN Cutter Layer (የተቆረጠ የኋላ ፋን)</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-pink-600 text-white rounded-md flex items-center gap-1">
                      <Sparkle className="w-2.5 h-2.5 text-amber-300" /> Ultra HD Clarity
                    </span>
                  </div>

                  {liveFinCutPreview ? (
                    <div className="bg-white p-2 rounded-xl border border-pink-200 shadow-xs flex flex-col items-center justify-center gap-1.5">
                      <img
                        src={liveFinCutPreview}
                        alt="Back FAN Cut Layer Preview"
                        className="w-full max-h-16 object-contain"
                        style={{ imageRendering: '-webkit-optimize-contrast' }}
                      />
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" /> Proportional 300+ DPI • Contrast Enhanced • Sharp
                      </span>
                    </div>
                  ) : (
                    <div className="w-full h-14 bg-white/70 rounded-xl border border-pink-200 flex items-center justify-center text-pink-400 gap-2">
                      <Scissors className="w-5 h-5" />
                      <span className="text-xs">Back FAN will be cut directly from PDF</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRegions((prev) =>
                          prev.map((r) =>
                            r.id === activeRegion.id
                              ? { ...r, x: 29.5, y: 24.0, width: 43.0, height: 4.5 }
                              : r
                          )
                        );
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-pink-600 hover:bg-pink-700 text-white rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
                      title="Reset and align cutter directly to the 16-digit FAN row (24.0%)"
                    >
                      <span>🎯 Auto-Align to 16-Digit FAN</span>
                    </button>

                    <span className="text-[10px] font-mono text-slate-500">
                      Row: 24.0% • 43.0×4.5%
                    </span>
                  </div>

                  <div className="pt-2 border-t border-pink-200/80 space-y-1.5">
                    <label className="text-xs font-semibold text-pink-900 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeRegion.cutToLayerOnly !== false}
                        onChange={() => handleToggleCutToLayer(activeRegion.id)}
                        className="w-3.5 h-3.5 rounded text-pink-600 focus:ring-pink-500 cursor-pointer"
                      />
                      <span>Direct Cut Layer (No Back FAN Reader • ንጹህ የተቆረጠ ምስል)</span>
                    </label>
                    <p className="text-[10px] text-pink-700 leading-tight">
                      Ultra-clarity crop: Super-samples at 300+ DPI, removes paper background noise, deepens ink density, and sharpens edges without distortion.
                    </p>
                  </div>
                </div>
              )}

              {/* Date of Birth Layer Controls (Permanently Read Text) */}
              {activeRegion.id === 'dateOfBirth' && (
                <div className="space-y-3 bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-bold text-emerald-900">Date of Birth (የትውልድ ቀን)</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-700 text-white rounded-md">
                      Read Text Mode
                    </span>
                  </div>

                  <p className="text-xs text-emerald-800 leading-snug">
                    Permanently reads and formats the date text directly from the PDF into dual calendar format (E.C. | G.C.), avoiding cut overlay misalignment.
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-emerald-200/50">
                    <div className="bg-white p-1.5 rounded-lg border border-emerald-200">
                      <span className="text-[9px] text-emerald-700 font-semibold block">GC Fallback</span>
                      <span className="font-mono font-bold text-slate-800 text-[11px]">
                        {liveExtractedTexts['dateOfBirth'] || initialData.dateOfBirth || 'YYYY-MM-DD'}
                      </span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-emerald-200">
                      <span className="text-[9px] text-emerald-700 font-semibold block">EC Fallback</span>
                      <span className="font-mono font-bold text-emerald-800 text-[11px]">
                        {convertGcToEth(liveExtractedTexts['dateOfBirth'] || initialData.dateOfBirth || '') || 'ቀን/ወር/ዓ.ም'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Date of Issue Layer Controls (Independent layer with GC & Ethiopian dates) */}
              {activeRegion.id === 'dateOfIssue' && (
                <div className="space-y-2.5 bg-amber-50/70 p-3 rounded-2xl border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-700" />
                      <span className="text-xs font-bold text-amber-900">Issued Date Layer (የተሰጠበት ቀን)</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-600 text-white rounded-md">
                      Dual Calendar
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded-xl border border-amber-200">
                      <span className="text-[10px] text-amber-700 font-semibold block">Gregorian (GC)</span>
                      <span className="font-mono font-bold text-slate-800">
                        {liveExtractedTexts['dateOfIssue'] || initialData.dateOfIssue || 'YYYY/MM/DD'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-amber-200">
                      <span className="text-[10px] text-amber-700 font-semibold block">Ethiopian (EC)</span>
                      <span className="font-mono font-bold text-emerald-800">
                        {convertGcToEth(liveExtractedTexts['dateOfIssue'] || initialData.dateOfIssue || '') || 'ቀን/ወር/ዓ.ም'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-amber-700 leading-tight">
                    Rendered in a separate date layer. Automatically computes the Ethiopian calendar equivalent from the marked issued date.
                  </p>
                </div>
              )}

              {/* Date of Expiry Layer Controls - Permanently Text Reader */}
              {activeRegion.id === 'dateOfExpiry' && (
                <div className="space-y-3 bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-700" />
                      <span className="text-xs font-bold text-emerald-900">Expiry Date (የሚያበቃበት ቀን)</span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded-md">
                      Text Reader (+8 Years)
                    </span>
                  </div>

                  <p className="text-[11px] text-emerald-800 leading-snug">
                    Permanently extracted as text. Expiry date starts from the issued date and expires in exactly 8 years, rendered in dual calendar format (E.C. | G.C.) without blur.
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-emerald-200/50">
                    <div className="bg-white p-2 rounded-xl border border-emerald-200">
                      <span className="text-[9px] text-slate-500 font-semibold block">Gregorian (G.C.)</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">
                        {liveExtractedTexts['dateOfExpiry'] || initialData.dateOfExpiry || calculateExpiryFromIssue(liveExtractedTexts['dateOfIssue'] || initialData.dateOfIssue || '')?.expiryGc || 'YYYY/MM/DD'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-emerald-200">
                      <span className="text-[9px] text-emerald-600 font-semibold block">Ethiopian (E.C.)</span>
                      <span className="font-mono font-bold text-emerald-800 text-[12px]">
                        {convertGcToEth(liveExtractedTexts['dateOfExpiry'] || initialData.dateOfExpiry || '') || calculateExpiryFromIssue(liveExtractedTexts['dateOfIssue'] || initialData.dateOfIssue || '')?.expiryEth || 'ቀን/ወር/ዓ.ም'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 16-Digit FAN Number Layer */}
              {activeRegion.id === 'fan' && (
                <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">FAN Layer (16 Digits)</span>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded-md">
                      Separate Layer
                    </span>
                  </div>
                  <p className="text-xs font-mono font-bold text-slate-900 bg-white p-2 rounded-xl border border-slate-200">
                    {liveExtractedTexts['fan'] || initialData.fan || '0000 0000 0000 0000'}
                  </p>
                </div>
              )}

              {activeRegion.id === 'qrCode' && (
                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  {liveQrPreview ? (
                    <img
                      src={liveQrPreview}
                      alt="QR Preview"
                      className="w-18 h-18 object-contain bg-white rounded-xl border border-slate-300 shadow-sm p-1"
                    />
                  ) : (
                    <div className="w-18 h-18 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                      <QrCode className="w-6 h-6" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">Biometric QR Matrix</p>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      High-density QR matrix cropped and auto-decoded directly from coordinates into its layer.
                    </p>
                  </div>
                </div>
              )}

              {(activeRegion.id === 'barcode' || activeRegion.type === 'barcode') && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-violet-600" />
                      <span>1D Barcode Strip • ባርኮድ</span>
                    </p>
                    {liveBarcodeData && (
                      <span className="text-[10px] font-mono font-bold bg-violet-100 text-violet-800 px-2 py-0.5 rounded-md">
                        Decoded
                      </span>
                    )}
                  </div>

                  {liveBarcodePreview ? (
                    <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs flex items-center justify-center">
                      <img
                        src={liveBarcodePreview}
                        alt="1D Barcode Preview"
                        className="w-full max-h-16 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-14 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400 gap-2">
                      <Barcode className="w-6 h-6" />
                      <span className="text-xs">No Barcode Loaded</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">
                      Decoded / Human-Readable Digits:
                    </p>
                    <p className="text-xs font-mono font-bold text-slate-900 bg-white p-2 rounded-xl border border-slate-200">
                      {liveBarcodeData || (
                        <span className="text-slate-400 font-normal italic">
                          Automatic detection from coordinates & text stream
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {activeRegion.type === 'text' && activeRegion.id !== 'fan' && activeRegion.id !== 'dateOfIssue' && activeRegion.id !== 'dateOfExpiry' && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Extracted Text Content:</span>
                  </div>
                  <p className="text-xs font-mono font-bold text-slate-900 bg-white p-2 rounded-xl border border-slate-200 break-words min-h-[36px]">
                    {liveExtractedTexts[activeRegion.id] || (
                      <span className="text-slate-400 font-normal italic">
                        No vector text in this region — auto-fallback used
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mini Live Card Template Preview */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Template Preview (Front Card)</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">CR80 ISO 300 DPI</span>
            </div>

            <div className="bg-slate-100 p-2 rounded-2xl border border-slate-200 flex items-center justify-center overflow-hidden">
              <div className="transform scale-[0.38] origin-center -my-24">
                <CardRenderer
                  side="front"
                  data={previewData}
                  config={config}
                  templateConfig={templateConfig}
                />
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleSaveToBatchConverter}
                disabled={isPerforming}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 border border-indigo-400/30"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Save to Batch Converter & Apply</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAndApply}
                disabled={isPerforming}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                <span>Save & Apply to Single Card</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Save className="w-4 h-4 text-emerald-600" />
                <span>PDF Position Layout Presets</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Save Current Layout */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Save Current Layout as Preset</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="e.g. Online Fayda Slip Layout"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {/* List of Saved Presets */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700">Saved Presets</label>
              {savedPresets.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">No custom presets saved yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedPresets.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.createdAt || p.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleLoadPreset(p);
                            setShowPresetModal(false);
                          }}
                          className="px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-bold rounded-lg cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleLoadPreset(p);
                            savePermanentRegions(p.regions);
                            setIsPermanentSaved(true);
                            if (onSaveToBatchConverter) {
                              onSaveToBatchConverter(p.regions, previewData || initialData);
                            } else if (onOpenBatch) {
                              onOpenBatch();
                            }
                            setShowPresetModal(false);
                          }}
                          className="px-2.5 py-1 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 font-bold rounded-lg cursor-pointer flex items-center gap-1"
                          title="Apply this preset directly to Batch Converter"
                        >
                          <Layers className="w-3 h-3" />
                          <span>To Batch</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(p.id)}
                          className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adobe Photoshop Action Import & Mapping Modal */}
      {showPhotoshopModal && (
        <PhotoshopActionModal
          onClose={() => setShowPhotoshopModal(false)}
          onApplyRegions={handleApplyPhotoshopRegions}
          currentRegions={regions}
        />
      )}
    </div>
  );
};
