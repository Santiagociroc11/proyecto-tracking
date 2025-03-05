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
 * Función getProduct que ahora recibe la función log para que todos los mensajes
 * se acumulen en el debug local y se envíen a n8n.
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
 * Función principal que maneja el evento de tracking y envía todo el debug a n8n.
 * Se acumulan todos los logs en un array y se incluyen en la respuesta.
 */
export async function handleTrackingEvent(data: TrackingEvent): Promise<{ success: boolean; debugLogs: any[]; error?: string }> {
  // Array local para almacenar cada log generado en la ejecución.
  const debugLogs: any[] = [];

  // Función de log que acumula mensajes y, si DEBUG_MODE está activado, también los imprime en consola.
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

  // Validación básica del evento: no dejamos pasar datos a medias.
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

    // Insertar evento en la base de datos.
    log('Event', 'Insertando tracking event en la base de datos', {
      product_id: product.id,
      event_type: type,
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
        event_type: type,
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

    log('Event', 'Evento procesado exitosamente', { tracking_id, type });
    return { success: true, debugLogs };
  } catch (err) {
    log('Event', 'Error procesando evento', err instanceof Error ? err.stack : err);
    return { success: false, debugLogs, error: err instanceof Error ? err.message : 'Error interno del servidor' };
  }
}
