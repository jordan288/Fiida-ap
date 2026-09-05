import React, { useState } from 'react';
import { Sliders, Copy, Check, Crosshair, RefreshCw, Eye, Move } from 'lucide-react';
import { CoordinatesConfig, IdCardData, TemplateConfig } from '../types';
import { CardRenderer } from './CardRenderer';
import { DEFAULT_COORDINATES } from '../data/defaultData';

interface CoordinateCalibratorProps {
  idData: IdCardData;
  config: CoordinatesConfig;
  setConfig: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  templateConfig?: TemplateConfig;
}

export const CoordinateCalibrator: React.FC<CoordinateCalibratorProps> = ({
  idData,
  config,
  setConfig,
  templateConfig,
}) => {
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [selectedFieldId, setSelectedFieldId] = useState<string>('fullNameAmharic');
  const [copied, setCopied] = useState(false);

  const isMedia = selectedFieldId === 'photoFront' || selectedFieldId === 'qrCodeBack';
  const currentField = config.fields[selectedFieldId];
  const currentMedia = config.media[selectedFieldId];

  const handleUpdateField = (key: string, value: any) => {
    if (isMedia) {
      setConfig((prev) => ({
        ...prev,
        media: {
          ...prev.media,
          [selectedFieldId]: {
            ...prev.media[selectedFieldId],
            [key]: value,
          },
        },
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [selectedFieldId]: {
            ...prev.fields[selectedFieldId],
            [key]: value,
          },
        },
      }));
    }
  };

  const handleResetCoordinates = () => {
    setConfig(DEFAULT_COORDINATES);
  };

  const generatePythonDict = () => {
    const pythonCode = `COORDINATES_MAP = {
    "front": {
        "photo": {
            "x": ${config.media.photoFront.x},
            "y": ${config.media.photoFront.y},
            "w": ${config.media.photoFront.width},
            "h": ${config.media.photoFront.height},
            "border_radius": ${config.media.photoFront.borderRadius || 14},
        },
        "name_amharic": {
            "x": ${config.fields.fullNameAmharic.x},
            "y": ${config.fields.fullNameAmharic.y},
            "size": ${config.fields.fullNameAmharic.fontSize},
            "color": (17, 24, 39, 255),
        },
        "name_english": {
            "x": ${config.fields.fullNameEnglish.x},
            "y": ${config.fields.fullNameEnglish.y},
            "size": ${config.fields.fullNameEnglish.fontSize},
            "color": (31, 41, 55, 255),
        },
        "dob": {
            "x": ${config.fields.dateOfBirth.x},
            "y": ${config.fields.dateOfBirth.y},
            "size": ${config.fields.dateOfBirth.fontSize},
            "color": (17, 24, 39, 255),
        },
        "sex": {
            "x": ${config.fields.sex.x},
            "y": ${config.fields.sex.y},
            "size": ${config.fields.sex.fontSize},
            "color": (17, 24, 39, 255),
        },
        "expiry": {
            "x": ${config.fields.dateOfExpiry.x},
            "y": ${config.fields.dateOfExpiry.y},
            "size": ${config.fields.dateOfExpiry.fontSize},
            "color": (17, 24, 39, 255),
        },
        "issue_date": {
            "x": ${config.fields.dateOfIssueFront?.x ?? 52},
            "y": ${config.fields.dateOfIssueFront?.y ?? 330},
            "size": ${config.fields.dateOfIssueFront?.fontSize ?? 16},
            "rotation": ${config.fields.dateOfIssueFront?.rotation ?? -90},
            "color": (75, 85, 99, 255),
        },
        "fan": {
            "x": ${config.fields.fan.x},
            "y": ${config.fields.fan.y},
            "size": ${config.fields.fan.fontSize},
            "color": (15, 23, 42, 255),
        },
    },
    "back": {
        "qr_code": {
            "x": ${config.media.qrCodeBack.x},
            "y": ${config.media.qrCodeBack.y},
            "w": ${config.media.qrCodeBack.width},
            "h": ${config.media.qrCodeBack.height},
        },
        "phone": {
            "x": ${config.fields.phoneNumber.x},
            "y": ${config.fields.phoneNumber.y},
            "size": ${config.fields.phoneNumber.fontSize},
            "color": (17, 24, 39, 255),
        },
        "nationality": {
            "x": ${config.fields.nationality.x},
            "y": ${config.fields.nationality.y},
            "size": ${config.fields.nationality.fontSize},
            "color": (17, 24, 39, 255),
        },
        "address": {
            "region_x": ${config.fields.regionAmharic.x},
            "region_y": ${config.fields.regionAmharic.y},
            "zone_x": ${config.fields.zoneSubcity.x},
            "zone_y": ${config.fields.zoneSubcity.y},
            "woreda_x": ${config.fields.woredaKebele.x},
            "woreda_y": ${config.fields.woredaKebele.y},
            "size": ${config.fields.regionAmharic.fontSize},
            "color": (17, 24, 39, 255),
        },
        "sn": {
            "x": ${config.fields.serialNumber.x},
            "y": ${config.fields.serialNumber.y},
            "size": ${config.fields.serialNumber.fontSize},
            "color": (17, 24, 39, 255),
        },
    },
}`;
    return pythonCode;
  };

  const handleCopyPython = () => {
    navigator.clipboard.writeText(generatePythonDict());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const frontFieldList = [
    { id: 'photoFront', name: 'Applicant Portrait Photo' },
    { id: 'fullNameAmharic', name: 'Full Name (Amharic)' },
    { id: 'fullNameEnglish', name: 'Full Name (English)' },
    { id: 'dateOfBirth', name: 'Date of Birth (የትውልድ ቀን)' },
    { id: 'dateOfIssueFront', name: 'Date of Issue (የተሰጠበት ቀን)' },
    { id: 'dateOfExpiry', name: 'Date of Expiry (የሚያበቃበት ቀን)' },
    { id: 'sex', name: 'Sex / ፆታ' },
    { id: 'fan', name: 'FAN (16 Digits Number)' },
  ];

  const backFieldList = [
    { id: 'qrCodeBack', name: 'High-Density QR Code' },
    { id: 'phoneNumber', name: 'Phone Number' },
    { id: 'nationality', name: 'Nationality' },
    { id: 'regionAmharic', name: 'Region / ክልል' },
    { id: 'zoneSubcity', name: 'Zone / Subcity' },
    { id: 'woredaKebele', name: 'Woreda / Kebele' },
    { id: 'serialNumber', name: 'Serial Number (SN)' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-emerald-600" />
            Pixel-Perfect Coordinate Calibrator & Visual Inspector
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Click any field directly on the card to inspect and tune its exact X/Y pixels, size, and export into Python <code className="bg-gray-100 px-1 rounded text-emerald-700">config.py</code>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleResetCoordinates}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset to Defaults
          </button>
          <button
            onClick={handleCopyPython}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Python Dict!' : 'Copy config.py Coordinates'}
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Visual Card Stage */}
        <div className="lg:col-span-8 bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-center justify-center">
          {/* Side Selector */}
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl mb-6 border border-slate-800">
            <button
              onClick={() => {
                setActiveSide('front');
                setSelectedFieldId('fullNameAmharic');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSide === 'front'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Front Side Template
            </button>
            <button
              onClick={() => {
                setActiveSide('back');
                setSelectedFieldId('qrCodeBack');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSide === 'back'
                  ? 'bg-cyan-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Back Side Template
            </button>
          </div>

          <div className="py-2">
            <CardRenderer
              side={activeSide}
              data={idData}
              config={config}
              templateConfig={templateConfig}
              scale={0.75}
              highlightField={selectedFieldId}
              onSelectField={(id) => setSelectedFieldId(id)}
              interactive={true}
            />
          </div>

          <p className="text-xs text-slate-400 mt-4 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            Selected: <strong className="text-white font-mono">{selectedFieldId}</strong> — Click any area on the card to switch target
          </p>
        </div>

        {/* Fine Tuning Panel */}
        <div className="lg:col-span-4 space-y-5">
          {/* Field Selection List */}
          <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              {activeSide === 'front' ? 'Front Side Elements' : 'Back Side Elements'}
            </h3>

            <div className="space-y-1.5">
              {(activeSide === 'front' ? frontFieldList : backFieldList).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedFieldId(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                    selectedFieldId === item.id
                      ? 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-600 font-bold'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span>{item.name}</span>
                  <span className="font-mono text-[11px] text-gray-400">{item.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Coordinate Sliders */}
          <div className="bg-white border border-gray-200 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-600" />
              Adjust Position & Sizing
            </h3>

            {isMedia && currentMedia ? (
              <div className="space-y-4">
                {/* X Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>X Position (Horizontal)</span>
                    <span className="font-mono text-emerald-700">{currentMedia.x} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="800"
                    value={currentMedia.x}
                    onChange={(e) => handleUpdateField('x', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Y Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Y Position (Vertical)</span>
                    <span className="font-mono text-emerald-700">{currentMedia.y} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="600"
                    value={currentMedia.y}
                    onChange={(e) => handleUpdateField('y', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Width */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Width</span>
                    <span className="font-mono text-emerald-700">{currentMedia.width} px</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="600"
                    value={currentMedia.width}
                    onChange={(e) => handleUpdateField('width', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Height */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Height</span>
                    <span className="font-mono text-emerald-700">{currentMedia.height} px</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="600"
                    value={currentMedia.height}
                    onChange={(e) => handleUpdateField('height', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>
            ) : currentField ? (
              <div className="space-y-4">
                {/* X Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>X Position (Horizontal)</span>
                    <span className="font-mono text-emerald-700">{currentField.x} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="900"
                    value={currentField.x}
                    onChange={(e) => handleUpdateField('x', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Y Coordinate */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Y Position (Vertical)</span>
                    <span className="font-mono text-emerald-700">{currentField.y} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="600"
                    value={currentField.y}
                    onChange={(e) => handleUpdateField('y', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                {/* Font Size */}
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                    <span>Font Size</span>
                    <span className="font-mono text-emerald-700">{currentField.fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="42"
                    value={currentField.fontSize}
                    onChange={(e) => handleUpdateField('fontSize', parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Select a field above to calibrate.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
