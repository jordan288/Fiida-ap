import * as pdfjsLib from 'pdfjs-dist';
import jsQR from 'jsqr';
import { IdCardData, PdfTextItemWithBox } from '../types';
import { SAMPLE_ID_DATA } from '../data/defaultData';
import { convertGcToEth } from './ethiopianCalendar';
import { BoundingBox, detectPhotoRegion, cropPhotoFromCanvas, getDefaultPhotoBox } from './photoDetection';
import { cropExactQrCode } from './qrPrecisionCropper';
import { sanitizeEnglishName, sanitizeAmharicName, sanitizeIdCardData } from './textCleaner';

// Configure pdfjs worker
if (typeof window !== 'undefined') {
  try {
    // Primary: use unpkg version matching installed pdfjs-dist
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn('Could not set workerSrc from version:', e);
  }
}

export interface ExtractionResult {
  data: IdCardData;
  pageCanvasUrl?: string;
  extractedPhotoUrl?: string;
  extractedQrUrl?: string;
  rawText: string;
  detectedFieldsCount: number;
  detectedPhotoBox?: BoundingBox;
  detectedQrBox?: { x: number; y: number; width: number; height: number };
  textItems?: PdfTextItemWithBox[];
  canvasDimensions?: { width: number; height: number };
}

/**
 * Intelligent QR payload parser supporting all official Fayda/MOSIP formats:
 * - JSON format (standard Fayda verify & demographic payloads)
 * - XML/MOSIP Barcode format (<PrintLetterBarcodeData uid="..." name="..." dob="..." .../>)
 * - Key-Value pair format (FAN:XXXX|NAME:XXXX|DOB:XXXX|GENDER:XXXX)
 * - URL Query params (https://verify.fayda.et/?fan=XXXX&name=XXXX...)
 * - Positional Pipe-separated format (FAN|FCN|NameEn|NameAmh|DOB...)
 */
