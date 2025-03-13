import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, 'data', 'users.json');
const LOCK_FILE = join(__dirname, 'data', 'bot.lock');

// Initialize bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Check if another instance is running
async function checkLock() {
  try {
    await fs.access(LOCK_FILE);
    // Lock file exists, check if it's stale (older than 1 minute)
    const stats = await fs.stat(LOCK_FILE);
    const now = new Date();
    const lockAge = (now.getTime() - stats.mtime.getTime()) / 1000;
    
    if (lockAge < 60) {
      console.error('Another bot instance is already running');
      process.exit(1);
    }
    
    // Lock is stale, remove it
    await fs.unlink(LOCK_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error checking lock file:', err);
      process.exit(1);
    }
  }
}

// Create lock file
async function createLock() {
  try {
    await fs.writeFile(LOCK_FILE, process.pid.toString());
  } catch (err) {
    console.error('Error creating lock file:', err);
    process.exit(1);
  }
}

// Remove lock file on exit
async function cleanup() {
  try {
    await fs.unlink(LOCK_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error removing lock file:', err);
    }
  }
}

// Store user chat IDs
async function saveUser(chatId, username) {
  try {
    let users = {};
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    users[chatId] = {
      username,
      registeredAt: new Date().toISOString()
    };

    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error saving user:', err);
  }
}

async function startBot() {
  await ensureDataDirectory();
  await checkLock();
  await createLock();

  const bot = new TelegramBot(token, { 
    polling: true,
    filepath: false // Disable file download
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    if (error.code === 'ETELEGRAM' && error.message.includes('terminated by other getUpdates')) {
      console.log('Detected conflict with another instance, shutting down...');
      cleanup().then(() => process.exit(1));
    }
  });

  bot.on('error', (error) => {
    console.error('Bot error:', error);
  });

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    await saveUser(chatId, username);

    const message = `¡Hola! 👋\n\n` +
      `Tu Chat ID es: <code>${chatId}</code>\n\n` +
      `Copia este ID y pégalo en la configuración de tu cuenta para recibir notificaciones de ventas.`;

    bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  });

  // Handle /help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const message = `🤖 *Comandos disponibles:*\n\n` +
      `• /start - Obtener tu Chat ID\n` +
      `• /help - Ver esta ayuda\n` +
      `• /status - Verificar si el bot está activo`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });

  // Handle /status command
  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '✅ ¡El bot está activo y funcionando correctamente!');
  });

  console.log('Bot started successfully!');

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    cleanup().then(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down bot...');
    cleanup().then(() => process.exit(0));
  });
}

// Start the bot
startBot().catch(err => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});