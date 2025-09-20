/*
  # Soporte para múltiples pixels de Facebook por producto
  
  1. Cambios en la tabla products:
    - Agregar campo fb_pixels (jsonb) para almacenar array de pixels
    - Mantener campos existentes por compatibilidad durante migración
    - Migrar datos existentes al nuevo formato
  
  2. Funciones auxiliares:
    - Función para migrar datos existentes
    - Índices para búsqueda eficiente
*/

-- Agregar nuevo campo para múltiples pixels
ALTER TABLE products
ADD COLUMN IF NOT EXISTS fb_pixels jsonb DEFAULT '[]'::jsonb;

-- Función para migrar datos existentes al nuevo formato
CREATE OR REPLACE FUNCTION migrate_existing_pixels()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Migrar pixels existentes al nuevo formato JSON
  UPDATE products 
  SET fb_pixels = jsonb_build_array(
    jsonb_build_object(
      'id', fb_pixel_id,
      'access_token', fb_access_token,
      'test_event_code', fb_test_event_code,
      'name', 'Pixel Principal'
    )
  )
  WHERE fb_pixel_id IS NOT NULL 
    AND fb_pixel_id != ''
    AND (fb_pixels IS NULL OR fb_pixels = '[]'::jsonb);
    
  RAISE NOTICE 'Migración de pixels completada';
END;
$$;

-- Ejecutar migración
SELECT migrate_existing_pixels();

-- Índice para búsqueda eficiente en el array de pixels
CREATE INDEX IF NOT EXISTS idx_products_fb_pixels_gin 
ON products USING gin (fb_pixels);

-- Función para validar estructura de pixels
CREATE OR REPLACE FUNCTION validate_fb_pixels(pixels jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verificar que sea un array
  IF jsonb_typeof(pixels) != 'array' THEN
    RETURN false;
  END IF;
  
  -- Verificar estructura de cada pixel
  FOR i IN 0..jsonb_array_length(pixels) - 1 LOOP
    IF NOT (
      pixels->i ? 'id' AND
      pixels->i ? 'access_token' AND
      jsonb_typeof(pixels->i->'id') = 'string' AND
      jsonb_typeof(pixels->i->'access_token') = 'string'
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$;

-- Constraint para validar estructura de pixels
ALTER TABLE products 
ADD CONSTRAINT valid_fb_pixels_structure 
CHECK (fb_pixels IS NULL OR validate_fb_pixels(fb_pixels));

-- Comentarios para documentación
COMMENT ON COLUMN products.fb_pixels IS 'Array JSON de pixels de Facebook. Formato: [{"id": "pixel_id", "access_token": "token", "test_event_code": "code", "name": "nombre"}]';
COMMENT ON FUNCTION validate_fb_pixels IS 'Valida que la estructura JSON de pixels sea correcta';
COMMENT ON FUNCTION migrate_existing_pixels IS 'Migra pixels existentes del formato antiguo al nuevo formato JSON';