export function parseFaydaQrPayload(qrContent: string): Partial<IdCardData> {
  const result: Partial<IdCardData> = {};
  if (!qrContent) return result;

  const trimmed = qrContent.trim();

  // 1. JSON Payload format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      
      // English Name
      const engName = parsed.name || parsed.fullName || parsed.fullNameEnglish || parsed.name_en || parsed.en_name || parsed.applicantName;
      if (engName) result.fullNameEnglish = sanitizeEnglishName(String(engName));

      // Amharic Name
      const amhName = parsed.nameAmh || parsed.fullNameAmharic || parsed.name_am || parsed.am_name || parsed.amharicName || parsed.na;
      if (amhName) result.fullNameAmharic = sanitizeAmharicName(String(amhName));

      // FAN (Fayda ID)
      const fan = parsed.fan || parsed.faydaId || parsed.fin || parsed.uin || parsed.idNumber;
      if (fan) {
        const cleanFan = String(fan).replace(/[^0-9]/g, '');
        if (cleanFan.length === 16) {
          result.fan = `${cleanFan.slice(0, 4)} ${cleanFan.slice(4, 8)} ${cleanFan.slice(8, 12)} ${cleanFan.slice(12, 16)}`;
        } else {
          result.fan = String(fan);
        }
      }

      // FCN (Card Number)
      const fcn = parsed.fcn || parsed.cardNumber || parsed.cardNo || parsed.fcnNumber;
      if (fcn) result.fcn = String(fcn);

      // DOB
      const dob = parsed.dob || parsed.dateOfBirth || parsed.birthDate || parsed.birth_date;
      if (dob) {
        result.dateOfBirth = String(dob).replace(/[\-\.]/g, '/');
        const eth = convertGcToEth(result.dateOfBirth);
        if (eth) result.dateOfBirthEth = eth;
      }

      // Gender
      const gender = parsed.gender || parsed.sex || parsed.g;
      if (gender) {
        const gStr = String(gender).toLowerCase();
        result.sex = (gStr.includes('f') || gStr.includes('ሴት')) ? 'Female' : 'Male';
      }

      // Phone
      const phone = parsed.phone || parsed.phoneNumber || parsed.mobile || parsed.tel;
      if (phone) result.phoneNumber = String(phone);

      // Region
      const reg = parsed.region || parsed.regionEnglish || parsed.state;
      if (reg) result.regionEnglish = String(reg);
      const regAmh = parsed.regionAmharic || parsed.region_am;
      if (regAmh) result.regionAmharic = String(regAmh);

      // Zone / Subcity
      const zone = parsed.zone || parsed.subcity || parsed.zoneEnglish;
      if (zone) result.zoneEnglish = String(zone);
      const zoneAmh = parsed.zoneAmharic || parsed.zone_am;
      if (zoneAmh) result.zoneAmharic = String(zoneAmh);

      // Woreda
      const woreda = parsed.woreda || parsed.woredaEnglish;
      if (woreda) result.woredaEnglish = String(woreda);
      const woredaAmh = parsed.woredaAmharic || parsed.woreda_am;
      if (woredaAmh) result.woredaAmharic = String(woredaAmh);

      // Kebele
      const kebele = parsed.kebele;
      if (kebele) result.kebele = String(kebele);

      return result;
    } catch {
      // Fall through if JSON parsing fails
    }
  }

  // 2. MOSIP / XML Barcode Format (<PrintLetterBarcodeData .../>)
  if (trimmed.includes('<PrintLetterBarcodeData') || trimmed.includes('<FaydaBarcodeData')) {
    const extractAttr = (attr: string): string => {
      const match = trimmed.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i'));
      return match ? match[1].trim() : '';
    };

    const uid = extractAttr('uid') || extractAttr('fan');
    if (uid) {
      const digits = uid.replace(/[^0-9]/g, '');
      if (digits.length === 16) {
        result.fan = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
      }
    }

    const name = extractAttr('name') || extractAttr('fullName');
    if (name) result.fullNameEnglish = sanitizeEnglishName(name);

    const amhName = extractAttr('amhName') || extractAttr('nameAmh') || extractAttr('amharicName');
    if (amhName) result.fullNameAmharic = sanitizeAmharicName(amhName);

    const dob = extractAttr('dob') || extractAttr('dateOfBirth');
    if (dob) {
      result.dateOfBirth = dob.replace(/[\-\.]/g, '/');
      const eth = convertGcToEth(result.dateOfBirth);
      if (eth) result.dateOfBirthEth = eth;
    }

    const gender = extractAttr('gender') || extractAttr('sex');
    if (gender) {
      result.sex = (gender.toLowerCase().startsWith('f') || gender.includes('ሴት')) ? 'Female' : 'Male';
    }

    const phone = extractAttr('phone') || extractAttr('mobile');
    if (phone) result.phoneNumber = phone;

    return result;
  }

  // 3. URL Query Parameter format (https://.../?fan=...&name=...)
  if (trimmed.includes('?') && (trimmed.includes('fan=') || trimmed.includes('uin=') || trimmed.includes('name='))) {
    try {
      const urlPart = trimmed.substring(trimmed.indexOf('?'));
      const params = new URLSearchParams(urlPart);
      
      const fan = params.get('fan') || params.get('uin') || params.get('id');
      if (fan) {
        const digits = fan.replace(/[^0-9]/g, '');
        if (digits.length === 16) {
          result.fan = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
        }
      }

      const name = params.get('name') || params.get('fullname') || params.get('applicant');
      if (name) result.fullNameEnglish = sanitizeEnglishName(name);

      const amhName = params.get('name_am') || params.get('amh_name');
      if (amhName) result.fullNameAmharic = sanitizeAmharicName(amhName);

      const dob = params.get('dob');
      if (dob) {
        result.dateOfBirth = dob.replace(/[\-\.]/g, '/');
        const eth = convertGcToEth(result.dateOfBirth);
        if (eth) result.dateOfBirthEth = eth;
      }

      return result;
    } catch {
      // ignore
    }
  }

  // 4. Key-Value pairs separated by pipe, semicolon, or newline (e.g. FAN:4195...|NAME:Abebe...)
  const kvPairs = trimmed.split(/[|;\n]+/);
  for (const pair of kvPairs) {
    const colonIdx = pair.indexOf(':');
    const eqIdx = pair.indexOf('=');
    const splitIdx = colonIdx !== -1 ? colonIdx : eqIdx;
    
    if (splitIdx > 0) {
      const key = pair.slice(0, splitIdx).trim().toLowerCase();
      const val = pair.slice(splitIdx + 1).trim();

      if (/^(?:fan|fin|uin|fayda|id)$/i.test(key)) {
        const digits = val.replace(/[^0-9]/g, '');
        if (digits.length === 16) {
          result.fan = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12, 16)}`;
        }
      } else if (/^(?:fcn|card)$/i.test(key)) {
        result.fcn = val;
      } else if (/^(?:name|fullname|english_name|en_name)$/i.test(key)) {
        result.fullNameEnglish = sanitizeEnglishName(val);
      } else if (/^(?:name_am|amharic_name|amh_name|ስም)$/i.test(key)) {
        result.fullNameAmharic = sanitizeAmharicName(val);
      } else if (/^(?:dob|birth|birth_date)$/i.test(key)) {
        result.dateOfBirth = val.replace(/[\-\.]/g, '/');
        const eth = convertGcToEth(result.dateOfBirth);
        if (eth) result.dateOfBirthEth = eth;
      } else if (/^(?:sex|gender|ፆታ)$/i.test(key)) {
        result.sex = (val.toLowerCase().startsWith('f') || val.includes('ሴት')) ? 'Female' : 'Male';
      } else if (/^(?:phone|mobile|tel|ስልክ)$/i.test(key)) {
        result.phoneNumber = val;
      }
    }
  }

  // 5. Plain tokens (e.g. 16-digit FAN token, Ethiopic name token, Latin name token)
  for (const token of kvPairs) {
    const t = token.trim();
    if (!result.fan && /^\d{16}$/.test(t)) {
      result.fan = `${t.slice(0, 4)} ${t.slice(4, 8)} ${t.slice(8, 12)} ${t.slice(12, 16)}`;
    } else if (!result.fcn && /^\d{4}-\d{4}-\d{4}$/.test(t)) {
      result.fcn = t;
    } else if (!result.dateOfBirth && /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(t)) {
      result.dateOfBirth = t.replace(/[\-\.]/g, '/');
      const eth = convertGcToEth(result.dateOfBirth);
      if (eth) result.dateOfBirthEth = eth;
    } else if (!result.fullNameAmharic && /^[\u1200-\u137F]{2,}(?:\s+[\u1200-\u137F]{2,}){1,3}$/.test(t)) {
      result.fullNameAmharic = sanitizeAmharicName(t);
    } else if (!result.fullNameEnglish && /^[A-Za-z]{2,}(?:\s+[A-Za-z]{2,}){1,3}$/.test(t)) {
      const sanitized = sanitizeEnglishName(t);
      if (sanitized && !/Demographic|Information|Details|Biometric|Fayda/i.test(sanitized)) {
        result.fullNameEnglish = sanitized;
      }
    }
  }

  return result;
}

/**
 * Intelligent parser for Ethiopian Fayda slip demographic and biometric text.
 * Accurately cleans English name (purging the word "Demographic"), Amharic name,
 * and extracts all fields across digital and scanned layouts.
 */
export function parseFaydaSlipData(
  rawText: string,
  lines: string[],
  qrContent?: string
): { data: IdCardData; fieldCount: number } {
  const result: IdCardData = { ...SAMPLE_ID_DATA };
  let detectedCount = 0;

  // First check if QR content is available to seed high-confidence cryptographic data
  if (qrContent) {
    const qrData = parseFaydaQrPayload(qrContent);
    if (qrData.fan) { result.fan = qrData.fan; detectedCount++; }
    if (qrData.fcn) { result.fcn = qrData.fcn; detectedCount++; }
    if (qrData.fullNameEnglish) { result.fullNameEnglish = qrData.fullNameEnglish; detectedCount++; }
    if (qrData.fullNameAmharic) { result.fullNameAmharic = qrData.fullNameAmharic; detectedCount++; }
    if (qrData.dateOfBirth) { result.dateOfBirth = qrData.dateOfBirth; detectedCount++; }
    if (qrData.dateOfBirthEth) { result.dateOfBirthEth = qrData.dateOfBirthEth; }
    if (qrData.sex) { result.sex = qrData.sex; detectedCount++; }
    if (qrData.phoneNumber) { result.phoneNumber = qrData.phoneNumber; detectedCount++; }
    if (qrData.regionEnglish) { result.regionEnglish = qrData.regionEnglish; }
    if (qrData.regionAmharic) { result.regionAmharic = qrData.regionAmharic; }
    if (qrData.zoneEnglish) { result.zoneEnglish = qrData.zoneEnglish; }
    if (qrData.zoneAmharic) { result.zoneAmharic = qrData.zoneAmharic; }
    if (qrData.woredaEnglish) { result.woredaEnglish = qrData.woredaEnglish; }
    if (qrData.woredaAmharic) { result.woredaAmharic = qrData.woredaAmharic; }
    if (qrData.kebele) { result.kebele = qrData.kebele; }
  }

  // 1. FAN (Fayda Identification Number) - 16 digits
  // Formats: 4195 0436 7069 2582 or 4195-0436-7069-2582 or 4195043670692582
  if (!result.fan || result.fan === SAMPLE_ID_DATA.fan) {
    const fanMatch = rawText.match(/\b(\d{4})[ \-_](\d{4})[ \-_](\d{4})[ \-_](\d{4})\b/) ||
                     rawText.match(/(?:FAN|FIN|UIN|Fayda|ፋይዳ)[\s:|\-/]*(\d{16})\b/i) ||
                     rawText.match(/\b(\d{16})\b/);
    if (fanMatch) {
      if (fanMatch[1] && fanMatch[2] && fanMatch[3] && fanMatch[4]) {
        result.fan = `${fanMatch[1]} ${fanMatch[2]} ${fanMatch[3]} ${fanMatch[4]}`;
      } else if (fanMatch[1] && fanMatch[1].length === 16) {
        const d = fanMatch[1];
        result.fan = `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`;
      }
      detectedCount++;
    }
  }

  // 2. FCN (Fayda Card Number)
  if (!result.fcn || result.fcn === SAMPLE_ID_DATA.fcn) {
    const fcnMatch = rawText.match(/\b(?:FCN|Card\s*No|ካርድ\s*ቁጥር)[\s:]*([A-Z0-9\-]+)\b/i) ||
                     rawText.match(/\b(\d{4}-\d{4}-\d{4})\b/);
    if (fcnMatch) {
      result.fcn = fcnMatch[1];
      detectedCount++;
    }
  }

  // 3. Phone Number (+251... or 09... or 07...)
  const phoneMatch = rawText.match(/(?:\+251|0)[97]\d{8}/);
  if (phoneMatch) {
    let p = phoneMatch[0];
    if (p.startsWith('0')) {
      p = '+251' + p.substring(1);
    }
    result.phoneNumber = p;
    detectedCount++;
  }

  // 4. Dates (DD/MM/YYYY or YYYY-MM-DD or DD-MM-YYYY)
  const dateRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/g;
  const datesFound: string[] = [];
  let dMatch;
  while ((dMatch = dateRegex.exec(rawText)) !== null) {
    const day = dMatch[1].padStart(2, '0');
    const month = dMatch[2].padStart(2, '0');
    const year = dMatch[3];
    datesFound.push(`${day}/${month}/${year}`);
  }

  const isoDateRegex = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
  while ((dMatch = isoDateRegex.exec(rawText)) !== null) {
    const year = dMatch[1];
    const month = dMatch[2].padStart(2, '0');
    const day = dMatch[3].padStart(2, '0');
    datesFound.push(`${day}/${month}/${year}`);
  }

  if (datesFound.length > 0) {
    // Look specifically for DOB label
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/birth|dob|ትውልድ/i.test(line)) {
        const found = line.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}\b/);
        if (found) {
          result.dateOfBirth = found[0].replace(/[\-\.]/g, '/');
          const eth = convertGcToEth(result.dateOfBirth);
          if (eth) result.dateOfBirthEth = eth;
          detectedCount++;
          break;
        }
      }
    }

    if ((!result.dateOfBirth || result.dateOfBirth === SAMPLE_ID_DATA.dateOfBirth) && datesFound[0]) {
      result.dateOfBirth = datesFound[0];
      const eth = convertGcToEth(result.dateOfBirth);
      if (eth) result.dateOfBirthEth = eth;
      detectedCount++;
    }

    if (datesFound.length >= 2) {
      result.dateOfIssue = datesFound[1];
      detectedCount++;
    }
    if (datesFound.length >= 3) {
      result.dateOfExpiry = datesFound[2];
      detectedCount++;
    }
  }

  // 5. Gender / ፆታ
  if (/\b(?:Female|ሴት)\b/i.test(rawText)) {
    result.sex = 'Female';
    detectedCount++;
  } else if (/\b(?:Male|ወንድ)\b/i.test(rawText)) {
    result.sex = 'Male';
    detectedCount++;
  }

  // 6. English Full Name Extraction
  // CRITICAL REQUIREMENT: Complete removal of the word "Demographic" and reference metadata words
  let foundEnglishName = '';
  let englishLineIdx = -1;

  // Words that can NEVER be a person's name
  const nonNameEnglishRegex = /Federal|Democratic|Demographic|Demographics|Republic|National|Identification|Verification|Program|Date|Birth|Issue|Expiry|Gender|Male|Female|Ethiopian|Region|Zone|Subcity|Woreda|Kebele|Phone|Information|Details|Biometric|Biometrics|Card|Document|Registration|Holder|Fayda|Ministry|Authority|Official|Slip|Signature|Bearer/i;

  // Strategy A: Direct label match on lines (e.g. "Full Name: Ayele Zekwos Daka", "Demographic Information Full Name: Ayele Zekwos")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match line with Full Name label
    const labelMatch = line.match(/(?:(?:Demographic\s+)?(?:Full\s*Name|Fullname|Name|Applicant\s*Name))[\s:|\-\/]+([A-Za-z\s'\-]+)/i);
    if (labelMatch) {
      const cand = sanitizeEnglishName(labelMatch[1]);
      if (cand && !nonNameEnglishRegex.test(cand)) {
        foundEnglishName = cand;
        englishLineIdx = i;
        break;
      }
    }
  }

  // Strategy B: If not found via direct label, scan for capitalized multi-word person name sequences
  if (!foundEnglishName) {
    const englishNameRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g;
    const candidates: { name: string; lineIdx: number; score: number }[] = [];
    let eMatch;
    while ((eMatch = englishNameRegex.exec(rawText)) !== null) {
      const rawCandidate = eMatch[1].trim();
      const sanitized = sanitizeEnglishName(rawCandidate);
      if (sanitized && !nonNameEnglishRegex.test(sanitized)) {
        const lineIdx = lines.findIndex((l) => l.includes(sanitized) || l.includes(rawCandidate));
        let score = sanitized.split(/\s+/).length === 3 ? 30 : 20;
        if (lineIdx >= 0 && lineIdx < 14) score += 25;
        candidates.push({ name: sanitized, lineIdx, score });
      }
    }

    // Also check ALL-CAPS names (common in official documents: "AYELE ZEKWOS DAKA")
    const allCapsRegex = /\b([A-Z]{3,}(?:\s+[A-Z]{3,}){1,3})\b/g;
    while ((eMatch = allCapsRegex.exec(rawText)) !== null) {
      const rawCandidate = eMatch[1].trim();
      const sanitized = sanitizeEnglishName(rawCandidate);
      if (sanitized && !nonNameEnglishRegex.test(sanitized)) {
        const lineIdx = lines.findIndex((l) => l.includes(rawCandidate));
        let score = sanitized.split(/\s+/).length === 3 ? 25 : 15;
        if (lineIdx >= 0 && lineIdx < 14) score += 25;
        candidates.push({ name: sanitized, lineIdx, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      foundEnglishName = candidates[0].name;
      englishLineIdx = candidates[0].lineIdx;
    }
  }

  if (foundEnglishName) {
    result.fullNameEnglish = sanitizeEnglishName(foundEnglishName);
    detectedCount++;
  }

  // 7. Amharic Full Name Reader (Correctly targeted & purged of "የስነ-ህዝብ / ስነ-ህዝብ")
  let foundAmharicName = '';

  const isNonNameAmharic = (str: string) => {
    return /ፌዴራላዊ|ዴሞክራሲያዊ|ሪፐብሊክ|ብሔራዊ|መታወቂያ|ፕሮግራም|ማረጋገጫ|ወረቀት|ሰነድ|ምዝገባ|የትውልድ|የተሰጠበት|የሚያበቃበት|ዜግነት|ኢትዮጵያዊ|ስልክ|ክልል|ዞን|ወረዳ|ቀበሌ|አስተዳደር|መንግስት|አገልግሎት|ማስታወሻ|ቢሮ|የስነ[\s\-_]*ህዝብ|የስነ[\s\-_]*ሕዝብ|ስነ[\s\-_]*ህዝብ|ስነ[\s\-_]*ሕዝብ|ስነህዝብ|ስነሕዝብ|መረጃ|ዝርዝር|ባዮሜትሪክ/i.test(str);
  };

  const extractEthiopicSequence = (text: string): string | null => {
    const clean = sanitizeAmharicName(text);
    const match = clean.match(/[\u1200-\u137F]{2,}(?:\s+[\u1200-\u137F]{2,}){1,3}/);
    if (match) {
      const candidate = sanitizeAmharicName(match[0]);
      if (candidate && !isNonNameAmharic(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  // Strategy A: Direct label match on lines (e.g. "ሙሉ ስም: አየለ ዘክዎስ ዳካ")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:ሙሉ\s*ስም|ስም)\s*[:/|\-]/i.test(line)) {
      const cand = extractEthiopicSequence(line);
      if (cand) {
        foundAmharicName = cand;
        break;
      }
    }
    // Standalone label "ሙሉ ስም", check adjacent next lines
    if (/^(?:ሙሉ\s*ስም|ስም)(?:\s*[\/|]\s*Full\s*Name)?\s*$/i.test(line.trim())) {
      if (i + 1 < lines.length) {
        const nextCand = extractEthiopicSequence(lines[i + 1]);
        if (nextCand) {
          foundAmharicName = nextCand;
          break;
        }
      }
      if (i + 2 < lines.length) {
        const nextCand2 = extractEthiopicSequence(lines[i + 2]);
        if (nextCand2) {
          foundAmharicName = nextCand2;
          break;
        }
      }
    }
  }

  // Strategy B: Anchor to English Name line
  if (!foundAmharicName && englishLineIdx >= 0) {
    const sameLineCand = extractEthiopicSequence(lines[englishLineIdx]);
    if (sameLineCand) {
      foundAmharicName = sameLineCand;
    } else if (englishLineIdx > 0) {
      const prevCand = extractEthiopicSequence(lines[englishLineIdx - 1]);
      if (prevCand) {
        foundAmharicName = prevCand;
      }
    }
    if (!foundAmharicName && englishLineIdx + 1 < lines.length) {
      const nextCand = extractEthiopicSequence(lines[englishLineIdx + 1]);
      if (nextCand) {
        foundAmharicName = nextCand;
      }
    }
  }

  // Strategy C: Global Candidate Scoring across all Ethiopic tokens in document
  if (!foundAmharicName) {
    const englishWordCount = result.fullNameEnglish ? result.fullNameEnglish.split(/\s+/).length : 3;
    const candidates: { name: string; score: number }[] = [];
    const amharicRegex = /[\u1200-\u137F]{2,}(?:\s+[\u1200-\u137F]{2,}){1,3}/g;
    let aMatch;

    while ((aMatch = amharicRegex.exec(rawText)) !== null) {
      const str = sanitizeAmharicName(aMatch[0]);
      if (str && !isNonNameAmharic(str)) {
        const words = str.split(/\s+/);
        let score = 0;
        if (words.length === 3) score += 40;
        else if (words.length === 2) score += 25;
        else if (words.length === 4) score += 15;
        else score -= 30;

        if (words.length === englishWordCount) score += 30;

        const idx = aMatch.index;
        const surroundingText = rawText.substring(Math.max(0, idx - 50), Math.min(rawText.length, idx + str.length + 50));
        if (/ስም|Name/i.test(surroundingText)) score += 40;

        if (str.length >= 8 && str.length <= 32) score += 20;

        candidates.push({ name: str, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      foundAmharicName = candidates[0].name;
    }
  }

  if (foundAmharicName) {
    result.fullNameAmharic = sanitizeAmharicName(foundAmharicName);
    detectedCount++;
  }

  // 8. Regions in Ethiopia
  const regionPatterns: { eng: string; amh: string; regex: RegExp }[] = [
    { eng: 'Addis Ababa', amh: 'አዲስ አበባ', regex: /Addis\s*Ababa|አዲስ\s*አበባ/i },
    { eng: 'Oromia', amh: 'ኦሮሚያ', regex: /Oromia|ኦሮሚያ/i },
    { eng: 'Amhara', amh: 'አማራ', regex: /Amhara|አማራ/i },
    { eng: 'Sidama', amh: 'ሲዳማ', regex: /Sidama|ሲዳማ/i },
    { eng: 'Tigray', amh: 'ትግራይ', regex: /Tigray|ትግራይ/i },
    { eng: 'Somali', amh: 'ሶማሌ', regex: /Somali|ሶማሌ/i },
    { eng: 'Afar', amh: 'ዓፋር', regex: /Afar|ዓፋር|አፋር/i },
    { eng: 'Dire Dawa', amh: 'ድሬዳዋ', regex: /Dire\s*Dawa|ድሬዳዋ/i },
    { eng: 'Benishangul Gumuz', amh: 'ቤኒሻንጉል ጉሙዝ', regex: /Benishangul|ቤኒሻንጉል/i },
    { eng: 'Gambella', amh: 'ጋምቤላ', regex: /Gambella|ጋምቤላ/i },
    { eng: 'Central Ethiopia', amh: 'ማዕከላዊ ኢትዮጵያ', regex: /Central\s*Ethiopia|ማዕከላዊ/i },
    { eng: 'South Ethiopia', amh: 'ደቡብ ኢትዮጵያ', regex: /South\s*Ethiopia|ደቡብ\s*ኢትዮጵያ/i },
    { eng: 'South West Ethiopia', amh: 'ደቡብ ምዕራብ', regex: /South\s*West|ደቡብ\s*ምዕራብ/i },
    { eng: 'Harari', amh: 'ሐረሪ', regex: /Harari|ሐረሪ/i },
  ];

  for (const reg of regionPatterns) {
    if (reg.regex.test(rawText)) {
      result.regionEnglish = reg.eng;
      result.regionAmharic = reg.amh;
      detectedCount++;
      break;
    }
  }

  // Helper to cleanly separate Amharic and English location parts
  const splitBilingualLocation = (raw: string): { english: string; amharic: string } => {
    const trimmed = raw.trim();
    if (!trimmed) return { english: '', amharic: '' };

    if (/[\/\|\-]/.test(trimmed)) {
      const parts = trimmed.split(/[\/\|\-]/).map((s) => s.trim()).filter(Boolean);
      let eng = '';
      let amh = '';
      for (const part of parts) {
        if (/[\u1200-\u137F]/.test(part)) {
          amh = amh ? `${amh} ${part}` : part;
        } else if (/[A-Za-z]/.test(part)) {
          eng = eng ? `${eng} ${part}` : part;
        }
      }
      if (eng || amh) {
        return { english: eng, amharic: amh };
      }
    }

    const hasEthiopic = /[\u1200-\u137F]/.test(trimmed);
    const hasLatin = /[A-Za-z]/.test(trimmed);

    if (hasEthiopic && hasLatin) {
      const amhMatches = trimmed.match(/[\u1200-\u137F0-9\s]+/g);
      const engMatches = trimmed.match(/[A-Za-z0-9\s]+/g);
      return {
        english: engMatches ? engMatches.join(' ').trim() : '',
        amharic: amhMatches ? amhMatches.join(' ').trim() : '',
      };
    }

    if (hasEthiopic) {
      return { english: '', amharic: trimmed };
    }

    return { english: trimmed, amharic: '' };
  };

  // 9. Zone / Subcity, Woreda, Kebele (Extract both English and Amharic)
  const zoneMatch = rawText.match(/(?:Zone\s*\/\s*Subcity|Zone|Subcity|ዞን\s*\/\s*ክፍለ\s*ከተማ|ክፍለ\s*ከተማ|ዞን)[\s:|\-/]+([A-Za-z\u1200-\u137F0-9\s\-\/]+?)(?=(?:Woreda|ወረዳ|Kebele|ቀበሌ|\n|\r|$))/i);
  if (zoneMatch && zoneMatch[1].trim()) {
    const parsedZone = splitBilingualLocation(zoneMatch[1]);
    if (parsedZone.english) result.zoneEnglish = parsedZone.english;
    if (parsedZone.amharic) result.zoneAmharic = parsedZone.amharic;
    if (!result.zoneEnglish && parsedZone.amharic) result.zoneEnglish = parsedZone.amharic;
    if (!result.zoneAmharic && parsedZone.english) result.zoneAmharic = parsedZone.english;
    detectedCount++;
  }

  const woredaMatch = rawText.match(/(?:Woreda|ወረዳ)[\s:|\-/]+([A-Za-z0-9\u1200-\u137F\s\-\/]+?)(?=(?:Kebele|ቀበሌ|\n|\r|$))/i);
  if (woredaMatch && woredaMatch[1].trim()) {
    const parsedWoreda = splitBilingualLocation(woredaMatch[1]);
    if (parsedWoreda.english) result.woredaEnglish = parsedWoreda.english;
    if (parsedWoreda.amharic) result.woredaAmharic = parsedWoreda.amharic;
    if (!result.woredaEnglish && parsedWoreda.amharic) result.woredaEnglish = parsedWoreda.amharic;
    if (!result.woredaAmharic && parsedWoreda.english) result.woredaAmharic = parsedWoreda.english;
    detectedCount++;
  }

  const kebeleMatch = rawText.match(/(?:Kebele|ቀበሌ)[\s:|\-/]+([A-Za-z0-9\u1200-\u137F\s\-\/]+?)(?=(?:\n|\r|$))/i);
  if (kebeleMatch && kebeleMatch[1].trim()) {
    result.kebele = kebeleMatch[1].trim();
    detectedCount++;
  }

  // Final rigorous sanitization
  const sanitized = sanitizeIdCardData(result);

  return {
    data: sanitized,
    fieldCount: detectedCount,
  };
}

/**
 * Extracts text lines, page canvas, photo, and exact QR code from an uploaded PDF file.
 * Compatible with ALL types of PDFs:
 * - Direct vector PDFs from official Fayda portals
 * - Scanned image / raster PDFs
 * - Multi-page PDF summaries
 * - Rotated / photographed paper slips
 */
export async function extractFromPdf(file: File): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/cmaps/`,
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const allLines: string[] = [];

  // Extract text across pages (up to 3 pages)
  for (let i = 1; i <= Math.min(numPages, 3); i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const rawItems: { str: string; x: number; y: number; width: number; height: number }[] = [];
    
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const transform = item.transform;
        rawItems.push({
          str: item.str.trim(),
          x: transform[4],
          y: transform[5],
          width: item.width || 0,
          height: item.height || 0,
        });
      }
    }

    // Group text items with adaptive Y-coordinate tolerance (7.5px) for horizontal line continuity
    const sorted = [...rawItems].sort((a, b) => b.y - a.y || a.x - b.x);
    let currentY = -9999;
    let currentLine: string[] = [];

    for (const item of sorted) {
      if (Math.abs(item.y - currentY) > 7.5) {
        if (currentLine.length > 0) {
          allLines.push(currentLine.join(' '));
        }
        currentLine = [item.str];
        currentY = item.y;
      } else {
        currentLine.push(item.str);
      }
    }
    if (currentLine.length > 0) {
      allLines.push(currentLine.join(' '));
    }
  }

  const rawFullText = allLines.join('\n');

  // Render Page 1 to Canvas (High Resolution for OCR, QR reading, and Photo extraction)
  const page1 = await pdf.getPage(1);
  const viewport = page1.getViewport({ scale: 2.8 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (ctx) {
    // @ts-expect-error pdfjs canvas context
    await page1.render({ canvasContext: ctx, viewport }).promise;
  }

  const pageCanvasUrl = canvas.toDataURL('image/jpeg', 0.90);

  // Capture precise bounding boxes of text items on Page 1 in viewport coordinates
  const textItems: PdfTextItemWithBox[] = [];
  try {
    const page1TextContent = await page1.getTextContent();
    for (const item of page1TextContent.items) {
      if ('str' in item && item.str.trim()) {
        const transform = item.transform;
        const pt = viewport.convertToViewportPoint(transform[4], transform[5]);
        const fontHeight = Math.max(12, Math.abs(transform[3] || transform[0] || 12) * viewport.scale * 0.9);
        const itemWidth = Math.max(8, (item.width || 20) * viewport.scale);
        const x = Math.max(0, pt[0]);
        const y = Math.max(0, pt[1] - fontHeight);
        const width = Math.min(canvas.width - x, itemWidth);
        const height = fontHeight;

        textItems.push({
          str: item.str.trim(),
          x,
          y,
          width,
          height,
          pctX: (x / canvas.width) * 100,
          pctY: (y / canvas.height) * 100,
          pctWidth: (width / canvas.width) * 100,
          pctHeight: (height / canvas.height) * 100,
        });
      }
    }
  } catch (err) {
    console.warn('Could not collect page1 text item boxes:', err);
  }

  // Precision QR code detection and exact crop from the document canvas
  let extractedQrUrl: string | undefined;
  let qrDecodedText: string | undefined;
  let qrLocation: { x: number; y: number; width: number; height: number } | undefined;

  try {
    const qrResult = cropExactQrCode(canvas);
    if (qrResult.detected) {
      extractedQrUrl = qrResult.qrUrl;
      qrDecodedText = qrResult.qrText;
      qrLocation = qrResult.boundingBox;
    }
  } catch (err) {
    console.warn('Page 1 QR extraction failed:', err);
  }

  // Intelligent photo area detection & high-resolution crop from the slip
  let extractedPhotoUrl: string | undefined;
  let detectedPhotoBox: BoundingBox | undefined;
  if (ctx) {
    try {
      detectedPhotoBox = detectPhotoRegion(canvas, qrLocation);
      extractedPhotoUrl = cropPhotoFromCanvas(canvas, detectedPhotoBox, 480, 640);
    } catch (e) {
      console.warn('Smart photo detection fallback:', e);
      detectedPhotoBox = getDefaultPhotoBox(canvas.width, canvas.height);
      extractedPhotoUrl = cropPhotoFromCanvas(canvas, detectedPhotoBox, 480, 640);
    }
  }

  // Multi-page fallback: If page 1 did not have a detectable QR code, search page 2 and 3
  if ((!extractedQrUrl || !extractedPhotoUrl) && numPages > 1) {
    for (let p = 2; p <= Math.min(numPages, 3); p++) {
      try {
        const nextPage = await pdf.getPage(p);
        const nextVp = nextPage.getViewport({ scale: 2.8 });
        const nextCanvas = document.createElement('canvas');
        nextCanvas.width = nextVp.width;
        nextCanvas.height = nextVp.height;
        const nextCtx = nextCanvas.getContext('2d', { willReadFrequently: true });
        
        if (nextCtx) {
          // @ts-expect-error pdfjs canvas context
          await nextPage.render({ canvasContext: nextCtx, viewport: nextVp }).promise;

          if (!extractedQrUrl) {
            const nextQr = cropExactQrCode(nextCanvas);
            if (nextQr.detected) {
              extractedQrUrl = nextQr.qrUrl;
              qrDecodedText = nextQr.qrText;
              qrLocation = nextQr.boundingBox;
            }
          }

          if (!extractedPhotoUrl) {
            try {
              detectedPhotoBox = detectPhotoRegion(nextCanvas, qrLocation);
              extractedPhotoUrl = cropPhotoFromCanvas(nextCanvas, detectedPhotoBox, 480, 640);
            } catch {
              // ignore
            }
          }

          if (extractedQrUrl && extractedPhotoUrl) break;
        }
      } catch (err) {
        console.warn(`Error scanning page ${p}:`, err);
      }
    }
  }

  // Secondary QR decoding attempt: If we cropped a QR code image but jsQR full-page didn't read its string,
  // decode directly on the cropped QR canvas with contrast enhancement
  if (extractedQrUrl && !qrDecodedText) {
    try {
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        qrImg.onload = resolve;
        qrImg.onerror = reject;
        qrImg.src = extractedQrUrl!;
      });

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = qrImg.naturalWidth;
      cropCanvas.height = qrImg.naturalHeight;
      const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
      if (cropCtx) {
        cropCtx.drawImage(qrImg, 0, 0);
        const imgData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
        const decoded = jsQR(imgData.data, cropCanvas.width, cropCanvas.height);
        if (decoded && decoded.data) {
          qrDecodedText = decoded.data;
        }
      }
    } catch (e) {
      console.warn('Secondary QR decode attempt error:', e);
    }
  }

  // Parse Fayda slip text and cryptographic payload
  const parsedData = parseFaydaSlipData(rawFullText, allLines, qrDecodedText);

  if (extractedPhotoUrl) {
    parsedData.data.photoUrl = extractedPhotoUrl;
  }
  if (qrDecodedText) {
    parsedData.data.qrData = qrDecodedText;
  }
  if (extractedQrUrl) {
    parsedData.data.qrCodeImageUrl = extractedQrUrl;
  }
  if (qrLocation) {
    parsedData.data.detectedQrBox = qrLocation;
  }
  if (pageCanvasUrl) {
    parsedData.data.documentScanUrl = pageCanvasUrl;
  }

  return {
    data: parsedData.data,
    pageCanvasUrl,
    extractedPhotoUrl,
    extractedQrUrl,
    rawText: rawFullText,
    detectedFieldsCount: parsedData.fieldCount,
    detectedPhotoBox,
    detectedQrBox: qrLocation,
    textItems,
    canvasDimensions: { width: canvas.width, height: canvas.height },
  };
}

