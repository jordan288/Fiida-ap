import React, { useState, useEffect, useRef } from 'react';
import { 
  CreditCard, Crosshair, FileText, Sparkles, Layers, Printer,
  FileCheck, SlidersHorizontal, CheckCircle2, Scissors, LogOut
} from 'lucide-react';
import { SAMPLE_ID_DATA, DEFAULT_COORDINATES, DEFAULT_TEMPLATE_CONFIG, INITIAL_BATCH_QUEUE } from './data/defaultData';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig, NumberedTemplate } from './types';
import { CoordinateCalibrator } from './components/CoordinateCalibrator';
import { PdfSlipExtractor } from './components/PdfSlipExtractor';
import { BatchProcessor } from './components/BatchProcessor';
import { SimpleCardConverter } from './components/SimpleCardConverter';
import { PhotoBackgroundRemover } from './components/PhotoBackgroundRemover';
import { 
  loadNumberedTemplates, initAndHydrateTemplates, saveNumberedTemplates, 
  getActiveTemplateNumber, setActiveTemplateNumber, syncActiveTemplateConfig,
  loadTemplateCoordinates, saveTemplateCoordinates, applyCoordinatesToAllTemplates 
} from './utils/templateStorage';
import { savePermanentRegions } from './utils/pdfRegionExtractor';
import { useAuth } from './context/AuthContext'; // NEW IMPORT

const STORAGE_KEY_COORDS = 'fayda_permanent_coords_config_v2';
const STORAGE_KEY_TEMPLATE = 'fayda_permanent_template_config_v2';

