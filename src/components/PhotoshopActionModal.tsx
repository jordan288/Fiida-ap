import React, { useState } from 'react';
import {
  Upload,
  FileCode,
  Sparkles,
  CheckCircle2,
  Layers,
  Camera,
  Barcode,
  Calendar,
  Hash,
  Scissors,
  Download,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { PdfMarkedRegion } from '../types';
import {
  parsePhotoshopFile,
  parseTextOrJsonPhotoshopAction,
  convertPhotoshopBoxesToRegions,
  generatePhotoshopCoordinateJson,
  generatePhotoshopJsxScript,
  PhotoshopActionParseResult,
  PhotoshopBox
} from '../utils/photoshopActionParser';

interface PhotoshopActionModalProps {
  isOpen?: boolean;
  onClose: () => void;
  canvasDimensions?: { width: number; height: number };
  currentRegions: PdfMarkedRegion[];
  onApplyRegions: (newRegions: PdfMarkedRegion[]) => void;
}

export const PhotoshopActionModal: React.FC<PhotoshopActionModalProps> = ({
  isOpen = true,
  onClose,
  canvasDimensions,
  currentRegions,
  onApplyRegions,
}) => {
  const [parseResult, setParseResult] = useState<PhotoshopActionParseResult | null>(null);
  const [selectedCanvasPreset, setSelectedCanvasPreset] = useState<'current' | 'a4_300' | 'a4_150' | 'custom'>('current');
  const [customWidth, setCustomWidth] = useState<number>(canvasDimensions?.width || 2480);
  const [customHeight, setCustomHeight] = useState<number>(canvasDimensions?.height || 3508);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [mappedBoxes, setMappedBoxes] = useState<PhotoshopBox[]>([]);
  const [autoRemoveBgForPhotos, setAutoRemoveBgForPhotos] = useState<boolean>(true);
  const [cutToLayerForFin, setCutToLayerForFin] = useState<boolean>(true);

  if (!isOpen) return null;

  // Determine active document width & height
  const getDocDimensions = () => {
    if (selectedCanvasPreset === 'current' && canvasDimensions && canvasDimensions.width > 0) {
      return { width: canvasDimensions.width, height: canvasDimensions.height };
    }
    if (selectedCanvasPreset === 'a4_300') {
      return { width: 2480, height: 3508 };
    }
    if (selectedCanvasPreset === 'a4_150') {
      return { width: 1240, height: 1754 };
    }
    return { width: Math.max(100, customWidth), height: Math.max(100, customHeight) };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const docDim = getDocDimensions();
      const res = await parsePhotoshopFile(file, docDim.width, docDim.height);
      setParseResult(res);
      setMappedBoxes(res.boxes);
    } catch (err: any) {
      console.error('Photoshop action parse error:', err);
      setErrorMessage(err.message || 'Failed to parse Photoshop action or coordinate file.');
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  // Load sample Fayda Photoshop action coordinates
  const handleLoadSampleAction = () => {
    const docDim = getDocDimensions();
    const sampleResult = parseTextOrJsonPhotoshopAction(
      JSON.stringify({
        actionSetName: 'Fayda ID Auto Extraction Actions',
        actionName: 'Fayda Slip Layer Positioning',
        documentWidth: docDim.width,
        documentHeight: docDim.height,
        boxes: [
          { name: 'Photo 1 Primary Portrait', left: Math.round(docDim.width * 0.05), top: Math.round(docDim.height * 0.16), right: Math.round(docDim.width * 0.28), bottom: Math.round(docDim.height * 0.44), mappedRegionId: 'photo', layerGroup: 'photo', layerOrder: 1 },
          { name: 'Photo 2 Ghost Security Portrait', left: Math.round(docDim.width * 0.76), top: Math.round(docDim.height * 0.48), right: Math.round(docDim.width * 0.94), bottom: Math.round(docDim.height * 0.68), mappedRegionId: 'secondaryPhoto', layerGroup: 'photo', layerOrder: 2 },
          { name: 'FIN Side Cut Layer (No OCR)', left: Math.round(docDim.width * 0.32), top: Math.round(docDim.height * 0.81), right: Math.round(docDim.width * 0.94), bottom: Math.round(docDim.height * 0.93), mappedRegionId: 'finCut', layerGroup: 'fin', layerOrder: 3, cutToLayerOnly: true },
          { name: '1D Barcode Strip Layer', left: Math.round(docDim.width * 0.32), top: Math.round(docDim.height * 0.88), right: Math.round(docDim.width * 0.94), bottom: Math.round(docDim.height * 0.94), mappedRegionId: 'barcode', layerGroup: 'barcode', layerOrder: 4 },
          { name: 'FAN 16-Digits Number Layer', left: Math.round(docDim.width * 0.38), top: Math.round(docDim.height * 0.82), right: Math.round(docDim.width * 0.88), bottom: Math.round(docDim.height * 0.87), mappedRegionId: 'fan', layerGroup: 'barcode', layerOrder: 5 },
          { name: 'Issued Date Layer', left: Math.round(docDim.width * 0.06), top: Math.round(docDim.height * 0.46), right: Math.round(docDim.width * 0.32), bottom: Math.round(docDim.height * 0.51), mappedRegionId: 'dateOfIssue', layerGroup: 'dates', layerOrder: 6 },
          { name: 'Expiry Date Layer', left: Math.round(docDim.width * 0.68), top: Math.round(docDim.height * 0.38), right: Math.round(docDim.width * 0.94), bottom: Math.round(docDim.height * 0.43), mappedRegionId: 'dateOfExpiry', layerGroup: 'dates', layerOrder: 7 },
          { name: 'Full Name Amharic Layer', left: Math.round(docDim.width * 0.30), top: Math.round(docDim.height * 0.16), right: Math.round(docDim.width * 0.94), bottom: Math.round(docDim.height * 0.22), mappedRegionId: 'fullNameAmharic', layerGroup: 'text', layerOrder: 8 },
          { name: 'Full Name English Layer', left: Math.round(docDim.width * 0.30), top: Math.round(docDim.height * 0.22), right: Math.round(docDim.width * 0.94), bottom: Math.round(docDim.height * 0.27), mappedRegionId: 'fullNameEnglish', layerGroup: 'text', layerOrder: 9 },
          { name: 'Biometric QR Code Layer', left: Math.round(docDim.width * 0.05), top: Math.round(docDim.height * 0.58), right: Math.round(docDim.width * 0.32), bottom: Math.round(docDim.height * 0.88), mappedRegionId: 'qrCode', layerGroup: 'text', layerOrder: 10 },
        ]
      }),
      docDim.width,
      docDim.height
    );

    setParseResult(sampleResult);
    setMappedBoxes(sampleResult.boxes);
  };

  // Re-map box region ID on manual user selection
  const handleBoxTargetChange = (index: number, newTargetId: string) => {
    setMappedBoxes((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], matchedRegionId: newTargetId };
      return copy;
    });
  };

  // Apply mapped regions to app
  const handleApply = () => {
    if (!parseResult) return;

    const docDim = getDocDimensions();
    const updatedBoxes = mappedBoxes.map((box) => {
      if (box.matchedRegionId === 'photo' || box.matchedRegionId === 'secondaryPhoto') {
        return { ...box, autoRemoveBg: autoRemoveBgForPhotos };
      }
      if (box.matchedRegionId === 'finCut') {
        return { ...box, cutToLayerOnly: cutToLayerForFin };
      }
      return box;
    });

    const newRegions = convertPhotoshopBoxesToRegions(
      updatedBoxes,
      docDim.width,
      docDim.height
    );

    onApplyRegions(newRegions);
    onClose();
  };

  // Export current layout to ExtendScript JSX
  const handleExportJsx = () => {
    const docDim = getDocDimensions();
    const script = generatePhotoshopJsxScript(currentRegions, docDim.width, docDim.height);
    const blob = new Blob([script], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fayda_pdf_photoshop_action_script.jsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export coordinate JSON
  const handleExportJson = () => {
    const docDim = getDocDimensions();
    const jsonStr = generatePhotoshopCoordinateJson(currentRegions, docDim.width, docDim.height);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fayda_photoshop_action_coordinates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const docDim = getDocDimensions();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <span>Import Photoshop Action & Fix PDF Positions</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-extrabold font-mono">
                  .ATN / JSON
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Calibrate PDF marker positions from Photoshop Actions, with multi-layer separation, FIN side direct cut layer, and auto photo background removal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-all"
          >
            ✕
          </button>
        </div>

        {/* Reference Canvas Resolution */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>Photoshop Reference Canvas Resolution:</span>
              <span className="text-slate-400 font-normal">
                ({docDim.width} × {docDim.height} px)
              </span>
            </label>
            <span className="text-[11px] text-blue-600 font-medium">Standard Fayda Slip: A4 @ 300 DPI</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {canvasDimensions && (
              <button
                type="button"
                onClick={() => setSelectedCanvasPreset('current')}
                className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                  selectedCanvasPreset === 'current'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div className="font-bold">Current PDF Scan</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {canvasDimensions.width} × {canvasDimensions.height} px
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedCanvasPreset('a4_300')}
              className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                selectedCanvasPreset === 'a4_300'
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="font-bold">A4 @ 300 DPI (Fayda)</div>
              <div className="text-[10px] text-slate-500 font-mono">2480 × 3508 px</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCanvasPreset('a4_150')}
              className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                selectedCanvasPreset === 'a4_150'
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="font-bold">A4 @ 150 DPI</div>
              <div className="text-[10px] text-slate-500 font-mono">1240 × 1754 px</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCanvasPreset('custom')}
              className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                selectedCanvasPreset === 'custom'
                  ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="font-bold">Custom Pixels</div>
              <div className="text-[10px] text-slate-500 font-mono">Input manual W×H</div>
            </button>
          </div>

          {selectedCanvasPreset === 'custom' && (
            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Width:</span>
                <input
                  type="number"
                  value={customWidth ?? 1012}
                  onChange={(e) => setCustomWidth(Number(e.target.value))}
                  className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono"
                />
                <span className="text-slate-400 font-mono">px</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Height:</span>
                <input
                  type="number"
                  value={customHeight ?? 638}
                  onChange={(e) => setCustomHeight(Number(e.target.value))}
                  className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono"
                />
                <span className="text-slate-400 font-mono">px</span>
              </div>
            </div>
          )}
        </div>

        {/* File Upload Drop Area */}
        <div className="space-y-2">
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/20 rounded-2xl p-5 text-center transition-all">
            <input
              type="file"
              accept=".atn,.json,.jsx,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="ps-action-file-input"
            />
            <label
              htmlFor="ps-action-file-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Click to select Photoshop Action (<span className="text-blue-600">.atn</span>) or Coordinate (<span className="text-blue-600">.json / .jsx</span>)
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Supports Adobe Photoshop binary actions, ExtendScript coordinates, or Fayda JSON maps
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Or test with a pre-configured Fayda slip action:</span>
            <button
              type="button"
              onClick={handleLoadSampleAction}
              className="font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Ready Fayda Action Template</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Parse Results & Layer Table */}
        {parseResult && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200 p-3 rounded-2xl text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-blue-950 flex items-center gap-2">
                  <span>Action Set: {parseResult.actionSetName}</span>
                  <span className="text-[10px] bg-blue-200/80 text-blue-900 px-2 py-0.2 rounded-md font-mono">
                    {parseResult.detectedBoxes.length} layers detected
                  </span>
                </div>
                <div className="text-blue-700 text-[11px]">Action Name: {parseResult.actionName}</div>
              </div>
              <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Parsed Successfully
              </span>
            </div>

            {/* Special User Options for Layers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
              {/* Auto Background Removal */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(autoRemoveBgForPhotos)}
                  onChange={(e) => setAutoRemoveBgForPhotos(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Auto-Remove Photo Background</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Automatically cuts background transparent for portrait photos
                  </div>
                </div>
              </label>

              {/* FIN Side Cut Directly */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(cutToLayerForFin)}
                  onChange={(e) => setCutToLayerForFin(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-blue-600" />
                    <span>Cut FIN Side Directly to Layer (No OCR)</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Bypasses OCR text reading and renders exact cropped layer
                  </div>
                </div>
              </label>
            </div>

            {/* Detected Layer Mapping Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <div className="bg-slate-100 px-3 py-2 font-bold text-slate-700 grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider">
                <div className="col-span-5">Photoshop Action Layer</div>
                <div className="col-span-3">Coordinates (px / %)</div>
                <div className="col-span-4">Target Fayda Marker</div>
              </div>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {mappedBoxes.map((box, idx) => (
                  <div key={idx} className="px-3 py-2 grid grid-cols-12 gap-2 items-center hover:bg-slate-50/80">
                    <div className="col-span-5 font-medium text-slate-800 flex items-center gap-1.5">
                      {box.mappedRegionId === 'photo' || box.mappedRegionId === 'secondaryPhoto' ? (
                        <Camera className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : box.mappedRegionId === 'barcode' ? (
                        <Barcode className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                      ) : box.mappedRegionId === 'finCut' ? (
                        <Scissors className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      ) : box.mappedRegionId === 'dateOfIssue' || box.mappedRegionId === 'dateOfExpiry' ? (
                        <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{box.name}</span>
                    </div>

                    <div className="col-span-3 font-mono text-[11px] text-slate-500">
                      <div>L:{box.left} T:{box.top}</div>
                      <div className="text-[10px] text-slate-400">
                        W:{box.right - box.left} H:{box.bottom - box.top}
                      </div>
                    </div>

                    <div className="col-span-4">
                      <select
                        value={box.mappedRegionId}
                        onChange={(e) => handleBoxTargetChange(idx, e.target.value)}
                        className="w-full text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                      >
                        <option value="photo">📷 Photo 1 (Primary Portrait)</option>
                        <option value="secondaryPhoto">👤 Photo 2 (Ghost Security)</option>
                        <option value="finCut">✂️ FIN Side Direct Cut Layer</option>
                        <option value="barcode">🏷️ 1D Barcode Strip</option>
                        <option value="fan">🔢 FAN 16-Digit Number</option>
                        <option value="dateOfIssue">📅 Issued Date Layer</option>
                        <option value="dateOfExpiry">📅 Expiry Date Layer</option>
                        <option value="dateOfBirth">🎂 Date of Birth</option>
                        <option value="fullNameAmharic">🔤 Full Name (Amharic)</option>
                        <option value="fullNameEnglish">🔤 Full Name (English)</option>
                        <option value="qrCode">🏁 Biometric QR Code</option>
                        <option value="sex">🚻 Sex / Gender</option>
                        <option value="fcn">🆔 FCN Number</option>
                        <option value="phoneNumber">📞 Phone Number</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJsx}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Download Photoshop ExtendScript JSX to run in Adobe Photoshop"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Photoshop Script (.jsx)</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Download JSON coordinate map"
            >
              <FileCode className="w-3.5 h-3.5 text-slate-500" />
              <span>Export JSON</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!parseResult}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply & Calibrate PDF Markers</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
