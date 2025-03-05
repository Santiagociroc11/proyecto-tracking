import { supabase } from '../lib/supabase-server.js';

interface TrackingEvent {
  tracking_id: string;
  type: string;
  visitor_id: string;
  session_id: string;
  page_view_id: string;
  url: string;
  event_data: any;
}

interface Product {
  id: number | string;
  active: boolean;
}

const DEBUG_MODE = true;

/**
 * Obtiene el producto usando el tracking_id y acumula logs.
 */
async function getProduct(
  tracking_id: string,
  log: (context: string, message: string, data?: any) => void
): Promise<Product | null> {
  log('DB', 'Iniciando getProduct', { tracking_id });
  try {
    log('DB', 'Ejecutando consulta para obtener producto', { tracking_id });
    const { data: product, error } = await supabase
      .from('products')
      .select('id, active')
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

/**
 * Mapea el tipo de evento recibido al valor permitido por el ENUM en la base de datos.
 */
function mapEventType(type: string): string {
  // Lista de tipos permitidos (ajusta estos valores a los definidos en tu DB)
  const allowedEventTypes = ['click', 'view', 'purchase', 'HOTMART_CLICK'];
  
  // Mapeo: si recibes "hotmart_click", lo transformas a "HOTMART_CLICK"
  const eventTypeMapping: { [key: string]: string } = {
    'hotmart_click': 'HOTMART_CLICK'
  };
  
  const mappedType = eventTypeMapping[type] || type;
  if (!allowedEventTypes.includes(mappedType)) {
    throw new Error(`Tipo de evento no permitido: ${type}`);
  }
  return mappedType;
}

/**
 * Maneja el evento de tracking y envía todo el debug a n8n.
 */
export async function handleTrackingEvent(data: TrackingEvent): Promise<{ success: boolean; debugLogs: any[]; error?: string }> {
  const debugLogs: any[] = [];

  // Función de log que acumula y muestra mensajes.
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

  // Validación de datos obligatorios.
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

    // Mapea el tipo de evento antes de la inserción.
    let mappedType: string;
    try {
      mappedType = mapEventType(type);
      log('Event', 'Tipo de evento mapeado', { original: type, mapped: mappedType });
    } catch (mapError) {
      log('Event', 'Error en el mapeo del tipo de evento', mapError);
      return { success: false, debugLogs, error: mapError instanceof Error ? mapError.message : 'Error en el mapeo del tipo de evento' };
    }

    // Insertar el evento en la base de datos.
    log('Event', 'Insertando tracking event en la base de datos', {
      product_id: product.id,
      event_type: mappedType,
      visitor_id: data.visitor_id,
      session_id: data.session_id,
      page_view_id: data.page_view_id,
      url: data.url,
      event_data: data.event_data
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
        event_data: data.event_data
      }]);

    if (insertError) {
      log('Event', 'Error insertando evento', insertError);
      return { success: false, debugLogs, error: insertError.message || 'Error insertando evento' };
    }
    log('Event', 'Evento insertado correctamente');

    // Procesar eventos especiales, como el click de Hotmart.
    if (type === 'hotmart_click') {
      log('Hotmart', 'Procesando evento hotmart_click', { event_data: data.event_data });
      const hotmartData = {
        product_id: product.id,
        visitor_id: data.visitor_id,
        url: data.url,
        fbc: data.event_data?.fbc,
        fbp: data.event_data?.fbp,
        browser_info: data.event_data?.browser_info,
        utm_data: data.event_data?.utm_data
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
