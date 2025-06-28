-- Agregar columnas de presupuesto a la tabla ad_performance
ALTER TABLE public.ad_performance 
ADD COLUMN campaign_budget numeric(10, 2) NULL DEFAULT 0,
ADD COLUMN adset_budget numeric(10, 2) NULL DEFAULT 0;

-- Comentarios para documentación
COMMENT ON COLUMN public.ad_performance.campaign_budget IS 'Presupuesto diario de la campaña en la moneda especificada';
COMMENT ON COLUMN public.ad_performance.adset_budget IS 'Presupuesto diario del conjunto de anuncios en la moneda especificada';

-- Índice para optimizar consultas por presupuesto
CREATE INDEX IF NOT EXISTS idx_ad_performance_campaign_budget 
  ON public.ad_performance USING btree (campaign_budget) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_ad_performance_adset_budget 
  ON public.ad_performance USING btree (adset_budget) 
  TABLESPACE pg_default; 