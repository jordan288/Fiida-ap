/**
 * Ethiopian Calendar (ዓመተ ምሕረት / E.C.) and Gregorian Calendar (G.C.) Converter
 * Provides accurate bi-directional conversion, parsing, and formatting for Ethiopian ID Cards (Fayda).
 */

export interface DateBreakdown {
  day: number;
  month: number;
  year: number;
}

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
 * Parse Date String e.g. "24/07/2024", "2024-07-24", "24-07-2024"
 */
export function parseDateString(str: string): DateBreakdown | null {
  if (!str) return null;
  const cleaned = str.replace(/[^\d/-]/g, '').trim();
  
  // DD/MM/YYYY or DD-MM-YYYY
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
 * Convert Gregorian date string (DD/MM/YYYY) to Ethiopian date string (DD/MM/YYYY)
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
 * Format dual GC & Ethiopian date for display on Fayda ID cards
 */
export function formatCardDualDate(
  gcDate?: string,
  ethDate?: string,
  style: 'gc_with_eth' | 'eth_with_gc' | 'gc_only' | 'eth_only' = 'gc_with_eth'
): string {
  let rawGc = (gcDate || '').trim();
  let rawEth = (ethDate || '').trim();

  // If already formatted with parentheses or E.C. (e.g. "24/07/2024 (17/11/2016 E.C.)")
  if (rawGc.includes('(') && rawGc.includes(')')) {
    return rawGc;
  }

  // Strip extraneous labels for clean numeric extraction
  const cleanGc = rawGc.replace(/G\.?C\.?/gi, '').replace(/[()]/g, '').trim();
  const cleanEth = rawEth.replace(/E\.?C\.?/gi, '').replace(/ዓ\.?ም\.?/g, '').replace(/[()]/g, '').trim();

  if (style === 'gc_only') {
    return cleanGc || cleanEth;
  }

  if (style === 'eth_only') {
    if (cleanEth) return `${cleanEth} E.C.`;
    const converted = cleanGc ? convertGcToEth(cleanGc) : null;
    return converted ? `${converted} E.C.` : cleanGc;
  }

  if (style === 'eth_with_gc') {
    const eth = cleanEth || (cleanGc ? convertGcToEth(cleanGc) : '');
    const gc = cleanGc || (cleanEth ? convertEthToGc(cleanEth) : '');
    if (eth && gc) return `${eth} (${gc} G.C.)`;
    return eth || gc;
  }

  // Default: 'gc_with_eth' e.g. "24/07/2024 (17/11/2016 E.C.)"
  const gc = cleanGc || (cleanEth ? convertEthToGc(cleanEth) : '');
  const eth = cleanEth || (cleanGc ? convertGcToEth(cleanGc) : '');

  if (gc && eth) {
    return `${gc} (${eth} E.C.)`;
  }
  return gc || eth;
}
