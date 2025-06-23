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
  id: number | string;
  active: boolean;
  fb_pixel_id?: string | null;
  fb_access_token?: string | null;
  fb_test_event_code?: string | null;
  user_id: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  subscription?: any;
  monthlyEventsCount?: number;
  monthlyEventsLimit?: number;
}

const DEBUG_MODE = true;

type LogFunction = (context: string, message: string, data?: any) => void;

async function validateUserStatus(
  userId: string,
  log: LogFunction
): Promise<ValidationResult> {
  try {
    log('UserStatus', 'Validando estado del usuario', { userId });

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('active, events_count, max_monthly_events')
      .eq('id', userId)
      .single();

    if (userError) {
      log('UserStatus', 'Error verificando estado del usuario', userError);
      return { valid: false, error: 'Error validando estado del usuario' };
    }

    if (!user || !user.active) {
      log('UserStatus', 'Usuario inactivo o no encontrado', { user });
      return { valid: false, error: 'Usuario inactivo' };
    }

    // Check if user has exceeded their monthly event limit
    if (user.events_count >= user.max_monthly_events) {
      log('UserStatus', 'Usuario excedió límite mensual de eventos', {
        current: user.events_count,
        limit: user.max_monthly_events
      });
      return { 
        valid: false, 
        error: 'Límite mensual de eventos excedido',
        monthlyEventsCount: user.events_count,
        monthlyEventsLimit: user.max_monthly_events
      };
    }

    log('UserStatus', 'Usuario activo', { user });
    return { 
      valid: true,
      monthlyEventsCount: user.events_count,
      monthlyEventsLimit: user.max_monthly_events
    };
  } catch (err) {
    log('UserStatus', 'Error inesperado validando estado del usuario', err);
    return { valid: false, error: 'Error interno validando estado del usuario' };
  }
}

async function validateTracking(
  userId: string,
  productId: string,
  log: LogFunction
): Promise<ValidationResult> {
  try {
    // Primero validamos el estado del usuario
    const userValidation = await validateUserStatus(userId, log);
    if (!userValidation.valid) {
      return userValidation;
    }

    // Validar el producto específico
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('active')
      .eq('id', productId)
      .eq('user_id', userId)
      .single();

    if (productError || !product) {
      log('Validation', 'Error validando producto', { productId, error: productError });
      return { valid: false, error: 'Producto no encontrado' };
    }

    if (!product.active) {
      log('Validation', 'Producto inactivo', { productId });
      return { valid: false, error: 'Producto inactivo' };
    }

    return {
      ...userValidation,
      valid: true
    };
  } catch (err) {
    log('Validation', 'Error inesperado en validación', err);
    return { valid: false, error: 'Error interno de validación' };
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
    log('Logging', 'Registrando intento de tracking', {
      userId,
      productId,
      eventType,
      status,
      errorMessage
    });

    const { error } = await supabase
      .from('tracking_logs')
      .insert([{
        user_id: userId,
        product_id: productId,
        event_type: eventType,
        status,
        error_message: errorMessage,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      log('Logging', 'Error registrando intento', error);
    } else {
      log('Logging', 'Intento registrado exitosamente');
    }
  } catch (err) {
    log('Logging', 'Error inesperado registrando intento', err);
  }
}

async function updateUserEventCount(
  userId: string,
  log: LogFunction
): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_user_events_count', {
      p_user_id: userId
    });

    if (error) {
      log('EventCount', 'Error actualizando contador de eventos', error);
      throw error;
    }
    
    log('EventCount', 'Contador de eventos actualizado exitosamente');
  } catch (err) {
    log('EventCount', 'Error inesperado actualizando contador', err);
    throw err;
  }
}

async function sendFacebookConversion(
  product: Product,
  data: TrackingEvent,
  log: LogFunction
): Promise<void> {
  try {
    if (!product.fb_pixel_id || !product.fb_access_token) {
      log('Facebook', 'Facebook Pixel ID o Access Token no configurados');
      return;
    }

    const user_data: { [key: string]: any } = {
      client_ip_address: data.event_data?.ip,
      fbc: data.event_data?.fbc,
      fbp: data.event_data?.fbp,
    };

    const userAgent = data.user_agent || data.event_data?.browser_info?.userAgent;
    if (userAgent) {
      user_data.client_user_agent = userAgent;
    }

    if (data.visitor_id && typeof data.visitor_id === 'string' && data.visitor_id.length > 0) {
      user_data.external_id = [hashSHA256(data.visitor_id)];
    }

    const eventPayload: any = {
      data: [{
        event_name: "InitiateCheckout",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: user_data
      }]
    };

    if (product.fb_test_event_code) {
      eventPayload.test_event_code = product.fb_test_event_code;
    }

    const fbUrl = `https://graph.facebook.com/v21.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`;
    log('Facebook', 'Enviando evento de conversión con external_id', { 
      url: fbUrl, 
      payload: eventPayload,
      visitor_id: data.visitor_id 
    });

    const response = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      log('Facebook', 'Error de API de Facebook', errorData);
      throw new Error(`Error de API de Facebook: ${response.status}`);
    }

    const result = await response.json();
    log('Facebook', 'Respuesta de API de Facebook', result);
  } catch (error) {
    log('Facebook', 'Error enviando conversión a Facebook', error);
  }
}

