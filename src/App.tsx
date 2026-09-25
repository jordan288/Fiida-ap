import React, { useState } from 'react';
import { 
  CreditCard, 
  Crosshair, 
  FileText, 
  Sparkles, 
  Layers, 
  Printer,
  FileCheck,
  SlidersHorizontal,
  CheckCircle2,
  Scissors,
  Bot
} from 'lucide-react';
import { SAMPLE_ID_DATA, DEFAULT_COORDINATES, DEFAULT_TEMPLATE_CONFIG, INITIAL_BATCH_QUEUE } from './data/defaultData';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig, NumberedTemplate } from './types';
import { CoordinateCalibrator } from './components/CoordinateCalibrator';
import { PdfSlipExtractor } from './components/PdfSlipExtractor';
import { BatchProcessor } from './components/BatchProcessor';
import { SimpleCardConverter } from './components/SimpleCardConverter';
import { PhotoBackgroundRemover } from './components/PhotoBackgroundRemover';
import { TelegramBotView } from './components/TelegramBotView';
import { 
  loadNumberedTemplates, 
  initAndHydrateTemplates,
  saveNumberedTemplates, 
  getActiveTemplateNumber, 
  setActiveTemplateNumber, 
  syncActiveTemplateConfig,
  loadTemplateCoordinates,
  saveTemplateCoordinates,
  applyCoordinatesToAllTemplates 
} from './utils/templateStorage';
import { savePermanentRegions } from './utils/pdfRegionExtractor';

