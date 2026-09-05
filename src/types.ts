export interface IdCardData {
  // Personal Info
  fullNameAmharic: string;
  fullNameEnglish: string;
  fan: string; // 16-digit Fayda Identification Number e.g. 4195 0436 7069 2582
  fcn?: string; // Fayda Card Number e.g. FCN-9284-1829
  dateOfBirth: string; // e.g. 14/05/1992 (06/09/1984 E.C.)
  dateOfBirthEth?: string;
  sex: 'Male' | 'Female' | 'ወንድ' | 'ሴት';
  dateOfIssue: string; // e.g. 24/07/2024
  dateOfIssueEth?: string; // e.g. 17/11/2016
  dateOfExpiry: string; // e.g. 23/07/2034
  dateOfExpiryEth?: string; // e.g. 16/11/2026
  nationalityAmharic: string; // e.g. ኢትዮጵያዊ
  nationalityEnglish: string; // e.g. Ethiopian
  
  // Contact & Address
  phoneNumber: string; // e.g. 0928574836
  regionAmharic: string; // e.g. ሲዳማ
  regionEnglish: string; // e.g. Sidama
  zoneAmharic: string; // e.g. አርበጎና
  zoneEnglish: string; // e.g. Arbegona
  woredaAmharic: string; // e.g. ወረዳ 01
  woredaEnglish: string; // e.g. Woreda 01
  kebele?: string;
  
  // Security & Media
  photoUrl: string; // Base64 or URL
  secondaryPhotoUrl?: string; // Optional distinct second photo on bottom right
  qrData: string; // Payload / Fayda verification text
  serialNumber: string; // e.g. SN : 984729184
}

export interface FieldCoordinate {
  id: string;
  label: string;
  side: 'front' | 'back';
  x: number;
  y: number;
  fontSize: number;
  fontFamily: 'Ethiopic' | 'English' | 'Monospace';
  fontWeight: 'normal' | 'bold' | '500' | '600' | '700';
  color: string;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  rotation?: number; // 0 for horizontal, -90 for vertical left-margin
}

export interface MediaCoordinate {
  id: string;
  label: string;
  side: 'front' | 'back';
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
  opacity?: number; // 0.1 to 1.0
  isGrayscale?: boolean;
}

export interface TemplateConfig {
  sourceType: 'builtIn' | 'custom' | 'preset';
  presetId?: string;
  frontImageUrl?: string; // Data URL or Image URL
  backImageUrl?: string; // Data URL or Image URL
  frontFileName?: string;
  backFileName?: string;
  opacity: number; // 0.1 to 1.0 (default 1)
  fitMode: 'cover' | 'contain' | 'fill';
  backgroundColor: string; // e.g. '#ffffff' or '#f6fbf9'
  
  // Layer Toggles (crucial for custom pre-printed card blanks & cutouts)
  showBuiltinGuilloche: boolean; // built-in SVG waves & guilloche
  showFlag: boolean; // built-in Ethiopian flag
  showHeader: boolean; // built-in Ethiopian Digital ID header & National ID logo
  showEmblem: boolean; // built-in watermark emblem & Fayda text
  showFooterNotice: boolean; // built-in police notice & footer
  showFieldLabels: boolean; // show sub-labels like "ሙሉ ስም | Full Name"
  showFanContainerBox: boolean; // show white box around FAN or transparent
  showBarcodeBox: boolean; // show white box around FIN code or transparent
  
  // Front Barcode & FAN Cut Controls
  showFrontBarcode: boolean; // Show or Cut/Hide the barcode on the front FAN part
  showFrontFan: boolean; // Show or Cut/Hide the FAN number on front
  
  // Dual Photo Controls
  showSecondaryPhoto: boolean; // Show or Cut/Hide 2nd photo on bottom right
  secondaryPhotoStyle: 'ghost' | 'grayscale' | 'color' | 'goldBorder';
}

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  themeColor: string;
  badge: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  config: Partial<TemplateConfig>;
}

export interface CoordinatesConfig {
  canvasWidth: number; // e.g. 1012 px (CR80 at 300 DPI)
  canvasHeight: number; // e.g. 638 px
  fields: Record<string, FieldCoordinate>;
  media: Record<string, MediaCoordinate>;
}

export interface PythonFileDoc {
  name: string;
  path: string;
  description: string;
  language: string;
  code: string;
}

export interface AppSettings {
  defaultExportFormat: 'pdf' | 'jpeg';
  pdfFormat: 'a4_sheet' | 'cr80_dual' | 'front_only' | 'back_only';
  jpegLayout: 'combined_sheet' | 'front_only' | 'back_only' | 'both_files';
  jpegQuality: number; // 0.85 to 1.0 (default 0.98)
  resolutionDpi: 300 | 600;
  includeCropMarks: boolean;
  includeMetadataHeader: boolean;
  autoSavePreference: boolean;
}

export interface BatchQueueItem {
  id: string;
  fileName: string;
  fileSize?: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  progress?: number;
  extractedData: IdCardData;
  errorMessage?: string;
  uploadedAt: string;
  selected?: boolean;
}

export interface BatchExportOptions {
  format: 'a4_multi_page' | 'cr80_pvc_multi_page' | 'zip_archive';
  resolutionDpi: 300 | 600;
  includeCropMarks: boolean;
  includeMetadataHeader: boolean;
  quality?: number;
}

