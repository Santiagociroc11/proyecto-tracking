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

  // Helper function to get chat information
  function getChatInfo(msg) {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    const chatType = msg.chat.type;
    const isTopicMessage = messageThreadId !== undefined;
    
    let info = {
      chatId,
      chatType,
      isPrivate: chatType === 'private',
      isGroup: chatType === 'group' || chatType === 'supergroup',
      isChannel: chatType === 'channel',
      messageThreadId,
      isTopicMessage,
      chatTitle: msg.chat.title,
      username: msg.from?.username
    };
    
    return info;
  }

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const info = getChatInfo(msg);
    
    await saveUser(info.chatId, info.username);

    let message = `¡Hola! 👋\n\n`;
    
    if (info.isPrivate) {
      message += `📱 <b>Chat Privado Detectado</b>\n\n` +
        `Tu Chat ID es: <code>${info.chatId}</code>\n\n` +
        `Copia este ID y pégalo en la configuración de tu cuenta para recibir notificaciones de ventas.`;
    } else if (info.isGroup) {
      message += `👥 <b>Grupo Detectado</b>\n` +
        `Nombre: ${info.chatTitle}\n\n` +
        `Chat ID del Grupo: <code>${info.chatId}</code>\n`;
      
      if (info.isTopicMessage) {
        message += `📋 <b>Tema Detectado</b>\n` +
          `Thread ID: <code>${info.messageThreadId}</code>\n\n` +
          `Para notificaciones en este tema específico:\n` +
          `• Chat ID: <code>${info.chatId}</code>\n` +
          `• Thread ID: <code>${info.messageThreadId}</code>`;
      } else {
        message += `\n💡 <i>Para notificaciones en un tema específico, usa /info dentro del tema.</i>`;
      }
    }

    bot.sendMessage(info.chatId, message, { 
      parse_mode: 'HTML',
      message_thread_id: info.messageThreadId
    });
  });

  // Handle /info command - detailed information about current chat
  bot.onText(/\/info/, async (msg) => {
    const info = getChatInfo(msg);
    
    let message = `ℹ️ <b>Información del Chat</b>\n\n`;
    
    if (info.isPrivate) {
      message += `📱 <b>Tipo:</b> Chat Privado\n` +
        `👤 <b>Usuario:</b> @${info.username || 'Sin username'}\n` +
        `🆔 <b>Chat ID:</b> <code>${info.chatId}</code>\n\n` +
        `✅ <b>Para configurar notificaciones:</b>\n` +
        `Copia el Chat ID y pégalo en la configuración de tu cuenta.`;
    } else if (info.isGroup) {
      message += `👥 <b>Tipo:</b> ${info.chatType === 'supergroup' ? 'Supergrupo' : 'Grupo'}\n` +
        `📝 <b>Nombre:</b> ${info.chatTitle}\n` +
        `🆔 <b>Chat ID:</b> <code>${info.chatId}</code>\n`;
      
      if (info.isTopicMessage) {
        message += `📋 <b>Tema:</b> Sí\n` +
          `🧵 <b>Thread ID:</b> <code>${info.messageThreadId}</code>\n\n` +
          `✅ <b>Para notificaciones en este tema:</b>\n` +
          `• Chat ID: <code>${info.chatId}</code>\n` +
          `• Thread ID: <code>${info.messageThreadId}</code>\n\n` +
          `💡 <i>Necesitarás ambos IDs para configurar notificaciones específicas del tema.</i>`;
      } else {
        message += `📋 <b>Tema:</b> No (mensaje general del grupo)\n\n` +
          `✅ <b>Para notificaciones generales del grupo:</b>\n` +
          `Usa solo el Chat ID: <code>${info.chatId}</code>\n\n` +
          `💡 <i>Para tema específico, envía /info desde dentro del tema.</i>`;
      }
    } else if (info.isChannel) {
      message += `📢 <b>Tipo:</b> Canal\n` +
        `📝 <b>Nombre:</b> ${info.chatTitle}\n` +
        `🆔 <b>Chat ID:</b> <code>${info.chatId}</code>`;
    }
    
    message += `\n\n🔧 <b>Uso:</b> Copia los IDs mostrados arriba para configurar las notificaciones en tu cuenta.`;

    bot.sendMessage(info.chatId, message, { 
      parse_mode: 'HTML',
      message_thread_id: info.messageThreadId
    });
  });

  // Handle /help command
  bot.onText(/\/help/, (msg) => {
    const info = getChatInfo(msg);
    const message = `🤖 <b>Comandos disponibles:</b>\n\n` +
      `• /start - Información básica y Chat ID\n` +
      `• /info - Información detallada del chat actual\n` +
      `• /help - Ver esta ayuda\n` +
      `• /status - Verificar si el bot está activo\n\n` +
      `💡 <b>Tip:</b> Usa /info para obtener información completa sobre grupos y temas.`;

    bot.sendMessage(info.chatId, message, { 
      parse_mode: 'HTML',
      message_thread_id: info.messageThreadId
    });
  });

  // Handle /status command
  bot.onText(/\/status/, (msg) => {
    const info = getChatInfo(msg);
    bot.sendMessage(info.chatId, '✅ ¡El bot está activo y funcionando correctamente!', {
      message_thread_id: info.messageThreadId
    });
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