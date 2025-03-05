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

interface Product {
  id: number | string;
  active: boolean;
  fb_pixel_id?: string | null;
  fb_access_token?: string | null;
  fb_test_event_code?: string | null;
}

const DEBUG_MODE = true;

async function hashData(value: string): Promise<string> {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Dispara la API de conversiones de Facebook replicando la data de tu flujo n8n.
 */
async function sendFacebookConversion(
  product: Product,
  event: HotmartEvent,
  trackingEvent: any
): Promise<void> {
  // Verificar que existan los datos necesarios.
  if (!product.fb_pixel_id || !product.fb_access_token) {
    console.log('Facebook Pixel ID or Access Token not configured');
    return;
  }

  // Construir el evento con la data de tu flujo n8n.
  const eventPayload = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: {
      client_ip_address: event.data.purchase.buyer_ip,
      client_user_agent: trackingEvent?.event_data?.browser_info?.userAgent || null,
      fbc: trackingEvent?.event_data?.fbc || null,
      fbp: trackingEvent?.event_data?.fbp || null
    }
  };

  // Armar el payload final, colocando test_event_code a nivel superior.
  const fbPayload: any = {
    data: [ eventPayload ]
  };
  if (product.fb_test_event_code) {
    fbPayload.test_event_code = product.fb_test_event_code;
  }

  const fbUrl = `https://graph.facebook.com/v21.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`;

  try {
    const fbResponse = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fbPayload)
    });
    
    if (!fbResponse.ok) {
      const errorData = await fbResponse.json();
      console.error('Error en Facebook Conversions API:', errorData);
      throw new Error(`Error en Facebook Conversions API: ${fbResponse.status}`);
    }

    const fbResult = await fbResponse.json();
    console.log('Facebook Conversions API response:', fbResult);
  } catch (error) {
    console.error('Error enviando conversión a Facebook:', error);
  }
}

export async function handleHotmartWebhook(event: HotmartEvent) {
  try {
    const xcod = event.data.purchase.origin.xcod;
    
    // Buscar el tracking_event más reciente que coincida con el xcod
    const { data: trackingEvent, error: trackingError } = await supabase
      .from('tracking_events')
      .select(`
        product_id,
        visitor_id,
        event_data,
        products (
          id,
          active,
          fb_pixel_id,
          fb_access_token,
          fb_test_event_code
        )
      `)
      .eq('visitor_id', xcod)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (trackingError) {
      console.error('Error buscando tracking event:', trackingError);
      return { success: false, error: 'Tracking event no encontrado' };
    }

    if (!trackingEvent?.products) {
      console.error('Producto no encontrado');
      return { success: false, error: 'Producto no encontrado' };
    }

    const product = trackingEvent.products as Product;

    if (!product.active) {
      console.error('Producto inactivo');
      return { success: false, error: 'Producto inactivo' };
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

    if (event.event === 'PURCHASE_APPROVED') {
      await sendFacebookConversion(product, event, trackingEvent);
    }

    return { success: true };
  } catch (error) {
    console.error('Error procesando webhook de Hotmart:', error);
    throw error;
  }
}