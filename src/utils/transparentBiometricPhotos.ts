/**
 * High-Precision Transparent Biometric Portrait Generator
 * Generates authentic, crisp Ethiopian biometric ID portraits
 * with 100% transparent backgrounds (alpha = 0) for Fayda Smart Cards.
 */

export interface PortraitOptions {
  gender: 'male' | 'female';
  attire?: 'suit' | 'habesha';
  name?: string;
}

/**
 * Returns an authentic vector SVG Data URL with a completely transparent background.
 * Works synchronously across both browser and server environments.
 */
export function getTransparentBiometricSvg(options: PortraitOptions): string {
  const isMale = options.gender === 'male';
  const isHabesha = options.attire === 'habesha' || (!isMale && options.attire !== 'suit');

  const cx = 200;
  const headCy = 185;

  let clothingSvg = '';
  if (isMale && !isHabesha) {
    // Male: Tailored navy suit + crisp white shirt collar + emerald tie
    clothingSvg = `
      <!-- Suit Torso -->
      <path d="M 65,500 C 70,405 110,355 155,330 L 245,330 C 290,355 330,405 335,500 Z" fill="url(#maleSuitGrad)" />
      <!-- White Shirt -->
      <polygon points="165,330 200,435 235,330" fill="#ffffff" />
      <!-- Left Collar -->
      <polygon points="148,322 195,362 178,382 140,332" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
      <!-- Right Collar -->
      <polygon points="252,322 205,362 222,382 260,332" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
      <!-- Emerald Tie -->
      <polygon points="193,362 207,362 211,485 200,500 189,485" fill="url(#tieGrad)" />
      <!-- Lapel folds -->
      <polygon points="155,330 185,425 170,425 138,345" fill="#334155" opacity="0.8" />
      <polygon points="245,330 215,425 230,425 262,345" fill="#334155" opacity="0.8" />
    `;
  } else {
    // Female / Traditional: Ethiopian Habesha Kemis with Gold, Green, Red woven Tibeb embroidery
    clothingSvg = `
      <!-- Habesha Cotton Kemis Torso -->
      <path d="M 65,500 C 70,405 115,350 155,325 L 245,325 C 285,350 330,405 335,500 Z" fill="url(#kemisGrad)" />
      <!-- Woven Tibeb Neck Embroidery Pattern -->
      <path d="M 150,325 Q 200,370 250,325 L 256,340 Q 200,390 144,340 Z" fill="url(#tibebGrad)" stroke="#b45309" stroke-width="1" />
      <!-- Delicate Cross-Stitch Embroidery Detail -->
      <path d="M 170,345 L 180,355 M 180,345 L 170,355 M 220,345 L 230,355 M 230,345 L 220,355" stroke="#fef08a" stroke-width="1.5" />
      <!-- Netela drape shoulder wrap fold -->
      <path d="M 80,500 C 95,415 125,355 158,340 L 174,350 C 142,375 118,435 112,500 Z" fill="#e2e8f0" opacity="0.75" />
    `;
  }

  const hairSvg = isMale
    ? `
      <!-- Male: Crisp Afro-Fade & Clean Lineup -->
      <path d="M 130,165 C 130,95 270,95 270,165 C 265,150 255,135 240,140 C 200,125 160,135 135,165 Z" fill="url(#hairGrad)" />
      <path d="M 133,165 C 133,115 267,115 267,165 C 262,150 240,135 200,135 C 160,135 138,150 133,165 Z" fill="#121016" />
    `
    : `
      <!-- Female: Elegant Braided / High Crown Natural Curls -->
      <path d="M 124,168 C 120,85 280,85 276,168 C 270,195 265,175 255,150 C 220,130 180,130 145,150 C 135,175 130,195 124,168 Z" fill="url(#hairGrad)" />
      <ellipse cx="${cx}" cy="${headCy - 80}" rx="48" ry="32" fill="#121016" />
    `;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
  <defs>
    <!-- Melanin Face Gradient -->
    <radialGradient id="faceGrad" cx="45%" cy="42%" r="58%">
      <stop offset="0%" stop-color="#92592d" />
      <stop offset="65%" stop-color="#764722" />
      <stop offset="100%" stop-color="#5a3416" />
    </radialGradient>
    
    <!-- Neck Shadow Gradient -->
    <linearGradient id="neckGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#553013" />
      <stop offset="60%" stop-color="#6f421f" />
      <stop offset="100%" stop-color="#4d2a0e" />
    </linearGradient>

    <!-- Hair Shading -->
    <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0a080c" />
      <stop offset="60%" stop-color="#18151b" />
      <stop offset="100%" stop-color="#26212b" />
    </linearGradient>

    <!-- Male Suit -->
    <linearGradient id="maleSuitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>

    <!-- Emerald Tie -->
    <linearGradient id="tieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#065f46" />
      <stop offset="70%" stop-color="#047857" />
      <stop offset="100%" stop-color="#064e3b" />
    </linearGradient>

    <!-- Female Kemis -->
    <linearGradient id="kemisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="50%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f1f5f9" />
    </linearGradient>

    <!-- Ethiopian Tibeb Embroidery (Gold / Green / Red) -->
    <linearGradient id="tibebGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d97706" />
      <stop offset="28%" stop-color="#059669" />
      <stop offset="55%" stop-color="#eab308" />
      <stop offset="78%" stop-color="#dc2626" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>

  <!-- NOTE: NO BACKGROUND ELEMENT! 100% Transparent Canvas Alpha -->

  <!-- Torso & Attire -->
  ${clothingSvg}

  <!-- Neck -->
  <path d="M 172,250 L 168,335 Q 200,345 232,335 L 228,250 Z" fill="url(#neckGrad)" />

  <!-- Ears -->
  <ellipse cx="134" cy="${headCy + 5}" rx="12" ry="21" fill="#6a3e1c" transform="rotate(-4 134 ${headCy + 5})" />
  <ellipse cx="134" cy="${headCy + 5}" rx="7" ry="13" fill="#502d13" transform="rotate(-4 134 ${headCy + 5})" />
  <ellipse cx="266" cy="${headCy + 5}" rx="12" ry="21" fill="#6a3e1c" transform="rotate(4 266 ${headCy + 5})" />
  <ellipse cx="266" cy="${headCy + 5}" rx="7" ry="13" fill="#502d13" transform="rotate(4 266 ${headCy + 5})" />

  <!-- Head / Face -->
  <ellipse cx="${cx}" cy="${headCy}" rx="67" ry="83" fill="url(#faceGrad)" />

  <!-- Hair -->
  ${hairSvg}

  <!-- Facial Features -->
  <g id="features">
    <!-- Eyebrows -->
    <path d="M 158,${headCy - 22} Q 176,${headCy - 28} 193,${headCy - 21} Q 176,${headCy - 24} 158,${headCy - 22}" fill="#19141b" />
    <path d="M 242,${headCy - 22} Q 224,${headCy - 28} 207,${headCy - 21} Q 224,${headCy - 24} 242,${headCy - 22}" fill="#19141b" />

    <!-- Left Eye -->
    <ellipse cx="176" cy="${headCy - 5}" rx="12" ry="7.5" fill="#f8fafc" />
    <circle cx="176" cy="${headCy - 5}" r="5.5" fill="#24140b" />
    <circle cx="174.5" cy="${headCy - 6.5}" r="1.8" fill="#ffffff" />

    <!-- Right Eye -->
    <ellipse cx="224" cy="${headCy - 5}" rx="12" ry="7.5" fill="#f8fafc" />
    <circle cx="224" cy="${headCy - 5}" r="5.5" fill="#24140b" />
    <circle cx="222.5" cy="${headCy - 6.5}" r="1.8" fill="#ffffff" />

    <!-- Nose -->
    <path d="M ${cx},${headCy - 4} L ${cx + 3},${headCy + 22} L ${cx - 7},${headCy + 25} Q ${cx},${headCy + 28} ${cx + 7},${headCy + 25}" fill="none" stroke="rgba(60, 32, 12, 0.65)" stroke-width="2.2" stroke-linecap="round" />
    <ellipse cx="${cx - 5}" cy="${headCy + 26}" rx="2.5" ry="1.5" fill="rgba(40, 20, 8, 0.7)" />
    <ellipse cx="${cx + 5}" cy="${headCy + 26}" rx="2.5" ry="1.5" fill="rgba(40, 20, 8, 0.7)" />

    <!-- Lips -->
    <path d="M ${cx - 18},${headCy + 42} Q ${cx},${headCy + 44} ${cx + 18},${headCy + 42} Q ${cx},${headCy + 52} ${cx - 18},${headCy + 42}" fill="#5a311b" />
    <path d="M ${cx - 16},${headCy + 42} Q ${cx},${headCy + 39} ${cx + 16},${headCy + 42}" fill="none" stroke="rgba(40, 20, 8, 0.7)" stroke-width="1.5" />
  </g>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MALE_TRANSPARENT_PORTRAIT = getTransparentBiometricSvg({ gender: 'male', attire: 'suit' });
export const FEMALE_TRANSPARENT_PORTRAIT = getTransparentBiometricSvg({ gender: 'female', attire: 'habesha' });
