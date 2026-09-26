import { NumberedTemplate, TemplateConfig, CoordinatesConfig, IdCardData } from '../types';
import { SAMPLE_BATCH_APPLICANTS, SAMPLE_ID_DATA, DEFAULT_COORDINATES } from '../data/defaultData';
import { renderOffscreenCard } from './batchExporter';
import { loadTemplateCoordinates } from './templateStorage';
import { getTransparentBiometricSvg } from './transparentBiometricPhotos';

export interface TemplatePreviewData {
  number: number;
  name: string;
  description: string;
  themeColor: string;
  front: string;
  back: string;
  isCustom: boolean;
  photoStyle: string;
  badges: string[];
}

// In-memory cache for fast synchronous access
const previewCache: Record<string, { front: string; back: string }> = {};

/**
 * Generates an authentic, high-fidelity SVG data URL for a template card.
 * Works synchronously and instantly with 0 network latency, guaranteeing that
 * every single template ALWAYS has complete front and back pictures to display.
 */
export function generateInstantTemplateSvg(
  side: 'front' | 'back',
  template: NumberedTemplate,
  colorMode: 'color' | 'grayscale' = 'color'
): string {
  const isFront = side === 'front';
  const theme = template.themeColor || '#059669';
  const isGrayscale = colorMode === 'grayscale';
  const customImg = isFront
    ? template.frontImageUrl || template.config.frontImageUrl
    : template.backImageUrl || template.config.backImageUrl;

  // If a custom background image is uploaded, use it directly if valid
  if (customImg && customImg.length > 50) {
    return customImg;
  }

  const sample = SAMPLE_BATCH_APPLICANTS[0] || SAMPLE_ID_DATA;
  const portraitSvg = getTransparentBiometricSvg({ gender: 'male', attire: 'suit' });
  const filterGrayscale = isGrayscale ? 'filter="url(#monoFilter)"' : '';

  // Background and Guilloche colors based on template number & theme
  const bgFill = isGrayscale
    ? '#f8fafc'
    : template.config.backgroundColor || (template.number === 2 ? '#fefce8' : template.number === 3 ? '#f0f9ff' : template.number === 6 ? '#f8fafc' : '#f6fbf9');

  const strokeColor = isGrayscale ? '#475569' : theme;

  if (isFront) {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1012 638" width="1012" height="638">
  <defs>
    <filter id="monoFilter">
      <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"/>
    </filter>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgFill}" />
      <stop offset="100%" stop-color="${isGrayscale ? '#e2e8f0' : bgFill}" />
    </linearGradient>
    <linearGradient id="flagGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#078930" />
      <stop offset="33%" stop-color="#078930" />
      <stop offset="33%" stop-color="#fcdd09" />
      <stop offset="66%" stop-color="#fcdd09" />
      <stop offset="66%" stop-color="#da121a" />
      <stop offset="100%" stop-color="#da121a" />
    </linearGradient>
  </defs>

  <!-- Card Base -->
  <rect width="1012" height="638" rx="28" fill="url(#cardBg)" stroke="${strokeColor}" stroke-width="3" />

  <!-- Security Guilloche Waves -->
  <g opacity="${isGrayscale ? '0.12' : '0.18'}" stroke="${strokeColor}" stroke-width="1.2" fill="none">
    ${Array.from({ length: 14 }).map((_, i) => {
      const y = 45 * (i + 1);
      return `<path d="M 0,${y} Q 253,${y - 25} 506,${y} T 1012,${y}" />
              <path d="M 0,${y} Q 253,${y + 25} 506,${y} T 1012,${y}" />`;
    }).join('\n')}
  </g>

  <!-- Top Ethiopian Flag Accent Strip -->
  <rect x="0" y="0" width="1012" height="12" rx="6" fill="url(#flagGrad)" opacity="${isGrayscale ? '0.3' : '1.0'}" />

  <!-- Top Official Header -->
  <g transform="translate(420, 24)">
    <text x="0" y="24" font-family="system-ui, sans-serif" font-weight="800" font-size="22" fill="#0f172a" text-anchor="middle" letter-spacing="1">
      የኢትዮጵያ ፌዴራላዊ ዴሞክራሲያዊ ሪፐብሊክ
    </text>
    <text x="0" y="48" font-family="system-ui, sans-serif" font-weight="700" font-size="16" fill="#334155" text-anchor="middle" letter-spacing="0.5">
      Federal Democratic Republic of Ethiopia
    </text>
    <text x="0" y="70" font-family="system-ui, sans-serif" font-weight="800" font-size="14" fill="${strokeColor}" text-anchor="middle" letter-spacing="1.5">
      ብሔራዊ ዲጂታል መታወቂያ | NATIONAL DIGITAL ID
    </text>
  </g>

  <!-- National Emblem Star (Top Right) -->
  <g transform="translate(930, 52) scale(0.65)" opacity="${isGrayscale ? '0.4' : '0.9'}">
    <circle cx="0" cy="0" r="32" fill="#0369a1" />
    <polygon points="0,-24 7,-7 25,-7 11,4 16,21 0,11 -16,21 -11,4 -25,-7 -7,-7" fill="#fbbf24" />
  </g>

  <!-- Primary Applicant Photo Frame & Portrait -->
  <g transform="translate(45, 125)">
    <rect width="260" height="325" rx="18" fill="#ffffff" stroke="${strokeColor}" stroke-width="2.5" opacity="0.9" />
    <clipPath id="primaryPhotoClip_${template.number}">
      <rect width="254" height="319" rx="16" x="3" y="3" />
    </clipPath>
    <g clip-path="url(#primaryPhotoClip_${template.number})" ${filterGrayscale}>
      <image href="${portraitSvg}" x="-30" y="5" width="315" height="315" preserveAspectRatio="xMidYMid slice" />
    </g>
  </g>

  <!-- Issue Dates (Left of photo, rotated -90 deg) -->
  <g transform="translate(38, 380) rotate(-90)">
    <text x="0" y="0" font-family="monospace" font-size="12" font-weight="700" fill="#475569">
      G.C: 24/07/2024   E.C: 17/11/2016
    </text>
  </g>

  <!-- Applicant Data Fields (Center) -->
  <g transform="translate(335, 135)" font-family="system-ui, sans-serif">
    <!-- Full Name Amharic -->
    <text x="0" y="34" font-weight="900" font-size="30" fill="#0f172a" letter-spacing="0.5">
      ${sample.fullNameAmharic}
    </text>
    <!-- Full Name English -->
    <text x="0" y="70" font-weight="700" font-size="23" fill="#1e293b">
      ${sample.fullNameEnglish}
    </text>

    <!-- Date of Birth -->
    <text x="0" y="125" font-size="13" font-weight="700" fill="#64748b">የትውልድ ቀን | Date of Birth</text>
    <text x="0" y="152" font-size="22" font-weight="800" fill="#0f172a" font-family="monospace">
      14/05/1992 (06/09/1984)
    </text>

    <!-- Sex -->
    <text x="0" y="195" font-size="13" font-weight="700" fill="#64748b">ፆታ | Sex</text>
    <text x="0" y="222" font-size="22" font-weight="800" fill="#0f172a">
      ወንድ / Male
    </text>

    <!-- Expiry Date -->
    <text x="0" y="265" font-size="13" font-weight="700" fill="#64748b">የሚያበቃበት ቀን | Date of Expiry</text>
    <text x="0" y="292" font-size="22" font-weight="800" fill="#0f172a" font-family="monospace">
      23/07/2034 (16/11/2026)
    </text>
  </g>

  <!-- Secondary Security Photo (Bottom Right) -->
  <g transform="translate(830, 420)">
    <rect width="138" height="175" rx="12" fill="#ffffff" stroke="${template.config.secondaryPhotoStyle === 'goldBorder' ? '#d97706' : strokeColor}" stroke-width="${template.config.secondaryPhotoStyle === 'goldBorder' ? '3.5' : '1.5'}" opacity="0.85" />
    <clipPath id="secPhotoClip_${template.number}">
      <rect width="134" height="171" rx="10" x="2" y="2" />
    </clipPath>
    <g clip-path="url(#secPhotoClip_${template.number})" opacity="${template.config.secondaryPhotoStyle === 'ghost' ? '0.65' : '0.9'}" filter="url(#monoFilter)">
      <image href="${portraitSvg}" x="-15" y="0" width="165" height="175" preserveAspectRatio="xMidYMid slice" />
    </g>
    ${template.config.secondaryPhotoStyle === 'goldBorder' ? `<rect width="138" height="175" rx="12" fill="none" stroke="#f59e0b" stroke-width="2" />` : ''}
  </g>

  <!-- Front FAN Number Capsule Container -->
  <g transform="translate(325, 475)">
    <rect width="470" height="52" rx="10" fill="#ffffff" opacity="0.7" stroke="#cbd5e1" stroke-width="1" />
    <text x="235" y="34" font-family="monospace" font-weight="900" font-size="26" fill="#0f172a" text-anchor="middle" letter-spacing="3">
      4195 0436 7069 2582
    </text>
  </g>

  <!-- Front 1D Barcode Strip -->
  <g transform="translate(370, 550)">
    <rect width="380" height="42" rx="4" fill="#ffffff" opacity="0.85" />
    <!-- Barcode lines pattern -->
    <g fill="#0f172a">
      ${Array.from({ length: 55 }).map((_, idx) => {
        const xPos = idx * 6.8 + 8;
        const bw = (idx % 3 === 0 || idx % 7 === 0) ? 3.5 : 1.8;
        return `<rect x="${xPos}" y="4" width="${bw}" height="34" />`;
      }).join('\n')}
    </g>
  </g>

  <!-- Template Watermark Badge -->
  <g transform="translate(945, 608)">
    <rect x="-60" y="-16" width="115" height="24" rx="6" fill="${strokeColor}" opacity="0.85" />
    <text x="-2" y="1" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="#ffffff" text-anchor="middle">
      Template #${template.number}
    </text>
  </g>
</svg>
    `.trim();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } else {
    // BACK CARD
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1012 638" width="1012" height="638">
  <defs>
    <filter id="monoFilter">
      <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"/>
    </filter>
    <linearGradient id="cardBgBack" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgFill}" />
      <stop offset="100%" stop-color="${isGrayscale ? '#e2e8f0' : bgFill}" />
    </linearGradient>
  </defs>

  <!-- Card Base -->
  <rect width="1012" height="638" rx="28" fill="url(#cardBgBack)" stroke="${strokeColor}" stroke-width="3" />

  <!-- Security Guilloche Waves -->
  <g opacity="${isGrayscale ? '0.10' : '0.15'}" stroke="${strokeColor}" stroke-width="1.2" fill="none">
    ${Array.from({ length: 14 }).map((_, i) => {
      const y = 45 * (i + 1);
      return `<path d="M 0,${y} Q 253,${y + 20} 506,${y} T 1012,${y}" />
              <path d="M 0,${y} Q 253,${y - 20} 506,${y} T 1012,${y}" />`;
    }).join('\n')}
  </g>

  <!-- Top Header Strip -->
  <g transform="translate(50, 42)">
    <rect width="912" height="42" rx="8" fill="${strokeColor}" opacity="0.15" />
    <text x="456" y="28" font-family="system-ui, sans-serif" font-weight="900" font-size="20" fill="#0f172a" text-anchor="middle" letter-spacing="1">
      የነዋሪነት መታወቂያ ካርድ | RESIDENT IDENTITY CARD
    </text>
  </g>

  <!-- Resident Info Grid (Left Side) -->
  <g transform="translate(50, 115)" font-family="system-ui, sans-serif">
    <!-- Phone -->
    <text x="0" y="20" font-size="13" font-weight="700" fill="#64748b">ስልክ ቁጥር | Phone Number</text>
    <text x="0" y="48" font-size="23" font-weight="800" fill="#0f172a" font-family="monospace">
      ${sample.phoneNumber || '0928574836'}
    </text>

    <!-- Nationality -->
    <text x="0" y="90" font-size="13" font-weight="700" fill="#64748b">ዜግነት | Nationality</text>
    <text x="0" y="118" font-size="23" font-weight="800" fill="#0f172a">
      ኢትዮጵያዊ | Ethiopian
    </text>

    <!-- Region -->
    <text x="0" y="160" font-size="13" font-weight="700" fill="#64748b">ክልል | Region</text>
    <text x="0" y="188" font-size="22" font-weight="800" fill="#0f172a">
      ${sample.regionAmharic || 'ሲዳማ'} | ${sample.regionEnglish || 'Sidama'}
    </text>

    <!-- Zone -->
    <text x="0" y="230" font-size="13" font-weight="700" fill="#64748b">ዞን / ክፍለ ከተማ | Zone / Subcity</text>
    <text x="0" y="258" font-size="21" font-weight="800" fill="#0f172a">
      ${sample.zoneAmharic || 'አርበጎና'} | ${sample.zoneEnglish || 'Arbegona'}
    </text>

    <!-- Woreda & Kebele -->
    <text x="0" y="300" font-size="13" font-weight="700" fill="#64748b">ወረዳ / ቀበሌ | Woreda / Kebele</text>
    <text x="0" y="328" font-size="21" font-weight="800" fill="#0f172a">
      ${sample.woredaAmharic || 'አርበጎና ወረዳ'} / ቀበሌ ${sample.kebele || '01'}
    </text>
  </g>

  <!-- Biometric 2D QR Code Container (Right Side) -->
  <g transform="translate(560, 115)">
    <rect width="400" height="400" rx="18" fill="#ffffff" stroke="${strokeColor}" stroke-width="2" opacity="0.95" />
    
    <!-- Stylized Biometric QR Matrix -->
    <g transform="translate(25, 25)">
      <!-- Corner finder patterns -->
      <!-- Top-Left -->
      <rect x="0" y="0" width="80" height="80" fill="none" stroke="#0f172a" stroke-width="12" rx="8" />
      <rect x="22" y="22" width="36" height="36" fill="#0f172a" rx="4" />
      <!-- Top-Right -->
      <rect x="270" y="0" width="80" height="80" fill="none" stroke="#0f172a" stroke-width="12" rx="8" />
      <rect x="292" y="22" width="36" height="36" fill="#0f172a" rx="4" />
      <!-- Bottom-Left -->
      <rect x="0" y="270" width="80" height="80" fill="none" stroke="#0f172a" stroke-width="12" rx="8" />
      <rect x="22" y="292" width="36" height="36" fill="#0f172a" rx="4" />

      <!-- QR Grid simulation -->
      <g fill="#0f172a">
        ${Array.from({ length: 180 }).map((_, i) => {
          const row = Math.floor(i / 15);
          const col = i % 15;
          // Skip corners
          if ((row < 4 && col < 4) || (row < 4 && col > 10) || (row > 10 && col < 4)) return '';
          if ((i * 37 + 13) % 7 > 2) {
            return `<rect x="${col * 22 + 10}" y="${row * 22 + 10}" width="15" height="15" rx="2" />`;
          }
          return '';
        }).join('\n')}
      </g>
      <!-- Center Emblem in QR -->
      <circle cx="175" cy="175" r="28" fill="#ffffff" stroke="${strokeColor}" stroke-width="2.5" />
      <text x="175" y="181" font-family="system-ui, sans-serif" font-weight="900" font-size="14" fill="${strokeColor}" text-anchor="middle">ፋይዳ</text>
    </g>
  </g>

  <!-- Back FIN Container Barcode -->
  <g transform="translate(50, 485)">
    <rect width="470" height="75" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" opacity="0.9" />
    <text x="235" y="32" font-family="monospace" font-weight="900" font-size="20" fill="#0f172a" text-anchor="middle" letter-spacing="4">
      4195   0436   7069   2582
    </text>
    <text x="235" y="58" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#64748b" text-anchor="middle">
      FIN (Fayda Identification Number)
    </text>
  </g>

  <!-- Serial Number Capsule -->
  <g transform="translate(680, 545)">
    <rect width="280" height="42" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1" />
    <text x="140" y="27" font-family="monospace" font-weight="800" font-size="18" fill="#0f172a" text-anchor="middle" letter-spacing="1.5">
      SN : 9482019
    </text>
  </g>

  <!-- Template Identifier -->
  <g transform="translate(945, 608)">
    <rect x="-60" y="-16" width="115" height="24" rx="6" fill="${strokeColor}" opacity="0.85" />
    <text x="-2" y="1" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="#ffffff" text-anchor="middle">
      Template #${template.number} Back
    </text>
  </g>
</svg>
    `.trim();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}

