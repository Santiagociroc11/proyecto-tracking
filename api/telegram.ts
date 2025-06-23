import { supabase } from '../lib/supabase-server.js';
import { formatDateToTimezone } from '../src/utils/date.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
  message_thread_id?: string;
}

export async function sendTelegramMessage(chatId: string, message: string, threadId?: string, requestId?: string): Promise<boolean> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'telegram_api',
      step,
      ...data
    }, null, 2));
  };
  
  log('start', { chatId, has_thread_id: !!threadId });

  try {
    if (!TELEGRAM_BOT_TOKEN) {
      log('error', { details: 'Telegram bot token not configured' });
      throw new Error('Telegram bot token not configured');
    }

    const telegramMessage: TelegramMessage = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    };

    if (threadId) {
      telegramMessage.message_thread_id = threadId;
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(telegramMessage)
    });

    if (!response.ok) {
      const error = await response.json();
      log('error', { context: 'Telegram API returned non-OK response', details: error });
      throw new Error(`Telegram API error: ${JSON.stringify(error)}`);
    }

    log('success');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
    return false;
  }
}

export async function sendTestNotification(chatId: string, userId?: string, threadId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return { success: false, error: 'Bot de Telegram no configurado en el servidor' };
    }

    if (!chatId || !chatId.trim()) {
      return { success: false, error: 'Chat ID requerido' };
    }

    // Get current time in user's timezone if available
    let formattedTime = new Date().toLocaleString('es-ES');
    
    if (userId) {
      try {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('timezone')
          .eq('user_id', userId)
          .single();

        if (settings?.timezone) {
          formattedTime = formatDateToTimezone(new Date(), settings.timezone);
        }
      } catch (err) {
        // Continue with default time if user settings not found
        console.log('Could not fetch user timezone for test notification');
      }
    }

    const testMessage = `🧪 <b>Notificación de Prueba</b>\n\n` +
      `✅ ¡Tu configuración de Telegram está funcionando correctamente!\n\n` +
      `📅 Fecha de prueba: ${formattedTime}\n` +
      `🔔 Ahora recibirás notificaciones automáticas cuando tengas ventas.\n\n` +
      `💡 <i>Este es un mensaje de prueba generado desde la configuración de tu cuenta.</i>`;

    const success = await sendTelegramMessage(chatId, testMessage, threadId);

    if (success) {
      // Log test notification
      if (userId) {
        await supabase
          .from('telegram_notifications')
          .insert([{
            user_id: userId,
            message: testMessage,
            status: 'sent',
            error_message: null
          }]);
      }
      
      return { success: true };
    } else {
      return { success: false, error: 'No se pudo enviar el mensaje. Verifica que el Chat ID sea correcto y que hayas iniciado una conversación con el bot.' };
    }

  } catch (error) {
    console.error('Error sending test notification:', error);
    return { success: false, error: 'Error interno del servidor al enviar la notificación' };
  }
}

