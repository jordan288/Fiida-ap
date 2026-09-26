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
  photoUrl: string; // Base64 or URL - Primary/Large photo
  secondaryPhotoUrl?: string; // Optional distinct second photo on bottom right - Secondary/Small photo
  qrData: string; // Payload / Fayda verification text
  qrCodeImageUrl?: string; // High-resolution cropped QR code image extracted directly from the document
  barcodeImageUrl?: string; // High-resolution cropped 1D barcode image extracted directly from document slip
  barcodeData?: string; // Extracted or decoded 1D barcode string / numbers
  barcodeRenderMode?: 'extracted' | 'vector'; // 'extracted' (slip crop with HD binarization) or 'vector' (Code 128 mathematically generated)
  finImageUrl?: string; // High-resolution cropped FIN/FCN layer extracted directly from document
  finLayerImageUrl?: string; // Exact FIN layer bitmap for precise card cutout
  documentScanUrl?: string; // Full document page scan canvas from PDF or upload for re-cropping
  detectedPhotoBox?: { x: number; y: number; width: number; height: number }; // Detected Photo bounding coordinates on document slip
  detectedQrBox?: { x: number; y: number; width: number; height: number }; // Detected QR code bounding coordinates on document slip
  detectedBarcodeBox?: { x: number; y: number; width: number; height: number }; // Detected Barcode bounding coordinates on document slip
  detectedFinBox?: { x: number; y: number; width: number; height: number }; // Detected FIN bounding coordinates on document slip
  finLayerCropUrl?: string; // Direct cut layer image of FIN / Card Number region without OCR
  useFinLayerCrop?: boolean; // Whether to render the direct cut layer image instead of text
  backFan?: string; // Read back FAN (16-digit or formatted Fayda ID read from cutted FAN or slip)
  backFanReadSource?: 'cutLayer' | 'slipText' | 'qrPayload' | 'manual'; // Provenance of the back FAN
  dobLayerCropUrl?: string; // Direct cut layer image of Date of Birth region from PDF slip
  useDobLayerCrop?: boolean; // Whether to render the direct cut layer image instead of text
  expiryLayerCropUrl?: string; // Direct cut layer image of Date of Expiry region from PDF slip
  useExpiryLayerCrop?: boolean; // Whether to render the direct cut layer image instead of text
  issueLayerCropUrl?: string; // Direct cut layer image of Date of Issue region from PDF slip
  useIssueLayerCrop?: boolean; // Whether to render the direct cut layer image instead of text
  photoTransparentUrl?: string; // Portrait with auto-removed transparent background
  serialNumber: string; // e.g. 7492815 or 984729184
  photoColorMode?: 'color' | 'grayscale'; // 'color' (default) or 'grayscale' (black & white)
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
  fit?: 'fill' | 'contain' | 'cover';
  scaleX?: number; // Horizontal stretch multiplier (e.g. 1.0, 1.25)
  letterSpacing?: number;
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
  
  // Separated Photo Controls (Large and Small)
  showPrimaryPhoto?: boolean; // Show or Cut/Hide 1st photo (main/large)
  primaryPhotoStyle?: 'color' | 'grayscale' | 'sepia' | 'enhanced';
  showSecondaryPhoto: boolean; // Show or Cut/Hide 2nd photo on bottom right (small)
  secondaryPhotoStyle: 'ghost' | 'grayscale' | 'color' | 'goldBorder';
  
  // Separated FAN & Barcode Controls
  showFrontFan: boolean; // Show or Cut/Hide the FAN number on front
  showFrontBarcode: boolean; // Show or Cut/Hide the barcode on the front FAN part
  
  // FAN Container
  showFanContainerBox: boolean; // show white box around FAN or transparent
  
  // FIN/FCN Layer Controls
  showFinLayer?: boolean; // Show or Cut/Hide FIN layer image
  finLayerAsImage?: boolean; // Use extracted FIN image as layer (true) or fallback to text (false)
  showBarcodeBox: boolean; // show white box around FIN code or transparent

  // Registration / Crop Marks
  showCornerMarks?: boolean;
  showNationality?: boolean;

  // Active Card Typography Font
  cardFontFamily?: string;
}

