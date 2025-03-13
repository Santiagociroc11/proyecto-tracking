import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto-js'; // Importar crypto-js

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
        zip?: string;
        city?: string;
        state?: string;
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

interface TrackingEventWithProduct {
  product_id: string;
  visitor_id: string;
  event_data: any;
  products: Product;
  utm_data?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };
  session_id: string;
  page_view_id: string;
}

function hashSHA256(value: string): string {
  return crypto.SHA256(value).toString(crypto.enc.Hex);
}

async function sendFacebookConversion(
  product: Product,
  event: HotmartEvent,
  trackingEvent: any
): Promise<void> {
  if (!product.fb_pixel_id || !product.fb_access_token) {
    console.log('Facebook Pixel ID or Access Token not configured');
    return;
  }

  const buyer = event.data.buyer;
  const price = event.data.purchase.price;
  const address = buyer.address;

  const encryptedData = {
    em: [hashSHA256(buyer.email)],
    ph: [hashSHA256(buyer.checkout_phone)],
    fn: [hashSHA256(buyer.name)],
    country: [hashSHA256(address.country)],
    zp: address.zip ? [hashSHA256(address.zip)] : [],
    ct: address.city ? [hashSHA256(address.city)] : [],
    st: address.state ? [hashSHA256(address.state)] : [],
    client_ip_address: event.data.purchase.buyer_ip,
    client_user_agent: trackingEvent?.event_data?.browser_info?.userAgent || null,
    fbc: trackingEvent?.event_data?.fbc || null,
    fbp: trackingEvent?.event_data?.fbp || null,
  };

  const eventPayload: any = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        original_event_data: {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
        },
        user_data: encryptedData,
        custom_data: {
          currency: price.currency_value,
          value: price.value,
        },
      },
    ],
  };

  if (product.fb_test_event_code) {
    eventPayload.test_event_code = product.fb_test_event_code;
  }

  const fbUrl = `https://graph.facebook.com/v21.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`;

  try {
    const fbResponse = await fetch(fbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
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
    console.log('Iniciando handleHotmartWebhook con evento:', event);

    const xcod = event.data.purchase.origin.xcod;
    console.log('xcod obtenido:', xcod);

    console.log('Consultando tracking_events en Supabase...');
    const { data: trackingEvent, error: trackingError } = await supabase
      .from('tracking_events')
      .select<string, TrackingEventWithProduct>(`
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
      console.log('Resultado de la consulta a Supabase (error):', trackingError);
      return { success: false, error: 'Tracking event no encontrado' };
    }

    if (!trackingEvent) {
      console.error('Tracking event no encontrado.');
      console.log('Resultado de la consulta a Supabase (data):', trackingEvent);
      return { success: false, error: 'Tracking event no encontrado' };
    }

    console.log('Tracking event encontrado:', trackingEvent);

    const product = trackingEvent.products;
    console.log('Producto obtenido del tracking event:', product);

    if (!product) {
      console.error('Producto no encontrado en el tracking event.');
      return { success: false, error: 'Producto no encontrado o inactivo' };
    }

    if (!product.active) {
      console.error('Producto inactivo.');
      return { success: false, error: 'Producto no encontrado o inactivo' };
    }

    console.log('Insertando evento de compra en Supabase...');
    const { data: insertData, error: insertError } = await supabase
    .from('tracking_events')
    .insert([
      {
        product_id: product.id,
        event_type: 'compra_hotmart',
        visitor_id: xcod,
        session_id: trackingEvent.event_data.session_id,
        event_data: {
          type: 'hotmart_event',
          event: event.event,
          data: event.data,
          utm_data:{
            utm_term: trackingEvent.event_data.utm_data?.utm_term,
            utm_medium: trackingEvent.event_data.utm_data?.utm_medium,
            utm_source: trackingEvent.event_data.utm_data?.utm_source,
            utm_content: trackingEvent.event_data.utm_data?.utm_content,
            utm_campaign: trackingEvent.event_data.utm_data?.utm_campaign
          },
        }
      },
    ])
    .select();

    if (insertError) {
      console.error('Error al insertar evento de compra en Supabase:', insertError);
      console.log('Detalles del error de inserción:', insertError);
    } else {
      console.log('Evento de compra insertado en Supabase con éxito.');
      console.log('Resultado de la inserción:', insertData);
    }

    if (event.event === 'PURCHASE_APPROVED') {
      console.log('Evento PURCHASE_APPROVED detectado. Enviando conversión a Facebook...');
      await sendFacebookConversion(product, event, trackingEvent);
      console.log('Conversión enviada a Facebook.');
    } else {
      console.log('Evento no es PURCHASE_APPROVED. No se enviará la conversión a Facebook.');
    }

    console.log('handleHotmartWebhook completado con éxito.');
    return { success: true };
  } catch (error) {
    console.error('Error procesando webhook de Hotmart:', error);
    console.log('Error detallado:', error);
    throw error;
  }
}