/**
 * Returns instant synchronous pictures for all templates.
 * Never blank, never throws, works in any browser environment.
 */
export function getInstantTemplatePictures(
  templates: NumberedTemplate[],
  colorMode: 'color' | 'grayscale' = 'color'
): Record<number, { front: string; back: string }> {
  const result: Record<number, { front: string; back: string }> = {};

  for (const tpl of templates) {
    const cacheKey = `tpl_${tpl.number}_${colorMode}_${tpl.updatedAt || 'v1'}`;
    if (previewCache[cacheKey]) {
      result[tpl.number] = previewCache[cacheKey];
      continue;
    }

    const front = generateInstantTemplateSvg('front', tpl, colorMode);
    const back = generateInstantTemplateSvg('back', tpl, colorMode);
    const item = { front, back };
    previewCache[cacheKey] = item;
    result[tpl.number] = item;
  }

  return result;
}

/**
 * Asynchronously generates 300 DPI offscreen rendered card pictures
 * for all templates and upgrades the previewCache.
 */
export async function generateAllTemplatePicturesAsync(
  templates: NumberedTemplate[],
  currentConfig: CoordinatesConfig,
  currentTemplateConfig: TemplateConfig,
  colorMode: 'color' | 'grayscale' = 'color'
): Promise<Record<number, { front: string; back: string }>> {
  const sampleData = SAMPLE_BATCH_APPLICANTS[0] || SAMPLE_ID_DATA;
  const result: Record<number, { front: string; back: string }> = {};

  for (const tpl of templates) {
    const cacheKey = `tpl_${tpl.number}_${colorMode}_${tpl.updatedAt || 'v1'}`;

    try {
      const coords = tpl.coordinates || loadTemplateCoordinates(tpl.number) || currentConfig;
      const tConfig = tpl.config || currentTemplateConfig;
      const renderOpts = {
        format: 'jpeg' as const,
        quality: 0.90,
        photoColorMode: colorMode,
        mirrorPrint: false,
      };

      const [front, back] = await Promise.all([
        renderOffscreenCard('front', sampleData, coords, tConfig, renderOpts),
        renderOffscreenCard('back', sampleData, coords, tConfig, renderOpts),
      ]);

      const pair = { front, back };
      previewCache[cacheKey] = pair;
      result[tpl.number] = pair;
    } catch {
      // Fallback to instant vector generator
      const front = generateInstantTemplateSvg('front', tpl, colorMode);
      const back = generateInstantTemplateSvg('back', tpl, colorMode);
      const pair = { front, back };
      previewCache[cacheKey] = pair;
      result[tpl.number] = pair;
    }
  }

  return result;
}