const STORAGE_KEY_COORDS = 'fayda_permanent_coords_config_v2';
const STORAGE_KEY_TEMPLATE = 'fayda_permanent_template_config_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simple' | 'batch' | 'extractor' | 'calibrator' | 'bgRemover' | 'telegram'>('simple');
  const [idData, setIdData] = useState<IdCardData>(SAMPLE_ID_DATA);
  // Numbered Templates state & persistence (saved by number, working until changed)
  const [numberedTemplates, setNumberedTemplates] = useState<NumberedTemplate[]>(() =>
    loadNumberedTemplates()
  );
  const [activeTemplateNumber, setActiveTemplateNumberState] = useState<number>(() =>
    getActiveTemplateNumber()
  );

  const [config, setConfig] = useState<CoordinatesConfig>(() => {
    const activeNum = getActiveTemplateNumber();
    const list = loadNumberedTemplates();
    const found = list.find((t) => t.number === activeNum);
    if (found?.coordinates) {
      return found.coordinates;
    }
    const templateCoords = loadTemplateCoordinates(activeNum);
    if (templateCoords && templateCoords.fields) {
      return templateCoords;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY_COORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed?.fields?.phoneNumber) {
          if (parsed?.fields) {
            parsed.fields.phoneNumber = { ...DEFAULT_COORDINATES.fields.phoneNumber };
          }
        } else if (parsed.fields.phoneNumber.x === 10) {
          parsed.fields.phoneNumber.x = 45;
        }
        if (parsed?.media?.qrCodeBack) {
          if (parsed.media.qrCodeBack.opacity === undefined || parsed.media.qrCodeBack.opacity > 0.8) {
            parsed.media.qrCodeBack.opacity = 0.8;
          }
        }
        return parsed;
      }
    } catch {}
    return DEFAULT_COORDINATES;
  });

  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>(() => {
    const activeNum = getActiveTemplateNumber();
    const list = loadNumberedTemplates();
    const found = list.find((t) => t.number === activeNum);
    if (found) return found.config;

    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATE);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_TEMPLATE_CONFIG;
  });

  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>(INITIAL_BATCH_QUEUE);
  const [activeQueueIndex, setActiveQueueIndex] = useState<number>(0);

  // Switching ref to prevent useEffect race condition when changing templates
  const isSwitchingTemplateRef = React.useRef(false);
  const activeTemplateNumberRef = React.useRef(activeTemplateNumber);
  activeTemplateNumberRef.current = activeTemplateNumber;

  // Automatically hydrate full templates & high-res images from IndexedDB on startup
  React.useEffect(() => {
    let isMounted = true;
    initAndHydrateTemplates().then((hydrated) => {
      if (isMounted && hydrated && hydrated.length > 0) {
        setNumberedTemplates(hydrated);
        const activeNum = getActiveTemplateNumber();
        const active = hydrated.find((t) => t.number === activeNum);
        if (active) {
          if (active.config) {
            setTemplateConfig(active.config);
          }
          if (active.coordinates) {
            setConfig(active.coordinates);
          }
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Automatically make coordinate settings permanent and tied to active template
  React.useEffect(() => {
    if (isSwitchingTemplateRef.current) return;
    const currentNum = activeTemplateNumberRef.current;

    try {
      localStorage.setItem(STORAGE_KEY_COORDS, JSON.stringify(config));
      saveTemplateCoordinates(currentNum, config);
    } catch {}

    setNumberedTemplates((prev) => {
      const idx = prev.findIndex((t) => t.number === currentNum);
      if (idx < 0) return prev;
      const existing = prev[idx].coordinates;
      if (existing && JSON.stringify(existing) === JSON.stringify(config)) {
        return prev;
      }
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        coordinates: JSON.parse(JSON.stringify(config)),
        updatedAt: new Date().toISOString(),
      };
      saveNumberedTemplates(updated);
      return updated;
    });
  }, [config]);

  // Keep active template settings and active numbered template permanently synced
  React.useEffect(() => {
    if (isSwitchingTemplateRef.current) return;
    const currentNum = activeTemplateNumberRef.current;

    try {
      // Keep STORAGE_KEY_TEMPLATE lightweight - if images are large, strip dataUrl from this secondary key
      const safeConfig = { ...templateConfig };
      if (safeConfig.frontImageUrl && safeConfig.frontImageUrl.length > 5000) {
        safeConfig.frontImageUrl = '';
      }
      if (safeConfig.backImageUrl && safeConfig.backImageUrl.length > 5000) {
        safeConfig.backImageUrl = '';
      }
      localStorage.setItem(STORAGE_KEY_TEMPLATE, JSON.stringify(safeConfig));
    } catch {}

    setNumberedTemplates((prev) =>
      syncActiveTemplateConfig(currentNum, templateConfig, prev)
    );
  }, [templateConfig]);

  const handleSelectTemplateNumber = (num: number) => {
    const fromNum = activeTemplateNumberRef.current;
    if (fromNum === num) return;

    // 1. Mark template switching in progress to block accidental useEffect overwrites
    isSwitchingTemplateRef.current = true;

    // 2. Permanently save the leaving template's coordinates & config
    const leavingCoordsCloned = JSON.parse(JSON.stringify(config));
    saveTemplateCoordinates(fromNum, leavingCoordsCloned);

    // 3. Find the target template and load its coordinates & config
    const currentList = numberedTemplates && numberedTemplates.length > 0 ? numberedTemplates : loadNumberedTemplates();
    const target = currentList.find((t) => t.number === num);

    // Target coordinates: check template object first, then template-specific storage, then DEFAULT_COORDINATES
    const targetCoordsFromStorage = loadTemplateCoordinates(num);
    const targetCoords = (target?.coordinates && target.coordinates.fields)
      ? target.coordinates
      : ((targetCoordsFromStorage && targetCoordsFromStorage.fields)
          ? targetCoordsFromStorage
          : JSON.parse(JSON.stringify(DEFAULT_COORDINATES)));
    const clonedTargetCoords = JSON.parse(JSON.stringify(targetCoords));

    const targetConfig = target?.config
      ? JSON.parse(JSON.stringify(target.config))
      : JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_CONFIG));

    // 4. Update numberedTemplates state so both the leaving and incoming templates have their accurate data
    const updatedList = currentList.map((t) => {
      if (t.number === fromNum) {
        return {
          ...t,
          config: { ...templateConfig },
          coordinates: leavingCoordsCloned,
          updatedAt: new Date().toISOString(),
        };
      }
      if (t.number === num) {
        return {
          ...t,
          config: targetConfig,
          coordinates: clonedTargetCoords,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });

    setNumberedTemplates(updatedList);
    saveNumberedTemplates(updatedList);

    // 5. Update active template number
    setActiveTemplateNumber(num);
    setActiveTemplateNumberState(num);

    // 6. Atomically switch visual settings AND coordinates to the selected template
    setTemplateConfig(targetConfig);
    setConfig(clonedTargetCoords);

    try {
      const safeTargetConfig = { ...targetConfig };
      if (safeTargetConfig.frontImageUrl && safeTargetConfig.frontImageUrl.length > 5000) {
        safeTargetConfig.frontImageUrl = '';
      }
      if (safeTargetConfig.backImageUrl && safeTargetConfig.backImageUrl.length > 5000) {
        safeTargetConfig.backImageUrl = '';
      }
      localStorage.setItem(STORAGE_KEY_TEMPLATE, JSON.stringify(safeTargetConfig));
      localStorage.setItem(STORAGE_KEY_COORDS, JSON.stringify(clonedTargetCoords));
    } catch {}

    setTimeout(() => {
      isSwitchingTemplateRef.current = false;
    }, 120);
  };

  const handleUpdateNumberedTemplates = (updated: NumberedTemplate[]) => {
    setNumberedTemplates(updated);
    saveNumberedTemplates(updated);
  };

  const handleApplyStudioPositionsToAllTemplates = () => {
    const updated = applyCoordinatesToAllTemplates(config, numberedTemplates);
    setNumberedTemplates(updated);
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
                  Fayda Batch ID Card Printing System
                </h1>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Batch Edition
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                High-Capacity Multi-Card Queue • A4 5-in-1 Sheet Exporter (Solid White PDF/PNG) • 300 DPI CR80 Dual-Side Print
              </p>
            </div>
          </div>

          {/* Navigation Tabs - Simple Mode Default & Advanced Options */}
          <nav className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/80">
            <button
              onClick={() => setActiveTab('telegram')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                activeTab === 'telegram'
                  ? 'bg-[#24A1DE] text-white shadow-md shadow-sky-900/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
              title="Interactive Telegram Bot: Multi-File Batch, Live File Processing & Mirrored Card Verification"
            >
              <Bot className="w-3.5 h-3.5 text-sky-200" />
              <span>Telegram Bot</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5"></span>
            </button>

            <button
              onClick={() => setActiveTab('simple')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'simple'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simple Mode (ቀላል)</span>
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
              <span>Advanced Studio</span>
              {batchQueue.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400 text-slate-900 font-extrabold font-mono ml-0.5">
                  {batchQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('bgRemover')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'bgRemover'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
              title="Isolate portrait subject and remove background to 100% transparent"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Photo BG Remover</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      {activeTab === 'telegram' ? (
        <TelegramBotView
          config={config}
          setConfig={setConfig}
          templateConfig={templateConfig}
          setTemplateConfig={setTemplateConfig}
          numberedTemplates={numberedTemplates}
          activeTemplateNumber={activeTemplateNumber}
          onSelectTemplateNumber={handleSelectTemplateNumber}
          onOpenInStudio={(cardData) => {
            setIdData(cardData);
            setActiveTab('batch');
          }}
        />
      ) : (
        <>
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {activeTab === 'simple' && (
          <SimpleCardConverter
            queue={batchQueue}
            setQueue={setBatchQueue}
            config={config}
            templateConfig={templateConfig}
            onSwitchToAdvanced={() => setActiveTab('batch')}
          />
        )}

        {activeTab === 'batch' && (
          <BatchProcessor
            queue={batchQueue}
            setQueue={setBatchQueue}
            config={config}
            setConfig={setConfig}
            templateConfig={templateConfig}
            setTemplateConfig={setTemplateConfig}
            onNavigateToTab={setActiveTab}
            activeTemplateNumber={activeTemplateNumber}
            onSelectTemplateNumber={handleSelectTemplateNumber}
            numberedTemplates={numberedTemplates}
            onUpdateNumberedTemplates={handleUpdateNumberedTemplates}
            onApplyStudioPositionsToAllTemplates={handleApplyStudioPositionsToAllTemplates}
          />
        )}

        {activeTab === 'extractor' && (
          <PdfSlipExtractor
            idData={idData}
            setIdData={setIdData}
            config={config}
            templateConfig={templateConfig}
            onApplyAndOpenStudio={() => setActiveTab('batch')}
            onOpenBatch={() => setActiveTab('batch')}
            onSaveAndApplyPositions={(savedRegions, updatedData) => {
              savePermanentRegions(savedRegions);
              setIdData(updatedData);
              setActiveTab('batch');
            }}
            onSaveToBatchConverter={(savedRegions, updatedData) => {
              savePermanentRegions(savedRegions);
              setIdData(updatedData);
              setActiveTab('batch');
            }}
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

        {activeTab === 'bgRemover' && (
          <PhotoBackgroundRemover
            initialPhotoUrl={
              batchQueue[activeQueueIndex]?.extractedData?.photoUrl ||
              idData.photoUrl ||
              SAMPLE_ID_DATA.photoUrl
            }
            applicantName={
              batchQueue[activeQueueIndex]?.extractedData?.fullNameEnglish ||
              idData.fullNameEnglish ||
              'Applicant'
            }
            availablePhotos={batchQueue.map((item, idx) => ({
              id: item.id,
              name:
                item.extractedData.fullNameEnglish ||
                item.extractedData.fullNameAmharic ||
                `Card #${idx + 1}`,
              photoUrl: item.extractedData.photoUrl,
            }))}
            onApplyToCard={(newCutout) => {
              if (batchQueue.length > 0 && batchQueue[activeQueueIndex]) {
                const targetId = batchQueue[activeQueueIndex].id;
                setBatchQueue((prev) =>
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
              }
              setIdData((prev) => ({
                ...prev,
                photoUrl: newCutout,
                secondaryPhotoUrl: newCutout,
              }));
            }}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-4 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Fayda Batch ID Card Printing System (CR80 ISO/IEC 7810 300 DPI)</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>A4 5-in-1 Sheet Batch Print</span>
            <span>Solid White Background (PDF & PNG)</span>
            <span>Amharic & English Bilingual Typography</span>
            <span>High-Res Dual-Side Print Engine</span>
          </div>
        </div>
      </footer>
        </>
      )}
    </div>
  );
}
