import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { A4BatchPrintConfig, A4BatchPrintLayout, BatchExportOptions, BatchQueueItem, CoordinatesConfig, IdCardData, TemplateConfig, NumberedTemplate } from '../types';
import { captureCardImage } from './pdfGenerator';
import QRCode from 'qrcode';
import { formatCardDualDate, format7DigitSerial, getTodayIssueDates, formatGcyyyyMmDd, formatGcWith3LetterMonth, calculateExpiryFromIssue } from './ethiopianCalendar';
import { loadTemplateCoordinates } from './templateStorage';
import { DEFAULT_COORDINATES } from '../data/defaultData';
import { sanitizeIdCardData } from './textCleaner';
import { drawCode128Direct } from './barcodeEngine';
import { makeQrTransparentAndBorderless } from './qrPrecisionCropper';
import { getCanvasFontString, DEFAULT_CARD_FONT } from './fontManager';

function applyGrayscaleToRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  try {
    const imgData = ctx.getImageData(x, y, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const c = Math.min(255, Math.max(0, (g - 128) * 1.15 + 128));
      d[i] = c;
      d[i + 1] = c;
      d[i + 2] = c;
    }
    ctx.putImageData(imgData, x, y);
  } catch {}
}

export function resolveItemConfigAndTemplate(
  item: BatchQueueItem,
  defaultConfig: CoordinatesConfig,
  defaultTemplateConfig: TemplateConfig,
  context?: {
    numberedTemplates?: NumberedTemplate[];
    activeTemplateNumber?: number;
    photoColorMode?: 'color' | 'grayscale';
    useStudioPositionsAlways?: boolean;
  }
): { config: CoordinatesConfig; templateConfig: TemplateConfig; photoColorMode: 'color' | 'grayscale' } {
  let chosenTemplate: NumberedTemplate | undefined;
  if (context?.numberedTemplates && context.numberedTemplates.length > 0) {
    if (item.templateNumber) {
      chosenTemplate = context.numberedTemplates.find((t) => t.number === item.templateNumber);
    }
    if (!chosenTemplate && context.activeTemplateNumber) {
      chosenTemplate = context.numberedTemplates.find((t) => t.number === context.activeTemplateNumber);
    }
  }

  // Base template configuration: default to live ID Card Studio settings
  const baseTplConfig = (!item.templateNumber || item.templateNumber === context?.activeTemplateNumber)
    ? defaultTemplateConfig
    : (chosenTemplate?.config || defaultTemplateConfig);

  // Apply all visual and template settings from the ID Card Studio to batch processing
  const templateConfig: TemplateConfig = {
    ...baseTplConfig,
    ...(context?.useStudioPositionsAlways !== false ? {
      showCornerMarks: defaultTemplateConfig.showCornerMarks ?? baseTplConfig.showCornerMarks,
      showFieldLabels: defaultTemplateConfig.showFieldLabels ?? baseTplConfig.showFieldLabels,
      showFanContainerBox: defaultTemplateConfig.showFanContainerBox ?? baseTplConfig.showFanContainerBox,
      showBarcodeBox: defaultTemplateConfig.showBarcodeBox ?? baseTplConfig.showBarcodeBox,
      showFrontBarcode: defaultTemplateConfig.showFrontBarcode ?? baseTplConfig.showFrontBarcode,
      showFrontFan: defaultTemplateConfig.showFrontFan ?? baseTplConfig.showFrontFan,
      showSecondaryPhoto: defaultTemplateConfig.showSecondaryPhoto ?? baseTplConfig.showSecondaryPhoto,
      secondaryPhotoStyle: defaultTemplateConfig.secondaryPhotoStyle || baseTplConfig.secondaryPhotoStyle,
      showNationality: defaultTemplateConfig.showNationality ?? baseTplConfig.showNationality,
      showHeader: defaultTemplateConfig.showHeader ?? baseTplConfig.showHeader,
      showFlag: defaultTemplateConfig.showFlag ?? baseTplConfig.showFlag,
      showEmblem: defaultTemplateConfig.showEmblem ?? baseTplConfig.showEmblem,
      showFooterNotice: defaultTemplateConfig.showFooterNotice ?? baseTplConfig.showFooterNotice,
      showBuiltinGuilloche: defaultTemplateConfig.showBuiltinGuilloche ?? baseTplConfig.showBuiltinGuilloche,
      opacity: defaultTemplateConfig.opacity ?? baseTplConfig.opacity,
      fitMode: defaultTemplateConfig.fitMode || baseTplConfig.fitMode,
      backgroundColor: defaultTemplateConfig.backgroundColor || baseTplConfig.backgroundColor,
      frontImageUrl: defaultTemplateConfig.frontImageUrl || baseTplConfig.frontImageUrl,
      backImageUrl: defaultTemplateConfig.backImageUrl || baseTplConfig.backImageUrl,
    } : {}),
  };

  // Apply custom item coordinates if specifically set for this card, otherwise use the card template's own calibrated positions
  const templateCoords = chosenTemplate?.coordinates || (chosenTemplate ? loadTemplateCoordinates(chosenTemplate.number) : null);
  const baseConfig = templateCoords || defaultConfig || DEFAULT_COORDINATES;

  const config: CoordinatesConfig = item.customCoordinates
    ? {
        ...baseConfig,
        ...item.customCoordinates,
        fields: {
          ...baseConfig.fields,
          ...item.customCoordinates.fields,
        },
        media: {
          ...baseConfig.media,
          ...item.customCoordinates.media,
        },
      }
    : baseConfig;
  
  const photoColorMode: 'color' | 'grayscale' = 
    item.photoColorMode || 
    item.extractedData.photoColorMode || 
    context?.photoColorMode || 
    'color';

  return { config, templateConfig, photoColorMode };
}

/**
 * Render an offscreen canvas for an applicant's ID card side
 */
