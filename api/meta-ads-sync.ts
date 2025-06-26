import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

// Logging function
const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

interface MetaAdsData {
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  purchases: number;
  purchase_value: number;
  campaign_daily_budget: number;
  campaign_lifetime_budget: number;
  adset_daily_budget: number;
  adset_lifetime_budget: number;
  campaign_has_budget: boolean;
  campaign_status: string;
  adset_status: string;
  ad_status: string;
  currency: string;
  date: string;
}

async function fetchMetaAdsData(accessToken: string, adAccountIds: string[], date: string): Promise<MetaAdsData[]> {
  const allData: MetaAdsData[] = [];

  for (const adAccountId of adAccountIds) {
    try {
      log('Fetching Meta Ads data', { adAccountId, date });

      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';

      // Fetch ads insights with campaign, adset, and ad level data
      const params = new URLSearchParams({
        access_token: accessToken,
        fields: [
          'campaign_id',
          'campaign_name', 
          'adset_id',
          'adset_name',
          'ad_id',
          'ad_name',
          'spend',
          'impressions',
          'clicks',
          'reach',
          'actions',
          'action_values'
        ].join(','),
        level: 'ad',
        time_range: JSON.stringify({ since: date, until: date }),
        limit: '1000'
      });

      const insightsUrl = `${baseUrl}/${version}/act_${adAccountId}/insights?${params.toString()}`;
      const insightsResponse = await fetch(insightsUrl);

      if (!insightsResponse.ok) {
        const errorText = await insightsResponse.text();
        log('Error fetching insights', { 
          adAccountId, 
          status: insightsResponse.status, 
          error: errorText 
        });
        continue;
      }

      const insightsResult = await insightsResponse.json();
      log('Insights data fetched', { 
        adAccountId, 
        count: insightsResult.data?.length || 0 
      });

      // Fetch campaign info for budget data
      const campaignIds = [...new Set(insightsResult.data?.map((item: any) => item.campaign_id) || [])];
      const campaignInfoMap = new Map();

      for (const campaignId of campaignIds) {
        try {
          const campaignParams = new URLSearchParams({
            access_token: accessToken,
            fields: 'name,daily_budget,lifetime_budget,status'
          });

          const campaignUrl = `${baseUrl}/${version}/${campaignId}?${campaignParams.toString()}`;
          const campaignResponse = await fetch(campaignUrl);

          if (campaignResponse.ok) {
            const campaignData = await campaignResponse.json();
            campaignInfoMap.set(campaignId, campaignData);
          }
        } catch (error) {
          log('Error fetching campaign info', { campaignId, error });
        }
      }

      // Fetch adset info for budget data
      const adsetIds = [...new Set(insightsResult.data?.map((item: any) => item.adset_id) || [])];
      const adsetInfoMap = new Map();

      for (const adsetId of adsetIds) {
        try {
          const adsetParams = new URLSearchParams({
            access_token: accessToken,
            fields: 'name,daily_budget,lifetime_budget,status'
          });

          const adsetUrl = `${baseUrl}/${version}/${adsetId}?${adsetParams.toString()}`;
          const adsetResponse = await fetch(adsetUrl);

          if (adsetResponse.ok) {
            const adsetData = await adsetResponse.json();
            adsetInfoMap.set(adsetId, adsetData);
          }
        } catch (error) {
          log('Error fetching adset info', { adsetId, error });
        }
      }

      // Process insights data
      for (const item of insightsResult.data || []) {
        const campaignInfo = campaignInfoMap.get(item.campaign_id);
        const adsetInfo = adsetInfoMap.get(item.adset_id);

        // Extract purchase actions and values
        const purchaseAction = item.actions?.find((a: any) => a.action_type === 'purchase');
        const purchaseValueAction = item.action_values?.find((a: any) => a.action_type === 'purchase');

        const purchases = parseInt(purchaseAction?.value || '0');
        const purchaseValue = parseFloat(purchaseValueAction?.value || '0');

        // Calculate metrics
        const spend = parseFloat(item.spend || '0');
        const impressions = parseInt(item.impressions || '0');
        const clicks = parseInt(item.clicks || '0');
        const reach = parseInt(item.reach || '0');

        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

        // Budget information
        const campaignDailyBudget = campaignInfo?.daily_budget ? parseFloat(campaignInfo.daily_budget) / 100 : 0;
        const campaignLifetimeBudget = campaignInfo?.lifetime_budget ? parseFloat(campaignInfo.lifetime_budget) / 100 : 0;
        const adsetDailyBudget = adsetInfo?.daily_budget ? parseFloat(adsetInfo.daily_budget) / 100 : 0;
        const adsetLifetimeBudget = adsetInfo?.lifetime_budget ? parseFloat(adsetInfo.lifetime_budget) / 100 : 0;

        const campaignHasBudget = !!(campaignDailyBudget || campaignLifetimeBudget);

        allData.push({
          ad_account_id: adAccountId,
          campaign_id: item.campaign_id,
          campaign_name: item.campaign_name || 'Unknown Campaign',
          adset_id: item.adset_id,
          adset_name: item.adset_name || 'Unknown Ad Set',
          ad_id: item.ad_id,
          ad_name: item.ad_name || 'Unknown Ad',
          spend,
          impressions,
          clicks,
          reach,
          purchases,
          purchase_value: purchaseValue,
          campaign_daily_budget: campaignDailyBudget,
          campaign_lifetime_budget: campaignLifetimeBudget,
          adset_daily_budget: campaignHasBudget ? 0 : adsetDailyBudget,
          adset_lifetime_budget: campaignHasBudget ? 0 : adsetLifetimeBudget,
          campaign_has_budget: campaignHasBudget,
          campaign_status: campaignInfo?.status || 'UNKNOWN',
          adset_status: adsetInfo?.status || 'UNKNOWN',
          ad_status: 'ACTIVE', // We only get active ads from insights
          currency: 'USD', // Default currency, could be fetched from account settings
          date
        });
      }

    } catch (error) {
      log('Error processing ad account', { 
        adAccountId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return allData;
}

export async function handleMetaAdsSync() {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalErrors = 0;

  // Get yesterday's date for data sync
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateString = yesterday.toISOString().split('T')[0];

  log('Starting Meta Ads sync', { date: dateString });

  try {
    // Get all active Meta integrations
    const { data: integrations, error: integrationsError } = await supabase
      .from('meta_integrations')
      .select(`
        id,
        user_id,
        access_token_encrypted,
        meta_ad_accounts (
          id,
          name,
          account_id,
          currency,
          timezone
        )
      `)
      .eq('active', true);

    if (integrationsError) {
      log('Error fetching integrations', { error: integrationsError.message });
      throw new Error(`Failed to fetch integrations: ${integrationsError.message}`);
    }

    if (!integrations || integrations.length === 0) {
      log('No active integrations found');
      return { success: true, message: 'No active integrations found', totalProcessed: 0, totalErrors: 0 };
    }

    log('Found integrations', { count: integrations.length });

    for (const integration of integrations) {
      try {
        log('Processing integration', { 
          integrationId: integration.id,
          userId: integration.user_id,
          adAccountsCount: integration.meta_ad_accounts?.length || 0
        });

        // Decrypt access token (for now using plaintext for debugging)
        const accessToken = integration.access_token_encrypted;
        
        // Get ad account IDs that are linked to products
        const allAdAccountIdsForIntegration = (integration.meta_ad_accounts || [])
          .map((account: any) => account.account_id);

        if (allAdAccountIdsForIntegration.length === 0) {
          log('No ad accounts for integration', { integrationId: integration.id });
          continue;
        }

        // Check which ad accounts are actually used by products
        const { data: usedProductAdAccounts, error: usedAccountsError } = await supabase
          .from('product_ad_accounts')
          .select(`
            id,
            product_id,
            ad_account_id,
            products (
              id,
              user_id,
              name
            )
          `)
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
          log('No ad accounts linked to products', { integrationId: integration.id });
          continue;
        }

        // Get unique ad account IDs
        const activeAdAccounts = [...new Set(usedProductAdAccounts.map(paa => paa.ad_account_id))];
        
        log('Fetching Meta Ads data', { 
          integrationId: integration.id, 
          adAccountCount: activeAdAccounts.length 
        });

        // Fetch Meta Ads data
        const metaAdsData = await fetchMetaAdsData(accessToken, activeAdAccounts, dateString);
        
        log('Fetched Meta Ads data', { 
          integrationId: integration.id,
          dataCount: metaAdsData.length 
        });

        // Save data to database
        for (const adsData of metaAdsData) {
          try {
            // Find all products that use this ad account
            const productAdAccounts = usedProductAdAccounts.filter(
              paa => paa.ad_account_id === adsData.ad_account_id
            );

            for (const productAdAccount of productAdAccounts) {
              // Calculate additional metrics
              const cpm = adsData.impressions > 0 ? (adsData.spend / adsData.impressions) * 1000 : 0;
              const cpc = adsData.clicks > 0 ? adsData.spend / adsData.clicks : 0;
              const ctr = adsData.impressions > 0 ? (adsData.clicks / adsData.impressions) * 100 : 0;

              const { error: upsertError } = await supabase
                .from('meta_ads_data')
                .upsert({
                  product_id: productAdAccount.product_id,
                  product_ad_account_id: productAdAccount.id,
                  date: adsData.date,
                  campaign_id: adsData.campaign_id,
                  campaign_name: adsData.campaign_name,
                  adset_id: adsData.adset_id,
                  adset_name: adsData.adset_name,
                  ad_id: adsData.ad_id,
                  ad_name: adsData.ad_name,
                  spend: adsData.spend,
                  impressions: adsData.impressions,
                  clicks: adsData.clicks,
                  reach: adsData.reach,
                  cpm: cpm,
                  cpc: cpc,
                  ctr: ctr,
                  purchases: adsData.purchases,
                  purchase_value: adsData.purchase_value,
                  campaign_daily_budget: adsData.campaign_daily_budget,
                  campaign_lifetime_budget: adsData.campaign_lifetime_budget,
                  adset_daily_budget: adsData.adset_daily_budget,
                  adset_lifetime_budget: adsData.adset_lifetime_budget,
                  campaign_has_budget: adsData.campaign_has_budget,
                  campaign_status: adsData.campaign_status,
                  adset_status: adsData.adset_status,
                  ad_status: adsData.ad_status,
                  currency: adsData.currency,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'product_id, ad_id, date'
                });

              if (upsertError) {
                log('Error upserting Meta Ads data', {
                  productId: productAdAccount.product_id,
                  adId: adsData.ad_id,
                  error: upsertError.message
                });
                totalErrors++;
              } else {
                log('Meta Ads data saved', {
                  productId: productAdAccount.product_id,
                  adId: adsData.ad_id,
                  spend: adsData.spend,
                  impressions: adsData.impressions,
                  clicks: adsData.clicks
                });
                totalProcessed++;
              }
            }
          } catch (error) {
            log('Error processing Meta Ads data', {
              adId: adsData.ad_id,
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

    const duration = Date.now() - startTime;
    log('Meta Ads sync completed', { 
      totalProcessed,
      totalErrors,
      duration: `${duration}ms`,
      date: dateString
    });

    return {
      success: true,
      message: `Meta Ads sync completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`,
      totalProcessed,
      totalErrors,
      duration
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    log('Meta Ads sync failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`
    });

    return {
      success: false,
      message: `Meta Ads sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      totalProcessed,
      totalErrors,
      duration
    };
  }
}

// Note: This module exports handleMetaAdsSync for use in Express.js server
// The Express.js endpoint is configured in server.ts 