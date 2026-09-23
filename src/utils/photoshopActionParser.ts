import { PdfMarkedRegion } from '../types';

export interface ParsedPhotoshopBox {
  name: string;
  matchedRegionId?: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  unit: 'pixels' | 'percent' | 'points' | 'unknown';
  confidence: number;
}

export type PhotoshopBox = ParsedPhotoshopBox;

export interface PhotoshopActionParseResult {
  actionSetName?: string;
  actionName?: string;
  boxes: ParsedPhotoshopBox[];
  mappedRegions: PdfMarkedRegion[];
  detectedCanvasSize?: { width: number; height: number };
  rawSourceType: 'binary_atn' | 'json' | 'extendscript_jsx' | 'text_coords';
}

/**
 * Standard reference canvas dimensions commonly used in Photoshop Fayda ID actions
 */
export const COMMON_PS_CANVAS_PRESETS = [
  { id: 'a4_300dpi', label: 'A4 @ 300 DPI (2480 × 3508 px)', width: 2480, height: 3508 },
  { id: 'a4_150dpi', label: 'A4 @ 150 DPI (1240 × 1754 px)', width: 1240, height: 1754 },
  { id: 'a4_200dpi', label: 'A4 @ 200 DPI (1654 × 2339 px)', width: 1654, height: 2339 },
  { id: 'a4_72dpi',  label: 'A4 @ 72 DPI (595 × 842 pt)', width: 595, height: 842 },
  { id: 'cr80_300dpi', label: 'CR80 ID Card @ 300 DPI (1012 × 638 px)', width: 1012, height: 638 },
];

/**
 * Keyword mapping table between Photoshop action step / layer names and Fayda region IDs
 */
const REGION_KEYWORD_MAP: { id: string; keywords: string[] }[] = [
  { id: 'photo', keywords: ['photo', 'portrait', 'face', 'picture', 'photo1', 'main photo', 'applicant photo', 'ፎቶ'] },
  { id: 'secondaryPhoto', keywords: ['photo2', 'second photo', 'secondary photo', 'ghost', 'security photo', 'small photo', 'photo 2', '2ኛ ፎቶ'] },
  { id: 'qrCode', keywords: ['qr', 'qrcode', 'qr code', 'matrix', 'biometric', 'barcode2d', 'ኪውአር'] },
  { id: 'barcode', keywords: ['barcode', '1d barcode', 'code128', 'strip', 'bar code', 'code 39', 'ባርኮድ'] },
  { id: 'fan', keywords: ['fan', 'fayda id', 'id number', 'fan number', '16 digit', 'fayda number', 'ፋይዳ ቁጥር'] },
  { id: 'finCut', keywords: ['fin', 'fin side', 'fcn', 'card number', 'fin cut', 'fin layer', 'card no', 'የካርድ ቁጥር', 'የፋይዳ ካርድ'] },
  { id: 'dateOfIssue', keywords: ['issue', 'issue date', 'date of issue', 'issued date', 'issue_date', 'የተሰጠበት ቀን', 'የተሰጠበት'] },
  { id: 'dateOfExpiry', keywords: ['expiry', 'expiry date', 'date of expiry', 'exp date', 'exp', 'የሚያበቃበት ቀን'] },
  { id: 'dateOfBirth', keywords: ['dob', 'date of birth', 'birth date', 'birth', 'የትውልድ ቀን'] },
  { id: 'fullNameAmharic', keywords: ['full name amharic', 'name amharic', 'amharic name', 'amh name', 'ሙሉ ስም አማርኛ', 'ሙሉ ስም'] },
  { id: 'fullNameEnglish', keywords: ['full name english', 'name english', 'english name', 'eng name', 'full name', 'name'] },
  { id: 'sex', keywords: ['sex', 'gender', 'ፆታ'] },
  { id: 'phoneNumber', keywords: ['phone', 'mobile', 'telephone', 'ስልክ', 'ስልክ ቁጥር'] },
  { id: 'regionAmharic', keywords: ['region amharic', 'region', 'ክልል'] },
  { id: 'zoneAmharic', keywords: ['zone amharic', 'zone', 'subcity', 'ዞን', 'ክፍለ ከተማ'] },
  { id: 'woredaAmharic', keywords: ['woreda amharic', 'woreda', 'ወረዳ'] },
  { id: 'kebele', keywords: ['kebele', 'ቀበሌ'] },
];

