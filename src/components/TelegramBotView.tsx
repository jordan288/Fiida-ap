import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Settings,
  Play,
  CheckCircle2,
  Layers,
  Palette,
  FileCode,
  Download,
  RotateCcw,
  Maximize2,
  FileText,
  Sparkles,
  UploadCloud,
  Check,
  CheckCheck,
  Bot,
  RefreshCw,
  Eye,
  Sliders,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Copy,
  Printer,
  X,
  FlipHorizontal,
  Crosshair,
  Coins,
  Plus,
  Minus,
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
import { renderOffscreenCard, exportBatchToA4Pdf, exportBatchToA4Png, exportBatchToZipArchive } from '../utils/batchExporter';
import { SAMPLE_ID_DATA, SAMPLE_FEMALE_DATA, SAMPLE_BATCH_APPLICANTS } from '../data/defaultData';
import { formatCardDualDate } from '../utils/ethiopianCalendar';
import { PdfSlipExtractor } from './PdfSlipExtractor';
import { getEffectiveRegions, savePermanentRegions, clearPermanentRegions } from '../utils/pdfRegionExtractor';
import { BotPointsOwnerModal } from './BotPointsOwnerModal';
import {
  BotPointsState,
  getBotPointsState,
  hasSufficientPoints,
  deductPdfPoints,
  addBotPoints,
  minusBotPoints,
  PRICE_PER_POINT_BIRR,
  POINTS_PER_PDF,
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
  onOpenInStudio,
}) => {
  // Permanent Bot Settings
  const [settings, setSettings] = useState<TelegramBotPermanentSettings>(() => loadTelegramBotSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'templates' | 'photoColor' | 'filetype' | 'mapper' | 'server'>('templates');

  // PDF Position Mapper State
  const [isMapperOpen, setIsMapperOpen] = useState(false);
  const [mapperSlipData, setMapperSlipData] = useState<IdCardData>(SAMPLE_ID_DATA);

  // Points Area & Owner Admin State (1 PDF = 1 Point, 1 Point = 7 Birr)
  const [pointsState, setPointsState] = useState<BotPointsState>(() => getBotPointsState());
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

  // Server Bot Status
  const [serverStatus, setServerStatus] = useState<{
    isPolling: boolean;
    botUsername?: string;
    hasToken: boolean;
  }>({ isPolling: false, hasToken: false });
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [tokenInput, setTokenInput] = useState(settings.botToken || '');
  const [tokenTestMessage, setTokenTestMessage] = useState<string | null>(null);

  // Batch Session State
  const [isBatchActive, setIsBatchActive] = useState(false);
  const [batchItems, setBatchItems] = useState<TelegramFileProcessItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');

  // Inspection modal
  const [inspectItem, setInspectItem] = useState<TelegramFileProcessItem | null>(null);
  const [inspectMirrored, setInspectMirrored] = useState(true);

  // Chat message stream
  const [messages, setMessages] = useState<TelegramBotMessage[]>([
    {
      id: 'welcome-1',
      sender: 'bot',
      text:
        `👋 *Welcome to the Ethiopian Digital ID Card Studio Bot!* 🇪🇹\n\n` +
        `This bot turns multiple Fayda ID PDF slips & photos into clean, print-ready *A4 5/page* layout sheets.\n\n` +
        `⚙️ *Permanent Settings Configured:*\n` +
        `• 📑 *Active Template:* Template #${settings.activeTemplateNumber}\n` +
        `• 📷 *Photo Color:* ${settings.photoColorMode === 'grayscale' ? '⬛ B&W (Grayscale / Laser)' : '🎨 Colored (Full Color)'}\n` +
        `• 📄 *Export File Type:* ${settings.exportFileType === 'a4_pdf_5_per_page' ? 'A4 PDF (5 Cards Per Page)' : settings.exportFileType}\n\n` +
        `👉 Tap *▶️ Start Multi-File Batch* to begin uploading!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      buttons: [
        { label: '▶️ Start Multi-File Batch', action: 'start_batch', variant: 'primary' },
        { label: '⚙️ Settings & Templates', action: 'open_settings', variant: 'secondary' },
        { label: '⚡ Load Sample Batch (3 Slips)', action: 'load_sample_batch', variant: 'secondary' },
      ],
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessingQueue]);

  // Check server status on mount
  useEffect(() => {
    fetchServerStatus();
  }, []);

  const fetchServerStatus = async () => {
    setIsCheckingServer(true);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus({
          isPolling: data.status?.isPolling || false,
          botUsername: data.status?.botUsername || data.config?.botUsername,
          hasToken: data.status?.hasToken || false,
        });
        if (typeof data.status?.pointsBalance === 'number') {
          setPointsState((prev) => ({
            ...prev,
            points: data.status.pointsBalance,
          }));
        }
      }
    } catch {}
    setIsCheckingServer(false);
  };

  // Sync settings permanently
  const updatePermanentSettings = (partial: Partial<TelegramBotPermanentSettings>) => {
    const updated = saveTelegramBotSettings(partial);
    setSettings(updated);

    // Apply color scheme if changed
    if (partial.colorSchemeId) {
      const scheme = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === partial.colorSchemeId);
      if (scheme) {
        setConfig((prev) => applyTelegramColorSchemeToCoordinates(prev, scheme));
        setTemplateConfig((prev) => applyTelegramColorSchemeToTemplateConfig(prev, scheme));
      }
    }

    // Apply template number if changed
    if (partial.activeTemplateNumber && partial.activeTemplateNumber !== activeTemplateNumber) {
      onSelectTemplateNumber(partial.activeTemplateNumber);
    }
  };

  // Connect & Save Token to Server
  const handleSaveAndConnectToken = async () => {
    if (!tokenInput.trim()) return;
    setTokenTestMessage('Testing token with Telegram API...');
    try {
      const testRes = await fetch('/api/telegram/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const testData = await testRes.json();
      if (!testRes.ok || !testData.ok) {
        throw new Error(testData.error || 'Connection failed');
      }

      // Save token permanently
      updatePermanentSettings({ botToken: tokenInput.trim(), botUsername: testData.bot?.username });

      // Start polling on server
      const pollRes = await fetch('/api/telegram/start-polling', { method: 'POST' });
      await pollRes.json();

      setTokenTestMessage(` Connected to @${testData.bot?.username}! Polling active.`);
      fetchServerStatus();
    } catch (err: any) {
      setTokenTestMessage(`❌ Error: ${err.message}`);
    }
  };

  const handleStopPolling = async () => {
    try {
      await fetch('/api/telegram/stop-polling', { method: 'POST' });
      fetchServerStatus();
      setTokenTestMessage('Bot polling stopped on server.');
    } catch {}
  };

  const handleSelectTemplate = (num: number) => {
    onSelectTemplateNumber(num);
    updatePermanentSettings({ activeTemplateNumber: num });
    setIsTemplateMenuOpen(false);
    appendMessage('system', `📋 Active template set to Template ${num}`);
  };

  const handleQuickAddPoint = (amount: number = 1) => {
    const updated = addBotPoints(amount, 'Quick Owner Point Recharge');
    setPointsState(updated);
    fetch('/api/telegram/points/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', amount }),
    }).catch(() => {});
    appendMessage(
      'system',
      `✅ Owner Added +${amount} Point (+${amount * updated.pricePerPointBirr} Birr). New Balance: ${updated.points} Points (${updated.points * updated.pricePerPointBirr} Birr)`
    );
  };

  const handleQuickMinusPoint = (amount: number = 1) => {
    const updated = minusBotPoints(amount, 'Quick Owner Point Deduction');
    setPointsState(updated);
    fetch('/api/telegram/points/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'minus', amount }),
    }).catch(() => {});
    appendMessage(
      'system',
      `🔻 Owner Deducted -${amount} Point (-${amount * updated.pricePerPointBirr} Birr). New Balance: ${updated.points} Points (${updated.points * updated.pricePerPointBirr} Birr)`
    );
  };

  // Append message to chat
  const appendMessage = (
    sender: 'bot' | 'user' | 'system',
    text: string,
    options?: {
      buttons?: TelegramBotMessage['buttons'];
      itemPreview?: TelegramBotMessage['itemPreview'];
      exportedDocument?: TelegramBotMessage['exportedDocument'];
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
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  // Start Multi-File Batch
  const handleStartBatch = () => {
    setIsBatchActive(true);
    setBatchItems([]);
    appendMessage('user', '▶️ Start Multi-File Batch');
    appendMessage(
      'bot',
      `🟢 *Multi-File Batch Mode Started!*\n\n` +
      `📂 Please send your PDF Fayda ID slips or photos now.\n` +
      `• Click the *📎 Upload Files* button below or drag & drop files here.\n` +
      `• You can select multiple files at once.\n\n` +
      `As each file arrives, you will see:\n` +
      `1️⃣ *File X is processing...*\n` +
      `2️⃣ *Immediate Mirrored Verification Preview* to check name, photo, DOB & sex!\n\n` +
      `When finished, press *✅ Done / Export A4 5/Page*.`,
      {
        buttons: [
          { label: '📎 Upload PDF Slips / Photos', action: 'trigger_file_upload', variant: 'primary' },
          { label: '⚡ Load Sample Batch (3 Slips)', action: 'load_sample_batch', variant: 'secondary' },
          { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' },
        ],
      }
    );
  };

  // Done Batch Export
  const handleDoneBatch = async () => {
    const completedItems = batchItems.filter((i) => i.status === 'completed' && i.extractedData);
    if (completedItems.length === 0) {
      appendMessage(
        'bot',
        `⚠️ *No completed files in current batch yet.*\n\n` +
        `Please upload at least 1 PDF slip or click *⚡ Load Sample Batch* to test!`,
        {
          buttons: [
            { label: '📎 Upload PDF Slips', action: 'trigger_file_upload', variant: 'primary' },
            { label: '⚡ Load Sample Batch', action: 'load_sample_batch', variant: 'secondary' },
          ],
        }
      );
      return;
    }

    setIsExportingBatch(true);
    setExportProgressText('Preparing 300 DPI A4 5/page sheet...');
    appendMessage('user', '✅ Done / Export A4 5/Page');
    appendMessage(
      'bot',
      `⏳ *Compiling A4 5/Page Sheet for ${completedItems.length} IDs...*\n` +
      `📑 *Template:* #${settings.activeTemplateNumber}\n` +
      `📷 *Photo Color:* ${settings.photoColorMode === 'grayscale' ? '⬛ B&W (Grayscale / Laser)' : '🎨 Colored (Full Color)'}\n` +
      `📄 *Target Format:* ${settings.exportFileType.toUpperCase()}\n` +
      `🖨️ *Layout:* 5 cards per page (paired Front & Back at 300 DPI)`
    );

    try {
      // Map completed items to BatchQueueItem structure with photoColorMode
      const photoColorMode = settings.photoColorMode || 'color';
      const queueItems: BatchQueueItem[] = completedItems.map((item, idx) => ({
        id: item.id,
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileType: 'application/pdf',
        extractedData: {
          ...item.extractedData!,
          photoColorMode,
        },
        status: 'ready',
        selected: true,
        progress: 100,
        createdAt: item.timestamp,
        order: idx,
      }));

      const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
      const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
      const effectiveTemplateConfig = activeColor
        ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor)
        : templateConfig;

      const fileType = settings.exportFileType;
      let downloadUrl = '';
      let exportedFileName = `Fayda_Batch_A4_5PerPage_${Date.now()}`;

      if (fileType === 'a4_png_5_per_page') {
        exportedFileName += '.png';
        await exportBatchToA4Png(
          queueItems,
          effectiveConfig,
          effectiveTemplateConfig,
          {
            layout: '5_per_page_paired',
            mirrorPrint: settings.mirrorPrintExport,
            photoColorMode,
          },
          (cur, total, msg) => setExportProgressText(`${msg} (${cur}/${total})`)
        );
      } else if (fileType === 'hd_zip_archive') {
        exportedFileName += '.zip';
        await exportBatchToZipArchive(
          queueItems,
          effectiveConfig,
          effectiveTemplateConfig,
          {
            format: 'zip_archive',
            mirrorPrint: settings.mirrorPrintExport,
            photoColorMode,
          },
          (cur, total, msg) => setExportProgressText(`${msg} (${cur}/${total})`)
        );
      } else {
        // Default: 'a4_pdf_5_per_page' or 'mirrored_transfer_a4'
        exportedFileName += '.pdf';
        const isMirror = fileType === 'mirrored_transfer_a4' || settings.mirrorPrintExport;
        await exportBatchToA4Pdf(
          queueItems,
          effectiveConfig,
          effectiveTemplateConfig,
          {
            layout: '5_per_page_paired',
            mirrorPrint: isMirror,
            photoColorMode,
          },
          (cur, total, msg) => setExportProgressText(`${msg} (${cur}/${total})`)
        );
      }

      appendMessage(
        'bot',
        `🎉 *A4 5/Page Export Successful!*\n\n` +
        `📦 *Total Cards Printed:* ${completedItems.length} IDs\n` +
        `📑 *Layout:* 5 rows × 2 columns (Paired Front & Back)\n` +
        `📐 *Format:* ${settings.exportFileType.toUpperCase()}\n` +
        `🖨️ *DPI:* 300 DPI High-Resolution Print Ready\n\n` +
        `Your document has been downloaded to your device!`,
        {
          buttons: [
            { label: '▶️ Start New Batch', action: 'start_batch', variant: 'primary' },
            { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' },
          ],
          exportedDocument: {
            fileName: exportedFileName,
            fileUrl: downloadUrl,
            fileType: settings.exportFileType,
            itemCount: completedItems.length,
          },
        }
      );
    } catch (err: any) {
      appendMessage('bot', `❌ *Export Failed:* ${err.message || 'Unknown error during export'}`);
    } finally {
      setIsExportingBatch(false);
      setExportProgressText('');
    }
  };

  // Process incoming files in sequence
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsBatchActive(true);
    setIsProcessingQueue(true);

    const startIndex = batchItems.length;
    const newItems: TelegramFileProcessItem[] = files.map((file, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      fileIndex: startIndex + idx + 1,
      fileName: file.name,
      fileSize: file.size,
      status: 'queued',
      timestamp: Date.now(),
    }));

    setBatchItems((prev) => [...prev, ...newItems]);

    // Announce received files
    appendMessage(
      'user',
      `📎 Uploaded ${files.length} file${files.length > 1 ? 's' : ''}: ${files.map((f) => f.name).join(', ')}`
    );

    // Process each file sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const currentItem = newItems[i];
      const fileIndex = currentItem.fileIndex;

      // 1. Point Check: 1 PDF processing costs 1 point (7 Birr)
      if (!hasSufficientPoints(1)) {
        appendMessage(
          'bot',
          `❌ *Insufficient Points Balance!*\n\n` +
          `• Processing 1 PDF costs *1 Point* (${pointsState.pricePerPointBirr} Birr)\n` +
          `• Current Balance: *${pointsState.points} Points* (${pointsState.points * pointsState.pricePerPointBirr} Birr)\n\n` +
          `Please contact the bot owner or use *👑 Owner (+/- Points)* below to recharge points.`,
          {
            buttons: [
              { label: '👑 Owner (+/- Points)', action: 'open_points', variant: 'primary' },
              { label: '⚙️ Settings', action: 'open_settings', variant: 'secondary' },
            ],
          }
        );
        setIsPointsModalOpen(true);
        break;
      }

      // 1. Prompt Requirement: "make the bot display the processing number of id.... example (file 1 is processing , file 2 is processing etc)"
      appendMessage(
        'bot',
        `⏳ *File ${fileIndex} is processing...*\n` +
        `📄 File: \`${file.name}\` (${(file.size / 1024).toFixed(1)} KB)\n` +
        `💎 1 Point deducted (Remaining: *${pointsState.points - 1} Points* = ${(pointsState.points - 1) * pointsState.pricePerPointBirr} Birr)\n` +
        `🔍 Extracting portrait photo, FAN barcode, QR payload, and dual calendar dates...`
      );

      // Deduct 1 point
      const deductRes = deductPdfPoints(1, file.name);
      if (deductRes.success) {
        setPointsState(getBotPointsState());
      }

      // Update state for this item
      setBatchItems((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, status: 'processing', progressStep: 'Extracting data...' } : item
        )
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

        // Render Mirrored Preview Cards
        // Prompt Requirement: "when 1 id process is finished display that id in mirrored to check name and other things"
        const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
        const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
        const effectiveTemplateConfig = activeColor
          ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor)
          : templateConfig;

        // Render Mirrored Front & Back cards
        const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
          renderOffscreenCard('front', extractedData, effectiveConfig, effectiveTemplateConfig, {
            mirrorPrint: true,
            format: 'jpeg',
            quality: 0.92,
            photoColorMode: settings.photoColorMode || 'color',
          }),
          renderOffscreenCard('back', extractedData, effectiveConfig, effectiveTemplateConfig, {
            mirrorPrint: true,
            format: 'jpeg',
            quality: 0.92,
            photoColorMode: settings.photoColorMode || 'color',
          }),
        ]);

        const completedItem: TelegramFileProcessItem = {
          ...currentItem,
          status: 'completed',
          extractedData,
          mirroredFrontUrl,
          mirroredBackUrl,
        };

        setBatchItems((prev) => prev.map((item) => (item.id === currentItem.id ? completedItem : item)));

        // Just preview the IDs without text per user request
        appendMessage(
          'bot',
          `ID #${fileIndex}`,
          {
            itemPreview: {
              fileIndex,
              fileName: file.name,
              extractedData,
              mirroredFrontUrl,
              mirroredBackUrl,
            },
            buttons: [
              { label: '✅ Done / Export A4 5/Page', action: 'done_batch', variant: 'success' },
              { label: '➕ Upload More Files', action: 'trigger_file_upload', variant: 'primary' },
              { label: '🎯 PDF Mapper', action: 'open_mapper', variant: 'secondary' },
            ],
          }
        );
      } catch (err: any) {
        setBatchItems((prev) =>
          prev.map((item) =>
            item.id === currentItem.id ? { ...item, status: 'error', error: err.message } : item
          )
        );
        appendMessage(
          'bot',
          `❌ *Error processing File ${fileIndex} (${file.name}):*\n${err.message || 'Could not extract ID data from file.'}`
        );
      }
    }

    setIsProcessingQueue(false);
  };

  // Load sample applicant slips for 1-click test
  const handleLoadSampleBatch = async () => {
    setIsBatchActive(true);
    setIsProcessingQueue(true);
    appendMessage('user', '⚡ Load Sample Batch (3 Slips)');

    const samples = SAMPLE_BATCH_APPLICANTS.slice(0, 3);
    const startIndex = batchItems.length;

    for (let i = 0; i < samples.length; i++) {
      const data = samples[i];
      const fileIndex = startIndex + i + 1;
      const fileName = `Sample_Slip_${fileIndex}_${data.fullNameEnglish.replace(/\s+/g, '_')}.pdf`;

      // Prompt Requirement: "make the bot display the processing number of id....  example (file 1 is processing , file 2 is processing etc)"
      appendMessage(
        'bot',
        `⏳ *File ${fileIndex} is processing...*\n` +
        `📄 Document: \`${fileName}\`\n` +
        `🔍 Reading FAN barcode, extracting portrait, and formatting dual calendar dates...`
      );

      // Brief delay to simulate live processing
      await new Promise((r) => setTimeout(r, 600));

      const activeColor = TELEGRAM_COLOR_SCHEMES.find((s) => s.id === settings.colorSchemeId);
      const effectiveConfig = activeColor ? applyTelegramColorSchemeToCoordinates(config, activeColor) : config;
      const effectiveTemplateConfig = activeColor
        ? applyTelegramColorSchemeToTemplateConfig(templateConfig, activeColor)
        : templateConfig;

      const [mirroredFrontUrl, mirroredBackUrl] = await Promise.all([
        renderOffscreenCard('front', data, effectiveConfig, effectiveTemplateConfig, {
          mirrorPrint: true,
          format: 'jpeg',
          quality: 0.92,
          photoColorMode: settings.photoColorMode || 'color',
        }),
        renderOffscreenCard('back', data, effectiveConfig, effectiveTemplateConfig, {
          mirrorPrint: true,
          format: 'jpeg',
          quality: 0.92,
          photoColorMode: settings.photoColorMode || 'color',
        }),
      ]);

      const item: TelegramFileProcessItem = {
        id: `sample-${Date.now()}-${i}`,
        fileIndex,
        fileName,
        fileSize: 145000,
        status: 'completed',
        extractedData: data,
        mirroredFrontUrl,
        mirroredBackUrl,
        timestamp: Date.now(),
      };

      setBatchItems((prev) => [...prev, item]);

      // Just preview the IDs without text per user request
      appendMessage(
        'bot',
        `ID #${fileIndex}`,
        {
          itemPreview: {
            fileIndex,
            fileName,
            extractedData: data,
            mirroredFrontUrl,
            mirroredBackUrl,
          },
          buttons: [
            { label: '✅ Done / Export A4 5/Page', action: 'done_batch', variant: 'success' },
            { label: '➕ Upload More Files', action: 'trigger_file_upload', variant: 'primary' },
            { label: '🎯 PDF Mapper', action: 'open_mapper', variant: 'secondary' },
          ],
        }
      );
    }

    setIsProcessingQueue(false);
  };

  // Button dispatcher
  const handleButtonClick = (action: string) => {
    if (action === 'start_batch') {
      handleStartBatch();
    } else if (action === 'done_batch') {
      handleDoneBatch();
    } else if (action === 'open_settings') {
      setIsSettingsOpen(true);
    } else if (action === 'open_points') {
      setIsPointsModalOpen(true);
    } else if (action === 'owner_add_1') {
      handleQuickAddPoint(1);
    } else if (action === 'owner_minus_1') {
      handleQuickMinusPoint(1);
    } else if (action.startsWith('select_template_')) {
      const num = parseInt(action.replace('select_template_', ''), 10);
      handleSelectTemplate(num);
    } else if (action === 'trigger_file_upload') {
      fileInputRef.current?.click();
    } else if (action === 'load_sample_batch') {
      handleLoadSampleBatch();
    } else if (action === 'open_mapper') {
      setIsMapperOpen(true);
    } else if (action.startsWith('inspect_')) {
      const id = action.replace('inspect_', '');
      const found = batchItems.find((i) => i.id === id);
      if (found) {
        setInspectItem(found);
        setInspectMirrored(true);
      }
    }
  };

  // Send text message from user input
  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    const text = inputMessage.trim();
    setInputMessage('');
    appendMessage('user', text);

    const lower = text.toLowerCase();
    if (lower === '/start' || lower === 'start') {
      handleStartBatch();
    } else if (lower === '/done' || lower === 'done') {
      handleDoneBatch();
    } else if (lower === '/points' || lower === 'points' || lower === '/balance' || lower === 'balance') {
      appendMessage(
        'bot',
        `💎 *Points Area:*\n\n` +
        `• Current Balance: *${pointsState.points} Points*\n` +
        `• Total Value: *${pointsState.points * pointsState.pricePerPointBirr} Birr (ETB)*\n` +
        `• Processing Cost: *1 PDF Processing = 1 Point (${pointsState.pricePerPointBirr} Birr)*\n\n` +
        `Bot owner can add or minus points anytime:`,
        {
          buttons: [
            { label: '👑 Owner (+/- Points)', action: 'open_points', variant: 'primary' },
            { label: '➕ +1 Point', action: 'owner_add_1', variant: 'secondary' },
            { label: '🔻 -1 Point', action: 'owner_minus_1', variant: 'secondary' },
          ],
        }
      );
    } else if (lower === '/owner' || lower === 'owner' || lower === '/admin') {
      setIsPointsModalOpen(true);
      appendMessage('bot', '👑 Opening Bot Owner Points Management Panel (+/- Points)...');
    } else if (lower.startsWith('/addpoints') || lower.startsWith('/add ')) {
      const parts = text.split(/\s+/);
      const amt = parseInt(parts[1], 10);
      if (!isNaN(amt) && amt > 0) {
        handleQuickAddPoint(amt);
      }
    } else if (lower.startsWith('/minuspoints') || lower.startsWith('/minus ')) {
      const parts = text.split(/\s+/);
      const amt = parseInt(parts[1], 10);
      if (!isNaN(amt) && amt > 0) {
        handleQuickMinusPoint(amt);
      }
    } else if (lower === '/template1' || lower === 'template 1') {
      handleSelectTemplate(1);
    } else if (lower === '/template2' || lower === 'template 2') {
      handleSelectTemplate(2);
    } else if (lower === '/template3' || lower === 'template 3') {
      handleSelectTemplate(3);
    } else if (lower === '/template4' || lower === 'template 4') {
      handleSelectTemplate(4);
    } else if (lower === '/settings' || lower === 'settings' || lower === 'menu') {
      setIsSettingsOpen(true);
      appendMessage('bot', '⚙️ Opening Permanent Settings menu (Photo: B&W or Colored)...');
    } else if (lower === '/mapper' || lower === 'mapper') {
      setIsMapperOpen(true);
      appendMessage('bot', '🎯 Opening visual PDF Position Mapper & Region Calibrator...');
    } else if (lower === '/help' || lower === 'help') {
      appendMessage(
        'bot',
        `ℹ️ *Available Bot Commands & Functions:*\n\n` +
        `• *Start* or \`/start\` - Start multi-file batch processing\n` +
        `• *Done* or \`/done\` - Export compiled A4 5/page sheet\n` +
        `• *Points* or \`/points\` - View Points Area & Birr Balance\n` +
        `• *Owner* or \`/owner\` - Add or minus points (1 PDF = 1 Pt = 7 Birr)\n` +
        `• *Template 1, 2, 3, 4* - Switch active template\n` +
        `• *Photo Settings* - B&W or Colored photo mode\n` +
        `• *PDF Mapper* - Calibrate crop regions on PDF slips\n` +
        `• All functions are easily accessible at the bottom of your chat box!`
      );
    } else {
      appendMessage(
        'bot',
        `🤖 Command received: "${text}"\n\n` +
        `Click any button at the bottom of your chat box to begin!`,
        {
          buttons: [
            { label: '▶️ Start Multi-File Batch', action: 'start_batch', variant: 'primary' },
            { label: '💎 Points Area', action: 'open_points', variant: 'secondary' },
          ],
        }
      );
    }
  };

  const completedCount = batchItems.filter((i) => i.status === 'completed').length;

  return (
    <div className="flex h-[calc(100vh-4.25rem)] bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* Hidden File Input */}
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

      {/* Main Bot Chat Interface */}
      <div className="flex-1 flex flex-col h-full bg-[#0e1621] relative overflow-hidden">
        {/* Telegram Header */}
        <div className="h-16 bg-[#17212b] border-b border-slate-800 flex items-center justify-between px-4 sm:px-6 shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#24A1DE] to-[#50b7ec] flex items-center justify-center text-white font-bold shadow-md shadow-sky-900/30">
                <Bot className="w-6 h-6" />
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#17212b]"></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Ethiopian Fayda ID Bot
                </h2>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  OFFICIAL
                </span>
                {serverStatus.isPolling && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Polling
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Photo Mode: {settings.photoColorMode === 'grayscale' ? '⬛ B&W (Laser / Grayscale)' : '🎨 Colored (Full Color)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* PDF Position Mapper Button */}
            <button
              onClick={() => setIsMapperOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition cursor-pointer"
              title="Open Visual PDF Position Mapper & Region Calibrator"
            >
              <Crosshair className="w-4 h-4 text-cyan-400" />
              <span>🎯 PDF Mapper</span>
            </button>

            {/* Batch Counter Badge */}
            {completedCount > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs px-3 py-1.5 rounded-full font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{completedCount} IDs in Batch</span>
              </div>
            )}

            {/* Photo Color Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#24A1DE]/15 hover:bg-[#24A1DE]/25 text-[#24A1DE] border border-[#24A1DE]/30 text-xs font-semibold transition cursor-pointer"
              title="Open Photo Color Settings (B&W or Colored)"
            >
              <Palette className="w-4 h-4" />
              <span>Settings (Photo: {settings.photoColorMode === 'grayscale' ? 'B&W' : 'Colored'})</span>
            </button>
          </div>
        </div>

        {/* Telegram Chat Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-[#0e1621] to-[#0c121a]">
          {messages.map((msg) => {
            const isBot = msg.sender === 'bot';
            const isUser = msg.sender === 'user';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl ${
                  isUser ? 'ml-auto' : 'mr-auto'
                }`}
              >
                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 shadow-md text-sm leading-relaxed max-w-full ${
                    isUser
                      ? 'bg-[#2b5278] text-white rounded-br-xs border border-sky-600/30'
                      : 'bg-[#182533] text-slate-200 rounded-bl-xs border border-slate-700/50'
                  }`}
                >
                  {/* Formatted Markdown-like text (only when not showing pure ID preview) */}
                  {!msg.itemPreview && (
                    <div className="whitespace-pre-wrap space-y-1">
                      {msg.text.split('\n').map((line, idx) => {
                        if (line.startsWith('• ')) {
                          return (
                            <div key={idx} className="flex items-start gap-1.5 ml-1">
                              <span className="text-[#24A1DE]">•</span>
                              <span>{line.replace('• ', '')}</span>
                            </div>
                          );
                        }
                        return <div key={idx}>{line}</div>;
                      })}
                    </div>
                  )}

                  {/* Immediate ID Preview Display - Just Preview the IDs! */}
                  {msg.itemPreview && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-700/60">
                        <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
                          <CheckCheck className="w-4 h-4 text-emerald-400" />
                          ID #{msg.itemPreview.fileIndex}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                          🪞 Mirrored Preview
                        </span>
                      </div>

                      {/* Mirrored Preview Cards Side-by-Side (Just Preview the IDs!) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {msg.itemPreview.mirroredFrontUrl && (
                          <div className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-950 p-1">
                            <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between px-1">
                              <span>Mirrored Front</span>
                              <span className="text-emerald-400 font-mono">300 DPI</span>
                            </div>
                            <img
                              src={msg.itemPreview.mirroredFrontUrl}
                              alt="Mirrored Front Card"
                              className="w-full h-auto rounded shadow object-contain"
                            />
                          </div>
                        )}
                        {msg.itemPreview.mirroredBackUrl && (
                          <div className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-950 p-1">
                            <div className="text-[10px] text-slate-400 mb-1 flex items-center justify-between px-1">
                              <span>Mirrored Back</span>
                              <span className="text-emerald-400 font-mono">300 DPI</span>
                            </div>
                            <img
                              src={msg.itemPreview.mirroredBackUrl}
                              alt="Mirrored Back Card"
                              className="w-full h-auto rounded shadow object-contain"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                    <span>{msg.timestamp}</span>
                    {isUser && <CheckCheck className="w-3 h-3 text-sky-400" />}
                  </div>
                </div>

                {/* Inline Action Buttons */}
                {msg.buttons && msg.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-full">
                    {msg.buttons.map((btn, btnIdx) => {
                      let btnColor = 'bg-[#24A1DE]/20 hover:bg-[#24A1DE]/30 text-sky-300 border-sky-500/30';
                      if (btn.variant === 'primary') {
                        btnColor = 'bg-[#24A1DE] hover:bg-[#2090c7] text-white font-medium border-[#24A1DE] shadow-sm';
                      } else if (btn.variant === 'success') {
                        btnColor =
                          'bg-emerald-600 hover:bg-emerald-500 text-white font-semibold border-emerald-500 shadow-md shadow-emerald-950/40';
                      }

                      return (
                        <button
                          key={btnIdx}
                          onClick={() => handleButtonClick(btn.action)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 active:scale-95 cursor-pointer ${btnColor}`}
                        >
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Live Progress Bubble when Queue is actively processing */}
          {isProcessingQueue && (
            <div className="flex items-start gap-2 max-w-md mr-auto">
              <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
              </div>
              <div className="bg-[#182533] text-slate-200 rounded-2xl rounded-bl-xs px-4 py-3 border border-slate-700/50 text-sm shadow-md">
                <div className="flex items-center gap-2 text-sky-400 font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
                  Processing ID slips in batch...
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Extracting portraits, barcodes, FAN numbers, and generating mirrored verification previews...
                </p>
              </div>
            </div>
          )}

          {/* Exporting Progress */}
          {isExportingBatch && (
            <div className="flex items-start gap-2 max-w-md mr-auto">
              <div className="bg-emerald-900/40 text-emerald-200 rounded-2xl px-4 py-3 border border-emerald-500/50 text-sm shadow-md">
                <div className="flex items-center gap-2 font-medium text-emerald-400">
                  <Printer className="w-4 h-4 animate-bounce" />
                  Generating A4 5/Page Document...
                </div>
                <p className="text-xs text-emerald-300 mt-1">{exportProgressText || 'Rendering 300 DPI print canvas'}</p>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick Action Dock (Above message input) */}
        <div className="bg-[#17212b] border-t border-slate-800 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            {/* Start Button */}
            <button
              onClick={handleStartBatch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow transition whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Multi-File</span>
            </button>

            {/* Upload Files Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition whitespace-nowrap cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5 text-sky-400" />
              <span>Upload Slips</span>
            </button>

            {/* PDF Mapper Button */}
            <button
              onClick={() => setIsMapperOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-medium transition whitespace-nowrap cursor-pointer"
              title="Open Visual PDF Slip Position Mapper"
            >
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span>PDF Mapper</span>
            </button>

            {/* Sample Batch */}
            <button
              onClick={handleLoadSampleBatch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-medium transition whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load 3 Samples</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Done Button */}
            <button
              onClick={handleDoneBatch}
              disabled={completedCount === 0 || isExportingBatch}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold shadow transition whitespace-nowrap ${
                completedCount > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 cursor-pointer animate-pulse'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Done (Export A4 5/page)</span>
              {completedCount > 0 && (
                <span className="bg-emerald-700 px-1.5 py-0.2 rounded-full text-[10px] ml-0.5">
                  {completedCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Telegram Chat Input Bar */}
        <div className="bg-[#17212b] p-3 flex items-center gap-2 border-t border-slate-800/80">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-sky-400 transition"
            title="Attach Fayda ID PDF files or photos"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            placeholder="Type 'start' to begin batch or 'done' to export A4 5/page..."
            className="flex-1 bg-[#242f3d] text-white placeholder-slate-400 text-sm px-4 py-2.5 rounded-full border border-transparent focus:border-sky-500/50 focus:outline-none transition"
          />

          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim()}
            className={`p-2.5 rounded-full transition ${
              inputMessage.trim()
                ? 'bg-[#24A1DE] text-white hover:bg-[#2090c7] shadow-md'
                : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slide-out Settings Panel - Strictly for Photo: B&W or Colored */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#17212b] border-l border-slate-800 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Settings Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-[#24A1DE]" />
                <div>
                  <h3 className="font-semibold text-white text-base">Bot Photo Settings</h3>
                  <p className="text-xs text-slate-400">Strictly for photo: B&W or Colored</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Settings Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-sky-400" />
                  Applicant Photo Mode (B&W or Colored)
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Controls applicant portrait photos on all generated ID cards, Telegram batch previews, and A4 5/page exports. Choose between full original color or high-contrast black & white (B&W):
                </p>
              </div>

              <div className="space-y-3">
                {/* Option 1: Colored (Full Color) */}
                <div
                  onClick={() => {
                    updatePermanentSettings({ photoColorMode: 'color' });
                    appendMessage('system', '🎨 Permanent photo setting updated to Colored (Full Color)');
                  }}
                  className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    settings.photoColorMode === 'color'
                      ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm ring-1 ring-sky-500/30'
                      : 'bg-slate-850 hover:bg-slate-800 border-slate-750 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 via-sky-500 to-amber-500 p-0.5 shadow-md flex items-center justify-center shrink-0">
                      <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center overflow-hidden">
                        <span className="text-xl">🎨</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <span>Colored Photo</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 font-semibold border border-sky-500/30">
                          FULL COLOR
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                        Keeps applicant's original full-color portrait photo with natural skin tones and clothing colors.
                      </p>
                    </div>
                  </div>

                  {settings.photoColorMode === 'color' && (
                    <Check className="w-5 h-5 text-sky-400 shrink-0 ml-2" />
                  )}
                </div>

                {/* Option 2: B&W (Black & White / Laser Grayscale) */}
                <div
                  onClick={() => {
                    updatePermanentSettings({ photoColorMode: 'grayscale' });
                    appendMessage('system', '⬛ Permanent photo setting updated to B&W (Grayscale / Laser)');
                  }}
                  className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    settings.photoColorMode === 'grayscale'
                      ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm ring-1 ring-sky-500/30'
                      : 'bg-slate-850 hover:bg-slate-800 border-slate-750 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-400 to-slate-100 p-0.5 shadow-md flex items-center justify-center shrink-0">
                      <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center overflow-hidden">
                        <span className="text-xl grayscale">👤</span>
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <span>B&W Photo</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-200 font-semibold border border-slate-600">
                          B&W / LASER
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                        High-contrast monochrome grayscale photo. Ideal for official laser engraving, PVC transfer, and thermal card printing.
                      </p>
                    </div>
                  </div>

                  {settings.photoColorMode === 'grayscale' && (
                    <Check className="w-5 h-5 text-sky-400 shrink-0 ml-2" />
                  )}
                </div>
              </div>

              {/* Info notice */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
                <span className="text-sky-400 text-sm">💡</span>
                <span>
                  This setting applies strictly to applicant photos across all bot batches and A4 5/page exports. All text fields, barcodes, and national emblems remain sharp and official.
                </span>
              </div>

              {/* Optional: Real Bot Server Token Connection */}
              <div className="pt-4 border-t border-slate-800">
                <details className="text-xs text-slate-400 group">
                  <summary className="cursor-pointer text-slate-400 hover:text-white font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-sky-400" />
                      Live Telegram Bot API Token (@BotFather)
                    </span>
                    <span className="text-[10px] text-slate-500">Optional</span>
                  </summary>
                  <div className="mt-3 space-y-2 pt-1">
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="e.g. 7182946129:AAHfk39..."
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg font-mono focus:border-sky-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveAndConnectToken}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-[#24A1DE] hover:bg-[#2090c7] text-white text-xs font-semibold shadow transition"
                      >
                        Save & Connect
                      </button>
                      {serverStatus.isPolling && (
                        <button
                          onClick={handleStopPolling}
                          className="py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                    {tokenTestMessage && (
                      <div className="p-2 rounded bg-slate-900 text-[11px] text-slate-300 border border-slate-800 font-mono">
                        {tokenTestMessage}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>

            {/* Permanent Settings Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0e1621] flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Setting saved permanently</span>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#24A1DE] hover:bg-[#2090c7] text-white text-xs font-semibold shadow cursor-pointer"
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
          <div className="bg-[#17212b] border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-sm">
                    ID #{inspectItem.fileIndex} Verification Inspection
                  </h3>
                  <p className="text-xs text-slate-400">{inspectItem.fileName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInspectMirrored(!inspectMirrored)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    inspectMirrored
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>{inspectMirrored ? 'Mirrored Mode (Active)' : 'Normal Mode'}</span>
                </button>
                <button
                  onClick={() => setInspectItem(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Personal Details Check Table */}
              {inspectItem.extractedData && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">English Name</span>
                    <span className="font-semibold text-white">{inspectItem.extractedData.fullNameEnglish}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Amharic Name</span>
                    <span className="font-semibold text-white font-ethiopic">
                      {inspectItem.extractedData.fullNameAmharic}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">FAN Number</span>
                    <span className="font-mono text-emerald-400 font-bold">{inspectItem.extractedData.fan}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Date of Birth</span>
                    <span className="font-semibold text-white">
                      {inspectItem.extractedData.dateOfBirth} ({inspectItem.extractedData.dateOfBirthEth || 'E.C.'})
                    </span>
                  </div>
                </div>
              )}

              {/* Card Images Side-by-Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>{inspectMirrored ? '🪞 Mirrored Front Card' : 'Front Card'}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">CR80 • 300 DPI</span>
                  </div>
                  <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-950 p-2 shadow-lg">
                    <img
                      src={inspectItem.mirroredFrontUrl}
                      alt="Front Card"
                      className={`w-full h-auto rounded transition-transform ${
                        !inspectMirrored ? 'scale-x-[-1]' : ''
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>{inspectMirrored ? '🪞 Mirrored Back Card' : 'Back Card'}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">CR80 • 300 DPI</span>
                  </div>
                  <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-950 p-2 shadow-lg">
                    <img
                      src={inspectItem.mirroredBackUrl}
                      alt="Back Card"
                      className={`w-full h-auto rounded transition-transform ${
                        !inspectMirrored ? 'scale-x-[-1]' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-[#0e1621] flex justify-end gap-2">
              <button
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Close Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Slip Position Mapper Modal */}
      {isMapperOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#17212b] border border-cyan-500/40 rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-[#0e1621] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Crosshair className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>PDF Position Mapper & Region Calibrator</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                      TELEGRAM BOT SYNC
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Visually mark and calibrate crop regions (Portrait photo, QR code, Barcode, Back FAN) on your PDF slips. Calibrations persist permanently and apply to all batch items.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const effective = getEffectiveRegions();
                    savePermanentRegions(effective);
                    setIsMapperOpen(false);
                    appendMessage(
                      'bot',
                      `🎯 *PDF Mapper Positions Saved!* Calibrated coordinates are saved permanently and applied to all batch slips.`
                    );
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                  title="Save current PDF slip mapper coordinates and apply them to batch processing"
                >
                  <Check className="w-4 h-4" />
                  <span>Save & Apply to Bot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMapperOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Close PDF Mapper"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body with Full Interactive PdfSlipExtractor in Marker Mode */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-950">
              <PdfSlipExtractor
                idData={mapperSlipData}
                setIdData={setMapperSlipData}
                config={config}
                templateConfig={templateConfig}
                initialWorkflowMode="marker"
                onApplyAndOpenStudio={() => {
                  const effective = getEffectiveRegions();
                  savePermanentRegions(effective);
                  setIsMapperOpen(false);
                  appendMessage(
                    'bot',
                    '🎯 *PDF Mapper Positions Saved!* Calibrated coordinates will apply to all batch slips.'
                  );
                }}
                onOpenBatch={() => setIsMapperOpen(false)}
                onSaveAndApplyPositions={(savedRegions, updatedData) => {
                  if (savedRegions && savedRegions.length > 0) {
                    savePermanentRegions(savedRegions);
                  }
                  if (updatedData) {
                    setMapperSlipData(updatedData);
                  }
                  setIsMapperOpen(false);
                  appendMessage(
                    'bot',
                    '🎯 *PDF Mapper Positions Saved!* Calibrated crop regions saved permanently and applied to all batch slips.'
                  );
                }}
                onSaveToBatchConverter={(savedRegions, updatedData) => {
                  if (savedRegions && savedRegions.length > 0) {
                    savePermanentRegions(savedRegions);
                  }
                  if (updatedData) {
                    setMapperSlipData(updatedData);
                  }
                  setIsMapperOpen(false);
                  appendMessage(
                    'bot',
                    '🎯 *PDF Mapper Positions Saved!* Calibrated crop regions saved permanently and applied to all batch slips.'
                  );
                }}
                batchQueueCount={batchItems.length}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
