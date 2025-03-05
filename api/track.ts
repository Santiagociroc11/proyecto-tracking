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
}

const DEBUG_MODE = true;

async function getProduct(
  tracking_id: string,
  log: (context: string, message: string, data?: any) => void
): Promise<Product | null> {
  log('DB', 'Iniciando getProduct', { tracking_id });
  try {
    log('DB', 'Ejecutando consulta para obtener producto', { tracking_id });
    const { data: product, error } = await supabase
      .from('products')
      .select('id, active, fb_pixel_id, fb_access_token, fb_test_event_code')
      .eq('tracking_id', tracking_id)
      .single();
      
    log('DB', 'Consulta ejecutada', { product, error });
    
    if (error) {
      log('DB', 'Error obteniendo producto', error);
      return null;
    }
    if (!product) {
      log('DB', 'Producto no encontrado', { tracking_id });
      return null;
    }
    log('DB', 'Producto encontrado', { product });
    return product as Product;
  } catch (err) {
    log('DB', 'Error inesperado en getProduct', err instanceof Error ? err.stack : err);
    return null;
  }
}

function mapEventType(type: string): string {
  // Lista de tipos permitidos según el ENUM tracking_event_type en la DB
  const allowedEventTypes = ['pageview', 'interaction', 'input_change', 'hotmart_click'];
  
  // Mapeo de tipos de eventos a los valores del ENUM
  const eventTypeMapping: { [key: string]: string } = {
    'hotmart_click': 'hotmart_click',
    'pageview': 'pageview',
    'interaction': 'interaction',
    'input_change': 'input_change'
  };
  
  const mappedType = eventTypeMapping[type] || 'custom';
  if (!allowedEventTypes.includes(mappedType)) {
    throw new Error(`Tipo de evento no permitido: ${type}`);
  }
  return mappedType;
}

/**
 * Dispara la API de conversiones de Facebook replicando la data de tu flujo n8n.
 */
async function sendFacebookConversion(
  product: Product,
  trackingEvent: TrackingEvent,
  commonEventData: any,
  log: (context: string, message: string, data?: any) => void
): Promise<void> {
  // Verificar que existan los datos necesarios.
  if (!product.fb_pixel_id || !product.fb_access_token) {
    log('Facebook', 'Datos de Facebook incompletos en producto', { product });
    return;
  }
  // Construir el payload con los datos de tu flujo n8n.
  const fbPayload = {
    data: [
      {
        event_name: "InitiateCheckout",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        original_event_data: {
          event_name: "InitiateCheckout",
          event_time: Math.floor(Date.now() / 1000)
        },
        user_data: {
          client_ip_address: trackingEvent.event_data?.ip || null,
          client_user_agent: trackingEvent.user_agent || trackingEvent.event_data?.browser_info?.userAgent || null,
          fbc: commonEventData.fbc,
          fbp: commonEventData.fbp
        }
      }
    ]
  };

  const fbUrl = `https://graph.facebook.com/v21.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`;
  log('Facebook', 'Disparando API de conversiones', { url: fbUrl, payload: fbPayload });

  try {
    const fbResponse = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fbPayload)
    });
    log('Facebook', 'Respuesta HTTP de Facebook', {
      status: fbResponse.status,
      ok: fbResponse.ok
    });
    // Intentar convertir a JSON y loguear la respuesta.
    const fbResult = await fbResponse.json();
    log('Facebook', 'Respuesta de Facebook (JSON)', { fbResult });
  } catch (error) {
    log('Facebook', 'Error llamando API de Facebook', error);
  }
}