/**
 * Matches a name or keyword to a known Fayda Region ID
 */
export function matchNameToRegionId(name: string): string | undefined {
  const clean = name.toLowerCase().trim();
  for (const entry of REGION_KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (clean === kw || clean.includes(kw)) {
        return entry.id;
      }
    }
  }
  return undefined;
}

/**
 * Parses binary Adobe Photoshop Action (.atn) files
 * Reads binary OSType ActionDescriptors containing Top, Left, Btom, Rght coordinates.
 */
export function parseBinaryAtnFile(
  buffer: ArrayBuffer,
  refCanvasWidth: number = 2480,
  refCanvasHeight: number = 3508
): PhotoshopActionParseResult {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const boxes: ParsedPhotoshopBox[] = [];

  // 1. Try to read action set name and action names from strings embedded in the file
  const extractedStrings: { offset: number; text: string }[] = [];
  
  // Extract ASCII & UTF-16 Pascal / C strings
  for (let i = 0; i < bytes.length - 4; i++) {
    // Check for length-prefixed ASCII string
    const len = bytes[i];
    if (len >= 3 && len <= 40 && i + 1 + len <= bytes.length) {
      let isAscii = true;
      let str = '';
      for (let j = 0; j < len; j++) {
        const c = bytes[i + 1 + j];
        if (c >= 32 && c <= 126) {
          str += String.fromCharCode(c);
        } else {
          isAscii = false;
          break;
        }
      }
      if (isAscii && /[A-Za-z0-9]/.test(str)) {
        extractedStrings.push({ offset: i, text: str });
      }
    }
  }

  // 2. Scan binary stream for rectangular coordinate descriptors
  // Photoshop stores rectangular bounds using keys: 'Top ', 'Left', 'Btom', 'Rght'
  // Units are usually: 'UntF' followed by '#Pxl' or '#Prc' or '#Pnt' and an 8-byte float64.
  const tagTop = [0x54, 0x6f, 0x70, 0x20]; // 'Top '
  const tagLeft = [0x4c, 0x65, 0x66, 0x74]; // 'Left'
  const tagBtom = [0x42, 0x74, 0x6f, 0x6d]; // 'Btom'
  const tagRght = [0x52, 0x67, 0x68, 0x74]; // 'Rght'

  function readUnitFloat(offset: number): { value: number; unit: 'pixels' | 'percent' | 'points'; nextOffset: number } | null {
    if (offset + 12 > view.byteLength) return null;
    // Check for 'UntF'
    const isUntF = view.getUint8(offset) === 0x55 &&
                   view.getUint8(offset + 1) === 0x6e &&
                   view.getUint8(offset + 2) === 0x74 &&
                   view.getUint8(offset + 3) === 0x46;
    
    let cur = offset;
    let unit: 'pixels' | 'percent' | 'points' = 'pixels';

    if (isUntF) {
      cur += 4;
      const unitCode = String.fromCharCode(
        view.getUint8(cur),
        view.getUint8(cur + 1),
        view.getUint8(cur + 2),
        view.getUint8(cur + 3)
      );
      if (unitCode === '#Prc') unit = 'percent';
      else if (unitCode === '#Pnt') unit = 'points';
      else unit = 'pixels';
      cur += 4;
    }

    if (cur + 8 <= view.byteLength) {
      const val = view.getFloat64(cur, false); // Big endian
      if (!isNaN(val) && val >= 0 && val < 50000) {
        return { value: val, unit, nextOffset: cur + 8 };
      }
    }

    // Fallback: Check 4-byte float or 4-byte int
    if (cur + 4 <= view.byteLength) {
      const intVal = view.getInt32(cur, false);
      if (intVal >= 0 && intVal < 50000) {
        return { value: intVal, unit: 'pixels', nextOffset: cur + 4 };
      }
    }

    return null;
  }

  function matchesSequence(offset: number, seq: number[]): boolean {
    if (offset + seq.length > bytes.length) return false;
    for (let i = 0; i < seq.length; i++) {
      if (bytes[offset + i] !== seq[i]) return false;
    }
    return true;
  }

  for (let i = 0; i < bytes.length - 64; i++) {
    if (matchesSequence(i, tagTop)) {
      // Look for Top, Left, Btom, Rght in proximity (+/- 128 bytes)
      let topVal: number | undefined;
      let leftVal: number | undefined;
      let btomVal: number | undefined;
      let rghtVal: number | undefined;
      let unit: 'pixels' | 'percent' | 'points' = 'pixels';

      // Read top value after 'Top '
      const topRes = readUnitFloat(i + 4);
      if (topRes) {
        topVal = topRes.value;
        unit = topRes.unit;

        // Scan next 140 bytes for Left, Btom, Rght
        for (let j = i + 4; j < Math.min(bytes.length - 16, i + 140); j++) {
          if (leftVal === undefined && matchesSequence(j, tagLeft)) {
            const leftRes = readUnitFloat(j + 4);
            if (leftRes) leftVal = leftRes.value;
          } else if (btomVal === undefined && matchesSequence(j, tagBtom)) {
            const btomRes = readUnitFloat(j + 4);
            if (btomRes) btomVal = btomRes.value;
          } else if (rghtVal === undefined && matchesSequence(j, tagRght)) {
            const rghtRes = readUnitFloat(j + 4);
            if (rghtRes) rghtVal = rghtRes.value;
          }
        }

        if (topVal !== undefined && leftVal !== undefined && btomVal !== undefined && rghtVal !== undefined) {
          const w = Math.abs(rghtVal - leftVal);
          const h = Math.abs(btomVal - topVal);

          if (w > 2 && h > 2) {
            // Find closest extracted label name before this offset
            let boxName = `Crop Box ${boxes.length + 1}`;
            for (let s = extractedStrings.length - 1; s >= 0; s--) {
              if (extractedStrings[s].offset < i && i - extractedStrings[s].offset < 400) {
                const candidate = extractedStrings[s].text;
                if (!['setd', 'Crop', 'make', 'move', 'null', 'bounds', 'rectangle'].includes(candidate)) {
                  boxName = candidate;
                  break;
                }
              }
            }

            // Deduplicate almost identical boxes
            const isDuplicate = boxes.some(
              (b) => Math.abs(b.top - topVal!) < 2 && Math.abs(b.left - leftVal!) < 2
            );

            if (!isDuplicate) {
              const matchedId = matchNameToRegionId(boxName);
              boxes.push({
                name: boxName,
                matchedRegionId: matchedId,
                top: Math.min(topVal, btomVal),
                left: Math.min(leftVal, rghtVal),
                bottom: Math.max(topVal, btomVal),
                right: Math.max(leftVal, rghtVal),
                width: w,
                height: h,
                unit,
                confidence: matchedId ? 0.95 : 0.75,
              });
            }
          }
        }
      }
    }
  }

  // Map parsed boxes to Fayda PdfMarkedRegion format
  const mappedRegions = convertPhotoshopBoxesToRegions(boxes, refCanvasWidth, refCanvasHeight);

  return {
    boxes,
    mappedRegions,
    detectedCanvasSize: { width: refCanvasWidth, height: refCanvasHeight },
    rawSourceType: 'binary_atn',
  };
}

