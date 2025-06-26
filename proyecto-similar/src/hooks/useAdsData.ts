import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AdData } from '../types/facebook';
import { useFacebookConfig } from './useFacebookConfig';

interface AdsDataState {
  adData: AdData[];
  loading: boolean;
  totalSpend: number;
  averageRoas: number;
  totalRoasWithNoRef: number;
  totalSales: number;
  totalSalesWithNoRef: number;
  totalReach: number;
  noRefSalesCount: number;
  otherAdsSalesCount: number;
  nonActiveAdsSalesCount: number;
  error: string | null;
}

export function useAdsData() {
  const { activeAccount } = useFacebookConfig();
  
  const [state, setState] = useState<AdsDataState>({
    adData: [],
    loading: false,
    totalSpend: 0,
    averageRoas: 0,
    totalRoasWithNoRef: 0,
    totalSales: 0,
    totalSalesWithNoRef: 0,
    totalReach: 0,
    noRefSalesCount: 0,
    otherAdsSalesCount: 0,
    nonActiveAdsSalesCount: 0,
    error: null,
  });

  const fetchAdSetInfo = async (adsetId: string, accessToken: string) => {
    try {
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';
      
      const response = await fetch(`${baseUrl}/${version}/${adsetId}?access_token=${accessToken}&fields=name,status,daily_budget,lifetime_budget,campaign{id,name,daily_budget,lifetime_budget}`);
      
      if (!response.ok) {
        console.error(`Error fetching adset info for ${adsetId}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching adset info for ${adsetId}:`, error);
      return null;
    }
  };

  const fetchCampaignInfo = async (campaignId: string, accessToken: string) => {
    try {
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';
      
      const response = await fetch(`${baseUrl}/${version}/${campaignId}?access_token=${accessToken}&fields=name,daily_budget,lifetime_budget`);
      
      if (!response.ok) {
        console.error(`Error fetching campaign info for ${campaignId}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching campaign info for ${campaignId}:`, error);
      return null;
    }
  };

  const fetchData = async () => {
    // Don't fetch if no active account
    if (!activeAccount) {
      setState(prev => ({ ...prev, loading: false, adData: [] }));
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const today = new Date().toISOString().split('T')[0];

      // Get tracked sales for today
      const { data: trackedSales, error: trackedError } = await supabase
        .from('tracked_sales')
        .select('ad_id')
        .eq('purchase_date', today)
        .not('ad_id', 'eq', 'NO REF');

      if (trackedError) {
        console.error('Error fetching tracked sales:', trackedError);
      }

      // Group tracked sales by ad_id
      const trackedSalesMap = (trackedSales || []).reduce((acc, sale) => {
        if (!acc[sale.ad_id]) acc[sale.ad_id] = 0;
        acc[sale.ad_id]++;
        return acc;
      }, {} as Record<string, number>);

      // Get sales without reference for metrics
      const { data: noRefSales, error: noRefError } = await supabase
        .from('tracked_sales')
        .select('*')
        .eq('purchase_date', today)
        .eq('ad_id', 'NO REF');

      if (noRefError) {
        console.error('Error fetching no-ref sales:', noRefError);
      }

      // Get other ads sales (not from active campaigns) for today
      const { data: otherAdsSales, error: otherAdsError } = await supabase
        .from('tracked_sales')
        .select('*')
        .eq('purchase_date', today)
        .eq('ad_id', 'OTHER ADS');

      if (otherAdsError) {
        console.error('Error fetching other ads sales:', otherAdsError);
      }

      // Get non-active ads sales for today
      const { data: nonActiveAdsSales, error: nonActiveAdsError } = await supabase
        .from('tracked_sales')
        .select('*')
        .eq('purchase_date', today)
        .eq('ad_id', 'NON-ACTIVE ADS');

      if (nonActiveAdsError) {
        console.error('Error fetching non-active ads sales:', nonActiveAdsError);
      }

      // Fetch Facebook Ads data using the active account
      const baseUrl = 'https://graph.facebook.com';
      const version = 'v23.0';

      const params = new URLSearchParams({
        access_token: activeAccount.access_token,
        fields: 'adset_id,adset_name,spend,actions,impressions,reach,ad_id,ad_name,campaign_id',
        level: 'ad',
        filtering: JSON.stringify([{
          field: 'spend',
          operator: 'GREATER_THAN',
          value: '0'
        }]),
        time_range: JSON.stringify({ since: today, until: today }),
        limit: '500'
      });

      const url = `${baseUrl}/${version}/act_${activeAccount.account_id}/insights?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Facebook API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Process the data and enrich with campaign info
      const enrichedData = await Promise.all(
        (result.data || []).map(async (item: any) => {
          const purchaseAction = item.actions?.find((a: any) => a.action_type === 'purchase');
          const ventas_fb = parseInt(purchaseAction?.value || '0');
          const spend = parseFloat(item.spend || '0');
          const impressions = parseInt(item.impressions || '0');
          const reach = parseInt(item.reach || '0');
          
          // Get tracked sales for this ad
          const ventas_trackeadas = trackedSalesMap[item.ad_id] || 0;
          
          // Use the maximum between tracked sales and Facebook pixel sales
          const maxSales = Math.max(ventas_fb, ventas_trackeadas);
          
          // Get adset and campaign info
          const adsetInfo = await fetchAdSetInfo(item.adset_id, activeAccount.access_token);
          const campaignInfo = adsetInfo?.campaign ? await fetchCampaignInfo(adsetInfo.campaign.id, activeAccount.access_token) : null;

          // Check if campaign has budget (CBO - Campaign Budget Optimization)
          const campaignHasBudget = !!(campaignInfo?.daily_budget || campaignInfo?.lifetime_budget);
          const campaignActualBudget = campaignInfo?.daily_budget ? parseFloat(campaignInfo.daily_budget) / 100 : 
                                     campaignInfo?.lifetime_budget ? parseFloat(campaignInfo.lifetime_budget) / 100 : 0;

          // Calculate budget - if campaign has budget, ad set budget should be 0
          const adsetBudget = campaignHasBudget ? 0 : 
                             (adsetInfo?.daily_budget ? parseFloat(adsetInfo.daily_budget) / 100 : 
                              adsetInfo?.lifetime_budget ? parseFloat(adsetInfo.lifetime_budget) / 100 : 0);

          const REVENUE_PER_SALE = 18000 / 4100;
          const revenue = maxSales * REVENUE_PER_SALE;
          const roas_negocio_general = spend > 0 ? revenue / spend : 0;
          const roas_ad_fb = spend > 0 ? (ventas_fb * REVENUE_PER_SALE) / spend : 0;
          const roas_ad_tracking = spend > 0 ? (ventas_trackeadas * REVENUE_PER_SALE) / spend : 0;

          return {
            id: item.ad_id,
            anuncio: item.ad_name || 'Sin nombre',
            conjunto: adsetInfo?.name || item.adset_name || 'Sin nombre',
            presupuesto: adsetBudget,
            spend: spend,
            ventas_fb: ventas_fb,
            cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
            ctr: 0, // This would need to be calculated from clicks if available
            clicks: 0, // Not available in current data
            cpc: 0, // Would need clicks data
            impressions: impressions,
            roas_negocio_general: roas_negocio_general,
            ventas_trackeadas: ventas_trackeadas,
            roas_ad_fb: roas_ad_fb,
            roas_ad_tracking: roas_ad_tracking,
            fecha: today,
            campaignHasBudget: campaignHasBudget,
            ad_id: item.ad_id,
            adset_id: item.adset_id,
            campaign_id: item.campaign_id,
            campaign_name: campaignInfo?.name || 'Sin nombre',
            adset_status: adsetInfo?.status || 'UNKNOWN',
            budget_remaining: Math.max(0, adsetBudget - spend),
            user_id: '', // This will be set when saving to database if needed
            campaign_actual_budget: campaignActualBudget
          } as AdData;
        })
      );

      // Calculate aggregated metrics
      const totalSpend = enrichedData.reduce((sum, ad) => sum + ad.spend, 0);
      const totalReach = enrichedData.reduce((sum, ad) => sum + ad.impressions, 0); // Using impressions as reach for now
      const totalSales = enrichedData.reduce((sum, ad) => sum + Math.max(ad.ventas_fb, ad.ventas_trackeadas), 0);
      
      // Calculate ROAS with and without NO REF sales
      const REVENUE_PER_SALE = 18000 / 4100;
      const totalRevenue = totalSales * REVENUE_PER_SALE;
      const averageRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
      
      // For ROAS without NO REF, we use the same calculation since we're not including NO REF in the ads data
      const totalRoasWithNoRef = averageRoas;
      const totalSalesWithNoRef = totalSales;

      setState({
        adData: enrichedData,
        loading: false,
        totalSpend,
        averageRoas,
        totalRoasWithNoRef,
        totalSales,
        totalSalesWithNoRef,
        totalReach,
        noRefSalesCount: noRefSales?.length || 0,
        otherAdsSalesCount: otherAdsSales?.length || 0,
        nonActiveAdsSalesCount: nonActiveAdsSales?.length || 0,
        error: null,
      });

    } catch (error) {
      console.error('Error fetching ads data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      }));
    }
  };

  // Fetch data when active account changes
  useEffect(() => {
    fetchData();
  }, [activeAccount?.id]);

  return {
    ...state,
    fetchData,
  };
}