export async function renderOffscreenCard(
  side: 'front' | 'back',
  data: IdCardData,
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  renderOptions?: {
    mirrorPrint?: boolean;
    format?: 'jpeg' | 'png';
    quality?: number;
    photoColorMode?: 'color' | 'grayscale';
    includeCalibrationMarks?: boolean;
  }
): Promise<string> {
  const cardData = sanitizeIdCardData(data);
  const canvas = document.createElement('canvas');
  const scale = 2; // 300 DPI supersampling
  const w = config.canvasWidth * scale;
  const h = config.canvasHeight * scale;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas 2D context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Ensure any custom or web fonts are fully ready in the browser
  if (typeof document !== 'undefined' && (document as any).fonts) {
    try {
      await (document as any).fonts.ready;
    } catch {}
  }
  const activeFont = templateConfig.cardFontFamily || DEFAULT_CARD_FONT;

  const isFront = side === 'front';

  // Background
  ctx.fillStyle = templateConfig.backgroundColor || '#f6fbf9';
  ctx.fillRect(0, 0, w, h);

  // Background template image if any
  const customBgUrl = side === 'front' ? templateConfig.frontImageUrl : templateConfig.backImageUrl;
  const hasCustomBg = Boolean(customBgUrl && customBgUrl.trim().length > 0);
  if (hasCustomBg) {
    try {
      const bgImg = await loadImage(customBgUrl!);
      ctx.save();
      ctx.globalAlpha = templateConfig.opacity ?? 1.0;
      const fitMode = templateConfig.fitMode || 'cover';
      if (fitMode === 'contain') {
        const naturalW = bgImg.naturalWidth || bgImg.width;
        const naturalH = bgImg.naturalHeight || bgImg.height;
        const imgAspect = naturalW / naturalH;
        const canvasAspect = w / h;
        let drawW = w;
        let drawH = h;
        let drawX = 0;
        let drawY = 0;
        if (imgAspect > canvasAspect) {
          drawH = w / imgAspect;
          drawY = (h - drawH) / 2;
        } else {
          drawW = h * imgAspect;
          drawX = (w - drawW) / 2;
        }
        ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);
      } else if (fitMode === 'cover') {
        const naturalW = bgImg.naturalWidth || bgImg.width;
        const naturalH = bgImg.naturalHeight || bgImg.height;
        const imgAspect = naturalW / naturalH;
        const canvasAspect = w / h;
        let sX = 0, sY = 0, sW = naturalW, sH = naturalH;
        if (imgAspect > canvasAspect) {
          sW = naturalH * canvasAspect;
          sX = (naturalW - sW) / 2;
        } else {
          sH = naturalW / canvasAspect;
          sY = (naturalH - sH) / 2;
        }
        ctx.drawImage(bgImg, sX, sY, sW, sH, 0, 0, w, h);
      } else {
        ctx.drawImage(bgImg, 0, 0, w, h);
      }
      ctx.restore();
    } catch (e) {
      console.warn('Failed to load custom background image:', e);
    }
  }

  if (isFront) {
    // Photo Primary
    const pX = config.media.photoFront.x * scale;
    const pY = config.media.photoFront.y * scale;
    const pW = config.media.photoFront.width * scale;
    const pH = config.media.photoFront.height * scale;
    const pRadius = (config.media.photoFront.borderRadius || 14) * scale;

    const isGrayscale = (renderOptions?.photoColorMode === 'grayscale') || (cardData.photoColorMode === 'grayscale');

    if (cardData.photoUrl) {
      try {
        const photoImg = await loadImage(cardData.photoUrl);
        ctx.save();
        roundedRectPath(ctx, pX, pY, pW, pH, pRadius);
        ctx.clip();
        if (isGrayscale) {
          try {
            ctx.filter = 'grayscale(100%) contrast(115%)';
            ctx.drawImage(photoImg, pX, pY, pW, pH);
            ctx.filter = 'none';
          } catch {
            ctx.drawImage(photoImg, pX, pY, pW, pH);
            applyGrayscaleToRect(ctx, pX, pY, pW, pH);
          }
        } else {
          ctx.filter = 'none';
          ctx.drawImage(photoImg, pX, pY, pW, pH);
        }
        ctx.restore();
      } catch (e) {
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(pX, pY, pW, pH);
      }
    }

    // Secondary Security Photo (Bottom Right)
    if (templateConfig.showSecondaryPhoto !== false && (cardData.photoUrl || cardData.secondaryPhotoUrl)) {
      const sX = (config.media.photoFrontSecondary?.x ?? 825) * scale;
      const sY = (config.media.photoFrontSecondary?.y ?? 435) * scale;
      const sW = (config.media.photoFrontSecondary?.width ?? 145) * scale;
      const sH = (config.media.photoFrontSecondary?.height ?? 175) * scale;
      const sRadius = (config.media.photoFrontSecondary?.borderRadius ?? 0) * scale;
      const sOpacity = config.media.photoFrontSecondary?.opacity ?? 0.85;

      try {
        const secImg = await loadImage(cardData.photoUrl || cardData.secondaryPhotoUrl);
        ctx.save();
        ctx.globalAlpha = sOpacity;
        if (sRadius > 0) {
          roundedRectPath(ctx, sX, sY, sW, sH, sRadius);
          ctx.clip();
        }
        if (templateConfig.secondaryPhotoStyle === 'goldBorder') {
          ctx.drawImage(secImg, sX, sY, sW, sH);
        } else if (isGrayscale || templateConfig.secondaryPhotoStyle === 'grayscale' || templateConfig.secondaryPhotoStyle === 'ghost') {
          try {
            ctx.filter = 'grayscale(100%) contrast(120%)';
            ctx.drawImage(secImg, sX, sY, sW, sH);
            ctx.filter = 'none';
          } catch {
            ctx.drawImage(secImg, sX, sY, sW, sH);
            applyGrayscaleToRect(ctx, sX, sY, sW, sH);
          }
        } else {
          ctx.filter = 'none';
          ctx.drawImage(secImg, sX, sY, sW, sH);
        }
        ctx.restore();
      } catch (e) {}
    }

    // Full Name Amharic & English
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const nameX = config.fields.fullNameAmharic.x * scale;
    const nameY = config.fields.fullNameAmharic.y * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10.5 * scale, activeFont);
      ctx.fillText('ሙሉ ስም', nameX, nameY - 14 * scale);
    }

    ctx.fillStyle = config.fields.fullNameAmharic.color || '#111827';
    ctx.font = getCanvasFontString('bold', (config.fields.fullNameAmharic.fontSize || 26) * scale, activeFont);
    ctx.fillText(cardData.fullNameAmharic, nameX, nameY);

    const nameEnX = (config.fields.fullNameEnglish?.x ?? config.fields.fullNameAmharic.x) * scale;
    const nameEnY = (config.fields.fullNameEnglish?.y ?? (config.fields.fullNameAmharic.y + 33)) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10.5 * scale, activeFont);
      ctx.fillText('Full Name', nameEnX, nameEnY - 14 * scale);
    }

    ctx.fillStyle = config.fields.fullNameEnglish?.color || '#1f2937';
    ctx.font = getCanvasFontString('600', (config.fields.fullNameEnglish?.fontSize || 22) * scale, activeFont);
    ctx.fillText(cardData.fullNameEnglish, nameEnX, nameEnY);

    // DOB - Dual calendar
    const dobX = config.fields.dateOfBirth.x * scale;
    const dobY = config.fields.dateOfBirth.y * scale;
    const dobDual = formatCardDualDate(cardData.dateOfBirth, cardData.dateOfBirthEth, 'eth_with_gc', { gcMonthName: false });

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10.5 * scale, activeFont);
      ctx.fillText('የትውልድ ቀን | Date of Birth', dobX, dobY - 14 * scale);
    }

    ctx.fillStyle = config.fields.dateOfBirth.color || '#111827';
    ctx.font = getCanvasFontString('bold', (config.fields.dateOfBirth.fontSize || 22) * scale, activeFont);
    ctx.fillText(dobDual, dobX, dobY);

    // Sex
    const sexX = config.fields.sex.x * scale;
    const sexY = config.fields.sex.y * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10.5 * scale, activeFont);
      ctx.fillText('ፆታ | Sex', sexX, sexY - 14 * scale);
    }

    ctx.fillStyle = config.fields.sex.color || '#111827';
    ctx.font = getCanvasFontString('bold', (config.fields.sex.fontSize || 22) * scale, activeFont);
    const sLower = (cardData.sex || '').toLowerCase();
    const sexLabel = (cardData.sex === 'Male' || sLower === 'male' || sLower === 'm' || cardData.sex === 'ወንድ')
      ? 'ወንድ / Male'
      : (cardData.sex === 'Female' || sLower === 'female' || sLower === 'f' || cardData.sex === 'ሴት')
      ? 'ሴት / Female'
      : (cardData.sex || 'ወንድ / Male');
    ctx.fillText(sexLabel, sexX, sexY);

    // Dual Issue Dates
    const gcField = config.fields.dateOfIssueGc || config.fields.dateOfIssueFront;
    if (gcField) {
      const gcX = (gcField.x ?? 52) * scale;
      const gcY = (gcField.y ?? 350) * scale;
      const gcRot = (gcField.rotation ?? -90) * (Math.PI / 180);
      const gcText = formatGcWith3LetterMonth(cardData.dateOfIssue || getTodayIssueDates().issueDateGc);
      ctx.save();
      ctx.translate(gcX, gcY);
      if (gcRot !== 0) ctx.rotate(gcRot);
      ctx.fillStyle = gcField.color || '#4b5563';
      ctx.font = getCanvasFontString('600', (gcField.fontSize ?? 15) * scale, activeFont);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(templateConfig.showFieldLabels ? `G.C: ${gcText}` : gcText, 0, 0);
      ctx.restore();
    }

    const ethField = config.fields.dateOfIssueEth;
    if (ethField) {
      const ethX = (ethField.x ?? 52) * scale;
      const ethY = (ethField.y ?? 220) * scale;
      const ethRot = (ethField.rotation ?? -90) * (Math.PI / 180);
      const ethText = cardData.dateOfIssueEth || getTodayIssueDates().issueDateEth;
      ctx.save();
      ctx.translate(ethX, ethY);
      if (ethRot !== 0) ctx.rotate(ethRot);
      ctx.fillStyle = ethField.color || '#4b5563';
      ctx.font = getCanvasFontString('600', (ethField.fontSize ?? 15) * scale, activeFont);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(templateConfig.showFieldLabels ? `E.C: ${ethText}` : ethText, 0, 0);
      ctx.restore();
    }

    // Expiry
    const expX = config.fields.dateOfExpiry.x * scale;
    const expY = config.fields.dateOfExpiry.y * scale;
    const issueGc = cardData.dateOfIssue || getTodayIssueDates().issueDateGc;
    const issueEth = cardData.dateOfIssueEth || getTodayIssueDates().issueDateEth;
    const calculatedExp = calculateExpiryFromIssue(issueGc, issueEth);
    const expDual = formatCardDualDate(
      calculatedExp?.expiryGc || cardData.dateOfExpiry,
      calculatedExp?.expiryEth || cardData.dateOfExpiryEth,
      'eth_with_gc',
      { gcMonthName: true }
    );

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10.5 * scale, activeFont);
      ctx.fillText('የሚያበቃበት ቀን | Date of Expiry', expX, expY - 14 * scale);
    }

    ctx.fillStyle = config.fields.dateOfExpiry.color || '#111827';
    ctx.font = getCanvasFontString('bold', (config.fields.dateOfExpiry.fontSize || 22) * scale, activeFont);
    ctx.fillText(expDual, expX, expY);

    // Front Side: FAN Card Number
    if (templateConfig.showFrontFan || templateConfig.showFanContainerBox) {
      const fanBoxX = (config.fields.fan.x - 70) * scale;
      const fanBoxY = (config.fields.fan.y - 10) * scale;
      const fanBoxW = (templateConfig.showSecondaryPhoto ? 465 : 540) * scale;
      const fanBoxH = 60 * scale;

      if (templateConfig.showFrontFan !== false) {
        ctx.fillStyle = config.fields.fan.color || '#0f172a';
        ctx.font = getCanvasFontString('bold', (config.fields.fan.fontSize || 28) * scale, activeFont);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const frontFanNoSpaces = (cardData.fan || '4195043670692582').replace(/\s+/g, '');
        ctx.fillText(frontFanNoSpaces, fanBoxX + fanBoxW / 2, fanBoxY + fanBoxH / 2);
      }
    }

    // Front Side: 1D Barcode Strip
    if (templateConfig.showFrontBarcode !== false) {
      const bcX = (config.media.frontBarcode?.x ?? 485) * scale;
      const bcY = (config.media.frontBarcode?.y ?? 520) * scale;
      const bcW = (config.media.frontBarcode?.width ?? 440) * scale;
      const bcH = (config.media.frontBarcode?.height ?? 40) * scale;
      const fanColor = config.fields.fan?.color || '#000000';

      ctx.save();
      if (config.media.frontBarcode?.scaleX && config.media.frontBarcode.scaleX !== 1) {
        ctx.translate(bcX + bcW / 2, bcY + bcH / 2);
        ctx.scale(config.media.frontBarcode.scaleX, 1);
        ctx.translate(-(bcX + bcW / 2), -(bcY + bcH / 2));
      }

      if (cardData.barcodeImageUrl) {
        try {
          const bcImg = await loadImage(cardData.barcodeImageUrl);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          if (config.media.frontBarcode?.fit === 'contain') {
            const imgAspect = bcImg.width / bcImg.height;
            const boxAspect = bcW / bcH;
            let drawW = bcW;
            let drawH = bcH;
            let drawX = bcX;
            let drawY = bcY;
            if (imgAspect > boxAspect) {
              drawH = bcW / imgAspect;
              drawY = bcY + (bcH - drawH) / 2;
            } else {
              drawW = bcH * imgAspect;
              drawX = bcX + (bcW - drawW) / 2;
            }
            ctx.drawImage(bcImg, drawX, drawY, drawW, drawH);
          } else {
            ctx.drawImage(bcImg, bcX, bcY, bcW, bcH);
          }
        } catch (e) {
          drawCode128Direct(ctx, cardData.fan || '4195043670692582', bcX, bcY, bcW, bcH, fanColor);
        }
      } else {
        drawCode128Direct(ctx, cardData.fan || '4195043670692582', bcX, bcY, bcW, bcH, fanColor);
      }
      ctx.restore();
    }
  } else {
    // BACK SIDE
    // Phone
    const phoneX = (config.fields.phoneNumber?.x ?? 45) * scale;
    const phoneY = (config.fields.phoneNumber?.y ?? 105) * scale;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10.5 * scale, activeFont);
      ctx.fillText('ስልክ | Phone Number', phoneX, phoneY - 14 * scale);
    }

    ctx.fillStyle = config.fields.phoneNumber?.color || '#111827';
    ctx.font = getCanvasFontString('bold', (config.fields.phoneNumber?.fontSize ?? 24) * scale, activeFont);
    ctx.fillText(cardData.phoneNumber || '0928574836', phoneX, phoneY);

    if (templateConfig.showNationality && config.fields.nationality) {
      const natX = config.fields.nationality.x * scale;
      const natY = config.fields.nationality.y * scale;
      if (templateConfig.showFieldLabels) {
        ctx.fillStyle = '#78350f';
        ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
        ctx.fillText('ዜግነት | Nationality', natX, natY - 14 * scale);
      }
      ctx.fillStyle = '#111827';
      ctx.font = getCanvasFontString('bold', config.fields.nationality.fontSize * scale, activeFont);
      ctx.fillText(`${cardData.nationalityAmharic || 'ኢትዮጵያዊ'} | ${cardData.nationalityEnglish || 'Ethiopian'}`, natX, natY);
    }

    // Step-by-Step Address
    const regAmX = (config.fields.regionAmharic?.x ?? 45) * scale;
    const regAmY = (config.fields.regionAmharic?.y ?? 275) * scale;
    const regFontSize = (config.fields.regionAmharic?.fontSize ?? 20) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
      ctx.fillText('ክልል (Amharic)', regAmX, regAmY - 14 * scale);
    }

    ctx.fillStyle = config.fields.regionAmharic?.color || '#111827';
    ctx.font = getCanvasFontString('bold', regFontSize, activeFont);
    ctx.fillText(cardData.regionAmharic || 'ሲዳማ', regAmX, regAmY);

    const regEnX = (config.fields.regionEnglish?.x ?? config.fields.regionAmharic?.x ?? 45) * scale;
    const regEnY = (config.fields.regionEnglish?.y ?? ((config.fields.regionAmharic?.y ?? 275) + 27)) * scale;
    const regEnFontSize = (config.fields.regionEnglish?.fontSize ?? config.fields.regionAmharic?.fontSize ?? 20) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
      ctx.fillText('Region (English)', regEnX, regEnY - 14 * scale);
    }

    ctx.fillStyle = config.fields.regionEnglish?.color || '#111827';
    ctx.font = getCanvasFontString('bold', regEnFontSize, activeFont);
    ctx.fillText(cardData.regionEnglish || 'Sidama', regEnX, regEnY);

    const zoneAmX = (config.fields.zoneAmharic?.x ?? config.fields.zoneSubcity?.x ?? 45) * scale;
    const zoneAmY = (config.fields.zoneAmharic?.y ?? config.fields.zoneSubcity?.y ?? 345) * scale;
    const zoneFontSize = (config.fields.zoneAmharic?.fontSize ?? config.fields.zoneSubcity?.fontSize ?? 20) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
      ctx.fillText('ዞን / ክ/ከተማ (Amharic)', zoneAmX, zoneAmY - 14 * scale);
    }

    ctx.fillStyle = config.fields.zoneAmharic?.color || config.fields.zoneSubcity?.color || '#1f2937';
    ctx.font = getCanvasFontString('bold', zoneFontSize, activeFont);
    ctx.fillText(cardData.zoneAmharic || 'አርበጎና', zoneAmX, zoneAmY);

    const zoneEnX = (config.fields.zoneEnglish?.x ?? config.fields.zoneAmharic?.x ?? config.fields.zoneSubcity?.x ?? 45) * scale;
    const zoneEnY = (config.fields.zoneEnglish?.y ?? ((config.fields.zoneAmharic?.y ?? config.fields.zoneSubcity?.y ?? 345) + 27)) * scale;
    const zoneEnFontSize = (config.fields.zoneEnglish?.fontSize ?? config.fields.zoneAmharic?.fontSize ?? config.fields.zoneSubcity?.fontSize ?? 20) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
      ctx.fillText('Zone / Subcity (English)', zoneEnX, zoneEnY - 14 * scale);
    }

    ctx.fillStyle = config.fields.zoneEnglish?.color || '#1f2937';
    ctx.font = getCanvasFontString('bold', zoneEnFontSize, activeFont);
    ctx.fillText(cardData.zoneEnglish || 'Arbegona', zoneEnX, zoneEnY);

    const worAmX = (config.fields.woredaAmharic?.x ?? config.fields.woredaKebele?.x ?? 45) * scale;
    const worAmY = (config.fields.woredaAmharic?.y ?? config.fields.woredaKebele?.y ?? 415) * scale;
    const worFontSize = (config.fields.woredaAmharic?.fontSize ?? config.fields.woredaKebele?.fontSize ?? 20) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
      ctx.fillText('ወረዳ (Amharic)', worAmX, worAmY - 14 * scale);
    }

    ctx.fillStyle = config.fields.woredaAmharic?.color || config.fields.woredaKebele?.color || '#1f2937';
    ctx.font = getCanvasFontString('bold', worFontSize, activeFont);
    ctx.fillText(cardData.woredaAmharic || 'ወረዳ 01', worAmX, worAmY);

    const worEnX = (config.fields.woredaEnglish?.x ?? config.fields.woredaAmharic?.x ?? config.fields.woredaKebele?.x ?? 45) * scale;
    const worEnY = (config.fields.woredaEnglish?.y ?? ((config.fields.woredaAmharic?.y ?? config.fields.woredaKebele?.y ?? 415) + 27)) * scale;
    const worEnFontSize = (config.fields.woredaEnglish?.fontSize ?? config.fields.woredaAmharic?.fontSize ?? config.fields.woredaKebele?.fontSize ?? 20) * scale;

    if (templateConfig.showFieldLabels) {
      ctx.fillStyle = '#78350f';
      ctx.font = getCanvasFontString('bold', 10 * scale, activeFont);
      ctx.fillText('Woreda (English)', worEnX, worEnY - 14 * scale);
    }

    ctx.fillStyle = config.fields.woredaEnglish?.color || '#1f2937';
    ctx.font = getCanvasFontString('bold', worEnFontSize, activeFont);
    ctx.fillText(cardData.woredaEnglish || cardData.woredaAmharic || 'Woreda 01', worEnX, worEnY);

    // Bottom Left: Back FAN Cutter Layer OR FCN / FIN Box
    if (cardData.finLayerCropUrl && cardData.useFinLayerCrop === true) {
      const finX = (config.media.backFanCut?.x ?? 45) * scale;
      const finY = (config.media.backFanCut?.y ?? 505) * scale;
      const finW = (config.media.backFanCut?.width ?? 440) * scale;
      const finH = (config.media.backFanCut?.height ?? 95) * scale;
      const finRadius = (config.media.backFanCut?.borderRadius ?? 8) * scale;
      const finOpacity = config.media.backFanCut?.opacity ?? 1.0;
      const fitMode = config.media.backFanCut?.fit === 'fill' ? 'fill' : 'contain';
      const scaleXFactor = config.media.backFanCut?.scaleX ?? 1.0;

      try {
        const finImg = await loadImage(cardData.finLayerCropUrl);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = finOpacity;
        ctx.globalCompositeOperation = 'source-over';
        if (finRadius > 0) {
          roundedRectPath(ctx, finX, finY, finW, finH, finRadius);
          ctx.clip();
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(finX, finY, finW, finH);

        if (scaleXFactor !== 1.0) {
          const centerX = finX + finW / 2;
          ctx.translate(centerX, 0);
          ctx.scale(scaleXFactor, 1.0);
          ctx.translate(-centerX, 0);
        }

        const naturalW = finImg.naturalWidth || finImg.width;
        const naturalH = finImg.naturalHeight || finImg.height;
        if (fitMode === 'contain' && naturalW > 0 && naturalH > 0) {
          const imgAspect = naturalW / naturalH;
          const boxAspect = finW / finH;
          let drawW = finW;
          let drawH = finH;
          let drawX = finX;
          let drawY = finY;

          if (imgAspect > boxAspect) {
            drawH = finW / imgAspect;
            drawY = finY + (finH - drawH) / 2;
          } else {
            drawW = finH * imgAspect;
            drawX = finX + (finW - drawW) / 2;
          }

          ctx.drawImage(finImg, drawX, drawY, drawW, drawH);
        } else {
          ctx.drawImage(finImg, finX, finY, finW, finH);
        }
        ctx.restore();
      } catch (e) {
        console.warn('Failed to draw back finLayerCropUrl in offscreen card:', e);
      }
    } else {
      const bX = (config.media.backFanCut?.x ?? config.fields.barcodeText?.x ?? 45) * scale;
      const bY = (config.media.backFanCut?.y ?? config.fields.barcodeText?.y ?? 505) * scale;
      const bW = (config.media.backFanCut?.width ?? 440) * scale;
      const bH = (config.media.backFanCut?.height ?? 95) * scale;
      const finRadius = (config.media.backFanCut?.borderRadius ?? 8) * scale;
      const rawFan = String(cardData.backFan || cardData.fan || '4195043670692582').trim();
      const digits = rawFan.replace(/\D/g, '');
      const backFanValue = digits.length === 16 && !rawFan.includes(' ')
        ? `${digits.slice(0, 4)}   ${digits.slice(4, 8)}   ${digits.slice(8, 12)}   ${digits.slice(12, 16)}`
        : rawFan;
      
      ctx.save();
      if (finRadius > 0) {
        roundedRectPath(ctx, bX, bY, bW, bH, finRadius);
        ctx.clip();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.restore();

      const rawWeight = String(config.fields.barcodeText?.fontWeight || '');
      const finWeight = rawWeight === '700' || rawWeight === '600' || rawWeight === 'bold' ? '600' : '400';
      const finFontSize = (config.fields.barcodeText?.fontSize || 19) * scale;
      ctx.fillStyle = config.fields.barcodeText?.color || '#111827';
      ctx.font = `${finWeight} ${finFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(backFanValue, bX + bW / 2, bY + bH / 2);
    }

    // QR Code
    const qrX = config.media.qrCodeBack.x * scale;
    const qrY = config.media.qrCodeBack.y * scale;
    const qrW = config.media.qrCodeBack.width * scale;
    const qrH = config.media.qrCodeBack.height * scale;

    if (cardData.qrCodeImageUrl) {
      try {
        const cleanQrUrl = await makeQrTransparentAndBorderless(cardData.qrCodeImageUrl);
        const qrImg = await loadImage(cleanQrUrl);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(qrImg, qrX, qrY, qrW, qrH);
        ctx.restore();
      } catch (e) {
        console.warn('Failed to load cropped QR image for batch export:', e);
      }
    } else {
      try {
        const qrPayload = cardData.qrData || `FAYDA:${cardData.fan}:${cardData.fullNameEnglish}:DOB=${cardData.dateOfBirth}`;
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: qrW,
          color: { dark: '#000000', light: '#00000000' },
        });
        const qrImg = await loadImage(qrDataUrl);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(qrImg, qrX, qrY, qrW, qrH);
        ctx.restore();
      } catch (e) {}
    }

    // Serial Number
    const snX = config.fields.serialNumber.x * scale;
    const snY = config.fields.serialNumber.y * scale;
    const snFontSize = config.fields.serialNumber.fontSize * scale;
    const snText = `SN : ${format7DigitSerial(cardData.serialNumber)}`;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = getCanvasFontString('bold', snFontSize, activeFont);

    const snMetrics = ctx.measureText(snText);
    const snPadX = 6 * scale;
    const snPadY = 2.5 * scale;
    const snBgW = snMetrics.width + snPadX * 2;
    const snBgH = snFontSize * 1.35;

    ctx.fillStyle = '#ffffff';
    if (typeof (ctx as any).roundRect === 'function') {
      ctx.beginPath();
      (ctx as any).roundRect(snX - snPadX, snY - snPadY, snBgW, snBgH, 3 * scale);
      ctx.fill();
    } else {
      ctx.fillRect(snX - snPadX, snY - snPadY, snBgW, snBgH);
    }

    ctx.fillStyle = config.fields.serialNumber.color || '#111827';
    ctx.fillText(snText, snX, snY);
    ctx.restore();
  }

  if (renderOptions?.includeCalibrationMarks) {
    drawCornerCalibrationMarksOnCanvas(ctx, w, h, scale);
  }

  // Handle Horizontal Mirroring (Mirrors the individual card)
  let finalCanvas: HTMLCanvasElement = canvas;
  if (renderOptions?.mirrorPrint) {
    const mCanvas = document.createElement('canvas');
    mCanvas.width = w;
    mCanvas.height = h;
    const mCtx = mCanvas.getContext('2d');
    if (mCtx) {
      mCtx.translate(w, 0);
      mCtx.scale(-1, 1);
      mCtx.drawImage(canvas, 0, 0);
      finalCanvas = mCanvas;
    }
  }

  const exportFormat = renderOptions?.format || 'jpeg';
  const exportQuality = renderOptions?.quality ?? 0.90;
  if (exportFormat === 'png') {
    return finalCanvas.toDataURL('image/png', 1.0);
  }
  return finalCanvas.toDataURL('image/jpeg', exportQuality);
}

export async function exportBatchToA4Pdf(
  items: BatchQueueItem[],
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  optionsOrProgress?: Partial<A4BatchPrintConfig> | ((current: number, total: number, status: string) => void),
  onProgressCallback?: (current: number, total: number, status: string) => void
): Promise<void> {
  let options: Partial<A4BatchPrintConfig> = {};
  let onProgress = onProgressCallback;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = optionsOrProgress;
  }

  const activeItems = items.filter((it) => it.selected !== false && it.status !== 'error');
  if (activeItems.length === 0) throw new Error('No valid items selected for batch export');

  const layout: A4BatchPrintLayout = options.layout || '5_per_page_paired';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const PAGE_WIDTH_MM = 210;
  const PAGE_HEIGHT_MM = 297;

  interface SheetTask {
    chunk: BatchQueueItem[];
    label: string;
    duplexSide?: 'front' | 'back';
    sheetIndex: number;
  }

  const sheetTasks: SheetTask[] = [];

  if (layout === '1_per_page_detailed') {
    for (let i = 0; i < activeItems.length; i++) {
      sheetTasks.push({
        chunk: [activeItems[i]],
        label: `ID ${i + 1}/${activeItems.length} (${activeItems[i].extractedData.fullNameEnglish || 'Card'})`,
        sheetIndex: i,
      });
    }
  } else if (layout === '5_per_page_duplex') {
    const chunkSize = 5;
    const totalChunks = Math.ceil(activeItems.length / chunkSize);
    for (let c = 0; c < totalChunks; c++) {
      const chunk = activeItems.slice(c * chunkSize, (c + 1) * chunkSize);
      sheetTasks.push({
        chunk,
        label: `Sheet ${c * 2 + 1} - Fronts (${chunk.length} IDs)`,
        duplexSide: 'front',
        sheetIndex: c * 2,
      });
      sheetTasks.push({
        chunk,
        label: `Sheet ${c * 2 + 2} - Backs Duplex (${chunk.length} IDs)`,
        duplexSide: 'back',
        sheetIndex: c * 2 + 1,
      });
    }
  } else if (layout === '5_per_page_front' || layout === '5_per_page_back') {
    const chunkSize = 5;
    const totalChunks = Math.ceil(activeItems.length / chunkSize);
    const side = layout === '5_per_page_back' ? 'back' : 'front';
    for (let c = 0; c < totalChunks; c++) {
      const chunk = activeItems.slice(c * chunkSize, (c + 1) * chunkSize);
      sheetTasks.push({
        chunk,
        label: `Sheet ${c + 1} - ${side.toUpperCase()}s (${chunk.length} IDs)`,
        duplexSide: side,
        sheetIndex: c,
      });
    }
  } else {
    const chunkSize = 5;
    const totalChunks = Math.ceil(activeItems.length / chunkSize);
    for (let c = 0; c < totalChunks; c++) {
      const chunk = activeItems.slice(c * chunkSize, (c + 1) * chunkSize);
      sheetTasks.push({
        chunk,
        label: `Sheet ${c + 1}/${totalChunks} (${chunk.length} Paired IDs)`,
        sheetIndex: c,
      });
    }
  }

  const totalSheets = sheetTasks.length;

  for (let s = 0; s < totalSheets; s++) {
    const task = sheetTasks[s];
    onProgress?.(s + 1, totalSheets, `Rendering Full-Page PNG Sheet ${s + 1} of ${totalSheets} (${task.label})...`);

    if (s > 0) {
      doc.addPage('a4', 'portrait');
    }

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'F');

    const sheetCanvas = await renderBatchA4SheetCanvas(
      task.chunk,
      config,
      templateConfig,
      { ...options, layout, duplexSide: task.duplexSide },
      s,
      totalSheets,
      300 
    );

    const fullPagePng = sheetCanvas.toDataURL('image/png', 1.0);
    doc.addImage(fullPagePng, 'PNG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, undefined, 'SLOW');
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const layoutSuffix = layout === '5_per_page_paired' ? '5_Per_Page_A4' : layout;
  doc.save(`Fayda_Batch_${activeItems.length}_Cards_${layoutSuffix}_${dateStr}.pdf`);
  onProgress?.(totalSheets, totalSheets, 'Batch A4 PDF export complete with Full Page PNG & White Background!');
}

export async function exportBatchToA4Png(
  items: BatchQueueItem[],
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  optionsOrProgress?: Partial<A4BatchPrintConfig> | ((current: number, total: number, status: string) => void),
  onProgressCallback?: (current: number, total: number, status: string) => void,
  singleSheetIndex?: number
): Promise<void> {
  let options: Partial<A4BatchPrintConfig> = {};
  let onProgress = onProgressCallback;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = optionsOrProgress;
  }

  const activeItems = items.filter((it) => it.selected !== false && it.status !== 'error');
  if (activeItems.length === 0) throw new Error('No valid items selected for batch PNG export');

  const layout: A4BatchPrintLayout = options.layout || '5_per_page_paired';

  interface SheetTask {
    chunk: BatchQueueItem[];
    label: string;
    duplexSide?: 'front' | 'back';
    sheetNum: number;
  }

  const sheetTasks: SheetTask[] = [];

  if (layout === '1_per_page_detailed') {
    for (let i = 0; i < activeItems.length; i++) {
      sheetTasks.push({
        chunk: [activeItems[i]],
        label: `ID_${i + 1}`,
        sheetNum: i + 1,
      });
    }
  } else if (layout === '5_per_page_duplex') {
    const chunkSize = 5;
    const totalChunks = Math.ceil(activeItems.length / chunkSize);
    for (let c = 0; c < totalChunks; c++) {
      const chunk = activeItems.slice(c * chunkSize, (c + 1) * chunkSize);
      sheetTasks.push({
        chunk,
        label: `Sheet_${c * 2 + 1}_FRONTS`,
        duplexSide: 'front',
        sheetNum: c * 2 + 1,
      });
      sheetTasks.push({
        chunk,
        label: `Sheet_${c * 2 + 2}_BACKS`,
        duplexSide: 'back',
        sheetNum: c * 2 + 2,
      });
    }
  } else if (layout === '5_per_page_front' || layout === '5_per_page_back') {
    const chunkSize = 5;
    const totalChunks = Math.ceil(activeItems.length / chunkSize);
    const side = layout === '5_per_page_back' ? 'back' : 'front';
    for (let c = 0; c < totalChunks; c++) {
      const chunk = activeItems.slice(c * chunkSize, (c + 1) * chunkSize);
      sheetTasks.push({
        chunk,
        label: `Sheet_${c + 1}_${side.toUpperCase()}`,
        duplexSide: side,
        sheetNum: c + 1,
      });
    }
  } else {
    const chunkSize = 5;
    const totalChunks = Math.ceil(activeItems.length / chunkSize);
    for (let c = 0; c < totalChunks; c++) {
      const chunk = activeItems.slice(c * chunkSize, (c + 1) * chunkSize);
      sheetTasks.push({
        chunk,
        label: `Sheet_${c + 1}_of_${totalChunks}`,
        sheetNum: c + 1,
      });
    }
  }

  const tasksToProcess =
    singleSheetIndex !== undefined && sheetTasks[singleSheetIndex]
      ? [sheetTasks[singleSheetIndex]]
      : sheetTasks;

  const dateStr = new Date().toISOString().split('T')[0];

  if (tasksToProcess.length === 1) {
    const task = tasksToProcess[0];
    onProgress?.(1, 1, `Rendering 300 DPI A4 PNG: ${task.label}...`);
    const sheetCanvas = await renderBatchA4SheetCanvas(
      task.chunk,
      config,
      templateConfig,
      { ...options, layout, duplexSide: task.duplexSide },
      task.sheetNum - 1,
      sheetTasks.length,
      300
    );

    const dataUrl = sheetCanvas.toDataURL('image/png', 1.0);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `Fayda_Batch_A4_${task.label}_300DPI_${dateStr}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onProgress?.(1, 1, 'A4 Full Page PNG Downloaded (Solid White Background)!');
  } else {
    const zip = new JSZip();
    const folder = zip.folder('A4_Print_Sheets_300DPI_PNG');

    for (let i = 0; i < tasksToProcess.length; i++) {
      const task = tasksToProcess[i];
      onProgress?.(i + 1, tasksToProcess.length, `Rendering 300 DPI A4 PNG Sheet ${i + 1} of ${tasksToProcess.length}...`);

      const sheetCanvas = await renderBatchA4SheetCanvas(
        task.chunk,
        config,
        templateConfig,
        { ...options, layout, duplexSide: task.duplexSide },
        i,
        tasksToProcess.length,
        300
      );

      const dataUrl = sheetCanvas.toDataURL('image/png', 1.0);
      const base64Data = dataUrl.split(',')[1];
      folder?.file(`Fayda_A4_${task.label}_300DPI.png`, base64Data, { base64: true });
    }

    onProgress?.(tasksToProcess.length, tasksToProcess.length, 'Compressing PNG package...');
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fayda_Batch_A4_PNG_Sheets_300DPI_${dateStr}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onProgress?.(tasksToProcess.length, tasksToProcess.length, 'All A4 PNG Sheets Downloaded!');
  }
}

export async function exportBatchToZipArchive(
  items: BatchQueueItem[],
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  optionsOrProgress?: Partial<BatchExportOptions> | ((current: number, total: number, status: string) => void),
  onProgressCallback?: (current: number, total: number, status: string) => void
): Promise<void> {
  let options: Partial<BatchExportOptions> = {};
  let onProgress = onProgressCallback;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = optionsOrProgress;
  }

  const activeItems = items.filter((it) => it.selected !== false && it.status !== 'error');
  if (activeItems.length === 0) throw new Error('No valid items selected for ZIP export');

  const mirrorPrint = options.mirrorPrint ?? true;
  const quality = options.quality ?? 0.92;

  const zip = new JSZip();
  const frontFolder = zip.folder('01_Front_Cards_300DPI');
  const backFolder = zip.folder('02_Back_Cards_300DPI');
  const manifestData: any[] = [];

  for (let i = 0; i < activeItems.length; i++) {
    const item = activeItems[i];
    onProgress?.(i + 1, activeItems.length, `Rendering assets for ${item.extractedData.fullNameEnglish} (${i + 1}/${activeItems.length})...`);

    const resolved = resolveItemConfigAndTemplate(item, config, templateConfig, options);
    const [frontImg, backImg] = await Promise.all([
      renderOffscreenCard('front', item.extractedData, resolved.config, resolved.templateConfig, {
        mirrorPrint,
        format: 'jpeg',
        quality,
        photoColorMode: resolved.photoColorMode,
      }),
      renderOffscreenCard('back', item.extractedData, resolved.config, resolved.templateConfig, {
        mirrorPrint,
        format: 'jpeg',
        quality,
        photoColorMode: resolved.photoColorMode,
      }),
    ]);

    const cleanName = item.extractedData.fullNameEnglish.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanFan = item.extractedData.fan.replace(/\s+/g, '_');
    const mirrorTag = mirrorPrint ? '_MIRRORED' : '';
    const prefix = `${String(i + 1).padStart(2, '0')}_${cleanName}_${cleanFan}`;

    frontFolder?.file(`${prefix}_FRONT${mirrorTag}.jpg`, frontImg.split(',')[1], { base64: true });
    backFolder?.file(`${prefix}_BACK${mirrorTag}.jpg`, backImg.split(',')[1], { base64: true });

    manifestData.push({
      index: i + 1,
      sourceFile: item.fileName,
      fan: item.extractedData.fan,
      fullNameAmharic: item.extractedData.fullNameAmharic,
      fullNameEnglish: item.extractedData.fullNameEnglish,
      dob: item.extractedData.dateOfBirth,
      sex: item.extractedData.sex,
      region: item.extractedData.regionEnglish,
      phone: item.extractedData.phoneNumber,
      expiry: item.extractedData.dateOfExpiry,
      mirrored: mirrorPrint,
    });
  }

  zip.file('batch_manifest.json', JSON.stringify(manifestData, null, 2));
  zip.file(
    'README.txt',
    `Ethiopian Digital ID Card Studio - High-Efficiency Batch Export Package\n` +
    `Total Cards: ${activeItems.length}\n` +
    `Export Date: ${new Date().toLocaleString()}\n` +
    `Resolution: 300 DPI (CR80 Standard: 85.60 mm x 53.98 mm)\n` +
    `Mirror Printing: ${mirrorPrint ? 'ENABLED (Ready for Inkjet PVC / Transfer Sheet Printing)' : 'STANDARD'}\n` +
    `Storage Optimization: High-Density Compressed JPEG @ 300 DPI (DEFLATE Level 9)\n\n` +
    `Folders:\n` +
    `- 01_Front_Cards_300DPI: High-resolution cards for front side\n` +
    `- 02_Back_Cards_300DPI: High-resolution cards with verified QR code matrices\n` +
    `- batch_manifest.json: Structured JSON data index\n`
  );

  onProgress?.(activeItems.length, activeItems.length, 'Compressing ZIP package (DEFLATE Level 9)...');
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9,
    },
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ethiopian_Fayda_Batch_Cards_${activeItems.length}_Export_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.(activeItems.length, activeItems.length, 'ZIP Package Downloaded!');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundedRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const stripeH = h / 3;
  ctx.fillStyle = '#009639';
  ctx.fillRect(x, y, w, stripeH);

  ctx.fillStyle = '#FEDD00';
  ctx.fillRect(x, y + stripeH, w, stripeH);

  ctx.fillStyle = '#002B7F';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + stripeH + stripeH / 2, stripeH * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#EF3340';
  ctx.fillRect(x, y + stripeH * 2, w, stripeH);
}

