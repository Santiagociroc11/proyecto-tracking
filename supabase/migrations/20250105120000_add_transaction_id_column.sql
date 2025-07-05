/*
  # Agregar soporte para transacciones de Hotmart
  
  1. Actualizar enum tracking_event_type para incluir tipos de compra
  2. Agregar columna transaction_id para mejorar performance de búsquedas
  3. Crear índice en transaction_id para consultas rápidas de duplicados
*/

-- Actualizar el tipo enum para incluir tipos de compra de Hotmart
ALTER TYPE public.tracking_event_type ADD VALUE 'compra_hotmart';
ALTER TYPE public.tracking_event_type ADD VALUE 'compra_hotmart_orderbump';

-- Agregar columna transaction_id para mejorar performance
ALTER TABLE public.tracking_events 
ADD COLUMN IF NOT EXISTS transaction_id text;

-- Crear índice en transaction_id para consultas rápidas de duplicados
CREATE INDEX IF NOT EXISTS idx_tracking_events_transaction_id 
ON public.tracking_events (transaction_id) 
WHERE transaction_id IS NOT NULL;

-- Crear índice compuesto para event_type y transaction_id
CREATE INDEX IF NOT EXISTS idx_tracking_events_type_transaction 
ON public.tracking_events (event_type, transaction_id) 
WHERE transaction_id IS NOT NULL;