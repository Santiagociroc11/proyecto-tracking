import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, 'users.json');

// Initialize bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

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