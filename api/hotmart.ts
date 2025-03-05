import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto';

interface HotmartEvent {
  data: {
    product: {
      id: number;
      name: string;
      ucode: string;
    };
    purchase: {
      origin: {
        xcod: string;
      };
      buyer_ip: string;
      status: string;
      price: {
        value: number;
        currency_value: string;
      };
    };
    buyer: {
      name: string;
      email: string;
      checkout_phone: string;
      address: {
        country: string;
        country_iso: string;
      };
    };
  };
  event: string;
  creation_date: number;
}

async function hashData(value: string): Promise<string> {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function handleHotmartWebhook(event: HotmartEvent) {
  try {
    const xcod = event.data.purchase.origin.xcod;
    
    // Buscar el tracking_event más reciente que coincida con el xcod
    const { data: trackingEvent, error: trackingError } = await supabase
      .from('tracking_events')
      .select('product_id, visitor_id, event_data')
      .eq('visitor_id', xcod)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (trackingError) {
      console.error('Error buscando tracking event:', trackingError);
      return { success: false, error: 'Tracking event no encontrado' };
    }

    // Verificar que el producto existe y está activo
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', trackingEvent.product_id)
      .single();

    if (productError || !product || !product.active) {
      console.error('Error verificando producto:', productError);
      return { success: false, error: 'Producto no encontrado o inactivo' };
    }

    // Registrar el evento en la base de datos
    await supabase
      .from('tracking_events')
      .insert([{
        product_id: product.id,
        event_type: 'custom',
        visitor_id: xcod,
        event_data: {
          type: 'hotmart_event',
          event: event.event,
          data: event.data
        }
      }]);

    return { success: true };
  } catch (error) {
    console.error('Error procesando webhook de Hotmart:', error);
    throw error;
  }
}