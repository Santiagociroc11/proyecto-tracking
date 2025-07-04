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

// Nueva función auxiliar para generar los últimos N días
function getLastNDays(days: number, userTimezone?: string): string[] {
  const dates: string[] = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    if (userTimezone) {
      dates.push(formatDateToTimezone(date, userTimezone));
    } else {
      dates.push(date.toISOString().split('T')[0]);
    }
  }
  
  return dates;
}

// Función modificada para manejar múltiples fechas o un solo día
async function fetchAdSpendFromMeta(
  accessToken: string, 
  adAccountIds: string[], 
  dateInput: string | string[], // Puede ser un string (un día) o array (múltiples días)
  userId?: string
): Promise<AdSpendData[]> {
  const results: AdSpendData[] = [];
  
  // Determinar si es un solo día o múltiples días
  const isMultipleDays = Array.isArray(dateInput);
  const dates = isMultipleDays ? dateInput : [dateInput];
  
  // Si tenemos userId, usar su zona horaria para las fechas de Facebook API
  let facebookDates = dates;
  if (userId) {
    try {
      if (isMultipleDays) {
        // Para múltiples días, necesitamos obtener la zona horaria del usuario
        const { data: settings } = await supabase
          .from('user_settings')
          .select('timezone')
          .eq('user_id', userId)
          .single();
        
        if (settings?.timezone) {
          facebookDates = getLastNDays(dates.length, settings.timezone);
        }
      } else {
        // Para un solo día, usar la función existente
        const userDate = await getDateStringForUser(userId);
        facebookDates = [userDate];
      }
      console.log(`[Ad Spend Debug] Using user timezone dates: ${facebookDates.join(', ')} (original: ${dates.join(', ')})`);
    } catch (error) {
      console.log(`[Ad Spend Debug] Could not get user timezone, using provided dates: ${dates.join(', ')}`);
    }
  }
  
  // DEBUG: Log del token y la URL para depuración
  console.log(`[Ad Spend Debug] Using Access Token starting with: ${accessToken ? accessToken.substring(0, 10) : 'N/A'}...`);

  for (const accountId of adAccountIds) {
    try {
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';
      
      if (isMultipleDays && facebookDates.length > 1) {
        // Para múltiples días, usar una sola llamada con time_increment
        const params = new URLSearchParams({
          access_token: accessToken,
          fields: 'spend,account_currency,date_start',
          level: 'account',
          time_range: JSON.stringify({ 
            since: facebookDates[0], 
            until: facebookDates[facebookDates.length - 1] 
          }),
          time_increment: '1',
          limit: '1000'
        });

        const url = `${baseUrl}/${version}/${accountId}/insights?${params.toString()}`;
        
        console.log(`[Ad Spend Debug] Requesting URL for account ${accountId} (${facebookDates.length} days): ${url}`);

        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok) {
          console.error(`Error fetching spend for account ${accountId}: ${response.status}`, JSON.stringify(result, null, 2));
          continue;
        }

        if (result.data && result.data.length > 0) {
          for (const data of result.data) {
            results.push({
              ad_account_id: accountId,
              spend: parseFloat(data.spend || '0'),
              currency: data.account_currency || 'USD',
              date: data.date_start
            });
          }
        } else {
          // Si no hay datos, crear entradas con gasto 0 para cada día
          for (const date of facebookDates) {
            results.push({
              ad_account_id: accountId,
              spend: 0,
              currency: 'USD',
              date: date
            });
          }
        }
      } else {
        // Para un solo día, usar la lógica original
        const facebookDate = facebookDates[0];
        const params = new URLSearchParams({
          access_token: accessToken,
          fields: 'spend,account_currency',
          level: 'account',
          time_range: JSON.stringify({ since: facebookDate, until: facebookDate }),
          limit: '1'
        });

        const url = `${baseUrl}/${version}/${accountId}/insights?${params.toString()}`;
        
        console.log(`[Ad Spend Debug] Requesting URL for account ${accountId}: ${url}`);

        const response = await fetch(url);
        const result = await response.json();

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
            date: facebookDate
          });
        } else {
          // Si no hay datos, crear entrada con gasto 0
          results.push({
            ad_account_id: accountId,
            spend: 0,
            currency: 'USD',
            date: facebookDate
          });
        }
      }
    } catch (error) {
      console.error(`[Ad Spend Debug] Network or other error for account ${accountId}:`, error);
    }
  }
  
  return results;
}

