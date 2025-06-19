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
    commissions: Array<{
      value: number;
      source: string;
      currency_value: string;
      currency_conversion?: {
        converted_value: number;
        converted_to_currency: string;
        conversion_rate: number;
      };
    }>;
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
 * Obtiene el precio de la comisión del productor
 * @param event - Evento de Hotmart
 * @returns Objeto con value y currency_value de la comisión del productor
 */
function getProducerCommissionPrice(event: HotmartEvent): { value: number; currency_value: string } {
  const producerCommission = event.data.commissions?.find(commission => commission.source === 'PRODUCER');
  
  if (producerCommission) {
    console.log('Usando precio de comisión del productor:', {
      value: producerCommission.value,
      currency: producerCommission.currency_value
    });
    return {
      value: producerCommission.value,
      currency_value: producerCommission.currency_value
    };
  }
  
  // Fallback al precio original si no se encuentra la comisión del productor
  console.log('No se encontró comisión del productor, usando precio original:', {
    value: event.data.purchase.price.value,
    currency: event.data.purchase.price.currency_value
  });
  return event.data.purchase.price;
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
  const price = getProducerCommissionPrice(event); // Usar precio de comisión del productor
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
  const result = {
    success: false,
    xcod: null as string | null,
    tracking_found: false,
    product_found: false,
    product_active: false,
    event_stored: false,
    facebook_sent: false,
    telegram_sent: false,
    producer_price: null as { value: number; currency_value: string } | null,
    event_type: event.event,
    errors: [] as string[]
  };

  try {
    console.log('Iniciando handleHotmartWebhook con evento:', event);

    if (!event.data.purchase.origin?.xcod) {
      const error = 'xcod no encontrado en el evento';
      console.log(error);
      result.errors.push(error);
      return result;
    }

    const xcod = event.data.purchase.origin.xcod;
    result.xcod = xcod;
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
      const error = `Error buscando tracking event: ${trackingError.message}`;
      console.error(error, trackingError);
      result.errors.push(error);
      return result;
    }

    if (!trackingEvent) {
      const error = 'Tracking event no encontrado';
      console.error(error);
      result.errors.push(error);
      return result;
    }

    result.tracking_found = true;
    console.log('Tracking event encontrado:', trackingEvent);

    const product = trackingEvent.products;
    console.log('Producto obtenido del tracking event:', product);

    if (!product) {
      const error = 'Producto no encontrado en el tracking event';
      console.error(error);
      result.errors.push(error);
      return result;
    }

    result.product_found = true;

    if (!product.active) {
      const error = 'Producto inactivo';
      console.error(error);
      result.errors.push(error);
      return result;
    }

    result.product_active = true;

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
      const error = `Error al insertar evento de compra: ${insertError.message}`;
      console.error(error, insertError);
      result.errors.push(error);
    } else {
      result.event_stored = true;
      console.log('Evento de compra insertado en Supabase con éxito.');
      console.log('Resultado de la inserción:', insertData);
    }

    if (event.event === 'PURCHASE_APPROVED') {
      console.log('Evento PURCHASE_APPROVED detectado. Enviando conversión a Facebook...');
      
      // Get producer price for both Facebook and Telegram
      const producerPrice = getProducerCommissionPrice(event);
      result.producer_price = producerPrice;
      
      try {
        await sendFacebookConversion(product, event, trackingEvent);
        result.facebook_sent = true;
        console.log('Conversión enviada a Facebook.');
      } catch (fbError) {
        const error = `Error enviando a Facebook: ${fbError instanceof Error ? fbError.message : fbError}`;
        console.error(error);
        result.errors.push(error);
      }

      try {
        await notifyPurchase(product.user_id, event.data, producerPrice);
        result.telegram_sent = true;
        console.log('Notificación de Telegram enviada.');
      } catch (telegramError) {
        const error = `Error enviando a Telegram: ${telegramError instanceof Error ? telegramError.message : telegramError}`;
        console.error(error);
        result.errors.push(error);
      }
    } else {
      console.log('Evento no es PURCHASE_APPROVED. No se enviará la conversión a Facebook.');
    }

    result.success = true;
    console.log('handleHotmartWebhook completado con éxito.');
    return result;
  } catch (error) {
    const errorMessage = `Error procesando webhook de Hotmart: ${error instanceof Error ? error.message : error}`;
    console.error(errorMessage, error);
    result.errors.push(errorMessage);
    return result;
  }
}