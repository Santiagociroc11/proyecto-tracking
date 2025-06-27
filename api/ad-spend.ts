import { supabase } from '../lib/supabase-server.js';
import crypto from 'crypto';
import { formatDateToTimezone } from '../src/utils/date.js';

// Función para descifrar tokens (compatible con el formato de auth.ts)
function decryptToken(encryptedText: string, key: string): string {
  try {
    const algorithm = 'aes-256-gcm';
    const parts = encryptedText.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format - expected iv:authTag:encrypted');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Derivar la clave de la misma manera que en el cifrado
    const derivedKey = crypto.createHash('sha256').update(String(key)).digest();

    const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting token:', error);
    throw new Error('Failed to decrypt token');
  }
}

interface AdSpendData {
  ad_account_id: string;
  spend: number;
  currency: string;
  date: string;
}

// Función auxiliar para obtener la fecha en la zona horaria del usuario
async function getDateStringForUser(userId: string, baseDate?: Date): Promise<string> {
  try {
    // Obtener la zona horaria del usuario
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single();

    if (error || !settings?.timezone) {
      console.log(`No timezone found for user ${userId}, using UTC`);
      const date = baseDate || new Date();
      return date.toISOString().split('T')[0];
    }

    const date = baseDate || new Date();
    const dateInUserTimezone = formatDateToTimezone(date, settings.timezone);
    console.log(`Date for user ${userId} (${settings.timezone}): ${dateInUserTimezone}`);
    return dateInUserTimezone;
  } catch (error) {
    console.error('Error getting user timezone, falling back to UTC:', error);
    const date = baseDate || new Date();
    return date.toISOString().split('T')[0];
  }
}

async function fetchAdSpendFromMeta(accessToken: string, adAccountIds: string[], dateString: string, userId?: string): Promise<AdSpendData[]> {
  const results: AdSpendData[] = [];
  
  // Si tenemos userId, usar su zona horaria para las fechas de Facebook API
  let facebookDateString = dateString;
  if (userId) {
    try {
      facebookDateString = await getDateStringForUser(userId);
      console.log(`[Ad Spend Debug] Using user timezone date: ${facebookDateString} (original: ${dateString})`);
    } catch (error) {
      console.log(`[Ad Spend Debug] Could not get user timezone, using provided date: ${dateString}`);
    }
  }
  
  // DEBUG: Log del token y la URL para depuración
  console.log(`[Ad Spend Debug] Using Access Token starting with: ${accessToken ? accessToken.substring(0, 10) : 'N/A'}...`);

  for (const accountId of adAccountIds) {
    try {
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';
      
      const params = new URLSearchParams({
        access_token: accessToken,
        fields: 'spend,account_currency',
        level: 'account',
        time_range: JSON.stringify({ since: facebookDateString, until: facebookDateString }),
        limit: '1'
      });

      const url = `${baseUrl}/${version}/${accountId}/insights?${params.toString()}`;
      
      // DEBUG: Log de la URL
      console.log(`[Ad Spend Debug] Requesting URL for account ${accountId}: ${url}`);

      const response = await fetch(url);
      const result = await response.json(); // Siempre parsear el JSON para obtener el error completo

      if (!response.ok) {
        console.error(`Error fetching spend for account ${accountId}: ${response.status}`, JSON.stringify(result, null, 2));
        continue;
      }

      if (result.data && result.data.length > 0) {
        const data = result.data[0];
        results.push({
          ad_account_id: accountId,
          spend: parseFloat(data.spend || '0'),
          currency: data.account_currency || 'USD',
          date: facebookDateString
        });
      } else {
        // Si no hay datos, crear entrada con gasto 0
        results.push({
          ad_account_id: accountId,
          spend: 0,
          currency: 'USD',
          date: facebookDateString
        });
      }
    } catch (error) {
      console.error(`[Ad Spend Debug] Network or other error for account ${accountId}:`, error);
    }
  }
  
  return results;
}

