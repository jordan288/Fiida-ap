import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Settings,
  Play,
  CheckCircle2,
  Layers,
  Palette,
  FileText,
  Sparkles,
  Check,
  CheckCheck,
  Bot,
  RefreshCw,
  ShieldCheck,
  Printer,
  X,
  FlipHorizontal,
  Coins,
  CreditCard,
  HelpCircle,
  Sun,
  Image as ImageIcon,
  UploadCloud,
} from 'lucide-react';
import {
  CoordinatesConfig,
  IdCardData,
  NumberedTemplate,
  TemplateConfig,
  TelegramBotMessage,
  TelegramBotPermanentSettings,
  TelegramExportFileType,
  TelegramFileProcessItem,
  BatchQueueItem,
} from '../types';
import {
  TELEGRAM_COLOR_SCHEMES,
  loadTelegramBotSettings,
  saveTelegramBotSettings,
  applyTelegramColorSchemeToCoordinates,
  applyTelegramColorSchemeToTemplateConfig,
} from '../utils/telegramBotStorage';
import { extractFromPdf, extractFromImage } from '../utils/pdfExtractor';
import { autoRemovePhotoBackground } from '../utils/imageProcessor';
import { loadNumberedTemplates, loadTemplateCoordinates } from '../utils/templateStorage';
import { renderOffscreenCard, exportBatchToA4Pdf, exportBatchToA4Png, exportBatchToZipArchive } from '../utils/batchExporter';
import { SAMPLE_BATCH_APPLICANTS, SAMPLE_ID_DATA } from '../data/defaultData';
import { BotPointsOwnerModal } from './BotPointsOwnerModal';
import {
  BotPointsState,
  getBotPointsState,
  hasSufficientPoints,
  deductPdfPoints,
  addBotPoints,
  minusBotPoints,
} from '../utils/botPointsManager';

interface TelegramBotViewProps {
  config: CoordinatesConfig;
  setConfig: React.Dispatch<React.SetStateAction<CoordinatesConfig>>;
  templateConfig: TemplateConfig;
  setTemplateConfig: React.Dispatch<React.SetStateAction<TemplateConfig>>;
  numberedTemplates: NumberedTemplate[];
  activeTemplateNumber: number;
  onSelectTemplateNumber: (num: number) => void;
  onOpenInStudio?: (data: IdCardData) => void;
}

