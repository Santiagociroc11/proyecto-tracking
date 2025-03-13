import { supabase } from '../lib/supabase-server.js';
import { formatDateToTimezone } from '../src/utils/date.js';

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
    // Get user's settings for timezone and telegram chat ID
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('telegram_chat_id, timezone')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings?.telegram_chat_id) {
      console.log('No Telegram chat ID found for user:', userId);
      return;
    }

    // Get the latest tracking event for this purchase
    const { data: trackingEvent } = await supabase
      .from('tracking_events')
      .select('event_data')
      .eq('visitor_id', purchaseData.purchase.origin.xcod)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Format date according to user's timezone
    const purchaseDate = formatDateToTimezone(
      new Date(purchaseData.creation_date), 
      settings.timezone || 'UTC'
    );

    // Get UTM data from tracking event
    const utmData = trackingEvent?.event_data?.utm_data || {};

    // Format purchase message with detailed information
    const message = `🎉 <b>¡Nueva venta confirmada!</b>\n\n` +
      `📦 Producto: ${purchaseData.product.name}\n` +
      `📅 Fecha: ${purchaseDate}\n\n` +
      `👤 <b>Datos del comprador:</b>\n` +
      `• Nombre: ${purchaseData.buyer.name}\n` +
      `• País: ${purchaseData.buyer.address.country} (${purchaseData.buyer.address.country_iso})\n` +
      `📊 <b>Datos de campaña:</b>\n` +
      `• Campaña: ${utmData.utm_campaign || 'Directo'}\n` +
      `• Fuente: ${utmData.utm_source || 'Directo'}\n` +
      `• Medio: ${utmData.utm_medium || 'Directo'}\n` +
      `• Anuncio: ${utmData.utm_content || 'No especificado'}\n` +
      `• Keyword: ${utmData.utm_term || 'No especificado'}`;

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