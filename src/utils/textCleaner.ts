import { IdCardData } from '../types';

/**
 * Specifically cleans and purges the word "Demographic" / "Demographics" / "Information" / "Details"
 * and any document reference artifacts from the English full name.
 */
export function sanitizeEnglishName(rawName: string): string {
  if (!rawName) return '';

  let cleaned = rawName.trim();

  // Strip Ethiopic characters from English name if bilingual headers bled into OCR/text candidate
  cleaned = cleaned.replace(/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]+/g, ' ');

  // 1. Strip section titles and demographic labels with or without colon/separator
  cleaned = cleaned
    // Compound prefix: "Demographic Information", "Demographic Details:", "Demographic Data", etc.
    .replace(/^(?:Demographic\s*(?:Information|Details?|Data|Info|Slip|Biometrics?|Verification)|Demographics?)[\s:|\-\/]*/i, ' ')
    // Suffix or embedded demographic phrases: "Abebe Bikila Demographic Information"
    .replace(/\bdemographics?\s*(?:information|details?|data|info|slip|biometrics?|verification)?\b/gi, ' ')
    // Standalone "information", "details" when bled from headers
    .replace(/\b(?:information|details?)\b/gi, ' ')
    // Individual occurrences of the word "Demographic" or "Demographics" anywhere in the name
    .replace(/\bdemographics?\b/gi, ' ')
    // Common slip metadata words that can bleed into OCR/text candidate names
    .replace(/\b(?:biometrics?|verification|applicant|holder|identity|slip|document)\b/gi, ' ')
    // Common label words
    .replace(/^(?:Full\s*Name|Fullname|Name|Applicant\s*Name)[\s:|\-\/]*/i, ' ')
    .replace(/\b(?:full\s*name|fullname|name)\b/gi, ' ')
    // Clean up unwanted punctuation (colons, slashes, pipes, dashes, asterisks, brackets)
    .replace(/[;:"|\\\/_\-*#[\]()]+/g, ' ')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();

  // If the result is just a known non-name keyword, return blank
  if (/^(?:demographics?|information|details?|biometrics?|verification|data|name|full\s*name)$/i.test(cleaned)) {
    return '';
  }

  // Ensure title-case capitalisation for English names (e.g. "AYELE ZEKWOS DAKA" or "ayele zekwos daka" -> "Ayele Zekwos Daka")
  if (cleaned.length > 0) {
    const parts = cleaned.split(' ').filter(Boolean);
    cleaned = parts.map(part => {
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');
  }

  return cleaned;
}

/**
 * Specifically purges "የስነ-ህዝብ", "ስነ-ህዝብ", "መረጃ" (Demographic / Information) and document labels from the Amharic full name.
 */
export function sanitizeAmharicName(rawName: string): string {
  if (!rawName) return '';

  let cleaned = rawName.trim();

  // Strip Latin characters from Amharic name if bilingual headers bled in
  cleaned = cleaned.replace(/[A-Za-z]+/g, ' ');

  // Remove "የስነ-ህዝብ መረጃ", "ስነ-ህዝብ", "ስነህዝብ", "መረጃ", "ዝርዝር", "ሙሉ ስም"
  cleaned = cleaned
    .replace(/\b(?:የስነ[\s\-_]*ህዝብ|የስነ[\s\-_]*ሕዝብ|ስነ[\s\-_]*ህዝብ|ስነ[\s\-_]*ሕዝብ|ስነህዝብ|ስነሕዝብ)\s*(?:መረጃ|ዝርዝር)?[\s:|\-\/፡]*/g, ' ')
    .replace(/\b(?:የስነ[\s\-_]*ህዝብ|ስነ[\s\-_]*ህዝብ|ስነህዝብ|ስነሕዝብ)\b/g, ' ')
    .replace(/(?:^|\b)(?:ሙሉ\s*ስም|የባለቤቱ\s*ስም|የአመልካች\s*ስም)[\s:|\-\/፡]*/g, ' ')
    .replace(/\b(?:ባዮሜትሪክ|ማረጋገጫ|ሰነድ|መረጃ)\b/g, ' ')
    .replace(/[;:"|\\\/_\-*#[\]()፡፤]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Strips reference prefixes (e.g. "Full Name:", "Name:", "DOB:", "Date of Birth:", "ሙሉ ስም:", "የትውልድ ቀን:")
 * ensuring only pure data text is taken.
 */
export function cleanFieldText(fieldKey: string, rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText.trim();

  // Targeted name cleanup first
  if (fieldKey === 'fullNameEnglish') {
    return sanitizeEnglishName(cleaned);
  }

  if (fieldKey === 'fullNameAmharic') {
    return sanitizeAmharicName(cleaned);
  }

  // Common label reference prefixes in English and Amharic
  const referencePrefixes = [
    // Demographic labels
    /^(?:Demographic\s*Information|Demographic\s*Details?|Demographic\s*Data|Demographic\s*Info|Demographics?|የስነ[\s\-_]*ህዝብ\s*መረጃ|ስነ[\s\-_]*ህዝብ|ስነህዝብ|ስነሕዝብ)[\s:|\-\/]+/i,
    // Full Name
    /^(?:Full\s*Name|Fullname|Name|Applicant\s*Name|ሙሉ\s*ስም|ስም)[\s:|\-\/]+/i,
    // FAN / ID Number
    /^(?:FAN\s*Number|FAN|Card\s*Number|Fayda\s*ID|FIN|UIN|ካርድ\s*ቁጥር|ፋይዳ\s*ቁጥር)[\s:|\-\/]+/i,
    // FCN
    /^(?:FCN\s*Number|FCN)[\s:|\-\/]+/i,
    // Date of Birth
    /^(?:Date\s*of\s*Birth|DOB|Birth\s*Date|የትውልድ\s*ቀን)[\s:|\-\/]+/i,
    // Sex / Gender
    /^(?:Sex|Gender|ፆታ)[\s:|\-\/]+/i,
    // Date of Issue
    /^(?:Date\s*of\s*Issue|Issue\s*Date|የተሰጠበት\s*ቀን)[\s:|\-\/]+/i,
    // Date of Expiry
    /^(?:Date\s*of\s*Expiry|Expiry\s*Date|Expiry|የሚያበቃበት\s*ቀን)[\s:|\-\/]+/i,
    // Phone Number
    /^(?:Phone\s*Number|Phone|Mobile|Tel|ስልክ\s*ቁጥር|ስልክ)[\s:|\-\/]+/i,
    // Nationality
    /^(?:Nationality|ዜግነት)[\s:|\-\/]+/i,
    // Region
    /^(?:Region|State|ክልል)[\s:|\-\/]+/i,
    // Zone
    /^(?:Zone\s*\/\s*Subcity|Zone|Subcity|ዞን\s*\/\s*ክፍለ\s*ከተማ|ዞን|ክፍለ\s*ከተማ)[\s:|\-\/]+/i,
    // Woreda
    /^(?:Woreda\s*\/\s*Kebele|Woreda|ወረዳ\s*\/\s*ቀበሌ|ወረዳ)[\s:|\-\/]+/i,
    // Kebele
    /^(?:Kebele|ቀበሌ)[\s:|\-\/]+/i,
    // Serial Number
    /^(?:Serial\s*Number|Serial\s*No|SN|ተከታታይ\s*ቁጥር)[\s:|\-\/]+/i,
  ];

  // Run through prefixes
  for (const prefix of referencePrefixes) {
    cleaned = cleaned.replace(prefix, '').trim();
  }

  // If specific field, apply targeted cleanup
  if (fieldKey === 'fan') {
    // Keep only digits and spaces for FAN
    const digitsOnly = cleaned.replace(/[^0-9]/g, '');
    if (digitsOnly.length === 16) {
      return `${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 8)} ${digitsOnly.slice(8, 12)} ${digitsOnly.slice(12, 16)}`;
    }
  }

  if (fieldKey === 'sex') {
    const lower = cleaned.toLowerCase();
    if (lower.includes('female') || lower.includes('ሴት') || lower === 'f') {
      return 'Female';
    }
    if (lower.includes('male') || lower.includes('ወንድ') || lower === 'm') {
      return 'Male';
    }
  }

  return cleaned;
}

/**
 * Cleans an entire IdCardData record, removing any reference labels from all text fields.
 */
export function sanitizeIdCardData(data: IdCardData): IdCardData {
  return {
    ...data,
    fullNameAmharic: cleanFieldText('fullNameAmharic', data.fullNameAmharic),
    fullNameEnglish: cleanFieldText('fullNameEnglish', data.fullNameEnglish),
    fan: cleanFieldText('fan', data.fan),
    fcn: cleanFieldText('fcn', data.fcn),
    dateOfBirth: cleanFieldText('dateOfBirth', data.dateOfBirth),
    dateOfBirthEth: data.dateOfBirthEth ? cleanFieldText('dateOfBirthEth', data.dateOfBirthEth) : '',
    sex: (cleanFieldText('sex', data.sex) || data.sex) as IdCardData['sex'],
    dateOfIssue: cleanFieldText('dateOfIssue', data.dateOfIssue),
    dateOfExpiry: cleanFieldText('dateOfExpiry', data.dateOfExpiry),
    nationalityAmharic: cleanFieldText('nationalityAmharic', data.nationalityAmharic),
    nationalityEnglish: cleanFieldText('nationalityEnglish', data.nationalityEnglish),
    phoneNumber: cleanFieldText('phoneNumber', data.phoneNumber),
    regionAmharic: cleanFieldText('regionAmharic', data.regionAmharic),
    regionEnglish: cleanFieldText('regionEnglish', data.regionEnglish),
    zoneAmharic: cleanFieldText('zoneAmharic', data.zoneAmharic),
    zoneEnglish: cleanFieldText('zoneEnglish', data.zoneEnglish),
    woredaAmharic: cleanFieldText('woredaAmharic', data.woredaAmharic),
    woredaEnglish: cleanFieldText('woredaEnglish', data.woredaEnglish),
    kebele: cleanFieldText('kebele', data.kebele),
    serialNumber: cleanFieldText('serialNumber', data.serialNumber),
  };
}
