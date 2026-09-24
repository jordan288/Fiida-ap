import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  Upload, 
  FileText, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  CheckCheck,
  ArrowRight, 
  Download, 
  Trash2, 
  Edit3, 
  Eye, 
  RefreshCw, 
  Plus, 
  Search, 
  Filter, 
  Copy, 
  Check, 
  FileCheck, 
  Printer, 
  Archive, 
  AlertCircle,
  MoreVertical,
  X,
  CreditCard,
  User,
  Calendar,
  Phone,
  MapPin,
  Hash,
  Sliders,
  Image as ImageIcon,
  Scissors,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
  Columns,
  Clock,
  Zap,
  Play,
  Pause,
  Square,
  Crosshair,
  Terminal,
  FastForward,
  Save
} from 'lucide-react';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig, NumberedTemplate } from '../types';
import { SAMPLE_BATCH_APPLICANTS, SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA } from '../data/defaultData';
import { exportBatchToA4Pdf, exportBatchToA4Png, exportBatchToZipArchive, renderOffscreenCard } from '../utils/batchExporter';
import { saveTemplateCoordinates, loadTemplateCoordinates } from '../utils/templateStorage';
import { convertGcToEth, convertEthToGc, getTodayIssueDates, calculateExpiryFromIssue, formatCardDualDate, formatGcyyyyMmDd, formatGcWith3LetterMonth, format7DigitSerial } from '../utils/ethiopianCalendar';
import { extractFromPdf, extractFromImage } from '../utils/pdfExtractor';
import { getEffectiveRegions, extractAllFromMarkedRegions, savePermanentRegions, loadPermanentRegions } from '../utils/pdfRegionExtractor';
import { sanitizeIdCardData } from '../utils/textCleaner';
import { autoRemovePhotoBackground } from '../utils/imageProcessor';
import { CardRenderer } from './CardRenderer';
import { A4BatchPrintModal } from './A4BatchPrintModal';
import { BatchPositionEditorModal } from './BatchPositionEditorModal';
import { PhotoAdjustModal } from './PhotoAdjustModal';
import { CustomTemplateModal } from './CustomTemplateModal';
import { PdfSlipExtractor } from './PdfSlipExtractor';

interface BatchProcessorProps {
  queue: BatchQueueItem[];
  setQueue: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
  config: CoordinatesConfig;
  setConfig?: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  templateConfig: TemplateConfig;
  setTemplateConfig?: React.Dispatch<React.SetStateAction<TemplateConfig>>;
  onOpenInStudio?: (data: IdCardData, queueItemId?: string) => void;
  onNavigateToTab?: (tab: 'extractor' | 'calibrator' | 'batch') => void;
  activeTemplateNumber?: number;
  onSelectTemplateNumber?: (num: number) => void;
  numberedTemplates?: NumberedTemplate[];
  onUpdateNumberedTemplates?: (templates: NumberedTemplate[]) => void;
  onApplyStudioPositionsToAllTemplates?: () => void;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({
  queue,
  setQueue,
  config,
  setConfig,
  templateConfig,
  setTemplateConfig,
  onOpenInStudio,
  onNavigateToTab,
  activeTemplateNumber,
  onSelectTemplateNumber,
  numberedTemplates,
  onUpdateNumberedTemplates,
  onApplyStudioPositionsToAllTemplates,
}) => {
  const [appliedToast, setAppliedToast] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'pending' | 'printed' | 'processing'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  
  // Progress and export state
  const [isExporting, setIsExporting] = useState(false);
  const [batchMirrorPrint, setBatchMirrorPrint] = useState(true);
  const [batchPhotoColorMode, setBatchPhotoColorMode] = useState<'color' | 'grayscale'>('color');
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; status: string }>({
    current: 0,
    total: 0,
    status: '',
  });
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  // Turbo Batch Processing & Concurrency Pipeline State
  const [batchConcurrency, setBatchConcurrency] = useState<number>(4);
  const [batchPipelineStats, setBatchPipelineStats] = useState<{
    isActive: boolean;
    total: number;
    completed: number;
    speedFilesPerSec: number;
    elapsedSec: number;
    currentFile: string;
    isPaused: boolean;
  }>({
    isActive: false,
    total: 0,
    completed: 0,
    speedFilesPerSec: 0,
    elapsedSec: 0,
    currentFile: '',
    isPaused: false,
  });
  const isBatchCancelledRef = useRef<boolean>(false);
  const isBatchPausedRef = useRef<boolean>(false);

  const [activeProcessingId, setActiveProcessingId] = useState<string | null>(null);
  const [pipelineBannerText, setPipelineBannerText] = useState<string>('');
  const isProcessingSingleItemRef = useRef<boolean>(false);

  // Batch Internal Sub-Views: queue, extractor, mapper
  const [batchSubView, setBatchSubView] = useState<'queue' | 'extractor' | 'mapper'>('queue');
  const [extractorSlipData, setExtractorSlipData] = useState<IdCardData>(
    queue.length > 0 ? queue[0].extractedData : SAMPLE_ID_DATA
  );

