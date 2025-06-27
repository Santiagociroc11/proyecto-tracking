-- Crear tabla para datos detallados de rendimiento por anuncio
CREATE TABLE public.ad_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_ad_account_id uuid NOT NULL,
  date date NOT NULL,
  
  -- IDs de Facebook
  ad_id text NOT NULL,
  adset_id text NULL, 
  campaign_id text NULL,
  
  -- Nombres de Facebook
  ad_name text NULL,
  adset_name text NULL,
  campaign_name text NULL,
  
  -- Métricas de rendimiento
  spend numeric(10, 2) NOT NULL DEFAULT 0,
  impressions integer NULL DEFAULT 0,
  clicks integer NULL DEFAULT 0,
  cpc numeric(10, 4) NULL,
  cpm numeric(10, 4) NULL,
  ctr numeric(10, 4) NULL,
  
  -- Metadatos
  currency character varying(10) NULL DEFAULT 'USD',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT ad_performance_pkey PRIMARY KEY (id),
  CONSTRAINT ad_performance_unique UNIQUE (product_ad_account_id, ad_id, date),
  CONSTRAINT ad_performance_product_ad_account_id_fkey 
    FOREIGN KEY (product_ad_account_id) 
    REFERENCES product_ad_accounts (id) 
    ON DELETE CASCADE
) TABLESPACE pg_default;

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_ad_performance_product_ad_account_date 
  ON public.ad_performance USING btree (product_ad_account_id, date) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_ad_performance_ad_id 
  ON public.ad_performance USING btree (ad_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_ad_performance_campaign_id 
  ON public.ad_performance USING btree (campaign_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_ad_performance_adset_id 
  ON public.ad_performance USING btree (adset_id) 
  TABLESPACE pg_default;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ad_performance_updated_at 
  BEFORE UPDATE ON ad_performance 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarios para documentación
COMMENT ON TABLE public.ad_performance IS 'Almacena datos detallados de rendimiento por anuncio desde Facebook Ads API';
COMMENT ON COLUMN public.ad_performance.ad_id IS 'ID único del anuncio en Facebook';
COMMENT ON COLUMN public.ad_performance.product_ad_account_id IS 'Vincula con la cuenta publicitaria del producto'; 