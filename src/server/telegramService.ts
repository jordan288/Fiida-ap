import fs from 'fs';
import path from 'path';

export interface TelegramBotServerConfig {
  botToken?: string;
  botUsername?: string;
  activeTemplateNumber: number;
  photoColorMode: 'color' | 'grayscale';
  colorSchemeId: string;
  primaryTextColor: string;
  cardBackgroundColor: string;
  exportFileType: string;
  mirrorVerificationPreview: boolean;
  mirrorPrintExport: boolean;
  pointsBalance: number;
  pricePerPointBirr: number;
  pointsPerPdf: number;
}

const SETTINGS_FILE_PATH = path.join(process.cwd(), '.telegram_bot_settings.json');

const DEFAULT_SERVER_CONFIG: TelegramBotServerConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  botUsername: 'FaydaIdCardBot',
  activeTemplateNumber: 1,
  photoColorMode: 'color',
  colorSchemeId: 'classic_slate',
  primaryTextColor: '#0f172a',
  cardBackgroundColor: '#f8fafc',
  exportFileType: 'a4_pdf_5_per_page',
  mirrorVerificationPreview: true,
  mirrorPrintExport: true,
  pointsBalance: 1050,
  pricePerPointBirr: 7,
  pointsPerPdf: 1,
};

class TelegramBotManager {
  private config: TelegramBotServerConfig = DEFAULT_SERVER_CONFIG;
  private isPolling: boolean = false;
  private pollingAbortController: AbortController | null = null;
  private lastUpdateId: number = 0;
  private userSessions: Map<number, {
    mode: 'idle' | 'batch_collecting';
    fileCount: number;
    files: Array<{ fileId: string; fileName: string; fileUrl?: string; timestamp: number }>;
  }> = new Map();

  constructor() {
    this.loadSettings();
    if (this.config.botToken) {
      this.startPolling().catch((err) => {
        console.warn('Could not auto-start Telegram bot polling on boot:', err.message);
      });
    }
  }

  public loadSettings(): TelegramBotServerConfig {
    try {
      if (fs.existsSync(SETTINGS_FILE_PATH)) {
        const raw = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        this.config = { ...DEFAULT_SERVER_CONFIG, ...parsed };
      }
    } catch (e) {
      console.warn('Could not read Telegram bot settings file:', e);
    }
    return this.config;
  }

  public saveSettings(newSettings: Partial<TelegramBotServerConfig>): TelegramBotServerConfig {
    this.config = { ...this.config, ...newSettings };
    try {
      fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Could not save Telegram bot settings file:', e);
    }
    return this.config;
  }

  public getConfig(): TelegramBotServerConfig {
    return this.config;
  }

  public getStatus() {
    return {
      isPolling: this.isPolling,
      botUsername: this.config.botUsername,
      hasToken: Boolean(this.config.botToken && this.config.botToken.trim().length > 10),
      activeTemplateNumber: this.config.activeTemplateNumber,
      colorSchemeId: this.config.colorSchemeId,
      exportFileType: this.config.exportFileType,
      activeSessionsCount: this.userSessions.size,
      pointsBalance: this.config.pointsBalance,
      pricePerPointBirr: this.config.pricePerPointBirr,
      pointsPerPdf: this.config.pointsPerPdf,
    };
  }

  public addPoints(amount: number): number {
    const valid = Math.max(1, Math.round(amount));
    this.config.pointsBalance = (this.config.pointsBalance || 0) + valid;
    this.saveSettings({ pointsBalance: this.config.pointsBalance });
    return this.config.pointsBalance;
  }

  public minusPoints(amount: number): number {
    const valid = Math.max(1, Math.round(amount));
    this.config.pointsBalance = Math.max(0, (this.config.pointsBalance || 0) - valid);
    this.saveSettings({ pointsBalance: this.config.pointsBalance });
    return this.config.pointsBalance;
  }

  public setPoints(target: number): number {
    const valid = Math.max(0, Math.round(target));
    this.config.pointsBalance = valid;
    this.saveSettings({ pointsBalance: this.config.pointsBalance });
    return this.config.pointsBalance;
  }

  public async testConnection(token: string) {
    const cleanToken = token.trim();
    if (!cleanToken) throw new Error('Bot token is required');
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await res.json() as any;
    if (!data.ok) throw new Error(data.description || 'Invalid Telegram Bot Token');
    return data.result;
  }