export async function notifyPurchase(
  userId: string, 
  purchaseData: any, 
  producerPrice?: { value: number; currency_value: string },
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'telegram_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, product_name: purchaseData.product.name, transaction: purchaseData.purchase.transaction });

  try {
    // Get user's settings for timezone and telegram chat ID
    log('query_user_settings_start');
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('telegram_chat_id, telegram_thread_id, timezone')
      .eq('user_id', userId)
      .single();
      
    log('query_user_settings_end', { has_data: !!settings, has_error: !!settingsError, error_details: settingsError?.message });

    if (settingsError || !settings?.telegram_chat_id) {
      log('error', { 
        context: 'Could not retrieve user settings or Telegram Chat ID is missing', 
        user_id: userId, 
        details: settingsError?.message 
      });
      return;
    }

    // Get the latest non-purchase tracking event for this visitor
    const visitorId = purchaseData.purchase.origin.xcod;
    log('query_tracking_event_start', { visitor_id: visitorId });
    const { data: trackingEvent, error: trackingEventError } = await supabase
      .from('tracking_events')
      .select('event_data, event_type, created_at')
      .eq('visitor_id', purchaseData.purchase.origin.xcod)
      .neq('event_type', 'compra_hotmart') // Exclude purchase events
      .neq('event_type', 'compra_hotmart_orderbump') // Exclude order bump events
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    log('query_tracking_event_end', { 
      found: !!trackingEvent, 
      has_error: !!trackingEventError, 
      error_details: trackingEventError?.message
    });

    if(trackingEventError) {
      log('warning', { 
        context: 'Error querying tracking event, will proceed without UTM data', 
        details: trackingEventError.message 
      });
    }

    // Check if this is an order bump - explicit boolean check
    const isOrderBump = purchaseData.purchase.order_bump?.is_order_bump === true &&
                        !!purchaseData.purchase.order_bump?.parent_purchase_transaction;
    const parentTransaction = purchaseData.purchase.order_bump?.parent_purchase_transaction || null;

    log('purchase_details_extracted', { is_order_bump: isOrderBump, parent_transaction: parentTransaction });

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
    log('utm_data_extracted', { utm_data: utmData });

    // Use producer price if available, otherwise fallback to original offer price
    const priceToShow = producerPrice || purchaseData.purchase.original_offer_price;
    log('price_determined', { 
      has_producer_price: !!producerPrice, 
      final_price: priceToShow.value,
      final_currency: priceToShow.currency_value
    });
    
    // Different message format for order bump vs regular purchase
    let message: string;
    
    if (isOrderBump) {
      message = `🚀 <b>¡ORDER BUMP VENDIDO!</b>\n\n` +
        `📦 Producto: ${purchaseData.product.name}\n` +
        `💰 Valor: ${priceToShow.currency_value} ${priceToShow.value}\n` +
        `📅 Fecha: ${approvedDate}\n` +
        `🔗 Transacción padre: ${parentTransaction}\n\n` +
        `👤 <b>Datos del comprador:</b>\n` +
        `• Nombre: ${purchaseData.buyer.name}\n` +
        `• Email: ${purchaseData.buyer.email}\n` +
        `• País: ${purchaseData.buyer.address.country} (${purchaseData.buyer.address.country_iso})\n\n` +
        `📊 <b>Datos de campaña:</b>\n` +
        `• Campaña: ${utmData.utm_campaign || 'Directo'}\n` +
        `• Fuente: ${utmData.utm_source || 'Directo'}\n` +
        `• Medio: ${utmData.utm_medium || 'Directo'}\n` +
        `• Anuncio: ${utmData.utm_content || 'No especificado'}\n\n` +
        `🎯 <i>¡Felicitaciones! Este es un ingreso adicional por order bump.</i>`;
    } else {
      message = `🎉 <b>¡VENTA CONFIRMADA!</b>\n\n` +
        `📦 Producto: ${purchaseData.product.name}\n` +
        `💰 Valor: ${priceToShow.currency_value} ${priceToShow.value}\n` +
        `📅 Fecha: ${approvedDate}\n\n` +
        `👤 <b>Datos del comprador:</b>\n` +
        `• Nombre: ${purchaseData.buyer.name}\n` +
        `• Email: ${purchaseData.buyer.email}\n` +
        `• País: ${purchaseData.buyer.address.country} (${purchaseData.buyer.address.country_iso})\n\n` +
        `📊 <b>Datos de campaña:</b>\n` +
        `• Campaña: ${utmData.utm_campaign || 'Directo'}\n` +
        `• Fuente: ${utmData.utm_source || 'Directo'}\n` +
        `• Medio: ${utmData.utm_medium || 'Directo'}\n` +
        `• Anuncio: ${utmData.utm_content || 'No especificado'}\n`;
    }

    log('message_formatted', { message_length: message.length });

    // Send notification
    const success = await sendTelegramMessage(settings.telegram_chat_id, message, settings.telegram_thread_id, requestId);

    log('database_log_start', { status_to_log: success ? 'sent' : 'failed' });
    // Log notification attempt
    await supabase
      .from('telegram_notifications')
      .insert([{
        user_id: userId,
        message,
        status: success ? 'sent' : 'failed',
        error_message: success ? null : 'Failed to send Telegram message'
      }]);
    
    log('database_log_end');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}