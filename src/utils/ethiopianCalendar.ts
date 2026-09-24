/**
 * Ethiopian Calendar (ዓመተ ምሕረት / E.C.) and Gregorian Calendar (G.C.) Converter
 * Provides accurate bi-directional conversion, parsing, and formatting for Ethiopian ID Cards (Fayda).
 */

export interface DateBreakdown {
  day: number;
  month: number;
  year: number;
}

export const GC_MONTHS_3_LETTER = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

export const MONTH_TO_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

export const ETHIOPIAN_MONTHS = [
  { id: 1, amharic: 'መስከረም', english: 'Meskerem' },
  { id: 2, amharic: 'ጥቅምት', english: 'Tikimt' },
  { id: 3, amharic: 'ኅዳር', english: 'Hidar' },
  { id: 4, amharic: 'ታኅሣሥ', english: 'Tahsas' },
  { id: 5, amharic: 'ጥር', english: 'Tir' },
  { id: 6, amharic: 'የካቲት', english: 'Yekatit' },
  { id: 7, amharic: 'መጋቢት', english: 'Megabit' },
  { id: 8, amharic: 'ሚያዝያ', english: 'Miyazya' },
  { id: 9, amharic: 'ግንቦት', english: 'Ginbot' },
  { id: 10, amharic: 'ሰኔ', english: 'Sene' },
  { id: 11, amharic: 'ሐምሌ', english: 'Hamle' },
  { id: 12, amharic: 'ነሐሴ', english: 'Nehase' },
  { id: 13, amharic: 'ጳጉሜ', english: 'Pagume' },
];

/**
 * Gregorian Date to Julian Day Number
 */
export function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Julian Day Number to Ethiopian Date
 */