/**
 * Parses JSON or Text / ExtendScript file exported from Photoshop
 */
export function parseTextOrJsonPhotoshopAction(
  content: string,
  refCanvasWidth: number = 2480,
  refCanvasHeight: number = 3508
): PhotoshopActionParseResult {
  const trimmed = content.trim();
  const boxes: ParsedPhotoshopBox[] = [];

  // 1. Try standard JSON parse
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      let items: any[] = [];
      let canvasW = refCanvasWidth;
      let canvasH = refCanvasHeight;

      if (parsed.canvasWidth && parsed.canvasHeight) {
        canvasW = Number(parsed.canvasWidth);
        canvasH = Number(parsed.canvasHeight);
      }

      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (Array.isArray(parsed.regions)) {
        items = parsed.regions;
      } else if (Array.isArray(parsed.boxes)) {
        items = parsed.boxes;
      } else if (Array.isArray(parsed.actions)) {
        items = parsed.actions;
      } else if (typeof parsed === 'object') {
        // Object dictionary like { "photo": { x, y, width, height } }
        items = Object.entries(parsed).map(([key, val]: [string, any]) => ({
          name: key,
          ...(typeof val === 'object' ? val : {}),
        }));
      }

      for (const item of items) {
        const name = item.name || item.id || item.label || 'Region';
        let top = item.top ?? item.y ?? 0;
        let left = item.left ?? item.x ?? 0;
        let w = item.width ?? item.w ?? (item.right ? item.right - left : 0);
        let h = item.height ?? item.h ?? (item.bottom ? item.bottom - top : 0);

        // Check if values are in percent (0-100) or pixels
        const isPct = (item.unit === 'percent' || (top <= 100 && left <= 100 && w <= 100 && h <= 100 && (w < 1 || item.unit === 'percent')));
        const unit = isPct ? 'percent' : 'pixels';

        if (w > 0 && h > 0) {
          boxes.push({
            name,
            matchedRegionId: matchNameToRegionId(name),
            top: Number(top),
            left: Number(left),
            bottom: Number(top) + Number(h),
            right: Number(left) + Number(w),
            width: Number(w),
            height: Number(h),
            unit,
            confidence: 0.95,
          });
        }
      }

      if (boxes.length > 0) {
        return {
          boxes,
          mappedRegions: convertPhotoshopBoxesToRegions(boxes, canvasW, canvasH),
          detectedCanvasSize: { width: canvasW, height: canvasH },
          rawSourceType: 'json',
        };
      }
    } catch {}
  }

  // 2. Parse Photoshop ExtendScript (.jsx) or Action Text Log
  // Matches patterns like:
  // - app.activeDocument.crop([left, top, right, bottom])
  // - doc.selection.select([[left, top], [right, top], [right, bottom], [left, bottom]])
  // - Photo: 120, 340, 500, 700 (or Left, Top, Width, Height)
  const lines = content.split('\n');
  let currentActionLabel = '';

  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('#')) {
      if (l.startsWith('//') || l.startsWith('#')) {
        currentActionLabel = l.replace(/^[/#\s]+/, '');
      }
      continue;
    }

    // Match Action/Layer header like "Action: Photo Crop" or "[Photo]"
    const actionHeaderMatch = l.match(/(?:action|layer|name|step)[\s:]+["']?([^"']+)["']?/i) ||
                              l.match(/^\[([^\]]+)\]/);
    if (actionHeaderMatch) {
      currentActionLabel = actionHeaderMatch[1].trim();
    }

    // Match crop([l, t, r, b])
    const cropMatch = l.match(/crop\s*\(\s*\[?\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]?\s*\)/i);
    if (cropMatch) {
      const lVal = parseFloat(cropMatch[1]);
      const tVal = parseFloat(cropMatch[2]);
      const rVal = parseFloat(cropMatch[3]);
      const bVal = parseFloat(cropMatch[4]);
      const name = currentActionLabel || `Crop ${boxes.length + 1}`;
      boxes.push({
        name,
        matchedRegionId: matchNameToRegionId(name),
        left: lVal,
        top: tVal,
        right: rVal,
        bottom: bVal,
        width: Math.abs(rVal - lVal),
        height: Math.abs(bVal - tVal),
        unit: 'pixels',
        confidence: 0.9,
      });
      continue;
    }

    // Match select([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
    const selectMatch = l.match(/select\s*\(\s*\[\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\s*,\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\s*,\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]/i);
    if (selectMatch) {
      const x1 = parseFloat(selectMatch[1]);
      const y1 = parseFloat(selectMatch[2]);
      const x2 = parseFloat(selectMatch[3]);
      const y3 = parseFloat(selectMatch[6]);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y3);
      const bottom = Math.max(y1, y3);
      const name = currentActionLabel || `Selection ${boxes.length + 1}`;
      boxes.push({
        name,
        matchedRegionId: matchNameToRegionId(name),
        left,
        top,
        right,
        bottom,
        width: Math.abs(right - left),
        height: Math.abs(bottom - top),
        unit: 'pixels',
        confidence: 0.9,
      });
      continue;
    }

    // Match key-value line: "Photo: x=140, y=280, w=480, h=620" or "Photo: 140, 280, 480, 620"
    const coordLineMatch = l.match(/^([^:=]+)[:=]\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
    if (coordLineMatch) {
      const name = coordLineMatch[1].trim();
      const v1 = parseFloat(coordLineMatch[2]);
      const v2 = parseFloat(coordLineMatch[3]);
      const v3 = parseFloat(coordLineMatch[4]);
      const v4 = parseFloat(coordLineMatch[5]);

      // If v3 & v4 look like width/height vs right/bottom
      const isWidthHeight = v3 < refCanvasWidth && v4 < refCanvasHeight && v3 < v1 + 1000;
      const left = v1;
      const top = v2;
      const width = isWidthHeight ? v3 : Math.abs(v3 - v1);
      const height = isWidthHeight ? v4 : Math.abs(v4 - v2);

      boxes.push({
        name,
        matchedRegionId: matchNameToRegionId(name),
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        unit: 'pixels',
        confidence: 0.92,
      });
    }
  }

  const mappedRegions = convertPhotoshopBoxesToRegions(boxes, refCanvasWidth, refCanvasHeight);

  return {
    boxes,
    mappedRegions,
    detectedCanvasSize: { width: refCanvasWidth, height: refCanvasHeight },
    rawSourceType: 'extendscript_jsx',
  };
}

