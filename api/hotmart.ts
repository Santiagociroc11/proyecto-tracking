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

interface UserData {
  em: string[];
  ph?: string[];
  country: string[];
  ct?: string[];
  st?: string[];
  zp?: string[];
  client_ip_address: string;
  client_user_agent: string | undefined;
  fbc: string | null;
  fbp: string | null;
  [key: string]: string | string[] | undefined | null;
}

interface Product {
  id: string;
  active: boolean;
  fb_pixel_id: string | null;
  fb_access_token: string | null;
  fb_test_event_code: string | null;
}

interface FacebookEventPayload {
  data: {
    event_name: string;
    event_time: number;
    action_source: string;
    user_data: UserData;
    custom_data: {
      currency: string;
      value: number;
    };
  }[];
  test_event_code?: string;
}

async function hashData(value: string): Promise<string> {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sendFacebookConversion(
  product: Product,
  event: HotmartEvent,
  trackingEvent: any
): Promise<void> {
  try {
    if (!product.fb_pixel_id || !product.fb_access_token) {
      console.log('Facebook Pixel ID or Access Token not configured');
      return;
    }

    const userData: UserData = {
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
    Object.keys(userData).forEach(key => {
      if (userData[key] === undefined || userData[key] === null) {
        delete userData[key];
      }
    });

    const eventPayload: FacebookEventPayload = {
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
  }
}

export async function handleHotmartWebhook(event: HotmartEvent) {
  try {
    const xcod = event.data.purchase.origin.xcod;
    
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

    const product: Product = {
      id: trackingEvent.products.id,
      active: trackingEvent.products.active,
      fb_pixel_id: trackingEvent.products.fb_pixel_id,
      fb_access_token: trackingEvent.products.fb_access_token,
      fb_test_event_code: trackingEvent.products.fb_test_event_code
    };

    if (!product.active) {
      console.error('Producto inactivo');
      return { success: false, error: 'Producto inactivo' };
    }

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