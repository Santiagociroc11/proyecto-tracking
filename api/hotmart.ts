import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto-js'; 
import { notifyPurchase } from './telegram.js';
import { randomUUID } from 'crypto';

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
      order_bump?: {
        is_order_bump: boolean;
        parent_purchase_transaction: string;
      };
      transaction?: string;
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
  event_type: string;
  created_at: string;
  user_agent: string;
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

interface FacebookConversionResult {
  success: boolean;
  status: 'not_attempted' | 'success' | 'failed_config' | 'api_error';
  fbtrace_id?: string | null;
  error_message?: string | null;
  payload_summary?: {
    event_name: string;
    value: number;
    currency: string;
    order_id: string;
    test_event_code?: string;
  } | null;
}

function hashSHA256(value: string): string {
  return crypto.SHA256(value).toString(crypto.enc.Hex);
}

/**
 * Calcula la comisión promedio histórica para un producto específico
 * NOTA: Las comisiones SIEMPRE están en USD, independientemente de la moneda de compra
 * @param productId - ID del producto en Hotmart
 * @returns Promedio de comisiones PRODUCER en USD o null si no hay datos suficientes
 */
async function getHistoricalCommissionAverageUSD(productId: string, saleType: 'compra_hotmart' | 'compra_hotmart_orderbump'): Promise<{ value: number; currency_value: string } | null> {
  try {
    console.log(`Buscando historial para producto ${productId} y tipo de venta ${saleType}`);

    const { data: historicalEvents, error } = await supabase
      .from('tracking_events')
      .select('event_data')
      .eq('product_id', productId)
      .eq('event_type', saleType) // <-- Búsqueda específica por tipo de venta
      .limit(10)
      .order('created_at', { ascending: false });

    if (error || !historicalEvents || historicalEvents.length === 0) {
      console.log('No se encontraron datos históricos para el producto:', {
        product_id: productId,
        found_records: historicalEvents?.length || 0,
        error: error?.message
      });
      return null;
    }

    let totalCommissions = 0;
    let validCommissionCount = 0;

    // 2. Iterar sobre los eventos encontrados para extraer comisiones válidas.
    for (const record of historicalEvents) {
      const eventData = record.event_data;
      if (eventData?.data?.commissions && Array.isArray(eventData.data.commissions)) {
        const producerCommission = eventData.data.commissions.find((c: any) => c.source === 'PRODUCER');
        
        // 3. Validar que la comisión sea útil (en USD y un valor razonable).
        if (producerCommission && 
            producerCommission.currency_value === 'USD' &&
            producerCommission.value > 0 &&
            producerCommission.value < 100) { // Filtro de valores atípicos
          totalCommissions += producerCommission.value;
          validCommissionCount++;
          console.log(`Comisión histórica válida encontrada: ${producerCommission.value} USD`);
        }
      }
    }

    console.log('Análisis de comisiones históricas en USD:', {
      product_id: productId,
      valid_commissions_found: validCommissionCount,
      total_records_analyzed: historicalEvents.length
    });

    // 4. Asegurarse de tener suficientes datos para un promedio fiable.
    if (validCommissionCount < 3) {
      console.log('Comisiones USD insuficientes para un promedio fiable:', {
        product_id: productId,
        valid_commissions: validCommissionCount,
        required_minimum: 3
      });
      return null;
    }

    // 5. Calcular y devolver el promedio.
    const averageCommission = totalCommissions / validCommissionCount;
    console.log('Promedio de comisión histórica en USD calculado:', {
      product_id: productId,
      average_commission: averageCommission,
      based_on_records: validCommissionCount
    });

    return {
      value: Math.round(averageCommission * 100) / 100,
      currency_value: 'USD'
    };

  } catch (error) {
    console.error('Error calculando promedio de comisión histórica:', error);
    return null;
  }
}

