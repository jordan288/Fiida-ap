import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  FileDown, 
  Printer, 
  Sparkles, 
  Check, 
  X, 
  Layers, 
  Sliders, 
  Image as ImageIcon, 
  AlertCircle,
  Eye,
  CheckCircle2,
  FileCheck,
  FileText,
  Save
} from 'lucide-react';
import { CoordinatesConfig, IdCardData, TemplateConfig, AppSettings } from '../types';
import { CardRenderer } from './CardRenderer';
import { generateAndDownloadIdPdf, generateAndDownloadIdJpeg, PdfExportOptions, JpegExportOptions } from '../utils/pdfGenerator';
import { loadSavedAppSettings, saveAppSettingsToStorage } from './AppSettingsModal';

interface ExportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  idData: IdCardData;
  config: CoordinatesConfig;
  templateConfig?: TemplateConfig;
  appSettings?: AppSettings;
  onUpdateAppSettings?: (settings: AppSettings) => void;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isOpen,
  onClose,
  idData,
  config,
  templateConfig,
  appSettings: initialAppSettings,
  onUpdateAppSettings,
}) => {
  const currentSettings = initialAppSettings || loadSavedAppSettings();
  const [exportType, setExportType] = useState<'pdf' | 'jpeg'>(currentSettings.defaultExportFormat || 'pdf');
  const [pdfFormat, setPdfFormat] = useState<PdfExportOptions['format']>(currentSettings.pdfFormat || 'a4_sheet');
  const [jpegLayout, setJpegLayout] = useState<JpegExportOptions['layout']>(currentSettings.jpegLayout || 'combined_sheet');
  const [resolutionDpi, setResolutionDpi] = useState<300 | 600>(currentSettings.resolutionDpi || 300);
  const [includeCropMarks, setIncludeCropMarks] = useState<boolean>(currentSettings.includeCropMarks !== false);
  const [includeMetadataHeader, setIncludeMetadataHeader] = useState<boolean>(currentSettings.includeMetadataHeader !== false);
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(true);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [exportedSuccess, setExportedSuccess] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'front' | 'back'>('front');

  const frontExportRef = useRef<HTMLDivElement>(null);
  const backExportRef = useRef<HTMLDivElement>(null);

  // Sync settings when opened
  useEffect(() => {
    if (isOpen) {
      const s = initialAppSettings || loadSavedAppSettings();
      setExportType(s.defaultExportFormat || 'pdf');
      setPdfFormat(s.pdfFormat || 'a4_sheet');
      setJpegLayout(s.jpegLayout || 'combined_sheet');
      setResolutionDpi(s.resolutionDpi || 300);
      setIncludeCropMarks(s.includeCropMarks !== false);
      setIncludeMetadataHeader(s.includeMetadataHeader !== false);
      setExportedSuccess(false);
    }
  }, [isOpen, initialAppSettings]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    if (!frontExportRef.current || !backExportRef.current) {
      alert('Card elements are initializing, please try again in a moment.');
      return;
    }

    // Save as persistent default if checked
    if (saveAsDefault) {
      const updated: AppSettings = {
        defaultExportFormat: exportType,
        pdfFormat: pdfFormat,
        jpegLayout: jpegLayout,
        jpegQuality: 0.98,
        resolutionDpi: resolutionDpi,
        includeCropMarks: includeCropMarks,
        includeMetadataHeader: includeMetadataHeader,
        autoSavePreference: true,
      };
      saveAppSettingsToStorage(updated);
      onUpdateAppSettings?.(updated);
    }

    setIsExporting(true);
    setExportProgress(10);
    setExportedSuccess(false);

    try {
      if (exportType === 'pdf') {
        setProgressStatus('Initializing 300 DPI high-resolution PDF compositor...');
        const options: PdfExportOptions = {
          format: pdfFormat,
          resolutionDpi,
          includeCropMarks,
          includeMetadataHeader,
        };

        await generateAndDownloadIdPdf(
          frontExportRef.current,
          backExportRef.current,
          idData,
          config,
          options,
          (status, percent) => {
            setProgressStatus(status);
            setExportProgress(percent);
          }
        );
      } else {
        setProgressStatus('Rendering 300 DPI Ultra-HD JPEG Card layout...');
        const options: JpegExportOptions = {
          layout: jpegLayout,
          quality: 0.98,
          resolutionDpi,
          includeCropMarks,
          includeMetadataHeader,
        };

        await generateAndDownloadIdJpeg(
          frontExportRef.current,
          backExportRef.current,
          idData,
          config,
          options,
          (status, percent) => {
            setProgressStatus(status);
            setExportProgress(percent);
          }
        );
      }

      setExportedSuccess(true);
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // Ignored
      }
    } catch (err) {
      console.error('Export Error:', err);
      setProgressStatus(`Error: ${(err as Error).message || 'Failed to generate output'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSingleJpeg = async (side: 'front' | 'back') => {
    const el = side === 'front' ? frontExportRef.current : backExportRef.current;
    if (!el) return;

    try {
      setIsExporting(true);
      setProgressStatus(`Exporting ${side.toUpperCase()} card image at 300 DPI JPEG...`);
      setExportProgress(40);

      const { captureCardJpeg } = await import('../utils/pdfGenerator');
      const dataUrl = await captureCardJpeg(el, resolutionDpi, 0.98);

      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanName = (idData.fullNameEnglish || 'Applicant').replace(/\s+/g, '_');
      a.download = `Ethiopian_ID_${cleanName}_${side.toUpperCase()}_300DPI.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setExportProgress(100);
      setProgressStatus(`Downloaded ${side} JPEG image!`);
      setExportedSuccess(true);
    } catch (e) {
      console.error(e);
      setProgressStatus('JPEG Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto animate-fadeIn">
      {/* Hidden Full-Scale DOM nodes for pristine 1:1 rasterization */}
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

      <div className="bg-white rounded-3xl max-w-4xl w-full border border-gray-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Export & Print Studio (PDF & JPEG)
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  300 DPI CR80 Master
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Official ISO Standard 85.60 × 53.98 mm print layout with calibrated coordinates
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Format Master Switch: PDF vs JPEG */}
          <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
            <button
              type="button"
              onClick={() => setExportType('pdf')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                exportType === 'pdf'
                  ? 'bg-white text-emerald-900 shadow-xs border border-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4 text-red-600" />
              <span>PDF Document (.pdf)</span>
              {exportType === 'pdf' && <Check className="w-3.5 h-3.5 text-emerald-600 ml-1" />}
            </button>

            <button
              type="button"
              onClick={() => setExportType('jpeg')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                exportType === 'jpeg'
                  ? 'bg-white text-emerald-900 shadow-xs border border-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ImageIcon className="w-4 h-4 text-cyan-600" />
              <span>JPEG HD Image (.jpg)</span>
              {exportType === 'jpeg' && <Check className="w-3.5 h-3.5 text-emerald-600 ml-1" />}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left Column: Output Options */}
            <div className="md:col-span-7 space-y-5">
              {/* PDF LAYOUTS */}
              {exportType === 'pdf' && (
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                    1. PDF Document Layout
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPdfFormat('a4_sheet')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        pdfFormat === 'a4_sheet'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">A4 Print Sheet</span>
                        {pdfFormat === 'a4_sheet' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Front & Back centered on A4 (210×297mm) with crop marks for rotary cutting.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPdfFormat('cr80_dual')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        pdfFormat === 'cr80_dual'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Direct CR80 PVC (2 Pgs)</span>
                        {pdfFormat === 'cr80_dual' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Exact 85.6×53.98mm dual-page for Zebra, Fargo, Evolis thermal card printers.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPdfFormat('front_only')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        pdfFormat === 'front_only'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Front Side Only</span>
                        {pdfFormat === 'front_only' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Single CR80 landscape card PDF containing only the front side.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPdfFormat('back_only')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        pdfFormat === 'back_only'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Back Side Only</span>
                        {pdfFormat === 'back_only' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Single CR80 landscape card PDF containing QR code & address.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* JPEG LAYOUTS */}
              {exportType === 'jpeg' && (
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">
                    1. JPEG Image Layout
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setJpegLayout('combined_sheet')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        jpegLayout === 'combined_sheet'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Complete ID Sheet (JPG)</span>
                        {jpegLayout === 'combined_sheet' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Front & Back cards side-by-side with national header on a single HD image.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setJpegLayout('both_files')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        jpegLayout === 'both_files'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Both Front & Back JPGs</span>
                        {jpegLayout === 'both_files' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        Downloads separate individual 300 DPI JPEG files for front and back.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setJpegLayout('front_only')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        jpegLayout === 'front_only'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Front JPEG Only</span>
                        {jpegLayout === 'front_only' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        CR80 front landscape image file only.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setJpegLayout('back_only')}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        jpegLayout === 'back_only'
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-900">Back JPEG Only</span>
                        {jpegLayout === 'back_only' && <Check className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        CR80 back landscape image file only.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Print Preferences */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-3">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                  2. Quality & Layout Preferences
                </label>

                {/* Resolution */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-800 block">Render Resolution</span>
                    <span className="text-[11px] text-gray-500">Super-sampled rasterization DPI</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setResolutionDpi(300)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        resolutionDpi === 300
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      300 DPI (Standard)
                    </button>
                    <button
                      type="button"
                      onClick={() => setResolutionDpi(600)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        resolutionDpi === 600
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      600 DPI (Ultra)
                    </button>
                  </div>
                </div>

                {/* Crop Marks */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-200/80">
                  <div>
                    <span className="text-xs font-semibold text-gray-800 block">Corner Crop Marks</span>
                    <span className="text-[11px] text-gray-500">Precision cut guides for rotary blade cutters</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeCropMarks}
                    onChange={(e) => setIncludeCropMarks(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>

                {/* Metadata Header */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-200/80">
                  <div>
                    <span className="text-xs font-semibold text-gray-800 block">Official National ID Header</span>
                    <span className="text-[11px] text-gray-500">Top verification banner with applicant details</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeMetadataHeader}
                    onChange={(e) => setIncludeMetadataHeader(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Persistent Setting Checkbox */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-emerald-950 block">
                      Save as my permanent setting ({exportType.toUpperCase()})
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Remember this choice for all future exports
                    </span>
                  </div>
                </label>
                <Save className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>

              {/* Quick Individual JPEG Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDownloadSingleJpeg('front')}
                  disabled={isExporting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                  Quick Front JPEG
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSingleJpeg('back')}
                  disabled={isExporting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-600" />
                  Quick Back JPEG
                </button>
              </div>
            </div>

            {/* Right Column: Live Sheet & Side Preview */}
            <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-950 rounded-2xl p-4 border border-slate-800 text-white relative">
              <div className="w-full flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  Live Render Preview
                </span>
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('front')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      previewTab === 'front' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('back')}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      previewTab === 'back' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Back
                  </button>
                </div>
              </div>

              {/* Scaled Preview of Card */}
              <div className="flex items-center justify-center w-full py-2">
                <CardRenderer
                  side={previewTab}
                  data={idData}
                  config={config}
                  templateConfig={templateConfig}
                  scale={0.34}
                />
              </div>

              <div className="mt-3 text-center w-full border-t border-slate-800/80 pt-2.5">
                <p className="text-[11px] font-mono text-emerald-400">
                  {idData.fullNameEnglish} | {idData.fan}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Format: {exportType.toUpperCase()} ({resolutionDpi} DPI output)
                </p>
              </div>
            </div>
          </div>

          {/* Progress / Status Bar */}
          {isExporting && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  {progressStatus}
                </span>
                <span className="font-mono">{exportProgress}%</span>
              </div>
              <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {exportedSuccess && !isExporting && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between text-emerald-900 text-xs font-semibold animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Complete ID {exportType.toUpperCase()} generated and downloaded successfully!</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-mono">300 DPI CR80 Ready</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleStartExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Generating {resolutionDpi} DPI {exportType.toUpperCase()}...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Download Complete ID ({exportType.toUpperCase()})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
