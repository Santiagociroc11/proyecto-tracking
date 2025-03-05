import { supabase } from '../lib/supabase-server.js';

interface TrackingEvent {
  tracking_id: string;
  type: string;
  visitor_id: string;
  session_id: string;
  page_view_id: string;
  url: string;
  referrer?: string;
  user_agent?: string;
  screen_resolution?: string;
  viewport_size?: string;
  event_data: {
    ip?: string;
    browser_info?: {
      userAgent?: string;
      platform?: string;
      language?: string;
      cookiesEnabled?: boolean;
    };
    fbc?: string;
    fbp?: string;
    utm_data?: {
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_term?: string;
    };
    [key: string]: any;
  };
}

interface Product {
  id: string;
  user_id: string;
  active: boolean;
  fb_pixel_id: string | null;
  fb_access_token: string | null;
  fb_test_event_code: string | null;
}

const DEBUG_MODE = true;

type LogFunction = (context: string, message: string, data?: any) => void;

async function validateTracking(
  userId: string,
  productId: string,
  log: LogFunction
): Promise<{ valid: boolean; error?: string; type?: string; plan?: string }> {
  try {
    log('Validation', 'Validating tracking permissions', { userId, productId });
    
    const { data, error } = await supabase
      .rpc('validate_tracking', {
        p_user_id: userId,
        p_product_id: productId
      });

    if (error) {
      log('Validation', 'Error validating tracking', error);
      return { valid: false, error: 'Error validating tracking permissions' };
    }

    log('Validation', 'Validation result', data);
    return data;
  } catch (err) {
    log('Validation', 'Unexpected error in validation', err);
    return { valid: false, error: 'Internal validation error' };
  }
}

async function logTrackingAttempt(
  userId: string,
  productId: string,
  eventType: string,
  status: string,
  errorMessage: string | undefined,
  log: LogFunction
): Promise<void> {
  try {
    log('Logging', 'Recording tracking attempt', {
      userId,
      productId,
      eventType,
      status,
      errorMessage
    });

    await supabase.rpc('log_tracking_attempt', {
      p_user_id: userId,
      p_product_id: productId,
      p_event_type: eventType,
      p_status: status,
      p_error_message: errorMessage
    });

    log('Logging', 'Tracking attempt recorded successfully');
  } catch (err) {
    log('Logging', 'Error recording tracking attempt', err);
  }
}

async function sendFacebookConversion(
  product: Product,
  data: TrackingEvent,
  log: LogFunction
): Promise<void> {
  try {
    if (!product.fb_pixel_id || !product.fb_access_token) {
      log('Facebook', 'Facebook Pixel ID or Access Token not configured');
      return;
    }

    const eventPayload: any = {
      data: [{
        event_name: "InitiateCheckout",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: {
          client_ip_address: data.event_data?.ip || null,
          client_user_agent: data.user_agent || data.event_data?.browser_info?.userAgent || null,
          fbc: data.event_data?.fbc || null,
          fbp: data.event_data?.fbp || null
        }
      }]
    };

    if (product.fb_test_event_code) {
      eventPayload.test_event_code = product.fb_test_event_code;
    }

    const fbUrl = `https://graph.facebook.com/v21.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`;
    log('Facebook', 'Sending conversion event', { url: fbUrl, payload: eventPayload });

    const response = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      log('Facebook', 'Error from Facebook API', errorData);
      throw new Error(`Facebook API error: ${response.status}`);
    }

    const result = await response.json();
    log('Facebook', 'Facebook API response', result);
  } catch (error) {
    log('Facebook', 'Error sending Facebook conversion', error);
  }
}

export async function handleTrackingEvent(data: TrackingEvent): Promise<{ 
  success: boolean; 
  debugLogs: any[]; 
  error?: string 
}> {
  const debugLogs: any[] = [];

  const log: LogFunction = (context, message, logData?) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, context, message, data: logData };
    debugLogs.push(logEntry);
    if (DEBUG_MODE) {
      console.debug(`[${timestamp}] [${context}] ${message}`, logData ? JSON.stringify(logData, null, 2) : '');
    }
  };

  log('Event', 'Iniciando handleTrackingEvent', { raw_event: data });

  if (!data.tracking_id || !data.type || !data.visitor_id) {
    const errorMsg = 'Datos del evento incompletos';
    log('Event', errorMsg, { data });
    return { success: false, debugLogs, error: errorMsg };
  }

  try {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select<string, Product>(`
        id,
        user_id,
        active,
        fb_pixel_id,
        fb_access_token,
        fb_test_event_code
      `)
      .eq('tracking_id', data.tracking_id)
      .single();

    if (productError || !product) {
      log('Event', 'Producto no encontrado', { tracking_id: data.tracking_id });
      return { success: false, debugLogs, error: 'Producto no encontrado' };
    }

    const validation = await validateTracking(product.user_id, product.id, log);

    if (!validation.valid) {
      await logTrackingAttempt(
        product.user_id,
        product.id,
        data.type,
        'failed',
        validation.error,
        log
      );
      
      log('Event', 'Tracking validation failed', validation);
      return { success: false, debugLogs, error: validation.error };
    }

    const eventData = {
      product_id: product.id,
      event_type: data.type,
      visitor_id: data.visitor_id,
      session_id: data.session_id,
      page_view_id: data.page_view_id,
      url: data.url,
      referrer: data.referrer,
      user_agent: data.user_agent || data.event_data?.browser_info?.userAgent,
      screen_resolution: data.screen_resolution,
      viewport_size: data.viewport_size,
      event_data: {
        ...data.event_data,
        tracking_validation: {
          type: validation.type,
          plan: validation.plan
        }
      }
    };

    log('Event', 'Inserting tracking event', eventData);

    const { error: insertError } = await supabase
      .from('tracking_events')
      .insert([eventData]);

    if (insertError) {
      await logTrackingAttempt(
        product.user_id,
        product.id,
        data.type,
        'failed',
        insertError.message,
        log
      );
      
      log('Event', 'Error inserting event', insertError);
      return { success: false, debugLogs, error: 'Error registrando evento' };
    }

    // Si es un hotmart_click, enviar conversión a Facebook
    if (data.type === 'hotmart_click') {
      log('Facebook', 'Processing hotmart_click', { event_data: data.event_data });
      await sendFacebookConversion(product, data, log);
    }

    await logTrackingAttempt(
      product.user_id,
      product.id,
      data.type,
      'success',
      undefined,
      log
    );

    log('Event', 'Evento procesado exitosamente');
    return { success: true, debugLogs };
  } catch (error) {
    log('Event', 'Error procesando evento', error);
    return { 
      success: false, 
      debugLogs, 
      error: error instanceof Error ? error.message : 'Error interno del servidor' 
    };
  }
}