/**
 * Valida si el precio estimado es razonable comparado con el original_offer_price
 * @param estimatedPrice - Precio estimado de comisión
 * @param originalOfferPrice - Precio original de la oferta desde Hotmart
 * @returns true si el precio estimado es válido
 */
function isEstimatedPriceValid(
  estimatedPrice: { value: number; currency_value: string },
  originalOfferPrice: { value: number; currency_value: string } | undefined
): boolean {
  if (!originalOfferPrice || originalOfferPrice.currency_value !== estimatedPrice.currency_value) {
    return true; // Si no hay referencia o monedas diferentes, aceptamos el estimado
  }

  // La comisión no debería ser mayor al precio original de la oferta
  if (estimatedPrice.value > originalOfferPrice.value) {
    console.log('Precio estimado rechazado: mayor al precio original de oferta:', {
      estimated: estimatedPrice.value,
      original_offer: originalOfferPrice.value,
      reason: 'estimated_exceeds_original'
    });
    return false;
  }

  // La comisión no debería ser menor al 1% del precio original (muy poco probable)
  const minimumExpected = originalOfferPrice.value * 0.01;
  if (estimatedPrice.value < minimumExpected) {
    console.log('Precio estimado rechazado: demasiado bajo comparado con oferta original:', {
      estimated: estimatedPrice.value,
      minimum_expected: minimumExpected,
      original_offer: originalOfferPrice.value,
      reason: 'estimated_too_low'
    });
    return false;
  }

  return true;
}

/**
 * Obtiene el precio de la comisión del productor con promedio histórico como fallback
 * @param event - Evento de Hotmart
 * @returns Objeto con value y currency_value de la comisión del productor
 */