function decodeUtmParameters(eventData: TrackingEvent['event_data']): TrackingEvent['event_data'] {
  if (!eventData.utm_data) {
    return eventData;
  }

  const decodedUtmData: { [key: string]: string | undefined } = {};
  for (const key in eventData.utm_data) {
    const value = eventData.utm_data[key as keyof typeof eventData.utm_data];
    if (typeof value === 'string') {
      try {
        decodedUtmData[key] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch (e) {
        // Si falla la decodificación, mantenemos el valor original
        decodedUtmData[key] = value;
      }
    }
  }

  return {
    ...eventData,
    utm_data: decodedUtmData as TrackingEvent['event_data']['utm_data'],
  };
}

export async function handleTrackingEvent(data: TrackingEvent): Promise<{ 
  success: boolean; 
  debugLogs: any[]; 
  error?: string;
  validation?: ValidationResult;
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

  try {
    // Decodificar UTMs al inicio
    if (data.event_data) {
      data.event_data = decodeUtmParameters(data.event_data);
    }

    log('Start', 'Iniciando handleTrackingEvent', data);

    if (!data || !data.tracking_id || !data.type) {
      const errorMsg = 'Datos del evento incompletos';
      log('Event', errorMsg, { data });
      return { success: false, debugLogs, error: errorMsg };
    }

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

    // Validate product is active
    if (!product.active) {
      log('Event', 'Producto inactivo', { productId: product.id });
      return { success: false, debugLogs, error: 'Producto inactivo' };
    }

    // Check user status
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('active, events_count, max_monthly_events')
      .eq('id', product.user_id)
      .single();

    if (userError || !userData) {
      log('Event', 'Error verificando estado del usuario', userError);
      return { success: false, debugLogs, error: 'Error verificando estado del usuario' };
    }

    if (!userData.active) {
      log('Event', 'Usuario inactivo', { userId: product.user_id });
      return { success: false, debugLogs, error: 'Usuario inactivo' };
    }

    // Check event limits
    if (userData.events_count >= userData.max_monthly_events) {
      log('Event', 'Límite mensual de eventos excedido', {
        current: userData.events_count,
        limit: userData.max_monthly_events
      });
      return { 
        success: false, 
        debugLogs, 
        error: 'Límite mensual de eventos excedido',
        validation: {
          valid: false,
          monthlyEventsCount: userData.events_count,
          monthlyEventsLimit: userData.max_monthly_events
        }
      };
    }

    // Insert event
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
          events_count: userData.events_count,
          events_limit: userData.max_monthly_events
        }
      }
    };

    log('Event', 'Insertando evento de tracking', eventData);

    const { error: insertError } = await supabase
      .from('tracking_events')
      .insert([eventData]);

    if (insertError) {
      log('Event', 'Error insertando evento', insertError);
      return { 
        success: false, 
        debugLogs, 
        error: 'Error registrando evento'
      };
    }

    // Update event count
    const { error: updateError } = await supabase
      .from('users')
      .update({ events_count: userData.events_count + 1 })
      .eq('id', product.user_id);

    if (updateError) {
      log('Event', 'Error actualizando contador de eventos', updateError);
    }

    // Handle Facebook conversion if needed
    if (data.type === 'hotmart_click') {
      log('Facebook', 'Procesando hotmart_click', { event_data: data.event_data });
      await sendFacebookConversion(product, data, log);
    }

    log('Event', 'Evento procesado exitosamente');
    return { 
      success: true, 
      debugLogs,
      validation: {
        valid: true,
        monthlyEventsCount: userData.events_count + 1,
        monthlyEventsLimit: userData.max_monthly_events
      }
    };
  } catch (error) {
    log('Event', 'Error procesando evento', error);
    return { 
      success: false, 
      debugLogs, 
      error: error instanceof Error ? error.message : 'Error interno del servidor' 
    };
  }
}