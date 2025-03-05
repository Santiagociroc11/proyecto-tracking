/*
  # Actualización del esquema de tracking

  1. Modificaciones a tracking_events
    - Agregar campo event_type como enum
    - Agregar campos para identificación de visitantes y sesiones
    - Agregar campos para métricas y datos de navegación
    - Actualizar políticas de seguridad

  2. Nuevos tipos de eventos
    - pageview: Vistas de página
    - interaction: Interacciones de usuario (clicks, forms)
    - input_change: Cambios en campos de formulario
    - custom: Eventos personalizados
*/

-- Crear tipo enum para los tipos de eventos
CREATE TYPE tracking_event_type AS ENUM (
  'pageview',
  'interaction',
  'input_change',
  'custom'
);

-- Agregar nuevos campos a tracking_events
DO $$ 
BEGIN
  -- Agregar campo event_type si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN event_type tracking_event_type NOT NULL;
  END IF;

  -- Agregar campos de identificación
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'visitor_id'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN visitor_id text NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN session_id text NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'page_view_id'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN page_view_id text;
  END IF;

  -- Agregar campos de navegación
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'url'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'referrer'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN referrer text;
  END IF;

  -- Agregar campos de métricas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN user_agent text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'screen_resolution'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN screen_resolution text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tracking_events' AND column_name = 'viewport_size'
  ) THEN
    ALTER TABLE tracking_events ADD COLUMN viewport_size text;
  END IF;

  -- Agregar índices para mejor rendimiento
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'tracking_events' AND indexname = 'idx_tracking_events_visitor_session'
  ) THEN
    CREATE INDEX idx_tracking_events_visitor_session 
    ON tracking_events (visitor_id, session_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'tracking_events' AND indexname = 'idx_tracking_events_product_created'
  ) THEN
    CREATE INDEX idx_tracking_events_product_created 
    ON tracking_events (product_id, created_at);
  END IF;
END $$;