/**
 * Universal Entry point to parse any Photoshop Action or Coordinate file
 * Accepts ArrayBuffer (from FileReader.readAsArrayBuffer) or File
 */
export async function parsePhotoshopFile(
  file: File,
  refCanvasWidth: number = 2480,
  refCanvasHeight: number = 3508
): Promise<PhotoshopActionParseResult> {
  const fileName = file.name.toLowerCase();

  // If binary .atn file
  if (fileName.endsWith('.atn')) {
    const buffer = await file.arrayBuffer();
    return parseBinaryAtnFile(buffer, refCanvasWidth, refCanvasHeight);
  }

  // If text, JSX, JSON or CSV
  const textContent = await file.text();
  return parseTextOrJsonPhotoshopAction(textContent, refCanvasWidth, refCanvasHeight);
}

/**
 * Converts detected Photoshop bounding boxes into calibrated 0-100% PdfMarkedRegion objects
 */
export function convertPhotoshopBoxesToRegions(
  boxes: ParsedPhotoshopBox[],
  canvasWidth: number,
  canvasHeight: number
): PdfMarkedRegion[] {
  const colorPalette = [
    '#10b981', '#06b6d4', '#f59e0b', '#3b82f6', '#a855f7', 
    '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6', '#ea580c'
  ];

  return boxes.map((box, idx) => {
    const id = box.matchedRegionId || `ps_box_${idx + 1}`;
    let pctX: number;
    let pctY: number;
    let pctW: number;
    let pctH: number;

    if (box.unit === 'percent') {
      pctX = box.left;
      pctY = box.top;
      pctW = box.width;
      pctH = box.height;
    } else {
      // Convert pixel / point measurements to 0-100%
      pctX = (box.left / canvasWidth) * 100;
      pctY = (box.top / canvasHeight) * 100;
      pctW = (box.width / canvasWidth) * 100;
      pctH = (box.height / canvasHeight) * 100;
    }

    // Determine type and layer group
    let type: 'image' | 'qr' | 'text' | 'barcode' = 'text';
    let cutToLayerOnly = false;
    let autoRemoveBg = false;

    if (id === 'photo' || id === 'secondaryPhoto') {
      type = 'image';
      if (id === 'photo') autoRemoveBg = true;
    } else if (id === 'qrCode') {
      type = 'qr';
    } else if (id === 'barcode') {
      type = 'barcode';
    } else if (id === 'finCut') {
      type = 'image';
      cutToLayerOnly = true;
    }

    return {
      id,
      label: box.name || `Field ${idx + 1}`,
      color: colorPalette[idx % colorPalette.length],
      type,
      x: Number(Math.max(0, Math.min(98, pctX)).toFixed(2)),
      y: Number(Math.max(0, Math.min(98, pctY)).toFixed(2)),
      width: Number(Math.max(2, Math.min(100, pctW)).toFixed(2)),
      height: Number(Math.max(1.5, Math.min(100, pctH)).toFixed(2)),
      cutToLayerOnly,
      autoRemoveBg,
    };
  });
}

