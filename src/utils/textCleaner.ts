import { IdCardData } from '../types';

/**
 * Strips reference prefixes (e.g. "Full Name:", "Name:", "DOB:", "Date of Birth:", "ሙሉ ስም:", "የትውልድ ቀን:")
 * ensuring only pure data text is taken.
 */
export function cleanFieldText(fieldKey: string, rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText.trim();

  // Common label reference prefixes in English and Amharic
  const referencePrefixes = [
    // Full Name
    /^(?:Full\s*Name|Fullname|Name|Applicant\s*Name|ሙሉ\s*ስም|ስም)[\s:|\-\/]+/i,
    // FAN / ID Number
    /^(?:FAN\s*Number|FAN|Card\s*Number|Fayda\s*ID|FIN|ካርድ\s*ቁጥር|ፋይዳ\s*ቁጥር)[\s:|\-\/]+/i,
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