function drawGuillochePattern(ctx: CanvasRenderingContext2D, w: number, h: number, side: string, presetId?: string) {
  ctx.save();
  ctx.strokeStyle = presetId === 'golden_hologram' ? 'rgba(217, 119, 6, 0.15)' : 'rgba(5, 150, 105, 0.15)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 100 + i * 50);
    ctx.bezierCurveTo(w * 0.25, 50 + i * 80, w * 0.75, 200 + i * 40, w, 120 + i * 50);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWatermarkEmblem(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number) {
  ctx.save();
  ctx.globalAlpha = 0.20;
  const centerX = w - 160 * scale;
  const centerY = 240 * scale;
  const r = 85 * scale;

  const svgPoints = [
    [50, 5], [64, 38], [98, 38], [70, 59], [81, 92],
    [50, 72], [19, 92], [30, 59], [2, 38], [36, 38]
  ];
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3.5 * scale;
  ctx.beginPath();
  for (let i = 0; i < svgPoints.length; i++) {
    const px = centerX + (svgPoints[i][0] - 50) * (r / 45);
    const py = centerY + (svgPoints[i][1] - 50) * (r / 45);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2.5 * scale;
  ctx.beginPath();
  ctx.arc(centerX, centerY, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#064e3b';
  ctx.font = `bold ${36 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ፋይዳ', centerX, centerY + 2 * scale);
  ctx.restore();
}

function drawCornerCalibrationMarksOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale: number
) {
  ctx.save();
  ctx.save();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5 * scale;
  ctx.setLineDash([6 * scale, 4 * scale]);
  ctx.globalAlpha = 0.65;
  ctx.strokeRect(0.75 * scale, 0.75 * scale, w - 1.5 * scale, h - 1.5 * scale);
  ctx.restore();

  const armLen = 38 * scale;
  const tick7 = 7 * scale;
  const tick12 = 12 * scale;
  const tick24 = 24 * scale;
  const notch14 = 14 * scale;
  const rDot = 4.5 * scale;
  const rInner = 1.8 * scale;

  const drawCornerL = (
    cx: number,
    cy: number,
    dirX: 1 | -1,
    dirY: 1 | -1,
    label: string,
    chipOffsetX: number,
    chipOffsetY: number
  ) => {
    ctx.save();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4.5 * scale;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(cx, cy + dirY * armLen);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dirX * armLen, cy);
    ctx.stroke();

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy + dirY * armLen);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dirX * armLen, cy);
    ctx.stroke();

    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(cx + dirX * tick12, cy);
    ctx.lineTo(cx + dirX * tick12, cy + dirY * tick7);
    ctx.moveTo(cx + dirX * tick24, cy);
    ctx.lineTo(cx + dirX * tick24, cy + dirY * tick7);
    ctx.moveTo(cx, cy + dirY * tick12);
    ctx.lineTo(cx + dirX * tick7, cy + dirY * tick12);
    ctx.moveTo(cx, cy + dirY * tick24);
    ctx.lineTo(cx + dirX * tick7, cy + dirY * tick24);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dirX * notch14, cy + dirY * notch14);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, rDot, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
    ctx.fill();

    const chipW = 88 * scale;
    const chipH = 20 * scale;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1 * scale;
    roundedRectPath(ctx, chipOffsetX, chipOffsetY, chipW, chipH, 4 * scale);
    ctx.fill();
    roundedRectStroke(ctx, chipOffsetX, chipOffsetY, chipW, chipH, 4 * scale);

    ctx.fillStyle = '#34d399';
    ctx.font = `bold ${10.5 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, chipOffsetX + chipW / 2, chipOffsetY + chipH / 2);

    ctx.restore();
  };

  drawCornerL(0, 0, 1, 1, 'TL (0, 0)', 10 * scale, 10 * scale);
  drawCornerL(w, 0, -1, 1, 'TR (1012, 0)', w - 98 * scale, 10 * scale);
  drawCornerL(0, h, 1, -1, 'BL (0, 638)', 10 * scale, h - 30 * scale);
  drawCornerL(w, h, -1, -1, 'BR (1012, 638)', w - 108 * scale, h - 30 * scale);

  ctx.restore();
}

function drawBatchCropMarks(doc: jsPDF, x: number, y: number, w: number, h: number, label?: string) {
  const markLen = 4;
  const offset = 2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);

  doc.line(x - offset - markLen, y, x - offset, y);
  doc.line(x, y - offset - markLen, x, y - offset);
  doc.line(x + w + offset, y, x + w + offset + markLen, y);
  doc.line(x + w, y - offset - markLen, x + w, y - offset);
  doc.line(x - offset - markLen, y + h, x - offset, y + h);
  doc.line(x, y + h + offset, x, y + h + offset + markLen);
  doc.line(x + w + offset, y + h, x + w + offset + markLen, y + h);
  doc.line(x + w, y + h + offset, x + w, y + h + offset + markLen);

  if (label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x, y - 3);
  }
}