export const TelegramBotView: React.FC<TelegramBotViewProps> = ({
  config,
  setConfig,
  templateConfig,
  setTemplateConfig,
  numberedTemplates,
  activeTemplateNumber,
  onSelectTemplateNumber,
}) => {
  const [settings, setSettings] = useState<TelegramBotPermanentSettings>(() => loadTelegramBotSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const availableBotTemplates = numberedTemplates && numberedTemplates.length >= 6
    ? numberedTemplates
    : loadNumberedTemplates();

  const [templateThumbnails, setTemplateThumbnails] = useState<Record<number, { front: string; back: string }>>({});
  const [isGeneratingTplThumbnails, setIsGeneratingTplThumbnails] = useState(false);

  const [pointsState, setPointsState] = useState<BotPointsState>(() => getBotPointsState());
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
    percent: number;
  } | null>(null);

  // Individual Photo Editor State
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
  const [draftBrightnessMap, setDraftBrightnessMap] = useState<Record<string, number>>({});

  const [isAwaitingTransactionMsg, setIsAwaitingTransactionMsg] = useState(false);

  const [serverStatus, setServerStatus] = useState({ isPolling: false, hasToken: false });
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  const [isBatchActive, setIsBatchActive] = useState(false);
  const [batchItems, setBatchItems] = useState<TelegramFileProcessItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');

  const [inspectItem, setInspectItem] = useState<TelegramFileProcessItem | null>(null);
  const [inspectMirrored, setInspectMirrored] = useState(true);

  const [messages, setMessages] = useState<TelegramBotMessage[]>([
    {
      id: 'welcome-1',
      sender: 'bot',
      text: `👋 Welcome to the Ethiopian Digital ID Card Studio Bot.\n\nSend single or bulk Fayda ID PDF files to convert into print-ready cards.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      buttons: [
        { label: '🎨 Choose Template (Pictures)', action: 'show_templates', variant: 'primary' },
        { label: '⚡ Test 10 Sample PDFs', action: 'test_bulk', variant: 'secondary' },
        { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' },
      ],
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateTemplatePictures = async (overrideColorMode?: 'color' | 'grayscale') => {
    setIsGeneratingTplThumbnails(true);
    const results: Record<number, { front: string; back: string }> = {};
    const tpls = availableBotTemplates;
    const sampleData = SAMPLE_BATCH_APPLICANTS[0] || SAMPLE_ID_DATA;

    for (const tpl of tpls) {
      try {
        const coords = tpl.coordinates || loadTemplateCoordinates(tpl.number) || config;
        const tConfig = tpl.config || templateConfig;
        const renderOpts = {
          format: 'jpeg' as const,
          quality: 0.88,
          photoColorMode: overrideColorMode || settings.photoColorMode || 'color',
          mirrorPrint: false,
        };
        const [front, back] = await Promise.all([
          renderOffscreenCard('front', sampleData, coords, tConfig, renderOpts),
          renderOffscreenCard('back', sampleData, coords, tConfig, renderOpts),
        ]);
        results[tpl.number] = { front, back };
      } catch (err) {
        console.warn(`Failed to render template ${tpl.number} preview:`, err);
      }
    }
    setTemplateThumbnails(results);
    setIsGeneratingTplThumbnails(false);
    return results;
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessingQueue, bulkProgress]);

  useEffect(() => {
    // Ensure 1000+ points balance is loaded into state
    const current = getBotPointsState();
    setPointsState(current);
    fetchServerStatus();
    generateTemplatePictures();
  }, []);

  const fetchServerStatus = async () => {
    setIsCheckingServer(true);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus({
          isPolling: data.status?.isPolling || false,
          hasToken: data.status?.hasToken || false,
        });
        if (typeof data.status?.pointsBalance === 'number' && data.status.pointsBalance > 0) {
          setPointsState((prev) => ({ ...prev, points: Math.max(prev.points, data.status.pointsBalance) }));
        }
      }
    } catch {}
    setIsCheckingServer(false);
  };

  const updatePermanentSettings = (partial: Partial<TelegramBotPermanentSettings>) => {
    const updated = saveTelegramBotSettings(partial);
    setSettings(updated);

    if (partial.colorSchemeId) {
      const scheme = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === partial.colorSchemeId);
      if (scheme) {
        setConfig((prev) => applyTelegramColorSchemeToCoordinates(prev, scheme));
        setTemplateConfig((prev) => applyTelegramColorSchemeToTemplateConfig(prev, scheme));
      }
    }
    if (partial.activeTemplateNumber && partial.activeTemplateNumber !== activeTemplateNumber) {
      onSelectTemplateNumber(partial.activeTemplateNumber);
    }
    if (partial.photoColorMode !== undefined) {
      const newColorMode = partial.photoColorMode;
      const completedList = batchItems.filter((i) => i.status === 'completed' && i.extractedData);
      if (completedList.length > 0) {
        appendMessage('system', `Photo mode switched to ${newColorMode === 'grayscale' ? 'Black & White (B&W Laser)' : 'Full Color'} for all ${completedList.length} card(s)...`);
        (async () => {
          const updatedBatch = [...batchItems];
          const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === updated.colorSchemeId);
          const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
          const effectiveTemplateConfig = activeColor ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor) : templateConfig;

          for (let i = 0; i < updatedBatch.length; i++) {
            const item = updatedBatch[i];
            if (item.status === 'completed' && item.extractedData) {
              item.extractedData.photoColorMode = newColorMode;
              const bOffset = (item as any).photoBrightness || 0;
              const renderOpts = {
                mirrorPrint: updated.mirrorPrintExport ?? settings.mirrorPrintExport,
                format: 'jpeg' as const,
                quality: 0.92,
                photoColorMode: newColorMode,
                brightness: 100 + bOffset,
              };
              try {
                const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
                  renderOffscreenCard('front', item.extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
                  renderOffscreenCard('back', item.extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
                ]);
                updatedBatch[i] = {
                  ...item,
                  mirroredFrontUrl,
                  mirroredBackUrl,
                };
              } catch (e) {}
            }
          }
          setBatchItems(updatedBatch);
          generateTemplatePictures(newColorMode);
          setMessages((prev) =>
            prev.map((msg) => {
              const match = updatedBatch.find((it) => it.id === (msg.itemPreview as any)?.itemId);
              if (match && msg.itemPreview) {
                return {
                  ...msg,
                  itemPreview: {
                    ...msg.itemPreview,
                    mirroredFrontUrl: match.mirroredFrontUrl,
                    mirroredBackUrl: match.mirroredBackUrl,
                  } as any,
                };
              }
              return msg;
            })
          );
        })();
      }
    }
  };

  const handleSelectTemplate = async (num: number) => {
    onSelectTemplateNumber(num);
    const updatedSettings = saveTelegramBotSettings({ activeTemplateNumber: num });
    setSettings(updatedSettings);

    const chosenTpl = availableBotTemplates.find((t) => t.number === num);
    const tplName = chosenTpl?.name || `Template #${num}`;

    // If there are completed cards, re-render them to immediately reflect the new template design
    const completedList = batchItems.filter((i) => i.status === 'completed' && i.extractedData);
    if (completedList.length > 0) {
      appendMessage('system', `🎨 Re-rendering ${completedList.length} card(s) using Template #${num}: ${tplName}...`);
      const updatedBatch = [...batchItems];
      const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === updatedSettings.colorSchemeId);
      const effectiveTplConfig = chosenTpl?.config || templateConfig;
      const effectiveCoords = chosenTpl?.coordinates || loadTemplateCoordinates(num) || config;

      for (let i = 0; i < updatedBatch.length; i++) {
        const item = updatedBatch[i];
        if (item.status === 'completed' && item.extractedData) {
          const bOffset = (item as any).photoBrightness || 0;
          const renderOpts = {
            mirrorPrint: updatedSettings.mirrorPrintExport ?? settings.mirrorPrintExport,
            format: 'jpeg' as const,
            quality: 0.92,
            photoColorMode: updatedSettings.photoColorMode || 'color',
            brightness: 100 + bOffset,
          };
          try {
            const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
              renderOffscreenCard('front', item.extractedData, effectiveCoords, effectiveTplConfig, renderOpts),
              renderOffscreenCard('back', item.extractedData, effectiveCoords, effectiveTplConfig, renderOpts),
            ]);
            updatedBatch[i] = {
              ...item,
              templateNumber: num,
              mirroredFrontUrl,
              mirroredBackUrl,
            };
          } catch (e) {}
        }
      }
      setBatchItems(updatedBatch);
      setMessages((prev) =>
        prev.map((msg) => {
          const match = updatedBatch.find((it) => it.id === (msg.itemPreview as any)?.itemId);
          if (match && msg.itemPreview) {
            return {
              ...msg,
              itemPreview: {
                ...msg.itemPreview,
                mirroredFrontUrl: match.mirroredFrontUrl,
                mirroredBackUrl: match.mirroredBackUrl,
              } as any,
            };
          }
          return msg;
        })
      );
    }

    appendMessage(
      'bot',
      `✅ Activated *Template #${num}: ${tplName}*!\nAll processed and exported cards will use this layout.`,
      {
        buttons: [
          { label: '🎨 View All Templates', action: 'show_templates', variant: 'primary' },
          { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' },
        ],
      }
    );
  };

  const handleShowTemplateShowcase = async () => {
    let thumbs = templateThumbnails;
    if (Object.keys(thumbs).length < availableBotTemplates.length) {
      thumbs = await generateTemplatePictures();
    }

    const tplList = availableBotTemplates.map((t) => ({
      number: t.number,
      name: t.name || `Template #${t.number}`,
      description: t.description || `Official Layout for Ethiopian Fayda Cards`,
      frontImageUrl: thumbs[t.number]?.front || t.frontImageUrl || t.config.frontImageUrl,
      backImageUrl: thumbs[t.number]?.back || t.backImageUrl || t.config.backImageUrl,
      themeColor: t.themeColor,
      badge: t.number === (settings.activeTemplateNumber || 1) ? 'Active' : undefined,
    }));

    appendMessage(
      'bot',
      `🎨 *Choose an ID Card Template:*\n\nReview the pictures for each template below and tap any card to activate it for your ID cards:`,
      {
        templateShowcase: { templates: tplList },
        buttons: [
          ...availableBotTemplates.map((t) => ({
            label: `${(settings.activeTemplateNumber || 1) === t.number ? '✓ ' : ''}Template #${t.number}`,
            action: `select_template_${t.number}`,
            variant: (settings.activeTemplateNumber || 1) === t.number ? ('primary' as const) : ('secondary' as const),
          })),
          { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' as const },
        ],
      }
    );
  };

  const appendMessage = (
    sender: 'bot' | 'user' | 'system',
    text: string,
    options?: {
      buttons?: TelegramBotMessage['buttons'];
      itemPreview?: TelegramBotMessage['itemPreview'];
      exportedDocument?: TelegramBotMessage['exportedDocument'];
      templateShowcase?: TelegramBotMessage['templateShowcase'];
    }
  ) => {
    const newMsg: TelegramBotMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      buttons: options?.buttons,
      itemPreview: options?.itemPreview,
      exportedDocument: options?.exportedDocument,
      templateShowcase: options?.templateShowcase,
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  const handleShowPaymentInfo = () => {
    setIsAwaitingTransactionMsg(true);
    appendMessage(
      'bot',
      `Buy Processing Points (Telebirr)\n\n` +
      `Cost: ${pointsState.pricePerPointBirr} Birr per 1 PDF processing (1 Point)\n\n` +
      `Telebirr Number: 0911234567\n` +
      `Name: Abebe Kebede\n\n` +
      `Steps to recharge:\n` +
      `1. Send the amount via Telebirr.\n` +
      `2. Copy the Telebirr confirmation SMS text or transaction link and paste it into the chat box below to verify.\n\n` +
      `Once pasted, the admin will verify and add your points automatically.`,
      {
        buttons: [
          { label: 'Cancel Payment', action: 'cancel_receipt', variant: 'secondary' }
        ]
      }
    );
  };

  // Helper to bake brightness adjustments into a high-DPI image data URL (preserving true transparent PNG alpha)
  const applyBrightnessToPhotoUrl = (photoUrl: string, brightnessPercent: number): Promise<string> => {
    return new Promise((resolve) => {
      if (!photoUrl || brightnessPercent === 0) return resolve(photoUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(photoUrl);
        ctx.clearRect(0, 0, c.width, c.height);
        const bVal = 100 + brightnessPercent;
        const cVal = 100 + Math.round(brightnessPercent * 0.12);
        ctx.filter = `brightness(${bVal}%) contrast(${cVal}%)`;
        ctx.drawImage(img, 0, 0);
        // Use lossless PNG to permanently preserve transparency and eliminate opaque backgrounds
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(photoUrl);
      img.src = photoUrl;
    });
  };

  // --- OPEN INDIVIDUAL PHOTO EDITOR ---
  const openPhotoEditor = () => {
    const initialMap: Record<string, number> = {};
    batchItems.forEach(item => {
      const pUrl = item.extractedData?.photoUrl || (item.extractedData as any)?.photo;
      if (item.status === 'completed' && pUrl) {
        initialMap[item.id] = (item as any).photoBrightness || 0;
      }
    });
    setDraftBrightnessMap(initialMap);
    setIsPhotoEditorOpen(true);
  };

  const setAbsoluteBrightness = (id: string, val: number) => {
    setDraftBrightnessMap(prev => ({ ...prev, [id]: val }));
  };

  const applyBrightnessToAll = (val: number) => {
    const updatedMap: Record<string, number> = {};
    batchItems.forEach(item => {
      if (item.status === 'completed') {
        updatedMap[item.id] = val;
      }
    });
    setDraftBrightnessMap(updatedMap);
  };

  // --- PERMANENTLY SETTLE NO BACKGROUND (TRANSPARENT CUTOUT) ---
  const handleSettleNoBackground = async (itemId?: string) => {
    setIsProcessingQueue(true);
    const targetItems = itemId
      ? batchItems.filter((it) => it.id === itemId && it.status === 'completed')
      : batchItems.filter((it) => it.status === 'completed');

    if (targetItems.length === 0) {
      setIsProcessingQueue(false);
      return;
    }

    appendMessage('system', `Permanently settling transparent background (no background) on ${targetItems.length} photo(s)...`);

    const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
    const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
    const effectiveTemplateConfig = activeColor ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor) : templateConfig;

    const updatedBatch = [...batchItems];

    for (let i = 0; i < updatedBatch.length; i++) {
      const item = updatedBatch[i];
      if (item.status === 'completed' && (!itemId || item.id === itemId)) {
        const pUrl = item.extractedData?.photoUrl || (item.extractedData as any)?.photo;
        const photoSource = (item as any).originalPhotoUrl || pUrl;
        if (photoSource && item.extractedData) {
          try {
            const transparentCutout = await autoRemovePhotoBackground(photoSource, {
              fillColor: 'transparent',
              protectClothes: true,
              clotheShieldStrength: 80,
              tolerance: 32,
            });

            const bOffset = draftBrightnessMap[item.id] ?? (item as any).photoBrightness ?? 0;
            const finalPhotoUrl = bOffset !== 0
              ? await applyBrightnessToPhotoUrl(transparentCutout, bOffset)
              : transparentCutout;

            item.extractedData.photoUrl = finalPhotoUrl;
            item.extractedData.secondaryPhotoUrl = finalPhotoUrl;
            item.extractedData.photoTransparentUrl = transparentCutout;

            const renderOpts = {
              mirrorPrint: settings.mirrorPrintExport,
              format: 'jpeg' as const,
              quality: 0.92,
              photoColorMode: settings.photoColorMode || 'color',
              brightness: 100 + bOffset,
            };

            const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
              renderOffscreenCard('front', item.extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
              renderOffscreenCard('back', item.extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
            ]);

            updatedBatch[i] = {
              ...item,
              mirroredFrontUrl,
              mirroredBackUrl,
              originalPhotoUrl: transparentCutout,
              photoTransparentUrl: transparentCutout,
            } as any;

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.itemPreview && (msg.itemPreview as any).itemId === item.id) {
                  return {
                    ...msg,
                    itemPreview: {
                      ...msg.itemPreview,
                      extractedData: { ...item.extractedData },
                      mirroredFrontUrl,
                      mirroredBackUrl,
                      photo: finalPhotoUrl,
                    } as any,
                  };
                }
                return msg;
              })
            );
          } catch (err) {
            console.warn('Failed settling background for item:', item.id, err);
          }
        }
      }
    }

    setBatchItems(updatedBatch);
    setIsProcessingQueue(false);
    appendMessage('bot', `✅ Permanently settled transparent portrait background (no background) for ${targetItems.length} ID card(s).`);
  };

  // --- SAVE INDIVIDUAL PHOTO EDITS & RE-RENDER CARDS ---
  const handleApplyPhotoEdits = async () => {
    setIsPhotoEditorOpen(false);

    const itemsToUpdate = batchItems.filter(item => {
      const pUrl = item.extractedData?.photoUrl || (item.extractedData as any)?.photo;
      return (
        item.status === 'completed' &&
        pUrl &&
        draftBrightnessMap[item.id] !== undefined &&
        draftBrightnessMap[item.id] !== ((item as any).photoBrightness || 0)
      );
    });

    if (itemsToUpdate.length === 0) return;

    setIsProcessingQueue(true);
    appendMessage('system', `Applying brightness edits to ${itemsToUpdate.length} ID portrait photo(s)...`);

    const updatedBatch = [...batchItems];
    const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
    const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
    const effectiveTemplateConfig = activeColor ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor) : templateConfig;

    for (let i = 0; i < updatedBatch.length; i++) {
      const item = updatedBatch[i];
      const pUrl = item.extractedData?.photoUrl || (item.extractedData as any)?.photo;
      if (item.status === 'completed' && draftBrightnessMap[item.id] !== undefined && pUrl) {
         const newBrightnessVal = draftBrightnessMap[item.id];
         const oldBrightness = (item as any).photoBrightness || 0;
         
         if (newBrightnessVal !== oldBrightness && item.extractedData) {
           // Bake the adjusted brightness into the photoUrl for permanent rendering across all export formats
           const origBasePhoto = (item as any).originalPhotoUrl || pUrl;
           const adjustedPhotoUrl = await applyBrightnessToPhotoUrl(origBasePhoto, newBrightnessVal);
           
           item.extractedData.photoUrl = adjustedPhotoUrl;
           item.extractedData.photoBrightness = 100 + newBrightnessVal;

           const renderOpts = { 
             mirrorPrint: settings.mirrorPrintExport, 
             format: 'jpeg' as const, 
             quality: 0.92, 
             photoColorMode: settings.photoColorMode || 'color', 
             brightness: 100 + newBrightnessVal 
           };

           const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
             renderOffscreenCard('front', item.extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
             renderOffscreenCard('back', item.extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
           ]);
           
           updatedBatch[i] = {
             ...item,
             mirroredFrontUrl,
             mirroredBackUrl,
             photoBrightness: newBrightnessVal,
             originalPhotoUrl: origBasePhoto,
           } as any;

           setMessages(prev => prev.map(msg => {
              if (msg.itemPreview && (msg.itemPreview as any).itemId === item.id) {
                 return { 
                   ...msg, 
                   itemPreview: {
                     ...msg.itemPreview,
                     mirroredFrontUrl,
                     mirroredBackUrl,
                     brightness: newBrightnessVal,
                     photo: adjustedPhotoUrl,
                   } as any 
                 };
              }
              return msg;
           }));
         }
      }
    }
    
    setBatchItems(updatedBatch);
    setIsProcessingQueue(false);
    appendMessage('bot', `✅ Photo brightness adjustments saved for ${itemsToUpdate.length} ID(s)! Updated in preview and ready for export.`);
  };

  const handleStartBatch = () => {
    setIsAwaitingTransactionMsg(false);
    setIsBatchActive(true);
    setBatchItems([]);
    appendMessage('user', 'Start');
    appendMessage('bot', `Multiple File activated.\n\nPlease send your PDF Fayda ID slips or photos now.`);
  };

  const handleDoneBatch = async () => {
    const completedItems = batchItems.filter((i) => i.status === 'completed' && i.extractedData);
    if (completedItems.length === 0) {
      appendMessage('bot', `No completed files in current batch yet. Please upload at least 1 PDF slip.`);
      return;
    }

    setIsExportingBatch(true);
    setExportProgressText('Preparing 300 DPI A4 sheet...');
    appendMessage('user', 'Done / Export');
    appendMessage(
      'bot',
      `Compiling A4 Sheet for ${completedItems.length} IDs...\n` +
      `Template: #${settings.activeTemplateNumber}\n` +
      `Photo Color: ${settings.photoColorMode === 'grayscale' ? 'B&W (Laser)' : 'Full Color'}\n` +
      `Layout: ${settings.mirrorPrintExport ? 'Mirrored (PVC)' : 'Standard'}\n` +
      `Format: ${settings.exportFileType.toUpperCase()}\n`
    );

    try {
      const photoColorMode = settings.photoColorMode || 'color';
      
      const queueItems: BatchQueueItem[] = completedItems.map((item, idx) => {
        const itemBrightnessOffset = (item as any).photoBrightness || 0;
        return {
          id: item.id,
          fileName: item.fileName,
          fileSize: item.fileSize,
          fileType: 'application/pdf',
          extractedData: { ...item.extractedData!, photoColorMode, photoBrightness: 100 + itemBrightnessOffset },
          status: 'ready',
          selected: true,
          progress: 100,
          createdAt: item.timestamp,
          order: idx,
        };
      });

      const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
      const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
      const effectiveTemplateConfig = activeColor
        ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor)
        : templateConfig;

      const fileType = settings.exportFileType;
      let downloadUrl = '';
      const randomFourDigits = Math.floor(1000 + Math.random() * 9000);
      let exportedFileName = `Multi ID ${randomFourDigits}`;

      if (fileType === 'a4_png_5_per_page') {
        exportedFileName += '.png';
        await exportBatchToA4Png(queueItems, effectiveConfig, effectiveTemplateConfig, { layout: '5_per_page_paired', mirrorPrint: settings.mirrorPrintExport, photoColorMode }, (cur, total, msg) => setExportProgressText(`${msg} (${cur}/${total})`));
      } else if (fileType === 'hd_zip_archive') {
        exportedFileName += '.zip';
        await exportBatchToZipArchive(queueItems, effectiveConfig, effectiveTemplateConfig, { format: 'zip_archive', mirrorPrint: settings.mirrorPrintExport, photoColorMode }, (cur, total, msg) => setExportProgressText(`${msg} (${cur}/${total})`));
      } else {
        exportedFileName += '.pdf';
        const isMirror = settings.mirrorPrintExport;
        await exportBatchToA4Pdf(queueItems, effectiveConfig, effectiveTemplateConfig, { layout: '5_per_page_paired', mirrorPrint: isMirror, photoColorMode }, (cur, total, msg) => setExportProgressText(`${msg} (${cur}/${total})`));
      }

      appendMessage(
        'bot',
        `Export Successful!\n\nTotal Cards Printed: ${completedItems.length} IDs\nFormat: ${settings.exportFileType.toUpperCase()}\nDPI: 300 DPI High-Resolution Print Ready\n\nYour document has been downloaded as "${exportedFileName}".`,
        {
          exportedDocument: { fileName: exportedFileName, fileUrl: downloadUrl, fileType: settings.exportFileType, itemCount: completedItems.length },
        }
      );
    } catch (err: any) {
      appendMessage('bot', `Export Failed: ${err.message || 'Unknown error during export'}`);
    } finally {
      setIsExportingBatch(false);
      setExportProgressText('');
    }
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsAwaitingTransactionMsg(false);
    setIsBatchActive(true);
    setIsProcessingQueue(true);

    const isBulk = files.length > 1;
    const startIndex = batchItems.length;
    const newItems: TelegramFileProcessItem[] = files.map((file, idx) => ({
      id: `file-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      fileIndex: startIndex + idx + 1,
      fileName: file.name,
      fileSize: file.size,
      status: 'queued',
      timestamp: Date.now(),
    }));

    setBatchItems((prev) => [...prev, ...newItems]);
    
    if (isBulk) {
      appendMessage('user', `Uploaded ${files.length} bulk files`);
      appendMessage(
        'bot',
        `📦 *Bulk Batch Uploaded: ${files.length} Files Queued*\n\n` +
        `• Processing each Fayda ID PDF in sequence with live extraction...\n` +
        `• 1 Point deducted per processed ID (Balance: ${pointsState.points} Points)\n` +
        `• Track live progress above.`
      );
    } else {
      appendMessage('user', `Uploaded ${files[0].name}`);
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const currentItem = newItems[i];
      const fileIndex = currentItem.fileIndex;
      const percent = Math.round(((i + 1) / files.length) * 100);

      setBulkProgress({
        current: i + 1,
        total: files.length,
        currentFileName: file.name,
        percent,
      });

      if (!hasSufficientPoints(1)) {
        appendMessage(
          'bot',
          `⚠️ *Insufficient Points Balance!*\n\n` +
          `• Processing 1 PDF costs 1 Point.\n` +
          `• Current Balance: ${pointsState.points} Points.\n\n` +
          `Please recharge your points to continue processing remaining bulk files.`
        );
        break;
      }

      if (!isBulk) {
        appendMessage('bot', `File ${fileIndex} is processing...\nFile: ${file.name}\n1 Point deducted.`);
      }

      const deductRes = deductPdfPoints(1, file.name);
      if (deductRes.success) {
        setPointsState(getBotPointsState());
      }

      setBatchItems((prev) =>
        prev.map((item) => item.id === currentItem.id ? { ...item, status: 'processing', progressStep: 'Extracting data...' } : item)
      );

      try {
        let extractedData: IdCardData;
        if (file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf')) {
          const res = await extractFromPdf(file);
          extractedData = res.data;
        } else {
          const res = await extractFromImage(file);
          extractedData = res.data;
        }

        if (extractedData.phoneNumber && extractedData.phoneNumber.includes('+251')) {
          extractedData.phoneNumber = extractedData.phoneNumber.replace(/\+251\s*/g, '0');
        }

        const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
        const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
        const effectiveTemplateConfig = activeColor ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor) : templateConfig;

        const renderOpts = {
          mirrorPrint: true, 
          format: 'jpeg' as const, 
          quality: 0.92, 
          photoColorMode: settings.photoColorMode || 'color', 
          brightness: 100 
        };

        const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
          renderOffscreenCard('front', extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
          renderOffscreenCard('back', extractedData, effectiveConfig, effectiveTemplateConfig, renderOpts),
        ]);

        const completedItem: TelegramFileProcessItem = {
          ...currentItem,
          status: 'completed',
          extractedData,
          mirroredFrontUrl,
          mirroredBackUrl,
        };

        (completedItem as any).photoBrightness = 0; 
        (completedItem as any).originalPhotoUrl = extractedData.photoUrl;
        (completedItem as any).photoTransparentUrl = extractedData.photoTransparentUrl || extractedData.photoUrl;

        setBatchItems((prev) => prev.map((item) => (item.id === currentItem.id ? completedItem : item)));

        appendMessage('bot', `ID #${fileIndex} processed: ${extractedData.fullNameEnglish || file.name}`, {
          itemPreview: { itemId: currentItem.id, fileIndex, fileName: file.name, extractedData, mirroredFrontUrl, mirroredBackUrl, brightness: 0 } as any,
        });

        successCount++;
      } catch (err: any) {
        failCount++;
        setBatchItems((prev) =>
          prev.map((item) => item.id === currentItem.id ? { ...item, status: 'error', error: err.message } : item)
        );
        appendMessage('bot', `❌ Error processing File ${fileIndex} (${file.name}): ${err.message || 'Could not extract ID data from file.'}`);
      }

      // Micro-yield between files for non-blocking browser performance on large bulk batches
      await new Promise((r) => setTimeout(r, 25));
    }

    setBulkProgress(null);
    setIsProcessingQueue(false);

    if (isBulk) {
      const remainingBal = getBotPointsState().points;
      appendMessage(
        'bot',
        `🎉 *Bulk Processing Finished!*\n\n` +
        `• ✅ *${successCount} of ${files.length} IDs* successfully converted!\n` +
        (failCount > 0 ? `• ❌ ${failCount} files failed\n` : '') +
        `• 💎 Remaining Points: *${remainingBal} Points*\n` +
        `• 📄 Total IDs ready in queue: *${startIndex + successCount}*\n\n` +
        `Tap *Done / Export* below to generate your 300 DPI A4 sheets (5 cards per sheet)!`,
        {
          buttons: [
            { label: '✅ Done / Export', action: 'done_batch', variant: 'primary' },
            { label: '🖼️ Photo Edit', action: 'open_photo_edit', variant: 'secondary' },
          ],
        }
      );
    }
  };

  const handleLoadBulkSampleBatch = async (count: number = 10) => {
    setIsAwaitingTransactionMsg(false);
    setIsBatchActive(true);
    setIsProcessingQueue(true);
    appendMessage('user', `Start Bulk Test (${count} Slips)`);
    appendMessage(
      'bot',
      `⚡ *Starting Bulk Test Batch: ${count} Sample Fayda ID Slips*\n\nSimulating automated queue processing with real Fayda IDs and live card compilation...`
    );

    const startIndex = batchItems.length;
    const samples = SAMPLE_BATCH_APPLICANTS;

    for (let i = 0; i < count; i++) {
      const data = { ...samples[i % samples.length] };
      const fileIndex = startIndex + i + 1;
      const fileName = `Fayda_Slip_${fileIndex}_${data.fullNameEnglish.replace(/\s+/g, '_')}.pdf`;

      setBulkProgress({
        current: i + 1,
        total: count,
        currentFileName: fileName,
        percent: Math.round(((i + 1) / count) * 100),
      });

      if (!hasSufficientPoints(1)) {
        appendMessage('bot', `⚠️ Points balance exhausted during bulk test.`);
        break;
      }

      deductPdfPoints(1, fileName);
      setPointsState(getBotPointsState());

      if (data.phoneNumber && data.phoneNumber.includes('+251')) {
        data.phoneNumber = data.phoneNumber.replace(/\+251\s*/g, '0');
      }

      const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
      const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
      const effectiveTemplateConfig = activeColor ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor) : templateConfig;

      const renderOpts = {
        mirrorPrint: true, 
        format: 'jpeg' as const, 
        quality: 0.92, 
        photoColorMode: settings.photoColorMode || 'color', 
        brightness: 100 
      };

      const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
        renderOffscreenCard('front', data, effectiveConfig, effectiveTemplateConfig, renderOpts),
        renderOffscreenCard('back', data, effectiveConfig, effectiveTemplateConfig, renderOpts),
      ]);

      const itemId = `bulk-sample-${Date.now()}-${i}`;
      const item: TelegramFileProcessItem = {
        id: itemId,
        fileIndex,
        fileName,
        fileSize: 145000,
        status: 'completed',
        extractedData: data,
        mirroredFrontUrl,
        mirroredBackUrl,
        timestamp: Date.now(),
      };
      
      (item as any).photoBrightness = 0;

      setBatchItems((prev) => [...prev, item]);
      
      appendMessage('bot', `ID #${fileIndex} processed: ${data.fullNameEnglish}`, {
        itemPreview: { itemId, fileIndex, fileName, extractedData: data, mirroredFrontUrl, mirroredBackUrl, brightness: 0 } as any,
      });

      await new Promise((r) => setTimeout(r, 180));
    }

    setBulkProgress(null);
    setIsProcessingQueue(false);

    appendMessage(
      'bot',
      `🎉 *Bulk Test Completed!* All ${count} cards processed into batch queue. Ready to export multi-page A4!`,
      {
        buttons: [
          { label: '✅ Done / Export', action: 'done_batch', variant: 'primary' },
          { label: '🖼️ Photo Edit', action: 'open_photo_edit', variant: 'secondary' },
        ],
      }
    );
  };

  const handleButtonClick = (action: string) => {
    if (action === 'start_batch') handleStartBatch();
    else if (action === 'done_batch') handleDoneBatch();
    else if (action === 'open_settings') { setIsSettingsOpen(true); }
    else if (action === 'show_payment') handleShowPaymentInfo();
    else if (action === 'open_photo_edit') openPhotoEditor();
    else if (action === 'test_bulk') handleLoadBulkSampleBatch(10);
    else if (action === 'show_templates' || action === 'choose_template') handleShowTemplateShowcase();
    else if (action === 'cancel_receipt') {
      setIsAwaitingTransactionMsg(false);
      appendMessage('bot', 'Payment upload cancelled.');
    }
    else if (action === 'open_points') setIsPointsModalOpen(true);
    else if (action.startsWith('select_template_')) handleSelectTemplate(parseInt(action.replace('select_template_', ''), 10));
    else if (action.startsWith('inspect_')) {
      const id = action.replace('inspect_', '');
      const found = batchItems.find((i) => i.id === id);
      if (found) { setInspectItem(found); setInspectMirrored(true); }
    }
  };

  const handleSendMessageString = (text: string) => {
    appendMessage('user', text);

    if (isAwaitingTransactionMsg) {
      setIsAwaitingTransactionMsg(false);
      appendMessage('bot', `Transaction message received successfully!\n\nYour transaction details have been forwarded to the admin for verification. Your points will be updated shortly after confirmation.`, {
        buttons: [{ label: 'Admin: Verify & Add Points', action: 'open_points', variant: 'primary' }]
      });
      return;
    }

    const lower = text.toLowerCase().trim();
    if (lower === '/start' || lower === 'start') {
      appendMessage('bot', 'Send your File or bulk PDF files.', {
        buttons: [
          { label: '🎨 Choose Template (Pictures)', action: 'show_templates', variant: 'primary' },
          { label: '⚡ Test 10 Sample PDFs', action: 'test_bulk', variant: 'secondary' },
          { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' },
        ],
      });
    } else if (lower === '/batch' || lower === 'batch') {
      handleStartBatch();
    } else if (lower === '/bulk' || lower === 'bulk' || lower === '/sample') {
      handleLoadBulkSampleBatch(10);
    } else if (
      lower === '/templates' ||
      lower === '/template' ||
      lower === 'template' ||
      lower === 'templates' ||
      lower === '/theme' ||
      lower === 'theme' ||
      lower === '/choose' ||
      lower === 'choose template'
    ) {
      handleShowTemplateShowcase();
    } else if (lower.startsWith('/template')) {
      const num = parseInt(lower.replace('/template', '').trim(), 10);
      if (!isNaN(num) && num >= 1 && num <= 12) {
        handleSelectTemplate(num);
      } else {
        handleShowTemplateShowcase();
      }
    } else if (lower.startsWith('/addpoints') || lower.startsWith('/add ') || lower === '/1000') {
      const parts = text.split(/\s+/);
      const amt = lower === '/1000' ? 1000 : parseInt(parts[1], 10);
      if (!isNaN(amt) && amt > 0) {
        const updated = addBotPoints(amt, 'Owner Direct Command');
        setPointsState(updated);
        appendMessage('system', `✅ Added +${amt} Points! New Balance: ${updated.points} Points (${updated.points * updated.pricePerPointBirr} Birr).`);
      }
    } else if (lower === '/done' || lower === 'done') {
      handleDoneBatch();
    } else if (lower === '/pay' || lower === 'pay' || lower === '/premium') {
      handleShowPaymentInfo();
    } else if (lower === '/balance' || lower === 'balance' || lower === '/points' || lower === 'points') {
      appendMessage('bot', `💎 *Your Points Balance:*\n\n• Current Balance: *${pointsState.points} Points*\n• Total Value: *${pointsState.points * pointsState.pricePerPointBirr} Birr (ETB)*\n• Processing Cost: *1 PDF Processing = 1 Point*\n\nNeed more points? Use /pay to recharge via Telebirr or /owner to manage.`);
    } else if (lower === '/owner' || lower === 'owner' || lower === '/admin') {
      setIsPointsModalOpen(true);
      appendMessage('bot', 'Opening Bot Owner Panel to verify payments and add points...');
    } else if (lower === '/settings' || lower === 'settings') {
      setIsSettingsOpen(true);
    } else if (lower === '/help' || lower === 'help') {
      appendMessage(
        'bot',
        `Available Bot Commands:\n\n` +
        `/start - Send single or bulk PDF files\n` +
        `/templates - View all template pictures & choose design\n` +
        `/batch - Start batch processing\n` +
        `/bulk - Test bulk batch with 10 sample slips\n` +
        `/done - Export compiled A4 sheet\n` +
        `/pay - Buy Points via Telebirr\n` +
        `/balance - View Points Balance\n` +
        `/addpoints 1000 - Add points to balance\n` +
        `/settings - Open layout & format settings\n` +
        `/help - Show this message`
      );
    } else {
      appendMessage('bot', `Command received: "${text}"\n\nUse /help to see available commands or click the buttons below.`);
    }
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    const text = inputMessage.trim();
    setInputMessage('');
    handleSendMessageString(text);
  };

  const completedCount = batchItems.filter((i) => i.status === 'completed').length;
  const editableItems = batchItems.filter(
    (i) => i.status === 'completed' && Boolean(i.extractedData?.photoUrl || (i.extractedData as any)?.photo)
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4.25rem)] bg-[#0e1621] text-slate-100 overflow-hidden font-sans">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />

      {/* Telegram Header */}
      <div className="h-16 bg-[#17212b] border-b border-slate-800 flex items-center justify-between px-3 sm:px-6 shadow-md z-10 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-sky-600 flex items-center justify-center text-white font-bold shrink-0">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-semibold text-white tracking-wide">Ethiopian Fayda ID Bot</h2>
              <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                OFFICIAL
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Template #{settings.activeTemplateNumber || 1} | {settings.mirrorPrintExport ? '🪞 Mirrored PVC' : '📄 Direct Print'} | {settings.photoColorMode === 'grayscale' ? '⬛ B&W' : '🎨 Color'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Templates with Pictures Button */}
          <button
            onClick={handleShowTemplateShowcase}
            className="px-2.5 py-1.5 rounded-xl bg-sky-600/25 hover:bg-sky-600/40 text-sky-300 border border-sky-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Display pictures of all templates and choose layout"
          >
            <Palette className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Templates</span>
            <span className="text-[10px] px-1 py-0.2 bg-sky-950/80 rounded font-mono text-sky-200">#{settings.activeTemplateNumber || 1}</span>
          </button>

          {/* Balance & Instant +1000 Button */}
          <div className="flex items-center gap-2 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-750">
            <div className="flex flex-col items-end text-[11px] sm:text-xs">
              <span className="text-slate-400 text-[10px]">Balance</span>
              <span className="font-bold text-amber-400">{pointsState.points} pts</span>
            </div>
            <button
              onClick={() => {
                const updated = addBotPoints(1000, 'Owner 1-Click Recharge');
                setPointsState(updated);
                appendMessage('system', `🎁 +1,000 Points Added! New Balance: ${updated.points} Points (${updated.points * updated.pricePerPointBirr} Birr).`);
              }}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
              title="Add 1,000 Points instantly for bulk files"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>+1,000</span>
            </button>
          </div>

          {completedCount > 0 && (
            <div className="hidden sm:flex flex-col items-end text-xs border-l border-slate-700 pl-3">
              <span className="text-slate-400">Batch Queue</span>
              <span className="font-bold text-emerald-400">{completedCount} processed</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Feed */}
      <div 
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-[#0e1621] to-[#0c121a] relative"
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(Array.from(e.dataTransfer.files));
          }
        }}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 z-30 bg-[#0e1621]/90 border-2 border-dashed border-sky-400 rounded-2xl m-3 flex flex-col items-center justify-center gap-3 backdrop-blur-xs pointer-events-none animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center animate-bounce">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div className="text-base font-bold text-white">Drop Bulk Fayda ID PDFs Here</div>
            <div className="text-xs text-sky-300">Drop single, 10, 20, or 50+ files to process automatically</div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end ml-auto' : 'items-start mr-auto'} max-w-3xl`}>
              <div className={`rounded-2xl px-4 py-3 shadow-md text-sm leading-relaxed max-w-full ${isUser ? 'bg-[#2b5278] text-white rounded-br-xs border border-sky-600/30' : 'bg-[#182533] text-slate-200 rounded-bl-xs border border-slate-700/50'}`}>
                {!msg.itemPreview && !msg.templateShowcase && (
                  <div className="whitespace-pre-wrap space-y-1">
                    {msg.text}
                  </div>
                )}

                {msg.templateShowcase && (
                  <div className="space-y-3">
                    <div className="whitespace-pre-wrap font-medium text-slate-200">
                      {msg.text}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                      {msg.templateShowcase.templates.map((tpl) => {
                        const isSelected = (settings.activeTemplateNumber || 1) === tpl.number;
                        const thumbs = templateThumbnails[tpl.number];
                        const frontPic = thumbs?.front || tpl.frontImageUrl;
                        const backPic = thumbs?.back || tpl.backImageUrl;

                        return (
                          <div
                            key={tpl.number}
                            onClick={() => handleSelectTemplate(tpl.number)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                              isSelected
                                ? 'bg-sky-950/60 border-sky-400 ring-2 ring-sky-500/40 shadow-xl'
                                : 'bg-[#111c26] border-slate-700/80 hover:border-slate-500 hover:bg-[#152330]'
                            }`}
                          >
                            <div>
                              {/* Live Pictures of Front and Back Card */}
                              <div className="grid grid-cols-2 gap-2 mb-2.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                                <div className="space-y-1 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Front</span>
                                  <div className="relative aspect-[1.586/1] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
                                    {frontPic ? (
                                      <img
                                        src={frontPic}
                                        alt={`Template #${tpl.number} Front`}
                                        className="w-full h-full object-contain"
                                      />
                                    ) : (
                                      <span className="text-[10px] text-slate-500 font-mono">Front Card</span>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1 text-center">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Back</span>
                                  <div className="relative aspect-[1.586/1] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
                                    {backPic ? (
                                      <img
                                        src={backPic}
                                        alt={`Template #${tpl.number} Back`}
                                        className="w-full h-full object-contain"
                                      />
                                    ) : (
                                      <span className="text-[10px] text-slate-500 font-mono">Back Card</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1 mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                                    style={{ backgroundColor: tpl.themeColor || '#059669' }}
                                  />
                                  <span className="font-bold text-sm text-white truncate">
                                    {tpl.name || `Template #${tpl.number}`}
                                  </span>
                                </div>
                                {isSelected ? (
                                  <span className="text-[10px] font-bold text-sky-400 bg-sky-900/60 px-2 py-0.5 rounded-full border border-sky-500/40 shrink-0">
                                    ✓ Active
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-400 group-hover:text-sky-300 transition">
                                    Click to choose
                                  </span>
                                )}
                              </div>

                              {tpl.description && (
                                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                  {tpl.description}
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectTemplate(tpl.number);
                              }}
                              className={`mt-3 w-full py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
                                isSelected
                                  ? 'bg-[#24A1DE] text-white shadow-sky-500/20'
                                  : 'bg-slate-800 hover:bg-[#24A1DE] hover:text-white text-slate-200 border border-slate-700'
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Active Layout Template</span>
                                </>
                              ) : (
                                <span>Choose Template #{tpl.number}</span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {msg.itemPreview && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-700/60">
                      <span className="font-bold text-sm text-emerald-400">ID #{(msg.itemPreview as any).fileIndex}</span>
                      <div className="flex items-center gap-2">
                        {typeof (msg.itemPreview as any).brightness === 'number' && (msg.itemPreview as any).brightness !== 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                            Brightness: {(msg.itemPreview as any).brightness > 0 ? `+${(msg.itemPreview as any).brightness}` : (msg.itemPreview as any).brightness}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-medium">Mirrored Preview</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {msg.itemPreview.mirroredFrontUrl && (<div className="bg-slate-950 p-1 rounded border border-slate-700"><img src={msg.itemPreview.mirroredFrontUrl} alt="Front" className="w-full h-auto rounded" /></div>)}
                      {msg.itemPreview.mirroredBackUrl && (<div className="bg-slate-950 p-1 rounded border border-slate-700"><img src={msg.itemPreview.mirroredBackUrl} alt="Back" className="w-full h-auto rounded" /></div>)}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400"><span>{msg.timestamp}</span>{isUser && <CheckCheck className="w-3 h-3 text-sky-400" />}</div>
              </div>
              
              {msg.buttons && msg.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 max-w-full">
                  {msg.buttons.map((btn, btnIdx) => {
                    let btnColor = 'bg-[#24A1DE]/20 hover:bg-[#24A1DE]/30 text-sky-300 border-sky-500/30';
                    if (btn.variant === 'primary') btnColor = 'bg-[#24A1DE] hover:bg-[#2090c7] text-white border-[#24A1DE]';
                    else if (btn.variant === 'secondary') btnColor = 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600';
                    return (<button key={btnIdx} onClick={() => handleButtonClick(btn.action)} className={`text-xs px-3 py-1.5 rounded border transition cursor-pointer font-medium ${btnColor}`}>{btn.label}</button>);
                  })}
                </div>
              )}
            </div>
          );
        })}

        {isProcessingQueue && (
          <div className="flex items-start gap-2 max-w-md mr-auto">
            <div className="bg-[#182533] text-slate-200 rounded-2xl rounded-bl-xs px-4 py-3 border border-slate-700/50 text-sm">Processing files in batch...</div>
          </div>
        )}
        {isExportingBatch && (
          <div className="flex items-start gap-2 max-w-md mr-auto">
            <div className="bg-slate-800 text-slate-200 rounded-2xl px-4 py-3 border border-slate-700 text-sm">Generating Document...<br/><span className="text-xs text-slate-400">{exportProgressText}</span></div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* CLEANED BOTTOM MENU & KEYBOARD AREA */}
      <div className="shrink-0 flex flex-col bg-[#17212b]">
        {/* Live Bulk Processing Progress Bar */}
        {bulkProgress && (
          <div className="bg-[#111c26] border-t border-sky-500/40 px-4 py-2.5 flex flex-col gap-1.5 shadow-lg animate-in fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                Processing Bulk Files: {bulkProgress.current} / {bulkProgress.total}
              </span>
              <span className="font-bold text-sky-400 font-mono">{bulkProgress.percent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full transition-all duration-150" 
                style={{ width: `${bulkProgress.percent}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 truncate font-mono">
              📄 {bulkProgress.currentFileName}
            </div>
          </div>
        )}

        {/* Text Input Row */}
        <div className="p-2 sm:p-3 flex items-center gap-2 border-t border-slate-800/80">
          <button onClick={() => fileInputRef.current?.click()} className="p-2 sm:p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition" title="Attach single or bulk PDF files"><Paperclip className="w-5 h-5" /></button>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
            placeholder={isAwaitingTransactionMsg ? "Paste Telebirr SMS here..." : "Message / command..."}
            className="flex-1 bg-[#242f3d] text-white placeholder-slate-400 text-sm px-4 py-2.5 rounded-full border border-transparent focus:border-sky-500/50 focus:outline-none transition"
          />
          <button onClick={handleSendMessage} disabled={!inputMessage.trim()} className={`p-2.5 rounded-full transition ${inputMessage.trim() ? 'bg-[#24A1DE] text-white hover:bg-[#2090c7]' : 'text-slate-500 bg-slate-800'}`}><Send className="w-5 h-5" /></button>
        </div>

        {/* Cleaned Menu */}
        <div className="p-2 grid grid-cols-3 sm:grid-cols-6 gap-2 bg-[#0e1621] border-t border-slate-800/50">
          <button onClick={() => handleSendMessageString('/start')} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded transition">Start</button>
          <button onClick={handleShowTemplateShowcase} className="py-2.5 bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-500/40 text-xs font-bold rounded transition flex items-center justify-center gap-1 shadow-xs"><Palette className="w-3.5 h-3.5 text-sky-400"/> Templates</button>
          <button onClick={handleDoneBatch} className="py-2.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-semibold rounded transition">Done / Export</button>
          <button onClick={handleShowPaymentInfo} className="py-2.5 bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-semibold rounded transition">Buy Point</button>
          <button onClick={openPhotoEditor} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded transition flex items-center justify-center gap-1"><ImageIcon className="w-3.5 h-3.5"/> Photo Edit</button>
          <button onClick={() => setIsSettingsOpen(true)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded transition flex items-center justify-center gap-1"><Settings className="w-3.5 h-3.5"/> Settings</button>
        </div>
      </div>

      {/* Individual Photo Editor Modal */}
      {isPhotoEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#17212b] border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0e1621]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Individual Photo Brightness Editor
                  </h3>
                  <p className="text-xs text-slate-400">
                    Adjust brightness per photo from processed PDFs or apply a batch boost
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPhotoEditorOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Batch Brightness Bar */}
            {editableItems.length > 0 && (
              <div className="px-4 sm:px-6 py-2.5 bg-slate-900 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Batch Boost All ({editableItems.length} IDs):</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSettleNoBackground()}
                    className="px-2.5 py-1 rounded bg-teal-500/25 hover:bg-teal-500/40 text-teal-200 border border-teal-500/40 text-xs font-semibold cursor-pointer transition flex items-center gap-1"
                    title="Permanently remove background and settle 100% transparent PNG across all cards"
                  >
                    <span>✂️ Settle No BG (All)</span>
                  </button>
                  <button
                    onClick={() => applyBrightnessToAll(15)}
                    className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/40 text-xs font-semibold cursor-pointer transition"
                  >
                    +15% All
                  </button>
                  <button
                    onClick={() => applyBrightnessToAll(30)}
                    className="px-2.5 py-1 rounded bg-amber-500/30 hover:bg-amber-500/45 text-amber-200 border border-amber-500/50 text-xs font-semibold cursor-pointer transition"
                  >
                    +30% All (High-Key)
                  </button>
                  <button
                    onClick={() => applyBrightnessToAll(-15)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer transition"
                  >
                    -15% All
                  </button>
                  <button
                    onClick={() => applyBrightnessToAll(0)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs cursor-pointer transition"
                  >
                    Reset All (0%)
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950">
              {editableItems.length === 0 ? (
                 <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                   <ImageIcon className="w-10 h-10 text-slate-600" />
                   <span>No photos available in current batch.</span>
                   <span className="text-xs text-slate-500">Upload or process PDF slips to adjust portrait photos.</span>
                 </div>
              ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   {editableItems.map(item => {
                      const bOffset = draftBrightnessMap[item.id] ?? (item as any).photoBrightness ?? 0;
                      const photoSource = item.extractedData?.photoUrl || (item.extractedData as any)?.photo || '';
                      const applicantName = item.extractedData?.fullNameEnglish || item.extractedData?.fullNameAmharic || `Applicant #${item.fileIndex}`;

                      return (
                        <div key={item.id} className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-col shadow-lg">
                           <div className="w-full flex justify-between items-center mb-2.5">
                             <div className="truncate mr-2">
                               <span className="text-xs font-bold text-white block truncate">
                                 ID #{item.fileIndex}: {applicantName}
                               </span>
                               {item.extractedData?.fan && (
                                 <span className="text-[10px] text-slate-400 font-mono block">
                                   FAN: {item.extractedData.fan}
                                 </span>
                               )}
                             </div>
                             <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
                               bOffset > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                               bOffset < 0 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                               'bg-slate-800 text-slate-400'
                             }`}>
                                {bOffset > 0 ? `+${bOffset}%` : `${bOffset}%`}
                             </span>
                           </div>
                           
                           {/* Centered Photo Preview with Transparency Checkerboard */}
                           <div 
                             className="border border-slate-800 rounded-lg overflow-hidden mb-2.5 h-44 w-full flex items-center justify-center relative"
                             style={{
                               backgroundImage: 'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                               backgroundSize: '16px 16px',
                               backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                               backgroundColor: '#0f172a',
                             }}
                           >
                              <img 
                                src={photoSource} 
                                alt={`Portrait ${item.fileIndex}`} 
                                className="h-full w-auto max-w-full object-contain"
                                style={{ filter: `brightness(${100 + bOffset}%) contrast(${100 + Math.round(bOffset * 0.12)}%)` }}
                              />
                              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                                <span className="text-[9px] bg-slate-950/85 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono shadow-xs">
                                  ✓ No Background
                                </span>
                              </div>
                           </div>

                           {/* 1-Click Settle No Background Button */}
                           <button
                             onClick={() => handleSettleNoBackground(item.id)}
                             className="w-full py-1 mb-2.5 rounded text-[11px] font-semibold bg-teal-500/20 hover:bg-teal-500/35 text-teal-300 border border-teal-500/35 transition cursor-pointer flex items-center justify-center gap-1"
                             title="Permanently remove background for this applicant"
                           >
                             <span>✂️ Settle No Background (Transparent)</span>
                           </button>

                           {/* Per-Photo Quick Preset Buttons */}
                           <div className="flex items-center justify-between gap-1 mb-2">
                             {[-15, 0, 15, 30, 50].map((presetVal) => (
                               <button
                                 key={presetVal}
                                 onClick={() => setAbsoluteBrightness(item.id, presetVal)}
                                 className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer flex-1 text-center ${
                                   bOffset === presetVal
                                     ? 'bg-amber-500 text-slate-950 font-bold'
                                     : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                 }`}
                               >
                                 {presetVal > 0 ? `+${presetVal}%` : presetVal === 0 ? '0%' : `${presetVal}%`}
                               </button>
                             ))}
                           </div>

                           {/* Smooth HTML5 Range Slider */}
                           <div className="w-full px-1">
                             <input 
                               type="range" 
                               min="-100" 
                               max="100" 
                               value={bOffset}
                               onChange={(e) => setAbsoluteBrightness(item.id, Number(e.target.value))}
                               className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 outline-none"
                             />
                             <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                               <span>-100% Dark</span>
                               <span>0% Normal</span>
                               <span>+100% Bright</span>
                             </div>
                           </div>
                        </div>
                      );
                   })}
                 </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-[#0e1621] flex items-center justify-between">
              <button
                onClick={() => setIsPhotoEditorOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button 
                onClick={handleApplyPhotoEdits} 
                disabled={editableItems.length === 0}
                className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs sm:text-sm font-bold shadow-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save All Edits ({editableItems.length} IDs)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flat Slide-out Settings Panel */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#17212b] border-l border-slate-800 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200">
            
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Settings className="w-5 h-5 text-sky-400" />
                Bot Export Settings
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-8">
              
              {/* 1. Templates Options (Templates 1 to 6 with pictures) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300">1. Select ID Template</h4>
                    <p className="text-xs text-slate-400">Choose design layout with live front & back picture preview</p>
                  </div>
                  <span className="text-[11px] font-bold text-sky-400 bg-sky-900/40 px-2 py-0.5 rounded border border-sky-500/30">
                    Active: Template #{settings.activeTemplateNumber || 1}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {availableBotTemplates.map((tpl) => {
                    const isSelected = (settings.activeTemplateNumber || 1) === tpl.number;
                    const thumbs = templateThumbnails[tpl.number];
                    const frontPic = thumbs?.front || tpl.frontImageUrl;
                    const backPic = thumbs?.back || tpl.backImageUrl;

                    return (
                      <div
                        key={tpl.number}
                        onClick={() => handleSelectTemplate(tpl.number)}
                        className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer group ${
                          isSelected
                            ? 'border-sky-500 bg-sky-950/50 text-sky-300 font-bold ring-2 ring-sky-500/40 shadow-lg'
                            : 'border-slate-700 bg-slate-800/90 text-slate-300 hover:border-slate-500 hover:bg-slate-750'
                        }`}
                      >
                        <div>
                          {/* Front and Back Picture Preview */}
                          <div className="grid grid-cols-2 gap-1.5 mb-2.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                            <div className="space-y-0.5 text-center">
                              <span className="text-[8px] font-semibold text-slate-400 uppercase">Front</span>
                              <div className="relative aspect-[1.586/1] rounded-md overflow-hidden bg-slate-900 flex items-center justify-center">
                                {frontPic ? (
                                  <img
                                    src={frontPic}
                                    alt={`Template #${tpl.number} Front`}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[9px] text-slate-500 font-mono">Front</span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-0.5 text-center">
                              <span className="text-[8px] font-semibold text-slate-400 uppercase">Back</span>
                              <div className="relative aspect-[1.586/1] rounded-md overflow-hidden bg-slate-900 flex items-center justify-center">
                                {backPic ? (
                                  <img
                                    src={backPic}
                                    alt={`Template #${tpl.number} Back`}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[9px] text-slate-500 font-mono">Back</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: tpl.themeColor || '#059669' }}
                              />
                              <span className="font-semibold text-xs text-white truncate">
                                {tpl.name || `Template #${tpl.number}`}
                              </span>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />}
                          </div>

                          {tpl.description && (
                            <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                              {tpl.description}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          className={`mt-2.5 py-1.5 px-2 rounded-lg text-[11px] font-bold w-full text-center transition ${
                            isSelected
                              ? 'bg-sky-500 text-white'
                              : 'bg-slate-700 text-slate-200 group-hover:bg-sky-600 group-hover:text-white'
                          }`}
                        >
                          {isSelected ? '✓ Active Template' : `Select Template #${tpl.number}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. File Type Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300">2. Export Format</h4>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'a4_pdf_5_per_page', label: 'A4 PDF (5 Cards / Sheet)', desc: 'Official print sheet with standard alignment' }, 
                    { id: 'a4_png_5_per_page', label: 'High-Res PNG (5 Cards / Sheet)', desc: 'Lossless raster image for plastic card printers' }, 
                    { id: 'hd_zip_archive', label: 'ZIP Archive (Individual HD Cards)', desc: 'Individual high-res front and back image files' }
                  ].map((fmt) => (
                    <button 
                      key={fmt.id} 
                      onClick={() => updatePermanentSettings({ exportFileType: fmt.id as TelegramExportFileType })} 
                      className={`p-3 text-xs rounded-xl border text-left flex justify-between items-center transition cursor-pointer ${
                        settings.exportFileType === fmt.id
                          ? 'border-sky-500 bg-sky-900/30 text-sky-300 font-bold ring-1 ring-sky-500/30'
                          : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-750'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-white">{fmt.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{fmt.desc}</div>
                      </div>
                      {settings.exportFileType === fmt.id && <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Mirror Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300">3. Print Layout (Mirroring)</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => updatePermanentSettings({ mirrorPrintExport: false })} 
                    className={`p-3 text-xs rounded-xl border text-center transition cursor-pointer ${
                      !settings.mirrorPrintExport
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300 font-bold'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-750'
                    }`}
                  >
                    📄 Standard (Non-Mirror)
                  </button>
                  <button 
                    onClick={() => updatePermanentSettings({ mirrorPrintExport: true })} 
                    className={`p-3 text-xs rounded-xl border text-center transition cursor-pointer ${
                      settings.mirrorPrintExport
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300 font-bold'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-750'
                    }`}
                  >
                    🪞 Mirrored (PVC Print)
                  </button>
                </div>
              </div>

              {/* 4. Color Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300">4. Photo Color Mode</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => updatePermanentSettings({ photoColorMode: 'color' })} 
                    className={`p-3 text-xs rounded-xl border text-center transition cursor-pointer ${
                      settings.photoColorMode === 'color' || !settings.photoColorMode
                        ? 'border-purple-500 bg-purple-900/30 text-purple-300 font-bold'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-750'
                    }`}
                  >
                    🎨 Full Color
                  </button>
                  <button 
                    onClick={() => updatePermanentSettings({ photoColorMode: 'grayscale' })} 
                    className={`p-3 text-xs rounded-xl border text-center transition cursor-pointer ${
                      settings.photoColorMode === 'grayscale'
                        ? 'border-purple-500 bg-purple-900/30 text-purple-300 font-bold'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-750'
                    }`}
                  >
                    ⬛ B&W (Laser Print)
                  </button>
                </div>
              </div>

            </div>
            
            <div className="p-4 border-t border-slate-800 bg-[#0e1621] flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="w-full sm:w-auto px-6 py-3 rounded-lg bg-[#24A1DE] hover:bg-[#2090c7] text-white text-sm font-bold shadow-lg transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Item Mirrored Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#17212b] border border-slate-700 rounded w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">ID #{inspectItem.fileIndex} Verification</h3>
              <button onClick={() => setInspectItem(null)} className="p-1 hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-1">Front Card</div>
                  <img src={inspectItem.mirroredFrontUrl} alt="Front" className="w-full h-auto bg-slate-950 p-2 rounded border border-slate-700" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-1">Back Card</div>
                  <img src={inspectItem.mirroredBackUrl} alt="Back" className="w-full h-auto bg-slate-950 p-2 rounded border border-slate-700" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end"><button onClick={() => setInspectItem(null)} className="px-4 py-2 rounded bg-slate-800 text-white text-xs font-semibold">Close</button></div>
          </div>
        </div>
      )}

      {/* Bot Owner Admin Modal */}
      {isPointsModalOpen && (
        <BotPointsOwnerModal
          isOpen={isPointsModalOpen}
          pointsState={pointsState}
          onClose={() => setIsPointsModalOpen(false)}
          onPointsUpdated={(state) => {
             setPointsState(state);
             appendMessage('system', `Admin updated points. New Balance: ${state.points} Points (${state.points * state.pricePerPointBirr} Birr).`);
          }}
          onPointUpdate={(state) => {
             setPointsState(state);
             appendMessage('system', `Admin updated points. New Balance: ${state.points} Points (${state.points * state.pricePerPointBirr} Birr).`);
          }}
        />
      )}
    </div>
  );
};