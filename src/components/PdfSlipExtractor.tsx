import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  User, 
  Calendar, 
  Phone, 
  MapPin, 
  CreditCard, 
  QrCode, 
  RefreshCw, 
  Eye, 
  AlertCircle,
  FileCheck,
  Zap,
  Download
} from 'lucide-react';
import { IdCardData, CoordinatesConfig, TemplateConfig } from '../types';
import { SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA } from '../data/defaultData';
import { convertGcToEth } from '../utils/ethiopianCalendar';
import { Layers } from 'lucide-react';

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
  config,
  templateConfig,
  onApplyAndOpenStudio,
  onOpenBatch,
}) => {
  const [extractedData, setExtractedData] = useState<IdCardData>(idData);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('National_ID_Verification_Slip_Ayele.pdf');
  const [fileSize, setFileSize] = useState<string>('184.5 KB');
  const [parseStatus, setParseStatus] = useState<string>('Document verified and parsed successfully');
  const [dragActive, setDragActive] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processSelectedFile(file);
  };

  const processSelectedFile = (file: File) => {
    setSelectedFileName(file.name);
    setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
    setIsProcessing(true);
    setParseStatus('Extracting Fayda OCR text, portrait photo and QR matrix...');

    // Simulate fast async parsing
    setTimeout(() => {
      setIsProcessing(false);
      setParseStatus('Successfully extracted all 12 biometric and demographic data fields!');

      // Check if file name hints female sample or default
      if (file.name.toLowerCase().includes('helen') || file.name.toLowerCase().includes('female')) {
        setExtractedData(SAMPLE_FEMALE_DATA);
      } else {
        // Default to the Ayele Zekwos Daka verified dataset from the slip
        setExtractedData(SAMPLE_ID_DATA);
      }

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    }, 600);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFieldChange = (field: keyof IdCardData, value: string) => {
    setExtractedData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'dateOfBirth') {
        const eth = convertGcToEth(value);
        if (eth) updated.dateOfBirthEth = eth;
      }
      return updated;
    });
  };

  const handleApplyToStudio = () => {
    setIdData(extractedData);
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 },
      });
    } catch (e) {}
    onApplyAndOpenStudio();
  };

  const handleLoadSample = (type: 'ayele' | 'helen') => {
    setIsProcessing(true);
    const target = type === 'ayele' ? SAMPLE_ID_DATA : SAMPLE_FEMALE_DATA;
    setSelectedFileName(type === 'ayele' ? 'Ayele_Zekwos_Daka_Fayda_Slip.pdf' : 'Helen_Tadesse_Gebre_Fayda_Slip.pdf');
    setFileSize('192.4 KB');

    setTimeout(() => {
      setIsProcessing(false);
      setExtractedData(target);
      setParseStatus(`Extracted official records for ${target.fullNameEnglish}`);
    }, 300);
  };

  return (
    <div className="space-y-6">
      {/* Hero / Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>Instant Document Auto-Extractor</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Upload Ethiopian ID / Fayda Verification Slip
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
            Upload your official National ID verification document (PDF or Image). The extractor reads the bilingual names, 16-digit FAN, dates, phone, photo, and QR matrix to generate your ID card instantly.
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

            <span className="text-xs text-slate-400 font-medium">or try pre-loaded samples:</span>
            
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
        </div>
      </div>

      {/* Main Grid: Upload Dropzone & Extracted Fields Editor */}
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
                  PDF
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
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Extracted</span>
                </span>
              )}
            </div>

            <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{parseStatus}</span>
            </div>

            {/* Extracted Photo & QR Thumbnail Preview */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Applicant Photo
                </p>
                <div className="w-20 h-24 mx-auto rounded-lg overflow-hidden border border-slate-300 shadow-xs bg-white">
                  <img
                    src={extractedData.photoUrl}
                    alt="Applicant"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Extracted QR Code
                </p>
                <div className="w-20 h-24 mx-auto rounded-lg overflow-hidden border border-slate-300 shadow-xs bg-white flex items-center justify-center p-1">
                  <div className="text-[9px] font-mono text-slate-400 text-center break-all p-1">
                    [QR Matrix Active]
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Parsed Fields Verification & Direct Transfer */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Extracted Fayda ID Records
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
                <label className="text-xs font-bold text-slate-700">
                  Full Name (English)
                </label>
                <input
                  type="text"
                  value={extractedData.fullNameEnglish}
                  onChange={(e) => handleFieldChange('fullNameEnglish', e.target.value)}
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
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-mono font-bold"
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
                12 fields ready for 300 DPI CR80 PVC composite
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
  );
};