async function getProducerCommissionPrice(event: HotmartEvent, internalProductId: string, saleType: 'compra_hotmart' | 'compra_hotmart_orderbump'): Promise<{ value: number; currency_value: string }> {
  const producerCommission = event.data.commissions?.find(commission => commission.source === 'PRODUCER');
  
  if (producerCommission) {
    console.log('Usando precio de comisión del productor:', {
      value: producerCommission.value,
      currency: producerCommission.currency_value,
      source: 'direct_commission'
    });
    return {
      value: producerCommission.value,
      currency_value: producerCommission.currency_value
    };
  }
  
  console.log('Comisión del productor no encontrada, buscando promedio histórico en USD...', {
    product_id: internalProductId,
    sale_type: saleType, // Log para debugging
    transaction: event.data.purchase.transaction
  });
  
  // Pasar el saleType a la función de búsqueda histórica
  const historicalAverageUSD = await getHistoricalCommissionAverageUSD(internalProductId, saleType);
  
  if (historicalAverageUSD) {
    const originalOfferPrice = (event.data.purchase as any).original_offer_price;
    
    console.log('Validando promedio histórico contra precio original:', {
      historical_average: historicalAverageUSD.value,
      original_offer_price: originalOfferPrice?.value,
      will_validate: !!originalOfferPrice
    });
    
    if (isEstimatedPriceValid(historicalAverageUSD, originalOfferPrice)) {
      console.log('✅ Usando promedio histórico de comisión en USD:', {
        value: historicalAverageUSD.value,
        currency: historicalAverageUSD.currency_value,
        source: 'historical_average_usd',
        validated_against_original: !!originalOfferPrice
      });
      return historicalAverageUSD;
    } else {
      console.log('❌ Promedio histórico USD rechazado por validación de precio original:', {
        historical_average: historicalAverageUSD.value,
        original_offer_price: originalOfferPrice?.value,
        reason: 'validation_failed'
      });
    }
  } else {
    console.log('❌ No se encontró promedio histórico válido en USD para el producto:', {
      product_id: internalProductId
    });
  }
  
  // Fallback final: usar original_offer_price si está disponible, sino precio completo
  const originalOfferPrice = (event.data.purchase as any).original_offer_price;
  
  if (originalOfferPrice && originalOfferPrice.currency_value === 'USD') {
    console.log('Usando original_offer_price como fallback (en USD):', {
      value: originalOfferPrice.value,
      currency: originalOfferPrice.currency_value,
      source: 'original_offer_price_fallback',
      warning: 'Sin datos históricos suficientes, usando precio original de oferta'
    });
    
    return {
      value: originalOfferPrice.value,
      currency_value: 'USD'
    };
  }
  
  // Último recurso: precio completo de compra
  console.log('No se pudo calcular comisión estimada, usando precio completo de compra:', {
    value: event.data.purchase.price.value,
    currency: event.data.purchase.price.currency_value,
    source: 'full_purchase_price_fallback',
    warning: 'Este valor puede ser inflado comparado con la comisión real'
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
  trackingEvent: any,
  requestId: string
): Promise<FacebookConversionResult> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId,
      timestamp: new Date().toISOString(),
      flow: 'facebook_conversion_api',
      step,
      ...data
    }, null, 2));
  };

  log('start', { product_id: product.id, transaction_id: event.data.purchase.transaction });

  try {
    if (!product.fb_pixel_id || !product.fb_access_token) {
      const errorMsg = 'Facebook Pixel ID o Access Token no configurado';
      log('config_missing', {
        has_pixel_id: !!product.fb_pixel_id,
        has_access_token: !!product.fb_access_token
      });
      return { success: false, status: 'failed_config', error_message: errorMsg, payload_summary: null };
    }
    log('config_validated');

    log('geolocation_enhancement_start', { ip: event.data.purchase.buyer_ip });
    const enhancedAddress = await enhanceAddressWithGeolocation(
      event.data.buyer.address,
      event.data.purchase.buyer_ip
    );
    log('geolocation_enhancement_end', { enhanced_address: enhancedAddress });
    
    // Determine event type based on order bump status within Facebook conversion
    const isOrderBump = event.data.purchase.order_bump?.is_order_bump === true &&
                        !!event.data.purchase.order_bump?.parent_purchase_transaction;
    const eventType = isOrderBump ? 'compra_hotmart_orderbump' : 'compra_hotmart';
    
    const price = await getProducerCommissionPrice(event, product.id.toString(), eventType);
    const transactionId = event.data.purchase.transaction || '';

    const user_data: { [key: string]: any } = {
      em: [hashSHA256(event.data.buyer.email)],
      ph: event.data.buyer.checkout_phone ? [hashSHA256(event.data.buyer.checkout_phone)] : [],
      fn: [hashSHA256(event.data.buyer.name.split(' ')[0])],
      ln: [hashSHA256(event.data.buyer.name.split(' ').slice(1).join(' '))],
      client_ip_address: event.data.purchase.buyer_ip,
      fbc: trackingEvent?.event_data?.fbc,
      fbp: trackingEvent?.event_data?.fbp,
      country: [hashSHA256(enhancedAddress.country_iso.toLowerCase())],
      ct: enhancedAddress.city ? [hashSHA256(enhancedAddress.city.toLowerCase().trim())] : [],
      st: enhancedAddress.state ? [hashSHA256(enhancedAddress.state.toLowerCase().trim())] : [],
      zp: enhancedAddress.zip ? [hashSHA256(enhancedAddress.zip.trim())] : [],
    };

    if (trackingEvent?.user_agent) {
      user_data.client_user_agent = trackingEvent.user_agent;
    }

    if (event.data.purchase.origin?.xcod) {
      user_data.external_id = [hashSHA256(event.data.purchase.origin.xcod)];
    }

    const eventPayload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(event.creation_date / 1000),
          event_source_url: trackingEvent?.event_data?.url,
          user_data: user_data,
          custom_data: {
            currency: price.currency_value,
            value: price.value,
            content_name: event.data.product.name,
            content_ids: [event.data.product.id.toString()],
            content_type: 'product',
            order_id: transactionId,
          },
          action_source: 'website',
          event_id: transactionId,
        },
      ],
      ...(product.fb_test_event_code && { test_event_code: product.fb_test_event_code }),
    };
    
    const payloadSummary = {
      event_name: 'Purchase',
      value: price.value,
      currency: price.currency_value,
      order_id: transactionId,
      ...(product.fb_test_event_code && { test_event_code: product.fb_test_event_code }),
    };
    
    log('payload_created', { payload: eventPayload });

    log('api_call_start', { pixel_id: product.fb_pixel_id });
    const fbResponse = await fetch(`https://graph.facebook.com/v19.0/${product.fb_pixel_id}/events?access_token=${product.fb_access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventPayload),
    });

    if (!fbResponse.ok) {
      const errorData = await fbResponse.json();
      const errorMsg = `Error en API de Facebook: ${fbResponse.status}`;
      log('api_call_failed', { status: fbResponse.status, error_data: errorData });
      return { success: false, status: 'api_error', error_message: errorMsg, payload_summary: null };
    }

    const fbResult = await fbResponse.json();
    log('api_call_success', { result: fbResult });
    return { 
      success: true, 
      status: 'success', 
      fbtrace_id: fbResult.fbtrace_id, 
      payload_summary: payloadSummary 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
    return { success: false, status: 'api_error', error_message: errorMessage, payload_summary: null };
  }
}

// Helper function to validate UTM parameters with fallback values
const isUtmParamValid = (param: string | undefined): boolean => {
  if (!param) return false;
  const parts = param.split('||');
  return parts.some(part => part.trim() !== '' && !part.includes('{{') && !part.includes('}}'));
};

// Helper function to clean UTM data, preserving both name and ID when available
const cleanUtmParam = (param: string | undefined): string | undefined => {
  if (!param) return param;
  const parts = param.split('||');
  
  // Crear array de 2 posiciones: [nombre, id]
  const cleanedParts: (string | null)[] = [null, null];
  
  parts.forEach((part, index) => {
    const isValid = part.trim() !== '' && 
                   !part.includes('{{') && 
                   !part.includes('}}');
    
    if (isValid) {
      // Preservar la posición semántica
      if (index === 0) {
        cleanedParts[0] = part.trim(); // Nombre
      } else if (index === 1) {
        cleanedParts[1] = part.trim(); // ID
      }
    }
  });
  
  // Reconstruir manteniendo estructura
  if (cleanedParts[0] && cleanedParts[1]) {
    return `${cleanedParts[0]}||${cleanedParts[1]}`;
  } else if (cleanedParts[1]) {
    // ¡CLAVE! Si solo tenemos ID, preservar contexto
    return `[SIN NOMBRE]||${cleanedParts[1]}`;
  } else if (cleanedParts[0]) {
    return cleanedParts[0]; // Solo nombre
  }
  
  return param; // Fallback
};

const cleanUtms = (utmData: any): any => {
    if (!utmData || typeof utmData !== 'object') return utmData;
    const cleaned: { [key: string]: string | undefined } = {};
    for (const key in utmData) {
      if (Object.prototype.hasOwnProperty.call(utmData, key)) {
        const value = utmData[key];
        if (typeof value === 'string') {
          cleaned[key] = cleanUtmParam(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
};

export async function handleHotmartWebhook(event: HotmartEvent) {
  const requestId = randomUUID();
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId,
      timestamp: new Date().toISOString(),
      flow: 'hotmart_webhook',
      step,
      ...data
    }, null, 2));
  };

  log('start', { 
    hotmart_event: event.event, 
    transaction: event.data.purchase.transaction,
    product_id: event.data.product.id
  });

  const result: any = {
    requestId,
    processing_started: new Date().toISOString(),
    processing_ended: null as string | null,
    success: false,
    final_status: 'started',
    steps_completed: [] as string[],
    event_info: {
      type: event.event,
      transaction: event.data.purchase.transaction,
      product_id: event.data.product.id,
      product_name: event.data.product.name,
      xcod: null,
    },
    tracking_info: {
        found: false,
        visitor_id: null,
        session_id: null,
        original_event_type: null,
        utm_data: null
    },
    product_info: {
        found: false,
        active: false,
        id: null,
        name: null,
    },
    purchase_info: {
        is_order_bump: null,
        parent_transaction: null,
        event_stored: false,
        producer_price: null,
    },
    notifications: {
      facebook: {
        success: false,
        status: 'not_attempted',
      },
      telegram_sent: false,
    },
    errors: [] as string[]
  };

  try {
    log('validation_start');
    if (!event.data.purchase.origin?.xcod) {
      const error = 'xcod no encontrado en el evento';
      log('validation_failed', { error, event_data: event.data });
      result.errors.push(error);
      result.final_status = 'validation_failed';
      result.processing_ended = new Date().toISOString();
      return result;
    }
    log('validation_success');

    const xcod = event.data.purchase.origin.xcod;
    result.event_info.xcod = xcod;
    result.steps_completed.push('xcod_extracted');
    log('xcod_extracted', { xcod });

    // Check for duplicate transaction ID
    const transactionId = event.data.purchase.transaction;
    if (transactionId) {
      log('duplicate_check_start', { transaction_id: transactionId });
      const { data: existingTransaction, error: duplicateError } = await supabase
        .from('tracking_events')
        .select('id, created_at')
        .in('event_type', ['compra_hotmart', 'compra_hotmart_orderbump'])
        .eq('transaction_id', transactionId)
        .limit(1);

      if (duplicateError) {
        log('duplicate_check_error', { error: duplicateError.message });
      } else if (existingTransaction && existingTransaction.length > 0) {
        const error = `Transacción ${transactionId} ya procesada anteriormente`;
        log('duplicate_found', { 
          transaction_id: transactionId, 
          existing_record: existingTransaction[0] 
        });
        result.errors.push(error);
        result.final_status = 'duplicate_transaction';
        result.processing_ended = new Date().toISOString();
        return result;
      }
      log('duplicate_check_passed', { transaction_id: transactionId });
      result.steps_completed.push('duplicate_check_passed');
    }

    log('query_tracking_event_start', { visitor_id: xcod });
    const { data: trackingEvents, error: trackingError } = await supabase
      .from('tracking_events')
      .select<string, TrackingEventWithProduct>(`
        product_id,
        visitor_id,
        session_id,
        event_data,
        event_type,
        created_at,
        user_agent,
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
      .neq('event_type', 'compra_hotmart_orderbump')
      .order('created_at', { ascending: false });

    log('query_tracking_event_end', {
      found_count: trackingEvents?.length || 0,
      has_error: !!trackingError,
      error_details: trackingError?.message,
    });

    if (trackingError) {
      const error = `Error buscando tracking event: ${trackingError.message}`;
      log('error', { context: 'Error al buscar tracking event en Supabase', details: trackingError });
      result.errors.push(error);
      result.final_status = 'query_tracking_failed';
      result.processing_ended = new Date().toISOString();
      return result;
    }

    if (!trackingEvents || trackingEvents.length === 0) {
      const error = 'Tracking event no encontrado para el xcod proporcionado.';
      log('error', { context: 'Tracking event no encontrado', xcod });
      result.errors.push(error);
      result.final_status = 'tracking_not_found';
      result.processing_ended = new Date().toISOString();
      return result;
    }

    const findValidEvent = (events: TrackingEventWithProduct[]) => {
      const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

      for (const event of events) {
        const utm = event.event_data?.utm_data;
        if (utm) {
          // Revisa si CUALQUIER campo UTM es válido
          const hasAnyValidUtm = utmFields.some(field => isUtmParamValid((utm as any)[field]));

          if (hasAnyValidUtm) {
            log('valid_utm_source_found', {
              created_at: event.created_at,
              event_type: event.event_type,
              utm_data: utm,
              reason: 'At least one UTM parameter is valid'
            });
            return event;
          }
        }
      }

      log('no_valid_utm_source_found', {
        last_event_utm: events[0]?.event_data?.utm_data
      });
      return null;
    };
    
    const validTrackingEvent = findValidEvent(trackingEvents);
    const trackingEvent = validTrackingEvent || trackingEvents[0]; 

    log('tracking_event_selected', {
      created_at: trackingEvent.created_at,
      event_type: trackingEvent.event_type,
      using_fallback: !validTrackingEvent,
      utm_data: trackingEvent.event_data?.utm_data
    });

    result.tracking_info = {
      found: true,
      visitor_id: trackingEvent.visitor_id,
      session_id: trackingEvent.session_id,
      original_event_type: trackingEvent.event_type,
      utm_data: trackingEvent.event_data?.utm_data || null
    };
    result.steps_completed.push('tracking_event_found');
    log('tracking_event_found', { visitor_id: trackingEvent.visitor_id, session_id: trackingEvent.session_id });

    const product = trackingEvent.products;
    log('product_validation_start', { product_id: product?.id, product_name: product?.name });

    if (!product) {
      const error = 'Producto no encontrado en el tracking event';
      log('error', { context: 'Producto no asociado al tracking event', tracking_event_id: trackingEvent.page_view_id });
      result.errors.push(error);
      result.final_status = 'product_not_found';
      result.processing_ended = new Date().toISOString();
      return result;
    }
    result.product_info.found = true;
    result.product_info.id = product.id;
    result.product_info.name = product.name;
    result.steps_completed.push('product_found');

    if (!product.active) {
      const error = `El producto ID ${product.id} está inactivo`;
      log('error', { context: 'Producto inactivo', product_id: product.id });
      result.errors.push(error);
      result.final_status = 'product_inactive';
      result.processing_ended = new Date().toISOString();
      return result;
    }
    result.product_info.active = true;
    result.steps_completed.push('product_active');
    log('product_validation_success');

    // Determine event type based on order bump status - more explicit check
    const isOrderBump = event.data.purchase.order_bump?.is_order_bump === true &&
                        !!event.data.purchase.order_bump?.parent_purchase_transaction;
    const eventType = isOrderBump ? 'compra_hotmart_orderbump' : 'compra_hotmart';
    result.purchase_info.is_order_bump = isOrderBump;
    result.purchase_info.parent_transaction = event.data.purchase.order_bump?.parent_purchase_transaction || null;
    result.steps_completed.push('order_bump_checked');
    
    log('order_bump_detection', {
      order_bump_field_exists: !!event.data.purchase.order_bump,
      is_order_bump_value: event.data.purchase.order_bump?.is_order_bump,
      is_order_bump_determined: isOrderBump,
      event_type_chosen: eventType
    });
    
    const originalUtmData = trackingEvent.event_data?.utm_data;
    const cleanedUtmData = cleanUtms(originalUtmData);

    // Calculate producer commission BEFORE inserting the event
    const producerPrice = await getProducerCommissionPrice(event, product.id.toString(), eventType);
    
    // Create a modified copy of event data with proper commissions array
    const modifiedEventData = { ...event.data };
    
    // If commissions array is empty or missing PRODUCER commission, reconstruct it
    const hasProducerCommission = modifiedEventData.commissions?.find(c => c.source === 'PRODUCER');
    
    if (!hasProducerCommission) {
      // Keep existing commissions (like MARKETPLACE) and add the calculated PRODUCER commission
      const existingCommissions = modifiedEventData.commissions || [];
      const newProducerCommission = {
        value: producerPrice.value,
        source: 'PRODUCER',
        currency_value: producerPrice.currency_value
      };
      
      modifiedEventData.commissions = [...existingCommissions, newProducerCommission];
      
      log('commission_reconstructed', {
        original_commissions: event.data.commissions || [],
        new_commissions: modifiedEventData.commissions,
        added_producer_commission: newProducerCommission
      });
    }
    
    const realPurchaseDate = new Date(event.creation_date);
    const processingDate = new Date();
    log('insert_purchase_event_start', { 
      event_type: eventType,
      real_purchase_date: realPurchaseDate.toISOString(),
      processing_date: processingDate.toISOString(),
      delay_minutes: Math.round((processingDate.getTime() - realPurchaseDate.getTime()) / (1000 * 60)),
      calculated_commission: producerPrice
    });
    const { data: insertData, error: insertError } = await supabase
    .from('tracking_events')
    .insert([
      {
        product_id: product.id,
        event_type: eventType,
        visitor_id: xcod,
        session_id: trackingEvent.session_id, // Corregido
        transaction_id: transactionId, // Nueva columna para búsquedas rápidas
        created_at: new Date(event.creation_date).toISOString(),
        event_data: {
          type: 'hotmart_event',
          event: event.event,
          data: modifiedEventData, // Use the modified data with proper commissions
          is_order_bump: isOrderBump,
          parent_transaction: event.data.purchase.order_bump?.parent_purchase_transaction || null,
          utm_data:{
            utm_term: cleanedUtmData?.utm_term,
            utm_medium: cleanedUtmData?.utm_medium,
            utm_source: cleanedUtmData?.utm_source,
            utm_content: cleanedUtmData?.utm_content,
            utm_campaign: cleanedUtmData?.utm_campaign
          },
        }
      },
    ])
    .select();

    if (insertError) {
      const error = `Error al insertar evento de compra: ${insertError.message}`;
      log('error', { context: 'Error al insertar evento en Supabase', details: insertError });
      result.errors.push(error);
    } else {
      result.purchase_info.event_stored = true;
      result.steps_completed.push('purchase_event_stored');
      log('insert_purchase_event_success', { inserted_data: insertData });
    }

    if (event.event === 'PURCHASE_APPROVED') {
      log('purchase_approved_flow_start');
      
      // Use the producer price already calculated above
      result.purchase_info.producer_price = producerPrice;
      log('producer_price_reused', { price: producerPrice });
      
      try {
        log('facebook_conversion_start');
        const fbResult = await sendFacebookConversion(product, event, trackingEvent, requestId);
        result.notifications.facebook = fbResult;
        
        if (fbResult.success) {
          result.steps_completed.push('facebook_notification_sent');
          log('facebook_conversion_success');
        } else {
            const error = `Fallo en API de Facebook: ${fbResult.error_message}`;
            log('error', { context: 'Error manejado desde sendFacebookConversion', details: error });
            result.errors.push(error);
        }

      } catch (fbError) {
        const error = `Error enviando a Facebook: ${fbError instanceof Error ? fbError.message : String(fbError)}`;
        log('error', { context: 'Error inesperado al llamar sendFacebookConversion', details: error });
        result.errors.push(error);
        result.notifications.facebook = { success: false, status: 'api_error', error_message: error };
      }

      try {
        log('telegram_notification_start');
        await notifyPurchase(product.user_id, event.data, producerPrice, requestId);
        result.notifications.telegram_sent = true;
        result.steps_completed.push('telegram_notification_sent');
        log('telegram_notification_success');
      } catch (telegramError) {
        const error = `Error enviando a Telegram: ${telegramError instanceof Error ? telegramError.message : String(telegramError)}`;
        log('error', { context: 'Error al notificar por Telegram', details: error });
        result.errors.push(error);
      }
    } else {
      log('purchase_not_approved', { event_status: event.event });
    }

    result.success = true;
    result.final_status = 'success';
    result.processing_ended = new Date().toISOString();
    log('end', { result });
    return result;
  } catch (error) {
    const errorMessage = `Error procesando webhook de Hotmart: ${error instanceof Error ? error.message : String(error)}`;
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
    result.errors.push(errorMessage);
    result.final_status = 'fatal_error';
    result.processing_ended = new Date().toISOString();
    return result;
  }
}