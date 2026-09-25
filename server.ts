import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Telegram Bot Server API
import { telegramBotManager } from './src/server/telegramService.js';

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Ethiopian Digital ID Card Studio' });
});

// Telegram Bot Status & Config
app.get('/api/telegram/status', (req, res) => {
  res.json({ ok: true, status: telegramBotManager.getStatus(), config: telegramBotManager.getConfig() });
});

app.get('/api/telegram/settings', (req, res) => {
  res.json({ ok: true, config: telegramBotManager.getConfig() });
});

app.post('/api/telegram/settings', (req, res) => {
  const updated = telegramBotManager.saveSettings(req.body);
  res.json({ ok: true, config: updated });
});

// Telegram Bot Points & Owner Management Endpoints
app.get('/api/telegram/points', (req, res) => {
  const status = telegramBotManager.getStatus();
  res.json({
    ok: true,
    points: status.pointsBalance,
    pricePerPointBirr: status.pricePerPointBirr,
    pointsPerPdf: status.pointsPerPdf,
  });
});

app.post('/api/telegram/points/adjust', (req, res) => {
  const { action, amount } = req.body;
  const num = parseInt(amount, 10);
  let newBalance: number;

  if (action === 'add') {
    newBalance = telegramBotManager.addPoints(num || 1);
  } else if (action === 'minus') {
    newBalance = telegramBotManager.minusPoints(num || 1);
  } else if (action === 'set') {
    newBalance = telegramBotManager.setPoints(num || 0);
  } else {
    newBalance = telegramBotManager.getStatus().pointsBalance;
  }

  res.json({ ok: true, points: newBalance });
});

app.post('/api/telegram/test-connection', async (req, res) => {
  try {
    const { token } = req.body;
    const botInfo = await telegramBotManager.testConnection(token);
    res.json({ ok: true, bot: botInfo });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message || 'Connection failed' });
  }
});

app.post('/api/telegram/start-polling', async (req, res) => {
  try {
    const success = await telegramBotManager.startPolling();
    res.json({ ok: success, status: telegramBotManager.getStatus() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/telegram/stop-polling', (req, res) => {
  const stopped = telegramBotManager.stopPolling();
  res.json({ ok: stopped, status: telegramBotManager.getStatus() });
});

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    await telegramBotManager.handleUpdate(req.body);
    res.json({ ok: true });
  } catch (err: any) {
    console.warn('Error handling webhook update:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start the Express Server with Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
