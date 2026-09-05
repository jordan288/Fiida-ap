import React, { useState } from 'react';
import { 
  CreditCard, 
  Crosshair, 
  FileText, 
  Sparkles, 
  Layers, 
  Printer,
  FileCheck
} from 'lucide-react';
import { SAMPLE_ID_DATA, DEFAULT_COORDINATES, DEFAULT_TEMPLATE_CONFIG, INITIAL_BATCH_QUEUE } from './data/defaultData';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig } from './types';
import { CardStudio } from './components/CardStudio';
import { CoordinateCalibrator } from './components/CoordinateCalibrator';
import { PdfSlipExtractor } from './components/PdfSlipExtractor';
import { BatchProcessor } from './components/BatchProcessor';

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'extractor' | 'batch' | 'calibrator'>('studio');
  const [idData, setIdData] = useState<IdCardData>(SAMPLE_ID_DATA);
  const [config, setConfig] = useState<CoordinatesConfig>(DEFAULT_COORDINATES);
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>(INITIAL_BATCH_QUEUE);
  const [activeQueueIndex, setActiveQueueIndex] = useState<number>(0);

  const handleOpenQueueItemInStudio = (data: IdCardData, queueItemId?: string) => {
    setIdData(data);
    if (queueItemId) {
      const idx = batchQueue.findIndex((i) => i.id === queueItemId);
      if (idx !== -1) setActiveQueueIndex(idx);
    }
    setActiveTab('studio');
  };

  const handleSelectQueueIndexInStudio = (index: number) => {
    if (index >= 0 && index < batchQueue.length) {
      setActiveQueueIndex(index);
      setIdData(batchQueue[index].extractedData);
    }
  };

  const readyBatchCount = batchQueue.filter((i) => i.status === 'ready').length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col selection:bg-emerald-200">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-400 flex items-center justify-center text-xl shadow-lg border border-white/20">
              🇪🇹
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white leading-none">
                  Ethiopian Digital ID Card Studio
                </h1>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Fayda v2
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                Professional PDF Slip Extractor, Batch Processing, Card Studio & 300 DPI CR80 PVC Exporter
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/80">
            <button
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'studio'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>ID Card Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('batch')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                activeTab === 'batch'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch Processing</span>
              {batchQueue.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400 text-slate-900 font-extrabold font-mono ml-0.5">
                  {batchQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('extractor')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'extractor'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF Slip Extractor</span>
            </button>

            <button
              onClick={() => setActiveTab('calibrator')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'calibrator'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Coordinate Calibrator</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'studio' && (
          <CardStudio
            idData={idData}
            setIdData={setIdData}
            config={config}
            setConfig={setConfig}
            templateConfig={templateConfig}
            setTemplateConfig={setTemplateConfig}
            onOpenExtractor={() => setActiveTab('extractor')}
            onOpenCalibrator={() => setActiveTab('calibrator')}
            queue={batchQueue}
            activeQueueIndex={activeQueueIndex}
            onSelectQueueIndex={handleSelectQueueIndexInStudio}
            onOpenBatch={() => setActiveTab('batch')}
          />
        )}

        {activeTab === 'batch' && (
          <BatchProcessor
            queue={batchQueue}
            setQueue={setBatchQueue}
            config={config}
            templateConfig={templateConfig}
            onOpenInStudio={handleOpenQueueItemInStudio}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'extractor' && (
          <PdfSlipExtractor
            idData={idData}
            setIdData={setIdData}
            config={config}
            templateConfig={templateConfig}
            onApplyAndOpenStudio={() => setActiveTab('studio')}
            onOpenBatch={() => setActiveTab('batch')}
          />
        )}

        {activeTab === 'calibrator' && (
          <CoordinateCalibrator
            idData={idData}
            config={config}
            setConfig={setConfig}
            templateConfig={templateConfig}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-4 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Ethiopian Digital ID Card Studio (CR80 ISO/IEC 7810 300 DPI)</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>Batch Multi-Card Queue</span>
            <span>Amharic & English Bilingual Typography</span>
            <span>TrueType Noto Sans Ethiopic</span>
            <span>High-Res Dual-Side Print Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
