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
  const logMessage = `[${timestamp}] [HotAPI Backend] [${context}] ${message}`;
  
  if (data instanceof Error) {
    console.error(logMessage, data);
    console.error('Stack:', data.stack);
  } else if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
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

// Buffer para eventos
let eventBuffer: TrackingEvent[] = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 10000; // 10 segundos

// Función para procesar el buffer
async function flushEventBuffer() {
  if (eventBuffer.length === 0) {
    log('Buffer', 'Buffer vacío, nada que procesar');
    return;
  }

  log('Buffer', 'Iniciando flush del buffer', { events_count: eventBuffer.length });

  const events = [...eventBuffer];
  eventBuffer = [];

  try {
    // Procesar eventos en batch
    const eventsToInsert = events.map(event => ({
      product_id: event.tracking_id,
      event_type: event.type,
      visitor_id: event.visitor_id,
      session_id: event.session_id,
      page_view_id: event.page_view_id,
      url: event.url,
      event_data: event.event_data
    }));

    log('Buffer', 'Preparando inserción en batch', { events: eventsToInsert });

    const { data, error } = await supabase
      .from('tracking_events')
      .insert(eventsToInsert)
      .select();

    if (error) {
      log('Buffer', 'Error en inserción batch', error);
      // Reintentar eventos fallidos
      log('Buffer', 'Reintentando eventos fallidos', { count: events.length });
      eventBuffer = [...eventBuffer, ...events];
    } else {
      log('Buffer', 'Eventos insertados exitosamente', { 
        inserted_count: data?.length,
        first_event: data?.[0],
        last_event: data?.[data.length - 1]
      });
    }
  } catch (error) {
    log('Buffer', 'Error inesperado en flushEventBuffer', error);
    // Reintentar eventos en caso de error
    eventBuffer = [...eventBuffer, ...events];
  }
}

// Configurar flush interval
setInterval(flushEventBuffer, FLUSH_INTERVAL);

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

    // Agregar evento al buffer
    eventBuffer.push(data);
    log('Event', 'Evento agregado al buffer', { 
      buffer_size: eventBuffer.length,
      max_size: BUFFER_SIZE 
    });

    // Si el buffer alcanza el tamaño máximo, forzar flush
    if (eventBuffer.length >= BUFFER_SIZE) {
      log('Event', 'Buffer lleno, forzando flush', { size: BUFFER_SIZE });
      await flushEventBuffer();
    }

    // Procesar eventos especiales inmediatamente
    if (type === 'hotmart_click') {
      log('Hotmart', 'Procesando click de Hotmart', data.event_data);

      const hotmartData = {
        ...data.event_data,
        product_id: product.id,
        visitor_id: data.visitor_id,
        timestamp: new Date().toISOString()
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
    return { success: false, error: 'Error procesando evento' };
  }
}