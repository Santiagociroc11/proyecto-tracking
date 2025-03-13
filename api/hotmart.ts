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

  const eventPayload = {
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
    eventPayload.data[0].test_event_code = product.fb_test_event_code;
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
    const xcod = event.data.purchase.origin.xcod;

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

    if (trackingError || !trackingEvent) {
      console.error('Error buscando tracking event:', trackingError);
      return { success: false, error: 'Tracking event no encontrado' };
    }

    const product = trackingEvent.products;
    if (!product || !product.active) {
      console.error('Producto no encontrado o inactivo');
      return { success: false, error: 'Producto no encontrado o inactivo' };
    }

    await supabase
      .from('tracking_events')
      .insert([
        {
          product_id: product.id,
          event_type: 'compra_hotmart',
          visitor_id: xcod,
          event_data: {
            type: 'hotmart_event',
            event: event.event,
            data: event.data,
          },
        },
      ]);

    if (event.event === 'PURCHASE_APPROVED') {
      await sendFacebookConversion(product, event, trackingEvent);
    }

    return { success: true };
  } catch (error) {
    console.error('Error procesando webhook de Hotmart:', error);
    throw error;
  }
}