import React, { useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  Upload, 
  FileText, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
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
  MapPin
} from 'lucide-react';
import { BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig } from '../types';
import { SAMPLE_BATCH_APPLICANTS, SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA } from '../data/defaultData';
import { exportBatchToA4Pdf, exportBatchToZipArchive } from '../utils/batchExporter';
import { convertGcToEth } from '../utils/ethiopianCalendar';

interface BatchProcessorProps {
  queue: BatchQueueItem[];
  setQueue: React.Dispatch<React.SetStateAction<BatchQueueItem[]>>;
  config: CoordinatesConfig;
  templateConfig: TemplateConfig;
  onOpenInStudio: (data: IdCardData, queueItemId?: string) => void;
  onNavigateToTab?: (tab: 'studio' | 'extractor' | 'calibrator' | 'batch') => void;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({
  queue,
  setQueue,
  config,
  templateConfig,
  onOpenInStudio,
  onNavigateToTab,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'pending' | 'processing'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  
  // Progress and export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; status: string }>({
    current: 0,
    total: 0,
    status: '',
  });
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

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

  const processMultipleFiles = (files: File[]) => {
    const newItems: BatchQueueItem[] = files.map((file, idx) => {
      // Pick simulated or parsed sample based on file name or index
      const samplePool = SAMPLE_BATCH_APPLICANTS;
      const baseSample = samplePool[idx % samplePool.length];

      // Custom variations for distinct FANs and timestamps
      const customFan = generateRandomFan();
      const customData: IdCardData = {
        ...baseSample,
        fan: customFan,
        fcn: `FCN-${customFan.replace(/\s+/g, '')}`,
        serialNumber: String(Math.floor(1000000000 + Math.random() * 9000000000)),
      };

      return {
        id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(1)} KB`,
        status: 'pending',
        progress: 0,
        extractedData: customData,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        selected: true,
      };
    });

    setQueue((prev) => [...newItems, ...prev]);

    // Automatically trigger fast batch OCR parsing simulation
    runBatchExtraction(newItems.map((i) => i.id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processMultipleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Run Batch OCR / Extraction on queued items
  const runBatchExtraction = (targetIds?: string[]) => {
    setIsProcessingBatch(true);
    const idsToProcess = targetIds || queue.filter((i) => i.status === 'pending').map((i) => i.id);

    if (idsToProcess.length === 0) {
      setIsProcessingBatch(false);
      return;
    }

    let completed = 0;
    idsToProcess.forEach((id, idx) => {
      setTimeout(() => {
        setQueue((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                status: 'ready',
                progress: 100,
              };
            }
            return item;
          })
        );

        completed++;
        if (completed === idsToProcess.length) {
          setIsProcessingBatch(false);
          try {
            confetti({
              particleCount: 60,
              spread: 70,
              origin: { y: 0.6 },
            });
          } catch (e) {}
        }
      }, (idx + 1) * 350);
    });
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

  // Batch Export A4 Multi-Page PDF
  const handleExportA4Pdf = async () => {
    const selectedItems = queue.filter((i) => i.selected && i.status === 'ready');
    if (selectedItems.length === 0) {
      alert('Please select at least one ready card from the queue to export.');
      return;
    }

    try {
      setIsExporting(true);
      await exportBatchToA4Pdf(selectedItems, config, templateConfig, (current, total, status) => {
        setExportProgress({ current, total, status });
      });
      try {
        confetti({ particleCount: 70, spread: 60 });
      } catch (e) {}
    } catch (error) {
      console.error('Batch A4 PDF Export error:', error);
      alert('Failed to export batch PDF. Check browser console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  // Batch Export ZIP Package
  const handleExportZip = async () => {
    const selectedItems = queue.filter((i) => i.selected && i.status === 'ready');
    if (selectedItems.length === 0) {
      alert('Please select at least one ready card from the queue to export.');
      return;
    }

    try {
      setIsExporting(true);
      await exportBatchToZipArchive(selectedItems, config, templateConfig, (current, total, status) => {
        setExportProgress({ current, total, status });
      });
      try {
        confetti({ particleCount: 80, spread: 70 });
      } catch (e) {}
    } catch (error) {
      console.error('Batch ZIP Export error:', error);
      alert('Failed to export batch ZIP package. Check browser console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  // Edit Modal Save
  const handleSaveEdit = (updatedData: IdCardData) => {
    if (!editingItem) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.id === editingItem.id ? { ...item, extractedData: updatedData, status: 'ready' } : item
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
            <div className="flex items-center gap-3 bg-slate-800/80 backdrop-blur-xs px-4 py-3 rounded-2xl border border-slate-700">
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
                value={searchQuery}
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
              onClick={handleExportA4Pdf}
              disabled={isExporting || readyCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export A4 Multi-Page PDF ({selectedCount})</span>
            </button>

            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExporting || readyCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Download ZIP Package ({selectedCount})</span>
            </button>
          </div>
        </div>

        {/* Selection Bar & Stats */}
        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={queue.length > 0 && selectedCount === queue.length}
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
          </div>

          <div className="flex items-center gap-2">
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
            <button
              type="button"
              onClick={handleLoadDemoBatch}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 transition-colors cursor-pointer"
            >
              Load Demo Batch (6 Applicants)
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={queue.length > 0 && selectedCount === queue.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">Applicant</th>
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
                          checked={item.selected ?? true}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Applicant Photo & Bilingual Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 shadow-2xs">
                            <img
                              src={data.photoUrl}
                              alt={data.fullNameEnglish}
                              className="w-full h-full object-cover"
                            />
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
                            SN: {data.serialNumber || '9482019482'}
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
                          <div className="font-semibold">
                            {data.dateOfBirth}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Eth: {data.dateOfBirthEth || 'N/A'}
                          </div>
                          <div className="text-[10px] font-bold text-slate-600">
                            {data.sex === 'Male' ? 'ወንድ (M)' : 'ሴት (F)'}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {item.status === 'ready' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Ready</span>
                          </span>
                        ) : item.status === 'processing' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                            <span>Processing</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            <span>Pending</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenInStudio(data, item.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                            title="Open this card in the live visual Card Studio"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Open in Studio</span>
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
          onSave={handleSaveEdit}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
};

// Sub-component for Quick Edit Modal
interface EditApplicantModalProps {
  item: BatchQueueItem;
  onSave: (data: IdCardData) => void;
  onClose: () => void;
}

const EditApplicantModal: React.FC<EditApplicantModalProps> = ({ item, onSave, onClose }) => {
  const [formData, setFormData] = useState<IdCardData>(item.extractedData);

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
          <div className="sm:col-span-2 flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="w-14 h-18 rounded-xl overflow-hidden border border-slate-300 bg-white shadow-2xs shrink-0">
              <img src={formData.photoUrl} alt="Applicant" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Applicant Portrait Photo</p>
              <p className="text-[11px] text-slate-500 mb-2">Upload a replacement passport-style photo</p>
              <label className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5">
                <Upload className="w-3 h-3" />
                <span>Replace Photo</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Amharic Full Name (ሙሉ ስም)</label>
            <input
              type="text"
              value={formData.fullNameAmharic}
              onChange={(e) => handleChange('fullNameAmharic', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">English Full Name</label>
            <input
              type="text"
              value={formData.fullNameEnglish}
              onChange={(e) => handleChange('fullNameEnglish', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">16-Digit FAN</label>
            <input
              type="text"
              value={formData.fan}
              onChange={(e) => handleChange('fan', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-mono font-bold mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Phone Number (ስልክ)</label>
            <input
              type="text"
              value={formData.phoneNumber}
              onChange={(e) => handleChange('phoneNumber', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Date of Birth (GC)</label>
            <input
              type="text"
              value={formData.dateOfBirth}
              onChange={(e) => handleChange('dateOfBirth', e.target.value)}
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
            <label className="text-xs font-bold text-slate-700">Region (ክልል)</label>
            <input
              type="text"
              value={formData.regionEnglish}
              onChange={(e) => handleChange('regionEnglish', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">Zone / Subcity</label>
            <input
              type="text"
              value={formData.zoneEnglish}
              onChange={(e) => handleChange('zoneEnglish', e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 outline-none font-medium mt-1"
            />
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
            onClick={() => onSave(formData)}
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