export function drawSyntheticBarcode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  code: string
) {
  drawCode128Direct(ctx, code, x, y, w, h);
}

export function drawCornerCropMarks(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number] = [148, 163, 184],
  len = 3.5,
  offset = 1.5
) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.2);

  doc.line(x - offset - len, y, x - offset, y);
  doc.line(x, y - offset - len, x, y - offset);
  doc.line(x + w + offset, y, x + w + offset + len, y);
  doc.line(x + w, y - offset - len, x + w, y - offset);
  doc.line(x - offset - len, y + h, x - offset, y + h);
  doc.line(x, y + h + offset, x, y + h + offset + len);
  doc.line(x + w + offset, y + h, x + w + offset + len, y + h);
  doc.line(x + w, y + h + offset, x + w, y + h + offset + len);
}

export async function renderBatchA4SheetCanvas(
  chunk: BatchQueueItem[],
  config: CoordinatesConfig,
  templateConfig: TemplateConfig,
  options: Partial<A4BatchPrintConfig> = {},
  pageIndex = 0,
  totalPages = 1,
  dpi = 150
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const pxPerMm = dpi / 25.4;
  const canvasW = Math.round(210 * pxPerMm);
  const canvasH = Math.round(297 * pxPerMm);
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const layout: A4BatchPrintLayout = options.layout || '5_per_page_paired';
  const showCropMarks = options.showCropMarks !== false;
  const showCutLines = options.showCutLines !== false;
  const showLabels = Boolean(options.showLabels);
  const cardGapYMm = options.cardGapY ?? 2.0;
  const cardGapXMm = options.cardGapX ?? 6.0;
  const topMarginMm = options.topMargin ?? 9.5;
  const mirrorPrint = options.mirrorPrint ?? true;

  const storedWidth = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('fayda_a4_card_width') || '') : NaN;
  const storedHeight = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('fayda_a4_card_height') || '') : NaN;
  const cr80WMm = options.cardWidthMm ?? (!isNaN(storedWidth) && storedWidth > 70 ? storedWidth : 86.80);
  const cr80HMm = options.cardHeightMm ?? (!isNaN(storedHeight) && storedHeight > 45 ? storedHeight : Number(((cr80WMm / 1012) * 638).toFixed(2)));
  const cr80WPx = cr80WMm * pxPerMm;
  const cr80HPx = cr80HMm * pxPerMm;

  const naturalTotalH = chunk.length * cr80HMm + Math.max(0, chunk.length - 1) * cardGapYMm;
  const effectiveGapYMm =
    naturalTotalH > 291
      ? Math.max(0.6, (291 - chunk.length * cr80HMm) / Math.max(1, chunk.length - 1))
      : cardGapYMm;
  const totalContentHeightMm = chunk.length * cr80HMm + Math.max(0, chunk.length - 1) * effectiveGapYMm;
  const effectiveTopMarginMm =
    topMarginMm + totalContentHeightMm > 293
      ? Math.max(3.0, (297 - totalContentHeightMm) / 2)
      : topMarginMm;

  if (layout === '1_per_page_detailed') {
    const item = chunk[0];
    if (item) {
      const centerXMm = (210 - cr80WMm) / 2;
      const totalCardsHeightMm = cr80HMm * 2 + 16;
      const frontYMm = (297 - totalCardsHeightMm) / 2;
      const backYMm = frontYMm + cr80HMm + 16;

      const xPx = centerXMm * pxPerMm;
      const frontYPx = frontYMm * pxPerMm;
      const backYPx = backYMm * pxPerMm;

      const resolved = resolveItemConfigAndTemplate(item, config, templateConfig, options);
      const [frontPng, backPng] = await Promise.all([
        renderOffscreenCard('front', item.extractedData, resolved.config, resolved.templateConfig, {
          mirrorPrint,
          format: 'png',
          photoColorMode: resolved.photoColorMode,
        }),
        renderOffscreenCard('back', item.extractedData, resolved.config, resolved.templateConfig, {
          mirrorPrint,
          format: 'png',
          photoColorMode: resolved.photoColorMode,
        }),
      ]);

      const [frontImg, backImg] = await Promise.all([
        loadImage(frontPng),
        loadImage(backPng),
      ]);

      ctx.drawImage(frontImg, xPx, frontYPx, cr80WPx, cr80HPx);
      ctx.drawImage(backImg, xPx, backYPx, cr80WPx, cr80HPx);

      if (showCropMarks) {
        drawCanvasCornerCropMarks(ctx, xPx, frontYPx, cr80WPx, cr80HPx, pxPerMm);
        drawCanvasCornerCropMarks(ctx, xPx, backYPx, cr80WPx, cr80HPx, pxPerMm);
      }

      if (showLabels) {
        ctx.fillStyle = '#64748b';
        ctx.font = `bold ${Math.max(10, Math.round(9 * pxPerMm / 3.8))}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(
          `${item.extractedData.fullNameEnglish || 'CARD'} - FRONT (${item.extractedData.fan || ''})`,
          xPx,
          frontYPx - 3 * pxPerMm
        );
        ctx.fillText(
          `${item.extractedData.fullNameEnglish || 'CARD'} - BACK`,
          xPx,
          backYPx - 3 * pxPerMm
        );
      }
    }
  } else if (layout === '5_per_page_duplex' || layout === '5_per_page_front' || layout === '5_per_page_back') {
    const targetSide: 'front' | 'back' =
      layout === '5_per_page_back'
        ? 'back'
        : layout === '5_per_page_duplex'
        ? (options.duplexSide || 'front')
        : 'front';

    const centerXMm = (210 - cr80WMm) / 2;
    const xPx = centerXMm * pxPerMm;

    for (let r = 0; r < chunk.length; r++) {
      const item = chunk[r];
      const yMm = effectiveTopMarginMm + r * (cr80HMm + effectiveGapYMm);
      const yPx = yMm * pxPerMm;

      const resolved = resolveItemConfigAndTemplate(item, config, templateConfig, options);
      const cardPng = await renderOffscreenCard(targetSide, item.extractedData, resolved.config, resolved.templateConfig, {
        mirrorPrint,
        format: 'png',
        photoColorMode: resolved.photoColorMode,
      });

      const cardImg = await loadImage(cardPng);
      ctx.drawImage(cardImg, xPx, yPx, cr80WPx, cr80HPx);

      if (showCropMarks) {
        drawCanvasCornerCropMarks(ctx, xPx, yPx, cr80WPx, cr80HPx, pxPerMm);
      }

      if (showLabels) {
        ctx.fillStyle = '#64748b';
        ctx.font = `bold ${Math.max(9, Math.round(8 * pxPerMm / 3.8))}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(
          `${r + 1}. ${item.extractedData.fullNameEnglish || 'Card'} (${targetSide.toUpperCase()})`,
          xPx,
          yPx - 2 * pxPerMm
        );
      }

      if (showCutLines && r > 0) {
        ctx.save();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = Math.max(1, Math.round(pxPerMm / 8));
        ctx.setLineDash([4 * pxPerMm / 6, 4 * pxPerMm / 6]);
        const divYPx = (yMm - effectiveGapYMm / 2) * pxPerMm;
        ctx.beginPath();
        ctx.moveTo(xPx - 10 * pxPerMm / 6, divYPx);
        ctx.lineTo(xPx + cr80WPx + 10 * pxPerMm / 6, divYPx);
        ctx.stroke();
        ctx.restore();
      }
    }
  } else {
    // DEFAULT & RECOMMENDED: '5_per_page_paired'
    const totalPairWidthMm = cr80WMm * 2 + cardGapXMm;
    const xLeftMm = (210 - totalPairWidthMm) / 2;
    const xRightMm = xLeftMm + cr80WMm + cardGapXMm;

    // Core Logic: Swap Front and Back positions if mirror print is enabled
    const xFrontMm = mirrorPrint ? xRightMm : xLeftMm;
    const xBackMm = mirrorPrint ? xLeftMm : xRightMm;

    const xLeftPx = xLeftMm * pxPerMm;
    const xRightPx = xRightMm * pxPerMm;
    const xFrontPx = xFrontMm * pxPerMm;
    const xBackPx = xBackMm * pxPerMm;

    for (let r = 0; r < chunk.length; r++) {
      const item = chunk[r];
      const yMm = effectiveTopMarginMm + r * (cr80HMm + effectiveGapYMm);
      const yPx = yMm * pxPerMm;

      const resolved = resolveItemConfigAndTemplate(item, config, templateConfig, options);
      const [frontPng, backPng] = await Promise.all([
        renderOffscreenCard('front', item.extractedData, resolved.config, resolved.templateConfig, {
          mirrorPrint,
          format: 'png',
          photoColorMode: resolved.photoColorMode,
        }),
        renderOffscreenCard('back', item.extractedData, resolved.config, resolved.templateConfig, {
          mirrorPrint,
          format: 'png',
          photoColorMode: resolved.photoColorMode,
        }),
      ]);

      const [frontImg, backImg] = await Promise.all([
        loadImage(frontPng),
        loadImage(backPng),
      ]);

      ctx.drawImage(frontImg, xFrontPx, yPx, cr80WPx, cr80HPx);
      ctx.drawImage(backImg, xBackPx, yPx, cr80WPx, cr80HPx);

      if (showCropMarks) {
        drawCanvasCornerCropMarks(ctx, xFrontPx, yPx, cr80WPx, cr80HPx, pxPerMm);
        drawCanvasCornerCropMarks(ctx, xBackPx, yPx, cr80WPx, cr80HPx, pxPerMm);
      }

      // Pin metadata labels to the left edge regardless of which card is positioned there
      if (showLabels) {
        ctx.fillStyle = '#64748b';
        ctx.font = `bold ${Math.max(9, Math.round(8 * pxPerMm / 3.8))}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(
          `${r + 1}. ${item.extractedData.fullNameEnglish || 'Card'} - ${item.extractedData.fan || ''}`,
          xLeftPx,
          yPx - 2 * pxPerMm
        );
      }

      if (showCutLines) {
        ctx.save();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = Math.max(1, Math.round(pxPerMm / 8));
        ctx.setLineDash([4 * pxPerMm / 6, 4 * pxPerMm / 6]);

        const midXPx = (xLeftMm + cr80WMm + cardGapXMm / 2) * pxPerMm;
        ctx.beginPath();
        ctx.moveTo(midXPx, yPx - 2 * pxPerMm / 6);
        ctx.lineTo(midXPx, yPx + cr80HPx + 2 * pxPerMm / 6);
        ctx.stroke();

        if (r > 0) {
          const divYPx = (yMm - effectiveGapYMm / 2) * pxPerMm;
          ctx.beginPath();
          ctx.moveTo(xLeftPx - 10 * pxPerMm / 6, divYPx);
          ctx.lineTo(xRightPx + cr80WPx + 10 * pxPerMm / 6, divYPx);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  return canvas;
}

function drawCanvasCornerCropMarks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pxPerMm: number
) {
  const len = 3.5 * pxPerMm;
  const offset = 1.5 * pxPerMm;

  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(x - offset - len, y);
  ctx.lineTo(x - offset, y);
  ctx.moveTo(x, y - offset - len);
  ctx.lineTo(x, y - offset);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + w + offset, y);
  ctx.lineTo(x + w + offset + len, y);
  ctx.moveTo(x + w, y - offset - len);
  ctx.lineTo(x + w, y - offset);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - offset - len, y + h);
  ctx.lineTo(x - offset, y + h);
  ctx.moveTo(x, y + h + offset);
  ctx.lineTo(x, y + h + offset + len);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + w + offset, y + h);
  ctx.lineTo(x + w + offset + len, y + h);
  ctx.moveTo(x + w, y + h + offset);
  ctx.lineTo(x + w, y + h + offset + len);
  ctx.stroke();

  ctx.restore();
}