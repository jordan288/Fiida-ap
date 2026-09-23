import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  CreditCard, 
  RotateCw, 
  Download, 
  Printer, 
  Sparkles, 
  User, 
  Upload, 
  Layers, 
  Check, 
  ZoomIn, 
  ZoomOut,
  FileDown,
  Sliders,
  Move,
  Grid,
  Tag,
  Crosshair,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AlignHorizontalJustifyCenter,
  Type,
  Palette,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Image as ImageIcon,
  Crop as CropIcon,
  QrCode,
  Calendar,
  Hash,
  Save,
  Plus,
  Scissors,
  CheckCircle2,
  Barcode,
  X,
  Maximize2,
} from 'lucide-react';
import { IdCardData, CoordinatesConfig, TemplateConfig, AppSettings, BatchQueueItem, NumberedTemplate } from '../types';
import { CardRenderer } from './CardRenderer';
import { ExportPdfModal } from './ExportPdfModal';
import { FieldPositionEditor } from './FieldPositionEditor';
import { CustomTemplateModal } from './CustomTemplateModal';
import { PhotoAdjustModal } from './PhotoAdjustModal';
import { PhotoCropModal } from './PhotoCropModal';
import { QrCropModal } from './QrCropModal';
import { BarcodeCropModal } from './BarcodeCropModal';
import { BackFanCropModal } from './BackFanCropModal';
import { AppSettingsModal, loadSavedAppSettings, saveAppSettingsToStorage } from './AppSettingsModal';
import { FontManagerModal } from './FontManagerModal';
import { SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA, DEFAULT_COORDINATES, PRESET_TEMPLATES } from '../data/defaultData';
import { 
  loadNumberedTemplates, 
  saveNumberedTemplates, 
  getActiveTemplateNumber, 
  setActiveTemplateNumber, 
  saveTemplateByNumber,
  applyCoordinatesToAllTemplates 
} from '../utils/templateStorage';
import { generateAndDownloadIdPdf, generateAndDownloadIdJpeg } from '../utils/pdfGenerator';
import { sanitizeIdCardData, sanitizeEnglishName, sanitizeAmharicName, cleanFieldText } from '../utils/textCleaner';
import { convertGcToEth, convertEthToGc, formatCardDualDate, format7DigitSerial, getTodayIssueDates, calculateExpiryFromIssue, parseDualDate, formatGcyyyyMmDd, formatGcWith3LetterMonth } from '../utils/ethiopianCalendar';
import { getEffectiveRegions, cropHighQualityFanLayer, enhanceFanLayerClarity, generateVectorFanDataUrl } from '../utils/pdfRegionExtractor';
import { autoRemovePhotoBackground, removePhotoBackground, removePhotoBackgroundClassic } from '../utils/imageProcessor';

interface CardStudioProps {
  idData: IdCardData;
  setIdData: React.Dispatch<React.SetStateAction<IdCardData>>;
  config: CoordinatesConfig;
  setConfig: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  templateConfig: TemplateConfig;
  setTemplateConfig: React.Dispatch<React.SetStateAction<TemplateConfig>>;
  onOpenExtractor?: () => void;
  onOpenCalibrator?: () => void;
  queue?: BatchQueueItem[];
  activeQueueIndex?: number;
  onSelectQueueIndex?: (index: number) => void;
  onOpenBatch?: () => void;
  activeTemplateNumber?: number;
  onSelectTemplateNumber?: (num: number) => void;
  numberedTemplates?: NumberedTemplate[];
  onUpdateNumberedTemplates?: (templates: NumberedTemplate[]) => void;
  onApplyStudioPositionsToAllTemplates?: () => void;
}