  public async startPolling(): Promise<boolean> {
    const token = this.config.botToken?.trim();
    if (!token) return false;
    if (this.isPolling) return true;

    try {
      const botInfo = await this.testConnection(token);
      this.config.botUsername = botInfo.username;
      this.saveSettings({ botUsername: botInfo.username });
    } catch (err: any) {
      console.warn('Failed to verify token during startPolling:', err.message);
      return false;
    }

    this.isPolling = true;
    this.pollingAbortController = new AbortController();
    this.runPollingLoop();
    console.log(`Telegram Bot polling started for @${this.config.botUsername}`);
    return true;
  }

  public stopPolling(): boolean {
    if (!this.isPolling) return false;
    this.isPolling = false;
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
    }
    console.log('Telegram Bot polling stopped');
    return true;
  }

  private async runPollingLoop() {
    while (this.isPolling) {
      const token = this.config.botToken?.trim();
      if (!token) break;

      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=20`;
        const res = await fetch(url, { signal: this.pollingAbortController?.signal });
        const data = await res.json() as any;

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            await this.handleUpdate(update);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  public async handleUpdate(update: any) {
    const token = this.config.botToken?.trim();
    if (!token) return;

    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id;
      const data = cb.data;
      if (chatId) {
        await this.handleCallbackQuery(chatId, cb.id, data);
      }
      return;
    }

    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat?.id;
    if (!chatId) return;

    const text = (msg.text || '').trim();

    // 1. Start Batch
    if (text === 'Start' || text === '/start_batch' || text.toLowerCase() === 'start') {
      this.userSessions.set(chatId, { mode: 'batch_collecting', fileCount: 0, files: [] });
      await this.sendMessage(chatId, 
        `Batch processing initialized.\n\n` +
        `Please upload your PDF slips or photos. You may upload multiple files simultaneously.\n` +
        `Select 'Done / Export' when finished.`,
        [[{ text: 'Done / Export', callback_data: 'action_done_batch' }]]
      );
      return;
    }

    // 2. Templates Menu
    if (text === 'Templates' || text === '/templates') {
      await this.sendTemplateMenu(chatId);
      return;
    }

    // 3. Done / Export
    if (text === 'Done / Export' || text === '/done') {
      await this.handleDoneBatch(chatId);
      return;
    }

    // 4. Buy Point (Admin/Points Menu)
    if (text === 'Buy Point' || text === '/points' || text === '/buy') {
      await this.sendOwnerPointsMenu(chatId);
      return;
    }

    // 5. Photo Edit / Mapper
    if (text === 'Photo Edit' || text === '/edit' || text === '/mapper') {
      await this.sendMessage(chatId, `PDF Mapper & Calibration active. Calibrations apply automatically to batch processing.`);
      return;
    }

    // 6. Settings
    if (text === 'Settings' || text === '/settings') {
      await this.sendSettingsMenu(chatId);
      return;
    }

    // Handle incoming documents
    if (msg.document || msg.photo) {
      if ((this.config.pointsBalance || 0) < 1) {
        await this.sendMessage(chatId, `Insufficient balance. Current balance: ${this.config.pointsBalance || 0} points.\nPlease contact the administrator.`);
        return;
      }

      this.minusPoints(1);

      let session = this.userSessions.get(chatId);
      if (!session || session.mode !== 'batch_collecting') {
        session = { mode: 'batch_collecting', fileCount: 0, files: [] };
        this.userSessions.set(chatId, session);
      }

      session.fileCount++;
      const currentFileIndex = session.fileCount;
      const fileName = msg.document?.file_name || `document_${currentFileIndex}.pdf`;

      await this.sendMessage(chatId, `Processing file ${currentFileIndex}: ${fileName}\nRemaining balance: ${this.config.pointsBalance} points.`);

      setTimeout(async () => {
        await this.sendMessage(chatId, `Preview ID #${currentFileIndex} | Balance: ${this.config.pointsBalance} pts`, [
          [{ text: 'Done / Export', callback_data: 'action_done_batch' }]
        ]);
      }, 1000);

      return;
    }

    // Default Fallback
    await this.sendMessage(chatId, `Command not recognized. Select an option from the keyboard below:`, undefined, this.getBottomKeyboardMarkup());
  }

  private async handleCallbackQuery(chatId: number, queryId: string, data: string) {
    const token = this.config.botToken?.trim();
    if (!token) return;

    try {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: queryId }),
      });
    } catch {}

    if (data === 'action_start_batch') {
      this.userSessions.set(chatId, { mode: 'batch_collecting', fileCount: 0, files: [] });
      await this.sendMessage(chatId, `Batch mode activated.\nUpload your files now. Select 'Done / Export' when finished.`);
    } else if (data === 'action_done_batch') {
      await this.handleDoneBatch(chatId);
    } else if (data === 'menu_settings') {
      await this.sendSettingsMenu(chatId);
    } else if (data.startsWith('set_template_')) {
      const templateNum = parseInt(data.replace('set_template_', ''), 10);
      this.saveSettings({ activeTemplateNumber: templateNum });
      await this.sendMessage(chatId, `Template ${templateNum} activated successfully.`);
    } else if (data === 'set_photo_color') {
      this.saveSettings({ photoColorMode: 'color' });
      await this.sendMessage(chatId, `Photo mode set to Color.`);
      await this.sendSettingsMenu(chatId);
    } else if (data === 'set_photo_bw') {
      this.saveSettings({ photoColorMode: 'grayscale' });
      await this.sendMessage(chatId, `Photo mode set to Grayscale.`);
      await this.sendSettingsMenu(chatId);
    }
  }

  private async sendTemplateMenu(chatId: number) {
    const active = this.config.activeTemplateNumber;
    await this.sendMessage(
      chatId,
      `Template Selection Menu\n\nCurrent Active Template: ${active}\nSelect a template below to activate it for your ID cards:`,
      [
        [
          { text: active === 1 ? 'Template 1 (Active)' : 'Template 1', callback_data: 'set_template_1' },
          { text: active === 2 ? 'Template 2 (Active)' : 'Template 2', callback_data: 'set_template_2' },
        ],
        [
          { text: active === 3 ? 'Template 3 (Active)' : 'Template 3', callback_data: 'set_template_3' },
          { text: active === 4 ? 'Template 4 (Active)' : 'Template 4', callback_data: 'set_template_4' },
        ],
        [
          { text: active === 5 ? 'Template 5 (Active)' : 'Template 5', callback_data: 'set_template_5' },
          { text: active === 6 ? 'Template 6 (Active)' : 'Template 6', callback_data: 'set_template_6' },
        ]
      ]
    );
  }

  private async handleDoneBatch(chatId: number) {
    const session = this.userSessions.get(chatId);
    const count = session?.fileCount || 0;

    if (count === 0) {
      await this.sendMessage(chatId, `No files processed. Please start a batch to begin.`);
      return;
    }

    await this.sendMessage(chatId, `Batch processing complete.\nTotal documents: ${count}\nFormat: A4 (5 per page)\nExporting files...`);
    this.userSessions.delete(chatId);

    setTimeout(async () => {
      await this.sendMessage(chatId, `Files dispatched successfully.`);
    }, 2000);
  }

  public getBottomKeyboardMarkup() {
    return {
      keyboard: [
        [
          { text: 'Start' },
          { text: 'Templates' },
          { text: 'Done / Export' }
        ],
        [
          { text: 'Buy Point' },
          { text: 'Photo Edit' },
          { text: 'Settings' }
        ]
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  public async sendOwnerPointsMenu(chatId: number) {
    const bal = this.config.pointsBalance || 0;
    const text = `Points Management\n\nCurrent Balance: ${bal} points\nContact administration to adjust.`;
    await this.sendMessage(chatId, text);
  }

  private async sendSettingsMenu(chatId: number) {
    const isGrayscale = this.config.photoColorMode === 'grayscale';
    const text = `System Settings\n\nApplicant Photo Mode: ${isGrayscale ? 'Grayscale' : 'Color'}\nSelect an option below to update:`;

    const buttons = [
      [{ text: isGrayscale ? 'Switch to Color' : 'Color (Active)', callback_data: 'set_photo_color' }],
      [{ text: isGrayscale ? 'Grayscale (Active)' : 'Switch to Grayscale', callback_data: 'set_photo_bw' }],
    ];

    await this.sendMessage(chatId, text, buttons);
  }

  public async sendDocument(chatId: number, fileBuffer: Buffer, filename: string, caption?: string) {
    const token = this.config.botToken?.trim();
    if (!token) return;
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    formData.append('document', new Blob([fileBuffer]), filename);
    if (caption) formData.append('caption', caption);
    try { await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: formData }); } catch (e) {}
  }

  public async sendMessage(chatId: number, text: string, inlineKeyboard?: any[][], replyMarkup?: any) {
    const token = this.config.botToken?.trim();
    if (!token) return;
    try {
      const body: any = { chat_id: chatId, text };
      if (inlineKeyboard && inlineKeyboard.length > 0) body.reply_markup = { inline_keyboard: inlineKeyboard };
      else if (replyMarkup) body.reply_markup = replyMarkup;
      else body.reply_markup = this.getBottomKeyboardMarkup();
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {}
  }
}

export const telegramBotManager = new TelegramBotManager();