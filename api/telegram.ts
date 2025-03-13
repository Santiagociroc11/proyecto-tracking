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

    // Get the latest non-purchase tracking event for this visitor
    const { data: trackingEvent } = await supabase
      .from('tracking_events')
      .select('event_data')
      .eq('visitor_id', purchaseData.purchase.origin.xcod)
      .neq('event_type', 'compra_hotmart') // Exclude purchase events
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Format dates according to user's timezone
    const orderDate = formatDateToTimezone(
      new Date(purchaseData.purchase.order_date), 
      settings.timezone || 'UTC'
    );
    
    const approvedDate = formatDateToTimezone(
      new Date(purchaseData.purchase.approved_date), 
      settings.timezone || 'UTC'
    );

    // Get UTM data from tracking event
    const utmData = trackingEvent?.event_data?.utm_data || {};

    // Format purchase message with detailed information
    const message = `🎉 <b>¡VENTA CONFIRMADA!</b>\n\n` +
      `📦 Producto: ${purchaseData.product.name}\n` +
      `💰 Valor: ${purchaseData.purchase.price.currency_code} ${purchaseData.purchase.price.value}\n` +
      `⏰ <b>Fechas:</b>\n` +
      `• Aprobación: ${approvedDate}\n\n` +
      `👤 <b>Datos del comprador:</b>\n` +
      `• Nombre: ${purchaseData.buyer.name}\n` +
      `• Email: ${purchaseData.buyer.email}\n` +
      `• País: ${purchaseData.buyer.address.country} (${purchaseData.buyer.address.country_iso})\n` +
      `📊 <b>Datos de campaña:</b>\n` +
      `• Campaña: ${utmData.utm_campaign || 'Directo'}\n` +
      `• Fuente: ${utmData.utm_source || 'Directo'}\n` +
      `• Medio: ${utmData.utm_medium || 'Directo'}\n` +
      `• Anuncio: ${utmData.utm_content || 'No especificado'}\n`;

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