export const CardStudio: React.FC<CardStudioProps> = ({
  idData,
  setIdData,
  config,
  setConfig,
  templateConfig,
  setTemplateConfig,
  onOpenExtractor,
  onOpenCalibrator,
  queue = [],
  activeQueueIndex = 0,
  onSelectQueueIndex,
  onOpenBatch,
  activeTemplateNumber: propActiveNum,
  onSelectTemplateNumber: propOnSelectNum,
  numberedTemplates: propNumberedTemplates,
  onUpdateNumberedTemplates: propOnUpdateTemplates,
  onApplyStudioPositionsToAllTemplates,
}) => {
  const [appliedPositionsToast, setAppliedPositionsToast] = useState(false);
  // Fallback internal template storage state if not provided from parent
  const [internalTemplates, setInternalTemplates] = useState<NumberedTemplate[]>(() => loadNumberedTemplates());
  const [internalActiveNum, setInternalActiveNum] = useState<number>(() => getActiveTemplateNumber());

  const activeNum = propActiveNum ?? internalActiveNum;
  const templatesList = propNumberedTemplates ?? internalTemplates;

  const handleSelectTemplateNumber = (num: number) => {
    if (propOnSelectNum) {
      propOnSelectNum(num);
    } else {
      setActiveTemplateNumber(num);
      setInternalActiveNum(num);
      const target = templatesList.find((t) => t.number === num);
      if (target) {
        setTemplateConfig(target.config);
        if (target.coordinates) {
          setConfig(target.coordinates);
        }
      }
    }
  };

  const handleUpdateTemplates = (updated: NumberedTemplate[]) => {
    if (propOnUpdateTemplates) {
      propOnUpdateTemplates(updated);
    } else {
      setInternalTemplates(updated);
      saveNumberedTemplates(updated);
    }
  };
  const [viewMode, setViewMode] = useState<'both' | 'flip' | 'front' | 'back'>('both');
  const [isFlipped, setIsFlipped] = useState(false);
  const [zoomScale, setZoomScale] = useState(0.72);
  const [isGeneratingQuickPdf, setIsGeneratingQuickPdf] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isPhotoAdjustModalOpen, setIsPhotoAdjustModalOpen] = useState(false);
  const [photoAdjustTarget, setPhotoAdjustTarget] = useState<'primary' | 'secondary'>('primary');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<'primary' | 'secondary'>('primary');
  const [isQrCropModalOpen, setIsQrCropModalOpen] = useState(false);
  const [isBarcodeCropModalOpen, setIsBarcodeCropModalOpen] = useState(false);
  const [isBackFanCropModalOpen, setIsBackFanCropModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isFontModalOpen, setIsFontModalOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadSavedAppSettings());
  const [quickStatus, setQuickStatus] = useState<string>('');

  // Interactive Positioning & Customization States
  const [isInteractiveDragMode, setIsInteractiveDragMode] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showCoordinateBadges, setShowCoordinateBadges] = useState<boolean>(false);
  const [showCornerMarks, setShowCornerMarks] = useState<boolean>(() => templateConfig.showCornerMarks ?? false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [openPositionFields, setOpenPositionFields] = useState<Record<string, boolean>>({
    photoFrontSecondary: true,
    frontBarcode: true,
    backFanCut: true,
  });

  // Synchronize corner marks state when templateConfig updates (e.g. from template upload)
  useEffect(() => {
    if (templateConfig.showCornerMarks !== undefined) {
      setShowCornerMarks(templateConfig.showCornerMarks);
    }
  }, [templateConfig.showCornerMarks]);

  // User directive: "make the issued date always updated do not put the button"
  // User directive: "the expiry date start exactly from the issued date"
  // Keep issued date always automatically updated to today's date, and ensure expiry date starts exactly from the issued date (+8 years)
  useEffect(() => {
    const today = getTodayIssueDates();
    const issueGc = idData.dateOfIssue || today.issueDateGc;
    const issueEth = idData.dateOfIssueEth || today.issueDateEth;
    const expectedExp = calculateExpiryFromIssue(issueGc, issueEth) || {
      expiryGc: today.expiryDateGc,
      expiryEth: today.expiryDateEth
    };

    if (
      idData.dateOfIssue !== issueGc ||
      idData.dateOfIssueEth !== issueEth ||
      idData.dateOfExpiry !== expectedExp.expiryGc ||
      idData.dateOfExpiryEth !== expectedExp.expiryEth
    ) {
      setIdData((prev) => ({
        ...prev,
        dateOfIssue: issueGc,
        dateOfIssueEth: issueEth,
        dateOfExpiry: expectedExp.expiryGc,
        dateOfExpiryEth: expectedExp.expiryEth,
      }));
    }
  }, [idData.dateOfIssue, idData.dateOfIssueEth]);

  const frontExportRef = useRef<HTMLDivElement>(null);
  const backExportRef = useRef<HTMLDivElement>(null);

  // Background Transparency States
  const [isCuttingBothBg, setIsCuttingBothBg] = useState<boolean>(false);
  const [cutoutSuccessToast, setCutoutSuccessToast] = useState<string | null>(null);

  const handleMakeBothPhotosTransparent = async () => {
    if (!idData.photoUrl && !idData.secondaryPhotoUrl) return;
    try {
      setIsCuttingBothBg(true);
      let cut1 = idData.photoUrl;
      if (idData.photoUrl) {
        cut1 = (await autoRemovePhotoBackground(idData.photoUrl)) || idData.photoUrl;
      }
      let cut2 = cut1;
      if (idData.secondaryPhotoUrl && idData.secondaryPhotoUrl !== idData.photoUrl) {
        cut2 = (await autoRemovePhotoBackground(idData.secondaryPhotoUrl)) || idData.secondaryPhotoUrl;
      } else {
        cut2 = cut1;
      }
      setIdData((prev) => ({
        ...prev,
        photoUrl: cut1,
        secondaryPhotoUrl: cut2,
      }));
      setCutoutSuccessToast('Both Photo 1 & Photo 2 background set to transparent!');
      setTimeout(() => setCutoutSuccessToast(null), 3500);
    } catch (err) {
      console.error('Failed to make both photos transparent:', err);
    } finally {
      setIsCuttingBothBg(false);
    }
  };

  // Photo Dimensions State
  const [photoDimensions, setPhotoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Read photo natural dimensions for layout info
  useEffect(() => {
    if (!idData.photoUrl) {
      setPhotoDimensions(null);
      return;
    }
    const currentPhoto = idData.photoUrl;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setPhotoDimensions({ width: w, height: h });
    };
    img.src = currentPhoto;
  }, [idData.photoUrl]);

  const handleMakeSinglePhotoTransparent = async (target: 'primary' | 'secondary') => {
    const src = target === 'secondary' ? (idData.secondaryPhotoUrl || idData.photoUrl) : idData.photoUrl;
    if (!src) return;
    try {
      setIsCuttingBothBg(true);
      const cutout = await removePhotoBackground(src, {
        tolerance: 30,
        feather: 2,
        fillColor: 'transparent',
      });
      const finalCutout = cutout || src;
      setIdData((prev) => ({
        ...prev,
        ...(target === 'secondary'
          ? { secondaryPhotoUrl: finalCutout }
          : { photoUrl: finalCutout, secondaryPhotoUrl: prev.secondaryPhotoUrl === prev.photoUrl ? finalCutout : prev.secondaryPhotoUrl }),
      }));
      setCutoutSuccessToast(
        `✨ Transparent background removed: ${target === 'primary' ? 'Photo 1' : 'Photo 2'}!`
      );
      setTimeout(() => setCutoutSuccessToast(null), 3000);
    } catch (err) {
      console.error(`Failed to make ${target} photo transparent:`, err);
    } finally {
      setIsCuttingBothBg(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const rawUrl = event.target.result as string;
          try {
            setIsCuttingBothBg(true);
            const cutout = await autoRemovePhotoBackground(rawUrl);
            const finalUrl = cutout || rawUrl;
            setIdData((prev) => ({
              ...prev,
              photoUrl: finalUrl,
              secondaryPhotoUrl: finalUrl,
            }));
            setCutoutSuccessToast('✨ Uploaded photo loaded with transparent background!');
            setTimeout(() => setCutoutSuccessToast(null), 3000);
          } catch {
            setIdData((prev) => ({
              ...prev,
              photoUrl: rawUrl,
              secondaryPhotoUrl: prev.secondaryPhotoUrl || rawUrl,
            }));
          } finally {
            setIsCuttingBothBg(false);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSecondaryPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const rawUrl = event.target.result as string;
          try {
            setIsCuttingBothBg(true);
            const cutout = await autoRemovePhotoBackground(rawUrl);
            const finalUrl = cutout || rawUrl;
            setIdData((prev) => ({
              ...prev,
              secondaryPhotoUrl: finalUrl,
            }));
            setCutoutSuccessToast('✨ Photo 2 loaded with transparent background!');
            setTimeout(() => setCutoutSuccessToast(null), 3000);
          } catch {
            setIdData((prev) => ({
              ...prev,
              secondaryPhotoUrl: rawUrl,
            }));
          } finally {
            setIsCuttingBothBg(false);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setIdData((prev) => ({
            ...prev,
            qrCodeImageUrl: event.target!.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Enhance Back FAN Cut Layer clarity and contrast
  const [isEnhancingFin, setIsEnhancingFin] = useState(false);
  const [finDimensions, setFinDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!idData.finLayerCropUrl) {
      setFinDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setFinDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = idData.finLayerCropUrl;
  }, [idData.finLayerCropUrl]);

  // One-click HD Quality Booster: 3x Super-Sampling, edge sharpening & contrast restoration
  const handleBoostFinQuality = async (mode: 'ultra' | 'bw' | 'enhance' = 'ultra') => {
    setIsEnhancingFin(true);
    try {
      if (idData.documentScanUrl) {
        const regions = getEffectiveRegions();
        const finCutReg = regions.find((r) => r.id === 'finCut' || r.id === 'backFanCut' || (r.cutToLayerOnly && (r.id === 'fcn' || r.id === 'fan'))) || {
          id: 'finCut',
          label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
          labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር',
          color: '#ec4899',
          type: 'image' as const,
          x: 29.5,
          y: 24.0,
          width: 43.0,
          height: 4.5,
          cutToLayerOnly: true,
        };

        const boostedCrop = await cropHighQualityFanLayer(idData.documentScanUrl, finCutReg, {
          bgMode: 'white',
          colorMode: mode === 'bw' ? 'bw' : 'enhanced',
          superSampleFactor: mode === 'ultra' ? 3.0 : 2.5,
          targetMinHeight: 200,
          sharpen: true,
          smoothText: true,
          denoise: true,
          noUpscale: false,
        });

        if (boostedCrop) {
          setIdData((prev) => ({
            ...prev,
            finLayerCropUrl: boostedCrop,
            useFinLayerCrop: true,
          }));
          setQuickStatus('✨ Back FAN upgraded to Ultra-HD Print Quality (300+ DPI)!');
          setTimeout(() => setQuickStatus(''), 4000);
          return;
        }
      }

      // If document scan isn't loaded, enhance existing cropped image directly
      if (idData.finLayerCropUrl) {
        const enhanced = await enhanceFanLayerClarity(idData.finLayerCropUrl, {
          bgMode: 'white',
          colorMode: mode === 'bw' ? 'bw' : 'enhanced',
          sharpen: true,
          smoothText: true,
          denoise: true,
          superSampleFactor: 2.5,
        });
        setIdData((prev) => ({
          ...prev,
          finLayerCropUrl: enhanced,
          useFinLayerCrop: true,
        }));
        setQuickStatus('✨ Back FAN quality enhanced with unsharp masking & subpixel smoothing!');
        setTimeout(() => setQuickStatus(''), 4000);
      }
    } catch (e) {
      console.error('Boost fin error:', e);
      setQuickStatus('Failed to enhance Back FAN quality');
    } finally {
      setIsEnhancingFin(false);
    }
  };

  const handleEnhanceFinLayer = async (
    bgMode: 'white' | 'transparent' = 'white',
    colorMode: 'bw' | 'bw_transparent' | 'enhanced' = 'bw'
  ) => {
    if (!idData.finLayerCropUrl) return;
    setIsEnhancingFin(true);
    try {
      const enhanced = await enhanceFanLayerClarity(idData.finLayerCropUrl, {
        bgMode,
        colorMode,
        sharpen: true,
        smoothText: true,
        denoise: true,
        superSampleFactor: 2.5,
      });
      setIdData((prev) => ({
        ...prev,
        finLayerCropUrl: enhanced,
        useFinLayerCrop: true,
      }));
      setQuickStatus(
        colorMode === 'bw'
          ? '🖤 Back FAN: Smooth Black & White on solid white background!'
          : '✨ Back FAN: Clarity & text smoothness enhanced!'
      );
      setTimeout(() => setQuickStatus(''), 4000);
    } catch (e) {
      console.error('Enhance fin error:', e);
      setQuickStatus('Failed to enhance Back FAN clarity');
    } finally {
      setIsEnhancingFin(false);
    }
  };

  const handleReCropFinFromScan = async (
    bgMode: 'white' | 'transparent' = 'white',
    colorMode: 'bw' | 'bw_transparent' | 'enhanced' | 'original' = 'original'
  ) => {
    if (!idData.documentScanUrl) return;
    setIsEnhancingFin(true);
    try {
      const regions = getEffectiveRegions();
      const finCutReg = regions.find((r) => r.id === 'finCut' || r.id === 'backFanCut' || (r.cutToLayerOnly && (r.id === 'fcn' || r.id === 'fan'))) || {
        id: 'finCut',
        label: 'Back FAN Cutter (የተቆረጠ የኋላ ፋን)',
        labelAmh: 'የተቆረጠ የኋላ ፋን ቁጥር',
        color: '#ec4899',
        type: 'image' as const,
        x: 29.5,
        y: 24.0,
        width: 43.0,
        height: 4.5,
        cutToLayerOnly: true,
      };

      const highQualityCrop = await cropHighQualityFanLayer(idData.documentScanUrl, finCutReg, {
        bgMode,
        colorMode,
        superSampleFactor: colorMode === 'original' ? 1.0 : 2.5,
        targetMinHeight: colorMode === 'original' ? 0 : 180,
        sharpen: colorMode !== 'original',
        smoothText: true,
        denoise: colorMode !== 'original',
        noUpscale: colorMode === 'original',
      });

      if (highQualityCrop) {
        setIdData((prev) => ({
          ...prev,
          finLayerCropUrl: highQualityCrop,
          useFinLayerCrop: true,
        }));
        setQuickStatus(
          colorMode === 'original'
            ? '✂️ Cropped Back FAN from slip as it is (1:1, no upscale)!'
            : '🖤 Cropped Back FAN with clean black ink!'
        );
        setTimeout(() => setQuickStatus(''), 4000);
      }
    } catch (e) {
      console.error('Re-crop fin error:', e);
      setQuickStatus('Failed to cut Back FAN from document scan');
    } finally {
      setIsEnhancingFin(false);
    }
  };

  const handleGenerateVectorFin = (bgMode: 'transparent' | 'white' = 'white') => {
    const fanSource = idData.backFan || idData.fan || '4195 0436 7069 2582';
    const vectorUrl = generateVectorFanDataUrl(fanSource, {
      width: 1760,
      height: 380,
      color: '#000000',
      bgMode,
    });
    if (vectorUrl) {
      setIdData((prev) => ({
        ...prev,
        finLayerCropUrl: vectorUrl,
        useFinLayerCrop: true,
      }));
      setQuickStatus('🔤 Back FAN: Ultra-HD Vector Digits (600 DPI) generated!');
      setTimeout(() => setQuickStatus(''), 4000);
    }
  };

  const handleMoveField = (fieldId: string, newX: number, newY: number) => {
    const isMedia = 
      fieldId === 'photoFront' || 
      fieldId === 'photoFrontSecondary' || 
      fieldId === 'frontBarcode' || 
      fieldId === 'qrCodeBack' || 
      fieldId === 'backFanCut' || 
      Boolean(config.media[fieldId]);
    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...(prev.media[fieldId] || DEFAULT_COORDINATES.media[fieldId] || {
              id: fieldId,
              label: fieldId,
              side: 'back',
              x: newX,
              y: newY,
              width: 440,
              height: 95,
            }),
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
    const isMedia = 
      fieldId === 'photoFront' || 
      fieldId === 'photoFrontSecondary' || 
      fieldId === 'frontBarcode' || 
      fieldId === 'qrCodeBack' || 
      fieldId === 'backFanCut' || 
      Boolean(config.media[fieldId]);

    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [fieldId]: {
            ...(prev.media[fieldId] || DEFAULT_COORDINATES.media[fieldId] || {
              id: fieldId,
              label: fieldId,
              side: 'back',
              x: 45,
              y: 505,
              width: newWidth,
              height: newHeight,
            }),
            width: newWidth,
            height: newHeight,
            ...(fieldId === 'backFanCut' ? { fit: 'fill' } : {}),
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

  const handleNudgeSelected = (dx: number, dy: number) => {
    if (!selectedFieldId) return;
    const isMedia = 
      selectedFieldId === 'photoFront' || 
      selectedFieldId === 'photoFrontSecondary' || 
      selectedFieldId === 'frontBarcode' || 
      selectedFieldId === 'qrCodeBack' || 
      selectedFieldId === 'backFanCut' || 
      Boolean(config.media[selectedFieldId]);
    if (isMedia && (config.media[selectedFieldId] || DEFAULT_COORDINATES.media[selectedFieldId])) {
      const item = config.media[selectedFieldId] || DEFAULT_COORDINATES.media[selectedFieldId];
      handleMoveField(
        selectedFieldId,
        Math.max(0, Math.min(config.canvasWidth, item.x + dx)),
        Math.max(0, Math.min(config.canvasHeight, item.y + dy))
      );
    } else if (config.fields[selectedFieldId]) {
      const item = config.fields[selectedFieldId];
      handleMoveField(
        selectedFieldId,
        Math.max(0, Math.min(config.canvasWidth, item.x + dx)),
        Math.max(0, Math.min(config.canvasHeight, item.y + dy))
      );
    }
  };

  const handleCenterSelected = () => {
    if (!selectedFieldId) return;
    const isMedia = 
      selectedFieldId === 'photoFront' || 
      selectedFieldId === 'photoFrontSecondary' || 
      selectedFieldId === 'frontBarcode' || 
      selectedFieldId === 'qrCodeBack' || 
      selectedFieldId === 'backFanCut' || 
      Boolean(config.media[selectedFieldId]);
    const itemWidth = isMedia
      ? config.media[selectedFieldId]?.width || (selectedFieldId === 'backFanCut' ? 440 : 200)
      : config.fields[selectedFieldId]?.maxWidth || 250;
    const newX = Math.max(0, Math.round((config.canvasWidth - itemWidth) / 2));
    const currentY = isMedia
      ? (config.media[selectedFieldId]?.y ?? (selectedFieldId === 'backFanCut' ? 505 : 0))
      : config.fields[selectedFieldId]?.y || 0;
    handleMoveField(selectedFieldId, newX, currentY);
  };

  const handleResetCoordinates = () => {
    if (window.confirm('Reset all field positions and dimensions to the standard Ethiopian ID template defaults?')) {
      setConfig(DEFAULT_COORDINATES);
    }
  };

  const handleQuickExport = async () => {
    if (!frontExportRef.current || !backExportRef.current) {
      setIsExportModalOpen(true);
      return;
    }

    setIsGeneratingQuickPdf(true);
    setQuickStatus(`Rendering 300 DPI ID Card in ${appSettings.defaultExportFormat.toUpperCase()} format...`);

    try {
      if (appSettings.defaultExportFormat === 'jpeg') {
        await generateAndDownloadIdJpeg(
          frontExportRef.current,
          backExportRef.current,
          idData,
          config,
          {
            layout: appSettings.jpegLayout || 'combined_sheet',
            quality: appSettings.jpegQuality || 0.98,
            resolutionDpi: appSettings.resolutionDpi || 300,
            includeCropMarks: appSettings.includeCropMarks !== false,
            includeMetadataHeader: appSettings.includeMetadataHeader !== false,
          },
          (status) => setQuickStatus(status)
        );
      } else {
        await generateAndDownloadIdPdf(
          frontExportRef.current,
          backExportRef.current,
          idData,
          config,
          {
            format: appSettings.pdfFormat || 'a4_sheet',
            resolutionDpi: appSettings.resolutionDpi || 300,
            includeCropMarks: appSettings.includeCropMarks !== false,
            includeMetadataHeader: appSettings.includeMetadataHeader !== false,
          },
          (status) => setQuickStatus(status)
        );
      }

      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch (e) {
        // Ignored
      }
    } catch (err) {
      console.error('Quick generation failed:', err);
      setIsExportModalOpen(true);
    } finally {
      setIsGeneratingQuickPdf(false);
      setQuickStatus('');
    }
  };

  const handleLoadSample = (sample: 'ayele' | 'helen') => {
    if (sample === 'ayele') {
      setIdData(SAMPLE_ID_DATA);
    } else {
      setIdData(SAMPLE_FEMALE_DATA);
    }
  };

  const handleCleanAllText = () => {
    setIdData((prev) => sanitizeIdCardData(prev));
  };

  const handleSetFanTop = () => {
    setConfig((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        fan: {
          ...prev.fields.fan,
          x: 520,
          y: 115,
        },
      },
      media: {
        ...prev.media,
        frontBarcode: {
          ...prev.media.frontBarcode,
          x: 520,
          y: 72,
        },
      },
    }));
  };

  const handleSetFanBottom = () => {
    setConfig((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        fan: {
          ...prev.fields.fan,
          x: 485,
          y: 565,
        },
      },
      media: {
        ...prev.media,
        frontBarcode: {
          ...prev.media.frontBarcode,
          x: 485,
          y: 520,
        },
      },
    }));
  };

  const isFieldEditorOpen = (fieldId: string) => Boolean(openPositionFields[fieldId]);

  const toggleFieldPositionEditor = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    setOpenPositionFields((prev) => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  };

  const closeFieldPositionEditor = (fieldId: string) => {
    setOpenPositionFields((prev) => ({
      ...prev,
      [fieldId]: false,
    }));
  };

  const openAndFocusField = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    setOpenPositionFields((prev) => ({
      ...prev,
      [fieldId]: true,
    }));
    if (
      fieldId === 'backFanCut' ||
      fieldId === 'qrCodeBack' ||
      fieldId === 'serialNumber' ||
      fieldId === 'regionAmharic' ||
      fieldId === 'zoneSubcity' ||
      fieldId === 'woredaKebele' ||
      fieldId === 'woreda' ||
      fieldId === 'kebele' ||
      fieldId === 'fcn' ||
      fieldId === 'barcodeText'
    ) {
      if (viewMode === 'flip') setIsFlipped(true);
    } else {
      if (viewMode === 'flip') setIsFlipped(false);
    }
  };

  const isCurrentMedia = 
    selectedFieldId === 'photoFront' || 
    selectedFieldId === 'photoFrontSecondary' || 
    selectedFieldId === 'frontBarcode' || 
    selectedFieldId === 'qrCodeBack' || 
    selectedFieldId === 'backFanCut' || 
    Boolean(selectedFieldId && config.media[selectedFieldId]);
  const activeSelectedLabel = isCurrentMedia
    ? config.media[selectedFieldId!]?.label
    : config.fields[selectedFieldId!]?.label;
  const activeSelectedX = isCurrentMedia
    ? config.media[selectedFieldId!]?.x
    : config.fields[selectedFieldId!]?.x;
  const activeSelectedY = isCurrentMedia
    ? config.media[selectedFieldId!]?.y
    : config.fields[selectedFieldId!]?.y;

  return (
    <div className="space-y-6">
      {/* Hidden Full-Scale DOM nodes for quick high-res exports */}
      <div className="fixed -left-[9999px] -top-[9999px] pointer-events-none opacity-100">
        <div ref={frontExportRef} style={{ width: '1012px', height: '638px' }}>
          <CardRenderer
            side="front"
            data={idData}
            config={config}
            templateConfig={templateConfig}
            scale={1}
            isExporting={true}
          />
        </div>
        <div ref={backExportRef} style={{ width: '1012px', height: '638px' }}>
          <CardRenderer
            side="back"
            data={idData}
            config={config}
            templateConfig={templateConfig}
            scale={1}
            isExporting={true}
          />
        </div>
      </div>

      {/* Batch Processing Navigation Banner if queue exists */}
      {queue.length > 0 && onSelectQueueIndex && (
        <div className="bg-slate-900 text-white rounded-2xl p-3.5 px-4 sm:px-6 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">
                  Batch Queue ({activeQueueIndex + 1} of {queue.length})
                </span>
                <span className="bg-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.2 rounded-full">
                  {idData.fan}
                </span>
              </div>
              <p className="text-xs text-white font-bold truncate max-w-[280px] sm:max-w-md">
                {idData.fullNameEnglish} ({idData.fullNameAmharic})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={activeQueueIndex <= 0}
              onClick={() => onSelectQueueIndex(activeQueueIndex - 1)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous Card</span>
            </button>

            <button
              type="button"
              disabled={activeQueueIndex >= queue.length - 1}
              onClick={() => onSelectQueueIndex(activeQueueIndex + 1)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <span>Next Card</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {onOpenBatch && (
              <button
                type="button"
                onClick={onOpenBatch}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ml-1 flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Open Batch Queue ({queue.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Action & View Bar */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* View Modes */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'both'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setViewMode('flip')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'flip'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              3D Interactive Flip
            </button>
            <button
              onClick={() => setViewMode('front')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'front'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Front Only
            </button>
            <button
              onClick={() => setViewMode('back')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'back'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Back Only
            </button>
          </div>

          {/* Sample Presets & PDF Extractor Shortcut */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 border-l pl-3">
            {onOpenExtractor && (
              <button
                type="button"
                onClick={onOpenExtractor}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Upload Ethiopian ID / Fayda verification PDF or image to extract all fields"
              >
                <Upload className="w-3 h-3 text-emerald-400" />
                <span>Import PDF Slip</span>
              </button>
            )}
            <span className="font-medium ml-1">Presets:</span>
            <button
              onClick={() => handleLoadSample('ayele')}
              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md font-medium border border-emerald-200 transition-colors cursor-pointer"
            >
              Ayele Zekwos
            </button>
            <button
              onClick={() => handleLoadSample('helen')}
              className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-md font-medium border border-cyan-200 transition-colors cursor-pointer"
            >
              Helen Tadesse
            </button>
          </div>
        </div>

        {/* Quick Numbered Template Switcher, Zoom, Template Manager & Export Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Numbered Template Slot Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1.5 flex items-center gap-1">
              <Hash className="w-3 h-3 text-slate-400" />
              <span className="hidden sm:inline">Slot:</span>
            </span>
            <div className="flex items-center gap-1">
              {templatesList.map((t) => {
                const isAct = t.number === activeNum;
                return (
                  <button
                    key={t.number}
                    type="button"
                    onClick={() => {
                      handleSelectTemplateNumber(t.number);
                      try {
                        confetti({ particleCount: 25, spread: 45 });
                      } catch (e) {}
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      isAct
                        ? 'bg-emerald-600 text-white shadow-xs scale-105'
                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                    }`}
                    title={`${t.name} (Template #${t.number}) - Click to set as active`}
                  >
                    #{t.number}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(true)}
                className="px-1.5 py-1 text-slate-400 hover:text-emerald-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                title="Add or Manage Templates Saved by Number"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Apply Studio Positions to All Templates & Batch Button */}
          <button
            type="button"
            onClick={() => {
              if (onApplyStudioPositionsToAllTemplates) {
                onApplyStudioPositionsToAllTemplates();
              } else {
                const updated = applyCoordinatesToAllTemplates(config, templatesList);
                handleUpdateTemplates(updated);
              }
              setAppliedPositionsToast(true);
              setTimeout(() => setAppliedPositionsToast(false), 3500);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border ${
              appliedPositionsToast
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
            }`}
            title="Apply all the positions (coordinates) from ID Card Studio automatically to all numbered templates and to batch A4 prints"
          >
            <Sparkles className={`w-3.5 h-3.5 ${appliedPositionsToast ? 'text-white' : 'text-emerald-600'} shrink-0`} />
            <span className="hidden lg:inline">
              {appliedPositionsToast ? '✓ Positions Applied to All Templates & Batch!' : 'Apply Positions to All Templates & Batch'}
            </span>
            <span className="lg:hidden">
              {appliedPositionsToast ? '✓ Applied!' : 'Apply Positions'}
            </span>
          </button>

          {/* Insert / Manage Template Button */}
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border ${
              templateConfig.sourceType === 'custom' || templateConfig.frontImageUrl || templateConfig.backImageUrl
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800'
            }`}
            title="Upload custom empty background template or manage numbered templates"
          >
            <LayoutTemplate className="w-4 h-4 text-emerald-400" />
            <span>
              {templateConfig.sourceType === 'custom' || templateConfig.frontImageUrl || templateConfig.backImageUrl
                ? `Template #${activeNum} Active`
                : 'Insert My Template'}
            </span>
            {(templateConfig.frontImageUrl || templateConfig.backImageUrl) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setZoomScale((prev) => Math.max(0.45, prev - 0.08))}
              className="p-1 text-gray-600 hover:text-gray-900 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono font-medium text-gray-700">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((prev) => Math.min(1.0, prev + 0.08))}
              className="p-1 text-gray-600 hover:text-gray-900 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Font Selection & Import Modal */}
          <button
            onClick={() => setIsFontModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-50 text-gray-800 hover:text-emerald-900 border border-gray-300 hover:border-emerald-300 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Manage Card Typography: Select Nokia Pure Headline Bold or import custom fonts"
          >
            <Type className="w-4 h-4 text-emerald-600" />
            <span>Font</span>
            <span className="text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-bold truncate max-w-[100px]" title={templateConfig.cardFontFamily || 'Nokia Pure Headline Bold'}>
              {templateConfig.cardFontFamily?.replace(' Bold', '') || 'Nokia Pure'}
            </span>
          </button>

          {/* Persistent Export Settings */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="System Settings: Change default format (PDF/JPEG) once for all time"
          >
            <Sliders className="w-4 h-4 text-emerald-600" />
            <span>Settings</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
              {appSettings.defaultExportFormat}
            </span>
          </button>

          <button
            onClick={handleQuickExport}
            disabled={isGeneratingQuickPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-60"
            title={`Fast 300 DPI Export in your preferred format (${appSettings.defaultExportFormat.toUpperCase()})`}
          >
            {appSettings.defaultExportFormat === 'jpeg' ? (
              <ImageIcon className="w-4 h-4 text-emerald-700" />
            ) : (
              <Printer className="w-4 h-4 text-emerald-700" />
            )}
            {isGeneratingQuickPdf ? 'Rendering...' : `Quick ${appSettings.defaultExportFormat.toUpperCase()} Export`}
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>Export Studio (PDF / JPEG)</span>
          </button>
        </div>
      </div>

      {/* Main Stage Grid: Template Canvas + Editor */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visual Template Stage with Interactive Positioning Controls */}
        <div className="xl:col-span-8 space-y-3">
          {/* On-Template Position Customizer Toolbar */}
          <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" />
                Template Customizer:
              </span>

              {/* Drag Mode Toggle */}
              <button
                type="button"
                onClick={() => setIsInteractiveDragMode(!isInteractiveDragMode)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isInteractiveDragMode
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Click and drag any text or media on the card to reposition directly"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{isInteractiveDragMode ? 'Drag Mode ON' : 'Drag Mode OFF'}</span>
              </button>

              {/* Grid Toggle */}
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  showGrid
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Toggle calibration grid and crosshair center lines"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>

              {/* Coordinates Badges Toggle */}
              <button
                type="button"
                onClick={() => setShowCoordinateBadges(!showCoordinateBadges)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  showCoordinateBadges
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Display X/Y coordinate numbers on each field on the card"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Show X/Y Badges</span>
              </button>

              {/* Corner Marks Calibration Toggle */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !showCornerMarks;
                  setShowCornerMarks(nextVal);
                  setTemplateConfig((prev) => ({
                    ...prev,
                    showCornerMarks: nextVal,
                  }));
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  showCornerMarks
                    ? 'bg-emerald-500 text-slate-950 shadow-xs font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Toggle 4-corner L-calibration marks at (0,0), (1012,0), (0,638), (1012,638) for template position correction"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Corner Marks</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const existing = templatesList.find((t) => t.number === activeNum);
                  const updatedItem: NumberedTemplate = {
                    number: activeNum,
                    id: existing?.id || `template_slot_${activeNum}`,
                    name: existing?.name || `Template #${activeNum}`,
                    description: existing?.description || 'Saved with current studio configuration & positions',
                    themeColor: existing?.themeColor || '#059669',
                    badge: `Template #${activeNum}`,
                    frontImageUrl: templateConfig.frontImageUrl || existing?.frontImageUrl || '',
                    backImageUrl: templateConfig.backImageUrl || existing?.backImageUrl || '',
                    frontFileName: templateConfig.frontFileName || existing?.frontFileName || '',
                    backFileName: templateConfig.backFileName || existing?.backFileName || '',
                    config: { ...templateConfig },
                    coordinates: JSON.parse(JSON.stringify(config)),
                    createdAt: existing?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  const updatedList = saveTemplateByNumber(updatedItem);
                  handleUpdateTemplates(updatedList);
                  try {
                    confetti({ particleCount: 30, spread: 50 });
                  } catch (e) {}
                }}
                className="flex items-center gap-1.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded-lg border border-emerald-500 transition-colors cursor-pointer shadow-xs"
                title={`Save current field positions and settings permanently to Template #${activeNum}`}
              >
                <Save className="w-3 h-3 text-emerald-200" />
                <span>Save Positions to Template #{activeNum}</span>
              </button>

              <button
                type="button"
                onClick={handleResetCoordinates}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 transition-colors p-1"
                title="Reset all positions to standard defaults"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>

              {onOpenCalibrator && (
                <button
                  type="button"
                  onClick={onOpenCalibrator}
                  className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg border border-slate-700 transition-colors"
                >
                  <Sliders className="w-3 h-3 text-emerald-400" />
                  <span>Full Calibrator</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Element Nudge & Position Quick Controller */}
          {selectedFieldId && (
            <div className="bg-slate-950 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-inner flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <div>
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <span>Selected: {activeSelectedLabel || selectedFieldId}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                      X: {activeSelectedX}px | Y: {activeSelectedY}px
                    </span>
                  </div>
                </div>
              </div>

              {/* D-Pad Nudger Buttons */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(-1, 0)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Left 1px"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, -1)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Up 1px"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, 1)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Down 1px"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(1, 0)}
                    className="p-1 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors"
                    title="Nudge Right 1px"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 5px Step Nudge */}
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(-5, 0)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Left 5px"
                  >
                    -5X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(5, 0)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Right 5px"
                  >
                    +5X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, -5)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Up 5px"
                  >
                    -5Y
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeSelected(0, 5)}
                    className="px-1.5 py-0.5 hover:bg-emerald-600 rounded text-slate-400 hover:text-white"
                    title="Down 5px"
                  >
                    +5Y
                  </button>
                </div>

                {/* Center Horizontally */}
                <button
                  type="button"
                  onClick={handleCenterSelected}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 rounded-lg border border-emerald-800/80 transition-colors"
                  title="Center horizontally on template"
                >
                  <AlignHorizontalJustifyCenter className="w-3 h-3" />
                  <span>Center</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Adjustable Layers Bar: Smaller Photo, Front Barcode, Back FAN Cut */}
          <div className="bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Quick Layers (Adjust Size & Position):
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Smaller Photo */}
              <button
                type="button"
                onClick={() => openAndFocusField('photoFrontSecondary')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  selectedFieldId === 'photoFrontSecondary'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Select and adjust Secondary Portrait Photo on Front side"
              >
                <span>👤 Smaller Photo</span>
                <span className="text-[10px] font-mono text-emerald-300 bg-slate-950/80 px-1.5 py-0.5 rounded">
                  {config.media.photoFrontSecondary?.width ?? 145}×{config.media.photoFrontSecondary?.height ?? 175}
                </span>
              </button>

              {/* 2. Barcode */}
              <button
                type="button"
                onClick={() => openAndFocusField('frontBarcode')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  selectedFieldId === 'frontBarcode'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Select and adjust Front 1D Barcode on Front side"
              >
                <span>|||||| Front Barcode</span>
                <span className="text-[10px] font-mono text-emerald-300 bg-slate-950/80 px-1.5 py-0.5 rounded">
                  {config.media.frontBarcode?.width ?? 440}×{config.media.frontBarcode?.height ?? 40}
                </span>
              </button>

              {/* 3. Back FAN Cut */}
              <button
                type="button"
                onClick={() => openAndFocusField('backFanCut')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  selectedFieldId === 'backFanCut'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Select and adjust Back FAN Cutter Layer on Back side"
              >
                <span>✂️ Back FAN Cut</span>
                <span className="text-[10px] font-mono text-cyan-300 bg-slate-950/80 px-1.5 py-0.5 rounded">
                  {config.media.backFanCut?.width ?? 440}×{config.media.backFanCut?.height ?? 95}
                </span>
              </button>

              {/* 4. Instant Photo Background Remover */}
              <button
                type="button"
                onClick={handleMakeBothPhotosTransparent}
                disabled={isCuttingBothBg || (!idData.photoUrl && !idData.secondaryPhotoUrl)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/80 shadow-xs active:scale-95 disabled:opacity-50"
                title="Instantly remove background and make Photo 1 and Photo 2 transparent"
              >
                {isCuttingBothBg ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Scissors className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>Remove Photo Background</span>
              </button>


            </div>
          </div>

          {/* Canvas Viewport Stage */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center min-h-[540px] overflow-hidden relative">
            {/* Card Dimensions Badge */}
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700 text-[11px] text-slate-300 font-mono z-20">
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              <span>CR80 ISO-7810 | {config.canvasWidth} × {config.canvasHeight} px (300 DPI)</span>
            </div>

            {/* Flip Toggle Button for Flip View */}
            {viewMode === 'flip' && (
              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-full text-xs shadow-lg transition-all cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Flip to {isFlipped ? 'Front' : 'Back'}
                </button>
              </div>
            )}

            {/* Render Mode Content */}
            {viewMode === 'both' && (
              <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full py-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Front Side (Click/Drag to Customize Position)
                  </span>
                  <CardRenderer
                    side="front"
                    data={idData}
                    config={config}
                    templateConfig={templateConfig}
                    scale={zoomScale}
                    highlightField={selectedFieldId}
                    onSelectField={(fId) => setSelectedFieldId(fId)}
                    onMoveField={handleMoveField}
                    onResizeField={handleResizeField}
                    interactive={isInteractiveDragMode}
                    showGrid={showGrid}
                    showCoordinatesBadges={showCoordinateBadges}
                    showCornerMarks={showCornerMarks}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold text-slate-400 mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Back Side (Click/Drag to Customize Position)
                  </span>
                  <CardRenderer
                    side="back"
                    data={idData}
                    config={config}
                    templateConfig={templateConfig}
                    scale={zoomScale}
                    highlightField={selectedFieldId}
                    onSelectField={(fId) => setSelectedFieldId(fId)}
                    onMoveField={handleMoveField}
                    onResizeField={handleResizeField}
                    interactive={isInteractiveDragMode}
                    showGrid={showGrid}
                    showCoordinatesBadges={showCoordinateBadges}
                    showCornerMarks={showCornerMarks}
                  />
                </div>
              </div>
            )}

            {viewMode === 'flip' && (
              <div className="py-6 perspective-[1200px]">
                <div
                  className="transition-transform duration-700 ease-out cursor-pointer"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  {!isFlipped ? (
                    <CardRenderer
                      side="front"
                      data={idData}
                      config={config}
                      templateConfig={templateConfig}
                      scale={zoomScale * 1.15}
                      highlightField={selectedFieldId}
                      onSelectField={(fId) => setSelectedFieldId(fId)}
                      onMoveField={handleMoveField}
                      onResizeField={handleResizeField}
                      interactive={isInteractiveDragMode}
                      showGrid={showGrid}
                      showCoordinatesBadges={showCoordinateBadges}
                      showCornerMarks={showCornerMarks}
                    />
                  ) : (
                    <div style={{ transform: 'rotateY(180deg)' }}>
                      <CardRenderer
                        side="back"
                        data={idData}
                        config={config}
                        templateConfig={templateConfig}
                        scale={zoomScale * 1.15}
                        highlightField={selectedFieldId}
                        onSelectField={(fId) => setSelectedFieldId(fId)}
                        onMoveField={handleMoveField}
                        onResizeField={handleResizeField}
                        interactive={isInteractiveDragMode}
                        showGrid={showGrid}
                        showCoordinatesBadges={showCoordinateBadges}
                        showCornerMarks={showCornerMarks}
                      />
                    </div>
                  )}
                </div>
                <p className="text-center text-xs text-slate-400 mt-4">
                  💡 Click card to flip between Front and Back
                </p>
              </div>
            )}

            {viewMode === 'front' && (
              <div className="py-4">
                <CardRenderer
                  side="front"
                  data={idData}
                  config={config}
                  templateConfig={templateConfig}
                  scale={zoomScale * 1.2}
                  highlightField={selectedFieldId}
                  onSelectField={(fId) => setSelectedFieldId(fId)}
                  onMoveField={handleMoveField}
                  onResizeField={handleResizeField}
                  interactive={isInteractiveDragMode}
                  showGrid={showGrid}
                  showCoordinatesBadges={showCoordinateBadges}
                  showCornerMarks={showCornerMarks}
                />
              </div>
            )}

            {viewMode === 'back' && (
              <div className="py-4">
                <CardRenderer
                  side="back"
                  data={idData}
                  config={config}
                  templateConfig={templateConfig}
                  scale={zoomScale * 1.2}
                  highlightField={selectedFieldId}
                  onSelectField={(fId) => setSelectedFieldId(fId)}
                  onMoveField={handleMoveField}
                  onResizeField={handleResizeField}
                  interactive={isInteractiveDragMode}
                  showGrid={showGrid}
                  showCoordinatesBadges={showCoordinateBadges}
                  showCornerMarks={showCornerMarks}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Real-Time Field Form with Integrated Position Editors */}
        <div className="xl:col-span-4 space-y-5">
          {/* Quick PDF Export Banner */}
          <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 shadow-lg border border-emerald-800/40 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                  Ready to Print
                </span>
                <span className="text-xs text-slate-400 font-mono">300 DPI CR80</span>
              </div>
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                <FileDown className="w-4 h-4 text-emerald-400" />
                Download Final Processed PDF ID Card
              </h3>
              <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                Generates high-resolution front and back ID cards rasterized with your exact customized coordinate configurations.
              </p>

              <button
                onClick={() => setIsExportModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Generate & Download High-Res PDF
              </button>
            </div>
          </div>

          {/* Custom Template & Blank Background Controls Card */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-emerald-600" />
                  My Template & Backgrounds
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Insert your custom card blanks or pick security presets
                </p>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                templateConfig.sourceType === 'custom'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                {templateConfig.sourceType === 'custom' ? 'Custom Active' : 'Preset Mode'}
              </span>
            </div>

            {/* Quick Upload Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-emerald-200 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer transition-all text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setTemplateConfig((prev) => ({
                            ...prev,
                            sourceType: 'custom',
                            frontImageUrl: event.target!.result as string,
                            frontFileName: file.name,
                          }));
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <Upload className="w-4 h-4 text-emerald-600 mb-1" />
                <span className="text-xs font-bold text-emerald-950">
                  {templateConfig.frontImageUrl ? 'Replace Front' : 'Upload Front'}
                </span>
                <span className="text-[10px] text-emerald-700 font-mono">
                  {templateConfig.frontFileName || '1012×638 px'}
                </span>
              </label>

              <label className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-cyan-200 hover:border-cyan-500 bg-cyan-50/40 hover:bg-cyan-50 cursor-pointer transition-all text-center">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setTemplateConfig((prev) => ({
                            ...prev,
                            sourceType: 'custom',
                            backImageUrl: event.target!.result as string,
                            backFileName: file.name,
                          }));
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <Upload className="w-4 h-4 text-cyan-600 mb-1" />
                <span className="text-xs font-bold text-cyan-950">
                  {templateConfig.backImageUrl ? 'Replace Back' : 'Upload Back'}
                </span>
                <span className="text-[10px] text-cyan-700 font-mono">
                  {templateConfig.backFileName || '1012×638 px'}
                </span>
              </label>
            </div>

            {/* Saved Templates by Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Templates Saved by Number:</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold cursor-pointer"
                >
                  + Add / Manage
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {templatesList.map((t) => {
                  const isSelected = t.number === activeNum;
                  return (
                    <button
                      key={t.number}
                      type="button"
                      onClick={() => {
                        handleSelectTemplateNumber(t.number);
                        try {
                          confetti({ particleCount: 20, spread: 40 });
                        } catch (e) {}
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs ring-1 ring-emerald-500'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-[10px]">#{t.number}</span>
                        {isSelected && (
                          <span className="text-[8px] font-bold bg-white/20 px-1 py-0.2 rounded uppercase">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="truncate font-bold text-[11px] mt-0.5">{t.name}</div>
                      <div className="text-[9px] opacity-75 truncate">{t.badge || `Template #${t.number}`}</div>
                    </button>
                  );
                })}
              </div>

              {/* Quick Save Current Settings to Active Template */}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const existing = templatesList.find((t) => t.number === activeNum);
                    const updatedItem: NumberedTemplate = {
                      number: activeNum,
                      id: existing?.id || `template_slot_${activeNum}`,
                      name: existing?.name || `Template #${activeNum}`,
                      description: existing?.description || 'Custom card blank template',
                      themeColor: existing?.themeColor || '#059669',
                      badge: `Template #${activeNum}`,
                      frontImageUrl: templateConfig.frontImageUrl || existing?.frontImageUrl || '',
                      backImageUrl: templateConfig.backImageUrl || existing?.backImageUrl || '',
                      frontFileName: templateConfig.frontFileName || existing?.frontFileName || '',
                      backFileName: templateConfig.backFileName || existing?.backFileName || '',
                      config: { ...templateConfig },
                      coordinates: JSON.parse(JSON.stringify(config)),
                      createdAt: existing?.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    const updatedList = saveTemplateByNumber(updatedItem);
                    handleUpdateTemplates(updatedList);
                    try {
                      confetti({ particleCount: 30, spread: 50 });
                    } catch (e) {}
                  }}
                  className="w-full text-[11px] py-1.5 px-2 rounded-xl font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  title="Save current card studio settings and field positions permanently to this template slot"
                >
                  <Save className="w-3.5 h-3.5 text-amber-700" />
                  <span>Save Settings & Positions to Template #{activeNum}</span>
                </button>
              </div>
            </div>

            {/* Quick Layer Toggles */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setTemplateConfig((prev) => ({
                    ...prev,
                    showBuiltinGuilloche: !prev.showBuiltinGuilloche,
                  }))
                }
                className={`flex-1 text-[11px] py-1.5 px-2 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                  templateConfig.showBuiltinGuilloche
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-gray-100 text-gray-500 border-gray-200'
                }`}
              >
                Guilloche {templateConfig.showBuiltinGuilloche ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() =>
                  setTemplateConfig((prev) => ({
                    ...prev,
                    showFieldLabels: !prev.showFieldLabels,
                  }))
                }
                className={`flex-1 text-[11px] py-1.5 px-2 rounded-xl font-bold border transition-colors cursor-pointer text-center ${
                  templateConfig.showFieldLabels
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-gray-100 text-gray-500 border-gray-200'
                }`}
              >
                Labels {templateConfig.showFieldLabels ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Open Full Template Customizer Modal */}
            <button
              onClick={() => setIsTemplateModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Full Template & Layer Manager</span>
            </button>
          </div>

          {/* Card Typography & Custom Font Card */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Type className="w-4 h-4 text-emerald-600" />
                  Card Font & Typography
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Select "Nokia Pure Headline Bold" or import your font
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 truncate max-w-[130px]">
                {templateConfig.cardFontFamily || 'Nokia Pure Headline Bold'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div
                  className="text-xs font-bold text-slate-800 truncate"
                  style={{
                    fontFamily: templateConfig.cardFontFamily
                      ? `"${templateConfig.cardFontFamily}", "Noto Sans Ethiopic", sans-serif`
                      : '"Nokia Pure Headline Bold", "Noto Sans Ethiopic", sans-serif',
                  }}
                >
                  ABEBE BIKILA DEMISSIE
                </div>
                <div
                  className="text-[10px] text-slate-500 truncate"
                  style={{
                    fontFamily: templateConfig.cardFontFamily
                      ? `"${templateConfig.cardFontFamily}", "Noto Sans Ethiopic", sans-serif`
                      : '"Nokia Pure Headline Bold", "Noto Sans Ethiopic", sans-serif',
                  }}
                >
                  በቀለ ቶሎሳ ዱሬሶ (Active Font)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFontModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Change / Import</span>
              </button>
            </div>
          </div>

          {/* Form Fields Card with Integrated Position Editors */}
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  Live Data & Position Editor
                </h3>
                <p className="text-[11px] text-gray-500">
                  Edit data & click the <span className="font-semibold text-emerald-700">☩ Position</span> button on any field to calibrate
                </p>
              </div>
              <button
                type="button"
                onClick={handleCleanAllText}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                title="Strips reference prefixes like 'Full Name:', 'FAN:', 'DOB:', etc."
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Clean All Labels</span>
              </button>
            </div>

            {/* Success Toast for Background Transparency */}
            {cutoutSuccessToast && (
              <div className="mb-3 p-2.5 bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-md animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>{cutoutSuccessToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCutoutSuccessToast(null)}
                  className="text-emerald-200 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Direct 1-Click Action: Make Both Photos Transparent */}
            <div className="mb-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-2">
                    <span>Photo Background Transparency</span>
                    <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">Both Photos</span>
                  </h4>
                  <p className="text-[11px] text-emerald-800">
                    Strip solid backdrops to clean 100% transparent cutouts for both Photo 1 and Photo 2
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleMakeBothPhotosTransparent}
                disabled={isCuttingBothBg}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Automatically remove background and make both photos transparent"
              >
                {isCuttingBothBg ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Transparency...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>⚡ Make Both Photos Transparent</span>
                  </>
                )}
              </button>
            </div>

            {/* Photo Customization: Dual Photos (Primary Photo & Second Photo on Bottom Right) */}
            <div className="mb-5 space-y-3">
              {/* 1. Primary Photo Container (Photo 1 - Left) */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-16 h-20 bg-slate-900 rounded-lg overflow-hidden border border-gray-300 shrink-0 relative"
                    style={{
                      backgroundImage: 'radial-gradient(#475569 1px, transparent 1px), radial-gradient(#475569 1px, #0f172a 1px)',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 4px 4px',
                    }}
                  >
                    <img
                      src={idData.photoUrl}
                      alt="Primary Portrait Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <span>Photo 1 (Left Portrait)</span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">Primary</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleFieldPositionEditor('photoFront')}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                          isFieldEditorOpen('photoFront')
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-emerald-100/90 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        <Sliders className="w-3 h-3" />
                        <span>X:{config.media.photoFront.x} Y:{config.media.photoFront.y}</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px] text-gray-500">
                      <span>Card Size: {config.media.photoFront.width} × {config.media.photoFront.height} px</span>
                      {photoDimensions && (
                        <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          photoDimensions.height >= 900
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                          {photoDimensions.height >= 900 ? '✨ Ultra-HD Photo' : '⚠️ Resolution'}: {photoDimensions.width} × {photoDimensions.height} px (300 DPI)
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5 text-gray-500" />
                        Replace Photo 1
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>



                      <button
                        type="button"
                        onClick={() => handleMakeSinglePhotoTransparent('primary')}
                        disabled={isCuttingBothBg}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        title="Remove background and make Photo 1 transparent"
                      >
                        <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Cutout Photo 1 (Transparent)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCropTarget('primary');
                          setIsCropModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Carefully crop, pan, rotate, and zoom portrait"
                      >
                        <CropIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Crop & Center</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPhotoAdjustTarget('primary');
                          setIsPhotoAdjustModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Remove background, adjust brightness, contrast, lighting and color"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>☀️ Light & Remove BG</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Position Editor for Photo 1 */}
                {isFieldEditorOpen('photoFront') && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <FieldPositionEditor
                      fieldId="photoFront"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => closeFieldPositionEditor('photoFront')}
                    />
                  </div>
                )}
              </div>

              {/* 2. Second Photo Container (Photo 2 - Bottom Right Security Portrait) */}
              <div className="bg-gradient-to-r from-emerald-50/60 to-cyan-50/60 border border-emerald-200/80 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Photo 2 (Bottom Right Security Photo)
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showSecondaryPhoto !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showSecondaryPhoto: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                    <span>{templateConfig.showSecondaryPhoto !== false ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                {templateConfig.showSecondaryPhoto !== false && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-14 h-16 bg-slate-900 rounded-lg overflow-hidden border border-emerald-300 shrink-0 shadow-xs relative"
                        style={{
                          backgroundImage: 'radial-gradient(#475569 1px, transparent 1px), radial-gradient(#475569 1px, #0f172a 1px)',
                          backgroundSize: '8px 8px',
                          backgroundPosition: '0 0, 4px 4px',
                        }}
                      >
                        <img
                          src={idData.photoUrl || idData.secondaryPhotoUrl}
                          alt="Second Portrait Preview (Copy of Main Photo)"
                          className={`w-full h-full object-cover ${
                            templateConfig.secondaryPhotoStyle === 'ghost'
                              ? 'grayscale contrast-125 opacity-85'
                              : templateConfig.secondaryPhotoStyle === 'grayscale'
                              ? 'grayscale contrast-120'
                              : ''
                          }`}
                        />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-gray-700">
                            Security Style
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleFieldPositionEditor('photoFrontSecondary')}
                            className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                              isFieldEditorOpen('photoFrontSecondary')
                                ? 'bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-500/50'
                                : 'bg-emerald-200/80 text-emerald-900 hover:bg-emerald-300'
                            }`}
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Adjust Size & Position</span>
                            <span className="font-mono text-[9px] bg-emerald-900/20 px-1 py-0.2 rounded">
                              {config.media.photoFrontSecondary?.width ?? 145}×{config.media.photoFrontSecondary?.height ?? 175}
                            </span>
                          </button>
                        </div>

                        {/* Style Chips */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'ghost', label: 'Ghost Watermark' },
                            { id: 'grayscale', label: 'Grayscale Laser' },
                            { id: 'goldBorder', label: 'Gold Hologram' },
                            { id: 'color', label: 'Full Color' },
                          ].map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() =>
                                setTemplateConfig((prev) => ({
                                  ...prev,
                                  secondaryPhotoStyle: st.id as any,
                                }))
                              }
                              className={`text-[10px] font-bold py-1 px-1.5 rounded-lg border transition-all cursor-pointer truncate ${
                                (templateConfig.secondaryPhotoStyle || 'ghost') === st.id
                                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <label className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-[10px] font-semibold rounded-md shadow-2xs cursor-pointer transition-colors">
                            <Upload className="w-3 h-3 text-gray-500" />
                            Upload 2nd Photo
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSecondaryPhotoUpload}
                              className="hidden"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => handleMakeSinglePhotoTransparent('secondary')}
                            disabled={isCuttingBothBg}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                            title="Strip background of Photo 2 to transparent"
                          >
                            <Scissors className="w-3 h-3 text-emerald-600" />
                            <span>Make Transparent</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setCropTarget('secondary');
                              setIsCropModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-md shadow-2xs transition-all cursor-pointer"
                            title="Crop and position Photo 2"
                          >
                            <CropIcon className="w-3 h-3 text-emerald-600" />
                            <span>Crop</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPhotoAdjustTarget('secondary');
                              setIsPhotoAdjustModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-md shadow-2xs transition-all cursor-pointer"
                            title="Adjust lighting or remove background for Photo 2"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>☀️ Light / Cutout</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIdData((prev) => ({ ...prev, secondaryPhotoUrl: prev.photoUrl }));
                              setCutoutSuccessToast('Photo 2 synchronized: exact direct copy of Photo 1 (no second layer)!');
                              setTimeout(() => setCutoutSuccessToast(null), 3000);
                            }}
                            className="text-[10px] text-emerald-800 hover:text-emerald-950 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                            title="Direct copy from Photo 1 (no second layer)"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Copy from Photo 1</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inline Position Editor for Photo 2 */}
                    {isFieldEditorOpen('photoFrontSecondary') && (
                      <div className="mt-2 pt-2 border-t border-emerald-200/80">
                        <FieldPositionEditor
                          fieldId="photoFrontSecondary"
                          config={config}
                          setConfig={setConfig}
                          onClose={() => closeFieldPositionEditor('photoFrontSecondary')}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Front FAN & Barcode Cut Section */}
              <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      ✂️ Front Barcode & FAN Cut Controls
                    </span>
                  </div>
                  {/* Quick Cut All / Restore All */}
                  <button
                    type="button"
                    onClick={() => {
                      const allOff = !templateConfig.showFrontBarcode && !templateConfig.showFrontFan;
                      setTemplateConfig((prev) => ({
                        ...prev,
                        showFrontBarcode: allOff,
                        showFrontFan: allOff,
                        showFanContainerBox: allOff,
                      }));
                    }}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                      !templateConfig.showFrontBarcode && !templateConfig.showFrontFan
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-xs'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {!templateConfig.showFrontBarcode && !templateConfig.showFrontFan ? '↺ Restore All' : '✂️ Cut Barcode & FAN'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Toggle Barcode on Front FAN */}
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
                    <span className="font-semibold text-slate-200 text-[11px]">Front 1D Barcode</span>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFrontBarcode !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFrontBarcode: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle Front FAN Number */}
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer">
                    <span className="font-semibold text-slate-200 text-[11px]">Front FAN Digits</span>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFrontFan !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFrontFan: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>

                  {/* Toggle FAN Box Background */}
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer sm:col-span-2">
                    <span className="font-semibold text-slate-200 text-[11px]">FAN White Pill Container</span>
                    <input
                      type="checkbox"
                      checked={Boolean(templateConfig.showFanContainerBox !== false)}
                      onChange={(e) =>
                        setTemplateConfig((prev) => ({
                          ...prev,
                          showFanContainerBox: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Barcode Position & Size Adjuster */}
                <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-200 font-bold">1D Barcode Position & Size:</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      X:{config.media.frontBarcode?.x ?? 485} Y:{config.media.frontBarcode?.y ?? 520} | W:{config.media.frontBarcode?.width ?? 440} H:{config.media.frontBarcode?.height ?? 40}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('frontBarcode')}
                    className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      isFieldEditorOpen('frontBarcode')
                        ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400/50'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <Sliders className="w-3 h-3 text-emerald-400" />
                    <span>{isFieldEditorOpen('frontBarcode') ? 'Hide Barcode Controls' : 'Adjust Barcode Size & Position'}</span>
                  </button>
                </div>

                {isFieldEditorOpen('frontBarcode') && (
                  <div className="pt-2 border-t border-slate-800">
                    <FieldPositionEditor
                      fieldId="frontBarcode"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => closeFieldPositionEditor('frontBarcode')}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Form Fields List */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {/* 1. Amharic Name */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Full Name in Amharic (ሙሉ ስም)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('fullNameAmharic')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      isFieldEditorOpen('fullNameAmharic')
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.fullNameAmharic.x} Y:{config.fields.fullNameAmharic.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.fullNameAmharic || ''}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, fullNameAmharic: sanitizeAmharicName(e.target.value) }))
                  }
                  onFocus={() => setSelectedFieldId('fullNameAmharic')}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="አየለ ዘክዎስ ዳካ"
                />
                {isFieldEditorOpen('fullNameAmharic') && (
                  <FieldPositionEditor
                    fieldId="fullNameAmharic"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('fullNameAmharic')}
                  />
                )}
              </div>

              {/* 2. English Name */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Full Name in English
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('fullNameEnglish')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      isFieldEditorOpen('fullNameEnglish')
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.fullNameEnglish.x} Y:{config.fields.fullNameEnglish.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.fullNameEnglish || ''}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, fullNameEnglish: sanitizeEnglishName(e.target.value) }))
                  }
                  onFocus={() => setSelectedFieldId('fullNameEnglish')}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="Ayele Zekwos Daka"
                />
                {isFieldEditorOpen('fullNameEnglish') && (
                  <FieldPositionEditor
                    fieldId="fullNameEnglish"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('fullNameEnglish')}
                  />
                )}
              </div>

              {/* 3. FAN Number */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-700">
                      Fayda FAN (16 digits)
                    </label>
                    <div className="flex items-center gap-1 bg-gray-200/80 p-0.5 rounded-lg text-[9px] font-bold">
                      <button
                        type="button"
                        onClick={handleSetFanTop}
                        className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          config.fields.fan.y < 200
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="Position FAN and Barcode at the top header"
                      >
                        Top Header
                      </button>
                      <button
                        type="button"
                        onClick={handleSetFanBottom}
                        className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          config.fields.fan.y >= 200
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                        title="Position FAN and Barcode at the bottom footer"
                      >
                        Bottom Footer
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('fan')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      isFieldEditorOpen('fan')
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.fan.x} Y:{config.fields.fan.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.fan || ''}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, fan: e.target.value }))
                  }
                  onFocus={() => setSelectedFieldId('fan')}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="4195 0436 7069 2582"
                />
                {isFieldEditorOpen('fan') && (
                  <FieldPositionEditor
                    fieldId="fan"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('fan')}
                  />
                )}
              </div>

              {/* 3.1 1D Barcode Quality Studio & Clarity Mode */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Barcode className="w-4 h-4 text-violet-600" />
                    <label className="text-xs font-bold text-gray-800">
                      Front 1D Barcode • የባርኮድ ጥራት
                    </label>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      idData.barcodeImageUrl
                        ? 'bg-emerald-100 text-emerald-800'
                        : idData.barcodeRenderMode === 'vector'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-violet-100 text-violet-800'
                    }`}>
                      {idData.barcodeImageUrl ? '✂️ Exact Cutted' : idData.barcodeRenderMode === 'vector' ? 'Code 128 Vector' : 'Slip Barcode'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsBarcodeCropModalOpen(true)}
                      className="flex items-center gap-1 text-[10px] font-bold bg-violet-600 hover:bg-violet-700 text-white px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-xs"
                      title="Open 1D Barcode Quality Studio to crop or enhance clarity"
                    >
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>Barcode Studio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('frontBarcode')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer ${
                        isFieldEditorOpen('frontBarcode')
                          ? 'bg-violet-700 text-white shadow-xs'
                          : 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.media.frontBarcode?.x ?? 485}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Mode Switcher */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setIdData((prev) => ({ ...prev, barcodeRenderMode: 'extracted' }))}
                    className={`py-1.5 px-2 rounded-xl text-left border text-[10px] font-medium transition-all cursor-pointer ${
                      idData.barcodeRenderMode !== 'vector'
                        ? 'bg-violet-50 border-violet-400 text-violet-950 font-bold shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    ✂️ Exact Cutted (የተቆረጠ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdData((prev) => ({ ...prev, barcodeRenderMode: 'vector' }))}
                    className={`py-1.5 px-2 rounded-xl text-left border text-[10px] font-medium transition-all cursor-pointer ${
                      idData.barcodeRenderMode === 'vector'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    ✨ Code 128 Vector
                  </button>
                </div>

                {/* Barcode Dimensions & Coordinates */}
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    Barcode Dimensions: {config.media.frontBarcode?.width ?? 440} × {config.media.frontBarcode?.height ?? 40} px
                  </span>
                  <span className="font-mono text-gray-600">
                    X:{config.media.frontBarcode?.x ?? 485} Y:{config.media.frontBarcode?.y ?? 520}
                  </span>
                </div>

                {/* Quick Stretch & Contract Control Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-50/90 rounded-xl border border-emerald-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <span>↔ Stretch Width:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[
                      { label: '360px', w: 360 },
                      { label: '440px', w: 440 },
                      { label: '520px', w: 520 },
                      { label: '600px', w: 600 },
                    ].map((btn) => (
                      <button
                        key={btn.w}
                        type="button"
                        onClick={() => handleResizeField('frontBarcode', btn.w, config.media.frontBarcode?.height ?? 40)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-all ${
                          (config.media.frontBarcode?.width ?? 440) === btn.w
                            ? 'bg-emerald-700 text-white shadow-xs ring-1 ring-emerald-500'
                            : 'bg-white text-emerald-800 border border-emerald-300/80 hover:bg-emerald-100'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleResizeField('frontBarcode', Math.min(850, (config.media.frontBarcode?.width ?? 440) + 20), config.media.frontBarcode?.height ?? 40)}
                      className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer transition-colors shadow-2xs"
                      title="Stretch Width +20px"
                    >
                      +20
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeField('frontBarcode', Math.max(100, (config.media.frontBarcode?.width ?? 440) - 20), config.media.frontBarcode?.height ?? 40)}
                      className="px-2 py-1 text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md cursor-pointer transition-colors shadow-2xs"
                      title="Contract Width -20px"
                    >
                      -20
                    </button>
                  </div>
                </div>

                {isFieldEditorOpen('frontBarcode') && (
                  <FieldPositionEditor
                    fieldId="frontBarcode"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('frontBarcode')}
                  />
                )}
              </div>

              {/* 4. Date of Birth & Sex */}
              <div className="space-y-3">
                {/* Date of Birth (GC & Ethiopian) */}
                <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-800">Date of Birth (የትውልድ ቀን)</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded">GC & EC</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('dateOfBirth')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        isFieldEditorOpen('dateOfBirth')
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.dateOfBirth.x} Y:{config.fields.dateOfBirth.y}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Ethiopian (E.C. / ዓ.ም)</label>
                      <input
                        type="text"
                        value={idData.dateOfBirthEth || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const dual = parseDualDate(val);
                          if (dual.eth && dual.gc) {
                            setIdData((prev) => ({
                              ...prev,
                              dateOfBirthEth: dual.eth,
                              dateOfBirth: dual.gc,
                            }));
                          } else {
                            const gc = convertEthToGc(val);
                            setIdData((prev) => ({
                              ...prev,
                              dateOfBirthEth: val,
                              dateOfBirth: gc || prev.dateOfBirth,
                            }));
                          }
                        }}
                        onFocus={() => setSelectedFieldId('dateOfBirth')}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                        placeholder="06/09/1984"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Gregorian (G.C.)</label>
                      <input
                        type="text"
                        value={idData.dateOfBirth || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const dual = parseDualDate(val);
                          if (dual.eth && dual.gc) {
                            setIdData((prev) => ({
                              ...prev,
                              dateOfBirthEth: dual.eth,
                              dateOfBirth: dual.gc,
                            }));
                          } else {
                            const eth = convertGcToEth(val);
                            setIdData((prev) => ({
                              ...prev,
                              dateOfBirth: val,
                              dateOfBirthEth: eth || prev.dateOfBirthEth,
                            }));
                          }
                        }}
                        onFocus={() => setSelectedFieldId('dateOfBirth')}
                        onBlur={(e) => {
                          const formatted = formatGcyyyyMmDd(e.target.value);
                          if (formatted && formatted !== e.target.value) {
                            setIdData((prev) => ({ ...prev, dateOfBirth: formatted }));
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                        placeholder="1992/05/14"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-500 bg-white/80 px-2 py-1 rounded-lg border border-gray-200/60 flex items-center justify-between">
                    <span>Card Format (E.C. | G.C.):</span>
                    <span className="font-mono font-bold text-gray-800 truncate">
                      {formatCardDualDate(idData.dateOfBirth, idData.dateOfBirthEth, 'eth_with_gc', { gcMonthName: false })}
                    </span>
                  </div>

                  {isFieldEditorOpen('dateOfBirth') && (
                    <FieldPositionEditor
                      fieldId="dateOfBirth"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => closeFieldPositionEditor('dateOfBirth')}
                    />
                  )}
                </div>

                {/* Sex */}
                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Sex (ፆታ)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('sex')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        isFieldEditorOpen('sex')
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.sex.x} Y:{config.fields.sex.y}</span>
                    </button>
                  </div>
                  <select
                    value={idData.sex || 'Male'}
                    onChange={(e) =>
                      setIdData((prev) => ({
                        ...prev,
                        sex: e.target.value as IdCardData['sex'],
                      }))
                    }
                    onFocus={() => setSelectedFieldId('sex')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden font-semibold"
                  >
                    <option value="Male">Male / ወንድ</option>
                    <option value="Female">Female / ሴት</option>
                  </select>

                  {isFieldEditorOpen('sex') && (
                    <FieldPositionEditor
                      fieldId="sex"
                      config={config}
                      setConfig={setConfig}
                      onClose={() => closeFieldPositionEditor('sex')}
                    />
                  )}
                </div>
              </div>

              {/* 5. Issue Date (የተሰጠበት ቀን - Both Ethiopian & GC) */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-800">Date of Issue (የተሰጠበት ቀን)</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded">GC & EC</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('dateOfIssueFront')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        isFieldEditorOpen('dateOfIssueFront')
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.dateOfIssueFront?.x ?? 52} Y:{config.fields.dateOfIssueFront?.y ?? 330}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Gregorian (G.C.)</label>
                    <input
                      type="text"
                      value={idData.dateOfIssue || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const eth = convertGcToEth(val);
                        const exp = calculateExpiryFromIssue(val, eth || idData.dateOfIssueEth);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfIssue: val,
                          dateOfIssueEth: eth || prev.dateOfIssueEth,
                          ...(exp ? { dateOfExpiry: exp.expiryGc, dateOfExpiryEth: exp.expiryEth } : {}),
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfIssueFront')}
                      onBlur={(e) => {
                        const formatted = formatGcWith3LetterMonth(e.target.value);
                        if (formatted && formatted !== e.target.value) {
                          const eth = convertGcToEth(formatted) || idData.dateOfIssueEth;
                          const exp = calculateExpiryFromIssue(formatted, eth);
                          setIdData((prev) => ({
                            ...prev,
                            dateOfIssue: formatted,
                            dateOfIssueEth: eth,
                            ...(exp ? { dateOfExpiry: exp.expiryGc, dateOfExpiryEth: exp.expiryEth } : {}),
                          }));
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder={getTodayIssueDates().issueDateGc}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Ethiopian (E.C. / ዓ.ም)</label>
                    <input
                      type="text"
                      value={idData.dateOfIssueEth || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const gc = convertEthToGc(val);
                        const exp = calculateExpiryFromIssue(gc || idData.dateOfIssue, val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfIssueEth: val,
                          dateOfIssue: gc || prev.dateOfIssue,
                          ...(exp ? { dateOfExpiry: exp.expiryGc, dateOfExpiryEth: exp.expiryEth } : {}),
                        }));
                      }}
                      onBlur={(e) => {
                        const val = e.target.value;
                        const gc = convertEthToGc(val) || idData.dateOfIssue;
                        const exp = calculateExpiryFromIssue(gc, val);
                        if (exp) {
                          setIdData((prev) => ({
                            ...prev,
                            dateOfExpiry: exp.expiryGc,
                            dateOfExpiryEth: exp.expiryEth,
                          }));
                        }
                      }}
                      onFocus={() => setSelectedFieldId('dateOfIssueFront')}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder={getTodayIssueDates().issueDateEth}
                    />
                  </div>
                </div>

                {/* Today Status Badge & Card Display */}
                <div className="space-y-1">
                  <div className="text-[10px] text-gray-500 bg-white/80 px-2 py-1 rounded-lg border border-gray-200/60 flex items-center justify-between">
                    <span>Card Display:</span>
                    <span className="font-mono font-bold text-gray-800 truncate">
                      {formatCardDualDate(idData.dateOfIssue, idData.dateOfIssueEth, 'eth_with_gc', { gcMonthName: true })}
                    </span>
                  </div>

                  <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5 font-medium">
                    <span className="font-bold text-emerald-600">✓</span>
                    <span>Issued date automatically updated to today&apos;s calendar ({getTodayIssueDates().issueDateGc} G.C. / {getTodayIssueDates().issueDateEth} E.C.)</span>
                  </div>
                </div>

                {isFieldEditorOpen('dateOfIssueFront') && (
                  <FieldPositionEditor
                    fieldId="dateOfIssueFront"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('dateOfIssueFront')}
                  />
                )}
              </div>

              {/* 6. Expiry Date (የሚያበቃበት ቀን) */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-800">Date of Expiry (የሚያበቃበት ቀን)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const exp = calculateExpiryFromIssue(idData.dateOfIssue || getTodayIssueDates().issueDateGc);
                        if (exp) {
                          setIdData((prev) => ({
                            ...prev,
                            dateOfExpiry: exp.expiryGc,
                            dateOfExpiryEth: exp.expiryEth,
                          }));
                        }
                      }}
                      className="text-[9px] font-bold px-2 py-0.5 bg-cyan-100 text-cyan-900 rounded hover:bg-cyan-200 transition-colors cursor-pointer"
                      title="Set 8 years validity from Issue Date"
                    >
                      +8 Years
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('dateOfExpiry')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        isFieldEditorOpen('dateOfExpiry')
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.dateOfExpiry.x} Y:{config.fields.dateOfExpiry.y}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Ethiopian (E.C. / ዓ.ም)</label>
                    <input
                      type="text"
                      value={idData.dateOfExpiryEth || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const gc = convertEthToGc(val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfExpiryEth: val,
                          dateOfExpiry: gc || prev.dateOfExpiry,
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfExpiry')}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder={getTodayIssueDates().expiryDateEth}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-0.5">Gregorian (G.C.)</label>
                    <input
                      type="text"
                      value={idData.dateOfExpiry || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const eth = convertGcToEth(val);
                        setIdData((prev) => ({
                          ...prev,
                          dateOfExpiry: val,
                          dateOfExpiryEth: eth || prev.dateOfExpiryEth,
                        }));
                      }}
                      onFocus={() => setSelectedFieldId('dateOfExpiry')}
                      onBlur={(e) => {
                        const formatted = formatGcWith3LetterMonth(e.target.value);
                        if (formatted && formatted !== e.target.value) {
                          setIdData((prev) => ({ ...prev, dateOfExpiry: formatted }));
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                      placeholder={getTodayIssueDates().expiryDateGc}
                    />
                  </div>
                </div>

                {/* Expiry Status & Dual Format Display */}
                <div className="space-y-1">
                  <div className="text-[10px] text-gray-500 bg-white/80 px-2 py-1 rounded-lg border border-gray-200/60 flex items-center justify-between">
                    <span>Card Format (E.C. | G.C.):</span>
                    <span className="font-mono font-bold text-gray-800 truncate">
                      {formatCardDualDate(idData.dateOfExpiry, idData.dateOfExpiryEth, 'eth_with_gc', { gcMonthName: true })}
                    </span>
                  </div>

                  <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5 font-medium">
                    <span className="font-bold text-emerald-600">✓</span>
                    <span>Expiry date starts exactly from issued date (+8 years)</span>
                  </div>
                </div>

                {isFieldEditorOpen('dateOfExpiry') && (
                  <FieldPositionEditor
                    fieldId="dateOfExpiry"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('dateOfExpiry')}
                  />
                )}
              </div>

              {/* 6. Phone Number (Back Side) */}
              <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    Phone Number (ስልክ ቁጥር)
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('phoneNumber')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      isFieldEditorOpen('phoneNumber')
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.fields.phoneNumber.x} Y:{config.fields.phoneNumber.y}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={idData.phoneNumber || ''}
                  onChange={(e) =>
                    setIdData((prev) => ({ ...prev, phoneNumber: e.target.value }))
                  }
                  onFocus={() => setSelectedFieldId('phoneNumber')}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                  placeholder="0928574836"
                />
                {isFieldEditorOpen('phoneNumber') && (
                  <FieldPositionEditor
                    fieldId="phoneNumber"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('phoneNumber')}
                  />
                )}
              </div>

              {/* 7. Region, Zone & Woreda */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Region (ክልል)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('regionAmharic')}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        isFieldEditorOpen('regionAmharic')
                          ? 'bg-emerald-700 text-white'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      ☩ Position
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idData.regionAmharic || ''}
                    onChange={(e) =>
                      setIdData((prev) => ({ ...prev, regionAmharic: e.target.value }))
                    }
                    onFocus={() => setSelectedFieldId('regionAmharic')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden"
                    placeholder="ሲዳማ"
                  />
                </div>

                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Zone / Subcity (ዞን)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('zoneSubcity')}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        isFieldEditorOpen('zoneSubcity')
                          ? 'bg-emerald-700 text-white'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      ☩ Position
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idData.zoneAmharic || ''}
                    onChange={(e) =>
                      setIdData((prev) => ({ ...prev, zoneAmharic: e.target.value }))
                    }
                    onFocus={() => setSelectedFieldId('zoneSubcity')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden"
                    placeholder="አርበጎና"
                  />
                </div>

                <div className="bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">
                      Woreda (ወረዳ)
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('woredaKebele')}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        isFieldEditorOpen('woredaKebele')
                          ? 'bg-emerald-700 text-white'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      ☩ Position
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idData.woredaAmharic || ''}
                    onChange={(e) =>
                      setIdData((prev) => ({ ...prev, woredaAmharic: e.target.value }))
                    }
                    onFocus={() => setSelectedFieldId('woredaKebele')}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-hidden"
                    placeholder="ወረዳ 01"
                  />
                </div>
              </div>

              {/* Expanded Region/Zone/Woreda Editor */}
              {isFieldEditorOpen('regionAmharic') && (
                <FieldPositionEditor
                  fieldId="regionAmharic"
                  config={config}
                  setConfig={setConfig}
                  onClose={() => closeFieldPositionEditor('regionAmharic')}
                />
              )}
              {isFieldEditorOpen('zoneSubcity') && (
                <FieldPositionEditor
                  fieldId="zoneSubcity"
                  config={config}
                  setConfig={setConfig}
                  onClose={() => closeFieldPositionEditor('zoneSubcity')}
                />
              )}
              {isFieldEditorOpen('woredaKebele') && (
                <FieldPositionEditor
                  fieldId="woredaKebele"
                  config={config}
                  setConfig={setConfig}
                  onClose={() => closeFieldPositionEditor('woredaKebele')}
                />
              )}

              {/* 8. Back FAN Cut Layer (የተቆረጠ ጎን ሌየር) Adjuster */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-gray-800">
                      ✂️ Back FAN Cut Layer (የተቆረጠ ጎን ሌየር)
                    </label>
                    {idData.finLayerCropUrl ? (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                        Slip Cutout Active
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-200 text-slate-700 font-semibold px-1.5 py-0.5 rounded">
                        Vector FIN Box
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('backFanCut')}
                    className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      isFieldEditorOpen('backFanCut')
                        ? 'bg-emerald-700 text-white shadow-xs ring-2 ring-emerald-500/50'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>{isFieldEditorOpen('backFanCut') ? 'Hide Cut Controls' : 'Adjust Cut Size & Position'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    Layer Dimensions: {config.media.backFanCut?.width ?? 440} × {config.media.backFanCut?.height ?? 95} px
                  </span>
                  <span className="font-mono text-gray-600">
                    X:{config.media.backFanCut?.x ?? 45} Y:{config.media.backFanCut?.y ?? 505}
                  </span>
                </div>

                {/* Quick Stretch Control Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-50/90 rounded-xl border border-emerald-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <span>↔ Stretch Width:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[
                      { label: '440px', w: 440 },
                      { label: '520px', w: 520 },
                      { label: '600px', w: 600 },
                      { label: '680px', w: 680 },
                    ].map((btn) => (
                      <button
                        key={btn.w}
                        type="button"
                        onClick={() => handleResizeField('backFanCut', btn.w, config.media.backFanCut?.height ?? 95)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-all ${
                          (config.media.backFanCut?.width ?? 440) === btn.w
                            ? 'bg-emerald-700 text-white shadow-xs ring-1 ring-emerald-500'
                            : 'bg-white text-emerald-800 border border-emerald-300/80 hover:bg-emerald-100'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleResizeField('backFanCut', Math.min(850, (config.media.backFanCut?.width ?? 440) + 20), config.media.backFanCut?.height ?? 95)}
                      className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md cursor-pointer transition-colors shadow-2xs"
                      title="Stretch Width +20px"
                    >
                      +20
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResizeField('backFanCut', Math.max(100, (config.media.backFanCut?.width ?? 440) - 20), config.media.backFanCut?.height ?? 95)}
                      className="px-2 py-1 text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md cursor-pointer transition-colors shadow-2xs"
                      title="Shrink Width -20px"
                    >
                      -20
                    </button>
                  </div>
                </div>

                {/* Back FAN Field Cutter */}
                <div className="p-3 bg-pink-50/70 rounded-xl border border-pink-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-pink-600" />
                      <span className="text-xs font-bold text-pink-950">Back FAN Field Cutter (የተቆረጠ የኋላ ፋን)</span>
                    </div>
                    <span className="text-[10px] font-semibold text-pink-700 bg-pink-100 px-2 py-0.5 rounded-full">
                      {idData.useFinLayerCrop !== false && idData.finLayerCropUrl ? 'Exact Cut Active' : 'Text Active'}
                    </span>
                  </div>

                  {/* Active Display Mode Switch */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-pink-200">
                    <button
                      type="button"
                      onClick={() => setIdData((prev) => ({ ...prev, useFinLayerCrop: true }))}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        idData.useFinLayerCrop !== false && idData.finLayerCropUrl
                          ? 'bg-pink-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-pink-50'
                      }`}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>✂️ Exact Slip Cut</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIdData((prev) => ({ ...prev, useFinLayerCrop: false }));
                        setConfig((prev) => ({
                          ...prev,
                          fields: {
                            ...prev.fields,
                            barcodeText: {
                              ...(prev.fields.barcodeText || DEFAULT_COORDINATES.fields.barcodeText),
                              fontWeight: 'normal',
                              fontSize: Math.min(prev.fields.barcodeText?.fontSize || 19, 20),
                            },
                          },
                        }));
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        idData.useFinLayerCrop === false || !idData.finLayerCropUrl
                          ? 'bg-pink-600 text-white shadow-xs'
                          : 'text-gray-600 hover:bg-pink-50'
                      }`}
                    >
                      <Type className="w-3.5 h-3.5" />
                      <span>🔤 Text Digits (Regular)</span>
                    </button>
                  </div>

                  {/* Back FIN Boldness & Weight Controller */}
                  <div className="p-2.5 bg-white rounded-xl border border-pink-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-800 flex items-center gap-1">
                        <Type className="w-3.5 h-3.5 text-pink-600" />
                        <span>FIN Boldness / Weight (ውፍረት):</span>
                      </span>
                     <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-900">
  {config.fields.barcodeText?.fontWeight === 'bold' ? 'Bold (700)' : config.fields.barcodeText?.fontWeight === 'medium' ? 'Medium (500)' : 'Regular (400) - Slender'}
</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({
                            ...prev,
                            fields: {
                              ...prev.fields,
                              barcodeText: {
                                ...(prev.fields.barcodeText || DEFAULT_COORDINATES.fields.barcodeText),
                                fontWeight: 'normal',
                                fontSize: Math.min(prev.fields.barcodeText?.fontSize || 19, 20),
                              },
                            },
                          }));
                          setIdData((prev) => ({ ...prev, useFinLayerCrop: false }));
                        }}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          config.fields.barcodeText?.fontWeight !== 'bold' && config.fields.barcodeText?.fontWeight !== 'medium' && (!idData.finLayerCropUrl || idData.useFinLayerCrop === false)
                            ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500'
                            : 'bg-gray-100 text-gray-700 hover:bg-emerald-50'
                        }`}
                        title="Clean, authentic, slender regular weight digits (400)"
                      >
                        <span className="font-normal text-[11px]">Regular (400)</span>
                        <span className="text-[9px] opacity-80">ቀጭን (Reduced)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({
                            ...prev,
                            fields: {
                              ...prev.fields,
                              barcodeText: {
                                ...(prev.fields.barcodeText || DEFAULT_COORDINATES.fields.barcodeText),
                                fontWeight: 'medium',
                              },
                            },
                          }));
                          setIdData((prev) => ({ ...prev, useFinLayerCrop: false }));
                        }}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          config.fields.barcodeText?.fontWeight === 'medium' && (!idData.finLayerCropUrl || idData.useFinLayerCrop === false)
                            ? 'bg-pink-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-700 hover:bg-pink-50'
                        }`}
                        title="Subtle medium weight (500)"
                      >
                        <span className="font-medium text-[11px]">Medium (500)</span>
                        <span className="text-[9px] opacity-80">መካከለኛ</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleGenerateVectorFin('white');
                        }}
                        className="py-1.5 px-2 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5"
                        title="Generate crisp slender 400-weight vector layer"
                      >
                        <span className="text-[11px] flex items-center gap-1">⚡ Slim Vector</span>
                        <span className="text-[9px] opacity-80">ስሊም ቬክተር</span>
                      </button>
                    </div>

                    {/* Font Size Quick Adjuster */}
                    <div className="flex items-center justify-between pt-1 border-t border-pink-100 text-xs text-gray-700">
                      <span className="font-medium">Font Size: <strong className="font-mono text-pink-900">{config.fields.barcodeText?.fontSize || 19}px</strong></span>
                      <div className="flex items-center gap-1">
                        {[18, 19, 20, 22].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              setConfig((prev) => ({
                                ...prev,
                                fields: {
                                  ...prev.fields,
                                  barcodeText: {
                                    ...(prev.fields.barcodeText || DEFAULT_COORDINATES.fields.barcodeText),
                                    fontSize: sz,
                                  },
                                },
                              }));
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                              (config.fields.barcodeText?.fontSize || 19) === sz
                                ? 'bg-pink-600 text-white'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            {sz}px
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {idData.finLayerCropUrl ? (
                    <div className="space-y-2">
                      {/* Live Image Preview & HD Quality Badge */}
                      <div className="bg-white p-2 rounded-lg border border-pink-200/80 flex flex-col items-center justify-center gap-1.5 overflow-hidden">
                        <div className="w-full flex items-center justify-between text-[10px] pb-1 border-b border-pink-100/60">
                          <span className="font-semibold text-slate-600">Cut Layer Preview:</span>
                          {finDimensions ? (
                            finDimensions.height >= 140 ? (
                              <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-emerald-500" />
                                <span>✨ Ultra HD ({finDimensions.width}×{finDimensions.height}px)</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                <span>⚠️ Low Res ({finDimensions.width}×{finDimensions.height}px)</span>
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">Measuring...</span>
                          )}
                        </div>
                        <img
                          src={idData.finLayerCropUrl}
                          alt="Back FAN Cutout"
                          className="max-h-14 object-contain"
                          style={{ imageRendering: '-webkit-optimize-contrast' }}
                        />
                      </div>

                      {/* Primary "Fix & Add HD Quality" Button */}
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          disabled={isEnhancingFin}
                          onClick={() => handleBoostFinQuality('ultra')}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-[12px] font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-lg cursor-pointer transition-all shadow-sm hover:shadow-md"
                          title="Boost resolution to 3x Ultra-HD with unsharp mask sharpening and pure white background"
                        >
                          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                          <span>{isEnhancingFin ? 'Enhancing Quality...' : '⚡ Fix & Add HD Quality (ከፍተኛ ጥራት)'}</span>
                        </button>

                        {/* Secondary Quality Modes & Direct Actions */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            disabled={isEnhancingFin}
                            onClick={() => handleBoostFinQuality('bw')}
                            className="flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="Pure black ink on crisp white background at 3x resolution"
                          >
                            <span>🖤 B&W HD</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleGenerateVectorFin('white')}
                            className="flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="Render 16 digits at ultra-crisp 1760×380 vector resolution"
                          >
                            <span>⚡ Vector HD</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsBackFanCropModalOpen(true)}
                            className="flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold bg-white hover:bg-pink-50 text-pink-800 border border-pink-300 rounded-lg cursor-pointer transition-colors shadow-2xs"
                            title="Open crop box editor to adjust box or resolution"
                          >
                            <span>📐 Cut Box</span>
                          </button>
                        </div>

                        {/* Crop Style Switcher & Clear */}
                        <div className="flex items-center justify-between bg-pink-50/70 p-1.5 rounded-lg border border-pink-100 text-[10px]">
                          <span className="font-semibold text-pink-900">Preset:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isEnhancingFin}
                              onClick={() => handleBoostFinQuality('ultra')}
                              className="px-2 py-0.5 rounded bg-pink-600 hover:bg-pink-700 text-white font-bold cursor-pointer shadow-2xs"
                              title="Ultra-HD 300+ DPI with edge sharpening"
                            >
                              ✨ Ultra HD
                            </button>
                            <button
                              type="button"
                              disabled={isEnhancingFin}
                              onClick={() => handleReCropFinFromScan('white', 'original')}
                              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-800 font-medium border border-pink-200 cursor-pointer shadow-2xs"
                              title="Authentic raw slip crop 1:1"
                            >
                              ✂️ 1:1 As Is
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIdData((prev) => ({
                                  ...prev,
                                  finLayerCropUrl: undefined,
                                  useFinLayerCrop: false,
                                }));
                              }}
                              className="px-2 py-0.5 text-slate-500 hover:text-red-600 font-medium cursor-pointer"
                              title="Clear cut layer and use text digits"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Stretch & Width Control Suite */}
                      <div className="bg-white/80 p-2.5 rounded-xl border border-pink-200 space-y-2 text-[11px] text-pink-950">
                        {/* 1. Stretch Mode Toggle */}
                        <div className="flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1">
                            <Maximize2 className="w-3.5 h-3.5 text-pink-600" />
                            <span>Stretch / Proportion Mode:</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfig((prev) => ({
                                  ...prev,
                                  media: {
                                    ...prev.media,
                                    backFanCut: {
                                      ...(prev.media.backFanCut || DEFAULT_COORDINATES.media.backFanCut),
                                      fit: 'fill',
                                    },
                                  },
                                }));
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                config.media.backFanCut?.fit !== 'contain'
                                  ? 'bg-pink-600 text-white shadow-xs'
                                  : 'bg-white text-gray-700 hover:bg-pink-50 border border-pink-200'
                              }`}
                              title="Stretch the FAN cutout horizontally and vertically to fill the full box"
                            >
                              <span>↔️ Stretch (Fill Box)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfig((prev) => ({
                                  ...prev,
                                  media: {
                                    ...prev.media,
                                    backFanCut: {
                                      ...(prev.media.backFanCut || DEFAULT_COORDINATES.media.backFanCut),
                                      fit: 'contain',
                                    },
                                  },
                                }));
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                config.media.backFanCut?.fit === 'contain'
                                  ? 'bg-pink-600 text-white shadow-xs'
                                  : 'bg-white text-gray-700 hover:bg-pink-50 border border-pink-200'
                              }`}
                              title="Keep natural aspect ratio without stretching"
                            >
                              <span>📐 Natural (Fit)</span>
                            </button>
                          </div>
                        </div>

                        {/* 2. Width / Stretch Adjustment Buttons */}
                        <div className="flex items-center justify-between pt-1 border-t border-pink-100">
                          <span className="font-medium text-gray-700">
                            Box Width: <strong className="font-mono text-pink-900">{config.media.backFanCut?.width ?? 440}px</strong>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const currentW = config.media.backFanCut?.width ?? 440;
                                handleResizeField('backFanCut', Math.max(100, currentW - 20), config.media.backFanCut?.height ?? 95);
                              }}
                              className="px-2 py-0.5 bg-white hover:bg-pink-50 border border-pink-200 rounded font-bold text-gray-700 cursor-pointer shadow-2xs"
                              title="Shrink width -20px"
                            >
                              -20
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const currentW = config.media.backFanCut?.width ?? 440;
                                handleResizeField('backFanCut', Math.min(800, currentW + 20), config.media.backFanCut?.height ?? 95);
                              }}
                              className="px-2 py-0.5 bg-pink-600 hover:bg-pink-700 text-white rounded font-bold cursor-pointer shadow-2xs"
                              title="Stretch width +20px"
                            >
                              +20
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const currentW = config.media.backFanCut?.width ?? 440;
                                handleResizeField('backFanCut', Math.min(800, currentW + 50), config.media.backFanCut?.height ?? 95);
                              }}
                              className="px-2 py-0.5 bg-pink-700 hover:bg-pink-800 text-white rounded font-bold cursor-pointer shadow-2xs"
                              title="Stretch width +50px"
                            >
                              +50
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResizeField('backFanCut', 440, config.media.backFanCut?.height ?? 95)}
                              className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded font-medium text-slate-800 cursor-pointer text-[10px]"
                              title="Reset to standard 440px"
                            >
                              440px
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResizeField('backFanCut', 520, config.media.backFanCut?.height ?? 95)}
                              className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded font-medium text-slate-800 cursor-pointer text-[10px]"
                              title="Set wide to 520px"
                            >
                              520px
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResizeField('backFanCut', 580, config.media.backFanCut?.height ?? 95)}
                              className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded font-medium text-slate-800 cursor-pointer text-[10px]"
                              title="Set extra wide to 580px"
                            >
                              580px
                            </button>
                          </div>
                        </div>

                        {/* 3. Horizontal Stretch Factor (scaleX multiplier) */}
                        <div className="flex items-center justify-between pt-1 border-t border-pink-100">
                          <span className="font-medium text-gray-700">
                            Stretch Factor: <strong className="font-mono text-pink-900">{config.media.backFanCut?.scaleX ? `${config.media.backFanCut.scaleX.toFixed(2)}x` : '1.00x'}</strong>
                          </span>
                          <div className="flex items-center gap-1">
                            {[1.0, 1.15, 1.25, 1.35, 1.5].map((sFactor) => (
                              <button
                                key={sFactor}
                                type="button"
                                onClick={() => {
                                  setConfig((prev) => ({
                                    ...prev,
                                    media: {
                                      ...prev.media,
                                      backFanCut: {
                                        ...(prev.media.backFanCut || DEFAULT_COORDINATES.media.backFanCut),
                                        scaleX: sFactor,
                                        fit: 'fill',
                                      },
                                    },
                                  }));
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                  (config.media.backFanCut?.scaleX ?? 1.0) === sFactor
                                    ? 'bg-pink-700 text-white shadow-2xs'
                                    : 'bg-white text-pink-800 border border-pink-200 hover:bg-pink-50'
                                }`}
                              >
                                {sFactor}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-pink-900 leading-snug">
                        Cut the 16-digit FAN field directly from the Fayda confirmation slip and place it on the back of the card:
                      </p>
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        {idData.documentScanUrl && (
                          <button
                            type="button"
                            disabled={isEnhancingFin}
                            onClick={() => handleReCropFinFromScan('white', 'original')}
                            className="w-full sm:flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-[11px] font-bold bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded-lg cursor-pointer transition-colors shadow-xs"
                            title="Crop the Back FAN directly from the slip canvas 1:1 as it is with zero upscaling"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                            <span>{isEnhancingFin ? 'Cropping...' : '✂️ Crop Back FAN (As Is - No Upscale)'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsBackFanCropModalOpen(true)}
                          className="w-full sm:flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-[11px] font-bold bg-white hover:bg-pink-50 text-pink-700 border border-pink-300 rounded-lg cursor-pointer transition-colors shadow-xs"
                        >
                          <span>📐 Open Cutter Box</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isFieldEditorOpen('backFanCut') && (
                  <FieldPositionEditor
                    fieldId="backFanCut"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('backFanCut')}
                  />
                )}
              </div>

              {/* 9. Serial Number (7-Digit Code • White Background) */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-gray-800">
                      Serial Number (7-Digit Code • White Background)
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const formatted = format7DigitSerial(idData.serialNumber);
                        setIdData((prev) => ({ ...prev, serialNumber: formatted }));
                      }}
                      className="text-[9px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded hover:bg-emerald-200 transition-colors cursor-pointer"
                      title="Format as clean 7-digit code"
                    >
                      ⚡ 7-Digit Code
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFieldPositionEditor('serialNumber')}
                      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                        isFieldEditorOpen('serialNumber')
                          ? 'bg-emerald-700 text-white shadow-xs'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      }`}
                    >
                      <Sliders className="w-3 h-3" />
                      <span>X:{config.fields.serialNumber.x} Y:{config.fields.serialNumber.y}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={12}
                    value={idData.serialNumber || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/^(?:SN|Serial\s*(?:Number|No)?)[\s:|\-\/]*/i, '').replace(/[^0-9]/g, '');
                      setIdData((prev) => ({ ...prev, serialNumber: val }));
                    }}
                    onFocus={() => setSelectedFieldId('serialNumber')}
                    className="flex-1 px-3 py-2 text-sm font-mono font-bold tracking-wider bg-white border border-gray-200 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                    placeholder="7492815"
                  />
                  <span className="text-xs font-mono font-semibold text-gray-500 bg-white px-2.5 py-2 rounded-xl border border-gray-200">
                    SN : {format7DigitSerial(idData.serialNumber)}
                  </span>
                </div>

                {isFieldEditorOpen('serialNumber') && (
                  <FieldPositionEditor
                    fieldId="serialNumber"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('serialNumber')}
                  />
                )}
              </div>

              {/* 10. QR Code Media Position */}
              <div className="bg-gray-50/70 p-3.5 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-gray-800">
                      Digital QR Matrix (Back Side)
                    </label>
                    {idData.qrCodeImageUrl ? (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        Exact PDF Crop Active
                      </span>
                    ) : (
                      <span className="text-[9px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded">
                        Awaiting PDF Crop
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFieldPositionEditor('qrCodeBack')}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                      isFieldEditorOpen('qrCodeBack')
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    <Sliders className="w-3 h-3" />
                    <span>X:{config.media.qrCodeBack.x} Y:{config.media.qrCodeBack.y}</span>
                  </button>
                </div>

                {/* QR Preview & Crop Action Buttons */}
                <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-gray-200">
                  <div
                    className="w-16 h-16 bg-gray-50 rounded-lg border border-gray-300 p-1 flex items-center justify-center shrink-0 cursor-pointer group relative overflow-hidden hover:border-cyan-500 transition-colors"
                    onClick={() => setIsQrCropModalOpen(true)}
                    title="Click to crop or align QR from slip"
                  >
                    {idData.qrCodeImageUrl ? (
                      <>
                        <img
                          src={idData.qrCodeImageUrl}
                          alt="Cropped QR Preview"
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-cyan-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[8px] font-bold gap-0.5">
                          <CropIcon className="w-3 h-3 text-cyan-300" />
                          <span>Crop</span>
                        </div>
                      </>
                    ) : (
                      <QrCode className="w-9 h-9 text-slate-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div>
                      <p className="text-[11px] font-bold text-gray-800 truncate">
                        {idData.qrCodeImageUrl ? 'Exact Cropped QR from Slip' : 'Biometric QR Matrix'}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">
                        {idData.qrCodeImageUrl
                          ? '1:1 authentic biometric signature'
                          : 'Crop from slip or upload QR image'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsQrCropModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-50 border border-cyan-300 hover:bg-cyan-100 text-cyan-800 text-[10px] font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Carefully crop, align, and filter authentic QR code from slip"
                      >
                        <CropIcon className="w-3 h-3 text-cyan-600" />
                        <span>Crop QR from Slip</span>
                      </button>

                      <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-[10px] font-semibold rounded-lg shadow-2xs cursor-pointer transition-colors">
                        <Upload className="w-3 h-3 text-gray-500" />
                        <span>Replace QR</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleQrUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Card Size: {config.media.qrCodeBack.width} × {config.media.qrCodeBack.height} px</span>
                  <span className="text-[10px] text-emerald-800 font-mono font-medium">300 DPI High-Density</span>
                </div>

                {isFieldEditorOpen('qrCodeBack') && (
                  <FieldPositionEditor
                    fieldId="qrCodeBack"
                    config={config}
                    setConfig={setConfig}
                    onClose={() => closeFieldPositionEditor('qrCodeBack')}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Quick Shortcuts to PDF Slip Auto-Extractor & Calibrator */}
          <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white rounded-3xl p-5 shadow-lg border border-slate-800">
            <div className="relative z-10">
              <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Automated Fayda PDF Slip Extractor
              </h4>
              <p className="text-xs text-slate-300 mb-3.5 leading-relaxed">
                Have an official National ID / Fayda verification PDF or scan? Use the automated document extractor to load all applicant fields, portrait photo, and QR matrix in one step.
              </p>
              <div className="flex items-center gap-2">
                {onOpenExtractor && (
                  <button
                    type="button"
                    onClick={onOpenExtractor}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Open PDF Extractor
                  </button>
                )}
                {onOpenCalibrator && (
                  <button
                    type="button"
                    onClick={onOpenCalibrator}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
                  >
                    Open Coordinate Calibrator
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Template Upload & Management Modal */}
      <CustomTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templateConfig={templateConfig}
        setTemplateConfig={setTemplateConfig}
        config={config}
        setConfig={setConfig}
        activeTemplateNumber={activeNum}
        onSelectTemplateNumber={handleSelectTemplateNumber}
        numberedTemplates={templatesList}
        onUpdateNumberedTemplates={handleUpdateTemplates}
      />

      {/* Photo Studio: Lighting & Background Removal Modal */}
      <PhotoAdjustModal
        isOpen={isPhotoAdjustModalOpen}
        onClose={() => setIsPhotoAdjustModalOpen(false)}
        originalPhotoUrl={
          photoAdjustTarget === 'secondary'
            ? idData.secondaryPhotoUrl || idData.photoUrl
            : idData.photoUrl
        }
        applicantName={idData.fullNameEnglish}
        onApplyPhoto={(processedUrl, target) => {
          if (target === 'both') {
            setIdData((prev) => ({
              ...prev,
              photoUrl: processedUrl,
              secondaryPhotoUrl: processedUrl,
            }));
          } else if (target === 'secondary' || photoAdjustTarget === 'secondary') {
            setIdData((prev) => ({
              ...prev,
              secondaryPhotoUrl: processedUrl,
            }));
          } else {
            setIdData((prev) => ({
              ...prev,
              photoUrl: processedUrl,
              secondaryPhotoUrl: processedUrl,
            }));
          }
        }}
      />

      {/* Permanent App Settings Modal */}
      <AppSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={appSettings}
        onSaveSettings={(newSettings) => {
          setAppSettings(newSettings);
        }}
      />

      {/* High-Resolution PDF & JPEG Export Modal */}
      <ExportPdfModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        idData={idData}
        config={config}
        templateConfig={templateConfig}
        appSettings={appSettings}
        onUpdateAppSettings={(newSettings) => {
          setAppSettings(newSettings);
        }}
      />

      {/* Interactive Photo Crop & Position Modal */}
      <PhotoCropModal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        sourceImageUrl={cropTarget === 'secondary' ? (idData.secondaryPhotoUrl || idData.photoUrl) : idData.photoUrl}
        applicantName={idData.fullNameEnglish || idData.fullNameAmharic || 'Applicant'}
        onApplyCrop={(croppedUrl) => {
          if (cropTarget === 'secondary') {
            setIdData((prev) => ({ ...prev, secondaryPhotoUrl: croppedUrl }));
          } else {
            setIdData((prev) => ({ ...prev, photoUrl: croppedUrl, secondaryPhotoUrl: croppedUrl }));
          }
        }}
      />

      {/* Interactive QR Crop & Alignment Modal */}
      <QrCropModal
        isOpen={isQrCropModalOpen}
        onClose={() => setIsQrCropModalOpen(false)}
        sourceImageUrl={idData.documentScanUrl || idData.qrCodeImageUrl || ''}
        currentQrUrl={idData.qrCodeImageUrl}
        currentQrData={idData.qrData}
        initialCropBox={idData.detectedQrBox}
        onApplyCrop={(croppedUrl, decodedPayload) => {
          setIdData((prev) => ({
            ...prev,
            qrCodeImageUrl: croppedUrl,
            ...(decodedPayload ? { qrData: decodedPayload } : {}),
          }));
        }}
      />

      {/* Interactive 1D Barcode Crop & Quality Studio Modal */}
      <BarcodeCropModal
        isOpen={isBarcodeCropModalOpen}
        onClose={() => setIsBarcodeCropModalOpen(false)}
        sourceImageUrl={idData.documentScanUrl || idData.barcodeImageUrl || ''}
        currentBarcodeUrl={idData.barcodeImageUrl}
        currentBarcodeData={idData.barcodeData || idData.fan}
        fanNumber={idData.fan}
        initialCropBox={idData.detectedBarcodeBox}
        onApplyCrop={(croppedUrl, barcodeData, mode) => {
          setIdData((prev) => ({
            ...prev,
            barcodeImageUrl: croppedUrl,
            barcodeRenderMode: mode || 'extracted',
            ...(barcodeData ? { barcodeData } : {}),
          }));
        }}
      />

      {/* Interactive Back FAN Cutter Studio Modal */}
      <BackFanCropModal
        isOpen={isBackFanCropModalOpen}
        onClose={() => setIsBackFanCropModalOpen(false)}
        sourceImageUrl={idData.documentScanUrl || idData.finLayerCropUrl || ''}
        currentFinUrl={idData.finLayerCropUrl}
        fanNumber={idData.fan}
        onApplyCrop={(fanUrl) => {
          setIdData((prev) => ({
            ...prev,
            finLayerCropUrl: fanUrl,
            useFinLayerCrop: true,
          }));
          setQuickStatus('Back FAN cut successfully updated!');
        }}
      />

      {/* Card Font & Typography Manager Modal */}
      <FontManagerModal
        isOpen={isFontModalOpen}
        onClose={() => setIsFontModalOpen(false)}
        activeFontFamily={templateConfig.cardFontFamily || 'Nokia Pure Headline Bold'}
        onSelectFont={(fontName) => {
          setTemplateConfig((prev) => ({
            ...prev,
            cardFontFamily: fontName,
          }));
          setQuickStatus(`Font applied: ${fontName}`);
        }}
      />
    </div>
  );
};