/**
 * Extracts data when the user uploads an image (JPG, PNG) of the slip
 */
export async function extractFromImage(file: File): Promise<ExtractionResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }

        const pageCanvasUrl = canvas.toDataURL('image/jpeg', 0.90);

        // Precision QR code detection and exact crop from image
        let extractedQrUrl: string | undefined;
        let qrDecodedText: string | undefined;
        let qrLocation: { x: number; y: number; width: number; height: number } | undefined;

        try {
          const qrResult = cropExactQrCode(canvas);
          if (qrResult.detected) {
            extractedQrUrl = qrResult.qrUrl;
            qrDecodedText = qrResult.qrText;
            qrLocation = qrResult.boundingBox;
          }
        } catch (err) {
          console.warn('QR scan on image failed', err);
        }

        // Intelligent photo detection & high-resolution crop from uploaded image
        let extractedPhotoUrl: string | undefined;
        let detectedPhotoBox: BoundingBox | undefined;
        if (ctx) {
          try {
            detectedPhotoBox = detectPhotoRegion(canvas, qrLocation);
            extractedPhotoUrl = cropPhotoFromCanvas(canvas, detectedPhotoBox, 480, 640);
          } catch (err) {
            console.warn('Smart photo detection fallback on image:', err);
            detectedPhotoBox = getDefaultPhotoBox(canvas.width, canvas.height);
            extractedPhotoUrl = cropPhotoFromCanvas(canvas, detectedPhotoBox, 480, 640);
          }
        }

        const parsed = parseFaydaSlipData(qrDecodedText || '', [], qrDecodedText);

        if (extractedPhotoUrl) {
          parsed.data.photoUrl = extractedPhotoUrl;
        }
        if (qrDecodedText) {
          parsed.data.qrData = qrDecodedText;
        }
        if (extractedQrUrl) {
          parsed.data.qrCodeImageUrl = extractedQrUrl;
        }
        if (qrLocation) {
          parsed.data.detectedQrBox = qrLocation;
        }
        if (pageCanvasUrl) {
          parsed.data.documentScanUrl = pageCanvasUrl;
        }

        resolve({
          data: parsed.data,
          pageCanvasUrl,
          extractedPhotoUrl,
          extractedQrUrl,
          rawText: qrDecodedText || 'Image uploaded',
          detectedFieldsCount: parsed.fieldCount,
          detectedPhotoBox,
          detectedQrBox: qrLocation,
          textItems: [],
          canvasDimensions: { width: canvas.width, height: canvas.height },
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
