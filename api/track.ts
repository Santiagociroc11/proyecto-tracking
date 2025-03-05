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

// Sistema de logging
function log(context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [HotAPI Backend] [${context}] ${message}`, data || '');
}

// Función para obtener producto
async function getProduct(tracking_id: string) {
  log('DB', 'Buscando producto', { tracking_id });

  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('id, active')
      .eq('tracking_id', tracking_id)
      .single();

    if (error) {
      log('DB', 'Error obteniendo producto', error);
      return null;
    }

    if (!product) {
      log('DB', 'Producto no encontrado', { tracking_id });
      return null;
    }

    log('DB', 'Producto encontrado', { product });
    return product;
  } catch (error) {
    log('DB', 'Error inesperado en getProduct', error);
    return null;
  }
}

export async function handleTrackingEvent(data: TrackingEvent) {
  log('Event', 'Recibiendo nuevo evento', {
    type: data.type,
    tracking_id: data.tracking_id,
    visitor_id: data.visitor_id
  });

  const { tracking_id, type } = data;

  try {
    // Verificar producto
    const product = await getProduct(tracking_id);
    
    if (!product) {
      log('Event', 'Producto no encontrado', { tracking_id });
      throw new Error('Producto no encontrado');
    }

    if (!product.active) {
      log('Event', 'Producto inactivo', { tracking_id, product });
      throw new Error('Producto inactivo');
    }

    log('Event', 'Producto validado correctamente', { product });

    // Insertar evento en la base de datos
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

    // Procesar eventos especiales
    if (type === 'hotmart_click') {
      log('Hotmart', 'Procesando click de Hotmart', data.event_data);

      const hotmartData = {
        product_id: product.id,
        visitor_id: data.visitor_id,
        url: data.url,
        fbc: data.event_data?.fbc,
        fbp: data.event_data?.fbp,
        browser_info: data.event_data?.browser_info,
        utm_data: data.event_data?.utm_data
      };

      const { error: clickError } = await supabase
        .from('hotmart_clicks')
        .insert([hotmartData]);

      if (clickError) {
        log('Hotmart', 'Error guardando click', clickError);
        throw clickError;
      }

      log('Hotmart', 'Click guardado exitosamente', hotmartData);
    }

    log('Event', 'Evento procesado exitosamente');
    return { success: true };
  } catch (error) {
    log('Event', 'Error procesando evento', error);
    throw error;
  }
}