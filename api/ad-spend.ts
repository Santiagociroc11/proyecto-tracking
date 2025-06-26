import { supabase } from '../lib/supabase-server.js';

// Función para descifrar tokens (igual que en auth.ts)
function decryptToken(encryptedText: string, key: string): string {
  try {
    const textParts = encryptedText.split(':');
    if (textParts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }
    
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedData = Buffer.from(textParts[0], 'hex');
    
    const crypto = require('crypto');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    
    const authTag = encryptedData.slice(-16);
    const ciphertext = encryptedData.slice(0, -16);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, null, 'utf8');
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

async function fetchAdSpendFromMeta(accessToken: string, adAccountIds: string[], dateString: string): Promise<AdSpendData[]> {
  const results: AdSpendData[] = [];
  
  for (const accountId of adAccountIds) {
    try {
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';
      
      const params = new URLSearchParams({
        access_token: accessToken,
        fields: 'spend,account_currency',
        level: 'account',
        time_range: JSON.stringify({ since: dateString, until: dateString }),
        limit: '1'
      });

      const url = `${baseUrl}/${version}/act_${accountId}/insights?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Error fetching spend for account ${accountId}: ${response.status}`);
        continue;
      }

      const result = await response.json();
      
      if (result.data && result.data.length > 0) {
        const data = result.data[0];
        results.push({
          ad_account_id: accountId,
          spend: parseFloat(data.spend || '0'),
          currency: data.account_currency || 'USD',
          date: dateString
        });
      } else {
        // Si no hay datos, crear entrada con gasto 0
        results.push({
          ad_account_id: accountId,
          spend: 0,
          currency: 'USD',
          date: dateString
        });
      }
    } catch (error) {
      console.error(`Error fetching spend for account ${accountId}:`, error);
    }
  }
  
  return results;
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
      note: 'Only syncing current day. Historical data requires manual backfill.'
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

    for (const integration of integrations) {
      try {
        log('Processing integration', { 
          integrationId: integration.id,
          userId: integration.user_id,
          adAccountsCount: integration.meta_ad_accounts?.length || 0
        });

        // Descifrar el access token
        const accessToken = decryptToken(integration.access_token_encrypted, ENCRYPTION_KEY);
        
        // Obtener las cuentas publicitarias activas
        const activeAdAccounts = (integration.meta_ad_accounts || [])
          .filter((account: any) => account.status === 'active')
          .map((account: any) => account.id);

        if (activeAdAccounts.length === 0) {
          log('No active ad accounts for integration', { integrationId: integration.id });
          continue;
        }

        // Obtener datos de gasto de Meta
        const adSpendData = await fetchAdSpendFromMeta(accessToken, activeAdAccounts, dateString);
        
        log('Fetched ad spend data', { 
          integrationId: integration.id,
          dataCount: adSpendData.length 
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
      date: dateString
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Ad spend sync completed',
      processed: totalProcessed,
      errors: totalErrors,
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