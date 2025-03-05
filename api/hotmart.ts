import { supabase } from '../src/lib/supabase';
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

async function sendToFacebookConversionsAPI(productId: string, eventData: any) {
  try {
    // Obtener la configuración de Facebook del producto
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('fb_pixel_id, fb_access_token, fb_test_event_code')
      .eq('id', productId)
      .single();

    if (productError || !product?.fb_pixel_id || !product?.fb_access_token) {
      throw new Error('Configuración de Facebook no encontrada');
    }

    const { fb_pixel_id, fb_access_token, fb_test_event_code } = product;

    // Construir el payload para la API de Conversiones
    const payload = {
      data: [{
        event_name: eventData.event_name,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: {
          em: [await hashData(eventData.email)],
          ph: [await hashData(eventData.phone)],
          fn: [await hashData(eventData.first_name)],
          ln: [await hashData(eventData.last_name)],
          country: [await hashData(eventData.country)],
          client_ip_address: eventData.ip,
          client_user_agent: eventData.user_agent,
          fbc: eventData.fbc,
          fbp: eventData.fbp
        },
        custom_data: {
          currency: eventData.currency,
          value: eventData.value
        }
      }]
    };

    // Construir la URL de la API
    let url = `https://graph.facebook.com/v21.0/${fb_pixel_id}/events?access_token=${fb_access_token}`;
    if (fb_test_event_code) {
      url += `&test_event_code=${fb_test_event_code}`;
    }

    // Enviar el evento a Facebook
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Error al enviar evento a Facebook');
    }

    return await response.json();
  } catch (error) {
    console.error('Error enviando evento a Facebook:', error);
    throw error;
  }
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

    // Procesar el evento según su tipo
    switch (event.event) {
      case 'PURCHASE_APPROVED':
        await sendToFacebookConversionsAPI(product.id, {
          event_name: 'Purchase',
          email: event.data.buyer.email,
          phone: event.data.buyer.checkout_phone,
          first_name: event.data.buyer.name.split(' ')[0],
          last_name: event.data.buyer.name.split(' ')[1] || '',
          country: event.data.buyer.address.country_iso,
          ip: event.data.purchase.buyer_ip,
          user_agent: trackingEvent.event_data?.browser_info?.userAgent,
          fbc: trackingEvent.event_data?.fbc,
          fbp: trackingEvent.event_data?.fbp,
          currency: event.data.purchase.price.currency_value,
          value: event.data.purchase.price.value
        });
        break;

      case 'PURCHASE_CANCELED':
      case 'PURCHASE_REFUNDED':
        // Aquí podrías enviar eventos de cancelación o reembolso si lo necesitas
        break;
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