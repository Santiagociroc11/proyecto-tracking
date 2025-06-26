

-- Create the meta_ads_data table
CREATE TABLE IF NOT EXISTS meta_ads_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product and account linking
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_ad_account_id uuid NOT NULL REFERENCES product_ad_accounts(id) ON DELETE CASCADE,
  
  -- Date for daily aggregation
  date date NOT NULL,
  
  -- Meta Ads hierarchy IDs and names
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  adset_id text NOT NULL,
  adset_name text NOT NULL,
  ad_id text NOT NULL,
  ad_name text NOT NULL,
  
  -- Budget information
  campaign_daily_budget numeric(12, 2) DEFAULT 0,
  campaign_lifetime_budget numeric(12, 2) DEFAULT 0,
  adset_daily_budget numeric(12, 2) DEFAULT 0,
  adset_lifetime_budget numeric(12, 2) DEFAULT 0,
  campaign_has_budget boolean DEFAULT false,
  
  -- Status information
  campaign_status text,
  adset_status text,
  ad_status text,
  
  -- Core metrics from Meta
  spend numeric(12, 2) NOT NULL DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  reach integer DEFAULT 0,
  
  -- Calculated metrics
  cpm numeric(10, 4) DEFAULT 0, -- Cost per 1000 impressions
  cpc numeric(10, 4) DEFAULT 0, -- Cost per click
  ctr numeric(10, 4) DEFAULT 0, -- Click-through rate (%)
  
  -- Conversion data from Meta pixel
  purchases integer DEFAULT 0,
  purchase_value numeric(12, 2) DEFAULT 0,
  
  -- Currency
  currency text DEFAULT 'USD',
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT meta_ads_data_unique UNIQUE (product_id, ad_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meta_ads_data_product_date 
  ON meta_ads_data(product_id, date);

CREATE INDEX IF NOT EXISTS idx_meta_ads_data_product_ad_account 
  ON meta_ads_data(product_ad_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_ads_data_campaign_date 
  ON meta_ads_data(campaign_id, date);

CREATE INDEX IF NOT EXISTS idx_meta_ads_data_adset_date 
  ON meta_ads_data(adset_id, date);

CREATE INDEX IF NOT EXISTS idx_meta_ads_data_ad_date 
  ON meta_ads_data(ad_id, date);