export interface CustomFontItem {
  id: string;
  name: string; // e.g. "Nokia Pure Headline Bold" or custom user font
  fileName: string;
  fileSize: number;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  dataUrl: string; // base64 data URI
  createdAt: string;
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

export interface NumberedTemplate {
  number: number; // Slot number, e.g. 1, 2, 3...
  id: string;
  name: string;
  description?: string;
  themeColor?: string;
  badge?: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  frontFileName?: string;
  backFileName?: string;
  config: TemplateConfig;
  coordinates?: CoordinatesConfig; // Saved field and media positions with this template
  createdAt?: string;
  updatedAt?: string;
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
  mirrorPrint?: boolean;
  cardFontFamily?: string;
  a4CardWidthMm?: number;
  a4CardHeightMm?: number;
  a4SizePreset?: A4CardSizePreset;
  activeTemplateNumber?: number;
  fileType?: 'pdf' | 'jpeg' | 'png' | 'zip';
  photoColorMode?: 'color' | 'grayscale';
}

export type A4CardSizePreset = 'small' | 'standard' | 'oversized' | 'plus' | 'large' | 'max' | 'xlarge' | 'custom';

export interface A4CardSizePresetInfo {
  preset: A4CardSizePreset;
  widthMm: number;
  heightMm: number;
  label: string;
  tag: string;
  description: string;
}

export const A4_CARD_SIZE_PRESETS: Record<A4CardSizePreset, A4CardSizePresetInfo> = {
  small: {
    preset: 'small',
    widthMm: 84.00,
    heightMm: 52.95,
    label: 'Small (Compact)',
    tag: '84.0 × 53.0 mm',
    description: 'Reduced compact size for small badge holders & tight pouches',
  },
  standard: {
    preset: 'standard',
    widthMm: 85.60,
    heightMm: 53.98,
    label: 'Exact CR80',
    tag: '85.6 × 54.0 mm',
    description: 'ISO 7810 nominal credit card standard dimension (100% scale)',
  },
  oversized: {
    preset: 'oversized',
    widthMm: 86.80,
    heightMm: 54.75,
    label: 'Standard (+1.2mm)',
    tag: '86.8 × 54.8 mm',
    description: 'Anti-undersize compensation for PVC thermal pouches',
  },
  plus: {
    preset: 'plus',
    widthMm: 87.60,
    heightMm: 55.25,
    label: 'Plus (+2.0mm)',
    tag: '87.6 × 55.3 mm',
    description: 'Extra bleed margin for rotary cutters & guillotine trimmers',
  },
  large: {
    preset: 'large',
    widthMm: 88.60,
    heightMm: 55.88,
    label: 'Large (+3.0mm)',
    tag: '88.6 × 55.9 mm',
    description: 'Fixes IDs printing too small due to printer driver shrink (Fit to Page)',
  },
  max: {
    preset: 'max',
    widthMm: 89.60,
    heightMm: 56.50,
    label: 'Max (+4.0mm)',
    tag: '89.6 × 56.5 mm',
    description: 'Maximum oversize for heavy shrink or large commercial laminates',
  },
  xlarge: {
    preset: 'xlarge',
    widthMm: 90.60,
    heightMm: 57.15,
    label: 'XL (+5.0mm)',
    tag: '90.6 × 57.2 mm',
    description: 'Extra Large compensation for severe printer driver reduction (93% shrink fix)',
  },
  custom: {
    preset: 'custom',
    widthMm: 86.80,
    heightMm: 54.75,
    label: 'Custom mm',
    tag: 'Manual mm',
    description: 'User-calibrated custom millimeter dimensions',
  },
};

export interface BatchQueueItem {
  id: string;
  fileName: string;
  fileSize?: string;
  status: 'pending' | 'processing' | 'ready' | 'error' | 'printed';
  progress?: number;
  extractedData: IdCardData;
  errorMessage?: string;
  uploadedAt: string;
  selected?: boolean;
  photoColorMode?: 'color' | 'grayscale';
  templateNumber?: number;
  customCoordinates?: CoordinatesConfig;
  processingStep?: string;
  queuePosition?: number;
  processingDurationMs?: number;
  file?: File;
}

export interface BatchExportOptions {
  format: 'a4_multi_page' | 'cr80_pvc_multi_page' | 'zip_archive';
  resolutionDpi: 300 | 600;
  includeCropMarks: boolean;
  includeMetadataHeader: boolean;
  quality?: number;
  mirrorPrint?: boolean;
  photoColorMode?: 'color' | 'grayscale';
  numberedTemplates?: NumberedTemplate[];
  activeTemplateNumber?: number;
  useStudioPositionsAlways?: boolean;
}

export type A4BatchPrintLayout = 
  | '5_per_page_paired'    // 5 IDs per A4 sheet (Front + Back paired side-by-side, 5 rows -> 10 card faces per page)
  | '5_per_page_duplex'    // 5 IDs per A4 sheet (Sheet 1: 5 Fronts, Sheet 2: 5 Backs aligned for 2-sided duplex)
  | '5_per_page_front'     // 5 IDs per A4 sheet (Fronts only)
  | '5_per_page_back'      // 5 IDs per A4 sheet (Backs only)
  | '1_per_page_detailed'; // 1 ID per A4 sheet with detailed calibration & metadata

export interface A4BatchPrintConfig {
  layout: A4BatchPrintLayout;
  showCropMarks: boolean;
  showCutLines: boolean;
  showLabels: boolean;
  cardGapY: number; // mm between rows (default 2.0)
  cardGapX: number; // mm between Front & Back columns (default 6.0)
  topMargin: number; // mm top margin (default 10.0)
  mirrorPrint?: boolean;
  photoColorMode?: 'color' | 'grayscale';
  numberedTemplates?: NumberedTemplate[];
  activeTemplateNumber?: number;
  useStudioPositionsAlways?: boolean;
  cardWidthMm?: number;
  cardHeightMm?: number;
  duplexSide?: 'front' | 'back';
  imageFormat?: 'png' | 'jpeg';
}

export interface PdfMarkedRegion {
  id: string;
  label: string;
  labelAmh?: string;
  color: string;
  type: 'image' | 'qr' | 'text' | 'barcode' | 'fin';
  // Coordinates as percentage 0 - 100% of document canvas
  x: number;
  y: number;
  width: number;
  height: number;
  layerGroup?: 'photo' | 'id_barcode' | 'dates' | 'text' | 'security';
  layerOrder?: number;
  cutToLayerOnly?: boolean;
  autoRemoveBg?: boolean;
}

export interface PdfTextItemWithBox {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pctX: number;
  pctY: number;
  pctWidth: number;
  pctHeight: number;
}

export interface PdfMarkedPreset {
  id: string;
  name: string;
  description: string;
  regions: PdfMarkedRegion[];
  createdAt?: string;
}

export type TelegramExportFileType =
  | 'a4_pdf_5_per_page'
  | 'a4_png_5_per_page'
  | 'mirrored_transfer_a4'
  | 'hd_zip_archive';

export interface TelegramColorScheme {
  id: string;
  name: string;
  textColor: string;
  bgColor: string;
  accentColor: string;
  badge: string;
}

export interface TelegramBotPermanentSettings {
  botToken?: string;
  botUsername?: string;
  activeTemplateNumber: number;
  photoColorMode: 'color' | 'grayscale'; // 'color' (Colored) or 'grayscale' (B&W)
  colorSchemeId: string;
  colorSchemeName: string;
  primaryTextColor: string;
  cardBackgroundColor: string;
  exportFileType: TelegramExportFileType;
  mirrorVerificationPreview: boolean;
  mirrorPrintExport: boolean;
  autoProcessOnUpload: boolean;
  enableLiveWebhook: boolean;
  webhookUrl?: string;
  updatedAt: string;
}

export interface TelegramFileProcessItem {
  id: string;
  fileIndex: number;
  fileName: string;
  fileSize: number;
  status: 'queued' | 'processing' | 'completed' | 'error';
  progressStep?: string;
  extractedData?: IdCardData;
  mirroredFrontUrl?: string;
  mirroredBackUrl?: string;
  error?: string;
  timestamp: number;
}

export interface TelegramBotMessage {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
  timestamp: string;
  buttons?: Array<{ label: string; action: string; variant?: 'primary' | 'secondary' | 'success' | 'danger' }>;
  itemPreview?: {
    fileIndex: number;
    fileName: string;
    extractedData: IdCardData;
    mirroredFrontUrl?: string;
    mirroredBackUrl?: string;
  };
  exportedDocument?: {
    fileName: string;
    fileUrl: string;
    fileType: TelegramExportFileType;
    itemCount: number;
  };
  templateShowcase?: {
    templates: Array<{
      number: number;
      name: string;
      description?: string;
      frontImageUrl?: string;
      backImageUrl?: string;
      badge?: string;
      themeColor?: string;
      category?: string;
      features?: string[];
      photoStyleLabel?: string;
    }>;
  };
  isLoading?: boolean;
}