  const handleAddExtractedToBatchQueue = (extracted: IdCardData, fileName?: string) => {
    const newItem: BatchQueueItem = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fileName: fileName || `${extracted.fullNameEnglish || 'Applicant'}_slip.pdf`,
      fileSize: '180 KB',
      status: 'ready',
      progress: 100,
      extractedData: extracted,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);
    try {
      confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
    } catch {}
    setBatchSubView('queue');
  };

  // 💾 Save position from PDF Slip Mapper and apply to all batch queue items
  const handleSaveAndApplyMapperPositions = (
    savedRegions: any[],
    updatedData?: IdCardData
  ) => {
    // 1. Explicitly persist the regions
    if (savedRegions && savedRegions.length > 0) {
      savePermanentRegions(savedRegions);
    }
    if (updatedData) {
      setExtractorSlipData(updatedData);
    }

    // 2. Refresh queue items with calibrated coordinates / extracted assets if ready
    setQueue((prevQueue) =>
      prevQueue.map((item) => {
        if (updatedData && (item.id === 'sample_ayele' || item.status === 'ready')) {
          return {
            ...item,
            extractedData: {
              ...item.extractedData,
              ...(updatedData.photoUrl ? { photoUrl: updatedData.photoUrl } : {}),
              ...(updatedData.qrCodeImageUrl ? { qrCodeImageUrl: updatedData.qrCodeImageUrl } : {}),
              ...(updatedData.backFan ? { backFan: updatedData.backFan } : {}),
              ...(updatedData.barcodeImageUrl ? { barcodeImageUrl: updatedData.barcodeImageUrl } : {}),
            },
          };
        }
        return item;
      })
    );

    // 3. Return to queue with prominent success notification
    setBatchSubView('queue');
    setPipelineBannerText('✓ PDF Slip Mapper positions saved permanently & applied to batch queue!');
    setTimeout(() => {
      setPipelineBannerText('');
    }, 6000);

    try {
      confetti({ particleCount: 95, spread: 80, origin: { y: 0.6 } });
    } catch {}
  };

  // A4 Print & Batch Layout Modal
  const [isA4PrintModalOpen, setIsA4PrintModalOpen] = useState(false);

  // Batch Field Position Editor Modal State
  const [isPositionEditorOpen, setIsPositionEditorOpen] = useState(false);
  const [selectedPositionEditorItemId, setSelectedPositionEditorItemId] = useState<string | null>(null);

  // Interactive Live Card Preview Modal State
  const [previewItem, setPreviewItem] = useState<BatchQueueItem | null>(null);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [previewScale, setPreviewScale] = useState<number>(1.0);

  // Custom Template Manager Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Photo Adjust & Biometric Cutout Modal State
  const [photoAdjustItem, setPhotoAdjustItem] = useState<BatchQueueItem | null>(null);
  const [photoAdjustTab, setPhotoAdjustTab] = useState<'adjust' | 'background' | 'presets'>('background');
  const [isAutoCuttingBg, setIsAutoCuttingBg] = useState(false);
  const [autoCuttingId, setAutoCuttingId] = useState<string | null>(null);

  const handleOpenPhotoAdjust = (item: BatchQueueItem, tab: 'adjust' | 'background' | 'presets' = 'background') => {
    setPhotoAdjustItem(item);
    setPhotoAdjustTab(tab);
  };

  const handleUpdateQueueItemPhotos = (itemId: string, photoUrl: string, secondaryPhotoUrl: string) => {
    setQueue((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return {
            ...it,
            extractedData: {
              ...it.extractedData,
              photoUrl,
              secondaryPhotoUrl,
            },
            status: 'ready',
          };
        }
        return it;
      })
    );
    if (previewItem && previewItem.id === itemId) {
      setPreviewItem((prev) =>
        prev
          ? {
              ...prev,
              extractedData: {
                ...prev.extractedData,
                photoUrl,
                secondaryPhotoUrl,
              },
              status: 'ready',
            }
          : null
      );
    }
  };

  const handleQuickAutoCutout = async (item: BatchQueueItem) => {
    if (!item.extractedData.photoUrl && !item.extractedData.secondaryPhotoUrl) return;
    try {
      setAutoCuttingId(item.id);
      let cutout1 = item.extractedData.photoUrl;
      if (item.extractedData.photoUrl) {
        cutout1 = (await autoRemovePhotoBackground(item.extractedData.photoUrl)) || item.extractedData.photoUrl;
      }
      let cutout2 = cutout1;
      if (item.extractedData.secondaryPhotoUrl && item.extractedData.secondaryPhotoUrl !== item.extractedData.photoUrl) {
        cutout2 = (await autoRemovePhotoBackground(item.extractedData.secondaryPhotoUrl)) || item.extractedData.secondaryPhotoUrl;
      } else {
        cutout2 = cutout1;
      }

      if (cutout1) {
        setQueue((prev) =>
          prev.map((it) => {
            if (it.id === item.id) {
              return {
                ...it,
                extractedData: {
                  ...it.extractedData,
                  photoUrl: cutout1,
                  secondaryPhotoUrl: cutout2,
                },
                status: 'ready',
              };
            }
            return it;
          })
        );
        if (previewItem && previewItem.id === item.id) {
          setPreviewItem((prev) =>
            prev
              ? {
                  ...prev,
                  extractedData: {
                    ...prev.extractedData,
                    photoUrl: cutout1,
                    secondaryPhotoUrl: cutout2,
                  },
                  status: 'ready',
                }
              : null
          );
        }
        try {
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
        } catch {}
      }
    } catch (err) {
      console.error('Quick auto cutout error:', err);
    } finally {
      setAutoCuttingId(null);
    }
  };

  const handleCutAllBackgrounds = async () => {
    const itemsToProcess = queue.filter((it) => it.extractedData.photoUrl || it.extractedData.secondaryPhotoUrl);
    if (itemsToProcess.length === 0) return;

    try {
      setIsAutoCuttingBg(true);
      const concurrency = 4;
      let nextIndex = 0;

      const worker = async () => {
        while (nextIndex < itemsToProcess.length) {
          const item = itemsToProcess[nextIndex++];
          try {
            let cutout1 = item.extractedData.photoUrl;
            if (item.extractedData.photoUrl) {
              cutout1 = (await autoRemovePhotoBackground(item.extractedData.photoUrl)) || item.extractedData.photoUrl;
            }
            // Secondary photo can directly inherit cutout1 unless it has distinct image data
            let cutout2 = cutout1;
            if (item.extractedData.secondaryPhotoUrl && item.extractedData.secondaryPhotoUrl !== item.extractedData.photoUrl) {
              cutout2 = (await autoRemovePhotoBackground(item.extractedData.secondaryPhotoUrl)) || item.extractedData.secondaryPhotoUrl;
            }

            if (cutout1) {
              setQueue((prev) =>
                prev.map((it) => {
                  if (it.id === item.id) {
                    return {
                      ...it,
                      extractedData: {
                        ...it.extractedData,
                        photoUrl: cutout1,
                        secondaryPhotoUrl: cutout2,
                      },
                      status: 'ready',
                    };
                  }
                  return it;
                })
              );
            }
          } catch (e) {
            console.warn(`Failed auto cutout for ${item.id}:`, e);
          }
          // Non-blocking yield to keep browser responsive
          await new Promise((r) => setTimeout(r, 0));
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, itemsToProcess.length) }, worker));
      try {
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } finally {
      setIsAutoCuttingBg(false);
    }
  };

  const handleApplyAdjustedPhoto = (processedUrl: string, target: 'primary' | 'secondary' | 'both' = 'both') => {
    if (!photoAdjustItem) return;
    setQueue((prev) =>
      prev.map((it) => {
        if (it.id === photoAdjustItem.id) {
          const updatedData = { ...it.extractedData };
          if (target === 'primary' || target === 'both') {
            updatedData.photoUrl = processedUrl;
          }
          if (target === 'secondary' || target === 'both') {
            updatedData.secondaryPhotoUrl = processedUrl;
          }
          return {
            ...it,
            extractedData: updatedData,
            status: 'ready',
          };
        }
        return it;
      })
    );
    if (previewItem && previewItem.id === photoAdjustItem.id) {
      const updatedPreviewData = { ...previewItem.extractedData };
      if (target === 'primary' || target === 'both') {
        updatedPreviewData.photoUrl = processedUrl;
      }
      if (target === 'secondary' || target === 'both') {
        updatedPreviewData.secondaryPhotoUrl = processedUrl;
      }
      setPreviewItem({
        ...previewItem,
        extractedData: updatedPreviewData,
        status: 'ready',
      });
    }
    setPhotoAdjustItem(null);
  };

  const handleDownloadCardPng = async (item: BatchQueueItem, side: 'front' | 'back') => {
    try {
      const itemConfig = item.customCoordinates || config;
      const itemTemplateConfig = templateConfig;
      const itemPhotoColorMode = item.photoColorMode || batchPhotoColorMode;
      const dataUrl = await renderOffscreenCard(
        side,
        item.extractedData,
        itemConfig,
        itemTemplateConfig,
        { photoColorMode: itemPhotoColorMode, format: 'png' }
      );
      const link = document.createElement('a');
      link.download = `${item.extractedData.fan || 'card'}_${side}_300dpi.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download card PNG', err);
    }
  };

  const handlePrintSingleCard = async (item: BatchQueueItem) => {
    try {
      const itemConfig = item.customCoordinates || config;
      const itemTemplateConfig = templateConfig;
      const itemPhotoColorMode = item.photoColorMode || batchPhotoColorMode;
      const frontDataUrl = await renderOffscreenCard('front', item.extractedData, itemConfig, itemTemplateConfig, { photoColorMode: itemPhotoColorMode, format: 'png' });
      const backDataUrl = await renderOffscreenCard('back', item.extractedData, itemConfig, itemTemplateConfig, { photoColorMode: itemPhotoColorMode, format: 'png' });
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${item.extractedData.fullNameAmharic || 'ID Card'} - Print</title>
            <style>
              @page { size: auto; margin: 10mm; }
              body { font-family: sans-serif; text-align: center; background: #fff; margin: 0; padding: 20px; }
              .card-pair { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; }
              img { width: 85.6mm; height: 53.98mm; border: 1px dashed #ccc; border-radius: 3.18mm; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              @media print { img { box-shadow: none; border: 0.2mm solid #ddd; } }
            </style>
          </head>
          <body>
            <h2>${item.extractedData.fullNameAmharic || ''} / ${item.extractedData.fullNameEnglish || ''}</h2>
            <p>FAN: ${item.extractedData.fan || ''}</p>
            <div class="card-pair">
              <img src="${frontDataUrl}" alt="Front" />
              <img src="${backDataUrl}" alt="Back" />
            </div>
            <script>window.onload = function() { window.print(); };</script>
          </body>
        </html>
      `);
      printWindow.document.close();
      setQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'printed' } : it))
      );
    } catch (err) {
      console.error('Failed to print card', err);
    }
  };

  const handleOpenPositionEditor = (itemId?: string) => {
    setSelectedPositionEditorItemId(itemId || null);
    setIsPositionEditorOpen(true);
  };

  const handleSaveBatchPositions = (
    newConfig: CoordinatesConfig,
    scope: 'all' | 'item',
    targetItemId?: string
  ) => {
    if (scope === 'all') {
      const cloned = JSON.parse(JSON.stringify(newConfig));
      setConfig?.(cloned);
      if (activeTemplateNumber) {
        saveTemplateCoordinates(activeTemplateNumber, cloned);
        if (numberedTemplates && onUpdateNumberedTemplates) {
          const updated = numberedTemplates.map((t) =>
            t.number === activeTemplateNumber
              ? { ...t, coordinates: cloned, updatedAt: new Date().toISOString() }
              : t
          );
          onUpdateNumberedTemplates(updated);
        }
      }
    } else if (scope === 'item' && targetItemId) {
      setQueue((prev) =>
        prev.map((it) => (it.id === targetItemId ? { ...it, customCoordinates: newConfig } : it))
      );
    }
  };

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<BatchQueueItem | null>(null);
  const [copiedFanId, setCopiedFanId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Multi-file Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    processMultipleFiles(Array.from(files));
  };

  const processMultipleFiles = async (files: File[]) => {
    const newItems: BatchQueueItem[] = files.map((file, idx) => {
      const samplePool = SAMPLE_BATCH_APPLICANTS;
      const baseSample = samplePool[idx % samplePool.length];

      return {
        id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(1)} KB`,
        status: 'pending',
        progress: 0,
        queuePosition: idx + 1,
        processingStep: idx === 0 ? '⏳ Next in Queue' : `⏳ Waiting in queue (#${idx + 1})`,
        extractedData: { ...baseSample },
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        selected: true,
        file,
      };
    });

    setQueue((prev) => [...newItems, ...prev]);

    // Concurrently process files with concurrency worker pool
    setIsProcessingBatch(true);
    isBatchCancelledRef.current = false;
    isBatchPausedRef.current = false;

    const batchStartTime = Date.now();
    const totalFiles = files.length;
    let completedFiles = 0;
    const workerCount = Math.min(batchConcurrency, totalFiles);
    let nextFileIdx = 0;

    setBatchPipelineStats({
      isActive: true,
      total: totalFiles,
      completed: 0,
      speedFilesPerSec: 0,
      elapsedSec: 0,
      currentFile: files[0]?.name || '',
      isPaused: false,
    });

    const runWorker = async () => {
      while (nextFileIdx < files.length) {
        if (isBatchCancelledRef.current) break;
        while (isBatchPausedRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          if (isBatchCancelledRef.current) break;
        }
        if (isBatchCancelledRef.current) break;

        const i = nextFileIdx++;
        const file = files[i];
        const targetId = newItems[i].id;
        const fileStartTime = Date.now();

        // Update queue: this file is processing, remaining files get updated queue rank
        setQueue((prev) => {
          let waitingRank = 1;
          return prev.map((item) => {
            if (item.id === targetId) {
              return {
                ...item,
                status: 'processing',
                progress: 20,
                queuePosition: undefined,
                processingStep: '1/3: Reading slip canvas...',
              };
            }
            if (item.status === 'pending') {
              const rank = waitingRank++;
              return {
                ...item,
                queuePosition: rank,
                processingStep: rank === 1 ? '⏳ Next in Queue' : `⏳ Waiting in queue (#${rank})`,
              };
            }
            return item;
          });
        });

        // Non-blocking micro-yield to keep DOM responsive
        await new Promise((r) => setTimeout(r, 0));

        try {
          let extractionRes;
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            extractionRes = await extractFromPdf(file, {
              fastBatch: true,
              scale: 1.75,
              onProgress: (step, pct) => {
                setQueue((prev) =>
                  prev.map((item) =>
                    item.id === targetId
                      ? {
                          ...item,
                          progress: pct,
                          processingStep: `2/3: ${step}`,
                        }
                      : item
                  )
                );
              },
            });
          } else {
            extractionRes = await extractFromImage(file);
          }

          // Micro-yield to DOM
          await new Promise((r) => setTimeout(r, 0));

          let processedData = extractionRes.data;
          // Apply calibrated slip position adjustment to all extracted PDF pages
          // Pass in-memory canvas directly if available to skip base64/image decoding overhead!
          if (extractionRes.pageCanvas || extractionRes.pageCanvasUrl) {
            try {
              const effectiveRegions = getEffectiveRegions();
              processedData = await extractAllFromMarkedRegions(
                extractionRes.pageCanvas || extractionRes.pageCanvasUrl!,
                extractionRes.textItems,
                effectiveRegions,
                processedData
              );
            } catch (regErr) {
              console.warn('Could not apply calibrated regions to batch PDF item:', regErr);
            }
          }

          // User directive: "auto remove the photo background from the imported pdf emidiately eliminate the background on the process"
          if (processedData.photoUrl) {
            try {
              const transparentPhoto = await autoRemovePhotoBackground(processedData.photoUrl);
              processedData.photoUrl = transparentPhoto;
              processedData.secondaryPhotoUrl = transparentPhoto;
            } catch (bgErr) {
              console.warn('Auto photo bg elimination error in batch import:', bgErr);
            }
          }

          // User directive: "make the issued date always updated do not put the button"
          const today = getTodayIssueDates();
          processedData.dateOfIssue = today.issueDateGc;
          processedData.dateOfIssueEth = today.issueDateEth;
          processedData.dateOfExpiry = today.expiryDateGc;
          processedData.dateOfExpiryEth = today.expiryDateEth;

          const durationMs = Date.now() - fileStartTime;
          completedFiles++;
          const elapsed = (Date.now() - batchStartTime) / 1000;
          const speed = elapsed > 0 ? +(completedFiles / elapsed).toFixed(1) : 0;

          setBatchPipelineStats((prev) => ({
            ...prev,
            completed: completedFiles,
            speedFilesPerSec: speed,
            elapsedSec: Math.round(elapsed),
            currentFile: file.name,
          }));

          setQueue((prev) =>
            prev.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    status: 'ready',
                    progress: 100,
                    processingStep: 'Ready',
                    processingDurationMs: durationMs,
                    extractedData: sanitizeIdCardData(processedData),
                  }
                : item
            )
          );
        } catch (err) {
          console.warn('File extraction error in batch:', err);
          completedFiles++;
          setQueue((prev) =>
            prev.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    status: 'ready',
                    progress: 100,
                    processingStep: 'Ready',
                    processingDurationMs: Date.now() - fileStartTime,
                  }
                : item
            )
          );
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));
    setIsProcessingBatch(false);
    setBatchPipelineStats((prev) => ({ ...prev, isActive: false }));
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processMultipleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Single Queue Item Processor (used by Queue Autoplay and individual manual triggers)
  const processSingleQueueItem = async (targetItem: BatchQueueItem): Promise<boolean> => {
    if (isBatchCancelledRef.current) return false;

    isProcessingSingleItemRef.current = true;
    setActiveProcessingId(targetItem.id);
    const itemStartTime = Date.now();

    // Mark active item as processing, update remaining queue positions
    setQueue((prev) => {
      let rank = 1;
      return prev.map((it) => {
        if (it.id === targetItem.id) {
          return {
            ...it,
            status: 'processing',
            progress: 20,
            queuePosition: undefined,
            processingStep: '1/3: Parsing slip & extracting OCR...',
          };
        }
        if (it.status === 'pending') {
          const r = rank++;
          return {
            ...it,
            queuePosition: r,
            processingStep: r === 1 ? '⏳ Next in Queue' : `⏳ Waiting in queue (#${r})`,
          };
        }
        return it;
      });
    });

    setBatchPipelineStats((prev) => ({
      ...prev,
      isActive: true,
      currentFile: targetItem.fileName,
      isPaused: false,
    }));

    // If live preview is active and viewing this item, keep status synced
    setPreviewItem((prev) => (prev && prev.id === targetItem.id ? { ...prev, status: 'processing', progress: 20 } : prev));

    try {
      let processedData = { ...targetItem.extractedData };

      if (targetItem.file) {
        const file = targetItem.file;
        let extractionRes;
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          extractionRes = await extractFromPdf(file, {
            fastBatch: true,
            scale: 1.75,
            onProgress: (step, pct) => {
              setQueue((prev) =>
                prev.map((it) =>
                  it.id === targetItem.id
                    ? { ...it, progress: Math.max(20, pct), processingStep: `2/3: ${step}` }
                    : it
                )
              );
            },
          });
        } else {
          extractionRes = await extractFromImage(file);
        }

        processedData = extractionRes.data;

        // Apply calibrated slip position adjustment to extracted PDF pages
        if (extractionRes.pageCanvas || extractionRes.pageCanvasUrl) {
          try {
            const effectiveRegions = getEffectiveRegions();
            processedData = await extractAllFromMarkedRegions(
              extractionRes.pageCanvas || extractionRes.pageCanvasUrl!,
              extractionRes.textItems,
              effectiveRegions,
              processedData
            );
          } catch (regErr) {
            console.warn('Could not apply calibrated regions to batch PDF item:', regErr);
          }
        }

        // User directive: "auto remove the photo background from the imported pdf emidiately eliminate the background on the process"
        if (processedData.photoUrl) {
          try {
            const transparentPhoto = await autoRemovePhotoBackground(processedData.photoUrl);
            processedData.photoUrl = transparentPhoto;
            processedData.secondaryPhotoUrl = transparentPhoto;
          } catch (bgErr) {
            console.warn('Auto photo bg elimination error in single reprocess:', bgErr);
          }
        }
      } else {
        // High fidelity staged simulation for queued items
        await new Promise((r) => setTimeout(r, 120));
        setQueue((prev) =>
          prev.map((it) =>
            it.id === targetItem.id
              ? { ...it, progress: 55, processingStep: '2/3: Extracting photo, QR & Back FAN...' }
              : it
          )
        );
        await new Promise((r) => setTimeout(r, 120));
        setQueue((prev) =>
          prev.map((it) =>
            it.id === targetItem.id
              ? { ...it, progress: 85, processingStep: '3/3: Formatting dual dates & fields...' }
              : it
          )
        );
        await new Promise((r) => setTimeout(r, 80));
      }

      // Synchronize issue & expiry dates
      const today = getTodayIssueDates();
      processedData.dateOfIssue = today.issueDateGc;
      processedData.dateOfIssueEth = today.issueDateEth;
      processedData.dateOfExpiry = today.expiryDateGc;
      processedData.dateOfExpiryEth = today.expiryDateEth;

      const durationMs = Date.now() - itemStartTime;
      const sanitized = sanitizeIdCardData(processedData);

      // Complete item
      setQueue((prev) =>
        prev.map((it) =>
          it.id === targetItem.id
            ? {
                ...it,
                status: 'ready',
                progress: 100,
                processingStep: 'Ready',
                processingDurationMs: durationMs,
                extractedData: sanitized,
              }
            : it
        )
      );

      // Synchronize preview modal if viewing this card
      setPreviewItem((prev) =>
        prev && prev.id === targetItem.id
          ? {
              ...prev,
              status: 'ready',
              progress: 100,
              processingStep: 'Ready',
              processingDurationMs: durationMs,
              extractedData: sanitized,
            }
          : prev
      );

      setBatchPipelineStats((prev) => ({
        ...prev,
        completed: (prev.completed || 0) + 1,
      }));

      return true;
    } catch (err) {
      console.warn('Error processing queue item:', err);
      setQueue((prev) =>
        prev.map((it) =>
          it.id === targetItem.id
            ? {
                ...it,
                status: 'ready',
                progress: 100,
                processingStep: 'Ready',
                processingDurationMs: Date.now() - itemStartTime,
              }
            : it
        )
      );
      return false;
    } finally {
      isProcessingSingleItemRef.current = false;
      setActiveProcessingId(null);
    }
  };

  const handleProcessSingleItem = async (item: BatchQueueItem) => {
    if (item.status === 'processing' || isProcessingSingleItemRef.current) return;
    isBatchCancelledRef.current = false;
    isBatchPausedRef.current = false;
    await processSingleQueueItem(item);
  };

  // Run Batch OCR / Extraction on queued items with concurrency and step reporting
  const runBatchExtraction = async (targetIds?: string[]) => {
    const idsToProcess = targetIds || queue.filter((i) => i.status === 'pending').map((i) => i.id);

    if (idsToProcess.length === 0) return;

    setIsProcessingBatch(true);
    isBatchCancelledRef.current = false;
    isBatchPausedRef.current = false;

    const batchStartTime = Date.now();
    let completed = 0;
    const workerCount = Math.min(batchConcurrency, idsToProcess.length);
    let nextIdx = 0;

    setBatchPipelineStats({
      isActive: true,
      total: idsToProcess.length,
      completed: 0,
      speedFilesPerSec: 0,
      elapsedSec: 0,
      currentFile: '',
      isPaused: false,
    });

    const runWorker = async () => {
      while (nextIdx < idsToProcess.length) {
        if (isBatchCancelledRef.current) break;
        while (isBatchPausedRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          if (isBatchCancelledRef.current) break;
        }
        if (isBatchCancelledRef.current) break;

        const id = idsToProcess[nextIdx++];
        const itemStartTime = Date.now();

        // Mark active item as processing, update remaining queue positions
        setQueue((prev) => {
          let rank = 1;
          return prev.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                status: 'processing',
                progress: 40,
                queuePosition: undefined,
                processingStep: '1/2: Processing slip...',
              };
            }
            if (item.status === 'pending' && idsToProcess.includes(item.id)) {
              const r = rank++;
              return {
                ...item,
                queuePosition: r,
                processingStep: r === 1 ? '⏳ Next in Queue' : `⏳ Waiting in queue (#${r})`,
              };
            }
            return item;
          });
        });

        await new Promise((r) => setTimeout(r, 60));

        completed++;
        const elapsed = (Date.now() - batchStartTime) / 1000;
        const speed = elapsed > 0 ? +(completed / elapsed).toFixed(1) : 0;

        setBatchPipelineStats((prev) => ({
          ...prev,
          completed,
          speedFilesPerSec: speed,
          elapsedSec: Math.round(elapsed),
        }));

        setQueue((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                status: 'ready',
                progress: 100,
                processingStep: 'Ready',
                processingDurationMs: Date.now() - itemStartTime,
              };
            }
            return item;
          })
        );
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));
    setIsProcessingBatch(false);
    setBatchPipelineStats((prev) => ({ ...prev, isActive: false }));
  };

  // Load Full Demo Batch (6 Ethiopian Applicants)
  const handleLoadDemoBatch = () => {
    const demoItems: BatchQueueItem[] = SAMPLE_BATCH_APPLICANTS.map((applicant, index) => ({
      id: `demo-${index + 1}-${applicant.fan.replace(/\s+/g, '')}`,
      fileName: `Fayda_Slip_${applicant.fullNameEnglish.replace(/\s+/g, '_')}.pdf`,
      fileSize: `${(178 + index * 14.5).toFixed(1)} KB`,
      status: 'ready',
      progress: 100,
      extractedData: applicant,
      uploadedAt: new Date(Date.now() - (SAMPLE_BATCH_APPLICANTS.length - index) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      selected: true,
    }));

    setQueue(demoItems);
    try {
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.5 },
      });
    } catch (e) {}
  };

  // Load Demo Batch (6 Applicants)
  const handleLoadDemoBatchPending = () => {
    const demoItems: BatchQueueItem[] = SAMPLE_BATCH_APPLICANTS.map((applicant, index) => ({
      id: `demo-pending-${Date.now()}-${index + 1}-${applicant.fan.replace(/\s+/g, '')}`,
      fileName: `Fayda_Slip_${applicant.fullNameEnglish.replace(/\s+/g, '_')}.pdf`,
      fileSize: `${(178 + index * 14.5).toFixed(1)} KB`,
      status: 'pending',
      progress: 0,
      queuePosition: index + 1,
      processingStep: index === 0 ? '⏳ Next in Queue' : `⏳ Waiting in queue (#${index + 1})`,
      extractedData: { ...applicant },
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      selected: true,
    }));

    setQueue((prev) => [...demoItems, ...prev]);
    isBatchCancelledRef.current = false;
    isBatchPausedRef.current = false;
    setBatchPipelineStats((prev) => ({
      isActive: true,
      total: (prev.total || 0) + demoItems.length,
      completed: prev.completed || 0,
      speedFilesPerSec: prev.speedFilesPerSec || 0,
      elapsedSec: 0,
      currentFile: demoItems[0].fileName,
      isPaused: false,
    }));
    setPipelineBannerText('Loaded 6 demo files to batch queue');
    setTimeout(() => setPipelineBannerText(''), 4000);
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setQueue((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleDeleteItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDeleteSelected = () => {
    setQueue((prev) => prev.filter((item) => !item.selected));
  };

  // Remove all items with 'printed' status to keep the queue organized
  const handleClearPrinted = () => {
    const printedItems = queue.filter((item) => item.status === 'printed');
    if (printedItems.length === 0) {
      alert("No cards with 'printed' status found in the queue.");
      return;
    }
    setQueue((prev) => prev.filter((item) => item.status !== 'printed'));
  };

  // Toggle individual card between printed and ready
  const handleTogglePrinted = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newStatus = item.status === 'printed' ? 'ready' : 'printed';
        return { ...item, status: newStatus };
      })
    );
  };

  const handleDuplicateItem = (item: BatchQueueItem) => {
    const newItem: BatchQueueItem = {
      ...item,
      id: `dup-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fileName: `Copy_${item.fileName}`,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);
  };

  // Copy FAN
  const handleCopyFan = (id: string, fan: string) => {
    navigator.clipboard.writeText(fan);
    setCopiedFanId(id);
    setTimeout(() => setCopiedFanId(null), 2000);
  };

  // Toggle individual card's photo color mode (Color <-> Grayscale)
  const handleToggleItemColorMode = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentMode = item.photoColorMode || batchPhotoColorMode;
        const newMode = currentMode === 'grayscale' ? 'color' : 'grayscale';
        return { ...item, photoColorMode: newMode };
      })
    );
  };

  // Batch toggle: apply color or grayscale to all items
  const handleApplyColorModeToAll = (mode: 'color' | 'grayscale') => {
    setBatchPhotoColorMode(mode);
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        photoColorMode: mode,
      }))
    );
  };

  // Set specific template number for a queue item
  const handleSetItemTemplate = (id: string, tNum: number) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, templateNumber: tNum } : item))
    );
  };

  // Batch assign template to all cards
  const handleApplyTemplateToAll = (tNum: number) => {
    onSelectTemplateNumber?.(tNum);
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        templateNumber: tNum,
      }))
    );
  };

  // Batch Export A4 Multi-Page PDF
  const handleExportA4Pdf = async () => {
    const selectedItems = queue.filter((i) => i.selected && (i.status === 'ready' || i.status === 'printed'));
    if (selectedItems.length === 0) {
      alert('Please select at least one ready card from the queue to export.');
      return;
    }

    try {
      setIsExporting(true);
      await exportBatchToA4Pdf(
        selectedItems,
        config,
        templateConfig,
        {
          mirrorPrint: batchMirrorPrint,
          photoColorMode: batchPhotoColorMode,
          numberedTemplates,
          activeTemplateNumber,
          useStudioPositionsAlways: true,
        },
        (current, total, status) => {
          setExportProgress({ current, total, status });
        }
      );
      try {
        confetti({ particleCount: 70, spread: 60 });
      } catch (e) {}

      // Mark exported cards as 'printed'
      const exportedIds = new Set(selectedItems.map((i) => i.id));
      setQueue((prev) =>
        prev.map((it) => (exportedIds.has(it.id) ? { ...it, status: 'printed' } : it))
      );
    } catch (error) {
      console.error('Batch A4 PDF Export error:', error);
      alert('Failed to export batch PDF. Check browser console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  // Batch Export A4 High-Res PNG Sheets (Full Page, Solid White Background)
  const handleExportA4Png = async () => {
    const selectedItems = queue.filter((i) => i.selected && (i.status === 'ready' || i.status === 'printed'));
    if (selectedItems.length === 0) {
      alert('Please select at least one ready card from the queue to export.');
      return;
    }

    try {
      setIsExporting(true);
      await exportBatchToA4Png(
        selectedItems,
        config,
        templateConfig,
        {
          mirrorPrint: batchMirrorPrint,
          photoColorMode: batchPhotoColorMode,
          numberedTemplates,
          activeTemplateNumber,
          useStudioPositionsAlways: true,
        },
        (current, total, status) => {
          setExportProgress({ current, total, status });
        }
      );
      try {
        confetti({ particleCount: 70, spread: 60 });
      } catch (e) {}

      // Mark exported cards as 'printed'
      const exportedIds = new Set(selectedItems.map((i) => i.id));
      setQueue((prev) =>
        prev.map((it) => (exportedIds.has(it.id) ? { ...it, status: 'printed' } : it))
      );
    } catch (error) {
      console.error('Batch A4 PNG Export error:', error);
      alert('Failed to export batch PNG sheets. Check browser console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  // Batch Export ZIP Package
  const handleExportZip = async () => {
    const selectedItems = queue.filter((i) => i.selected && (i.status === 'ready' || i.status === 'printed'));
    if (selectedItems.length === 0) {
      alert('Please select at least one ready card from the queue to export.');
      return;
    }

    try {
      setIsExporting(true);
      await exportBatchToZipArchive(
        selectedItems,
        config,
        templateConfig,
        {
          mirrorPrint: batchMirrorPrint,
          quality: 0.92,
          photoColorMode: batchPhotoColorMode,
          numberedTemplates,
          activeTemplateNumber,
          useStudioPositionsAlways: true,
        },
        (current, total, status) => {
          setExportProgress({ current, total, status });
        }
      );
      try {
        confetti({ particleCount: 80, spread: 70 });
      } catch (e) {}

      // Mark exported cards as 'printed'
      const exportedIds = new Set(selectedItems.map((i) => i.id));
      setQueue((prev) =>
        prev.map((it) => (exportedIds.has(it.id) ? { ...it, status: 'printed' } : it))
      );
    } catch (error) {
      console.error('Batch ZIP Export error:', error);
      alert('Failed to export batch ZIP package. Check browser console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  // Edit Modal Save
  const handleSaveEdit = (
    updatedData: IdCardData,
    extra?: { photoColorMode?: 'color' | 'grayscale'; templateNumber?: number }
  ) => {
    if (!editingItem) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.id === editingItem.id
          ? {
              ...item,
              extractedData: updatedData,
              status: 'ready',
              ...(extra?.photoColorMode ? { photoColorMode: extra.photoColorMode } : {}),
              ...(extra?.templateNumber ? { templateNumber: extra.templateNumber } : {}),
            }
          : item
      )
    );
    setEditingItem(null);
  };

  // Filtered Items
  const filteredQueue = queue.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchQuery.trim() === '') return true;

    const q = searchQuery.toLowerCase();
    const data = item.extractedData;
    return (
      data.fullNameEnglish.toLowerCase().includes(q) ||
      data.fullNameAmharic.includes(q) ||
      data.fan.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')) ||
      data.regionEnglish.toLowerCase().includes(q) ||
      data.phoneNumber.includes(q) ||
      item.fileName.toLowerCase().includes(q)
    );
  });

  const selectedCount = queue.filter((i) => i.selected).length;
  const readyCount = queue.filter((i) => i.status === 'ready').length;
  const pendingCount = queue.filter((i) => i.status === 'pending').length;
  const printedCount = queue.filter((i) => i.status === 'printed').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Multi-file Dropzone Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider mb-2">
                <Layers className="w-3.5 h-3.5" />
                <span>Batch Processing & Queue Engine</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Upload & Process Multiple Fayda PDF Slips
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
                Batch extract multiple Ethiopian National ID verification slips simultaneously. Queue them for card generation, review or edit individual records, and export multi-page A4 print sheets or complete 300 DPI ZIP archives.
              </p>
            </div>

            {/* Quick Batch Stats */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-800/80 backdrop-blur-xs px-4 py-3 rounded-2xl border border-slate-700">
              <div className="text-center px-2">
                <p className="text-[10px] uppercase font-bold text-slate-400">Total in Queue</p>
                <p className="text-xl font-extrabold text-white">{queue.length}</p>
              </div>
              <div className="w-px h-8 bg-slate-700" />
              <div className="text-center px-2">
                <p className="text-[10px] uppercase font-bold text-emerald-400">Ready</p>
                <p className="text-xl font-extrabold text-emerald-400">{readyCount}</p>
              </div>
              <div className="w-px h-8 bg-slate-700" />
              <div className="text-center px-2">
                <p className="text-[10px] uppercase font-bold text-amber-400">Pending</p>
                <p className="text-xl font-extrabold text-amber-400">{pendingCount}</p>
              </div>
            </div>
          </div>

          {/* Multi-file Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all bg-slate-900/50 backdrop-blur-xs ${
              dragActive
                ? 'border-emerald-400 bg-emerald-950/40 scale-[1.005]'
                : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 text-left">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Drag and drop multiple PDF / Image verification slips here
                  </h4>
                  <p className="text-xs text-slate-400">
                    Supports selecting 10+ Fayda documents at once (PDF, PNG, JPG)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Choose Multiple Files</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={handleLoadDemoBatch}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Load Demo Batch (6 Cards)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Turbo Batch Pipeline & Queue Monitor Banner */}
      {(isProcessingBatch || queue.some((i) => i.status === 'processing' || i.status === 'pending')) && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-4 sm:p-5 border border-indigo-500/30 text-white shadow-xl space-y-3.5 animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-900/30 shrink-0">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">
                    Fast Batch Queue Pipeline
                  </h3>
                  {isProcessingBatch && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 animate-pulse">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      Active ({batchConcurrency} Concurrent Workers)
                    </span>
                  )}
                  {batchPipelineStats.isPaused && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Paused
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {pipelineBannerText ? (
                    <span className="text-emerald-300 font-semibold">{pipelineBannerText}</span>
                  ) : batchPipelineStats.total > 0
                    ? `Converting ${batchPipelineStats.completed} of ${batchPipelineStats.total} files (${Math.round((batchPipelineStats.completed / Math.max(1, batchPipelineStats.total)) * 100)}%)`
                    : `${queue.filter((i) => i.status === 'processing').length} active, ${queue.filter((i) => i.status === 'pending').length} waiting in queue`}
                </p>
              </div>
            </div>

            {/* Speed & Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Concurrency Selector */}
              <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs">
                <span className="text-[11px] text-slate-400 px-2 font-medium">Speed:</span>
                {[2, 4, 6].map((workers) => (
                  <button
                    key={workers}
                    type="button"
                    onClick={() => setBatchConcurrency(workers)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      batchConcurrency === workers
                        ? 'bg-emerald-500 text-slate-950 shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title={`${workers} parallel worker pipelines`}
                  >
                    {workers === 4 ? `${workers}x Turbo` : workers === 6 ? `${workers}x Max` : `${workers}x Safe`}
                  </button>
                ))}
              </div>

              {/* Pause / Resume Controls */}
              {(isProcessingBatch || isProcessingSingleItemRef.current) && (
                <button
                  type="button"
                  onClick={() => {
                    isBatchPausedRef.current = !isBatchPausedRef.current;
                    setBatchPipelineStats((prev) => ({ ...prev, isPaused: isBatchPausedRef.current }));
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  {batchPipelineStats.isPaused ? (
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Pause className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>{batchPipelineStats.isPaused ? 'Resume' : 'Pause'}</span>
                </button>
              )}

              {(isProcessingBatch || isProcessingSingleItemRef.current) && (
                <button
                  type="button"
                  onClick={() => {
                    isBatchCancelledRef.current = true;
                    setIsProcessingBatch(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  title="Cancel batch processing"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </button>
              )}

              {!isProcessingBatch && queue.some((i) => i.status === 'pending') && (
                <button
                  type="button"
                  onClick={() => runBatchExtraction()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Turbo Convert All</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar & Velocity Metric */}
          {batchPipelineStats.total > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="w-full bg-slate-800/90 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-700/80">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((batchPipelineStats.completed / Math.max(1, batchPipelineStats.total)) * 100))}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                <span className="flex items-center gap-2">
                  {batchPipelineStats.speedFilesPerSec > 0 && (
                    <span className="text-emerald-400 font-bold">⚡ {batchPipelineStats.speedFilesPerSec} files/sec</span>
                  )}
                  {batchPipelineStats.currentFile && (
                    <span className="text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                      Active: {batchPipelineStats.currentFile}
                    </span>
                  )}
                </span>
                <span>
                  {batchPipelineStats.completed} / {batchPipelineStats.total} Completed ({Math.round((batchPipelineStats.completed / Math.max(1, batchPipelineStats.total)) * 100)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Actions & Controls Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search queue by Name, FAN, Region, Phone..."
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                All ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ready')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'ready' ? 'bg-emerald-600 text-white shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Ready ({readyCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'pending' ? 'bg-amber-600 text-white shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('printed')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  statusFilter === 'printed' ? 'bg-indigo-600 text-white shadow-xs' : 'hover:text-slate-900'
                }`}
              >
                Printed ({printedCount})
              </button>
            </div>

            {/* View Mode Switcher: Table vs Grid */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Visual Card Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Card Grid</span>
              </button>
            </div>
          </div>

          {/* Global Batch Operations */}
          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => runBatchExtraction()}
                disabled={isProcessingBatch}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessingBatch ? 'animate-spin' : ''}`} />
                <span>Process Pending ({pendingCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const selectedItems = queue.filter((i) => (selectedCount > 0 ? i.selected : true) && (i.status === 'ready' || i.status === 'printed'));
                if (selectedItems.length === 0) {
                  alert('No ready or printed ID cards found in the queue to print. Please upload PDF slips or load demo cards.');
                  return;
                }
                if (selectedCount === 0) {
                  setQueue((prev) => prev.map((it) => (it.status === 'ready' || it.status === 'printed' ? { ...it, selected: true } : it)));
                }
                setIsA4PrintModalOpen(true);
              }}
              disabled={isExporting || (readyCount === 0 && printedCount === 0)}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-950/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print 5 IDs / A4 Sheet ({selectedCount || readyCount + printedCount})</span>
            </button>

            {/* PDF Slip Extractor Button */}
            <button
              type="button"
              onClick={() => setBatchSubView(batchSubView === 'extractor' ? 'queue' : 'extractor')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                batchSubView === 'extractor'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-950/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 shadow-xs'
              }`}
              title="Open the integrated PDF Slip Extractor to inspect, crop and add Fayda slips to the batch queue"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-300" />
              <span>PDF Slip Extractor</span>
            </button>

            {/* PDF Position Mapper Button */}
            <button
              type="button"
              onClick={() => setBatchSubView(batchSubView === 'mapper' ? 'queue' : 'mapper')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                batchSubView === 'mapper'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-950/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 shadow-xs'
              }`}
              title="Open the visual PDF Position Marker to drag and calibrate bounding boxes for the batch queue"
            >
              <Crosshair className="w-3.5 h-3.5 text-cyan-300" />
              <span>PDF Position Mapper</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenPositionEditor()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Calibrate & adjust field coordinates for batch files with live preview"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Position Editor</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTemplateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Upload custom front and back background artwork for numbered templates 1-20"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Template Backgrounds</span>
            </button>

            <button
              type="button"
              onClick={() => setBatchMirrorPrint(!batchMirrorPrint)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                batchMirrorPrint
                  ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
              title="Horizontally mirror cards for transparent inkjet PVC / transfer sheet printing"
            >
              <span className={`w-2 h-2 rounded-full ${batchMirrorPrint ? 'bg-blue-500' : 'bg-slate-400'}`}></span>
              <span>Mirror for PVC: {batchMirrorPrint ? 'ON' : 'OFF'}</span>
            </button>

            {/* Batch Photo Color Mode (All / Global) */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1.5 flex items-center gap-1">
                <span>Photos:</span>
              </span>
              <button
                type="button"
                onClick={() => handleApplyColorModeToAll('color')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  batchPhotoColorMode === 'color'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                }`}
                title="Apply Full Color portraits to all cards in the batch"
              >
                <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-cyan-400"></span>
                <span>All Color</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyColorModeToAll('grayscale')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  batchPhotoColorMode === 'grayscale'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                }`}
                title="Apply Black & White (Grayscale) portraits to all cards in the batch"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span>All B&W</span>
              </button>
            </div>

            {/* Batch Photo Background Cutout Button */}
            <button
              type="button"
              onClick={handleCutAllBackgrounds}
              disabled={isAutoCuttingBg || queue.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Remove background and make both Photo 1 and Photo 2 transparent for all cards in batch"
            >
              {isAutoCuttingBg ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  <span>Cutting Transparency...</span>
                </>
              ) : (
                <>
                  <Scissors className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ Make Both Photos Transparent</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportA4Pdf}
              disabled={isExporting || (readyCount === 0 && printedCount === 0)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Full-page 300 DPI A4 PDF with solid white background (5 IDs per page)"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export PDF (5/Page)</span>
            </button>

            <button
              type="button"
              onClick={handleExportA4Png}
              disabled={isExporting || (readyCount === 0 && printedCount === 0)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Full-page 300 DPI PNG sheets with solid white background (lossless print quality)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-white" />
              <span>Export PNG (300 DPI)</span>
            </button>

            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExporting || (readyCount === 0 && printedCount === 0)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              title="Compact ZIP package with high-res cards & manifest"
            >
              <Archive className="w-3.5 h-3.5 text-slate-500" />
              <span>ZIP Package</span>
            </button>

            {/* Clear Successfully Processed Button */}
            <button
              type="button"
              onClick={handleClearPrinted}
              disabled={printedCount === 0}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                printedCount > 0
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50'
              }`}
              title="Removes all items with 'printed' status to keep the queue organized"
            >
              <CheckCheck className={`w-3.5 h-3.5 ${printedCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
              <span>Clear Successfully Processed {printedCount > 0 ? `(${printedCount})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Selection Bar & Stats */}
        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={Boolean(queue.length > 0 && selectedCount === queue.length)}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              <span>Select All ({queue.length})</span>
            </label>

            {selectedCount > 0 && (
              <span className="text-slate-700 font-bold bg-slate-100 px-2.5 py-0.5 rounded-md">
                {selectedCount} selected
              </span>
            )}

            {onApplyStudioPositionsToAllTemplates ? (
              <button
                type="button"
                onClick={() => {
                  onApplyStudioPositionsToAllTemplates();
                  setAppliedToast(true);
                  setTimeout(() => setAppliedToast(false), 3000);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                  appliedToast
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}
                title="Automatically apply the field coordinates and positions calibrated in ID Card Studio to all batch cards and templates"
              >
                <Sparkles className={`w-3.5 h-3.5 ${appliedToast ? 'text-white' : 'text-emerald-600'}`} />
                <span>{appliedToast ? '✓ Studio Positions Synced to Batch!' : 'Auto-Sync Studio Positions to Batch'}</span>
              </button>
            ) : (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>ID Card Studio Positions Synced to Batch</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Template Slot Selector */}
            {numberedTemplates && numberedTemplates.length > 0 && onSelectTemplateNumber && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1.5 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  <span>Template:</span>
                </span>
                <div className="flex items-center gap-1">
                  {numberedTemplates.map((t) => {
                    const isAct = t.number === activeTemplateNumber;
                    return (
                      <button
                        key={t.number}
                        type="button"
                        onClick={() => onSelectTemplateNumber(t.number)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          isAct
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                        }`}
                        title={`${t.name} (Template #${t.number})`}
                      >
                        #{t.number}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {printedCount > 0 && (
              <button
                type="button"
                onClick={handleClearPrinted}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border border-rose-200 text-xs"
                title="Remove all successfully processed cards with 'printed' status"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Clear Successfully Processed ({printedCount})</span>
              </button>
            )}

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Selected</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Batch Primary View Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBatchSubView('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              batchSubView === 'queue'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Batch Cards Queue ({queue.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setBatchSubView('extractor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              batchSubView === 'extractor'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF Slip Extractor</span>
          </button>

          <button
            type="button"
            onClick={() => setBatchSubView('mapper')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              batchSubView === 'mapper'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>PDF Position Mapper</span>
          </button>
        </div>
      </div>

      {/* Embedded PDF Slip Extractor View */}
      {batchSubView === 'extractor' && (
        <div className="bg-slate-900/80 rounded-3xl p-4 sm:p-6 border border-emerald-500/30 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-slate-950/90 px-5 py-3 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <FileText className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  PDF Slip Extractor — Batch Intake
                </h3>
                <p className="text-[11px] text-slate-400">
                  Extract credentials, auto-crop photo, binarize Back FAN, and add directly to your batch printing queue.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBatchSubView('queue')}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              ← Back to Batch Queue ({queue.length})
            </button>
          </div>

          <PdfSlipExtractor
            idData={extractorSlipData}
            setIdData={setExtractorSlipData}
            config={config}
            templateConfig={templateConfig}
            initialWorkflowMode="auto"
            onApplyAndOpenStudio={() => setBatchSubView('queue')}
            onOpenBatch={() => setBatchSubView('queue')}
            onAddToBatchQueue={handleAddExtractedToBatchQueue}
            batchQueueCount={queue.length}
          />
        </div>
      )}

      {/* Embedded PDF Position Mapper View */}
      {batchSubView === 'mapper' && (
        <div className="bg-slate-900/80 rounded-3xl p-4 sm:p-6 border border-cyan-500/30 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-slate-950/90 px-5 py-3 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Crosshair className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  PDF Position Mapper & Region Calibrator
                </h3>
                <p className="text-[11px] text-slate-400">
                  Visually calibrate slip crop regions (Photo, QR, Barcode, Back FAN, text) directly on document canvas. Calibrations persist and apply to all batch items.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveAndApplyMapperPositions(getEffectiveRegions(), extractorSlipData)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                title="Save current PDF slip mapper coordinates and apply them to all batch queue items"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Positions & Apply to Batch</span>
              </button>

              <button
                type="button"
                onClick={() => setBatchSubView('queue')}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              >
                ← Back to Batch Queue ({queue.length})
              </button>
            </div>
          </div>

          <PdfSlipExtractor
            idData={extractorSlipData}
            setIdData={setExtractorSlipData}
            config={config}
            templateConfig={templateConfig}
            initialWorkflowMode="marker"
            onApplyAndOpenStudio={() => {
              handleSaveAndApplyMapperPositions(getEffectiveRegions(), extractorSlipData);
            }}
            onOpenBatch={() => setBatchSubView('queue')}
            onAddToBatchQueue={handleAddExtractedToBatchQueue}
            onSaveAndApplyPositions={(savedRegions, updatedData) => {
              handleSaveAndApplyMapperPositions(savedRegions, updatedData);
            }}
            onSaveToBatchConverter={(savedRegions, updatedData) => {
              handleSaveAndApplyMapperPositions(savedRegions, updatedData);
            }}
            batchQueueCount={queue.length}
          />
        </div>
      )}

      {/* Queue Items Table / List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredQueue.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">No ID Cards in Queue</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Upload your Fayda verification PDFs or click "Load Demo Batch" above to populate the queue.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleLoadDemoBatch}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 transition-colors cursor-pointer shadow-xs"
              >
                Load Ready Demo Batch (6 Applicants)
              </button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredQueue.map((item) => {
              const data = item.extractedData;
              const itemColorMode = item.photoColorMode || batchPhotoColorMode;
              const isGrayscale = itemColorMode === 'grayscale';
              const itemTemplateNum = item.templateNumber || activeTemplateNumber || 1;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border transition-all p-4 flex flex-col justify-between ${
                    item.selected
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                  }`}
                >
                  {/* Card Top: Checkbox, Template, Status */}
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(item.selected ?? true)}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-[11px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          Tpl #{itemTemplateNum}
                        </span>
                      </div>
                      {item.status === 'printed' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePrinted(item.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 cursor-pointer hover:bg-indigo-200 transition-colors"
                          title="Status: Successfully Printed (Click to toggle back to Ready)"
                        >
                          <CheckCheck className="w-3 h-3 text-indigo-600" />
                          <span>Printed</span>
                        </button>
                      ) : item.status === 'ready' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePrinted(item.id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer hover:bg-emerald-200 transition-colors"
                          title="Status: Ready (Click to mark as Printed)"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>
                            Ready
                            {item.processingDurationMs
                              ? ` (${(item.processingDurationMs / 1000).toFixed(1)}s)`
                              : ''}
                          </span>
                        </button>
                      ) : item.status === 'processing' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                          <span>Converting ({item.progress || 20}%)</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.queuePosition === 1 || item.processingStep?.includes('Next')
                              ? 'bg-amber-50 text-amber-800 border border-amber-300 ring-1 ring-amber-300/60'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.queuePosition === 1 || item.processingStep?.includes('Next') ? (
                            <FastForward className="w-3 h-3 text-amber-600" />
                          ) : (
                            <Clock className="w-3 h-3 text-slate-500" />
                          )}
                          <span>
                            {item.queuePosition === 1 || item.processingStep?.includes('Next')
                              ? '⏳ Next in Queue'
                              : `In Queue (#${item.queuePosition || '—'})`}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Step info sub-bar for processing or waiting items */}
                    {(item.status === 'processing' || item.status === 'pending') && (
                      <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px]">
                        <div className="flex items-center justify-between text-slate-600 mb-1">
                          <span className="truncate font-medium">
                            {item.processingStep || (item.status === 'processing' ? 'Processing slip...' : 'Waiting in line...')}
                          </span>
                          {item.status === 'processing' && (
                            <span className="font-mono font-bold text-amber-700">{item.progress || 20}%</span>
                          )}
                        </div>
                        {item.status === 'processing' && (
                          <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-amber-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${item.progress || 20}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Middle: Portrait + Info */}
                    <div className="flex items-start gap-3">
                      <div
                        onClick={() => handleOpenPhotoAdjust(item)}
                        className="relative group cursor-pointer shrink-0"
                        title="Click to adjust or cutout photo"
                      >
                        <div className="w-16 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-2xs">
                          {data.photoUrl ? (
                            <img
                              src={data.photoUrl}
                              alt={data.fullNameEnglish}
                              className={`w-full h-full object-cover ${isGrayscale ? 'grayscale' : ''}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <User className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <span className="absolute -bottom-1 -right-1 bg-slate-900 text-white p-1 rounded-full text-[9px] shadow-xs group-hover:bg-emerald-600 transition-colors">
                          <Scissors className="w-2.5 h-2.5" />
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <h4 className="font-bold text-slate-900 text-xs truncate leading-tight">
                          {data.fullNameAmharic || 'ስም የለም'}
                        </h4>
                        <p className="text-slate-600 text-[11px] truncate font-medium">
                          {data.fullNameEnglish || 'No English Name'}
                        </p>
                        <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded w-fit">
                          <span>{data.fan || 'FAN N/A'}</span>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {data.sex === 'Male' ? 'ወንድ (M)' : 'ሴት (F)'} • E.C: {data.dateOfBirthEth || 'N/A'}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {data.region || 'Ethiopia'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1">
                    {item.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleProcessSingleItem(item)}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                        title="Process this file immediately"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Process</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewItem(item);
                        setPreviewSide('front');
                      }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenPositionEditor(item.id)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Calibrate positions"
                    >
                      <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenPhotoAdjust(item)}
                      className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove Background & Adjust Photo"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit details"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePrinted(item.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        item.status === 'printed'
                          ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                          : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                      }`}
                      title={item.status === 'printed' ? "Mark as Ready (unprinted)" : "Mark as Successfully Printed"}
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(queue.length > 0 && selectedCount === queue.length)}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">Applicant</th>
                  <th className="py-3.5 px-3 text-center">Photo Mode</th>
                  <th className="py-3.5 px-3 text-center">Template</th>
                  <th className="py-3.5 px-4">FAN & Security ID</th>
                  <th className="py-3.5 px-4">Region / Address</th>
                  <th className="py-3.5 px-4">DOB / Sex</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQueue.map((item, index) => {
                  const data = item.extractedData;
                  const itemColorMode = item.photoColorMode || batchPhotoColorMode;
                  const isGrayscale = itemColorMode === 'grayscale';
                  const itemTemplateNum = item.templateNumber || activeTemplateNumber || 1;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.selected ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(item.selected ?? true)}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Applicant Photo & Bilingual Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 shadow-2xs relative">
                            <img
                              src={data.photoUrl}
                              alt={data.fullNameEnglish}
                              className={`w-full h-full object-cover transition-all ${
                                isGrayscale ? 'grayscale contrast-115' : ''
                              }`}
                            />
                            {isGrayscale && (
                              <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] text-white font-mono font-bold text-center py-0.2">
                                B&W
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {data.fullNameEnglish}
                            </div>
                            <div className="text-slate-600 text-xs font-semibold">
                              {data.fullNameAmharic}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[160px] mt-0.5">
                              {item.fileName}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Photo Mode (Color / Grayscale) */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleItemColorMode(item.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer border shadow-2xs ${
                            isGrayscale
                              ? 'bg-slate-900 border-slate-700 text-white hover:bg-slate-800'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                          }`}
                          title={`Click to switch to ${isGrayscale ? 'Full Color' : 'Black & White (Grayscale)'}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isGrayscale
                                ? 'bg-slate-400'
                                : 'bg-gradient-to-tr from-amber-400 via-rose-500 to-cyan-400'
                            }`}
                          />
                          <span>{isGrayscale ? 'B&W' : 'Color'}</span>
                        </button>
                      </td>

                      {/* Template Slot Selection */}
                      <td className="py-3 px-3 text-center">
                        <select
                          value={itemTemplateNum}
                          onChange={(e) => handleSetItemTemplate(item.id, parseInt(e.target.value, 10))}
                          className="bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold rounded-lg px-2 py-1 outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
                          title="Assigned template & saved coordinate positions for this card"
                        >
                          {(numberedTemplates && numberedTemplates.length > 0
                            ? numberedTemplates
                            : [1, 2, 3, 4, 5].map((n) => ({ number: n, name: `Template #${n}` }))
                          ).map((t) => (
                            <option key={t.number} value={t.number}>
                              #{t.number}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* FAN */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                            <span>{data.fan}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyFan(item.id, data.fan)}
                              className="text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="Copy FAN Number"
                            >
                              {copiedFanId === item.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            SN : {format7DigitSerial(data.serialNumber || '9482019482')}
                          </div>
                        </div>
                      </td>

                      {/* Address */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5 text-slate-700">
                          <div className="font-bold text-slate-900">
                            {data.regionEnglish} ({data.regionAmharic})
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {data.zoneEnglish} • {data.woredaEnglish}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            📞 {data.phoneNumber}
                          </div>
                        </div>
                      </td>

                      {/* DOB / Sex */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5 text-slate-700">
                          <div className="font-semibold font-mono text-xs">
                            {formatCardDualDate(data.dateOfBirth, data.dateOfBirthEth, 'eth_with_gc', { gcMonthName: false })}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            E.C: {data.dateOfBirthEth || 'N/A'} • G.C: {data.dateOfBirth}
                          </div>
                          <div className="text-[10px] font-bold text-slate-600">
                            {data.sex === 'Male' ? 'ወንድ (M)' : 'ሴት (F)'}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {item.status === 'printed' ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePrinted(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 cursor-pointer hover:bg-indigo-200 transition-colors"
                            title="Status: Successfully Printed (Click to toggle back to Ready)"
                          >
                            <CheckCheck className="w-3 h-3 text-indigo-600" />
                            <span>Printed</span>
                          </button>
                        ) : item.status === 'ready' ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePrinted(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer hover:bg-emerald-200 transition-colors"
                            title="Status: Ready (Click to mark as Printed)"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>
                              Ready
                              {item.processingDurationMs
                                ? ` (${(item.processingDurationMs / 1000).toFixed(1)}s)`
                                : ''}
                            </span>
                          </button>
                        ) : item.status === 'processing' ? (
                          <div className="space-y-1 min-w-[130px]">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                              <span>Converting ({item.progress || 20}%)</span>
                            </span>
                            <p className="text-[10px] text-slate-500 truncate max-w-[140px]">
                              {item.processingStep || 'Processing slip...'}
                            </p>
                            <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                              <div
                                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${item.progress || 20}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5 min-w-[120px]">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                item.queuePosition === 1 || item.processingStep?.includes('Next')
                                  ? 'bg-amber-50 text-amber-800 border border-amber-300 ring-1 ring-amber-300/60'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {item.queuePosition === 1 || item.processingStep?.includes('Next') ? (
                                <FastForward className="w-3 h-3 text-amber-600" />
                              ) : (
                                <Clock className="w-3 h-3 text-slate-400" />
                              )}
                              <span>
                                {item.queuePosition === 1 || item.processingStep?.includes('Next')
                                  ? '⏳ Next in Queue'
                                  : `In Queue (#${item.queuePosition || '—'})`}
                              </span>
                            </span>
                            <p className="text-[10px] text-slate-400">
                              {item.queuePosition === 1 || item.processingStep?.includes('Next')
                                ? 'Next to be picked up'
                                : 'Waiting in line'}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleProcessSingleItem(item)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                              title="Process this file immediately"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Process</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewItem(item);
                              setPreviewSide('front');
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                            title="Interactive live dual-side card preview & single-card print"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickAutoCutout(item)}
                            disabled={autoCuttingId === item.id || (!item.extractedData.photoUrl && !item.extractedData.secondaryPhotoUrl)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                            title="1-Click: Make both Photo 1 and Photo 2 backgrounds transparent"
                          >
                            {autoCuttingId === item.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                            ) : (
                              <Scissors className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            <span className="hidden sm:inline">⚡ Both Transparent</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenPhotoAdjust(item, 'background')}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                            title="Fine-tune background cutout & photo adjustment"
                          >
                            <Scissors className="w-3.5 h-3.5 text-amber-600" />
                            <span className="hidden xl:inline">Cutout Studio</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenPositionEditor(item.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                            title="Adjust field positions for this card or batch"
                          >
                            <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Positions</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicateItem(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Duplicate"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePrinted(item.id)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              item.status === 'printed'
                                ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                            }`}
                            title={item.status === 'printed' ? "Mark as Ready (unprinted)" : "Mark as Successfully Printed"}
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Progress Modal / Toast */}
      {isExporting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center shadow-inner">
              <RefreshCw className="w-7 h-7 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Batch Generating 300 DPI ID Cards
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {exportProgress.status || 'Composing high-resolution print files...'}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Processing item {exportProgress.current} of {exportProgress.total}
            </p>
          </div>
        </div>
      )}

      {/* Quick Edit Modal */}
      {editingItem && (
        <EditApplicantModal
          item={editingItem}
          numberedTemplates={numberedTemplates}
          activeTemplateNumber={activeTemplateNumber}
          onSave={handleSaveEdit}
          onClose={() => setEditingItem(null)}
        />
      )}

      {/* A4 Batch Print & Layout Studio Modal */}
      {isA4PrintModalOpen && (
        <A4BatchPrintModal
          isOpen={isA4PrintModalOpen}
          onClose={() => setIsA4PrintModalOpen(false)}
          items={queue}
          config={config}
          templateConfig={templateConfig}
          numberedTemplates={numberedTemplates}
          activeTemplateNumber={activeTemplateNumber}
          initialPhotoColorMode={batchPhotoColorMode}
          onApplyStudioPositionsToAllTemplates={onApplyStudioPositionsToAllTemplates}
          onOpenPositionEditor={() => setIsPositionEditorOpen(true)}
          onMarkPrinted={(printedIds) => {
            const idSet = new Set(printedIds);
            setQueue((prev) =>
              prev.map((it) => (idSet.has(it.id) ? { ...it, status: 'printed' } : it))
            );
          }}
        />
      )}

      {/* Batch Field Position Editor Modal */}
      {isPositionEditorOpen && (
        <BatchPositionEditorModal
          isOpen={isPositionEditorOpen}
          onClose={() => setIsPositionEditorOpen(false)}
          queue={queue}
          setQueue={setQueue}
          initialItemId={selectedPositionEditorItemId}
          config={config}
          templateConfig={templateConfig}
          activeTemplateNumber={activeTemplateNumber}
          onSelectTemplateNumber={onSelectTemplateNumber}
          numberedTemplates={numberedTemplates}
          onSaveBatchConfig={handleSaveBatchPositions}
          onApplyStudioPositionsToAllTemplates={onApplyStudioPositionsToAllTemplates}
        />
      )}

      {/* Custom Template Backgrounds Modal */}
      {isTemplateModalOpen && (
        <CustomTemplateModal
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          templateConfig={templateConfig}
          setTemplateConfig={setTemplateConfig || (() => {})}
          config={config}
          setConfig={setConfig}
          activeTemplateNumber={activeTemplateNumber}
          onSelectTemplateNumber={onSelectTemplateNumber}
          numberedTemplates={numberedTemplates}
          onUpdateNumberedTemplates={onUpdateNumberedTemplates}
        />
      )}

      {/* Biometric Photo Cutout & Adjust Modal */}
      {photoAdjustItem && (
        <PhotoAdjustModal
          isOpen={Boolean(photoAdjustItem)}
          onClose={() => setPhotoAdjustItem(null)}
          originalPhotoUrl={photoAdjustItem.extractedData.photoUrl || ''}
          onApplyPhoto={handleApplyAdjustedPhoto}
          applicantName={photoAdjustItem.extractedData.fullNameEnglish || photoAdjustItem.extractedData.fullNameAmharic || 'Applicant'}
          initialTab={photoAdjustTab}
          photoColorMode={photoAdjustItem.photoColorMode || batchPhotoColorMode}
          onToggleColorMode={() => {
            const newMode = (photoAdjustItem.photoColorMode || batchPhotoColorMode) === 'color' ? 'grayscale' : 'color';
            setQueue((prev) =>
              prev.map((it) => (it.id === photoAdjustItem.id ? { ...it, photoColorMode: newMode } : it))
            );
            setPhotoAdjustItem((prev) => (prev ? { ...prev, photoColorMode: newMode } : null));
          }}
        />
      )}

      {/* Interactive Live Card Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 text-white rounded-3xl border border-slate-700 shadow-2xl max-w-4xl w-full p-6 space-y-5 my-auto">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-white">
                    {previewItem.extractedData.fullNameAmharic || previewItem.extractedData.fullNameEnglish}
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-700 px-2 py-0.5 rounded-full">
                    FAN: {previewItem.extractedData.fan || 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {previewItem.extractedData.fullNameEnglish} • Template #{previewItem.templateNumber || activeTemplateNumber || 1}
                </p>
              </div>

              {/* Controls: Side toggle, Color mode, Zoom */}
              <div className="flex items-center gap-2">
                {/* Side Toggle */}
                <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPreviewSide('front')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      previewSide === 'front' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Front Side
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewSide('back')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      previewSide === 'back' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Back Side
                  </button>
                </div>

                {/* Flip button */}
                <button
                  type="button"
                  onClick={() => setPreviewSide((prev) => (prev === 'front' ? 'back' : 'front'))}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-colors cursor-pointer"
                  title="Flip card side"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                {/* Color Mode Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const currentMode = previewItem.photoColorMode || batchPhotoColorMode;
                    const nextMode = currentMode === 'color' ? 'grayscale' : 'color';
                    setQueue((prev) =>
                      prev.map((it) => (it.id === previewItem.id ? { ...it, photoColorMode: nextMode } : it))
                    );
                    setPreviewItem({ ...previewItem, photoColorMode: nextMode });
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    (previewItem.photoColorMode || batchPhotoColorMode) === 'grayscale'
                      ? 'bg-slate-800 text-slate-300 border-slate-600'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
                  }`}
                >
                  {(previewItem.photoColorMode || batchPhotoColorMode) === 'grayscale' ? 'Photo: B&W' : 'Photo: Color'}
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Card Visual Stage */}
            <div className="bg-slate-950/60 rounded-2xl border border-slate-800/80 p-6 flex items-center justify-center min-h-[380px] overflow-auto">
              <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'center center', transition: 'transform 0.2s' }}>
                {(() => {
                  const itemTplNum = previewItem.templateNumber || activeTemplateNumber || 1;
                  const itemTpl = numberedTemplates?.find((t) => t.number === itemTplNum);
                  const effectiveTplConfig = itemTpl?.config || templateConfig;
                  const effectiveCoords =
                    previewItem.customCoordinates ||
                    itemTpl?.coordinates ||
                    loadTemplateCoordinates(itemTplNum) ||
                    config;
                  return (
                    <CardRenderer
                      side={previewSide}
                      data={previewItem.extractedData}
                      config={effectiveCoords}
                      templateConfig={effectiveTplConfig}
                      photoColorMode={previewItem.photoColorMode || batchPhotoColorMode}
                      showCornerMarks={effectiveTplConfig.showCornerMarks}
                    />
                  );
                })()}
              </div>
            </div>

            {/* Bottom Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {/* Previous / Next Card in Queue */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const idx = filteredQueue.findIndex((it) => it.id === previewItem.id);
                    if (idx > 0) setPreviewItem(filteredQueue[idx - 1]);
                    else if (filteredQueue.length > 0) setPreviewItem(filteredQueue[filteredQueue.length - 1]);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = filteredQueue.findIndex((it) => it.id === previewItem.id);
                    if (idx !== -1 && idx < filteredQueue.length - 1) setPreviewItem(filteredQueue[idx + 1]);
                    else if (filteredQueue.length > 0) setPreviewItem(filteredQueue[0]);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>Next Card</span>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1 ml-3 bg-slate-800 p-1 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewScale((s) => Math.max(0.7, +(s - 0.1).toFixed(1)))}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] px-1.5 text-slate-300">{Math.round(previewScale * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setPreviewScale((s) => Math.min(1.4, +(s + 0.1).toFixed(1)))}
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card Actions: Cutout, Positions, Edit, PNG, Print */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickAutoCutout(previewItem)}
                  disabled={autoCuttingId === previewItem.id || (!previewItem.extractedData.photoUrl && !previewItem.extractedData.secondaryPhotoUrl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  title="Instantly make both Photo 1 and Photo 2 backgrounds transparent"
                >
                  {autoCuttingId === previewItem.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                  ) : (
                    <Scissors className="w-3.5 h-3.5 text-emerald-300" />
                  )}
                  <span>⚡ Make Both Photos Transparent</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPhotoAdjust(previewItem, 'background')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Fine-tune background cutout & photo adjustment"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cutout Studio</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleOpenPositionEditor(previewItem.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Calibrate Positions</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingItem(previewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Edit Fields</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadCardPng(previewItem, 'front')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Download Front 300 DPI PNG"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Front PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadCardPng(previewItem, 'back')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  title="Download Back 300 DPI PNG"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Back PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintSingleCard(previewItem)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print This Card</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for Quick Edit Modal
interface EditApplicantModalProps {
  item: BatchQueueItem;
  numberedTemplates?: NumberedTemplate[];
  activeTemplateNumber?: number;
  onSave: (
    data: IdCardData,
    extra?: { photoColorMode?: 'color' | 'grayscale'; templateNumber?: number }
  ) => void;
  onClose: () => void;
}

const EditApplicantModal: React.FC<EditApplicantModalProps> = ({
  item,
  numberedTemplates,
  activeTemplateNumber,
  onSave,
  onClose,
}) => {
  const [formData, setFormData] = useState<IdCardData>(item.extractedData);
  const [photoColorMode, setPhotoColorMode] = useState<'color' | 'grayscale'>(
    item.photoColorMode || 'color'
  );
  const [templateNumber, setTemplateNumber] = useState<number>(
    item.templateNumber || activeTemplateNumber || 1
  );

  const handleChange = (field: keyof IdCardData, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'dateOfBirth') {
        const eth = convertGcToEth(value);
        if (eth) updated.dateOfBirthEth = eth;
      }
      return updated;
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFormData((prev) => ({ ...prev, photoUrl: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 space-y-5 my-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Edit Applicant: {formData.fullNameEnglish}
            </h3>
            <p className="text-xs text-slate-500">{item.fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Photo Preview & Replace */}
          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-18 rounded-xl overflow-hidden border border-slate-300 bg-white shadow-2xs shrink-0 relative">
                <img
                  src={formData.photoUrl}
                  alt="Applicant"
                  className={`w-full h-full object-cover transition-all ${
                    photoColorMode === 'grayscale' ? 'grayscale contrast-115' : ''
                  }`}
                />
                {photoColorMode === 'grayscale' && (
                  <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] text-white font-mono font-bold text-center py-0.2">
                    B&W
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Applicant Portrait Photo</p>
                <p className="text-[11px] text-slate-500 mb-2">Upload replacement passport photo</p>
                <label className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5">
                  <Upload className="w-3 h-3" />
                  <span>Replace Photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Photo Color Mode & Assigned Template */}
            <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Photo Mode
                </label>
                <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-200 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setPhotoColorMode('color')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      photoColorMode === 'color'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Color
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoColorMode('grayscale')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      photoColorMode === 'grayscale'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    B&W
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Template
                </label>
                <select
                  value={templateNumber}
                  onChange={(e) => setTemplateNumber(parseInt(e.target.value, 10))}
                  className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1 outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
                >
                  {(numberedTemplates && numberedTemplates.length > 0
                    ? numberedTemplates
                    : [1, 2, 3, 4, 5].map((n) => ({ number: n, name: `Template #${n}` }))
                  ).map((t) => (
                    <option key={t.number} value={t.number}>
                      Template #{t.number}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Amharic Full Name (ሙሉ ስም)</label>
            <input
              type="text"
              value={formData.fullNameAmharic || ''}
              onChange={(e) => handleChange('fullNameAmharic', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">English Full Name</label>
            <input
              type="text"
              value={formData.fullNameEnglish || ''}
              onChange={(e) => handleChange('fullNameEnglish', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">16-Digit FAN</label>
            <input
              type="text"
              value={formData.fan || ''}
              onChange={(e) => handleChange('fan', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-mono font-bold mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Phone Number (ስልክ)</label>
            <input
              type="text"
              value={formData.phoneNumber || ''}
              onChange={(e) => handleChange('phoneNumber', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Date of Birth (Eth / E.C.)</label>
            <input
              type="text"
              value={formData.dateOfBirthEth || ''}
              onChange={(e) => handleChange('dateOfBirthEth', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Date of Birth (GC - YYYY/MM/DD)</label>
            <input
              type="text"
              value={formData.dateOfBirth || ''}
              onChange={(e) => handleChange('dateOfBirth', e.target.value)}
              onBlur={(e) => {
                const formatted = formatGcyyyyMmDd(e.target.value);
                if (formatted && formatted !== e.target.value) {
                  setFormData((prev) => ({ ...prev, dateOfBirth: formatted }));
                }
              }}
              placeholder="YYYY/MM/DD"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Region (ክልል)</label>
            <input
              type="text"
              value={formData.regionEnglish || ''}
              onChange={(e) => handleChange('regionEnglish', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Zone / Subcity</label>
            <input
              type="text"
              value={formData.zoneEnglish || ''}
              onChange={(e) => handleChange('zoneEnglish', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          {/* Date of Issue GC & Eth */}
          <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Date of Issue (የተሰጠበት ቀን)</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                Auto-Updated Today
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 font-semibold block">Gregorian (G.C.)</label>
                <input
                  type="text"
                  value={formData.dateOfIssue || ''}
                  onBlur={(e) => {
                    const formatted = formatGcWith3LetterMonth(e.target.value);
                    if (formatted && formatted !== e.target.value) {
                      const eth = convertGcToEth(formatted) || formData.dateOfIssueEth;
                      const exp = calculateExpiryFromIssue(formatted, eth);
                      setFormData((prev) => ({
                        ...prev,
                        dateOfIssue: formatted,
                        dateOfIssueEth: eth,
                        ...(exp ? { dateOfExpiry: exp.expiryGc, dateOfExpiryEth: exp.expiryEth } : {}),
                      }));
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    const eth = convertGcToEth(val);
                    const exp = calculateExpiryFromIssue(val, eth || formData.dateOfIssueEth);
                    setFormData((prev) => ({
                      ...prev,
                      dateOfIssue: val,
                      dateOfIssueEth: eth || prev.dateOfIssueEth,
                      ...(exp ? { dateOfExpiry: exp.expiryGc, dateOfExpiryEth: exp.expiryEth } : {}),
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-semibold block">Ethiopian (E.C.)</label>
                <input
                  type="text"
                  value={formData.dateOfIssueEth || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const gc = convertEthToGc(val);
                    const exp = calculateExpiryFromIssue(gc || formData.dateOfIssue, val);
                    setFormData((prev) => ({
                      ...prev,
                      dateOfIssueEth: val,
                      dateOfIssue: gc || prev.dateOfIssue,
                      ...(exp ? { dateOfExpiry: exp.expiryGc, dateOfExpiryEth: exp.expiryEth } : {}),
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(formData, { photoColorMode, templateNumber })}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

function generateRandomFan(): string {
  const p1 = Math.floor(1000 + Math.random() * 9000);
  const p2 = Math.floor(1000 + Math.random() * 9000);
  const p3 = Math.floor(1000 + Math.random() * 9000);
  const p4 = Math.floor(1000 + Math.random() * 9000);
  return `${p1} ${p2} ${p3} ${p4}`;
}
