export interface AdData {
  id: string;
  anuncio: string;
  conjunto: string;
  presupuesto: number;
  spend: number;
  ventas_fb: number;
  cpm: number;
  ctr: number;
  clicks: number;
  cpc: number;
  impressions: number;
  roas_negocio_general: number;
  ventas_trackeadas: number;
  roas_ad_fb: number;
  roas_ad_tracking: number;
  fecha: string;
  campaignHasBudget?: boolean;
  ad_id: string;
  adset_id: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_status: string;
  budget_remaining: number;
  optimization_goal?: string;
  bid_strategy?: string;
  lifetime_budget?: number;
  user_id: string;
  campaign_actual_budget?: number;
}

export interface FacebookConfig {
  id: string;
  access_token: string;
  account_id: string;
}