// Función para sincronizar datos detallados de ad performance
async function syncAdPerformance(accessToken: string, adAccountIds: string[], dateString: string, userId?: string): Promise<{ synced: number; errors: number }> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(`[Ad Performance Sync] ${step}:`, data);
  };

  let totalSynced = 0;
  let totalErrors = 0;

  // Si tenemos userId, usar su zona horaria para las fechas de Facebook API
  let facebookDateString = dateString;
  if (userId) {
    try {
      facebookDateString = await getDateStringForUser(userId);
      log('Using user timezone date', { userId, facebookDate: facebookDateString, originalDate: dateString });
    } catch (error) {
      log('Could not get user timezone, using provided date', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  for (const accountId of adAccountIds) {
    try {
      log('Fetching ad performance data', { accountId, date: dateString });

      // Llamar a Facebook Ads API para obtener datos detallados por anuncio
      const facebookUrl = `https://graph.facebook.com/v22.0/${accountId}/insights`;
      const params = new URLSearchParams({
        access_token: accessToken,
        fields: 'ad_id,ad_name,adset_name,campaign_name,adset_id,campaign_id,spend,cpm,ctr,clicks,cpc,impressions',
        level: 'ad',
        time_range: JSON.stringify({ since: facebookDateString, until: facebookDateString }),
        time_increment: '1',
        limit: '2000'
      });

      const response = await fetch(`${facebookUrl}?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        log('Error fetching ad performance', { accountId, status: response.status, error: errorText });
        totalErrors++;
        continue;
      }

      const facebookData = await response.json();
      const insights = facebookData.data || [];

      log('Ad performance data fetched', { accountId, adsCount: insights.length });

      // Obtener product_ad_account_id para esta cuenta
      const { data: productAdAccounts } = await supabase
        .from('product_ad_accounts')
        .select('id')
        .eq('ad_account_id', accountId);

      if (!productAdAccounts?.length) {
        log('No product_ad_accounts found', { accountId });
        continue;
      }

      // Procesar cada anuncio
      for (const insight of insights) {
        for (const productAdAccount of productAdAccounts) {
          try {
            const adPerformanceData = {
              product_ad_account_id: productAdAccount.id,
              date: facebookDateString,
              ad_id: insight.ad_id,
              adset_id: insight.adset_id || null,
              campaign_id: insight.campaign_id || null,
              ad_name: insight.ad_name || null,
              adset_name: insight.adset_name || null,
              campaign_name: insight.campaign_name || null,
              spend: parseFloat(insight.spend) || 0,
              impressions: parseInt(insight.impressions) || 0,
              clicks: parseInt(insight.clicks) || 0,
              cpc: parseFloat(insight.cpc) || null,
              cpm: parseFloat(insight.cpm) || null,
              ctr: parseFloat(insight.ctr) || null,
            };

            // Insertar o actualizar en ad_performance
            const { error: upsertError } = await supabase
              .from('ad_performance')
              .upsert(adPerformanceData, {
                onConflict: 'product_ad_account_id,ad_id,date',
                ignoreDuplicates: false
              });

            if (upsertError) {
              log('Error upserting ad performance', { 
                adId: insight.ad_id, 
                error: upsertError.message 
              });
              totalErrors++;
            } else {
              totalSynced++;
            }
          } catch (error) {
            log('Error processing individual ad', { 
              adId: insight.ad_id, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
            totalErrors++;
          }
        }
      }

    } catch (error) {
      log('Error processing account', { 
        accountId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      totalErrors++;
    }
  }

  log('Ad performance sync completed', { totalSynced, totalErrors });
  return { synced: totalSynced, errors: totalErrors };
}

export async function handleAdSpendSync() {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(`[Ad Spend Sync] ${step}:`, data);
  };

  try {
    log('Starting ad spend sync');

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY) {
      throw new Error('Missing ENCRYPTION_KEY environment variable');
    }

    // Obtener la fecha de hoy (SOLO sincroniza el día actual)
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    
    log('Syncing for date (DAILY SYNC - current day only)', { 
      date: dateString,
      note: 'Only syncing current day. Overwrites existing data for today. Historical data requires manual backfill.'
    });

    // Obtener todas las integraciones activas de Meta
    const { data: integrations, error: integrationsError } = await supabase
      .from('user_integrations')
      .select(`
        id,
        user_id,
        access_token_encrypted,
        meta_ad_accounts (
          id,
          name,
          status
        )
      `)
      .eq('provider', 'meta')
      .eq('status', 'active');

    if (integrationsError) {
      throw new Error(`Error fetching integrations: ${integrationsError.message}`);
    }

    if (!integrations || integrations.length === 0) {
      log('No active Meta integrations found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No active Meta integrations found',
        processed: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    log('Found integrations', { count: integrations.length });

    let totalProcessed = 0;
    let totalErrors = 0;
    let totalAdPerformanceSynced = 0;
    let totalAdPerformanceErrors = 0;

    for (const integration of integrations) {
      try {
        log('Processing integration', { 
          integrationId: integration.id,
          userId: integration.user_id,
          adAccountsCount: integration.meta_ad_accounts?.length || 0
        });

        // Descifrar el access token
        const accessToken = integration.access_token_encrypted; // DEBUG: Reading plaintext for debugging
        // const accessToken = decryptToken(integration.access_token_encrypted, ENCRYPTION_KEY);
        
        // Obtener las cuentas publicitarias que están realmente en uso por los productos
        const allAdAccountIdsForIntegration = (integration.meta_ad_accounts || [])
          .map((account: any) => account.id);

        if (allAdAccountIdsForIntegration.length === 0) {
          log('No ad accounts associated with this integration. Skipping.', { integrationId: integration.id });
          continue;
        }

        // De todas las cuentas de la integración, ver cuáles se usan en productos
        const { data: usedProductAdAccounts, error: usedAccountsError } = await supabase
          .from('product_ad_accounts')
          .select('ad_account_id')
          .in('ad_account_id', allAdAccountIdsForIntegration);

        if (usedAccountsError) {
          log('Error fetching product-linked ad accounts', { 
            integrationId: integration.id, 
            error: usedAccountsError.message 
          });
          totalErrors++;
          continue;
        }

        if (!usedProductAdAccounts || usedProductAdAccounts.length === 0) {
          log('No ad accounts from this integration are linked to any products. Skipping spend fetch.', { integrationId: integration.id });
          continue;
        }
        
        // Filtrar a una lista única de IDs de cuentas a consultar
        const activeAdAccounts = [...new Set(usedProductAdAccounts.map((paa: { ad_account_id: string }) => paa.ad_account_id))];
        
        log('Ad accounts linked to products found, will fetch spend for these.', { integrationId: integration.id, count: activeAdAccounts.length });

        if (activeAdAccounts.length === 0) {
          log('No active ad accounts for integration are linked to any products', { integrationId: integration.id });
          continue;
        }

        // Obtener datos de gasto de Meta (con zona horaria del usuario)
        const adSpendData = await fetchAdSpendFromMeta(accessToken, activeAdAccounts, dateString, integration.user_id);
        
        log('Fetched ad spend data', { 
          integrationId: integration.id,
          dataCount: adSpendData.length 
        });

        // También sincronizar datos detallados de ad performance (con zona horaria del usuario)
        const adPerformanceResult = await syncAdPerformance(accessToken, activeAdAccounts, dateString, integration.user_id);
        
        log('Ad performance sync completed', {
          integrationId: integration.id,
          synced: adPerformanceResult.synced,
          errors: adPerformanceResult.errors
        });

        // Acumular estadísticas de ad performance
        totalAdPerformanceSynced += adPerformanceResult.synced;
        totalAdPerformanceErrors += adPerformanceResult.errors;

        // Guardar los datos en la base de datos
        for (const spendData of adSpendData) {
          try {
            // Obtener todos los productos que usan esta cuenta publicitaria
            const { data: productAdAccounts, error: productError } = await supabase
              .from('product_ad_accounts')
              .select(`
                id,
                product_id,
                products (
                  id,
                  user_id
                )
              `)
              .eq('ad_account_id', spendData.ad_account_id);

            if (productError) {
              log('Error fetching products for ad account', { 
                adAccountId: spendData.ad_account_id,
                error: productError.message 
              });
              continue;
            }

            if (!productAdAccounts || productAdAccounts.length === 0) {
              log('No products using ad account', { adAccountId: spendData.ad_account_id });
              continue;
            }

            // Insertar/actualizar el gasto para cada relación producto-cuenta publicitaria
            for (const productAdAccount of productAdAccounts) {
              const { error: upsertError } = await supabase
                .from('ad_spend')
                .upsert({
                  product_id: productAdAccount.product_id,
                  product_ad_account_id: productAdAccount.id,
                  date: spendData.date,
                  spend: spendData.spend,
                  currency: spendData.currency,
                  created_at: new Date().toISOString()
                }, {
                  onConflict: 'product_id, date'
                });

              if (upsertError) {
                log('Error upserting ad spend', {
                  productId: productAdAccount.product_id,
                  adAccountId: spendData.ad_account_id,
                  error: upsertError.message
                });
                totalErrors++;
              } else {
                log('Ad spend saved', {
                  productId: productAdAccount.product_id,
                  adAccountId: spendData.ad_account_id,
                  spend: spendData.spend,
                  currency: spendData.currency
                });
                totalProcessed++;
              }
            }
          } catch (error) {
            log('Error processing ad spend data', {
              adAccountId: spendData.ad_account_id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            totalErrors++;
          }
        }
      } catch (error) {
        log('Error processing integration', {
          integrationId: integration.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        totalErrors++;
      }
    }

    log('Ad spend sync completed', { 
      totalProcessed,
      totalErrors,
      totalAdPerformanceSynced,
      totalAdPerformanceErrors,
      date: dateString
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Ad spend and performance sync completed',
      processed: totalProcessed,
      errors: totalErrors,
      adPerformanceSynced: totalAdPerformanceSynced,
      adPerformanceErrors: totalAdPerformanceErrors,
      date: dateString
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    log('Fatal error in ad spend sync', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Endpoint para sincronizar manualmente
export async function handleManualAdSpendSync(request: Request) {
  // Verificar que la petición incluya una clave de autorización
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = process.env.CRON_SECRET || 'your-secret-key';
  
  if (!authHeader || authHeader !== `Bearer ${expectedAuth}`) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return await handleAdSpendSync();
} 