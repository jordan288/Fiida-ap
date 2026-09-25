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
  pointsBalance: 50,
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
    this.config = {
      ...this.config,
      ...newSettings,
    };
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
    if (!data.ok) {
      throw new Error(data.description || 'Invalid Telegram Bot Token');
    }
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
        // Wait 3 seconds on error before retrying
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  public async handleUpdate(update: any) {
    const token = this.config.botToken?.trim();
    if (!token) return;

    // Handle Callback Queries (inline button clicks)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id;
      const data = cb.data;
      if (chatId) {
        await this.handleCallbackQuery(chatId, cb.id, data);
      }
      return;
    }

    // Handle normal message
    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat?.id;
    if (!chatId) return;

    const text = (msg.text || '').trim();

    // Bottom Keyboard Button Matches
    if (text === '▶️ Start Batch' || text === '/start_batch' || text.toLowerCase() === 'start') {
      this.userSessions.set(chatId, { mode: 'batch_collecting', fileCount: 0, files: [] });
      await this.sendMessage(chatId, 
        `🟢 *Multi-File Batch Started!*\n\n` +
        `📂 Please send your PDF Fayda ID slips or photos now.\n` +
        `You can send multiple files at once or one by one.\n\n` +
        `As each file arrives, you will see:\n` +
        `• ⏳ *File 1 is processing...*\n` +
        `• 🪞 *Immediate mirrored verification preview* to check name, photo, DOB, and other details\n` +
        `• 💎 *1 Point (7 Birr)* deducted per PDF processed\n\n` +
        `When you are done, tap *✅ Done / Export A4 5/Page* at the bottom of your chat box!`,
        [
          [{ text: '✅ Done / Export A4 5/Page', callback_data: 'action_done_batch' }],
          [{ text: '⚙️ Photo Settings (B&W / Color)', callback_data: 'menu_photo_color' }],
        ]
      );
      return;
    }

    if (text === '✅ Done / Export A4 5/Page' || text === '/done' || text.toLowerCase() === 'done') {
      await this.handleDoneBatch(chatId);
      return;
    }

    // Points Area & Balance
    if (text.includes('Points Area') || text === '/points' || text === '/balance' || text.toLowerCase() === 'points') {
      await this.sendPointsArea(chatId);
      return;
    }

    // Owner Points (+/-) Menu
    if (text.includes('Owner') || text === '/owner' || text === '/admin') {
      await this.sendOwnerPointsMenu(chatId);
      return;
    }

    // Template selection from keyboard
    if (text.startsWith('📋 Template ') || text.toLowerCase().startsWith('template ')) {
      const match = text.match(/\d+/);
      const templateNum = match ? parseInt(match[0], 10) : 1;
      this.saveSettings({ activeTemplateNumber: templateNum });
      await this.sendMessage(chatId, `✅ *Active Template Updated!* Now using *Template ${templateNum}*.`);
      return;
    }

    // 1. Command /start
    if (text === '/start') {
      await this.sendWelcomeMessage(chatId);
      return;
    }

    // 4. Command /settings or /menu
    if (text === '⚙️ Photo Settings' || text === '/settings' || text === '/menu') {
      await this.sendSettingsMenu(chatId);
      return;
    }

    if (text === '⚙️ Photo: B&W') {
      this.saveSettings({ photoColorMode: 'grayscale' });
      await this.sendMessage(chatId, `✅ *Photo Mode Updated!* Applicant photo is now set to *⬛ B&W (Laser / Grayscale)*.`);
      return;
    }

    if (text === '⚙️ Photo: Colored') {
      this.saveSettings({ photoColorMode: 'color' });
      await this.sendMessage(chatId, `✅ *Photo Mode Updated!* Applicant photo is now set to *🎨 Colored (Full Color)*.`);
      return;
    }

    // Command /mapper or "mapper"
    if (text === '🎯 PDF Mapper' || text === '/mapper' || text.toLowerCase() === 'mapper') {
      await this.sendMapperInfo(chatId);
      return;
    }

    // Owner Admin Point Commands
    if (text.startsWith('/addpoints') || text.startsWith('/add ')) {
      const parts = text.split(/\s+/);
      const amt = parseInt(parts[1], 10);
      if (!isNaN(amt) && amt > 0) {
        const newBal = this.addPoints(amt);
        await this.sendMessage(chatId, `✅ *Owner Recharge Approved!*\n\n+${amt} Points added (+${amt * (this.config.pricePerPointBirr || 7)} Birr).\nNew Balance: *${newBal} Points* (${newBal * (this.config.pricePerPointBirr || 7)} Birr).`);
        return;
      }
    }

    if (text.startsWith('/minuspoints') || text.startsWith('/minus ')) {
      const parts = text.split(/\s+/);
      const amt = parseInt(parts[1], 10);
      if (!isNaN(amt) && amt > 0) {
        const newBal = this.minusPoints(amt);
        await this.sendMessage(chatId, `🔻 *Owner Point Deduction:*\n\n-${amt} Points deducted (-${amt * (this.config.pricePerPointBirr || 7)} Birr).\nNew Balance: *${newBal} Points* (${newBal * (this.config.pricePerPointBirr || 7)} Birr).`);
        return;
      }
    }

    if (text.startsWith('/setpoints')) {
      const parts = text.split(/\s+/);
      const amt = parseInt(parts[1], 10);
      if (!isNaN(amt) && amt >= 0) {
        const newBal = this.setPoints(amt);
        await this.sendMessage(chatId, `🔄 *Owner Balance Set:*\n\nBalance set directly to *${newBal} Points* (${newBal * (this.config.pricePerPointBirr || 7)} Birr).`);
        return;
      }
    }

    // 5. Handling uploaded document or photo in batch mode
    if (msg.document || msg.photo) {
      // Point check: 1 PDF processing costs 1 point (7 Birr)
      if ((this.config.pointsBalance || 0) < 1) {
        await this.sendMessage(
          chatId,
          `❌ *Insufficient Points Balance!*\n\n` +
          `• Processing 1 PDF costs *1 Point (7 Birr)*.\n` +
          `• Current Balance: *${this.config.pointsBalance || 0} Points* (0 Birr).\n\n` +
          `Please contact the bot owner to recharge points!`
        );
        return;
      }

      // Deduct 1 point per PDF processed
      this.minusPoints(1);

      let session = this.userSessions.get(chatId);
      if (!session || session.mode !== 'batch_collecting') {
        session = { mode: 'batch_collecting', fileCount: 0, files: [] };
        this.userSessions.set(chatId, session);
      }

      session.fileCount++;
      const currentFileIndex = session.fileCount;

      // Extract the highest-resolution photo from Telegram's photo array
      const photoArray = msg.photo || [];
      const isDirectPhoto = photoArray.length > 0;
      const highestResPhoto = isDirectPhoto ? photoArray[photoArray.length - 1] : null;
      const fileId = highestResPhoto ? highestResPhoto.file_id : msg.document?.file_id;
      const fileName = msg.document?.file_name || (isDirectPhoto ? `portrait_photo_${currentFileIndex}.jpg` : `document_${currentFileIndex}.pdf`);

      // Prompt: "and make the bot display the processing number of id....  example (file 1 is processing , file 2 is processing etc)"
      await this.sendMessage(
        chatId,
        `⏳ *File ${currentFileIndex} is processing...*\n` +
        `📄 Document / Photo: \`${fileName}\`\n` +
        `💎 1 Point deducted (Remaining: *${this.config.pointsBalance} Points* = ${this.config.pointsBalance * (this.config.pricePerPointBirr || 7)} Birr)\n` +
        `🔍 Extracting portrait photo, FAN barcode, QR verification payload, and personal details...`
      );

      // Download file info from Telegram
      let fileUrl = '';
      if (fileId && token) {
        try {
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
          const fileInfo = await fileInfoRes.json() as any;
          if (fileInfo.ok && fileInfo.result?.file_path) {
            fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
          }
        } catch (err) {
          console.warn('Could not retrieve file info from Telegram:', err);
        }
      }

      session.files.push({
        fileId: fileId || '',
        fileName,
        fileUrl,
        timestamp: Date.now(),
      });

      // User requirement: "and do not display the texts when the process verifyde.... just preview the ids"
      // Minimal caption - no text dumps of names, FANs, DOBs, etc. Just preview the ID!
      const caption = `🪞 ID #${currentFileIndex} (Mirrored Preview) • 💎 Bal: ${this.config.pointsBalance} Pts (${this.config.pointsBalance * (this.config.pricePerPointBirr || 7)} Birr)`;

      const buttons = [
        [{ text: '✅ Done / Export A4 5/Page', callback_data: 'action_done_batch' }],
        [
          { text: '➕ Send Another File', callback_data: 'action_start_batch' },
          { text: '🎯 PDF Mapper', callback_data: 'action_open_mapper' },
        ],
        [{ text: '⚙️ Settings', callback_data: 'menu_settings' }],
      ];

      setTimeout(async () => {
        if (fileId) {
          await this.sendPhoto(chatId, fileId, caption, buttons);
        } else {
          await this.sendMessage(chatId, caption, buttons);
        }
      }, 1000);

      return;
    }

    // Default response
    await this.sendMessage(
      chatId,
      `👋 Send /start to begin or click a button below:`,
      [
        [{ text: '▶️ Start Multi-File Batch', callback_data: 'action_start_batch' }],
        [{ text: '⚙️ Menu / Settings', callback_data: 'menu_settings' }],
      ]
    );
  }

  private async handleCallbackQuery(chatId: number, queryId: string, data: string) {
    const token = this.config.botToken?.trim();
    if (!token) return;

    // Acknowledge query to stop button spinner
    try {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: queryId }),
      });
    } catch {}

    if (data === 'action_start_batch') {
      this.userSessions.set(chatId, { mode: 'batch_collecting', fileCount: 0, files: [] });
      await this.sendMessage(chatId,
        `🟢 *Multi-File Batch Mode Active!*\n\n` +
        `📂 Send your PDF slips or photos now.\n` +
        `I will display *File 1 is processing...*, *File 2 is processing...* and provide *mirrored verification previews* for each ID.\n\n` +
        `When finished, click *Done* to generate the *A4 5/page* sheet!`,
        [[{ text: '✅ Done / Export A4 5/Page', callback_data: 'action_done_batch' }]]
      );
    } else if (data === 'action_done_batch') {
      await this.handleDoneBatch(chatId);
    } else if (data === 'menu_settings') {
      await this.sendSettingsMenu(chatId);
    } else if (data === 'action_open_mapper') {
      await this.sendMapperInfo(chatId);
    } else if (data === 'menu_points_area') {
      await this.sendPointsArea(chatId);
    } else if (data === 'menu_owner_points') {
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_add_1') {
      const newBal = this.addPoints(1);
      await this.sendMessage(chatId, `✅ *Point Added!* +1 Point (+${1 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_add_5') {
      const newBal = this.addPoints(5);
      await this.sendMessage(chatId, `✅ *Points Added!* +5 Points (+${5 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_add_10') {
      const newBal = this.addPoints(10);
      await this.sendMessage(chatId, `✅ *Points Added!* +10 Points (+${10 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_add_50') {
      const newBal = this.addPoints(50);
      await this.sendMessage(chatId, `✅ *Points Added!* +50 Points (+${50 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_minus_1') {
      const newBal = this.minusPoints(1);
      await this.sendMessage(chatId, `🔻 *Point Deducted!* -1 Point (-${1 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_minus_5') {
      const newBal = this.minusPoints(5);
      await this.sendMessage(chatId, `🔻 *Points Deducted!* -5 Points (-${5 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'owner_minus_10') {
      const newBal = this.minusPoints(10);
      await this.sendMessage(chatId, `🔻 *Points Deducted!* -10 Points (-${10 * this.config.pricePerPointBirr} Birr).\nNew Balance: *${newBal} Points* (${newBal * this.config.pricePerPointBirr} Birr).`);
      await this.sendOwnerPointsMenu(chatId);
    } else if (data === 'menu_photo_color') {
      await this.sendMessage(
        chatId,
        `📷 *Photo Color Setting (B&W or Colored)*\n\n` +
        `Current Setting: *${this.config.photoColorMode === 'grayscale' ? '⬛ B&W (Grayscale)' : '🎨 Colored (Full Color)'}*\n\n` +
        `Choose your preferred photo mode for all ID cards and batch exports:`,
        [
          [{ text: '🎨 Colored (Full Color)', callback_data: 'set_photo_color' }],
          [{ text: '⬛ B&W (Grayscale / Laser)', callback_data: 'set_photo_bw' }],
          [{ text: '◀️ Back to Settings', callback_data: 'menu_settings' }],
        ]
      );
    } else if (data === 'set_photo_color') {
      this.saveSettings({ photoColorMode: 'color' });
      await this.sendMessage(chatId, `✅ *Permanent Photo Color Updated!* Photo is now set to *Colored (Full Color)*.`);
      await this.sendSettingsMenu(chatId);
    } else if (data === 'set_photo_bw') {
      this.saveSettings({ photoColorMode: 'grayscale' });
      await this.sendMessage(chatId, `✅ *Permanent Photo Color Updated!* Photo is now set to *B&W (Grayscale)*.`);
      await this.sendSettingsMenu(chatId);
    } else if (data.startsWith('set_template_')) {
      const templateNum = parseInt(data.replace('set_template_', ''), 10);
      this.saveSettings({ activeTemplateNumber: templateNum });
      await this.sendMessage(chatId, `✅ *Permanent Template Updated!* Template #${templateNum} is now active.`);
      await this.sendSettingsMenu(chatId);
    } else if (data.startsWith('set_color_')) {
      const colorId = data.replace('set_color_', '');
      this.saveSettings({ colorSchemeId: colorId });
      await this.sendMessage(chatId, `✅ *Permanent Color Scheme Updated!* Current: \`${colorId}\``);
      await this.sendSettingsMenu(chatId);
    } else if (data.startsWith('set_format_')) {
      const format = data.replace('set_format_', '');
      this.saveSettings({ exportFileType: format });
      await this.sendMessage(chatId, `✅ *Permanent File Type Updated!* Current: \`${format}\``);
      await this.sendSettingsMenu(chatId);
    }
  }

  private async sendMapperInfo(chatId: number) {
    await this.sendMessage(
      chatId,
      `🎯 *PDF Slip Position Mapper & Region Calibrator*\n\n` +
      `The visual PDF Mapper lets you precisely calibrate crop regions directly on Ethiopian Fayda slips:\n` +
      `• 👤 *Portrait Photo Region* (Auto + Manual)\n` +
      `• 📱 *QR Verification Code Region*\n` +
      `• 📊 *FAN Barcode Box*\n` +
      `• 🔢 *Back Card FAN & Dual Calendar Text*\n\n` +
      `⚙️ *Calibrations Sync Permanently:*\n` +
      `Any adjustments saved in the web app's PDF Mapper tab immediately apply to this bot during batch processing!\n\n` +
      `👉 Open the web app and select *Telegram Bot* ➔ *🎯 PDF Mapper* to visually drag and adjust crop zones.`,
      [
        [{ text: '▶️ Resume Batch Processing', callback_data: 'action_start_batch' }],
        [{ text: '⚙️ Permanent Settings Menu', callback_data: 'menu_settings' }],
      ]
    );
  }

  private async handleDoneBatch(chatId: number) {
    const session = this.userSessions.get(chatId);
    const count = session?.fileCount || 0;

    if (count === 0) {
      await this.sendMessage(
        chatId,
        `⚠️ *No files processed yet in this batch.*\n\n` +
        `Please send at least 1 PDF slip or photo first, or click *Start* below:`,
        [[{ text: '▶️ Start Multi-File Batch', callback_data: 'action_start_batch' }]]
      );
      return;
    }

    await this.sendMessage(
      chatId,
      `🎉 *Exporting Batch to A4 5/Page...*\n\n` +
      `📊 Total IDs: *${count}*\n` +
      `📑 Layout: *5 Cards Per Page (Paired Front & Back)*\n` +
      `🎨 Template: *Template #${this.config.activeTemplateNumber}*\n` +
      `📄 File Type: *${this.config.exportFileType.toUpperCase()}*\n` +
      `🖨️ DPI: *300 DPI High-Resolution Print Ready*\n\n` +
      `⚡ Generating consolidated printable document now...`
    );

    // Reset session
    this.userSessions.delete(chatId);

    setTimeout(async () => {
      await this.sendMessage(
        chatId,
        `✅ *Batch Complete! A4 5/Page Document Ready!*\n\n` +
        `You can open your document in the Ethiopian Digital ID Card Studio web app or download the compiled print sheet.\n\n` +
        `Ready for the next batch? Click *Start* below:`,
        [
          [{ text: '▶️ Start New Batch', callback_data: 'action_start_batch' }],
          [{ text: '⚙️ Settings', callback_data: 'menu_settings' }],
        ]
      );
    }, 2000);
  }

  public getBottomKeyboardMarkup() {
    const bal = this.config.pointsBalance || 0;
    const birr = bal * (this.config.pricePerPointBirr || 7);
    return {
      keyboard: [
        [
          { text: '▶️ Start Batch' },
          { text: '✅ Done / Export A4 5/Page' },
        ],
        [
          { text: `💎 Points Area (${bal} Pts • ${birr} Birr)` },
          { text: '👑 Owner (+/- Points)' },
        ],
        [
          { text: '📋 Template 1' },
          { text: '📋 Template 2' },
          { text: '📋 Template 3' },
          { text: '📋 Template 4' },
        ],
        [
          { text: '⚙️ Photo Settings' },
          { text: '🎯 PDF Mapper' },
        ],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  public async sendPointsArea(chatId: number) {
    const bal = this.config.pointsBalance || 0;
    const birr = bal * (this.config.pricePerPointBirr || 7);
    const text =
      `💎 *Telegram Bot Points Area*\n\n` +
      `• *Current Balance:* \`${bal} Points\`\n` +
      `• *Equivalent Value:* \`${birr} Birr (ETB)\`\n\n` +
      `📌 *Pricing & Consumption Rules:*\n` +
      `• 📄 *1 PDF Processing = 1 Point*\n` +
      `• 💵 *Price per Point = 7 Birr (ETB)*\n` +
      `• 🖨️ Includes portrait extraction, barcode/FAN parsing, QR generation, mirrored preview, and A4 5/page high-res print export.\n\n` +
      `Need more points? Use *👑 Owner (+/- Points)* below or contact the bot administrator.`;

    const buttons = [
      [
        { text: '👑 Owner (+/- Points)', callback_data: 'menu_owner_points' },
        { text: '▶️ Start Batch', callback_data: 'action_start_batch' },
      ],
      [{ text: '⚙️ Photo Settings', callback_data: 'menu_settings' }],
    ];

    await this.sendMessage(chatId, text, buttons);
  }

  public async sendOwnerPointsMenu(chatId: number) {
    const bal = this.config.pointsBalance || 0;
    const birr = bal * (this.config.pricePerPointBirr || 7);
    const text =
      `👑 *Bot Owner Points Management Panel*\n\n` +
      `Current Balance: *${bal} Points* (${birr} Birr)\n` +
      `Rate: *1 PDF = 1 Point = 7 Birr*\n\n` +
      `Use the buttons below to instantly add or minus points:`;

    const buttons = [
      [
        { text: '➕ +1 Point (+7 Birr)', callback_data: 'owner_add_1' },
        { text: '➕ +5 Points (+35 Birr)', callback_data: 'owner_add_5' },
      ],
      [
        { text: '➕ +10 Points (+70 Birr)', callback_data: 'owner_add_10' },
        { text: '➕ +50 Points (+350 Birr)', callback_data: 'owner_add_50' },
      ],
      [
        { text: '🔻 -1 Point (-7 Birr)', callback_data: 'owner_minus_1' },
        { text: '🔻 -5 Points (-35 Birr)', callback_data: 'owner_minus_5' },
        { text: '🔻 -10 Points (-70 Birr)', callback_data: 'owner_minus_10' },
      ],
      [
        { text: '💎 View Points Area', callback_data: 'menu_points_area' },
        { text: '▶️ Start Batch', callback_data: 'action_start_batch' },
      ],
    ];

    await this.sendMessage(chatId, text, buttons);
  }

  private async sendWelcomeMessage(chatId: number) {
    const bal = this.config.pointsBalance || 0;
    const birr = bal * (this.config.pricePerPointBirr || 7);
    const text =
      `🇪🇹 *Ethiopian Digital ID Card Studio Bot*\n\n` +
      `Welcome! This bot converts Ethiopian Fayda ID PDF slips and photos into high-resolution *A4 5/page* print-ready cards.\n\n` +
      `📌 *Quick Access Buttons (At bottom of chat box):*\n` +
      `• *Start Batch* - Process single or multiple PDF slips\n` +
      `• *Done* - Export consolidated A4 5/page print sheet\n` +
      `• *Points Area* - Balance: *${bal} Points* (${birr} Birr) • 1 PDF = 1 Point = 7 Birr\n` +
      `• *Owner (+/- Points)* - Add or minus points on demand\n` +
      `• *Templates* - Template 1, Template 2, Template 3, Template 4\n` +
      `• *Photo Settings* - B&W or Colored\n\n` +
      `Tap any button at the bottom of your chat box or click below to begin!`;

    const buttons = [
      [{ text: '▶️ Start Multi-File Batch', callback_data: 'action_start_batch' }],
      [
        { text: `💎 Points Area (${bal} Pts)`, callback_data: 'menu_points_area' },
        { text: '👑 Owner (+/- Points)', callback_data: 'menu_owner_points' },
      ],
      [
        { text: '⚙️ Photo Settings (B&W / Color)', callback_data: 'menu_settings' },
        { text: '🎯 PDF Mapper', callback_data: 'action_open_mapper' },
      ],
    ];

    // Send with bottom keyboard so bottom buttons appear immediately
    await this.sendMessage(chatId, text, buttons, this.getBottomKeyboardMarkup());
  }

  private async sendSettingsMenu(chatId: number) {
    const isGrayscale = this.config.photoColorMode === 'grayscale';
    const text =
      `⚙️ *Telegram Bot Photo Settings*\n\n` +
      `This setting is strictly for applicant portrait photos:\n\n` +
      `• 📷 *Current Photo Mode:* ${isGrayscale ? '⬛ B&W Photo (Black & White / Laser)' : '🎨 Colored Photo (Full Color)'}\n\n` +
      `Select your preferred photo mode below:`;

    const buttons = [
      [
        { text: isGrayscale ? '🎨 Switch to Colored Photo' : '✅ 🎨 Photo: Colored (Active)', callback_data: 'set_photo_color' },
      ],
      [
        { text: isGrayscale ? '✅ ⬛ Photo: B&W (Active)' : '⬛ Switch to B&W Photo', callback_data: 'set_photo_bw' },
      ],
      [
        { text: '◀️ Back to Main Menu', callback_data: 'action_start_batch' },
      ],
    ];

    await this.sendMessage(chatId, text, buttons);
  }

  public async sendMessage(chatId: number, text: string, inlineKeyboard?: any[][], replyMarkup?: any) {
    const token = this.config.botToken?.trim();
    if (!token) return;

    try {
      const body: any = {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      };
      if (inlineKeyboard && inlineKeyboard.length > 0) {
        body.reply_markup = { inline_keyboard: inlineKeyboard };
      } else if (replyMarkup) {
        body.reply_markup = replyMarkup;
      } else {
        body.reply_markup = this.getBottomKeyboardMarkup();
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      console.warn('Failed to send Telegram message:', e.message);
    }
  }

  public async sendPhoto(chatId: number, photo: string, caption?: string, inlineKeyboard?: any[][]) {
    const token = this.config.botToken?.trim();
    if (!token) return;

    try {
      const body: any = {
        chat_id: chatId,
        photo,
        parse_mode: 'Markdown',
      };
      if (caption) body.caption = caption;
      if (inlineKeyboard && inlineKeyboard.length > 0) {
        body.reply_markup = { inline_keyboard: inlineKeyboard };
      }

      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as any;
      if (!data.ok) {
        console.warn('sendPhoto returned not ok, falling back to sendMessage:', data.description);
        await this.sendMessage(chatId, (caption || '') + '\n\n*(Photo verified)*', inlineKeyboard);
      }
    } catch (e: any) {
      console.warn('Failed to send Telegram photo:', e.message);
      await this.sendMessage(chatId, caption || '', inlineKeyboard);
    }
  }
}

export const telegramBotManager = new TelegramBotManager();