/**
 * Returns formatted specs, badges, and features for each template.
 */
export function getTemplateMetadata(template: NumberedTemplate): {
  category: string;
  photoStyleLabel: string;
  themeName: string;
  features: string[];
} {
  const num = template.number;
  const tConfig = template.config;

  let category = 'Official Fayda Layout';
  let themeName = 'Emerald Green';
  if (num === 1) {
    category = 'Official Standard Fayda';
    themeName = 'Emerald Green';
  } else if (num === 2) {
    category = 'Golden Hologram Security';
    themeName = 'Amber Gold';
  } else if (num === 3) {
    category = 'Cobalt Cyber Security';
    themeName = 'Cobalt Blue';
  } else if (num === 4) {
    category = 'Minimalist Pre-Printed PVC';
    themeName = 'Clean Slate';
  } else if (num === 5) {
    category = 'Royal Emerald Micro-Mesh';
    themeName = 'Royal Jade';
  } else if (num === 6) {
    category = 'Enterprise High-Contrast';
    themeName = 'Dark Slate';
  } else {
    category = `Custom Template #${num}`;
    themeName = template.themeColor || 'Custom';
  }

  const pStyle = tConfig.secondaryPhotoStyle || 'ghost';
  const photoStyleLabel =
    pStyle === 'ghost'
      ? 'Ghost Security Watermark'
      : pStyle === 'grayscale'
      ? 'Monochrome B&W Portrait'
      : pStyle === 'goldBorder'
      ? 'Gold-Bordered Hologram'
      : 'Full Color Secondary';

  const features: string[] = [
    '300 DPI High-Res Print',
    'Biometric 2D QR Code',
    '1D Barcode Strip',
    photoStyleLabel,
    tConfig.showCornerMarks ? 'Corner Alignment Marks' : 'Clean Edge Border',
  ];

  return { category, photoStyleLabel, themeName, features };
}