/**
 * Generates an Adobe Photoshop ExtendScript (.jsx) file containing the current Fayda marked regions
 */
export function generatePhotoshopJsxScript(
  regions: PdfMarkedRegion[],
  docWidthPx: number = 2480,
  docHeightPx: number = 3508
): string {
  const timestamp = new Date().toISOString();
  let code = `/**
 * Ethiopian Fayda ID Photoshop Extraction Action Script
 * Generated by Fayda ID Card Studio on ${timestamp}
 * Reference Document Size: ${docWidthPx} x ${docHeightPx} px (300 DPI A4)
 * Usage: In Photoshop, open your Fayda PDF/slip, then go to: File > Scripts > Browse... and select this .jsx file.
 */

#target photoshop
app.bringToFront();

if (app.documents.length === 0) {
    alert("Please open a Fayda PDF verification slip first in Photoshop before running this script!");
} else {
    var doc = app.activeDocument;
    var docW = doc.width.as('px');
    var docH = doc.height.as('px');

    // Create a Layer Group for Fayda Extracted Layers
    var group = doc.layerSets.add();
    group.name = "Fayda ID Extracted Layers";

`;

  for (const reg of regions) {
    const pxX = Math.round((reg.x / 100) * docWidthPx);
    const pxY = Math.round((reg.y / 100) * docHeightPx);
    const pxW = Math.round((reg.width / 100) * docWidthPx);
    const pxH = Math.round((reg.height / 100) * docHeightPx);
    const right = pxX + pxW;
    const bottom = pxY + pxH;

    code += `    // Layer: ${reg.label} (${reg.id})
    try {
        var selBounds = [
            [${pxX}, ${pxY}],
            [${right}, ${pxY}],
            [${right}, ${bottom}],
            [${pxX}, ${bottom}]
        ];
        doc.selection.select(selBounds);
        
        // Copy selection to new layer
        doc.selection.copy();
        var newLayer = doc.artLayers.add();
        newLayer.name = "${reg.label.replace(/"/g, '')} [${reg.id}]";
        newLayer.move(group, ElementPlacement.INSIDE);
        doc.paste();
    } catch(e) {
        // Continue next layer if empty
    }

`;
  }

  code += `    doc.selection.deselect();
    alert("✨ Successfully created ${regions.length} Fayda layers in Photoshop from your calibrated positions!");
}
`;

  return code;
}

/**
 * Generates an exportable JSON coordinate mapping file for Photoshop or Batch processing
 */
export function generatePhotoshopCoordinateJson(
  regions: PdfMarkedRegion[],
  docWidthPx: number = 2480,
  docHeightPx: number = 3508
): string {
  const payload = {
    generator: 'Fayda ID Studio Photoshop Exporter',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    canvasWidth: docWidthPx,
    canvasHeight: docHeightPx,
    regions: regions.map((r) => ({
      id: r.id,
      label: r.label,
      type: r.type,
      cutToLayerOnly: r.cutToLayerOnly || false,
      autoRemoveBg: r.autoRemoveBg || false,
      percentage: {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      },
      pixels: {
        x: Math.round((r.x / 100) * docWidthPx),
        y: Math.round((r.y / 100) * docHeightPx),
        width: Math.round((r.width / 100) * docWidthPx),
        height: Math.round((r.height / 100) * docHeightPx),
      },
    })),
  };

  return JSON.stringify(payload, null, 2);
}
