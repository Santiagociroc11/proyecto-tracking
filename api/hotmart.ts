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
        city?: string;
        state?: string;
        zip_code?: string;
      };
    };
  };
  event: string;
  creation_date: number;
}

async function hashData(value: string): Promise<string> {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sendFacebookConversion(
  product: any,
  event: HotmartEvent,
  trackingEvent: any
): Promise<void> {
  try {
    if (!product.fb_pixel_id || !product.fb_access_token) {
      console.log('Facebook Pixel ID or Access Token not configured');
      return;
    }

    // Preparar datos del usuario con hash SHA256
    const userData = {
      em: [await hashData(event.data.buyer.email)],
      ph: event.data.buyer.checkout_phone ? [await hashData(event.data.buyer.checkout_phone)] : undefined,
      country: [await hashData(event.data.buyer.address.country_iso)],
      ct: event.data.buyer.address.city ? [await hashData(event.data.buyer.address.city)] : undefined,
      st: event.data.buyer.address.state ? [await hashData(event.data.buyer.address.state)] : undefined,
      zp: event.data.buyer.address.zip_code ? [await hashData(event.data.buyer.address.zip_code)] : undefined,
      client_ip_address: event.data.purchase.buyer_ip,
      client_user_agent: trackingEvent?.event_data?.browser_info?.userAgent,
      fbc: trackingEvent?.event_data?.fbc || null,
      fbp: trackingEvent?.event_data?.fbp || null
    };

    // Limpiar undefined y null del objeto
    Object.keys(userData).forEach(key => 
      (userData[key] === undefined || userData[key] === null) && delete userData[key]
    );

    const eventPayload = {
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: event.data.purchase.price.currency_value || "USD",
          value: event.data.purchase.price.value
        }
      }]
    };

    // Agregar test_event_code si está configurado
    if (product.fb_test_event_code) {
      eventPayload.test_event_code = product.fb_test_event_code;
    }

    const fbUrl = `https://graph.facebook.com/v21.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`;

    const response = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error en Facebook Conversions API:', errorData);
      throw new Error(`Error en Facebook Conversions API: ${response.status}`);
    }

    const result = await response.json();
    console.log('Facebook Conversions API response:', result);
  } catch (error) {
    console.error('Error enviando conversión a Facebook:', error);
    // No lanzamos el error para no interrumpir el flujo principal
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

    const product = trackingEvent.products;

    if (!product || !product.active) {
      console.error('Producto no encontrado o inactivo');
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

    // Si el evento es una compra aprobada, enviar a Facebook
    if (event.event === 'PURCHASE_APPROVED') {
      await sendFacebookConversion(product, event, trackingEvent);
    }

    return { success: true };
  } catch (error) {
    console.error('Error procesando webhook de Hotmart:', error);
    throw error;
  }
}