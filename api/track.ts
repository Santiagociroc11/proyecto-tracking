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

// Flag de depuración para activar logs extra (¡debug mode activado al 100%!)
const DEBUG_MODE = true;

/**
 * Sistema de logging robusto y poético.
 * Imprime logs detallados, incluyendo stacks de error cuando sea necesario.
 */
function log(context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [HotAPI Backend] [${context}] ${message}`;
  if (DEBUG_MODE) {
    console.debug(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data || '');
  }
}

/**
 * Obtiene un producto basado en el tracking_id.
 * Se registra cada paso del proceso y se captura todo el debug posible.
 */
async function getProduct(tracking_id: string): Promise<Product | null> {
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
 * Maneja el evento de tracking con validaciones, inserciones y logs superdetallados.
 */
export async function handleTrackingEvent(data: TrackingEvent): Promise<{ success: boolean }> {
  log('Event', 'Iniciando handleTrackingEvent', { raw_event: data });

  // Validación básica del evento: nada de datos a medias
  if (!data.tracking_id || !data.type || !data.visitor_id) {
    const errorMsg = 'Datos del evento incompletos';
    log('Event', errorMsg, { data });
    throw new Error(errorMsg);
  }

  const { tracking_id, type } = data;
  log('Event', 'Datos básicos validados', { tracking_id, type, visitor_id: data.visitor_id });

  try {
    log('Event', 'Verificando producto asociado', { tracking_id });
    const product = await getProduct(tracking_id);
    if (!product) {
      const errMsg = 'Producto no encontrado';
      log('Event', errMsg, { tracking_id });
      throw new Error(errMsg);
    }
    if (!product.active) {
      const errMsg = 'Producto inactivo';
      log('Event', errMsg, { tracking_id, product });
      throw new Error(errMsg);
    }
    log('Event', 'Producto validado correctamente', { product });

    // Insertar evento en la base de datos
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
      throw insertError;
    }
    log('Event', 'Evento insertado correctamente');

    // Procesar eventos especiales: por ejemplo, clicks de Hotmart
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
        throw clickError;
      }
      log('Hotmart', 'Click guardado exitosamente', { hotmartData });
    }

    log('Event', 'Evento procesado exitosamente', { tracking_id, type });
    return { success: true };
  } catch (err) {
    log('Event', 'Error procesando evento', err instanceof Error ? err.stack : err);
    throw err;
  }
}
