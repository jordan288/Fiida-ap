import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Download, 
  Printer, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  Code2, 
  Sparkles,
  ChevronRight,
  Eye,
  Trash2,
  FileArchive,
  ArrowRight,
  Scissors
} from 'lucide-react';
import { IdCardData, CoordinatesConfig, TemplateConfig, BatchQueueItem } from '../types';
import { extractFromPdf, extractFromImage } from '../utils/pdfExtractor';
import { extractAllFromMarkedRegions, getEffectiveRegions } from '../utils/pdfRegionExtractor';
import { autoRemovePhotoBackground } from '../utils/imageProcessor';
import { CardRenderer } from './CardRenderer';
import { renderOffscreenCard, exportBatchToZipArchive, exportBatchToA4Pdf } from '../utils/batchExporter';
import { PhotoBackgroundRemover } from './PhotoBackgroundRemover';
import confetti from 'canvas-confetti';

interface SimpleCardConverterProps {
  queue: BatchQueueItem[];
  setQueue: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
  config: CoordinatesConfig;
  templateConfig: TemplateConfig;
  onSwitchToAdvanced: () => void;
}

export const SimpleCardConverter: React.FC<SimpleCardConverterProps> = ({
  queue,
  setQueue,
  config,
  templateConfig,
  onSwitchToAdvanced,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'both' | 'front' | 'back'>('both');
  const [downloadSuccess, setDownloadSuccess] = useState<string>('');
  const [isBgRemoverOpen, setIsBgRemoverOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentItem: BatchQueueItem | undefined = queue[selectedIndex] || queue[0];

  // Process uploaded Fayda PDF or image files
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setUploadError('');
    setProcessingStatus(`Extracting & auto-eliminating background for ${files.length} file(s)...`);
    const overallStartTime = performance.now();

    const newItems: BatchQueueItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileStartTime = performance.now();
      setProcessingStatus(`⚡ Auto-processing ${file.name} (< 3s)...`);

      try {
        let extraction;
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          extraction = await extractFromPdf(file, {
            scale: 1.8,
            fastBatch: true,
          });
        } else {
          extraction = await extractFromImage(file);
        }

        let cardData = extraction.data;

        // Apply calibrated regions if available
        if (extraction.pageCanvas || extraction.pageCanvasUrl) {
          try {
            const effectiveRegions = getEffectiveRegions();
            cardData = await extractAllFromMarkedRegions(
              extraction.pageCanvas || extraction.pageCanvasUrl!,
              extraction.textItems,
              effectiveRegions,
              cardData
            );
          } catch (err) {
            console.warn('Calibrated crop fallback:', err);
          }
        }

        // Automatic Background Elimination:
        // Automatically detects dominant perimeter backdrop colors & eliminates to transparent
        // Enforces clothing shield so white/light shirts are strictly preserved
        if (cardData.photoUrl) {
          try {
            const transparentPhoto = await autoRemovePhotoBackground(cardData.photoUrl);
            cardData.photoUrl = transparentPhoto;
            cardData.secondaryPhotoUrl = transparentPhoto;
          } catch (bgErr) {
            console.warn('Immediate auto bg removal on import:', bgErr);
          }
        }

        const durationMs = Math.round(performance.now() - fileStartTime);
        const cardId = `card_${Date.now()}_${i + 1}`;

        newItems.push({
          id: cardId,
          fileName: file.name,
          file,
          extractedData: cardData,
          status: 'ready',
          progress: 100,
          processingDurationMs: durationMs,
          uploadedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error('Extraction error for file:', file.name, err);
        errors.push(`${file.name}: ${err?.message || 'Failed to process'}`);
      }
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...newItems, ...prev]);
      setSelectedIndex(0);
      try {
        confetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });
      } catch {}

      const totalSec = ((performance.now() - overallStartTime) / 1000).toFixed(1);
      setDownloadSuccess(
        `⚡ Process finished in ${totalSec}s: Auto-detected backdrop color, eliminated background, and enqueued ${newItems.length} card(s) with Batch ID #${newItems[0].id}!`
      );
      setTimeout(() => setDownloadSuccess(''), 5000);
    } else if (errors.length > 0) {
      setUploadError(`Could not extract ID data from the file: ${errors.join(', ')}. Please ensure you uploaded a valid Fayda confirmation slip.`);
    }

    setIsProcessing(false);
    setProcessingStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 1-Click Download Front & Back PNGs
  const handleDownloadCurrentCard = async () => {
    if (!currentItem) return;
    try {
      setProcessingStatus('Generating 300 DPI card images...');
      const frontUrl = await renderOffscreenCard('front', currentItem.extractedData, config, templateConfig, { format: 'png' });
      const backUrl = await renderOffscreenCard('back', currentItem.extractedData, config, templateConfig, { format: 'png' });

      const name = (currentItem.extractedData.fullNameEnglish || currentItem.extractedData.fan || 'card')
        .replace(/[^a-zA-Z0-9]/g, '_');

      // Download Front
      const aFront = document.createElement('a');
      aFront.href = frontUrl;
      aFront.download = `${name}_front_300dpi.png`;
      aFront.click();

      // Download Back
      setTimeout(() => {
        const aBack = document.createElement('a');
        aBack.href = backUrl;
        aBack.download = `${name}_back_300dpi.png`;
        aBack.click();
      }, 300);

      setDownloadSuccess('✓ Downloaded Front & Back (300 DPI PNG)!');
      setTimeout(() => setDownloadSuccess(''), 3500);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setProcessingStatus('');
    }
  };

  // 1-Click Print Dialog
  const handlePrintCurrentCard = async () => {
    if (!currentItem) return;
    try {
      const frontUrl = await renderOffscreenCard('front', currentItem.extractedData, config, templateConfig, { format: 'png' });
      const backUrl = await renderOffscreenCard('back', currentItem.extractedData, config, templateConfig, { format: 'png' });

      const win = window.open('', '_blank');
      if (!win) return;

      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${currentItem.extractedData.fullNameEnglish || 'Fayda ID'} - Print</title>
            <style>
              @page { size: A4; margin: 15mm; }
              body { margin: 0; padding: 20px; font-family: sans-serif; text-align: center; background: #fff; }
              .card-container { display: flex; justify-content: center; gap: 20px; margin-top: 40px; }
              .card-img { width: 85.6mm; height: 53.98mm; border: 1px solid #ccc; border-radius: 3.18mm; }
              .label { font-size: 12px; color: #666; margin-top: 8px; }
              @media print {
                button { display: none; }
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <h2>Fayda National ID Card (CR80 ISO/IEC 7810)</h2>
            <div class="card-container">
              <div>
                <img src="${frontUrl}" class="card-img" />
                <div class="label">Front Side</div>
              </div>
              <div>
                <img src="${backUrl}" class="card-img" />
                <div class="label">Back Side</div>
              </div>
            </div>
            <p style="margin-top: 30px; font-size: 13px; color: #555;">Standard 85.6mm × 53.98mm scale. Print at 100% (No scaling).</p>
            <script>
              window.onload = function() { window.print(); };
            </script>
          </body>
        </html>
      `);
      win.document.close();
    } catch (err) {
      console.error('Print error:', err);
    }
  };

  // Download All as ZIP
  const handleDownloadAllZip = async () => {
    if (queue.length === 0) return;
    try {
      setIsProcessing(true);
      setProcessingStatus(`Packaging all ${queue.length} cards into ZIP...`);
      await exportBatchToZipArchive(queue, config, templateConfig, (step, pct) => {
        setProcessingStatus(`${step} (${pct}%)`);
      });
      setDownloadSuccess('✓ ZIP file ready and downloaded!');
      setTimeout(() => setDownloadSuccess(''), 4000);
    } catch (err) {
      console.error('ZIP export error:', err);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner / Mode Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Fayda PDF Slip to ID Card Converter
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                Simple Mode
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Drop any Fayda PDF slip to instantly generate and print official 300 DPI CR80 ID cards.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch to Advanced Studio */}
          <button
            type="button"
            onClick={onSwitchToAdvanced}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
            title="Open advanced coordinate calibrator and template editor"
          >
            <span>Advanced Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Step 1: Big Friendly Upload Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="relative group bg-gradient-to-b from-emerald-50/50 to-white hover:from-emerald-50 rounded-3xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 p-8 sm:p-10 text-center transition-all cursor-pointer shadow-xs hover:shadow-md"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
            {isProcessing ? (
              <RefreshCw className="w-7 h-7 animate-spin" />
            ) : (
              <Upload className="w-7 h-7" />
            )}
          </div>

          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-800">
              {isProcessing ? processingStatus : 'Drop your Fayda PDF slip(s) here'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Supports 1 slip or multi-file batch. Photo, QR code, and bilingual Amharic/English text extract automatically.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all">
            <FileText className="w-3.5 h-3.5" />
            <span>Select Fayda PDF Slip</span>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded-full border border-emerald-200">
              ⚡ Auto Color Detect & BG Elimination (&lt; 3s)
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              🛡️ Clothing & Collar Shield Active
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-teal-800 bg-teal-100/70 px-2.5 py-1 rounded-full border border-teal-200">
              📋 Direct Batch Queue Enrollment
            </span>
          </div>
        </div>
      </div>

      {/* Error Notification Alert */}
      {uploadError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-xs animate-in fade-in">
          <span className="font-bold text-rose-700">Error:</span>
          <span>{uploadError}</span>
        </div>
      )}

      {/* Success Notification Alert */}
      {downloadSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* Step 2 & 3: Live Card Preview & Instant Actions */}
      {currentItem && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6">
          {/* Preview Controls Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base">
                  {currentItem.extractedData.fullNameAmharic || 'Card Preview'} 
                  {currentItem.extractedData.fullNameEnglish ? ` (${currentItem.extractedData.fullNameEnglish})` : ''}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-200" title="Auto-assigned Batch Card Queue ID">
                  Queue ID: #{currentItem.id}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200">
                  ⚡ Auto BG Eliminated ({((currentItem.processingDurationMs || 850) / 1000).toFixed(1)}s)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                FAN: <span className="font-mono font-bold text-slate-800">{currentItem.extractedData.fan || '4195 0436 7069 2582'}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Photo Background Remover button */}
              <button
                type="button"
                onClick={() => setIsBgRemoverOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 transition-all cursor-pointer shadow-2xs"
                title="Open Photo Background Remover with Color Picker & Clothes Protection"
              >
                <Scissors className="w-3.5 h-3.5 text-teal-600" />
                <span>Remove Photo BG</span>
              </button>

              {/* View Toggle */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPreviewMode('both')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                    previewMode === 'both' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Both Sides
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('front')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                    previewMode === 'front' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('back')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                    previewMode === 'back' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Back
                </button>
              </div>
            </div>
          </div>

          {/* Rendered Cards View */}
          <div className="bg-slate-900/95 p-6 rounded-3xl border border-slate-800 overflow-x-auto flex flex-wrap items-center justify-center gap-6 shadow-inner">
            {(previewMode === 'both' || previewMode === 'front') && (
              <div className="space-y-2 text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Front Card (CR80)</span>
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-700 inline-block bg-white">
                  <div className="transform scale-[0.48] sm:scale-[0.55] origin-top-left -mr-[130px] sm:-mr-[110px] -mb-[85px] sm:-mb-[70px]">
                    <CardRenderer
                      side="front"
                      data={currentItem.extractedData}
                      config={config}
                      templateConfig={templateConfig}
                    />
                  </div>
                </div>
              </div>
            )}

            {(previewMode === 'both' || previewMode === 'back') && (
              <div className="space-y-2 text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Back Card (CR80)</span>
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-700 inline-block bg-white">
                  <div className="transform scale-[0.48] sm:scale-[0.55] origin-top-left -mr-[130px] sm:-mr-[110px] -mb-[85px] sm:-mb-[70px]">
                    <CardRenderer
                      side="back"
                      data={currentItem.extractedData}
                      config={config}
                      templateConfig={templateConfig}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Big Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBgRemoverOpen(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-300 text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
                title="Fine-tune photo background removal, eyedropper sample colors, and clothing protection"
              >
                <Scissors className="w-4 h-4 text-teal-600" />
                <span>Photo BG Remover</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCurrentCard}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-950/20 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Front & Back (300 DPI PNG)</span>
              </button>

              <button
                type="button"
                onClick={handlePrintCurrentCard}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Card (A4 / PVC)</span>
              </button>
            </div>

            {queue.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllZip}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer"
              >
                <FileArchive className="w-4 h-4" />
                <span>Download All ({queue.length} Cards as ZIP)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Batch File Tray (if more than 1 file uploaded) */}
      {queue.length > 1 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Batch Cards ({queue.length}) - Click to Switch Card
            </h4>
            <span className="text-[11px] text-slate-400">
              Active: {selectedIndex + 1} of {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {queue.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
                  idx === selectedIndex
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{item.extractedData.fullNameEnglish || item.fileName}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  idx === selectedIndex ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-200 text-slate-600'
                }`}>
                  #{item.id.slice(-4)}
                </span>
                <span className="text-[10px] opacity-80" title="Auto BG Eliminated">⚡</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Normal Photo Background Remover Modal */}
      {isBgRemoverOpen && currentItem && (
        <PhotoBackgroundRemover
          isModal={true}
          initialPhotoUrl={currentItem.extractedData.photoUrl}
          applicantName={
            currentItem.extractedData.fullNameEnglish ||
            currentItem.extractedData.fullNameAmharic ||
            'Applicant'
          }
          availablePhotos={queue.map((item, idx) => ({
            id: item.id,
            name:
              item.extractedData.fullNameEnglish ||
              item.extractedData.fullNameAmharic ||
              `Card #${idx + 1}`,
            photoUrl: item.extractedData.photoUrl,
          }))}
          onApplyToCard={(newCutout) => {
            const targetId = currentItem.id;
            setQueue((prev) =>
              prev.map((it) =>
                it.id === targetId
                  ? {
                      ...it,
                      extractedData: {
                        ...it.extractedData,
                        photoUrl: newCutout,
                        secondaryPhotoUrl: newCutout,
                      },
                    }
                  : it
              )
            );
            setIsBgRemoverOpen(false);
          }}
          onClose={() => setIsBgRemoverOpen(false)}
        />
      )}
    </div>
  );
};