export default function App() {
  const { user, profile, loading, loginWithGoogle, logout } = useAuth(); // AUTH HOOK

  const [activeTab, setActiveTab] = useState<'simple' | 'batch' | 'extractor' | 'calibrator' | 'bgRemover'>('simple');
  const [idData, setIdData] = useState<IdCardData>(SAMPLE_ID_DATA);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const [numberedTemplates, setNumberedTemplates] = useState<NumberedTemplate[]>(() => loadNumberedTemplates());
  const [activeTemplateNumber, setActiveTemplateNumberState] = useState<number>(() => getActiveTemplateNumber());

  const [config, setConfig] = useState<CoordinatesConfig>(() => {
    // ... (Keep your existing setConfig logic)
    const activeNum = getActiveTemplateNumber();
    const list = loadNumberedTemplates();
    const found = list.find((t) => t.number === activeNum);
    if (found?.coordinates) return found.coordinates;
    const templateCoords = loadTemplateCoordinates(activeNum);
    if (templateCoords && templateCoords.fields) return templateCoords;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COORDS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_COORDINATES;
  });

  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>(() => {
    // ... (Keep your existing setTemplateConfig logic)
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

  const isSwitchingTemplateRef = useRef(false);
  const activeTemplateNumberRef = useRef(activeTemplateNumber);
  activeTemplateNumberRef.current = activeTemplateNumber;

  // ... (Keep your existing useEffects for Hydration and Template Syncing)
  useEffect(() => {
    let isMounted = true;
    initAndHydrateTemplates().then((hydrated) => {
      if (isMounted && hydrated && hydrated.length > 0) {
        setNumberedTemplates(hydrated);
        const activeNum = getActiveTemplateNumber();
        const active = hydrated.find((t) => t.number === activeNum);
        if (active) {
          if (active.config) setTemplateConfig(active.config);
          if (active.coordinates) setConfig(active.coordinates);
        }
      }
      setIsHydrated(true);
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!isHydrated || isSwitchingTemplateRef.current) return;
    const currentNum = activeTemplateNumberRef.current;
    try {
      localStorage.setItem(STORAGE_KEY_COORDS, JSON.stringify(config));
      saveTemplateCoordinates(currentNum, config);
    } catch {}
    setNumberedTemplates((prev) => {
      const idx = prev.findIndex((t) => t.number === currentNum);
      if (idx < 0) return prev;
      const existing = prev[idx].coordinates;
      if (existing && JSON.stringify(existing) === JSON.stringify(config)) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], coordinates: JSON.parse(JSON.stringify(config)), updatedAt: new Date().toISOString() };
      saveNumberedTemplates(updated);
      return updated;
    });
  }, [config, isHydrated]);

  useEffect(() => {
    if (!isHydrated || isSwitchingTemplateRef.current) return;
    const currentNum = activeTemplateNumberRef.current;
    try {
      const safeConfig = { ...templateConfig };
      if (safeConfig.frontImageUrl && safeConfig.frontImageUrl.length > 5000) safeConfig.frontImageUrl = '';
      if (safeConfig.backImageUrl && safeConfig.backImageUrl.length > 5000) safeConfig.backImageUrl = '';
      localStorage.setItem(STORAGE_KEY_TEMPLATE, JSON.stringify(safeConfig));
    } catch {}
    setNumberedTemplates((prev) => syncActiveTemplateConfig(currentNum, templateConfig, prev));
  }, [templateConfig, isHydrated]);

  // ... (Keep your existing handler functions)
  const handleSelectTemplateNumber = (num: number) => { /* Keep existing logic */ };
  const handleUpdateNumberedTemplates = (updated: NumberedTemplate[]) => {
    setNumberedTemplates(updated);
    saveNumberedTemplates(updated);
  };
  const handleApplyStudioPositionsToAllTemplates = () => {
    const updated = applyCoordinatesToAllTemplates(config, numberedTemplates);
    setNumberedTemplates(updated);
  };

  // --- AUTHENTICATION RENDERS ---
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl text-center">
          <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-400 rounded-3xl flex items-center justify-center text-4xl shadow-lg mb-6">🇪🇹</div>
          <h1 className="text-2xl font-bold text-white mb-2">Fayda ID Card Studio</h1>
          <p className="text-slate-400 text-sm mb-8">Sign in to access the ID generation and batch printing system.</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl transition-all flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col selection:bg-emerald-200">
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
                {profile?.isAdmin && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                High-Capacity Multi-Card Queue • A4 5-in-1 Sheet Exporter (Solid White PDF/PNG)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/80">
              <button
                onClick={() => setActiveTab('simple')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'simple' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simple Mode (ቀላል)</span>
              </button>

              {/* ADMIN ONLY TABS */}
              {profile?.isAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('batch')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                      activeTab === 'batch' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
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
                      activeTab === 'bgRemover' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Photo BG Remover</span>
                  </button>
                </>
              )}
            </nav>

            {/* USER PROFILE & LOGOUT */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-white">{profile?.credits} Credits</span>
                <span className="text-[10px] text-slate-400">{user.email?.split('@')[0]}</span>
              </div>
              <button 
                onClick={logout}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {(activeTab === 'simple' || (!profile?.isAdmin && activeTab !== 'simple')) && (
          <SimpleCardConverter
            queue={batchQueue}
            setQueue={setBatchQueue}
            config={config}
            templateConfig={templateConfig}
            onSwitchToAdvanced={() => setActiveTab('batch')}
          />
        )}

        {/* Protect routing below just in case state gets forced */}
        {profile?.isAdmin && activeTab === 'batch' && (
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

        {profile?.isAdmin && activeTab === 'bgRemover' && (
          <PhotoBackgroundRemover
            initialPhotoUrl={batchQueue[activeQueueIndex]?.extractedData?.photoUrl || idData.photoUrl || SAMPLE_ID_DATA.photoUrl}
            applicantName={batchQueue[activeQueueIndex]?.extractedData?.fullNameEnglish || idData.fullNameEnglish || 'Applicant'}
            availablePhotos={batchQueue.map((item, idx) => ({
              id: item.id,
              name: item.extractedData.fullNameEnglish || item.extractedData.fullNameAmharic || `Card #${idx + 1}`,
              photoUrl: item.extractedData.photoUrl,
            }))}
            onApplyToCard={(newCutout) => {
              if (batchQueue.length > 0 && batchQueue[activeQueueIndex]) {
                const targetId = batchQueue[activeQueueIndex].id;
                setBatchQueue((prev) =>
                  prev.map((it) => it.id === targetId ? { ...it, extractedData: { ...it.extractedData, photoUrl: newCutout, secondaryPhotoUrl: newCutout } } : it)
                );
              }
              setIdData((prev) => ({ ...prev, photoUrl: newCutout, secondaryPhotoUrl: newCutout }));
            }}
          />
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-4 px-6 mt-12">
         {/* Keep existing footer content */}
      </footer>
    </div>
  );
}