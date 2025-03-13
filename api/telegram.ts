import { supabase } from '../lib/supabase-server.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
}

export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error('Telegram bot token not configured');
    }

    const telegramMessage: TelegramMessage = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    };

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(telegramMessage)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Telegram API error: ${JSON.stringify(error)}`);
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

export async function notifyPurchase(userId: string, purchaseData: any): Promise<void> {
  try {
    // Get user's telegram chat ID
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('telegram_chat_id')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings?.telegram_chat_id) {
      console.log('No Telegram chat ID found for user:', userId);
      return;
    }

    // Format purchase message
    const message = `🎉 <b>¡Nueva venta confirmada!</b>\n\n` +
      `📦 Producto: ${purchaseData.product.name}\n` +
      `💰 Valor: ${purchaseData.price.currency_value} ${purchaseData.price.value}\n` +
      `👤 Comprador: ${purchaseData.buyer.name}\n` +
      `📧 Email: ${purchaseData.buyer.email}\n` +
      `🌎 País: ${purchaseData.buyer.address.country}`;

    // Send notification
    const success = await sendTelegramMessage(settings.telegram_chat_id, message);

    // Log notification attempt
    await supabase
      .from('telegram_notifications')
      .insert([{
        user_id: userId,
        message,
        status: success ? 'sent' : 'failed',
        error_message: success ? null : 'Failed to send Telegram message'
      }]);

  } catch (error) {
    console.error('Error sending purchase notification:', error);
  }
}