export async function handleTrackingEvent(data: TrackingEvent): Promise<{ success: boolean; debugLogs: any[]; error?: string }> {
  const debugLogs: any[] = [];

  const log = (context: string, message: string, logData?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, context, message, data: logData };
    debugLogs.push(logEntry);
    const logMessage = `[${timestamp}] [HotAPI Backend] [${context}] ${message}`;
    if (DEBUG_MODE) {
      console.debug(logMessage, logData ? JSON.stringify(logData, null, 2) : '');
    } else {
      console.log(logMessage, logData || '');
    }
  };

  log('Event', 'Iniciando handleTrackingEvent', { raw_event: data });

  if (!data.tracking_id || !data.type || !data.visitor_id) {
    const errorMsg = 'Datos del evento incompletos';
    log('Event', errorMsg, { data });
    return { success: false, debugLogs, error: errorMsg };
  }

  const { tracking_id, type } = data;
  log('Event', 'Datos básicos validados', { tracking_id, type, visitor_id: data.visitor_id });

  try {
    log('Event', 'Verificando producto asociado', { tracking_id });
    const product = await getProduct(tracking_id, log);
    
    if (!product) {
      const errMsg = 'Producto no encontrado';
      log('Event', errMsg, { tracking_id });
      return { success: false, debugLogs, error: errMsg };
    }
    if (!product.active) {
      const errMsg = 'Producto inactivo';
      log('Event', errMsg, { tracking_id, product });
      return { success: false, debugLogs, error: errMsg };
    }
    log('Event', 'Producto validado correctamente', { product });

    let mappedType: string;
    try {
      mappedType = mapEventType(type);
      log('Event', 'Tipo de evento mapeado', { original: type, mapped: mappedType });
    } catch (mapError) {
      log('Event', 'Error en el mapeo del tipo de evento', mapError);
      return { success: false, debugLogs, error: mapError instanceof Error ? mapError.message : 'Error en el mapeo del tipo de evento' };
    }

    const commonEventData = {
      browser_info: data.event_data?.browser_info || {},
      fbc: data.event_data?.fbc || null,
      fbp: data.event_data?.fbp || null,
      utm_data: data.event_data?.utm_data || {},
      original_type: type,
      ...data.event_data
    };

    log('Event', 'Insertando tracking event en la base de datos', {
      product_id: product.id,
      event_type: mappedType,
      visitor_id: data.visitor_id,
      session_id: data.session_id,
      page_view_id: data.page_view_id,
      url: data.url,
      referrer: data.referrer,
      user_agent: data.user_agent || data.event_data?.browser_info?.userAgent,
      screen_resolution: data.screen_resolution,
      viewport_size: data.viewport_size,
      event_data: commonEventData
    });

    const { error: insertError } = await supabase
      .from('tracking_events')
      .insert([{
        product_id: product.id,
        event_type: mappedType,
        visitor_id: data.visitor_id,
        session_id: data.session_id,
        page_view_id: data.page_view_id,
        url: data.url,
        referrer: data.referrer,
        user_agent: data.user_agent || data.event_data?.browser_info?.userAgent,
        screen_resolution: data.screen_resolution,
        viewport_size: data.viewport_size,
        event_data: commonEventData
      }]);

    if (insertError) {
      log('Event', 'Error insertando evento', insertError);
      return { success: false, debugLogs, error: insertError.message || 'Error insertando evento' };
    }
    log('Event', 'Evento insertado correctamente');

    // Si es un hotmart_click, además de registrar el evento, dispara la conversión en Facebook.
    if (type === 'hotmart_click') {
      log('Hotmart', 'Procesando hotmart_click y disparando conversión de Facebook', { event_data: commonEventData });
      await sendFacebookConversion(product, data, commonEventData, log);

      // Registro opcional en tabla específica de clicks
      const hotmartData = {
        product_id: product.id,
        visitor_id: data.visitor_id,
        url: data.url,
        fbc: commonEventData.fbc,
        fbp: commonEventData.fbp,
        browser_info: commonEventData.browser_info,
        utm_data: commonEventData.utm_data,
        timestamp: new Date()
      };

      log('Hotmart', 'Insertando hotmart click en la base de datos', { hotmartData });
      const { error: clickError } = await supabase
        .from('hotmart_clicks')
        .insert([hotmartData]);

      if (clickError) {
        log('Hotmart', 'Error guardando click', clickError);
        return { success: false, debugLogs, error: clickError.message || 'Error guardando click' };
      }
      log('Hotmart', 'Click guardado exitosamente', { hotmartData });
    }

    log('Event', 'Evento procesado exitosamente', { tracking_id, type: mappedType });
    return { success: true, debugLogs };
  } catch (err) {
    log('Event', 'Error procesando evento', err instanceof Error ? err.stack : err);
    return { success: false, debugLogs, error: err instanceof Error ? err.message : 'Error interno del servidor' };
  }
}