// Función para sincronizar datos detallados de ad performance
async function syncAdPerformance(
  accessToken: string, 
  adAccountIds: string[], 
  dateInput: string | string[], // Puede ser un string (un día) o array (múltiples días)
  userId?: string
): Promise<{ synced: number; errors: number; skipped: number }> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(`[Ad Performance Sync] ${step}:`, data);
  };

  let totalSynced = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // Determinar si es un solo día o múltiples días
  const isMultipleDays = Array.isArray(dateInput);
  const dates = isMultipleDays ? dateInput : [dateInput];

  // Si tenemos userId, usar su zona horaria para las fechas de Facebook API
  let facebookDates = dates;
  if (userId) {
    try {
      if (isMultipleDays) {
        // Para múltiples días, necesitamos obtener la zona horaria del usuario
        const { data: settings } = await supabase
          .from('user_settings')
          .select('timezone')
          .eq('user_id', userId)
          .single();
        
        if (settings?.timezone) {
          facebookDates = getLastNDays(dates.length, settings.timezone);
        }
      } else {
        // Para un solo día, usar la función existente
        const userDate = await getDateStringForUser(userId);
        facebookDates = [userDate];
      }
      log('Using user timezone dates', { userId, facebookDates, originalDates: dates });
    } catch (error) {
      log('Could not get user timezone, using provided dates', { userId, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // Obtener la fecha actual para comparación
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];
  
  log('Date range for ad performance sync', { 
    dates: facebookDates, 
    today: todayString,
    isMultipleDays,
    note: isMultipleDays ? 'Syncing multiple days (historical + current)' : 'Syncing single day'
  });

  for (const accountId of adAccountIds) {
    try {
      log('Fetching ad performance data', { accountId, dates: facebookDates.join(', ') });

      // Llamar a Facebook Ads API para obtener datos detallados por anuncio
      const facebookUrl = `https://graph.facebook.com/v22.0/${accountId}/insights`;
      
      let params: URLSearchParams;
      if (isMultipleDays && facebookDates.length > 1) {
        // Para múltiples días, usar un rango con time_increment
        params = new URLSearchParams({
          access_token: accessToken,
          fields: 'ad_id,ad_name,adset_name,campaign_name,adset_id,campaign_id,spend,cpm,ctr,clicks,cpc,impressions,date_start',
          level: 'ad',
          time_range: JSON.stringify({ 
            since: facebookDates[0], 
            until: facebookDates[facebookDates.length - 1] 
          }),
          time_increment: '1',
          limit: '2000'
        });
      } else {
        // Para un solo día, usar la lógica original
        params = new URLSearchParams({
          access_token: accessToken,
          fields: 'ad_id,ad_name,adset_name,campaign_name,adset_id,campaign_id,spend,cpm,ctr,clicks,cpc,impressions',
          level: 'ad',
          time_range: JSON.stringify({ since: facebookDates[0], until: facebookDates[0] }),
          time_increment: '1',
          limit: '2000'
        });
      }

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

      // Obtener presupuestos únicos para campañas y adsets
      const uniqueCampaignIds = [...new Set(insights.map((insight: any) => insight.campaign_id).filter(Boolean).map(String))];
      const uniqueAdsetIds = [...new Set(insights.map((insight: any) => insight.adset_id).filter(Boolean).map(String))];

      // Cache para presupuestos
      const campaignBudgets = new Map<string, number>();
      const adsetBudgets = new Map<string, number>();

      // Obtener presupuestos de campañas
      if (uniqueCampaignIds.length > 0) {
        log('Fetching campaign budgets', { campaignCount: uniqueCampaignIds.length });
        for (const campaignId of uniqueCampaignIds) {
          if (typeof campaignId !== 'string') continue;
          try {
            const campaignUrl = `https://graph.facebook.com/v22.0/${campaignId}`;
            const campaignParams = new URLSearchParams({
              access_token: accessToken,
              fields: 'daily_budget,lifetime_budget'
            });

            const campaignResponse = await fetch(`${campaignUrl}?${campaignParams}`);
            if (campaignResponse.ok) {
              const campaignData = await campaignResponse.json();
              const dailyBudget = parseFloat(campaignData.daily_budget || 0) / 100; // Meta devuelve en centavos
              const lifetimeBudget = parseFloat(campaignData.lifetime_budget || 0) / 100;
              // Preferir daily_budget, usar lifetime_budget como fallback
              const budget = dailyBudget || lifetimeBudget;
              campaignBudgets.set(campaignId, budget);
            }
          } catch (error) {
            log('Error fetching campaign budget', { campaignId, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }

      // Obtener presupuestos de adsets
      if (uniqueAdsetIds.length > 0) {
        log('Fetching adset budgets', { adsetCount: uniqueAdsetIds.length });
        for (const adsetId of uniqueAdsetIds) {
          if (typeof adsetId !== 'string') continue;
          try {
            const adsetUrl = `https://graph.facebook.com/v22.0/${adsetId}`;
            const adsetParams = new URLSearchParams({
              access_token: accessToken,
              fields: 'daily_budget,lifetime_budget'
            });

            const adsetResponse = await fetch(`${adsetUrl}?${adsetParams}`);
            if (adsetResponse.ok) {
              const adsetData = await adsetResponse.json();
              const dailyBudget = parseFloat(adsetData.daily_budget || 0) / 100; // Meta devuelve en centavos
              const lifetimeBudget = parseFloat(adsetData.lifetime_budget || 0) / 100;
              // Preferir daily_budget, usar lifetime_budget como fallback
              const budget = dailyBudget || lifetimeBudget;
              adsetBudgets.set(adsetId, budget);
            }
          } catch (error) {
            log('Error fetching adset budget', { adsetId, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }

      log('Budget data collected', { 
        campaignBudgets: campaignBudgets.size, 
        adsetBudgets: adsetBudgets.size 
      });

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
            // Determinar la fecha del insight (usar date_start si existe para múltiples días, o la primera fecha)
            const insightDate = insight.date_start || facebookDates[0];
            
            // Verificar si esta fecha específica es el día actual en la zona horaria del usuario
            const userDateString = userId ? await getDateStringForUser(userId) : todayString;
            const isCurrentDay = insightDate === userDateString;
            
            // Obtener presupuestos para este anuncio específico
            const campaignBudget = campaignBudgets.get(String(insight.campaign_id)) || 0;
            const adsetBudget = adsetBudgets.get(String(insight.adset_id)) || 0;

            const adPerformanceData = {
              product_ad_account_id: productAdAccount.id,
              date: insightDate,
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
              campaign_budget: campaignBudget,
              adset_budget: adsetBudget,
            };

            if (isCurrentDay) {
              // Solo hacer upsert si es el día actual
              const { error: upsertError } = await supabase
                .from('ad_performance')
                .upsert(adPerformanceData, {
                  onConflict: 'product_ad_account_id,ad_id,date',
                  ignoreDuplicates: false
                });

              if (upsertError) {
                log('Error upserting ad performance', { 
                  adId: insight.ad_id, 
                  date: insightDate,
                  error: upsertError.message 
                });
                totalErrors++;
              } else {
                totalSynced++;
              }
            } else {
              // Para días anteriores, verificar si ya existe antes de insertar
              const { data: existingRecord } = await supabase
                .from('ad_performance')
                .select('id')
                .eq('product_ad_account_id', productAdAccount.id)
                .eq('ad_id', insight.ad_id)
                .eq('date', insightDate)
                .single();

              if (existingRecord) {
                // Ya existe un registro para este día anterior, no lo sobreescribimos
                log('Preserving historical ad performance data', { 
                  adId: insight.ad_id, 
                  date: insightDate,
                  note: 'Historical data protected from overwrite'
                });
                totalSkipped++;
              } else {
                // No existe, podemos insertarlo
                const { error: insertError } = await supabase
                  .from('ad_performance')
                  .insert(adPerformanceData);

                if (insertError) {
                  log('Error inserting historical ad performance', { 
                    adId: insight.ad_id, 
                    date: insightDate,
                    error: insertError.message 
                  });
                  totalErrors++;
                } else {
                  log('Inserted historical ad performance data', { 
                    adId: insight.ad_id, 
                    date: insightDate 
                  });
                  totalSynced++;
                }
              }
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

  log('Ad performance sync completed', { totalSynced, totalErrors, totalSkipped });
  return { synced: totalSynced, errors: totalErrors, skipped: totalSkipped };
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

    // Obtener la fecha de hoy en UTC como fallback
    const today = new Date();
    const utcDateString = today.toISOString().split('T')[0];
    
    log('Starting sync with UTC date as base', { 
      utcDate: utcDateString,
      note: 'Will adjust dates per user timezone. Only syncing current day in each user timezone.'
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
    let totalAdPerformanceSkipped = 0;

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

        // Obtener la fecha actual en la zona horaria del usuario
        const userDateString = await getDateStringForUser(integration.user_id);
        
        log('Using user timezone date for sync', {
          integrationId: integration.id,
          userId: integration.user_id,
          utcDate: utcDateString,
          userDate: userDateString
        });
        
        // Obtener datos de gasto de Meta (con zona horaria del usuario)
        const adSpendData = await fetchAdSpendFromMeta(accessToken, activeAdAccounts, userDateString, integration.user_id);
        
        log('Fetched ad spend data', { 
          integrationId: integration.id,
          dataCount: adSpendData.length 
        });

        // También sincronizar datos detallados de ad performance (con zona horaria del usuario)
        const adPerformanceResult = await syncAdPerformance(accessToken, activeAdAccounts, userDateString, integration.user_id);
        
        log('Ad performance sync completed', {
          integrationId: integration.id,
          synced: adPerformanceResult.synced,
          errors: adPerformanceResult.errors,
          skipped: adPerformanceResult.skipped
        });

        // Acumular estadísticas de ad performance
        totalAdPerformanceSynced += adPerformanceResult.synced;
        totalAdPerformanceErrors += adPerformanceResult.errors;
        totalAdPerformanceSkipped += adPerformanceResult.skipped;

        // Verificar si estamos sincronizando el día actual para ad_spend usando la zona horaria del usuario
        const isCurrentDay = userDateString === userDateString; // Siempre true ahora porque usamos la fecha del usuario
        
        log('Ad spend date comparison for historical data protection', { 
          syncDate: userDateString, 
          userToday: userDateString,
          utcToday: utcDateString,
          isCurrentDay,
          userId: integration.user_id,
          note: 'Will upsert ad spend data (current day in user timezone)'
        });

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
              if (isCurrentDay) {
                // Solo hacer upsert si es el día actual
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
                  log('Ad spend saved (current day)', {
                    productId: productAdAccount.product_id,
                    adAccountId: spendData.ad_account_id,
                    spend: spendData.spend,
                    currency: spendData.currency
                  });
                  totalProcessed++;
                }
              } else {
                // Para días anteriores, verificar si ya existe antes de insertar
                const { data: existingSpend } = await supabase
                  .from('ad_spend')
                  .select('id')
                  .eq('product_id', productAdAccount.product_id)
                  .eq('date', spendData.date)
                  .single();

                if (existingSpend) {
                  // Ya existe un registro para este día anterior, no lo sobreescribimos
                  log('Preserving historical ad spend data', { 
                    productId: productAdAccount.product_id, 
                    adAccountId: spendData.ad_account_id,
                    date: spendData.date,
                    note: 'Historical data protected from overwrite'
                  });
                } else {
                  // No existe, podemos insertarlo
                  const { error: insertError } = await supabase
                    .from('ad_spend')
                    .insert({
                      product_id: productAdAccount.product_id,
                      product_ad_account_id: productAdAccount.id,
                      date: spendData.date,
                      spend: spendData.spend,
                      currency: spendData.currency,
                      created_at: new Date().toISOString()
                    });

                  if (insertError) {
                    log('Error inserting historical ad spend', {
                      productId: productAdAccount.product_id,
                      adAccountId: spendData.ad_account_id,
                      error: insertError.message
                    });
                    totalErrors++;
                  } else {
                    log('Inserted historical ad spend data', {
                      productId: productAdAccount.product_id,
                      adAccountId: spendData.ad_account_id,
                      spend: spendData.spend,
                      currency: spendData.currency,
                      date: spendData.date
                    });
                    totalProcessed++;
                  }
                }
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
      totalAdPerformanceSkipped,
      note: 'Synced using user timezone dates'
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Ad spend and performance sync completed',
      processed: totalProcessed,
      errors: totalErrors,
      adPerformanceSynced: totalAdPerformanceSynced,
      adPerformanceErrors: totalAdPerformanceErrors,
      adPerformanceSkipped: totalAdPerformanceSkipped,
      note: 'Synced using user timezone dates'
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

// Nueva función para sincronizar ads spend al conectar cuentas publicitarias a un producto
export async function handleProductAdAccountSync(request: Request) {
  try {
    const body = await request.json();
    const { productId, userId } = body;

    if (!productId || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Faltan parámetros requeridos (productId, userId)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY) {
      console.error('Missing ENCRYPTION_KEY environment variable');
      return new Response(JSON.stringify({
        success: false,
        error: 'Configuración del servidor incompleta'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const log = (step: string, data: Record<string, any> = {}) => {
      console.log(`[Product Ad Account Sync] ${step}:`, data);
    };

    log('Starting product ad account sync', { productId, userId });

    // Obtener la integración del usuario con Meta
    const { data: userIntegration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'meta')
      .eq('status', 'active')
      .single();

    if (integrationError || !userIntegration) {
      log('No active Meta integration found for user', { userId, error: integrationError?.message });
      return new Response(JSON.stringify({
        success: false,
        error: 'No se encontró una integración activa de Meta para este usuario'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener las cuentas publicitarias asociadas a este producto
    const { data: productAdAccounts, error: productAccountsError } = await supabase
      .from('product_ad_accounts')
      .select(`
        ad_account_id,
        meta_ad_accounts!inner(id, name, status)
      `)
      .eq('product_id', productId);

    if (productAccountsError) {
      log('Error fetching product ad accounts', { productId, error: productAccountsError.message });
      return new Response(JSON.stringify({
        success: false,
        error: 'Error al obtener las cuentas publicitarias del producto'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!productAdAccounts || productAdAccounts.length === 0) {
      log('No ad accounts found for product', { productId });
      return new Response(JSON.stringify({
        success: true,
        message: 'No hay cuentas publicitarias asociadas a este producto',
        processed: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const adAccountIds = productAdAccounts.map(pac => pac.ad_account_id);
    log('Found ad accounts for product', { productId, adAccountIds });

    // Descifrar el access token
    const accessToken = userIntegration.access_token_encrypted; // DEBUG: Reading plaintext
    
    // Obtener los últimos 30 días en la zona horaria del usuario
    const { data: settings } = await supabase
      .from('user_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single();
    
    const userTimezone = settings?.timezone;
    const last30Days = getLastNDays(30, userTimezone);
    
    log('Fetching ad spend data for last 30 days', { 
      dateRange: `${last30Days[0]} to ${last30Days[last30Days.length - 1]}`, 
      adAccountIds,
      daysCount: last30Days.length,
      userTimezone 
    });

    // Obtener datos de gasto de Meta para los últimos 30 días
    const adSpendData = await fetchAdSpendFromMeta(accessToken, adAccountIds, last30Days, userId);
    
    // También sincronizar datos detallados de ad performance para los últimos 30 días
    const adPerformanceResult = await syncAdPerformance(accessToken, adAccountIds, last30Days, userId);
    
    log('Ad performance sync completed', {
      synced: adPerformanceResult.synced,
      errors: adPerformanceResult.errors,
      skipped: adPerformanceResult.skipped
    });

    // Guardar los datos de ad spend en la base de datos
    let totalProcessed = 0;
    let totalErrors = 0;

    for (const spendData of adSpendData) {
      try {
        // Obtener todos los product_ad_accounts para esta cuenta publicitaria y producto
        const { data: specificProductAdAccounts, error: specificProductError } = await supabase
          .from('product_ad_accounts')
          .select('id, product_id')
          .eq('ad_account_id', spendData.ad_account_id)
          .eq('product_id', productId);

        if (specificProductError) {
          log('Error fetching specific product ad accounts', { 
            adAccountId: spendData.ad_account_id,
            productId,
            error: specificProductError.message 
          });
          totalErrors++;
          continue;
        }

        if (!specificProductAdAccounts || specificProductAdAccounts.length === 0) {
          log('No specific product ad accounts found', { adAccountId: spendData.ad_account_id, productId });
          continue;
        }

        // Insertar/actualizar el gasto para cada relación
        for (const productAdAccount of specificProductAdAccounts) {
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
            log('Ad spend saved successfully', {
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

    log('Product ad account sync completed', { 
      productId,
      totalProcessed,
      totalErrors,
      adPerformanceSynced: adPerformanceResult.synced,
      adPerformanceErrors: adPerformanceResult.errors,
      adPerformanceSkipped: adPerformanceResult.skipped
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Sincronización de ads spend completada para el producto',
      processed: totalProcessed,
      errors: totalErrors,
      adPerformanceSynced: adPerformanceResult.synced,
      adPerformanceErrors: adPerformanceResult.errors,
      adPerformanceSkipped: adPerformanceResult.skipped,
      productId,
      dateRange: `${last30Days[0]} to ${last30Days[last30Days.length - 1]}`,
      daysProcessed: last30Days.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Product Ad Account Sync] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 