export function jdnToEthiopian(jdn: number): DateBreakdown {
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

/**
 * Ethiopian Date to Julian Day Number
 */
export function ethiopianToJDN(year: number, month: number, day: number): number {
  return 1723856 + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
}

/**
 * Julian Day Number to Gregorian Date
 */
export function jdnToGregorian(jdn: number): DateBreakdown {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/**
 * Parse Date String e.g. "24/07/2024", "2024-07-24", "24-07-2024", "12/Sep/2026", "12-Sep-2026", "12 Sep 2026"
 */
export function parseDateString(str: string): DateBreakdown | null {
  if (!str) return null;
  const trimmed = str.trim();

  // 1. Text-based 3-letter month: e.g. "12/Sep/2026", "12-Sep-2026", "12 Sep 2026", "12.Sep.2026"
  const textMonthMatch = trimmed.match(/^(\d{1,2})[\/\-\.\s]([A-Za-z]{3,9})[\/\-\.\s](\d{4})$/);
  if (textMonthMatch) {
    const d = parseInt(textMonthMatch[1], 10);
    const mStr = textMonthMatch[2].slice(0, 3).toLowerCase();
    const m = MONTH_TO_NUM[mStr];
    const y = parseInt(textMonthMatch[3], 10);
    if (!isNaN(d) && m && !isNaN(y) && d >= 1 && d <= 31 && y > 1800) {
      return { day: d, month: m, year: y };
    }
  }

  // 2. ISO text-based 3-letter month: e.g. "2026/Sep/12", "2026-Sep-12"
  const textIsoMatch = trimmed.match(/^(\d{4})[\/\-\.\s]([A-Za-z]{3,9})[\/\-\.\s](\d{1,2})$/);
  if (textIsoMatch) {
    const y = parseInt(textIsoMatch[1], 10);
    const mStr = textIsoMatch[2].slice(0, 3).toLowerCase();
    const m = MONTH_TO_NUM[mStr];
    const d = parseInt(textIsoMatch[3], 10);
    if (!isNaN(d) && m && !isNaN(y) && d >= 1 && d <= 31 && y > 1800) {
      return { day: d, month: m, year: y };
    }
  }

  // 3. Numeric standard: DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
  const cleaned = trimmed.replace(/[^\d/-]/g, '').trim();
  const partsSlash = cleaned.split(/[/.-]/);
  if (partsSlash.length === 3) {
    let d = parseInt(partsSlash[0], 10);
    let m = parseInt(partsSlash[1], 10);
    let y = parseInt(partsSlash[2], 10);

    // If format is YYYY-MM-DD
    if (d > 1000) {
      const temp = d;
      d = y;
      y = temp;
    }

    if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 13 && y > 1800) {
      return { day: d, month: m, year: y };
    }
  }
  return null;
}

/**
 * Format DateBreakdown to standard DD/MM/YYYY string
 */
export function formatDateString(date: DateBreakdown): string {
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  const yyyy = String(date.year);
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formats a Gregorian date string strictly to numeric YYYY/MM/DD (no month names):
 * e.g. "12/09/2026" -> "2026/09/12"
 *      "12/Sep/2026" -> "2026/09/12"
 *      "2026-09-12" -> "2026/09/12"
 *      "14/05/1992" -> "1992/05/14"
 *      "14/May/1992" -> "1992/05/14"
 *      "1992/05/14" -> "1992/05/14"
 */
export function formatGcyyyyMmDd(str?: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  
  // Quick check if already in standard YYYY/MM/DD
  const alreadyMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (alreadyMatch) {
    const y = parseInt(alreadyMatch[1], 10);
    const m = parseInt(alreadyMatch[2], 10);
    const d = parseInt(alreadyMatch[3], 10);
    if (y > 1800 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return trimmed;
    }
  }

  const parsed = parseDateString(trimmed);
  if (!parsed) return str;
  const yyyy = String(parsed.year).padStart(4, '0');
  const mm = String(parsed.month).padStart(2, '0');
  const dd = String(parsed.day).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

/**
 * Formats a Gregorian date string with a 3-letter month abbreviation (DD/MMM/YYYY):
 * e.g. "12/09/2026" -> "12/Sep/2026"
 *      "2026/09/12" -> "12/Sep/2026"
 *      "2026-09-12" -> "12/Sep/2026"
 *      "12/Sep/2026" -> "12/Sep/2026"
 */
export function formatGcWith3LetterMonth(str?: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  const parsed = parseDateString(trimmed);
  if (!parsed) return str;
  const dd = String(parsed.day).padStart(2, '0');
  const mon = GC_MONTHS_3_LETTER[parsed.month - 1] || 'Jan';
  const yyyy = String(parsed.year);
  return `${dd}/${mon}/${yyyy}`;
}

/**
 * Convert Gregorian date string (DD/MM/YYYY or DD/MMM/YYYY) to Ethiopian date string (DD/MM/YYYY)
 */
export function convertGcToEth(gcStr: string): string | null {
  const parsed = parseDateString(gcStr);
  if (!parsed) return null;
  const jdn = gregorianToJDN(parsed.year, parsed.month, parsed.day);
  const eth = jdnToEthiopian(jdn);
  return formatDateString(eth);
}

/**
 * Convert Ethiopian date string (DD/MM/YYYY) to Gregorian date string (DD/MM/YYYY)
 */
export function convertEthToGc(ethStr: string): string | null {
  const parsed = parseDateString(ethStr);
  if (!parsed) return null;
  const jdn = ethiopianToJDN(parsed.year, parsed.month, parsed.day);
  const gc = jdnToGregorian(jdn);
  return formatDateString(gc);
}

/**
 * Formats a fallback Ethiopian date by subtracting 8 years from G.C. year.
 * Used if calendar parsing encounters a non-standard Gregorian date string.
 */
export function reduceEightYearsFallback(gcStr: string): string | null {
  if (!gcStr) return null;
  const parsed = parseDateString(gcStr);
  if (parsed) {
    const ethYear = parsed.year - 8;
    return `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}/${ethYear}`;
  }
  return null;
}

export interface DualDateResult {
  eth: string;
  gc: string;
  formatted: string;
}

/**
 * Accurately parses date string(s) to separate Ethiopian (E.C.) and Gregorian (G.C.) dates.
 * Guarantees that:
 * - The Ethiopian Calendar date (E.C.) is isolated into .eth (lower year, ~7-8 years behind G.C.)
 * - The Gregorian Calendar date (G.C.) is isolated into .gc (higher year)
 * - The combined string (.formatted) is ALWAYS ordered strictly by: E.C. and then G.C.:
 *   `${eth} | ${gc}` e.g., "06/09/1984 | 14/05/1992"
 */
export function parseDualDate(
  date1?: string,
  date2?: string,
  options?: { gcMonthName?: boolean }
): DualDateResult {
  const combined = `${date1 || ''} ${date2 || ''}`.trim();
  if (!combined) {
    return { eth: '', gc: '', formatted: '' };
  }

  const hasTextMonth = /[A-Za-z]{3}/.test(combined);

  // Regex to extract all dates: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, or DD/MMM/YYYY
  const matches: string[] = [];

  // Match ISO dates YYYY-MM-DD
  const isoRegex = /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g;
  let isoMatch;
  while ((isoMatch = isoRegex.exec(combined)) !== null) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    const formatted = `${d}/${m}/${y}`;
    if (!matches.includes(formatted)) {
      matches.push(formatted);
    }
  }

  // Match 3-letter month: DD/MMM/YYYY or DD-MMM-YYYY or DD MMM YYYY
  const textMonthRegex = /\b(\d{1,2})[\/\-\.\s]([A-Za-z]{3,9})[\/\-\.\s](\d{4})\b/g;
  let txtMatch;
  while ((txtMatch = textMonthRegex.exec(combined)) !== null) {
    const d = txtMatch[1].padStart(2, '0');
    const mStr = txtMatch[2].slice(0, 3).toLowerCase();
    const mNum = MONTH_TO_NUM[mStr];
    if (mNum) {
      const m = String(mNum).padStart(2, '0');
      const y = txtMatch[3];
      const formatted = `${d}/${m}/${y}`;
      if (!matches.includes(formatted)) {
        matches.push(formatted);
      }
    }
  }

  // Match standard DD/MM/YYYY
  const standardRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/g;
  let stdMatch;
  while ((stdMatch = standardRegex.exec(combined)) !== null) {
    const d = stdMatch[1].padStart(2, '0');
    const m = stdMatch[2].padStart(2, '0');
    const y = stdMatch[3];
    const formatted = `${d}/${m}/${y}`;
    if (!matches.includes(formatted)) {
      matches.push(formatted);
    }
  }

  let eth = '';
  let gc = '';

  if (matches.length >= 2) {
    const p1 = parseDateString(matches[0]);
    const p2 = parseDateString(matches[1]);
    const y1 = p1?.year || 0;
    const y2 = p2?.year || 0;

    if (y1 && y2 && y1 !== y2) {
      // The smaller year is ALWAYS Ethiopian Calendar (E.C.) (e.g. 1984 E.C. vs 1992 G.C.)
      if (y1 < y2) {
        eth = matches[0];
        gc = matches[1];
      } else {
        eth = matches[1];
        gc = matches[0];
      }
    } else {
      // If years could not be compared, check explicit tags
      if (/E\.?C\.?|ዓ\.?ም\.?/i.test(combined)) {
        eth = matches[0];
        gc = matches[1];
      } else {
        gc = matches[0];
        eth = matches[1];
      }
    }
  } else if (matches.length === 1) {
    const single = matches[0];
    const isExplicitEth = /E\.?C\.?|ዓ\.?ም\.?/i.test(combined);
    const isExplicitGc = /G\.?C\.?|እ\.?ኤ\.?አ/i.test(combined);

    if (isExplicitEth && !isExplicitGc) {
      eth = single;
      gc = convertEthToGc(single) || '';
    } else {
      gc = single;
      eth = convertGcToEth(single) || reduceEightYearsFallback(single) || '';
    }
  }

  // If one of them is still missing, calculate the other
  if (eth && !gc) {
    gc = convertEthToGc(eth) || '';
  } else if (gc && !eth) {
    eth = convertGcToEth(gc) || reduceEightYearsFallback(gc) || '';
  }

  // Format GC:
  // If gcMonthName is true, format with 3-letter month (DD/MMM/YYYY).
  // If gcMonthName is false (e.g. for Date of Birth), format strictly as numeric YYYY/MM/DD.
  // Otherwise, format with 3-letter month if letters are present, else numeric YYYY/MM/DD.
  if (gc) {
    if (options?.gcMonthName === true) {
      gc = formatGcWith3LetterMonth(gc);
    } else if (options?.gcMonthName === false) {
      gc = formatGcyyyyMmDd(gc);
    } else {
      const hasMonthLetters = /[a-zA-Z]{3}/.test(date1 || '') || /[a-zA-Z]{3}/.test(date2 || '') || /[a-zA-Z]{3}/.test(gc);
      if (hasMonthLetters) {
        gc = formatGcWith3LetterMonth(gc);
      } else {
        gc = formatGcyyyyMmDd(gc);
      }
    }
  }

  // Guarantee order by E.C. and then G.C.
  const formatted = (eth && gc) ? `${eth} | ${gc}` : (eth || gc);

  return { eth, gc, formatted };
}

/**
 * Format dual Ethiopian (E.C.) & Gregorian (G.C.) date for display on Fayda ID cards
 * Uses straight vertical line separator " | " with Ethiopian Calendar (E.C.) FIRST,
 * which is reduced ~8 years from Gregorian Calendar (G.C.):
 * E.g., "06/09/1984 | 14/05/1992" or "16/11/2026 | 23/Jul/2034"
 */
export function formatCardDualDate(
  gcDate?: string,
  ethDate?: string,
  style: 'eth_with_gc' | 'gc_with_eth' | 'eth_only' | 'gc_only' = 'eth_with_gc',
  options?: { gcMonthName?: boolean }
): string {
  const { eth, gc, formatted } = parseDualDate(gcDate, ethDate, options);

  if (style === 'gc_only') {
    return gc || eth;
  }

  if (style === 'eth_only') {
    return eth || gc;
  }

  if (style === 'gc_with_eth') {
    return (gc && eth) ? `${gc} | ${eth}` : (gc || eth);
  }

  // Default ('eth_with_gc'): First write E.C. date (reduced 8 years), then G.C. date
  return formatted;
}

/**
 * Formats a serial number strictly into a clean 7-digit code with NO "SN :" prefix.
 * If input has more than 7 digits, it takes the last 7 digits.
 * If input has fewer than 7 digits, it left-pads with zeros to make exactly 7 digits.
 * E.g., "SN : 9482019482" -> "2019482", "SN: 74928" -> "0074928", "9482019" -> "9482019", empty -> "7492815"
 */
export function format7DigitSerial(rawSerial?: string): string {
  if (!rawSerial) return '7492815';
  // Strip any "SN :", "SN:", "Serial Number:", etc. prefix
  const clean = rawSerial.replace(/^(?:SN|Serial\s*(?:Number|No)?|ተከታታይ\s*(?:ቁጥር)?)[\s:|\-\/]+/i, '').trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length >= 7) {
    return digits.slice(-7);
  }
  if (digits.length > 0) {
    return digits.padStart(7, '0');
  }
  return clean.slice(-7) || '7492815';
}

export interface TodayIssueDates {
  issueDateGc: string;
  issueDateEth: string;
  expiryDateGc: string;
  expiryDateEth: string;
}

/**
 * Returns today's date formatted for Fayda ID in both Gregorian (G.C.) and Ethiopian (E.C.) calendars,
 * along with the corresponding 8-year expiration date.
 * Formats GC with 3-letter month (e.g. "12/Sep/2026" and "12/Sep/2034").
 */
export function getTodayIssueDates(baseDate?: Date): TodayIssueDates {
  const now = baseDate || new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mon = GC_MONTHS_3_LETTER[now.getMonth()] || 'Jan';
  
  // G.C. format with 3-letter month: DD/MMM/YYYY (e.g. 12/Sep/2026)
  const issueDateGc = `${dd}/${mon}/${yyyy}`;
  const issueDateEth = convertGcToEth(`${dd}/${mm}/${yyyy}`) || '';

  // Fayda national ID cards: expiry date starts from the issued date and expires in 8 years
  const expDay = dd;
  const expYear = yyyy + 8;
  const expiryDateGc = `${expDay}/${mon}/${expYear}`;
  
  // Calculate Ethiopian expiry starting from Ethiopian issued date
  let expiryDateEth = '';
  const parsedIssueEth = issueDateEth ? parseDateString(issueDateEth) : null;
  if (parsedIssueEth) {
    const ethD = String(parsedIssueEth.day).padStart(2, '0');
    const ethM = String(parsedIssueEth.month).padStart(2, '0');
    const ethY = parsedIssueEth.year + 8;
    expiryDateEth = `${ethD}/${ethM}/${ethY}`;
  } else {
    expiryDateEth = convertGcToEth(`${expDay}/${mm}/${expYear}`) || reduceEightYearsFallback(`${expDay}/${mm}/${expYear}`) || '';
  }

  return {
    issueDateGc,
    issueDateEth,
    expiryDateGc,
    expiryDateEth,
  };
}

/**
 * Calculates an 8-year expiration date starting from any given issued date.
 * Expiry date starts from the issued date and expires in exactly 8 years.
 * Formats Gregorian expiry with 3-letter month (e.g. "12/Sep/2034").
 */
export function calculateExpiryFromIssue(
  issueGcStr: string,
  issueEthStr?: string
): { expiryGc: string; expiryEth: string } | null {
  if (!issueGcStr && !issueEthStr) return null;

  let targetGc = issueGcStr;
  let targetEth = issueEthStr;

  if (issueGcStr && issueGcStr.includes('|')) {
    const parsed = parseDualDate(issueGcStr, undefined, { gcMonthName: true });
    if (parsed.gc) targetGc = parsed.gc;
    if (parsed.eth && !targetEth) targetEth = parsed.eth;
  }

  // If one calendar issue date is provided and the other is missing, convert first so
  // the expiry date in BOTH calendars starts on the exact corresponding day and month
  if (targetGc && !targetEth) {
    targetEth = convertGcToEth(targetGc) || '';
  } else if (targetEth && !targetGc) {
    targetGc = convertEthToGc(targetEth) || '';
  }

  let expGc = '';
  if (targetGc) {
    const parsed = parseDateString(targetGc);
    if (parsed) {
      const expDay = String(parsed.day).padStart(2, '0');
      const mon = GC_MONTHS_3_LETTER[parsed.month - 1] || 'Jan';
      const expYear = parsed.year + 8;
      expGc = `${expDay}/${mon}/${expYear}`;
    }
  }

  let expEth = '';
  if (targetEth) {
    const parsedEth = parseDateString(targetEth);
    if (parsedEth) {
      const expDay = String(parsedEth.day).padStart(2, '0');
      const expMonth = String(parsedEth.month).padStart(2, '0');
      const expYear = parsedEth.year + 8;
      expEth = `${expDay}/${expMonth}/${expYear}`;
    }
  }

  if (expGc && !expEth) {
    expEth = convertGcToEth(expGc) || reduceEightYearsFallback(expGc) || '';
  } else if (expEth && !expGc) {
    const conv = convertEthToGc(expEth);
    expGc = conv ? formatGcWith3LetterMonth(conv) : '';
  }

  if (!expGc && !expEth) return null;
  return { expiryGc: expGc, expiryEth: expEth };
}
