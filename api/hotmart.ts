import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto-js'; 
import { notifyPurchase } from './telegram.js';

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
  user_id: string;
  name: string;
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

interface GeolocationData {
  city?: string;
  region?: string; // state/province
  country?: string;
  country_code?: string;
  error?: boolean;
}

function hashSHA256(value: string): string {
  return crypto.SHA256(value).toString(crypto.enc.Hex);
}

/**
 * Obtiene datos de geolocalización por IP usando una API gratuita
 * @param ip - Dirección IP a consultar
 * @returns Datos de geolocalización o null si hay error
 */
async function getGeolocationByIP(ip: string): Promise<GeolocationData | null> {
  try {
    console.log(`Obteniendo geolocalización para IP: ${ip}`);
    
    // Usar ip-api.com (1000 requests/month gratis, más confiable)
    // Nota: No necesitamos especificar fields, devuelve todo por defecto
    const response = await fetch(`http://ip-api.com/json/${ip}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Hotmart-Tracking/1.0'
      },
      // Timeout de 5 segundos para no bloquear el flujo principal
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`Error en API de geolocalización: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // Verificar si hay error en la respuesta
    if (data.status === 'fail') {
      console.warn(`Error en datos de geolocalización: ${data.message}`);
      return null;
    }

    console.log(`Geolocalización obtenida:`, {
      city: data.city,
      region: data.regionName || data.region, // Usar regionName para nombre completo
      country: data.country,
      country_code: data.countryCode,
      zip: data.zip,
      timezone: data.timezone
    });

    return {
      city: data.city || undefined,
      region: data.regionName || data.region || undefined, // Preferir regionName
      country: data.country || undefined,
      country_code: data.countryCode || undefined
    };

  } catch (error) {
    console.warn(`Error obteniendo geolocalización por IP: ${error}`);
    return null;
  }
}

/**
 * Completa los datos de dirección faltantes usando geolocalización por IP
 * @param address - Dirección original de Hotmart
 * @param ip - IP del comprador
 * @returns Dirección completada con datos de geolocalización si es necesario
 */
async function enhanceAddressWithGeolocation(
  address: HotmartEvent['data']['buyer']['address'], 
  ip: string
): Promise<HotmartEvent['data']['buyer']['address']> {
  // Si ya tenemos city y state, no necesitamos hacer la consulta
  if (address.city && address.state) {
    console.log('City y state ya están presentes, no se necesita geolocalización');
    return address;
  }

  console.log(`Faltan datos de dirección. City: ${address.city}, State: ${address.state}`);
  
  const geoData = await getGeolocationByIP(ip);
  
  if (!geoData) {
    console.log('No se pudo obtener datos de geolocalización, usando datos originales');
    return address;
  }

  // Crear una copia de la dirección original
  const enhancedAddress = { ...address };

  // Completar city si falta
  if (!enhancedAddress.city && geoData.city) {
    enhancedAddress.city = geoData.city;
    console.log(`City completada desde geolocalización: ${geoData.city}`);
  }

  // Completar state si falta
  if (!enhancedAddress.state && geoData.region) {
    enhancedAddress.state = geoData.region;
    console.log(`State completado desde geolocalización: ${geoData.region}`);
  }

  // Verificar que el país coincida (por seguridad)
  if (geoData.country_code && 
      enhancedAddress.country_iso && 
      geoData.country_code.toLowerCase() !== enhancedAddress.country_iso.toLowerCase()) {
    console.warn(`País no coincide. Hotmart: ${enhancedAddress.country_iso}, Geolocalización: ${geoData.country_code}`);
  }

  return enhancedAddress;
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
  const buyerIP = event.data.purchase.buyer_ip;
  const xcod = event.data.purchase.origin.xcod; // Este es nuestro visitor_id
  
  // Completar datos de dirección con geolocalización si es necesario
  const enhancedAddress = await enhanceAddressWithGeolocation(buyer.address, buyerIP);
  
  console.log('Datos de dirección finales para Facebook:', {
    original: buyer.address,
    enhanced: enhancedAddress
  });

  const encryptedData = {
    em: [hashSHA256(buyer.email)],
    ph: [hashSHA256(buyer.checkout_phone)],
    fn: [hashSHA256(buyer.name)],
    country: [hashSHA256(enhancedAddress.country)],
    zp: enhancedAddress.zip ? [hashSHA256(enhancedAddress.zip)] : [],
    ct: enhancedAddress.city ? [hashSHA256(enhancedAddress.city)] : [],
    st: enhancedAddress.state ? [hashSHA256(enhancedAddress.state)] : [],
    client_ip_address: buyerIP,
    client_user_agent: trackingEvent?.event_data?.browser_info?.userAgent || null,
    fbc: trackingEvent?.event_data?.fbc || null,
    fbp: trackingEvent?.event_data?.fbp || null,
    // Añadir external_id usando el xcod para mejor matching con el InitiateCheckout
    external_id: (xcod && typeof xcod === 'string' && xcod.length > 0) ? [xcod] : null
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
    console.log('Enviando evento Purchase a Facebook con external_id:', {
      external_id: xcod,
      event_name: 'Purchase',
      value: price.value,
      currency: price.currency_value
    });

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

    if (!event.data.purchase.origin?.xcod) {
      console.log('xcod no encontrado en el evento. Saliendo de handleHotmartWebhook.');
      return;
    }

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
          fb_test_event_code,
          user_id,
          name
        )
      `)
      .eq('visitor_id', xcod)
      .neq('event_type', 'compra_hotmart') 
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
       // Send Telegram notification
       await notifyPurchase(product.user_id, event.data);
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